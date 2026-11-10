// The planet loops: slow low orbit limb views of the live world, rendered frame by frame from dist/world.js in headless Chrome and
// encoded with ffmpeg into assets/loop/. Two of them (the footer is no longer a loop: scripts/render_footer.cjs renders its stills):
//   hero-phone  the hero's planet on phones (the lite tiers under 700 px wide): a morning limb over the Atlantic, 1080 by 1350,
//               hero-phone.mp4/.webm and hero-phone.webp (the poster)
//   hero-wide   the same for wider lite screens (tablets, low power laptops): 1920 by 1080, hero-wide.mp4/.webm and hero-wide.webp
// The hero loops are rendered supersampled (ss, the canvas's pixel ratio, scaled down with high quality smoothing), get a fixed +-1 level
// dither against banding, and are encoded in two passes (VP9 in WebM, H.264 high profile in MP4) at the bitrate that fills their cap (mb)
// The hero loops fade their top rows into the page color (--bg, #03050B), so the video's edge disappears into the page; the launch is
// drawn over them by the page (videoPath in app.js), at the spot the loop leaves for it.
//   python3 build.py && node scripts/render_loops.cjs [hero-phone] [hero-wide]     (both when none is named)
// The hero loops load after the page on every phone's first visit: their caps are in LOOPS (mb)
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
  'hero-phone': { w: 1080, h: 1350, sec: 14, fade: 3, lat: 24, lon: -74, D: 2.1, hf: 46, mb: 1.6, ss: 1.5, f: [.5, .3, .62], drift: .12, clock: .5,
    sun: [-.25, .75, .6], top: .22, poster: 'hero-phone.webp', files: [['hero-phone.mp4', '', 'h264'], ['hero-phone.webm', '', 'vp9']] },
  'hero-wide': { w: 1920, h: 1080, sec: 14, fade: 3, lat: 24, lon: -74, D: 2.0, hf: 62, mb: 2.4, ss: 1.4, f: [.5, .3, .62], drift: .12, clock: .5,
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
    const o = document.createElement('canvas'); o.width = L.w; o.height = L.h; const g = o.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high';
    // a fixed dither (the same every frame, so it costs the encoder little): +-1 level of hashed noise, so the smooth sky, rim and fade
    // gradients do not band once they are 8 bit 4:2:0
    const dn = new Int8Array(L.w * L.h); for (let i = 0; i < dn.length; i++) { const x = Math.sin(i * 12.9898 + (i % 7919) * 78.233) * 43758.5453; dn[i] = Math.round((x - Math.floor(x)) * 2 - 1); }
    const gr = g.createLinearGradient(0, 0, 0, L.h * L.top); gr.addColorStop(0, 'rgba(3,5,11,1)'); gr.addColorStop(1, 'rgba(3,5,11,0)');
    window.__shot = () => { g.drawImage(c, 0, 0, L.w, L.h); if (L.top) { g.fillStyle = gr; g.fillRect(0, 0, L.w, L.h * L.top); }
      if (L.ss) { const im = g.getImageData(0, 0, L.w, L.h), d = im.data; for (let i = 0, j = 0; j < dn.length; i += 4, j++) { const n = dn[j]; if (n) { d[i] += n; d[i + 1] += n; d[i + 2] += n; } } g.putImageData(im, 0, 0); }
      return o.toDataURL('image/png').split(',')[1]; };
    window.__W = W; window.__sun = sun; W.steady = true;
    W.resize(L.w, L.h, L.ss || 1); W.setView({ lat: L.lat, lon: L.lon, sun, f: L.f, D: L.D, hf: L.hf, jump: true });
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
  // the hero loops: two pass, at the bitrate that fills their cap (L.mb, MB), stepped down until the file fits
  if (L.mb) {
    for (const [file, , codec] of L.files) {
      const f = path.join(OUT, file), log = path.join(tmp, 'pass-' + codec);
      for (let k = .97; k > .4; k -= .06) {
        const kb = Math.floor(L.mb * 8 * 1024 * k / L.sec), rate = ['-b:v', kb + 'k', '-maxrate', Math.round(kb * 1.6) + 'k', '-bufsize', kb * 4 + 'k'];
        const enc = codec === 'h264'
          ? ['-c:v', 'libx264', '-preset', 'veryslow', ...rate, '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-aq-mode', '3', '-g', String(FPS * 2), '-passlogfile', log]
          : ['-c:v', 'libvpx-vp9', ...rate, '-row-mt', '1', '-deadline', 'good', '-cpu-used', '0', '-auto-alt-ref', '1', '-lag-in-frames', '25', '-aq-mode', '2', '-pix_fmt', 'yuv420p', '-g', String(FPS * 2), '-passlogfile', log];
        ff([...src, ...enc, '-pass', '1', '-an', '-f', codec === 'h264' ? 'mp4' : 'webm', process.platform === 'win32' ? 'NUL' : '/dev/null']);
        ff([...src, ...enc, '-pass', '2', ...(codec === 'h264' ? ['-movflags', '+faststart'] : []), '-an', f]);
        const n = fs.statSync(f).size; if (n <= L.mb * 1048576) { console.log(`${file}: ${(n / 1048576).toFixed(2)} MB (${codec}, two pass, ${kb} kbit/s)`); break; }
      }
    }
    ff(['-i', path.join(tmp, 'o0000.png'), '-frames:v', '1', '-c:v', 'libwebp', '-quality', '88', '-preset', 'picture', path.join(OUT, L.poster)]);
    console.log(`${L.poster}: ${(fs.statSync(path.join(OUT, L.poster)).size / 1024).toFixed(0)} KB`);
    // and the AVIF poster the page preloads on phones (Pillow 11.3 or later: AVIF 50 at 4:4:4, under 40 percent of the WebP; Lighthouse's phone LCP needs it small)
    const avif = path.join(OUT, L.poster.replace(/\.webp$/, '.avif'));
    execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', 'import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],quality=50,subsampling="4:4:4",speed=0)', path.join(tmp, 'o0000.png'), avif], { stdio: 'inherit' });
    console.log(`${path.basename(avif)}: ${(fs.statSync(avif).size / 1024).toFixed(0)} KB`);
    fs.rmSync(tmp, { recursive: true, force: true });
    return;
  }
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
