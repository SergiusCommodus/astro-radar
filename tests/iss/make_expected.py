"""The known passes for tests/iss.test.mjs, computed with Skyfield (an independent implementation: its own SGP4 and ephemeris) from the
saved ISS elements in tests/iss/tle.txt. Run it again only when tle.txt is replaced:
    pip install skyfield && python3 tests/iss/make_expected.py > tests/iss/expected.json
Each pass: rise and set over 10 degrees and the highest point (UTC, degrees); visible means the station is sunlit at some moment of the
pass while the sun is 6 degrees or more below the observer's horizon, for at least a minute (six 10 s samples), as ORB.issPasses counts it."""
import json
import pathlib

from skyfield.api import EarthSatellite, load, wgs84

HERE = pathlib.Path(__file__).resolve().parent
lines = [l.rstrip() for l in (HERE / "tle.txt").read_text().splitlines() if l.strip()]
ts = load.timescale()
eph = load("de421.bsp")
sat = EarthSatellite(lines[1], lines[2], lines[0].strip(), ts)
PLACES = {"33130": (25.7743, -80.1937), "10001": (40.7506, -73.9972)}
t0 = ts.utc(2026, 11, 8, 12)
t1 = ts.utc(2026, 11, 11, 12)
out = {"from": "2026-11-08T12:00:00Z", "hours": 72, "places": {}}
for zip_code, (lat, lon) in PLACES.items():
    obs = wgs84.latlon(lat, lon)
    t, ev = sat.find_events(obs, t0, t1, altitude_degrees=10.0)
    passes, cur = [], None
    for ti, e in zip(t, ev):
        if e == 0:
            cur = {"rise": ti}
        elif e == 1 and cur is not None:
            cur["max_t"] = ti
            cur["max"] = (sat - obs).at(ti).altaz()[0].degrees
        elif e == 2 and cur is not None:
            cur["set"] = ti
            # visible: sample the pass every 10 s
            n = max(2, int(round((cur["set"] - cur["rise"]) * 86400 / 10)) + 1)
            samples = ts.linspace(cur["rise"], cur["set"], n)
            sunlit = sat.at(samples).is_sunlit(eph)
            sun_alt = (eph["earth"] + obs).at(samples).observe(eph["sun"]).apparent().altaz()[0].degrees
            vis = sum(1 for s, a in zip(sunlit, sun_alt) if s and a <= -6) >= 6
            if "max_t" in cur:
                passes.append({"rise": cur["rise"].utc_strftime("%Y-%m-%dT%H:%M:%SZ"), "max_t": cur["max_t"].utc_strftime("%Y-%m-%dT%H:%M:%SZ"),
                               "set": cur["set"].utc_strftime("%Y-%m-%dT%H:%M:%SZ"), "max": round(cur["max"], 1), "vis": vis})
            cur = None
    out["places"][zip_code] = {"lat": lat, "lon": lon, "passes": passes}
print(json.dumps(out, indent=1))
