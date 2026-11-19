// WCAG 2.2 AA audit of every kind of page: node tests/audit.cjs (serves dist/ itself; Playwright as in smoke.cjs; axe-core as in signin.cjs).
// CI runs it after issues.cjs. Every outside host is refused, so nothing leaves the machine. At 390 (a phone, 3x) and 1440:
//   axe          no violation of axe's WCAG 2.0, 2.1 and 2.2 A and AA rules (contrast, names, labels, alt text, landmarks, lists, ARIA)
//   targets      every visible link, button, summary and field is at least 24 by 24 px (2.5.8), and 44 px tall on a phone (the site's rule),
//                counting its invisible ::after hit area; a link inside a sentence is exempt, as 2.5.8 allows
//   focus        Tab walks the page in order; every stop is visible, shows a focus ring (outline or box shadow), and is not hidden under the
//                sticky header or the phone's bottom bar (2.4.11): the point at its centre is the element itself or inside it
//   motion       with reduced motion no CSS animation or transition runs longer than 0.01 s
//   top          a page opened with no #fragment starts at its top
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist'), PORT = +(process.env.PORT || 8161), BASE = `http://127.0.0.1:${PORT}/`;
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };
let axeSrc = null;
try { axeSrc = fs.readFileSync(require.resolve(process.env.AXE || 'axe-core/axe.min.js', { paths: [__dirname, process.cwd()] }), 'utf8'); } catch (e) {}
const has = (p) => fs.existsSync(path.join(DIST, p));
const lp = has('launch') ? fs.readdirSync(path.join(DIST, 'launch')).filter((d) => has(`launch/${d}/index.html`)) : [];
const pads = has('pad') ? fs.readdirSync(path.join(DIST, 'pad')) : [];
const provs = has('provider') ? fs.readdirSync(path.join(DIST, 'provider')).filter((d) => has(`provider/${d}/index.html`)) : [];
const PAGES = ['', lp[0] && `launch/${lp[0]}/`, 'live/', 'news/', 'guide/', 'spacecoast/', 'vandenberg/', 'starbase/', pads[0] && `pad/${pads[0]}/`,
  'tonight/', 'astro/', 'logbook/', 'provider/', provs[0] && `provider/${provs[0]}/`, 'stats/', 'about/', 'privacy/', 'data/']
  .filter((p) => p !== undefined && p !== null && p !== false).filter((p) => p === '' || has(p + 'index.html'));
// AUDIT_PAGES=about/,stats/ limits a run to those pages (for working on one); AUDIT_W=1440 to one width
const ONLY = process.env.AUDIT_PAGES ? process.env.AUDIT_PAGES.split(',').map((x) => (x === '/' ? '' : x)) : null;
if (ONLY) PAGES.splice(0, PAGES.length, ...PAGES.filter((p) => ONLY.includes(p)));

