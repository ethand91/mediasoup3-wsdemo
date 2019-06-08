const Koa = require('koa');
const fs = require('fs');
const https = require('https');
const bodyParser = require('koa-bodyparser');
const serve = require('koa-static');
const socket = require('./socket');
const config = require('./config');

const { initializeMediasoupWorkers } = require('./worker');

const { certfile, keyfile, port } = config.socket;
const app = new Koa();
const REST_PORT = process.env.REST_PORT || 3000;

const HTTPS_OPTIONS = Object.freeze({
  cert: fs.readFileSync(certfile),
  key: fs.readFileSync(keyfile)
});

(async function () {
  try {
    await initializeMediasoupWorkers();
  } catch (error) {
    console.log('failed to initialize mediasoup workers stopping process');
    process.exit(1);
  }
})();

app.use(bodyParser());
app.use(serve('./public/dist'));

https.createServer(HTTPS_OPTIONS, app.callback()).listen(REST_PORT, () =>
  console.log(`REST Listening on PORT: ${REST_PORT}`)
);

socket.listen(port, () =>
  console.log('Socket listening on port %d', port)
);
