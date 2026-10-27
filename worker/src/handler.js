// The Worker's request handling: CORS, the 5 minute edge cache with stale while revalidate, and the call to the FeedState Durable Object
// (state.js) that owns the upstream budget. Everything the platform provides (cache, clock) is passed in so the tests can fake it.

export const FRESH_MS = 5 * 60 * 1000; // served straight from the edge cache this long
export const STALE_MAX_MS = 60 * 60 * 1000; // up to here a stale copy is served at once while a refresh runs behind it
const RECHECK_MS = 30 * 1000; // a stale copy is not revalidated more often than this
const FEED_PATHS = new Set(['/', '/feed', '/feed.json', '/launches.json']);
const ORIGINS = ['https://astroradar.io', 'https://www.astroradar.io'];
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function allowedOrigin(origin, env) {
  if (!origin) return null;
  if (ORIGINS.includes(origin) || LOCAL.test(origin)) return origin;
  const extra = String((env && env.ALLOWED_ORIGINS) || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin) ? origin : null;
}

function corsHeaders(request, env) {
  const origin = allowedOrigin(request.headers.get('Origin'), env);
  const h = { Vary: 'Origin' };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function reply(request, status, body, headers) {
  return new Response(request.method === 'HEAD' ? null : body, { status, headers });
}

export async function handle(request, env, ctx, deps = {}) {
  const cache = deps.cache || caches.default;
  const now = deps.now || Date.now;
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return reply(request, 405, 'Method not allowed', { ...cors, Allow: 'GET, HEAD, OPTIONS' });
  }
  if (url.pathname === '/healthz') return reply(request, 200, '{"ok":true}', { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (!FEED_PATHS.has(url.pathname)) return reply(request, 404, 'Not found', cors);

  const key = new Request(new URL('/__feed', url.origin).toString());
  const stub = () => env.FEED_STATE.get(env.FEED_STATE.idFromName('feed'));

  // The feed as the browser gets it: the body, and how old the data is. A copy in the cache carries when it was fetched upstream
  // (X-Feed-Fetched) and when it was last checked (X-Feed-Checked).
  const out = (text, fetchedAt, status, extra = {}) => reply(request, 200, text, {
    ...cors, ...extra,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
    'X-Feed-Status': status, 'X-Feed-Generated': new Date(fetchedAt).toISOString(),
  });

  // ask the Durable Object for a refresh and keep what comes back in the edge cache
  async function refresh() {
    let r;
    try {
      const res = await stub().fetch('https://feed-state/refresh', { method: 'POST' });
      r = await res.json();
    } catch {
      return null;
    }
    if (!r || !r.feed) return null;
    const stale = r.status === 'stale';
    const text = JSON.stringify(stale ? { ...r.feed, stale: true } : r.feed);
    const stored = new Response(text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400',
      'X-Feed-Fetched': String(r.fetchedAt), 'X-Feed-Checked': String(now()), 'X-Feed-Status': stale ? 'stale' : 'ok' } });
    const put = cache.put(key, stored);
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
    return { text, fetchedAt: r.fetchedAt, status: stale ? 'stale' : r.status };
  }

  const hit = await cache.match(key);
  if (hit) {
    const fetchedAt = Number(hit.headers.get('X-Feed-Fetched'));
    const checkedAt = Number(hit.headers.get('X-Feed-Checked')) || fetchedAt;
    const age = now() - fetchedAt;
    const text = await hit.text();
    const hitStale = hit.headers.get('X-Feed-Status') === 'stale';
    if (age <= FRESH_MS && !hitStale) return out(text, fetchedAt, 'hit');
    if (age <= STALE_MAX_MS) {
      // stale while revalidate: answer now, refresh behind it (not more than every 30 seconds)
      if (now() - checkedAt > RECHECK_MS) {
        const work = refresh();
        if (ctx && ctx.waitUntil) ctx.waitUntil(work); else await work;
      }
      return out(text, fetchedAt, 'stale-while-revalidate');
    }
    const fresh = await refresh();
    if (fresh) return out(fresh.text, fresh.fetchedAt, fresh.status);
    return out(text, fetchedAt, 'stale'); // the last good data, even this old
  }

  const fresh = await refresh();
  if (fresh) return out(fresh.text, fresh.fetchedAt, fresh.status);
  return reply(request, 503, '{"error":"no launch data yet"}', { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '120' });
}
