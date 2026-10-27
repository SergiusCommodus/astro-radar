# Overnight run, October 27, 2026

Branch `overnight`, cut from `origin/main`. This pull request contains ios-perf (#7) and providers (#8), plus the work below. Nothing was merged into main and no branches were deleted.

## What I did

### 1. Combined ios-perf and providers
- Merged `origin/ios-perf`, then `origin/providers`. Neither was in main yet.
- `src/app.js` merged cleanly. `src/template.html` had one conflict, in the compass rules beside the provider card rules. I kept both sides: ios-perf's compass layers and providers' card, filter and footer styles.
- Checked at 1440 and 390 wide with `tests/launches.json`: hero, countdown, Your sky with a ZIP, provider filter, provider cards, Watch buttons. No console errors.

### 2. Small fixes
- Removed the Roscosmos X link from `data/providers.json`. Roscosmos now has no links, and its card says "No official links we could verify yet."
- Updated CLAUDE.md:
  - photo hero for every pad inside the photo, globe only outside it;
  - provider data and how to check it;
  - the ios-perf notes;
  - step by step testing with the mock feed and with the real sample;
  - the inlined feed and the metadata (added in step 4).

### 3. Polish
I audited every section at 390, 768, 1440 and 1920, then fixed and committed one section at a time.

**Hero and intro**
- A one line intro under the hero says what the site does.
- A How it works strip (Pick a launch, Add your ZIP, See where to look) opens the matching tab. Add your ZIP puts the cursor in the ZIP field.
- Phone hero buttons are an even two column grid.
- The tablet facts grid lost its stray indents.

**Launches**
- Real bug fixed: with 25 launches, the manifest never appeared on phones. Its reveal waited until 12% of a list many screens tall was visible.
- Loading skeletons for live data: hero, filter bar, rows, provider counts, Your sky and the weather cards shimmer instead of flashing sample data.
- The feed request now times out after 10 seconds.
- Clear messages for each failure: feed unavailable, offline, or no launches listed.
- Rows keep one site link, so they are shorter.
- Rows use a proper grid on tablets.
- The filter bar scrolls sideways below 1100 px instead of wrapping into three rows.

**Watch**
- Provider links are a compact row of buttons: Watch live with its source, Website, Social. On phones Watch live takes the full width.
- Cards with no verified links say so.

**Your sky**
- A line under the verdict says the result is a modeled estimate.

**Astro**
- Aligned the thread header and composer on phones.
- The side cards stay in view on wide screens.

**Whole page**
- Violet button hover keeps white text above 4.5:1 contrast.
- Hero text has a soft shadow over bright city lights.
- Hero entrance animations are shorter (0.6 s). Reduced motion still turns them off.
- On phones the sticky header and tab bar are solid, so text no longer shows through.

### 4. Quality

**Metadata**
- Title, description, canonical URL, Open Graph and Twitter card tags.
- A 1200 by 630 share image made from the hero photo.
- An apple touch icon and a 32 px PNG favicon alongside the SVG one.

**Accessibility**
- Skip link to the launch list.
- Focus rings drawn inside the scrolling tab and filter bars, so their edges cannot clip them.
- Names for the account menu and the sample illustrations.
- Keyboard walk: every stop has a visible ring and a name, arrow keys move between tabs, and the sign in dialog takes focus and returns it on Escape.

**Performance** (measured locally with Chrome; phone runs at 4x CPU slowdown on a slow 4G profile)

| | Before | After |
|---|---|---|
| Layout shift, phone | 0.16 | 0 |
| Layout shift, desktop | 0.014 to 0.05 | 0.007 |
| First paint, phone | 0.55 s | 0.6 s |
| Largest paint, phone | 0.55 s | 1.3 to 1.6 s (see choice 6) |
| Total blocking time, phone | about 800 ms | 700 to 950 ms (runs vary) |
| First paint, desktop | 0.3 s | 0.3 s |

The page is 1.1 MB, about 340 KB gzipped, plus the 193 KB hero photo.

What changed for performance:
- The workflow now fetches the feed before it builds, and the build inlines it. The page opens on live launches with no loading state and no shift. It still fetches `launches.json` quietly, in case the page itself was cached.
- Fallback fonts are sized to Barlow, so text barely moves when the web fonts arrive.
- The hero's pad label works out its placement once per position instead of every frame.

### 5. Robustness
- Tested:
  - the real Launch Library sample (`tests/raw_ll2.json`);
  - a feed answering 500, broken JSON, an empty list, only past launches, no answer at all, and malformed entries mixed with good ones;
  - the inlined feed with a failing background refresh;
  - the NWS failing, answering 503, or the browser going offline and back;
  - invalid ZIPs: empty, 3 digits, letters, 00000, 99999, 7 digits.
- Each case shows a clear message.
- Real bug fixed: a launch with an unknown time zone threw an error and left the list stuck on placeholders. It now falls back to UTC, and entries without usable coordinates or times are skipped.
- An unsafe `javascript:` stream link in the feed never reaches the page.
- Curled every external link on the page (43): all answer 200. X accounts were checked through X's embed endpoint. `scripts/check_providers.sh` passes all 40 provider links.

### 6. Final check
- With a fresh mock feed (every provider, pads from Kodiak to Mahia), all 25 launches draw a hero at 1440 and 390.
- Countdown, Your sky, filter, provider cards and Watch buttons all work at 390, 768, 1440 and 1920.
- No console errors.

## Choices I made without asking
1. **Merge order.** I merged ios-perf first and providers second, and resolved the one conflict by keeping both sides.
2. **Roscosmos.** The card keeps its name and description with no links, and a line saying none could be verified.
3. **Inlined feed.** I changed `.github/workflows/pages.yml` to fetch the feed before building. Same steps, new order, and the fallback to the last good file is unchanged. Without this, every visit briefly showed sample launches or placeholders and the hero jumped.
4. **PNG icons.** `.gitignore` ignores every `*.png`. I added `!assets/*.png` so the apple touch icon and PNG favicon can live in `assets/`. Screenshots elsewhere are still ignored.
5. **Share image and canonical URLs** point at `https://astroradar.io/`, as CLAUDE.md gives that as the live address.
6. **Fallback fonts.** I kept the size matched fallback fonts. They take desktop layout shift from about 0.05 to 0.007, but in the throttled phone test the largest paint moves from 0.6 s to 1.3 to 1.6 s. Chrome counts the text again once the web font arrives. Both are within the "good" thresholds (shift under 0.1, largest paint under 2.5 s).
7. **Row links.** Each row keeps one site link (mission page, else the provider's site) to cut clutter. The provider's site is still on its card.
8. **Filter bar.** It scrolls sideways up to 1100 px instead of wrapping.
9. **Hyphens in data.** Mission names straight from Launch Library keep their own hyphens (for example "Starlink Group 12-7"), since they are official names. All copy I wrote has none.

## What I could not verify
- A real iPhone or Android phone. All phone checks used Chrome's phone emulation on Windows. The fallback fonts only exist on desktops: Arial Narrow and Arial. Phones without them use their own fonts as before.
- The deploy workflow itself. I changed the step order but could not run GitHub Actions from here. Worth watching the first run after merging.
- Link previews on X, Slack or iMessage. The tags are in place, but the share image only resolves once this is deployed to astroradar.io.
- Lighthouse itself. I measured the same signals (first paint, largest paint, long tasks, layout shift, page weight) with Chrome's tools, not with a Lighthouse run.
- Blue Origin's site sometimes answers automated requests with 429 (too many requests). It answered 200 in `check_providers.sh`, but may flake in a scheduled check.
- `tests/raw_ll2.json` carries a placeholder YouTube link (`watch?v=abc`). It answers 200, but it is not a real stream.

## What I recommend next
1. **Move the ZIP table out of the HTML.** At about 860 KB raw, it is most of the page. Load it after first paint, keeping the inline copy only in `artifact.html`. This is the biggest remaining win for page weight and the long tasks at startup.
2. **Self host Barlow** (it is open source) with preload. That removes the font swap entirely, the cause of both the remaining desktop shift and the later largest paint, and drops the Google Fonts requests.
3. Test on a real iPhone (Safari) and an Android phone, especially the hero, the sideways filter bar and the sticky bars.
4. After merging, watch the first scheduled deploy and open the live page's source to confirm `#feeddata` holds the feed.
5. Decide whether official mission names may keep their hyphens, or whether the feed should rewrite them like vehicle and pad names.
6. Look for official Roscosmos and CNSA stream pages again later, and add them only if they can be verified.
7. Housekeeping: while measuring I copied the built page to `D:\idx_backup.html`, outside the repository. The safety check blocked me from deleting it, so please delete it by hand.
