// handles stream inflow from gstreamer to the server

const childProcess = require('child_process');

const GSTREAMER_COMMAND = 'gst-launch-1.0';
const GSTREAMER_OPTIONS = '-v -e';

module.exports = ({
    externalMediaPath, 
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

    let gstreamerProcess = undefined;
    
    const commandArgs = [ 
        `rtpbin name=rtpbin filesrc location=${externalMediaPath}`,
        '! qtdemux name=demux demux.video_0',
        '! queue',
        '! decodebin',
        '! videoconvert',
        '! vp8enc target-bitrate=1000000 deadline=1 cpu-used=4',
        `! rtpvp8pay pt=${videoPT} ssrc=${videoSsrc} picture-id-mode=2`,
        '! rtpbin.send_rtp_sink_0 rtpbin.send_rtp_src_0 ',
        `! udpsink host=${videoTransportIp} port=${videoTransportPort} rtpbin.send_rtcp_src_0`,
        `! udpsink host=${videoTransportIp} port=${videoTransportRtcpPort} sync=false async=false demux.audio_0`,
        '! queue',
        '! decodebin',
        '! audioresample',
        '! audioconvert',
        '! opusenc',
        `! rtpopuspay pt=${audioPT} ssrc=${audioSsrc}`,
        '! rtpbin.send_rtp_sink_1 rtpbin.send_rtp_src_1',
        `! udpsink host=${audioTransportIp} port=${audioTransportPort} rtpbin.send_rtcp_src_1`,
        `! udpsink host=${audioTransportIp} port=${audioTransportRtcpPort} sync=false async=false` 
    ];

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
                        console.log('KILL ERROR: ', error);
    
                    gstreamerProcess = undefined;
                });   
    
                gstreamerProcess = undefined; 
                     
            }

            console.log('kill() [pid:%d]', pid);
        }

    };

    // console.log(commandArgs.join(' '));

    const createProcess = () => {
        const exe = `${GSTREAMER_COMMAND} ${GSTREAMER_OPTIONS}`;

        gstreamerProcess = childProcess.spawn(exe, commandArgs, {
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

        gstreamerProcess.on('message', (message) =>
            console.log('gstreamer::process::message [pid:%d, message:%o]', pid, message)
        );

        gstreamerProcess.on('error', (error) =>
            console.error('gstreamer::process::error [pid:%d, error:%o]', pid, error)
        );

        gstreamerProcess.once('close', () => {
            console.log('gstreamer::process::close [pid:%d]', pid);
        });

        gstreamerProcess.stderr.on('data', (data) =>
            console.log('gstreamer::process::stderr::data [data:%o]', data)
        );
    };

    createProcess();

    // do something when app is closing
    process.on('exit', () => {
        console.log('Kill() : called by app closing');
        kill();
    });

    // catches ctrl+c event
    process.on('SIGINT', () => {
        console.log('Kill() : called by Ctrl+C');
        kill();
    });

    // catches "kill pid" (for example: nodemon restart)
    process.on('SIGUSR1', () => {
        console.log('Kill() : called by Kill pid (SIGUSR1)');
        kill();
    });
    process.on('SIGUSR2', () => {
        console.log('Kill() : called by Kill pid (SIGUSR2)');
        kill();
    });

    return {
        kill
    };
};
