"""Checks for the provider logos (assets/providers/, data/providers.json, logo_of and mono_of in launch_pages.py, their port in app.js).

    python3 -m unittest discover -s tests -p "test_*.py"

Fails when a provider in data/providers.json or in a feed (the real Launch Library samples, the mock, and dist/launches.json when a build
left one) has neither a logo file nor a monogram, when a logo file is unsafe, unlisted in SOURCES.md or missing from the service worker,
or when the page's monogram rule differs from the build's.
"""
import json, pathlib, re, shutil, subprocess, sys, tempfile, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import launch_pages as lp  # noqa: E402

LOGOS = ROOT / "assets/providers"
PJ = json.loads((ROOT / "data/providers.json").read_text(encoding="utf-8"))
PROVIDERS = {p["key"]: p for p in PJ["providers"]}
OTHERS = PJ.get("others", [])


def feeds():
    """Every feed to check: the real samples and the mock through the feed script, and the last build's feed."""
    out = {}
    with tempfile.TemporaryDirectory() as d:
        mock = pathlib.Path(d) / "mock.json"
        subprocess.run([sys.executable, str(ROOT / "tests/make_mock_ll2.py"), str(mock), "--now", "2026-10-27T12:00:00Z"], check=True, capture_output=True)
        # each sample at a fixed clock (the parity tests' own), so the real samples do not age out of the 30 day window
        for name, raw, now in (("raw_ll2", ROOT / "tests/raw_ll2.json", "2026-10-26T00:00:00Z"), ("raw_ll2_window", ROOT / "tests/raw_ll2_window.json", "2026-10-27T18:47:06Z"),
                               ("mock", mock, "2026-10-27T12:00:00Z")):
            dst = pathlib.Path(d) / (name + ".out.json")
            subprocess.run([sys.executable, str(ROOT / "scripts/fetch_launches.py"), str(dst), "--from-file", str(raw), "--now", now], check=True, capture_output=True)
            out[name] = json.loads(dst.read_text(encoding="utf-8"))
    if (ROOT / "dist/launches.json").exists():
        out["dist"] = json.loads((ROOT / "dist/launches.json").read_text(encoding="utf-8"))
    return out


