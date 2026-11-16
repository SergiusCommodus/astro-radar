// The launch logbook in a real browser: node tests/logbook.cjs (serves dist/ itself; Playwright as in smoke.cjs). CI runs it after live.cjs.
// BROWSERS=webkit runs it as an iPhone 13 in WebKit too (the default is Chromium only; CI's browsers job adds WebKit).
//   I saw it      shown on a launch page only after liftoff; saves where from (a ZIP or a town; a position is refused), what was seen and a
//                 note; survives a reload; Edit and Remove; nothing pops up (no dialog, no toast, no notification)
//   Your launches lists the sightings with their badges (first launch, twilight jellyfish, Starship, the rocket and the pad); removing a
//                 sighting takes its badge away
//   export        one JSON file of our format with every sighting
//   import        merges by launch and says what it did; a file that is not ours is refused with a reason; Replace needs a second press
//   year card     a 1080 by 1920 picture, drawn (not blank), without the ZIP code
//   offline       after one visit Your launches opens offline with the log
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist'), PORT = +(process.env.PORT || 8153), BASE = `http://127.0.0.1:${PORT}/`;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };
const feed = JSON.parse(fs.readFileSync(path.join(DIST, 'launches.json'), 'utf8'));
const has = (l) => fs.existsSync(path.join(DIST, 'launch', l.id, 'index.html'));
const all = [...(feed.launches || []), ...(feed.recent || [])].filter(has);
const flown = all.filter((l) => Date.parse(l.utc) < Date.now() - 3600e3).sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc));
const future = all.find((l) => Date.parse(l.utc) > Date.now() + 3 * 3600e3);
const ship = flown.find((l) => /Starship/.test(l.veh));

