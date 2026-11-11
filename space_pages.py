"""Live from space (/live/) and Space news (/news/), written by launch_pages.build_pages on the shared stylesheet, header and footer.

Everything on them is real data with its source and its time: data/nasa.json and data/news.json (scripts/fetch_nasa.py) at build time,
the ISS from the feed's orbital elements (CelesTrak, worked out in the visitor's browser by live.js with satellite.js), and, while the
page is open, a fresh copy of the space weather, the Earth events and the news from their own keyless, open APIs (live.js, news.js). A
source that failed keeps its last good copy and says when it is from. Nothing is made up: a card with no data is left out.
No hyphens in our own copy; headlines are the publishers' own words."""
import html
import json
from datetime import datetime, timezone

SITE = "https://astroradar.io/"
e = html.escape
CONNECT = ["https://services.swpc.noaa.gov", "https://eonet.gsfc.nasa.gov", "https://api.spaceflightnewsapi.net"]
# the news groups (fetch_nasa.group_of decides; news.js reads the same words from the page, so the two cannot drift)
GROUPS = (("launches", "Launches"), ("missions", "Missions"), ("science", "Science and more"))


def csp():
    return ('<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\'; '
            "font-src 'self'; connect-src 'self' " + " ".join(CONNECT) + "; manifest-src 'self'; object-src 'none'; base-uri 'self'\">\n")


