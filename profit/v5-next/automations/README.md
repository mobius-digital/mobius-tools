# Automations pages (version one)

These pages are written in the same module shape as `profit/v5/pages` and wait here so they do not collide with the
run that owns `profit/v5`. Their imports (`../../kit.js`) are already written for their final home.

## Moving them in

1. Copy this folder to `profit/v5/pages/automations/` (keep `_auto.js` and `_sample/`).
2. Move `delivery.js` and `_sample/delivery.json` to `profit/v5/pages/profile/` and change its import of
   `./_auto.js` to `../automations/_auto.js`. It replaces the device-only "How it reaches you" page: choices are
   saved to the person's account.
3. Add the menu line (agency view and brand view), in `menu.js`:

   ```js
   { id: 'automations', label: 'Automations', icon: 'pulse', who: 'team', tabs: [
     t('running', 'Running'), t('templates', 'Templates'), t('people', 'Who does what'), t('log', 'Run log')] }
   ```

   and a `t('delivery', 'How things reach me')` tab on `profile`.
4. Nothing else changes. `_auto.js` uses only `kit.js`.

## Files

| File | Page |
|---|---|
| `running.js` | The list: one sentence per automation, an on/off switch, when it last ran |
| `templates.js` | The gallery: 25 ready sentences in five groups, every one off |
| `people.js` | Who does what: the person behind each role, per brand, and the team list |
| `log.js` | The run log: what ran, what it did, and when it did nothing, why |
| `delivery.js` | Your profile, How things reach me |
| `_auto.js` | Shared: the sentence, the switch, the one-sentence editor in a bottom sheet with "Try it" |
| `_sample/*.json` | Sample mode files (made-up brands), built from the worker module so the words match |

## Worker routes they call (account-health)

`GET /api/automations`, `PUT /api/automations`, `DELETE /api/automations?id=`, `POST /api/automations/test`
(dry run, and `words_only` to re-read the sentence after a word changes), `POST /api/automations/power`,
`GET` and `PUT /api/automations/people`, `GET` and `PUT /api/me/delivery`. The bell and the home list read
`GET /api/notices` and tick rows with `POST /api/notices/done`.

## Rows that wait for an answer (for whoever wires the bell and the home list)

`_auto.js` exports `noticeActions(row, ctx, reload)`, the buttons for one row. Two kinds of row need more than a tick:

- `kind: 'proposal'` is a suggested change. Locus does not make the change in this version, so the row has no write
  route. The answers are `{ id, answer: 'did_it' }` (the person made it by hand in Ads) or `{ id, answer: 'no' }`.
  `answer: 'yes'` is refused and the row stays open, so nothing can read as "applied".
- `kind: 'release'` is a message for a client that waits for a yes. Its body holds the exact words and who would
  get them. The answers are `{ id, answer: 'send' }` or `{ id, answer: 'no' }`. Until "send" the client sees nothing.

## What the worker holds to (so the screens do not have to)

- A view only login reads everything here and changes nothing (403 on every write, and on "send").
- Only the owner can put a client into a sentence, or switch on an automation that tells a client.
- A client login reads only the plain line of its own rows, and in How things reach me only the automations that
  tell it, with none of the team's words.
- Nobody is told about a brand they may not see, in the app or in Slack.
- "Draft a report" costs AI (shown with the Uses AI pill) and stops at the automations AI limit for the day. A draft
  still unsent at noon is listed in the team's daily "not sent yet" reminder in Slack, like any other draft.

## Checked

Sample mode at desktop width and at a 375 phone width: the four pages draw, the editor rises from the bottom, a word
opens its picker and the sentence updates. Real mode has not been run against the live worker.
