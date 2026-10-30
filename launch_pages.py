"""A static page for every launch in the inlined feed (dist/launch/<id>/index.html), with the sitemap, robots.txt and the 404 page.

build.py calls build_pages() after it writes dist/index.html. Everything on a page comes from the feed and data/providers.json; the
visibility note is worked out from the pad, the launch time and the ranges in src/model.js (RANGE), and says it is an estimate. Each page
is small (under 20 KB): the shared files (launch.css, launch.js, mark.svg, the fonts and the share image) sit next to the main page.
"""
import html, json, math, re
from datetime import datetime, timedelta, timezone

SITE = "https://astroradar.io/"
ID_OK = re.compile(r"[A-Za-z0-9_-]{1,80}")
STATUS = {"go": "Go for launch", "tbd": "Time to be confirmed", "hold": "On hold", "flight": "Launched"}
RESULT = {"success": "Success", "partial": "Partial failure", "failure": "Failure"}
DIRS = ["north", "north northeast", "northeast", "east northeast", "east", "east southeast", "southeast", "south southeast",
        "south", "south southwest", "southwest", "west southwest", "west", "west northwest", "northwest", "north northwest"]
R_EARTH = 6371.0
D = math.pi / 180
e = lambda s: html.escape(str(s), quote=True)


# ---------------------------------------------------------------- the sun, ported from src/model.js (sunPos, elOf, shadowFromEl, dest)
def sun_el(lat, lon, when):
    n = when.timestamp() / 86400 + 2440587.5 - 2451545.0
    L = (280.46 + 0.9856474 * n) % 360
    g = ((357.528 + 0.9856003 * n) % 360) * D
    lam = (L + 1.915 * math.sin(g) + 0.02 * math.sin(2 * g)) * D
    eps = (23.439 - 0.0000004 * n) * D
    dec = math.asin(math.sin(eps) * math.sin(lam))
    ra = math.atan2(math.cos(eps) * math.sin(lam), math.cos(lam))
    gmst = (18.697374558 + 24.06570982441908 * n) % 24
    ha = (gmst * 15 + lon) * D - ra
    return math.asin(math.sin(lat * D) * math.sin(dec) + math.cos(lat * D) * math.cos(dec) * math.cos(ha)) / D


def shadow_km(s):
    return 0.0 if s >= 0 else R_EARTH * (1 / math.cos(-s * D) - 1)


def dest(lat, lon, brg, km):
    d = km / R_EARTH
    p1, l1, b = lat * D, lon * D, brg * D
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return p2 / D, ((l2 / D + 540) % 360) - 180


def ranges(model_js):
    """RANGE from src/model.js, so the page and the model never disagree."""
    m = re.search(r"var RANGE=\{([^}]*)\}", model_js)
    return {k: float(v) for k, v in re.findall(r"(\w+):([\d.]+)", m.group(1))} if m else {}


def mi(km):
    return f"{round(km * 0.621371 / 5) * 5:,.0f} mi ({round(km):,} km)"


def sky_note(f, when, rng):
    """Plain sentences about what the light allows for this launch, from the pad's sun at liftoff and the sun on the rocket a few minutes up.
    None when the feed lacks what it needs."""
    pad = f.get("pad") or {}
    lat, lon, az = pad.get("lat"), pad.get("lon"), f.get("az")
    if not all(isinstance(x, (int, float)) for x in (lat, lon)) or not rng:
        return None
    s0 = sun_el(lat, lon, when)
    out = []
    if s0 > 0:
        out.append(f"Liftoff is in daylight at the pad. In daylight a rocket shows only as a white exhaust trail, which people usually see from within about {mi(rng.get('day', 200))}.")
    else:
        rising = sun_el(lat, lon, when + timedelta(minutes=20)) > s0
        when_word = "before sunrise" if rising else "after sunset"
        lit = False
        if isinstance(az, (int, float)) and f.get("v") not in ("NS", "SUB"):
            # about four minutes up a typical orbital rocket is near 150 km high and 400 km downrange
            rl, ro = dest(lat, lon, az, 400)
            lit = 150 > shadow_km(sun_el(rl, ro, when + timedelta(minutes=4))) + 3
        if lit:
            out.append(f"Liftoff is {when_word} at the pad, and the rocket should climb high enough to reach sunlight while the ground below is dark. "
                       f"Sunlit exhaust can glow against the darker sky, the view people have reported from as far as about {mi(rng.get('lit', 950))}.")
        elif s0 > -6:
            out.append(f"Liftoff is in twilight at the pad ({when_word}). The sky is still bright, so the engine flame shows only to people fairly close, within about {mi(rng.get('glowTwilight', 150))}.")
        else:
            out.append(f"Liftoff is in the dark at the pad. You would see the engine flame, which fades quickly with distance: people usually see it from within about {mi(rng.get('nightFirst', 400))}.")
    if isinstance(az, (int, float)):
        out.append(f"It should head {DIRS[round(az / 22.5) % 16]} from the pad. We guess the heading from the target orbit, so the real path can differ.")
    return out


