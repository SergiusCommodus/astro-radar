"""Three quiet pages: About (/about/), Privacy (/privacy/) and Data sources (/data/), written by launch_pages.build_pages next to the launch
pages and sharing their stylesheet and policy (no inline script). Every sentence here says what the code does; check it against src/app.js
and build.py when either changes (who gets what: fetch calls in app.js; what is kept: the store calls, radar.* keys). No hyphens in copy."""
import html

SITE = "https://astroradar.io/"
ISSUES = "https://github.com/SergiusCommodus/astro-radar/issues"
REPO = "https://github.com/SergiusCommodus/astro-radar"


def _a(url, text):
    return f'<a href="{html.escape(url)}" target="_blank" rel="noopener">{html.escape(text)}</a>'


def page(slug, title, desc, body, ctx):
    e = html.escape
    url = SITE + slug + "/"
    meta = "".join(f'<meta {k}="{n}" content="{e(v)}">\n' for k, n, v in (
        ("name", "description", desc), ("property", "og:type", "website"), ("property", "og:site_name", "Astro Radar"), ("property", "og:url", url),
        ("property", "og:title", title + " · Astro Radar"), ("property", "og:description", desc), ("property", "og:image", SITE + "og-image.jpg"),
        ("property", "og:image:width", "1200"), ("property", "og:image:height", "630"), ("name", "twitter:card", "summary_large_image"),
        ("name", "twitter:title", title + " · Astro Radar"), ("name", "twitter:description", desc), ("name", "twitter:image", SITE + "og-image.jpg")))
    nav = " · ".join(f'<a href="/{s}/">{t}</a>' if s != slug else f"<span>{t}</span>" for s, t in (("about", "About"), ("privacy", "Privacy"), ("data", "Data sources")))
    return ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
            "<meta name=\"theme-color\" content=\"#04050C\">\n" + ctx["csp"] +
            f"<title>{e(title)} · Astro Radar</title>\n{meta}<link rel=\"canonical\" href=\"{url}\">\n"
            "<link rel=\"icon\" href=\"/favicon-32.png\" type=\"image/png\" sizes=\"32x32\">\n<link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\">\n"
            + ctx["manifest"] + "<link rel=\"stylesheet\" href=\"/launch.css\">\n</head>\n<body>\n"
            "<header class=\"top\"><a class=\"brand\" href=\"/\"><img src=\"/mark.svg\" width=\"28\" height=\"28\" alt=\"\">Astro Radar</a>"
            "<a class=\"all\" href=\"/#launches\">All launches</a></header>\n<main class=\"info\">\n"
            f"<h1>{e(title)}</h1>\n" + body + "\n</main>\n"
            f"<footer><p class=\"pages\">{nav}</p><p>Astro Radar is independent and is not affiliated with, endorsed by or sponsored by any launch provider "
            "or space agency shown on it. Logos and names are trademarks of their owners, shown only to identify the launch provider.</p>"
            "<p><a href=\"/\">Astro Radar</a> · Launch data from " + _a("https://thespacedevs.com/llapi", "Launch Library 2") + "</p></footer>\n</body>\n</html>\n")


def about(ctx, mi, rng):
    body = (
        "<p>Astro Radar lists every rocket launch in the next 30 days, from every provider, and works out whether you could see each one "
        "from your ZIP code, when, and where to look. It also links each launch's official webcast, and lets you set a reminder or add a "
        "launch to your calendar. There are no accounts and nothing to sign up for.</p>\n"
        "<p>Astro Radar is a product of " + _a("https://astrosocial.io", "Astro") + ", an app for watching launches with friends (Astro is for "
        "people 18 and over). Share to Astro opens Astro with the launch you picked.</p>\n"
        "<h2>How the view is estimated</h2>\n"
        "<p>The rating is a modeled estimate, never a promise. For every second of the flight it works out where the rocket is, whether it is "
        "above your horizon, and how it is lit: by the sun, against a dark or a bright sky. How far away people see a launch depends on that "
        f"light: a white trail in daylight out to about {mi(rng.get('day', 200))}, the engine flame at night out to about "
        f"{mi(rng.get('nightFirst', 400))}, and a sunlit plume against a darker sky after sunset or before sunrise out to about "
        f"{mi(rng.get('lit', 950))}. Smaller rockets are fainter.</p>\n"
        "<p>Its limits: the flight's direction is often guessed from the orbit, the climb is a typical one for the rocket, not this flight's, "
        "and clouds count only where the National Weather Service has a forecast for your ZIP code (the page says when they are not counted). "
        "Trees, buildings and hills are not known to it. It leans cautious: a false Excellent view is worse than a false Low view. The documented "
        "launches it is checked against are listed in " + _a(REPO + "/blob/main/docs/VISIBILITY.md", "VISIBILITY.md") + ".</p>\n"
        "<h2>Contact</h2>\n"
        "<p>Questions, corrections or a broken link: open an issue on " + _a(ISSUES, "GitHub") + ".</p>\n")
    return page("about", "About Astro Radar", "What Astro Radar is, how it estimates whether you can see a launch, and how to reach us.", body, ctx)


