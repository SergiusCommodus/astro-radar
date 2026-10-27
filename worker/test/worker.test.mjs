// The Worker with a fake upstream, cache and clock: success, failure, slow and changed data, HTTP 429 and the launches.json fallback,
// CORS, the call budget and the secret.
// Run: cd worker && npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../src/handler.js';
import { buildFeed } from '../src/feed.js';
import { FeedState, MAX_CALLS, MIN_INTERVAL_MS, parseRetryAfter } from '../src/state.js';

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
  const llCalls = () => calls.filter((c) => c.url.startsWith('https://ll.thespacedevs.com/')).length;
  assert.equal(llCalls(), 1);
  clock += 30 * 1000; // inside the wait after a failure: no second call
  assert.equal((await get('/')).status, 503);
  assert.equal(llCalls(), 1);
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
  env = makeEnv({ UPSTREAM_TIMEOUT_MS: '60', FALLBACK_TIMEOUT_MS: '60' });
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
        const llCalls = () => calls.filter((c) => c.url.startsWith('https://ll.thespacedevs.com/')).length;
        const before = llCalls();
        await get('/');
        if (llCalls() > before) stamps.push(clock);
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

// ---- HTTP 429 from Launch Library, the launches.json fallback, and recovery ----

const LL2 = 'https://ll.thespacedevs.com/';
const FALLBACK = 'https://astroradar.io/launches.json';
const ll2 = () => calls.filter((c) => c.url.startsWith(LL2));
const fallbackCalls = () => calls.filter((c) => c.url === FALLBACK);
const status429 = (retryAfter) => async () => new Response('{"detail":"Request was throttled."}', { status: 429, headers: retryAfter == null ? {} : { 'Retry-After': String(retryAfter) } });
const statusOf = async () => (await stateObj.fetch(new Request('https://x/status'))).json();

// the site's own launches.json as GitHub Actions built it five minutes before the clock starts
const fallbackFile = () => ({ ...buildFeed(RAW, new Date(T0)), generated: new Date(T0 - 5 * 60 * 1000).toISOString().replace(/\.\d+Z/, 'Z') });

// route by address: Launch Library gets `ll2Fn`, the fallback file gets `fileFn`
function installRoutes(ll2Fn, fileFn = async () => new Response(JSON.stringify(fallbackFile()), { status: 200 })) {
  installUpstream((url, init) => (url.startsWith(LL2) ? ll2Fn(url, init) : url === FALLBACK ? fileFn(url, init) : new Response('?', { status: 404 })));
}
const minutes = (n) => n * 60 * 1000;
const fresh = () => { calls = []; cache = makeCache(); env = makeEnv(); clock = T0; };

test('parseRetryAfter reads seconds and dates and refuses the rest', () => {
  assert.equal(parseRetryAfter('1407', T0), 1407000);
  assert.equal(parseRetryAfter(' 30 ', T0), 30000);
  assert.equal(parseRetryAfter('0', T0), 0);
  assert.equal(parseRetryAfter(new Date(T0 + 90000).toUTCString(), T0), 90000);
  assert.equal(parseRetryAfter(new Date(T0 - 90000).toUTCString(), T0), 0, 'a date in the past is no wait');
  for (const bad of [null, undefined, '', 'soon', '-5', '1.5']) assert.equal(parseRetryAfter(bad, T0), null, String(bad));
});

test('429 with Retry-After: the fallback is served stale, Launch Library is not called again until the time has passed, then it recovers', async () => {
  installRoutes(status429(600));
  const first = await get('/', { origin: 'https://astroradar.io' });
  assert.equal(first.status, 200, 'not a 503');
  assert.equal(first.headers.get('X-Feed-Source'), 'fallback');
  assert.equal(first.headers.get('Access-Control-Allow-Origin'), 'https://astroradar.io');
  const body = await first.json();
  assert.equal(body.stale, true);
  assert.equal(body.generated, '2026-10-27T18:42:06Z', 'the fallback keeps its own generated time');
  assert.ok(body.launches.length > 0 && body.recent.length > 0);
  assert.equal(ll2().length, 1);
  assert.equal((await statusOf()).callsLastHour, 0, 'a throttled attempt is not counted');

  for (const at of [40, 150, 300, 599]) { // visitors keep coming during the wait: never another call to Launch Library
    clock = T0 + at * 1000;
    const res = await get('/');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).stale, true);
  }
  assert.equal(ll2().length, 1, 'nothing upstream before the 600 seconds have passed');

  installRoutes(okRaw()); // the throttle is over
  let live = null;
  for (let i = 0; i < 4 && !live; i++) { // the first visitor after the wait gets the copy at once, the refresh runs behind it
    clock = T0 + 601 * 1000 + i * 35 * 1000;
    const next = await (await get('/')).json();
    if (!next.stale) live = next;
  }
  assert.ok(live, 'recovered');
  assert.equal(ll2().length, 2);
  assert.ok(Date.parse(live.generated) > T0, 'live data now, newer than the fallback copy');
  assert.equal((await get('/')).headers.get('X-Feed-Source'), 'upstream');
});

