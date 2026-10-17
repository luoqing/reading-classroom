// Exercise the real socket protocol when the runtime has no global WebSocket.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const WS = require('ws');
const { once } = require('node:events');
const path = require('node:path');

test('provider call works without global WebSocket and sends PCM frames', async () => {
  const server = new WS.WebSocketServer({ port: 0 });
  await once(server, 'listening');
  const port = server.address().port;
  const oldGlobal = global.WebSocket;
  const serviceWsPath = require.resolve('ws', { paths: [path.join(__dirname, '../dist/server/modules/reading')] });
  require(serviceWsPath);
  const cached = require.cache[serviceWsPath].exports;
  global.WebSocket = undefined;
  require.cache[serviceWsPath].exports = class extends WS {
    constructor(url) {
      assert.equal(new URL(url).hostname, 'ise-api.xfyun.cn');
      super(`ws://127.0.0.1:${port}`);
    }
  };
  process.env.XFYUN_APP_ID = 'test';
  process.env.XFYUN_API_KEY = 'test';
  process.env.XFYUN_API_SECRET = 'test';
  const frames = [];
  const xml = '<read_chapter total_score="80" />';
  server.on('connection', socket => socket.on('message', raw => {
    const frame = JSON.parse(raw.toString());
    frames.push(frame);
    if (frame.data.status === 2) socket.send(JSON.stringify({code:0,sid:'protocol-test',data:{status:2,data:Buffer.from(xml).toString('base64')}}));
  }));
  try {
    const { ReadingService } = require('../dist/server/modules/reading/reading.service');
    const service = new ReadingService({}, {});
    const result = await service.callProvider('天', Buffer.alloc(16000));
    assert.equal(result.xml, xml);
    assert.equal(frames[0].business.cmd, 'ssb');
    assert.equal(frames.at(-1).business.aus, 4);
    assert.equal(frames.slice(1).reduce((size,frame)=>size+Buffer.from(frame.data.data,'base64').length,0),16000);
  } finally {
    global.WebSocket = oldGlobal;
    require.cache[serviceWsPath].exports = cached;
    for (const client of server.clients) client.terminate();
    await new Promise(resolve => server.close(resolve));
  }
});

test('guest evaluation calls the provider without reading or writing storage', async () => {
  process.env.XFYUN_APP_ID = 'test';
  process.env.XFYUN_API_KEY = 'test';
  process.env.XFYUN_API_SECRET = 'test';
  const storage = new Proxy({}, { get() { throw new Error('guest evaluation accessed storage'); } });
  const { ReadingService } = require('../dist/server/modules/reading/reading.service');
  const service = new ReadingService(storage, storage);
  service.callProvider = async (text, audio) => {
    assert.equal(text, '天');
    assert.equal(audio.length, 16000);
    return { xml: '<read_chapter total_score="88" />', sid: 'guest-test' };
  };
  const result = await service.evaluateGuest({ text: '天', audio: Buffer.alloc(16000).toString('base64') });
  assert.deepEqual(result, { xml: '<read_chapter total_score="88" />', sid: 'guest-test' });
});
