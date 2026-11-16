"""Three quiet pages: About (/about/), Privacy (/privacy/) and Data sources (/data/), written by launch_pages.build_pages next to the launch
pages and sharing their stylesheet and policy (no inline script). Every sentence here says what the code does; check it against src/app.js
and build.py when either changes (who gets what: fetch calls in app.js; what is kept: the store calls, radar.* keys). No hyphens in copy."""
import html

SITE = "https://astroradar.io/"
ISSUES = "https://github.com/SergiusCommodus/astro-radar/issues"
REPO = "https://github.com/SergiusCommodus/astro-radar"


def _a(url, text):
    return f'<a href="{html.escape(url)}" target="_blank" rel="noopener">{html.escape(text)}</a>'


GO = ("cape", "spacecoast", "vandenberg", "starbase", "pad", "ksc")


def up_link(slug, here, ctx):
    """the section a page sits in, above its title (the guides and pads under Go watch, each provider under Providers)"""
    if here in GO:
        return ctx["crumb"]("/guide/", "Go watch")
    if slug.startswith("provider/"):
        return ctx["crumb"]("/provider/", "Providers")
    return ""


def page(slug, title, desc, body, ctx, script=False, here=None, head="", csp=None):
    e = html.escape
    url = SITE + slug + "/"
    meta = "".join(f'<meta {k}="{n}" content="{e(v)}">\n' for k, n, v in (
        ("name", "description", desc), ("property", "og:type", "website"), ("property", "og:site_name", "Astro Radar"), ("property", "og:url", url),
        ("property", "og:title", title + " · Astro Radar"), ("property", "og:description", desc), ("property", "og:image", SITE + "og-image.jpg"),
        ("property", "og:image:width", "1200"), ("property", "og:image:height", "630"), ("name", "twitter:card", "summary_large_image"),
        ("name", "twitter:title", title + " · Astro Radar"), ("name", "twitter:description", desc), ("name", "twitter:image", SITE + "og-image.jpg")))
    return ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
            "<meta name=\"theme-color\" content=\"#04050C\">\n" + (csp or ctx["csp"]) +
            f"<title>{e(title)} · Astro Radar</title>\n{meta}<link rel=\"canonical\" href=\"{url}\">\n"
            "<link rel=\"icon\" href=\"/favicon-32.png\" type=\"image/png\" sizes=\"32x32\">\n<link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\">\n"
            + ctx["manifest"] + "<link rel=\"stylesheet\" href=\"/launch.css\">\n" + ("<script src=\"/launch.js\" defer></script>\n" if script else "") + head
            + "</head>\n<body>\n" + ctx["top_nav"](here or slug) + "<main class=\"info\">\n" + up_link(slug, here, ctx)
            + f"<h1>{e(title)}</h1>\n" + (ctx["space_switch"](here) if here in ("live", "news") else "") + body + "\n</main>\n"
            + ctx["site_footer"](here or slug) + "</body>\n</html>\n")


