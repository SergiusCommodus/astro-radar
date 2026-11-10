# Real Earth: sources, rights and research

The hero's and the footer's planet are full resolution photographs of Earth taken by astronauts on the International Space Station,
cut and graded by `scripts/make_earth_stills.py`. The globe card's launch areas (`areas/`) are NASA satellite imagery from GIBS, made
by `scripts/make_areas.py`. Credit on the page (footer): "Earth photographs: NASA Johnson Space Center, from the International Space
Station. Launch areas: NASA GIBS (MODIS, VIIRS)."

## Rights

NASA's media guidelines (https://www.nasa.gov/nasa-brand-center/images-and-media/) say NASA material is not protected by copyright
unless noted, and may be reproduced without permission; it may not be used to imply endorsement. The Gateway to Astronaut Photography
FAQ (https://eol.jsc.nasa.gov/FAQ/default.htm) asks for the credit "Image courtesy of the Earth Science and Remote Sensing Unit, NASA
Johnson Space Center". Every photograph listed as usable below is NASA authored (JSC, ISS crew photography), with no copyright,
creator or third party credit field in its record (checked in each image's `metadata.json` on images-assets.nasa.gov: no
EXIF Copyright, XMP Rights, IPTC CopyrightNotice, Artist or By-line). Nothing credited to ESA, JAXA, Roscosmos or a private
photographer was used. GIBS imagery is NASA Earth science data, free to use with no restriction under the EOSDIS data use policy
(https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance); NASA asks for an acknowledgement, given
in the footer and in the card's caption (the satellite and the day).

## Photographs (checked 2026-11-10)

Searched the NASA Image and Video Library (images-api.nasa.gov, media type image: "earth limb space station", "earth horizon atmosphere
space station", "sunrise space station earth", "aurora space station", "city lights space station night"; about 930 hits, 72 looked at
on contact sheets) and checked the Gateway to Astronaut Photography (eol.jsc.nasa.gov) for the same frames: where EOL has the frame
(ISS064-E-2894, ISS064-E-24075) its "large" JPEG is byte for byte the library's original, so the library's `~orig.jpg` is the full
camera JPEG. Every listed frame is a Nikon JPEG at quality about 92 (quantization 6, 4, 7), sharp at 100 percent.

| # | Frame | Link | Pixels, camera | What | Credit, rights | Verdict |
|---|-------|------|----------------|------|----------------|---------|
| 1 | ISS074-E-89803 (16 Jan 2026) | https://images.nasa.gov/details/iss074e0089803 | 4928 by 2768, Nikon D4 | the thin blue atmosphere over a partly cloudy Pacific west of Chile, the sun's glint on the sea, black space above | NASA JSC, public domain, no other credit | **Hero** |
| 2 | ISS073-E-246858 (9 Jun 2025) | https://images.nasa.gov/details/iss073e0246858 | 8256 by 5504, Nikon Z 9 | a bright green aurora australis over a moonlit, cloudy southern Indian Ocean | NASA JSC, public domain | **Footer** (the station's hardware along the top edge is cut off: the crop starts 1430 rows down, below the lowest part) |
| 3 | ISS064-E-2894 (1 Nov 2020) | https://images.nasa.gov/details/iss064e002894 | 5568 by 3712, Nikon D5 | the limb, the sun's glint on the Gulf of California | NASA JSC, public domain | Not used: a truss along the top; crops clean, but the hero already has a glint scene |
| 4 | ISS064-E-2872 (1 Nov 2020) | https://images.nasa.gov/details/iss064e002872 | 5568 by 3712, Nikon D5 | the limb, glint off the Pacific and San Francisco Bay | NASA JSC, public domain | Not used: hardware in the top right corner, the planet small in the frame |
| 5 | ISS064-E-24075 (18 Jan 2021) | https://images.nasa.gov/details/iss064e024075 | 5568 by 3712, Nikon D5 | aurora and airglow over the North Atlantic, clean frame | NASA JSC, public domain | Reserve for the footer: a long exposure, the clouds below are dim and smeared |
| 6 | ISS065-E-334875 (28 Aug 2021) | https://images.nasa.gov/details/iss065e334875 | 5568 by 3712, Nikon D5 | airglow over the Pacific southeast of Japan, clean | NASA JSC, public domain | Not used: night side too dark behind the hero copy |
| 7 | ISS071-E-207178 (23 Jun 2024) | https://images.nasa.gov/details/iss071e207178 | 8256 by 5504, Nikon Z 9 | a golden glow over the South Pacific | NASA JSC, public domain | Not used: a solar array fills the right third |
| 8 | ISS072-E-724819 (5 Mar 2025) | https://images.nasa.gov/details/iss072e724819 | 8256 by 5504, Nikon Z 9 | airglow over the Pacific at night, clean | NASA JSC, public domain | Not used: mostly black, little of the planet |
| 9 | ISS063-E-58409 (24 Jul 2020) | https://images.nasa.gov/details/iss063e058409 | 5568 by 3712, Nikon D5 | the Milky Way over an exaggerated airglow | NASA JSC, public domain | Not used: the record calls the glow exaggerated (long exposure) |
| 10 | ISS059-E-461 (16 Mar 2019) | https://images.nasa.gov/details/iss059e000461 | 5568 by 3712, Nikon D5 | the Moon above a flat cloud limb | NASA JSC, public domain | Not used: a flat horizon, no dome; the Moon would sit behind the copy |
| 11 | ISS070-E-34016 (30 Nov 2023) | https://images.nasa.gov/details/iss070e034016 | 5568 by 3712, Nikon D5 | the setting Moon refracted by the atmosphere | NASA JSC, public domain | Not used: same reason |
| 12 | ISS061-E-123823 (12 Jan 2020) | https://images.nasa.gov/details/iss061e123823 | 5568 by 3712, Nikon D5 | the first rays of an orbital sunrise on the limb | NASA JSC, public domain | Not used: a thin line of light; no planet to show |
| 13 | ISS072-E-159516 (30 Oct 2024) | https://images.nasa.gov/details/iss072e159516 | 8256 by 5504, Nikon Z 9 | the aurora borealis over Ontario into sunrise | NASA JSC, public domain | Not used: station hardware across the top that does not crop out |
| 14 | ISS073-E-35898 (20 Apr 2025) | https://images.nasa.gov/details/iss073e0035898 | 8256 by 5504, Nikon Z 9 | airglow and aurora over the Southern Ocean | NASA JSC, public domain | Not used: the record says a spacecraft is silhouetted in the foreground |
| 15 | ISS058-E-5282 (19 Jan 2019) | https://images.nasa.gov/details/iss058e005282 | 5568 by 3712, Nikon D5 | an aurora over city lights | NASA JSC, public domain | Not used: solar arrays cap the frame |
| 16 | ISS073-E-761799 (6 Sep 2025) | https://images.nasa.gov/details/iss073e0761799 | 8256 by 5504, Nikon Z 9 | a wispy aurora as sunrise begins | NASA JSC, public domain | Not used: hardware at the left and bottom |
| 17 | ISS073-E-257194 (28 Jun 2025) | https://images.nasa.gov/details/iss073e0257194 | 8256 by 5504, Nikon Z 9 | noctilucent clouds over the North Pacific | NASA JSC, public domain | Not used: a thin band, mostly black |
| 18 | ISS062-E-5412 (12 Feb 2020) | https://images.nasa.gov/details/iss062e005412 | 5568 by 3712, Nikon D5 | noctilucent clouds over a sunset limb | NASA JSC, public domain | Not used: a flat band, no dome |

Night city lights: every clean city lights frame found was a top down view with no horizon (it would sit behind the copy with nothing
to anchor it) or carried station hardware; none is used. Rejected without listing: frames where Dragon, Cygnus, Soyuz, the robotic arm or
a truss crosses the planet.

## The cuts

| File | From | Crop in the original (x0, y0, x1, y1) | Output |
|------|------|------|------|
| `hero-wide.*` | #1 | 342, 953, 4587, 2744 (the dome with its rim 30 percent down, as the page's band expects) | 2560 by 1080 and 3840 by 1620 (`hero-wide-3840.*`, for wide screens at 1.5 device pixels and up, by srcset) |
| `hero-phone.*` | #1 | 1675, 953, 3466, 2744 (a square on the glint) | 1200 by 1200 |
| `foot-wide.*` | #2 | 0, 1430, 8256, 4526 | 2560 by 960 |
| `foot-phone.*` | #2 | 3700, 1700, 8000, 4456 (the brightest stretch of the aurora) | 1080 by 692 |

Each is resized in linear light (Lanczos), the shadows of space crushed (below 3.5 percent black for the hero, 2 percent for the footer,
which also hides the faint lens ghosts in #1's black sky), its top rows faded into the page color (27 and 42 percent of the height),
dithered by one step (so the rim and the dark fade do not band in 8 bits) and saved as AVIF (quality 60) and WebP (86). Never invent a
place: the place names above are the ones in NASA's own records.

| File | AVIF | WebP |
|------|------|------|
| hero-wide-3840 | 325 KB | 497 KB |
| hero-wide | 172 KB | 283 KB |
| hero-phone | 92 KB | 153 KB |
| foot-wide | 198 KB | 341 KB |
| foot-phone | 40 KB | 81 KB |

A visitor downloads one hero file (the phone's 92 KB AVIF, or 172 KB on a desktop) and, near the footer, one footer file, against
0.5 to 3.8 MB of video for the films they replace.

## Is there a sharper original of the Earth Views video?

The 2021 Earth Day reel we used (jsc2021m000138) is a 3840 by 2160 H.264 delivery at 41 Mbps. The NASA library has two more 4K reels
from JSC, both public domain:

| Reel | Link | Pixels, codec | Bitrate | Notes |
|------|------|---------------|---------|-------|
| Earth from Space in 4K, Expedition 65 (jsc2022m000172) | https://images.nasa.gov/details/jsc2022m000172_Earth_in_4K_Expedition_65_Edition | 4096 by 2160, H.264 | 11.1 Mbps | softer than ours |
| Earth in 4K, Expedition 67 and 68 (jsc2023m000111) | https://images.nasa.gov/details/jsc2023m000111_Earth_in_4K_Space_Station_Expedition_67_68_Edition | 4176 by 2784, H.264 Main 4:2:0 | 107 Mbps (39 GB) | the sharpest video NASA publishes: at 100 percent a frame's centre measures 15 to 530 on a Laplacian variance test, against 28 for our cut, but many shots carry solar arrays or the arm |

No camera original (ProRes or raw) of any reel is published. Even the 107 Mbps reel is a 4:2:0 delivery file, and its best frames are
softer at 100 percent than a single Nikon JPEG, so the page uses photographs; the 67 and 68 reel is the source to use if motion video
comes back.

The earlier footage research (the reel used in pull request 44 and the night and aurora videos, all 720p or carrying hardware):

### Video candidates (checked 2026-11-10)

| # | Clip | Where | Resolution, length | Rights and credit | Verdict |
|---|------|-------|-------|-------|-------|
| 1 | 4K Earth Views Extended Cut for Earth Day 2021 (jsc2021m000138) | https://images.nasa.gov/details/jsc2021m000138_4K_Earth_Views_Extended_Cut_for_Earth_Day_%202021_210422-4KMP4 | 3840 by 2160, 29.97 fps, 52 min 34 s, H.264 41 Mbps (15.5 GB) | NASA JSC, public domain, recorded from the ISS 2019 to 2020; no creator or copyright fields | Used in pull request 44, now replaced |
| 2 | Earth Views from the ISS, No Music (NHQ_2020_1221) | https://images.nasa.gov/details/NHQ_2020_1221_Earth%20Views | 1280 by 720, 59.94 fps, 44 min | NASA HQ, public domain | Not used: 720p |
| 3 | Earth Views from the ISS (NHQ_2019_0626) | https://images.nasa.gov/details/NHQ_2019_0626_Earth%20Views%20from%20the%20ISS | 1280 by 720, 59.94 fps, 44 min | NASA HQ, public domain | Not used: 720p |
| 4 | Earth Views from the International Space Station (HDEV) | https://images.nasa.gov/details/Earth%20Views%20from%20the%20International%20Space%20Station | 1280 by 720, 59.94 fps, 3 min 20 s | NASA HQ, HDEV camera, public domain | Not used: 720p, and HDEV is an ESA hosted platform, so kept out to be safe |
| 5 | North America at Night, Expedition 59 (frames ISS059-E-59667 to 59951) | https://eol.jsc.nasa.gov/BeyondThePhotography/CrewEarthObservationsVideos/ | video 1080 by 720 at 25 fps, 35 s; stills 5568 by 3712 (285 frames) | NASA JSC Earth Science and Remote Sensing Unit; credit line above | Not used: a Dragon capsule and station hardware sit on the horizon in every frame, and the 1 s exposures smear the city lights |
| 6 | Aurora, Expedition 60 (Aurora_ISS060_2019-08) | same page | 1080 by 720, 25 fps, 24 s | same | Not used: 720p video; stills carry hardware |
| 7 | Northern Lights, Expedition 61 (NorthernLights_ISS061_2019-11) | same page | 1080 by 720, 29.97 fps, 59 s | same | Not used: 720p, dark limb only |
| 8 | Canada at night with aurora and sunrise (Canada-night_2018-09, ISS056-E-179403 to 180719) | same page | 1080 by 720, 29.97 fps; stills 5568 by 3712 | same | Not used: the station's arm crosses the sunrise; a strong candidate for a night footer if a clean stretch is found |
| 9 | East Coast at night, Expedition 61 | same page | 1080 by 720, 48 s | same | Not used: no horizon in frame |
| 10 | Europe at night, Expedition 61 | same page | 1080 by 720, 73 s | same | Not used: mostly dark, no horizon |
| 11 | ICON and GOLD airglow pieces (GSFC) | images.nasa.gov | 1920 by 1080 | NASA GSFC, but mixed with animation and narration | Not used: not footage of the limb |

Searched: images-api.nasa.gov (media_type video: "earth views", "time lapse", "space station earth", "aurora", "night lights",
"earth from orbit", "4K") and the Crew Earth Observations video catalogue (135 time lapses). Nothing credited to ESA, JAXA or a
private photographer was downloaded.

## The slow motion (research and decision)

A still has to feel alive without looking fake, at 60 frames a second on a phone. Tried and decided:

- **Pan and zoom: used.** The whole picture eases between full size and 4.5 percent larger with a 1.1 percent sideways drift, 70 s each
  way (the footer 90 s, offset). A CSS animation of `transform` on the picture's own layer: the compositor runs it, the main thread does
  nothing, and Chrome rasterizes the layer once at its largest scale, so it stays sharp (no per frame resampling of a downscaled image).
  It pauses while the hero or the footer is off screen and is off with reduced motion.
- **Parallax cloud layer: rejected.** Splitting the clouds from the sea by brightness leaves the clouds' own copy in the base, so any
  relative motion tears a bright edge along every cloud, worst in the glint.
- **Light drift (a moving sheen on the glint): rejected.** Without blend modes (which the hero must not use) a sheen is a white
  overlay, which reads as fog.
- **Grain: rejected as animation.** Animated grain softens a sharp photo and costs a full screen layer; a one step dither is baked into
  the files instead, which is all the banding needed.

## Launch areas from space (research and decision)

The card opens on the launch site from space and zooms out to the globe as the rocket lifts off. Options in GIBS
(https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml):

| Layer | Pixel | Coverage | Verdict |
|-------|-------|----------|---------|
| MODIS Terra and Aqua corrected reflectance, true color (daily) | 250 m | global, daily, with clouds and gaps between swaths | **Used**, the clearest day per site |
| VIIRS NOAA-20 corrected reflectance, true color (daily) | 250 m (375 m sensor) | the same | **Used** as a third choice |
| Blue Marble Next Generation (monthly, 2004) | 500 m | global, cloud free | Not used: soft at the card's zoom and 20 years old (no Starbase) |
| Landsat WELD true color (annual, 2000s) | 31 m | GetMap returned an empty tile for Florida | Not used |
| HLS Landsat and Sentinel-2 (30 m) | 31 m | scene by scene, clouds, gaps | Not used: a mosaic of days would be invented imagery |

How: for each of 31 sites (`AREAS` in the script) a 256 km square in latitude and longitude (equal km sides) is read from GIBS's cached WMTS tiles (EPSG:4326, the 250m matrix set; its WMS renders each request on demand and was about fifty times slower): 128 px copies at level 5 (about 2 km a pixel) for every third day of the last 120 days on each satellite, scored by cloud (white, unsaturated) and missing data, the centre counted double; the clearest single day is then stitched from level 8 tiles (250 m) and saved at 1024 by 1024, WebP 80. Each is 19 to 274 KB (the tropics, full of small fair weather clouds, are the largest), 2.5 MB for all 31 in the repository. The clearest day is still not always clear: Andøya, this late in its season, is mostly cloud, and Wallops is hazy. A visitor downloads only the one for the launch on show, after the globe has loaded; the
service worker keeps it for offline use. The page never mixes days and never fills a gap: the caption gives the satellite and the
date. Run the script again now and then (the imagery is a day, not a live view; it ages but stays true).

## Why the hero rocket stuttered and vanished (pull request 44)

Measured with Chrome on a 1440 by 900 desktop and an emulated 390 by 844 iPhone at 4x CPU slowdown, 45 s each, with a frame log, a
long task observer and a hero screenshot every 1.5 s:

- The frame rate itself was steady here (desktop: the launch drawn every frame; phone: 24 draws a second, no long tasks).
- **It vanishes:** on the desktop world the pad is placed at the hero's right (`padSpot`, x 0.74) on the curve of the limb. For a
  pad on the West Coast flying south (USSF-627 from Vandenberg) the path runs to the bottom right corner and off the canvas in the first
  seconds; `drawHero` cuts the path where it leaves the canvas (`kE`) and fades the rocket out there (`on*=eF(k)`), so the rocket is
  gone long before its flight ends. Paths that turn behind the limb end the same way (`worldPath` marks the first hidden point).
- **It stutters:** on phones and tablets (the hero loop) the launch is drawn 24 times a second (`FMIN`), stops while the page
  scrolls (`calm`) and its plume flickers at random each frame; at that rate the moving dot steps visibly. It is also tiny: the
  track is laid out at a fixed scale from a spot under the facts, about 30 px long at 390 wide, partly under the facts.
- On desktops whose GPU cannot hold 40 fps the world steps down to medium and then to one still frame mid flight (`stepDown`).

The fix in this branch: the launch moves to a small globe card drawn once per launch (no per frame WebGL), with the rocket on its own
2D canvas at the display's frame rate, the whole flight inside the card, and nothing drawn over the footage.