(async () => {
  const server = spawn(PY, [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const errs = [];
  try {
    for (const w of (process.env.AUDIT_W ? process.env.AUDIT_W.split(',').map(Number) : [390, 1440])) {
      const phone = w < 700;
      for (const pg of PAGES) {
        const c = await b.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone,
          serviceWorkers: 'block', reducedMotion: 'reduce' });
        await c.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (r) => r.abort());
        const p = await c.newPage();
        p.on('pageerror', (e) => errs.push(`${pg} ${w}: ${e.message.slice(0, 100)}`));
        const tag = `${w} /${pg}`;
        await p.goto(BASE + pg, { waitUntil: 'load' });
        await p.waitForTimeout(1200);
        // a page opened without a #fragment starts at its top (an anchor matching the hash the main page writes once moved it past the hero)
        ok(await p.evaluate(() => scrollY) === 0, `${tag} opens scrolled to ${await p.evaluate(() => scrollY)} px, not its top`);
        // axe, injected through the debugger so the page's policy is not loosened for the test
        if (axeSrc) {
          await p.evaluate(axeSrc);
          const v = await p.evaluate(async () => window.axe ? (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }))
            .violations.map((x) => `${x.id} (${x.impact}): ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`) : null);
          if (v === null) console.log('note: axe could not run on', tag);
          else ok(v.length === 0, `${tag} axe:\n    ${v.join('\n    ')}`);
        }
        // targets
        const small = await p.evaluate((phone) => {
          const out = [];
          for (const el of document.querySelectorAll('a[href], button, summary, input:not([type=hidden]), select, textarea, [role=button], [tabindex]:not([tabindex="-1"])')) {
            if (!el.getClientRects().length || (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }))) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            // a visually hidden field (1 by 1) worked through its visible label, which is checked in its place
            if (r.width <= 1 && r.height <= 1 && el.labels && [...el.labels].some((l) => l.getClientRects().length)) continue;
            // a link inside a sentence is exempt (2.5.8, inline): shown inline, in a paragraph or list item with more words than its own
            const blk = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p,li,dd,td,figcaption');
            if (blk && (blk.textContent || '').trim().split(/\s+/).length >= (el.textContent || '').trim().split(/\s+/).length + 4) continue;
            // the ::after hit area some small links carry
            const a = getComputedStyle(el, '::after');
            let h = r.height, wd = r.width;
            if (a.content && a.content !== 'none' && a.position === 'absolute') {
              const top = parseFloat(a.top) || 0, bot = parseFloat(a.bottom) || 0, l = parseFloat(a.left) || 0, rt = parseFloat(a.right) || 0;
              h = Math.max(h, a.height !== 'auto' && parseFloat(a.height) ? parseFloat(a.height) : r.height - top - bot);
              wd = Math.max(wd, a.width !== 'auto' && parseFloat(a.width) ? parseFloat(a.width) : r.width - l - rt);
            }
            const minH = phone ? 44 : 24;
            if (h < minH - 0.5 || wd < 23.5) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ')[0]} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(wd)}x${Math.round(h)}`);
          }
          return out;
        }, phone);
        ok(small.length === 0, `${tag} targets under ${phone ? '44' : '24'} px: ${small.slice(0, 8).join(', ')}${small.length > 8 ? ' and ' + (small.length - 8) + ' more' : ''}`);
        // reduced motion
        const moving = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming
          && (+a.effect.getTiming().duration || 0) > 10).map((a) => (a.animationName || a.transitionProperty || 'animation') + ' on ' + ((a.effect.target && (a.effect.target.id || a.effect.target.className)) || '?')).slice(0, 5));
        ok(moving.length === 0, `${tag} runs animations with reduced motion: ${moving.join(', ')}`);
        // keyboard: up to 60 stops
        await p.evaluate(() => { window.scrollTo(0, 0); document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
        const bad = [];
        const seen = new Set();
        for (let i = 0; i < 60; i++) {
          await p.keyboard.press('Tab');
          await p.waitForTimeout(60);  // a frame for the focus styles (the skip link slides away)
          const f = await p.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            // a ring on the element, or on the field's own box (the ZIP form draws it with :focus-within)
            const ringOf = (x) => { const c = getComputedStyle(x); return (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || (c.boxShadow && c.boxShadow !== 'none'); };
            const ring = ringOf(el) || (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && [el.parentElement, el.parentElement && el.parentElement.parentElement].some((x) => x && ringOf(x)));
            const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
            const at = document.elementFromPoint(cx, cy);
            const onScreen = r.bottom > 0 && r.top < innerHeight;
            const covered = onScreen && at && !(el === at || el.contains(at) || at.contains(el) || (el.labels && [...el.labels].some((l) => l.contains(at))));
            const by = covered ? (at.closest('header,nav,.tabbar,footer') || at).tagName.toLowerCase() + '.' + String((at.closest('header,nav,.tabbar') || at).className).split(' ')[0] : '';
            return { k: [el.tagName, el.id, el.getAttribute('href'), (el.textContent || '').trim().slice(0, 30), Math.round(r.top + scrollY), Math.round(r.left + scrollX)].join('|'), name: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20) + '"',
              ring, onScreen, covered, by, w: r.width, h: r.height };
          });
          if (process.env.AUDIT_DEBUG) console.log('   tab', i, f && f.name, f && f.k);
          if (!f) break;
          if (seen.has(f.k)) break;
          seen.add(f.k);
          if (f.w < 1 || f.h < 1) continue;
          if (!f.onScreen) bad.push(f.name + ' off screen');
          else if (f.covered) bad.push(f.name + ' hidden under ' + f.by);
          else if (!f.ring) bad.push(f.name + ' has no focus ring');
        }
        ok(bad.length === 0, `${tag} keyboard: ${bad.slice(0, 6).join(', ')}${bad.length > 6 ? ' and ' + (bad.length - 6) + ' more' : ''}`);
        ok(seen.size > 3, `${tag} keyboard reaches only ${seen.size} stops`);
        await c.close();
      }
    }
  } finally {
    ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
    await b.close(); server.kill();
  }
  console.log(`audit: ${checks - fails}/${checks} checks passed on ${PAGES.length} pages`); process.exit(fails ? 1 : 0);
})();
