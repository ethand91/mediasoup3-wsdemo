const AwaitQueue = require('awaitqueue');

const config = require('./config');
const { getMediasoupWorker } = require('./worker'); 

const rooms = new Map();

const joinRoom = (room, peerId) => {
  if (room.peers.get(peerId)) {
    throw new Error('peer %s already exists in room %s', peerId, room.roomId);
  }

  const peer = {
    id: peerId,
    producers: new Map(),
    consumers: new Map(),
    transports: new Map()
  };

  room.peers.set(peerId, peer);
  console.log('peer logged in');
};

module.exports.createRoom = async (roomId, peerId, videoCodec = 'VP8') => {
  if (rooms.has(roomId)) {
    joinRoom(rooms.get(roomId), peerId);
    return rooms.get(roomId);
  }

  console.log('createRoom() [roomId:%s, videoCodec:%s', roomId, videoCodec);
  const mediasoupWorker = getMediasoupWorker();
  const mediaCodecs = config.mediasoup.router.mediaCodecs
    .filter((codec => codec.kind === 'audio' || codec.mimeType.toLowerCase() === `video/${videoCodec.toLowerCase()}`));

  const mediasoupRouter = await mediasoupWorker.createRouter({ mediaCodecs });
  
  const room = {
    roomId,
    mediasoupRouter,
    peers: new Map(),
  };

  rooms.set(roomId, room);
  joinRoom(room, peerId);
  return room;
};

module.exports.createWebRtcTransport = async (roomId, peerId) => {
  const room = rooms.get(roomId);

  if (!room) {
    throw new Error('room %s not found', roomId);
  }

  const peer = room.peers.get(peerId);

  if (!peer) {
    throw new Error('peer %s not found in room', peerId);
  }

  const { listenIps, initialAvailableOutgoingBitrate, enableTcp, enableUdp } = config.mediasoup.webRtcTransport; 

  const transport = await room.mediasoupRouter.createWebRtcTransport({
    listenIps, enableUdp, enableTcp, initialAvailableOutgoingBitrate
  });

  peer.transports.set(transport.id, transport);

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters
  };
};

module.exports.connectTransport = async (roomId, peerId, transportId, dtlsParameters) => {
  const room = rooms.get(roomId);

  if (!room) {
    throw new Error(`Room with id ${roomId} does not exist`);
  }

  const peer = room.peers.get(peerId);

  if (!peer) {
    throw new Error('peer %s was not found in room', peerId);
  }

  const transport = peer.transports.get(transportId);

  if (!transport) {
    throw new Error(`transport with id ${transportId} does not exist`);
  }

  await transport.connect({ dtlsParameters });
};

module.exports.createProducer = async (roomId, peerId, transportId, kind, rtpParameters) => {
  const room = rooms.get(roomId);

  if (!room) {
    throw new Error(`Room with id ${roomId} does not exist`);
  }

  const peer = room.peers.get(peerId);

  if (!peer) {
    throw new Error('peer %s not found in room', peerId);
  }

  const transport = peer.transports.get(transportId);

  if (!transport) {
    throw new Error(`transport with id ${transportId} does not exist`);
  }
 
  const producer = await transport.produce({ kind, rtpParameters });

  producer.on('score', (score) => {
    console.log('[producer:%s] score event [score:%o]', producer.id, score);
  });

  producer.on('videoorientationchange', (videoOrientation) => {
    console.log('[producer:%s] videoorientationchange [videoorientation:%o', producer.id, videoOrientation);
  });

  producer.once('transportclose', () => {
    console.log('[producer:%s] transportclose', producer.id);
    room.producers.delete(producer.id);
  });

  peer.producers.set(producer.id, producer);

  return { id: producer.id, peerId: peerId };
};

module.exports.createConsumer = async (roomId, consumerPeerId, producerPeerId, transportId, producerId, rtpCapabilities) => {
  console.log('createConsumer() [roomId:%s, consumerPeerId:%s, producerPeerId:%s, transportId:%s, producerId:%s]', roomId, consumerPeerId, producerPeerId, transportId, producerId);
  const room = rooms.get(roomId);

  if (!room) {
    throw new Error(`Room with id ${roomId} does not exist`);
  }

  const peer = room.peers.get(consumerPeerId);

  if (!peer) {
    throw new Error('peer %s was not found in room', consumerPeerId);
  }

  if (!room.mediasoupRouter.canConsume({
    producerId, rtpCapabilities
  })) {
    return console.log('user cannot consume producer id %s', producerId);
  }

  const transport = peer.transports.get(transportId);

  if (!transport) {
    throw new Error(`transport with id ${transportId} does not exist`);
  }
 
  let consumer;

  try {
    consumer = await transport.consume({
      producerId, rtpCapabilities
    });
  } catch (error) {
    return console.error('transport consume error %o', error);
  }

  peer.consumers.set(consumer.id, consumer);

  consumer.once('transportclose', () => {
    console.log('[consumer:%s] transportclose', consumer.id);
    room.consumers.delete(consumer.id); 
  });

  consumer.on('producerclose', () => {
    room.consumers.delete(consumer.id);
  });

  consumer.on('score', score => console.log('[consumer:%s score:%o]', consumer.id, score));

  return {
    producerId,
    consumerId: consumer.id,
    peerId: producerPeerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
    type: consumer.type,
  }
};

module.exports.checkStatus = (roomId, peerId) => {
  const room = rooms.get(roomId);

  if (!room) {
    throw new Error('[room:%s] was not found', roomId);
  }

  room.peers.delete(peerId);

  if (room.peers.size === 0) {
    console.log('[room:%s] closing due to no more peers', roomId);
    rooms.delete(room.roomId);
  }
};
