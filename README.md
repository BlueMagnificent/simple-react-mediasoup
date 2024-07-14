# Simple React Mediasoup

A simple [node.js](https://nodejs.org) [mediasoup](https://mediasoup.org) application with a [react](https://react.dev) frontend.
### Prerequisite
- Node.js version >= v16.0.0
### How To
Clone the repository 
```Bash
git clone 
```

Navigate into the repo and Install dependencies:
```bash
npm install
```

In `config.js`, update `server.wrtc.ip` to the right IP address for your network and then run:
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


### Installation Issues
If you encounter any issue while installing mediasoup then please reference the [installation doc of mediasoup](https://mediasoup.org/documentation/v3/mediasoup/installation).

### Caution❗
This project uses `SockRR`, a tiny wrapper library around websocket that implements a request-response method for communication between client and server. `SockRR` is intended for tests and demos, and it's not advised to be used in production systems.