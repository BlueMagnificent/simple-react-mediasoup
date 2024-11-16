const debug = require('debug');

module.exports = (namespace) => {

    const info = debug(`simple-react-mediasoup:${namespace}`);

    info.log = console.log.bind(console);

    const error = debug(`simple-react-mediasoup:${namespace}:error`);

    return {
        info,
        error
    };
};