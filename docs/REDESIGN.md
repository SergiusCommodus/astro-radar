# Redesign: one planet, one calm hero

George's notes on the live site (11 Nov 2026): the planet background looks terrible; the earlier version (the US at night photo, the
"demo" look) was better; too much is going on (rocket animation, globe card, overlays); one planet scene, not three.

This file holds the research, the visual assessments before and after, and the decisions. Screenshots are in the pull request's
Artifact page (before and after at 390, 768, 1440 and 1920).

## 1. Visual assessment of the live site (before)

Screenshots of https://astroradar.io on 11 Nov 2026 at 390 (3x), 768, 1440 and 1920: the home page, every tab, a launch page, the
Florida page and About. Ranked by how much each hurts, worst first.

1. **The planet does not read as Earth from space.** The hero is a daylight photo of a grey cloud deck under a saturated blue rim, and
   every side fades into black through a wide blur, so the picture looks like fog in a vignette, not a window. On a phone it is a
   210 px band squeezed between the facts and the tab bar, and the tab bar cuts it.
2. **Three planets, three looks.** The hero's daylight photo, the globe card's WebGL Earth at night, and the footer's green aurora
   photo. Each is a different time of day, colour and scale, so the page has no single scene. Add the page's own starfield, the hero's
   star canvas and the footer's star canvas.
3. **The globe card competes with the copy.** On a desktop it sits beside the headline as a second hero with its own caption; its
   readout tag ("LONG MARCH 2D T+0:01 · 0 KM") sits on the planet; the rocket and its path are a few pixels long. On a phone it is a
   full width card under the hero, 370 px tall, that pushes everything else down.
4. **The phone's main button has no words.** At 390 the blue button is a bell icon alone (the "Set reminder" label is hidden by the
   phone rules when it is the main button), so the most important control on the first screen says nothing.
5. **The data looks stale.** The live hero says "Data delayed · updated 5 h ago". The scheduled build runs every 30 minutes on paper
   but GitHub delayed it by hours (runs at 23:56, 04:37, 05:54 UTC), and the Worker that would serve a live feed is not configured
   (`feedUrl` is empty). Not a design problem, but it undermines every number on the page. Fix: deploy the Worker (see
   `worker/README.md`) and set `FEED_URL`; nothing in this pull request can fix it.
