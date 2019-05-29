const { createWorker } = require('mediasoup');

const config = require('./config');

const workers = [];

let nextWorkerIndex = 0;

module.exports.initializeMediasoupWorkers = async () => {
  const { logLevel, logTags, rtcMinPort, rtcMaxPort } = config.mediasoup.worker;

  console.log('creating %d mediasoup workers', config.mediasoup.numWorkers);

  for (let i = 0; i < config.mediasoup.numWorkers; ++i) {
    const worker = await createWorker({
      logLevel, logTags, rtcMinPort, rtcMaxPort
    });

    worker.once('died', () => {
      console.error('mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
      setTimeout(() => process.exit(1), 2000);
    });

    workers.push(worker);
  }
};

module.exports.getMediasoupWorker = () => {
  const worker = workers[nextWorkerIndex];

  if (++nextWorkerIndex === workers.length) {
    nextWorkerIndex = 0;
  }

  return worker;
};
