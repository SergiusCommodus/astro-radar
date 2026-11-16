"""Launch page parts added by Look Up (docs/LOOKUP.md): the trust strip's time confidence, the change log's words, the sonic boom note,
launch day mode with the provider's timeline, and the Event markup after a slip. Pure functions of launch_pages, on made up launches."""
import json
import pathlib
import re
import sys
import unittest
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import launch_pages as lp  # noqa: E402

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)


def wt(d, tz="UTC"):
    return d.strftime("%a, %b ") + str(d.day) + f" · {d.hour % 12 or 12}:{d.minute:02d} {'AM' if d.hour < 12 else 'PM'} UTC"


CTX = {"when_text": wt, "now": NOW, "generated": "Nov 13, 12:00 PM UTC", "gen_iso": "2026-11-13T12:00:00Z"}


def launch(**k):
    f = {"id": "abc", "mis": "Test Flight", "veh": "Falcon 9", "st": "go", "utc": "2026-11-13T22:00:00Z", "np": "MIN",
         "pad": {"n": "Space Launch Complex 40", "full": "Space Launch Complex 40, Cape Canaveral, FL, USA", "lat": 28.56, "lon": -80.58, "st": "FL"}}
    f.update(k)
    return f


class Trust(unittest.TestCase):
    def test_confidence_words(self):
        self.assertEqual(lp.confidence(launch())[0], "Confirmed")
        self.assertEqual(lp.confidence(launch(st="tbd"))[0], "Not yet confirmed")
        self.assertEqual(lp.confidence(launch(np="HR"))[0], "Estimated")
        self.assertEqual(lp.confidence(launch(np="M"))[1], "Time known only to the month")
        self.assertEqual(lp.confidence(launch(np=None))[0], "Not given")

    def test_strip(self):
        h = lp.trust_strip(launch(ws="2026-11-13T22:00:00Z", we="2026-11-13T23:30:00Z"), "up", CTX, [])
        self.assertIn("Launch Library 2", h)
        self.assertIn("Nov 13, 12:00 PM UTC", h)
        self.assertIn("Window 10:00 PM UTC to 11:30 PM UTC (1 h 30 min)", h)
        self.assertIn("None seen", h)
        self.assertIn("2 seen", lp.trust_strip(launch(), "up", CTX, [{}, {}]))
        self.assertNotIn("Changes", lp.trust_strip(launch(), "up", CTX, None))  # no change log in this build: not claimed

    def test_no_window_when_instant(self):
        self.assertEqual(lp.window_text(launch(ws="2026-11-13T22:00:00Z", we="2026-11-13T22:00:00Z"), wt), "")


class ChangeLog(unittest.TestCase):
    def test_words(self):
        slip = {"k": "slip", "at": "2026-11-12T10:00:00Z", "from": "2026-11-13T20:00:00Z", "to": "2026-11-13T22:15:00Z"}
        self.assertEqual(lp.change_line(slip, wt), "Moved later by 2 h 15 min: now Fri, Nov 13 · 10:15 PM UTC, was Fri, Nov 13 · 8:00 PM UTC")
        self.assertTrue(lp.change_line(dict(slip, k="scrub"), wt).startswith("Scrubbed, moved 2 h 15 min later: now"))
        self.assertTrue(lp.change_line(dict(slip, **{"from": "2026-11-14T00:00:00Z"}), wt).startswith("Moved earlier by 1 h 45 min"))
        self.assertEqual(lp.change_line({"k": "status", "from": "tbd", "to": "go"}, wt), "Status changed: Time to be confirmed to Go for launch")
        self.assertEqual(lp.change_line({"k": "gone"}, wt), "Left the launch list")

    def test_section_newest_first(self):
        ch = [{"k": "status", "at": "2026-11-10T10:00:00Z", "from": "tbd", "to": "go"},
              {"k": "slip", "at": "2026-11-12T10:00:00Z", "from": "2026-11-13T20:00:00Z", "to": "2026-11-13T22:00:00Z"}]
        h = lp.change_log(ch, CTX)
        self.assertLess(h.index("Moved later"), h.index("Status changed"))
        self.assertIn('id="changes"', h)
        self.assertEqual(lp.change_log([], CTX), "")


