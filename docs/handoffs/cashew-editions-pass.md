# Handoff: Cashew, the whole product, through the eyes of who is using it (2026-10-14)

**Status, end of 2026-10-14:** steps 1, 2 and 4 are built and live (`docs/cashew-editions.md` is the record:
the cuts, the books picker in all three apps, the per-edition helper playbook in `ask/cashew-playbook.js`).
Step 3 (one engine) was not started on purpose: three live databases with real money; the column diff and the
exact order are in `docs/handoffs/cashew-one-engine.md`. Start the next session from that file.

Start a fresh chat from this file. It is the product pass Cole asked for, in his words, with the state of
everything already built, so the next session does not re-ask what is settled.

## What Cole asked (2026-10-14, condensed from his words)

"I thought we were changing the Cashew app to encompass every finance channel I have, across the board, for
Mobius, Lucky and my personal. It needed an entire UI, UX and hierarchy change, completely top to bottom, how the
thing works. How does Cashew work? There are different views and each one is completely separate from the others.
Who's invited is completely separate. These are completely separate accounts that can never, and I mean never,
combine. I have access to all of them because I manage multiple; it is the same principle as Locus with multiple
brands. Cashew is its own app and ideally anybody can make one: you have your finance app, but Lucky Golf is
completely separate from Mobius Digital, which is completely separate from personal. One big SaaS that changes by
use case: personal has different tabs and different things compared to an agency or service business, compared to
an e-commerce store. View it through the eyes of who is using this. Cut fat where it needs to be cut, add features
that need to be features, add visual representation that actually makes sense in certain areas."

## What is already settled and built (do not re-litigate)

- The thinking: `docs/one-ledger.md` (one product, three editions, three SEPARATE sets of books; section 2 is the
  "never combine" rule; section 9 lists the four decisions, which Cole has since made: yes to one product, the three
  editions, Step A, and the name Cashew). `docs/two-products.md` for Cashew beside Locus.
- The name and brand: Cashew, "Know what you kept.", the hand-lettered wordmark, the rendered green character
  (`logo/cashew/`), the gate (`docs/handoffs/gates.md`).
- Step A, LIVE on main: the shell with editions on the Mobius books. `ledger/lg-edition.js` holds the three
  editions (service, product, household): rail, phone bar, Settings sections, words, ask-bar suggestions, stubs.
  `ledger/lg-core.js` the shell. `docs/handoffs/ledger-shell-a.md` is the map. The worker keeps `edition` in settings.
- Lucky: its own repo `LuckyGolfCo/lucky-golf-ledger` (laptop checkout `C:/Users/wetzl/Lucky Golf/Lucky Ledger`), the
  v6 shell, the Cashew gate and character, the Caddie as its helper's name inside the app. Deploys on push to main
  through GitHub Actions. Its own Cloudflare account; its own D1.
- Tally: `C:/Users/wetzl/OneDrive/Apps/Desktop/Tally` (not in any repo), its own Cloudflare account, no Slack. The
  Household edition in `lg-edition.js` is the map it should move onto; nothing of Tally runs on the Cashew code yet.
- Slack, done 2026-10-14: ONE Cashew Slack app (A0C99FUDBA8) for every set of books, routed by channel by
  `ledger/slack` (worker cashew-slack): #finance to the Mobius worker, #lucky-finance to the Lucky worker, DMs to
  Mobius. Each books worker holds the Cashew token and signing secret and verifies for itself. The Locus bot is the
  separate "Mobius Digital" app. Details: `ledger/slack/wrangler.toml`, memory note mobius-ledger.

## What this pass has to decide and build, in order

1. **Who is using it, per edition.** Write the person, the first five minutes, the one question each page answers,
   for: Service (an agency owner: Mobius), Product (a store owner: Lucky), Household (a person or couple: Cole and
   Skylar). Cut every page that does not answer a question that person has. Add what they ask that is missing
   (section 3 of one-ledger.md is the starting list). Visuals only where a picture answers faster than a number.
2. **The account model.** One sign-in, several completely separate sets of books ("accounts"). A person sees only
   the books they were invited to; Cole sees all three because he is invited to all three, not because they share
   anything. Switching books is a top-level picker, like Locus's brand picker, and nothing on screen carries over.
   Invites, access, bank links, Slack channel, categories, rules: all per set of books. Today that is three
   deployments (one per Cloudflare account); the picker can link across them first, and Step D (one deployment,
   many tenants) only if Cashew is sold.
3. **One engine** (one-ledger.md section 6, Step B): Lucky's worker is the most complete base; the Mobius worker's
   audit migrations fold in; Tally is rebuilt on it as the Household edition (Step C). Additive migrations only;
   three live sets of books with real money in them.
4. **Cashew the helper**: one brain, one name in Slack (done), per-edition playbook and words (service: the books and
   clients; product: store, stock, margin, cash; household: safe to spend, bills, goals).

## Rules for the session

- Short bullet replies: what changed, what Cole must do. No em dashes anywhere. In-app modals only. Plain words.
- Simplicity over features: Cole's ideas are questions; push back with evidence; build only what makes it clearer.
- Answer the part asked. Just do it: deploy, commit, push, then report; stop only for money, client-facing or
  destructive calls.
- Deploys: Mobius worker from `ledger/worker` (Mobius wrangler login); the router from `ledger/slack`; Lucky by push
  to its main; Tally with its `worker/deploy.sh` token. Secrets: Cole pastes at a `wrangler secret put` prompt;
  Claude cannot read them.
