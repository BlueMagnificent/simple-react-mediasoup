const childProcess = require('child_process');
const logger = require('./logger')('g-streamer');

const gProcess = (commandArgs = [], gstreamerCwd = "./") => {
    const exe = "set GST_DEBUG=3&& gst-launch-1.0 -v";

    let gstreamerProcess = childProcess.spawn(exe, commandArgs, {
        detached    : false,
        shell       : true,
        windowsHide : true,
        cwd         : gstreamerCwd
    });

    const pid = gstreamerProcess.pid;

    if (gstreamerProcess.stderr) {
        gstreamerProcess.stderr.setEncoding('utf-8');
    }

    if (gstreamerProcess.stdout) {
        gstreamerProcess.stdout.setEncoding('utf-8');
    }

    gstreamerProcess.on('error', (error) =>
        logger.error('process::error [pid:%d, error:%o]', pid, error)
    );

    gstreamerProcess.once('close', () => {
        logger.info('process::close [pid:%d]', pid);
    });

    gstreamerProcess.stderr.on('data', (data) =>
        logger.error('process::stderr::data [data:%o]', data)
    );
    
    const kill = () => {

        if (gstreamerProcess) {
            const pid = gstreamerProcess.pid;

            const isWin = /^win/.test(process.platform);

            if (!isWin) {
                gstreamerProcess.kill('SIGINT');
    
                gstreamerProcess = undefined;
            } else {
            
                childProcess.exec(`taskkill /PID ${ pid } /T /F`, (error, stdout, stderr) => {
    
                    if (error)
                        logger.error('KILL ERROR: ', error);
    
                    gstreamerProcess = undefined;
                });   
    
                gstreamerProcess = undefined; 
                     
            }

            logger.info('kill() [pid:%d]', pid);
        }

    };
    
    // do something when app is closing
    process.on('exit', () => {
        logger.info('Kill() : called by app closing');
        kill();
    });

    // catches ctrl+c event
    process.on('SIGINT', () => {
        logger.info('Kill() : called by Ctrl+C');
        kill();
    });

    // catches "kill pid" (for example: nodemon restart)
    process.on('SIGUSR1', () => {
        logger.info('Kill() : called by Kill pid (SIGUSR1)');
        kill();
    });
    process.on('SIGUSR2', () => {
        logger.info('Kill() : called by Kill pid (SIGUSR2)');
        kill();
    });

    return {
        kill
    };

}

const gProducer = ({
    externalMediaFile, 
    gstreamerCwd,
    videoPT,
    videoSsrc,
    videoTransportIp, 
    videoTransportPort, 
    videoTransportRtcpPort, 
    audioPT,
    audioSsrc,
    audioTransportIp, 
    audioTransportPort,
    audioTransportRtcpPort
}) => {
    
    const commandArgs = [
        'rtpbin name=rtpbin',
        // read from file into demuxer
        `filesrc location="${externalMediaFile}"`,
        '! qtdemux name=demux',
        // extract video, encode to vp8 and send as rtp
        'demux.video_0',
        '! queue',
        '! decodebin',
        '! videoconvert',
        '! vp8enc target-bitrate=1000000 deadline=1 cpu-used=4',
        `! rtpvp8pay pt=${videoPT} ssrc=${videoSsrc} picture-id-mode=2`,
        '! rtpbin.send_rtp_sink_0',
        `rtpbin.send_rtp_src_0 ! udpsink host=${videoTransportIp} port=${videoTransportPort}`,
        // extract audio, encode to opus and send as rtp
        'demux.audio_0',
        '! queue',
        '! decodebin',
        '! audioresample',
        '! audioconvert',
        '! opusenc',
        `! rtpopuspay pt=${audioPT} ssrc=${audioSsrc}`,
        '! rtpbin.send_rtp_sink_1',
        `rtpbin.send_rtp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportPort}`,
        // setup rtcp for video stream and audio stream
        `rtpbin.send_rtcp_src_0 ! udpsink host=${videoTransportIp} port=${videoTransportRtcpPort} sync=false async=false`,
        `rtpbin.send_rtcp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportRtcpPort} sync=false async=false`,
    ];

    return gProcess(commandArgs, gstreamerCwd);
}

const gConsumer = ({ fullFilePath,  gstreamerCwd, rtpDetails }) => {
    const { video, audio } = rtpDetails;

    const videoCaps = `application/x-rtp,media=(string)video,clock-rate=(int)${video.clockRate},payload=(int)${video.payloadType},encoding-name=(string)${video.codecName},ssrc=(uint)${video.ssrc}`;

    const audioCaps = `application/x-rtp,media=(string)audio,clock-rate=(int)${audio.clockRate},payload=(int)${audio.payloadType},encoding-name=(string)${audio.codecName},ssrc=(uint)${audio.ssrc}`;

    const commandArgs = [
        // -e ensures that muxers create readable files when the pipeline is shut down forcefully
        '-e',
        `rtpbin name=rtpbin latency=50 buffer-mode=0 sdes="application/x-rtp-source-sdes, cname=(string)${video.rtpCname}"`,
        // decode video stream
        `udpsrc port=${video.remoteRtpPort} caps="${videoCaps}"`,
        '! rtpbin.recv_rtp_sink_0 rtpbin.',
        '! queue',
        '! rtpvp8depay',
        '! mux.',
        // decode audio stream
        `udpsrc port=${audio.remoteRtpPort} caps="${audioCaps}"`,
        '! rtpbin.recv_rtp_sink_1 rtpbin.',
        '! queue',
        '! rtpopusdepay',
        '! opusdec',
        '! opusenc',
        '! mux.',
        // mux the streams and save to file
        'webmmux name=mux',
        `! filesink location="${fullFilePath}"`,
        // setup rtcp for video stream
        `udpsrc address=127.0.0.1 port=${video.remoteRtcpPort}`,
        '! rtpbin.recv_rtcp_sink_0 rtpbin.send_rtcp_src_0',
        `! udpsink host=127.0.0.1 port=${video.localRtcpPort} bind-address=127.0.0.1 bind-port=${video.remoteRtcpPort} sync=false async=false`,
        // setup rtcp for audio stream
        `udpsrc address=127.0.0.1 port=${audio.remoteRtcpPort}`,
        '! rtpbin.recv_rtcp_sink_1 rtpbin.send_rtcp_src_1',
        `! udpsink host=127.0.0.1 port=${audio.localRtcpPort} bind-address=127.0.0.1 bind-port=${audio.remoteRtcpPort} sync=false async=false`
    ]

    return gProcess(commandArgs, gstreamerCwd);
}

module.exports = {
    gProducer,
    gConsumer
}
