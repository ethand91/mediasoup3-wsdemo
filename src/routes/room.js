const Router = require('koa-router');

const { createRoom } = require('./../room');
const { getMediasoupWorker } = require('./../worker');

const BASE_URL = '/api/v1/room';
const router = new Router();

router.get(`${BASE_URL}/:id`, async (ctx) => {
  console.log('TEST');
  try {
    const { id } = ctx.params;

    const room = await createRoom(id);
    console.log('room', room);
    const roomRtpCapabilities = room.mediasoupRouter.rtpCapabilities;

    ctx.status = 200;
    ctx.body = { roomRtpCapabilities };
  } catch (error) {
    console.log('error creating new room', error);
    ctx.status = 501;
  }
});

module.exports = router;
