"""Discoverability and share cards: python3 -m unittest tests.test_seo   (after python3 build.py with dist/launches.json)
The main page and every launch page carry a title, a description, a canonical address, Open Graph and Twitter tags and structured data
that parses; each launch page's og:image exists (its own share card when the build could draw one: 1200 by 630, small); sitemap.xml lists
every launch page and robots.txt points at it; launch_pages.short_name agrees with ORB.shortName in src/model.js."""
import json
import pathlib
import re
import shutil
import subprocess
import sys
import unittest
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SITE = "https://astroradar.io/"
sys.path.insert(0, str(ROOT))
import launch_pages  # noqa: E402


class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta, self.links, self.ld, self.title, self._in, self._ld = {}, {}, [], "", None, False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            k = a.get("property") or a.get("name")
            if k:
                self.meta[k] = a.get("content")
        elif tag == "link" and a.get("rel"):
            self.links[a["rel"]] = a.get("href")
        elif tag == "title":
            self._in = "title"
        elif tag == "script" and a.get("type") == "application/ld+json":
            self._in = "ld"

    def handle_endtag(self, tag):
        self._in = None

    def handle_data(self, data):
        if self._in == "title":
            self.title += data
        elif self._in == "ld":
            self.ld.append(data)


def head_of(path):
    h = Head()
    h.feed(path.read_text(encoding="utf-8"))
    return h


@unittest.skipUnless((DIST / "launches.json").exists() and (DIST / "launch").exists(), "build with a feed first")
class Discoverability(unittest.TestCase):
    def check_cards(self, h, where):
        for k in ("description", "og:title", "og:description", "og:url", "og:image", "og:image:width", "og:image:height", "og:site_name",
                  "twitter:card", "twitter:title", "twitter:description", "twitter:image"):
            self.assertTrue(h.meta.get(k), f"{where}: no {k}")
        self.assertEqual(h.meta["twitter:card"], "summary_large_image", where)
        self.assertTrue(h.meta["og:image"].startswith(SITE), where)
        self.assertIn("Astro Radar", h.title, where)
        self.assertNotRegex(h.title, r"\s-\s", where)  # no hyphens in copy
        img = DIST / h.meta["og:image"][len(SITE):]
        self.assertTrue(img.exists(), f"{where}: {img} missing")
        return img

    def test_main_page(self):
        h = head_of(DIST / "index.html")
        self.check_cards(h, "index")
        self.assertEqual(h.links.get("canonical"), SITE)
        ld = json.loads(h.ld[0])
        self.assertEqual(ld["@type"], "ItemList")
        self.assertGreater(len(ld["itemListElement"]), 0)
        for it in ld["itemListElement"]:
            ev = it["item"]
            self.assertEqual(ev["@type"], "Event")
            self.assertRegex(ev["startDate"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
            page = DIST / ev["url"][len(SITE):] / "index.html"
            self.assertTrue(page.exists(), ev["url"])
            self.assertTrue((DIST / ev["image"][len(SITE):]).exists(), ev["image"])

    def test_every_launch_page(self):
        pages = sorted((DIST / "launch").glob("*/index.html"))
        self.assertGreater(len(pages), 0)
        has_pil = shutil.which("python") is not None
        try:
            import PIL  # noqa: F401
        except ImportError:
            has_pil = False
        for p in pages:
            lid = p.parent.name
            h = head_of(p)
            img = self.check_cards(h, lid)
            self.assertEqual(h.links.get("canonical"), f"{SITE}launch/{lid}/")
            self.assertEqual(h.meta["og:url"], f"{SITE}launch/{lid}/")
            self.assertTrue(h.meta.get("og:image:alt"), lid)
            for block in h.ld:
                ev = json.loads(block)
                self.assertEqual(ev["@type"], "Event")
                self.assertEqual(ev["image"], h.meta["og:image"])
            if has_pil:
                self.assertEqual(img.name, "share.jpg", lid)
                from PIL import Image
                with Image.open(img) as im:
                    self.assertEqual(im.size, (1200, 630), lid)
                self.assertLess(img.stat().st_size, 100 * 1024, lid)

    def test_sitemap_and_robots(self):
        sm = (DIST / "sitemap.xml").read_text(encoding="utf-8")
        for p in (DIST / "launch").glob("*/index.html"):
            self.assertIn(f"<loc>{SITE}launch/{p.parent.name}/</loc>", sm)
        self.assertIn(f"<loc>{SITE}</loc>", sm)
        self.assertIn(f"Sitemap: {SITE}sitemap.xml", (DIST / "robots.txt").read_text(encoding="utf-8"))


class ShortNameParity(unittest.TestCase):
    def test_python_and_page_agree(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("no node")
        names = []
        for L in json.loads((ROOT / "tests/launches.json").read_text(encoding="utf-8")).get("launches", []):
            names.append([L.get("mis") or "", L.get("veh") or ""])
        for f in ("tests/raw_ll2.json", "tests/raw_ll2_window.json"):
            for r in json.loads((ROOT / f).read_text(encoding="utf-8")).get("results", []):
                names.append([r.get("name") or "", ((r.get("rocket") or {}).get("configuration") or {}).get("name") or ""])
        names += [["Unknown Payload", "Long March 12"], ["Electron | A Very Long Mission Name That Keeps Going On", ""], ["Amazon Leo (LE-04)", "Ariane 64"]]
        js = "const O=require('./src/model.js');process.stdout.write(JSON.stringify(" + json.dumps(names) + ".map(n=>O.shortName(n[0],n[1]))))"
        out = json.loads(subprocess.run([node, "-e", js], cwd=ROOT, check=True, capture_output=True, text=True, encoding="utf-8").stdout)
        self.assertEqual(out, [launch_pages.short_name(n, v) for n, v in names])


if __name__ == "__main__":
    unittest.main()
