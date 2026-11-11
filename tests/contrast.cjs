// Contrast test: every key piece of text must keep WCAG AA contrast against what is actually behind it: the black space and the lit
// planet horizon of the hero's live world, the starfield behind the page, and the footer's planet (the live world on the desktop, its still on the phone).
//   python3 build.py (with dist/launches.json) && node tests/contrast.cjs
// It serves dist/ itself, picks a launch the feed has in daylight (its pad between 10:00 and 15:00 local solar time, so the world behind
// the page is sunlit land and bright cloud), forces the world on in a browser that allows software WebGL (as CI renders it), and at 390
// and 1440 wide, for each scroll position: notes every key text element's box, color and size, makes all text transparent, takes one
// screenshot, and reads the background behind each box (its 90th percentile luminance, so the bright clouds count). Body text must reach
// 4.5 to 1, large text (24 px, or 18.66 px bold) 3 to 1. The launch drawn over the world (#space) is hidden while sampling: it moves, and
// its glows are not the background the text sits on. With no feed it checks the sample data on the same terms.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist'), PORT = +(process.env.PORT || 8124), BASE = `http://127.0.0.1:${PORT}/`;
const KEY = ['#heroTitle', '#heroSub span', '.count b', '.count .label', '#heroKicker', '#heroStatus', '.hero-facts .fk', '.hero-facts b', '#heroWatchT', '#heroRemind span',
  '.more>summary', '.recent-t', '.rc-t', '.rc-s', '.rc-p', '.rc-when', '.res', '.h2', '.lede', '#vcLoc', '.sky-sum .verdict-t', '.sky-sum .verdict-s', '.sky-sum .fk', '.sky-sum b',
  '.sky-sum .vc-est', '.sky-det>summary', '.ptab', '.pf-chip', '.r-mis', '.r-veh', '.r-day', '.r-cd', '.r-st .status', '.note', '#rowsMore', '.foot-brand p', '.foot-ind', '.foot-col a', '.foot-bot', '.lsum', '.r-tag', '.sp-card p', '.sp-card h3', '.sp-note'];
let fails = 0, checks = 0;
const feed = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIST, 'launches.json'), 'utf8')); } catch (e) { return null; } })();

// a launch in daylight: local solar time at the pad from the UTC hour and the longitude
function dayLaunch() {
  if (!feed) return null;
  const ok = feed.launches.filter((L) => L.pad && typeof L.pad.lon === 'number').map((L) => { const d = new Date(L.utc), h = (d.getUTCHours() + d.getUTCMinutes() / 60 + L.pad.lon / 15 + 48) % 24; return [L, Math.abs(h - 12.5)]; }).filter((x) => x[1] < 2.5 && Math.abs(x[0].pad.lat) < 45).sort((a, b) => a[1] - b[1]);
  return ok.length ? ok[0][0].id : null;
}
const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };

