// The home hero with no planet (noplanet, 21 November 2026: George asked for the planet to go): node tests/hero.cjs (serves dist/ itself;
// Playwright as in smoke.cjs). CI runs it after the smoke test. Every outside host is refused, so nothing leaves the machine.
//   gone        at 390 (3x), 768, 1024, 1440, 1920 and 2560: no planet element, no request for planet/ or earth/ from the main page, no
//               ?hero switch class, and nothing says Terran or ShinyMan on the main page or the Data sources page
//   no gap      the hero's copy keeps no room for a planet: under 1200 px the hero has its normal padding on the right and the top line
//               (logo, kicker) none of its own
//   up next     from 1200 px the Up next column starts at the top of the hero, level with the copy, lists four launches, stays inside the
//               hero and covers no text, countdown, button or fact
//   steady      no layout shift at 390, 1440 and 2560 (the median of three loads under 0.01); the other widths are printed
//   fast        on a throttled phone (4x CPU, slow 4G) the largest paint comes under 2.5 s when the hero the build wrote is current
const { spawn } = require('child_process');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const DIST = path.join(__dirname, '..', 'dist'), PORT = +(process.env.PORT || 8153), BASE = `http://127.0.0.1:${PORT}/`;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3');

async function ctxOf(b, w) {
  const phone = w < 700;
  const c = await b.newContext({ viewport: { width: w, height: phone ? 844 : w > 2000 ? 1440 : w === 768 ? 1024 : 900 }, deviceScaleFactor: phone ? 3 : 1,
    isMobile: phone, hasTouch: phone, serviceWorkers: 'block' });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (r) => r.abort());
  return c;
}
const CLS = () => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); };

