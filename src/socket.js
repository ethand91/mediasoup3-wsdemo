const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');

const config = require('./config');
const {
  createRoom,
  joinRoom,
  createWebRtcTransport,
  connectTransport,
  createProducer,
  createConsumer,
  checkStatus
} = require('./room');

const { ping_interval, certfile, keyfile, port } = config.socket;

const HTTPS_OPTIONS = Object.freeze({
  cert: fs.readFileSync(certfile),
  key: fs.readFileSync(keyfile)
});

const httpsServer = https.createServer(HTTPS_OPTIONS);
const wss = new WebSocket.Server({ server: httpsServer });

const heartbeat = socket => socket.isAlive = true; 

wss.on('connection', (socket, request) => {
  console.log('new socket request [ip:%s]', request.headers['x-forwarded-for'] || request.headers.origin);

  socket.isAlive = true;
  
  socket.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('request', data.request);
      await handleSocketMessage(socket, data);
    } catch (error) {
      console.error('failed to handle message', error);
    }
  });

  socket.on('close', () => {
    console.log('socket closed [roomId:%s', socket.roomId);
    if (socket.roomId) {
      try {
        broadcastRoom(socket, { request: 'peer-closed', id: socket.peerId }); 
        checkStatus(socket.roomId, socket.peerId);
      } catch (error) {
        console.error('failed to handle check status request [error:%o]', error);
      }
    }
  });
  socket.on('error', error => console.error('socket errored', error));
  socket.on('pong', () => heartbeat(socket));
});

const handleSocketMessage = async (socket, data) => {
  switch(data.request) {
    case 'create-room':
      console.log('create-room');
      const room = await createRoom(data.roomId, data.peerId, data.videoCodec);
      const roomRtpCapabilities = room.mediasoupRouter.rtpCapabilities;
      socket.roomId = data.roomId;
      socket.peerId = data.peerId;
      const peers = [];
      for (const peer of room.peers.values()) {
        if (peer.id === data.peerId) {
          continue;
        }

        peers.push({
          id: peer.id,
          producers: Array.from(peer.producers)
        });
      }
      room.peers.forEach(peer => peers.push(peer));
      socket.send(JSON.stringify({ request: data.request, roomRtpCapabilities, peers }));
      break;
    case 'join-room':
    case 'create-transport':
      const transportData = await createWebRtcTransport(data.roomId, data.peerId);
      socket.send(JSON.stringify({ request: data.request, transportData, type: data.type }));
      break;
    case 'connect-transport':
      await connectTransport(data.roomId, data.peerId, data.transportId, data.dtlsParameters);
      socket.send(JSON.stringify({ request: data.request }));
      break;
    case 'produce':
      const producerData = await createProducer(data.roomId, data.peerId, data.transportId, data.kind, data.rtpParameters);
      socket.send(JSON.stringify({ request: data.request, producerData }));
      broadcastRoom(socket, { request: 'new-producer', producerData });
      break;
    case 'consume':
      const consumerData = await createConsumer(data.roomId, data.consumerPeerId, data.producerPeerId, data.transportId, data.producerId, data.rtpCapabilities);
      socket.send(JSON.stringify({ request: data.request, consumerData }));
      break;
    default: console.log('unknown request %s', data.request);
  }
};

const broadcastRoom = (socket, message) => {
  console.log('broadcastRoom() [message:%o]', message);
  for (const client of wss.clients) {
    if (!client.peerId || !client.roomId) {
      return;
    }
    if ((socket.peerId !== client.peerId) && (socket.roomId === client.roomId)) {
      console.log('LETS SEND');
      client.send(JSON.stringify(message));
    }
  }
};

// Ping/Pong
setInterval(() => {
  for (const socket of wss.clients) {
    if(!Boolean(socket.isAlive)) {
      console.log('disconnect socket due to ping/pong timeout');
      return socket.terminate();
    }

    socket.isAlive = false;
    socket.ping(() => {});
  }
}, ping_interval);

module.exports = httpsServer;
