/* Live from space (/live/): a calm dashboard of real data. The build writes every card from its own saved copy (data/nasa.json and the feed's
   ISS elements), so the page is complete and fast before this runs and still complete offline. Then, while the page is open, the browser
   asks the keyless sources that allow it for something newer and updates the card and its time:
     Earth today   NASA EPIC's own API (epic.gsfc.nasa.gov): a newer picture replaces the saved one once it has loaded
     ISS           CelesTrak's current elements (celestrak.org); the station's place on the map every 5 s, its path for the next hour, the night
                   side, and its next visible pass over the visitor's saved ZIP code (satellite.js and ORB.issPasses in model.js; nothing is sent)
     Space weather NOAA SWPC's Kp index and scales: the dial, the aurora chance and NOAA's own words for the storm level
     Earth events  NASA EONET's open events
   Asteroids come from NASA JPL, which does not let browsers ask it directly, so that card keeps the build's copy and says how old it is.
   A source that does not answer leaves its card as the build wrote it. Every time is shown in the visitor's own zone. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (d) { return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); };
  function el(tag, text) { var n = document.createElement(tag); if (text != null) n.textContent = text; return n; }
  // times: the visitor's own, with the UTC time the page was built with kept as the tooltip (the build writes how old an old copy is)
  [].forEach.call(document.querySelectorAll('time[data-lt]'), function (t) { var d = new Date(t.getAttribute('datetime')); if (isNaN(d)) return; t.title = t.textContent; t.textContent = fmt(d); });
  // a card's time after a fresh copy arrived, short so the line never wraps (the source is named on the line above)
  function fresh(id, what) { var e = $(id); if (!e) return; e.textContent = 'Live, updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); e.title = 'Fetched just now from ' + what; e.classList.remove('stale'); }
  function getJSON(u) { return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function getText(u) { return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }); }
  function day(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function time(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
  function ll(la, lo) { return Math.abs(la).toFixed(1) + '° ' + (la >= 0 ? 'N' : 'S') + ', ' + Math.abs(lo).toFixed(1) + '° ' + (lo >= 0 ? 'E' : 'W'); }
  var online = !!window.fetch && navigator.onLine !== false;

  // ---- the ISS on the map: latitudes 75 N to 60 S on a 960 by 360 frame
  var box = $('iss'), X = function (lo) { return (lo + 180) / 360 * 960; }, Y = function (la) { return (75 - Math.max(-60, Math.min(75, la))) / 135 * 360; };
  function load(src, cb) { var s = document.createElement('script'); s.src = src; s.onload = cb; s.onerror = function () {}; document.head.appendChild(s); }
  function epochOf(l1) { var y = +l1.slice(18, 20), d = parseFloat(l1.slice(20, 32)); if (!isFinite(y) || !isFinite(d)) return NaN; return Date.UTC(y < 57 ? 2000 + y : 1900 + y, 0, 1) + (d - 1) * 864e5; }
  function night(d) {
    // the night side: the terminator where the sun is on the horizon, closed over the pole that is in darkness
    var s = window.ORB.subsolar(d), dec = s.lat * Math.PI / 180, pts = [];
    for (var lo = -180; lo <= 180; lo += 4) { var h = (lo - s.lon) * Math.PI / 180, la = Math.atan(-Math.cos(h) / Math.tan(Math.abs(dec) < 1e-3 ? 1e-3 : dec)) * 180 / Math.PI; pts.push(X(lo).toFixed(1) + ' ' + Y(la).toFixed(1)); }
    var edge = dec > 0 ? 360 : 0;
    return 'M0 ' + edge + ' L' + pts.join(' L') + ' L960 ' + edge + ' Z';
  }
  function iss(tle, live) {
    var sat = window.satellite; if (!sat || !window.ORB) return;
    var epoch = epochOf(tle[0]);
    if (isFinite(epoch) && Date.now() - epoch > 10 * 864e5) { $('issNow').textContent = 'Elements too old to place it'; return; }
    var rec = sat.twoline2satrec(tle[0], tle[1]);
    function at(d) { var pv = sat.propagate(rec, d); if (!pv || !pv.position) return null; var g = sat.eciToGeodetic(pv.position, sat.gstime(d)); return { la: sat.degreesLat(g.latitude), lo: sat.degreesLong(g.longitude), h: g.height, v: pv.velocity }; }
    function draw() {
      var d = new Date(), p = at(d); if (!p) return;
      $('issDot').setAttribute('transform', 'translate(' + X(p.lo).toFixed(1) + ' ' + Y(p.la).toFixed(1) + ')');
      var kmh = Math.sqrt(p.v.x * p.v.x + p.v.y * p.v.y + p.v.z * p.v.z) * 3600;
      $('issNow').textContent = 'Over ' + ll(p.la, p.lo);
      $('issNow').title = Math.round(p.h) + ' km up, ' + Math.round(kmh / 100) * 100 + ' km/h';
      // the path for the next hour, broken where it crosses the date line
      var path = '', last = null;
      for (var m = 0; m <= 60; m += 1) { var q = at(new Date(d.getTime() + m * 6e4)); if (!q) continue; var x = X(q.lo), y = Y(q.la); path += (last === null || Math.abs(x - last) > 480 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1); last = x; }
      $('issTrk').setAttribute('d', path); $('issNight').setAttribute('d', night(d));
    }
    draw(); clearInterval(box._t); box._t = setInterval(function () { if (!document.hidden) draw(); }, 5000);
    if (live) fresh('issUpd', 'CelesTrak');
    var z = null;
    try { z = JSON.parse(localStorage.getItem('radar.zipinfo') || 'null'); } catch (e) { z = null; }
    if (!z || typeof z.lat !== 'number' || typeof z.lon !== 'number') return;
    var ps = [];
    try { ps = window.ORB.issPasses(sat, tle, z.lat, z.lon, Date.now(), 72); } catch (e) { ps = []; }
    var p = ps.filter(function (x) { return x.vis && x.end > Date.now(); })[0], where = (z.city ? String(z.city).split(',')[0] + ' ' : '') + String(z.zip || '');
    $('issPass').textContent = p
      ? 'Next visible pass from ' + where + ': ' + day(new Date(p.tmax)) + ', ' + time(new Date(p.tmax)) + ', ' + window.ORB.dir16(p.az0) + ' to ' + window.ORB.dir16(p.az1) + ', up to ' + Math.round(p.max) + '°.'
      : 'No visible pass from ' + where + ' in the next 3 days: it has to be in sunlight while your sky is dark.';
  }
  if (box) load('/vendor/satellite.min.js', function () {
    load('/model.js', function () {
      var tle = [box.getAttribute('data-l1'), box.getAttribute('data-l2')];
      iss(tle, false);
      if (!online) return;
      // CelesTrak's current elements, when they are newer than the page's
      getText('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE').then(function (t) {
        var ls = t.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return /^[12] 25544/.test(s); });
        if (ls.length !== 2 || ls[0][0] !== '1') return;
        if (epochOf(ls[0]) >= epochOf(tle[0])) iss(ls, true);
      }).catch(function () {});
    });
  });

  if (!online) return;
  // ---- Earth today: a newer EPIC picture once it has loaded (the saved one stays until then, and offline)
  var ei = $('epicImg');
  if (ei) getJSON('https://epic.gsfc.nasa.gov/api/natural').then(function (d) {
    var x = d && d[d.length - 1]; if (!x || !x.image || !/^[\w-]+$/.test(x.image)) return;
    var w = new Date(String(x.date).replace(' ', 'T') + 'Z'), tt = $('epicWhen').querySelector('time'), had = new Date(tt ? tt.getAttribute('datetime') : 0);
    if (isNaN(w)) return;
    var ymd = String(x.date).slice(0, 10).split('-');
    if (!(w > had)) { fresh('epicUpd', 'NASA EPIC'); return; }
    var img = new Image(); img.decoding = 'async';
    img.onload = function () {
      ei.src = img.src; ei.classList.add('raw');
      $('epicWhen').textContent = fmt(w);
      var c = x.centroid_coordinates || {}; if ($('epicAt') && isFinite(c.lat) && isFinite(c.lon)) $('epicAt').textContent = ll(c.lat, c.lon);
      if ($('epicPage')) $('epicPage').href = 'https://epic.gsfc.nasa.gov/?date=' + ymd.join('-');
      fresh('epicUpd', 'NASA EPIC');
    };
    img.src = 'https://epic.gsfc.nasa.gov/archive/natural/' + ymd.join('/') + '/jpg/' + x.image + '.jpg';
  }).catch(function () {});

  // ---- space weather (NOAA SWPC): the dial, the aurora chance and NOAA's words for the level (the page carries them, data-aur)
  if ($('kpLine')) {
    Promise.all([getJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'), getJSON('https://services.swpc.noaa.gov/products/noaa-scales.json')]).then(function (x) {
      var kp = x[0], last = kp[kp.length - 1], v = Math.round(parseFloat(Array.isArray(last) ? last[1] : last.Kp) * 10) / 10;
      if (!isFinite(v)) return;
      $('kpLine').textContent = 'Kp ' + v;
      $('kpNeedle').setAttribute('transform', 'rotate(' + (v / 9 * 180 - 90).toFixed(1) + ' 100 100)');
      $('kpChance').textContent = v >= 7 ? 'high' : v >= 5 ? 'fair' : 'low';
      var aur = []; try { aur = JSON.parse($('kpAur').getAttribute('data-aur')); } catch (e) {}
      for (var i = 0; i < aur.length; i++) if (v >= aur[i][0]) { $('kpAur').textContent = aur[i][1]; break; }
      var sc = (x[1] || {})['0'] || {}, lev = function (k) { var s = String((sc[k] || {}).Scale || '0'); return s === '0' ? 'none' : k + s; };
      var ul = $('sunScales');
      if (ul) {
        ul.textContent = '';
        [['R', 'Radio blackouts'], ['S', 'Radiation storms'], ['G', 'Geomagnetic storms']].forEach(function (k) {
          var li = el('li'); li.appendChild(el('b', k[1])); li.appendChild(document.createTextNode(' ' + lev(k[0]))); ul.appendChild(li);
        });
      }
      fresh('sunUpd', 'NOAA SWPC');
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
      var kinds = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }), mx = counts[kinds[0]];
      $('evCount').textContent = evs.length; $('evLast').textContent = 'Latest: ' + evs[0].title;
      var bars = $('evBars');
      if (bars) {
        bars.textContent = '';
        kinds.slice(0, 5).forEach(function (k) {
          var li = el('li'); li.appendChild(el('span', k));
          var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), r = document.createElementNS(NS, 'rect');
          s.setAttribute('viewBox', '0 0 100 8'); s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('aria-hidden', 'true');
          r.setAttribute('width', Math.max(2, Math.round(counts[k] / mx * 100))); r.setAttribute('height', '8'); r.setAttribute('rx', '2'); s.appendChild(r);
          li.appendChild(s); li.appendChild(el('b', String(counts[k]))); bars.appendChild(li);
        });
      }
      var ul = $('evList'); ul.textContent = '';
      evs.slice(0, 8).forEach(function (e) {
        var li = el('li'), a = el('a', e.title);
        a.href = e.link; a.target = '_blank'; a.rel = 'noopener';
        var dd = new Date(e.date + 'T12:00:00Z');
        li.appendChild(a); li.appendChild(el('span', e.cat + ' · ' + dd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })));
        ul.appendChild(li);
      });
      fresh('evUpd', 'NASA EONET');
    }).catch(function () {});
  }
})();
