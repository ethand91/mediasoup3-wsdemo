const { version, Device } = require('mediasoup-client');

const socket = new WebSocket(`wss://${window.location.hostname}:3001`);
const device = new Device();
const VIDEO_CONSTRAINTS = Object.freeze({
  width: { ideal: 640 }, height: { ideal: 480 }
});

let canProduceVideo, canProduceAudio = false;
let remotePeers = [];
let sendTransport, recvTransport;
let roomId, peerId;
let produce, consume;
const remoteMediaStream = new MediaStream();

console.log('running mediasoup client version %s', version);

const createTransport = () => {
  console.log('createTransport()');
  if (produce) {
    console.log('creating send transport');
    socket.send(JSON.stringify({ request: 'create-transport', roomId, peerId, type: 'send' }));
  } else {
    document.getElementById('localVideo').remove();
  }

  if (consume) {
    console.log('creating recv transport');
    socket.send(JSON.stringify({ request: 'create-transport', roomId, peerId, type: 'recv' }));
  }
};

const createProducers = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: VIDEO_CONSTRAINTS,
    audio: true
  });

  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];
  
  const localVideoNode = document.getElementById('localVideo');
  localVideoNode.srcObject = stream;
  localVideoNode.load();

  if (canProduceVideo) {
    const videoProducer = await sendTransport.produce({ track: videoTrack });
  }

  if (canProduceAudio) {
    const audioProducer = await sendTransport.produce({ track: audioTrack });
  }
};

const handleSocketOpen = () => {
  const url = new URL(window.location);
  roomId = url.searchParams.get('roomId');
  peerId = url.searchParams.get('peerId');
  produce = url.searchParams.get('produce');
  consume = url.searchParams.get('consume');
  const videoCodec = url.searchParams.get('videoCodec') || 'vp8';

  if (!roomId || !peerId) {
    return alert('invalid url');
  }

  console.warn(produce);
  consume = (consume && consume == 1) ? true : false;
  produce = (produce && produce == 1) ? true : false;
  
  console.warn(produce);
  if (!produce && !consume) {
    return alert('procuce and consume are both false');
  }

  console.log('starting media session [roomId:%s, peerId:%s, produce: %s, consume:%s]', roomId, peerId, produce, consume);

  socket.send(JSON.stringify({ request: 'create-room', roomId, peerId, videoCodec }));
};

const handleCreateRoomResponse = async ({ roomRtpCapabilities, peers }) => {
  console.log('handleCreateRoomResponse() [roomRtpCapabilities:%o, peers: %o]', roomRtpCapabilities, peers);
  await device.load({ routerRtpCapabilities: roomRtpCapabilities});

  canProduceVideo = device.canProduce('video');
  canProduceAudio = device.canProduce('audio');

  remotePeers = peers;
  createTransport();
};

const handleTransportProduce = async ({ kind, rtpParameters }, callback, errback) => {
  console.log('Transport::produce [kind:%s, rtpParameters:%o]', kind, rtpParameters);

  const handleTransportProduceResponse = async (message) => {
    try {
      const dataJson = JSON.parse(message.data);

      if (dataJson.request === 'produce') {
        callback({ id: dataJson.producerData.id });
      }
    } catch (error) {
      console.error('Failed to handle transport connect', error);
      errback(error);
    } finally {
      socket.removeEventListener('message', handleTransportProduceResponse);
    }
  };

  socket.addEventListener('message', handleTransportProduceResponse);
  socket.send(JSON.stringify({ request: 'produce', roomId, peerId, transportId: sendTransport.id, kind, rtpParameters }));
};

const createSendTransport = async (transportData) => {
  console.log('createSendTransport() [transportData:%o]', transportData);
  sendTransport = await device.createSendTransport(transportData);

  sendTransport.on('produce', handleTransportProduce);

  createProducers();
  return sendTransport;
};

const createRecvTransport = async (transportData) => {
  console.log('createRecvTransport() [transportData:%o]', transportData);
  recvTransport = await device.createRecvTransport(transportData);

  for (const peer of remotePeers) {
    if (peer.producers.length > 0) {
      for (const producer of peer.producers) {
        console.log('consumner producer:%o', producer);
        socket.send(JSON.stringify({ request: 'consume', roomId, consumerPeerId: peerId, producerPeerId: peer.id, producerId: producer[0], rtpCapabilities: device.rtpCapabilities, transportId: recvTransport.id }));
      }
    }
  }

  return recvTransport;
};