test('429 without Retry-After: no call for 15 minutes, then one', async () => {
  installRoutes(status429(null));
  assert.equal((await get('/')).status, 200);
  assert.equal(ll2().length, 1);
  for (const m of [1, 2, 5, 10, 14.9]) {
    clock = T0 + minutes(m);
    assert.equal((await get('/')).status, 200);
  }
  assert.equal(ll2().length, 1, 'still waiting at 14 minutes 54 seconds');
  clock = T0 + minutes(15) + 40000; // the page asks about every minute; a stale copy is rechecked at most every 30 seconds
  await get('/');
  assert.equal(ll2().length, 2, 'asks again once the 15 minutes are over');
});

test('Retry-After as a date, an unreadable one, and an absurd one', async () => {
  installRoutes(async () => new Response('{}', { status: 429, headers: { 'Retry-After': new Date(T0 + minutes(40)).toUTCString() } }));
  await get('/');
  clock = T0 + minutes(39);
  await get('/');
  assert.equal(ll2().length, 1);
  clock = T0 + minutes(40) + 40000;
  await get('/');
  assert.equal(ll2().length, 2, 'the date is honoured, even though it is longer than 15 minutes');

  fresh();
  installRoutes(status429('soon'));
  await get('/');
  clock = T0 + minutes(14);
  await get('/');
  assert.equal(ll2().length, 1, 'an unreadable value counts as no header: 15 minutes');
  clock = T0 + minutes(15) + 40000;
  await get('/');
  assert.equal(ll2().length, 2);

  fresh();
  installRoutes(status429(999999999));
  await get('/');
  clock = T0 + 5.9 * 3600 * 1000;
  await get('/');
  assert.equal(ll2().length, 1);
  clock = T0 + 6.1 * 3600 * 1000;
  await get('/');
  assert.equal(ll2().length, 2, 'a huge Retry-After is capped at 6 hours');
});

test('cold start with no cache: any upstream failure serves the fallback marked stale; with the fallback down too it is a 503', async () => {
  const failures = {
    'HTTP 500': async () => new Response('boom', { status: 500 }),
    'HTTP 503': async () => new Response('down', { status: 503 }),
    'network error': async () => { throw new Error('network down'); },
    junk: async () => new Response('not json', { status: 200 }),
    'no launches': async () => new Response('{"results":[]}', { status: 200 }),
  };
  for (const [name, fn] of Object.entries(failures)) {
    fresh();
    installRoutes(fn);
    const res = await get('/');
    assert.equal(res.status, 200, name);
    const feed = await res.json();
    assert.equal(feed.stale, true, name);
    assert.ok(feed.launches.length > 0, name);
    assert.equal(res.headers.get('X-Feed-Source'), 'fallback', name);
  }
  const brokenFiles = {
    'HTTP 404': async () => new Response('nope', { status: 404 }),
    junk: async () => new Response('<html>', { status: 200 }),
    'no launches': async () => new Response('{"launches":[]}', { status: 200 }),
    'launches not a list': async () => new Response('{"launches":5}', { status: 200 }),
    'launches without times': async () => new Response('{"launches":[{"id":"x"}]}', { status: 200 }),
    'network error': async () => { throw new Error('offline'); },
  };
  for (const [name, fn] of Object.entries(brokenFiles)) {
    fresh();
    installRoutes(status429(null), fn);
    const res = await get('/', { origin: 'https://astroradar.io' });
    assert.equal(res.status, 503, name);
    assert.ok(res.headers.get('Retry-After'), name);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://astroradar.io', name);
  }
});

