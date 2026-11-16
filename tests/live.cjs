// Live from space (/live/) in a real browser: node tests/live.cjs (serves dist/ itself; Playwright as in smoke.cjs). CI runs it after wide.cjs.
// Nothing leaves the machine: every outside source is answered from tests/live/ or refused.
//   fresh        with the sources answering, each card takes the new data and says "Updated <time>, live from <source>": a newer EPIC picture,
//                the Kp dial, the aurora chance and NOAA's words for a G2 storm, the ISS from CelesTrak's elements, the Earth events
//   down         with every source refusing, each card keeps the build's copy with its source and its time, the ISS still moves, no errors
//   layout       at 390, 768, 1440 and 1920 the cards in a row have the same top and bottom and fill the row (no holes), and each card has one
//                big line, one short line, More and its source and time
//   readable     every text at least 14 px (13 on a phone), the source and time lines at least 4.5 to 1 on their card
//   steady       no layout shift while the fresh data arrives
//   fast         the largest paint on a throttled phone (4x CPU, a slow 4G line) comes under 2.5 s
//   offline      after one visit the page opens offline from the service worker with its cards and times
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist'), PORT = +(process.env.PORT || 8143), BASE = `http://127.0.0.1:${PORT}/`;
const FIX = path.join(__dirname, 'live');
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };
const feed = JSON.parse(fs.readFileSync(path.join(DIST, 'launches.json'), 'utf8'));
const tle = (feed.iss || {}).tle || [];

// the outside sources: answered from fixtures (fresh) or refused (down)
async function sources(ctx, mode) {
  await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, async (r) => {
    const u = r.request().url();
    if (mode === 'down') return r.abort();
    const json = (f) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(FIX, f)) });
    if (u.startsWith('https://epic.gsfc.nasa.gov/api/natural')) return json('epic.json');
    if (u.startsWith('https://epic.gsfc.nasa.gov/archive/')) return r.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(path.join(DIST, 'nasa/epic-640.jpg')) });
    if (u.includes('noaa-planetary-k-index')) return json('kp.json');
    if (u.includes('noaa-scales')) return json('scales.json');
    if (u.startsWith('https://eonet.gsfc.nasa.gov/')) return json('eonet.json');
    if (u.startsWith('https://celestrak.org/')) return r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'ISS (ZARYA)\n' + tle.join('\n') + '\n' });
    return r.abort();
  });
}
const cardInfo = (p) => p.evaluate(() => [...document.querySelectorAll('.lvc,.lv-hero')].map((c) => {
  const r = c.getBoundingClientRect(), u = c.querySelector('.upd2');
  return { id: c.getAttribute('aria-labelledby'), top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), left: Math.round(r.left), right: Math.round(r.right),
    big: !!c.querySelector('.lvc-big'), line: !!c.querySelector('.lvc-line'), more: !!c.querySelector('.lvc-more summary'), cred: !!c.querySelector('.lvc-f .cred a[href^="https://"]'),
    upd: u ? u.textContent.trim() : '' };
}));

