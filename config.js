module.exports = {
    server:{
        http: {
            port: 3030
        },
        gstreamer: {
            cwd: '',
            externalMediaPath: '',
        },
        wrtc:{
            ip: '',
            protocol: 'udp',
            port: 44444,
            logLevel : 'warn',
            logTags  : [
                'info',
                'ice',
                'dtls',
                'rtp',
                'srtp',
                'rtcp',
                'rtx',
                'bwe',
                'score',
                'simulcast',
                'svc',
                'sctp'
            ],
            mediaCodecs : [ {
                kind      : 'audio',
                mimeType  : 'audio/opus',
                payloadType : 100,
                clockRate : 48000,
                channels  : 2
            }, {
                kind       : 'video',
                mimeType   : 'video/VP8',
                payloadType: 101,
                clockRate  : 90000,
                parameters : {
                    'x-google-start-bitrate' : 1000
                }
            } ] 
        }

    },
    client: {
        port: 3031,
        webSocketUrl: 'ws://localhost:3030'

    }
}