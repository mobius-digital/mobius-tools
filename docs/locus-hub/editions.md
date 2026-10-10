# Locus editions: brand and agency

Cole, 2026-10-10: "Locus is literally everything now. A client should have access to absolutely everything. Locus needs a
brand edition and an agency edition: the agency edition is the same product plus a few extra features that help an agency
run multiple brands at once."

## The two editions

- **Brand edition** (a client login). Every page, number and action a single brand has, for its own brand(s), on the
  same screens the team uses. No special client layouts.
- **Agency edition** (the Mobius team). The brand edition for every brand, plus the few things that exist only because
  an agency runs many brands at once.

## Agency-only (hidden from clients, refused on the server)

1. All clients and every cross-brand view (the command center, all-brands lists, the agency's Overview).
2. The Clients screen and New client.
3. Team and access.
4. Agency settings: connections made once for every brand, Slack sending setup, Data and jobs.
5. Agency economics and Team workload.
6. Shared links admin for other brands (a client sees and revokes its own brand's links).
7. The assistant's settings: model, standing instructions, memory, skills, Monday review, scheduled questions, alerts.
8. The brief and report review and send: drafts, Send to client, steer, rewrite, Don't send, report sections. Clients
   see what was sent.
9. Slack channel ids and the team's internal notes (War Room notes, brief steer, report config).
10. Mobius's own costs (Agency economics; what a client's AI use costs Mobius).

## Per page

| Page | Brand edition | Scrubbed or held back for a client |
|---|---|---|
| Home > Overview | yes | Slack ids |
| Home > Day check | yes | other brands' rows (the market answer stays) |
| Home > P&L, Costs | yes | nothing (costs and margins are theirs) |
| Home > Goals | yes, edits its goals and plan | nothing |
| Home > Requests | yes | cannot mark done or send approvals (that is the team's side of the same list) |
| Ads > Today, All channels | yes | nothing |
| Ads > Meta (Overview, Campaigns, Ads, Changes, Today, browser) | yes, changes through the same propose and confirm | nothing |
| Ads > Google (all jobs), TikTok report | yes, Google changes through the same propose and confirm | TikTok connect is the agency's |
| Ads > Tests and angles | yes | Asana sync and results judging are the team's (Mobius's Asana) |
| Email and SMS | yes, Klaviyo changes through the same propose and confirm | nothing |
| Store > Sales, Customers, Website, Search | yes, own survey and Clarity keys | nothing |
| Products > Stock, Drops | yes, read only | Buying and every Supply write (the Supply worker's own sign-in knows no client) |
| Creative > AI ads (Studio, Words) | yes, $3 a day of AI work | Canva and the OpenAI key setup; building a whole skill or speaker |
| Creative > Creators | yes, edits its creator link | Atria clip import |
| Creative > Library, Inspiration | yes | Drive sync; other brands' Atria boards |
| Brand > Client answers, Research, Voice | yes, edits the brand docs | research runs and skill builds (long AI jobs) |
| Calendar | yes, add, edit, move, end, note, remove, put back | ticking the team's work steps, Asana tasks |
| Reports > Daily Brief, Weekly and monthly | sent only | drafts, review, send, report config |
| Reports > Dashboards | yes, its brand's boards | the Slack posting setup on a board (kept, never shown) |
| Season > War Room, The Plan | yes, edits its plan | War Room notes and alert setup; the season item's name |
| Tools > Scenarios, Platform status | yes | nothing |
| Tools > Agency economics, Team workload | no | agency-only |
| Settings | Brand settings: About, Integrations (its own keys), Ads rules, Data and costs, Client access (read only), Your profile | Slack and sending, Stock and factories, Archive, data repairs |
| Ask Locus | yes, the same engine pinned to the brand, $2 a day | SQL, app views, agency memory, skills, Slack, actions from the chat |

## The rule for a new page

A new page is in the brand edition by default. Add its routes to `CLIENT_RULES` in `brandguard.js` (both copies, never a
prefix), with `act: 'need'` and an `own` check for any record it loads by id, and a line in `test-clients.mjs`. Put the
page in `AGENCY_TABS` (profit/index.html) and leave its routes off `CLIENT_RULES` only when it runs many brands at once or
configures the agency itself. Anything that spends Mobius's AI money takes a `cap`.
