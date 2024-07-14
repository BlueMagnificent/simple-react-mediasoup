import { useState, useEffect } from "react";
import * as mediasoup from 'mediasoup-client';

export function useMediaSoup(socket, videoRef, displayName) {
    const [consumerTransport, setConsumerTransport] = useState(null);

    useEffect(() => {
        
        if(!socket) return;
        
        let device = null;

        let producerTransport = null;
        let consumerTransport = null;
    
        setupMediasoup()
        .then(()=>setConsumerTransport(consumerTransport))
        .catch((error)=>{
            console.log('error while starting: ', error);
        });
        
        /**
         * Setup the mediasoup device, create the producer and consumer transports, publish media and join the room
         */
        async function setupMediasoup() {
            const data = await socket.request('getRouterRtpCapabilities');
        
            await loadDevice(data);
            await createProducerTransport();
            await createConsumerTransport();
            await publish();
            await join();
        }
        
        async function loadDevice(routerRtpCapabilities) {
            device = new mediasoup.Device();
            await device.load({ routerRtpCapabilities });
        }
        
        async function createProducerTransport() {
            const data = await socket.request('createProducerTransport');
        
            producerTransport = device.createSendTransport(data);
            producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                socket.request('connectProducerTransport', { dtlsParameters })
                    .then(callback)
                    .catch(errback);
            });
            
            producerTransport.on('connectionstatechange', (state) => {
                if (state == 'failed') {
                    producerTransport.close();
                    console.log('producer transport connection failed');
                }
            });
        
            producerTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
                try {
                    const { id } = await socket.request('produce', {
                        transportId : producerTransport.id,
                        kind,
                        rtpParameters
                    });
        
                    callback({ id });
                } catch (error) {
                    errback(error);
                }
            });
        
        }
        
        async function createConsumerTransport() {
            const data = await socket.request('createConsumerTransport');
        
            consumerTransport = device.createRecvTransport(data);
        
            consumerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                socket.request('connectConsumerTransport', { dtlsParameters })
                    .then(callback)
                    .catch(errback);
            });
        
            consumerTransport.on('connectionstatechange', async (state) => {
                if (state == 'failed') {
                    consumerTransport.close();
                    console.error('consumer transport connection failed');
                }
                
            });
        }
        
        async function join() {
            const { rtpCapabilities } = device;
        
            await socket.request('join', { rtpCapabilities, displayName });
        }
        
        async function publish() {
            try {
                
                await produceUserVideo();
        
                await produceUserAudio();
                
            } catch (error) {
                console.error(error.message);
            }
        
        }
        
        async function produceUserVideo() {
            if (!device.canProduce('video')) {
                throw Error('cannot produce video');
            }
        
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const track = stream.getVideoTracks()[0];

            const video = videoRef.current;

            video.srcObject = stream;
        
            await producerTransport.produce({ track });
        
        }
        
        async function produceUserAudio() {
            if (!device.canProduce('audio')) {
                throw Error('cannot produce audio');
            }
        
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const track = stream.getAudioTracks()[0];
            
            await producerTransport.produce({ track });
        
        }

    }, [socket]);

    return {
        consumerTransport
    }
}