(async () => {
  const server = spawn(PY, [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const errs = [];
  try {
    for (const w of [390, 768, 1024, 1440, 1920, 2560]) {
      const tag = '@' + w, c = await ctxOf(b, w), p = await c.newPage(), asked = [];
      p.on('pageerror', (e) => errs.push(tag + ' ' + e.message.slice(0, 120)));
      p.on('request', (r) => { const u = r.url(); if (/\/(planet|earth)\//.test(u)) asked.push(u.replace(BASE, '')); });
      await p.addInitScript(CLS);
      await p.goto(BASE, { waitUntil: 'load' }); await p.waitForTimeout(2200);
      const g = await p.evaluate(() => {
        const r = (e) => { if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top + scrollY, r: b.right, b: b.bottom + scrollY }; };
        const hero = document.querySelector('.hero'), hin = document.querySelector('.hero-in'), top = document.querySelector('.hero-top');
        const next = document.querySelector('#heroNext'), items = [...document.querySelectorAll('#heroNextL li')].filter((li) => li.getClientRects().length);
        const text = ['.hero-top', '#heroTitle', '#heroSub', '.hero .count', '.hero-actions', '.hero-facts', '#heroSrc'].map((s) => r(document.querySelector(s))).filter(Boolean);
        return {
          cls: window.__cls, planet: !!document.querySelector('.hero-planet, [class*="planet"] img, img[src*="planet"]'),
          htmlCls: document.documentElement.className, said: /terran|shinyman/i.test(document.body.innerText),
          hero: r(hero), next: next && !next.hidden ? r(next) : null, n: items.length, copyTop: r(top), text,
          padR: parseFloat(getComputedStyle(hin).paddingRight), topPadR: parseFloat(getComputedStyle(top).paddingRight),
          dl: document.documentElement.classList.contains('dl'),
        };
      });
      ok(!g.planet, `${tag}: no planet element`);
      ok(!/h-nasa|h-noplanet/.test(g.htmlCls), `${tag}: no ?hero class (${g.htmlCls})`);
      ok(!g.said, `${tag}: the main page names no planet pack`);
      ok(asked.length === 0, `${tag}: the main page asks for nothing in planet/ or earth/ (${asked.join(', ')})`);
      if (w < 1200) {
        ok(g.topPadR < 1, `${tag}: the hero's top line keeps no room on its right (${g.topPadR}px)`);
        ok(g.padR <= 64, `${tag}: the hero has its normal padding on the right (${g.padR}px)`);
      } else {
        ok(!!g.next, `${tag}: Up next shows`);
        if (g.next) {
          ok(g.n === 4, `${tag}: Up next lists four launches (${g.n})`);
          ok(Math.abs(g.next.t - g.copyTop.t) <= 24, `${tag}: Up next starts at the top, level with the copy (${Math.round(g.next.t)} against ${Math.round(g.copyTop.t)})`);
          ok(g.next.b <= g.hero.b + 1 && g.next.t >= g.hero.t, `${tag}: Up next stays inside the hero (${Math.round(g.next.b)} against ${Math.round(g.hero.b)})`);
          const hit = g.text.filter((x) => x.l < g.next.r && x.r > g.next.l && x.t < g.next.b && x.b > g.next.t);
          ok(hit.length === 0, `${tag}: Up next covers no hero text (${JSON.stringify(hit)})`);
        }
      }
      // steady: three loads, the median
      const loads = [g.cls];
      for (let k = 0; k < 2; k++) {
        const c0 = await ctxOf(b, w), p0 = await c0.newPage();
        await p0.addInitScript(CLS); await p0.goto(BASE, { waitUntil: 'load' }); await p0.waitForTimeout(2200);
        loads.push(await p0.evaluate(() => window.__cls)); await c0.close();
      }
      const med = loads.slice().sort((x, y) => x - y)[1];
      console.log(`  ${tag}: layout shift ${loads.map((x) => x.toFixed(4)).join(', ')}${g.dl ? ' (hero hidden until boot)' : ''}`);
      if ([390, 1440, 2560].includes(w)) ok(med < 0.01, `${tag}: no layout shift (median ${med.toFixed(4)})`);
      await c.close();
    }
    // the Data sources page credits no planet pack, and no planet file is published
    {
      const html = await (await fetch(BASE + 'data/')).text();
      ok(!/terran planet|shinyman|hero=earth/i.test(html), 'the Data sources page credits no planet');
      for (const f of ['planet/planet-320.avif', 'planet/planet-160.webp', 'earth/earth-840.avif']) ok((await fetch(BASE + f)).status === 404, f + ' is not published');
    }
    // the largest paint on a throttled phone (three loads, the median; the absolute limit holds only when the build's hero is current)
    {
      const rs = [];
      for (let k = 0; k < 3; k++) {
        const c = await ctxOf(b, 390), p = await c.newPage(), cdp = await c.newCDPSession(p);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
        await p.addInitScript(() => {
          window.__dl = false; new MutationObserver(() => { if (document.documentElement && document.documentElement.classList.contains('dl')) window.__dl = true; }).observe(document, { attributes: true, subtree: true, childList: true });
          window.__lcp = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__lcp = e.startTime; window.__lcpEl = e.element ? e.element.tagName + '.' + e.element.className : ''; } }).observe({ type: 'largest-contentful-paint', buffered: true });
        });
        await p.goto(BASE, { waitUntil: 'load' }); await p.waitForTimeout(2000);
        rs.push(await p.evaluate(() => ({ lcp: window.__lcp, el: window.__lcpEl, dl: window.__dl })));
        await c.close();
      }
      rs.sort((x, y) => x.lcp - y.lcp);
      const r = rs[1];
      console.log(`  phone LCP (4x CPU, slow 4G, median of ${rs.map((x) => Math.round(x.lcp)).join(', ')}): ${Math.round(r.lcp)} ms, ${r.el}${r.dl ? ' (the build is older than its first launch: hero hidden until boot)' : ''}`);
      if (!r.dl) ok(r.lcp > 0 && r.lcp < 2500, `phone LCP under 2.5 s: ${Math.round(r.lcp)} ms`);
    }
  } finally {
    ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
    await b.close(); server.kill();
  }
  console.log(`hero: ${checks - fails}/${checks} checks passed`); process.exit(fails ? 1 : 0);
})();
