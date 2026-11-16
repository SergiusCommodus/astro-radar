"""Performance budget: python3 -m unittest tests.test_budget   (after python3 build.py; CI runs it with the mock feed)
Fails when what a visitor downloads grows past these limits. Each limit is today's size (November 9, 2026, mock feed) plus about 15
percent, so ordinary edits pass and a real jump (a new library, a second font family, a video, an image left uncompressed) fails
and has to be argued for: raise a limit only together with the reason, in this file. Text is measured gzipped (as GitHub Pages serves
it); images, video and fonts as they are."""
import gzip
import pathlib
import re
import unittest

DIST = pathlib.Path(__file__).resolve().parent.parent / "dist"
KB = 1024

# name: (limit in KB, today in KB, why this limit)
BUDGET = {
    "main page, gzipped": (52, 41, "the HTML with its inline style and data (the script is its own file now): everything before the first paint"),
    "inline CSS, gzipped": (28, 23, "the whole stylesheet is inline, so it delays the first paint"),
    # November 10, 2026: app.js and model.js left the HTML for one deferred file (app-<hash>.js), so the poster is not queued behind them
    "main page script, gzipped": (82, 71, "app.js and model.js, parsed on every visit; the phone's main thread pays for every byte"),
    "inline JavaScript, gzipped": (4, 1, "only the head scripts and the countdown's first digits are left inline"),
    "satellite.js, gzipped": (12, 10, "the ISS pass card, Nerd mode only"),
    "zips.json, gzipped": (280, 252, "the ZIP table, fetched after the page has loaded"),
    "fonts": (125, 108, "Barlow and Barlow Condensed, the four the first screen uses preloaded"),
    "provider logos": (80, 63, "every logo the rows and cards can show"),
    # November 15, 2026: one design, mission control (docs/LOOKUP.md): the hero has no photo, so a phone downloads nothing for a planet
    # (the NASA night photo was 125 KB on a phone; it stays in assets/earth/ only as the share cards' source and is not published).
    "launch area (largest)": (316, 274, "one site from space on its launch page, 1024 by 1024 at 250 m a pixel"),
    "launch areas (all)": (2915, 2534, "every site's area in the repository and on the site; a visitor downloads only the one for the launch on show"),
    "largest launch page": (20, 6, "the launch pages promise under 20 KB"),
    # November 11, 2026: Live from space and Space news (space_pages.py), real data with its source and time
    "live and news scripts, gzipped": (8, 6, "live.js (the ISS, a fresh copy of space weather and Earth events) and news.js (a fresh copy of the headlines)"),
    "model.js, gzipped": (11, 9, "the flight and visibility model, for the ISS pass on the Live page (the main page has its own copy in app-<hash>.js)"),
    "Live and News pages": (41, 35, "the two pages' HTML with their cards and headlines written in, so the first paint is real data; the Live "
                            "dashboard (November 2026) adds its dial, asteroid chart and event bars as inline SVG"),
    "logbook scripts, gzipped": (10, 9, "logcore.js and logbook.js: I saw it on a launch page and Your launches (badges, export, import, the year card)"),
    "Live world map": (25, 21, "the ISS card's world map: NASA Blue Marble, 960 by 360 WebP, darkened"),
    "EPIC picture": (80, 64, "Earth from a million miles on the Live page: 640 px, cropped to the disk"),
    "largest share card": (100, 49, "a link preview image; crawlers are impatient"),
    # November 15, 2026: sign in with an Astro account (auth.py), only when it is on. supabase.js 2.118.0 (MIT) is downloaded only on
    # /signin/ and once someone has signed in; a signed out visitor gets the 3 KB account.js and nothing else
    "account and sign in scripts, gzipped": (8, 6, "account.js on every page (signed out it only reads one local key) and signin.js on /signin/"),
    "supabase.js, gzipped": (64, 55, "Supabase's client (auth and the one profile read), never for a signed out visitor outside /signin/"),
}


def gz(b):
    return len(gzip.compress(b, 9))


def size(glob):
    return sum(p.stat().st_size for p in DIST.glob(glob))


def biggest(glob):
    return max((p.stat().st_size for p in DIST.glob(glob)), default=0)


@unittest.skipUnless((DIST / "index.html").exists(), "build first")
class Budget(unittest.TestCase):
    def measure(self):
        h = (DIST / "index.html").read_bytes()
        t = h.decode("utf-8")
        css = "".join(re.findall(r"<style[^>]*>(.*?)</style>", t, re.S)).encode()
        js = "".join(re.findall(r"<script>(.*?)</script>", t, re.S)).encode()
        m = {
            "main page, gzipped": gz(h),
            "inline CSS, gzipped": gz(css),
            "inline JavaScript, gzipped": gz(js),
            "main page script, gzipped": max((gz(p.read_bytes()) for p in DIST.glob("app-*.js")), default=0),
            "satellite.js, gzipped": gz((DIST / "vendor/satellite.min.js").read_bytes()) if (DIST / "vendor/satellite.min.js").exists() else 0,
            "zips.json, gzipped": gz((DIST / "zips.json").read_bytes()),
            "fonts": size("fonts/*.woff2"),
            "provider logos": size("providers/*.svg"),
            "launch area (largest)": biggest("earth/areas/*.webp"),
            "launch areas (all)": size("earth/areas/*.webp"),
            "largest launch page": biggest("launch/*/index.html"),
            "live and news scripts, gzipped": sum(gz((DIST / f).read_bytes()) for f in ("live.js", "news.js") if (DIST / f).exists()),
            "model.js, gzipped": gz((DIST / "model.js").read_bytes()) if (DIST / "model.js").exists() else 0,
            "Live and News pages": sum((DIST / p / "index.html").stat().st_size for p in ("live", "news") if (DIST / p / "index.html").exists()),
            "EPIC picture": size("nasa/epic-640.jpg"),
            "Live world map": size("live/world-960.webp"),
            "logbook scripts, gzipped": sum(gz((DIST / f).read_bytes()) for f in ("logcore.js", "logbook.js") if (DIST / f).exists()),
            "largest share card": biggest("launch/*/share.jpg"),
            "account and sign in scripts, gzipped": sum(gz((DIST / f).read_bytes()) for f in ("account.js", "signin.js") if (DIST / f).exists()),
            "supabase.js, gzipped": gz((DIST / "vendor/supabase.js").read_bytes()) if (DIST / "vendor/supabase.js").exists() else 0,
        }
        return m

    def test_within_budget(self):
        m = self.measure()
        over = []
        print("\n  budget                                   now      limit")
        for k, (limit, _, why) in BUDGET.items():
            now = m.get(k, 0) / KB
            print(f"  {k:<38} {now:7.0f} KB {limit:6d} KB")
            if now > limit:
                over.append(f"{k}: {now:.0f} KB over the {limit} KB budget ({why})")
        self.assertEqual(over, [], "\n".join(over))


if __name__ == "__main__":
    unittest.main()
