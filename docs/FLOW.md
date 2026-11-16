# One navigation (flowfix, November 2026)

Astro Radar is four jobs, in this order, and one More menu. The same names, in the same order, are the top bar on a desktop and the
bottom bar on a phone, on every page; one footer lists the same. `launch_pages.NAV` and `launch_pages.MORE` are the lists; `build.py`
writes the main page's bars from them, and every other page gets them through `top_nav`. `tests/test_flow.py` checks the markup of
every page and `tests/flow.cjs` clicks it.

| Job | Name | Where | What is there |
| --- | --- | --- | --- |
| What is next and can I see it | Next | `/` (the hero and Your sky) | the next launch, its countdown and Watch, the verdict for your ZIP |
| All launches | Launches | `/#launches` | the list, its filters, each row opening in place, each with its launch page one tap away |
| Go watch | Go watch | `/guide/` | the Space Coast, Vandenberg and Starbase, every launch pad, What was that in the sky?, the first launch guide |
| Space now | Space now | `/live/` | Live and News, one switch apart |
| More | More | a menu | Your launches, Watch with friends (Astro), Providers, What was that in the sky?, About, Privacy, Data sources |

Every page has a title, a way back and one main action. Pages that sit inside a job carry a link to it above the title: the guides and
pads say Go watch, a provider says Providers, a launch page says All launches. The browser's Back works everywhere: a launch page opened
from the list comes back to the list.

## The site map

Before (main at 5befecb):

```
/  header: Launches · Live · News · Watch · Astro · More (Your sky, Go watch, Your launches, Providers, Florida, About, Data sources)
   phone:  header Launches · Live · News · More, and a bottom bar Your sky · Launches · Watch · Astro (different items)
   tabs:   Your sky | Launches | Watch (streams, provider cards) | Astro (share, how it works)
other pages: header Launches(/#launches, lands on the hero) · Live · News · Watch(/#watch) · Astro(/astro/) · More, no bottom bar
   footer: 14 links, not the same as the main page's
/guide/ (first launch guide)   /spacecoast/ /vandenberg/ /starbase/   /ksc/ (Florida, the Space Coast again)   /tonight/
/pad/* (27 pages, no link to any of them)   /launch/* (3 taps from home: Launches, open a row, Launch page)
```

After:

```
Next /                 hero + Your sky
Launches /#launches    the list; a row's › is its launch page; /launch/<id>/ → All launches, its pad → /pad/<slug>/
Go watch /guide/       Where to watch (/spacecoast/ /vandenberg/ /starbase/), Launch pads (/pad/*), Saw a light? (/tonight/), first launch guide
Space now /live/       Live | News (/news/)
More                   /logbook/ /astro/ /provider/ (→ /provider/<key>/) /tonight/ /about/ /privacy/ /data/
moved                  /ksc/ → /spacecoast/ (its printed QR code keeps working; the QR is on the Space Coast page)
                       /#watch → the list, /#astro → /astro/
```

Every page is at most two taps from the main page, and one tap from its section.

## What we clicked (16 November 2026)

A first time visitor's walk on an iPhone sized screen (390 by 844) and a 2560 px monitor, every header, bar, More, footer, row and
crumb item on every kind of page, on the build of main and on this branch. Before: what happened on main. After: this branch.

