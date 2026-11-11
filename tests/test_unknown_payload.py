"""A payload the feed does not name (Unknown Payload, Unknown, TBD, Undisclosed, Classified, empty): the headline is the rocket and the
word Launch (Long March 2D Launch) with Payload not disclosed under it, everywhere a launch is named. Run after a build with a feed:
python3 -m unittest tests.test_unknown_payload

The Python rule (launch_pages.undisclosed, title_of, full_name) must agree with the page's (ORB.undisclosed, title, fullName in
src/model.js), and nothing the site writes (pages, titles, metadata, structured data, calendar files, share links, the sitemap) may say
Unknown Payload; only the inlined feed data, which is never shown, keeps the feed's own words."""
import json
import pathlib
import re
import shutil
import subprocess
import sys
import unittest
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
sys.path.insert(0, str(ROOT))
import launch_pages  # noqa: E402

MISSING = ["Unknown Payload", "Unknown", "unknown payload", "Unknown Payloads", "TBD", "TBD?", "TBA", "TBC", "N/A", "None",
           "Undisclosed", "Undisclosed Payload", "Classified", "Classified Payload", "", "  ", None, "Long March 2D | Unknown Payload"]
REAL = ["Starlink Group 12-7", "SatNet LEO Group TBD?", "Test Payload", "NROL-118", "SILENTBARKER 2/NROL-118", "Unknown Pleasures",
        "Yaogan 51-07 to 09", "Tianzhou 10", "4 satellites", "Demo Flight", "TBD Mission Alpha"]


def visible(text):
    """the file without its inlined JSON data blocks (the feed, the ZIP table), which the page reads but never shows as they are"""
    return re.sub(r'<script type="application/json"[^>]*>.*?</script>', "", text, flags=re.S)


class Rule(unittest.TestCase):
    def test_missing(self):
        for n in MISSING:
            self.assertTrue(launch_pages.undisclosed(n), n)
            self.assertEqual(launch_pages.title_of(n, "Long March 2D"), "Long March 2D Launch", n)
            self.assertEqual(launch_pages.full_name(n, "Long March 2D"), "Long March 2D Launch", n)
            self.assertEqual(launch_pages.short_name(n, "Long March 2D"), "Long March 2D Launch", n)
            self.assertEqual(launch_pages.page_title({"mis": n, "veh": "Long March 2D"}), "Long March 2D Launch", n)
        self.assertEqual(launch_pages.title_of("Unknown Payload", "Falcon 9 Block 5"), "Falcon 9 Launch")

    def test_real_names_unchanged(self):
        for n in REAL:
            self.assertFalse(launch_pages.undisclosed(n), n)
            self.assertEqual(launch_pages.title_of(n, "Falcon 9"), n)
            self.assertEqual(launch_pages.full_name(n, "Falcon 9"), "Falcon 9 " + n)
            self.assertEqual(launch_pages.page_title({"mis": n, "veh": "Falcon 9"}), n + " · Falcon 9")

    def test_python_and_page_agree(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("no node")
        names = [[n, v] for n in MISSING + REAL for v in ("Long March 2D", "Falcon 9 Block 5", "")]
        js = ("const O=require('./src/model.js');process.stdout.write(JSON.stringify(" + json.dumps(names) +
              ".map(n=>[O.undisclosed(n[0]),O.title(n[0],n[1]),O.fullName(n[0],n[1]),O.shortName(n[0],n[1])])))")
        out = json.loads(subprocess.run([node, "-e", js], cwd=ROOT, check=True, capture_output=True, text=True, encoding="utf-8").stdout)
        self.assertEqual(out, [[launch_pages.undisclosed(n), launch_pages.title_of(n, v), launch_pages.full_name(n, v),
                                launch_pages.short_name(n, v)] for n, v in names])


class Built(unittest.TestCase):
    """the build, when its feed has a launch with a payload not disclosed (the mock feed's Long March 2D from Jiuquan has one)"""

    @classmethod
    def setUpClass(cls):
        feed = DIST / "launches.json"
        if not feed.exists():
            raise unittest.SkipTest("no dist/launches.json: build with a feed first")
        data = json.loads(feed.read_text(encoding="utf-8"))
        cls.all = (data.get("launches") or []) + (data.get("recent") or [])
        cls.hidden = [f for f in cls.all if launch_pages.undisclosed(f.get("mis")) and (DIST / "launch" / str(f.get("id"))).is_dir()]
        cls.named = [f for f in cls.all if not launch_pages.undisclosed(f.get("mis")) and (DIST / "launch" / str(f.get("id"))).is_dir()]

    def test_nothing_says_unknown_payload(self):
        for p in DIST.rglob("*"):
            if p.suffix in (".html", ".ics", ".xml", ".txt", ".webmanifest"):
                self.assertNotRegex(visible(p.read_text(encoding="utf-8")), re.compile("unknown payload", re.I), str(p))

    def test_launch_page_names_the_rocket(self):
        if not self.hidden:
            self.skipTest("the feed has no launch with a payload not disclosed")
        for f in self.hidden:
            head = launch_pages.title_of(f.get("mis"), f.get("veh"))
            d = DIST / "launch" / f["id"]
            html = (d / "index.html").read_text(encoding="utf-8")
            self.assertIn(f"<title>{launch_pages.e(head)} · Astro Radar</title>", html)
            self.assertIn(f"<h1>{launch_pages.e(head)}</h1>", html)
            self.assertIn('<p class="full nd">Payload not disclosed</p>', html)
            self.assertIn("an undisclosed payload", html)
            self.assertIn("title=" + urllib.parse.quote(head), html)  # Share to Astro: the same text, the link format unchanged
            self.assertNotIn(f"{f['veh']} {head}", html)  # the rocket never twice in one line
            for ld in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
                self.assertEqual(json.loads(ld)["name"], head)
            self.assertIn(f"SUMMARY:{head}\r\n", (d / "launch.ics").read_bytes().decode("utf-8"))

    def test_real_names_unchanged(self):
        for f in self.named[:12]:
            html = (DIST / "launch" / f["id"] / "index.html").read_text(encoding="utf-8")
            self.assertIn(f"<title>{launch_pages.e(f['mis'] + ' · ' + f['veh'])} · Astro Radar</title>", html)
            self.assertNotIn("Payload not disclosed", html)


if __name__ == "__main__":
    unittest.main()
