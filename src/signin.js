/* Astro Radar: the sign in page, /signin/ (signin_page.py, docs/SIGNIN-SETUP.md). Runs after account.js, which provides radarAuth.
   Continue with Astro: the email and password of an Astro account, checked by Astro's auth server (signInWithPassword).
   Continue with Google: Astro's auth server sends you to Google and back here with a one time code (PKCE: the code is useless without the
   verifier this browser kept), exchanged here for a session. A Google address with no Astro account yet is turned away by Astro itself
   (its sign up needs the 18 and over confirmation), and this page says so plainly.
   After signing in it goes back where you were (?next=, a path on this site only). No hyphens in copy. */
(function () {
  'use strict';
  var A = window.radarAuth, $ = function (id) { return document.getElementById(id); };
  if (!A) return;
  var msg = $('siMsg'), out = $('siOut'), inn = $('siIn'), age = $('siAge');
  var q = new URLSearchParams(location.search), hq = new URLSearchParams(location.hash.slice(1));
  var NEXT = 'radar.next';
  var ssGet = function () { try { return sessionStorage.getItem(NEXT); } catch (e) { return null; } };
  var ssSet = function (v) { try { sessionStorage.setItem(NEXT, v); } catch (e) {} };
  var ssDel = function () { try { sessionStorage.removeItem(NEXT); } catch (e) {} };
  if (q.get('next')) ssSet(A.safeNext(q.get('next')));
  var next = function () { return A.safeNext(ssGet() || '/'); };
  $('siSkip').href = next();

  function say(text, ok) {
    msg.textContent = text; msg.hidden = !text;
    msg.className = 'si-msg' + (ok ? ' ok' : '');
  }
  function busy(on) { [].forEach.call(document.querySelectorAll('#siOut button, #siOut input'), function (b) { b.disabled = on; }); }
  var h1 = document.querySelector('main h1'), sub = document.querySelector('.si > .sub');
  function show(which) {
    out.hidden = which !== 'out'; inn.hidden = which !== 'in'; age.hidden = which !== 'age';
    // signed in, this page is the account page: its heading says so and the sign in intro goes
    h1.textContent = which === 'out' ? 'Sign in to Astro Radar' : 'Your account';
    sub.hidden = which !== 'out';
    document.title = h1.textContent + ' · Astro Radar';
  }
  function clean() { history.replaceState(null, '', location.pathname + (location.hash && !hq.get('error') ? location.hash : '')); }

  // what Astro's auth server said, in plain words
  function plain(err) {
    var m = String((err && (err.message || err.error_description || err)) || '');
    if (/database error saving new user|18 or older/i.test(m)) return 'There is no Astro account for that Google address yet. Astro is for people 18 and over: create your account on astrosocial.io, then come back and sign in.';
    if (/invalid login credentials|invalid_grant/i.test(m)) return 'That email and password do not match an Astro account. Check them, or reset your password in Astro.';
    if (/email not confirmed/i.test(m)) return 'Confirm your email address first: Astro sent you a link when you signed up.';
    if (/rate limit|too many|429/i.test(m)) return 'Too many tries. Wait a minute, then try again.';
    if (/access_denied|cancel/i.test(m)) return 'Sign in was cancelled. Nothing was changed.';
    if (/provider is not enabled|unsupported provider/i.test(m)) return 'Google sign in is not turned on yet. Use Continue with Astro instead.';
    if (/code verifier|flow state|pkce/i.test(m)) return 'That sign in link has expired or was opened in another browser. Start again here.';
    if (/fetch|network|load/i.test(m)) return 'Astro could not be reached just now. Check your connection and try again.';
    return 'Sign in did not work. Try again in a moment.';
  }

  function done() { var n = next(); ssDel(); location.replace(n); }  // signed in: back to where they were (the radar by default)

  function yours() {
    var ul = $('siYours'), rem = {};
    try { rem = JSON.parse(localStorage.getItem('radar.rem') || '{}') || {}; } catch (e) {}
    var ids = Object.keys(rem);
    ul.textContent = '';
    var empty = function (t) { var li = document.createElement('li'); li.className = 'si-empty'; li.textContent = t; ul.appendChild(li); };
    if (!ids.length) return empty('No reminders yet. Set a reminder on any launch and it shows here.');
    fetch('/launches.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (f) {
      var L = (f.launches || []).filter(function (l) { return rem[l.id]; });
      if (!L.length) return empty('The launches you set reminders for have flown or left the list.');
      L.forEach(function (l) {
        var li = document.createElement('li'), t = document.createElement('span'), a = document.createElement('a'), s = document.createElement('span');
        t.className = 't'; a.href = '/launch/' + encodeURIComponent(l.id) + '/'; a.textContent = l.mis || l.veh || 'Launch';
        var d = new Date(l.utc);
        s.textContent = (l.veh ? l.veh + ' · ' : '') + (isNaN(d) ? '' : d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
        t.appendChild(a); t.appendChild(s); li.appendChild(t); ul.appendChild(li);
      });
    }).catch(function () { empty('The launch list could not be loaded just now.'); });
  }

  function draw() {
    if (!(function () { try { return localStorage.getItem(A.STORE); } catch (e) { return null; } })()) { show('out'); return; }
    A.whoami().then(function (w) {
      if (!w) { show('out'); return; }
      A.render(w);  // the header (when this page has the control)
      if (!w.ok) { show('age'); return; }
      $('siName').textContent = (w.profile.display_name || 'your Astro account').slice(0, 40);
      var pl = $('siPlanet'); pl.textContent = ''; pl.appendChild(A.planet(w.profile.planet, w.profile.color, 56));
      show('in'); yours();
      if (location.hash === '#yours') $('yours').scrollIntoView();
    }, function (e) { show('out'); say(plain(e)); });
  }

  // back from Google (or turned away by Astro)
  var err = q.get('error_description') || q.get('error') || hq.get('error_description') || hq.get('error');
  var code = q.get('code');
  if (err) { clean(); show('out'); say(plain(err)); }
  else if (code) {
    clean(); show('out'); busy(true); say('Signing you in…', true);
    A.client().then(function (sb) { return sb.auth.exchangeCodeForSession(code); }).then(function (r) {
      busy(false);
      if (r.error) { say(plain(r.error)); return; }
      say(''); done();
    }, function (e) { busy(false); say(plain(e)); });
  } else draw();

  $('siGoogle').addEventListener('click', function () {
    say(''); busy(true);
    A.client().then(function (sb) {
      return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/signin/' } });
    }).then(function (r) { if (r && r.error) { busy(false); say(plain(r.error)); } }, function (e) { busy(false); say(plain(e)); });
  });

  var form = $('siForm'), ab = $('siAstro');
  ab.addEventListener('click', function () {
    var open = form.hidden; form.hidden = !open; ab.setAttribute('aria-expanded', String(open));
    if (open) $('siEmail').focus();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var em = $('siEmail').value.trim(), pw = $('siPass').value;
    if (!em || !pw) { say('Enter the email and password of your Astro account.'); (em ? $('siPass') : $('siEmail')).focus(); return; }
    say(''); busy(true);
    A.client().then(function (sb) { return sb.auth.signInWithPassword({ email: em, password: pw }); }).then(function (r) {
      busy(false); $('siPass').value = '';
      if (r.error) { say(plain(r.error)); $('siPass').focus(); return; }
      done();
    }, function (e2) { busy(false); say(plain(e2)); });
  });

  [].forEach.call(document.querySelectorAll('.si-signout'), function (b) {
    b.addEventListener('click', function () {
      b.disabled = true;
      A.clear().then(function () { b.disabled = false; show('out'); say('You are signed out on this browser.', true); A.render(null); });
    });
  });
})();
