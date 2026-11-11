"""Provider pages: /provider/ (every provider in data/providers.json with its launches in the feed) and /provider/<key>/ (one provider:
its one line description, its official links, its launches in the next 30 days and its flights of the last 7). Written by
launch_pages.build_pages on launch.css with no inline script. Everything shown comes from providers.json (links checked by
scripts/check_providers.sh) or the feed; a provider with no verified links says so instead of guessing one. No hyphens in copy."""
import html
import json
from datetime import datetime

SITE = "https://astroradar.io/"


def _when(f):
    try:
        return datetime.fromisoformat(str(f["utc"]).replace("Z", "+00:00"))
    except (KeyError, TypeError, ValueError):
        return None


def _rows(items, ctx, kind):
    """One line per launch: the short name (to its launch page), the rocket and pad, the time in UTC (launch.js adds the visitor's own)."""
    e = html.escape
    out = []
    for f, when in items:
        utc_txt, _ = ctx["when_lines"](when, f.get("tz"), ctx["when_text"])
        pad = (f.get("pad") or {}).get("n") or "Pad not announced yet"
        if kind == "up":
            st = ctx["STATUS"].get(f.get("st"), "Scheduled")
        else:
            st = ctx["RESULT"].get(f.get("res"), "Flown")
        out.append(f'<li><span class="t"><a href="/launch/{e(f["id"])}/">{e(ctx["short_name"](f.get("mis"), f.get("veh")))}</a>'
                   f'<span>{e(f["veh"])} · {e(pad)} · {e(st)}</span>'
                   f'<span><time datetime="{when.strftime("%Y-%m-%dT%H:%M:%SZ")}" data-local>{e(utc_txt)}</time></span></span></li>')
    return '<ul class="ul">' + "".join(out) + "</ul>"


def launches_of(feed, key, now):
    """(upcoming, recent) for one provider key, each a list of (launch, time) in time order; launches with a page only."""
    up, past = [], []
    for kind, items in (("up", feed.get("launches") or []), ("past", feed.get("recent") or [])):
        for f in items:
            if not isinstance(f, dict) or f.get("prov") != key or not (f.get("id") and f.get("mis") and f.get("veh")):
                continue
            when = _when(f)
            if when is None:
                continue
            (up if kind == "up" else past).append((f, when))
    up.sort(key=lambda x: x[1])
    past.sort(key=lambda x: x[1], reverse=True)
    return up, past


def _links(p):
    e = html.escape
    acts = []
    if p.get("live"):
        acts.append(f'<a class="btn pri" href="{e(p["live"])}" target="_blank" rel="noopener">Live page<small>{e(p.get("liveSrc") or "")}</small></a>')
    if p.get("site"):
        acts.append(f'<a class="btn" href="{e(p["site"])}" target="_blank" rel="noopener">Website</a>')
    if p.get("social"):
        acts.append(f'<a class="btn" href="{e(p["social"])}" target="_blank" rel="noopener">Social</a>')
    if not acts:
        return '<p class="muted">No official links could be verified for this provider, so none are shown.</p>'
    return '<div class="acts">' + "".join(acts) + "</div>"


def provider_page(p, feed, ctx, page):
    e = html.escape
    up, past = launches_of(feed, p["key"], ctx["now"])
    n = p["n"]
    chip = ctx["logo"]({"prov": p["key"]})
    body = (f'<p class="pv">{chip}</p>\n' + (f'<p class="sub">{e(p["d"])}</p>\n' if p.get("d") else "") + _links(p) + "\n"
            f"<h2>Next 30 days</h2>\n" + (_rows(up, ctx, "up") if up else f"<p>No {e(n)} launches are listed in the next 30 days right now.</p>") + "\n")
    if past:
        body += "<h2>Flown in the last 7 days</h2>\n" + _rows(past, ctx, "past") + "\n"
    body += ("<p>Every launch here is on <a href=\"/#launches\">the radar</a>, with the countdown, the official webcast and whether you could "
             "see it from your ZIP code. Watching with friends? <a href=\"/astro/\">Make it a plan on Astro</a>.</p>\n"
             f'<p class="muted">Launch times and status from Launch Library 2, as of {e(ctx["generated"])}. {e(n)} links are its own official pages. '
             "Astro Radar is independent and is not affiliated with or endorsed by any launch provider.</p>\n")
    count = len(up)
    desc = (f"{n} rocket launches: {count} in the next 30 days" if count else f"{n} rocket launches") + \
        ", with times, the official webcast and where to look from your ZIP code."
    org = {"@context": "https://schema.org", "@type": "Organization", "name": n}
    same = [u for u in (p.get("site"), p.get("social")) if u]
    if p.get("site"):
        org["url"] = p["site"]
    if same:
        org["sameAs"] = same
    ld = '<script type="application/ld+json">' + json.dumps(org, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>\n"
    return page("provider/" + p["key"], n + " launches", desc, body, ctx, script=True, here="providers", head=ld)


def index_page(providers, feed, ctx, page):
    e = html.escape
    rows = []
    for p in providers:
        up, past = launches_of(feed, p["key"], ctx["now"])
        ahead = [(f, w) for f, w in up if f.get("st") != "flight" and w > ctx["now"]]
        nxt = ""
        if ahead:
            f, when = ahead[0]
            utc_txt, _ = ctx["when_lines"](when, f.get("tz"), ctx["when_text"])
            nxt = f'<span>Next: {e(ctx["short_name"](f.get("mis"), f.get("veh")))}, {e(utc_txt)}</span>'
        cnt = f"{len(up)} {'launch' if len(up) == 1 else 'launches'} in 30 days" if up else "No launches listed in 30 days"
        rows.append((-len(up), p["n"], f'<li><span class="t"><a href="/provider/{e(p["key"])}/">{e(p["n"])}</a><span>{cnt}</span>{nxt}</span>'
                     f'{ctx["logo"]({"prov": p["key"]})}</li>'))
    rows.sort(key=lambda r: (r[0], r[1]))
    body = ("<p class=\"sub\">Every launch provider on Astro Radar, those with launches in the next 30 days first. Each page has the provider's "
            "official links and its launches.</p>\n<ul class=\"ul prov\">" + "".join(r[2] for r in rows) + "</ul>\n"
            "<p class=\"muted\">Launches by other providers are on <a href=\"/#launches\">the radar</a> too. Logos and names are trademarks of their "
            "owners, shown only to identify the provider.</p>\n")
    return page("provider", "Launch providers", "Every rocket launch provider on Astro Radar, its official links and its launches in the next 30 days.",
                body, ctx, here="providers")


def write_all(dist, providers, feed, ctx, page):
    """Writes /provider/ (the index) and one page per provider in providers.json; returns their URLs for the sitemap."""
    import shutil
    base = dist / "provider"
    if base.exists():
        shutil.rmtree(base)
    out = []
    base.mkdir()
    (base / "index.html").write_text(index_page(providers, feed, ctx, page), encoding="utf-8")
    out.append(SITE + "provider/")
    for p in providers:
        if not p.get("key") or not p.get("n"):
            continue
        d = base / p["key"]
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(provider_page(p, feed, ctx, page), encoding="utf-8")
        out.append(f"{SITE}provider/{p['key']}/")
    return out
