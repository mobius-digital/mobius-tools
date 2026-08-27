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
colors. They cannot see each other.

Everyone at Mobius who works across brands sees a **switcher** at the top left
and moves between boards without signing in again.

The product is called **Lineup** everywhere a person can see it — a client's
browser tab, their sign-in card, their Slack posts, their home-screen icon.
Their own name and logo sit beside it, and their colors are on everything.
That name lives in one file, `hub.config.ts`, and nowhere else.

---

## Putting a client on it

**Clients → ＋ Add client.** You need three things and you have all of them
already:

1. **Their name** — as it should read on their board.
2. **Three colors** — accent, page background, text. Everything else in the
   calendar is worked out from those, so you are not picking a palette, you are
   picking three anchors. The preview shows the result as you go.
3. **A logo, optionally.** Use the file as it comes. PNG and JPEG are fine —
   pick one and you are asked to **position it in a square**, because every
   place a mark appears is a square. It opens fitted, with the whole file
   visible and nothing cut; drag to move it and zoom in to crop. SVG is the one
   upgrade worth having: it stays sharp at any size and gets painted in their
   accent color. Up to 1 MB.

   Most logo files are exported on a white background. That is **taken off
   automatically** — nothing to prepare, nothing to tick. You will see it go in
   the preview, and there is a checkbox to put it back if the white was part of
   the design. A logo on a *colored* square is left alone, since that is
   usually the design rather than padding; the same checkbox removes it if not.

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
recognize which token is in place, never enough to use. A connected Slack reads
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
| Slack notifications | Reminder timing and the on/off switch — the channel mapping is read-only unless you are an agency admin |
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

**Only agency admins see the channel picker.** The list of channels is every
channel in Mobius's workspace, and a board is open to the client's own team, so
it is not shown to them — they see where their own notices land, as plain text,
and nothing about anybody else's. Reminder timing and the on/off switch stay
theirs. If somebody at Mobius needs to set mappings, they need to be an agency
admin (a `memberships` row with `brand_id = '*'`), not just a member of the
board.

---

## When something looks wrong

**A board shows the generic calendar mark instead of their logo.** No logo has
been uploaded for them. Clients → Edit brand.

**A logo looks stretched or crushed.** It was saved before the square-up step
existed. Re-upload it through Clients → Edit brand and position it.

**A logo has a box behind it.** A white one means the file was saved before
backgrounds were removed automatically — re-upload it and it will be handled. A
colored one is left in place on purpose; re-upload and tick *Drop the flat
background* to take it off.

**A card says nothing live but the board has history.** Cancelled and completed
events are hidden on the planning views by default, and the card counts live
work only, so a board whose work is all finished reads `nothing live`.

**Slack says nothing.** In order: is a token connected (Connections), is a
channel mapped for the marketing channel on that event, is the switch on, and
has the bot been invited to that Slack channel.

**Somebody cannot sign in.** Either their email is not on the board's Users list
*and* they do not have the team password, or the password has been changed since
they last used it. Changing the team password signs everybody out, on purpose.

**Something was cancelled by mistake.** Cancelled work leaves the Pipeline and
Calendar and stops counting toward clash warnings, but it is not gone: open
**Cancelled** at the foot of the Pipeline, click it, and either set its status
back to put it on the board or delete it for good under Admin. Deleting is the
only thing here that cannot be undone.

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