async function run(name, launch, opts) {
  console.log(`== ${name}`);
  const b = await launch;
  const ctx = await b.newContext({ ...opts, acceptDownloads: true });
  await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const errs = [], pops = [];
  const page = async (u) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(u + ': ' + e.message)); p.on('dialog', (d) => { pops.push(d.message()); d.dismiss(); });
    await p.goto(BASE + u, { waitUntil: 'load' }); await p.waitForTimeout(400); return p; };
  const A = flown[0], B = ship || flown[1];
  // ---- I saw it
  let p = await page('launch/' + A.id + '/');
  ok(await p.isVisible('#saw'), `${name}: I saw it shows on a launch that has flown (${A.id})`);
  await p.click('#sawOpen');
  await p.fill('#sawFrom', '28.61, -80.81'); await p.click('#sawForm button[type=submit]');
  ok(/ZIP code or a town/.test(await p.textContent('#sawMsg')), `${name}: a position is refused`);
  await p.fill('#sawFrom', 'Titusville');
  await p.check('#sawForm input[value=plume]', { force: true }); await p.check('#sawForm input[value=jellyfish]', { force: true });
  await p.fill('#sawNote', 'Glowed over the river <b>wow</b>');
  await p.click('#sawForm button[type=submit]');
  await p.waitForSelector('#sawDone:not([hidden])', { timeout: 5000 }).catch(() => {});
  ok(/seen from Titusville: a glowing plume, a twilight jellyfish/.test(await p.textContent('#sawWhat')), `${name}: saved: ${await p.textContent('#sawWhat')}`);
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(500);
  ok(await p.isVisible('#sawDone'), `${name}: the sighting survives a reload`);
  await p.close();
  p = await page('launch/' + B.id + '/');
  await p.click('#sawOpen'); await p.fill('#sawFrom', '78520'); await p.check('#sawForm input[value=trail]', { force: true }); await p.click('#sawForm button[type=submit]');
  await p.waitForSelector('#sawDone:not([hidden])', { timeout: 5000 }).catch(() => {});
  await p.close();
  if (future) { p = await page('launch/' + future.id + '/'); ok(!(await p.isVisible('#saw')), `${name}: no I saw it before liftoff (${future.id})`); await p.close(); }
  // ---- Your launches
  p = await page('logbook/');
  await p.waitForFunction(() => document.querySelectorAll('#lbList li').length >= 2, null, { timeout: 5000 }).catch(() => {});
  const s = await p.evaluate(() => ({ n: document.getElementById('lbCount').textContent, items: [...document.querySelectorAll('#lbList li')].map((x) => x.textContent),
    badges: [...document.querySelectorAll('.bdg b')].map((x) => x.textContent), note: [...document.querySelectorAll('.lb-n')].map((x) => x.innerHTML) }));
  ok(s.n === '2 launches', `${name}: two launches logged: ${s.n}`);
  ok(s.badges.includes('First launch') && s.badges.includes('Twilight jellyfish') && s.badges.includes(A.veh), `${name}: badges ${s.badges.join(', ')}`);
  if (ship) ok(s.badges.includes('Saw Starship fly'), `${name}: the Starship badge`);
  ok(s.note.every((h) => !/<b>/.test(h)), `${name}: a note is text, never markup`);
  // export
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click('#lbExport')]);
  const file = path.join(os.tmpdir(), 'radar-log-' + Date.now() + '.json'); await dl.saveAs(file);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(doc.format === 'astro-radar-log' && doc.version === 1 && doc.entries.length === 2 && doc.entries.some((e) => e.from === 'Titusville'), `${name}: the export: ${doc.entries.length} sightings`);
  ok(/Last exported/.test(await p.textContent('#lbLast')), `${name}: the page says when it was last exported`);
  // remove one, and its badge goes
  if (ship) {
    await p.click(`#lbList li:has-text("${ship.mis.split('|').pop().trim().slice(0, 12)}") button.lnk`).catch(() => p.click('#lbList li:first-child button.lnk'));
    await p.waitForTimeout(500);
    ok(!(await p.evaluate(() => [...document.querySelectorAll('.bdg b')].some((x) => x.textContent === 'Saw Starship fly'))), `${name}: removing the Starship sighting takes its badge`);
  } else { await p.click('#lbList li:first-child button.lnk'); await p.waitForTimeout(500); }
  ok((await p.textContent('#lbCount')) === '1 launch', `${name}: one left`);
  // import: merges, says what it did
  await p.setInputFiles('#lbFile', file); await p.waitForTimeout(800);
  ok(/Added 1 launch, 1 already here/.test(await p.textContent('#lbMsg')), `${name}: import: ${await p.textContent('#lbMsg')}`);
  ok((await p.textContent('#lbCount')) === '2 launches', `${name}: back to two`);
  const bad = path.join(os.tmpdir(), 'radar-bad-' + Date.now() + '.json'); fs.writeFileSync(bad, '{"format":"something-else","entries":[]}');
  await p.setInputFiles('#lbFile', bad); await p.waitForTimeout(500);
  ok(/not an Astro Radar log/.test(await p.textContent('#lbMsg')), `${name}: a file that is not ours is refused`);
  // replace: a file with one sighting, then two presses
  const one = path.join(os.tmpdir(), 'radar-one-' + Date.now() + '.json'); fs.writeFileSync(one, JSON.stringify({ ...doc, entries: doc.entries.slice(0, 1) }));
  await p.setInputFiles('#lbFile', one); await p.waitForTimeout(600);
  await p.click('#lbReplace'); ok((await p.textContent('#lbCount')) === '2 launches', `${name}: one press does not replace`);
  await p.click('#lbReplace'); await p.waitForTimeout(600);
  ok((await p.textContent('#lbCount')) === '1 launch', `${name}: the second press replaces the log with the file`);
  // the year card
  await p.click('#lbMake');
  await p.waitForSelector('#lbCard:not([hidden])', { timeout: 8000 }).catch(() => {});
  const card = await p.evaluate(async () => { const i = document.getElementById('lbCard'); if (!i.complete) await new Promise((r) => { i.onload = r; });
    const c = document.getElementById('lbCanvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0;
    for (let k = 0; k < d.length; k += 4 * 97) if (d[k] + d[k + 1] + d[k + 2] > 300) lit++;
    return { w: i.naturalWidth, h: i.naturalHeight, lit, alt: i.alt, save: document.getElementById('lbSave').getAttribute('download') }; });
  ok(card.w === 1080 && card.h === 1920 && card.lit > 200 && /launches? logged/.test(card.alt) && /^astro-radar-\d{4}\.png$/.test(card.save), `${name}: the year card: ${JSON.stringify(card)}`);
  const side = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(side <= 0, `${name}: no sideways scroll on Your launches`);
  await p.close();
  ok(!pops.length, `${name}: no pop ups: ${pops.join(' | ')}`);
  ok(!errs.length, `${name}: page errors: ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
  // ---- offline, after one visit (Chromium: the service worker)
  if (name === 'chromium') {
    const oc = await b.newContext({ viewport: { width: 390, height: 844 } }); await oc.route(/^https:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const q = await oc.newPage(); await q.goto(BASE, { waitUntil: 'load' });
    await q.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
    await q.waitForTimeout(1200);
    await q.goto(BASE + 'launch/' + A.id + '/', { waitUntil: 'load' }); await q.waitForTimeout(300);
    await q.click('#sawOpen'); await q.click('#sawForm button[type=submit]'); await q.waitForTimeout(400);
    await q.goto(BASE + 'logbook/', { waitUntil: 'load' }); await q.waitForTimeout(400);
    await oc.setOffline(true); await q.reload({ waitUntil: 'load' }).catch(() => {}); await q.waitForTimeout(800);
    ok((await q.textContent('#lbCount').catch(() => '')) === '1 launch', `offline: Your launches opens with the log`);
    await oc.close();
  }
  await b.close();
}

(async () => {
  if (flown.length < 2) { console.log('logbook: the feed needs two flown launches with pages'); process.exit(1); }
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const want = (process.env.BROWSERS || 'chromium').split(',');
  try {
    if (want.includes('chromium')) await run('chromium', pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), { viewport: { width: 390, height: 844 } });
    if (want.includes('webkit')) await run('webkit', pw.webkit.launch(), { ...pw.devices['iPhone 13'] });
  } catch (e) { fails++; console.log('  FAIL', e.stack || e); }
  server.kill();
  console.log(`logbook: ${checks - fails}/${checks} checks passed`); process.exit(fails ? 1 : 0);
})();
