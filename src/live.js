/* Live from space (/live/): the ISS right now and its next visible pass over the visitor's saved ZIP code, worked out here from the
   station's orbital elements on the page (CelesTrak, through satellite.js and ORB.issPasses in model.js; nothing is sent anywhere), and,
   while the page is open, a fresh copy of the space weather (NOAA SWPC) and the Earth events (NASA EONET), both keyless and open to
   browsers. A source that does not answer leaves the card as the build wrote it, with its date. Nothing moves but the ISS line, which
   is redrawn every 5 seconds while the tab is visible. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  // times: the visitor's own, with the UTC time the page was built with kept as the tooltip
  [].forEach.call(document.querySelectorAll('time[data-lt]'), function (t) { var d = new Date(t.getAttribute('datetime')); if (isNaN(d)) return; t.title = t.textContent; t.textContent = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); });
  function checked(el, what) { if (el) el.textContent = 'Checked ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ', live from ' + what; }
  function getJSON(u) { return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function el(tag, text) { var n = document.createElement(tag); if (text != null) n.textContent = text; return n; }
  function day(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function time(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

  // ---- the ISS
  var box = $('iss');
  function load(src, cb) { var s = document.createElement('script'); s.src = src; s.onload = cb; s.onerror = function () {}; document.head.appendChild(s); }
  function iss() {
    var sat = window.satellite, tle = [box.getAttribute('data-l1'), box.getAttribute('data-l2')], epoch = Date.parse(box.getAttribute('data-epoch'));
    if (!sat || !window.ORB) return;
    if (isFinite(epoch) && Date.now() - epoch > 10 * 864e5) { $('issNow').textContent = 'The orbital elements on this page are more than ten days old, so the station\'s position is not shown.'; return; }
    var rec = sat.twoline2satrec(tle[0], tle[1]);
    function now() {
      var d = new Date(), pv = sat.propagate(rec, d);
      if (!pv || !pv.position) return;
      var g = sat.eciToGeodetic(pv.position, sat.gstime(d)), la = sat.degreesLat(g.latitude), lo = sat.degreesLong(g.longitude), v = pv.velocity;
      var kmh = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) * 3600;
      $('issNow').textContent = 'Now over ' + Math.abs(la).toFixed(1) + '° ' + (la >= 0 ? 'N' : 'S') + ', ' + Math.abs(lo).toFixed(1) + '° ' + (lo >= 0 ? 'E' : 'W') +
        ', ' + Math.round(g.height) + ' km up (' + Math.round(g.height * 0.621371) + ' mi), at ' + Math.round(kmh / 100) * 100 + ' km/h (' + Math.round(kmh * 0.621371 / 100) * 100 + ' mph).';
    }
    now();
    setInterval(function () { if (!document.hidden) now(); }, 5000);
    var z = null;
    try { z = JSON.parse(localStorage.getItem('radar.zipinfo') || 'null'); } catch (e) { z = null; }
    if (!z || typeof z.lat !== 'number' || typeof z.lon !== 'number') return;
    var ps = [];
    try { ps = window.ORB.issPasses(sat, tle, z.lat, z.lon, Date.now(), 72); } catch (e) { ps = []; }
    var p = ps.filter(function (x) { return x.vis && x.end > Date.now(); })[0], where = String(z.zip || '') + (z.city ? ' (' + z.city + ')' : '');
    $('issPass').textContent = p
      ? 'Next visible pass over ' + where + ': ' + day(new Date(p.tmax)) + ' at ' + time(new Date(p.tmax)) + ', from the ' + window.ORB.dir16(p.az0) + ' to the ' +
        window.ORB.dir16(p.az1) + ', up to ' + Math.round(p.max) + '° high. A prediction from the orbital elements; the station\'s orbit is adjusted now and then.'
      : 'No visible pass over ' + where + ' in the next 3 days: the station has to be in sunlight while your sky is dark.';
  }
  if (box) load('/vendor/satellite.min.js', function () { load('/model.js', iss); });

  if (!window.fetch) return;
  // ---- space weather (NOAA SWPC)
  if ($('kpLine')) {
    Promise.all([getJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'), getJSON('https://services.swpc.noaa.gov/products/noaa-scales.json')]).then(function (x) {
      var kp = x[0], last = kp[kp.length - 1], v = Math.round(parseFloat(Array.isArray(last) ? last[1] : last.Kp) * 10) / 10;
      if (!isFinite(v)) return;
      $('kpLine').textContent = 'Kp ' + v + ' now';
      var sc = (x[1] || {})['0'] || {}, lev = function (k) { var s = String((sc[k] || {}).Scale || '0'); return s === '0' ? 'none' : k + s; };
      var ul = $('sunScales');
      if (ul) {
        ul.textContent = '';
        [['R', 'Radio blackouts'], ['S', 'Radiation storms'], ['G', 'Geomagnetic storms']].forEach(function (k) {
          var li = el('li'); li.appendChild(el('b', k[1])); li.appendChild(document.createTextNode(' ' + lev(k[0]))); ul.appendChild(li);
        });
      }
      checked($('sunUpd'), 'NOAA SWPC');
    }).catch(function () {});
  }
  // ---- Earth events (NASA EONET)
  if ($('evList')) {
    getJSON('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=40').then(function (d) {
      var evs = ((d && d.events) || []).map(function (ev) {
        var g = (ev.geometry || [{}]).slice(-1)[0] || {}, src = (ev.sources || []).map(function (s) { return s.url; }).filter(function (u) { return /^https:\/\//.test(u || ''); })[0];
        return { title: String(ev.title || '').replace(/\s+/g, ' ').trim().slice(0, 90), cat: ((ev.categories || [{}])[0] || {}).title || '', date: String(g.date || '').slice(0, 10), link: src || 'https://eonet.gsfc.nasa.gov/' };
      }).filter(function (e) { return e.title && e.date; }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      if (!evs.length) return;
      var counts = {};
      evs.forEach(function (e) { counts[e.cat] = (counts[e.cat] || 0) + 1; });
      $('evSum').textContent = evs.length + ' natural events open in the last 30 days: ' + Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).map(function (k) { return counts[k] + ' ' + k.toLowerCase(); }).join(', ') + '.';
      var ul = $('evList');
      ul.textContent = '';
      evs.slice(0, 6).forEach(function (e) {
        var li = el('li'), a = el('a', e.title);
        a.href = e.link; a.target = '_blank'; a.rel = 'noopener';
        var d = new Date(e.date + 'T12:00:00Z');
        li.appendChild(a); li.appendChild(el('span', e.cat + ' · ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })));
        ul.appendChild(li);
      });
      checked($('evUpd'), 'NASA EONET');
    }).catch(function () {});
  }
})();