(async () => {
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const errs = [];
  try {
    // ---------------------------------------------------------------- fresh: every card updates and says so
    {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
      await sources(ctx, 'fresh');
      await ctx.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
      const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push('fresh: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('fresh console: ' + m.text()); });
      await p.goto(BASE + 'live/', { waitUntil: 'load' });
      await p.waitForFunction(() => [...document.querySelectorAll('.upd2')].filter((u) => /live from/.test(u.textContent)).length >= 4, null, { timeout: 15000 }).catch(() => {});
      const s = await p.evaluate(() => ({ kp: document.getElementById('kpLine').textContent, ch: document.getElementById('kpChance').textContent, aur: document.getElementById('kpAur').textContent,
        needle: document.getElementById('kpNeedle').getAttribute('transform'), epic: document.getElementById('epicImg').src, raw: document.getElementById('epicImg').classList.contains('raw'),
        when: document.getElementById('epicWhen').textContent, ev: document.getElementById('evCount').textContent, bars: document.querySelectorAll('#evBars li').length,
        dot: document.getElementById('issDot').getAttribute('transform'), trk: (document.getElementById('issTrk').getAttribute('d') || '').length,
        upd: [...document.querySelectorAll('.upd2')].map((u) => u.id + ': ' + u.textContent.trim()), cls: window.__cls }));
      ok(s.kp === 'Kp 6.3' && s.ch === 'fair' && /New York and Idaho/.test(s.aur) && /^rotate\(36\.0 100 100\)$/.test(s.needle), `fresh space weather: ${JSON.stringify([s.kp, s.ch, s.aur, s.needle])}`);
      ok(/epic\.gsfc\.nasa\.gov\/archive\/natural\/2026\/11\/20\/jpg\/epic_1b_20261120120000\.jpg$/.test(s.epic) && s.raw && /Nov 20/.test(s.when), `a newer EPIC picture: ${s.epic} ${s.when}`);
      ok(s.ev === '3' && s.bars === 2, `fresh Earth events: ${s.ev} open, ${s.bars} kinds`);
      ok(/^translate\(\d/.test(s.dot) && s.dot !== 'translate(-20 -20)' && s.trk > 40, `the ISS on the map: ${s.dot}`);
      for (const id of ['epicUpd', 'issUpd', 'sunUpd', 'evUpd']) ok(s.upd.some((u) => u.startsWith(id + ': Updated ') && /live from/.test(u)), `${id} says it is fresh: ${s.upd.join(' | ')}`);
      ok(s.upd.some((u) => u.startsWith('neoUpd: ') && /^neoUpd: (Updated|Last updated) /.test(u) && !/live from/.test(u)), `the asteroids keep the build's time (JPL does not allow browsers): ${s.upd.join(' | ')}`);
      ok(s.cls < 0.01, `no layout shift while fresh data arrives: ${s.cls}`);
      await ctx.close();
    }
    // ---------------------------------------------------------------- down: the build's copy, with its time
    {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      await sources(ctx, 'down');
      const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push('down: ' + e.message));
      const html = fs.readFileSync(path.join(DIST, 'live/index.html'), 'utf8');
      await p.goto(BASE + 'live/', { waitUntil: 'load' }); await p.waitForTimeout(1500);
      const c = await cardInfo(p);
      ok(c.length === (html.match(/class="lvc /g) || []).length + 1, 'every card the build wrote is there');
      ok(c.every((x) => /^(Updated|Last updated|Elements from) [A-Z][a-z]{2} \d/.test(x.upd) && !/live from/.test(x.upd)), `each card keeps its own time: ${c.map((x) => x.upd).join(' | ')}`);
      ok(await p.evaluate(() => document.getElementById('epicImg').src.startsWith(location.origin)), 'the saved EPIC picture stays');
      ok(await p.evaluate(() => !!document.getElementById('kpLine').textContent.match(/^Kp \d/)), 'the dial keeps the build\'s Kp');
      await ctx.close();
    }
    // ---------------------------------------------------------------- layout, text and contrast at four widths
    for (const [w, h, min] of [[390, 844, 13], [768, 1024, 14], [1440, 900, 14], [1920, 1080, 14]]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
      await sources(ctx, 'fresh');
      const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(w + ': ' + e.message));
      await p.goto(BASE + 'live/', { waitUntil: 'load' }); await p.waitForTimeout(1200);
      const c = (await cardInfo(p)).filter((x) => x.id !== 'h-epic');
      const grid = await p.evaluate(() => { const r = document.querySelector('.lvgrid').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) }; });
      const rows = {};
      c.forEach((x) => { (rows[x.top] = rows[x.top] || []).push(x); });
      for (const [top, xs] of Object.entries(rows)) {
        ok(new Set(xs.map((x) => x.bottom)).size === 1, `${w}: the cards in the row at ${top} end together: ${xs.map((x) => x.id + ' ' + x.bottom).join(', ')}`);
        const l = Math.min(...xs.map((x) => x.left)), r = Math.max(...xs.map((x) => x.right));
        ok(Math.abs(l - grid.l) <= 1 && Math.abs(r - grid.r) <= 1, `${w}: the row at ${top} fills the grid, no hole: ${l} to ${r} of ${grid.l} to ${grid.r}`);
      }
      ok(c.every((x) => x.big && x.line && x.more && x.cred && x.upd), `${w}: every card has a big line, a short line, More, a source and a time`);
      const t = await p.evaluate((min) => {
        const lum = (c) => { const v = c.match(/[\d.]+/g).map(Number).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
        const mix = (fg, bg) => { const f = fg.match(/[\d.]+/g).map(Number), g = bg.match(/[\d.]+/g).map(Number), a = f.length > 3 ? f[3] : 1; return `rgb(${f[0] * a + g[0] * (1 - a)},${f[1] * a + g[1] * (1 - a)},${f[2] * a + g[2] * (1 - a)})`; };
        const page = getComputedStyle(document.body).backgroundColor, small = [], low = [];
        for (const e of document.querySelectorAll('main *')) {
          if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e.closest('svg,[hidden],details:not([open]) .lvc-mi,.sr')) continue;
          const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
          const cs = getComputedStyle(e); if (parseFloat(cs.fontSize) < min - 0.01) small.push(parseFloat(cs.fontSize) + ' ' + e.className + ' ' + e.textContent.trim().slice(0, 30));
        }
        for (const e of document.querySelectorAll('.lvc-f span, .lvc-f a, .lvc-f time')) {
          const card = e.closest('.lvc,.lv-hero'), bg = mix(getComputedStyle(card).backgroundColor, page), fg = mix(getComputedStyle(e).color, bg);
          const L1 = lum(fg), L2 = lum(bg), cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); if (cr < 4.5) low.push(cr.toFixed(2) + ' ' + e.textContent.trim().slice(0, 30));
        }
        return { small, low, side: document.documentElement.scrollWidth - innerWidth };
      }, min);
      ok(!t.small.length, `${w}: text under ${min} px: ${t.small.slice(0, 5).join(' | ')}`);
      ok(!t.low.length, `${w}: source and time lines under 4.5 to 1: ${t.low.slice(0, 5).join(' | ')}`);
      ok(t.side <= 0, `${w}: no sideways scroll`);
      await ctx.close();
    }
    // ---------------------------------------------------------------- the largest paint on a throttled phone
    {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      await sources(ctx, 'fresh');
      const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
      await p.addInitScript(() => { window.__lcp = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); });
      await p.goto(BASE + 'live/', { waitUntil: 'load' }); await p.waitForTimeout(1500);
      const lcp = await p.evaluate(() => window.__lcp);
      console.log(`  phone LCP (4x CPU, slow 4G): ${Math.round(lcp)} ms`);
      ok(lcp > 0 && lcp < 2500, `phone LCP under 2.5 s: ${Math.round(lcp)} ms`);
      await ctx.close();
    }
    // ---------------------------------------------------------------- offline, after one visit
    {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
      await sources(ctx, 'down');
      const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push('offline: ' + e.message));
      await p.goto(BASE, { waitUntil: 'load' });
      await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(1500);
      await p.goto(BASE + 'live/', { waitUntil: 'load' }); await p.waitForTimeout(500);
      await ctx.setOffline(true);
      await p.reload({ waitUntil: 'load' }).catch(() => {}); await p.waitForTimeout(800);
      const o = await p.evaluate(() => ({ h1: (document.querySelector('h1') || {}).textContent, cards: document.querySelectorAll('.lvc').length, upd: [...document.querySelectorAll('.upd2')].map((u) => u.textContent.trim()),
        img: (document.getElementById('epicImg') || {}).naturalWidth || 0, map: (document.querySelector('.iss-map img') || {}).naturalWidth || 0 }));
      ok(/Live from space/i.test(o.h1 || '') && o.cards >= 3 && o.upd.every((u) => /^(Updated|Last updated|Elements from) /.test(u)), `offline: the last good page with its times: ${JSON.stringify(o)}`);
      ok(o.img > 0 && o.map > 0, `offline: the Earth picture and the map are kept: ${o.img} ${o.map}`);
      await ctx.close();
    }
  } catch (e) { fails++; console.log('  FAIL', e.stack || e); }
  ok(!errs.length, 'page errors: ' + errs.slice(0, 5).join(' | '));
  await b.close(); server.kill();
  console.log(`live: ${checks - fails}/${checks} checks passed`); process.exit(fails ? 1 : 0);
})();
