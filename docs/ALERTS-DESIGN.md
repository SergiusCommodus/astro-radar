# Launch day alerts: design

Status: design only, written October 30, 2026. Nothing here collects data or runs a server. The one safe part, a calendar
subscription and a per launch calendar file, is built (see "What is built" at the end).

## The goal

Someone who cares about a launch wants a nudge before it: the day before, and shortly before liftoff, with the latest time,
since launch times move. Radar has no accounts today and keeps nothing about its visitors except what sits in their own browser
(the home ZIP and their reminders). Any alert that reaches a person when the page is closed needs one of three things:
their calendar, a push channel, or their email address.

## Three options

### 1. Astro app push, through the existing `astro-push` function

How it would work: a person who has the Astro app (or Astro's web push turned on) taps "Remind me on Astro" on a launch. Astro
stores that reminder against their Astro account; a scheduled call to `astro-push` (it already runs every 15 minutes for the
"morning" plan notices, and hourly for "soon") sends the launch reminder through Web Push and Apple's push service.

- Cost: no new service. `astro-push` runs as a Supabase Edge Function, already inside Astro's plan. A new database step for a
  `launch_reminders` table (user, launch id, when) and a new `kind: 'launch'` in the function. Launch times would need to come
  from Radar's feed (the Worker or `launches.json`), read by the function on its schedule.
- Privacy and consent: covered by Astro's account and its existing notification consent (people already opt in to push per
  device and can mute it). Radar itself still stores nothing; the reminder lives in Astro. Astro's privacy policy and App Store
  privacy labels would need a line for "launch reminders".
- Abuse risks: low. Only signed in people can create reminders, for themselves only; no free text goes into a notification
  (the title and time come from the feed). Needs a cap per account (for example 50 open launch reminders) so one account cannot
  make the scheduler do unbounded work.
- Limits: only people with Astro (18 and over). Needs a change in the astro-app repo, its own gate and release.
- Time zones: the push is sent at an absolute time (UTC); the text can say "in 30 minutes", which is right in every zone.

### 2. Email through a Cloudflare Worker cron and Resend

How it would work: a "Email me before launch" form takes an address and a launch. A Worker stores a pending signup, sends a
confirmation email (double opt in), and only after the click stores the subscription. A cron trigger every few minutes finds
launches about to start (from the same feed the Radar Worker already caches) and sends through Resend.

- Cost: Resend's free tier is 3,000 emails a month and 100 a day (3 domains); Pro is $20 a month for 50,000 with no daily cap
  (resend.com/pricing, checked October 30, 2026). Cloudflare Workers Free allows 100,000 requests a day, and D1's free tier is
  5 million rows read and 100,000 written a day, 5 GB stored (developers.cloudflare.com/workers/platform/pricing). A launch with
  a few hundred subscribers and two emails each would pass the 100 a day free limit quickly, so plan on Pro once it is used.
- Privacy and consent: this is the first time Radar would hold personal data. It needs a privacy policy and terms page, double
  opt in, a one click unsubscribe in every email (and the `List-Unsubscribe` header), deletion of the address when the last
  reminder is sent or on request, CAN-SPAM compliance (a postal address in each email), and care with GDPR if people outside
  the US sign up. Resend becomes a processor of those addresses. The sending domain needs SPF, DKIM and DMARC.
- Abuse risks: the highest of the three. A form that sends email can be used to send unwanted mail to someone else (double opt
  in limits it to one confirmation email, but that still needs rate limits per IP and per address, and a bot check such as
  Turnstile). Bounces and complaints must be watched, or the domain's reputation drops. Secrets (the Resend key) live in the
  Worker's secrets, never in the repo.
- Limits: email arrives late or in spam; launch times move after the email is sent, so the email should link to the live page.
- Time zones: send at UTC times; write the launch time in the email in the reader's zone only if they gave one, otherwise in UTC
  and the pad's zone, with a link that shows their own.

### 3. Calendar subscription (an .ics feed) and a per launch Add to calendar

How it would work: the build already has every upcoming launch. It writes `launches.ics`, a calendar feed with every launch and
two alerts each (a day before and 30 minutes before), and each launch page gets its own `launch.ics`. A person subscribes once
(`webcal://astroradar.io/launches.ics`); their calendar app polls the feed, so moved launch times update by themselves.

- Cost: nothing. Static files, rebuilt with the site every 30 minutes.
- Privacy and consent: nothing collected. The calendar app fetches a public file; GitHub Pages logs are not used. Subscribing and
  unsubscribing are done in the person's own calendar.
- Abuse risks: none on Radar's side (nothing is sent to anyone). The only care: the feed is public data from Launch Library, so
  it must never contain anything else, and text from the feed is escaped as calendar text.
- Limits: calendar apps refresh subscriptions on their own schedule (Apple Calendar can be set to every 5 minutes to weekly,
  Google Calendar can take many hours to a day and ignores the refresh hint), so a time change can reach a Google
  calendar late. Every event says the time can move and links to the launch page. All launches come in one feed; a per provider
  feed could come later.
- Time zones: every time is written in UTC (`20261030T111600Z`), so each calendar shows it in its own zone, with no time zone
  tables to get wrong.

## Recommended order

1. Calendar subscription and per launch calendar files (done here): zero cost, zero data, zero abuse surface, and moved times
   update by themselves in the calendar.
2. Astro app push: for people who already have Astro, using the consent, devices and function Astro already has. One database
   step, one new kind in `astro-push`, its own gate in astro-app.
3. Email, only if people ask for it and after a privacy policy, terms, double opt in, rate limits and a bot check are in place.
   It is the only option that makes Radar a holder of personal data.

## What is built (October 30, 2026)

- `launch_pages.py` writes `dist/launches.ics` (every upcoming launch not yet flown) and `dist/launch/<id>/launch.ics` for each
  launch page, at build time, from the inlined feed only.
- Every event: a stable UID (`<launch id>@astroradar.io`, so a subscribed calendar updates the event instead of adding a new one),
  times in UTC, a 30 minute block, the pad as the location, the official webcast in the description, a link to the launch page,
  "Time to be confirmed" for a launch whose time is not set, and two alerts (a day before, 30 minutes before). Lines are folded
  at 75 octets and text is escaped (RFC 5545).
- The feed carries `REFRESH-INTERVAL` and `X-PUBLISHED-TTL` of one hour as a hint to calendar apps.
- The page: "Subscribe to calendar" (a `webcal://` link, with the https address to copy for Google Calendar) in the Launches tab
  and the footer; "Add to calendar" on each launch page and in the hero and every row, as before.
- `tests/test_launch_pages.py` checks the files: UTC times equal the feed's, folding, escaping, alerts, and that nothing
  outside the feed appears.
