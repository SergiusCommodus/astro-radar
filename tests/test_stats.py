"""The Statistics page (stats_page.py, scripts/fetch_history.py, data/history/stats.json): python3 -m unittest tests.test_stats

  fetch       the compact record keeps what Launch Library says (outcome, provider, rocket, pad, state, orbit, notes) from six real
              detailed records saved in tests/history/ (two Falcon 9s, Florida and California; PSLV's failure; a Long March; a scrub; New
              Shepard, suborbital), and the yearly counts as given
  numbers     every count on the page is the record's own: launches, successes, failures, the orbital attempts, each year, each provider,
              rocket and pad, the three states, the months; rates only for groups of MIN_N or more
  honest      each section names its source and the day it was fetched; scrubs say they are a floor and give their sample size
  clean       no undefined, null, NaN or None, no hyphen in the copy, no inline style or script; a page without the record is not written
"""
import html
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import stats_page  # noqa: E402

FIX = ROOT / "tests/history"
DATA = ROOT / "data/history/stats.json"


def page_stub(slug, title, desc, body, ctx, here=None, **k):
    return f"<title>{html.escape(title)}</title><meta name=\"description\" content=\"{html.escape(desc)}\"><main>{body}</main>"


def text(h):
    h = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", h, flags=re.S)
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h)))


class Fetch(unittest.TestCase):
    def test_compact_from_saved_pages(self):
        with tempfile.TemporaryDirectory() as d:
            out = pathlib.Path(d) / "s.json"
            subprocess.run([sys.executable, str(ROOT / "scripts/fetch_history.py"), "--year", "2026", "--from-dir", str(FIX), "--out", str(out)],
                           check=True, capture_output=True)
            s = json.loads(out.read_text(encoding="utf-8"))
        L = {l["name"]: l for l in s["launches"]}
        self.assertEqual(len(L), 6)
        f9 = L["Falcon 9 Block 5 | Starlink Group 6-88"]
        self.assertEqual((f9["status"], f9["provider"], f9["state"], f9["country"], f9["suborbital"]), ("Success", "SpaceX", "FL", "USA", False))
        self.assertEqual(L["Falcon 9 Block 5 | CSG-3"]["state"], "CA")
        self.assertEqual(L["PSLV-DL | EOS-N1 and others"]["status"], "Failure")
        self.assertIsNone(L["Long March 6A | Yaogan 50-01"]["state"])
        self.assertTrue(L["New Shepard | NS-38"]["suborbital"])
        self.assertTrue(any("scrub" in u["text"].lower() for u in L["Ceres-2 | Demo Flight"]["updates"]))
        self.assertEqual(s["years"]["2025"], {"all": 341, "success": 329, "failure": 12, "partial": 0})
        self.assertEqual(s["years"]["2024"]["all"], 273)


class Page(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = json.loads(DATA.read_text(encoding="utf-8"))
        cls.h = stats_page.body(cls.d)
        cls.t = text(cls.h)
        cls.L = [l for l in cls.d["launches"] if l["status"] in stats_page.FLOWN]

    def cells(self, row_name):
        """the cells of the table row whose first cell is row_name"""
        for r in re.findall(r"<tr>(.*?)</tr>", self.h, re.S):
            c = [text(x).strip() for x in re.findall(r"<td>(.*?)</td>", r, re.S)]
            if c and c[0] == row_name:
                return c
        self.fail("no row " + row_name)

    def test_year_totals(self):
        n = len(self.L)
        ok = sum(l["status"] == "Success" for l in self.L)
        fail = sum(l["status"] == "Failure" for l in self.L)
        y = self.d["year"]
        self.assertEqual(self.cells(f"{y} so far")[1:4], [f"{n:,}", f"{ok:,}", f"{fail:,}"])
        self.assertIn(f"Launches in {y} {n:,}", self.t)
        for yy, c in self.d["years"].items():
            self.assertEqual(self.cells(yy)[1:5], [f"{c['all']:,}", f"{c['success']:,}", f"{c['failure']:,}", f"{c['partial']:,}"])
            self.assertEqual(self.cells(yy)[5], f"{100 * c['success'] / c['all']:.1f}%")
        orb = [l for l in self.L if not l["suborbital"]]
        self.assertIn(f"Orbital attempts {len(orb):,}", self.t)

    def test_groups(self):
        for key, f in (("provider", lambda l: stats_page.nice(l["provider"])), ("rocket", lambda l: stats_page.nice(l["rocket"]))):
            c = Counter(f(l) for l in self.L)
            for name, n in sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[:stats_page.TOP]:
                row = self.cells(name)
                self.assertEqual(row[1], f"{n:,}", (key, name))
                if n < stats_page.MIN_N:
                    self.assertEqual(row[3], "too few to say", name)
                else:
                    ok = sum(l["status"] == "Success" for l in self.L if f(l) == name)
                    self.assertEqual(row[3], f"{100 * ok / n:.1f}%", name)

    def test_states_and_months(self):
        n = len(self.L)
        for code, name in stats_page.STATES:
            k = sum(l.get("state") == code for l in self.L)
            self.assertEqual(self.cells(name)[1:3], [f"{k:,}", f"{100 * k / n:.1f}%"])
        us = sum(l.get("country") == "USA" for l in self.L)
        self.assertEqual(self.cells("Outside the US")[1], f"{n - us:,}")
        per = Counter(int(l["net"][5:7]) for l in self.L)
        cols = re.findall(r'<span class="cv">(\d+)</span>', self.h)
        self.assertEqual([int(x) for x in cols], [per.get(m, 0) for m in range(1, max(per) + 1)])

    def test_sources_and_floor(self):
        day = stats_page.day(self.d["fetched"])
        for sec in re.split(r"<h2 ", self.h)[1:-1]:
            if 'id="months"' in sec:
                continue
            self.assertIn(f"fetched {day}", text(sec), sec[:60])
        self.assertIn("these are a floor", self.t)
        self.assertRegex(self.t, r"Of the [\d,]+ launches whose countdown")

    def test_clean(self):
        self.assertNotRegex(self.t, r"\b(undefined|null|NaN|None)\b")
        self.assertNotRegex(self.t, r"(?<=\w)-(?=\w)", "a hyphen in the copy")
        self.assertNotIn("style=", self.h)
        self.assertNotIn("<script", self.h)

    def test_write_all(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(stats_page.write_all(pathlib.Path(d), {}, page_stub, path=pathlib.Path(d) / "missing.json"), [])
            self.assertFalse((pathlib.Path(d) / "stats").exists())
            urls = stats_page.write_all(pathlib.Path(d), {}, page_stub)
            self.assertEqual(urls, ["https://astroradar.io/stats/"])
            self.assertIn("Launch statistics", (pathlib.Path(d) / "stats/index.html").read_text(encoding="utf-8"))


@unittest.skipUnless((ROOT / "dist/stats/index.html").exists(), "after a build")
class Built(unittest.TestCase):
    def test_in_sitemap_and_menus(self):
        self.assertIn("https://astroradar.io/stats/", (ROOT / "dist/sitemap.xml").read_text(encoding="utf-8"))
        self.assertIn('href="/stats/"', (ROOT / "dist/about/index.html").read_text(encoding="utf-8"))
        self.assertIn("stats/", (ROOT / "dist/index.html").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
