// The distant planet on the home hero (assets/planet/SOURCES.md): node tests/planet.cjs (serves dist/ itself; Playwright as in smoke.cjs).
// CI runs it after the smoke test. Every outside host is refused, so nothing leaves the machine.
//   placement   at 390 (3x), 768, 1024, 1440, 1920 and 2560, for the default and the ?hero=earth comparison: the planet is on screen, on
//               the right and in the upper part of the hero, its disc 90 to 120 px across from 1200 px and 56 to 72 px on a phone (George, 18
//               November: a penny at arm's length), and its disc touches no text, no
//               countdown, no button and no fact
//   named       its alt text is "A distant planet in space", and nothing about it calls it Earth (it is an invented world)
//   sharp       the picture the browser picks has at least as many pixels as the screen shows (device pixels), so it is never enlarged
//   steady      no layout shift while the page and the picture load (both options)
//   fast        on a throttled phone (4x CPU, slow 4G) the largest paint comes under 2.5 s, and the planet is not what holds it up
//   offline     after one visit the planet comes from the service worker with the network gone
//   ?hero=none  takes the planet away (for comparing)
const { spawn } = require('child_process');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const DIST = path.join(__dirname, '..', 'dist'), PORT = +(process.env.PORT || 8153), BASE = `http://127.0.0.1:${PORT}/`;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };

async function ctxOf(b, w, extra) {
  const phone = w < 700;
  const c = await b.newContext({ viewport: { width: w, height: phone ? 844 : w > 2000 ? 1440 : w === 768 ? 1024 : 900 }, deviceScaleFactor: phone ? 3 : 1,
    isMobile: phone, hasTouch: phone, serviceWorkers: 'block', ...(extra || {}) });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (r) => r.abort());
  return c;
}

