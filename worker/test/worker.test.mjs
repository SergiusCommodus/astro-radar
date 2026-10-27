// The Worker with a fake upstream, cache and clock: success, failure, slow and changed data, CORS, the call budget and the secret.
// Run: cd worker && npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../src/handler.js';
import { FeedState, MAX_CALLS, MIN_INTERVAL_MS } from '../src/state.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = JSON.parse(readFileSync(join(root, 'tests/raw_ll2_window.json'), 'utf-8'));
const T0 = Date.parse('2026-10-27T18:47:06Z');
const realNow = Date.now;
const realFetch = globalThis.fetch;

let clock, upstream, calls, cache, env, stateObj, ctxWaits;

// the upstream: a function (url, init) -> Response; calls records every request
function installUpstream(fn) {
  upstream = fn;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, at: clock });
    return upstream(String(url), init);
  };
}
const okRaw = (raw = RAW) => async () => new Response(JSON.stringify(raw), { status: 200, headers: { 'Content-Type': 'application/json' } });

function makeCache() {
  const m = new Map();
  return {
    async match(req) { const r = m.get(req.url); return r ? r.clone() : undefined; },
    async put(req, res) { m.set(req.url, res); },
    size: () => m.size,
  };
}

function makeEnv(extra = {}) {
  const store = new Map();
  stateObj = new FeedState({ storage: { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)); } } }, extra);
  return {
    ...extra,
    FEED_STATE: { idFromName: () => 'feed', get: () => ({ fetch: (url, init) => stateObj.fetch(new Request(url, init)) }) },
  };
}

async function get(path = '/', { origin, method = 'GET', headers = {} } = {}) {
  ctxWaits = [];
  const ctx = { waitUntil: (p) => ctxWaits.push(p) };
  const req = new Request('https://feed.example' + path, { method, headers: { ...(origin ? { Origin: origin } : {}), ...headers } });
  const res = await handle(req, env, ctx, { cache, now: () => clock });
  await Promise.all(ctxWaits);
  return res;
}

beforeEach(() => {
  clock = T0;
  Date.now = () => clock;
  calls = [];
  cache = makeCache();
  env = makeEnv();
  installUpstream(okRaw());
});

test.after(() => { Date.now = realNow; globalThis.fetch = realFetch; });

test('success: the feed has launches and recent launches, and a second request is served from the cache', async () => {
  const res = await get('/', { origin: 'https://astroradar.io' });
  assert.equal(res.status, 200);
  const feed = await res.json();
  assert.ok(feed.launches.length >= 5 && feed.recent.length >= 5);
  assert.equal(feed.generated, '2026-10-27T18:47:06Z');
  assert.equal(feed.stale, undefined);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://astroradar.io');
  assert.match(res.headers.get('Cache-Control'), /stale-while-revalidate/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/ll\.thespacedevs\.com\/2\.2\.0\/launch\/\?limit=100&mode=detailed&ordering=net&net__gte=2026-10-20T18%3A47%3A06Z&net__lte=2026-11-26T18%3A47%3A06Z$/);

  clock += 4 * 60 * 1000;
  const again = await get('/');
  assert.equal(again.headers.get('X-Feed-Status'), 'hit');
  assert.equal(calls.length, 1, 'inside 5 minutes nothing goes upstream');
});

