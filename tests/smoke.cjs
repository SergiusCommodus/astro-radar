// Page smoke test: the built site in a real browser, at phone and desktop width. Runs in CI (.github/workflows/checks.yml) and locally.
//   python3 tests/make_mock_ll2.py mock.json && python3 scripts/fetch_launches.py dist/launches.json --from-file mock.json && python3 build.py
//   node tests/smoke.cjs
// It serves dist/ itself (tests/serve.py, like GitHub Pages). Needs Playwright: `npm i --no-save playwright` in tests/ (CI does this), or
// PLAYWRIGHT=/path/to/playwright-core and CHROME=/path/to/chrome for a local copy. The weather service is blocked, so nothing leaves the machine.
// Checks: no page errors, console errors or content security policy violations; the hero, the rows and the data tag; every row selects;
// every tab opens; ?launch=<id> selects that launch; every launch page loads with its title, canonical and structured data; a launch page
// that is gone sends the visitor to the radar; the sitemap, robots.txt, manifest, service worker and calendar feed are served; layout
// shift stays under 0.05; every distance on Your sky agrees (the pad distance in the card, the reasons and the Not visible card are the same
// number, and every "N mi (M km)" pair converts with the page's one rule); the launch list shows 6 and Show all the rest; the first screen
// shows the headline, countdown and Watch button (phone) or key facts (desktop); no control is under 44 px.
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
    window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile || '') + ':' + e.lineNumber));
    // the total, and the largest shifts' elements, so a failure says what moved
    window.__cls = 0; window.__clsSrc = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; if (e.value > .005) window.__clsSrc.push([+e.value.toFixed(4), Math.round(e.startTime), e.sources.map((s) => { const n = s.node; return (n && n.nodeType === 1 ? n.tagName + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className ? '.' + n.className.split(' ')[0] : '') : '?') + ' y' + Math.round(s.previousRect.y) + '>' + Math.round(s.currentRect.y) + ' h' + Math.round(s.previousRect.height) + '>' + Math.round(s.currentRect.height); }).join(', ')]); } }).observe({ type: 'layout-shift', buffered: true });
  });
  // the main checks run on the photo fallback (?world=off): CI renders in software, where the world is slow; the world has its own check below
  if (url.startsWith(BASE) && !url.includes('world=') && !url.includes('/launch/') && !url.endsWith('.txt')) url += (url.includes('?') ? '&' : '?') + 'world=off';
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
      // provider logos: every row and the hero show a logo or a monogram badge, and no logo image is broken
      const lg = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#rows .row')].filter((r) => !r.querySelector('.r-prov .plogo,.r-prov .pmono')).length, hero: !!document.querySelector('#heroLogo .plogo,#heroLogo .pmono'),
        broken: [...document.querySelectorAll('img.plogo')].filter((i) => i.complete && !i.naturalWidth).map((i) => i.getAttribute('src')) }));
      ok(lg.rows === 0 && lg.hero, nm + ': a logo or badge on the hero and every row (' + lg.rows + ' rows without)');
      ok(lg.broken.length === 0, nm + ': logos that did not load ' + lg.broken.join(', '));
      // the first screen: the headline, countdown and Watch button on a phone, and the key facts too on a desktop; no control under 44 px
      const fit = await p.evaluate((phone) => {
        const bot = (q) => { const e = document.querySelector(q); return e ? e.getBoundingClientRect().bottom + scrollY : 1e9; };
        const need = phone ? ['#heroTitle', '.count', '#heroWatch'] : ['#heroTitle', '.count', '.hero-facts'];
        const hit = '.r-links,.rc-l,.hero-src,.vc-est,.cal-sub', small = [];
        for (const e of document.querySelectorAll('a,button,input,summary,[role=tab],[role=slider]')) {
          const r = e.getBoundingClientRect(); if (!r.width || e.closest('[hidden],.skip,.sr') || (e.parentElement && e.parentElement.closest(hit))) continue;
          if (r.height < 44) small.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.height));
        }
        return { over: need.filter((q) => bot(q) > innerHeight), small };
      }, nm === 'phone');
      ok(fit.over.length === 0, nm + ': first screen shows ' + fit.over.join(', '));
      ok(fit.small.length === 0, nm + ': controls under 44 px ' + fit.small.slice(0, 6).join(', '));
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
      const m = await p.evaluate(() => ({ h1: (document.querySelector('h1') || {}).textContent, canon: (document.querySelector('link[rel=canonical]') || {}).href, ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { return JSON.parse(s.textContent)['@type']; } catch (e) { return 'bad'; } }), sw: document.documentElement.scrollWidth - innerWidth, csp: window.__csp, pv: !!document.querySelector('.pv .plogo,.pv .pmono'), broken: [...document.querySelectorAll('img.plogo')].filter((i) => i.complete && !i.naturalWidth).length }));
      ok(m.pv && m.broken === 0, 'launch page ' + id + ' shows the provider logo or badge');
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
    // the live world, forced on: in a browser that allows software WebGL (SwiftShader, as CI has), the world must start, load its first
    // textures and take over from the page's stars with no errors, on the high tier (desktop) and the medium tier (phone)
    const bw = await pw.chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    try {
      for (const [nm, o, q] of [['desktop', { viewport: { width: 1440, height: 900 } }, 'high'], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'medium']]) {
        const w = await open(bw, o, BASE + '?world=on&q=' + q + '&fps');
        await w.p.waitForFunction(() => document.documentElement.classList.contains('world-on') || document.documentElement.classList.contains('photo'), null, { timeout: 30000 }).catch(() => {});
        await w.p.waitForTimeout(1500);
        const s = await w.p.evaluate(() => ({ cls: document.documentElement.className, err: window.__worldErr || '', d: window.__heroDiag ? window.__heroDiag() : null, cls2: window.__cls }));
        const wd = s.d && s.d.world;
        console.log('  world', nm + ':', wd && wd.canvas ? wd.tier + ' ' + wd.level + ' ' + wd.canvas : JSON.stringify(wd), '|', s.cls, '| layout shift', (s.cls2 || 0).toFixed(4));
        ok(/\bworld-on\b/.test(s.cls) && !/\bphoto\b/.test(s.cls) && wd && wd.ready && wd.tier === q, nm + ': the world starts (' + s.cls + ', ' + (s.err || (s.d && s.d.why)) + ')');
        ok(w.errs.length === 0 && !s.err, nm + ': world errors ' + w.errs.concat(s.err ? [s.err] : []).join(' | '));
        const vio = await w.p.evaluate(() => window.__csp);
        ok(vio.length === 0, nm + ': world policy violations ' + vio.slice(0, 4).join(' | '));
        ok((s.cls2 || 0) < 0.05, nm + ': world layout shift ' + s.cls2 + ' ' + (await w.p.evaluate(() => JSON.stringify(window.__clsSrc || []))).slice(0, 600));
        await w.ctx.close();
      }
    } finally { await bw.close(); }
  } finally {
    await b.close(); server.kill();
  }
  console.log(fails ? `SMOKE FAILED: ${fails} of ${checks} checks` : `SMOKE PASSED: ${checks} checks`);
  process.exit(fails ? 1 : 0);
})();
