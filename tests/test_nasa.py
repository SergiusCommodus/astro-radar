"""Space today (scripts/fetch_nasa.py): python3 -m unittest tests.test_nasa
Runs the fetch on the saved responses in tests/nasa (no network), into a temporary folder, and checks what it writes: each source's
card data, the copyright rule for the picture of the day, the last good copy kept and marked stale when a source fails, that the
key never reaches the output or the log, the one line summary the deploy log ends on, its warnings in GitHub Actions, EPIC's images
made with Pillow, and the Pillow install from a wheel (the deploy's pillow==11.0.0 has none for the runner's Python 3.14, which hid
EPIC from 9 November 2026 behind the step's "|| true")."""
import json
import os
import pathlib
import subprocess
import sys
import re
import shutil
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "fetch_nasa.py"
SAVED = ROOT / "tests" / "nasa"
SECRET = "SECRET_TEST_KEY_1234567890"


SUMMARY = re.compile(r"^Space today: epic (ok \(picture \d{4}-\d\d-\d\d \d\d:\d\d UTC\)|failed \((kept \d{4}-\d\d-\d\d|nothing kept)\)), "
                     r"sun \w+.*; [0-5] of 5 NASA sources fresh; \d+ mission photos; Pillow \S+.*$")


def summary_of(log):
    """the summary line (run() returns stdout, where it is the last line, then stderr)"""
    lines = [l for l in log.splitlines() if l.startswith("Space today:")]
    assert len(lines) == 1, log
    return lines[0]


def run(out, from_dir, feed=None, gha=False):
    env = dict(os.environ, NASA_OUT=str(out), NASA_API_KEY=SECRET)
    env.pop("GITHUB_ACTIONS", None)  # (CI sets it; only the warning test wants it, and with saved answers nothing is ever installed)
    if gha:
        env["GITHUB_ACTIONS"] = "true"
    args = [sys.executable, str(SCRIPT), "--from-dir", str(from_dir), "--now", "2026-11-09T12:00:00Z"] + (["--feed", str(feed)] if feed else [])
    p = subprocess.run(args, env=env, capture_output=True, text=True, check=True)
    assert p.stdout.strip().splitlines()[-1].startswith("Space today:"), "the summary is the last line the step prints"
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
        last = summary_of(log)
        self.assertRegex(last, SUMMARY)
        self.assertIn("epic ok (picture 2026-11-06 18:22 UTC), sun ok, events ok, apod ok, neo ok, news ok; 5 of 5 NASA sources fresh", last)

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
        last = summary_of(log)
        self.assertRegex(last, SUMMARY)
        self.assertIn("neo failed (kept 2026-11-09)", last)
        self.assertIn("news failed (kept 2026-11-09)", last)
        self.assertIn("4 of 5 NASA sources fresh", last)
        self.assertNotIn("::warning", log, "warnings only in GitHub Actions")
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


class DeployLog(unittest.TestCase):
    """what the deploy sees: warnings for failed sources, EPIC's images, and Pillow installed from a wheel when it is missing"""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = pathlib.Path(self.tmp.name) / "out" / "nasa.json"

    def tearDown(self):
        self.tmp.cleanup()

    def test_failed_sources_are_warnings_in_github_actions(self):
        part = pathlib.Path(self.tmp.name) / "part"
        part.mkdir()
        shutil.copy(SAVED / "epic.json", part / "epic.json")
        log = run(self.out, part, gha=True)
        self.assertIn("::warning title=Space today::neo: failed (cad.json)", log)
        self.assertIn("::warning title=Space today::news: failed (news.json)", log)
        self.assertNotIn("::warning title=Space today::epic", log)
        last = summary_of(log)
        self.assertRegex(last, SUMMARY)
        self.assertIn("neo failed (nothing kept)", last)
        self.assertIn("1 of 5 NASA sources fresh", last)

    def test_epic_images_are_made(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow is not installed")
        part = pathlib.Path(self.tmp.name) / "saved"
        shutil.copytree(SAVED, part)
        Image.new("RGB", (120, 120), (20, 60, 140)).save(part / "epic_thumb.jpg")
        Image.new("RGB", (1024, 1024), (20, 60, 140)).save(part / "epic_big.jpg")
        run(self.out, part)
        d = json.loads(self.out.read_text(encoding="utf-8"))
        self.assertEqual(d["epic"]["img"], ["nasa/epic.jpg", 120, 120])
        self.assertEqual(d["epic"]["big"], ["nasa/epic-640.jpg", 640, 640], "the big picture is cropped to the disk, then 640 px")
        for f in ("epic.jpg", "epic-640.jpg"):
            with Image.open(self.out.parent / "nasa" / f) as im:
                self.assertEqual(im.format, "JPEG")

    def test_pillow_is_installed_from_a_wheel_only(self):
        sys.path.insert(0, str(ROOT / "scripts"))
        try:
            import fetch_nasa
        finally:
            sys.path.pop(0)
        # a version with wheels for Python 3.14: 11.0.0, the deploy's own pin, has none (pip then compiled it and failed)
        pin = tuple(int(x) for x in fetch_nasa.PILLOW.split("==")[1].split("."))
        self.assertGreaterEqual(pin, (11, 3, 0))
        done = mock.Mock(returncode=1, stdout="", stderr="ERROR: No matching distribution found for pillow==11.3.0")
        with mock.patch.dict(sys.modules, {"PIL": None}), mock.patch.object(fetch_nasa.subprocess, "run", return_value=done) as r:
            self.assertEqual(fetch_nasa.pillow(False), (None, "Pillow is not installed"))
            r.assert_not_called()
            ver, why = fetch_nasa.pillow(True)
            self.assertIsNone(ver)
            self.assertIn("pip install pillow==11.3.0 failed: ERROR: No matching distribution", why)
            cmd = r.call_args[0][0]
            self.assertEqual(cmd[:4], [sys.executable, "-m", "pip", "install"])
            self.assertIn("--only-binary=:all:", cmd)
            self.assertEqual(cmd[-1], fetch_nasa.PILLOW)


if __name__ == "__main__":
    unittest.main()
