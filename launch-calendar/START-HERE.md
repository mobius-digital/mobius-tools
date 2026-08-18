# Launch Calendar — start here

You have been sent a marketing planning board: one shared picture of what is
launching, when, and which channels need to care about it. Built to be
screen-shared on a weekly marketing call.

This folder holds everything needed to run your own copy. Nothing in it is
connected to anyone else's — you set it up under your own Cloudflare account and
it is yours.

## What is in the folder

| File | What it is | Read it when |
|---|---|---|
| **`SETUP.md`** | Step-by-step installation, about 20 minutes | Now — this is the one to follow |
| **`GUIDE.html`** | Illustrated guide to using the board, with screenshots. Open it in any browser. | After setup — and send it to your team |
| `README.md` | Technical overview for whoever maintains it | If you are a developer, or hand it to one |
| `brand.config.ts` | Every colour, the font, the name and logo — the one file to change to make it yours | After setup, when you want it branded |
| `PRD.md` | The original product spec — why it works the way it does | Only if you want the reasoning |
| everything else | The application source | Leave it alone unless you know what it is |

## The short version

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
  are yours to rename — Settings → Event types.

## If you get stuck

The bottom of `SETUP.md` lists the errors people actually hit and what each one
means. Almost all of them are one of two things: a Windows setting that blocks
`npm` (add `.cmd`), or the folder sitting inside OneDrive or Dropbox (move it).
