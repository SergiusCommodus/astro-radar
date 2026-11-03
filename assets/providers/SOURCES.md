# Provider logos: sources

Every logo here comes from Wikimedia Commons, where it is marked public domain (most are text or simple geometric marks, "PD textlogo") or CC0. All of them are trademarks of their owners; Commons marks most of them "trademarked". Astro Radar shows them only to identify the launch provider of a launch, next to its name, and is not affiliated with any of them (the footer and every launch page say so).

Changes made to every file (the scripts are described in CLAUDE.md): metadata, editor data, ids and anything that is not a drawing element removed; every fill and stroke set to white (`#fff`), so the logos match the dark page; the viewBox cropped to the drawing; numbers rounded to two decimals. No shape was redrawn or altered.

Checked 2026-11-03 through the Commons API (`LicenseShortName` and the file description).

| File | Provider | Commons file | License on Commons |
|---|---|---|---|
| spacex.svg | SpaceX | [SpaceX logo black.svg](https://commons.wikimedia.org/wiki/File:SpaceX_logo_black.svg) | Public domain (trademarked) |
| nasa.svg | NASA | [NASA Worm logo.svg](https://commons.wikimedia.org/wiki/File:NASA_Worm_logo.svg) | Public domain, work of NASA (trademarked, insignia) |
| blue.svg | Blue Origin | [Blue Origin new logo.svg](https://commons.wikimedia.org/wiki/File:Blue_Origin_new_logo.svg) | Public domain (trademarked) |
| rocketlab.svg | Rocket Lab | [Rocket Lab Wordmark.svg](https://commons.wikimedia.org/wiki/File:Rocket_Lab_Wordmark.svg) | CC0 |
| northrop.svg | Northrop Grumman | [Northrop Grumman logo white-on-clear.svg](https://commons.wikimedia.org/wiki/File:Northrop_Grumman_logo_white-on-clear.svg) | Public domain (trademarked) |
| stoke.svg | Stoke Space | [Stoke Space SVG logo.svg](https://commons.wikimedia.org/wiki/File:Stoke_Space_SVG_logo.svg) | Public domain |
| arianespace.svg | Arianespace | [Arianespace wo wordmark.svg](https://commons.wikimedia.org/wiki/File:Arianespace_wo_wordmark.svg) | Public domain (trademarked) |
| esa.svg | ESA | [ESA logo simple.svg](https://commons.wikimedia.org/wiki/File:ESA_logo_simple.svg) | Public domain (trademarked) |
| isro.svg | ISRO | [Indian Space Research Organisation Logo.svg](https://commons.wikimedia.org/wiki/File:Indian_Space_Research_Organisation_Logo.svg) | Public domain (trademarked) |
| jaxa.svg | JAXA | [Jaxa logo.svg](https://commons.wikimedia.org/wiki/File:Jaxa_logo.svg) | Public domain (trademarked, insignia) |
| roscosmos.svg | Roscosmos | [Roscosmos logo en.svg](https://commons.wikimedia.org/wiki/File:Roscosmos_logo_en.svg) | Public domain (trademarked, insignia) |
| cnsa.svg | CNSA (also China Aerospace Science and Technology Corporation, which the feed files under CNSA) | [Insignia of CNSA.svg](https://commons.wikimedia.org/wiki/File:Insignia_of_CNSA.svg) | Public domain (insignia) |
| isar.svg | Isar Aerospace | [Isar Aerospace logo.svg](https://commons.wikimedia.org/wiki/File:Isar_Aerospace_logo.svg) | Public domain |
| astra.svg | Astra | [Astra Space logo.svg](https://commons.wikimedia.org/wiki/File:Astra_Space_logo.svg) | Public domain (trademarked) |

## Monogram badges instead of a logo

No logo under a license that allows this use could be found for these, so they get a monogram badge (`mono` in data/providers.json, or one made from the name by `mono_of` in launch_pages.py and `monoOf` in app.js). Add a logo only from the provider's own brand or press kit, if its terms allow it, or from Commons under a free license, and list it above.

- ULA (ULA): no ULA logo on Commons.
- Firefly (FF): the Commons files named "Firefly logo" are other companies' (a car brand) or have no description of what they show.
- Relativity (RS): no Relativity Space logo on Commons.
- CAS Space, the maker of Kinetica (CAS), Galactic Energy (GE), LandSpace (LS), iSpace (IS) and any other provider outside data/providers.json: none on Commons; the badge is made from the name Launch Library gives.