class Logos(unittest.TestCase):
    def check_logo(self, g, where):
        if g.get("logo"):
            self.assertIn(g.get("kind"), ("word", "mark"), where)
            self.assertTrue((ROOT / "assets" / g["logo"]).is_file(), f"{where}: {g['logo']} is missing")
        else:
            self.assertRegex(g.get("mono") or "", r"^[A-Z0-9]{1,4}$", f"{where}: no logo and no monogram")

    def test_every_listed_provider_has_a_logo_or_a_monogram(self):
        for p in PJ["providers"]:
            self.assertTrue(p.get("logo") or p.get("mono"), p["key"] + " has neither a logo nor a monogram")
            self.check_logo(lp.logo_of({"prov": p["key"]}, PROVIDERS, OTHERS), p["key"])
        for o in OTHERS:
            self.assertTrue(o.get("logo") or o.get("mono"), o["n"])
            self.check_logo(lp.logo_of({"prov": "other", "pv": {"n": o["names"][0]}}, PROVIDERS, OTHERS), o["n"])

    def test_every_provider_in_the_feeds_gets_a_logo_or_a_monogram(self):
        seen = 0
        for name, feed in feeds().items():
            for f in feed.get("launches", []) + feed.get("recent", []):
                self.check_logo(lp.logo_of(f, PROVIDERS, OTHERS), f"{name}: {f.get('id')} ({f.get('prov')}, {(f.get('pv') or {}).get('n')})")
                seen += 1
        self.assertGreater(seen, 20)

    def test_named_providers_outside_the_list_get_their_logo_or_a_badge(self):
        self.assertEqual(lp.logo_of({"prov": "other", "pv": {"n": "Isar Aerospace"}}, PROVIDERS, OTHERS)["logo"], "providers/isar.svg")
        self.assertEqual(lp.logo_of({"prov": "other", "pv": {"n": "CAS Space"}}, PROVIDERS, OTHERS)["mono"], "CAS")
        self.assertEqual(lp.logo_of({"prov": "other", "pv": {"n": "Galactic Energy"}}, PROVIDERS, OTHERS)["mono"], "GE")
        self.assertEqual(lp.logo_of({"prov": "other"}, PROVIDERS, OTHERS)["mono"], "LP")

    def test_logo_files_are_small_safe_svgs_listed_in_sources(self):
        sources = (LOGOS / "SOURCES.md").read_text(encoding="utf-8")
        files = sorted(LOGOS.glob("*.svg"))
        self.assertGreaterEqual(len(files), 10)
        used = {p["logo"] for p in PJ["providers"] + OTHERS if p.get("logo")}
        for f in files:
            s = f.read_text(encoding="utf-8")
            self.assertLess(len(s), 24000, f.name)
            self.assertRegex(s, r'^<svg [^>]*viewBox="[-\d. ]+"', f.name)
            self.assertNotRegex(s, r"(?i)<script|<foreignObject|\son\w+=|href=\"(?!#)|<image|<style", f.name)
            self.assertNotRegex(s, r'fill="(?!#fff"|none")', f.name + " is not white")
            self.assertIn("| " + f.name + " |", sources, f.name + " is not in SOURCES.md")
            self.assertIn("providers/" + f.name, used, f.name + " is not used by data/providers.json")
        for p in used:
            self.assertTrue((ROOT / "assets" / p).is_file(), p)

    def test_the_service_worker_keeps_every_logo(self):
        sw = ROOT / "dist/sw.js"
        if not sw.exists():
            self.skipTest("no build")
        kept = json.loads(re.search(r"(\[\"[^\]]*\])", sw.read_text(encoding="utf-8")).group(1))
        for f in LOGOS.glob("*.svg"):
            self.assertIn("providers/" + f.name, kept)
            self.assertTrue((ROOT / "dist/providers" / f.name).is_file(), f.name + " was not copied")

    def test_the_page_makes_the_same_monograms(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("no node")
        app = (ROOT / "src/app.js").read_text(encoding="utf-8")
        code = re.search(r"var MONO_SKIP=.*?\n(?:function monoOf.*?\n(?:  .*\n)*)", app).group(0)
        names = ["CAS Space", "Galactic Energy", "LandSpace", "iSpace", "Rocket Factory Augsburg", "China Aerospace Science and Technology Corporation",
                 "Space Pioneer", "Gilmour Space Technologies", "Virgin Galactic", "ABL Space Systems", "Orienspace", "Russian Federal Space Agency (ROSCOSMOS)", ""]
        js = code + "console.log(JSON.stringify(" + json.dumps(names) + ".map(monoOf)))"
        out = json.loads(subprocess.run([node, "-e", js], check=True, capture_output=True, text=True).stdout)
        self.assertEqual(out, [lp.mono_of(n) for n in names])

    def test_logo_chip_rule(self):
        r = {"providers/a.svg": 8.18, "providers/b.svg": 1.0, "providers/c.svg": 16.67}
        wide = lp.logo_chip({"n": "A", "logo": "providers/a.svg", "kind": "word", "bc": "#fff"}, r, "row")
        self.assertIn('width="112" height="14" alt="A"', wide)
        self.assertIn('style="--bc:#fff"', wide)
        square = lp.logo_chip({"n": "B", "logo": "providers/b.svg", "kind": "mark"}, r, "hero")
        self.assertIn('width="36" height="36" alt=""', square)
        self.assertIn('<span class="lchip-n">B</span>', square)
        thin = lp.logo_chip({"n": "C", "logo": "providers/c.svg", "kind": "word"}, r, "row", brand=False)
        self.assertIn('height="10"', thin)  # never under 10 px tall
        self.assertNotIn("style=", thin)

    def test_the_page_sizes_chips_as_the_build_does(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("no node")
        app = (ROOT / "src/app.js").read_text(encoding="utf-8")
        code = re.search(r"var CHIP=.*?\n", app).group(0) + re.search(r"function chipSize.*?\n", app).group(0)
        cases = [[r, k] for r in (1.0, 1.65, 3.59, 4.5, 8.18, 16.67) for k in ("row", "hero", "card")]
        js = code + "console.log(JSON.stringify(" + json.dumps(cases) + ".map(function(c){return chipSize(c[0],c[1])})))"
        out = json.loads(subprocess.run([node, "-e", js], check=True, capture_output=True, text=True).stdout)
        self.assertEqual(out, [list(lp.chip_size(r, k)) for r, k in cases])


if __name__ == "__main__":
    unittest.main()
