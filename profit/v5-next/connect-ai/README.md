# Connect your AI (page files, waiting to be moved in)

Two page modules for the new app, written to the same shape as `profit/v5/pages/<line>/<tab>.js`
(default export with `title`, `eyebrow`, `ranges`, `load`, `render`; sample data in `_sample/<tab>.json`).
They sit here because another run owns `profit/v5/` today.

| File | Page | Reads | Writes |
|---|---|---|---|
| `index.js` | Your profile, Connect your AI | `GET /api/connect-ai`, `/keys`, `/calls` | make a key, turn a key off, the owner's switch |
| `cards.js` | Suggestions from your AI | `GET /api/connect-ai/proposals`, `POST /proposals/check` | the Yes or No tap |

All routes are on the account-health worker (`account-health/worker/src/connectai.js`).

## Moving them in

1. Copy this folder to `profit/v5/pages/connect-ai/` (the imports already point at `../../kit.js` and `../../config.js`).
2. Add two routes to the menu: `connect-ai/index` (under Your profile, for everyone, clients included) and
   `connect-ai/cards` (either view; in a brand view it shows that brand's cards).
3. Send the link the AI hands back, `?open=aiproposal&id=<card id>&act=<brand id>`, to `connect-ai/cards`.
   The page marks the card whose id is in the address.
4. Add the count of waiting cards to the bell if wanted: `GET /api/connect-ai/proposals` returns only waiting cards.

## Things to know

- A card belongs to the side that made it. The team's cards are never shown to a client login; a client sees only
  cards its own side's AI made. The team sees both.
- A view-only teammate and a read-only client login get no Yes or No (the answer carries `can_act: false`), and
  their AI cannot make a card. They can still make a key and read.
- When a yes makes the change (settings key `connectAiApply`, off by default), Yes opens a sheet with the real name
  and the real before and after, read from Meta. The yes in the sheet sends back what was shown. A budget step of
  more than half needs its own yes. The Change Log line starts with "AI card <id>". This path was checked against a
  stand-in for the Meta write route only: run it on one paused test ad before switching `connectAiApply` on.

- The key is shown once, in a sheet, from the answer to `POST /api/connect-ai/keys`. It is never part of what
  `load` returns, so it is never kept in the saved copy of the page.
- With the workspace switch off, the page shows "Not switched on yet" (and the switch itself, to the owner only).
- Sample mode (`?sample=1`) draws from `_sample/` and every button says nothing is saved.
- The three steps for Claude and ChatGPT were written from each app's own help pages on 2026-11-25 and were not
  clicked through. Check them in both apps before telling customers.
- Checked in sample mode only (a scratch copy of the app, 2026-11-25): both pages draw at desktop width and at a
  375 phone width with no console errors. On a phone the keys table scrolls sideways inside its own card.
  Real mode (a real sign-in against the worker) has not been run.
