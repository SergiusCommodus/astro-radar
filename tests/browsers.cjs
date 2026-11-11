// Safari and Firefox smoke test: node tests/browsers.cjs   (after python3 build.py; Playwright with WebKit and Firefox:
// `npm i --no-save playwright` in tests/, then `npx playwright install webkit firefox`). BROWSERS=webkit or BROWSERS=firefox runs one.
// Playwright's WebKit is the engine Safari is built on, not iOS Safari itself: it shows layout, script and policy errors, the codec the
// hero loop picks (WebKit takes the MP4 path) and the iPhone layout, but not Low Power Mode, iOS memory limits or real touch scrolling.
// Firefox has no mobile emulation in Playwright, so its phone run is a 390 wide window. Each run checks: no page errors, console errors or
// content security policy violations; the hero title, the launch rows and the four tabs; no sideways scroll; the hero's planet (the
// NASA photograph, AVIF or WebP); a launch page;
// the footer's planet; and the service worker taking control.
const { spawn } = require('child_process');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const DIST = path.join(__dirname, '..', 'dist'), PORT = +(process.env.PORT || 8133), BASE = `http://localhost:${PORT}/`;
const WANT = (process.env.BROWSERS || 'webkit,firefox').split(',');
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };

// one browser and profile; a crash (the page or the browser closing under the test) is a failure of that run, and the others still run
async function run(name, type, nm, o) {
  try { await run1(name, type, nm, o); } catch (e) { ok(false, `${name} ${nm}: the run stopped: ${String(e.message || e).split(/\r?\n/)[0]}`); }
}
async function run1(name, type, nm, o) {
  const b = await type.launch();
  try {
    const ctx = await b.newContext(o);
    await ctx.route('https://api.weather.gov/**', (r) => r.abort());
    const p = await ctx.newPage(), errs = [];
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 200)));
    p.on('console', (m) => { if (m.type() === 'error' && !/weather\.gov|Failed to load resource|NetworkError|net::ERR|access control checks/i.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    const s = await p.evaluate(() => {
      const pi = document.querySelector('#heroPst img');
      return { title: (document.querySelector('#heroTitle') || {}).textContent, rows: document.querySelectorAll('#rows .row').length, cls: document.documentElement.className,
        wide: document.documentElement.scrollWidth - innerWidth, poster: pi && pi.complete && pi.naturalWidth ? pi.currentSrc.split('/').pop() : '', video: document.querySelectorAll('video').length };
    });
    console.log(`  ${name} ${nm}: ${(s.title || '').trim()} | rows ${s.rows} | ${s.cls} | photo ${s.poster || '-'}`);
    ok((s.title || '').trim().length > 0 && s.rows > 0, `${name} ${nm}: hero and rows (${JSON.stringify(s)})`);
    ok(s.wide <= 0, `${name} ${nm}: sideways scroll of ${s.wide} px`);
    if (/\bvid\b/.test(s.cls)) {
      ok(/^hero-(phone|wide)(-3840)?\.(avif|webp)$/.test(s.poster), `${name} ${nm}: the hero photo did not load (${s.poster})`);
      ok(!s.video, `${name} ${nm}: a video element is on the page`);
    } else ok(false, `${name} ${nm}: no hero photo (${s.cls})`);
    for (const tab of ['sky', 'launches', 'watch', 'astro']) {
      await p.evaluate((t) => { const e = document.querySelector('[data-tab="' + t + '"]'); if (e) e.click(); }, tab); await p.waitForTimeout(250);
    }
    await p.evaluate(() => { const e = document.querySelector('[data-tab="sky"]'); if (e) e.click(); scrollTo(0, document.documentElement.scrollHeight); }); await p.waitForTimeout(2500);
    const f = await p.evaluate(() => ({ imgs: [...document.querySelectorAll('#footPlanet img')].filter((i) => i.complete && i.naturalWidth).map((i) => i.currentSrc.split('/').pop()), canvas: !!document.querySelector('#footPlanet canvas'), wide: document.documentElement.scrollWidth - innerWidth }));
    ok(f.imgs.length === 1 && !f.canvas, `${name} ${nm}: the footer planet is missing (${JSON.stringify(f)})`);
    ok(f.wide <= 0, `${name} ${nm}: sideways scroll of ${f.wide} px with every tab visited`);
    const sw = await p.evaluate(async () => { if (!('serviceWorker' in navigator)) return 'none'; const r = await Promise.race([navigator.serviceWorker.ready.then(() => 'ready'), new Promise((x) => setTimeout(() => x('timeout'), 6000))]); return r; });
    ok(sw === 'ready', `${name} ${nm}: the service worker did not start (${sw})`);
    const lp = await p.evaluate(() => { const a = document.querySelector('a[href*="launch/"]'); return a ? a.getAttribute('href') : ''; });
    if (lp) {
      await p.goto(new URL(lp, BASE).href, { waitUntil: 'load' }); await p.waitForTimeout(800);
      const l = await p.evaluate(() => ({ h1: (document.querySelector('h1') || {}).textContent, wide: document.documentElement.scrollWidth - innerWidth }));
      ok((l.h1 || '').trim().length > 0 && l.wide <= 0, `${name} ${nm}: launch page ${lp} (${JSON.stringify(l)})`);
    }
    const csp = await p.evaluate(() => window.__csp);
    ok(errs.length === 0, `${name} ${nm}: errors ${errs.join(' | ')}`);
    ok(csp.length === 0, `${name} ${nm}: policy violations ${csp.join(' | ')}`);
    await ctx.close();
  } finally { await b.close(); }
}

(async () => {
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  try {
    if (WANT.includes('webkit')) {
      await run('webkit', pw.webkit, 'desktop 1440', { viewport: { width: 1440, height: 900 } });
      await run('webkit', pw.webkit, 'iPhone 13', { ...pw.devices['iPhone 13'] });
    }
    if (WANT.includes('firefox')) {
      await run('firefox', pw.firefox, 'desktop 1440', { viewport: { width: 1440, height: 900 } });
      await run('firefox', pw.firefox, 'phone 390', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true });
    }
  } finally { server.kill(); }
  console.log(fails ? `BROWSERS FAILED: ${fails} of ${checks} checks` : `BROWSERS PASSED: ${checks} checks`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
