module.exports = {
    server:{
        http: {
            port: 3030
        },
        wrtc:{
            ip: '123.456.789.101',
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
                clockRate : 48000,
                channels  : 2
            }, {
                kind       : 'video',
                mimeType   : 'video/VP8',
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