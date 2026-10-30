// Page smoke test: the built site in a real browser, at phone and desktop width. Runs in CI (.github/workflows/checks.yml) and locally.
//   python3 tests/make_mock_ll2.py mock.json && python3 scripts/fetch_launches.py dist/launches.json --from-file mock.json && python3 build.py
//   node tests/smoke.cjs
// It serves dist/ itself (tests/serve.py, like GitHub Pages). Needs Playwright: `npm i --no-save playwright` in tests/ (CI does this), or
// PLAYWRIGHT=/path/to/playwright-core and CHROME=/path/to/chrome for a local copy. The weather service is blocked, so nothing leaves the machine.
// Checks: no page errors, console errors or content security policy violations; the hero, the rows and the data tag; every row selects;
// every tab opens; ?launch=<id> selects that launch; every launch page loads with its title, canonical and structured data; a launch page
// that is gone sends the visitor to the radar; the sitemap, robots.txt, manifest, service worker and calendar feed are served; layout
// shift stays under 0.05; every distance on Your sky agrees (the pad distance in the card, the reasons and the Not visible card are the same
// number, and every "N mi (M km)" pair converts with the page's one rule).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist'), PORT = +(process.env.PORT || 8123), BASE = `http://127.0.0.1:${PORT}/`;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };
const feed = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIST, 'launches.json'), 'utf8')); } catch (e) { return null; } })();
const pages = fs.existsSync(path.join(DIST, 'launch')) ? fs.readdirSync(path.join(DIST, 'launch')) : [];

// Every distance shown on Your sky for the selected launch: the pad distance wherever it is on screen ([data-pad-dist]) and the reasons' "The pad
// is ...", and every "N mi (M km)" pair, whose miles must be the kilometres converted (allowing for both being rounded).
const distCheck = (p) => p.evaluate(async () => {
  // numbers count up when they change: wait until they have settled
  for (let t = 0; t < 40 && [...document.querySelectorAll('[data-pad-dist]')].some((e) => e._raf); t++) await new Promise((r) => setTimeout(r, 50));
  const num = (s) => parseFloat(String(s).replace(/,/g, '')), out = [], sky = document.querySelector('#p-sky');
  const pad = [...sky.querySelectorAll('[data-pad-dist]')].filter((e) => e.getClientRects().length).map((e) => e.textContent.trim());
  const why = (sky.querySelector('#whyList') || {}).textContent || '', m = /The pad is ([\d,]+) mi \(([\d,]+) km\)/.exec(why);
  if (m) pad.push(m[1] + ' mi', m[2] + ' km');
  const mis = new Set(pad.filter((x) => / mi$/.test(x)).map((x) => num(x))), kms = new Set(pad.filter((x) => / km$/.test(x)).map((x) => num(x)));
  if (mis.size > 1) out.push('pad distance in miles differs: ' + [...mis].join(' vs '));
  if (kms.size > 1) out.push('pad distance in km differs: ' + [...kms].join(' vs '));
  if (!mis.size) out.push('no pad distance shown');
  for (const q of sky.textContent.matchAll(/([\d,]+) mi \(([\d,]+) km\)/g)) if (Math.abs(num(q[1]) - num(q[2]) * 0.621371) > 0.82) out.push('mi and km disagree: ' + q[0]);
  return out;
});

