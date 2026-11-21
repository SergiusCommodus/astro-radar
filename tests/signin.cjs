// Sign in, end to end against a mock of Astro's auth server (tests/mock_supabase.py): node tests/signin.cjs
// Build first with sign in on and pointed at the mock:
//   AUTH=on SUPABASE_URL=http://127.0.0.1:8302 SUPABASE_KEY=sb_publishable_mock_for_tests_only python3 build.py
// It serves dist/ (tests/serve.py) and the mock itself, then checks at 390 and 1440:
//  - signed out everywhere still works: the Sign in link, no supabase.js downloaded and nothing sent to the auth server, no errors
//  - /signin/: calm layout, no sideways scroll, every control 44 px or taller, keyboard order and the email form, axe (WCAG 2 AA) clean
//  - Continue with Google: PKCE (an S256 challenge goes out; the code is exchanged with its verifier), back where you were, the name and
//    planet in the header, the profile read is only display_name, planet, color, age_confirmed_at, then Sign out clears every key
//  - a Google address with no Astro account, a cancelled sign in, a wrong password, an account not past Astro's age check (nothing of it
//    shown), ?next= that tries to leave the site, an expired session, the auth server down, and Your launches
// Screenshots go to SHOTS (default tests/signin-shots/, ignored by git). Needs Playwright (npm i --no-save playwright in tests/, or
// PLAYWRIGHT= and CHROME=); axe-core is used when it is installed (CI installs it).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
let axeSrc = null;
try { axeSrc = fs.readFileSync(require.resolve(process.env.AXE || 'axe-core/axe.min.js', { paths: [__dirname, process.cwd()] }), 'utf8'); } catch (e) {}

const DIST = path.join(__dirname, '..', 'dist');
const PORT = +(process.env.PORT || 8694), MOCK = 8302, BASE = `http://127.0.0.1:${PORT}`, SB = `http://127.0.0.1:${MOCK}`;
const SHOTS = process.env.SHOTS || path.join(__dirname, 'signin-shots');
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('FAIL ' + msg); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch (e) {} await wait(100); } return false; };
const log = async () => (await fetch(SB + '/__mock/log')).json();
const reset = () => fetch(SB + '/__mock/reset', { method: 'POST' });

