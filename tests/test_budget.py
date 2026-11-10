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
    "main page, gzipped": (130, 110, "the HTML with its inline style, scripts and data: everything before the first paint"),
    "inline CSS, gzipped": (28, 23, "the whole stylesheet is inline, so it delays the first paint"),
    "inline JavaScript, gzipped": (82, 69, "app.js and model.js, parsed on every visit; the phone's main thread pays for every byte"),
    "world.js, gzipped": (14, 10, "the live world, desktops only, after the page has painted"),
    "satellite.js, gzipped": (12, 10, "the ISS pass card, Nerd mode only"),
    "zips.json, gzipped": (280, 252, "the ZIP table, fetched after the page has loaded"),
    "fonts": (125, 108, "Barlow and Barlow Condensed, the four the first screen uses preloaded"),
    "provider logos": (80, 63, "every logo the rows and cards can show"),
    "desktop first textures (2k set)": (680, 584, "what the live world needs before it fades in"),
    # raised on November 9, 2026 to restore the planet's quality (1080 by 1350 and 1920 by 1080, two pass, rendered with 1.6 and 2.4 MB caps):
    # the 720 by 900 loop at 0.7 MB was visibly softer than the live site's planet; both load after the page has loaded, never with Save Data or 2G
    "phone hero loop (larger file)": (1790, 1557, "a phone's first visit downloads it after the page has loaded (the MP4, Safari's; Chrome's WebM is 1.28 MB)"),
    "wide hero loop (larger file)": (2640, 2294, "tablets and low power computers, after the page has loaded"),
    "hero loop posters": (360, 315, "shown at once, before the video: sharp WebP at quality 88, one of the two per visit"),
    # November 9, 2026: the footer's loop (977 KB at 1280, 448 KB at 720) is gone. Desktops draw the footer with the hero's own live world
    # (no download beyond the 8k detail tiles around it); phones and tablets get a still and its cloud layer. Measured as the WebP pair, the
    # fallback for browsers without AVIF and so the most a visitor can download (the AVIF pair is 118 KB on a phone, 159 KB wider)
    "footer still, phone (WebP pair)": (250, 216, "a phone's footer: ground and clouds, 1170 by 750, near the footer only"),
    "footer still, wide (WebP pair)": (365, 316, "tablets, low power computers and the photo fallback: 2560 by 768, near the footer only"),
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
            "world.js, gzipped": gz((DIST / "world.js").read_bytes()),
            "satellite.js, gzipped": gz((DIST / "vendor/satellite.min.js").read_bytes()) if (DIST / "vendor/satellite.min.js").exists() else 0,
            "zips.json, gzipped": gz((DIST / "zips.json").read_bytes()),
            "fonts": size("fonts/*.woff2"),
            "provider logos": size("providers/*.svg"),
            "desktop first textures (2k set)": size("world/*-2k.webp"),
            "phone hero loop (larger file)": biggest("loop/hero-phone.*[4m]"),
            "wide hero loop (larger file)": biggest("loop/hero-wide.*[4m]"),
            "hero loop posters": size("loop/hero-*.webp"),
            "footer still, phone (WebP pair)": size("loop/foot-*1170.webp"),
            "footer still, wide (WebP pair)": size("loop/foot-*2560.webp"),
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
