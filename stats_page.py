"""The Statistics page (/stats/), written by launch_pages.build_pages next to the other quiet pages on launch.css (no inline script).

Every number comes from data/history/stats.json, Launch Library 2's own record of the year's flown launches and its yearly totals
(scripts/fetch_history.py, fetched by hand and committed; the page says when). Scrubs come from Launch Library's update notes through
scripts/scrub_stats.py, so they are a floor, shown with their sample size. Nothing is estimated, rounded up or filled in: a group too
small to say anything is shown with its count and no rate. Charts are inline SVG drawn here, with their numbers in the text beside them.
No hyphens in copy (rocket names have theirs made spaces, as elsewhere on the site).
"""
import html
import json
import pathlib
import re
import sys
from collections import Counter
from datetime import datetime

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts"))
import scrub_stats  # noqa: E402

SITE = "https://astroradar.io/"
LL2 = "https://thespacedevs.com/llapi"
WIKI = "https://en.wikipedia.org/wiki/{}_in_spaceflight"
MIN_N = scrub_stats.MIN_N          # the same floor as Go watch's scrub odds: fewer flights than this get no rate
TOP = 10
STATES = (("FL", "Florida"), ("CA", "California"), ("TX", "Texas"))
OK = ("Success",)
FLOWN = ("Success", "Failure", "Partial Failure")
MONTHS = "January February March April May June July August September October November December".split()
e = html.escape


def load(path=None):
    p = pathlib.Path(path) if path else ROOT / "data/history/stats.json"
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def nice(s):
    """hyphens between letters or digits made spaces, as the site does for names from the feed"""
    return re.sub(r"(?<=\w)-(?=\w)", " ", str(s or "")).strip()


def pct(a, b):
    """a percentage with one decimal, from whole counts; never for an empty group"""
    return f"{100 * a / b:.1f}%" if b else ""


def num(n):
    return f"{n:,}"


def day(iso):
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def bars(rows, label, unit="launches", scale=None):
    """a horizontal bar chart: rows of (name, value, mark); the label and number are HTML text at the page's own size, each bar a small SVG
    stretched to its share (an attribute, since the launch pages' policy allows no inline style); marked rows (this year) are brighter"""
    rows = [r for r in rows if r[1] is not None]
    if not rows:
        return ""
    top = scale or max(v for _, v, _ in rows) or 1
    now = ' class="now"'
    items = "".join(
        f'<li><span class="bl">{e(n)}</span><svg class="bb" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">'
        f'<rect{now if mark else ""} width="{max(0.6, 100 * v / top):.1f}" height="10"></rect></svg>'
        f'<span class="bv">{num(v)}</span></li>' for n, v, mark in rows)
    return f'<ul class="bars" aria-label="{e(label)}">{items}</ul>'


def columns(vals, labels, label):
    """a column chart (launches a month): each column a small SVG stretched to its height, its number and month as HTML text"""
    top = max(vals) or 1
    items = "".join(
        f'<li><span class="cv">{v}</span><svg class="cc" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">'
        f'<rect y="{100 - 100 * v / top:.1f}" width="10" height="{100 * v / top:.1f}"></rect></svg><span class="cl">{e(l)}</span></li>'
        for v, l in zip(vals, labels))
    return f'<ol class="cols" aria-label="{e(label)}">{items}</ol>'


