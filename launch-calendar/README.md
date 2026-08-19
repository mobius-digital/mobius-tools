# Marketing Calendar

A single source of truth for what's launching, when, and which marketing
channels need to care. Built to be screen-shared on a weekly marketing call.

It answers three questions:

1. What's happening over the next 4 weeks?
2. Is each date locked, or still soft?
3. What does my channel — paid, email, organic, SMS — need to do about it?

It is deliberately **not** a project manager. There are no tasks, subtasks or
checklists. Teams keep their own workflows; this is the shared picture above them.

---

## What you are looking at

This is a **Next.js application**, not a single HTML file. It needs Node.js to
build and a database to store anything, so you deploy it rather than opening it.
Both halves run on Cloudflare.

- **Frontend + backend:** Next.js (App Router) running as a Cloudflare Worker
- **Database:** Cloudflare D1
- **Access:** one shared password, or Google sign-in against an invite list —
  chosen from inside the app, no redeploy
- **Notifications:** optional Slack posts, driven by a five-minute cron trigger

Everything lives on Cloudflare — one account, one deploy, no third-party
database to sign up for.

## Commands

```bash
npm test          # 165 unit tests over dates, collisions, changelog, validation, channels and Slack
npm run typecheck # tsc --noEmit
npm run preview   # build and run the real Worker locally (needs .dev.vars + db:local)
npm run icons     # regenerate the home-screen icons from the logo + brand colours (needs Chrome)
npm run deploy    # build and publish to Cloudflare
```

## First-time setup

You need a Cloudflare account and nothing else.

```bash
npm install
npx wrangler login                        # opens a browser once
npx wrangler d1 create launch-calendar    # prints a database_id
```

Paste that `database_id` into `wrangler.jsonc`, then:

```bash
npm run db:remote                         # creates the tables
npx wrangler secret put APP_PASSWORD      # the shared team password
npm run deploy
```

That's it — you get a `*.workers.dev` URL. Every later change is `npm run deploy`.

To run it locally instead:

```bash
npm run db:local                          # local copy of the tables
echo "APP_PASSWORD=whatever" > .dev.vars
npm run preview                           # runs the real Worker locally
```

The app starts with an empty board and an invitation to add the first event.
No demo data ships with it.

## Making it yours

**Everything brand-specific lives in [`brand.config.ts`](brand.config.ts).**
That is the whole of it — no other file contains a colour, a font, a brand name
or a logo path. They all read from that config through CSS variables.

To rebrand:

1. Edit `brand.config.ts` — brand name, what the app calls itself
   (`productName`, "Marketing Calendar" by default), the short name under a
   home-screen icon (`shortName`, "Calendar" by default), colours, font family
   and weights.
2. Replace `public/logo.svg` with a roughly square mark. By default it is
   painted through a CSS mask in your accent colour, so a single-colour SVG
   works on any theme; set `logoTint: false` for a full-colour logo or PNG.
3. `npm run icons` — regenerates the home-screen icons in `public/icons/` from
   the logo and your colours (needs Chrome installed; or drop in your own PNGs
   with the same names).
4. `npm run deploy`.

Two worked examples sit next to it — `brand.config.example-dark.ts` and
`brand.config.example-light.ts`. Copy either over `brand.config.ts` to see the
entire app change theme with no code edits.

Things worth knowing before you pick a palette:

- `primaryText` sits on top of `primary`, so those two must contrast.
- `scrim` is the wash behind modals. It has to darken the page in a light theme
  *and* a dark one, so it is the one value that cannot be derived from the rest.
- Lettering uses a shade of `primary` pulled towards `text`, so a bright accent
  stays readable as small text. Fills and borders keep the pure colour. Both
  shipped palettes measure at WCAG AA or better.
- `font.family` is fetched from Google Fonts at runtime, so any family available
  there works without touching code.

## How it works

**Pipeline** is the default view and the one built for the Monday call. It shows
four weeks with attention deliberately falling off: this week gets a day rail
and full cards, week two condenses to dated lines, weeks three and four collapse
to a summary you can open. Launches and their run-up work are interleaved in
date order, because "assets due Wednesday" often matters more than a launch
three weeks out.

**Calendar** shows the same data as a timeline, month or week at a time. Events
span from teaser start through promo end. It warns when two launches that both
have a `primary` channel land within seven days of each other.

