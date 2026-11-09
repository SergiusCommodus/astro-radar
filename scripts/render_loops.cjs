// The planet loops: slow low orbit limb views of the live world, rendered frame by frame from dist/world.js in headless Chrome and
// encoded with ffmpeg into assets/loop/. Three of them:
//   footer      the footer's horizon at sunrise over the Caribbean: planet-1280.mp4/.webm (1280 by 720), planet-720.mp4/.webm (720 by
//               404: H.264 in 4:2:0 needs an even height, so not 405) and planet-poster.webp
//   hero-phone  the hero's planet on phones (the lite tiers under 700 px wide): a morning limb over the Atlantic, 720 by 900,
//               hero-phone.mp4/.webm and hero-phone.webp (the poster)
//   hero-wide   the same for wider lite screens (tablets, low power laptops): 1280 by 720, hero-wide.mp4/.webm and hero-wide.webp
// The hero loops fade their top rows into the page color (--bg, #03050B), so the video's edge disappears into the page; the launch is
// drawn over them by the page (videoPath in app.js), at the spot the loop leaves for it.
//   python3 build.py && node scripts/render_loops.cjs [footer] [hero-phone] [hero-wide]     (all three when none is named)
// Needs Playwright (PLAYWRIGHT= a path to it, else require('playwright')), a Chrome or Chromium (CHROME=; one with a GPU renders the
// high tier as a desktop does) and ffmpeg (FFMPEG=, else ffmpeg on the PATH). Options: FPS (24), MAXMB (the cap per file, 1.5).
//
// Seamless: the world is rendered for SECONDS + FADE seconds of its own clock: the cloud shell turning slowly east over the ground and
// changing shape, and the camera drifting on a small closed path that comes back to its start after SECONDS (so the ground, the city
// lights and the limb are the same at both ends of the loop, and nothing doubles in the fade). The loop is the first SECONDS, except that
// over its first FADE seconds the frames from just past its end fade into it; so the last frame of the loop runs straight on into the
// first, and only the clouds change across the fade. The sun is set by hand, not from a date, so the light is the same each time.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist'), OUT = path.join(ROOT, 'assets/loop'), PORT = +(process.env.PORT || 8231);
const FF = process.env.FFMPEG || 'ffmpeg', FPS = +(process.env.FPS || 24), MAXB = (+(process.env.MAXMB || 1.5)) * 1048576;
// sun: [ahead, up, east] at the view's centre (ahead is north, the way the camera looks); fade: the share of the frame's height at the top
// that fades into the page color; files: [name, scale or '', codec]
const LOOPS = {
  footer: { w: 1280, h: 720, sec: 16, fade: 4, lat: 19.5, lon: -80.5, D: 1.32, hf: 66, f: [.5, .55, .86], drift: .14, clock: .5,
    sun: [Math.cos(-9 * Math.PI / 180), Math.sin(-9 * Math.PI / 180), .32], top: 0, poster: 'planet-poster.webp',
    files: [['planet-1280.mp4', '', 'h264'], ['planet-1280.webm', '', 'vp9'], ['planet-720.mp4', '720:404', 'h264'], ['planet-720.webm', '720:404', 'vp9']] },
  'hero-phone': { w: 720, h: 900, sec: 14, fade: 3, lat: 24, lon: -74, D: 1.6, hf: 46, f: [.5, .3, .62], drift: .12, clock: .5,
    sun: [-.25, .75, .6], top: .22, poster: 'hero-phone.webp', files: [['hero-phone.mp4', '', 'h264'], ['hero-phone.webm', '', 'vp9']] },
  'hero-wide': { w: 1280, h: 720, sec: 14, fade: 3, lat: 24, lon: -74, D: 1.4, hf: 64, f: [.5, .3, .62], drift: .12, clock: .5,
    sun: [-.25, .75, .6], top: .2, poster: 'hero-wide.webp', files: [['hero-wide.mp4', '', 'h264'], ['hero-wide.webm', '', 'vp9']] },
};
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LOOPS);
want.forEach((k) => { if (!LOOPS[k]) { console.error('no loop called ' + k + ' (there are: ' + Object.keys(LOOPS).join(', ') + ')'); process.exit(1); } });
if (!fs.existsSync(path.join(DIST, 'world.js'))) { console.error('build first: python3 build.py'); process.exit(1); }
const ff = (args) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