(async () => {
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const b = await pw.chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const id = dayLaunch();
  console.log('contrast on', id ? 'launch ' + id + ' (daylight)' : 'the sample data');
  try {
    for (const [nm, o] of [['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
      const ctx = await b.newContext({ ...o, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await ctx.route('https://api.weather.gov/**', (r) => r.abort());
      const p = await ctx.newPage();
      // the desktop forces the live world on (CI renders WebGL in software, where the page would pick the photo); the phone takes the
      // page's own choice, the hero loop (with reduced motion, its poster)
      const hero = 'vid';
      await p.goto(BASE + (id ? '?launch=' + encodeURIComponent(id) : ''), { waitUntil: 'load' });
      // (the footer's still is asked for when the footer comes near, so the footer step scrolls there first)
      await p.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; }));
      for (let i = 0; i < 60 && !(await p.evaluate(() => /\bvid\b/.test(document.documentElement.className))); i++) await p.waitForTimeout(500);
      await p.waitForTimeout(2500);
      const world = await p.evaluate(() => document.documentElement.className);
      checks++; if (!world.split(' ').includes(hero)) { fails++; console.log('  FAIL', nm + ': the hero planet did not start (' + world + ', wanted ' + hero + ')'); }
      const worst = [];
      // body text size: at least 16 px on the phone and 15 px on the desktop, wherever body copy is (every tab, Details open)
      const small = await p.evaluate((min) => {
        const BODY = ['.lede', '.verdict-s', '.why li', '.nv-why li', '.how-in p', '.prov p', '.side-card p', '.astro-how li', '.foot-brand p', '.foot-ind', '.r-veh', '.r-pad', '.rc-s', '.rc-p', '.sky-sum .vc-est', '.note', '.lc-cap span'];
        const out = [], d = document.querySelector('#skyDet'); if (d) d.open = true;
        for (const tab of ['sky', 'launches', 'watch', 'astro']) {
          document.querySelector('[data-tab="' + tab + '"]').click();
          for (const s of BODY) for (const e of document.querySelectorAll(s)) { if (!e.getClientRects().length || e.closest('[hidden]')) continue; const f = parseFloat(getComputedStyle(e).fontSize); if (f < min - .01) out.push(tab + ' ' + s + ' ' + f + 'px'); }
        }
        document.querySelector('[data-tab="sky"]').click(); if (d) d.open = false; scrollTo(0, 0);
        return [...new Set(out)];
      }, nm === 'phone' ? 16 : 15);
      checks++; if (small.length) { fails++; console.log('  FAIL', nm + ': body text under ' + (nm === 'phone' ? 16 : 15) + ' px: ' + small.slice(0, 8).join(', ')); }
      // the first screen, the hero's foot (the facts over the top of the planet), Your sky, the launch list and the footer over its planet
      const stops = [['top', () => scrollTo(0, 0)], ['horizon', () => { const e = document.querySelector('.hero-facts'); scrollTo(0, e.getBoundingClientRect().top + scrollY - innerHeight * .45); }], ['sky', () => { const e = document.querySelector('.sky-sum'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 160); }],
        ['recent', () => { const e = document.querySelector('#recent'); if (e && !e.hidden) scrollTo(0, e.getBoundingClientRect().top + scrollY - 80); }],
        ['launches', () => { document.querySelector('.ptab[data-tab="launches"]').click(); const e = document.querySelector('#rows'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 200); }],
        ['footer', () => scrollTo(0, document.documentElement.scrollHeight)]];
      for (const [where, fn] of stops) {
        await p.evaluate(fn); await p.waitForTimeout(900);
        const items = await p.evaluate((KEY) => {
          const out = [], H = innerHeight, W = innerWidth;
          for (const sel of KEY) for (const e of document.querySelectorAll(sel)) {
            if (!e.getClientRects().length || e.closest('[hidden]')) continue;
            const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 6 || r.bottom < 76 || r.top > H - 4 || r.right < 0 || r.left > W) continue;
            const cs = getComputedStyle(e), m = /rgba?\(([^)]+)\)/.exec(cs.color); if (!m || !e.textContent.trim()) continue;
            const c = m[1].split(',').map((x) => parseFloat(x)), fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight, 10);
            out.push({ sel, text: e.textContent.trim().slice(0, 28), box: [Math.max(0, r.left), Math.max(76, r.top), Math.min(W, r.right), Math.min(H, r.bottom)], c, large: fs >= 24 || (fs >= 18.66 && fw >= 700) });
          }
          return out;
        }, KEY);
        const hide = await p.addStyleTag({ content: '*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}#space{visibility:hidden!important}' });
        await p.waitForTimeout(150);
        const shot = await p.screenshot({ type: 'png' }); if (process.env.SHOTS) fs.writeFileSync(path.join(process.env.SHOTS, nm + '-' + where + '.png'), shot);
        await hide.evaluate((s) => s.remove());
        const png = await decode(shot);
        for (const it of items) {
          const [x0, y0, x1, y1] = it.box.map((v, i) => Math.round(v * (o.deviceScaleFactor || 1)));
          const ls = [];
          for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const k = (y * png.w + x) * 4; ls.push(lum(png.d[k], png.d[k + 1], png.d[k + 2])); }
          if (!ls.length) continue;
          ls.sort((a, c) => a - c);
          const bg = ls[Math.floor(ls.length * .9)], a = it.c.length > 3 ? it.c[3] : 1;
          const lt = lum(it.c[0], it.c[1], it.c[2]) * a + bg * (1 - a), ratio = (Math.max(lt, bg) + .05) / (Math.min(lt, bg) + .05), need = it.large ? 3 : 4.5;
          checks++;
          if (ratio < need) { fails++; console.log('  FAIL', nm, where, it.sel, JSON.stringify(it.text), ratio.toFixed(2) + ' (needs ' + need + ')'); }
          worst.push([ratio / need, nm + ' ' + where + ' ' + it.sel + ' ' + ratio.toFixed(2)]);
        }
      }
      worst.sort((a, c) => a[0] - c[0]);
      console.log('  ' + nm + ': lowest', worst.slice(0, 4).map((w) => w[1]).join(' | '));
      await ctx.close();
    }
  } finally { await b.close(); server.kill(); }
  console.log(fails ? `CONTRAST FAILED: ${fails} of ${checks} checks` : `CONTRAST PASSED: ${checks} checks`);
  process.exit(fails ? 1 : 0);
})();

// a PNG decoded to RGBA (8 bit RGB or RGBA, no interlace: what Chromium's screenshots are), with zlib from Node
async function decode(buf) {
  const zlib = require('zlib');
  let p = 8, w = 0, h = 0, ct = 0, idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = ct === 6 ? 4 : 3, stride = w * bpp, d = Buffer.alloc(w * h * 4); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = line[x];
      cur[x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 255; }
    for (let x = 0; x < w; x++) { d[(y * w + x) * 4] = cur[x * bpp]; d[(y * w + x) * 4 + 1] = cur[x * bpp + 1]; d[(y * w + x) * 4 + 2] = cur[x * bpp + 2]; d[(y * w + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; }
    prev = cur; }
  return { w, h, d };
}
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