(async () => {
  if (!fs.existsSync(path.join(DIST, 'signin', 'index.html'))) { console.log('FAIL dist/signin/ is missing: build with AUTH=on SUPABASE_URL=' + SB); process.exit(1); }
  const cfg = fs.readFileSync(path.join(DIST, 'signin', 'index.html'), 'utf8');
  if (!cfg.includes('data-sb="' + SB + '"')) { console.log('FAIL dist was built for another auth server, not ' + SB); process.exit(1); }
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(PY, [path.join(__dirname, 'serve.py'), DIST, String(PORT)], { stdio: 'ignore' });
  const mock = spawn(PY, [path.join(__dirname, 'mock_supabase.py'), String(MOCK)], { stdio: 'ignore' });
  await until(async () => (await fetch(BASE + '/')).ok && (await fetch(SB + '/__mock/log')).ok, 15000);
  const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : (process.env.CHANNEL ? { channel: process.env.CHANNEL } : {}));
  const feed = JSON.parse(fs.readFileSync(path.join(DIST, 'launches.json'), 'utf8'));
  const upcoming = (feed.launches || []).filter(l => Date.parse(l.utc) > Date.now() + 3600e3);

  async function ctxFor(w) {
    const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: w < 500 ? 2 : 1, serviceWorkers: 'block' });
    await ctx.route('https://api.weather.gov/**', r => r.abort());
    // the page asks Launch Library directly near a liftoff (the mock has one 10 minutes out); never depend on its rate limit here
    await ctx.route('https://ll.thespacedevs.com/**', r => r.abort());
    return ctx;
  }
  function watch(page, tag) {
    const errs = [];
    page.on('pageerror', e => errs.push(tag + ' pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/api\.weather\.gov|ERR_FAILED|net::ERR|Failed to load resource/.test(m.text())) errs.push(tag + ' console ' + m.text()); });
    page.on('response', r => { if (r.status() >= 400 && !/api\.weather\.gov/.test(r.url())) errs.push(tag + ' http ' + r.status() + ' ' + r.url()); });
    return errs;
  }
  const keys = page => page.evaluate(() => ({ local: Object.keys(localStorage).filter(k => k.startsWith('radar.auth')), session: Object.keys(sessionStorage).filter(k => k.startsWith('radar.')) }));
  const small = page => page.evaluate(() => [...document.querySelectorAll('a,button,input,summary')].filter(e => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    if (!r.width || s.visibility === 'hidden' || e.closest('[hidden],footer,.tmore-p,.nmore-p,.acct-p:not(:is([open] *))')) return false;
    const a = e.matches('footer a, .si-note a, .si-legal a, .si-fine a, p a, li a') ? false : r.height < 44;  // text links in a sentence take the line's height
    return a;
  }).map(e => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().height)));

  for (const W of [390, 1440]) {
    const tag = '@' + W;
    // ---------------------------------------------------------------- signed out, everywhere
    {
      await reset();
      const ctx = await ctxFor(W), page = await ctx.newPage(), errs = watch(page, tag + ' signed out');
      const sbjs = [];
      page.on('request', r => { if (/vendor\/supabase\.js/.test(r.url()) || r.url().startsWith(SB)) sbjs.push(r.url()); });
      for (const u of ['/', '/about/', '/privacy/', '/live/', '/launch/' + (upcoming[0] || {}).id + '/', '/provider/', '/spacecoast/']) {
        if (u.includes('undefined')) continue;
        await page.goto(BASE + u, { waitUntil: 'load' });
        await page.waitForTimeout(400);
        const a = await page.$('#acct .acct-in');
        ok(a && (await a.innerText()).trim() === 'Sign in', `${tag} ${u}: a Sign in link in the header`);
        if (a) {
          const r = await a.boundingBox(), href = await a.getAttribute('href');
          ok(r.height >= 43.5, `${tag} ${u}: Sign in is ${r.height} px tall`);  // 43.99999 is float noise, not a short control
          ok(href.startsWith('/signin/?next=' + encodeURIComponent(u.split('#')[0])), `${tag} ${u}: Sign in comes back here (${href})`);
        }
        ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag} ${u}: no sideways scroll with the account control`);
      }
      if (W < 500) {  // the narrowest phone the site supports
        await page.setViewportSize({ width: 375, height: 667 });
        for (const u of ['/', '/about/', '/signin/']) {
          await page.goto(BASE + u, { waitUntil: 'load' });
          ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `@375 ${u}: no sideways scroll`);
        }
        await page.setViewportSize({ width: W, height: 844 });
      }
      // the account section is folded under its title (Part B); a link to #account opens it
      await page.goto(BASE + '/privacy/#account'); await page.waitForTimeout(300);
      const priv = await page.innerText('main');
      ok(/If you sign in/i.test(priv) && /radar\.auth/.test(priv) && /radar\.next/.test(priv) && /one time check value/.test(priv), `${tag} the Privacy page says what sign in keeps`);
      ok(!/no accounts, no sign in/i.test(priv), `${tag} the Privacy page no longer says there is no sign in`);
      ok(sbjs.length === 0, `${tag} signed out pages downloaded supabase.js or called the auth server: ${sbjs.join(' ')}`);
      ok(errs.length === 0, errs.join('\n'));
      await ctx.close();
    }
    // ---------------------------------------------------------------- the /signin/ page itself
    {
      const ctx = await ctxFor(W), page = await ctx.newPage(), errs = watch(page, tag + ' signin');
      await page.goto(BASE + '/signin/?next=%2Fabout%2F', { waitUntil: 'load' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, `signin-${W}.png`), fullPage: true });
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag} /signin/: no sideways scroll`);
      ok((await page.innerText('h1')).trim().toLowerCase() === 'sign in to astro radar', `${tag} /signin/: the heading`);
      const txt = await page.innerText('main');
      for (const t of ['Continue with Astro', 'Continue with Google', 'Continue without an account', '18 and over', 'Terms', 'Privacy Policy', 'same one you use on astrosocial.io'])
        ok(txt.includes(t), `${tag} /signin/ says "${t}"`);
      ok(!/\w-\w/.test(txt.replace(/astrosocial\.io|sign in/gi, '')), `${tag} /signin/: a hyphen in the copy`);
      ok(await page.$eval('#siForm', f => f.hidden), `${tag} /signin/: the email form waits until asked for`);
      const sm = await small(page);
      ok(sm.length === 0, `${tag} /signin/: controls under 44 px: ${sm.join(', ')}`);
      const first = await page.evaluate(() => { const r = document.getElementById('siSkip').getBoundingClientRect(); return r.bottom <= innerHeight; });
      ok(first, `${tag} /signin/: both buttons and Continue without an account fit the first screen`);
      ok(await page.$eval('#siSkip', a => a.getAttribute('href')) === '/about/', `${tag} Continue without an account goes back where you were`);
      // keyboard: Tab reaches Continue with Astro, Enter opens the form and puts the cursor in Email
      await page.focus('#siAstro');
      await page.keyboard.press('Enter');
      ok(await page.$eval('#siForm', f => !f.hidden) && await page.evaluate(() => document.activeElement.id === 'siEmail'), `${tag} Enter on Continue with Astro opens the form and focuses Email`);
      ok(await page.$eval('#siAstro', b => b.getAttribute('aria-expanded')) === 'true', `${tag} Continue with Astro says it is expanded`);
      await page.keyboard.press('Tab'); ok(await page.evaluate(() => document.activeElement.id === 'siPass'), `${tag} Tab goes Email, Password`);
      ok(await page.$eval('#siEmail', e => !!document.querySelector('label[for="siEmail"]') && e.autocomplete === 'email') && await page.$eval('#siPass', e => e.autocomplete === 'current-password'),
        `${tag} the fields have labels and autocomplete for password managers`);
      await page.screenshot({ path: path.join(SHOTS, `signin-astro-${W}.png`), fullPage: true });
      if (axeSrc) {
        await page.evaluate(axeSrc);  // through the debugger, so the page's policy (scripts from this site only) is not loosened for the test
        const r = await page.evaluate(async () => window.axe ? (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')) : null);
        if (r === null) console.log('note: axe could not run under the page policy; skipped');
        else ok(r.length === 0, `${tag} /signin/ axe: ${r.join('\n')}`);
      } else console.log('note: axe-core not installed; accessibility rules not run');
      // empty submit says what is missing
      await page.click('#siForm button[type=submit]');
      ok(/Enter the email and password/.test(await page.innerText('#siMsg')), `${tag} an empty form says what to enter`);
      ok(errs.length === 0, errs.join('\n'));
      await ctx.close();
    }
    // ---------------------------------------------------------------- Continue with Google: an existing Astro account
    {
      await reset();
      const ctx = await ctxFor(W), page = await ctx.newPage(), errs = watch(page, tag + ' google');
      await page.goto(BASE + '/about/');
      await page.click('#acct .acct-in');
      await page.waitForURL(/\/signin\//);
      await page.click('#siGoogle');
      await page.waitForURL(u => u.href.startsWith(SB + '/auth/v1/authorize'));
      const au = new URL(page.url());
      ok(au.searchParams.get('provider') === 'google' && au.searchParams.get('code_challenge_method') === 's256' && (au.searchParams.get('code_challenge') || '').length >= 43,
        `${tag} Google: PKCE with an S256 challenge (${au.search.slice(0, 80)})`);
      ok(au.searchParams.get('redirect_to') === BASE + '/signin/', `${tag} Google: comes back to /signin/ only (${au.searchParams.get('redirect_to')})`);
      await page.click('#g-ada');
      await page.waitForURL(BASE + '/about/');
      ok(await until(async () => (await page.$('#acct summary')) !== null), `${tag} Google: back on /about/, signed in`);
      const sum = await page.$('#acct summary');
      ok(sum && (await sum.getAttribute('aria-label')) === 'Account: Ada', `${tag} Google: the header names Ada`);
      ok(await page.$('#acct summary svg.acct-pl circle') !== null, `${tag} Google: the planet is drawn`);
      if (W > 640) ok((await page.innerText('#acct')).includes('Ada'), `${tag} the name shows beside the planet`);
      const k = await keys(page);
      ok(k.local.includes('radar.auth') && !k.local.includes('radar.auth-code-verifier') && !k.session.includes('radar.next'), `${tag} Google: kept only the session (${JSON.stringify(k)})`);
      const L = await log();
      const tok = L.filter(x => x.path === '/auth/v1/token');
      ok(tok.length === 1 && /grant_type=pkce/.test(tok[0].q), `${tag} Google: one PKCE code exchange`);
      const prof = L.filter(x => x.path === '/rest/v1/profiles');
      ok(prof.length >= 1 && prof.every(x => decodeURIComponent(x.q).includes('select=display_name,planet,color,age_confirmed_at') && x.auth), `${tag} the profile read asks only for the four fields, signed in (${prof.map(x => x.q).join(' ')})`);
      const nokey = L.filter(x => !(x.apikey === 'sb_publishable_mock_for_tests_only' || x.path === '/auth/v1/authorize' || x.path === '/favicon.ico' || x.path.startsWith('/__mock')));
      ok(nokey.length === 0, `${tag} every call carries the publishable key: ${JSON.stringify(nokey)}`);
      ok(!(await page.content()).includes('not for radar'), `${tag} nothing beyond the four fields reaches the page`);
      await page.goto(BASE + '/');
      await until(async () => (await page.$('#acct summary')) !== null);
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag} main page signed in: no sideways scroll`);
      await page.click('#acct summary');
      await page.screenshot({ path: path.join(SHOTS, `menu-${W}.png`) });
      const items = await page.$$eval('#acct .acct-p a, #acct .acct-p button', e => e.map(x => x.textContent.trim()));
      ok(JSON.stringify(items) === JSON.stringify(['Your launches', 'Open Astro', 'Sign out']), `${tag} the menu: ${items.join(', ')}`);
      await page.keyboard.press('Escape');
      ok(await page.$eval('#acct details', d => !d.open) && await page.evaluate(() => document.activeElement.tagName === 'SUMMARY'), `${tag} Escape closes the menu and keeps focus on it`);
      await page.click('#acct summary');
      await page.click('#acct .acct-p button');
      await page.waitForLoadState('load');
      ok(await until(async () => (await page.$('#acct .acct-in')) !== null), `${tag} Sign out: the Sign in link is back`);
      const k2 = await keys(page);
      ok(k2.local.length === 0 && k2.session.length === 0, `${tag} Sign out cleared every key (${JSON.stringify(k2)})`);
      ok((await log()).some(x => x.path === '/auth/v1/logout' && /scope=local/.test(x.q)), `${tag} Sign out ended the session on the server`);
      ok(errs.length === 0, errs.join('\n'));
      await ctx.close();
    }
    // ---------------------------------------------------------------- Google with no Astro account, and a cancelled sign in
    {
      const ctx = await ctxFor(W), page = await ctx.newPage(), errs = watch(page, tag + ' google new');
      await page.goto(BASE + '/signin/');
      await page.click('#siGoogle');
      await page.waitForURL(u => u.href.startsWith(SB));
      await page.click('#g-new');
      await page.waitForURL(u => u.href.startsWith(BASE + '/signin/'));
      ok(await until(async () => /no Astro account for that Google address/.test(await page.innerText('#siMsg'))), `${tag} a Google address with no Astro account is told to create one in Astro (18 and over)`);
      ok(!/error/.test(page.url()), `${tag} the error leaves the address bar`);
      ok((await keys(page)).local.filter(k => k === 'radar.auth').length === 0, `${tag} no session for a Google address with no Astro account`);
      await page.screenshot({ path: path.join(SHOTS, `no-account-${W}.png`), fullPage: true });
      await page.click('#siGoogle');
      await page.waitForURL(u => u.href.startsWith(SB));
      await page.click('#g-cancel');
      await page.waitForURL(u => u.href.startsWith(BASE + '/signin/'));
      ok(await until(async () => /cancelled/.test(await page.innerText('#siMsg'))), `${tag} a cancelled sign in says so`);
      ok(errs.length === 0, errs.join('\n'));
      await ctx.close();
    }
    // ---------------------------------------------------------------- Continue with Astro: wrong password, then right; ?next= that leaves the site
    {
      const ctx = await ctxFor(W), page = await ctx.newPage(), errs = watch(page, tag + ' password');
      await page.goto(BASE + '/signin/?next=' + encodeURIComponent('//evil.example/x'));
      await page.click('#siAstro');
      await page.fill('#siEmail', 'ada@example.test');
      await page.fill('#siPass', 'wrong');
      await page.click('#siForm button[type=submit]');
      ok(await until(async () => /do not match an Astro account/.test(await page.innerText('#siMsg'))), `${tag} a wrong password says so plainly`);
      ok(await page.$eval('#siPass', e => e.value === ''), `${tag} the password field is cleared after a failed try`);
      await page.fill('#siPass', 'test passphrase 1');
      await page.click('#siForm button[type=submit]');
      await page.waitForURL(u => u.origin === BASE && u.pathname === '/');
      ok(new URL(page.url()).origin === BASE, `${tag} ?next=//evil.example stays on this site (${page.url()})`);
      ok(await until(async () => (await page.$('#acct summary')) !== null), `${tag} password sign in: signed in`);
      // Your launches: a reminder set in this browser shows on the account page
      if (upcoming[0]) {
        await page.evaluate(id => localStorage.setItem('radar.rem', JSON.stringify({ [id]: 1 })), upcoming[0].id);
        await page.goto(BASE + '/signin/#yours');
        ok(await until(async () => (await page.$$('#siYours li a')).length === 1), `${tag} Your launches lists the reminder`);
        ok(await page.$eval('#siYours li a', (a, id) => a.getAttribute('href') === '/launch/' + id + '/', upcoming[0].id), `${tag} Your launches links the launch page`);
        ok((await page.innerText('#siName')) === 'Ada' && await page.$('#siPlanet svg') !== null, `${tag} the account page shows the name and planet`);
        ok((await page.innerText('h1')).trim().toLowerCase() === 'your account' && await page.$eval('.si > .sub', s => s.hidden), `${tag} signed in, the page is headed Your account`);
        await page.screenshot({ path: path.join(SHOTS, `account-${W}.png`), fullPage: true });
      }
      // an expired session (the server no longer knows the token): back to signed out, keys cleared
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('radar.auth')); s.access_token = s.access_token.slice(0, -4) + 'xxxx'; localStorage.setItem('radar.auth', JSON.stringify(s)); });
      await page.goto(BASE + '/news/');
      ok(await until(async () => (await page.$('#acct .acct-in')) !== null && (await keys(page)).local.length === 0), `${tag} a session the server rejects falls back to Sign in and is cleared`);
      ok(errs.filter(e => !/http 400 .*grant_type=password|http 401 .*\/auth\/v1\/user/.test(e)).length === 0, errs.join('\n'));
      await ctx.close();
    }
    // ---------------------------------------------------------------- not past Astro's age check: nothing of the account is shown
    {
      const ctx = await ctxFor(W), page = await ctx.newPage(), errs = watch(page, tag + ' noage');
      await page.goto(BASE + '/signin/?next=%2Fprivacy%2F');
      await page.click('#siAstro');
      await page.fill('#siEmail', 'noage@example.test');
      await page.fill('#siPass', 'test passphrase 2');
      await page.click('#siForm button[type=submit]');
      await page.waitForURL(BASE + '/privacy/');
      ok(await until(async () => (await page.$('#acct summary')) !== null), `${tag} age check: signed in`);
      ok((await page.$eval('#acct summary', s => s.getAttribute('aria-label'))) === 'Account', `${tag} age check: no name in the header`);
      ok(await page.$('#acct svg') === null && !(await page.innerText('#acct')).includes('Pat'), `${tag} age check: no planet, no name`);
      await page.click('#acct summary');
      ok(/18 or older/.test(await page.innerText('#acct .acct-p')), `${tag} age check: the menu says to confirm in Astro`);
      ok(!(await page.$$eval('#acct .acct-p a', a => a.map(x => x.textContent))).includes('Your launches'), `${tag} age check: no Your launches`);
      await page.goto(BASE + '/signin/');
      ok(await until(async () => await page.$eval('#siAge', s => !s.hidden)), `${tag} age check: /signin/ says to finish in Astro`);
      ok(!(await page.innerText('main')).includes('Pat'), `${tag} age check: the name is not on the page`);
      await page.screenshot({ path: path.join(SHOTS, `age-${W}.png`), fullPage: true });
      ok(errs.length === 0, errs.join('\n'));
      await ctx.close();
    }
    // ---------------------------------------------------------------- the auth server down while signed in: the page still works
    {
      await reset();
      const ctx = await ctxFor(W), page = await ctx.newPage(), errs = watch(page, tag + ' down');
      await page.goto(BASE + '/signin/');
      await page.click('#siAstro');
      await page.fill('#siEmail', 'ada@example.test');
      await page.fill('#siPass', 'test passphrase 1');
      await page.click('#siForm button[type=submit]');
      await page.waitForURL(BASE + '/');
      await ctx.route(SB + '/**', r => r.abort());
      await page.goto(BASE + '/');
      ok(await until(async () => (await page.$('#acct summary')) !== null), `${tag} auth server down: an Account menu`);
      await page.click('#acct summary');
      ok(/could not be reached/.test(await page.innerText('#acct .acct-p')), `${tag} auth server down: says so, shows nothing from Astro`);
      ok(await page.$$eval('main', m => m.length === 1) && (await page.$$('#rows > *')).length > 0, `${tag} auth server down: the launch list still draws`);
      ok(errs.filter(e => !/ERR_FAILED|Failed to fetch|net::/.test(e)).length === 0, errs.join('\n'));
      await ctx.close();
    }
  }
  await b.close();
  server.kill(); mock.kill();
  console.log(`signin: ${passes} passed, ${fails} failed; screenshots in ${SHOTS}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
