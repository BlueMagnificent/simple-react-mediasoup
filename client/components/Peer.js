import React, {useRef} from "react";
import Display from "./Display";
import { useConsumer } from "../hooks/useConsumer";

export default function Peer({peerId, displayName, srr, consumerTransport}){

    const videoRef = useRef(null);
    const audioRef = useRef(null);

    useConsumer(peerId, displayName, srr, consumerTransport, videoRef, audioRef);

    return (
        <>
            <Display  displayName={displayName} videoRef={videoRef} style={{width: "200px", display: "inlineBlock", float: "left"}} />
            <audio ref={audioRef} />
        </>
    )
}