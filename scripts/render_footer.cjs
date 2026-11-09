// The footer's planet as stills, for the screens that run no WebGL (phones, tablets, low power computers, the photo fallback): the same
// sunrise limb the desktop draws live in the footer (FOOTV in src/app.js, read from there so the two never differ), rendered from
// dist/world.js in headless Chrome, supersampled twice, as two layers so the page can drift the clouds over the ground:
//   foot-<w>.avif/.webp        the planet without its clouds (or their shadows): stars, ground, city lights, the air
//   foot-cloud-<w>.avif/.webp  the cloud shell alone, transparent (its alpha from a render over black and one over white)
// at 1170 by 750 (a 390 px phone at 3x: the footer's 250 px band at 3x) and 2560 by 768 (tablets and wider). The encoding (Lanczos down,
// a triangular dither against banding, AVIF and WebP) is scripts/encode_footer.py.
//   python3 build.py && node scripts/render_footer.cjs
// Needs Playwright (PLAYWRIGHT=, else require('playwright')), a Chrome with a GPU (CHROME=, or CHANNEL=chrome for the installed one) and
// Python 3 with numpy and Pillow 11.3 or later (AVIF).
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist'), OUT = path.join(ROOT, 'assets/loop'), PORT = +(process.env.PORT || 8232);
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), SS = 2;
const SIZES = [[1170, 750], [2560, 768]];
const m = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8').match(/var FOOTV=(\{[^;]*?\}),/);
if (!m) { console.error('FOOTV not found in src/app.js'); process.exit(1); }
const V = Function('return ' + m[1])();
if (!fs.existsSync(path.join(DIST, 'world.js'))) { console.error('build first: python3 build.py'); process.exit(1); }

(async () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'radar-foot-'));
  const server = spawn(PY, [path.join(ROOT, 'tests/serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const b = await pw.chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), ...(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {}), args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  try {
    for (const [w, h] of SIZES) {
      const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const url = `http://127.0.0.1:${PORT}/__foot.html`;
      await p.route(url, (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}</style><canvas id="c" style="width:${w}px;height:${h}px"></canvas><script src="world.js"></script>` }));
      await p.goto(url, { waitUntil: 'load' });
      const ok = await p.evaluate(async ([V, w, h, SS]) => {
        const RAD = Math.PI / 180, P = (la, lo) => { la *= RAD; lo *= RAD; return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)]; };
        const W = window.ARWorld.create(document.getElementById('c'), { tier: 'high', base: 'world/', force: true }); if (!W) return 'no WebGL';
        const T = P(V.lat, V.lon), N = P(V.lat + 90, V.lon), E = P(0, V.lon + 90), sun = [0, 1, 2].map((i) => N[i] * V.sun[0] + T[i] * V.sun[1] + E[i] * V.sun[2]);
        W.maxPx = 1e8; W.steady = true; W.resize(w, h, SS, SS); W.setView(Object.assign({}, V, { sun, jump: true }));
        await W.start(); await new Promise((r) => setTimeout(r, 4000)); window.__W = W;
        return W.ready && W.diag().detail === 'on' ? 'ok ' + JSON.stringify(W.diag()) : 'textures did not load ' + JSON.stringify(W.diag());
      }, [V, w, h, SS]);
      console.log(`${w}x${h}:`, ok); if (!/^ok/.test(ok)) throw new Error(ok);
      for (const [name, only, bg] of [['base', 'base', null], ['cblack', 'clouds', [0, 0, 0]], ['cwhite', 'clouds', [1, 1, 1]]]) {
        const png = await p.evaluate(([only, bg]) => { const W = window.__W; W.only = only; W.bg = bg; W.frame(performance.now(), 0, true); return document.getElementById('c').toDataURL('image/png').split(',')[1]; }, [only, bg]);
        fs.writeFileSync(path.join(tmp, `${name}-${w}.png`), Buffer.from(png, 'base64'));
      }
      await p.close();
    }
  } finally { await b.close(); server.kill(); }
  execFileSync(PY, [path.join(__dirname, 'encode_footer.py'), tmp, OUT, ...SIZES.map((s) => s.join('x'))], { stdio: 'inherit' });
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