def about(ctx, mi, rng):
    body = (
        "<p>Astro Radar lists every rocket launch in the next 30 days, from every provider, and works out whether you could see each one "
        "from your ZIP code, when, and where to look. It also links each launch's official webcast, and lets you set a reminder or add a "
        "launch to your calendar. " + ("Everything works without an account; signing in with your Astro account is optional "
        "(<a href=\"/privacy/#account\">what that keeps</a>).</p>\n" if ctx.get("auth") else "There are no accounts and nothing to sign up for.</p>\n") +
        "<p>Astro Radar is a product of " + _a("https://astrosocial.io", "Astro") + ", the group chat that actually makes plans (Astro is for "
        "people 18 and over). Share to Astro opens Astro with the launch you picked, to send to a chat or make a plan to watch it: "
        "<a href=\"/astro/\">how it works</a>.</p>\n"
        "<h2 id=\"view\">How the view is estimated</h2>\n"
        "<p>The rating is a modeled estimate, never a promise. For every second of the flight it works out where the rocket is, whether it is "
        "above your horizon, and how it is lit: by the sun, against a dark or a bright sky. How far away people see a launch depends on that "
        f"light: a white trail in daylight out to about {mi(rng.get('day', 200))}, the engine flame at night out to about "
        f"{mi(rng.get('nightFirst', 400))}, and a sunlit plume against a darker sky after sunset or before sunrise out to about "
        f"{mi(rng.get('lit', 950))}. Smaller rockets are fainter.</p>\n"
        "<p>Its limits: the flight's direction is often guessed from the orbit, the climb is a typical one for the rocket, not this flight's, "
        "and clouds count only where the National Weather Service has a forecast for your ZIP code (the page says when they are not counted). "
        "Trees, buildings and hills are not known to it. It leans cautious: a false Yes is worse than a false Maybe. The documented "
        "launches it is checked against are listed in " + _a(REPO + "/blob/main/docs/VISIBILITY.md", "VISIBILITY.md") + ".</p>\n"
        "<h2>Contact</h2>\n"
        "<p>Questions, corrections or a broken link: open an issue on " + _a(ISSUES, "GitHub") + ".</p>\n")
    return page("about", "About Astro Radar", "What Astro Radar is, how it estimates whether you can see a launch, and how to reach us.", body, ctx)


# The Privacy page's account section, only when sign in is on (auth.py). Each line is what src/account.js and src/signin.js do; tests/test_signin.py
# checks the keys and the one outside host against the code.
ACCOUNT = (
    "<h2 id=\"account\">If you sign in</h2>\n"
    "<p>Signing in is optional. It uses your Astro account, the same one as on astrosocial.io, through Astro's sign in service (run on "
    "Supabase). Astro is for people 18 and over.</p>\n"
    "<ul class=\"guide\">"
    "<li><b>What you type goes to Astro, not to Astro Radar.</b> With Continue with Astro, the email and password you enter are sent "
    "straight from your browser to Astro's sign in service. With Continue with Google, Google tells Astro's sign in service who you are; "
    "nobody sees your Google password but Google.</li>"
    "<li><b>What is kept in this browser:</b> your session, in local storage as radar.auth: a key that proves you signed in. Its short "
    "part lasts an hour and is renewed while a page is open; Astro's sign in service decides how long the session lasts in all. During a "
    "Google sign in, a one time check value kept beside radar.auth (removed when you come back) and the page to return to "
    "(radar.next, in session storage, gone when you close the tab).</li>"
    "<li><b>What Astro Radar reads from your account:</b> only your Astro name, your planet's look and color, and whether you have confirmed "
    "in Astro that you are 18 or older, to show your name and planet at the top of the page. Until that confirmation, nothing from your "
    "account is shown. Astro's database lets a signed in person read only their own profile.</li>"
    "<li><b>Your ZIP code, reminders and settings</b> stay in this browser whether you sign in or not, and are never sent to Astro. Your "
    "launches on the sign in page are the reminders kept in this browser.</li>"
    "<li><b>Sign out</b> ends this browser's session on Astro's sign in service and removes everything it kept here.</li></ul>\n"
    "<p>Your Astro account itself is covered by Astro's " + _a("https://astrosocial.io/privacy/", "privacy policy") + " and "
    + _a("https://astrosocial.io/terms/", "terms") + ".</p>\n")


