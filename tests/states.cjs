// Empty, error and stale states: node tests/states.cjs   (after a build with a feed: python3 build.py with dist/launches.json)
// The page is served as built, but the test rewrites what it gets: the feed the build inlined (#feeddata) and launches.json, so each run
// starts from a known state without a rebuild. Checked at 390 and 1440, with no errors, policy violations or sideways scroll in any state:
//   down, malformed, empty   no inlined feed and a launches.json that fails, is cut off or lists nothing: sample data, said plainly
//   slow                     the loading state first, then (after the 10 s limit) sample data
//   stale                    a copy generated hours ago, or one the Worker marks stale: "Data delayed", never "Live data"
//   poll fails               good data, then a failed refresh: the good data stays, never swapped for the sample
//   statuses                 a time to be confirmed, a hold, a launch gone 40 minutes ago (dropped from the list)
//   scrub                    a launch within a day moved 2 hours later: a toast says where it moved, the row follows
//   daylight saving          Florida launches either side of the end of daylight saving time read EDT and EST
//   distances                every distance through distTxt: whole miles and km, half up, thousands separators
// Needs Playwright (as tests/smoke.cjs).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const DIST = path.join(__dirname, '..', 'dist'), PORT = +(process.env.PORT || 8134), BASE = `http://127.0.0.1:${PORT}/`;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

const built = JSON.parse(fs.readFileSync(path.join(DIST, 'launches.json'), 'utf-8'));
const T = built.launches.find((l) => l.tz === 'America/New_York' && l.st === 'go') || built.launches[0];
const mk = (id, ms, over) => ({ ...JSON.parse(JSON.stringify(T)), id, utc: iso(ms), st: 'go', mis: 'States test ' + id, ...over });
const feed = (launches, over) => ({ ...built, generated: iso(Date.now()), launches, recent: [], ...over });

async function page(b, o, { inline, file, delay = 0, clock, tz }) {
  const ctx = await b.newContext({ ...o, serviceWorkers: 'block', ...(tz ? { timezoneId: tz } : {}) });
  await ctx.route('https://api.weather.gov/**', (r) => r.abort());
  let fileNow = file;
  await ctx.route(/\/launches\.json/, async (r) => {
    if (delay) await new Promise((x) => setTimeout(x, delay));
    const f = typeof fileNow === 'function' ? fileNow() : fileNow;
    if (f && f.status) return r.fulfill({ status: f.status, body: 'error' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: typeof f === 'string' ? f : JSON.stringify(f) });
  });
  await ctx.route((u) => u.origin + u.pathname === BASE, async (r) => {
    const res = await r.fetch(), body = (await res.text()).replace(/(<script type="application\/json" id="feeddata">)[\s\S]*?(<\/script>)/,
      (m, a, c) => a + JSON.stringify(inline === undefined ? null : inline).replace(/</g, '\\u003c') + c);
    await r.fulfill({ response: res, body });
  });
  const p = await ctx.newPage(), errs = [];
  if (clock) await p.clock.install({ time: clock });
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error' && !/weather\.gov|Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await p.goto(BASE + '?test', { waitUntil: 'load' });
  for (let i = 0; i < 40 && !(await p.evaluate(() => !!window.__radar && !!document.querySelector('#rows .row'))); i++) await p.waitForTimeout(250);
  return { ctx, p, errs, setFile: (f) => { fileNow = f; } };
}
const tag = (p) => p.evaluate(() => document.querySelector('#dataTag').textContent.trim());
async function common(nm, w) {
  const s = await w.p.evaluate(() => ({ rows: document.querySelectorAll('#rows .row').length, title: document.querySelector('#heroTitle').textContent.trim(), wide: document.documentElement.scrollWidth - innerWidth, csp: window.__csp }));
  ok(s.rows > 0 && s.title, `${nm}: no hero or rows (${JSON.stringify(s)})`);
  ok(s.wide <= 0, `${nm}: sideways scroll of ${s.wide} px`);
  ok(s.csp.length === 0, `${nm}: policy violations ${s.csp.join(' | ')}`);
  ok(w.errs.length === 0, `${nm}: errors ${w.errs.join(' | ')}`);
  await w.ctx.close();
}

