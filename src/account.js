/* Astro Radar: the account control in the header (auth.py, docs/SIGNIN-SETUP.md). Built in only when sign in is on.
   Signed out it is a Sign in link and this file does nothing else: supabase.js is not downloaded and nothing is sent anywhere.
   With a saved session (localStorage radar.auth, written by supabase-js) it loads /vendor/supabase.js, asks Astro's auth server who
   this is (getUser, checked by the server, not just read from the token), reads only display_name, planet, color and age_confirmed_at of
   the user's own profile (row level security allows nothing else), and shows the name and planet with a small menu: Your launches, Open
   Astro, Sign out. Someone who has not passed Astro's age check sees none of that: only a note to finish in Astro, and Sign out.
   Text goes in with textContent only. No hyphens in copy. */
(function () {
  'use strict';
  var box = document.getElementById('acct'), cfg = box || document.getElementById('authcfg');  // /signin/ has no header control, only its config
  if (!cfg) return;
  var URL_ = cfg.getAttribute('data-sb'), KEY = cfg.getAttribute('data-key'), STORE = 'radar.auth', ASTRO = 'https://astrosocial.io/app/';
  var lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var lsDel = function (k) { try { localStorage.removeItem(k); } catch (e) {} };

  // where to come back to after signing in: a path on this site only (never another site, never //host, never back to /signin/)
  function safeNext(s) {
    return typeof s === 'string' && /^\/(?![\/\\])[^\s\\]*$/.test(s) && !/^\/signin(\/|$|\?|#)/.test(s) ? s : '/';
  }

  var sbP = null;
  function client() {
    if (sbP) return sbP;
    sbP = new Promise(function (ok, no) {
      if (window.supabase && window.supabase.createClient) return ok();
      var s = document.createElement('script');
      s.src = '/vendor/supabase.js'; s.async = true;
      s.onload = function () { ok(); }; s.onerror = function () { sbP = null; no(new Error('load')); };
      document.head.appendChild(s);
    }).then(function () {
      return window.supabase.createClient(URL_, KEY, { auth: {
        flowType: 'pkce',            // Google returns a one time code, exchanged with a verifier only this browser has
        storageKey: STORE,
        persistSession: true,
        autoRefreshToken: true,      // the access token lasts an hour; it is renewed while a page is open
        detectSessionInUrl: false    // only /signin/ ever exchanges a code (signin.js), never another page
      } });
    });
    return sbP;
  }

  // who is signed in: {user, profile, ok} where ok means Astro's age check is passed; null when signed out or the session is gone
  function whoami() {
    return client().then(function (sb) {
      return sb.auth.getUser().then(function (r) {
        if (r.error || !r.data || !r.data.user) {
          var st = r.error && r.error.status;
          if (st === 401 || st === 403 || (r.error && /session/i.test(r.error.message || ''))) return clear().then(function () { return null; });
          throw r.error || new Error('auth');
        }
        var u = r.data.user;
        return sb.from('profiles').select('display_name,planet,color,age_confirmed_at').eq('id', u.id).maybeSingle().then(function (p) {
          if (p.error) throw p.error;
          var pr = p.data || null;
          return { user: u, profile: pr, ok: !!(pr && pr.age_confirmed_at) };
        });
      });
    });
  }

  // sign out in this browser: the session is revoked on Astro's server for this browser and every key it kept here is removed
  function clear() {
    return client().then(function (sb) { return sb.auth.signOut({ scope: 'local' }); }, function () {}).catch(function () {}).then(function () {
      try {
        Object.keys(localStorage).forEach(function (k) { if (k === STORE || k.indexOf(STORE + '-') === 0) lsDel(k); });
        sessionStorage.removeItem('radar.next');
      } catch (e) {}
    });
  }

  // the user's Astro planet as a small SVG: their color with the style they picked in Astro (craters, bands, swirl, glow; auto is plain)
  var NS = 'http://www.w3.org/2000/svg';
  function el(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function planet(style, color, size) {
    var c = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#7C5CFF', s = el('svg', { width: size, height: size, viewBox: '0 0 40 40', 'aria-hidden': 'true', 'class': 'acct-pl' });
    var id = 'pc' + Math.random().toString(36).slice(2, 8), cp = el('clipPath', { id: id }); cp.appendChild(el('circle', { cx: 20, cy: 20, r: 15 }));
    var defs = el('defs', {}); defs.appendChild(cp); s.appendChild(defs);
    if (style === 'glow') s.appendChild(el('circle', { cx: 20, cy: 20, r: 18.5, fill: 'none', stroke: c, 'stroke-opacity': '.45', 'stroke-width': '3' }));
    s.appendChild(el('circle', { cx: 20, cy: 20, r: 15, fill: c }));
    var g = el('g', { 'clip-path': 'url(#' + id + ')' });
    if (style === 'bands') { g.appendChild(el('rect', { x: 0, y: 13, width: 40, height: 4, fill: '#fff', 'fill-opacity': '.28' })); g.appendChild(el('rect', { x: 0, y: 22, width: 40, height: 3, fill: '#fff', 'fill-opacity': '.2' })); }
    if (style === 'craters') { [[14, 15, 3], [24, 22, 4], [16, 27, 2]].forEach(function (k) { g.appendChild(el('circle', { cx: k[0], cy: k[1], r: k[2], fill: '#000', 'fill-opacity': '.22' })); }); }
    if (style === 'swirl') g.appendChild(el('path', { d: 'M7 22c6-8 16-9 26-3M10 28c6-5 13-6 21-2', fill: 'none', stroke: '#fff', 'stroke-opacity': '.3', 'stroke-width': '2.4', 'stroke-linecap': 'round' }));
    g.appendChild(el('circle', { cx: 27, cy: 27, r: 15, fill: '#000', 'fill-opacity': '.28' }));  // the night side
    s.appendChild(g);
    return s;
  }

  function item(tag, text, href) {
    var a = document.createElement(tag); a.textContent = text;
    if (href) { a.href = href; if (/^https:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; } }
    if (tag === 'button') a.type = 'button';
    return a;
  }

  function signedOut() {
    box.textContent = '';
    var a = item('a', 'Sign in', '/signin/?next=' + encodeURIComponent(safeNext(location.pathname + location.search + location.hash)));
    a.className = 'acct-in'; box.appendChild(a);
  }

  function render(w) {
    if (!box) return;
    if (!w) return signedOut();
    box.textContent = '';
    var d = document.createElement('details'); d.className = 'acct-m';
    var sm = document.createElement('summary'), n = document.createElement('span'), p = document.createElement('div');
    n.className = 'acct-n'; p.className = 'acct-p'; d.appendChild(sm);
    if (w.ok) {
      var name = (w.profile.display_name || 'Your account').slice(0, 40);
      sm.setAttribute('aria-label', 'Account: ' + name);
      sm.appendChild(planet(w.profile.planet, w.profile.color, 34)); n.textContent = name; sm.appendChild(n);
      p.appendChild(item('a', 'Your launches', '/signin/#yours'));
      p.appendChild(item('a', 'Open Astro', ASTRO));
    } else {
      sm.setAttribute('aria-label', 'Account');
      n.textContent = 'Account'; sm.appendChild(n);
      var who = document.createElement('p'); who.className = 'acct-who';
      who.textContent = w.err ? 'Astro could not be reached just now. Try again in a moment.' : 'Confirm in Astro that you are 18 or older to finish signing in.';
      p.appendChild(who); if (!w.err) p.appendChild(item('a', 'Open Astro', ASTRO));
    }
    var out = item('button', 'Sign out'); p.appendChild(out);
    out.addEventListener('click', function () { out.disabled = true; clear().then(function () { location.reload(); }); });
    d.appendChild(p); box.appendChild(d);
    document.addEventListener('click', function (e) { if (d.open && !d.contains(e.target)) d.open = false; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && d.open) { d.open = false; sm.focus(); } });
  }

  window.radarAuth = { client: client, whoami: whoami, clear: clear, planet: planet, safeNext: safeNext, render: render, STORE: STORE };

  if (!box) return;
  // signed out: nothing more to do (the static link is kept, with where to come back to)
  if (!lsGet(STORE)) {
    var a = box.querySelector('.acct-in');
    if (a && !/^\/signin\//.test(location.pathname)) a.href = '/signin/?next=' + encodeURIComponent(safeNext(location.pathname + location.search + location.hash));
    return;
  }
  if (/^\/signin\//.test(location.pathname)) return;  // signin.js draws this page's state itself
  whoami().then(render, function () {
    // the auth server could not be reached: keep a plain Account menu with Sign out, show nothing from Astro
    render({ ok: false, profile: null, err: true });
  });
})();
