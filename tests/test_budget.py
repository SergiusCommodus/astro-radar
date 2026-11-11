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
    "inline JavaScript, gzipped": (4, 1, "only the head scripts and the poster's one line are left inline"),
    "world.js, gzipped": (14, 9, "the globe card's renderer, after the page has painted"),
    "satellite.js, gzipped": (12, 10, "the ISS pass card, Nerd mode only"),
    "zips.json, gzipped": (280, 252, "the ZIP table, fetched after the page has loaded"),
    "fonts": (125, 108, "Barlow and Barlow Condensed, the four the first screen uses preloaded"),
    "provider logos": (80, 63, "every logo the rows and cards can show"),
    "globe card textures (2k set)": (680, 584, "what the globe card needs before it fades in (every tier but low; desktops then take the 4k set)"),
    # November 10, 2026 (pull request 45): the hero's and the footer's planet are full resolution NASA photographs from the ISS
    # (assets/earth/, scripts/make_earth_stills.py), replacing the films of pull request 44 (0.5 to 3.9 MB of video a visit). A visitor
    # downloads one hero file and, near the footer, one footer file; the browser picks AVIF where it can, else WebP.
    "phone hero photo, AVIF": (106, 92, "the phone's largest paint, preloaded in the head: 1200 by 1200, AVIF 60, dithered so the rim does not band"),
    "wide hero photo, AVIF (larger)": (374, 325, "3840 by 1620, only for wide screens at 1.5 device pixels and up (srcset); 2560 wide is 172 KB"),
    "hero photos, WebP (larger)": (572, 497, "browsers without AVIF on a wide high density screen; the phone's WebP is 153 KB"),
    "footer photos (larger)": (393, 341, "near the footer only: the aurora, 2560 by 960 WebP (AVIF 198 KB; the phone's 40 and 81 KB)"),
    "launch area (largest)": (316, 274, "the globe card's view of one site from space, 1024 by 1024 at 250 m a pixel, one per launch on show, after the globe"),
    "launch areas (all)": (2915, 2534, "every site's area in the repository and on the site; a visitor downloads only the one for the launch on show"),
    "largest launch page": (20, 6, "the launch pages promise under 20 KB"),
    "largest share card": (100, 49, "a link preview image; crawlers are impatient"),
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
            "world.js, gzipped": gz((DIST / "world.js").read_bytes()),
            "satellite.js, gzipped": gz((DIST / "vendor/satellite.min.js").read_bytes()) if (DIST / "vendor/satellite.min.js").exists() else 0,
            "zips.json, gzipped": gz((DIST / "zips.json").read_bytes()),
            "fonts": size("fonts/*.woff2"),
            "provider logos": size("providers/*.svg"),
            "globe card textures (2k set)": size("world/*-2k.webp"),
            "phone hero photo, AVIF": size("earth/hero-phone.avif"),
            "wide hero photo, AVIF (larger)": biggest("earth/hero-wide*.avif"),
            "hero photos, WebP (larger)": biggest("earth/hero-*.webp"),
            "footer photos (larger)": biggest("earth/foot-*.*"),
            "launch area (largest)": biggest("earth/areas/*.webp"),
            "launch areas (all)": size("earth/areas/*.webp"),
            "largest launch page": biggest("launch/*/index.html"),
            "largest share card": biggest("launch/*/share.jpg"),
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
