process.env.DEBUG = 'mediasoup*,simple-react-mediasoup*';

const path = require('path');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const SockRR = require('./libs/sockrr-server');
const mediasoup = require('mediasoup');
const config = require('../config');
const { gProducer, gConsumer } = require('./libs/g-streamer');
const { getPort } = require('./libs/port');
const logger = require('./libs/logger')('server');

const onlinePeers = new Map();

let mRouter;
let wrtcServer;

const AUDIO_SSRC = 1111;
const VIDEO_SSRC = 2222;

let recordingInProgress = false;

start()
.catch((err) => {
    logger.error(err);
    setTimeout(() => process.exit(1), 2000);
});

async function start() {

    const httpServer = createHttpServer();

    createSocketServer(httpServer);
    
    if(config.server.wrtc.ip === '') {
        throw Error('wrtc ip not set');
    }

    await setupMediasoup();

    const { cwd, externalMediaFile } = config.server.gstreamer;

    // if gstreamer cwd and external media file is set then create an incoming stream
    if (  cwd !== '' && externalMediaFile !== '' ) {
        await createInComingStream(cwd, externalMediaFile);
    }
    else{
        logger.info('cannot create plain transport incoming stream, gstreamer cwd or externalMediaFile not set');
    }
}

function createHttpServer() {
    const port = config.server.http.port;
    
    const app = express();

    app.use(express.static(path.resolve(process.cwd(), 'public')));
    
    return app.listen(port, () => {
        logger.info(`server listening on port ${port}`);
    });
}