def privacy(ctx):
    body = (
        "<p>Astro Radar has no accounts, no sign in, no cookies, no advertising and no analytics or tracking scripts. The page's security policy "
        "lets it load scripts only from this site.</p>\n"
        "<h2>What stays in your browser</h2>\n"
        "<p>Only these, in your browser's local storage on this device: your home ZIP code and its place name, the reminders you set, and "
        "whether Nerd mode is on. They are never sent to Astro Radar. To remove them, clear this site's data in your browser's settings. A copy "
        "of the site's files and the last launch list is also kept on your device so the page works offline.</p>\n"
        "<h2>What leaves your browser</h2>\n"
        "<ul class=\"guide\">"
        "<li><b>Your ZIP code never does.</b> The page looks it up in a table of US ZIP codes it downloads from this site.</li>"
        "<li><b>The National Weather Service</b> (" + _a("https://www.weather.gov/", "weather.gov") + ") receives the latitude and longitude of "
        "your ZIP code's center, rounded to about a kilometer, to send back the forecast sky cover at launch time.</li>"
        "<li><b>The launch list</b> comes from this site and, when the site uses one, from its own live feed server. Those requests carry "
        "nothing about you beyond what every web request carries.</li>"
        "<li><b>Share to Astro</b> opens astrosocial.io with the launch you chose (its name, time and link), only when you press it.</li>"
        "<li><b>Watch</b> and other links open the provider's or streaming site, only when you press them.</li></ul>\n"
        "<p>The site is hosted on GitHub Pages, and the live feed, when used, on Cloudflare. Like any web host they receive the usual details "
        "of each request, such as your IP address and browser; Astro Radar adds no tracking to them.</p>\n"
        "<p>Questions: open an issue on " + _a(ISSUES, "GitHub") + ".</p>\n")
    return page("privacy", "Privacy", "What Astro Radar keeps in your browser and what it sends, and to whom: no accounts, no tracking.", body, ctx)


def data_sources(ctx):
    items = [
        ("Launch Library 2", "https://thespacedevs.com/llapi", "by The Space Devs: every launch, its time, status, pad, rocket, orbit, "
         "official webcast and mission description. The site is rebuilt from it every 30 minutes, and while the page is open in a visible tab it checks for a newer copy every minute."),
        ("National Weather Service", "https://www.weather.gov/", "the forecast sky cover at launch time for a US ZIP code, asked by your browser."),
        ("NASA", "https://science.nasa.gov/", "the Earth imagery behind the planet (Blue Marble, Black Marble and GIBS, with GEBCO relief), and "
         "the Space today cards: Earth today (EPIC), the Sun (DONKI), the picture of the day (APOD), the week's asteroids (NeoWs) and mission "
         "photos (NASA Image and Video Library)."),
        ("CelesTrak", "https://celestrak.org/", "the International Space Station's orbital elements for the ISS pass card in Nerd mode."),
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
    return page("data", "Data sources", "Where Astro Radar's launch, weather, imagery and orbit data come from.", body, ctx)


def write_all(dist, ctx, mi, rng):
    """Writes the three pages; returns their URLs for the sitemap."""
    out = []
    for slug, html_text in (("about", about(ctx, mi, rng)), ("privacy", privacy(ctx)), ("data", data_sources(ctx))):
        (dist / slug).mkdir(exist_ok=True)
        (dist / slug / "index.html").write_text(html_text, encoding="utf-8")
        out.append(SITE + slug + "/")
    return out
