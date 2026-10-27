"""Write a mock Launch Library 2 response with every provider type, for testing the feed and the page without the API.

Usage: python3 tests/make_mock_ll2.py OUT.json
Then:  python3 scripts/fetch_launches.py dist/launches.json --from-file OUT.json

Launch times are set relative to now, so the page shows them as upcoming. The mock covers official webcasts on X, YouTube,
NASA+ and another site, a fan restream that must be skipped, launches with no stream, a pad that is not picked yet,
suborbital flights, a provider outside data/providers.json, and launch sites from Alaska to New Zealand. One launch sits
past the 30 day window and one in the past; neither may reach the feed.
"""
import json
import sys
from datetime import datetime, timedelta, timezone


def vid(url, publisher, kind="Official Webcast", priority=10, lang="en"):
    return {"url": url, "publisher": publisher, "type": {"name": kind}, "priority": priority,
            "language": {"code": lang}, "source": url.split("/")[2]}


# hours from now, provider, rocket, mission, orbit, status, pad, lat, lon, location, webcasts
L = [
    (5, "SpaceX", "Falcon 9", "Starlink Group 12-7", "Low Earth Orbit", "Go", "Space Launch Complex 40", 28.5618, -80.5772,
     "Cape Canaveral SFS, FL, USA", [vid("https://www.youtube.com/watch?v=fanstream1", "Space Fan TV", "Unofficial Re-stream", 9),
                                      vid("https://x.com/i/broadcasts/1mockSpaceX", "SpaceX")]),
    (20, "Blue Origin", "New Shepard", "NS-38", "Suborbital", "Go", "Launch Site One", 31.4229, -104.7570,
     "West Texas Suborbital Launch Site/ Corn Ranch, TX, USA", []),
    (31, "Indian Space Research Organization", "PSLV-XL", "PSLV-C62 | EOS-N1", "Sun-Synchronous Orbit", "Go",
     "First Launch Pad", 13.7199, 80.2304, "Satish Dhawan Space Centre, India",
     [vid("https://www.youtube.com/watch?v=isromock01", "ISRO Official")]),
    (44, "Rocket Lab", "Electron", "The Mountain God Rises", "Low Earth Orbit", "TBD", "Unknown Pad", -39.260881, 177.865826,
     "Rocket Lab Launch Complex 1, Mahia Peninsula, New Zealand", []),
    (58, "National Aeronautics and Space Administration", "Space Launch System (SLS)", "Artemis II", "Lunar flyby", "Hold",
     "Launch Complex 39B", 28.6272, -80.6208, "Kennedy Space Center, FL, USA",
     [vid("https://plus.nasa.gov/scheduled-video/artemis-ii-launch/", "NASA")]),
    (70, "Arianespace", "Ariane 64", "Kuiper KA-04", "Low Earth Orbit", "Go", "Ensemble de Lancement Ariane 4", 5.2620, -52.7869,
     "Guiana Space Centre, French Guiana", [vid("https://www.youtube.com/watch?v=arianefr01", "Arianespace", lang="fr", priority=10),
                                            vid("https://www.youtube.com/watch?v=arianeen01", "Arianespace", priority=9)]),
    (83, "Mitsubishi Heavy Industries", "H3-22S", "HTV-X2", "Low Earth Orbit", "Go", "Yoshinobu Launch Complex", 30.4009, 130.9750,
     "Tanegashima Space Center, Japan", [vid("https://www.youtube.com/watch?v=jaxamock01", "JAXA")]),
    (95, "United Launch Alliance", "Vulcan VC4S", "USSF-106", "Geostationary Transfer Orbit", "TBC", "Space Launch Complex 41",
     28.5833, -80.5829, "Cape Canaveral SFS, FL, USA", [vid("https://www.youtube.com/watch?v=ulamock001", "United Launch Alliance")]),
    (110, "Russian Federal Space Agency (ROSCOSMOS)", "Soyuz 2.1a", "Progress MS-33", "Low Earth Orbit", "Go", "31/6", 45.996, 63.564,
     "Baikonur Cosmodrome, Republic of Kazakhstan", [vid("https://vk.com/video-mockroscosmos", "Roscosmos", lang="ru")]),
    (130, "China Aerospace Science and Technology Corporation", "Long March 5", "Tianzhou 10", "Low Earth Orbit", "Go",
     "Wenchang Space Launch Site LC-101", 19.6145, 110.9510, "Wenchang Space Launch Site, People's Republic of China",
     [vid("https://www.youtube.com/watch?v=cnfan00001", "Fan channel", "Unofficial Re-stream", 8)]),
    (150, "Rocket Lab", "Electron", "Wallops rideshare", "Low Earth Orbit", "Go", "Launch Complex 2", 37.8338, -75.4881,
     "Wallops Island, VA, USA", [vid("https://www.youtube.com/watch?v=rlmock0001", "Rocket Lab")]),
    (175, "Northrop Grumman Space Systems", "Minotaur IV", "NROL-174", "Low Earth Orbit", "TBC", "Space Launch Complex 8",
     34.5763, -120.6325, "Vandenberg SFB, CA, USA", []),
    (200, "Firefly Aerospace", "Firefly Alpha", "FLTA007", "Sun-Synchronous Orbit", "Go", "Space Launch Complex 2W",
     34.7556, -120.6224, "Vandenberg SFB, CA, USA", [vid("https://x.com/i/broadcasts/1mockFirefly", "Firefly Aerospace")]),
    (230, "SpaceX", "Starship", "Flight 12", "Suborbital", "TBC", "Orbital Launch Mount B", 25.9972, -97.1560,
     "Starbase, TX, USA", [vid("https://x.com/i/broadcasts/1mockStarship", "SpaceX")]),
    (260, "Blue Origin", "New Glenn", "Blue Moon MK1", "Lunar Transfer Orbit", "TBC", "Launch Complex 36", 28.4713, -80.5378,
     "Cape Canaveral SFS, FL, USA", [vid("https://www.youtube.com/watch?v=bomock0001", "Blue Origin")]),
    (290, "European Space Agency", "Vega C", "Smile", "Low Earth Orbit", "TBD", "Ensemble de Lancement Vega", 5.2366, -52.7751,
     "Guiana Space Centre, French Guiana", []),
    (320, "Rocket Lab", "Neutron", "Neutron demo flight", "Low Earth Orbit", "TBD", "Launch Complex 3", 37.8312, -75.4884,
     "Wallops Island, VA, USA", []),
    (350, "Relativity Space", "Terran R", "Terran R first flight", "Low Earth Orbit", "TBD", "Launch Complex 16", 28.5017, -80.5566,
     "Cape Canaveral SFS, FL, USA", []),
    (380, "Stoke Space", "Nova", "Nova first flight", "Low Earth Orbit", "TBD", "Launch Complex 14", 28.4911, -80.5471,
     "Cape Canaveral SFS, FL, USA", []),
    (410, "Russian Federal Space Agency (ROSCOSMOS)", "Angara 1.2", "Kosmos", "Low Earth Orbit", "Hold", "Angara launch pad",
     51.884, 128.333, "Vostochny Cosmodrome, Russian Federation", []),
    (440, "Indian Space Research Organization", "LVM3", "Gaganyaan G1", "Low Earth Orbit", "TBC", "Second Launch Pad",
     13.7337, 80.2350, "Satish Dhawan Space Centre, India", []),
    (470, "Isar Aerospace", "Spectrum", "Spectrum flight 2", "Sun-Synchronous Orbit", "TBD", "Andoya launch pad", 69.2945, 16.0207,
     "Andøya Spaceport, Norway", []),
    (500, "National Aeronautics and Space Administration", "Black Brant IX", "Sounding rocket campaign", "Suborbital", "Go",
     "Launch Complex 36", 32.4174, -106.3198, "White Sands Missile Range, NM, USA", []),
    (530, "Astra", "Rocket 4", "Rocket 4 demo", "Low Earth Orbit", "TBD", "Launch Pad 3B", 57.4356, -152.3378,
     "Pacific Spaceport Complex, AK, USA", []),
    (560, "China Aerospace Science and Technology Corporation", "Long March 2D", "Yaogan", "Sun-Synchronous Orbit", "TBC",
     "Launch Area 94", 40.958, 100.291, "Jiuquan Satellite Launch Center, People's Republic of China", []),
    (30 * 24 + 30, "SpaceX", "Falcon 9", "Past the window", "Low Earth Orbit", "Go", "Space Launch Complex 40", 28.5618, -80.5772,
     "Cape Canaveral SFS, FL, USA", []),
    (-2, "SpaceX", "Falcon 9", "Already flown", "Low Earth Orbit", "Go", "Space Launch Complex 40", 28.5618, -80.5772,
     "Cape Canaveral SFS, FL, USA", []),
]


def main(out):
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    res = []
    for i, (h, lsp, rocket, mission, orbit, status, pad, lat, lon, loc, vids) in enumerate(L):
        res.append({
            "id": f"mock{i:02d}", "name": f"{rocket} | {mission}", "status": {"abbrev": status},
            "net": (now + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ"), "probability": 80 if status == "Go" else None,
            "launch_service_provider": {"name": lsp, "info_url": "https://www.isaraerospace.com/" if lsp == "Isar Aerospace" else None},
            "rocket": {"configuration": {"name": rocket, "family": rocket.split()[0]}},
            "mission": {"name": mission, "orbit": {"name": orbit, "abbrev": ""}},
            "pad": {"id": 900 + i, "name": pad, "latitude": str(lat), "longitude": str(lon), "location": {"name": loc}},
            "vidURLs": vids, "infoURLs": [],
        })
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"count": len(res), "results": res}, f, ensure_ascii=False, indent=1)
    print(f"wrote {len(res)} mock launches to {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "mock_ll2.json")
