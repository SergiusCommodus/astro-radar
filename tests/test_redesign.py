"""The redesign (docs/REDESIGN.md): python3 -m unittest tests.test_redesign   (after python3 build.py with a feed)
One planet (no WebGL world, no footer photo), one header and footer on every page, and the launch pages' flow: the launch area map,
the earlier and next launch links and the Copy link button."""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"


@unittest.skipUnless((DIST / "index.html").exists(), "build first")
class OnePlanet(unittest.TestCase):
    def test_no_second_planet(self):
        main = (DIST / "index.html").read_text(encoding="utf-8")
        for gone in ('id="lcard"', 'id="world"', 'id="footPlanet"', "world.js", 'id="featArt"', "earth/foot-"):
            self.assertNotIn(gone, main, gone)
        self.assertFalse((DIST / "world.js").exists() or (DIST / "world").exists(), "the WebGL world is still in dist/")
        self.assertFalse(list((ROOT / "assets/earth").glob("foot-*")), "a footer photo is still in assets/earth/")

    def test_one_design_no_hero_photo(self):
        """one design, mission control (docs/LOOKUP.md): no hero photo, no ?design switch, nothing of it published"""
        main = (DIST / "index.html").read_text(encoding="utf-8")
        for gone in ("hero-pst", "heroPst", "hero-film", "earth/hero-", "design=", "radar.design", "hero-old"):
            self.assertNotIn(gone, main, gone)
        self.assertIsNone(re.search(r"(?<![\w-])d-[ab](?![\w-])", main), "a design class is still in the page")  # not grid-area
        self.assertFalse(list((DIST / "earth").glob("hero-*")), "a hero photo is still published")
        self.assertFalse((DIST / "design.js").exists(), "design.js is still published")
        self.assertTrue((ROOT / "assets/earth/hero-wide-2560.webp").exists(), "the share cards' source photo is missing")
        for page in list((DIST / "launch").glob("*/index.html"))[:3]:
            t = page.read_text(encoding="utf-8")
            self.assertNotIn("design.js", t); self.assertIn('<body class="lpage">', t)


@unittest.skipUnless((DIST / "launch").exists() and any((DIST / "launch").iterdir()), "build with a feed first")
class Pages(unittest.TestCase):
    def pages(self):
        return sorted((DIST / "launch").glob("*/index.html"))

    def test_one_header_and_footer(self):
        others = self.pages() + [DIST / p / "index.html" for p in ("ksc", "about", "privacy", "data", "astro", "provider", "live", "news")]
        for p in others:
            if not p.exists():
                continue
            t = p.read_text(encoding="utf-8")
            nav = re.search(r'<nav class="tnav"[^>]*>(.*?)</nav>', t, re.S)
            self.assertTrue(nav, p)
            self.assertEqual(re.findall(r">([^<]+)</a>", nav.group(1)),
                             ["Launches", "Live", "News", "Watch", "Astro", "Watch", "Astro", "Your sky", "Providers", "Florida", "About", "Data sources"], p)
            foot = re.search(r'<nav class="fnav"[^>]*>(.*?)</nav>', t, re.S)
            self.assertTrue(foot, p)
            for k in ("Live", "News", "Providers", "Florida", "About", "Privacy", "Data sources"):
                self.assertIn(">" + k + "</a>", foot.group(1), p)

    def test_flow(self):
        pages = self.pages()
        maps = 0
        for p in pages:
            t = p.read_text(encoding="utf-8")
            self.assertIn('id="copyLink"', t, p)
            self.assertIn('<nav class="pn"', t, f"{p} ends with no other launch to go to")
            for href in re.findall(r'<nav class="pn"[^>]*>.*?</nav>', t, re.S)[0].split('href="')[1:]:
                target = DIST / href.split('"')[0].strip("/") / "index.html"
                self.assertTrue(target.exists(), f"{p}: the link to {href.split(chr(34))[0]} has no page")
            m = re.search(r'<figure class="amap">.*?<image href="/earth/areas/([a-z]+)\.webp".*?<circle cx="(\d+)" cy="(\d+)"', t, re.S)
            if m:
                maps += 1
                self.assertTrue((DIST / "earth/areas" / (m.group(1) + ".webp")).exists())
                self.assertTrue(0 <= int(m.group(2)) <= 1024 and 0 <= int(m.group(3)) <= 1024, "the pad is outside its area")
            self.assertNotIn("style=", t.split("<body")[1], f"{p}: inline style (the policy allows none)")
        self.assertGreater(maps, 0, "no launch page shows where it launches")


if __name__ == "__main__":
    unittest.main()
