// Astro Radar live feed: a Cloudflare Worker that serves the launch feed (the same JSON the site builds into launches.json) from
// Launch Library 2, refreshed behind a 5 minute edge cache. See ../README.md.
import { handle } from './handler.js';

export { FeedState } from './state.js';

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
};