async function render(b, name, L) {
  const N = Math.round(L.sec * FPS), C = Math.round(L.fade * FPS), tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'radar-loop-'));
  const p = await b.newPage({ viewport: { width: L.w, height: L.h }, deviceScaleFactor: 1 });
  const url = `http://127.0.0.1:${PORT}/__loop.html`;
  await p.route(url, (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{display:block}</style>
<canvas id="c" width="${L.w}" height="${L.h}" style="width:${L.w}px;height:${L.h}px"></canvas><script src="world.js"></script>` }));
  await p.goto(url, { waitUntil: 'load' });
  const ok = await p.evaluate(async (L) => {
    const RAD = Math.PI / 180, P = (la, lo) => { la *= RAD; lo *= RAD; return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)]; };
    const c = document.getElementById('c'), W = window.ARWorld.create(c, { tier: 'high', base: 'world/', force: true });
    if (!W) return 'no WebGL';
    const T = P(L.lat, L.lon), Nn = P(L.lat + 90, L.lon), E = P(0, L.lon + 90);
    const sun = [0, 1, 2].map((i) => Nn[i] * L.sun[0] + T[i] * L.sun[1] + E[i] * L.sun[2]);
    // the frame: the world, then (hero loops) its top faded into the page color
    const o = document.createElement('canvas'); o.width = L.w; o.height = L.h; const g = o.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, L.h * L.top); gr.addColorStop(0, 'rgba(3,5,11,1)'); gr.addColorStop(1, 'rgba(3,5,11,0)');
    window.__shot = () => { g.drawImage(c, 0, 0); if (L.top) { g.fillStyle = gr; g.fillRect(0, 0, L.w, L.h * L.top); } return o.toDataURL('image/png').split(',')[1]; };
    window.__W = W; window.__sun = sun; W.steady = true;
    W.resize(L.w, L.h, 1); W.setView({ lat: L.lat, lon: L.lon, sun, f: L.f, D: L.D, hf: L.hf, jump: true });
    await W.start(); await new Promise((r) => setTimeout(r, 3000));
    return W.ready ? 'ok ' + JSON.stringify(W.diag()) : 'textures did not load';
  }, L);
  console.log(name + ':', ok); if (!/^ok/.test(ok)) throw new Error(ok);
  await p.evaluate(() => { window.__base = performance.now(); window.__W.setClock(window.__base); });
  for (let i = 0; i < N + C; i++) {
    const png = await p.evaluate(([i, L, FPS]) => {
      const s = i / FPS, W = window.__W, k = 2 * Math.PI * s / L.sec;
      W.setView({ lat: L.lat + L.drift * .4 * (1 - Math.cos(k)), lon: L.lon + L.drift * Math.sin(k), sun: window.__sun, f: L.f, D: L.D, hf: L.hf, jump: true });
      W.frame(window.__base + s * 1000 * L.clock, 0, false);
      return window.__shot();
    }, [i, L, FPS]);
    fs.writeFileSync(path.join(tmp, 'a' + String(i).padStart(4, '0') + '.png'), Buffer.from(png, 'base64'));
    if (i % 48 === 0) process.stdout.write(`${name}: frame ${i} of ${N + C}\r`);
  }
  await p.close();
  // the loop: frames C..N-1 as they are; frames 0..C-1 faded from the frames just past the end (N..N+C-1) into themselves
  const seq = path.join(tmp, 'a%04d.png');
  ff(['-framerate', String(FPS), '-start_number', '0', '-i', seq, '-framerate', String(FPS), '-start_number', String(N), '-i', seq,
    '-framerate', String(FPS), '-start_number', String(C), '-i', seq,
    '-filter_complex', `[0:v]trim=end_frame=${C},setpts=PTS-STARTPTS,format=gbrp[h];[1:v]trim=end_frame=${C},setpts=PTS-STARTPTS,format=gbrp[t];` +
      `[h][t]blend=all_expr='A*(N/${C})+B*(1-N/${C})'[x];[2:v]trim=end_frame=${N - C},setpts=PTS-STARTPTS,format=gbrp[m];[x][m]concat=n=2:v=1[o]`,
    '-map', '[o]', '-frames:v', String(N), '-start_number', '0', path.join(tmp, 'o%04d.png')]);
  fs.mkdirSync(OUT, { recursive: true });
  const src = ['-framerate', String(FPS), '-start_number', '0', '-i', path.join(tmp, 'o%04d.png')];
  // each file at the best quality that stays under the cap
  for (const [file, scale, codec] of L.files) {
    const f = path.join(OUT, file), vf = scale ? ['-vf', `scale=${scale}:flags=lanczos`] : [];
    let done = false;
    for (let q = codec === 'h264' ? 20 : 30; q <= 44 && !done; q += 2) {
      ff([...src, ...vf, ...(codec === 'h264'
        ? ['-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(q), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', String(FPS * 2), '-movflags', '+faststart']
        : ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(q), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '1', '-pix_fmt', 'yuv420p', '-g', String(FPS * 2)]), '-an', f]);
      const n = fs.statSync(f).size; if (n <= MAXB) { console.log(`${file}: ${(n / 1048576).toFixed(2)} MB (${codec === 'h264' ? 'crf' : 'vp9 crf'} ${q})`); done = true; }
    }
    if (!done) console.log(`${file}: over the cap even at the lowest quality tried`);
  }
  ff(['-i', path.join(tmp, 'o0000.png'), '-frames:v', '1', '-c:v', 'libwebp', '-quality', '76', path.join(OUT, L.poster)]);
  console.log(`${L.poster}: ${(fs.statSync(path.join(OUT, L.poster)).size / 1024).toFixed(0)} KB`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

(async () => {
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(ROOT, 'tests/serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const b = await pw.chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  try { for (const k of want) await render(b, k, LOOPS[k]); } finally { await b.close(); server.kill(); }
})().catch((e) => { console.error(e); process.exit(1); });
