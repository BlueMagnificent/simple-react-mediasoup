process.env.DEBUG = 'mediasoup*';

const path = require('path');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const SockRR = require('./libs/sockrr-server');
const mediasoup = require('mediasoup');
const config = require('../config');
const gProducer = require('./libs/g-producer');

const onlinePeers = new Map();

let mRouter;
let wrtcServer;

const AUDIO_SSRC = 1111;
const VIDEO_SSRC = 2222;

start()
.catch((err) => {
    console.error('error:', err);
    setTimeout(() => process.exit(1), 2000);
});

async function start() {

    const httpServer = createHttpServer();

    createSocketServer(httpServer);
    
    if(config.server.wrtc.ip === '') {
        throw Error('wrtc ip not set');
    }

    await setupMediasoup();

    const { cwd, externalMediaPath } = config.server.gstreamer;

    // if gstreamer configuration is set up, create a plain transport stream
    if ( cwd !== '' && externalMediaPath !== '' ) {
        await createPlainTransportStream(cwd, externalMediaPath);
    }
}

function createHttpServer() {
    const port = config.server.http.port;
    
    const app = express();

    app.use(express.static(path.resolve(process.cwd(), 'public')));
    
    return app.listen(port, () => {
        console.log(`server listening on port ${port}`);
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
            consumers         : new Map()
        };
        
        console.log(`new peer connected with id: ${peer.id}`);

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
                        console.log(`${displayName} joined`);

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

                        break;
                    }
                    default:
                        console.log(`${method} method has no case handler`);
                        reject();
                }
                
            } catch (error) {
                console.log('peer on request error', error);
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
                console.log('peer on notification error', error);
            }
        });
        
        srr.onClose(() => {
            onlinePeers.delete(peer.id);

            // notify other peers that this peer has left 
            for (const otherPeer of onlinePeers.values()) {
                otherPeer.socket.notify('peerLeft', { id: peer.id });
            }

            console.log(`peer: ${peer.id} closed`);
        });
    });

}

async function setupMediasoup() {

    const mWorker = await mediasoup.createWorker({
        logLevel : config.server.wrtc.logLevel,
        logTags  : config.server.wrtc.logTags
    });
    
    mWorker.on('died', () => {
        console.error('error: mediasoup worker died');
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

    // handle Consumer events.
    consumer.on('transportclose', () => {
        peer.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
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

async function createPlainTransportPeer() {

    const audioTransport = await mRouter.createPlainTransport({
        listenIp : config.server.wrtc.ip,
        rtcpMux  : false,
        comedia  : true
    });

    const videoTransport = await mRouter.createPlainTransport({
        listenIp : config.server.wrtc.ip,
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

    const videoProducer = await videoTransport.produce({
        kind          : 'video',
        rtpParameters : {
            codecs : [ config.server.wrtc.mediaCodecs[1] ],
            encodings : [ {
                ssrc : VIDEO_SSRC
            } ]
        }
    });

    const plainTransportPeer = {
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

    plainTransportPeer.producers.set(audioProducer.id, audioProducer);
    plainTransportPeer.producers.set(videoProducer.id, videoProducer);

    return plainTransportPeer;

}

async function createPlainTransportStream(gstreamerCwd, externalMediaPath) {
    
    const peer = await createPlainTransportPeer();

    peer.gProcess = gProducer({
        externalMediaPath,
        gstreamerCwd,
        videoPT                : config.server.wrtc.mediaCodecs[1].payloadType,
        videoSsrc              : VIDEO_SSRC,
        videoTransportIp       : peer.transports.video.tuple.localIp,
        videoTransportPort     : peer.transports.video.tuple.localPort,
        videoTransportRtcpPort : peer.transports.video.rtcpTuple.localPort,
        audioPT                : config.server.wrtc.mediaCodecs[0].payloadType,
        audioSsrc              : AUDIO_SSRC,
        audioTransportIp       : peer.transports.audio.tuple.localIp,
        audioTransportPort     : peer.transports.audio.tuple.localPort,
        audioTransportRtcpPort : peer.transports.audio.rtcpTuple.localPort

    });

    onlinePeers.set(peer.id, peer);
}