// The footer's planet loop: a slow low orbit limb view of the live world at sunrise, rendered frame by frame from dist/world.js in
// headless Chrome and encoded with ffmpeg into assets/loop/ (planet-1280.mp4/.webm at 1280 by 720, planet-720.mp4/.webm at 720 by 404:
// H.264 in 4:2:0 needs an even height, so not 405; and planet-poster.webp, the first frame at 1280 by 720).
//   python3 build.py && node scripts/render_footer_loop.cjs
// Needs Playwright (PLAYWRIGHT= a path to it, else require('playwright')), a Chrome or Chromium (CHROME=; one with a GPU renders the
// high tier as a desktop does) and ffmpeg (FFMPEG=, else ffmpeg on the PATH). Options: SECONDS (the loop, 16), FADE (seconds, 4), FPS (24),
// MAXMB (the cap per file, 1.5).
//
// Seamless: the world is rendered for SECONDS + FADE seconds of its own clock: the cloud shell turning slowly east over the ground and
// changing shape, and the camera drifting on a small closed path that comes back to its start after SECONDS (so the ground, the city
// lights and the limb are the same at both ends of the loop, and nothing doubles in the fade). The loop is the first SECONDS, except that
// over its first FADE seconds the frames from just past its end fade into it; so the last frame of the loop runs straight on into the
// first, and only the clouds change across the fade. The sun is set by hand (just over the horizon ahead, a little to
// the right), not from a date, so the light is the same each time the loop is made.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist'), OUT = path.join(ROOT, 'assets/loop'), PORT = +(process.env.PORT || 8231);
const FF = process.env.FFMPEG || 'ffmpeg', FPS = +(process.env.FPS || 24), SEC = +(process.env.SECONDS || 16), FADE = +(process.env.FADE || 4), MAXB = (+(process.env.MAXMB || 1.5)) * 1048576;
const N = Math.round(SEC * FPS), C = Math.round(FADE * FPS);
// the view: looking north over the Caribbean toward Florida and the Gulf coast before dawn, the sun rising beyond the horizon
const VIEW = { lat: 19.5, lon: -80.5, drift: .14 /* degrees, the camera's closed path */, clock: .5 /* world seconds a second */, f: [.5, .55, .86] };
const PAGE = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{display:block;width:1280px;height:720px}</style>
<canvas id="c" width="1280" height="720"></canvas><script src="world.js"></script>`;

if (!fs.existsSync(path.join(DIST, 'world.js'))) { console.error('build first: python3 build.py'); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'radar-loop-'));
(async () => {
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), [path.join(ROOT, 'tests/serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const b = await pw.chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const url = `http://127.0.0.1:${PORT}/__loop.html`;
    await p.route(url, (r) => r.fulfill({ contentType: 'text/html', body: PAGE }));
    await p.goto(url, { waitUntil: 'load' });
    const ok = await p.evaluate(async (V) => {
      const RAD = Math.PI / 180, P = (la, lo) => { la *= RAD; lo *= RAD; return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)]; };
      const W = window.ARWorld.create(document.getElementById('c'), { tier: 'high', base: 'world/', force: true });
      if (!W) return 'no WebGL';
      // the sun: ahead (north of the view), 9 degrees under the local horizon at the view's centre, so dawn is on the far side of the
      // picture and night with city lights in front; a little to the east
      const T = P(V.lat, V.lon), Nn = P(V.lat + 90, V.lon), E = P(0, V.lon + 90), e = -9 * RAD;
      const sun = [0, 1, 2].map((i) => Nn[i] * Math.cos(e) + T[i] * Math.sin(e) + E[i] * .32);
      window.__W = W; window.__sun = sun; window.__P = P; W.steady = true;
      W.resize(1280, 720, 1); W.setView({ lat: V.lat, lon: V.lon, sun, f: V.f, jump: true });
      await W.start(); await new Promise((r) => setTimeout(r, 3000));
      return W.ready ? 'ok ' + JSON.stringify(W.diag()) : 'textures did not load';
    }, VIEW);
    console.log('world:', ok); if (!/^ok/.test(ok)) throw new Error(ok);
    await p.evaluate(() => { window.__base = performance.now(); window.__W.setClock(window.__base); });
    for (let i = 0; i < N + C; i++) {
      const png = await p.evaluate(([i, V, FPS, SEC]) => {
        const s = i / FPS, W = window.__W, k = 2 * Math.PI * s / SEC;
        W.setView({ lat: V.lat + V.drift * .4 * (1 - Math.cos(k)), lon: V.lon + V.drift * Math.sin(k), sun: window.__sun, f: V.f, jump: true });
        W.frame(window.__base + s * 1000 * V.clock, 0, false);
        return document.getElementById('c').toDataURL('image/png').split(',')[1];
      }, [i, VIEW, FPS, SEC]);
      fs.writeFileSync(path.join(tmp, 'a' + String(i).padStart(4, '0') + '.png'), Buffer.from(png, 'base64'));
      if (i % 48 === 0) process.stdout.write(`frame ${i} of ${N + C}\r`);
    }
    console.log(`rendered ${N + C} frames`);
  } finally { await b.close(); server.kill(); }

  // the loop: frames C..N-1 as they are; frames 0..C-1 faded from the frames just past the end (N..N+C-1) into themselves
  const ff = (args) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  const seq = path.join(tmp, 'a%04d.png');
  ff(['-framerate', String(FPS), '-start_number', '0', '-i', seq, '-framerate', String(FPS), '-start_number', String(N), '-i', seq,
    '-framerate', String(FPS), '-start_number', String(C), '-i', seq,
    '-filter_complex', `[0:v]trim=end_frame=${C},setpts=PTS-STARTPTS,format=gbrp[h];[1:v]trim=end_frame=${C},setpts=PTS-STARTPTS,format=gbrp[t];` +
      `[h][t]blend=all_expr='A*(N/${C})+B*(1-N/${C})'[x];[2:v]trim=end_frame=${N - C},setpts=PTS-STARTPTS,format=gbrp[m];[x][m]concat=n=2:v=1[o]`,
    '-map', '[o]', '-frames:v', String(N), '-start_number', '0', path.join(tmp, 'o%04d.png')]);
  fs.mkdirSync(OUT, { recursive: true });
  const src = ['-framerate', String(FPS), '-start_number', '0', '-i', path.join(tmp, 'o%04d.png')];
  // each file at the best quality that stays under the cap
  function enc(name, scale, codec) {
    const f = path.join(OUT, name), vf = scale ? ['-vf', `scale=${scale}:flags=lanczos`] : [];
    for (let q = codec === 'h264' ? 20 : 30; q <= 44; q += 2) {
      ff([...src, ...vf, ...(codec === 'h264'
        ? ['-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(q), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', String(FPS * 2), '-movflags', '+faststart']
        : ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(q), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '1', '-pix_fmt', 'yuv420p', '-g', String(FPS * 2)]), '-an', f]);
      const n = fs.statSync(f).size; if (n <= MAXB) { console.log(`${name}: ${(n / 1048576).toFixed(2)} MB (${codec === 'h264' ? 'crf' : 'vp9 crf'} ${q})`); return; }
    }
    console.log(`${name}: over the cap even at the lowest quality tried`);
  }
  enc('planet-1280.mp4', '', 'h264'); enc('planet-1280.webm', '', 'vp9'); enc('planet-720.mp4', '720:404', 'h264'); enc('planet-720.webm', '720:404', 'vp9');
  ff(['-i', path.join(tmp, 'o0000.png'), '-frames:v', '1', '-c:v', 'libwebp', '-quality', '76', path.join(OUT, 'planet-poster.webp')]);
  console.log(`planet-poster.webp: ${(fs.statSync(path.join(OUT, 'planet-poster.webp')).size / 1024).toFixed(0)} KB`);
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