class Boom(unittest.TestCase):
    def test_cape_landing(self):
        h = lp.boom_note(launch(land={"t": "RTLS", "at": "LZ-2", "n": "Landing Zone 2"}))
        self.assertIn("Brevard", h)
        self.assertIn("LZ 2", h)
        self.assertNotRegex(re.sub(r"<[^>]+>", "", h), r"\w-\w")  # no hyphens in copy

    def test_vandenberg_and_starbase(self):
        self.assertIn("Santa Barbara", lp.boom_note(launch(pad={"n": "SLC-4E", "st": "CA"}, land={"t": "RTLS", "at": "LZ-4"})))
        self.assertIn("Cameron County", lp.boom_note(launch(pad={"n": "OLP-2", "st": "TX"}, land={"t": "RTLS", "at": "OLM-B"})))

    def test_drone_ship_and_none(self):
        self.assertIn("not usually heard", lp.boom_note(launch(land={"t": "ASDS", "at": "OCISLY", "n": "Of Course I Still Love You"})))
        self.assertEqual(lp.boom_note(launch()), "")


class LaunchDay(unittest.TestCase):
    def test_within_a_day(self):
        f = launch(tl=[[-3000, "GO for Prop Load"], [72, "Max-Q"], [150, "MECO"]])
        h = lp.launch_day(f, datetime(2026, 11, 13, 22, 0, tzinfo=timezone.utc), CTX, [])
        self.assertIn(">Go<", h)
        self.assertIn("T−50:00", h)
        self.assertIn("T+1:12", h)
        self.assertIn("Max Q", h)  # the hyphen in a timeline name becomes a space

    def test_no_timeline_said_plainly(self):
        h = lp.launch_day(launch(st="hold"), datetime(2026, 11, 13, 22, 0, tzinfo=timezone.utc), CTX, [])
        self.assertIn("No timeline from the provider yet", h)
        self.assertIn(">Hold<", h)

    def test_scrub_shows(self):
        ch = [{"k": "scrub", "at": "2026-11-13T11:00:00Z", "from": "2026-11-13T12:30:00Z", "to": "2026-11-13T22:00:00Z"}]
        self.assertIn(">Scrubbed<", lp.launch_day(launch(), datetime(2026, 11, 13, 22, 0, tzinfo=timezone.utc), CTX, ch))

    def test_not_outside_a_day(self):
        self.assertEqual(lp.launch_day(launch(), NOW + timedelta(days=2), CTX, []), "")
        self.assertEqual(lp.launch_day(launch(), NOW - timedelta(minutes=5), CTX, []), "")


class Built(unittest.TestCase):
    """the built launch pages (after a build with a feed): every upcoming page has the Look up card and the trust strip, and links its
    calendars to files that exist"""
    def test_built_pages(self):
        dist = ROOT / "dist"
        pages = list((dist / "launch").glob("*/index.html")) if (dist / "launch").exists() else []
        if not pages:
            self.skipTest("no build with a feed")
        feed = json.loads((dist / "launches.json").read_text(encoding="utf-8"))
        up = {f["id"] for f in feed.get("launches") or [] if f.get("st") != "flight"}
        for p in pages:
            h = p.read_text(encoding="utf-8")
            self.assertIn('class="trust"', h, p)
            if p.parent.name in up and '"lat"' in json.dumps(next(f for f in feed["launches"] if f["id"] == p.parent.name).get("pad") or {}):
                self.assertIn('id="lookup"', h, p)
                self.assertIn('src="/lookup.js"', h, p)
                self.assertIn("connect-src 'self' https://api.weather.gov", h, p)
            for href in re.findall(r'href="(/calendar/[^"]+)"', h):
                self.assertTrue((dist / href.lstrip("/")).exists(), href)


if __name__ == "__main__":
    unittest.main()
