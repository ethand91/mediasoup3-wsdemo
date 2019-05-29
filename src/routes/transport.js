const Router = require('koa-router');

const { createWebRtcTransport } = require('./../room');

const BASE_URL = '/api/v1/transport';
const router = new Router();

router.get(`${BASE_URL}`, async (ctx) => {
  
});