def _dt(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def when(s, day_only=False):
    """Nov 11, 12:47 PM UTC (or Nov 11, 2026), in a <time> the scripts turn into the visitor's own time"""
    d = _dt(s)
    if not d:
        return ""
    if day_only:
        return f'<time datetime="{d:%Y-%m-%d}">{d:%b} {d.day}, {d.year}</time>'
    return (f'<time datetime="{d:%Y-%m-%dT%H:%M:%SZ}" data-lt>{d:%b} {d.day}, {d.hour % 12 or 12}:{d.minute:02d} '
            f'{"AM" if d.hour < 12 else "PM"} UTC</time>')


def stamp(v, key=""):
    """the card's freshness line: when the data was fetched, or that it is the last good copy"""
    lab = "Last updated" if v.get("stale") else "Updated"
    return f'<p class="upd2"{f" id={chr(34)}{key}{chr(34)}" if key else ""}>{lab} {when(v.get("at"))}</p>'


def credit(v, name):
    return f'<p class="cred">{e(v.get("credit") or name)} · <a href="{e(v["src"])}" target="_blank" rel="noopener">Source</a></p>'


def card(cls, title, inner, v, name, key=""):
    return f'<section class="lv {cls}"><h2>{title}</h2>{inner}{credit(v, name)}{stamp(v, key)}</section>\n'


def epic_card(d):
    v = d.get("epic") or {}
    if not v.get("utc"):
        return ""
    img = v.get("big") or v.get("img")
    pic = (f'<img src="/{e(img[0])}" width="{img[1]}" height="{img[2]}" alt="The whole sunlit Earth from NASA\'s EPIC camera, {e(v["utc"][:10])}" '
           'fetchpriority="high">' if img else "")
    at = (f" It was looking down on {abs(v['lat']):g}° {'N' if v['lat'] >= 0 else 'S'}, {abs(v['lon']):g}° {'E' if v['lon'] >= 0 else 'W'}."
          if isinstance(v.get("lat"), (int, float)) else "")
    inner = (f'<figure class="lv-pic">{pic}</figure><p>The whole sunlit side of Earth, taken {when(v["utc"])} by NASA\'s EPIC camera on the DSCOVR '
             f"spacecraft, about 1.5 million km away.{at} EPIC sends a new set every day or two, so this is its latest, not a live view.</p>")
    if v.get("page"):
        inner += f'<p><a href="{e(v["page"])}" target="_blank" rel="noopener">See that day\'s images on NASA EPIC</a></p>'
    return card("lv-epic", "Earth from a million miles", inner, v, "NASA EPIC team")


def iss_card(feed):
    iss = (feed or {}).get("iss") or {}
    tle = iss.get("tle") or []
    if len(tle) != 2:
        return ""
    v = {"credit": "Orbital elements: CelesTrak", "src": "https://celestrak.org/", "at": iss.get("epoch"), "stale": iss.get("stale")}
    inner = (f'<div class="iss" id="iss" data-l1="{e(tle[0])}" data-l2="{e(tle[1])}" data-epoch="{e(iss.get("epoch") or "")}">'
             '<p class="iss-now" id="issNow">The station\'s position is worked out in your browser from its orbital elements.</p>'
             '<p class="iss-pass" id="issPass"><a href="/#sky">Set your ZIP code on the radar</a> to see when it next passes over you.</p></div>'
             "<p class=\"muted\">The International Space Station circles Earth about every 92 minutes, some 400 km up. You can see it with your "
             "eyes when it passes over in sunlight while your sky is dark: a steady, bright, moving light.</p>")
    return card("lv-iss", "The ISS right now", inner, dict(v, at=iss.get("epoch")), "CelesTrak").replace("<p class=\"upd2\">Updated", "<p class=\"upd2\">Elements from", 1).replace("<p class=\"upd2\">Last updated", "<p class=\"upd2\">Elements from", 1)


def sun_card(d):
    v = d.get("sun") or {}
    if not v.get("summary") or "swpc" not in str(v.get("src")):
        return ""
    sc = v.get("scales") or {}
    lev = lambda k: "none" if str(sc.get(k, "0")) == "0" else k + str(sc.get(k))
    inner = (f'<p class="big" id="kpLine">Kp {v.get("kpNow", v.get("kp")):g} now</p>'
             f'<p id="sunSum">{e(v["summary"])} {e(v.get("aurora") or "")}</p>'
             f'<ul class="scales" id="sunScales"><li><b>Radio blackouts</b> {lev("R")}</li><li><b>Radiation storms</b> {lev("S")}</li>'
             f'<li><b>Geomagnetic storms</b> {lev("G")}</li></ul>'
             '<p class="muted">Kp runs from 0 (calm) to 9 (an extreme storm); 5 and up is a geomagnetic storm. NOAA\'s scales run from 1 to 5.</p>')
    return card("lv-sun", "Space weather", inner, v, "NOAA SWPC", "sunUpd")


def neo_card(d, mi):
    v = d.get("neo") or {}
    c = v.get("closest") or {}
    if not v.get("count") or not c.get("km"):
        return ""
    moon = f"closer than the Moon ({c['ld']:g} times its distance)" if c.get("ld", 9) < 1 else f"{c.get('ld'):g} times as far as the Moon"
    size = f" It is about {c['m'][0]} to {c['m'][1]} meters across, estimated from its brightness." if c.get("m") else ""
    inner = (f'<p class="big">{v["count"]} asteroids</p><p>pass within 7.5 million km of Earth in the 7 days from the update. The closest, '
             f'{e(c["name"])}, passes on {when(c.get("date"), True)} at {mi(c["km"])}, {moon}.{size}</p>'
             '<p class="muted">Close passes are normal: none of these is a threat.</p>')
    return card("lv-neo", "Asteroids this week", inner, v, "NASA JPL CNEOS")


def events_card(d):
    v = d.get("events") or {}
    lst = v.get("list") or []
    if not lst:
        return ""
    items = "".join(f'<li><a href="{e(x["link"])}" target="_blank" rel="noopener">{e(x["title"])}</a><span>{e(x["cat"])} · {when(x["date"], True)}</span></li>'
                    for x in lst)
    cats = ", ".join(f"{n} {e(k.lower())}" for k, n in sorted((v.get("cats") or {}).items(), key=lambda kv: -kv[1]))
    inner = (f'<p id="evSum">{v.get("count", len(lst))} natural events open in the last 30 days: {cats}.</p>'
             f'<ul class="evl" id="evList">{items}</ul>')
    return card("lv-ev", "Earth events", inner, v, "NASA EONET", "evUpd")


def sources(rows):
    return ('<section class="lv-src"><h2>Data sources</h2><ul class="guide">'
            + "".join(f"<li><b>{n}</b>: {t}</li>" for n, t in rows) + "</ul></section>\n")


def live_page(d, feed, ctx, page):
    cards = [epic_card(d), iss_card(feed), sun_card(d), neo_card(d, ctx["mi"]), events_card(d)]
    cards = [c for c in cards if c]
    body = ('<p class="sub">Real data from NASA, NOAA and CelesTrak, each with its source and its time. Nothing here is made up; a source that is '
            "down keeps its last good data and says when it is from.</p>\n<div class=\"lvg\">" + "".join(cards) + "</div>\n"
            + sources([
                ("Earth from a million miles", "NASA EPIC (the Earth Polychromatic Imaging Camera on DSCOVR), fetched with the site; a new set every day or two."),
                ("The ISS right now", "CelesTrak's orbital elements for the station, in the launch feed; your browser works out where it is and its next pass "
                 "over your saved ZIP code (nothing is sent anywhere)."),
                ("Space weather", "NOAA Space Weather Prediction Center: X ray flares, the Kp index and NOAA's scales; checked again by your browser while the page is open."),
                ("Asteroids this week", "NASA JPL's close approach data (CNEOS), fetched with the site."),
                ("Earth events", "NASA EONET: wildfires, storms, volcanoes and ice tracked by NASA and its partners; checked again by your browser while the page is open."),
            ])
            + '<p class="muted">Astro Radar is not affiliated with NASA, NOAA or CelesTrak. NASA and NOAA data are public domain.</p>')
    return page("live", "Live from space", "The whole Earth from a million miles out, the ISS right now, space weather, this week's asteroids and Earth "
                "events: real NASA and NOAA data with its source and time.", body, ctx, here="live",
                head='<script src="/live.js" defer></script>\n', csp=csp())


def news_item(a):
    snip = f'<p>{e(a["snip"])}</p>' if a.get("snip") else ""
    return (f'<li data-id="{e(str(a.get("id")))}"><a href="{e(a["url"])}" target="_blank" rel="noopener">{e(a["title"])}</a>'
            f'<span class="nsrc">{e(a["site"])} · {when(a["date"])}</span>{snip}</li>')


def news_page(n, ctx, page):
    lst = (n or {}).get("list") or []
    secs = ""
    for g, name in GROUPS:
        items = [a for a in lst if a.get("g") == g][:8]
        if items:
            secs += f'<section class="ns" data-g="{g}"><h2>{name}</h2><ul class="nl">' + "".join(news_item(a) for a in items) + "</ul></section>\n"
    if not secs:
        secs = '<p>The headlines could not be loaded. Try again later.</p>'
    import news_words
    body = ('<p class="sub">The latest space headlines from publishers around the world, through the Spaceflight News API. Each links to the '
            "full story on the publisher's own site.</p>\n"
            + f'<div class="news" id="news" data-lw="{e(news_words.LAUNCH)}" data-mw="{e(news_words.MISSION)}">' + secs + "</div>\n"
            + (stamp(n, "newsUpd") if n else "")
            + sources([
                ("Where the stories come from", "the Spaceflight News API by The Space Devs, which gathers headlines from space news sites, agencies and "
                 "companies. Astro Radar shows only each headline, the publisher, the date and the first line of its summary, and links to the publisher; "
                 "it never copies an article."),
                ("How they are grouped", "by Astro Radar, from the words in each headline: launches and rockets, then missions and spacecraft, then the rest."),
                ("How fresh", "fetched with the site and checked again by your browser while the page is open."),
            ])
            + '<p class="muted">Headlines are their publishers\' own words. Astro Radar is not affiliated with the Spaceflight News API or any publisher.</p>')
    return page("news", "Space news", "The latest space headlines, grouped as launches, missions and science, each linking to its publisher.",
                body, ctx, here="news", head='<script src="/news.js" defer></script>\n', csp=csp())


def numbers(feed, providers, now):
    """By the numbers, from our own feed only: launches tracked, providers tracked, launches in the next 30 days, the last update"""
    if not isinstance(feed, dict) or not feed.get("generated"):
        return ""
    up = [f for f in feed.get("launches") or [] if isinstance(f, dict) and f.get("utc")]
    rec = [f for f in feed.get("recent") or [] if isinstance(f, dict)]
    soon = [f for f in up if (_dt(f["utc"]) or now) >= now and ((_dt(f["utc"]) or now) - now).days < 30]
    provs = {f.get("prov") for f in up + rec if f.get("prov")}
    cells = (("Launches tracked", len(up) + len(rec), "upcoming and flown in the last 7 days"),
             ("Launch providers", len(provs), f"with launches now, of {len(providers)} listed"),
             ("In the next 30 days", len(soon), "launches still to come"))
    return ('<section class="nums"><h2>By the numbers</h2><ul>' + "".join(f"<li><b>{n:,}</b><span>{k}</span><i>{t}</i></li>" for k, n, t in cells)
            + f'</ul><p class="muted">From the launch feed (Launch Library 2) as of {when(feed["generated"])}.</p></section>\n')


def write_all(dist, feed, ctx, page):
    root = ctx["root"]
    try:
        d = json.loads((root / "data/nasa.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    try:
        n = json.loads((root / "data/news.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        n = {}
    out = []
    for slug, text in (("live", live_page(d, feed, ctx, page)), ("news", news_page(n, ctx, page))):
        (dist / slug).mkdir(exist_ok=True)
        (dist / slug / "index.html").write_text(text, encoding="utf-8")
        out.append(SITE + slug + "/")
    return out
