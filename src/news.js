/* Space news (/news/): while the page is open, a fresh copy of the headlines from the Spaceflight News API (no key, open to browsers),
   grouped and cut exactly as the build does (scripts/fetch_nasa.py news, group_of, snippet, demoji: **change the two together**;
   tests/test_space_pages.py runs both on the same saved answer). The grouping words come from the page (news_words.py). If the API does
   not answer, the page keeps the headlines it was built with and their date. Only the headline, publisher, date and first line are shown. */
var NEWS = (function () {
  'use strict';
  // UTF-8 read as Windows-1252 (â€™ for ’): the 1252 bytes back, decoded as UTF-8
  var CP = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b,
    0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99,
    0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
  function demoji(t) {
    if (!/[ÂÃâ][\u0080-¿€™œ‘-„]/.test(t)) return t;
    var b = [];
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      if (c < 0x100) b.push(c); else if (CP[c] !== undefined) b.push(CP[c]); else return t;
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(b)); } catch (e) { return t; }
  }
  function ws(t) { return String(t || '').replace(/\s+/g, ' '); }
  function snippet(summary, title) {
    var t = demoji(ws(summary)).trim();
    t = t.replace(/The post .*? appeared first on .*?\.?$/, '').trim();
    t = t.replace(/\s*\[(…|\.\.\.|&#8230;)\]\s*$/, '').trim();
    if (!t || t.toLowerCase().indexOf(title.toLowerCase().slice(0, 24)) >= 0 || /Archive|Submissions|Index Search/.test(t)) return '';
    // the first sentence: it ends at a full stop (or ! or ?) after a lower case letter, a digit or a closing mark, followed by a capital
    var re = /[.!?]\s+(?=[A-Z“"'])/g, m, first = t;
    while ((m = re.exec(t))) {
      if (/[a-z0-9)\]”’"']/.test(t.charAt(m.index - 1))) { first = t.slice(0, m.index + 1); break; }
    }
    if (first.length > 150) { first = first.slice(0, 150); first = first.slice(0, first.lastIndexOf(' ') < 0 ? first.length : first.lastIndexOf(' ')).replace(/[,;:]+$/, '') + '…'; }
    return first;
  }
  function item(a, LW, MW) {
    var url = String(a.url || ''), title = demoji(ws(a.title)).trim();
    if (url.indexOf('https://') !== 0 || !title || !a.published_at) return null;
    var e = { id: a.id, title: title.slice(0, 160), site: String(a.news_site || '').slice(0, 60), url: url, date: String(a.published_at).slice(0, 19) + 'Z', snip: snippet(a.summary, title) };
    if (a.events && a.events.length) e.ev = 1;
    e.g = LW.test(e.title) ? 'launches' : (e.ev || MW.test(e.title + ' ' + e.snip)) ? 'missions' : 'science';
    return e;
  }
  function list(d, LW, MW) {
    return ((d && d.results) || []).map(function (a) { return item(a, LW, MW); }).filter(Boolean).sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : 0; });
  }
  return { demoji: demoji, snippet: snippet, list: list };
})();
if (typeof module !== 'undefined') module.exports = NEWS;

(function () {
  if (typeof document === 'undefined') return;
  var box = document.getElementById('news');
  // times: the visitor's own, with the UTC time the page was built with kept as the tooltip
  [].forEach.call(document.querySelectorAll('time[data-lt]'), function (t) { var d = new Date(t.getAttribute('datetime')); if (isNaN(d)) return; t.title = t.textContent; t.textContent = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); });
  if (!box || !window.fetch) return;
  var LW = new RegExp(box.getAttribute('data-lw'), 'i'), MW = new RegExp(box.getAttribute('data-mw'), 'i');
  var NAMES = { launches: 'Launches', missions: 'Missions', science: 'Science and more' };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function when(iso) { var d = new Date(iso); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  fetch('https://api.spaceflightnewsapi.net/v4/articles/?limit=40', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      var all = NEWS.list(d, LW, MW);
      if (all.length < 5) return;
      var frag = document.createDocumentFragment();
      ['launches', 'missions', 'science'].forEach(function (g) {
        var items = all.filter(function (a) { return a.g === g; }).slice(0, 8);
        if (!items.length) return;
        var sec = el('section', 'ns'), ul = el('ul', 'nl');
        sec.setAttribute('data-g', g); sec.appendChild(el('h2', null, NAMES[g]));
        items.forEach(function (a) {
          var li = el('li'), link = el('a', null, a.title);
          link.href = a.url; link.target = '_blank'; link.rel = 'noopener';
          li.appendChild(link); li.appendChild(el('span', 'nsrc', a.site + ' · ' + when(a.date)));
          if (a.snip) li.appendChild(el('p', null, a.snip));
          ul.appendChild(li);
        });
        sec.appendChild(ul); frag.appendChild(sec);
      });
      box.textContent = ''; box.appendChild(frag);
      var u = document.getElementById('newsUpd');
      if (u) u.textContent = 'Checked ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ', live from the Spaceflight News API';
    }).catch(function () {});
})();
