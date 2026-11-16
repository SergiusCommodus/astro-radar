// Wide screens, readable text, the visitor's own time zone and no assumed ZIP (Part 0, the November 2026 overnight run). Runs in CI after the
// smoke test (.github/workflows/checks.yml):  node tests/wide.cjs   (serves dist/ itself, like smoke.cjs; Playwright as there)
// Checks, on the main page (every tab), a launch page, Live, News and the reading pages:
//   text size     every visible piece of text is at least 14 px at 1440 and 13 px at 390 (the wordmark aside)
//   undefined     no "undefined", "NaN" or "null" anywhere on screen, with and without a ZIP (the launch list said "visible from undefined")
//   width         no sideways scroll at 375, 390, 1440, 1920 and 2560; from 1920 the page uses at least 1400 px and the launch page's
//                 columns too; from 1200 the hero lists what comes next on its right, clear of the title, countdown, buttons and facts
//   rows          from 1280 a launch row shows its pad and the view in their own columns, lined up from row to row
//   time zones    in a browser in Los Angeles every time in the hero, the Up next list, the rows and a launch page says PST or PDT, never UTC,
//                 EST or another pad's zone; Nerd mode adds the UTC time to the nerd line
//   no ZIP        with nothing saved the ZIP box is empty, the browser is not asked to fill it in, no place is named, the hero asks "Can you
//                 see it?" and the list invites the visitor to set one; after a ZIP is set the hero, the list sentence and the rows name it,
//                 and Forget takes the page back to asking
//   lines         paragraphs on the launch page and About stay under about 75 characters a line
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist'), PORT = +(process.env.PORT || 8133), BASE = `http://127.0.0.1:${PORT}/`;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };
const feed = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIST, 'launches.json'), 'utf8')); } catch (e) { return null; } })();
const pages = fs.existsSync(path.join(DIST, 'launch')) ? fs.readdirSync(path.join(DIST, 'launch')).filter((d) => fs.existsSync(path.join(DIST, 'launch', d, 'index.html'))) : [];
const upcoming = feed ? (feed.launches || []).filter((l) => Date.parse(l.utc) > Date.now() + 3600e3 && pages.includes(l.id)) : [];
const READING = ['about/', 'privacy/', 'data/', 'ksc/', 'provider/', 'astro/', 'live/', 'news/']
  .concat(fs.existsSync(path.join(DIST, 'guide')) ? ['guide/', 'vandenberg/', 'starbase/', 'tonight/', 'pad/' + fs.readdirSync(path.join(DIST, 'pad'))[0] + '/'] : []);

// the visible text on screen that is smaller than the minimum: [size, selector, text]
const small = (p, min) => p.evaluate((min) => {
  const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.textContent.trim(); if (!t) continue;
    const e = n.parentElement; if (!e || e.closest('svg,canvas,script,style,noscript,[aria-hidden="true"],.sr,.skip,.brand,.bn,.tbrand,[hidden]')) continue;
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (!r.width || !r.height || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || (r.width <= 1 && r.height <= 1)) continue;
    const fs = parseFloat(cs.fontSize); if (fs < min - 0.01) out.push([fs, e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''), t.slice(0, 40)]);
  }
  return out;
}, min);
const badWords = (p) => p.evaluate(() => (document.body.innerText.match(/[^\n]{0,40}\b(undefined|NaN|null)\b[^\n]{0,20}/g) || []));
const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);