# ---------------------------------------------------------------- page parts
def when_lines(when, tzname, when_text):
    utc = when.strftime("%a, %b ") + str(when.day) + " · " + f"{when.hour % 12 or 12}:{when.minute:02d} {'AM' if when.hour < 12 else 'PM'} UTC"
    local = when_text(when, tzname) if tzname and tzname != "UTC" else None
    return utc, local


def page(f, when, kind, ctx):
    """One launch page. kind is 'up' (upcoming or in flight) or 'past' (flown in the last 7 days)."""
    pid = f["id"]
    url = f"{SITE}launch/{pid}/"
    prov = ctx["providers"].get(f.get("prov")) or {}
    pname = prov.get("n") or "Launch provider"
    title = f"{f['mis']} · {f['veh']}"
    pad = f.get("pad") or {}
    padfull = pad.get("full") or pad.get("n") or "Pad not announced yet"
    utc_txt, local_txt = when_lines(when, f.get("tz"), ctx["when_text"])
    iso = when.strftime("%Y-%m-%dT%H:%M:%SZ")
    if kind == "up":
        status = STATUS.get(f.get("st"), "Scheduled")
        desc = f"{f['veh']} launches {f['mis']} for {pname} from {padfull}, {utc_txt}. Status, the official webcast, and where to look from your ZIP code."
    else:
        status = RESULT.get(f.get("res"), "Flown")
        desc = f"{f['veh']} launched {f['mis']} for {pname} from {padfull}, {utc_txt}. Result: {status}. Replay and launch details."
    desc = desc.replace(" - ", " ")
    # watch links: the launch's own webcast, else the provider's live page (watch_opts in build.py, a port of watchOpts)
    acts = []
    opts = ctx["watch_opts"](f, ctx["providers"])
    if opts:
        a, b = opts
        label = "Watch the replay" if kind == "past" else ("Watch live" if ctx["is_live"](f, when, ctx["now"]) else "Watch page")
        acts.append(f'<a class="btn pri" href="{e(a["url"])}" target="_blank" rel="noopener">{label}<small>{e(a["src"])}</small></a>')
        if b:
            acts.append(f'<a class="btn" href="{e(b["url"])}" target="_blank" rel="noopener">{e(b.get("name", pname))} live page<small>{e(b["src"])}</small></a>')
    else:
        acts.append('<span class="none">No official stream announced yet.</span>')
    share = (f"{ctx['astro']}/app/share?launch={ctx['q'](pid)}&title={ctx['q'](title)}&utc={ctx['q'](iso)}&url={ctx['q'](SITE + '?launch=' + pid)}")
    acts.append(f'<a class="btn" href="{e(share)}" target="_blank" rel="noopener">Share to Astro</a>')
    if kind == "up":
        acts.append(f'<a class="btn" href="launch.ics" download="{e(pid)}.ics">Add to calendar</a>')
    facts = [("Liftoff", f'<time datetime="{iso}" data-local>{e(utc_txt)}</time>' + (f'<span>{e(local_txt)} at the pad</span>' if local_txt else "")),
             ("Status" if kind == "up" else "Result", e(status)),
             ("Vehicle", e(f["veh"])), ("Launch site", e(padfull))]
    if f.get("orbit"):
        facts.append(("Orbit", e(f["orbit"])))
    if prov.get("site"):
        facts.append(("Provider", f'<a href="{e(prov["site"])}" target="_blank" rel="noopener">{e(pname)}</a>'))
    elif pname:
        facts.append(("Provider", e(pname)))
    if safe(f.get("info")):
        facts.append(("Mission page", f'<a href="{e(f["info"])}" target="_blank" rel="noopener">Official mission page</a>'))
    sky = ""
    if kind == "up":
        note = sky_note(f, when, ctx["ranges"])
        if note:
            sky = ('<section class="sky"><h2>Can I see it?</h2>' + "".join(f"<p>{e(x)}</p>" for x in note) +
                   f'<p>Whether you can see it depends on where you are, the weather and the exact time. <a href="/?launch={e(pid)}#sky">Open it on Astro Radar with your ZIP code</a> for a modeled estimate of where to look, worked out for every second of the flight. It is an estimate, not a promise.</p></section>')
    ld = ""
    if kind == "up" and f.get("st") != "flight":
        ev = {"@context": "https://schema.org", "@type": "Event", "name": title, "description": desc, "startDate": iso, "url": url,
              "image": SITE + "og-image.jpg", "eventStatus": "https://schema.org/EventScheduled",
              "eventAttendanceMode": "https://schema.org/MixedEventAttendanceMode" if opts else "https://schema.org/OfflineEventAttendanceMode"}
        place = {"@type": "Place", "name": pad.get("n") or padfull, "address": padfull}
        if isinstance(pad.get("lat"), (int, float)) and isinstance(pad.get("lon"), (int, float)):
            place["geo"] = {"@type": "GeoCoordinates", "latitude": pad["lat"], "longitude": pad["lon"]}
        ev["location"] = [place] + ([{"@type": "VirtualLocation", "url": opts[0]["url"]}] if opts else [])
        org = {"@type": "Organization", "name": pname}
        if prov.get("site"):
            org["url"] = prov["site"]
        ev["organizer"] = org
        ld = '<script type="application/ld+json">' + json.dumps(ev, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>\n"
    meta = "".join(f'<meta {k}="{n}" content="{e(v)}">\n' for k, n, v in (
        ("name", "description", desc), ("property", "og:type", "website"), ("property", "og:site_name", "Astro Radar"),
        ("property", "og:url", url), ("property", "og:title", title + " · Astro Radar"), ("property", "og:description", desc),
        ("property", "og:image", SITE + "og-image.jpg"), ("property", "og:image:width", "1200"), ("property", "og:image:height", "630"),
        ("name", "twitter:card", "summary_large_image"), ("name", "twitter:title", title + " · Astro Radar"),
        ("name", "twitter:description", desc), ("name", "twitter:image", SITE + "og-image.jpg")))
    gen = ctx["generated"]
    return ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
            "<meta name=\"theme-color\" content=\"#04050C\">\n" + ctx["csp"] +
            f"<title>{e(title)} · Astro Radar</title>\n{meta}<link rel=\"canonical\" href=\"{url}\">\n"
            "<link rel=\"icon\" href=\"/favicon-32.png\" type=\"image/png\" sizes=\"32x32\">\n<link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\">\n"
            + ctx["manifest"] +
            "<link rel=\"preload\" as=\"font\" type=\"font/woff2\" href=\"/fonts/barlow-condensed-600.woff2\" crossorigin>\n"
            "<link rel=\"stylesheet\" href=\"/launch.css\">\n" + ld + "</head>\n<body>\n"
            "<header class=\"top\"><a class=\"brand\" href=\"/\"><img src=\"/mark.svg\" width=\"28\" height=\"28\" alt=\"\">Astro Radar</a>"
            "<a class=\"all\" href=\"/#launches\">All launches</a></header>\n<main>\n"
            f"<p class=\"kick\"><span class=\"dot {'up' if kind == 'up' else 'past'}\"></span>{e(status)} · {e(pname)}</p>\n"
            f"<h1>{e(f['mis'])}</h1>\n<p class=\"sub\">{e(f['veh'])} · {e(padfull)}</p>\n"
            "<dl class=\"facts\">" + "".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in facts) + "</dl>\n"
            "<div class=\"acts\">" + "".join(acts) + "</div>\n"
            f"<p class=\"radar\"><a href=\"/?launch={e(pid)}\">See it on the radar</a>: the countdown, the flight path and where to look from your ZIP code.</p>\n"
            + sky +
            f"<p class=\"upd\">From Launch Library 2, as of {e(gen)}. Times and status can change; <a href=\"/?launch={e(pid)}\">the radar</a> has the latest.</p>\n"
            "</main>\n<footer><p>Astro Radar is independent and is not affiliated with, endorsed by or sponsored by any launch provider or space agency shown here.</p>"
            "<p><a href=\"/\">Astro Radar</a> · Launch data from <a href=\"https://thespacedevs.com/llapi\" target=\"_blank\" rel=\"noopener\">Launch Library 2</a></p></footer>\n"
            "<script src=\"/launch.js\" defer></script>\n</body>\n</html>\n")


