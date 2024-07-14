import React from "react";
import { createRoot } from 'react-dom/client';
import App from './components/App';

let webSocketUrl = "";

// note that IS_STAND_ALONE_CLIENT and WEB_SOCKET_URL are both defined in webpack.config.js
if(IS_STAND_ALONE_CLIENT){ 
    webSocketUrl = WEB_SOCKET_URL;
}
else {
    // derive socket webSocketUrl from window.location
    const loc = window.location;
    const port = loc.port == "" ? "" : `:${loc.port}`;
    const wsProtocol = loc.protocol == "https:" ? "wss" : "ws";

    webSocketUrl = `${wsProtocol}://${loc.hostname}${port}`;
}

const root = createRoot(document.getElementById('root'));
root.render(<App webSocketUrl={webSocketUrl} />);