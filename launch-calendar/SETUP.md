# Setting up your own Launch Calendar

Everything runs on **Cloudflare** — one account, nothing else to sign up for.
Budget about 20 minutes. You will end up with a private web address only your
team can open.

You do not need to be a developer, but you will type a few commands.

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

This is the only password. Everyone on the team uses the same one.

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
   and sign in.
2. Create a project if you do not have one.
3. **Create credentials → OAuth client ID → Web application**.
4. Under **Authorised JavaScript origins**, add your app's address, e.g.
   `https://launch-calendar.yourname.workers.dev` — no trailing slash.
5. Create it. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`).

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