function createSocketServer(httpServer) {
    if (!httpServer) {
        throw Error('invalid httpServer');
    }

    const sockRR = SockRR(httpServer);

    sockRR.onNewClient((srr) => {

        const peer = {
            id                : uuidv4(),
            socket            : srr,
            displayName       : '',
            rtpCapabilities   : undefined,
            producerTransport : undefined,
            consumerTransport : undefined,
            producers         : new Map(),
            consumers         : new Map(),
            gProcess          : undefined
        };
        
        logger.info(`new peer connected with id: ${peer.id}`);

        srr.onRequest(async (method, data = {}, accept, reject) => {
            try {
                switch (method) {
                    case 'getRouterRtpCapabilities':
                    {
                        accept(mRouter.rtpCapabilities);
                        break;
                    }

                    case 'createProducerTransport':
                    {
                        // reject if producer transport already exists for peer
                        if (peer.producerTransport) return reject('There can only be one producer transport for this peer');
    
                        const { transport, params } = await createWebRtcTransport();

                        peer.producerTransport = transport;
                        accept(params);
    
                        break;
                    }
    
                    case 'connectProducerTransport':
                    {
                        const { producerTransport } = peer;
                        const { dtlsParameters } = data;
    
                        // reject if no producer transport exists for peer
                        if (!producerTransport) return reject('no producer transport');
    
                        await producerTransport.connect({ dtlsParameters });
                        accept();
    
                        break;
                    }
    
                    case 'produce':
                    {
                        const { transportId, kind, rtpParameters } = data;
    
                        const { producerTransport } = peer;
    
                        // reject if no producer transport exists for peer
                        if (!producerTransport) return reject('no producer transport');
    
                        // reject is request transport id does not match peer transport  id
                        if (transportId !== producerTransport.id) return reject('invalid transport id');
                            
                        const producer = await producerTransport.produce({ kind, rtpParameters });

                        peer.producers.set(producer.id, producer);
    
                        accept({ id: producer.id });
    
                        break;
                    }
    
                    case 'createConsumerTransport':
                    {
                        // reject if consumer transport already exists for peer
                        if (peer.consumerTransport) return reject('There can only be one consumer transport for this peer');
    
                        const { transport, params } = await createWebRtcTransport();

                        peer.consumerTransport = transport;
                        accept(params);
    
                        break;
                    }
    
                    case 'connectConsumerTransport':
                    {
                        const consumerTransport = peer.consumerTransport;
                            
                        if (!consumerTransport) return reject('no consumer transport');
    
                        await consumerTransport.connect({ dtlsParameters: data.dtlsParameters });
                        accept();
    
                        break;
                    }
                    
                    case 'consume':
                    {
                        const { peerId: otherPeerId } = data;
    
                        const otherPeer = onlinePeers.get(otherPeerId);
                        
                        if (!otherPeer) return reject('invalid peer');

                        const consumerDetailsArray = [];
    
                        // Create Consumers for existing Producers of otherPeer.
                        for (const producer of otherPeer.producers.values()) {
                            const consumerDetails = await createConsumer(peer, producer);
    
                            consumerDetailsArray.push(consumerDetails);
                        }
                            
                        accept({ consumerDetailsArray });
    
                        break;
                    }

                    case 'join':
                    {
                        const { rtpCapabilities, displayName } = data;

                        peer.rtpCapabilities = rtpCapabilities;
                        peer.displayName = displayName;
                        onlinePeers.set(peer.id, peer);
                        logger.info(`${displayName} joined`);

                        accept();

                        const otherPeerDetails = [];

                        // notify other peers that this peer joined 
                        for (const otherPeer of onlinePeers.values()) {
                            if (otherPeer.id !== peer.id) {
                                otherPeer.socket.notify('peerJoined', { id: peer.id, displayName });
                                
                                otherPeerDetails.push({ id: otherPeer.id, displayName: otherPeer.displayName });
                            }
                        }

                        // and also notify this peer of all other available peers
                        peer.socket.notify('setAvailablePeers', { otherPeerDetails });

                        // if there is no recording in progress then initiate recording
                        checkAndInitiateRecording(peer)
                        .catch((err) => {
                            logger.error('error initiating recording', err);
                        });

                        break;
                    }
                    default:
                        logger.info(`${method} method has no case handler`);
                        reject();
                }
                
            } catch (error) {
                logger.error('peer on request error', error);
                reject(400, 'error occured');
            }
        });

        srr.onNotification(async (method, data={}) => {
            try {
                switch (method) {
                    case 'resumeConsumer':
                    {
                        const { consumerId } = data;
                        
                        const consumer = peer.consumers.get(consumerId);

                        await consumer.resume();
                        
                        break;
                    }
                }
                
            } catch (error) {
                logger.error('peer on notification error', error);
            }
        });
        
        srr.onClose(() => {

            onlinePeers.delete(peer.id);

            peer.producerTransport?.close();
            peer.consumerTransport?.close();

            if(peer.gProcess){
                peer.gProcess.kill();
                recordingInProgress = false;

                peer.videoPlainTransport?.close();
                peer.audioPlainTransport?.close();

                // if there are still online peers then initiate recording for the next peer
                checkAndInitiateRecording()
                .catch((err) => {
                    logger.error('error initiating recording', err);
                });
            }

            // notify other peers that this peer has left 
            for (const otherPeer of onlinePeers.values()) {
                otherPeer.socket.notify('peerLeft', { id: peer.id });
            }

            logger.info(`peer: ${peer.id} closed`);
        });
    });

}

async function setupMediasoup() {

    const mWorker = await mediasoup.createWorker({
        logLevel : config.server.wrtc.logLevel,
        logTags  : config.server.wrtc.logTags
    });
    
    mWorker.on('died', () => {
        logger.error('error: mediasoup worker died');
        setTimeout(() => process.exit(1), 1000);
    });

    wrtcServer = await mWorker.createWebRtcServer({
        listenInfos : [ {
            protocol    : config.server.wrtc.protocol,
            ip          : config.server.wrtc.ip,
            announcedIp : config.server.wrtc.ip,
            port        : config.server.wrtc.port
        } ]
    });

    mRouter = await mWorker.createRouter({ 
        mediaCodecs : config.server.wrtc.mediaCodecs
    });

}

