"""Go watch (Part 2): everything a first time visitor needs to see a launch in person, written at build time from the feed and two data files.

  data/viewing_spots.json   public places people watch from near the Cape and Kennedy, Vandenberg and Starbase, each fact with the page it
                            came from and the day it was checked (docs/GOWATCH_SOURCES.md has the research, its gaps and what could not be
                            verified). A fact only a search engine's summary gave was left out. Places come from OpenStreetMap (ODbL).
  data/history/odds.json    scrub and slip odds from Launch Library's own update notes on 300 flown launches (scripts/scrub_stats.py), always
                            with the sample size and the dates; a rocket or provider with too few flights, or notes too thin, gets none.

Pages and parts:
  trip(f, ...)      Plan your trip on each upcoming launch page: the nearest places for that pad with the distance, a map link, parking,
                    fees and closures as their own pages say, when to arrive, what you will see and hear, the scrub odds and the next try
  /guide/           the first launch guide
  /spacecoast/      the Space Coast: every place with parking, fees and closures, and the QR code (/ksc/, the old Florida page, sends here)
  /vandenberg/      Vandenberg (Lompoc), with the roads closed to viewing
  /starbase/        Starbase (South Padre Island), with the Boca Chica closures
  /pad/<slug>/      one page per pad with launches in the feed: its launches (Event markup, each pointing at its launch page), the places
                    near it and the odds of the rockets that fly there
  /tonight/         What was that in the sky? the launch that most likely made the light people saw tonight, when, which way it went and
                    what people usually see
Nothing here is made up: a field a source did not state says so, distances are worked out from the feed's pad and the place's location,
and every time is written in UTC for launch.js to show in the visitor's own zone. No hyphens in our own copy (pad codes keep theirs).
"""
import html
import json
import math
import pathlib
import re
from datetime import datetime, timedelta, timezone

e = lambda s: html.escape(str(s), quote=True)
ROOT = pathlib.Path(__file__).resolve().parent
SITE = "https://astroradar.io/"
REGION = {"cape": "the Space Coast (Cape Canaveral and Kennedy)", "vandenberg": "Vandenberg, California", "starbase": "Starbase, Texas"}
GUIDE = {"cape": "/spacecoast/", "vandenberg": "/vandenberg/", "starbase": "/starbase/"}
SOUND = 0.343  # km a second
HEAR_KM = 60   # the sound delay is given only this close (the same limit as the Look Up card's, ORB.lookUp in src/model.js)


