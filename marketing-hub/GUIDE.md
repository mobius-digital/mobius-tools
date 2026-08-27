# Lineup — how to run it

The README and CLAUDE.md explain Lineup to whoever is changing the code. This
explains it to whoever is *using* it: what the thing is, how to put a client on
it, and what to do when something looks wrong.

---

## What it is

One marketing calendar, serving every client from one address.

A **board** shows what is going live over the next few weeks, whether each date
is locked or still soft, and which marketing channels need to do something
about it. Every client gets their own board, at their own address, in their own
colours. They cannot see each other.

Everyone at Mobius who works across brands sees a **switcher** at the top left
and moves between boards without signing in again.

The product is called **Lineup** everywhere a person can see it — a client's
browser tab, their sign-in card, their Slack posts, their home-screen icon.
Their own name and logo sit beside it, and their colours are on everything.
That name lives in one file, `hub.config.ts`, and nowhere else.

---

## Putting a client on it

**Clients → ＋ Add client.** You need three things and you have all of them
already:

1. **Their name** — as it should read on their board.
2. **Three colours** — accent, page background, text. Everything else in the
   calendar is worked out from those, so you are not picking a palette, you are
   picking three anchors. The preview shows the result as you go.
3. **A logo, optionally.** SVG is best: it stays sharp and gets painted in
   their accent colour. PNG and JPEG work too — pick one and you are asked to
   **position it in a square**, because every place a mark appears is a square.
   It opens fitted, with the whole file visible and nothing cut; drag to move
   it and zoom in to crop. If the file sits on a flat colour — most logo
   exports sit on white — tick **Drop the flat background** and it is cleared
   from the edges inwards, leaving anything enclosed by the mark alone. Up to
   1 MB.

   The preview beside the picker shows exactly what will appear. If it looks
   wrong there, it will look wrong on their board.

Press **Create the board** and it exists — no deploy, no waiting. You are shown
a generated **team password** once. Copy it then; it is not shown again. You can
always issue a new one from the card.

### Sending it to them

They need two things: the link on their card (`/b/<their-name>/`) and either

- **the team password** — anyone with the link and the password gets in, or
- **an invitation** — add their email under *Who can sign in with Google* on
  their card, and they sign in with their own Google account.

Both doors stay open. Invitations take effect immediately, and removing someone
signs them out on their next page load.

---

## Connections — the two accounts every board borrows

**Clients → Connections.** These are Mobius's own accounts, one of each, shared
by every board. Clients never see this screen.

- **Google sign-in** — the client ID that lets people sign in with Google. Not
  a secret; every site with a Google button publishes its own.
- **Slack** — the bot token from the Slack app's *OAuth & Permissions* page,
  starting `xoxb-`. It needs `chat:write`, `channels:read` and `groups:read`,
  and the bot has to be invited to each channel it should post in
  (`/invite @your-bot`).

Both fields are **write-only**. What comes back is a masked hint — enough to
recognise which token is in place, never enough to use. A connected Slack reads
`connected · xoxb-…nJ0B`. That is what "it is set" looks like; there is no
version of this screen that shows you the token back.

Connecting a new token replaces it for every client at once. Each board keeps
its own channel mapping.

---

## What a client does on their board

They do not need any of the above. Their board has:

- **Pipeline** — what is coming, grouped by week.
- **Calendar** — the same thing as a month.
- **Changelog** — who changed what, written automatically on every edit.

And a **Settings** window, which is theirs to run:

| Section | What it is for |
| --- | --- |
| Your account | The name stamped on their edits |
| Walkthrough | Replaying the two-minute tour |
| Add to your phone | The two taps that install the board as an app |
| Event types | Renaming the options in the Type dropdown, or adding their own |
| Channels | Their marketing channels — each gets a filter, a row on every event, and a Slack channel |
| Slack notifications | Which Slack channel hears about which marketing channel, and reminder timing |
| Users | Who can open the board, and the shared team password |

A **two-minute walkthrough** opens by itself the first time anyone opens a
board, and is remembered per board — so a new team handed their own board still
gets it, even if you have seen the tour elsewhere. Anyone can replay it from
Settings → Walkthrough.

---

## Slack notifications

A board posts when an event is created, moves its launch date, changes status,
gets its assets link, or has its note written — to every Slack channel mapped to
a marketing channel on that event. Several edits to one event inside 15 minutes
arrive as one message, not five. There is a reminder a week before each launch,
and optionally the day before.

Setting it up, per board: **Settings → Slack notifications**, pick a Slack
channel for each marketing channel, then turn the switch on. The switch stays
off until a token is connected and at least one channel is mapped, so nobody
turns on notifications with nowhere to go.

If a channel is listed as *"— invite the bot first"*, that is exactly what it
means: `/invite @your-bot` in that channel.

---

## When something looks wrong

**A board shows the generic calendar mark instead of their logo.** No logo has
been uploaded for them. Clients → Edit brand.

**A logo looks stretched or crushed.** It was saved before the square-up step
existed. Re-upload it through Clients → Edit brand and position it.

**A logo has a white box behind it.** The file is on an opaque white
background. It is invisible on this app's pale surfaces and obvious anywhere
else. Re-upload it and tick *Drop the flat background*.

**A card says "7 events" but the board looks empty.** Cancelled and completed
events are hidden on the planning views by default. The card says
`nothing live · 7 archived` when that is the case.

**Slack says nothing.** In order: is a token connected (Connections), is a
channel mapped for the marketing channel on that event, is the switch on, and
has the bot been invited to that Slack channel.

**Somebody cannot sign in.** Either their email is not on the board's Users list
*and* they do not have the team password, or the password has been changed since
they last used it. Changing the team password signs everybody out, on purpose.

**A client's board is gone / wrong.** There is no undo on Delete client — it
takes the board, every event, the full history, everyone's access and the Slack
settings. That is why it makes you type the name.

---

## Running it

Everything lives in one Cloudflare Worker and one D1 database.

```
npm run deploy     # build and ship
npx wrangler tail launch-calendar   # watch it live
```

The worker is *named* `launch-calendar` on purpose: that name owns the URL
Google sign-in is registered against, the team's bookmarks, and the account's
cron slot. Renaming it abandons all three. The product is still called Lineup
everywhere a person can see.

A cron tick every five minutes flushes the Slack batch window and runs the daily
reminder sweep, for every brand. A board with no Slack configured does nothing.
