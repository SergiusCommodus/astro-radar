"""Calendar feeds per pad and per provider (calendar_feeds.py): python3 -m unittest tests.test_calendar_feeds
Every file passes the RFC 5545 checks of tests/test_ics.py; there is one file per pad with an upcoming launch and one per provider in
providers.json; each event is byte for byte the main calendar's event for the same launch, SEQUENCE included."""
import json
import pathlib
import re
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "tests"))
import calendar_feeds as cf  # noqa: E402
import fetch_launches as fl  # noqa: E402
import launch_pages as lp  # noqa: E402
from test_ics import check  # noqa: E402

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
PROVIDERS = json.loads((ROOT / "data/providers.json").read_text(encoding="utf-8"))["providers"]


def blocks(raw):
    """The VEVENT blocks of a file, as the raw (folded) text, by UID."""
    text = raw.decode("utf-8")
    out = {}
    for b in re.findall(r"BEGIN:VEVENT\r\n.*?END:VEVENT\r\n", text, re.S):
        uid = re.search(r"UID:(.*?)\r\n", re.sub(r"\r\n[ \t]", "", b)).group(1)
        out[uid] = b
    return out


def events_of(raw):
    """The event line lists of a written calendar (unfolded), as build_pages passes them."""
    lines = re.sub(r"\r\n[ \t]", "", raw.decode("utf-8")).split("\r\n")
    evs, cur = [], None
    for ln in lines:
        if ln == "BEGIN:VEVENT":
            cur = []
        if cur is not None:
            cur.append(ln)
        if ln == "END:VEVENT":
            evs.append(cur)
            cur = None
    return evs


