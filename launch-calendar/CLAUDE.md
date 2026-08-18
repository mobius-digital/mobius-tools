# Launch Calendar — instructions for Claude Code

This folder is a marketing planning board: a Next.js app that runs as a Cloudflare
Worker with a D1 (SQLite) database. Everything runs on one free Cloudflare account.
Human-facing docs: `START-HERE.md`, `SETUP.md`, `GUIDE.html`, `README.md`.

**If the person asks to set this up, install it, deploy it, get it running, or
says anything like "make this work" — follow the Setup runbook below, start to
finish, and do the work yourself.** Do not just point them at SETUP.md; they came
to you so they would not have to follow it by hand. Ask only the questions listed.
Report progress in one line per step, plainly.

The person is very likely **not a developer**. Keep explanations to a sentence.
Never ask them to edit a file — you edit it. Never paste a wall of terminal output
at them — read it yourself and say what it means.

---

## Is this a fresh install, or already set up?

Check `wrangler.jsonc`. If `database_id` is `PASTE_DATABASE_ID_HERE`, this is a
fresh install — run the runbook. If it holds a real id, the app is already set up:
ask what they want to do instead (redeploy after a change is `npm run deploy`;
everything else — password, who can sign in, event types, branding — is in the
app's Settings menu or `brand.config.ts`).

---

## Setup runbook

### 0. Before touching anything

Work out, without asking:

- **Operating system.** On Windows, PowerShell blocks `npm` and `npx` by policy.
  Use `npm.cmd` and `npx.cmd` for every command below. Try plain `npm` once; if
  it fails with "running scripts is disabled", switch and do not mention it again.
- **Where the folder is.** If the path contains `OneDrive`, `Dropbox`, `Google
  Drive` or `iCloud`, the build will fail with locked-file errors. Tell them in
  one sentence and offer to copy the folder to `C:\dev\launch-calendar` (Windows)
  or `~/dev/launch-calendar` (Mac) and continue there. Do it if they agree.
- **Node.js.** Run `node --version`. Need 18 or newer. If missing, send them to
  https://nodejs.org (LTS), and wait — you cannot install it for them.

Then ask exactly one thing up front, so you are not interrupting later:

> "Do you already have a Cloudflare account? It's free — if not, create one at
> https://dash.cloudflare.com/sign-up and tell me when you're in. That's the only
> account this needs."

### 1. Install dependencies

```
npm install
```

Takes a minute or two. Warnings are normal. Only stop on an actual error.

### 2. Connect to Cloudflare

```
npx wrangler login
```

This opens a browser. Tell them: "A browser tab just opened — click **Allow**,
then come back." Wait for the command to finish. Confirm with `npx wrangler whoami`.

### 3. Create the database

```
npx wrangler d1 create launch-calendar
```

The output contains a `database_id` (a 36-character uuid). **Copy it into
`wrangler.jsonc` yourself**, replacing `PASTE_DATABASE_ID_HERE`. Keep the quotes.

If it says *"A database with that name already exists"*, run
`npx wrangler d1 list`, take the id for `launch-calendar` from there, and paste
that instead.

### 4. Create the tables

```
npx wrangler d1 execute launch-calendar --remote --file=./db/schema.sql -y
```

**If this fails with an authentication error (code 10000)** — it sometimes does
with a fresh OAuth login — do not loop on it. Say: "Cloudflare's command line
won't let me create the tables from here, but the dashboard will. Open
https://dash.cloudflare.com → Storage & Databases → D1 → launch-calendar →
Console, paste in what I'm about to give you, and press Execute." Then print the
contents of `db/schema.sql` in one code block. Wait for them to confirm.

### 5. Set the first password

The app needs a starting password. It is changed from inside the app afterwards
(Settings → Change the team password) so this one is temporary. Two ways; offer
the first:

- **You generate one.** Make a random 16-character string, set it with
  `echo THE_VALUE | npx wrangler secret put APP_PASSWORD`, and tell them: "Your
  temporary password is `THE_VALUE`. You'll change it inside the app in a minute."
- **They type it themselves,** if they'd rather you never see it: they run
  `npx wrangler secret put APP_PASSWORD` in their own terminal and type it hidden.

### 6. Deploy

```
npm run deploy
```

Takes a minute or two. The last lines print the address, like
`https://launch-calendar.SOMETHING.workers.dev`. Keep it.

If it fails with **"permission denied" / EPERM / EBUSY** — the folder is in a
synced location (see step 0), or a previous build's process is still holding a
file. On Windows, `taskkill /F /IM workerd.exe` then retry once. If it still
fails, move the folder out of the synced location.

### 7. Verify — do not skip this

- `curl -s -o /dev/null -w "%{http_code}" ADDRESS/` should print `307` (the
  password gate redirecting).
- `curl -s -o /dev/null -w "%{http_code}" ADDRESS/password` should print `200`.
- If either returns `500`, the tables are missing — go back to step 4.

Then open the address in the browser for them and say:

> "It's live at ADDRESS. Sign in with the password, and the app will walk you
> through itself — take that tour, it has you create your first event. Then, in
> Settings (top right), change the password to a real one. When you're ready to
> bring the team in, `SETUP.md` has a message you can copy and send them, and
> `GUIDE.html` is the illustrated guide to pass around."

### 8. Offer the two optional things — do not do them unprompted

- **Branding.** "Want it in your colours? Give me your brand colours (hex codes),
  a font name, and a logo SVG, and I'll put them in — one file, then redeploy."
  Everything goes in `brand.config.ts`; the logo replaces `public/logo.svg` and
  should use `currentColor` so it picks up the accent. Then `npm run deploy`.
- **Google sign-in instead of a shared password.** "Later, if you'd rather people
  sign in with Google by invitation, that's switched on inside the app — I can
  walk you through the one Google step when you want it." Steps are in `SETUP.md`
  under "Optional: sign in with Google". Do not start this during first setup.

---

## Things not to do

- Do not run `wrangler login` more than once, or `d1 create` more than once.
- Do not put secrets or the database id anywhere but where they belong
  (`wrangler secret put`, `wrangler.jsonc`). Never commit `.dev.vars`.
- Do not modify anything under `app/`, `components/`, `lib/` during setup.
  Setup touches exactly one source file: `wrangler.jsonc`.
- Do not switch the app to Google sign-in during setup, and never turn off
  "Also accept the team password" for them — that toggle is the way back in if
  Google is misconfigured, and it is their call to make.
- Do not choose the team's real password. A temporary one you generate is fine;
  their real one they set in the app.

## Useful facts if something else comes up

- Redeploy after any change: `npm run deploy`.
- Tests: `npm test`. Typecheck: `npm run typecheck`.
- Local run: `npm run db:local`, put `APP_PASSWORD=anything` in `.dev.vars`,
  then `npm run preview`.
- All brand values live in `brand.config.ts` — nothing else contains a colour.
- Password, sign-in mode, invite list and event types are all in the database and
  changed from the app's Settings menu. No redeploy for any of them.
- Statuses and channels are deliberately not editable — the app branches on
  them. Event types are.
- Dates are `YYYY-MM-DD` strings throughout; never introduce `Date` round-trips.