(async () => {
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const errs = [], lcps = {};
  try {
    for (const mode of ['', 'earth']) {
      for (const w of [390, 768, 1024, 1440, 1920, 2560]) {
        const c = await ctxOf(b, w), p = await c.newPage();
        p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
        await p.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
        await p.goto(BASE + (mode ? '?hero=' + mode : ''), { waitUntil: 'load' });
        for (let i = 0; i < 40 && !(await p.evaluate(() => { const i = document.querySelector('.hero-planet img'); return !!(i && i.complete && i.naturalWidth > 0); })); i++) await p.waitForTimeout(250);
        await p.waitForTimeout(1400);
        const g = await p.evaluate(() => {
          const e = document.querySelector('.hero-planet'), img = e && e.querySelector('img');
          if (!e || !e.getClientRects().length) return null;
          const er = e.getBoundingClientRect(), rad = er.width / 1.3 / 2, cx = er.left + er.width / 2, cy = er.top + er.height / 2;
          const hits = [];
          const sel = 'header a, header summary, .hero-top > *, h1, #heroSub, .count, .hero-actions a, .hero-actions button, .hero-actions summary, .hero-facts > *, #heroNext li, .hn-all, .hn-h';
          for (const t of document.querySelectorAll(sel)) {
            if (!t.getClientRects().length || t.closest('.hero-planet') || (t.checkVisibility && !t.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }))) continue;
            const r = t.getBoundingClientRect(); if (r.width < 1 || getComputedStyle(t).visibility === 'hidden') continue;
            const nx = Math.max(r.left, Math.min(cx, r.right)), ny = Math.max(r.top, Math.min(cy, r.bottom));
            if (Math.hypot(nx - cx, ny - cy) < rad) hits.push((t.id || t.tagName.toLowerCase() + '.' + String(t.className).split(' ')[0]));
          }
          // the device pixels the browser's choice has across the disc, against the device pixels it covers
          const m = /planet-(\d+)\./.exec(img.currentSrc || ''), srcW = m ? +m[1] : 0;
                    return { size: er.width, heroW: document.querySelector('.hero').getBoundingClientRect().width, vw: innerWidth, right: er.right, left: er.left, top: er.top,
            hits, srcW, need: er.width * devicePixelRatio, cls: window.__cls, alt: img.alt, label: [e.getAttribute('aria-label'), e.title, img.title].join(' '),
            bg: getComputedStyle(e).backgroundImage, picVis: getComputedStyle(img).visibility };
        });
        const tag = `${mode || 'planet'} ${w}`;
        ok(g, `${tag}: no planet on the hero`);
        if (!g) { await c.close(); continue; }
        ok(g.left > g.vw * 0.5, `${tag}: the planet is on the right (${Math.round(g.left)} of ${g.vw})`);
        const disc = g.size / 1.3;  // the picture is 1.3 times the disc, for its soft glow
        if (w >= 1200) ok(disc >= 89.5 && disc <= 120.5, `${tag}: the planet's disc is ${Math.round(disc)} px across`);
        ok(g.top < 320, `${tag}: the planet sits in the upper part of the hero (its top at ${Math.round(g.top)} px)`);
        if (w < 700) ok(disc >= 55.5 && disc <= 72.5, `${tag}: the phone's planet is ${Math.round(disc)} px across`);
        ok(g.hits.length === 0, `${tag}: the planet covers ${g.hits.join(', ')}`);
        ok(g.alt === 'A distant planet in space' && !/earth/i.test(g.alt + g.label), `${tag}: the planet's alt text is "${g.alt}"`);
        if (!mode) ok(g.srcW >= g.need * 0.98 && g.bg === 'none' && g.picVis === 'visible', `${tag}: the picture (${g.srcW} px) is enlarged to ${Math.round(g.need)} device px`);
        else ok(/earth-840/.test(g.bg) && g.picVis === 'hidden' && 840 >= g.need * 0.98, `${tag}: the comparison shows NASA's Earth (${g.bg.slice(0, 80)})`);
        // the planet adds no shift: compare with the same page without it (?hero=none), which has the hero's own small shift as the script starts
        // (main's own shift comes and goes: the Recent launches strip arriving, 0.04 at 768), so the larger of two runs
        let base = 0;
        for (let k = 0; k < 2; k++) {
          const c0 = await ctxOf(b, w), p0 = await c0.newPage();
          await p0.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
          await p0.goto(BASE + '?hero=none', { waitUntil: 'load' }); await p0.waitForTimeout(2200);
          base = Math.max(base, await p0.evaluate(() => window.__cls)); await c0.close();
        }
        ok(g.cls <= base + 0.005 && g.cls < 0.05, `${tag}: layout shift ${g.cls.toFixed(4)} (without the planet ${base.toFixed(4)})`);
        await c.close();
      }
    }
    // the markup and metadata never call the planet Earth: the planet's element, the head's meta tags and the title
    {
      const html = await (await fetch(BASE)).text();
      const el = (/<!--PLANET-->[\s\S]*?<!--\/PLANET-->/.exec(html) || [''])[0];
      ok(el && !/earth/i.test(el), 'the planet markup does not say Earth: ' + el.slice(0, 120));
      const meta = (html.match(/<meta [^>]*>/g) || []).filter((m) => !/image:alt/.test(m)).join(' ') + ((/<title>.*?<\/title>/.exec(html) || [''])[0]);
      ok(!/earth/i.test(meta), 'no meta tag or title says Earth (the share image is a real NASA photo of Earth, so its alt text may)');
    }
    // ?hero=none: the comparison without the planet
    {
      const c = await ctxOf(b, 1440), p = await c.newPage();
      await p.goto(BASE + '?hero=none', { waitUntil: 'load' }); await p.waitForTimeout(500);
      ok(await p.evaluate(() => !document.querySelector('.hero-planet').getClientRects().length), '?hero=none hides the planet');
      await c.close();
    }
    // the largest paint on a throttled phone, for each option, against the page without the planet. The build writes the first launch
    // into the hero; once that launch is past (the mock's first one leaves the list 10 minutes after the build) the page hides the hero
    // until its script starts (class dl), on main too, so the absolute 2.5 s holds only when the hero the build wrote is still current
    // three loads of each, compared by their medians: one load on a busy machine can be 300 ms off on its own
    for (const q of ['', '?hero=earth', '?hero=none']) {
      const rs = [];
      for (let k = 0; k < 3; k++) {
        const c = await ctxOf(b, 390), p = await c.newPage(), cdp = await c.newCDPSession(p);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
        await p.addInitScript(() => { window.__dl = false; new MutationObserver(() => { if (document.documentElement && document.documentElement.classList.contains('dl')) window.__dl = true; }).observe(document, { attributes: true, subtree: true, childList: true }); window.__lcp = 0; window.__lcpEl = ''; new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__lcp = e.startTime; window.__lcpEl = e.element ? (e.element.id || e.element.tagName + '.' + e.element.className) : (e.url || ''); } }).observe({ type: 'largest-contentful-paint', buffered: true }); });
        await p.goto(BASE + q, { waitUntil: 'load' }); await p.waitForTimeout(2000);
        rs.push(await p.evaluate(() => ({ lcp: window.__lcp, el: window.__lcpEl, dl: window.__dl })));
        await c.close();
      }
      rs.sort((x, y) => x.lcp - y.lcp);
      const r = rs[1];
      console.log(`  phone LCP ${q || 'planet'} (4x CPU, slow 4G, median of ${rs.map((x) => Math.round(x.lcp)).join(', ')}): ${Math.round(r.lcp)} ms, ${r.el}${r.dl ? ' (the build is older than its first launch: hero hidden until boot)' : ''}`);
      lcps[q] = r.lcp;
      if (!r.dl) ok(r.lcp > 0 && r.lcp < 2500, `phone LCP under 2.5 s ${q || 'planet'}: ${Math.round(r.lcp)} ms`);
      for (const x of rs) ok(!/(planet|earth)-\d/.test(x.el), `the planet is not the phone's largest paint ${q || 'planet'} (${x.el})`);
    }
    // the default planet only: ?hero=earth is a comparison for review, not what a visitor gets (its time is logged above)
    for (const q of ['']) ok(lcps[q] <= lcps['?hero=none'] + 300, `the planet adds no delay to the largest paint ${q || 'planet'}: ${Math.round(lcps[q])} ms against ${Math.round(lcps['?hero=none'])} ms`);
    // offline after one visit: the planet from the service worker
    {
      const OP = PORT + 1, OB = `http://127.0.0.1:${OP}/`;
      const s2 = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(__dirname, 'serve.py'), DIST, String(OP)], { stdio: 'ignore' });
      await new Promise((r) => setTimeout(r, 900));
      const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
      await c.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (r) => r.abort());
      const p = await c.newPage();
      await p.goto(OB, { waitUntil: 'load' }); await p.evaluate(() => navigator.serviceWorker.ready);
      await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1500);
      s2.kill(); await new Promise((r) => setTimeout(r, 600));
      try { await p.reload({ waitUntil: 'load', timeout: 30000 }); } catch (e) {}
      await p.waitForTimeout(1500);
      const off = await p.evaluate(() => { const i = document.querySelector('.hero-planet img'); return i && i.complete && i.naturalWidth > 0; });
      ok(off, 'offline after one visit, the planet still shows');
      await c.close();
    }
  } finally {
    ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
    await b.close(); server.kill();
  }
  console.log(`planet: ${checks - fails}/${checks} checks passed`); process.exit(fails ? 1 : 0);
})();
