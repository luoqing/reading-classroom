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
    const result = await service.callProvider('xfyun', '天', Buffer.alloc(16000));
    assert.equal(result.rawResult, xml);
    assert.equal(result.provider, 'xfyun');
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

test('Tencent provider signs the websocket request and uploads one PCM recording', async () => {
  const server = new WS.WebSocketServer({ port: 0 });
  await once(server, 'listening');
  const port = server.address().port;
  const serviceWsPath = require.resolve('ws', { paths: [path.join(__dirname, '../dist/server/modules/reading')] });
  require(serviceWsPath);
  const cached = require.cache[serviceWsPath].exports;
  let requestUrl;
  require.cache[serviceWsPath].exports = class extends WS {
    constructor(url) {
      requestUrl = new URL(url);
      super(`ws://127.0.0.1:${port}`);
    }
  };
  process.env.TENCENT_SOE_APP_ID = '1300000000';
  process.env.TENCENT_SOE_SECRET_ID = 'test-secret-id';
  process.env.TENCENT_SOE_SECRET_KEY = 'test-secret-key';
  const frames = [];
  const providerPath = require.resolve('../dist/server/modules/reading/tencent-soe.provider.js');
  delete require.cache[providerPath];
  server.on('connection', socket => {
    socket.send(JSON.stringify({ code: 0, message: 'success', voice_id: 'tencent-protocol-test' }));
    socket.on('message', (raw, isBinary) => {
      frames.push({ raw, isBinary });
      if (!isBinary && JSON.parse(raw.toString()).type === 'end') {
        socket.send(JSON.stringify({
          code: 0,
          message: 'success',
          voice_id: 'tencent-protocol-test',
          result: { SuggestedScore: 86, Words: [] },
          final: 1,
        }));
      }
    });
  });
  try {
    const { callTencentSoe } = require(providerPath);
    const pcm = Buffer.alloc(32000, 1);
    const result = await callTencentSoe('天气凉了', pcm);
    assert.equal(requestUrl.hostname, 'soe.cloud.tencent.com');
    assert.equal(requestUrl.pathname, '/soe/api/1300000000');
    assert.equal(requestUrl.searchParams.get('eval_mode'), '2');
    assert.equal(requestUrl.searchParams.get('rec_mode'), '1');
    assert.equal(requestUrl.searchParams.get('voice_format'), '0');
    assert.ok(requestUrl.searchParams.get('signature'));
    assert.equal(frames.length, 2);
    assert.equal(frames[0].isBinary, true);
    assert.equal(frames[0].raw.length, pcm.length);
    assert.deepEqual(JSON.parse(frames[1].raw.toString()), { type: 'end' });
    assert.equal(JSON.parse(result.rawResult).SuggestedScore, 86);
    assert.equal(result.sid, 'tencent-protocol-test');
  } finally {
    delete require.cache[providerPath];
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
  service.callProvider = async (provider, text, audio) => {
    assert.equal(provider, 'xfyun');
    assert.equal(text, '天');
    assert.equal(audio.length, 16000);
    return { provider, rawResult: '<read_chapter total_score="88" />', sid: 'guest-test' };
  };
  const result = await service.evaluateGuest({
    text: '天',
    audio: Buffer.alloc(16000).toString('base64'),
    provider: 'xfyun',
  });
  assert.deepEqual(result, {
    evaluations: [{
      provider: 'xfyun',
      rawResult: '<read_chapter total_score="88" />',
      sid: 'guest-test',
    }],
    errors: [],
  });
});

test('dual guest evaluation reuses the same PCM for both providers', async () => {
  process.env.XFYUN_APP_ID = 'test';
  process.env.XFYUN_API_KEY = 'test';
  process.env.XFYUN_API_SECRET = 'test';
  process.env.TENCENT_SOE_APP_ID = 'test';
  process.env.TENCENT_SOE_SECRET_ID = 'test';
  process.env.TENCENT_SOE_SECRET_KEY = 'test';
  const storage = new Proxy({}, { get() { throw new Error('guest evaluation accessed storage'); } });
  const { ReadingService } = require('../dist/server/modules/reading/reading.service');
  const service = new ReadingService(storage, storage);
  const calls = [];
  service.callProvider = async (provider, text, audio) => {
    calls.push({ provider, text, audio });
    return { provider, rawResult: provider === 'xfyun' ? '<read_chapter />' : '{"Words":[]}' };
  };
  const pcm = Buffer.alloc(16000);
  const result = await service.evaluateGuest({
    text: '天',
    audio: pcm.toString('base64'),
    provider: 'both',
  });
  assert.deepEqual(calls.map(call => call.provider), ['xfyun', 'tencent']);
  assert.ok(calls.every(call => call.audio.equals(pcm)));
  assert.deepEqual(result.evaluations.map(item => item.provider), ['xfyun', 'tencent']);
});
