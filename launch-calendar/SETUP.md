# Setting up your own Launch Calendar

Everything runs on **Cloudflare** — one account, nothing else to sign up for.
Budget about 20 minutes. You will end up with a private web address only your
team can open.

You do not need to be a developer, but you will type a few commands.

> **Using Claude Code?** You can skip all of this: open the folder in Claude Code
> and type `/setup`. It runs these same steps for you and asks only what it must.
> This document is the by-hand version, and the reference if anything goes wrong.

---

## Before you start

You need two things installed:

1. **Node.js** — download the LTS version from [nodejs.org](https://nodejs.org)
   and run the installer.
2. **A Cloudflare account** — free, at [dash.cloudflare.com](https://dash.cloudflare.com).

Then unzip this folder somewhere sensible.

> **Windows tip:** put it somewhere like `C:\dev\launch-calendar` rather than
> inside OneDrive, Dropbox or Google Drive. Those services lock files while they
> sync, which makes builds fail with a "permission denied" error.

---

## Step 1 — Open a terminal in the folder

**Windows:** open the folder in File Explorer, click the address bar, type
`powershell`, press Enter.

**Mac:** right-click the folder → Services → New Terminal at Folder.

> **Windows tip:** if a command fails with *"running scripts is disabled on this
> system"*, add `.cmd` — so `npm.cmd` instead of `npm`, and `npx.cmd` instead of
> `npx`. This applies to every command below.

---

## Step 2 — Install

```bash
npm install
```

Takes a minute or two. Lots of text is normal.

---

## Step 3 — Connect to Cloudflare

```bash
npx wrangler login
```

A browser window opens. Click **Allow**. Come back to the terminal.

---

## Step 4 — Create the database

```bash
npx wrangler d1 create launch-calendar
```

This prints a block of text containing a `database_id` — a long string like
`a1b2c3d4-e5f6-7890-abcd-ef1234567890`. **Copy it.**

Open `wrangler.jsonc` in any text editor. Find this line:

```
"database_id": "PASTE_DATABASE_ID_HERE"
```

Replace `PASTE_DATABASE_ID_HERE` with the id you copied, keeping the quotes.
Save the file.

---

## Step 5 — Create the tables

```bash
npx wrangler d1 execute launch-calendar --remote --file=./db/schema.sql
```

Answer **Y** if it asks whether to proceed.

> **If this fails with an authentication error**, use the dashboard instead:
> go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Storage &
> Databases** → **D1** → **launch-calendar** → **Console**, then paste in the
> contents of `db/schema.sql` and hit Execute. Same result.

---

## Step 6 — Choose your team password

```bash
npx wrangler secret put APP_PASSWORD
```

It asks for a value. Type the password your team will use and press Enter.
**Nothing appears as you type — that is normal.**

Everyone on the team uses the same one. You can change it later from inside the
app, or switch to Google sign-in — no terminal needed for either.

---

## Step 7 — Put it live

```bash
npm run deploy
```

Takes a minute or two. At the end it prints your address:

```
https://launch-calendar.YOUR-NAME.workers.dev
```

Open it. You should see a password screen, and your password gets you in to an
empty board.

**You are done.** Send that address and the password to your team.

---

## Your first ten minutes on the board

Before you send anyone the link, do these yourself once so you can answer the
first question that comes back:

1. **Open the address.** Sign in with the password from Step 6.
2. **Take the walkthrough.** It starts on its own the first time. It has you
   create your first event and explains every field as you reach it. About four
   minutes. Skip it if you must — it is under Settings → Replay the walkthrough
   any time.
3. **Change the password** — Settings → Change the team password. The one you
   typed in Step 6 has been in a terminal window; pick the real one now.
4. **Rename the event types** if yours differ — Settings → Event types. "Content
   Moment" may not be what your team calls it.
5. **Put two or three real launches on the board** so it is not empty when the
   team arrives. An empty board teaches nothing.

Then send the message below.

## A message to send your team

Copy, fill in the two blanks, send. It is deliberately short.

> **Subject: The launch calendar is live**
>
> Hi all — one place for what's launching, when, and which channels need to
> care. It replaces the "when is X going out again?" thread.
>
> Link: `[YOUR ADDRESS]`
> Password: `[YOUR PASSWORD]`
>
> Two minutes when you first open it: it walks you through itself, and asks
> for your name so edits are stamped with who made them.
>
> The habit that makes it work: if you know a date, put it on the board. If a
> date moves, move it there first. Mark it **Tentative** if it might still
> move — the whole thing rests on people being honest about that.
>
> Filter to your channel top-left and you'll only see what involves you.

If you switch to Google sign-in later, swap the password line for *"Sign in
with your Google account — I've added you."*

---

## Making it look like your brand

Open **`brand.config.ts`**. That one file holds every colour, the font, and the
name. Nothing else in the codebase contains a brand value.

```ts
export const brand = {
  name: "Your Brand",
  logoUrl: "/logo.svg",
  colors: {
    background: "#F7F7F8",   // the page
    surface:    "#FFFFFF",   // cards and panels
    primary:    "#2563EB",   // your accent colour
    primaryText:"#FFFFFF",   // text sitting on the accent
    text:       "#18181B",
    textMuted:  "#6B7280",
    danger:     "#B91C1C",
    tentative:  "#8B8B93",
    scrim:      "#18181B",   // the dim behind pop-up panels
  },
  font: {
    family: "Inter",         // any font from Google Fonts
    headingWeight: 700,
    bodyWeight: 400,
  },
};
```

Change the values, then replace `public/logo.svg` with your own logo. Draw it
using `currentColor` and it picks up your accent automatically.

Then:

```bash
npm run deploy
```

Two finished examples sit beside it — `brand.config.example-dark.ts` and
`brand.config.example-light.ts`. Copy either one over `brand.config.ts` and
deploy to see the whole app change.

**Three things worth knowing when picking colours:**

- `primaryText` sits on top of `primary`, so those two must contrast — dark text
  on a light accent, or white text on a dark one.
- `scrim` is the dim layer behind pop-up panels. It needs to darken the page
  whether your theme is light or dark, so keep it dark.
- Small text in your accent colour is automatically darkened (or lightened on a
  dark theme) so it stays readable. Buttons and borders keep the pure colour.

---

## Optional: sign in with Google instead of a shared password

Rather than one password everybody shares, you can invite people by email and
have them sign in with their own Google account. Only the addresses you list can
get in, and every edit is stamped with a **verified** name instead of one the
person typed themselves.

It is all set up inside the app — **Settings → Who can sign in** — and takes
effect immediately. There is nothing to redeploy.

**One thing to get first: a Google client ID.**

1. Go to [Google Cloud → Credentials](https://console.cloud.google.com/apis/credentials)
   and sign in with the Google account you run the business from.
2. Create a project if it asks (any name — "Launch Calendar" is fine).
3. **Create credentials → OAuth client ID.**
   - If it says *"you must first configure your consent screen"*, click
     **Configure consent screen → Get started**. App name `Launch Calendar`,
     your email as support and contact. For **Audience** choose **External**
     unless every single person is on your own Google Workspace domain — External
     is what lets a Gmail address or a freelancer in. Agree and create.
   - Then in the left menu open **Audience** and click **Publish app**. Without
     this Google only lets in people you have separately listed as "test users",
     which duplicates the invite list you are about to manage in the app.
   - Now back to **Clients → Create client**.
4. Application type **Web application**. Name it anything.
5. Under **Authorised JavaScript origins** click **Add URI** and paste your app's
   address exactly, e.g. `https://launch-calendar.yourname.workers.dev` — no
   trailing slash. Leave *redirect URIs* empty.
6. Create it. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
   Ignore the client secret — this app never uses it.

The client ID is not a secret; it is visible in every page that offers a Google
button. You do not need the client secret at all.

**Then, in the app:**

1. **Settings → Who can sign in**
2. Paste the client ID into the Google client ID box and press **Save**
3. Add each person's email under **Invited people**
4. Choose **Google sign-in, by invitation**

Send everyone the same link as before. They will get a Google button instead of
a password box.

**Leave "Also accept the team password" ticked until you have confirmed Google
sign-in works.** It is the way back in if the client ID is wrong. Untick it once
somebody has signed in successfully with Google.

Adding or removing someone later is the same screen, and takes effect at once —
a person you remove is signed out on their next page load.

> Signing in with Google needs a Google account on that address — a Workspace
> address or a Gmail. It does not have to be a Workspace domain.

---

## Everyday use

| What you want | What to do |
|---|---|
| Publish any change | `npm run deploy` |
| Change the team password | **Settings → Change the team password**, inside the app |
| Invite or remove people | **Settings → Who can sign in**, inside the app |
| Rename or add event types | **Settings → Event types**, inside the app |
| Try changes before publishing | `npm run preview` |

Changing the password signs everyone else out — you stay signed in — and the
change is recorded in the changelog. It needs the current password, so an
unattended laptop cannot be used to lock the team out.

---

## If something goes wrong

**"running scripts is disabled on this system"** — add `.cmd`: `npm.cmd`,
`npx.cmd`.

**"permission denied" during deploy** — the folder is inside OneDrive, Dropbox
or Google Drive. Move it somewhere like `C:\dev\` and try again.

**"A database with that name already exists"** — you already made it. Run
`npx wrangler d1 list` to see its id, and carry on from Step 4's paste.

**The site says it cannot reach the database** — Step 5 did not complete, or the
`database_id` in `wrangler.jsonc` is wrong. Check it matches `wrangler d1 list`.

**The site says no APP_PASSWORD is set** — redo Step 6, then `npm run deploy`.

**The site shows an error mentioning `settings` or `allowed_emails`** — a table is
missing. Run Step 5 again; it is safe to repeat.

**The "Google sign-in, by invitation" option is greyed out** — it says why
underneath: it needs the client ID saved *and* at least one email invited before
it can be chosen, so that switching can never lock everybody out.

**Google says "Access blocked" or "app has not been verified"** — the consent
screen is still in testing. In Google Cloud go to **Audience → Publish app**.

**Google says "origin mismatch"** — the JavaScript origin in Google Cloud does not
exactly match your address. Check for a trailing slash or `http` vs `https`.

**Someone was invited but cannot get in** — check the address you invited is the
one they are signing in to Google with. A work address and a personal Gmail are
different accounts.