| Page | Element | Before | A visitor expects | Problem | After |
| --- | --- | --- | --- | --- | --- |
| Any page but home | Launches in the header | opened the home page at the top of the hero; the list was below the first screen | the list | landed on the wrong thing | opens the list in view |
| Any page but home | Watch | opened the home page's Watch tab: provider cards and the next stream, the same as /provider/ and each launch's Watch | streams to watch | duplicate | the tab is gone; Watch is on each launch; old links open the list |
| Home | Astro tab, and Astro in other pages' header | a tab on home, a separate page everywhere else | one place | two different destinations | one page, Watch with friends, in More |
| Home, phone | header and bottom bar | header Launches, Live, News, More; bottom bar Your sky, Launches, Watch, Astro | one set of sections | two navigations with different items | one bottom bar: Next, Launches, Go watch, Space now, More; the header is the brand |
| Other pages, phone | bottom bar | none; nine links in More | the same bar as home | inconsistent | the same bottom bar on every page |
| Any page | More | Your sky (also a tab), Go watch, Your launches, Providers, Florida, About, Data sources; Watch and Astro added on phones | things people rarely need | duplicates and jobs hidden in More | Your launches, Watch with friends, Providers, What was that in the sky?, About, Privacy, Data sources |
| Any page | the word Watch | Watch (a tab), Go watch, Watch from Florida, Watch with friends, Watch live | one meaning each | four things called Watch | Go watch (the job), Watch with friends (Astro), Watch live (a stream) |
| Pad pages (27) | links to them | none at all | reachable from the launches and the guides | orphans | on Go watch, and the pad on each launch page links to it |
| /ksc/ | the page | the Space Coast's next launches and places again, with fewer places | one Florida page | duplicate | sends to /spacecoast/, which now has the QR code |
| Launch page | a way back | the header's Launches, which went to the hero | back to the list | none | All launches above the name, to the list in view |
| Launch page | what comes after Watch | Source, Last checked, Time, Changes, then the launch day strip, then Look Up, facts, the mission, and Plan your trip last | can I see it, then how to go | the data's paperwork before the answers | Look Up, then Plan your trip, then the mission, the facts and the data notes |
| Launches list | a launch page | three taps: open the row, then Launch page | one tap from the list | too many taps | each row's › opens its page |
| Live | News | through the header only | Space now, then News | not grouped | a Live and News switch under the title |
| Footer | links | the main page's and the other pages' lists differed (Go watch, Your launches, What was that only on some) | the same footer | inconsistent | the four jobs and More on every page |
| Home hero | status | Next launch, Live now · launched 23 min ago, and Go for launch, together | one state | contradiction | the LIVE badge alone once it is live |
| Home hero | Look up from | showed Miami (33130) for a ZIP typed on a launch page's Look Up | my ZIP | assumed a ZIP | the ZIP typed; an unknown saved ZIP asks for one |
| Any page | an open More menu | stayed open until More was tapped again (the hero's More closed on a tap elsewhere; the others did not) | a tap elsewhere closes it | inconsistent | every More closes with a tap anywhere else, with no script (found on the main page that its press effect broke this; fixed) |
| Home, phone | hero over a launch that goes live | the LIVE badge wrapped beside a narrow logo but not a wide one once Next launch hid, so the hero's height depended on the logo (a 0.084 layout shift in one smoke run) | a steady page | layout shift | the label keeps its place, unsaid |
| Home, phone | bottom bar after scrolling | the footer's Launch calendar link took the bar's taps (found by tests/flow.cjs) | the bar works | broken taps | the bar sits above everything |

## Consistency

One header (the brand, the four jobs, More), one bottom bar on phones, one footer, on every page. One look for them (`launch_pages.FLOW_CSS`,
in launch.css and at the end of the main page's style block). Exceptions, on purpose:

- The main page keeps its own header styling (the next launch pill on the right, the underline that slides) and its sections switch in
  place; other pages are plain pages.
- /ksc/ is a moved page (no header), so the printed QR code still lands.
- The sign in page, with sign in off, is not built.
- Cards, chips and buttons: the main page and the launch.css pages still have separate style sheets for them. They look alike but are
  not one component library; that is a larger change than this one.

## How others do it (sources in the PR)

- Apple Weather opens on the answer (your place) and keeps the list one tap away.
- Flightradar24 opens a flight's detail over the map and closes it in one tap, and puts rare things (data, about, forum) in one menu.
- Next Spaceflight's top bar is Launches, Rockets, Reuse, Starship, Locations; its launch detail has no way back but the logo.
- NASA keeps a short top bar, groups many sections in one Explore menu, and uses the footer as the site index; it lists one popular
  item in two menus on purpose.

Rules taken: one tab per job and at most five; open on the answer; a detail one tap from its row, with real addresses so Back works and
a visible way back to the list; the countdown and Watch right after the name; the same names in the same order on a phone and a desktop;
rare things in one More menu and the footer.

## Defaults (no interview)

1. Four jobs in this order: Next (home), Launches, Go watch, Space now. Astro, Your launches and About are in More.
2. A phone's bottom bar has five items (four jobs and More); a desktop's top bar the same four names in the same order, then More.
3. Every page has a clear title, a way back and one main action; no dead ends.
4. Launch pages: name, countdown, Watch, Look Up, then Plan your trip, then details.
5. Keep what works; remove or merge duplicates (the Watch and Astro tabs, the Florida page) rather than add pages.
