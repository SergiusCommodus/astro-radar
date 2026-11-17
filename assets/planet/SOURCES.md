# The hero's distant planet: source, licence and what is committed

**Now (17 November 2026, branch earthview, George's choice).** The home hero shows a small, distant planet on the right, as if seen from
far away in space. It is **Terran Planet 10** by **ShinyMan**, an invented world, not Earth: the site never calls it Earth (its alt text
is "A distant planet in space"), and NASA's Earth is kept only as the `?hero=earth` comparison (`assets/earth/SOURCES.md`).

| | |
|---|---|
| Pack | "Terran Planet 10 - 4k", https://www.cgtrader.com/free-3d-models/space/planet/terran-planet-10-4k (CGTrader model 4239890, published 20 January 2023) |
| Author | ShinyMan (CGTrader); a 16k version is sold on the same profile |
| Licence | CGTrader **Royalty Free License (no AI)**, "free for personal and commercial use" (https://www.cgtrader.com/pages/terms-and-conditions, section 21) |
| What it allows | Using the product in rendered still or moving images, including commercial ones |
| What it forbids | Giving or selling the product "in the form it is downloaded from the Site", or redistributing it, unless it is incorporated into a larger work and cannot be extracted; using it for machine learning or training neural networks (the "no AI" terms, sections 19.2 and 21B) |
| Credit | The licence asks for none; the Data sources page credits ShinyMan and links the pack anyway |

**What is committed.** Only the finished renders: `planet-280`, `planet-560` and `planet-840`, AVIF and WebP with transparency, each a
whole lit sphere with clouds and atmosphere baked in, from which the pack's maps cannot be taken back out. The pack's raw PNG maps
(Diffuse, Clouds, Bump, Elevation, Roughness, Mask and the three city light maps, 4096 by 2048) are never committed: they stay in
`_incoming/terran10/` beside the repository's working copy, which `.gitignore` keeps out. To render again, put the pack there and run
`python3 scripts/make_planet_view.py` (or pass `--src`).

**How it is drawn** (`scripts/make_planet_view.py`). An orthographic view of a sphere facing 70 W, 16 N on the pack's map (its large green
continent on the day side, the middle continent in the night), lit from the left at a 66 degree phase angle, a little under two thirds
lit, with a twilight band about 2 degrees of arc wide. Maps used: Diffuse for the ground, Bump (a tangent space normal map) for relief on
the lit side at about half strength, Clouds (white with the cover in alpha, at 85 percent so the land still reads at 60 px) with a faint
shadow, and the Rural, Urban and Metropolis lights on the night side under the clouds; Elevation, Roughness and Mask are not needed (no
sea glint at this size). A thin blue glow sits on the lit limb. Supersampled 2 by 2 at 840 px and scaled with Lanczos in premultiplied
alpha, so it is sharp at 100 percent on 1440, 1920 and 2560 screens and on a 3x iPhone (`tests/planet.cjs` checks the browser never
enlarges it).

**Why a still.** As for the Earth before it (`assets/earth/SOURCES.md`, measured 16 November 2026): a turning WebGL sphere would download
the 4K maps (and publish them, which this licence does not allow) and came out softer; the still is 20 KB on a phone.