def privacy(ctx):
    on = bool(ctx.get("auth"))
    body = (
        ("<p>Astro Radar has no cookies, no advertising and no analytics or tracking scripts, and everything on it works without an account. "
         "Signing in with your Astro account is optional: <a href=\"#account\">what it keeps and sends</a>. " if on else
         "<p>Astro Radar has no accounts, no sign in, no cookies, no advertising and no analytics or tracking scripts. ")
        + "The page's security policy lets it load scripts only from this site.</p>\n"
        "<h2>What stays in your browser</h2>\n"
        "<p>Only these, in your browser's local storage on this device: your home ZIP code and its place name, the reminders you set "
        "and whether Nerd mode is on. They are never sent to Astro Radar. To remove them, clear this site's data in your browser's settings. A copy "
        "of the site's files and the last launch list is also kept on your device so the page works offline.</p>\n"
        "<h2 id=\"log\">Your launches</h2>\n"
        "<p>If you press I saw it on a launch's page, the launch, the ZIP code or town you typed (never your position), what you saw and your "
        "note are kept in your browser's own database on this device (IndexedDB), with the date you last exported it "
        "(local storage). Nothing of it is sent anywhere: badges and the Year in Launches picture are made in your browser. Export saves it as a "
        "file you keep; Remove, or clearing this site's data, deletes it. On an iPhone, Safari may clear it after a week without a visit unless "
        "Astro Radar is on your Home Screen.</p>\n"
        "<h2>What leaves your browser</h2>\n"
        "<ul class=\"guide\">"
        "<li><b>Your ZIP code never does.</b> The page looks it up in a table of US ZIP codes it downloads from this site.</li>"
        "<li><b>The National Weather Service</b> (" + _a("https://www.weather.gov/", "weather.gov") + ") receives the latitude and longitude of "
        "your ZIP code's center, rounded to about a kilometer, to send back the forecast sky cover at launch time. The Look up card on a launch page does the same for the ZIP code you type "
        "or have saved.</li>"
        "<li><b>The launch list</b> comes from this site and, when the site uses one, from its own live feed server. Those requests carry "
        "nothing about you beyond what every web request carries.</li>"
        "<li><b>Live from space and Space news</b>: while one of those pages is open, your browser asks NASA EPIC (epic.gsfc.nasa.gov, for "
        "the newest picture of Earth), CelesTrak (celestrak.org, for the space station's orbit), NOAA's Space Weather Prediction "
        "Center (services.swpc.noaa.gov), NASA EONET (eonet.gsfc.nasa.gov) and the Spaceflight News API (api.spaceflightnewsapi.net) for "
        "their latest public data. Those requests carry nothing about you beyond what every web request carries. The ISS's next pass over "
        "your saved ZIP code is worked out in your browser; your ZIP code is not sent.</li>"
        "<li><b>Share to Astro</b> opens astrosocial.io with the launch you chose (its name, time and link), only when you press it.</li>"
        "<li><b>Watch</b> and other links open the provider's or streaming site, only when you press them.</li>"
        + ("<li><b>Astro's sign in service</b> (Supabase, the service Astro's accounts run on) hears from your browser only if you sign in, or "
           "once you are signed in: see below.</li>" if on else "") + "</ul>\n"
        "<p>The site is hosted on GitHub Pages, and the live feed, when used, on Cloudflare. Like any web host they receive the usual details "
        "of each request, such as your IP address and browser; Astro Radar adds no tracking to them.</p>\n"
        + (ACCOUNT if on else "")
        + "<p>Questions: open an issue on " + _a(ISSUES, "GitHub") + ".</p>\n")
    return page("privacy", "Privacy", "What Astro Radar keeps in your browser and what it sends, and to whom: no accounts, no tracking.", body, ctx)