async function open(b, o, url) {
  const ctx = await b.newContext({ ...o, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route('https://api.weather.gov/**', (r) => r.abort());
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error' && !/weather\.gov|Failed to load resource|net::ERR_FAILED/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.addInitScript(() => {
    window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await p.goto(url, { waitUntil: 'load' });
  return { ctx, p, errs };
}

(async () => {
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    for (const [nm, o] of [['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
      console.log('==', nm);
      const { ctx, p, errs } = await open(b, o, BASE);
      await p.waitForTimeout(2500);
      const s = await p.evaluate(() => ({ title: document.querySelector('#heroTitle').textContent.trim(), rows: document.querySelectorAll('#rows .row').length, tag: document.querySelector('#dataTag').textContent, cls: window.__cls, sw: document.documentElement.scrollWidth - innerWidth }));
      console.log('  hero:', s.title, '| rows', s.rows, '| tag:', s.tag, '| layout shift', s.cls.toFixed(4));
      ok(s.title.length > 0, nm + ': hero title');
      ok(s.rows > 0, nm + ': launch rows');
      ok(feed ? /^(Live data|Data delayed)/.test(s.tag) : /Sample|Loading/.test(s.tag), nm + ': data tag ' + s.tag);
      ok(s.cls < 0.05, nm + ': layout shift ' + s.cls);
      ok(s.sw <= 0, nm + ': sideways scroll ' + s.sw);
      if (feed && nm === 'desktop') {
        // the hero's Add to calendar file: the launch's time in UTC, folded lines, two alerts
        const L = feed.launches.find((x) => x.mis === s.title) || {};
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#heroCal')]);
        const ics = dl ? fs.readFileSync(await dl.path(), 'utf8') : '';
        const start = (L.utc || '').replace(/[-:]/g, '');
        ok(ics.includes('DTSTART:' + start), 'Add to calendar has the launch time in UTC ' + start);
        ok(ics.split('\r\n').every((x) => Buffer.byteLength(x) <= 75) && (ics.match(/BEGIN:VALARM/g) || []).length === 2, 'Add to calendar: folded lines and two alerts');
      }
      const bad = [];
      await p.evaluate(() => document.querySelector('.ptab[data-tab="launches"]').click()); await p.waitForTimeout(300);
      // the list shows the next 6, and Show all lists the rest
      const more = await p.evaluate(() => { const m = document.querySelector('#rowsMore'); const n0 = document.querySelectorAll('#rows .row').length; if (m && !m.hidden) m.click(); return { n0, hidden: !m || m.hidden }; });
      await p.waitForTimeout(300);
      const nAll = await p.evaluate(() => document.querySelectorAll('#rows [data-track]').length);
      ok(more.n0 <= 6 && (more.hidden ? nAll === more.n0 : nAll > more.n0), nm + ': the list shows ' + more.n0 + ' launches, then ' + nAll + ' with Show all');
      // select each launch with its row's track button (it opens Your sky), check the distances there, then go back to the list
      for (let i = 0; i < nAll; i++) {
        await p.evaluate((n) => { document.querySelector('.ptab[data-tab="launches"]').click(); const t = document.querySelectorAll('#rows [data-track]')[n]; if (t) t.click(); }, i);
        await p.waitForTimeout(120); bad.push(...(await distCheck(p)));
      }
      ok(bad.length === 0, nm + ': distances agree for every launch ' + [...new Set(bad)].slice(0, 4).join(' | '));
      for (const tab of ['sky', 'launches', 'watch', 'astro']) { await p.evaluate((t) => { const e = document.querySelector('[data-tab="' + t + '"]'); if (e) e.click(); }, tab); await p.waitForTimeout(250); }
      ok(errs.length === 0, nm + ': errors ' + errs.join(' | '));
      ok((await p.evaluate(() => window.__csp)).length === 0, nm + ': policy violations ' + (await p.evaluate(() => window.__csp)).join(' | '));
      await ctx.close();
      if (feed && feed.launches && feed.launches.length > 3) {
        const L = feed.launches[3], r = await open(b, o, BASE + '?launch=' + encodeURIComponent(L.id));
        await r.p.waitForTimeout(1500);
        ok((await r.p.textContent('#heroTitle')).trim() === L.mis, nm + ': ?launch= selects ' + L.mis);
        ok(r.errs.length === 0, nm + ': ?launch= errors ' + r.errs.join(' | '));
        await r.ctx.close();
      }
    }
    // launch pages
    const { ctx, p, errs } = await open(b, { viewport: { width: 390, height: 844 } }, BASE + 'robots.txt');
    for (const id of pages) {
      await p.goto(BASE + 'launch/' + id + '/', { waitUntil: 'load' });
      const m = await p.evaluate(() => ({ h1: (document.querySelector('h1') || {}).textContent, canon: (document.querySelector('link[rel=canonical]') || {}).href, ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { return JSON.parse(s.textContent)['@type']; } catch (e) { return 'bad'; } }), sw: document.documentElement.scrollWidth - innerWidth, csp: window.__csp }));
      ok(m.h1 && m.canon === 'https://astroradar.io/launch/' + id + '/', 'launch page ' + id + ' title and canonical');
      ok(!m.ld.includes('bad'), 'launch page ' + id + ' structured data parses');
      ok(m.sw <= 0 && m.csp.length === 0, 'launch page ' + id + ' layout and policy');
    }
    console.log('  launch pages:', pages.length);
    if (pages.length) {
      await p.goto(BASE + 'launch/' + pages[0] + 'x/'); await p.waitForTimeout(800);
      ok(p.url().includes('?launch=' + pages[0] + 'x'), 'a gone launch page goes to the radar: ' + p.url());
    }
    for (const f of ['sitemap.xml', 'robots.txt', 'manifest.webmanifest', 'sw.js', 'launches.ics', '404.html']) {
      const r = await p.request.get(BASE + f); ok(r.status() === 200, f + ' is served (' + r.status() + ')');
    }
    ok(errs.length === 0, 'launch page errors ' + errs.join(' | '));
    await ctx.close();
  } finally {
    await b.close(); server.kill();
  }
  console.log(fails ? `SMOKE FAILED: ${fails} of ${checks} checks` : `SMOKE PASSED: ${checks} checks`);
  process.exit(fails ? 1 : 0);
})();
