"""Performance budget: python3 -m unittest tests.test_budget   (after python3 build.py; CI runs it with the mock feed)
Fails when what a visitor downloads grows past these limits. Each limit is today's size (November 9, 2026, mock feed) plus about 15
percent, so ordinary edits pass and a real jump (a new library, a second font family, a bigger video, an image left uncompressed) fails
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
    # November 10, 2026: the rendered planet (the hero loops and the footer stills) gave way to NASA footage from the ISS (assets/earth/,
    # scripts/make_earth_clips.py). Each film is AV1 (hardware decoders: recent desktops, Android, iPhone 15 Pro and later) or H.264 (every
    # other iPhone and older Safari); the larger file, H.264, is measured, since it is the most a visitor can download. All load after the
    # page has loaded, never with reduced motion, Save Data or 2G (the poster stays). The AV1 files are 542 KB (phone) and 1,257 KB (wide).
    "phone hero film (larger file)": (1850, 1611, "a phone's first visit downloads it after the page has loaded: 1080 by 1080, 12 s, H.264 CRF 20"),
    "wide hero film (larger file)": (4490, 3902, "desktops and tablets without an AV1 decoder (Intel and M1 or M2 Macs in Safari): 2560 by 1080, H.264 CRF 20; AV1 elsewhere, 1.2 MB"),
    "hero film posters": (250, 216, "shown at once, before the video, for browsers without AVIF: WebP 86, one of the two per visit"),
    "hero film posters, AVIF": (155, 133, "the largest paint, preloaded in the head: AVIF 58 (41 KB phone, 92 KB wide), one of the two per visit"),
    "footer film (larger file)": (2710, 2350, "near the footer only: 2560 by 960 H.264 (the phone's is 751 KB; AV1 233 and 723 KB)"),
    "footer posters": (100, 87, "near the footer only, before its film: WebP, one of the two per visit"),
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
            "phone hero film (larger file)": biggest("earth/hero-phone*.mp4"),
            "wide hero film (larger file)": biggest("earth/hero-wide*.mp4"),
            "hero film posters": size("earth/hero-*.webp"),
            "hero film posters, AVIF": size("earth/hero-*.avif"),
            "footer film (larger file)": biggest("earth/foot-*.mp4"),
            "footer posters": size("earth/foot-*.webp"),
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
