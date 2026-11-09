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
        # the Sun: one M class flare, Kp 6: a storm, aurora possible far north
        self.assertIn("strongest M2.1", d["sun"]["summary"])
        self.assertEqual(d["sun"]["kp"], 6)
        self.assertIn("Kp 6", d["sun"]["aurora"])
        # a copyrighted picture of the day is never embedded: the card links out with its credit
        self.assertTrue(d["apod"]["copyright"])
        self.assertNotIn("img", d["apod"])
        self.assertEqual(d["apod"]["credit"], "A Photographer")
        self.assertEqual(d["apod"]["page"], "https://apod.nasa.gov/apod/ap261109.html")
        # the week's asteroids: the real NeoWs answer
        self.assertEqual(d["neo"]["count"], 38)
        self.assertGreater(d["neo"]["closest"]["km"], 0)
        self.assertNotIn("(", d["neo"]["closest"]["name"])
        self.assertIn("4 of 4 sources fresh", log)

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
        for f in ("epic.json", "flr.json", "gst.json", "apod.json"):  # no neo.json: NeoWs "fails"
            (part / f).write_text((SAVED / f).read_text(encoding="utf-8"), encoding="utf-8")
        log = run(self.out, part)
        d = json.loads(self.out.read_text(encoding="utf-8"))
        self.assertTrue(d["neo"].get("stale"))
        self.assertEqual(d["neo"]["count"], 38)
        self.assertFalse(d["epic"].get("stale"))
        self.assertIn("kept the last good copy", log)

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
