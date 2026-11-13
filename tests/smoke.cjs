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
  // the distances live under Details
  const det = document.querySelector('#skyDet'); if (det) det.open = true;
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
      const lg = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#rows .row')].filter((r) => !r.querySelector('.r-logo .plogo,.r-logo .pmono')).length, hero: !!document.querySelector('#heroLogo .plogo,#heroLogo .pmono'),
        broken: [...document.querySelectorAll('img.plogo')].filter((i) => i.complete && !i.naturalWidth).map((i) => i.getAttribute('src')) }));
      ok(lg.rows === 0 && lg.hero, nm + ': a logo or badge on the hero and every row (' + lg.rows + ' rows without)');
      ok(lg.broken.length === 0, nm + ': logos that did not load ' + lg.broken.join(', '));
      // the first screen: the headline, countdown and Watch button on a phone, and the key facts too on a desktop; no control under 44 px
      const fit = await p.evaluate((phone) => {
        const bot = (q) => { const e = document.querySelector(q); return e ? e.getBoundingClientRect().bottom + scrollY : 1e9; };
        const need = phone ? ['#heroTitle', '.count', '#heroWatch'] : ['#heroTitle', '.count', '.hero-facts'];
        const hit = '.r-links,.rc-l,.hero-src,.vc-est,.cal-sub,.sp-src', small = [];
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
        const L = feed.launches.find((x) => require(path.join(__dirname, '..', 'src', 'model.js')).title(x.mis, x.veh) === s.title) || {};
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.evaluate(() => { document.querySelector('#heroMore').open = true; }).then(() => p.click('#heroCal'))]);
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
        // a payload the feed does not name is never shown as Unknown Payload: the headline is the rocket (ORB.title)
        if (await p.evaluate(() => /unknown payload/i.test(document.body.innerText + document.title))) bad.push('Unknown Payload shown for launch ' + i);
      }
      ok(bad.length === 0, nm + ': distances agree and no Unknown Payload for every launch ' + [...new Set(bad)].slice(0, 4).join(' | '));
      for (const tab of ['sky', 'launches', 'watch', 'astro']) { await p.evaluate((t) => { const e = document.querySelector('[data-tab="' + t + '"]'); if (e) e.click(); }, tab); await p.waitForTimeout(250); }
      ok(errs.length === 0, nm + ': errors ' + errs.join(' | '));
      ok((await p.evaluate(() => window.__csp)).length === 0, nm + ': policy violations ' + (await p.evaluate(() => window.__csp)).join(' | '));
      await ctx.close();
      if (feed && feed.launches && feed.launches.length > 3) {
        const L = feed.launches[3], r = await open(b, o, BASE + '?launch=' + encodeURIComponent(L.id));
        await r.p.waitForTimeout(1500);
        const want = require(path.join(__dirname, '..', 'src', 'model.js')).title(L.mis, L.veh);
        ok((await r.p.textContent('#heroTitle')).trim() === want, nm + ': ?launch= selects ' + want);
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
      // one screen on a phone: the name, the countdown (upcoming) and the main button are on the first screen of 390 by 844
      const fs = await p.evaluate(() => { const b = (s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().bottom : -1; }; return { h1: b('h1'), cd: b('.cd'), cdt: (document.querySelector('.cd') || {}).textContent || '', btn: b('.acts .btn,.acts .none'), sum: !!document.querySelector('.about p') }; });
      ok(fs.h1 > 0 && fs.h1 <= 844 && fs.btn > 0 && fs.btn <= 844 && fs.cd <= 844 && fs.sum, 'launch page ' + id + ' first screen ' + JSON.stringify(fs));
      if (fs.cd > 0) ok(/^(Liftoff in \d|Liftoff now|Launched \d|Liftoff was \d)/.test(fs.cdt), 'launch page ' + id + ' countdown reads ' + fs.cdt);
    }
    if (pages.length) { // the distance from the home ZIP the radar saved, through the page's one distance rule
      await p.evaluate(() => localStorage.setItem('radar.zipinfo', JSON.stringify({ zip: '32801', lat: 28.5421, lon: -81.3790, city: 'Orlando' })));
      let zt = '';
      for (const id of pages) { await p.goto(BASE + 'launch/' + id + '/', { waitUntil: 'load' }); zt = await p.evaluate(() => (document.getElementById('zipv') || {}).textContent || ''); if (zt) break; }
      ok(/^From ZIP 32801 \(Orlando\), the pad is [\d,]+ mi \([\d,]+ km\) to the [a-z ]+\. That is (inside|farther than) the about [\d,]+ mi \([\d,]+ km\)/.test(zt), 'launch page ZIP line: ' + zt);
      await p.evaluate(() => localStorage.removeItem('radar.zipinfo'));
    }
    if (pages.length) { // Look up: a typed ZIP gives Yes, Maybe or No with its reason and the facts, on every upcoming page that has the card;
      // the trust strip is on every page. The weather service is answered with a fixed forecast so the test does not depend on it
      const L = await open(b, { viewport: { width: 390, height: 844 } }, BASE + 'robots.txt'), lp = L.p;
      await L.ctx.unroute('https://api.weather.gov/**');
      await L.ctx.route('https://api.weather.gov/**', (r) => r.request().url().includes('/points/')
        ? r.fulfill({ contentType: 'application/geo+json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ properties: { forecastGridData: 'https://api.weather.gov/gridpoints/X/1,1' } }) })
        : r.fulfill({ contentType: 'application/geo+json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ properties: { skyCover: { values: [{ validTime: '2020-01-01T00:00:00+00:00/P3650D', value: 20 }] } } }) }));
      let cards = 0, lastCard = null;
      for (const id of pages) {
        await lp.goto(BASE + 'launch/' + id + '/', { waitUntil: 'load' });
        ok(await lp.$('.trust') !== null, 'launch page ' + id + ' has the trust strip');
        if (!(await lp.$('#luForm'))) continue;
        cards++; lastCard = id;
        await lp.fill('#luZip', '32801'); await lp.click('#luForm button[type=submit]');
        // polled with evaluate: waitForFunction needs eval, which the launch pages' policy refuses
        for (let i = 0; i < 60; i++) { const t = await lp.evaluate(() => ((document.querySelector('.lu-v') || {}).textContent || '') + '|' + document.getElementById('luOut').textContent);
          if (/^(Yes|Maybe|No) from 32801/.test(t) && !/Checking/.test(t)) break; await lp.waitForTimeout(250); }
        const r = await lp.evaluate(() => ({ v: (document.querySelector('.lu-v') || {}).textContent || '', reason: (document.querySelector('.lu-r') || {}).textContent || '',
          rows: [...document.querySelectorAll('.lu-f li span')].map((s) => s.textContent), clouds: (document.querySelector('.lu-f') || {}).textContent || '' }));
        ok(/^(Yes|Maybe|No) from 32801 \(Orlando\)/.test(r.v) && r.reason.length > 10, 'Look up verdict on ' + id + ': ' + r.v + ' / ' + r.reason);
        ok(['Clouds', 'Distance', 'Sound'].every((k) => r.rows.includes(k)) && /20 percent sky cover/.test(r.clouds), 'Look up facts on ' + id + ': ' + r.rows.join(','));
        ok(!/\w-\w/.test(r.v + r.reason + r.clouds), 'Look up copy has no hyphens on ' + id);
      }
      ok(cards > 0, 'Look up cards checked: ' + cards);
      if (lastCard) await lp.goto(BASE + 'launch/' + lastCard + '/', { waitUntil: 'load' });
      await lp.fill('#luZip', '123'); await lp.click('#luForm button[type=submit]');
      ok(/five digit/.test(await lp.textContent('#luOut')), 'Look up asks for five digits');
      ok(L.errs.length === 0, 'Look up errors ' + L.errs.join(' | '));
      await L.ctx.close();
    }
    { // the two design directions: B (the photo) by default, A (no photo) with ?design=a, kept until another link picks one
      await p.goto(BASE + '?design=a', { waitUntil: 'load' });
      const a = await p.evaluate(() => ({ cls: document.documentElement.className, img: (document.querySelector('#heroPst img') || {}).currentSrc || '' }));
      ok(/\bd-a\b/.test(a.cls) && !/\bvid\b/.test(a.cls) && !a.img, 'design A: no photo ' + JSON.stringify(a));
      await p.goto(BASE, { waitUntil: 'load' });
      ok(/\bd-a\b/.test(await p.evaluate(() => document.documentElement.className)), 'design A is kept');
      await p.goto(BASE + '?design=b', { waitUntil: 'load' });
      ok(/\bd-b\b/.test(await p.evaluate(() => document.documentElement.className)), 'design B with ?design=b');
      await p.evaluate(() => localStorage.removeItem('radar.design'));
    }
    console.log('  launch pages:', pages.length);
    if (pages.length) {
      await p.goto(BASE + 'launch/' + pages[0] + 'x/'); await p.waitForTimeout(800);
      ok(p.url().includes('?launch=' + pages[0] + 'x'), 'a gone launch page goes to the radar: ' + p.url());
    }
    // provider pages: the index and each provider, in the redesign's type (no spaced capitals on buttons, labels or rows; the brand mark and monogram badges, logo stand ins, aside)
    await p.goto(BASE + 'provider/', { waitUntil: 'load' });
    const provs = await p.evaluate(() => [...document.querySelectorAll('main a[href^="/provider/"]')].map((a) => a.getAttribute('href')).filter((h) => h !== '/provider/'));
    ok(provs.length > 0, 'provider index lists providers: ' + provs.length);
    for (const u of ['/provider/'].concat(provs)) {
      await p.goto(BASE + u.slice(1), { waitUntil: 'load' });
      const m = await p.evaluate(() => ({ h1: !!document.querySelector('h1'), sw: document.documentElement.scrollWidth - innerWidth, csp: window.__csp || [],
        spaced: [...document.querySelectorAll('main *')].filter((el) => el.childElementCount === 0 && !el.closest('.pmono') && el.textContent.trim() && (parseFloat(getComputedStyle(el).letterSpacing) || 0) > 0.05 * parseFloat(getComputedStyle(el).fontSize) && getComputedStyle(el).fontFamily.indexOf('Condensed') < 0).map((el) => el.textContent.trim().slice(0, 20)) }));
      ok(m.h1 && m.sw <= 0 && m.csp.length === 0, 'provider page ' + u + ' title, layout and policy');
      ok(m.spaced.length === 0, 'provider page ' + u + ' has no spaced capitals: ' + m.spaced.join(', '));
    }
    console.log('  provider pages:', provs.length);
    for (const f of ['sitemap.xml', 'robots.txt', 'manifest.webmanifest', 'sw.js', 'launches.ics', '404.html']) {
      const r = await p.request.get(BASE + f); ok(r.status() === 200, f + ' is served (' + r.status() + ')');
    }
    ok(errs.length === 0, 'launch page errors ' + errs.join(' | '));
    await ctx.close();
    // offline: one visit with the service worker keeps the feed (even on a first visit, when the feed came before the worker took over);
    // reloaded offline, the page must say it is showing the last update, never "Live data" (the browser's HTTP cache can answer a same
    // minute request with a 200, which once passed old data off as live)
    if (feed && feed.launches && feed.launches.length) {
      const oc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await oc.route('https://api.weather.gov/**', (r) => r.abort());
      const op = await oc.newPage(), oerr = []; op.on('pageerror', (e) => oerr.push(String(e)));
      await op.goto(BASE, { waitUntil: 'load' }); await op.evaluate(() => navigator.serviceWorker.ready);
      let kept = false;
      for (let i = 0; i < 20 && !kept; i++) { await op.waitForTimeout(500); kept = await op.evaluate(async () => !!(await caches.match('launches.json'))); }
      ok(kept, 'offline: the first visit keeps the feed');
      await oc.setOffline(true); await op.reload({ waitUntil: 'load' }); await op.waitForTimeout(3000);
      const tag = await op.evaluate(() => document.querySelector('#dataTag').textContent);
      ok(/^Offline, showing last update/.test(tag), 'offline: the data tag says so (' + tag + ')');
      ok(oerr.length === 0, 'offline: errors ' + oerr.join(' | '));
      await oc.close();
    }
    const bw = await pw.chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    try {
      // one planet: the hero's photograph is the page's only planet. No globe card, no WebGL context, no world.js and no launch drawn over
      // the hero, at either width, and no layout shift on the way in
      for (const [nm, o] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
        const w = await open(bw, o, BASE + '?fps'), reqs = [];
        w.p.on('request', (r) => reqs.push(r.url()));
        await w.p.waitForTimeout(3000);
        const s = await w.p.evaluate(() => ({ cards: document.querySelectorAll('#lcard,.lcard,#heroArt').length, canvases: [...document.querySelectorAll('canvas')].map((c) => c.id || c.className), cls2: window.__cls }));
        const worldReq = reqs.filter((u) => /\/world(\.js|\/)|earth\/areas\//.test(u));
        console.log('  one planet', nm + ':', JSON.stringify(s), worldReq.length ? 'requests ' + worldReq.join(' ') : '');
        ok(s.cards === 0 && !s.canvases.some((c) => /world|space/.test(c)) && worldReq.length === 0, nm + ': a second planet is on the page ' + JSON.stringify(s) + ' ' + worldReq.join(' '));
        ok((s.cls2 || 0) < 0.05, nm + ': layout shift ' + s.cls2 + ' ' + (await w.p.evaluate(() => JSON.stringify(window.__clsSrc || []))).slice(0, 600));
        ok(w.errs.length === 0, nm + ': errors ' + w.errs.join(' | '));
        await w.ctx.close();
      }
      // Live from space and Space news: no errors or policy violations at either width (the browser's own refresh may fail here, offline from
      // the outside sources, and must fail quietly), real cards and headlines with their source and time, no control under 44 px, and the
      // ISS card's line filled in from the feed's elements when the feed has them
      for (const [nm, o] of [['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
        for (const pg of ['live', 'news']) {
          if (!fs.existsSync(path.join(DIST, pg, 'index.html'))) continue;
          const w = await open(bw, o, BASE + pg + '/');
          await w.p.waitForTimeout(2500);
          const s = await w.p.evaluate(() => ({ cards: document.querySelectorAll('.lv,.ns').length, dated: document.querySelectorAll('.upd2 time,.upd2').length,
            src: document.querySelectorAll('.cred a[href^="https://"],.nl a[href^="https://"]').length, iss: (document.getElementById('issNow') || {}).textContent || '',
            small: [...document.querySelectorAll('a,button,summary')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 44 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.tmore-p,.guide,.lv p,.nl li,.cred,footer p,.muted'); }).map((e) => e.textContent.trim().slice(0, 30)),
            wide: document.documentElement.scrollWidth - innerWidth, csp: window.__csp, cls: window.__cls }));
          console.log('  ' + pg + ' ' + nm + ':', JSON.stringify({ cards: s.cards, dated: s.dated, src: s.src, iss: s.iss.slice(0, 40), cls: s.cls }));
          ok(s.cards >= 2 && s.dated >= 1 && s.src >= 2, pg + ' ' + nm + ': real cards with their source and time ' + JSON.stringify(s));
          ok(s.wide <= 0, pg + ' ' + nm + ': sideways scroll of ' + s.wide + ' px');
          ok(w.errs.length === 0 && s.csp.length === 0, pg + ' ' + nm + ': errors or policy violations ' + w.errs.concat(s.csp).join(' | '));
          ok((s.cls || 0) < 0.05, pg + ' ' + nm + ': layout shift ' + s.cls);
          ok(!s.small.length, pg + ' ' + nm + ': controls under 44 px ' + JSON.stringify(s.small));
          if (pg === 'live' && feed && feed.iss) ok(/^Now over \d/.test(s.iss), 'live ' + nm + ': the ISS line is not filled in (' + s.iss + ')');
          await w.ctx.close();
        }
      }
      // the comparison switch (until George chooses, docs/REDESIGN.md): ?hero=old shows the earlier US at night photo behind the hero,
      // ?hero=new and no switch the NASA night photo
      for (const [q, want] of [['?hero=old', /^us-night-demo\.webp$/], ['?hero=new', /^hero-phone\.(avif|webp)$/]]) {
        const w = await open(bw, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, BASE + q);
        await w.p.waitForTimeout(1500);
        const s = await w.p.evaluate(() => { const i = document.querySelector('#heroPst img'); return { src: i && i.complete && i.naturalWidth ? i.currentSrc.split('/').pop() : '', old: document.documentElement.classList.contains('hero-old') }; });
        ok(want.test(s.src) && s.old === (q === '?hero=old') && w.errs.length === 0, q + ': the hero photo is ' + JSON.stringify(s) + ' ' + w.errs.join(' | '));
        await w.ctx.close();
      }
      // scrolling never moves the planet: with reduced motion the hero's planet is a still photo (no drift), so the band under the
      // facts must be the same picture, 120 px higher, after a 120 px scroll (a picture tied to the scroll would change it)
      {
        const w = await open(bw, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, BASE);
        await w.p.waitForTimeout(2500);
        const y0 = await w.p.evaluate(() => Math.round(document.querySelector('.hero-facts').getBoundingClientRect().bottom + 60));
        const a = await decode(await w.p.screenshot({ clip: { x: 0, y: y0, width: 1440, height: 160 } }));
        await w.p.evaluate(() => scrollTo(0, 120)); await w.p.waitForTimeout(1500);
        const c = await decode(await w.p.screenshot({ clip: { x: 0, y: y0 - 120, width: 1440, height: 160 } }));
        let d = 0; for (let i = 0; i < a.d.length; i += 4) d += Math.abs(a.d[i] - c.d[i]) + Math.abs(a.d[i + 1] - c.d[i + 1]) + Math.abs(a.d[i + 2] - c.d[i + 2]);
        d /= a.d.length / 4 * 3;
        console.log('  planet after a 120 px scroll: mean difference', d.toFixed(2), 'of 255');
        ok(d < 3, 'the planet moves with the scroll (mean difference ' + d.toFixed(2) + ')');
        const an = await w.p.evaluate(() => document.querySelector('#heroPst').getAnimations().length);
        ok(an === 0, 'reduced motion: the hero photo should not drift (' + an + ' animations)');
        await w.ctx.close();
      }
      // the hero's planet on every device is a NASA photograph from the ISS (AVIF or WebP, the wide one by width), full width, its horizon
      // just under the facts, drifting slowly (a CSS animation); the footer has no planet of its own, only the same space black and its
      // stars (drawn near the footer); no video anywhere
      for (const [nm, o, n] of [['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'hero-phone'], ['desktop', { viewport: { width: 1440, height: 900 } }, 'hero-wide']]) {
        const w = await open(bw, o, BASE);
        await w.p.waitForTimeout(3500);
        const s = await w.p.evaluate(() => { const i = document.querySelector('#heroPst img'), r = i && i.getBoundingClientRect(), f = document.querySelector('.hero-facts').getBoundingClientRect(), an = document.querySelector('#heroPst').getAnimations();
          return { cls: document.documentElement.className, photo: i && i.complete && i.naturalWidth ? i.currentSrc.split('/').pop() : '', shown: !!(r && r.width && getComputedStyle(i).display !== 'none'), w: r && Math.round(r.width), vw: innerWidth, hz: r && Math.round(r.top + r.height * .3 - f.bottom), drift: an.length && an[0].playState, video: document.querySelectorAll('video').length }; });
        console.log('  ' + nm + ' hero:', JSON.stringify(s));
        ok(/\bvid\b/.test(s.cls) && s.shown && new RegExp('^' + n + '(-2560|-3840)?\\.(avif|webp)$').test(s.photo) && !s.video, nm + ': the hero photo is not in place ' + JSON.stringify(s));
        ok(s.w >= s.vw && s.w <= s.vw * 1.2 && s.hz > -12 && s.hz < 40, nm + ': the photo does not span the width with its horizon just under the facts ' + JSON.stringify(s));
        ok(s.drift === 'running', nm + ': the hero photo does not drift ' + JSON.stringify(s));
        ok(w.errs.length === 0, nm + ' hero photo errors ' + w.errs.join(' | '));
        await w.p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await w.p.waitForTimeout(2500);
        const fs = await w.p.evaluate(() => { const c = document.getElementById('footSky'); return { planet: document.querySelectorAll('#footPlanet,.foot-planet').length, stars: !!(c && c.width > 0 && c.classList.contains('on')), video: document.querySelectorAll('video').length }; });
        console.log('  footer, ' + nm + ':', JSON.stringify(fs));
        ok(fs.planet === 0 && fs.stars && !fs.video, nm + ': the footer should have its stars and no planet of its own ' + JSON.stringify(fs));
        await w.ctx.close();
      }
      // launch rows: never more than two lines of text at 375, 390, 430 and 768 (Nerd mode off; its extra line is the third)
      for (const wdt of [375, 390, 430, 768]) {
        const w = await open(bw, { viewport: { width: wdt, height: 900 }, isMobile: true, hasTouch: true }, BASE);
        await w.p.waitForTimeout(800);
        const n = await w.p.evaluate(() => { document.querySelector('[data-tab="launches"]').click(); const m = document.querySelector('#rowsMore'); if (m && !m.hidden) m.click();
          return [...document.querySelectorAll('#rows .r-head')].map((h) => { const rs = []; for (const e of h.querySelectorAll('.r-sn,.r-tag,.r-veh,.r-nerd,.r-day,.r-cd')) for (const rc of e.getClientRects()) if (rc.height) rs.push([rc.top, rc.bottom]);
            rs.sort((a, c) => a[0] - c[0]); const L = []; for (const r of rs) { const l = L.find((x) => Math.min(x[1], r[1]) - Math.max(x[0], r[0]) > 0.4 * Math.min(x[1] - x[0], r[1] - r[0])); if (l) { l[0] = Math.min(l[0], r[0]); l[1] = Math.max(l[1], r[1]); } else L.push(r.slice()); } return L.length; }); });
        ok(n.length > 0 && Math.max(...n) <= 2, wdt + ': launch rows over two lines ' + JSON.stringify(n));
        await w.ctx.close();
      }
    } finally { await bw.close(); }
  } finally {
    await b.close(); server.kill();
  }
  console.log(fails ? `SMOKE FAILED: ${fails} of ${checks} checks` : `SMOKE PASSED: ${checks} checks`);
  process.exit(fails ? 1 : 0);
})();

// a PNG decoded to RGBA (8 bit RGB or RGBA, no interlace: what Chromium's screenshots are), with zlib from Node
async function decode(buf) {
  const zlib = require('zlib');
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = ct === 6 ? 4 : 3, stride = w * bpp, d = Buffer.alloc(w * h * 4); let prev = Buffer.alloc(stride);
  const pa = (a, b, c) => { const q = a + b - c, x = Math.abs(q - a), y = Math.abs(q - b), z = Math.abs(q - c); return x <= y && x <= z ? a : y <= z ? b : c; };
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = line[x];
      cur[x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : v + pa(a, b, c)) & 255; }
    for (let x = 0; x < w; x++) { d[(y * w + x) * 4] = cur[x * bpp]; d[(y * w + x) * 4 + 1] = cur[x * bpp + 1]; d[(y * w + x) * 4 + 2] = cur[x * bpp + 2]; d[(y * w + x) * 4 + 3] = 255; }
    prev = cur; }
  return { w, h, d };
}