(async () => {
  if (!feed) { console.log('wide: no dist/launches.json, build with a feed first'); process.exit(1); }
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const errs = [];
  const ctxOf = async (vp, opt = {}) => {
    const ctx = await b.newContext({ viewport: vp, reducedMotion: 'reduce', serviceWorkers: 'block', ...opt });
    await ctx.route('https://api.weather.gov/**', (r) => r.abort());
    if (opt.zip) await ctx.addInitScript((z) => { try { if (!localStorage.getItem('radar.zipset')) { localStorage.setItem('radar.zip', z); localStorage.setItem('radar.zipset', '1'); } } catch (e) {} }, opt.zip);
    return ctx;
  };
  const open = async (ctx, u) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(u + ': ' + e.message)); await p.goto(BASE + u, { waitUntil: 'load' }); await p.waitForTimeout(500); return p; };
  try {
    // ---------------------------------------------------------------- text size and words, at a desktop and a phone
    for (const [w, h, min] of [[1440, 900, 14], [390, 844, 13]]) {
      for (const zip of ['', '33130']) {
        const ctx = await ctxOf({ width: w, height: h }, { zip });
        const p = await open(ctx, '');
        for (const tab of ['sky', 'launches', 'watch', 'astro']) {
          await p.evaluate((t) => { location.hash = t; }, tab); await p.waitForTimeout(250);
          if (tab === 'launches') await p.evaluate(() => { const r = document.querySelector('#rows [data-open]'); if (r && r.getAttribute('aria-expanded') !== 'true') r.click(); const d = document.querySelector('#spaceToday'); if (d) d.open = true; });
          if (tab === 'sky' && zip) await p.evaluate(() => { const d = document.querySelector('#skyDet'); if (d) d.open = true; });
          const s = await small(p, min); ok(!s.length, `${w} ${zip || 'no zip'} #${tab}: text under ${min} px: ${JSON.stringify(s.slice(0, 6))}`);
          const bw = await badWords(p); ok(!bw.length, `${w} ${zip || 'no zip'} #${tab}: ${JSON.stringify(bw.slice(0, 3))}`);
        }
        await ctx.close();
      }
      const ctx = await ctxOf({ width: w, height: h });
      for (const u of ['launch/' + upcoming[0].id + '/', ...READING]) {
        const p = await open(ctx, u); const s = await small(p, min); ok(!s.length, `${w} ${u}: text under ${min} px: ${JSON.stringify(s.slice(0, 6))}`);
        const bw = await badWords(p); ok(!bw.length, `${w} ${u}: ${JSON.stringify(bw.slice(0, 3))}`); await p.close();
      }
      await ctx.close();
    }

    // ---------------------------------------------------------------- width
    for (const w of [375, 390, 1440, 1920, 2560]) {
      const ctx = await ctxOf({ width: w, height: 900 }, { zip: '33130' });
      for (const u of ['', '#launches', 'launch/' + upcoming[0].id + '/', 'live/', 'news/', 'about/', 'ksc/']) {
        const p = await open(ctx, u); ok(await sideways(p) <= 0, `${w} ${u || 'main'}: scrolls sideways by ${await sideways(p)} px`);
        if (w >= 1920) {
          const cw = await p.evaluate(() => { const e = document.querySelector('.hero-in,.lp,main'); const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); });
          ok(cw >= 1400, `${w} ${u || 'main'}: the content is only ${Math.round(cw)} px wide`);
        }
        if (w >= 1440 && !u) {
          const g = await p.evaluate(() => { const box = (s) => { const e = document.querySelector(s); return e && e.getClientRects().length ? e.getBoundingClientRect() : null; };
            const nx = box('#heroNext'), parts = ['#heroTitle', '.count', '.hero-actions', '.hero-facts', '.hero-sub'].map(box).filter(Boolean);
            const hit = (a, c) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
            return { nx: !!nx, items: document.querySelectorAll('#heroNextL li').length, right: nx && nx.left > innerWidth / 2, clash: nx ? parts.some((c) => hit(nx, c)) : false }; });
          ok(g.nx && g.items >= 2 && g.right && !g.clash, `${w}: the hero's Up next list beside the countdown: ${JSON.stringify(g)}`);
        }
        if (w >= 1440 && u === '#launches') {
          const r = await p.evaluate(() => { const rs = [...document.querySelectorAll('#rows .row')].slice(0, 6);
            const xs = (s) => [...new Set(rs.map((x) => { const e = x.querySelector(s); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().left) : -1; }))];
            return { pad: xs('.r-wpad'), vis: xs('.r-wvis'), when: xs('.r-when'), txt: (rs[0].querySelector('.r-wvis') || {}).textContent }; });
          ok(r.pad.length === 1 && r.pad[0] > 0 && r.vis.length === 1 && r.vis[0] > 0 && r.when.length === 1, `${w}: a row's pad, view and time line up in columns: ${JSON.stringify(r)}`);
        }
        await p.close();
      }
      await ctx.close();
    }
    { // phones and tablets never get the side list or the row columns
      const ctx = await ctxOf({ width: 1024, height: 768 }); const p = await open(ctx, '#launches');
      ok(await p.evaluate(() => !document.querySelector('#heroNext').getClientRects().length && ![...document.querySelectorAll('.r-wpad')].some((e) => e.getClientRects().length)), '1024: no Up next list or row columns');
      await ctx.close();
    }

    // ---------------------------------------------------------------- time zones: a visitor in Los Angeles
    {
      const ctx = await ctxOf({ width: 1440, height: 900 }, { timezoneId: 'America/Los_Angeles', zip: '90012' });
      const p = await open(ctx, '#launches');
      const t = await p.evaluate(() => ({ hero: document.querySelector('#hfWhen').textContent, next: [...document.querySelectorAll('.hn-when span:first-child')].map((e) => e.textContent),
        rows: [...document.querySelectorAll('#rows .r-day')].map((e) => e.textContent), sum: document.querySelector('#launchSum').textContent,
        nerd: getComputedStyle(document.querySelector('.r-nerd')).display }));
      const pac = (s) => /\b(PST|PDT)$/.test(s.trim());
      ok(pac(t.hero), `the hero's liftoff is in the visitor's zone: ${t.hero}`);
      ok(t.next.length && t.next.every(pac), `Up next is in the visitor's zone: ${t.next.join(' | ')}`);
      ok(t.rows.length && t.rows.every(pac), `every row is in the visitor's zone: ${t.rows.filter((x) => !pac(x)).join(' | ')}`);
      ok(!/\bUTC\b|\bE[SD]T\b|\bC[SD]T\b/.test(t.hero + t.next.join() + t.rows.join() + t.sum), 'no UTC or other zone outside Nerd mode');
      await p.click('#nerdBtn'); await p.waitForTimeout(200);
      const nl = await p.evaluate(() => document.querySelector('#rows .r-nerd').textContent);
      ok(/\d\d:\d\d UTC/.test(nl), `Nerd mode adds the UTC time: ${nl}`);
      await p.evaluate(() => localStorage.removeItem('radar.nerd')); await p.close();
      const lp = await open(ctx, 'launch/' + upcoming[0].id + '/');
      const lt = await lp.evaluate(() => [...document.querySelectorAll('time[data-local]')].filter((e) => e.getClientRects().length).map((e) => e.textContent));
      ok(lt.length && lt.every((x) => /\b(PST|PDT)\b/.test(x) && !/UTC/.test(x)), `the launch page's times are in the visitor's zone: ${lt.join(' | ')}`);
      const ut = await lp.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => e.children.length === 0 && e.getClientRects().length && /\bUTC\b/.test(e.textContent)).map((e) => e.textContent.trim()));
      ok(!ut.length, `no UTC on the launch page outside Nerd mode: ${ut.slice(0, 3).join(' | ')}`);
      await lp.evaluate(() => localStorage.setItem('radar.nerd', 'true')); await lp.reload({ waitUntil: 'load' });
      // polled from here: waitForFunction evaluates a string in the page, which the page's own policy (no eval) refuses
      for (let i = 0; i < 20 && !(await lp.evaluate(() => !!document.querySelector('.nerd-utc'))); i++) await lp.waitForTimeout(250);
      const un = await lp.evaluate(() => [...document.querySelectorAll('.nerd-utc')].filter((e) => e.getClientRects().length).map((e) => e.textContent));
      ok(un.length && un.every((x) => /UTC/.test(x)), `Nerd mode shows UTC on the launch page: ${un.join(' | ')}`);
      await ctx.close();
    }

    // ---------------------------------------------------------------- no ZIP is assumed
    for (const w of [390, 1440]) {
      const ctx = await ctxOf({ width: w, height: 900 });
      const p = await open(ctx, '');
      const a = await p.evaluate(() => { const i = document.querySelector('#zipInput'), vis = (s) => { const e = document.querySelector(s); return !!(e && e.getClientRects().length); };
        return { val: i.value, ac: i.getAttribute('autocomplete'), named: /33130|Miami|\b07930\b|Chester/.test(document.querySelector('main').innerText), k: document.querySelector('#hfK').textContent,
          v: document.querySelector('#hfVis').textContent, ask: vis('.nozip-ask'), verdict: vis('#vcBig'), sum: document.querySelector('#launchSum').textContent }; });
      ok(a.val === '' && a.ac === 'off', `${w}: the ZIP box starts empty and is not autofilled: ${JSON.stringify(a)}`);
      ok(!a.named, `${w}: no place is named before the visitor sets a ZIP`);
      ok(a.k === 'Can you see it?' && a.v === 'Set your ZIP code' && a.ask && !a.verdict, `${w}: the hero and Your sky ask for a ZIP: ${JSON.stringify(a)}`);
      ok(/Set your ZIP code/.test(a.sum) && !/undefined/.test(a.sum), `${w}: the list sentence invites a ZIP: ${a.sum}`);
      await p.fill('#zipInput', '10001'); await p.press('#zipInput', 'Enter');
      for (let i = 0; i < 60 && !(await p.evaluate(() => /10001/.test(document.querySelector('#hfK').textContent))); i++) await p.waitForTimeout(250);
      const z = await p.evaluate(() => ({ k: document.querySelector('#hfK').textContent, loc: document.querySelector('#vcLoc').textContent, sum: document.querySelector('#launchSum').textContent, saved: JSON.parse(localStorage.getItem('radar.zip') || 'null') }));
      ok(z.k === 'Look up from 10001' && /New York/.test(z.loc) && z.saved === '10001', `${w}: a ZIP set: ${JSON.stringify(z)}`);
      ok(/New York \(10001\)|from 10001|\(10001\)/.test(z.sum) && !/undefined/.test(z.sum), `${w}: the list sentence names the ZIP: ${z.sum}`);
      await p.click('#zipForget');
      const f = await p.evaluate(() => ({ k: document.querySelector('#hfK').textContent, val: document.querySelector('#zipInput').value, saved: localStorage.getItem('radar.zip'), info: localStorage.getItem('radar.zipinfo') }));
      ok(f.k === 'Can you see it?' && f.val === '' && f.saved === null && f.info === null, `${w}: Forget clears the ZIP: ${JSON.stringify(f)}`);
      await p.close();
      const lp = await open(ctx, 'launch/' + upcoming[0].id + '/');
      const l = await lp.evaluate(() => { const i = document.querySelector('#luZip'); return i ? { val: i.value, ac: i.getAttribute('autocomplete'), ph: i.getAttribute('placeholder') } : null; });
      ok(l && l.val === '' && l.ac === 'off' && !/\d/.test(l.ph || ''), `${w}: the launch page's Look Up box is empty, not autofilled and shows no example ZIP: ${JSON.stringify(l)}`);
      await ctx.close();
    }

    // ---------------------------------------------------------------- line length
    {
      const ctx = await ctxOf({ width: 2560, height: 1440 });
      for (const u of ['launch/' + upcoming[0].id + '/', 'about/', '']) {
        const p = await open(ctx, u);
        const long = await p.evaluate(() => [...document.querySelectorAll('main p')].filter((e) => e.getClientRects().length && e.textContent.trim().length > 120).map((e) => {
          const fs = parseFloat(getComputedStyle(e).fontSize), w = e.getBoundingClientRect().width; return [Math.round(w / (fs * 0.5)), e.textContent.trim().slice(0, 30)]; }).filter((x) => x[0] > 82));
        ok(!long.length, `${u || 'main'} at 2560: paragraphs over about 75 characters a line: ${JSON.stringify(long.slice(0, 4))}`);
        await p.close();
      }
      await ctx.close();
    }
  } catch (e) { fails++; console.log('  FAIL', e.stack || e); }
  ok(!errs.length, 'page errors: ' + errs.slice(0, 5).join(' | '));
  await b.close(); server.kill();
  console.log(`wide: ${checks - fails}/${checks} checks passed`); process.exit(fails ? 1 : 0);
})();
