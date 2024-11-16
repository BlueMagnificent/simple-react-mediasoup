# Simple React Mediasoup

A simple [node.js](https://nodejs.org) [mediasoup](https://mediasoup.org) application with a [react](https://react.dev) frontend.
### Prerequisite
- Node.js version >= v16.0.0
### How To
Clone the repository 
```Bash
git clone https://github.com/BlueMagnificent/simple-react-mediasoup.git
```

Navigate into the directory of the cloned repository and install dependencies:
```bash
npm install
```

In `config.js`, update `server.wrtc.ip` to the right IP address for your network.

 and then run:
```bash
npm start
```

Visit `localhost:3030` on your browser and if the above steps went well, you should see a video feed from your camera. Congrats 🥳, you are the first client to join the very simple video chat. To simulate other clients, open this same URL in other tabs of your browser and you should have a whole lot of yourselves 😂.

This app is made up of server and client parts which can equally be run separately. For the server part:
```bash
npm run server
```
and for the client part:
```bash
npm run client
```
Running the client part will call-up `localhost:3031` in a browser.

### Streaming From and To External media
This project also features the use of `PlainTransport` to consume media from an exernal endpoint and to stream media to an external endpoint. This is archieved using [gstreamer](https://gstreamer.freedesktop.org/) and should be installed on your system if you want to try this out. 

_(A good part of the codes used for these features were gratefully obtained from [mediasoup-demo](https://github.com/versatica/mediasoup-demo) and [mediasoup3-record-demo](https://github.com/ethand91/mediasoup3-record-demo))_

#### Consume media from external endpoint
This makes use of gstreamer to stream audio and video from a locally saved video file into mediasoup. To enable this, the following values in `config.js` file must be provided 
- `server.gstreamer.cwd`: A working directory where gstreamers's `gst-launch-1.0` CLI tool is accessible
- `server.gstreamer.externalMediaFile`: The full file path of a video file to stream into mediasoup.

When this feature is enabled, a peer with display name "gstreamer" gets added to the online peers

#### Streaming media to external endpoint
This features uses gstreamer to record the audio and video stream of a peer to a file. With this feature enabled, the stream of the first peer to join gets recorded. When the peer leaves, the recording is saved and the next available peer is picked up, and so on. To enable this feature, the following values in `config.js` file must be provided:
- `server.gstreamer.cwd`: A working directory where gstreamers's `gst-launch-1.0` CLI tool is accessible (same case as the "Consume media from external endpoint" section above) 
- `server.gstreamer.mediaSavePath`: The full directory path to save the recorded file. The actually file name is of the pattern `"{peer.displayName}_{timestamp}.webm"`




### Installation Issues
If you encounter any issue while installing mediasoup then please reference the [installation doc of mediasoup](https://mediasoup.org/documentation/v3/mediasoup/installation).

### Caution❗
This project uses `SockRR`, a tiny wrapper library around websocket that implements a request-response method for communication between client and server. `SockRR` is intended for tests and demos, and it's not advised to be used in production systems.