def safe(u):
    return isinstance(u, str) and re.fullmatch(r"https://[^\s\"'<>]+", u) is not None


CSS = """@font-face{font-family:'Barlow';font-weight:400;font-display:swap;src:url(/fonts/barlow-400.woff2) format('woff2')}
@font-face{font-family:'Barlow';font-weight:600;font-display:swap;src:url(/fonts/barlow-600.woff2) format('woff2')}
@font-face{font-family:'Barlow Condensed';font-weight:600;font-display:swap;src:url(/fonts/barlow-condensed-600.woff2) format('woff2')}
:root{--bg:#04050C;--fg:#EEF0FF;--fg-2:#A3ABD1;--fg-3:#8089B5;--line:rgba(185,168,255,.16);--accent:#B9A8FF;--violet:#7C5CFF;--go:#45E0A0}
*{box-sizing:border-box}
html{background:var(--bg);color:var(--fg);font:400 16px/1.55 Barlow,system-ui,sans-serif;-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;background:radial-gradient(1200px 600px at 70% -10%,rgba(124,92,255,.16),transparent 70%)}
a{color:var(--fg);text-decoration-color:var(--accent);text-underline-offset:3px}
a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.top,main,footer{max-width:880px;margin:0 auto;padding:0 20px}
.top{display:flex;align-items:center;justify-content:space-between;min-height:76px}
.brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:13px;letter-spacing:.28em;text-transform:uppercase;text-decoration:none}
.all{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--fg-2);text-decoration:none;padding:12px 0}
.all:hover{color:var(--fg)}
.kick{margin:28px 0 12px;font-size:12px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--fg-2);display:flex;align-items:center;gap:10px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--go)}.dot.past{background:var(--fg-3)}
h1{margin:0;font:600 clamp(44px,9vw,92px)/.95 'Barlow Condensed',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.01em;overflow-wrap:anywhere}
.sub{margin:14px 0 0;color:var(--fg-2);letter-spacing:.06em}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0;margin:34px 0 0;border-top:1px solid var(--line)}
.facts div{padding:16px 16px 16px 0;border-bottom:1px solid var(--line)}
dt{font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--fg-3)}
dd{margin:6px 0 0;font:600 20px/1.3 'Barlow Condensed',system-ui,sans-serif;letter-spacing:.02em}
dd span{display:block;font:400 14px/1.4 Barlow,system-ui,sans-serif;color:var(--fg-2);letter-spacing:0;margin-top:4px}
.acts{display:flex;flex-wrap:wrap;gap:12px;margin:30px 0 0}
.btn{display:inline-flex;flex-direction:column;justify-content:center;min-height:48px;padding:10px 20px;border:1px solid var(--line);font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;color:var(--fg)}
.btn small{font-size:11px;font-weight:400;letter-spacing:.04em;text-transform:none;color:var(--fg-2)}
.btn.pri{background:#5E48D8;border-color:#5E48D8}.btn.pri small{color:#E4DEFF}
.btn:hover{border-color:var(--accent)}
.none{color:var(--fg-2);padding:12px 0}
.radar{margin:28px 0 0;color:var(--fg-2)}
.sky{margin:40px 0 0;padding:24px 0 0;border-top:1px solid var(--line)}
.sky h2{margin:0 0 12px;font:600 26px/1.2 'Barlow Condensed',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em}
.sky p{margin:0 0 12px;color:var(--fg-2);max-width:68ch}
.upd{margin:28px 0 0;font-size:13px;color:var(--fg-3)}
footer{margin-top:56px;padding-bottom:40px;border-top:1px solid var(--line);font-size:13px;color:var(--fg-3)}
footer p{margin:16px 0 0}
@media (max-width:480px){.btn{flex:1 1 100%}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
"""