6. **The sub line is hard to read.** The pad, in spaced capitals, runs to an ellipsis at every width ("LAUNCH AREA 94 (SLS 2 / 603),
   JIUQUAN SATELLITE LAUNCH CENTER, P…").
7. **The countdown wastes the first screen.** Under a day it still shows "00 DAYS"; the four huge pairs take as much room as the name.
8. **Too many small capitals.** The kicker, status, data tag, tab names, button labels, fact labels, section labels and footer line are
   all spaced capitals, so nothing stands out among them.
9. **The other pages are another site.** Launch pages, Florida and About have their own header ("ALL LAUNCHES" only), a narrower
   column, underlined body links, a flat black page with no stars, and the condensed headline at twice the main page's size.
10. **The footer is 600 px of picture.** A long disclaimer, three link groups, then an aurora photo with nothing on it.
11. **The Watch tab has a fourth illustration**: a drawn rocket trail over a hill in the "Next live stream" card, with a disabled
    looking "No stream yet" button.
12. **Recent launches cut text** to one line with ellipses at every width.

What is good and must stay: the Barlow pair and its numerals; the navy and cool blue palette; the countdown itself; the honest wording
(a modeled estimate, clouds not counted, the stream as the way to watch); the launch list (one clean row each, logos on chips, the
status at the right); the ZIP verdict card; the 44 px targets; and the performance discipline (nothing drawn per frame off screen,
no layout shift).

Slow: nothing measured slow on a desktop. On a phone the hero photo (92 KB AVIF) is the LCP; the globe card loads WebGL, 26 KB of
script and 2k textures (about 600 KB) on every phone for a picture 370 px tall.

## 2. Earlier heroes, rebuilt

Each version was checked out, built with today's mock feed and photographed at 390, 1440 and 1920.

| Version | Commit | Hero | Verdict |
|---|---|---|---|
| The US at night photo ("demo") | db34bf3 (3 Nov) | `assets/earth_new.jpg`, a night view of North America with city lights, a sunrise on the limb and the Moon, full bleed behind the copy | The look George liked: one picture, warm city lights, the copy on it. But the file is 1672 by 941 (soft on any screen over 1600 px and on a 3x phone) and its source is not recorded anywhere in the repository; its perfect lights, cloud shading and the Moon placed on the limb read as a render, not a photograph. It cannot be credited or sharpened. |
| The live limb (v2design) | e5f2e35 (9 Nov) | WebGL Earth at night under the copy | Sharp lights but plainly computer graphics: flat black ocean, a lilac rim. |
| NASA footage and the globe card (PR 44) | f96b7ee (10 Nov) | 4K ISS video of a daylight limb, the globe card beside the copy | Real, but daylight cloud, video softness, and two planets. |
| NASA stills (PR 45 to 47, live now) | ff01624 | ISS074-E-89803, a daylight limb over the Pacific, plus the globe card and the aurora footer | Real and sharp, but a cloud deck with a blurred frame; three planets. |

Most like real Earth: the NASA stills (they are real), but the night photo is the look that worked. The answer is a real NASA night
photograph in the US at night layout.

### NASA night photographs (Gateway to Astronaut Photography and the NASA Image and Video Library, public domain)

Searched images-api.nasa.gov ("city lights night earth limb space station", "night lights airglow horizon", "united states night",
"east coast night", "florida night", "airglow", "orbital night pass", 2009 to 2025; 327 frames, 42 on contact sheets, 5 downloaded at
full size and checked at 100 percent).

| Frame | Pixels, camera, exposure | What | At 100 percent | Verdict |
|---|---|---|---|---|
| ISS030-E-55569 (29 Jan 2012) | 4256 by 2832, Nikon D3S, 0.5 s, ISO 3200 | the Southeast at night, Atlanta to Jacksonville and the Florida coast, a gold and green airglow on the limb, a starry sky | city lights drawn into short streaks of 3 to 6 px by the 0.5 s exposure; stars sharp; little noise | **Hero**: the warm US at night look; truss along the top edge crops out |
| ISS070-E-62746 (10 Jan 2024) | 5568 by 3712, Nikon D5, 1/13 s, ISO 65535 | the central US and its city lights under the airglow, a dense starry sky | the sharpest points of any frame, but heavy grain from ISO 65535 and soft glows where light comes through cloud; a solar array in the bottom right corner | Reserve |
| ISS072-E-189824 (17 Nov 2024) | 8256 by 5504, Nikon Z 9, 0.3 s, ISO 8000 | Florida at night under moonlit clouds, a green and amber airglow | camera shake: every light is a squiggle 20 to 40 px long; a solar array at the top | Not used: shake |
| ISS029-E-12564 (29 Sep 2011) | 4256 by 2832, Nikon D3S, 1.3 s | the Midwest at night with an aurora | 1.3 s streaks; hardware along the top | Not used |
| ISS073-E-982450 (25 Oct 2025) | Nikon Z 9 | the eastern US under a blue green airglow | solar arrays and a module fill a third of the frame | Not used |

## 3. Benchmark: one scene with a countdown

| Site | Hero |
|---|---|
| SpaceX (launches) | one full bleed photo of the rocket; a small T minus countdown over a big mission name, bottom left; one outlined Watch button. Nothing else. |
| NASA | one photo; a headline, one sentence, one red button; three small links under a hairline. |
| Next Spaceflight | a list of cards, each a photo with a countdown chip and the name; no hero. |
| RocketLaunch.live | a text list, no picture. |
| Apple | one picture, a two line headline, one or two buttons, centered. |

The simplest layout that fits our content is SpaceX's and NASA's: one picture full bleed, the copy at the lower left on its dark sky
(at the bottom on a phone), a small status line, the name, the countdown, one main button and one quiet second one, and one line of
three facts. Everything else goes below the fold or into More.

## 4. Delivering one sharp still

- AVIF first, WebP after, through `<picture>` with `srcset` widths (wide: 1280, 1920, 2560, 3840; phone: a portrait cut at 828 and
  1290) and `sizes="100vw"`, so a 1440 screen at 1x takes 1920 and a 3x phone takes 1290.
- The phone's image is preloaded with `imagesrcset` and `fetchpriority="high"`; nothing else blocks it, so it is the LCP.
- The photo's own stars are real but soft at 3x; the page's still star canvas (drawn at the screen's density) carries the sharp stars
  above the limb and down the page.
- No video and no WebGL in the hero. A slow drift on the compositor (transform only), off with reduced motion.
- Grain: the photo is lightly denoised before resizing (median 3 on the dark sky only), then dithered by one step so the black and the
  airglow do not band.
