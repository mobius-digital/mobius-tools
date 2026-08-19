# Marketing Calendar — start here

You have been sent a marketing planning board: one shared picture of what is
launching, when, and which channels need to care about it. Built to be
screen-shared on a weekly marketing call.

This folder holds everything needed to run your own copy. Nothing in it is
connected to anyone else's — you set it up under your own Cloudflare account and
it is yours.

## What is in the folder

| File | What it is | Read it when |
|---|---|---|
| **`CLAUDE.md`** | Setup instructions for Claude Code — it reads this on its own | You don't; Claude does |
| **`SETUP.md`** | The same installation, step by step, for doing it by hand | If you are not using Claude Code |
| **`GUIDE.html`** | Illustrated guide to using the board, with screenshots. Open it in any browser. | After setup — and send it to your team |
| `README.md` | Technical overview for whoever maintains it | If you are a developer, or hand it to one |
| `brand.config.ts` | Every colour, the font, the name and logo — the one file to change to make it yours | After setup, when you want it branded |
| `PRD.md` | The original product spec — why it works the way it does | Only if you want the reasoning |
| everything else | The application source | Leave it alone unless you know what it is |

## Using Claude Code? Do this instead

Open this folder in Claude Code and type:

```
/setup
```

(or just say *"set this up for me"*). Claude reads the instructions bundled in
this folder, runs the installation itself, asks you the one or two things only
you can answer — mainly clicking **Allow** when Cloudflare opens a browser tab —
and hands you the live address at the end. About ten minutes. It knows about
the Windows and OneDrive traps and steers around them.

You need Node.js installed (https://nodejs.org, the LTS button) and a free
Cloudflare account (https://dash.cloudflare.com/sign-up). Claude will check for
both and tell you if either is missing.

## Doing it by hand instead

1. Open **`SETUP.md`** and follow it top to bottom. It assumes you are not a
   developer. You will type a few commands; each one is given to you exactly.
2. When it prints your address, open it, sign in, and take the built-in
   walkthrough — the app teaches itself.
3. Change the password from inside the app (Settings → Change the team password).
4. Send your team the address. `SETUP.md` has a message you can copy and paste.

## What it costs

Nothing, on Cloudflare's free tier, at any team size this tool is built for. No
card needed to set it up.

## Two decisions you can make later, from inside the app

- **How people sign in.** It starts with one shared password. When you want, you
  can switch to inviting people by email and having them sign in with Google
  instead — Settings → Who can sign in. `SETUP.md` covers the one-time step.
- **What you call things.** The event types (Product Launch, Promo, Restock…)
  are yours to rename — Settings → Event types. The marketing channels (Paid,
  Email, Organic, SMS) are yours to add to — Settings → Channels.
- **Whether Slack hears about it.** The board can post to Slack when a launch is
  added, moved or changes status, and remind you a week before each one — one
  Slack channel per marketing channel. Off until you set it up; `SETUP.md`
  covers the one-time step.

## If you get stuck

The bottom of `SETUP.md` lists the errors people actually hit and what each one
means. Almost all of them are one of two things: a Windows setting that blocks
`npm` (add `.cmd`), or the folder sitting inside OneDrive or Dropbox (move it).
