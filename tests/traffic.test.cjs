'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { protect, take } = require('../lib/abuse-guard.cjs');
const traffic = require('../api/traffic.js');

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(n) { this.statusCode = n; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    end() { return this; },
  };
}
function mockReq(query, ip = '203.0.113.4', method = 'GET') {
  return { method, query, headers: { 'x-forwarded-for': ip, 'sec-fetch-site': 'same-origin' } };
}
test('fixed window counter stops excess requests', () => {
  assert.equal(take('test-fixed', 2, 60_000, 181_000).allowed, true);
  assert.equal(take('test-fixed', 2, 60_000, 181_001).allowed, true);
  assert.equal(take('test-fixed', 2, 60_000, 181_002).allowed, false);
  assert.equal(take('test-fixed', 2, 60_000, 241_000).allowed, true);
});
test('API blocks hotlinking in browsers', () => {
  const req = mockReq({}); req.headers['sec-fetch-site'] = 'cross-site';
  const res = mockRes();
  assert.equal(protect(req, res, { name: 'test-cross', perMinute: 10 }).ok, false);
  assert.equal(res.statusCode, 403);
});
test('request-level rate limiting returns HTTP 429', () => {
  const req = mockReq({}, '198.51.100.88');
  const one = mockRes(), two = mockRes();
  assert.equal(protect(req, one, { name: 'test-429', perMinute: 1 }).ok, true);
  assert.equal(protect(req, two, { name: 'test-429', perMinute: 1 }).ok, false);
  assert.equal(two.statusCode, 429);
  assert.ok(Number(two.headers['retry-after']) >= 1);
});
test('traffic endpoint fails closed without secret', async () => {
  const before = process.env.TOMTOM_API_KEY;
  delete process.env.TOMTOM_API_KEY;
  const res = mockRes();
  await traffic(mockReq({ z: '12', x: '2308', y: '1574' }), res);
  assert.equal(res.statusCode, 503);
  if (before !== undefined) process.env.TOMTOM_API_KEY = before;
});
test('traffic rejects invalid coords without fetching provider', async () => {
  const before = process.env.TOMTOM_API_KEY;
  process.env.TOMTOM_API_KEY = 'not-a-real-key';
  const res = mockRes();
  await traffic(mockReq({ z: '12', x: '-1', y: '10' }), res);
  assert.equal(res.statusCode, 400);
  if (before === undefined) delete process.env.TOMTOM_API_KEY;
  else process.env.TOMTOM_API_KEY = before;
});
test('valid TomTom tile is proxied, cached and never exposes key', async () => {
  const before = process.env.TOMTOM_API_KEY;
  const oldFetch = global.fetch;
  const key = 'temporary-test-key-do-not-use';
  process.env.TOMTOM_API_KEY = key;
  let calls = 0;
  global.fetch = async (url, args) => {
    calls++;
    assert.ok(!url.includes(key));
    assert.equal(args.headers['TomTom-Api-Key'], key);
    return { ok: true, headers: new Map([['content-type','image/png']]), arrayBuffer: async () => Uint8Array.of(137,80,78,71).buffer };
  };
  try {
    const req = mockReq({ z: '12', x: '2309', y: '1574', theme: 'light' }, '198.51.100.221');
    const r1 = mockRes(), r2 = mockRes();
    await traffic(req, r1); await traffic(req, r2);
    assert.equal(r1.statusCode, 200);
    assert.equal(r2.statusCode, 200);
    assert.equal(calls, 1);
    assert.equal(r1.headers['content-type'], 'image/png');
    assert.ok(!JSON.stringify(r1.headers).includes(key));
    assert.ok(!JSON.stringify(r1.body).includes(key));
  } finally { global.fetch = oldFetch; if(before===undefined)delete process.env.TOMTOM_API_KEY;else process.env.TOMTOM_API_KEY=before; }
});
