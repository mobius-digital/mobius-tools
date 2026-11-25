# Free lookups: the v5 page, staged

This folder holds the page for free lookups in the same shape as `profit/v5/pages`. It is staged here because
another run owns `profit/v5` today. Nothing in `profit/v5` reads this folder, so it changes nothing until it is
moved in.

## What is here

- `pages/ask/free.js`: "Free answers". A box to pull a number, the answer written by code, an "Open the page"
  link, and "Ask why", which sends the same question to the full assistant. Under it, the list of what is free.
- `pages/ask/_sample/free.json`: the sample mode data (made-up brand and numbers).

## Moving it in (three steps)

1. Copy `pages/ask/free.js` to `profit/v5/pages/ask/free.js` and `pages/ask/_sample/free.json` to
   `profit/v5/pages/ask/_sample/free.json`. The imports (`../../kit.js`, `../../config.js`) already point at
   the v5 root from there.
2. In `profit/v5/menu.js`, give the Ask line a second tab for the team: `t('free', 'Free answers', null, true)`
   beside its `index` tab, in the brand and agency menus. Not the client menu yet: a client login gets free
   answers through its normal Ask box, but `GET /api/lookups` and `POST /api/lookup` are team routes in
   version one (they are not on the client allowlist in brandguard.js).
3. Optional, so the main Ask page shows a free answer well. The worker already returns the keys the page
   reads (`answer`, `sources`, `open`). To add the "Ask why" button there, in `pages/ask/index.js`:
   - keep `r.ask_why` on the answer: `a = { q, text: r.answer, sources: r.sources, open: r.open, why: r.ask_why }`
   - in `answerCard`, when `a.why` is set, add a button that calls `ask(a.q, { full: true })`
   - let `ask` pass `full: true` in the body of `POST /api/ask` when asked to.

## The routes it calls (account-health worker)

| Call | What it does |
|---|---|
| `GET /api/lookups` | The list, whether free answers are on, and the share of questions answered free in the last 30 days. Reads only. |
| `POST /api/lookup {question, act}` | One free answer. Reads only. Returns `lookup: null` when the question needs the assistant. |
| `POST /api/ask {question, full: true}` | "Ask why". `full: true` skips the free lane and goes to the assistant. |

## Turning it on

Free lookups are off until the settings key `freeLookups` is set on the account-health worker's settings table:
`on` (code first, then one small model call when the words are not clear) or `code` (code only, no model call).
With the key absent the page still lists what will be free and says it is not switched on yet.
