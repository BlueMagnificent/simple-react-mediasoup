import {useState, useEffect} from 'react';
import SockRR from '../libs/sockrr-client';

export function useWebSocket(webSocketUrl){

    const [peers, setPeers] = useState([]);
    const [socket, setSocket] = useState(null);

    useEffect(()=>{

        const onlinePeers = new Map();
        
        function updatePeersState(){
            setPeers([...onlinePeers.values()]);
        }
        
        SockRR(webSocketUrl)
        .then((srr)=>{

            srr.onNotification((method, data = {}) => {
        
                switch (method) {
                    case 'peerJoined':{

                        onlinePeers.set(data.id, data); // data: { id, displayName }

                        updatePeersState();
                        
                        break;
                    }
                    case 'peerLeft':{
                        const { id } = data;
        
                        onlinePeers.delete(id);

                        updatePeersState();
                        
                        break;
                    }
                    case 'setAvailablePeers':{
                        onlinePeers.clear();
        
                        const { otherPeerDetails } = data;
        
                        for (const otherPeer of otherPeerDetails) {
                            onlinePeers.set(otherPeer.id, otherPeer);
                        }

                        updatePeersState();
        
                        break;
                    }
        
                    default:
                        console.log(`${method} method has no case handler`);
                }
        
            });

            srr.onClose(() => {
                console.error('web socket connection closed');
            });
            
            setSocket(srr);
        })
        .catch((e)=>{
            console.error('Error connecting to server: ', e);
        });

    }, [webSocketUrl]);

    return {
        peers,
        socket
    };
}