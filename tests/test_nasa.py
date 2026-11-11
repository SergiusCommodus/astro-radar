"""Space today (scripts/fetch_nasa.py): python3 -m unittest tests.test_nasa
Runs the fetch on the saved responses in tests/nasa (no network), into a temporary folder, and checks what it writes: each source's
card data, the copyright rule for the picture of the day, the last good copy kept and marked stale when a source fails, and that the
key never reaches the output or the log."""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "fetch_nasa.py"
SAVED = ROOT / "tests" / "nasa"
SECRET = "SECRET_TEST_KEY_1234567890"


def run(out, from_dir, feed=None):
    env = dict(os.environ, NASA_OUT=str(out), NASA_API_KEY=SECRET)
    args = [sys.executable, str(SCRIPT), "--from-dir", str(from_dir), "--now", "2026-11-09T12:00:00Z"] + (["--feed", str(feed)] if feed else [])
    p = subprocess.run(args, env=env, capture_output=True, text=True, check=True)
    return p.stdout + p.stderr


class FetchNasa(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = pathlib.Path(self.tmp.name) / "nasa.json"

    def tearDown(self):
        self.tmp.cleanup()

    def test_every_source_from_the_saved_answers(self):
        log = run(self.out, SAVED)
        d = json.loads(self.out.read_text(encoding="utf-8"))
        self.assertEqual(d["epic"]["src"], "https://epic.gsfc.nasa.gov/")
        self.assertRegex(d["epic"]["utc"], r"^2026-11-0\dT\d\d:\d\d:\d\dZ$")
        # the Sun, from NOAA SWPC's real answers (November 11, 2026): flares of the 3 days before "now", the strongest M1.9; Kp at most
        # 5.3 in those days: a storm, aurora possible far north; NOAA's scales today
        self.assertIn("the strongest M1.9", d["sun"]["summary"])
        self.assertEqual(d["sun"]["flares"][0], "M1.9")
        self.assertEqual(d["sun"]["kp"], 5.3)
        self.assertIn("Kp 5.3", d["sun"]["aurora"])
        self.assertEqual(set(d["sun"]["scales"]), {"R", "S", "G"})
        self.assertEqual(d["sun"]["credit"], "NOAA Space Weather Prediction Center")
        # Earth events (EONET): newest first, real links, at most six
        ev = d["events"]
        self.assertTrue(0 < len(ev["list"]) <= 6)
        self.assertEqual([e["date"] for e in ev["list"]], sorted((e["date"] for e in ev["list"]), reverse=True))
        for e in ev["list"]:
            self.assertTrue(e["link"].startswith("https://") and e["title"] and e["cat"])
        self.assertEqual(sum(ev["cats"].values()), ev["count"])
        # a copyrighted picture of the day is never embedded: the card links out with its credit
        self.assertTrue(d["apod"]["copyright"])
        self.assertNotIn("img", d["apod"])
        self.assertEqual(d["apod"]["credit"], "A Photographer")
        self.assertEqual(d["apod"]["page"], "https://apod.nasa.gov/apod/ap261109.html")
        # the week's asteroids: JPL's real close approach answer (19 within 0.05 au, the closest 2026 VS8 at 0.00197 au), its size
        # estimated from H 29.9 for a bright to a dark surface
        self.assertEqual(d["neo"]["count"], 19)
        self.assertEqual(d["neo"]["closest"]["name"], "2026 VS8")
        self.assertEqual(d["neo"]["closest"]["km"], 294714)
        self.assertEqual(d["neo"]["closest"]["ld"], 0.8)
        self.assertEqual(d["neo"]["closest"]["m"], [3, 6])
        self.assertIn("5 of 5 sources fresh", log)

    def test_news_is_headlines_never_articles(self):
        run(self.out, SAVED)
        n = json.loads((self.out.parent / "news.json").read_text(encoding="utf-8"))
        self.assertEqual(n["credit"], "Spaceflight News API, The Space Devs")
        self.assertGreater(len(n["list"]), 20)
        self.assertEqual([a["date"] for a in n["list"]], sorted((a["date"] for a in n["list"]), reverse=True))
        for a in n["list"]:
            self.assertEqual(set(a) - {"ll", "ev"}, {"id", "title", "site", "url", "date", "snip", "g"})
            self.assertIn(a["g"], ("launches", "missions", "science"))
            self.assertTrue(a["url"].startswith("https://") and a["site"])
            self.assertLessEqual(len(a["snip"]), 151, "a snippet is one short line, never the article")
            self.assertNotRegex(a["snip"] + a["title"], "\u00e2\u20ac|\u00c3", "text left in the wrong encoding")
            self.assertNotIn("appeared first on", a["snip"])
        self.assertEqual({a["g"] for a in n["list"]}, {"launches", "missions", "science"})

    def test_demoji(self):
        sys.path.insert(0, str(SCRIPT.parent))
        import fetch_nasa
        self.assertEqual(fetch_nasa.demoji("NASA\u00e2\u20ac\u2122s rover"), "NASA\u2019s rover")
        self.assertEqual(fetch_nasa.demoji("And\u00f8ya"), "And\u00f8ya")

    def test_the_key_never_reaches_the_output_or_the_log(self):
        log = run(self.out, SAVED)
        self.assertNotIn(SECRET, self.out.read_text(encoding="utf-8"))
        self.assertNotIn(SECRET, log)
        sys.path.insert(0, str(SCRIPT.parent))
        os.environ["NASA_API_KEY"] = SECRET
        try:
            import importlib
            import fetch_nasa
            importlib.reload(fetch_nasa)
            self.assertNotIn(SECRET, fetch_nasa.clean(f"HTTP Error 500 for https://api.nasa.gov/x?api_key={SECRET}&a=1 ({SECRET})"))
        finally:
            del os.environ["NASA_API_KEY"]

    def test_a_failing_source_keeps_its_last_good_copy_marked_stale(self):
        run(self.out, SAVED)
        part = pathlib.Path(self.tmp.name) / "part"
        part.mkdir()
        for f in ("epic.json", "swpc_kp.json", "swpc_flares.json", "swpc_scales.json", "eonet.json", "apod.json"):  # no cad.json or news.json: they "fail"
            (part / f).write_text((SAVED / f).read_text(encoding="utf-8"), encoding="utf-8")
        log = run(self.out, part)
        d = json.loads(self.out.read_text(encoding="utf-8"))
        self.assertTrue(d["neo"].get("stale"))
        self.assertEqual(d["neo"]["count"], 19)
        self.assertFalse(d["epic"].get("stale"))
        self.assertIn("kept the last good copy", log)
        n = json.loads((self.out.parent / "news.json").read_text(encoding="utf-8"))
        self.assertTrue(n.get("stale"), "the news keeps its last good copy, marked stale")
        self.assertGreater(len(n["list"]), 20)

    def test_mission_photos_only_for_nasa_launches(self):
        feed = pathlib.Path(self.tmp.name) / "launches.json"
        feed.write_text(json.dumps({"launches": [{"id": "a1", "prov": "nasa", "mis": "Artemis II"}, {"id": "b2", "prov": "spacex", "mis": "Starlink"}]}), encoding="utf-8")
        run(self.out, SAVED, feed)
        m = json.loads(self.out.read_text(encoding="utf-8"))["missions"]
        self.assertEqual(list(m), ["a1"])
        self.assertTrue(m["a1"]["page"].startswith("https://images.nasa.gov/details/"))
        self.assertNotIn(" - ", m["a1"]["title"])
        self.assertNotRegex(m["a1"]["title"], r"(?i)poster|logo")


if __name__ == "__main__":
    unittest.main()