def data_sources(ctx, feed=None):
    items = [
        ("Launch Library 2", "https://thespacedevs.com/llapi", "by The Space Devs: every launch, its time, status, pad, rocket, orbit, "
         "official webcast and mission description. The site is rebuilt from it every 30 minutes, and while the page is open in a visible tab it checks for a newer copy every minute."),
        ("National Weather Service", "https://www.weather.gov/", "the forecast sky cover at launch time for a US ZIP code, asked by your browser."),
        ("NASA", "https://science.nasa.gov/", "the photograph of Earth at night from the International Space Station on the link preview images (ISS030E055569, Johnson Space Center), "
         "the launch areas seen from space on the launch pages (GIBS: MODIS and VIIRS), Earth from a million miles (EPIC), the Earth events "
         "(EONET), the week's asteroids (JPL's close approach data), the picture of the day (APOD) and mission photos (NASA Image and Video "
         "Library), on Live from space and in Space today."),
        ("NOAA Space Weather Prediction Center", "https://www.swpc.noaa.gov/", "solar flares, the Kp index and NOAA's space weather scales, on "
         "Live from space and in Space today."),
        ("Spaceflight News API", "https://www.spaceflightnewsapi.net/", "by The Space Devs: the headlines on Space news. Only each "
         "headline, its publisher, its date and a first line are shown, with a link to the publisher."),
        ("CelesTrak", "https://celestrak.org/", "the International Space Station's orbital elements, for the ISS on Live from space and the ISS pass card in Nerd mode."),
        ("Wikimedia Commons", "https://commons.wikimedia.org/", "provider logos, public domain or CC0."),
        ("OpenStreetMap", "https://www.openstreetmap.org/copyright", "the locations of the Florida viewing places (© OpenStreetMap contributors, ODbL)."),
    ]
    body = ("<p>Astro Radar adds no launch facts of its own: everything it shows about a launch comes from these sources, and the view from your "
            "ZIP code is the site's own modeled estimate (see " + '<a href="/about/">About</a>' + ").</p>\n<ul class=\"guide\">"
            + "".join(f"<li><b>{_a(u, n)}</b>: {html.escape(d)}</li>" for n, u, d in items)
            + "<li><b>ZIP code locations</b>: a table of about 41,700 US ZIP codes with the latitude and longitude of each, kept with the site.</li>"
            + "<li><b>Fonts</b>: Barlow and Barlow Condensed (SIL Open Font License).</li></ul>\n"
            "<p>When a source is down the page says so, keeps the last good data and labels it; it never shows saved or sample data as live.</p>\n"
            "<p>Corrections: open an issue on " + _a(ISSUES, "GitHub") + ".</p>\n")
    import space_pages
    body = space_pages.numbers(feed, ctx.get("providers") or {}, ctx["now"]) + body
    return page("data", "Data sources", "Where Astro Radar's launch, weather, imagery and orbit data come from.", body, ctx)


ASTRO = "https://astrosocial.io"