async function createConsumer(peer, producer) {
    
    const { consumerTransport, rtpCapabilities } = peer;
                            
    if (!consumerTransport) throw Error('invalid consumer transport');

    if (!mRouter.canConsume({ producerId: producer.id, rtpCapabilities: rtpCapabilities })) {
        throw Error('can not consume from producer');
    }
    
    const consumer = await consumerTransport.consume({
        producerId      : producer.id,
        rtpCapabilities : rtpCapabilities,
        paused          : producer.kind === 'video'
    });

    peer.consumers.set(consumer.id, consumer);

    // handle consumer events
    consumer.observer.on('close', () => {
        logger.info(`consumer closed for consumer: ${consumer.id}`);
    });

    consumer.on('transportclose', () => {
        logger.info(`consumer's transport closed for consumer: ${consumer.id}`);
        peer.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
        logger.info(`consumer's producer closed for consumer: ${consumer.id}`);
        peer.consumers.delete(consumer.id);
    });

    return {
        producerId    : producer.id,
        id            : consumer.id,
        kind          : consumer.kind,
        rtpParameters : consumer.rtpParameters
    };

}

async function createWebRtcTransport() {
    const transport = await mRouter.createWebRtcTransport({ webRtcServer: wrtcServer });

    return {
        transport,
        params : {
            id             : transport.id,
            iceParameters  : transport.iceParameters,
            iceCandidates  : transport.iceCandidates,
            dtlsParameters : transport.dtlsParameters
        }
    };
}

async function createInComingStream(gstreamerCwd, externalMediaFile) {

    const videoTransport = await mRouter.createPlainTransport({
        listenInfo: {
            protocol: 'udp',
            ip: config.server.wrtc.ip
        },
        rtcpMux  : false,
        comedia  : true
    });

    const videoProducer = await videoTransport.produce({
        kind          : 'video',
        rtpParameters : {
            codecs : [ config.server.wrtc.mediaCodecs[1] ],
            encodings : [ {
                ssrc : VIDEO_SSRC
            } ]
        }
    });
    
    const audioTransport = await mRouter.createPlainTransport({
        listenInfo: {
            protocol: 'udp',
            ip: config.server.wrtc.ip
        },
        rtcpMux  : false,
        comedia  : true
    });

    const audioProducer = await audioTransport.produce({
        kind          : 'audio',
        rtpParameters : {
            codecs : [ config.server.wrtc.mediaCodecs[0] ],
            encodings : [ {
                ssrc : AUDIO_SSRC
            } ]
        }
    });

    const peer = {
        id          : uuidv4(),
        socket      : { notify: () => {} }, // dummy socket
        displayName : 'gstreamer',
        transports  : {
            audio : audioTransport,
            video : videoTransport
        },
        producers : new Map(),
        consumers : undefined,
        gProcess  : undefined
    };

    peer.producers.set(videoProducer.id, videoProducer);
    peer.producers.set(audioProducer.id, audioProducer);

    onlinePeers.set(peer.id, peer);

    peer.gProcess = gProducer({
        externalMediaFile,
        gstreamerCwd,
        audioPT                : config.server.wrtc.mediaCodecs[0].payloadType,
        videoSsrc              : VIDEO_SSRC,
        videoTransportIp       : peer.transports.video.tuple.localIp,
        videoTransportPort     : peer.transports.video.tuple.localPort,
        videoTransportRtcpPort : peer.transports.video.rtcpTuple.localPort,
        audioSsrc              : AUDIO_SSRC,
        audioTransportIp       : peer.transports.audio.tuple.localIp,
        audioTransportPort     : peer.transports.audio.tuple.localPort,
        audioTransportRtcpPort : peer.transports.audio.rtcpTuple.localPort,
        videoPT                : config.server.wrtc.mediaCodecs[1].payloadType
    });

}

