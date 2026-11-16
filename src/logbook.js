/* The launch logbook in the browser (Part 3): "I saw it" on a launch page and Your launches (/logbook/). The rules are in logcore.js (LOG),
   loaded first. Everything is kept in this browser only, in IndexedDB (database astro-radar-log, store sightings, one record per launch);
   nothing is sent anywhere and there is no account. No pop ups, no streaks, no reminders to log: messages are a line of text on the page.
   Export writes one JSON file; import checks every field, merges by launch and says what it did. */
(function () {
  'use strict';
  var L = window.LOG; if (!L) return;
  var $ = function (id) { return document.getElementById(id); };
  var DB = 'astro-radar-log', ST = 'sightings';
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function open() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('none')); return; }
      var r;
      try { r = indexedDB.open(DB, 1); } catch (e) { rej(e); return; }
      r.onupgradeneeded = function () { var db = r.result; if (!db.objectStoreNames.contains(ST)) db.createObjectStore(ST, { keyPath: 'id' }); };
      r.onsuccess = function () { var db = r.result; db.onversionchange = function () { db.close(); }; res(db); };
      r.onerror = function () { rej(r.error); }; r.onblocked = function () { rej(new Error('blocked')); };
    });
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(ST, mode), s = t.objectStore(ST), out = fn(s);
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); db.close(); };
        t.onerror = t.onabort = function () { rej(t.error || new Error('failed')); db.close(); };
      });
    });
  }
  var store = {
    all: function () { return tx('readonly', function (s) { return s.getAll(); }).then(function (x) { return (x || []).map(L.clean).filter(Boolean); }); },
    get: function (id) { return tx('readonly', function (s) { return s.get(id); }).then(function (x) { return x ? L.clean(x) : null; }); },
    put: function (e) { var c = L.clean(e); if (!c) return Promise.reject(new Error('bad')); return tx('readwrite', function (s) { s.put(c); }).then(function () { return c; }); },
    del: function (id) { return tx('readwrite', function (s) { s.delete(id); }); },
    replace: function (list) { return tx('readwrite', function (s) { s.clear(); list.forEach(function (e) { s.put(e); }); }); }
  };
  // ask once, quietly, that the browser keep the log (no prompt in Chrome or Safari; a false answer is normal)
  function persist() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {} }
  var fmtDay = function (iso) { return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); };
  var fmtTime = function (iso) { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); };
  var cantKeep = 'This browser does not let Astro Radar keep a log here (a private window, or storage turned off).';

  // ---------------------------------------------------------------- I saw it, on a launch page
  var saw = $('saw');
  if (saw) {
    var lj; try { lj = JSON.parse($('sawData').textContent); } catch (e) { lj = null; }
    // only once the launch has left the pad: before that there is nothing to have seen
    if (lj && Date.now() >= Date.parse(lj.utc) - 5 * 60000) {
      // the form, written here (constant markup, no launch data in it)
      var HOWT = [['plume', 'A glowing plume'], ['trail', 'A trail'], ['dot', 'A moving dot'], ['jellyfish', 'A twilight jellyfish']];
      saw.insertAdjacentHTML('beforeend', '<h2>Did you see it?</h2><p class="saw-s">Keep it in <a href="/logbook/">Your launches</a>, a log kept only in this browser.</p>' +
        '<button class="btn pri" id="sawOpen" type="button">I saw it</button>' +
        '<form id="sawForm" hidden><label for="sawFrom">Where from</label><input id="sawFrom" maxlength="60" autocomplete="off" aria-describedby="sawFromH">' +
        '<p class="saw-h" id="sawFromH">A ZIP code or a town, never your exact place. Optional.</p><fieldset><legend>What you saw</legend><div class="chips">' +
        HOWT.map(function (h) { return '<label class="chip"><input type="checkbox" name="how" value="' + h[0] + '"><span>' + h[1] + '</span></label>'; }).join('') +
        '</div></fieldset><label for="sawNote">A note (optional)</label><textarea id="sawNote" maxlength="280" rows="2"></textarea>' +
        '<div class="acts"><button class="btn pri" type="submit">Save</button><button class="btn" type="button" id="sawCancel">Cancel</button></div></form>' +
        '<div id="sawDone" hidden><p id="sawWhat"></p><div class="acts"><a class="btn" href="/logbook/">Your launches</a>' +
        '<button class="btn" type="button" id="sawEdit">Edit</button><button class="btn" type="button" id="sawDel">Remove</button></div></div>' +
        '<p class="saw-msg" id="sawMsg" role="status" aria-live="polite"></p>');
      saw.hidden = false;
      var form = $('sawForm'), done = $('sawDone'), msg = $('sawMsg'), openB = $('sawOpen');
      var show = function (e) {
        openB.hidden = !!e; form.hidden = true; done.hidden = !e;
        if (e) $('sawWhat').textContent = 'In Your launches' + (e.from ? ', seen from ' + e.from : '') + (e.how.length ? ': ' + e.how.map(function (h) { return L.HOW_WORD[h]; }).join(', ') : '') + '.';
      };
      var fill = function (e) {
        var z = null; try { z = JSON.parse(localStorage.getItem('radar.zipinfo') || 'null'); } catch (x) {}
        $('sawFrom').value = e ? e.from : (z && /^\d{5}$/.test(z.zip || '') ? z.zip : '');
        [].forEach.call(form.querySelectorAll('input[name=how]'), function (c) { c.checked = !!(e && e.how.indexOf(c.value) >= 0); });
        $('sawNote').value = e ? e.note : '';
      };
      var cur = null;
      store.get(lj.id).then(function (e) { cur = e; show(e); }, function () { show(null); });
      openB.addEventListener('click', function () { fill(cur); openB.hidden = true; form.hidden = false; $('sawFrom').focus(); });
      $('sawCancel').addEventListener('click', function () { show(cur); msg.textContent = ''; });
      $('sawEdit').addEventListener('click', function () { fill(cur); done.hidden = true; form.hidden = false; $('sawFrom').focus(); });
      $('sawDel').addEventListener('click', function () { store.del(lj.id).then(function () { cur = null; show(null); msg.textContent = 'Removed from Your launches.'; }, function () { msg.textContent = cantKeep; }); });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var from = $('sawFrom').value.trim();
        if (from && !L.place(from)) { msg.textContent = 'Enter a five digit ZIP code or a town name, or leave it empty.'; $('sawFrom').focus(); return; }
        var how = [].filter.call(form.querySelectorAll('input[name=how]'), function (c) { return c.checked; }).map(function (c) { return c.value; });
        store.put({ id: lj.id, at: new Date().toISOString(), from: from, how: how, note: $('sawNote').value, l: lj }).then(function (e) {
          cur = e; show(e); msg.textContent = 'Saved.'; persist();
        }, function () { msg.textContent = cantKeep; });
      });
    }
  }

  // ---------------------------------------------------------------- Your launches (/logbook/)
  var book = $('logbook');
  if (!book) return;
  var LIST = [];
  function badgeEl(b) {
    var li = el('li', 'bdg bdg-' + b.group);
    li.appendChild(el('b', null, b.title)); li.appendChild(el('span', null, b.desc));
    if (b.tier > 1) li.appendChild(el('i', null, b.tier + '+'));
    return li;
  }
  function render() {
    var n = LIST.length;
    $('lbCount').textContent = n === 1 ? '1 launch' : n + ' launches';
    $('lbEmpty').hidden = n > 0; $('lbHave').hidden = n === 0;
    var bs = L.badges(LIST), groups = { special: $('lbSpecial'), vehicle: $('lbVeh'), pad: $('lbPad') };
    Object.keys(groups).forEach(function (k) { groups[k].textContent = ''; });
    bs.forEach(function (b) { groups[b.group].appendChild(badgeEl(b)); });
    var ul = $('lbList'); ul.textContent = '';
    LIST.slice().sort(function (a, b) { return a.l.utc < b.l.utc ? 1 : -1; }).forEach(function (e) {
      var li = el('li', 'lb-e'), h = el('a', null, e.l.mis); h.href = '/launch/' + encodeURIComponent(e.id) + '/';
      var t = el('p', 'lb-t'); t.appendChild(h); li.appendChild(t);
      li.appendChild(el('p', 'lb-m', [e.l.veh, e.l.pad.split(',')[0], fmtDay(e.l.utc) + ', ' + fmtTime(e.l.utc)].filter(Boolean).join(' · ')));
      var saw_ = [e.from ? 'From ' + e.from : '', e.how.map(function (x) { return L.HOW_WORD[x]; }).join(', ')].filter(Boolean).join(': ');
      if (saw_) li.appendChild(el('p', 'lb-s', saw_));
      if (e.note) li.appendChild(el('p', 'lb-n', e.note));
      var rm = el('button', 'lnk', 'Remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + e.l.mis);
      rm.addEventListener('click', function () { store.del(e.id).then(load); });
      li.appendChild(rm); ul.appendChild(li);
    });
    var ys = {}; LIST.forEach(function (e) { ys[new Date(e.l.utc).getUTCFullYear()] = 1; });
    var sel = $('lbYear'), was = sel.value; sel.textContent = '';
    Object.keys(ys).sort().reverse().forEach(function (y) { var o = el('option', null, y); o.value = y; sel.appendChild(o); });
    if (was && ys[was]) sel.value = was;
    $('lbCardBox').hidden = n === 0;
  }
  function load() { return store.all().then(function (x) { LIST = x; render(); }, function () { $('lbMsg').textContent = cantKeep; $('lbEmpty').hidden = false; }); }
  // where the browser may clear the log: Safari in a tab (not added to the Home Screen) after 7 days without a visit
  var ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  if (ios && !standalone) $('lbSafari').hidden = false;
  try { var le = localStorage.getItem('radar.logexp'); if (le) $('lbLast').textContent = 'Last exported ' + fmtDay(JSON.parse(le)) + '.'; } catch (e) {}

  // export: one JSON file (on a phone with the share sheet, shared as a file)
  $('lbExport').addEventListener('click', function () {
    var doc = L.exportDoc(LIST), name = 'astro-radar-log-' + new Date().toISOString().slice(0, 10) + '.json', text = JSON.stringify(doc, null, 1);
    var blob = new Blob([text], { type: 'application/json' }), file = window.File ? new File([blob], name, { type: 'application/json' }) : null;
    var stamp = function () { try { localStorage.setItem('radar.logexp', JSON.stringify(doc.exported)); } catch (e) {} $('lbLast').textContent = 'Last exported ' + fmtDay(doc.exported) + '.'; };
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer:coarse)').matches) {
      navigator.share({ files: [file], title: 'Astro Radar log' }).then(stamp, function () {});
      return;
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); stamp();
  });
  // import: merge (the same launch twice is one sighting) or, after a second press, replace
  var pending = null;
  $('lbFile').addEventListener('change', function () {
    var f = this.files && this.files[0], m = $('lbMsg'); this.value = '';
    if (!f) return;
    if (f.size > 2e6) { m.textContent = 'That file is too big to be a log export.'; return; }
    f.text().then(function (t) {
      var r = L.readDoc(t);
      if (r.error) { m.textContent = r.error; return; }
      pending = r;
      var mg = L.merge(LIST, r.entries);
      store.replace(mg.list).then(function () {
        m.textContent = 'Added ' + mg.added + (mg.added === 1 ? ' launch' : ' launches') + ', ' + mg.same + ' already here' + (r.bad ? ', ' + r.bad + ' skipped (not valid)' : '') + '.';
        $('lbReplace').hidden = !mg.same && !LIST.length;
        load();
      }, function () { m.textContent = cantKeep; });
    }, function () { m.textContent = 'That file could not be read.'; });
  });
  // replace: the log becomes exactly the last imported file; a second press confirms (no dialog)
  var arm = false;
  $('lbReplace').addEventListener('click', function () {
    if (!pending) return;
    if (!arm) { arm = true; this.textContent = 'Press again to replace your whole log with that file'; return; }
    arm = false; this.textContent = 'Replace my log with that file instead'; this.hidden = true;
    store.replace(pending.entries).then(function () { $('lbMsg').textContent = 'Your log is now the ' + pending.entries.length + ' launches in that file.'; load(); });
  });

  // ---------------------------------------------------------------- Year in Launches: a 1080 by 1920 picture, drawn here
  var cv = $('lbCanvas');
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
  function fit(c, t, max, font) { var s = max; do { c.font = font.replace('{s}', s); s -= 2; } while (c.measureText(t).width > 920 && s > 20); return t; }
  function draw(y) {
    var s = L.year(LIST, y), c = cv.getContext('2d'), W = 1080, H = 1920, r = rng(y * 7919);
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#04050C'); g.addColorStop(0.6, '#0A1430'); g.addColorStop(1, '#04050C');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (var i = 0; i < 260; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.15 + r() * 0.6).toFixed(2) + ')'; var z = r() < 0.08 ? 2.2 : 1.2; c.fillRect(r() * W, r() * H, z, z); }
    // a horizon at the foot, the planet's rim
    var hz = c.createRadialGradient(W / 2, H + 1500, 1500, W / 2, H + 1500, 1640); hz.addColorStop(0, 'rgba(120,170,255,0.55)'); hz.addColorStop(0.08, 'rgba(40,80,170,0.25)'); hz.addColorStop(1, 'rgba(4,5,12,0)');
    c.fillStyle = hz; c.fillRect(0, H - 260, W, 260);
    c.textAlign = 'center'; c.fillStyle = '#fff';
    var top = 290;
    c.font = '600 44px Barlow, sans-serif'; c.fillStyle = '#9FB4D6'; c.fillText('YEAR IN LAUNCHES', W / 2, top);
    c.font = '600 150px "Barlow Condensed", sans-serif'; c.fillStyle = '#fff'; c.fillText(String(y), W / 2, top + 150);
    c.font = '600 300px "Barlow Condensed", sans-serif'; c.fillText(String(s.n), W / 2, top + 450);
    c.font = '500 52px Barlow, sans-serif'; c.fillStyle = '#CFE0FF'; c.fillText(s.n === 1 ? 'launch logged' : 'launches logged', W / 2, top + 530);
    var lines = [];
    if (s.vehicles.length) lines.push(['Rockets', s.vehicles.slice(0, 3).map(function (v) { return v[0] + (v[1] > 1 ? ' ×' + v[1] : ''); }).join(', ')]);
    if (s.pads.length) lines.push(['Pads', s.pads.length === 1 ? s.pads[0][0] : s.pads.length + ' different pads']);
    if (s.providers.length) lines.push(['Providers', s.providers.slice(0, 3).map(function (v) { return v[0]; }).join(', ')]);
    if (s.crew) lines.push(['Crewed', s.crew === 1 ? '1 launch with people on board' : s.crew + ' launches with people on board']);
    if (s.jelly) lines.push(['Twilight', s.jelly === 1 ? '1 jellyfish plume' : s.jelly + ' jellyfish plumes']);
    if (s.first) lines.push(['First', s.first.l.mis]);
    // inside the story frame's safe area (Instagram covers about 250 px at the top and the foot): at most five lines, the last by 1520
    var yy = top + 660;
    lines.slice(0, 5).forEach(function (ln) {
      c.font = '600 34px Barlow, sans-serif'; c.fillStyle = '#9FB4D6'; c.fillText(ln[0].toUpperCase(), W / 2, yy);
      c.fillStyle = '#fff'; fit(c, ln[1], 58, '600 {s}px Barlow, sans-serif'); c.fillText(ln[1], W / 2, yy + 62); yy += 120;
    });
    c.font = '600 40px Barlow, sans-serif'; c.fillStyle = '#fff'; c.fillText('ASTRO RADAR', W / 2, 1610);
    c.font = '500 32px Barlow, sans-serif'; c.fillStyle = '#9FB4D6'; c.fillText('astroradar.io', W / 2, 1656);
    return s;
  }
  var url = null;
  $('lbMake').addEventListener('click', function () {
    var y = +$('lbYear').value; if (!y) return;
    var ready = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('600 100px "Barlow Condensed"'), document.fonts.load('600 40px Barlow'), document.fonts.load('500 40px Barlow')]) : Promise.resolve();
    ready.catch(function () {}).then(function () {
      draw(y);
      cv.toBlob(function (b) {
        if (!b) return;
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(b);
        var img = $('lbCard'); img.src = url; img.hidden = false; img.alt = 'Your ' + y + ' in launches: ' + L.year(LIST, y).n + ' launches logged';
        var save = $('lbSave'); save.href = url; save.download = 'astro-radar-' + y + '.png'; save.hidden = false;
        var file = window.File ? new File([b], 'astro-radar-' + y + '.png', { type: 'image/png' }) : null, sh = $('lbShare');
        sh.hidden = !(file && navigator.canShare && navigator.canShare({ files: [file] }));
        sh.onclick = function () { navigator.share({ files: [file], title: 'My ' + y + ' in launches' }).catch(function () {}); };
      }, 'image/png');
    });
  });
  if (window.__logtest) window.__logbook = { store: store, draw: draw, load: load };
  load();
})();
