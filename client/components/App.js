import React, { useRef, useState } from 'react';
import { generateName } from '../libs/name-generator'
import { useWebSocket } from '../hooks/useWebSocket';
import { useMediaSoup } from '../hooks/useMediaSoup';
import Display from './Display';
import Peer from './Peer';


export default function App({webSocketUrl}){

    const videoRef = useRef(null);

    const [displayName, setDisplayName] = useState(generateName());

    const { peers, socket } = useWebSocket(webSocketUrl);

    const { consumerTransport } = useMediaSoup(socket, videoRef, displayName);

    return (
        <>      
            <Display displayName={displayName + " (self)"} videoRef={videoRef} />
            <hr/>
            <div>
                {
                    peers.map(peer => (
                        <Peer 
                            key={peer.id} 
                            peerId={peer.id}
                            displayName={peer.displayName} 
                            consumerTransport={consumerTransport} 
                            srr={socket} 
                        />
                    ))
                }
            </div>
        </>
    );
}