# the visitor's own time next to the UTC time (the page reads fine without it)
JS = """(function(){try{var t=document.querySelectorAll('time[data-local]');for(var i=0;i<t.length;i++){var d=new Date(t[i].getAttribute('datetime'));if(isNaN(d))continue;
var s=d.toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
var p=document.createElement('span');p.textContent=s+' your time';t[i].parentNode.insertBefore(p,t[i].nextSibling)}}catch(e){}})();
"""

NOT_FOUND = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found · Astro Radar</title>
<link rel="stylesheet" href="/launch.css">
<script src="/launch.js" defer></script>
</head>
<body>
<header class="top"><a class="brand" href="/"><img src="/mark.svg" width="28" height="28" alt="">Astro Radar</a></header>
<main>
<h1>Not here</h1>
<p class="sub" id="nf">That page is not on Astro Radar. A launch page is kept only while the launch is in the feed (the next 30 days and the last 7).</p>
<div class="acts"><a class="btn pri" id="nfGo" href="/">Go to Astro Radar</a></div>
</main>
</body>
</html>
"""
# A link to a launch page that is gone (the launch left the feed) still opens that launch on the radar if it is there.
JS += """(function(){var m=location.pathname.match(/^\\/launch\\/([A-Za-z0-9_-]{1,80})\\/?$/),g=document.getElementById('nfGo');if(!m||!g)return;
g.href='/?launch='+m[1];g.textContent='Find this launch on Astro Radar';location.replace(g.href)})();
"""


def build_pages(dist, feed, providers, now, helpers, model_js, mark_svg, extra_head=None):
    """Writes the launch pages and the shared files; returns (count, largest page in bytes)."""
    import shutil, urllib.parse
    extra_head = extra_head or {}
    ctx = dict(helpers, providers=providers, now=now, ranges=ranges(model_js), astro="https://astrosocial.io",
               q=lambda s: urllib.parse.quote(str(s), safe=""), csp=extra_head.get("csp", ""), manifest=extra_head.get("manifest", ""))
    gen = feed.get("generated") or ""
    try:
        g = datetime.fromisoformat(gen.replace("Z", "+00:00")).astimezone(timezone.utc)
        ctx["generated"] = g.strftime("%b ") + str(g.day) + f", {g.hour % 12 or 12}:{g.minute:02d} {'AM' if g.hour < 12 else 'PM'} UTC"
    except (ValueError, AttributeError):
        ctx["generated"] = "the last update"
    try:
        stamp = datetime.fromisoformat(gen.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        stamp = now
    events = []
    base = dist / "launch"
    if base.exists():
        shutil.rmtree(base)  # launches that left the feed lose their page (404.html sends those links to the radar)
    made, biggest, urls = [], 0, []
    for kind, items in (("up", feed.get("launches") or []), ("past", feed.get("recent") or [])):
        for f in items:
            try:
                if not (isinstance(f, dict) and ID_OK.fullmatch(str(f.get("id") or "")) and f.get("mis") and f.get("veh")):
                    continue
                when = datetime.fromisoformat(f["utc"].replace("Z", "+00:00"))
            except (KeyError, TypeError, ValueError, AttributeError):
                continue
            if f["id"] in made:
                continue
            out = page(f, when, kind, ctx)
            d = base / f["id"]
            d.mkdir(parents=True, exist_ok=True)
            (d / "index.html").write_text(out, encoding="utf-8")
            if kind == "up":
                opts = helpers["watch_opts"](f, providers)
                w = opts[0]["url"] if opts else ((providers.get(f.get("prov")) or {}).get("site") or SITE)
                ev = ics_event(f, when, w, stamp)
                (d / "launch.ics").write_bytes(ics_calendar([ev]).encode("utf-8"))
                if f.get("st") != "flight":
                    events.append(ev)
            biggest = max(biggest, len(out.encode("utf-8")))
            made.append(f["id"])
            urls.append(f"{SITE}launch/{f['id']}/")
    # the calendar subscription: every upcoming launch, two alerts each; a calendar app polls it (webcal://astroradar.io/launches.ics)
    (dist / "launches.ics").write_bytes(ics_calendar(events, "Astro Radar launches").encode("utf-8"))
    (dist / "launch.css").write_text(CSS, encoding="utf-8")
    (dist / "launch.js").write_text(JS, encoding="utf-8")
    (dist / "mark.svg").write_text(mark_svg, encoding="utf-8")
    (dist / "404.html").write_text(NOT_FOUND, encoding="utf-8")
    day = now.strftime("%Y-%m-%d")
    (dist / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                      + "".join(f"<url><loc>{u}</loc><lastmod>{day}</lastmod></url>\n" for u in [SITE] + urls) + "</urlset>\n", encoding="utf-8")
    (dist / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}sitemap.xml\n", encoding="utf-8")
    return made, biggest


# ---------------------------------------------------------------- calendar files (RFC 5545), the per launch file and the subscription feed
def ics_text(v):
    return str(v).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def ics_fold(line):
    """Lines longer than 75 octets continue on the next line after a space (RFC 5545 3.1), never splitting a UTF-8 character."""
    out, cur, n = [], "", 0
    for ch in line:
        b = len(ch.encode("utf-8"))
        if n + b > (75 if not out else 74):
            out.append(cur)
            cur, n = "", 0
        cur += ch
        n += b
    out.append(cur)
    return "\r\n ".join(out)


def ics_stamp(d):
    return d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def ics_event(f, when, watch_url, stamp):
    """One VEVENT in UTC (the Z suffix), so every calendar shows it in its own time zone. Two alerts: a day before and 30 minutes before."""
    pad = (f.get("pad") or {}).get("full") or "Pad not announced yet"
    page = f"{SITE}launch/{f['id']}/"
    note = ("Time to be confirmed. " if f.get("st") == "tbd" else "") + f"Watch: {watch_url}\nLaunch times often move. Check {page} before you head out."
    lines = ["BEGIN:VEVENT", f"UID:{ics_text(f['id'])}@astroradar.io", f"DTSTAMP:{ics_stamp(stamp)}", f"DTSTART:{ics_stamp(when)}",
             f"DTEND:{ics_stamp(when + timedelta(minutes=30))}", f"SUMMARY:{ics_text(f['veh'] + ' launch · ' + f['mis'])}",
             f"LOCATION:{ics_text(pad)}", f"DESCRIPTION:{ics_text(note)}", f"URL:{page}",
             "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", f"DESCRIPTION:{ics_text(f['veh'] + ' launch tomorrow')}", "END:VALARM",
             "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", f"DESCRIPTION:{ics_text(f['veh'] + ' launch in 30 minutes')}", "END:VALARM",
             "END:VEVENT"]
    return lines


def ics_calendar(events, name=None):
    head = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Astro Radar//Launches//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
    if name:
        head += [f"X-WR-CALNAME:{ics_text(name)}", "X-WR-CALDESC:Upcoming rocket launches from Astro Radar. Times often move; the feed updates every 30 minutes.",
                 "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
    return "\r\n".join(ics_fold(x) for x in head + [l for ev in events for l in ev] + ["END:VCALENDAR"]) + "\r\n"
