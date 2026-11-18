// George's issues (docs/FLOW.md, "George's issues") in a real browser: node tests/issues.cjs (serves dist/ itself; Playwright as in smoke.cjs).
// CI runs it after flow.cjs. Every outside host is refused or answered from a fixture, so nothing leaves the machine.
//   text and words  every kind of page at 390 and 2560: no text under 13 px on a phone or 14 px on a desktop; no UTC outside Nerd mode; no
//                   "undefined", "null", "NaN" or a raw launch id; never "too far" (a daytime launch is Unlikely with "daylight")
//   sky view        the play row never meets the heading labels under the horizon, at 320, 360, 375, 390 and 430 wide
//   never blank     a page that cannot load shows "Couldn't load this page" with Try again (the service worker, offline); a script that
//                   fails before the main page is drawn shows its "Couldn't load" line and the page the build wrote
//   fresh data      with the deploy's copy hours old and no feed Worker, the page asks Launch Library 2 itself and says Live data
//   every control   each visible button, summary and tab on the main page and a launch page changes something when clicked
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist'), PORT = +(process.env.PORT || 8151), BASE = `http://127.0.0.1:${PORT}/`;
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };
const feed = JSON.parse(fs.readFileSync(path.join(DIST, 'launches.json'), 'utf8'));
const IDS = [...(feed.launches || []), ...(feed.recent || [])].map((l) => l.id).filter((x) => x && x.length > 5);
const lp = fs.readdirSync(path.join(DIST, 'launch'));
const up = feed.launches.find((l) => l.st !== 'flight' && Date.parse(l.utc) > Date.now() + 3600e3 && lp.includes(l.id)) || { id: lp[0] };
const flown = (feed.recent || []).find((l) => lp.includes(l.id));
const pads = fs.existsSync(path.join(DIST, 'pad')) ? fs.readdirSync(path.join(DIST, 'pad')) : [];
const PAGES = ['?p', 'launch/' + up.id + '/', flown && 'launch/' + flown.id + '/', 'live/', 'news/', 'guide/', 'spacecoast/', 'vandenberg/', 'starbase/',
  pads[0] && 'pad/' + pads[0] + '/', 'tonight/', 'astro/', 'logbook/', 'provider/', 'provider/spacex/', 'about/', 'privacy/', 'data/'].filter(Boolean);

async function ctxOf(b, o, extra) {
  // a visitor in New York: GitHub's runner is in UTC, where the page rightly writes a local time as "UTC", so the "no UTC outside Nerd
  // mode" check needs a visitor whose zone is not UTC (a page that printed UTC times to a New York visitor still fails)
  const c = await b.newContext({ serviceWorkers: 'block', timezoneId: 'America/New_York', ...o, ...(extra || {}) });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (r) => r.abort());
  return c;
}