def astro(ctx, feed):
    """The Astro page (/astro/): what Astro is in its own words (astrosocial.io and its store listing), what Share to Astro does there (astro-app's
    /app/share: sign in, then send to a chat or make it a plan), what Astro gets, and the next launches with a link each. Nothing about Astro
    that its own site does not say; no counts, no users, nothing that looks live. The list is written at build time from the feed."""
    from datetime import datetime
    e = html.escape
    now = ctx["now"]
    rows = []
    for f in (feed or {}).get("launches") or []:
        try:
            when = datetime.fromisoformat(str(f["utc"]).replace("Z", "+00:00"))
        except (KeyError, TypeError, ValueError):
            continue
        if not (f.get("id") and f.get("mis") and f.get("veh")) or f.get("st") == "flight" or when <= now:
            continue
        utc_txt, _ = ctx["when_lines"](when, f.get("tz"), ctx["when_text"])
        pad = (f.get("pad") or {}).get("n") or "Pad not announced yet"
        tbd = ", time to be confirmed" if f.get("st") == "tbd" else ""
        rows.append(f'<li><span class="t"><a href="/launch/{e(f["id"])}/">{e(ctx["short_name"](f.get("mis"), f.get("veh")))}</a>'
                    f'<span>{e(f["veh"])} · {e(pad)}{tbd}</span><span><time datetime="{when.strftime("%Y-%m-%dT%H:%M:%SZ")}" data-local>{e(utc_txt)}</time></span></span>'
                    f'<a class="btn" href="{e(ctx["astro_link"](f, when, ctx))}" target="_blank" rel="noopener" '
                    f'aria-label="Make {e(ctx["page_title"](f))} a plan on Astro (opens in a new tab)">Make it a plan</a></li>')
        if len(rows) == 8:
            break
    nxt = ("<ul class=\"ul\">" + "".join(rows) + "</ul>" if rows else
           "<p>The list fills in when the site has live launch data. Every launch on <a href=\"/#launches\">the radar</a> has Share to Astro.</p>")
    body = (
        "<p class=\"sub\">Astro Radar finds the launch. Astro is where you plan to watch it with your friends.</p>\n"
        "<div class=\"card\"><h2>What Astro is</h2>"
        f"<p>Astro is the group chat that actually makes plans: see who is free and turn it into a plan in one tap. It is private: "
        "your crew, in one star system, with no public feed. Plans have RSVPs, and friends without the app can RSVP from a link.</p>"
        "<p>No download needed: Astro works in the browser on any phone, and you can add it to your Home Screen. It is in private beta, "
        "and Astro Plus is free during the beta. Astro is for people 18 and older.</p>"
        f"<div class=\"acts\"><a class=\"btn pri\" href=\"{ASTRO}/\" target=\"_blank\" rel=\"noopener\">Get Astro<small>astrosocial.io</small></a>"
        f"<a class=\"btn\" href=\"{ASTRO}/install/\" target=\"_blank\" rel=\"noopener\">Add it to your Home Screen</a></div></div>\n"
        "<h2>How it works with Astro Radar</h2>\n<ol class=\"steps\">"
        "<li><b>01</b><span><strong>Pick a launch</strong>Press Share to Astro on the radar, a launch page or the list below. Astro opens in a new tab.</span></li>"
        "<li><b>02</b><span><strong>Sign in to Astro</strong>If you are not signed in, Astro asks you to, then brings you back to the same launch.</span></li>"
        "<li><b>03</b><span><strong>Send it to a chat</strong>Astro posts the launch's name, its time in your time zone and its Astro Radar link as a message.</span></li>"
        "<li><b>04</b><span><strong>Or make it a plan</strong>Astro opens a new plan called Watch and the launch's name, with the day and time filled in, for a group or a friend.</span></li>"
        "</ol>\n"
        "<p>A plan needs a launch time still to come. Launch times move: if a launch slips, the plan keeps the time it was made with, so check "
        "the launch on Astro Radar before you go and change the plan if it moved. <a href=\"/#launches\">The radar</a> has the latest time, the "
        "official webcast and whether you could see it from your ZIP code.</p>\n"
        "<h2>Next launches to watch together</h2>\n" + nxt + "\n"
        "<h2>What Astro gets from Astro Radar</h2>\n"
        "<p>Only what the link carries, and only when you press it: the launch's name, its time and its Astro Radar link. "
        + ("Signing in to Astro Radar is optional and uses your Astro account (see <a href=\"/privacy/#account\">Privacy</a>); "
           "Share to Astro sends Astro nothing else, and your ZIP code, reminders and settings stay in your browser. " if ctx.get("auth") else
           "Astro Radar has no accounts and sends Astro nothing else; your ZIP code, reminders and settings stay in your browser (see "
           "<a href=\"/privacy/\">Privacy</a>). ") +
        "What happens in Astro is covered by Astro's own " + _a(ASTRO + "/privacy/", "privacy policy") + " and " + _a(ASTRO + "/terms/", "terms") + ".</p>\n"
        "<p class=\"muted\">Astro Radar is a product of Astro. Questions about Astro: support@astrosocial.io. Questions about Astro Radar: "
        + _a(ISSUES, "GitHub issues") + ".</p>\n")
    return page("astro", "Watch launches with friends on Astro",
                "Send a rocket launch from Astro Radar to a group chat on Astro, or make it a plan to watch together. How it works and what Astro gets.",
                body, ctx, script=True)


def write_all(dist, ctx, mi, rng, feed=None):
    """Writes the four pages; returns their URLs for the sitemap."""
    out = []
    for slug, html_text in (("astro", astro(ctx, feed)), ("about", about(ctx, mi, rng)), ("privacy", privacy(ctx)), ("data", data_sources(ctx, feed))):
        (dist / slug).mkdir(exist_ok=True)
        (dist / slug / "index.html").write_text(html_text, encoding="utf-8")
        out.append(SITE + slug + "/")
    return out
