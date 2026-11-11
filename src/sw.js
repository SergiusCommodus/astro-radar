/* Astro Radar service worker (build.py writes it to dist/sw.js with __VERSION__ and __SHELL__ filled in).
   It keeps three things, nothing else: the shell (the main page and the files it needs to draw), the hero's photo, and the last good
   launches.json. Every build has its own version, so a deploy installs a new worker that drops the old shell.
   - The main page: network first, so a deploy shows at once; the saved copy only when the network fails.
   - launches.json: network first; the saved copy only when the network fails, and then with X-Astro-Offline: 1 so the page says
     "Offline, showing last update" instead of passing old data off as live.
   - The shell files: from the saved copy (they are versioned with the worker).
   - The planet photo and the launch areas (earth/: the hero's NASA photograph, earth/areas/ each launch site from space, shown on its
     launch page): saved the first time the page loads them, then served from the copy, in a cache named by a hash of those files, so a
     deploy that leaves them alone keeps it and one that changes them starts a new one. An older worker's world texture cache
     (radar-world-*) is dropped.
   Anything else (launch pages, zips.json, the weather, the live feed Worker, other sites) goes to the network untouched. */
var V = '__VERSION__', SHELL = 'radar-shell-' + V, DATA = 'radar-data', LOOP = 'radar-earth-__LOOPV__', FILES = __SHELL__;
var BASE = new URL(self.registration.scope).pathname;   // '/' on astroradar.io; paths below are relative to it

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return c.addAll(['./'].concat(FILES).map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return (k.indexOf('radar-shell-') === 0 && k !== SHELL) || k.indexOf('radar-world-') === 0 || (k.indexOf('radar-earth-') === 0 && k !== LOOP); }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function home(url) { var p = url.pathname; return p === BASE || p === BASE + 'index.html'; }

self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;
  var url = new URL(r.url);
  if (url.origin !== location.origin) return;
  if (r.mode === 'navigate' && home(url)) {
    e.respondWith(fetch(r).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put('./', copy); }); }
      return res;
    }, function () { return caches.open(SHELL).then(function (c) { return c.match('./'); }).then(function (m) { return m || Response.error(); }); }));
    return;
  }
  if (url.pathname === BASE + 'launches.json') {
    // no-store: the browser's own HTTP cache must not answer for the network, or an offline visit gets a 200 without the offline mark
    e.respondWith(fetch(r, { cache: 'no-store' }).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(DATA).then(function (c) { c.put('launches.json', copy); }); }
      return res;
    }, function () {
      return caches.open(DATA).then(function (c) { return c.match('launches.json'); }).then(function (m) {
        if (!m) return Response.error();
        return m.blob().then(function (b) {
          var h = new Headers(m.headers); h.set('X-Astro-Offline', '1');
          return new Response(b, { status: 200, headers: h });
        });
      });
    }));
    return;
  }
  var name = url.pathname.indexOf(BASE) === 0 ? url.pathname.slice(BASE.length) : '';
  if (name.indexOf('earth/') === 0) {
    e.respondWith(caches.open(LOOP).then(function (c) {
      return c.match(name).then(function (m) {
        return m || fetch(r).then(function (res) { if (res.ok) c.put(name, res.clone()); return res; });
      });
    }));
    return;
  }
  if (FILES.indexOf(name) >= 0) {
    e.respondWith(caches.open(SHELL).then(function (c) { return c.match(name); }).then(function (m) { return m || fetch(r); }));
  }
});
