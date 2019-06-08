const os = require('os');
const ifaces = os.networkInterfaces();

const getLocalIp = () => {
  let localIp = '127.0.0.1';

  Object.keys(ifaces).forEach(ifname => {
    for (const iface of ifaces[ifname]) {
      // Ignore IPv6 and 127.0.0.1
      if (iface.family !== 'IPv4' || iface.internal !== false) {
        continue;
      }

      // Set the local ip to the first IPv4 address found and exit the loop
      localIp = iface.address;
      return;
    }
  });

  return localIp;
};

module.exports = {
  socket: {
    host: process.env.LISTEN_IP || '0.0.0.0',
    port: process.env.LISTEN_PORT || 3001 ,
    ping_interval: process.env.PING_INTERVAL || 3000,
    certfile: process.env.CERT_FILE || './ssl/server.crt',
    keyfile: process.env.KEY_FILE || './ssl/server.key'
  },
  mediasoup: {
    numWorkers: Object.keys(os.cpus()).length,
    worker: {
      logLevel: 'debug',
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp'
      ],
      rtcMinPort: 40000,
      rtcMaxPort: 49999
    },
    router: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/VP9',
          clockRate: 90000,
          parameters: {
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': 1000
          }
        }
      ]
    },
    webRtcTransport: {
      listenIps: [
        { ip: process.env.LISTEN_IP || getLocalIp(), announcedIp: null },
      ],
      maxIncomingBitrate: 1500000,
      initialAvailableOutgoingBitrate: 100000,
      enableTcp: false,
      enableUdp: true
    }
  }
};