def table(head, rows, cls="", label=""):
    """a table in a wrapper that scrolls sideways on a narrow screen; the wrapper is a named region that takes focus, so a keyboard can
    scroll it (axe, scrollable-region-focusable)"""
    return (f'<div class="tw" tabindex="0" role="region" aria-label="{e(label or head[0])}"><table class="st{" " + cls if cls else ""}"><thead><tr>' + "".join(f"<th scope=\"col\">{e(h)}</th>" for h in head)
            + "</tr></thead><tbody>" + "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows) + "</tbody></table></div>")


def group(launches, key):
    """launches, successes and failures (partial failures with them) for each value of key, busiest first"""
    g = {}
    for l in launches:
        k = key(l)
        if not k:
            continue
        s = g.setdefault(k, [0, 0, 0])
        s[0] += 1
        s[1] += l["status"] in OK
        s[2] += l["status"] in ("Failure", "Partial Failure")
    return sorted(g.items(), key=lambda kv: (-kv[1][0], kv[0]))


def pad_label(l):
    """the pad and its place: the first part of Launch Library's location name, or the next part when the first only repeats the pad's
    own name (Rocket Lab Launch Complex 1A, Mahia Peninsula, not Rocket Lab Launch Complex 1A, Rocket Lab Launch Complex 1)"""
    pad = nice(l.get("pad"))
    parts = [nice(x).strip() for x in (l.get("location") or "").split(",") if x.strip()]
    place = next((x for x in parts if x.lower() not in pad.lower() and not pad.lower().startswith(x.lower()[:12])), "")
    return f"{pad}, {place}" if place else pad


def wait(h):
    """hours to fly after a scrub, in hours up to two days and in days after that"""
    return f"{h} h" if h < 48 else f"{round(h / 24)} days"


def rate_cell(n, ok):
    return pct(ok, n) if n >= MIN_N else f'<span class="muted">too few to say</span>'


def body(d):
    y = d["year"]
    L = [l for l in d["launches"] if l.get("status") in FLOWN]
    n = len(L)
    ok = sum(l["status"] in OK for l in L)
    fail = sum(l["status"] == "Failure" for l in L)
    part = sum(l["status"] == "Partial Failure" for l in L)
    sub = sum(bool(l.get("suborbital")) for l in L)
    orb = [l for l in L if not l.get("suborbital")]
    orb_ok = sum(l["status"] in OK for l in orb)
    last = max(l["net"] for l in L) if L else d["fetched"]
    through = day(last)
    fetched = day(d["fetched"])
    cite = lambda extra="": f'<p class="src">Source: <a href="{LL2}" target="_blank" rel="noopener">Launch Library 2</a> (The Space Devs), fetched {fetched}{extra}.</p>'
    out = []
    out.append(f'<p class="sub">Every launch Launch Library 2 records as flown in {y}, through {through}: who flew, from where, how it went and how often a countdown was scrubbed. Numbers only, from the record; nothing estimated.</p>')

    # the year at a glance
    out.append('<dl class="facts sfacts">'
               f'<div><dt>Launches in {y}</dt><dd>{num(n)}<span>through {through}</span></dd></div>'
               f'<div><dt>Succeeded</dt><dd>{num(ok)}<span>{pct(ok, n)} of all launches</span></dd></div>'
               f'<div><dt>Failed</dt><dd>{num(fail)}<span>{"no partial failures" if not part else f"and {num(part)} partial failure" + ("s" if part != 1 else "")}</span></dd></div>'
               f'<div><dt>Orbital attempts</dt><dd>{num(len(orb))}<span>{pct(orb_ok, len(orb))} succeeded; {num(sub)} suborbital flight{"s" if sub != 1 else ""} besides</span></dd></div>'
               '</dl>')
    out.append(cite(f"; {num(n)} launches"))

    # year by year
    yrs = d.get("years") or {}
    rows, chart = [], []
    for yy in sorted(yrs):
        c = yrs[yy]
        if not c.get("all"):
            continue
        rows.append([yy, num(c["all"]), num(c["success"]), num(c["failure"]), num(c["partial"]), pct(c["success"], c["all"])])
        chart.append((yy, c["all"], None))
    rows.append([f"{y} so far", num(n), num(ok), num(fail), num(part), pct(ok, n)])
    chart.append((f"{y} so far", n, True))
    out.append('<h2 id="years">Year by year</h2>')
    out.append(bars(chart, "Launches each year"))
    out.append(table(["Year", "Launches", "Success", "Failed", "Partial", "Rate"], rows, cls="yrs", label="Launches each year"))
    out.append(f'<p class="muted">Launch Library counts suborbital flights such as New Shepard with the rest, so its totals run a little above '
               f'Wikipedia\'s, which counts orbital attempts only (<a href="{WIKI.format(y - 1)}" target="_blank" rel="noopener">{y - 1} in spaceflight</a>). '
               f'A partial failure is not counted as a success.</p>')
    out.append(cite(f"; counts by outcome for {', '.join(sorted(yrs))}"))

    # the months of this year
    per = Counter(int(l["net"][5:7]) for l in L)
    months = list(range(1, max(per) + 1)) if per else []
    if months:
        out.append(f'<h2 id="months">{y}, month by month</h2>')
        out.append(columns([per.get(m, 0) for m in months], [MONTHS[m - 1][:3] for m in months], f"Launches each month of {y}"))
        out.append(f'<p class="muted">Launches each month; {MONTHS[int(last[5:7]) - 1]} through {e(through)}.</p>')

    # by provider, by rocket, by pad
    def ranked(title, ident, key, label):
        g = group(L, key)
        rows = [[e(k), num(v[0]), num(v[2]), rate_cell(v[0], v[1])] for k, v in g[:TOP]]
        rest = g[TOP:]
        out.append(f'<h2 id="{ident}">{title}</h2>')
        out.append(table([label, "Launches", "Failed", "Success rate"], rows, label=title))
        if rest:
            out.append(f'<p class="muted">{num(len(rest))} more with {num(sum(v[0] for _, v in rest))} launches between them. A rate is given only for {MIN_N} launches or more.</p>')
        else:
            out.append(f'<p class="muted">A rate is given only for {MIN_N} launches or more.</p>')
        out.append(cite())

    ranked("By provider", "providers", lambda l: nice(l.get("provider")), "Provider")
    ranked("By rocket", "rockets", lambda l: nice(l.get("rocket")), "Rocket")
    ranked("Busiest pads", "pads", pad_label, "Pad")

    # Florida, California and Texas
    us = [l for l in L if l.get("country") == "USA"]
    rows, chart = [], []
    for code, name in STATES:
        k = [l for l in L if l.get("state") == code]
        rows.append([name, num(len(k)), pct(len(k), n), num(sum(l["status"] in ("Failure", "Partial Failure") for l in k))])
        chart.append((name, len(k), None))
    other_us = [l for l in us if l.get("state") not in [c for c, _ in STATES]]
    rows.append(["Elsewhere in the US", num(len(other_us)), pct(len(other_us), n), num(sum(l["status"] in ("Failure", "Partial Failure") for l in other_us))])
    rows.append(["Outside the US", num(n - len(us)), pct(n - len(us), n), num(sum(l["status"] in ("Failure", "Partial Failure") for l in L if l.get("country") != "USA"))])
    out.append('<h2 id="states">Florida, California and Texas</h2>')
    out.append(bars(chart, "Launches by state"))
    out.append(table(["Where", "Launches", "Share of all", "Failed"], rows, label="Launches by state"))
    out.append('<p class="muted">By the state in Launch Library\'s name for the launch site: Cape Canaveral and Kennedy in Florida, Vandenberg in California, '
               'Starbase and Corn Ranch in Texas.</p>')
    out.append(cite())

    # scrubs
    groups, flown = scrub_stats.stats(L)
    watched = [l for l in L if scrub_stats.one(l)[3]]
    scr = sum(scrub_stats.one(l)[0] for l in watched)
    out.append('<h2 id="scrubs">Scrubs</h2>')
    out.append(f'<p>Of the {num(len(watched))} launches whose countdown Launch Library\'s editors followed in their notes (a GO, a hold, the weather, '
               f'a new T zero, a webcast or a scrub), <b>{num(scr)}</b> were scrubbed at least once before they flew: {pct(scr, len(watched))}.</p>')
    fam = sorted(((k[7:], g) for k, g in groups.items() if k.startswith("family:") and g["n"] >= MIN_N and g["watched"] * 2 >= g["n"]),
                 key=lambda kv: (-kv[1]["n"], kv[0]))
    rows = [[e(nice(k)), num(g["watched"]), num(g["scrubbed"]), pct(g["scrubbed"], g["watched"]),
             (wait(g["retry_h"]) if g.get("retry_h") is not None else '<span class="muted">too few</span>')] for k, g in fam]
    if rows:
        out.append(table(["Rocket family", "Followed", "Scrubbed", "Share", "Typical wait to fly"], rows, label="Scrubs by rocket family"))
    out.append(f'<p class="muted">A scrub is a note with the word scrub before liftoff. The notes are written by people and miss some, so these are a floor; '
               f'Launch Library rarely hears of scrubs in China, which is why only countdowns its editors followed are counted. A family is listed with '
               f'{MIN_N} followed launches or more, half of its launches followed. The typical wait is the median time from the last scrub to liftoff.</p>')
    out.append(cite(f"; update notes on {num(len(L))} launches"))

    # how this is made
    out.append('<h2 id="method">How these numbers are made</h2>')
    out.append('<ul class="guide">'
               f'<li>The launches are Launch Library 2\'s record of {y}: every launch it lists as flown, with its outcome as Launch Library gives it (success, failure or partial failure).</li>'
               f'<li>The yearly totals for {", ".join(sorted(yrs))} are Launch Library\'s own counts by outcome, read the same day.</li>'
               '<li>A launch is suborbital when Launch Library gives its mission the orbit Suborbital; every other launch is an orbital attempt.</li>'
               '<li>Providers, rockets and pads are named as Launch Library names them. Success rates are successes over launches, for groups of '
               f'{MIN_N} launches or more.</li>'
               '<li>Astro Radar keeps a copy of the record and updates it by hand, so the page shows the day it was fetched. '
               f'<a href="/data/">Data sources</a> lists every source the site uses.</li></ul>')
    return "\n".join(out)


def write_all(dist, ctx, page, path=None):
    """Writes /stats/ when the record is there; returns its URL for the sitemap (none when there is no record)"""
    d = load(path)
    if not d or not d.get("launches"):
        return []
    y = d["year"]
    L = [l for l in d["launches"] if l.get("status") in FLOWN]
    desc = (f"Rocket launches in {y} from Launch Library 2's record: {len(L):,} so far, by provider, rocket and pad, success rates, "
            "Florida, California and Texas, and how often countdowns are scrubbed.")
    out = dist / "stats"
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(page("stats", f"Launch statistics {y}", desc, body(d), ctx, here="stats"), encoding="utf-8")
    return [SITE + "stats/"]


CSS = """
/* the Statistics page (stats_page.py): HTML bars and columns with a small stretched SVG each, so their text keeps the page's size */
.bars{list-style:none;margin:18px 0 8px;padding:0;display:grid;gap:8px;max-width:820px}
.bars li{display:grid;grid-template-columns:minmax(120px,240px) minmax(0,1fr) auto;align-items:center;gap:12px}
.bl{color:var(--fg);font-size:16px;overflow-wrap:anywhere}.bv{color:var(--fg);font-size:16px;font-variant-numeric:tabular-nums;min-width:3ch;text-align:right}
.bb{display:block;width:100%;height:22px}.bb rect{fill:var(--cool);opacity:.55}.bb rect.now{opacity:1}
.cols{list-style:none;margin:18px 0 8px;padding:0;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:6px;max-width:820px;align-items:end}
.cols li{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}
.cc{display:block;width:70%;height:150px}.cc rect{fill:var(--cool);opacity:.75}
.cv{font-size:15px;color:var(--fg);font-variant-numeric:tabular-nums}.cl{font-size:14px;color:var(--fg-2)}
.tw{overflow-x:auto;margin:14px 0 6px;max-width:820px}
table.st{border-collapse:collapse;width:100%;font-size:16px;font-variant-numeric:tabular-nums}
table.st th,table.st td{text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}
table.st th{color:var(--fg-2);font-weight:600;font-size:15px}table.st td+td,table.st th+th{text-align:right}
@media (max-width:640px){.bars li{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"l v" "b b";gap:4px 12px}.bl{grid-area:l}.bv{grid-area:v}.bb{grid-area:b;height:16px}
 .cc{height:110px;width:80%}.cv{font-size:14px}.cl{font-size:13px}
 table.st{font-size:15px}table.st th,table.st td{padding:9px 6px 9px 0}table.st th{font-size:14px}table.yrs td:first-child{white-space:nowrap}
 .sfacts{grid-template-columns:1fr 1fr}.sfacts div:nth-child(-n+2){border-top:0}}
/* the year at a glance: the numbers are the point, so they are big */
.sfacts dd{font:600 34px/1.05 'Barlow Condensed','Barlow Condensed Fallback',sans-serif;letter-spacing:.01em}
.sfacts dd span{margin-top:6px}
"""
