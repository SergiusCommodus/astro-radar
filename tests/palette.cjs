// Palette test: every background on the page uses the palette tokens in src/template.html (the "one palette" block): the page colors,
// the surfaces, the bars, the line and tint blues, the accents and the status colors, at any opacity, plus white and black at any
// opacity (highlights and shadows). A hard coded color off that list (a slightly different navy in the header, a purple left over in a
// card) fails, so the header, the bars, the cards, the scrims and the footer cannot drift apart again.
//   python3 build.py && node tests/palette.cjs
// It serves dist/ itself and looks at every rendered element at 390 and 1440 wide: the first screen, the More menu, each tab (Your sky
// with Details open, Launches with a row open, Watch, Astro) and the footer. Each element's computed background color and every color in
// its background image (gradients) is matched against the tokens' colors (each channel within 2). Provider logo chips (their brand
// tint, --bc), logos, monograms, canvases, videos and images are left out: they show the providers' and the planet's own colors.
const { spawn } = require('child_process');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist'), PORT = +(process.env.PORT || 8125), BASE = `http://127.0.0.1:${PORT}/`;
// the palette: the tokens whose colors may be used as backgrounds
const TOKENS = ['--bg', '--bg-2', '--surface', '--surface-2', '--bar', '--line-c', '--tint', '--accent', '--cool', '--cool-2', '--cyan', '--btn', '--btn-2', '--warm',
  '--go', '--amber', '--live', '--bad', '--fg', '--fg-2', '--fg-3', '--star'];
let fails = 0, checks = 0;

(async () => {
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    for (const [nm, o] of [['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
      const ctx = await b.newContext({ ...o, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await ctx.route('https://api.weather.gov/**', (r) => r.abort());
      const p = await ctx.newPage();
      await p.goto(BASE + '?world=off', { waitUntil: 'load' }); await p.waitForTimeout(1500);
      const pal = await p.evaluate((TOKENS) => {
        const cs = getComputedStyle(document.documentElement), probe = document.createElement('x-probe'), out = {};
        document.body.appendChild(probe);
        for (const t of TOKENS) { const v = cs.getPropertyValue(t).trim(); if (!v) { out[t] = null; continue; } const q = document.createElement('x-probe'); q.style.cssText = 'color:' + v + ' !important'; document.body.appendChild(q); out[t] = getComputedStyle(q).color; q.remove(); }
        probe.remove(); return out;
      }, TOKENS);
      const missing = Object.keys(pal).filter((k) => !pal[k]);
      checks++; if (missing.length) { fails++; console.log('  FAIL', nm + ': palette tokens not defined: ' + missing.join(', ')); }
      const states = [['top', () => scrollTo(0, 0)], ['more', () => { document.querySelector('#heroMore').open = true; }],
        ['sky', () => { document.querySelector('#heroMore').open = false; document.querySelector('[data-tab="sky"]').click(); const d = document.querySelector('#skyDet'); if (d) d.open = true; }],
        ['launches', () => { document.querySelector('[data-tab="launches"]').click(); const r = document.querySelectorAll('#rows .r-head')[1]; if (r) r.click(); }],
        ['watch', () => { document.querySelector('[data-tab="watch"]').click(); }], ['astro', () => { document.querySelector('[data-tab="astro"]').click(); }],
        ['footer', () => scrollTo(0, document.documentElement.scrollHeight)]];
      const bad = new Map();
      for (const [where, fn] of states) {
        await p.evaluate(fn); await p.waitForTimeout(500);
        const found = await p.evaluate((pal) => {
          const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const c = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat); return { c: c.slice(0, 3), a: c.length > 3 ? c[3] : 1 }; };
          const P = Object.values(pal).filter(Boolean).map((s) => rgb(s).c).concat([[0, 0, 0], [255, 255, 255]]);
          const okc = (c) => P.some((q) => Math.abs(q[0] - c[0]) <= 2 && Math.abs(q[1] - c[1]) <= 2 && Math.abs(q[2] - c[2]) <= 2);
          const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
          const out = [];
          const els = [document.documentElement, document.body].concat(Array.from(document.body.querySelectorAll('*')));
          for (const e of els) {
            if (/^(CANVAS|VIDEO|IMG|svg|SCRIPT|STYLE|path|use|line|circle|g|text)$/.test(e.tagName) || e.closest('.lchip,.pmono,svg,[hidden]')) continue;
            if (e !== document.documentElement && e !== document.body && !e.getClientRects().length) continue;
            for (const pseudo of [null, '::before', '::after']) {
              const s = getComputedStyle(e, pseudo);
              if (pseudo && (s.content === 'none' || s.display === 'none')) continue;
              const cols = [];
              const bc = rgb(s.backgroundColor); if (bc && bc.a > 0) cols.push(bc.c);
              (s.backgroundImage.match(/rgba?\([^)]+\)/g) || []).forEach((x) => { const r = rgb(x); if (r && r.a > 0) cols.push(r.c); });
              const off = cols.filter((c) => !okc(c));
              if (off.length) out.push(name(e) + (pseudo || '') + ' ' + off.map((c) => 'rgb(' + c.join(',') + ')').join(' '));
            }
          }
          return out;
        }, pal);
        found.forEach((f) => { if (!bad.has(f)) bad.set(f, where); });
      }
      checks++;
      if (bad.size) { fails++; console.log('  FAIL', nm + ': ' + bad.size + ' backgrounds off the palette:'); [...bad].slice(0, +(process.env.SHOW || 40)).forEach(([f, w]) => console.log('    ' + w.padEnd(9) + f)); }
      else console.log('  ' + nm + ': every background is on the palette');
      await ctx.close();
    }
  } finally { await b.close(); server.kill(); }
  console.log(fails ? `PALETTE FAILED: ${fails} of ${checks} checks` : `PALETTE PASSED: ${checks} checks`);
  process.exit(fails ? 1 : 0);
})();
