"""The sign in page, /signin/ (written only when sign in is on, auth.py): sign in with an Astro account or with Google, one account system
(Astro's), optional everywhere. Quiet and calm: the Astro mark, one heading, two buttons, one line on what the account is, the 18 and over
rule, links to Privacy and Astro's terms, and Continue without an account. The page's policy allows scripts from this site only and
data from this site and Astro's auth server. No hyphens in copy."""
import html

ASTRO = "https://astrosocial.io"

GOOGLE_G = ('<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">'
            '<path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>'
            '<path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>'
            '<path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>'
            '<path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>')

CSS = """
.si [hidden],.si[hidden]{display:none!important}.si{max-width:440px}.info:has(.si){max-width:520px}.info:has(.si) h1{font-size:clamp(36px,5vw,48px)}.si-mark{display:block;margin:8px 0 18px}
.si .sub{margin:10px 0 0;color:var(--fg-2)}.si-b{display:grid;gap:12px;margin:26px 0 0}
button.btn{font:inherit;font-weight:600;cursor:pointer;color:var(--fg)}.btn:focus-visible,.si input:focus-visible,.si a:focus-visible{outline:2px solid var(--cool);outline-offset:3px}
.si-btn{flex-direction:row!important;align-items:center;justify-content:center;gap:12px;width:100%;min-height:52px;font-size:16px!important;font-weight:600}
.si-btn svg{flex:0 0 auto}.si-form{display:grid;gap:8px;padding:16px;border-radius:12px;background:var(--glass),rgba(6,10,24,.6);box-shadow:var(--inner)}
.si-form label{font-size:15px;color:var(--fg-2);margin-top:4px}.si-form .btn{margin-top:10px;width:100%;min-height:48px}
.si input{min-height:48px;padding:0 14px;border:0;border-radius:10px;background:#0B1228;color:var(--fg);font:inherit;font-size:16px;box-shadow:inset 0 0 0 1px rgba(150,175,255,.22)}
.si-fine,.si-note,.si-legal{font-size:15px;color:var(--fg-2);line-height:1.5}.si-note{margin:22px 0 0}.si-legal{margin:10px 0 0}
.si-fine{margin:6px 0 0}.si-fine a,.si-note a,.si-legal a{color:var(--fg);text-underline-offset:3px}
.si-skip{margin:22px 0 0;width:100%;align-items:center}.si-msg{margin:20px 0 0;padding:12px 14px;border-radius:10px;color:var(--fg);background:rgba(255,84,104,.12);box-shadow:inset 0 0 0 1px rgba(255,84,104,.45);font-size:15px;line-height:1.45}
.si-msg.ok{background:rgba(141,180,255,.10);box-shadow:inset 0 0 0 1px rgba(141,180,255,.35)}
.si-who{display:flex;align-items:center;gap:16px}.si-who p{margin:0}.si-hi{font-size:18px;color:var(--fg)}.si-who p+p{color:var(--fg-2);font-size:15px}
.si .ul{margin-top:10px}.si-empty{color:var(--fg-2);font-size:15px}.si .acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
.si .acts .btn{min-height:48px;align-items:center}
"""


def page(ctx, auth):
    """the /signin/ page's HTML, through info_pages.page with its own policy (Astro's auth server added to connect-src)"""
    import info_pages
    e = html.escape
    ext = lambda u, t: f'<a href="{e(u)}" target="_blank" rel="noopener">{e(t)}</a>'
    open_astro = lambda cls: f'<a class="{cls}" href="{ASTRO}/app/" target="_blank" rel="noopener">Open Astro</a>'
    body = (
        f'<div class="si" id="authcfg" data-sb="{e(auth["url"])}" data-key="{e(auth["key"])}">\n'
        '<p class="sub">Use your Astro account, the same one you use on astrosocial.io. Everything on Astro Radar works without one: '
        'sign in only when you want something tied to you.</p>\n'
        '<div id="siMsg" class="si-msg" role="alert" hidden></div>\n'
        '<section id="siOut" aria-label="Ways to sign in">\n<div class="si-b">\n'
        '<button class="btn pri si-btn" id="siAstro" type="button" aria-expanded="false" aria-controls="siForm">'
        '<img src="/mark.svg" width="22" height="22" alt="">Continue with Astro</button>\n'
        '<form id="siForm" class="si-form" hidden novalidate>'
        '<label for="siEmail">Email</label><input id="siEmail" name="email" type="email" autocomplete="email" inputmode="email" required>'
        '<label for="siPass">Password</label><input id="siPass" name="password" type="password" autocomplete="current-password" required>'
        '<button class="btn pri" type="submit">Sign in</button>'
        f'<p class="si-fine">Forgot your password? {ext(ASTRO + "/app/", "Reset it in Astro")}.</p></form>\n'
        f'<button class="btn si-btn" id="siGoogle" type="button">{GOOGLE_G}Continue with Google</button>\n'
        '</div>\n'
        f'<p class="si-note">Astro is for people 18 and over. New to Astro? {ext(ASTRO + "/", "Create your account on astrosocial.io")} first, '
        'then come back and sign in.</p>\n'
        f'<p class="si-legal">Signing in uses Astro\'s {ext(ASTRO + "/terms/", "Terms")} and {ext(ASTRO + "/privacy/", "Privacy Policy")}. '
        'What Astro Radar keeps: <a href="/privacy/#account">Privacy</a>.</p>\n'
        '<a class="btn si-skip" id="siSkip" href="/">Continue without an account</a>\n'
        '</section>\n'
        '<section id="siIn" hidden aria-label="Your account">\n'
        '<div class="card si-who"><span id="siPlanet"></span><div><p class="si-hi">Signed in as <b id="siName"></b></p>'
        '<p>Your Astro account, on Astro Radar.</p></div></div>\n'
        '<h2 id="yours">Your launches</h2>\n<p>The launches you set reminders for in this browser.</p>\n<ul class="ul" id="siYours"></ul>\n'
        '<div class="acts"><a class="btn pri" href="/">Back to the radar</a>' + open_astro("btn") +
        '<button class="btn si-signout" type="button">Sign out</button></div>\n'
        '</section>\n'
        '<section id="siAge" hidden aria-label="Finish in Astro">\n'
        '<div class="card"><p>You are signed in, but Astro has not confirmed that you are 18 or older. Open Astro to confirm your age. '
        'Until then Astro Radar shows nothing from your Astro account.</p></div>\n'
        '<div class="acts">' + open_astro("btn pri") +
        '<button class="btn si-signout" type="button">Sign out</button></div>\n'
        '</section>\n'
        '<noscript><p class="si-note">Signing in needs JavaScript. Everything else on Astro Radar works without an account.</p></noscript>\n'
        '</div>')
    csp = ('<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\'; '
           f'font-src \'self\'; connect-src \'self\' {auth["origin"]}; manifest-src \'self\'; object-src \'none\'; base-uri \'self\'; '
           'form-action \'self\'">\n')
    head = ('<meta name="robots" content="noindex">\n<script src="/account.js" defer></script>\n<script src="/signin.js" defer></script>\n')
    h = info_pages.page("signin", "Sign in to Astro Radar",
                        "Sign in to Astro Radar with your Astro account or with Google. Optional: everything works without an account.",
                        body, ctx, here="signin", head=head, csp=csp)
    # the mark sits above the heading
    return h.replace('<main class="info">\n<h1>', '<main class="info">\n<img class="si-mark" src="/mark.svg" width="56" height="56" alt="">\n<h1>', 1)