test('a fallback file with no usable time is served with the time it was fetched', async () => {
  installRoutes(status429(null), async () => new Response(JSON.stringify({ ...fallbackFile(), generated: 'yesterday-ish' }), { status: 200 }));
  const res = await get('/');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Feed-Generated'), new Date(T0).toISOString());
});

test('only one upstream attempt at a time: 25 visitors on a cold start make one call to Launch Library and one to the fallback', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  installRoutes(async () => { await gate; return new Response('{}', { status: 429 }); });
  const all = Promise.all(Array.from({ length: 25 }, () => get('/')));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(ll2().length, 1, 'the others wait for the attempt in flight');
  release();
  const done = await all;
  assert.ok(done.every((r) => r.status === 200));
  assert.equal(ll2().length, 1);
  assert.equal(fallbackCalls().length, 1);
});

test('throttled attempts never use up the budget, so recovery is not blocked', async () => {
  installRoutes(status429(1)); // a 1 second wait: as many attempts as the visitors can cause
  for (let i = 0; i < 360; i++) { // an hour of visitors every 10 seconds
    await get('/');
    clock += 10 * 1000;
  }
  assert.ok(ll2().length > MAX_CALLS * 2, `${ll2().length} throttled attempts, far more than the budget of ${MAX_CALLS}`);
  assert.equal((await statusOf()).callsLastHour, 0);
  installRoutes(okRaw()); // the throttle is over: the very next attempt must be allowed
  const before = ll2().length;
  let live = null;
  for (let i = 0; i < 6 && !live; i++) {
    const body = await (await get('/')).json();
    clock += 35 * 1000;
    if (!body.stale) live = body;
  }
  assert.ok(live, 'live data came back within a few visitors, not an hour later');
  assert.ok(ll2().length > before);
});

test('other failures back off 2, 4, 8 then 15 minutes, and stay inside the budget', async () => {
  installRoutes(async () => new Response('boom', { status: 502 }));
  for (let i = 0; i < 6 * 60 * 3; i++) { // three hours of visitors every 10 seconds
    await get('/');
    clock += 10 * 1000;
  }
  const at = ll2().map((c) => c.at);
  const gaps = at.slice(1, 5).map((t, i) => (t - at[i]) / 60000);
  assert.deepEqual(gaps.map(Math.round), [2, 4, 8, 15]);
  for (const g of at.slice(5).map((t, i) => (t - at[i + 4]) / 60000)) assert.ok(g >= 15 && g < 16, `${g}`);
  for (const s of at) assert.ok(at.filter((t) => t > s - 3600 * 1000 && t <= s).length <= 7, 'failures alone stay under the budget of ' + MAX_CALLS);
  assert.ok(fallbackCalls().length <= 3 * 30, 'the fallback file is not asked for more than every 2 minutes');
});

test('after good data a 429 keeps serving that data, not the fallback', async () => {
  installRoutes(okRaw());
  assert.equal((await get('/')).status, 200);
  installRoutes(status429(null));
  clock += minutes(7);
  await get('/'); // stale while revalidate: the refresh fails behind it
  clock += 40 * 1000;
  const res = await get('/');
  const feed = await res.json();
  assert.equal(feed.stale, true);
  assert.equal(feed.generated, '2026-10-27T18:47:06Z', 'the last Launch Library data, with its own time');
  assert.equal(res.headers.get('X-Feed-Source'), 'upstream');
  assert.equal(fallbackCalls().length, 0);
});

test('a fallback copy is replaced by Launch Library data as soon as that works, and is not used again over it', async () => {
  installRoutes(status429(120));
  await get('/');
  assert.equal((await statusOf()).source, 'fallback');
  installRoutes(okRaw());
  clock += 130 * 1000;
  await get('/');
  clock += 40 * 1000;
  await get('/');
  assert.equal((await statusOf()).source, 'upstream');
  calls = [];
  installRoutes(status429(null));
  clock += minutes(7);
  await get('/');
  assert.equal(fallbackCalls().length, 0, 'with Launch Library data in hand the fallback is not used');
});
