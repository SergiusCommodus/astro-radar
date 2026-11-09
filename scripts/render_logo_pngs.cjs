// Provider logos as PNG for the share images (launch_pages.py draws them with Pillow, which cannot read SVG): each white SVG in
// assets/providers/ rendered at 64 px tall (at most 520 wide), transparent, into assets/providers/png/. Run it again when a logo is added
// or changed:  node scripts/render_logo_pngs.cjs   (Playwright: PLAYWRIGHT= a path to it, else require('playwright'); CHROME= optional)
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const SRC = path.join(__dirname, '..', 'assets', 'providers'), OUT = path.join(SRC, 'png');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const p = await b.newPage({ deviceScaleFactor: 1 });
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.svg')).sort()) {
    const svg = fs.readFileSync(path.join(SRC, f), 'utf-8');
    const m = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(svg);
    const r = m ? +m[1] / +m[2] : 4, h = Math.round(Math.min(64, 520 / r)), w = Math.round(h * r);
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${w}" height="${h}" style="display:block"></body></html>`);
    await p.waitForTimeout(50);
    await (await p.$('#i')).screenshot({ path: path.join(OUT, f.replace(/\.svg$/, '.png')), omitBackground: true });
    console.log(f, w + 'x' + h);
  }
  await b.close();
})();
