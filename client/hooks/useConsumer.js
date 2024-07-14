import React, { useEffect}  from "react";

export function useConsumer(peerId, displayName, srr, consumerTransport, videoRef, audioRef) {

    useEffect(() => {

        async function consumeFromPeer() {
            try {
                const { consumerDetailsArray } = await srr.request('consume', { peerId });
            
                for (const consumerDetails of consumerDetailsArray) {
                    const { producerId, id, kind, rtpParameters } = consumerDetails;
            
                    const consumer = await consumerTransport.consume({ id, producerId, kind, rtpParameters });
                                            
                    const stream = new MediaStream();
            
                    stream.addTrack(consumer.track);
            
                    if (kind === 'video') {
                        const video = videoRef.current;
    
                        // if video element is null, log an error and return
                        if (!video) return console.error(`useConsumer | error: invalid video element "${displayName}_video"`);
    
                        video.srcObject = stream;
                        video.play().catch((error) => console.error(`${displayName}_video.play() failed:%o`, error.message));
                            
                        // resume the paused consumers
                        srr.notify('resumeConsumer', { consumerId: id });
    
                    } else if (kind === 'audio') {
                        const audio = audioRef.current;
    
                        // if audio element is null, log an error and return
                        if (!audio) return console.error(`useConsumer | error: invalid audio element "${displayName}_audio"`);
    
                        audio.srcObject = stream;
                        audio.play().catch((error) => console.error(`${displayName}_audio.play() failed:%o`, error.message));
    
                    }
            
                }
                
            } catch (error) {
                console.error('Error consuming selected peer: ', error);
            }
        }

        consumeFromPeer()
        .catch((error) => {
            console.log('error while starting: ', error);
        });
    }, [peerId, displayName]);
    
}