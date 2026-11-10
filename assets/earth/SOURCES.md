# Real Earth footage: sources, rights and research

The hero's and the footer's planet are real video of Earth from the International Space Station, cut by
`scripts/make_earth_clips.py` from one NASA original. Credit shown on the page (footer): "Earth footage: NASA Johnson Space Center".

## Rights

NASA's media guidelines (https://www.nasa.gov/nasa-brand-center/images-and-media/) say NASA material is not protected by copyright
unless noted, and may be reproduced without permission; it may not be used to imply endorsement. The Gateway to Astronaut Photography
FAQ (https://eol.jsc.nasa.gov/FAQ/default.htm) adds the credit line it asks for: "Video courtesy of the Earth Science and Remote
Sensing Unit, NASA Johnson Space Center". Every clip listed as usable below is NASA authored (Johnson Space Center or NASA
Headquarters), from the ISS, with no copyright notice in its record, no third party credit (no ESA, JAXA, Roscosmos or private
photographer) and no music in the frames we use (the page plays it muted and the cuts carry no audio). The NASA meatball and the
"Earth Day 4K" titles that appear in the reel are left out of every cut.

## Candidates (checked 2026-11-10)

| # | Clip | Where | Resolution, length | Rights and credit | Verdict |
|---|------|-------|-------|-------|-------|
| 1 | 4K Earth Views Extended Cut for Earth Day 2021 (jsc2021m000138) | https://images.nasa.gov/details/jsc2021m000138_4K_Earth_Views_Extended_Cut_for_Earth_Day_%202021_210422-4KMP4 | 3840 by 2160, 29.97 fps, 52 min 34 s, H.264 41 Mbps (15.5 GB) | NASA JSC, public domain, recorded from the ISS 2019 to 2020; no creator or copyright fields | **Used** (hero and footer) |
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

## Chosen cuts (timecodes in clip 1)

| File | Cut | Frame | Notes |
|------|-----|-------|-------|
| `hero-wide.*`, `hero-phone.*` | 48:25 to 48:39 (2905 s, 14 s) | as shot, the horizon a dome with black space above | a cloud deck and a snowy mountain range (the reel does not name the place), the bright blue rim of the atmosphere; wide is the full 3840 width (cropped to 2.37 to 1 with black space added above), phone the centre 1620 by 1620 |
| `foot-wide.*`, `foot-phone.*` | 9:40 to 9:54 (580 s, 14 s) | turned 194 degrees (the astronaut held the camera upside down and tilted; in orbit there is no up) | deep blue ocean, a coast with cloud and an island, the limb rising off centre |

Each is a 12 s loop with a 2 s cross fade (the camera holds steady over both cuts, so only clouds and ground cross fade), its top
rows faded into the page color, and the shadows of space crushed to black so the turned frame's empty corner matches the sky.

## Delivery (research)

- Autoplay: `muted`, `playsinline`, `loop`, no controls; muted inline video may autoplay on iOS Safari and Chrome. iOS Low Power Mode
  refuses autoplay even then: `play()` rejects with NotAllowedError, so the page catches it and leaves the poster
  (https://developer.apple.com/forums/thread/709821, https://bugs.webkit.org/show_bug.cgi?id=219889). Reduced motion, Save Data and
  2G show the poster too.
- Poster: a separate `<picture>` (AVIF, else WebP) under the video, preloaded, so the first paint is sharp and is the LCP; the video
  is set only after load (`preload` none until then) and fades in over the poster's identical first frame.
- Codecs: AV1 in MP4 where the browser says the decode is smooth and power efficient (`navigator.mediaCapabilities.decodingInfo`):
  every recent Chrome, Edge and Firefox on a computer, Android phones with a hardware decoder, and Safari only on hardware with an
  AV1 decoder (iPhone 15 Pro and later, M3 Macs; https://bitmovin.com/apple-av1-support). Everyone else gets H.264 high profile in
  MP4, which every iPhone decodes in hardware. VP9 is dropped: AV1 covers the browsers that took VP9 at about a third of the size,
  and H.264 covers the rest.
- Loop: a cross fade, not ping pong (running the clouds backwards looks wrong), with `+faststart` so playback starts on the first
  bytes; the service worker serves byte ranges from a whole copy, as before.
- Bitrate for photographic, slow moving footage: chosen by eye at 100 percent (see the PR), then checked against the caps.

| File | Size | Notes |
|------|------|-------|
| hero-wide.av1.mp4 | 1.23 MB | 2560 by 1080, 12 s, AV1 10 bit CRF 22 |
| hero-wide.mp4 | 3.81 MB | H.264 high, CRF 20 |
| hero-phone.av1.mp4 | 0.53 MB | 1080 by 1080 |
| hero-phone.mp4 | 1.57 MB | |
| foot-wide.av1.mp4 | 0.71 MB | 2560 by 960, loaded only near the footer |
| foot-wide.mp4 | 2.30 MB | |
| foot-phone.av1.mp4 | 0.23 MB | 1080 by 692 |
| foot-phone.mp4 | 0.73 MB | |
| posters | 92 / 41 / 38 / 12 KB AVIF; 150 / 66 / 66 / 21 KB WebP | hero wide, hero phone, foot wide, foot phone |

Sizes: about 1440p class for desktops (2560 wide, the band the hero shows, not a 16 by 9 frame of which half would sit below the
hero) and 1080 for phones, as asked; no 8K video.

## Why the hero rocket stuttered and vanished (profile of the live site, 2026-11-10)

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
