# Sign in to Astro Radar: setup

Astro Radar can sign people in with their **Astro account**: the same account (Astro's Supabase project, `astro`,
`vxalwjzvlxtdcjcjvlqp`) on astroradar.io and astrosocial.io, so one person is one user on both. They can continue with Astro (the email and
password of their Astro account) or with Google. Signing in is optional: everything on the radar works without it.

It is built and tested, and it is **off**. With it off, the site is exactly what it was: no `/signin/` page, no Sign in link, no new
script and no new address in any security policy (`tests/test_signin.py` checks this). It goes on when you have done the steps below and
set `"on": true` in `data/config.json`.

## What is done and what is yours

| Step | Who | State |
|---|---|---|
| The `/signin/` page, the header control, sign out, Your launches | done in this branch | built, tested against a mock |
| The project URL and publishable key in `data/config.json` | done in this branch | filled in, switch off |
| Privacy, About and Astro pages say what sign in keeps | done in this branch | shown only when the switch is on |
| 1. Add the Radar address to Supabase's redirect list | **George** | to do |
| 2. Make a Google sign in client | **George** | to do |
| 3. Turn on Google in Supabase | **George** | to do |
| 4. Two security settings in Supabase (recommended) | **George** | to do |
| 5. Turn the switch on | **George** (a one line pull request) | to do |
| 6. Try it on the live site | **George** | to do |

Nothing in Astro's own repository has to change (see the end).

## 1. Supabase: allow Radar's return address

Supabase dashboard, project **astro** → **Authentication** → **URL Configuration**.

- **Site URL**: leave it as it is (Astro's).
- **Redirect URLs** → **Add URL**: `https://astroradar.io/signin/`
  - Exactly that, with the slash at the end. Do not use a wildcard such as `https://astroradar.io/**`: only this one page may receive a
    sign in code.
  - Optional, only while testing on your computer: `http://localhost:8000/signin/`. Remove it afterwards.

## 2. Google: make a sign in client

Google Cloud console (console.cloud.google.com), with the Google account that should own Astro's sign in:

1. Make or pick a project, for example "Astro".
2. **APIs and Services** → **OAuth consent screen** (Google calls it Google Auth Platform → Branding):
   - User type: **External**. App name: **Astro**. Support email: Astro's support address. Logo: the Astro mark (optional).
   - **Authorized domains**: `astrosocial.io`, `astroradar.io` and `supabase.co`.
   - Links: the privacy policy `https://astrosocial.io/privacy/` and terms `https://astrosocial.io/terms/`.
   - Scopes: only `openid`, `email` and `profile` (the defaults). Nothing else.
   - Publish the app (from Testing to In production) when you are ready for anyone to sign in; with these basic scopes Google needs
     no review.
3. **Credentials** → **Create credentials** → **OAuth client ID**:
   - Application type: **Web application**. Name: "Astro Supabase".
   - **Authorized JavaScript origins**: `https://astroradar.io` and `https://astrosocial.io`.
   - **Authorized redirect URIs**: `https://vxalwjzvlxtdcjcjvlqp.supabase.co/auth/v1/callback` (Google sends people back to Supabase, and
     Supabase sends them on to the Radar page from step 1).
4. Copy the **Client ID** and the **Client secret**. The secret goes only into Supabase in step 3: never into this repository, a
   pull request, a chat or the site.

## 3. Supabase: turn on Google

Supabase dashboard → **Authentication** → **Sign In / Providers** → **Google**:

- **Enable Sign in with Google**: on.
- **Client IDs**: paste the Client ID. **Client Secret**: paste the Client secret. Save.

Do this before step 5: until Google is on here, Continue with Google takes people to a plain error page on Supabase's own address
(the browser has already left Radar, so Radar cannot word it).

## 4. Supabase: two recommended security settings

- **Authentication** → **Attack Protection** → **Leaked password protection**: turn it on. Radar takes Astro passwords, and
  Supabase's security advisor flags this as off today.
- **Authentication** → **Sessions**: decide how long a sign in lasts. By default a session lasts until sign out (the hourly token renews
  itself while a page is open). On the Pro plan you can set an inactivity timeout, for example 30 days, and a time box. Radar's Privacy
  page says "Astro's sign in service decides how long the session lasts in all", so any setting stays true.

## 5. Turn the switch on

In a pull request, change one line of `data/config.json`:

```json
"on": true
```

The URL and the publishable key are already there. The publishable key is meant to be public: it only identifies the project, and what
it can read is decided by row level security in Astro's database. The build refuses a secret key (`sb_secret_...` or a `service_role`
key) and stops, so one can never reach the site by mistake.

When it merges, the next deploy builds `/signin/`, puts Sign in in every page's header and lets every page's policy reach
`https://vxalwjzvlxtdcjcjvlqp.supabase.co`. To turn it off again, set `"on": false`.

## 6. Try it on the live site

1. Open https://astroradar.io/ and press **Sign in** (top right).
2. **Continue with Astro** with your Astro email and password. You come back to the radar with your Astro name and planet at the top.
3. Open the menu: **Your launches** (your reminders in this browser), **Open Astro**, **Sign out**. Sign out: Sign in is back.
4. **Continue with Google** with a Google address that is also your Astro email. You come back signed in as the same Astro user: Supabase
   links a Google sign in to the existing account with the same verified email (all 13 Astro accounts had a confirmed email on
   November 15, 2026).
5. **Continue with Google** with a Google address that has no Astro account: Radar says to create the account on astrosocial.io first.

## What Astro's repository needs

Nothing, for this to work. Notes for Astro's own work:

- **New accounts stay in Astro.** Astro's `handle_new_user` trigger refuses a new user without the 18 and over confirmation. Google cannot
  give that confirmation, so a Google address with no Astro account cannot create one from Radar: Supabase returns "Database error saving
  new user" and Radar tells the person to sign up on astrosocial.io. This is on purpose: Astro's age check happens in Astro.
- **If Astro adds Google to its own app later**, its sign up would hit the same rule. One way: let the trigger create the profile with
  `age_confirmed_at` empty for a Google sign up, and let Astro's existing "Confirm you're 18 or older" screen (`confirm_age`) finish it.
  Radar already treats an empty `age_confirmed_at` as not signed in to anything of Astro's.
- **Security advisor**: Supabase lists warnings in Astro's project that are Astro's to review: SECURITY DEFINER functions callable by
  signed out and signed in users, a function with no fixed `search_path`, and leaked password protection off (step 4).

## How it works, for the next person

- `auth.py`: the switch, the key and URL checks, the header control and its styles. `signin_page.py`: the page. `src/account.js`: the
  header control on every page and the shared client. `src/signin.js`: the page's buttons. `assets/vendor/supabase.js`: supabase-js
  2.118.0 (MIT), downloaded only on `/signin/` or once someone is signed in.
- PKCE: Google returns a one time code to `/signin/`, which is exchanged for a session only with the verifier this browser kept. Only
  `/signin/` exchanges codes (`detectSessionInUrl` is off everywhere else). After sign in it returns to where you were (`?next=`, a path on
  this site only).
- What it reads: `profiles.display_name, planet, color, age_confirmed_at` of the signed in user's own row (Astro's policy allows a person
  their own row). Nothing of Astro's is shown until `age_confirmed_at` is set.
- Tests: `tests/test_signin.py` (switch, keys, the built site), `tests/signin_next.test.mjs` (where sign in returns to),
  `tests/signin.cjs` (the whole flow against `tests/mock_supabase.py`, at 390 and 1440).
