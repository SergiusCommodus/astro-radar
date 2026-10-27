// The one place that talks to Launch Library 2. A Durable Object is a single global instance, so the call budget holds no matter how
// many edge locations ask: at most MAX_CALLS upstream requests in any rolling hour, one refresh at a time, and the last good feed
// kept (and served) whenever the upstream fails. Launch Library is not asked again before a Retry-After or a failure backoff has
// passed, and until it has given a feed the site's own launches.json (GitHub Actions) is served, marked stale.
import { MAX_PAGES, buildFeed, upstreamUrl } from './feed.js';

export const MIN_INTERVAL_MS = 6 * 60 * 1000; // 10 refreshes an hour at most, so one page each stays inside the budget
export const MAX_CALLS = 10; // upstream requests in any rolling hour (Launch Library allows 15 to anonymous callers)
export const RETRY_AFTER_FAIL_MS = 2 * 60 * 1000; // wait after the first failed refresh; it doubles with each failure in a row
export const MAX_FAIL_BACKOFF_MS = 15 * 60 * 1000; // ... up to here, so failures alone stay well under MAX_CALLS an hour
export const THROTTLE_DEFAULT_MS = 15 * 60 * 1000; // HTTP 429 without a Retry-After header: no new call for this long
export const THROTTLE_MAX_MS = 6 * 3600 * 1000; // a longer Retry-After is treated as this
export const UPSTREAM_TIMEOUT_MS = 8000;
export const FALLBACK_URL = 'https://astroradar.io/launches.json'; // the GitHub Actions feed
export const FALLBACK_TIMEOUT_MS = 5000;
export const FALLBACK_EVERY_MS = 2 * 60 * 1000; // the fallback file is not asked for more often than this
const HOUR = 3600 * 1000;
const UA = 'astro-radar-feed (github.com/SergiusCommodus/astro-radar)';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Retry-After is a number of seconds or an HTTP date; returns milliseconds from now, or null when absent or unreadable
export function parseRetryAfter(value, now) {
  if (value == null) return null;
  const v = String(value).trim();
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  if (!/[A-Za-z]/.test(v)) return null; // an HTTP date has day and month names; Date.parse would take '-5' or '1.5' for a date
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

class UpstreamError extends Error {
  constructor(message, status, retryAfterMs) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class FeedState {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.inflight = null;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/status') {
      const st = (await this.ctx.storage.get('state')) || {};
      const now = Date.now();
      return json({ fetchedAt: st.fetchedAt || null, failedAt: st.failedAt || null, error: st.error || null,
        retryAt: st.retryAt || null, source: st.feed ? (st.source || 'upstream') : null,
        callsLastHour: (st.calls || []).filter((t) => now - t < HOUR).length, budget: MAX_CALLS });
    }
    const out = await this.refresh();
    return json(out, out.feed ? 200 : 503);
  }

  // concurrent requests share one refresh, so there is never more than one attempt at a time
  refresh() {
    if (!this.inflight) this.inflight = this.run().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  async run() {
    const now = Date.now();
    const st = (await this.ctx.storage.get('state')) || {};
    st.calls = (st.calls || []).filter((t) => now - t < HOUR);
    const have = !!st.feed && st.source !== 'fallback'; // a feed that came from Launch Library
    const reply = (status, reason) => ({ status, reason: reason || null, feed: st.feed || null, fetchedAt: st.fetchedAt || null,
      error: st.error || null, source: st.feed ? (st.source || 'upstream') : null });
    if (have && now - st.fetchedAt < MIN_INTERVAL_MS) return reply('cached');
    let blocked = null;
    if (st.retryAt && now < st.retryAt) blocked = 'retry-wait';
    else if (st.calls.length >= MAX_CALLS) blocked = 'budget';
    if (!blocked) {
      try {
        await this.fetchUpstream(st, now);
        return reply('fresh');
      } catch (err) {
        this.recordFailure(st, err);
        await this.ctx.storage.put('state', st);
        blocked = 'upstream-failed';
      }
    }
    if (!have) await this.fetchFallback(st); // nothing from Launch Library yet: the site's own copy is better than a 503
    return reply('stale', blocked);
  }

  async fetchUpstream(st, now) {
    const results = [];
    let url = upstreamUrl(new Date(now));
    for (let page = 0; page < MAX_PAGES; page++) {
      if (st.calls.length >= MAX_CALLS) break; // keep what the earlier pages gave
      const stamp = Date.now();
      st.calls.push(stamp);
      await this.ctx.storage.put('state', st); // counted before the request goes out, so a crash cannot hide a call
      const headers = { 'User-Agent': UA, Accept: 'application/json' };
      if (this.env.LL2_TOKEN) headers.Authorization = `Token ${this.env.LL2_TOKEN}`; // optional, from a Worker secret
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(Number(this.env.UPSTREAM_TIMEOUT_MS) || UPSTREAM_TIMEOUT_MS) });
      if (res.status === 429) {
        // Launch Library refused it before counting it, so it does not count against our budget either: a throttled attempt must
        // never be what keeps us from calling again once the wait is over
        const i = st.calls.indexOf(stamp);
        if (i >= 0) st.calls.splice(i, 1);
        throw new UpstreamError('upstream answered 429', 429, parseRetryAfter(res.headers.get('Retry-After'), Date.now()));
      }
      if (!res.ok) throw new UpstreamError(`upstream answered ${res.status}`, res.status, null);
      const body = await res.json();
      if (!body || !Array.isArray(body.results)) throw new UpstreamError('upstream sent no results', 0, null);
      results.push(...body.results);
      url = body.next;
      if (!url || !url.startsWith('https://ll.thespacedevs.com/')) break;
    }
    const feed = buildFeed({ results }, new Date(now));
    if (!feed.launches.length) throw new UpstreamError('feed had no usable launches', 0, null);
    st.feed = feed;
    st.fetchedAt = now;
    st.source = 'upstream';
    st.failedAt = null;
    st.retryAt = null;
    st.fails = 0;
    st.error = null;
    await this.ctx.storage.put('state', st);
  }

  // When the next call is allowed: a 429 waits for its Retry-After (15 minutes when it has none); any other failure waits 2
  // minutes, doubling with each failure in a row up to 15 minutes.
  recordFailure(st, err) {
    const at = Date.now();
    st.failedAt = at;
    st.error = String((err && err.message) || err).slice(0, 200);
    if (err && err.status === 429) {
      const wait = err.retryAfterMs == null ? THROTTLE_DEFAULT_MS : Math.min(err.retryAfterMs, THROTTLE_MAX_MS);
      st.retryAt = at + wait;
    } else {
      st.fails = (st.fails || 0) + 1;
      st.retryAt = at + Math.min(RETRY_AFTER_FAIL_MS * 2 ** (st.fails - 1), MAX_FAIL_BACKOFF_MS);
    }
  }

  // The site's own launches.json (built every 30 minutes by GitHub Actions). Used only while there is no feed from Launch Library;
  // if it fails too, nothing changes and the caller answers 503.
  async fetchFallback(st) {
    const at = Date.now();
    if (st.fallbackAt && at - st.fallbackAt < FALLBACK_EVERY_MS) return;
    st.fallbackAt = at;
    try {
      const res = await fetch(this.env.FALLBACK_URL || FALLBACK_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(Number(this.env.FALLBACK_TIMEOUT_MS) || FALLBACK_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`fallback answered ${res.status}`);
      const body = await res.json();
      if (!body || !Array.isArray(body.launches) || !body.launches.length || !body.launches.every((l) => l && typeof l.utc === 'string')) {
        throw new Error('fallback has no launches');
      }
      const made = Date.parse(body.generated);
      st.feed = body;
      st.fetchedAt = Number.isNaN(made) ? at : Math.min(made, at); // its own time, so it reads as the age it really has
      st.source = 'fallback';
      st.fallbackError = null;
    } catch (err) {
      st.fallbackError = String((err && err.message) || err).slice(0, 200);
    }
    await this.ctx.storage.put('state', st);
  }
}
