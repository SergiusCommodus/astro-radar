"""Calendar files against RFC 5545: python3 -m unittest tests.test_ics   (after a build with a feed)
Checks launches.ics (the subscription) and every launch/<id>/launch.ics the build wrote, line by line: CRLF line ends, lines folded at 75
octets, the component nesting, the properties each component must have exactly once, UTC times, escaped text, unique and stable UIDs,
alarms with what their action needs, STATUS and SEQUENCE; and that app.js numbers revisions (icsRev) as launch_pages.py does."""
import json, pathlib, re, subprocess, sys, unittest
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
sys.path.insert(0, str(ROOT))
import launch_pages as lp  # noqa: E402

UTC = re.compile(r"\d{8}T\d{6}Z")
DUR = re.compile(r"[+-]?P(\d+W|(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?)")
NAME = re.compile(r"([A-Z0-9-]+)((?:;[A-Z0-9-]+=(?:\"[^\"]*\"|[^;:,\"]*)(?:,(?:\"[^\"]*\"|[^;:,\"]*))*)*):(.*)")
ONCE = {"VCALENDAR": {"VERSION", "PRODID"}, "VEVENT": {"UID", "DTSTAMP", "DTSTART"}, "VALARM": {"ACTION", "TRIGGER"}}
AT_MOST_ONCE = {"VEVENT": {"DTEND", "DURATION", "SUMMARY", "DESCRIPTION", "LOCATION", "URL", "STATUS", "SEQUENCE", "LAST-MODIFIED", "CLASS"},
                "VALARM": {"DESCRIPTION", "DURATION", "REPEAT"}, "VCALENDAR": {"CALSCALE", "METHOD"}}
TEXT = {"SUMMARY", "DESCRIPTION", "LOCATION", "X-WR-CALNAME", "X-WR-CALDESC"}


def check(raw):
    """Problems with one .ics file's bytes, as a list of strings; and its events as (props) dicts."""
    bad, events = [], []
    if b"\r\n" not in raw or re.search(rb"(?<!\r)\n", raw) or re.search(rb"\r(?!\n)", raw):
        bad.append("lines must end with CRLF, and nothing else")
    for i, ln in enumerate(raw.split(b"\r\n")[:-1]):
        if len(ln) > 75:
            bad.append(f"line {i + 1} is {len(ln)} octets (75 at most)")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return ["not UTF-8"], []
    lines = re.sub(r"\r\n[ \t]", "", text).split("\r\n")
    if lines[-1] != "":
        bad.append("the file must end with CRLF")
    stack, props = [], []
    for ln in lines[:-1]:
        m = NAME.fullmatch(ln)
        if not m:
            bad.append(f"not a content line: {ln[:60]!r}")
            continue
        name, params, value = m.groups()
        if name == "BEGIN":
            stack.append(value)
            props.append({})
            if len(stack) == 1 and value != "VCALENDAR":
                bad.append("the file must start with BEGIN:VCALENDAR")
            continue
        if name == "END":
            if not stack or stack[-1] != value:
                bad.append(f"END:{value} does not close {stack[-1] if stack else 'anything'}")
                continue
            comp, p = stack.pop(), props.pop()
            for need in ONCE.get(comp, ()):
                if len(p.get(need, [])) != 1:
                    bad.append(f"{comp} needs {need} exactly once (has {len(p.get(need, []))})")
            for k in AT_MOST_ONCE.get(comp, ()):
                if len(p.get(k, [])) > 1:
                    bad.append(f"{comp} has {k} more than once")
            if comp == "VEVENT":
                events.append(p)
                if "DTEND" in p and "DURATION" in p:
                    bad.append("VEVENT has both DTEND and DURATION")
                for k in ("DTSTAMP", "DTSTART", "DTEND", "LAST-MODIFIED"):
                    for v in p.get(k, []):
                        if not UTC.fullmatch(v):
                            bad.append(f"{k} is not a UTC time: {v}")
                if p.get("DTEND") and p.get("DTSTART") and p["DTEND"][0] <= p["DTSTART"][0]:
                    bad.append("DTEND must be after DTSTART")
                for v in p.get("STATUS", []):
                    if v not in ("TENTATIVE", "CONFIRMED", "CANCELLED"):
                        bad.append(f"STATUS {v} is not one an event can have")
                for v in p.get("SEQUENCE", []):
                    if not re.fullmatch(r"\d+", v) or int(v) > 2 ** 31 - 1:
                        bad.append(f"SEQUENCE {v} is not a non negative 32 bit integer")
                for v in p.get("URL", []):
                    if not re.fullmatch(r"https://[^\s\"<>]+", v):
                        bad.append(f"URL {v}")
            if comp == "VALARM":
                for v in p.get("TRIGGER", []):
                    if not DUR.fullmatch(v):
                        bad.append(f"TRIGGER {v} is not a duration")
                if p.get("ACTION") == ["DISPLAY"] and len(p.get("DESCRIPTION", [])) != 1:
                    bad.append("a DISPLAY alarm needs a DESCRIPTION")
            continue
        if not stack:
            bad.append(f"{name} outside any component")
            continue
        props[-1].setdefault(name, []).append(value)
        if name in TEXT and re.search(r"(?<!\\)[,;]|\n", value.replace("\\\\", "")):
            bad.append(f"{name} has an unescaped comma, semicolon or newline: {value[:60]!r}")
    if stack:
        bad.append(f"unclosed {stack}")
    uids = [e["UID"][0] for e in events if e.get("UID")]
    if len(uids) != len(set(uids)):
        bad.append("UIDs repeat")
    return bad, events


