// The one place that talks to Launch Library 2. A Durable Object is a single global instance, so the call budget holds no matter how
// many edge locations ask: at most MAX_CALLS upstream requests in any rolling hour, one refresh at a time, and the last good feed
// kept (and served) whenever the upstream fails.
import { MAX_PAGES, buildFeed, upstreamUrl } from './feed.js';

export const MIN_INTERVAL_MS = 6 * 60 * 1000; // 10 refreshes an hour at most, so one page each stays inside the budget
export const MAX_CALLS = 10; // upstream requests in any rolling hour (Launch Library allows 15 to anonymous callers)
export const RETRY_AFTER_FAIL_MS = 2 * 60 * 1000; // wait after a failed refresh before trying again
export const UPSTREAM_TIMEOUT_MS = 8000;
const HOUR = 3600 * 1000;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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
        callsLastHour: (st.calls || []).filter((t) => now - t < HOUR).length, budget: MAX_CALLS });
    }
    const out = await this.refresh();
    return json(out, out.feed ? 200 : 503);
  }

  // concurrent requests share one refresh
  refresh() {
    if (!this.inflight) this.inflight = this.run().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  async run() {
    const now = Date.now();
    const st = (await this.ctx.storage.get('state')) || {};
    st.calls = (st.calls || []).filter((t) => now - t < HOUR);
    const reply = (status, reason) => ({ status, reason: reason || null, feed: st.feed || null, fetchedAt: st.fetchedAt || null, error: st.error || null });
    if (st.feed && now - st.fetchedAt < MIN_INTERVAL_MS) return reply('cached');
    if (st.failedAt && now - st.failedAt < RETRY_AFTER_FAIL_MS) return reply('stale', 'retry-wait');
    if (st.calls.length >= MAX_CALLS) return reply('stale', 'budget');
    const results = [];
    try {
      let url = upstreamUrl(new Date(now));
      for (let page = 0; page < MAX_PAGES; page++) {
        if (st.calls.length >= MAX_CALLS) break; // keep what the earlier pages gave
        st.calls.push(Date.now());
        await this.ctx.storage.put('state', st); // counted before the request goes out, so a crash cannot hide a call
        const headers = { 'User-Agent': 'astro-radar-feed (github.com/SergiusCommodus/astro-radar)', Accept: 'application/json' };
        if (this.env.LL2_TOKEN) headers.Authorization = `Token ${this.env.LL2_TOKEN}`; // optional, from a Worker secret
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(Number(this.env.UPSTREAM_TIMEOUT_MS) || UPSTREAM_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`upstream answered ${res.status}`);
        const body = await res.json();
        if (!body || !Array.isArray(body.results)) throw new Error('upstream sent no results');
        results.push(...body.results);
        url = body.next;
        if (!url || !url.startsWith('https://ll.thespacedevs.com/')) break;
      }
      const feed = buildFeed({ results }, new Date(now));
      if (!feed.launches.length) throw new Error('feed had no usable launches');
      st.feed = feed;
      st.fetchedAt = now;
      st.failedAt = null;
      st.error = null;
      await this.ctx.storage.put('state', st);
      return reply('fresh');
    } catch (err) {
      st.failedAt = Date.now();
      st.error = String((err && err.message) || err).slice(0, 200);
      await this.ctx.storage.put('state', st);
      return reply('stale', 'upstream-failed');
    }
  }
}
