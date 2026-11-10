/* Astro Radar service worker (build.py writes it to dist/sw.js with __VERSION__ and __SHELL__ filled in).
   It keeps four things, nothing else: the shell (the main page and the files it needs to draw), the hero's and the footer's photos, the last good
   launches.json, and the live world's textures once the page has loaded them. Every build has its own version, so a deploy installs a new worker that drops the old shell.
   - The main page: network first, so a deploy shows at once; the saved copy only when the network fails.
   - launches.json: network first; the saved copy only when the network fails, and then with X-Astro-Offline: 1 so the page says
     "Offline, showing last update" instead of passing old data off as live.
   - The shell files: from the saved copy (they are versioned with the worker).
   - The world's textures (world/): saved the first time the page loads them, then served from the copy. Their cache is named by a hash
     of the texture files, so a deploy that leaves them alone keeps it and one that changes them starts a new one.
   - The planet photos and the launch areas (earth/: the hero's and the footer's NASA photographs, earth/areas/ the globe card's views
     of each launch site from space): the same, in its own cache named by a hash of those files.
   Anything else (launch pages, zips.json, the weather, the live feed Worker, other sites) goes to the network untouched. */
var V = '__VERSION__', SHELL = 'radar-shell-' + V, DATA = 'radar-data', WORLD = 'radar-world-__WORLDV__', LOOP = 'radar-earth-__LOOPV__', FILES = __SHELL__;
var BASE = new URL(self.registration.scope).pathname;   // '/' on astroradar.io; paths below are relative to it

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return c.addAll(['./'].concat(FILES).map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return (k.indexOf('radar-shell-') === 0 && k !== SHELL) || (k.indexOf('radar-world-') === 0 && k !== WORLD) || (k.indexOf('radar-earth-') === 0 && k !== LOOP); }).map(function (k) { return caches.delete(k); }));
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
  if (name.indexOf('world/') === 0) {
    e.respondWith(caches.open(WORLD).then(function (c) {
      return c.match(r).then(function (m) {
        return m || fetch(r).then(function (res) { if (res.ok) c.put(r, res.clone()); return res; });
      });
    }));
    return;
  }
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