**Changelog** records every date, status, channel and name change automatically,
with before-and-after wording. It is written server-side on every edit, so it
cannot be skipped. Nobody has to remember to write it down.

**Slack notifications** are optional and off until configured. Each marketing
channel is mapped to a Slack channel in Settings; when an event is created,
moves its launch date, changes status, gains a channel, has its assets link
filled in, or has its note written or changed, every Slack channel mapped to
that event's channels hears about it —
leading with that channel's own role (primary / supporting / FYI), then the
brief, the note, the run-up dates, the owner, what changed, an *Open assets* button when
there is a folder, and a link that opens the event. One short message per event,
always — Slack folds tall attachments behind "Show more", so there is no digest
format. Edits to the same event within fifteen minutes of each other arrive as
one message, so a flurry of fixes is one post rather than five. A reminder goes
out one week before each launch, and optionally the day before.

**Channel filter** is on both views. Picking a channel narrows the board to what
that channel is involved in and elevates its most important work. The choice is
remembered per device and travels in the URL, so a filtered view can be shared.

### A few decisions you may want to revisit

- Dates are calendar dates with no time component, handled as `YYYY-MM-DD`
  strings throughout so a launch cannot appear to shift a day for viewers in
  another timezone.
- Event types and channels are both per-board, edited from Settings and stored
  in the database. They differ in kind: type is a label nothing reads, so it is
  free-form. Channels drive behaviour — the filter bar, "what's mine"
  elevation, clash detection, the Slack mapping — so what a board edits is the
  *set* of channels; the shape of one (a stable key, a label, a priority from
  primary / supporting / fyi) is fixed. Every event is read with the current
  list filled in, so an event saved before "Affiliate" existed still shows an
  Affiliate row. Status stays closed: the at-risk flag and "Show completed" read
  it, and a custom value would have no defined behaviour.
- Anyone past the gate can edit anything — there is one level of access, not a
  role system. The safeguard is visibility: every card shows who last touched it
  and when. Under Google sign-in that name is verified rather than self-declared.
- Google sign-in uses an ID token verified in the Worker against Google's
  published keys, checking audience, issuer, expiry and `email_verified`. Only a
  client ID is involved — no client secret to store. Membership is re-checked on
  every request, so removing somebody ends the session they already have open.
- The shared password lives in the database, not in a Cloudflare secret, so it
  can be changed from Settings without a redeploy. `APP_PASSWORD` seeds it on a
  fresh deployment.
- Slack posts are driven by a `scheduled` handler, which OpenNext's generated
  worker cannot carry — it is rewritten on every build. `worker-entry.js` wraps
  it: `fetch` passes straight through, `scheduled` is added alongside, and
  `wrangler.jsonc` points `main` at the wrapper. The tick reaches the app
  through a synthetic request to `/api/cron` rather than talking to D1 directly,
  so every lib keeps working unchanged; that route is excluded from the sign-in
  middleware and guarded instead by a nonce minted per tick and never leaving
  the isolate.
- The Slack bot token lives in the database like the team password, so
  notifications can be switched on from Settings with no redeploy. It is never
  returned to a browser — the settings API answers with a masked hint only.
- Slack is told about an edit in the same words the changelog uses, from the
  same diff, so the two can never describe one edit two different ways.
- The assets link is a field rather than a line in the notes because filling it
  in is a Slack trigger: a URL going from empty to set is unambiguous, where a
  notes edit cannot be told apart from a typo fix. It is one link — a folder —
  on purpose.
- Deleting means setting status to `cancelled`. The row survives so its history
  stays readable. Permanent deletion is behind a separate confirm.
- A launch whose date has passed but was never closed out does not disappear; it
  moves to a collapsed "past their launch date" strip.

## Status

Working and tested end to end against a real Cloudflare Worker and D1 database:
the password gate, event CRUD, the changelog, all three views, and the Slack
notification path — batching, trigger rules and the scheduled tick.

Two notes:

- **Updates are polled, not pushed.** The board re-checks the server every ten
  seconds and pauses while the tab is hidden. D1 has no realtime subscriptions,
  so a change made by someone else appears within about ten seconds rather than
  instantly. For a weekly planning board that is a fair trade for staying on one
  platform.
- **Browsers other than Chromium** have not been checked.
