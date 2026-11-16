"""Calendar feeds per pad and per provider (docs/LOOKUP.md section 5): dist/calendar/pad/<slug>.ics for every pad with an upcoming launch
and dist/calendar/provider/<key>.ics for every provider in data/providers.json (an empty, valid calendar when it has none).

The events are the main calendar's own (launches.ics): build_pages passes the events it made with launch_pages.ics_event, or a callable
that makes one, so the same launch reads byte for byte the same in every file; the wrapper is launch_pages.ics_calendar. Written at every
build, so a launch that slipped carries its higher SEQUENCE and one that left the feed is gone at the next refresh.
"""
import re
import shutil
import unicodedata
from pathlib import Path

UID = re.compile(r"UID:(.*)@astroradar\.io")
# letters NFKD does not split into an ASCII letter and an accent
FOLD = str.maketrans({"ø": "o", "Ø": "O", "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE", "ß": "ss", "đ": "d", "Đ": "D", "ł": "l", "Ł": "L",
                      "þ": "th", "Þ": "TH", "ð": "d", "Ð": "D", "ı": "i"})


def ascii_words(text):
    """Lowercase ASCII words of a name, accents folded, anything else a break."""
    t = unicodedata.normalize("NFKD", str(text or "").translate(FOLD)).encode("ascii", "ignore").decode("ascii").lower()
    return [w for w in re.split(r"[^a-z0-9]+", t) if w]


def pad_slug(pad):
    """The pad's name plus the first part of its location (space-launch-complex-40-cape-canaveral-sfs), from the feed's pad object."""
    n = (pad or {}).get("n") or ""
    full = (pad or {}).get("full") or ""
    rest = full[len(n):].lstrip(", ") if n and full.startswith(n) else full
    words = ascii_words(n)
    for w in ascii_words(rest.split(",")[0]):
        words.append(w)
    return "-".join(words)


def _events_by_id(ics_event, launches):
    """The VEVENT lines for each launch id: from a callable (f -> lines or None), or from the list of events build_pages made (by UID)."""
    if callable(ics_event):
        out = {}
        for f in launches:
            ev = ics_event(f)
            if ev:
                out[f["id"]] = ev
        return out
    out = {}
    for ev in ics_event or []:
        for line in ev:
            m = UID.fullmatch(line)
            if m:
                out[m.group(1).replace("\\\\", "\\").replace("\\;", ";").replace("\\,", ",")] = ev
                break
    return out


def pad_files(launches):
    """{pad key: file slug} for the pads of these launches (the feed's site, else the pad's full name): the pad's slug, or, when two pads
    would share one, the slug with the pad key after it. The launch pages link to the same names write() uses."""
    keys = []
    pads = {}
    for f in launches:
        key = f.get("site") or (f.get("pad") or {}).get("full") or ""
        if key not in pads:
            pads[key] = f.get("pad") or {}
            keys.append(key)
    slugs = {}
    for key in keys:
        slugs.setdefault(pad_slug(pads[key]) or "pad", []).append(key)
    out = {}
    for s, ks in slugs.items():
        for key in ks:
            out[key] = s if len(ks) == 1 else f"{s}-{'-'.join(ascii_words(key)) or 'pad'}"
    return out


def calendar_launches(feed):
    """the launches the pad and provider calendars carry: upcoming, not in flight (as launches.ics)"""
    return [f for f in (feed or {}).get("launches") or [] if isinstance(f, dict) and f.get("id") and f.get("st") != "flight"]


def write(dist_dir, feed, providers, ics_event, now=None):
    """Writes the pad and provider calendars into dist_dir/calendar/ and returns their site relative paths (calendar/pad/<slug>.ics,
    calendar/provider/<key>.ics), pads first, each group sorted. ics_event is either the list of VEVENT line lists build_pages wrote
    into launches.ics, or a callable f -> VEVENT lines (None to leave a launch out). providers is the providers.json list, or the dict
    of them by key that build_pages has. now is accepted for symmetry with the other writers; the files depend only on the feed."""
    import launch_pages as lp  # the same wrapper and folding as launches.ics
    dist_dir = Path(dist_dir)
    base = dist_dir / "calendar"
    for sub in ("pad", "provider"):
        shutil.rmtree(base / sub, ignore_errors=True)  # a pad with no launch left loses its file
        (base / sub).mkdir(parents=True, exist_ok=True)
    launches = [f for f in (feed or {}).get("launches") or []
                if isinstance(f, dict) and f.get("id") and f.get("st") != "flight"]
    evs = _events_by_id(ics_event, launches)
    launches = [f for f in launches if f["id"] in evs]
    written = []

    # pads, keyed by the feed's site (the Launch Library pad id); slugs that two pads would share get the pad id after them
    pads = {}
    for f in launches:
        key = f.get("site") or (f.get("pad") or {}).get("full") or ""
        pads.setdefault(key, {"pad": f.get("pad") or {}, "items": []})["items"].append(f)
    files = pad_files(launches)
    for key in sorted(pads, key=lambda k: files[k]):
        slug = files[key]
        p = pads[key]
        name = (p["pad"].get("n") or "this pad")
        text = lp.ics_calendar([evs[f["id"]] for f in p["items"]], f"Astro Radar: launches from {name}")
        (base / "pad" / f"{slug}.ics").write_bytes(text.encode("utf-8"))
        written.append(f"calendar/pad/{slug}.ics")

    # providers: every key in providers.json, empty when it has no launch in the feed
    plist = list(providers.values()) if isinstance(providers, dict) else list(providers or [])
    for p in sorted((p for p in plist if isinstance(p, dict) and re.fullmatch(r"[a-z0-9]+", str(p.get("key") or ""))),
                    key=lambda p: p["key"]):
        items = [evs[f["id"]] for f in launches if f.get("prov") == p["key"]]
        text = lp.ics_calendar(items, f"Astro Radar: {p.get('n') or p['key']} launches")
        (base / "provider" / f"{p['key']}.ics").write_bytes(text.encode("utf-8"))
        written.append(f"calendar/provider/{p['key']}.ics")
    return written
