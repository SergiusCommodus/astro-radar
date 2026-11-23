# Simpler pages (Part B, 21 November 2026)

George wants every page except home simpler and easier to use. This file keeps the research, the decisions and the counts.

## How the best apps keep a page simple (research)

Sources, paraphrased: MacRumors' guide to iOS Weather (macrumors.com/guide/ios-16-weather), Daring Fireball and Lickability on Apple
Sports (daringfireball.net/2024/02/apple_sports, lickability.com/blog/apple-sports), Flightradar24's posts on its flight panel
(flightradar24.com/blog), Linear's two redesign write ups (linear.app/now/how-we-redesigned-the-linear-ui,
linear.app/now/behind-the-latest-design-refresh).

- **Apple Weather:** one module per topic; tap for the detail, which is always the value now, one chart and a short sentence; expert
  facts one level down; it merged modules rather than adding them.
- **Apple Sports:** the first screen is the scores and nothing else; a game is one card; built for a visit of a few seconds; quiet
  controls and translucent secondary text; color comes from the subject; every extra must earn its place.
- **Flightradar24:** a panel in two steps (the essentials, then the graph); short titled sections; links behind More.
- **Linear:** fewer colors (a base, an accent, a contrast); the chrome dimmer than the content; structure from space rather than
  lines and boxes; actions always in the same place; two type styles.

Rules we took from them:

1. Each page answers its one question in the first screen, with one main action.
2. One headline per block, one muted line under it; source and time at the foot.
3. Expert facts folded behind a short label (a plain `details` with a chevron), never on the first view.
4. Space and hairlines instead of boxes in boxes; at most two chips per item; one accent color plus the status colors.
5. One display style for names and numbers, one text style for the rest; one type scale.
6. Actions in the same place on every page: one main button, the rest as quiet links.

## Defaults used (George could not answer the interview; listed in the PR)

1. Every page answers its one job in the first screen on a phone, with one main action. Everything else sits below, or folded.
2. A launch page: name and countdown, the Look Up verdict in one line, the main action (Watch live or Set reminder), Plan your trip,
   then the details folded.
3. Fewer boxes: space and dividers instead of nested cards. At most two chips per item. One accent color.
4. Short words: labels of 1 to 3 words, sentences under 20 words, no jargon unless Nerd mode is on.
5. Merge pages that repeat. Every feature stays reachable; anything removed is listed in the PR.

## Each page: its one job, what got in the way (before)

| Page | Its one job | What got in the way |
|---|---|---|
| Launch page (upcoming) | When is it, can I see it, how do I watch | Four actions with equal weight, Look Up a boxed form far down on a phone, three boxed key facts, long place cards, a second Astro block repeating Share to Astro |
| Launch page (flown) | How did it go, watch the replay | The same boxes as before liftoff, the facts and mission at equal weight |
| Launches (the list) | What launches next, and which can I see | A three line intro sentence, a large Nerd mode button, logo chips so large the names are cut off, status pills |
| Go watch | Where can I watch a launch in person | A four line intro, boxed cards for every place and pad |
| Space Coast, Vandenberg, Starbase | Which place, how far, what it costs | A long intro paragraph before the places, a boxed card for every launch and place |
| Pad pages | What launches from here and where to watch it | The pad's name twice, boxed cards for each launch and place |
| Live | What is happening in space now | An intro sentence, a full screen Earth photo before anything else |
| News | The latest headlines | Each headline a boxed card |
| Stats | How launches went this year | Long sections at equal weight |
| Watch with friends (Astro) | What Astro is and how to share a launch | A boxed section around everything, two equal buttons |
| Your launches | The launches I logged | Fine already; small fixes |
| What was that in the sky? | Which launch made that light | Long explanation before the answer |
| Providers, a provider | Who launches, and their next launch | Boxed rows, chips |
| About, Privacy, Data sources | Read what the site is and keeps | Long text with no short answer first |

"Watch" is not a page of its own any more (flowfix moved it into the list and the Astro page), so it has no row here.

## Counts

Counted by a script on the same build of the mock feed before and after, at 390 by 844 and 1440 by 900: words above the fold in
`main`, buttons, chips, cards (filled or outlined blocks), text and background colors (rounded) and font sizes on the whole page, with
closed details left out. The table is in the PR and in the review page.

## Second pass (simple2, 22 November 2026)

The pages the first pass said were still busy. Research on schedules (sources: nextspaceflight.com/launches, flighty.com and Apple's
developer article on Flighty, daringfireball.net/2024/02/apple_sports, lickability.com/blog/apple-sports): a departure board line per
item, a time that says how far off it is, status only when it is news, the whole row a tap target that opens the detail, a logo in a
fixed slot so names line up.

Defaults used (George could not answer; listed in the PR):

1. Launches list: plain rows on thin lines instead of cards. Each row: a small provider logo, the launch name, the rocket, the local day
   and time, and the one word view for the visitor's ZIP when one is set. A tap opens the launch page. No other chips.
2. Launch page on a phone: the first screen is the name, the countdown, the one line view and the main button, nothing else; the rest
   follows.
3. News, Live, Stats, Your launches, Providers: lead with the most useful thing (today's top story, the live ISS, this year's total, your
   log, providers with launches soon), then a short list, the rest folded.
4. Region guides: the three nearest places first, the rest behind More places.
5. Every feature stays reachable.

The counts are first screen counts (words, buttons, boxes, chips, font sizes), on the same mock feed built at the same moment. A list
that fills the screen keeps about the same number of words however it is laid out, so for the Launches list, News and Providers the
words above the fold measure density, not clutter: the Launches list shows six launches on a phone where it showed four.
