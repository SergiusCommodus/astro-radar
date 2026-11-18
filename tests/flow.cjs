// One navigation in a real browser: node tests/flow.cjs (serves dist/ itself; Playwright as in smoke.cjs). CI runs it after live.cjs.
// Every outside host is refused, so nothing leaves the machine. It clicks what docs/FLOW.md promises:
//   the bar     on a phone (390) the bottom bar's Next, Launches, Go watch, Space now and every More item, from the main page and from other
//               pages, each landing where its name says (Launches with the list in view, not the top of the hero); on a desktop (1440 and
//               2560) the top bar's the same, in the same order; every bar control and More item at least 44 px; no sideways scroll
//   two taps    a launch page from the main page: Launches, then the row's own page link; Back returns to the list
//   the way up  a guide, a pad and a provider page each go back to their section; a launch page to All launches; its pad to the pad page
//   space now   Live and News one tap apart
//   old links   /#watch opens the list, /#astro the Watch with friends page, /ksc/ the Space Coast
//   ZIP         a ZIP saved by a launch page's Look Up is the radar's (it once read as Miami); a saved ZIP the table lacks asks for one
//   one voice   a launch that is live shows the LIVE badge alone, not Next launch and Go for launch beside it
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist'), PORT = +(process.env.PORT || 8149), BASE = `http://127.0.0.1:${PORT}/`;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };
const JOBS = ['Next', 'Launches', 'Go watch', 'Space now'];
const MORE = { 'Your launches': '/logbook/', 'Watch with friends': '/astro/', 'Providers': '/provider/', 'What was that in the sky?': '/tonight/', 'About': '/about/', 'Privacy': '/privacy/', 'Data sources': '/data/' };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const feed = fs.existsSync(path.join(DIST, 'launches.json')) ? JSON.parse(fs.readFileSync(path.join(DIST, 'launches.json'), 'utf8')) : null;
const pads = fs.existsSync(path.join(DIST, 'pad')) ? fs.readdirSync(path.join(DIST, 'pad')) : [];
const lpages = fs.existsSync(path.join(DIST, 'launch')) ? fs.readdirSync(path.join(DIST, 'launch')) : [];

async function ctxOf(b, o, init) {
  const c = await b.newContext({ ...o, serviceWorkers: 'block' });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (r) => r.abort());
  if (init) await c.addInitScript(init);
  return c;
}
const settle = (p, ms) => p.waitForTimeout(ms || 700);
const where = (p) => p.evaluate(() => ({ path: location.pathname, hash: location.hash, y: Math.round(scrollY), h1: ((document.querySelector('h1:not([hidden])') || {}).textContent || '').trim(),
  launchesOn: (() => { const l = document.getElementById('p-launches'); if (!l || l.hidden) return false; const r = l.getBoundingClientRect(); return r.top < innerHeight * 0.6 && r.bottom > 0; })(),
  wide: document.documentElement.scrollWidth - innerWidth }));
// what each job must land on
function landed(job, w) {
  if (job === 'Next') return w.path === '/' && w.y < 40 && !w.launchesOn;
  if (job === 'Launches') return w.path === '/' && w.launchesOn;
  if (job === 'Go watch') return w.path === '/guide/' && w.h1 === 'Go watch';
  if (job === 'Space now') return w.path === '/live/';
  return false;
}