test('CORS: astroradar.io and localhost may read, others get no allow header, preflight answers', async () => {
  for (const o of ['https://astroradar.io', 'https://www.astroradar.io', 'http://localhost:8000', 'http://127.0.0.1:5500', 'http://localhost']) {
    assert.equal((await get('/', { origin: o })).headers.get('Access-Control-Allow-Origin'), o);
  }
  for (const o of ['https://evil.example', 'https://astroradar.io.evil.example', 'http://localhost.evil.example']) {
    assert.equal((await get('/', { origin: o })).headers.get('Access-Control-Allow-Origin'), null, o);
  }
  assert.equal((await get('/')).headers.get('Access-Control-Allow-Origin'), null);
  const pre = await get('/', { method: 'OPTIONS', origin: 'https://astroradar.io' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'https://astroradar.io');
  assert.match(pre.headers.get('Access-Control-Allow-Methods'), /GET/);
  env = makeEnv({ ALLOWED_ORIGINS: 'https://preview.example, https://other.example' });
  assert.equal((await get('/', { origin: 'https://preview.example' })).headers.get('Access-Control-Allow-Origin'), 'https://preview.example');
});

test('routes and methods', async () => {
  assert.equal((await get('/nope')).status, 404);
  assert.equal((await get('/', { method: 'POST' })).status, 405);
  assert.equal((await get('/healthz')).status, 200);
  assert.equal(calls.length, 0, 'health and errors never go upstream');
  const head = await get('/feed.json', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('failure with no data yet: 503 and a retry hint, then it recovers', async () => {
  installUpstream(async () => new Response('boom', { status: 500 }));
  const res = await get('/', { origin: 'https://astroradar.io' });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://astroradar.io');
  assert.ok(res.headers.get('Retry-After'));
  assert.equal(calls.length, 1);
  clock += 30 * 1000; // inside the wait after a failure: no second call
  assert.equal((await get('/')).status, 503);
  assert.equal(calls.length, 1);
  installUpstream(okRaw());
  clock += 3 * 60 * 1000;
  const ok = await get('/');
  assert.equal(ok.status, 200);
  assert.ok((await ok.json()).launches.length > 0);
});

test('failure after good data: the last good feed is served, marked stale, with its own generated time', async () => {
  assert.equal((await get('/')).status, 200);
  installUpstream(async () => { throw new Error('network down'); });
  clock += 7 * 60 * 1000; // past the cache and the minimum interval
  const stale = await get('/'); // stale while revalidate: served at once, the refresh fails behind it
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get('X-Feed-Status'), 'stale-while-revalidate');
  assert.equal((await stale.json()).generated, '2026-10-27T18:47:06Z');
  clock += 40 * 1000;
  const after = await get('/');
  const feed = await after.json();
  assert.equal(after.status, 200);
  assert.equal(feed.stale, true);
  assert.equal(feed.generated, '2026-10-27T18:47:06Z', 'generated stays the time of the last good fetch');
  assert.ok(feed.launches.length > 0);
  // even a copy older than an hour is better than nothing
  clock += 3 * 3600 * 1000;
  const old = await get('/');
  assert.equal(old.status, 200);
  assert.ok((await old.json()).launches.length > 0);
});

test('upstream answers with junk: treated as a failure, last good data stays', async () => {
  assert.equal((await get('/')).status, 200);
  for (const body of ['not json', '{"count":0}', '{"results":[]}']) {
    installUpstream(async () => new Response(body, { status: 200 }));
    clock += 7 * 60 * 1000;
    await get('/');
    clock += 3 * 60 * 1000;
    const res = await get('/');
    assert.equal(res.status, 200, body);
    assert.ok((await res.json()).launches.length > 0, body);
  }
});

test('slow upstream: the call is cut off and reported as a failure', async () => {
  env = makeEnv({ UPSTREAM_TIMEOUT_MS: '60' });
  installUpstream((url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  }));
  const t0 = performance.now();
  const res = await get('/');
  assert.equal(res.status, 503);
  assert.ok(performance.now() - t0 < 2000, 'did not wait for the slow upstream');
  assert.match((await (await stateObj.fetch(new Request('https://x/status'))).json()).error, /timed out|aborted|Timeout/i);
});

test('slow upstream behind a stale copy: the visitor still gets the copy at once', async () => {
  assert.equal((await get('/')).status, 200);
  env = Object.assign(env, {});
  stateObj.env = { UPSTREAM_TIMEOUT_MS: '300' };
  installUpstream((url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))));
  clock += 7 * 60 * 1000;
  const t0 = performance.now();
  ctxWaits = [];
  const req = new Request('https://feed.example/');
  const res = await handle(req, env, { waitUntil: (p) => ctxWaits.push(p) }, { cache, now: () => clock });
  assert.ok(performance.now() - t0 < 200, 'answered before the refresh finished');
  assert.equal(res.headers.get('X-Feed-Status'), 'stale-while-revalidate');
  assert.ok((await res.json()).launches.length > 0);
  await Promise.all(ctxWaits);
});