async function checkAndInitiateRecording(peer = null) {
    
    const { cwd, mediaSavePath } = config.server.gstreamer;

    if (cwd === '' || mediaSavePath === '') {
        logger.info('cannot create plain transport out going stream, gstreamer cwd or mediaSavePath not set');
        return;
    }

    if(recordingInProgress) {
        logger.info('A recorder already exists');
        return;
    }

    // if peer is null then get the first online peer whose name is not gstreamer
    if(!peer) {
        for (const nextPeer of onlinePeers.values()) {
            if(nextPeer.displayName !== 'gstreamer') {
                peer = nextPeer;
                break;
            }
        }
    }

    // if no peer is available to initiate recording then return
    if(!peer) {
        logger.info('no peer available to initiate recording');
        return;
    }

    await createOutGoingStream(peer, cwd, mediaSavePath);

    recordingInProgress = true;

}

async function createOutGoingStream(peer, cwd, mediaSavePath){

    let videoProducer = undefined;
    let audioProducer = undefined;

    // here we assume there is only a video and an audio producer
    for (const producer of peer.producers.values()) {
        if (producer.kind === 'video')
            videoProducer = producer;
        else
            audioProducer = producer;
    }

    if (!videoProducer || !audioProducer) {
        throw Error('no video or audio producer found');
    }
    
    // create out going plain transport stream for video and audio
    const videoDetails = await publishToOutGoingStream(videoProducer);
    const audioDetails = await publishToOutGoingStream(audioProducer);

    const fullFilePath = path.join(mediaSavePath, `${peer.displayName}_${Date.now()}.webm`).split(`\\`).join( '/');;

    // create a gstreamer process to consume the plain transport stream
    peer.gProcess = gConsumer({
        fullFilePath,
        gstreamerCwd: cwd,
        rtpDetails: {
            video: videoDetails.rtpDetails,
            audio: audioDetails.rtpDetails
        }
    });

    // save the plain transport to the peer so
    // it can be closed when the peer disconnects
    peer.videoPlainTransport = videoDetails.transport;
    peer.audioPlainTransport = audioDetails.transport;

    // resume the consumers after 1 second
    setTimeout(async () => {
        await videoDetails.consumer.resume();
        await audioDetails.consumer.resume();

        logger.info('out going plain transport stream consumers resumed');
    }, 1000);

    logger.info(`out going plain transport stream created for ${peer.displayName} and saved at ${fullFilePath}`);

}

async function publishToOutGoingStream(producer) {

    const transport = await mRouter.createPlainTransport({
        listenInfo: {
            protocol: 'udp',
            ip: '127.0.0.1'
        },
        rtcpMux    : false,
        comedia    : false
    });

    const remoteRtpPort = await getPort();
    const remoteRtcpPort = await getPort();

    await transport.connect({
        ip: '127.0.0.1',
        port: remoteRtpPort,
        rtcpPort: remoteRtcpPort
    });

    const codecs = [];
    
    const routerCodec = mRouter.rtpCapabilities.codecs.find(
        codec => codec.kind === producer.kind 
    );

    codecs.push(routerCodec);

    const rtpCapabilities = {
        codecs,
        rtcpFeedback: []
    };

    // Start the consumer paused
    // Once the gstreamer process is ready to consume resume and send a keyframe
    const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: true
    });

    consumer.on('transportclose', () => {
        logger.info(`plain transport for consumer: ${consumer.id}`);
    });

    return {
        transport,
        consumer,
        rtpDetails: {
            remoteRtpPort,
            remoteRtcpPort,
            localRtcpPort: transport.rtcpTuple ? transport.rtcpTuple.localPort : undefined,
            payloadType: consumer.rtpParameters.codecs[0].payloadType,
            codecName: consumer.rtpParameters.codecs[0].mimeType.split('/')[1].toUpperCase(),
            clockRate: consumer.rtpParameters.codecs[0].clockRate,
            channels: consumer.rtpParameters.codecs[0]?.channels,
            ssrc: consumer.rtpParameters.encodings[0].ssrc,
            rtpCname: consumer.rtpParameters.rtcp.cname?.toUpperCase()
        }
    }

}