class Rules(unittest.TestCase):
    def test_the_checker_finds_problems(self):
        good = "\r\n".join(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//x//y//EN", "BEGIN:VEVENT", "UID:1@x", "DTSTAMP:20260101T000000Z",
                            "DTSTART:20260101T010000Z", "DTEND:20260101T013000Z", "SUMMARY:a\\, b", "END:VEVENT", "END:VCALENDAR"]) + "\r\n"
        self.assertEqual(check(good.encode())[0], [])
        for broken in (good.replace("\r\n", "\n"), good.replace("UID:1@x\r\n", ""), good.replace("a\\, b", "a, b"),
                       good.replace("20260101T013000Z", "20260101T003000Z"), good.replace("END:VEVENT\r\n", ""), good.replace("SUMMARY", "SUMMARY:" + "x" * 80)):
            self.assertNotEqual(check(broken.encode())[0], [], broken[:40])

    def test_revisions_grow_with_last_updated(self):
        a = lp.ics_revision({"lu": "2026-11-01T00:00:00Z"})[0]
        b = lp.ics_revision({"lu": "2026-11-01T00:05:00Z"})[0]
        self.assertGreater(b, a)
        self.assertEqual(lp.ics_revision({})[0], 0)
        self.assertEqual(lp.ics_revision({"lu": "nonsense"}), (0, None))

    def test_app_numbers_revisions_as_the_build_does(self):
        app = (ROOT / "src/app.js").read_text(encoding="utf-8")
        fn = re.search(r"function icsRev\(L\)\{.*?\}\n", app, re.S)
        self.assertTrue(fn, "icsRev not found in app.js")
        cases = ["2026-11-01T00:00:00Z", "2020-01-01T00:00:59Z", "2019-12-31T23:00:00Z", "", "bad"]
        js = fn.group(0) + "console.log(JSON.stringify(" + json.dumps(cases) + ".map(function(s){return icsRev({lu:s})})))"
        try:
            got = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)
        except (OSError, subprocess.CalledProcessError) as e:
            self.skipTest(f"node is not available: {e}")
        self.assertEqual(got, [lp.ics_revision({"lu": s})[0] for s in cases])


@unittest.skipUnless((DIST / "launches.ics").exists() and (DIST / "launches.json").exists(), "build with a feed first")
class Built(unittest.TestCase):
    def test_subscription_and_launch_files(self):
        bad, sub = check((DIST / "launches.ics").read_bytes())
        self.assertEqual(bad, [], "launches.ics")
        self.assertTrue(sub, "the subscription has no events")
        by_uid = {e["UID"][0]: e for e in sub}
        files = sorted(DIST.glob("launch/*/launch.ics"))
        self.assertTrue(files)
        for f in files:
            bad, evs = check(f.read_bytes())
            self.assertEqual(bad, [], str(f))
            self.assertEqual(len(evs), 1, str(f))
            e = evs[0]
            if e["UID"][0] in by_uid:
                s = by_uid[e["UID"][0]]
                for k in ("DTSTART", "SUMMARY", "STATUS", "SEQUENCE"):
                    self.assertEqual(e.get(k), s.get(k), f"{f}: {k} differs from the subscription's")
        feed = json.loads((DIST / "launches.json").read_text(encoding="utf-8"))
        for l in feed["launches"]:
            e = by_uid.get(f"{l['id']}@astroradar.io")
            if not e:
                continue
            want = "TENTATIVE" if l.get("st") in ("tbd", "hold") else "CONFIRMED"
            self.assertEqual(e["STATUS"], [want], l["id"])
            self.assertEqual(e["SEQUENCE"], [str(lp.ics_revision(l)[0])], l["id"])
            self.assertEqual("LAST-MODIFIED" in e, bool(l.get("lu")), l["id"])


if __name__ == "__main__":
    unittest.main()