def load():
    spots = json.loads((ROOT / "data/viewing_spots.json").read_text(encoding="utf-8"))
    try:
        odds = json.loads((ROOT / "data/history/odds.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        odds = {"groups": {}}
    return spots, odds


def _dt(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def km_between(a, b, c, d):
    p = math.pi / 180
    h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def name_of(f):
    """a launch's name as every list on the site shows it (the short name; the rocket and Launch for a payload not disclosed)"""
    import launch_pages
    return launch_pages.short_name(f.get("mis"), f.get("veh"))


def region_of(f):
    pad = (f or {}).get("pad") or {}
    full = f"{pad.get('n') or ''} {pad.get('full') or ''}"
    if pad.get("st") == "FL" or re.search(r"Cape Canaveral|Kennedy Space Center", full):
        return "cape"
    if re.search(r"Vandenberg", full):
        return "vandenberg"
    if re.search(r"Starbase|Boca Chica", full):
        return "starbase"
    return None


def near(f, spots, n=4):
    """the public places nearest this launch's pad in its region, nearest first, with the distance worked out from the feed's pad"""
    pad = (f or {}).get("pad") or {}
    r = region_of(f)
    if not r or not all(isinstance(pad.get(k), (int, float)) for k in ("lat", "lon")):
        return []
    out = [(km_between(pad["lat"], pad["lon"], p["lat"], p["lon"]), p) for p in spots["places"] if p["region"] == r]
    out = [x for x in out if x[0] < 120]
    return sorted(out, key=lambda x: x[0])[:n]


def first(t, cap=220):
    """the first sentence of a field, or the whole field when short"""
    t = str(t or "not stated")
    if len(t) <= cap:
        return t
    m = re.match(r"(.{40,%d}?[.;])\s" % cap, t)
    return re.sub(r";$", ".", m.group(1)) if m else t[:cap].rsplit(" ", 1)[0] + "…"


def dehy(t):
    return re.sub(r"(?<=[A-Za-z])-(?=\d)|(?<=\d)-(?=[A-Za-z])", " ", str(t))


def checked(d):
    try:
        x = datetime.strptime(d, "%Y-%m-%d")
        return f"{x:%b} {x.day}, {x.year}"
    except (TypeError, ValueError):
        return str(d)


def osm(p):
    return f"https://www.openstreetmap.org/?mlat={p['lat']}&mlon={p['lon']}#map=15/{p['lat']}/{p['lon']}"


def spot_html(km, p, mi, sound=True, compact=False):
    src = p["sources"][0] if p.get("sources") else None
    secs = round(km / SOUND)
    off = p.get("official_mi") or {}
    rows = [("Hours and closures", p["closures"])] if compact else [("Parking", p["parking"]), ("Fees", p["fees"]), ("Hours and closures", p["closures"]), ("Arrive", p["arrive"]), ("Restrooms", p["restrooms"])]
    rows = [(k, v) for k, v in rows if v and v != "not stated"] or [("What its pages say", "Nothing on parking, fees or hours was stated by a page we could read.")]
    more = "".join(f"<div><dt>{k}</dt><dd>{e(dehy(first(v, 260 if compact else 400)))}</dd></div>" for k, v in rows)
    srcs = "".join(f'<li><a href="{e(s["url"])}" target="_blank" rel="noopener">{e(dehy(s["title"]))}</a>, checked {checked(s["checked"])}'
                   f'{", page dated " + e(s["page_date"]) if s.get("page_date") and s["page_date"] != "not stated" else ""}</li>' for s in (p.get("sources") or [])[:1 if compact else 9])
    return (f'<li class="spot"><h3>{e(dehy(p["name"]))}</h3>'
            f'<p class="sp-d"><b>{mi(km)}</b> from the pad, straight line'
            + (f' · the roar arrives about {secs} seconds after liftoff' if sound and km <= HEAR_KM else "")
            + f' · <a href="{e(osm(p))}" target="_blank" rel="noopener">Map</a></p>'
            + (f'<p class="sp-o">The Visitor Complex gives its own distances: ' + ", ".join(f"{e(dehy(k))} {v:g} mi" for k, v in off.items()) + ".</p>" if off else "")
            + f'<p class="sp-k"><span>Parking</span> {e(dehy(first(p["parking"], 160)))}</p>'
            + f'<p class="sp-k"><span>Fees</span> {e(dehy(first(p["fees"], 160)))}</p>'
            + f'<details class="sp-more"><summary>Hours, closures and sources</summary><dl>{more}</dl><ul class="sp-src">{srcs}</ul></details></li>')


def odds_line(o, veh):
    """the scrub odds in words, always with the sample size and the dates; None when there is nothing to say"""
    if not o:
        return None, None
    name = o["key"].split(":", 1)[1]
    since = checked(o["from"]).rsplit(",", 1)
    span = f"{since[0]}{',' + since[1] if len(since) > 1 else ''} to {checked(o['to'])}"
    if not o["enough"]:
        why = ("its notes are too thin to show a scrub" if o["n"] >= 8 else f"only {o['n']} flown in that time")
        return (f"Too few to say for {e(name)}: Launch Library's notes cover {o['n']} of its flights from {span}, and {why}.", None)
    pct = round(o["scrubbed"] / o["n"] * 100)
    mv = round(o["late_move"] / o["n"] * 100)
    a = (f"{o['scrubbed']} of {o['n']} {e(name)} flights from {span} had a scrub ({pct}%), and {o['late_move']} ({mv}%) moved to another day in "
         "their last 3 days, by Launch Library's own notes.")
    b = (f"After a scrub the next try came a median {o['retry_h']} hours later ({o['retry_n']} scrubs)." if o.get("retry_h") is not None else None)
    return a, b


def odds_of(f, odds, providers):
    import sys
    if str(ROOT / "scripts") not in sys.path:
        sys.path.insert(0, str(ROOT / "scripts"))
    import scrub_stats
    prov = (providers or {}).get(f.get("prov")) or {}
    names = list(prov.get("match") or []) + ([prov["n"]] if prov.get("n") else [])
    return scrub_stats.odds_for(odds, f.get("veh") or "", names)


def tmark_local(dt, text, mode="t"):
    return f'<time datetime="{dt.astimezone(timezone.utc):%Y-%m-%dT%H:%M:%SZ}" data-local="{mode}">{e(text)}</time>'


def utc_text(dt, mode="t"):
    t = f"{dt.hour % 12 or 12}:{dt.minute:02d} {'AM' if dt.hour < 12 else 'PM'} UTC"
    return t if mode == "t" else f"{dt:%a, %b} {dt.day} · {t}"


def trip(f, when, kind, ctx):
    """Plan your trip on an upcoming launch page"""
    if kind != "up":
        return ""
    spots, odds = ctx["gowatch"]
    mi = ctx["mi"]
    r = region_of(f)
    ns = near(f, spots, 3)
    o = odds_of(f, odds, ctx["providers"])
    a, b = odds_line(o, f.get("veh"))
    key = f"{round(o['scrubbed'] / o['n'] * 100)}% scrubbed" if o and o["enough"] else "Too few flights to say"
    odds_p = (f"<p>{a}" + (f" {b}" if b else "") + " The notes are written by people and can miss a scrub, so take these as a floor.</p>") if a else \
        "<p>No scrub record for this rocket yet: Launch Library's notes have none of its flights in the last year.</p>"
    if not r or not ns:
        return ('<section class="trip" id="trip"><h2>Plan your trip</h2>'
                "<p>We have no viewing guide for this launch site yet. Watch the official stream, and if you are nearby, the "
                '<a href="/guide/">first launch guide</a> still applies.</p><h3>Will it go on time?</h3>' + odds_p + "</section>\n")
    arrive = when - timedelta(hours=2)
    closest = ns[0][0]
    hear = (f"From the nearest place, {mi(closest)} away, the roar arrives about {round(closest / SOUND)} seconds after you see liftoff "
            "(sound covers about a mile every 5 seconds); with the wind off the ocean people hear launches 35 or more miles inland.")
    nights = ("If it scrubs, the provider announces the new time; this page and the radar follow within 30 minutes, and a reminder you set "
              "follows the launch.")
    return ('<section class="trip" id="trip"><h2>Plan your trip</h2>'
            f'<p class="trip-lede">Public places nearest this pad, as their own pages describe them (checked {checked(spots["checked"])}; check again '
            f'before you go). <a href="{GUIDE[r]}">More on {e(REGION[r])}</a> · <a href="/guide/">First launch guide</a></p>'
            '<div class="trip-key">'
            f'<div><span>Arrive by</span><b>{tmark_local(arrive, utc_text(arrive))}</b><i>two hours early: parks fill, and roads near the pads close before liftoff</i></div>'
            f'<div><span>Will it go?</span><b>{key}</b><i>{"of " + str(o["n"]) + " recent " + e(o["key"].split(":", 1)[1]) + " flights" if o and o["enough"] else "see below"}</i></div>'
            f'<div><span>The sound</span><b>about {round(closest / SOUND)} s after liftoff</b><i>at {mi(closest)}</i></div></div>'
            '<ol class="spots">' + "".join(spot_html(km, p, mi, compact=True) for km, p in ns) + "</ol>"
            + f'<p>More places, with parking, fees and restrooms: <a href="{GUIDE[r]}">{e(REGION[r])}</a>.</p>'
            + "<h3>What you will see and hear</h3>"
            + "".join(f"<p>{e(s)}</p>" for s in (ctx["sky_reach"](f, when, ctx["ranges"]) or [[]])[0])
            + f"<p>{e(hear)}</p>"
            "<h3>Will it go on time?</h3>" + odds_p + f"<p>{e(nights)} What to bring: <a href=\"/guide/\">the first launch guide</a>.</p></section>\n")


# ---------------------------------------------------------------- pages
FL_TEXT = None


def hub(feed, ctx, slug_of):
    """the top of Go watch: the three places people drive to, every pad with a launch in the feed (soonest first), and the page for a light
    seen in the sky; so each of them is two taps from home"""
    spots = ctx["gowatch"][0]
    now = ctx["now"]
    nxt = {}
    pads = {}
    for f in feed.get("launches") or []:
        pad = (f or {}).get("pad") or {}
        t = _dt(f.get("utc"))
        if not pad.get("n") or not t or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", str(f.get("id") or "")):
            continue
        k = slug_of(pad)
        d = pads.setdefault(k, {"pad": pad, "n": 0, "t": t})
        d["n"] += 1
        d["t"] = min(d["t"], t)
        r = region_of(f)
        if r and t > now and (r not in nxt or t < nxt[r][0]):
            nxt[r] = (t, f)
    places = ""
    for r, url in GUIDE.items():
        cnt = sum(1 for x in spots["places"] if x.get("region") == r)
        t = nxt.get(r)
        line = f"{cnt} place{'' if cnt == 1 else 's'} to watch from" + (f" · next: {e(name_of(t[1]))}, " + tmark_local(t[0], utc_text(t[0], "d"), "d") if t else " · no launch in the next 30 days")
        places += f'<li><a href="{url}"><b>{e(HUB_NAME[r])}</b><span>{line}</span></a></li>'
    plist = "".join(f'<li><a href="/pad/{e(k)}/"><b>{e(d["pad"]["n"])}</b><span>{e(where_of(d["pad"]))} · '
                    f'{d["n"]} launch{"es" if d["n"] > 1 else ""}</span></a></li>' for k, d in sorted(pads.items(), key=lambda x: x[1]["t"]))
    return ('<h2>Where to watch</h2><ul class="hub">' + places + "</ul>\n"
            + (f'<h2>Launch pads</h2><p>Every pad with a launch in the next 30 days, the soonest first: its launches and the places near it.</p><ul class="hub pads">{plist}</ul>\n' if plist else "")
            + '<h2>Saw a light in the sky?</h2><p><a href="/tonight/">What was that in the sky?</a> names the launch that most likely made it.</p>\n')


def where_of(pad):
    """where a pad is, without its own name again (the feed's full name starts with it)"""
    n, full = pad.get("n") or "", pad.get("full") or ""
    return full[len(n):].lstrip(", ") if n and full.startswith(n) and len(full) > len(n) else full


HUB_NAME = {"cape": "The Space Coast, Florida", "vandenberg": "Vandenberg, California", "starbase": "Starbase, Texas"}


def guide_page(feed, ctx, page, slug_of=None):
    spots, odds = ctx["gowatch"]
    f9 = odds["groups"].get("rocket:Falcon 9")
    sc = (f"Falcon 9, the rocket that flies most often, scrubbed on {f9['scrubbed']} of {f9['n']} flights from {checked(f9['from'])} to "
          f"{checked(f9['to'])}, by Launch Library's notes; after a scrub the next try came a median {f9['retry_h']} hours later.") if f9 else ""
    body = (
        '<p class="sub">Where to see a rocket launch in person, and how: the places, the pads and a guide to your first launch. Each fact is from an '
        f'official page or marked as from the news; all were checked {checked(spots["checked"])}.</p>\n'
        + (hub(feed, ctx, slug_of) if slug_of else "")
        + '<h2 id="first">Your first rocket launch</h2>'
        "<h3>1. Pick a launch you can reach</h3>"
        "<p>Launches from Florida, California and Texas are the ones most people can drive to. Open a launch's own page: it has the time in your "
        "zone, the places to watch from with their distances, and whether it is likely to go on time. Times move, so check again the day before and "
        "on the day; <a href=\"/#launches\">the radar</a> follows every change within 30 minutes and can remind you.</p>"
        f"<p>{e(sc)} Plan a spare day, and if you travel far, a few: the South Padre Island visitors bureau says delays are common and suggests 3 to 4 days for a Starship launch.</p>"
        "<h3>2. Choose where to watch</h3><ul class=\"guide\">"
        "<li><a href=\"/spacecoast/\">The Space Coast</a>: Kennedy's Visitor Complex sells viewing with its own distances to the pads; free parks in "
        "Titusville, Cocoa Beach and Port Canaveral; Playalinda Beach is the closest public beach to pads 39A and 39B and the most often closed.</li>"
        "<li><a href=\"/vandenberg/\">Vandenberg</a>: Lompoc's parks, with some roads closed to viewing; at twilight the plume can be seen across "
        "Southern California.</li>"
        "<li><a href=\"/starbase/\">Starbase</a>: South Padre Island; Boca Chica Beach and Highway 4 close for launches.</li></ul>"
        "<h3>3. Arrive early</h3><p>The Park Service tells visitors to Playalinda to come a few hours early, and closes its beach road 30 minutes "
        "before liftoff. Parks fill: Jetty Park's passes sold out for Artemis II, and more than 1,700 cars entered Isla Blanca Park on one 2023 "
        "launch day (news). Many parks close at dusk, so a night launch can fall outside their hours: read the park's own page.</p>"
        "<h3>4. What you will see and hear</h3><p>From most public places the pad itself is out of sight: you see the rocket as it clears the trees "
        "or the horizon. In daylight it is a bright point with a white trail; at night a flame that lights the clouds. Near twilight the rocket "
        "can climb into sunlight while you stand in the dark, and its exhaust glows like a jellyfish. The sound comes later: about a mile every 5 "
        "seconds (the National Weather Service's thunder rule), so from 10 miles about 50 seconds after liftoff. When a booster lands back on "
        "land you may hear one or more sonic booms a few minutes later; the provider's notice says who may hear them.</p>"
        "<h3>5. Bring</h3><p>From NASA's and the Park Service's own lists: sun protection or warm layers, insect repellent, water, snacks, a chair "
        "or blanket, binoculars or a camera, a flashlight for a night launch, a hat and a full tank of gas. Drones are banned at Port Canaveral on "
        "launch day.</p>"
        "<h3>6. If it scrubs</h3><p>A scrub can come at the last second, for weather or a technical reason. Stay until the provider says so, then "
        "check the launch page: the new time shows there within 30 minutes. Boaters and pilots: NASA lists (800) 470 7232 and Coast Guard Channel 16 "
        "for launch hazard areas.</p>"
        "<p class=\"muted\">Sources: NASA, the National Park Service, the Kennedy Space Center Visitor Complex, Port Canaveral, Explore Lompoc, "
        "Cameron County and the news reports named on each place; all in <a href=\"https://github.com/SergiusCommodus/astro-radar/blob/main/docs/GOWATCH_SOURCES.md\">"
        "the research notes</a>. Astro Radar is not affiliated with any of them.</p>")
    return page("guide", "Go watch", "How to see a rocket launch in person: the Space Coast, Vandenberg and Starbase, every launch pad, and a first launch guide: pick a launch, where to watch near the Cape, Vandenberg "
                "and Starbase, when to arrive, what you will see and hear, what to bring and what to do if it scrubs.", body, ctx, here="guide", script=True)


def region_page(r, feed, ctx, page):
    spots, odds = ctx["gowatch"]
    mi = ctx["mi"]
    ups = [f for f in feed.get("launches") or [] if isinstance(f, dict) and region_of(f) == r and _dt(f.get("utc"))]
    pad0 = next(((f["pad"]["lat"], f["pad"]["lon"], f["pad"].get("n")) for f in ups if isinstance((f.get("pad") or {}).get("lat"), (int, float))), None)
    if not pad0:
        pad0 = {"cape": (28.5620, -80.5772, "Space Launch Complex 40"), "vandenberg": (34.632, -120.611, "Space Launch Complex 4E"),
                "starbase": (25.9972, -97.156, "Orbital Launch Mount A")}[r]
    places = sorted(((km_between(pad0[0], pad0[1], p["lat"], p["lon"]), p) for p in spots["places"] if p["region"] == r), key=lambda x: x[0])
    rows = "".join(f'<li><a href="/launch/{e(f["id"])}/">{e(name_of(f))}</a> <span>{e(f.get("veh") or "")} · {e((f.get("pad") or {}).get("n") or "")}</span>'
                   f'{tmark_local(_dt(f["utc"]), utc_text(_dt(f["utc"]), "dt"), "dt")}</li>' for f in ups[:8])
    head = {"cape": ("Watch a launch from the Space Coast",
                     "<p>Cape Canaveral Space Force Station and Kennedy Space Center launch from the coast east of Titusville and north of Cocoa "
                     "Beach. The places below are listed by NASA, the National Park Service, the Kennedy Space Center Visitor Complex, Port "
                     "Canaveral and the cities, nearest the next launch's pad first. Many county and city parks close at dusk, so a night launch can "
                     "fall outside their hours, and Playalinda Beach, the closest public beach to pads 39A and 39B, closes in part for some launches.</p>"),
            "vandenberg": ("Watch a launch from Vandenberg",
                           "<p>Vandenberg Space Force Base launches over the Pacific from the coast west of Lompoc. Lompoc's tourism office lists the places "
                           "below, and lists these as <b>closed to public launch viewing</b>: the top of Harris Grade Road, Hawk's Nest (Vandenberg "
                           "Village), Marshallia Ranch Road and Highway 246. A 2024 news report says the base stopped closing Surf Beach and Ocean Beach "
                           "County Park for launches; Jalama Beach had been closed for launches 15 times by July 2023 (news). Near twilight the plume "
                           "can glow across Southern California: from Los Angeles look west or northwest.</p>"),
            "starbase": ("Watch a launch from Starbase",
                         "<p>SpaceX launches Starship from Starbase at Boca Chica, east of Brownsville. Cameron County closes Boca Chica Beach and "
                         "State Highway 4 by order for launches and tests, so they are not viewing places on launch day; text BEACH to 866 513 3475 "
                         "for the county's alerts, and check its page, which listed nothing after October 2025 when we looked. Most people watch from "
                         "South Padre Island, about 5 miles north across the water. The island's visitors bureau suggests planning 3 to 4 days, "
                         "since delays are common. SpaceX gives no spectator guidance beyond its own stream.</p>")}[r]
    body = (f'<p class="sub">Where to watch, how far each place is from {e(pad0[2])}, and what each place\'s own page says. Checked '
            f'{checked(spots["checked"])}.</p>' + head[1]
            + "<h2>Next launches from here</h2>" + (f'<ul class="fl">{rows}</ul>' if rows else "<p>None listed in the next 30 days right now.</p>")
            + "<h2>Where to watch</h2><ol class=\"spots\">" + "".join(spot_html(km, p, mi) for km, p in places) + "</ol>"
            + '<p><a href="/guide/#first">First launch guide</a> · <a href="/tonight/">What was that in the sky?</a></p>'
            + ('<figure class="qr"><img src="/ksc/qr.png" width="164" height="164" alt="QR code for astroradar.io/ksc, which opens this page">'
               '<figcaption>Point a phone camera here to open this page.</figcaption></figure>' if r == "cape" else "")
            + '<p class="muted">Places from OpenStreetMap (ODbL). Not affiliated with the Space Force, SpaceX, the counties or the cities named.</p>')
    return page({"cape": "spacecoast"}.get(r, r), head[0], f"Where to watch a rocket launch from {REGION[r]}: places, distances, parking, fees and closures, each with its source.",
                body, ctx, here=r, script=True)


def pad_pages(feed, ctx, page, slug_of):
    """one page per pad with launches in the feed: its launches with Event markup, the places near it, the odds of its rockets"""
    spots, odds = ctx["gowatch"]
    mi = ctx["mi"]
    by = {}
    for f in feed.get("launches") or []:
        pad = (f or {}).get("pad") or {}
        if pad.get("n") and _dt(f.get("utc")) and re.fullmatch(r"[A-Za-z0-9_-]{1,80}", str(f.get("id") or "")):
            by.setdefault(slug_of(pad), []).append(f)
    out = {}
    for slug, fs in by.items():
        pad = fs[0]["pad"]
        rows, evs, vehs = [], [], {}
        for f in fs[:12]:
            t = _dt(f["utc"])
            rows.append(f'<li><a href="/launch/{e(f["id"])}/">{e(name_of(f))}</a> <span>{e(f.get("veh") or "")}</span>{tmark_local(t, utc_text(t, "dt"), "dt")}</li>')
            vehs.setdefault(f.get("veh"), f)
            if t > ctx["now"]:
                evs.append({"@type": "Event", "name": __import__("launch_pages").page_title(f), "startDate": f["utc"],
                            "eventStatus": "https://schema.org/EventScheduled", "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
                            "location": {"@type": "Place", "name": pad.get("full") or pad["n"]}, "url": f"{SITE}launch/{f['id']}/"})
        ld = ""
        if evs:
            ld = ('<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "item": ev} for i, ev in enumerate(evs)]}, ensure_ascii=False).replace("</", "<\\/") + "</script>\n")
        ns = near(fs[0], spots, 5)
        od = "".join(f"<li>{x}</li>" for x in (" ".join(y for y in odds_line(odds_of(f, odds, ctx["providers"]), v) if y) for v, f in vehs.items()) if x)
        body = (f'<p class="sub">{e(pad.get("full") or pad["n"])}: its launches in the next 30 days, where to watch and how often its rockets '
                "go on time.</p><h2>Launches</h2>" + f'<ul class="fl">{"".join(rows)}</ul>'
                + (f'<p><a href="/calendar/pad/{e(slug)}.ics">Add this pad\'s launches to your calendar</a></p>')
                + (("<h2>Where to watch</h2><ol class=\"spots\">" + "".join(spot_html(km, p, mi) for km, p in ns) + "</ol>") if ns else "")
                + ("<h2>Will it go on time?</h2><ul class=\"guide\">" + od + "</ul><p class=\"muted\">From Launch Library's own update notes on "
                   "flown launches (scripts/scrub_stats.py); the notes can miss a scrub.</p>" if od else "")
                + '<p><a href="/guide/">First launch guide</a></p>')
        out[slug] = page("pad/" + slug, pad["n"], f"Rocket launches from {pad.get('full') or pad['n']}: the next launches, where to watch them and how "
                         "often they go on time.", body, ctx, here="pad", script=True, head=ld)
    return out


def tonight_page(feed, ctx, page):
    """What was that in the sky? the launch most likely behind a light seen tonight: one that flew in the last 12 hours or is in flight"""
    now = ctx["now"]
    cands = [f for f in (feed.get("launches") or []) + (feed.get("recent") or []) if isinstance(f, dict) and _dt(f.get("utc"))
             and timedelta(0) <= now - _dt(f["utc"]) <= timedelta(hours=12)]
    cands.sort(key=lambda f: _dt(f["utc"]), reverse=True)
    rest = [f for f in feed.get("launches") or [] if isinstance(f, dict) and _dt(f.get("utc")) and timedelta(0) < _dt(f["utc"]) - now <= timedelta(hours=18)]
    dirs = ctx["dirs"]
    if cands:
        f = cands[0]
        t = _dt(f["utc"])
        az = f.get("az")
        what = (ctx["sky_reach"](f, t, ctx["ranges"]) or [[]])[0]
        day = bool(what) and what[0].startswith("Liftoff is in daylight")
        lead = (f'<p class="big">{"The last launch was" if day else "Most likely"} <a href="/launch/{e(f["id"])}/">{e(name_of(f))}</a>, a {e(f.get("veh") or "")} from '
                f'{e((f.get("pad") or {}).get("full") or "")}, at {tmark_local(t, utc_text(t, "dt"), "dt")}.</p>'
                + ("<p>It flew in daylight at the pad, so a light you saw after dark was probably not this launch: a steady light moving across the "
                   'sky in a few minutes is often the International Space Station (<a href="/live/">where it is now</a>).</p>' if day else "")
                + "".join(f"<p>{e(s)}</p>" for s in what)
                + f'<p>To see whether it could be seen from your ZIP code, and where, <a href="/?launch={e(f["id"])}">open it on the radar</a>.</p>')
    else:
        lead = ("<p class=\"big\">No launch we track flew in the last 12 hours.</p><p>A steady, bright light moving across the sky in a few minutes "
                "is often the International Space Station: <a href=\"/live/\">see where it is now</a> and when it next passes over you. Planes blink; "
                "meteors last a second or two.</p>")
    soon = "".join(f'<li><a href="/launch/{e(x["id"])}/">{e(name_of(x))}</a> <span>{e(x.get("veh") or "")} · {e((x.get("pad") or {}).get("n") or "")}</span>'
                   f'{tmark_local(_dt(x["utc"]), utc_text(_dt(x["utc"]), "dt"), "dt")}</li>' for x in rest[:5])
    body = ('<p class="sub">Saw a strange light, a glowing jellyfish or a bright streak? Here is the rocket launch that most likely made it. '
            f'Updated with the launch feed every 30 minutes; this copy is from {ctx.get("generated_html") or e(ctx["generated"])}.</p>' + lead
            + (f"<h2>Coming up in the next 18 hours</h2><ul class=\"fl\">{soon}</ul>" if soon else "")
            + "<h2>What people report</h2><p>After launches people often describe a jellyfish, a comet, an orb or a meteor, and news sites ask "
            "\"what was that?\". Near sunrise or sunset the rocket's exhaust is lit by the sun while the sky below is dark, so it glows and spreads; "
            "in full dark you see a moving flame; in daylight a white trail.</p>"
            '<p><a href="/guide/">See one on purpose: the first launch guide</a></p>')
    return page("tonight", "What was that in the sky?", "The rocket launch that most likely made the light in the sky tonight: when, from where, "
                "which way it went and what people usually see.", body, ctx, here="tonight", script=True)


def write_all(dist, feed, ctx, page, slug_of):
    """the guides, the pad pages and What was that in the sky?; returns their URLs for the sitemap"""
    urls = []
    for slug, html_ in [("guide", guide_page(feed, ctx, page, slug_of)), ("spacecoast", region_page("cape", feed, ctx, page)), ("vandenberg", region_page("vandenberg", feed, ctx, page)),
                        ("starbase", region_page("starbase", feed, ctx, page)), ("tonight", tonight_page(feed, ctx, page))]:
        (dist / slug).mkdir(parents=True, exist_ok=True)
        (dist / slug / "index.html").write_text(html_, encoding="utf-8")
        urls.append(SITE + slug + "/")
    for slug, html_ in pad_pages(feed, ctx, page, slug_of).items():
        (dist / "pad" / slug).mkdir(parents=True, exist_ok=True)
        (dist / "pad" / slug / "index.html").write_text(html_, encoding="utf-8")
        urls.append(SITE + "pad/" + slug + "/")
    return urls