class Feeds(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.feed = fl.build(json.loads((ROOT / "tests/raw_ll2_lookup.json").read_text(encoding="utf-8")), now=NOW)
        stamp = NOW
        self.make = lambda f: lp.ics_event(f, datetime.fromisoformat(f["utc"].replace("Z", "+00:00")), "https://example.org/watch", stamp)
        self.events = [self.make(f) for f in self.feed["launches"] if f.get("st") != "flight"]
        self.main = lp.ics_calendar(self.events, "Astro Radar launches").encode("utf-8")

    def test_files_valid_and_identical_to_the_main_calendar(self):
        for how in (self.events, self.make):
            paths = cf.write(self.tmp, self.feed, PROVIDERS, how, NOW)
            main = blocks(self.main)
            pads = [p for p in paths if p.startswith("calendar/pad/")]
            provs = [p for p in paths if p.startswith("calendar/provider/")]
            self.assertEqual(len(pads), len({f["site"] for f in self.feed["launches"]}))
            self.assertEqual(sorted(provs), sorted(f"calendar/provider/{p['key']}.ics" for p in PROVIDERS))
            self.assertEqual(len(paths), len(set(paths)))
            seen = {}
            for p in paths:
                raw = (self.tmp / p).read_bytes()
                bad, evs = check(raw)
                self.assertEqual(bad, [], p)
                self.assertIn(b"X-WR-CALNAME:Astro Radar: ", raw)
                for uid, b in blocks(raw).items():
                    self.assertEqual(b, main[uid], f"{p}: {uid} differs from launches.ics")
                    self.assertIn("SEQUENCE:", b)
                    seen.setdefault(p.split("/")[1], set()).add(uid)
            # every upcoming launch is in exactly one pad file, and in its provider's file when the provider is listed
            self.assertEqual(seen["pad"], set(main))
            listed = {p["key"] for p in PROVIDERS}
            self.assertEqual(seen["provider"], {f"{f['id']}@astroradar.io" for f in self.feed["launches"] if f["prov"] in listed})

    def test_names_and_slugs(self):
        paths = cf.write(self.tmp, self.feed, {p["key"]: p for p in PROVIDERS}, self.events, NOW)
        self.assertIn("calendar/provider/spacex.ics", paths)
        raw = (self.tmp / "calendar/provider/spacex.ics").read_bytes()
        self.assertIn(b"X-WR-CALNAME:Astro Radar: SpaceX launches", raw)
        slugs = [p.split("/")[-1][:-4] for p in paths if "/pad/" in p]
        self.assertTrue(all(re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", s) for s in slugs), slugs)
        self.assertEqual(cf.pad_slug({"n": "Space Launch Complex 40", "full": "Space Launch Complex 40, Cape Canaveral SFS, FL, USA"}),
                         "space-launch-complex-40-cape-canaveral-sfs")
        self.assertEqual(cf.pad_slug({"n": "Mahia Peninsula", "full": "Mahia Peninsula, New Zealand"}), "mahia-peninsula-new-zealand")
        self.assertEqual(cf.pad_slug({"n": "Plesetsk Cosmodrome Site 43/4", "full": "Plesetsk Cosmodrome Site 43/4, Federation of Russia"}),
                         "plesetsk-cosmodrome-site-43-4-federation-of-russia")
        self.assertEqual(cf.pad_slug({"n": "Base de lancement Élysée", "full": "Base de lancement Élysée, Guyane"}), "base-de-lancement-elysee-guyane")
        self.assertEqual(cf.pad_slug({"n": "Andøya Launch Pad", "full": "Andøya Launch Pad, Andøya Spaceport"}), "andoya-launch-pad-andoya-spaceport")

    def test_stable_and_unique(self):
        a = cf.write(self.tmp, self.feed, PROVIDERS, self.events, NOW)
        b = cf.write(self.tmp, self.feed, PROVIDERS, self.events, NOW)
        self.assertEqual(a, b)
        f0 = self.feed["launches"][0]
        twin = dict(f0, id="twin-1", site="pad99999", lu=None)
        feed = dict(self.feed, launches=self.feed["launches"] + [twin])
        paths = cf.write(self.tmp, feed, PROVIDERS, self.make, NOW)
        self.assertEqual(len(paths), len(set(paths)))
        self.assertTrue(any(p.endswith("-pad99999.ics") for p in paths))

    def test_stale_pad_files_go_and_empty_providers_stay_valid(self):
        (self.tmp / "calendar/pad").mkdir(parents=True)
        (self.tmp / "calendar/pad/old-pad.ics").write_text("x")
        cf.write(self.tmp, {"launches": [], "recent": []}, PROVIDERS, [], NOW)
        self.assertFalse((self.tmp / "calendar/pad/old-pad.ics").exists())
        for p in PROVIDERS:
            bad, evs = check((self.tmp / f"calendar/provider/{p['key']}.ics").read_bytes())
            self.assertEqual((bad, evs), ([], []), p["key"])

    def test_in_flight_launch_is_left_out(self):
        f0 = dict(self.feed["launches"][0], st="flight")
        cf.write(self.tmp, dict(self.feed, launches=[f0]), PROVIDERS, self.make, NOW)
        self.assertEqual(list((self.tmp / "calendar/pad").glob("*.ics")), [])


@unittest.skipUnless((DIST / "launches.ics").exists() and (DIST / "launches.json").exists(), "build with a feed first")
class Built(unittest.TestCase):
    """The build's own launches.ics events, passed as build_pages would pass them."""

    def test_against_the_build(self):
        tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, True)
        main_raw = (DIST / "launches.ics").read_bytes()
        feed = json.loads((DIST / "launches.json").read_text(encoding="utf-8"))
        paths = cf.write(tmp, feed, PROVIDERS, events_of(main_raw), NOW)
        main = blocks(main_raw)
        got = set()
        for p in paths:
            raw = (tmp / p).read_bytes()
            self.assertEqual(check(raw)[0], [], p)
            for uid, b in blocks(raw).items():
                self.assertEqual(b, main[uid], p)
                if "/pad/" in p:
                    got.add(uid)
        self.assertEqual(got, set(main))


if __name__ == "__main__":
    unittest.main()
