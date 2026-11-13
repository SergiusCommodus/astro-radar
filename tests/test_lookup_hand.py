"""The Look Up hand checks: three real launches (Florida, Vandenberg, New Zealand) from three ZIP codes (Miami 33196, Orlando 32801,
Los Angeles 90012). tests/lookup_check.cjs runs the page's own model (src/model.js); this file checks every answer with separate
arithmetic written here, not ported from the model: the distance and bearing by the haversine and initial bearing formulas, the sun's
elevation from launch_pages.sun_el (the build's own NOAA style formula, separate from model.js), whether any point of a rocket at 200 km
(the top of a first stage's useful glow) could clear the horizon at all, and, for a Yes, that the place the card tells you to look lies
on the launch's own heading from the pad. docs/LOOKUP.md section 7 has the table. Needs node."""
import json
import math
import pathlib
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_launches  # noqa: E402
import launch_pages  # noqa: E402

R = 6371.0


def hav(a1, o1, a2, o2):
    p1, p2, dp, dl = map(math.radians, (a1, a2, a2 - a1, o2 - o1))
    return 2 * R * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))


def bearing(a1, o1, a2, o2):
    p1, p2, dl = math.radians(a1), math.radians(a2), math.radians(o2 - o1)
    return (math.degrees(math.atan2(math.sin(dl) * math.cos(p2), math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl))) + 360) % 360


def dest(a, o, brg, km):
    d, b, p1, l1 = km / R, math.radians(brg), math.radians(a), math.radians(o)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    return math.degrees(p2), math.degrees(l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2)))


def max_ground_km(h):
    """the farthest ground distance at which something h km up is still on the horizon"""
    return R * math.acos(R / (R + h))


def cross_track(pad, az, pt):
    """how far pt lies off the great circle that leaves pad on heading az, in km"""
    d13, t13 = hav(pad[0], pad[1], pt[0], pt[1]) / R, math.radians(bearing(pad[0], pad[1], pt[0], pt[1]))
    return abs(math.asin(math.sin(d13) * math.sin(t13 - math.radians(az)))) * R


def model_rows():
    with tempfile.TemporaryDirectory() as d:
        feed = pathlib.Path(d) / "feed.json"
        rc = fetch_launches.main(["x", str(feed), "--from-file", str(ROOT / "tests" / "raw_ll2_lookup.json"), "--now", "2026-11-13T12:00:00Z"])
        assert rc == 0
        out = subprocess.run(["node", str(ROOT / "tests" / "lookup_check.cjs"), str(feed)], capture_output=True, text=True, check=True).stdout
    return [json.loads(l) for l in out.splitlines() if l.strip()]


class HandCheck(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = model_rows()

    def test_all_nine(self):
        self.assertEqual(len(self.rows), 9, self.rows)
        self.assertTrue(all("error" not in r for r in self.rows), self.rows)

    def test_distance_and_sun(self):
        for r in self.rows:
            km = hav(r["lat"], r["lon"], r["padLat"], r["padLon"])
            self.assertLess(abs(km - r["padKm"]), 2, r)
            when = datetime.fromisoformat(r["utc"].replace("Z", "+00:00"))
            self.assertLess(abs(launch_pages.sun_el(r["lat"], r["lon"], when) - r["sunObs"]), 1.0, r)

    def test_verdicts_follow_from_geometry_and_light(self):
        for r in self.rows:
            km = hav(r["lat"], r["lon"], r["padLat"], r["padLon"])
            day = r["sunObs"] > 0
            if km > max_ground_km(200) + 1000:
                # nothing within a first stage's flight from that pad can rise over this horizon
                self.assertEqual(r["verdict"], "No", r)
            if day and km > 200 + 150:
                # a daylight trail is not seen past about 200 km (docs/VISIBILITY.md), and the rocket is at most about 150 km
                # nearer than the pad by the time it is high enough to matter
                self.assertNotEqual(r["verdict"], "Yes", r)
            if day:
                self.assertNotEqual(r["verdict"], "Yes", r)  # the card never promises a daylight trail
            if r["verdict"] in ("Yes", "Maybe"):
                # the place it tells you to look: el degrees up, toward faceAz, at the model's slant range, must be the rocket on its own
                # heading from the pad (within 25 km of the great circle) and above the ground
                rng, el, h = r["bestRange"], math.radians(r["el"]), r["bestH"]
                ground = R * math.atan2(rng * math.cos(el), R + rng * math.sin(el))
                pt = dest(r["lat"], r["lon"], r["faceAz"], ground)
                self.assertLess(cross_track((r["padLat"], r["padLon"]), r["az"], pt), 25, r)
                height = math.sqrt(R ** 2 + rng ** 2 + 2 * R * rng * math.sin(el)) - R
                self.assertLess(abs(height - h), 6, r)
                self.assertAlmostEqual(bearing(r["lat"], r["lon"], *pt), r["faceAz"], delta=1.5)

    def test_expected_table(self):
        got = {(r["where"], r["zip"]): r["verdict"] for r in self.rows}
        # Florida: Vulcan, Amazon Leo LV-01, SLC-41, 17:32 UTC (12:32 PM EST, full daylight). Orlando is 77 km away: a daytime trail,
        # Maybe. Miami is 325 km away, past a daylight trail's reach: No. Los Angeles is 3,600 km away: below the horizon.
        # Vandenberg: Falcon 9, USSF-317, SLC-4E, 03:14 UTC (7:14 PM PST, the sun 30 degrees down in Los Angeles). From Los Angeles,
        # 227 km away, the first stage climbs to about 100 km over the sea southwest of the city: 45 degrees up, a Yes. Miami and Orlando are
        # 3,750 km and more away: No. Overseas: Electron from Mahia, New Zealand: every ZIP is 10,000 km away or more: No.
        self.assertEqual(got, {("Florida", "33196"): "No", ("Florida", "32801"): "Maybe", ("Florida", "90012"): "No",
                               ("Vandenberg", "33196"): "No", ("Vandenberg", "32801"): "No", ("Vandenberg", "90012"): "Yes",
                               ("Overseas", "33196"): "No", ("Overseas", "32801"): "No", ("Overseas", "90012"): "No"})

    def test_sound_only_when_near(self):
        for r in self.rows:
            if r["padKm"] <= 60:
                self.assertEqual(r["sound"], max(1, round(r["padKm"] / 0.343)), r)
            else:
                self.assertIsNone(r["sound"], r)


if __name__ == "__main__":
    unittest.main()
