const { createSocket } = require('dgram')

const MIN_PORT = 20000;
const MAX_PORT = 30000;

const getRandomPort = () => Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1) + MIN_PORT);

module.exports.getPort = () =>{

    let port = getRandomPort();
    let iterationCount = 0;
    const socket = createSocket('udp4');

    return new Promise((resolve, reject) =>{

        socket.on('error', error => {

            iterationCount += 1;

            if( iterationCount > 10000 ){
                return reject("could not get any available port");
            }

            port = getRandomPort();
            socket.bind(port);

        });

        socket.on('listening', () => socket.close(() => resolve(port)));

        socket.bind(port);

    });
  
  
};
