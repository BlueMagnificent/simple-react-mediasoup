import React from "react";

export default function Display({displayName, videoRef, style}) {

    return (
        <>
            <div style={style}>
                <div style={{textAlign: "center"}}>
                    {displayName}
                </div>
                <div style={{height: "200px", width: "96%", margin: "0px auto"}}>
                    <video ref={videoRef} autoPlay playsInline style={{width: "100%", height: "100%"}}></video>
                </div>
            </div>
        </>
    )
}