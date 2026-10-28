# Astro Radar live feed (Cloudflare Worker)

A small Worker that serves the launch feed the page polls every minute. It reads [Launch Library 2](https://thespacedevs.com/llapi)
(the next 30 days and the last 7), turns the response into the same JSON the site builds into `launches.json`, and keeps it
behind a 5 minute edge cache. The GitHub Actions feed (`scripts/fetch_launches.py`, every 30 minutes) stays as the fallback: if the Worker is
down, slow or not set up, the page reads `launches.json` instead.

```
page ──every 60 s──▶ Worker ──edge cache (5 min, stale while revalidate)──▶ FeedState Durable Object ──≤ 10 calls an hour──▶ Launch Library 2
  └──if the Worker fails──▶ launches.json (GitHub Pages)
```

## What it does

| | |
|---|---|
| `GET /` (also `/feed`, `/feed.json`, `/launches.json`) | the feed: `generated`, `launches`, `recent`, and `"stale": true` when the last refresh failed |
| `GET /healthz` | `{"ok":true}`, never touches the upstream |
| Edge cache | a copy is served for 5 minutes; after that the stale copy is served at once and refreshed behind the request (stale while revalidate), not more often than every 30 seconds |
| Upstream budget | one Durable Object (`FeedState`) makes every Launch Library call: **at most 10 in any rolling hour** (Launch Library allows 15 to anonymous callers), one at a time, with at least 6 minutes between successful refreshes. A refresh that needs a second page counts as two calls. **HTTP 429**: no new call until its `Retry-After` time has passed (15 minutes when there is no header, at most 6 hours), and a throttled attempt does not count against the 10. Other failures wait 2 minutes, then 4, 8 and 15 |
| When the upstream fails | timeouts after 8 seconds, HTTP errors (429 included), junk bodies and empty feeds all count as failures: the last good feed is served (marked `stale`, with its own `generated` time). With none yet, the site's own `https://astroradar.io/launches.json` (the GitHub Actions copy) is served instead, marked `stale`, with its own `generated` time; only if that fails too is the answer `503` with `Retry-After` |
| `X-Feed-Source` | `upstream` (Launch Library) or `fallback` (launches.json), next to `X-Feed-Status` |
| CORS | `https://astroradar.io`, `https://www.astroradar.io`, `http://localhost:*` and `http://127.0.0.1:*`; add others with the `ALLOWED_ORIGINS` variable. Other origins get no `Access-Control-Allow-Origin` header |
| Secrets | none in the repo. An optional Launch Library token is read from the `LL2_TOKEN` Worker secret |

The feed is built by `src/feed.js`, a JavaScript port of `scripts/fetch_launches.py`. **Keep the two identical.** `npm test` runs both on
`tests/raw_ll2.json`, a real response (`tests/raw_ll2_window.json`), the mock feed and a set of odd records, and fails if the output differs.
`data/providers.json` is bundled into the Worker, so redeploy after editing it.

## Deploy

You need a Cloudflare account (the free plan is enough, including the Durable Object) and Node 20 or newer.

1. Install the tools:

   ```sh
   cd worker
   npm install
   ```

2. Sign in to Cloudflare (opens a browser):

   ```sh
   npx wrangler login
   ```

3. Deploy:

   ```sh
   npx wrangler deploy
   ```

   The first deploy creates the Worker `astro-radar-feed` and its Durable Object. It prints the address, which looks like
   `https://astro-radar-feed.<your-subdomain>.workers.dev`.

4. Check it (the first request fetches from Launch Library, so allow a few seconds):

   ```sh
   curl -s -D - https://astro-radar-feed.<your-subdomain>.workers.dev/ -H "Origin: https://astroradar.io" -o /dev/null
   curl -s https://astro-radar-feed.<your-subdomain>.workers.dev/ | head -c 400
   ```

   You should see `HTTP/2 200`, `access-control-allow-origin: https://astroradar.io` and `x-feed-status: fresh`; the second request
   says `x-feed-status: hit`.

5. Optional, a Launch Library token (it never goes in the repo):

   ```sh
   npx wrangler secret put LL2_TOKEN
   ```

6. Point the site at it. Either put the address in `data/config.json`:

   ```json
   { "feedUrl": "https://astro-radar-feed.<your-subdomain>.workers.dev/" }
   ```

   or set a repository variable `FEED_URL` (GitHub: Settings, Secrets and variables, Actions, Variables), which overrides the file. The
   deploy workflow passes it to `build.py`, which writes it into the page as the one constant `FEED_URL`. Push to `main` or run the
   "Build and deploy site" workflow. Leave it empty to run on `launches.json` only.

To serve it from your own domain, add a `routes` entry to `wrangler.toml` (Cloudflare docs: "Routes and domains"), deploy again, and use
that address as `feedUrl`; add the site's origin to `ALLOWED_ORIGINS` if it is not one of the origins above.

## Local work

```sh
cd worker
npm test            # parity with the Python feed, and the Worker against a fake upstream, cache and clock
npx wrangler dev    # the Worker on http://127.0.0.1:8787 (calls the real Launch Library, so keep the 10 an hour in mind)
```

Try the page against it: build with `FEED_URL=http://127.0.0.1:8787/ python3 build.py`, then serve `dist/` as in the main `CLAUDE.md`.

## Changing the limits

They are constants at the top of `src/state.js` (`MIN_INTERVAL_MS`, `MAX_CALLS`, `RETRY_AFTER_FAIL_MS`, `MAX_FAIL_BACKOFF_MS`, `THROTTLE_DEFAULT_MS`, `THROTTLE_MAX_MS`, `UPSTREAM_TIMEOUT_MS`, `FALLBACK_URL`, `FALLBACK_EVERY_MS`) and
`src/handler.js` (`FRESH_MS`, `STALE_MAX_MS`). The tests check that the budget holds over eight simulated hours of visitors with the
upstream working, failing and paginating, so run `npm test` after changing any of them.

## What a status change means

Launch Library has no scrub status. The page reports a scrub when a go or hold launch within the next day moves 15 minutes or more later, or
goes back to a time to be confirmed. GO, HOLD and LAUNCHED come from the status the feed carries (`go`, `hold`, `flight`) and from a launch
moving into `recent` with its result.
