"""Remember it (Part 3): "I saw it" on each launch page and Your launches (/logbook/), written by launch_pages.build_pages.

The log lives only in the visitor's browser (IndexedDB, src/logbook.js, with its rules in src/logcore.js); the build writes the markup the
script fills in, and for each launch the facts the log keeps about it (#sawData, a JSON block the page never runs: the name, rocket, provider, pad, region, liftoff, crewed and
Starship), all from the feed. Research and design rules: docs/LOGBOOK_RESEARCH.md. No streaks, no pop ups, no account."""
import html
import json
import re

e = lambda s: html.escape(str(s), quote=True)
SITE = "https://astroradar.io/"


def site_of(pad):
    s = f"{pad.get('n') or ''} {pad.get('full') or ''}"
    if pad.get("st") == "FL" or re.search(r"Cape Canaveral|Kennedy Space Center", s):
        return "cape"
    if "Vandenberg" in s:
        return "vandenberg"
    if re.search(r"Starbase|Boca Chica", s):
        return "starbase"
    return "other"


def crewed(mt, mis):
    """the same rule as LOG.crewed in src/logcore.js (tests/logbook.test.mjs runs both)"""
    return bool(re.search(r"Human Exploration|Tourism", str(mt or ""), re.I)
                or re.search(r"\b(Crew[ -]?\d+|Axiom|Ax ?\d+|Shenzhou ?\d+|Soyuz MS|Artemis II\b|Polaris|Fram2|Inspiration4)\b", str(mis or ""), re.I))


def saw_section(f, ctx, title):
    """I saw it: hidden in the markup, shown by logbook.js once the launch has left the pad"""
    pad = f.get("pad") or {}
    prov = (ctx["providers"].get(f.get("prov")) or {})
    l = {"id": f["id"], "mis": title, "veh": f.get("veh") or "", "prov": f.get("prov") or "", "pn": prov.get("n") or "", "pad": pad.get("full") or pad.get("n") or "",
         "site": site_of(pad), "utc": f["utc"], "crew": crewed(f.get("mt"), f.get("mis")), "ship": "Starship" in (f.get("veh") or "")}
    data = json.dumps(l, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    # only the launch's facts are in the page; logbook.js writes the form (it is hidden until then anyway), which keeps the launch pages
    # under their 20 KB with the sign in link in every header
    return f'<section class="saw" id="saw" hidden><script type="application/json" id="sawData">{data}</script></section>\n'


SCRIPTS = '<script src="/logcore.js" defer></script><script src="/logbook.js" defer></script>\n'


def logbook_page(ctx, page):
    body = (
        '<div id="logbook"><p class="sub">The launches you saw, kept only in this browser.</p>\n'
        '<div class="lb-top"><p class="lb-big" id="lbCount" aria-live="polite">0 launches</p>'
        '<p class="lb-note" id="lbSafari" hidden>On an iPhone, Safari may clear what a site keeps after a week without a visit. Add Astro Radar to '
        'your Home Screen, or export now and then.</p></div>\n'
        '<div id="lbEmpty"><p>Nothing logged yet. After a launch, open its page and press <b>I saw it</b>: where you watched from (a ZIP code '
        'or a town) and what you saw. <a href="/#launches">Recent and upcoming launches</a>.</p></div>\n'
        '<div id="lbHave" hidden>'
        '<h2>Badges</h2><p class="muted">What your log shows, worked out from it each time; nothing to chase.</p>'
        '<ul class="bdgs" id="lbSpecial"></ul><h3>Rockets</h3><ul class="bdgs" id="lbVeh"></ul><h3>Pads</h3><ul class="bdgs" id="lbPad"></ul>'
        '<h2>Your launches</h2><ul class="lb-list" id="lbList"></ul>'
        '<section id="lbCardBox" hidden><h2>Year in Launches</h2><p>A picture of your year to share, 1080 by 1920. Your ZIP code and notes are '
        'never on it.</p><div class="acts"><label for="lbYear" class="sr">Year</label><select id="lbYear"></select>'
        '<button class="btn pri" id="lbMake" type="button">Make my card</button><button class="btn" id="lbShare" type="button" hidden>Share</button>'
        '<a class="btn" id="lbSave" hidden>Save the picture</a></div>'
        '<img id="lbCard" class="lb-card" width="1080" height="1920" alt="" hidden><canvas id="lbCanvas" width="1080" height="1920" hidden></canvas></section>'
        '</div>\n'
        '<h2>Keep a copy</h2><p>Nothing is sent anywhere and there is no account. Export writes your whole log as one file. Import adds a file\'s launches to this log; the same launch twice is kept once.</p>'
        '<div class="acts"><button class="btn" id="lbExport" type="button">Export my log</button>'
        '<label class="btn" for="lbFile">Import a log</label><input class="sr" type="file" id="lbFile" accept="application/json,.json">'
        '<button class="btn" id="lbReplace" type="button" hidden>Replace my log with that file instead</button></div>'
        '<p class="lb-note" id="lbLast"></p><p class="saw-msg" id="lbMsg" role="status" aria-live="polite"></p>\n'
        '<p class="muted">How this works: <a href="/privacy/#log">Privacy</a>. No streaks and no reminders to log, on purpose.</p></div>')
    csp = ctx["csp"].replace("img-src 'self';", "img-src 'self' blob:;")
    return page("logbook", "Your launches", "The rocket launches you saw, kept only in your browser: badges by pad, rocket and mission, a Year in Launches "
                "picture to share, and export and import.", body, ctx, here="logbook", head=SCRIPTS, csp=csp)