test('changed data: a later refresh shows the new status and time', async () => {
  const first = await (await get('/')).json();
  const target = first.launches.find((l) => l.st === 'go');
  assert.ok(target);
  const changed = structuredClone(RAW);
  const item = changed.results.find((r) => r.id === target.id);
  item.status.abbrev = 'Hold';
  item.net = '2026-10-31T09:00:00Z';
  installUpstream(okRaw(changed));
  clock += 7 * 60 * 1000;
  const swr = await get('/'); // the old copy at once, the refresh behind it
  assert.equal((await swr.json()).launches.find((l) => l.id === target.id).st, 'go');
  clock += 40 * 1000;
  const next = await (await get('/')).json();
  const now = next.launches.find((l) => l.id === target.id);
  assert.equal(now.st, 'hold');
  assert.equal(now.utc, '2026-10-31T09:00:00Z');
  assert.equal(calls.length, 2);
});

test('many visitors at once on a cold cache make one upstream call', async () => {
  const all = await Promise.all(Array.from({ length: 25 }, () => get('/')));
  assert.ok(all.every((r) => r.status === 200));
  assert.equal(calls.length, 1);
});

test('the budget: never more than 10 upstream calls in any rolling hour, even when everything fails and visitors keep coming', async () => {
  for (const mode of ['failing', 'working']) {
    clock = T0;
    calls = [];
    cache = makeCache();
    env = makeEnv();
    installUpstream(mode === 'failing' ? async () => new Response('no', { status: 503 }) : okRaw());
    const stamps = [];
    for (let minute = 0; minute < 8 * 60; minute++) { // eight hours, a visitor every 10 seconds
      for (let k = 0; k < 6; k++) {
        const before = calls.length;
        await get('/');
        if (calls.length > before) stamps.push(clock);
        clock += 10 * 1000;
      }
    }
    assert.ok(stamps.length > 0);
    for (const s of stamps) {
      const inHour = stamps.filter((t) => t > s - 3600 * 1000 && t <= s).length;
      assert.ok(inHour <= MAX_CALLS, `${mode}: ${inHour} calls in the hour ending ${new Date(s).toISOString()}`);
    }
    if (mode === 'working') assert.ok(stamps.length >= 8 * 9, 'and it still refreshes about every 6 minutes');
  }
});

test('the budget also holds for two page refreshes', async () => {
  const page1 = { ...RAW, next: 'https://ll.thespacedevs.com/2.2.0/launch/?offset=100' };
  let n = 0;
  installUpstream(async () => new Response(JSON.stringify(n++ % 2 === 0 ? page1 : RAW), { status: 200 }));
  const stamps = [];
  for (let i = 0; i < 6 * 60 * 6; i++) {
    const before = calls.length;
    await get('/');
    for (let k = before; k < calls.length; k++) stamps.push(calls[k].at);
    clock += 10 * 1000;
  }
  for (const s of stamps) assert.ok(stamps.filter((t) => t > s - 3600 * 1000 && t <= s).length <= MAX_CALLS);
  assert.ok(calls.some((c) => c.url.includes('offset=100')), 'followed the next page');
});

test('a next page that is not Launch Library is never followed', async () => {
  installUpstream(async () => new Response(JSON.stringify({ ...RAW, next: 'https://evil.example/steal' }), { status: 200 }));
  assert.equal((await get('/')).status, 200);
  assert.equal(calls.length, 1);
});

test('the optional token comes from a Worker secret and is sent only upstream', async () => {
  env = makeEnv({ LL2_TOKEN: 'secret-token-123' });
  const res = await get('/');
  assert.equal(calls[0].init.headers.Authorization, 'Token secret-token-123');
  assert.ok(!JSON.stringify([...res.headers]).includes('secret-token-123'));
  assert.ok(!(await res.text()).includes('secret-token-123'));
  calls = [];
  env = makeEnv();
  cache = makeCache();
  await get('/');
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test('the minimum interval keeps ten refreshes an hour at most', () => {
  assert.ok(3600 * 1000 / MIN_INTERVAL_MS <= MAX_CALLS);
});