const handleCreateTransportResponse = async ({ transportData, type }) => {
  console.log('handleCreateTransportResponse() [transportData:%o]', transportData);
  const transport = type === 'send'
    ? await createSendTransport(transportData)
    : await createRecvTransport(transportData);

  transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    console.log('Transport::connect [direction:%s]', transport.direction);
    
    const handleTransportConnectResponse = async (message) => {
      try {
        const dataJson = JSON.parse(message.data);

        if (dataJson.request === 'connect-transport') {
          console.log('connect', dataJson);
          callback();
        }
      } catch (error) {
        console.error('Failed to handle transport connect', error);
        errback(error);
      } finally {
        socket.removeEventListener('message', handleTransportConnectResponse);
      }
    };

    socket.addEventListener('message', handleTransportConnectResponse);
    socket.send(JSON.stringify({ request: 'connect-transport', roomId, peerId, transportId: transport.id, dtlsParameters }));
  });
};

const handleConsumeResponse = async ({ consumerData }) => {
  console.log('handleConsumeResponse() [consumerData:%o]', consumerData);
  const { consumerId, kind, producerId, rtpParameters } = consumerData;
  if (kind === 'video') {
    const videoConsumer = await recvTransport.consume({
      id: consumerId,
      kind, producerId, rtpParameters
    });

    remoteMediaStream.addTrack(videoConsumer.track);
  } else {
    const audioConsumer = await recvTransport.consume({
      id: consumerId,
      kind, producerId, rtpParameters
    });

    remoteMediaStream.addTrack(audioConsumer.track);
  }
 
  const remoteVideoNode = document.getElementById(`remoteVideo-${consumerData.peerId}`);

  if (remoteVideoNode) {
    remoteVideoNode.srcObject = remoteMediaStream;
    remoteVideoNode.load();
    return;
  }

  const videoNode = document.createElement('video');
  videoNode.id = `remoteVideo-${consumerData.peerId}`;
  videoNode.autoplay = true;
  videoNode.playsinline = true;
  videoNode.srcObject = remoteMediaStream;
  document.body.appendChild(videoNode);
  videoNode.load();
};

const handleNewProducerResponse = ({ producerData }) => {
  console.log('handleNewProducerResponse() [producerData:%o]', producerData);
  socket.send(JSON.stringify({ request: 'consume', roomId, consumerPeerId: peerId, producerPeerId: producerData.peerId, producerId: producerData.id, rtpCapabilities: device.rtpCapabilities, transportId: recvTransport.id }));
};

const handlePeerClosedResponse = ({ id }) => {
  const peerVideo = document.getElementById(`remoteVideo-${id}`);
  if (peerVideo) {
    console.warn('remove video');
    peerVideo.remove();
  }
};

const destroySession = () => {
  if (sendTransport) {
    sendTransport.close();
  }
  
  if (recvTransport) {
    recvTransport.close();
  }

  for (const videoNode of document.querySelector('video')) {
    videoNode.remove();
  }
};

const handleSocketMessage = async (message) => {
  try {
    console.log(message);
    const data = JSON.parse(message.data);
    switch (data.request) {
      case 'create-room':
        handleCreateRoomResponse(data);
        break;
      case 'create-transport':
        handleCreateTransportResponse(data);
        break;
      case 'consume':
        handleConsumeResponse(data);
        break;
      case 'new-producer':
        handleNewProducerResponse(data);
        break;
      case 'peer-closed':
        handlePeerClosedResponse(data);
        break;
      default: console.log('Unknown message', data);
    }
  } catch (error) {
    console.error('failed to handle socket message', error);
  }
};

const handleSocketError = error => {
  console.error('handleSocketError() [error:%o]', error);
  destroySession();
};

const handleSocketClose = () => {
  console.log('handleSocketClose()');
  destroySession();
};

socket.addEventListener('open', handleSocketOpen); 
socket.addEventListener('message', handleSocketMessage);
socket.addEventListener('error', handleSocketError);
socket.addEventListener('close', handleSocketClose);