(async () => {
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const now = Date.now(), H = 3600000, good = feed([mk('s1', now + 2 * H), mk('s2', now + 5 * H), mk('s3', now + 30 * H)]);
  try {
    for (const [dev, o] of [['390', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['1440', { viewport: { width: 1440, height: 900 } }]]) {
      console.log('== ' + dev);
      for (const [nm, file, want] of [['down', { status: 500 }, 'Sample data · live feed unavailable'], ['malformed', '{"launches": [', 'Sample data · live feed unavailable'],
        ['empty', feed([]), 'Sample data · no live launches listed']]) {
        const w = await page(b, o, { file }); await w.p.waitForTimeout(600);
        const t = await tag(w.p); console.log(`  ${nm}: ${t}`);
        ok(t === want, `${dev} ${nm}: the tag says "${t}", wanted "${want}"`);
        await common(`${dev} ${nm}`, w);
      }
      { // slow: loading first, then the sample once the 10 s limit passes
        const w = await page(b, o, { file: good, delay: 12500 });
        const t0 = await tag(w.p), cls = await w.p.evaluate(() => document.documentElement.classList.contains('ld-feed'));
        await w.p.waitForTimeout(10500); const t1 = await tag(w.p); console.log(`  slow: "${t0}" then "${t1}"`);
        ok(t0 === 'Loading live data' && cls, `${dev} slow: no loading state first ("${t0}")`);
        ok(t1 === 'Sample data · live feed unavailable', `${dev} slow: after the limit the tag says "${t1}"`);
        await common(`${dev} slow`, w);
      }
      for (const [nm, f] of [['stale old', feed(good.launches, { generated: iso(now - 3 * H) })], ['stale flag', feed(good.launches, { stale: true })]]) {
        const w = await page(b, o, { file: f }); await w.p.waitForTimeout(600);
        const t = await tag(w.p); console.log(`  ${nm}: ${t}`);
        ok(/^Data delayed · updated /.test(t), `${dev} ${nm}: the tag says "${t}", wanted Data delayed`);
        await common(`${dev} ${nm}`, w);
      }
      { // a failed refresh keeps the good data
        const w = await page(b, o, { inline: good, file: good }); await w.p.waitForTimeout(400);
        const before = await w.p.evaluate(() => __radar.launches().map((l) => l.id).join());
        w.setFile({ status: 500 }); await w.p.evaluate(() => __radar.poll()); await w.p.waitForTimeout(1200);
        const after = await w.p.evaluate(() => __radar.launches().map((l) => l.id).join()), t = await tag(w.p);
        console.log(`  poll fails: ${t}`);
        ok(after === before && /^Live data · updated /.test(t), `${dev} poll fails: data or tag changed ("${t}", ${before} to ${after})`);
        await common(`${dev} poll fails`, w);
      }
      { // statuses: a time to be confirmed, a hold, and a launch gone 40 minutes ago
        const f = feed([mk('gone', now - 40 * 60000), mk('s1', now + 2 * H), mk('tbc', now + 5 * H, { st: 'tbd' }), mk('hld', now + 8 * H, { st: 'hold' })]);
        const w = await page(b, o, { inline: f, file: f }); await w.p.waitForTimeout(400);
        const s = await w.p.evaluate(() => ({ ids: __radar.launches().map((l) => l.id), rows: [...document.querySelectorAll('#rows .row')].map((r) => r.textContent.replace(/\s+/g, ' ')) }));
        ok(!s.ids.includes('gone'), `${dev} statuses: a launch gone 40 minutes ago is still listed`);
        ok(s.rows.some((r) => /Time TBC/.test(r) && /tbc/i.test(r)), `${dev} statuses: no row says Time TBC`);
        ok(s.rows.some((r) => /On hold/.test(r)), `${dev} statuses: no row says On hold`);
        await common(`${dev} statuses`, w);
      }
      { // scrub: the next launch moves 2 hours later; a toast says where it went
        const a = feed([mk('s1', now + 3 * H), mk('s2', now + 30 * H)]), b2 = feed([mk('s1', now + 5 * H), mk('s2', now + 30 * H)]);
        const w = await page(b, o, { inline: a, file: a }); await w.p.waitForTimeout(400);
        w.setFile(b2); await w.p.evaluate(() => __radar.poll()); await w.p.waitForTimeout(1500);
        const s = await w.p.evaluate(() => ({ toast: document.querySelector('#toast').textContent, utc: __radar.launches().filter((l) => l.id === 's1')[0].utc }));
        console.log(`  scrub: ${s.toast}`);
        ok(/^scrub .+ moved to /.test(s.toast) && Date.parse(s.utc) === Date.parse(b2.launches[0].utc), `${dev} scrub: ${JSON.stringify(s)}`);
        await common(`${dev} scrub`, w);
      }
      { // daylight saving: Nov 1 2026 at 2 am EDT is 1 am EST (06:00 UTC); the page shows pad times, in the pad's zone
        const clock = Date.parse('2026-10-31T12:00:00Z'), f = feed([mk('edt', Date.parse('2026-11-01T05:30:00Z')), mk('est', Date.parse('2026-11-01T06:30:00Z'))], { generated: iso(clock) });
        const w = await page(b, o, { inline: f, file: f, clock, tz: 'America/Los_Angeles' }); await w.p.waitForTimeout(400);
        const s = await w.p.evaluate(() => __radar.launches().map((l) => l.id + ' ' + __radar.fmtDay(l) + ' ' + __radar.fmtTime(l)));
        console.log('  daylight saving: ' + s.join(' | '));
        ok(s.some((x) => /^edt Sun, Nov 1 1:30\sAM EDT$/.test(x)) && s.some((x) => /^est Sun, Nov 1 1:30\sAM EST$/.test(x)), `${dev} daylight saving: ${s.join(' | ')}`);
        await common(`${dev} daylight saving`, w);
      }
      { // distances: whole miles and km, half up, thousands separators (km x 0.621371)
        const w = await page(b, o, { inline: good, file: good });
        const s = await w.p.evaluate(() => [1609.344, 100, 2.414, 12000].map(__radar.distTxt));
        console.log('  distances: ' + s.join(' | '));
        ok(JSON.stringify(s) === JSON.stringify(['1,000 mi (1,609 km)', '62 mi (100 km)', '1 mi (2 km)', '7,456 mi (12,000 km)']), `${dev} distances: ${s.join(' | ')}`);
        await common(`${dev} distances`, w);
      }
    }
  } finally { await b.close(); server.kill(); }
  console.log(fails ? `STATES FAILED: ${fails} of ${checks} checks` : `STATES PASSED: ${checks} checks`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