(async () => {
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const errs = [];
  const watch = (p) => { p.on('pageerror', (e) => errs.push(p.url() + ' ' + e.message.slice(0, 160))); };
  try {
    const FROM = ['', 'live/', 'guide/', 'about/'].concat(lpages.length ? ['launch/' + lpages[0] + '/'] : []).concat(pads.length ? ['pad/' + pads[0] + '/'] : []);
    // ---------------------------------------------------------------- the bottom bar, on a phone
    {
      const c = await ctxOf(b, PHONE), p = await c.newPage(); watch(p);
      for (const from of FROM) {
        for (const job of JOBS) {
          await p.goto(BASE + from, { waitUntil: 'load' }); await settle(p, 400);
          if (from === '') await p.evaluate(() => window.scrollTo(0, 900));  // from further down the page, Next must come back to the top
          const a = p.locator('.tabbar .ptab', { hasText: job }).first();
          ok(await a.isVisible(), `phone /${from}: ${job} is on the bottom bar`);
          const box = await a.boundingBox();
          ok(box && box.height >= 44 && box.width >= 44, `phone /${from}: ${job} is at least 44 px (${box && Math.round(box.height)})`);
          await a.click(); await settle(p, 900);
          const w = await where(p);
          ok(landed(job, w), `phone /${from}: ${job} lands where it says ${JSON.stringify(w)}`);
        }
        // More: the sheet opens above the bar, every item is there and 44 px, and each goes to its page
        await p.goto(BASE + from, { waitUntil: 'load' }); await settle(p, 300);
        await p.locator('.tabbar .tb-more summary').click(); await settle(p, 250);
        const items = await p.evaluate(() => [...document.querySelectorAll('.tabbar .tb-sheet a')].map((a) => { const r = a.getBoundingClientRect(); return { t: a.textContent.trim(), h: r.height, in: r.top >= 0 && r.bottom <= innerHeight, href: a.getAttribute('href') }; }));
        ok(items.map((x) => x.t).join('|') === Object.keys(MORE).join('|'), `phone /${from}: More lists ${items.map((x) => x.t).join(', ')}`);
        ok(items.every((x) => x.h >= 44 && x.in), `phone /${from}: every More item is on screen and 44 px`);
        ok((await where(p)).wide <= 0, `phone /${from}: no sideways scroll with More open`);
        // a tap anywhere else closes it, and the page under it is not clicked
        const y0 = (await where(p)).path;
        await p.mouse.click(30, 300); await settle(p, 300);
        ok(!(await p.evaluate(() => document.querySelector('.tabbar .tb-more').open)) && (await where(p)).path === y0, `phone /${from}: a tap outside closes More`);
        if (from === '' || from === 'live/') {
          for (const [t, u] of Object.entries(MORE)) {
            await p.goto(BASE + from, { waitUntil: 'load' }); await settle(p, 250);
            await p.locator('.tabbar .tb-more summary').click(); await settle(p, 200);
            await p.locator('.tabbar .tb-sheet a', { hasText: t }).first().click(); await settle(p, 500);
            ok((await where(p)).path === u, `phone /${from}: More, ${t} opens ${u}`);
          }
        }
      }
      // the header on a phone is the brand alone: no second set of links over the bottom bar
      for (const from of ['', 'live/']) {
        await p.goto(BASE + from, { waitUntil: 'load' });
        const top = await p.evaluate(() => [...document.querySelectorAll('header .nav-links a, header .tnav a, header .nmore summary, header .tmore summary')].filter((a) => a.getClientRects().length && getComputedStyle(a).visibility !== 'hidden').length);
        ok(top === 0, `phone /${from}: the header shows no links of its own (${top})`);
      }
      await c.close();
    }
    // ---------------------------------------------------------------- the top bar, on a desktop and a wide screen
    for (const width of [1440, 2560]) {
      const c = await ctxOf(b, { viewport: { width, height: width > 2000 ? 1440 : 900 } }), p = await c.newPage(); watch(p);
      for (const from of FROM) {
        await p.goto(BASE + from, { waitUntil: 'load' }); await settle(p, 400);
        const names = await p.evaluate(() => [...document.querySelectorAll('header .nav-links a, header .tnav > a')].filter((a) => a.getClientRects().length).map((a) => a.textContent.trim()));
        ok(names.join('|') === JOBS.join('|'), `${width} /${from}: the top bar reads ${names.join(', ')}`);
        ok(!(await p.locator('.tabbar').isVisible()), `${width} /${from}: no bottom bar on a desktop`);
        for (const job of JOBS) {
          await p.goto(BASE + from, { waitUntil: 'load' }); await settle(p, 300);
          await p.locator('header .nav-links a, header .tnav > a').filter({ hasText: new RegExp('^' + job + '$') }).first().click(); await settle(p, 900);
          const w = await where(p);
          ok(landed(job, w), `${width} /${from}: ${job} lands where it says ${JSON.stringify(w)}`);
        }
        await p.goto(BASE + from, { waitUntil: 'load' }); await settle(p, 300);
        await p.locator('header details summary').first().click(); await settle(p, 200);
        const more = await p.evaluate(() => [...document.querySelectorAll('header details[open] a')].map((a) => a.textContent.trim()));
        ok(more.join('|') === Object.keys(MORE).join('|'), `${width} /${from}: More lists ${more.join(', ')}`);
        await p.mouse.click(40, Math.round((width > 2000 ? 1440 : 900) * 0.7)); await settle(p, 300);
        ok(!(await p.evaluate(() => !!document.querySelector('header details[open]'))), `${width} /${from}: a click outside closes More`);
      }
      await c.close();
    }
    // ---------------------------------------------------------------- a launch page in two taps, and Back to the list
    if (lpages.length) {
      for (const [nm, o] of [['phone', PHONE], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
        const c = await ctxOf(b, o), p = await c.newPage(); watch(p);
        await p.goto(BASE, { waitUntil: 'load' }); await settle(p, 500);
        await (nm === 'phone' ? p.locator('.tabbar .ptab', { hasText: 'Launches' }) : p.locator('header .nav-links a', { hasText: 'Launches' })).first().click(); await settle(p, 800);
        const pg = p.locator('#rows .r-pg').nth(1);
        ok(await pg.isVisible(), `${nm}: a launch row has its own page link`);
        const bx = await pg.boundingBox();
        ok(bx && bx.height >= 44, `${nm}: the row's page link is 44 px`);
        const href = await pg.getAttribute('href');
        await pg.click(); await p.waitForLoadState('load'); await settle(p, 300);
        ok(new URL(p.url()).pathname === '/' + href, `${nm}: tap two is the launch page (${p.url()})`);
        await p.goBack(); await settle(p, 1200);
        const w = await where(p);
        ok(w.path === '/' && w.launchesOn, `${nm}: Back returns to the list ${JSON.stringify(w)}`);
        await c.close();
      }
    }
    // ---------------------------------------------------------------- the way up, the pad, Space now's switch, old links, the moved page
    {
      const c = await ctxOf(b, PHONE), p = await c.newPage(); watch(p);
      const up = async (u, to) => { await p.goto(BASE + u, { waitUntil: 'load' }); const a = p.locator('a.crumb').first(); ok(await a.isVisible(), `/${u} has a way up`); const bx = await a.boundingBox(); ok(bx && bx.height >= 44, `/${u}: its way up is 44 px`); await a.click(); await settle(p, 900); const w = await where(p); return w; };
      for (const u of ['spacecoast/', 'vandenberg/', 'starbase/'].concat(pads.length ? ['pad/' + pads[0] + '/'] : [])) ok((await up(u)).path === '/guide/', `/${u} goes up to Go watch`);
      if (fs.existsSync(path.join(DIST, 'provider', 'spacex'))) ok((await up('provider/spacex/')).path === '/provider/', '/provider/spacex/ goes up to Providers');
      if (lpages.length) {
        const w = await up('launch/' + lpages[0] + '/');
        ok(w.path === '/' && w.launchesOn, 'a launch page goes up to All launches, the list in view ' + JSON.stringify(w));
        let padOk = false;
        for (const id of lpages.slice(0, 8)) {
          await p.goto(BASE + 'launch/' + id + '/', { waitUntil: 'load' });
          const a = p.locator('.lp-head .sub a[href^="/pad/"]').first();
          if (!(await a.count())) continue;
          await a.click(); await settle(p, 500);
          padOk = /^\/pad\/[^/]+\/$/.test(new URL(p.url()).pathname); break;
        }
        ok(padOk, 'a launch page links its pad to the pad page');
      }
      await p.goto(BASE + 'live/', { waitUntil: 'load' });
      await p.locator('.sw2 a', { hasText: 'News' }).click(); await settle(p, 500);
      ok((await where(p)).path === '/news/', 'Live to News in one tap');
      await p.locator('.sw2 a', { hasText: 'Live' }).click(); await settle(p, 500);
      ok((await where(p)).path === '/live/', 'News to Live in one tap');
      await p.goto(BASE + '#watch', { waitUntil: 'load' }); await settle(p, 900);
      ok((await where(p)).launchesOn, 'an old /#watch link opens the launch list');
      await p.goto(BASE + '#astro', { waitUntil: 'load' }); await settle(p, 900);
      ok((await where(p)).path === '/astro/', 'an old /#astro link opens Watch with friends');
      await p.goto(BASE + 'ksc/', { waitUntil: 'load' }); await settle(p, 900);
      ok((await where(p)).path === '/spacecoast/', 'the old Florida page goes to the Space Coast');
      await c.close();
    }
    // ---------------------------------------------------------------- the home ZIP, whoever saved it
    for (const [saved, want] of [['32780', 'Look up from 32780'], ['"32780"', 'Look up from 32780'], ['99999', 'Can you see it?']]) {
      const c = await ctxOf(b, PHONE, `try{if(!sessionStorage.getItem('z')){localStorage.setItem('radar.zip',${JSON.stringify(saved)});sessionStorage.setItem('z','1')}}catch(e){}`);
      const p = await c.newPage(); watch(p);
      await p.goto(BASE, { waitUntil: 'load' });
      let got = '';
      for (let i = 0; i < 30 && got !== want; i++) { await settle(p, 200); got = await p.evaluate(() => (document.getElementById('hfK') || {}).textContent || ''); }
      ok(got === want, `saved radar.zip ${saved}: the hero says "${got}", not Miami`);
      await c.close();
    }
    // ---------------------------------------------------------------- one voice: a live launch is not also Next launch and Go for launch
    if (feed) {
      const live = (feed.launches || []).find((L) => { const t = Date.parse(L.utc); return t && Date.now() - t < 25 * 60000 && Date.now() - t > 0 && L.st !== 'tbd'; });
      if (live) {
        const c = await ctxOf(b, PHONE), p = await c.newPage(); watch(p);
        await p.goto(BASE + '?launch=' + live.id, { waitUntil: 'load' }); await settle(p, 1200);
        const s = await p.evaluate(() => ({ badge: !document.getElementById('heroLive').hidden, kick: !!document.getElementById('heroKicker').getClientRects().length && document.getElementById('heroKicker').textContent.trim() === 'Next launch', st: !!document.getElementById('heroStatus').getClientRects().length }));
        ok(s.badge && !s.kick && !s.st, 'a live launch shows the LIVE badge alone ' + JSON.stringify(s));
        await c.close();
      } else console.log('  (no live launch in the feed: one voice not checked)');
    }
  } finally {
    ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
    await b.close(); server.kill();
  }
  console.log(`flow: ${checks - fails}/${checks} checks passed`); process.exit(fails ? 1 : 0);
})();