(async () => {
  const server = spawn(PY, [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const errs = [];
  try {
    // ---------------------------------------------------------------- text and words, every page, Details and a row open
    for (const [nm, o, min] of [['390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 13], ['2560', { viewport: { width: 2560, height: 1440 } }, 14]]) {
      const c = await ctxOf(b, o); await c.addInitScript(() => { try { localStorage.setItem('radar.zip', '"32780"'); } catch (e) {} });
      const p = await c.newPage(); p.on('pageerror', (e) => errs.push(p.url() + ' ' + e.message.slice(0, 120)));
      for (const pg of PAGES) {
        await p.goto(BASE + pg, { waitUntil: 'load' }); await p.waitForTimeout(900);
        await p.evaluate(() => { document.querySelectorAll('main details:not(#heroMore)').forEach((d) => { d.open = true; }); const r = document.querySelector('#rows [data-open]'); if (r) r.click(); });
        await p.waitForTimeout(300);
        const r = await p.evaluate(([min, ids]) => {
          const vis = (e) => { const s = getComputedStyle(e); return e.getClientRects().length && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0 && !e.closest('[hidden],.sr,[aria-hidden="true"]'); };
          const out = { small: [], words: [], utc: [], far: [] };
          const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
          while ((t = tw.nextNode())) {
            const s = t.textContent.trim(), e = t.parentElement; if (!s || !e || e.closest('script,style,noscript') || !vis(e)) continue;
            const rc = e.getBoundingClientRect(); if (rc.width < 2 || rc.height < 2) continue;
            // svg text: the size it is drawn at
            let f = parseFloat(getComputedStyle(e).fontSize); const svg = e.closest('svg');
            if (svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) f *= svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
            if (f > 0 && f < min - 0.05) out.small.push(Math.round(f * 10) / 10 + 'px "' + s.slice(0, 24) + '"');
            if (/\b(undefined|null|NaN)\b/.test(s)) out.words.push(s.slice(0, 50));
            for (const id of ids) if (s.includes(id)) { out.words.push('id ' + id); break; }
            if (/\bUTC\b/.test(s) && !e.closest('[class*="nerd"]')) out.utc.push(s.slice(0, 50));
            if (/too far/i.test(s)) out.far.push(s.slice(0, 60));
          }
          return out;
        }, [min, IDS]);
        ok(!r.small.length, `${nm} /${pg}: text under ${min} px ${JSON.stringify(r.small.slice(0, 4))}`);
        ok(!r.words.length, `${nm} /${pg}: undefined, null, NaN or an id shows ${JSON.stringify(r.words.slice(0, 3))}`);
        ok(!r.utc.length, `${nm} /${pg}: UTC outside Nerd mode ${JSON.stringify(r.utc.slice(0, 3))}`);
        ok(!r.far.length, `${nm} /${pg}: "too far" ${JSON.stringify(r.far)}`);
      }
      await c.close();
    }
    // ---------------------------------------------------------------- never assume a ZIP: nothing saved, the main page, then a launch page
    {
      const c = await ctxOf(b, { viewport: { width: 1440, height: 900 } });
      const p = await c.newPage();
      await p.goto(BASE, { waitUntil: 'load' }); await p.waitForTimeout(3500);  // past the ZIP table's arrival
      const kept = await p.evaluate(() => [localStorage.getItem('radar.zip'), localStorage.getItem('radar.zipinfo')]);
      ok(!kept[0] && !kept[1], 'with no ZIP set, the main page saves none ' + JSON.stringify(kept));
      await p.goto(BASE + 'launch/' + up.id + '/', { waitUntil: 'load' }); await p.waitForTimeout(1200);
      const lu = await p.evaluate(() => ({ zip: (document.getElementById('luZip') || {}).value || '', out: ((document.getElementById('luOut') || {}).textContent || '').slice(0, 80) }));
      ok(!lu.zip && !/\bfrom \d{5}\b/.test(lu.out), 'a launch page then asks for a ZIP instead of assuming one ' + JSON.stringify(lu));
      await c.close();
    }
    // ---------------------------------------------------------------- the sky view: the play row clear of the heading labels
    for (const w of [320, 360, 375, 390, 430]) {
      const c = await ctxOf(b, { viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
      await c.addInitScript(() => { try { localStorage.setItem('radar.zip', '"32780"'); } catch (e) {} });
      const p = await c.newPage(); await p.goto(BASE + '?test&launch=' + up.id, { waitUntil: 'load' }); await p.waitForTimeout(1200);
      await p.evaluate(() => { const d = document.querySelector('#skyDet'); if (d) d.open = true; window.dispatchEvent(new Event('resize')); });
      await p.waitForTimeout(700);
      const g = await p.evaluate(() => { const cv = document.getElementById('skyc'), ctl = document.querySelector('.sky-ctl'); if (!cv || !ctl || !cv.getClientRects().length || !window.__radar) return null;
        const s = window.__radar.sky(), cr = cv.getBoundingClientRect(), tr = ctl.getBoundingClientRect(); return { hy: s.hy, ctlTop: tr.top - cr.top, h: cr.height }; });
      if (g) ok(g.ctlTop >= g.hy + 46, `${w}: the play row starts ${Math.round(g.ctlTop - g.hy)} px under the horizon (the labels need 46) ${JSON.stringify(g)}`);
      else console.log(`  (${w}: no sky view for this launch)`);
      await c.close();
    }
    // ---------------------------------------------------------------- never blank: offline, and a script that fails
    {
      // a server of its own, stopped halfway: the browser's offline switch does not reach the service worker's own requests, a dead
      // server does (as a phone that loses its signal)
      const OP = PORT + 1, OB = `http://127.0.0.1:${OP}/`;
      const os2 = spawn(PY, [path.join(__dirname, 'serve.py'), DIST, String(OP)], { stdio: 'ignore' });
      await new Promise((r) => setTimeout(r, 900));
      const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await c.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (r) => r.abort());
      const p = await c.newPage();
      await p.goto(OB, { waitUntil: 'load' });
      await p.evaluate(() => navigator.serviceWorker.ready);
      await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
      os2.kill(); await new Promise((r) => setTimeout(r, 600));
      const BASE = OB;
      const other = lp.find((id) => id !== up.id) || up.id;
      try { await p.goto(BASE + 'launch/' + other + '/', { waitUntil: 'load', timeout: 30000 }); } catch (e) {}
      await p.waitForTimeout(500);
      const t = await p.evaluate(() => ({ h1: (document.querySelector('h1') || {}).textContent || '', again: !!document.querySelector('a.btn[href=""]'), bar: !!document.querySelector('.tabbar') }));
      ok(t.h1 === "Couldn't load this page" && t.again && t.bar, 'offline, a page not saved says it could not load, with Try again and the bar ' + JSON.stringify(t));
      try { await p.goto(BASE, { waitUntil: 'load', timeout: 30000 }); } catch (e) {}
      ok(await p.evaluate(() => !!document.querySelector('#heroTitle') && document.querySelector('#heroTitle').textContent.trim().length > 0), 'offline, the main page opens from its saved copy');
      await c.close();
    }
    {
      const c = await ctxOf(b, { viewport: { width: 390, height: 844 } });
      await c.route(/\/app-[0-9a-f]+\.js$/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'throw new Error("broken on purpose")' }));
      const p = await c.newPage(); await p.goto(BASE, { waitUntil: 'load' }); await p.waitForTimeout(1500);
      const s = await p.evaluate(() => ({ fail: document.documentElement.classList.contains('bootfail'), msg: (document.getElementById('bootFail') || {}).offsetHeight || 0, title: (document.querySelector('#heroTitle') || {}).textContent || '', mainShown: getComputedStyle(document.querySelector('main')).visibility }));
      ok(s.fail && s.msg > 0 && s.title.trim() && s.mainShown === 'visible', 'a failed script shows the Couldn\'t load line over the page the build wrote ' + JSON.stringify(s));
      await c.close();
    }
    // ---------------------------------------------------------------- fresh data from Launch Library 2 when the copy is old
    {
      const tmp = path.join(os.tmpdir(), 'astro-issues-ll2.json');
      execFileSync(PY, [path.join(__dirname, 'make_mock_ll2.py'), tmp], { stdio: 'ignore' });
      const raw = fs.readFileSync(tmp, 'utf8');
      const old = JSON.parse(JSON.stringify(feed)); old.generated = new Date(Date.now() - 5 * 3600e3).toISOString().replace(/\.\d+Z$/, 'Z');
      const c = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
      let asked = 0;
      await c.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (r) => { if (/ll\.thespacedevs\.com/.test(r.request().url())) { asked++; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: raw }); } return r.abort(); });
      await c.route(/\/launches\.json/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(old) }));
      await c.route((u) => u.origin + u.pathname === BASE, async (r) => { const res = await r.fetch(), body = (await res.text()).replace(/(<script type="application\/json" id="feeddata">)[\s\S]*?(<\/script>)/, (m, a, z) => a + JSON.stringify(old).replace(/</g, '\\u003c') + z); await r.fulfill({ response: res, body }); });
      const p = await c.newPage(); p.on('pageerror', (e) => errs.push('ll2 ' + e.message.slice(0, 120)));
      await p.goto(BASE, { waitUntil: 'load' });
      let tag = '';
      for (let i = 0; i < 40 && !/^Live data/.test(tag); i++) { await p.waitForTimeout(250); tag = await p.evaluate(() => (document.getElementById('dataTag') || {}).textContent || ''); }
      ok(asked >= 1 && /^Live data/.test(tag), `a copy 5 h old: the page asks Launch Library 2 (${asked}) and says "${tag}"`);
      await c.close();
      // and with Launch Library refusing, the old copy says when it is from, calmly
      const c2 = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
      await c2.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (r) => r.abort());
      await c2.route(/\/launches\.json/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(old) }));
      await c2.route((u) => u.origin + u.pathname === BASE, async (r) => { const res = await r.fetch(), body = (await res.text()).replace(/(<script type="application\/json" id="feeddata">)[\s\S]*?(<\/script>)/, (m, a, z) => a + JSON.stringify(old).replace(/</g, '\\u003c') + z); await r.fulfill({ response: res, body }); });
      const p2 = await c2.newPage(); await p2.goto(BASE, { waitUntil: 'load' }); await p2.waitForTimeout(2500);
      const t2 = await p2.evaluate(() => (document.getElementById('dataTag') || {}).textContent || '');
      ok(/^Updated /.test(t2) && !/delayed|Live data/i.test(t2), `with nowhere fresher, the old copy says "${t2}"`);
      await c2.close();
    }
    // ---------------------------------------------------------------- every visible control does something
    for (const pg of ['?p', 'launch/' + up.id + '/']) {
      const c = await ctxOf(b, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await c.addInitScript(() => { try { localStorage.setItem('radar.zip', '"32780"'); } catch (e) {} window.open = function () { window.__opened = 1; return null; }; });
      const p = await c.newPage();
      await p.goto(BASE + pg, { waitUntil: 'load' }); await p.waitForTimeout(800);
      const SEL = 'main button, main summary, main [role="button"], main [role="tab"]';
      const n = await p.locator(SEL).count();
      let tried = 0;
      for (let i = 0; i < n; i++) {
        await p.goto(BASE + pg, { waitUntil: 'load' }); await p.waitForTimeout(500);
        const el = p.locator(SEL).nth(i);
        if (!(await el.isVisible())) continue;
        const name = ((await el.textContent()) || (await el.getAttribute('aria-label')) || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        await el.scrollIntoViewIfNeeded();
        await p.evaluate(() => { window.__m = 0; window.__u = location.href; window.__y = scrollY; window.__f = document.activeElement; new MutationObserver((l) => { window.__m += l.length; }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); });
        try { await el.click({ timeout: 3000 }); } catch (e) { ok(false, `/${pg}: "${name}" cannot be clicked`); continue; }
        await p.waitForTimeout(400);
        let d; try { d = await p.evaluate(() => ({ m: window.__m, u: location.href !== window.__u, y: Math.abs(scrollY - window.__y) > 4, f: document.activeElement !== window.__f, o: !!window.__opened })); } catch (e) { d = { u: true }; }
        ok(d.m > 0 || d.u || d.y || d.f || d.o, `/${pg}: "${name}" does nothing visible ${JSON.stringify(d)}`);
        tried++;
      }
      console.log(`  controls on /${pg}: ${tried} clicked`);
      await c.close();
    }
  } finally {
    ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
    await b.close(); server.kill();
  }
  console.log(`issues: ${checks - fails}/${checks} checks passed`); process.exit(fails ? 1 : 0);
})();
