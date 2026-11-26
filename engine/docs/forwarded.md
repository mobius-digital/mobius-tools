# Forwarded

Made by `node engine/worker/tools/gen-lists.mjs`. Do not edit by hand.

The to do list for the day the keys move to the engine. Each row is one forward to replace.

| Method | Path | Old worker | Old file | Why it is forwarded |
|---|---|---|---|---|
| POST | `/ah/api/actions/done` | ah | account-health/worker/src/actions.js | a write that does more than rows: a tick also runs the follow ups the old worker has registered for a finished task |
| POST | `/ah/api/actions` | ah | account-health/worker/src/actions.js | a write that does more than rows: the owner is matched to the roster in old code, and a new task may be filed on a calendar by the old worker |
| GET | `/ah/api/ad-creatives` | ah | account-health/worker/src/worker.js | reads an ad platform live with a key the old worker holds, and the old worker checks each named ad belongs to the caller |
| GET | `/ah/api/agency/economics` | ah | account-health/worker/src/agency.js | reads the ledger worker and the task tool live |
| GET | `/ah/api/agency/workload` | ah | account-health/worker/src/agency.js | reads the task tool live |
| GET | `/ah/api/ask/brief` | ah | account-health/worker/src/worker.js | no old route for this read: the old answer is passed through as it is |
| PUT | `/ah/api/ask/settings` | ah | account-health/worker/src/worker.js | a write that also clears a channel list kept inside the old worker |
| POST | `/ah/api/ask` | ah | account-health/worker/src/worker.js | calls a model |
| POST | `/ah/api/automations/power` | ah | account-health/worker/src/automations.js | the old timers run automations, so switching them on stays beside them |
| POST | `/ah/api/automations/test` | ah | account-health/worker/src/automations.js | a test run reads live numbers and may call a model |
| GET | `/ah/api/buyer-list` | ah | account-health/worker/src/buyerlist.js | protected file: the ad calls are made by the old worker only |
| GET | `/ah/api/calendar` | ah | account-health/worker/src/calendar.js | drop dates come from the supply worker, and email sends and task state are read live with keys on the old side |
| GET | `/ah/api/calls/screen` | ah | account-health/worker/src/callscreen.js | reads an ad platform live and may call a model |
| GET | `/ah/api/clarity` | ah | account-health/worker/src/clarity.js | reads the site recording tool live with the brand's own token, which the engine does not hold |
| GET | `/ah/api/clients/invite-info` | ah | account-health/worker/src/clients.js | Part of the sign in page, kept with the other three doors so one side answers all of sign in. |
| POST | `/ah/api/clients/login-link` | ah | account-health/worker/src/clients.js | It sends mail, and the mail key lives on the old side. |
| POST | `/ah/api/clients/signin` | ah | account-health/worker/src/clients.js | The session is signed with a key that lives on the old side. |
| POST | `/ah/api/connect-ai/proposals/check` | ah | account-health/worker/src/connectai.js | reads the ad platform live through the protected ad change file |
| POST | `/ah/api/connect-ai/proposals/decide` | ah | account-health/worker/src/connectai.js | a yes can change an ad through the protected ad change file |
| GET | `/ah/api/connect-ai/switch` | ah | account-health/worker/src/connectai.js | no old route for this read: the old answer is passed through as it is |
| PUT | `/ah/api/connect-ai/switch` | ah | account-health/worker/src/connectai.js | switching on makes the key, call and card tables on first use, and the engine never makes a table |
| POST | `/ah/api/google-login` | ah | account-health/worker/src/worker.js | The session is signed with a key that lives on the old side. The Google answer is also checked there. |
| GET | `/ah/api/google/ads-ads` | ah | account-health/worker/src/worker.js | reads an ad platform live with a key the old worker holds |
| GET | `/ah/api/google/ads-changes` | ah | account-health/worker/src/worker.js | reads an ad platform live with a key the old worker holds |
| GET | `/ah/api/google/ads-terms` | ah | account-health/worker/src/worker.js | reads an ad platform live with a key the old worker holds |
| GET | `/ah/api/google/ads` | ah | account-health/worker/src/worker.js | reads an ad platform live with a key the old worker holds |
| GET | `/ah/api/google/search` | ah | account-health/worker/src/google.js | reads the search tool live with a key the engine does not hold |
| GET | `/ah/api/google/website` | ah | account-health/worker/src/google.js | reads the website analytics tool live with a key the engine does not hold |
| GET | `/ah/api/integrations` | ah | account-health/worker/src/worker.js | works out what is connected from keys held on the old side and reads outside tools |
| GET | `/ah/api/klaviyo` | ah | account-health/worker/src/klaviyo.js | reads the email tool live with the brand's own key, which the engine does not hold |
| GET | `/ah/api/leaks` | ah | account-health/worker/src/worker.js | reads ad platforms live and may call a model |
| POST | `/ah/api/lookup` | ah | account-health/worker/src/lookups.js | reads the tracker and the ad platform live, may call a small model, and writes a usage row |
| GET | `/ah/api/meta/live` | ah | account-health/worker/src/worker.js | reads an ad platform live with a key the old worker holds |
| GET | `/ah/api/mywork` | ah | account-health/worker/src/mywork.js | who is on the team, who is the owner and who runs each brand are lists kept in old code, and its cards come from the board, which needs signed links |
| POST | `/ah/api/notices/done` | ah | account-health/worker/src/automations.js | a write that does more than rows: it can send a message to a client by chat or mail |
| GET | `/ah/api/overview` | ah | account-health/worker/src/worker.js | On the stays on old list of the written plan: it reads the ad account sync state and budgets the old worker keeps. |
| GET | `/ah/api/pacing` | ah | account-health/worker/src/worker.js | reads an ad platform live with a key the old worker holds |
| GET | `/ah/api/production/card` | ah | account-health/worker/src/prodwork.js | file links are signed with a key on the old side, a first open reads the brief from the task tool, and it asks the video service whether a conversion is ready |
| GET | `/ah/api/production/photos` | ah | account-health/worker/src/prodwork.js | the roster is kept in old code, a missing photo is looked up in the chat app, and the result is saved back |
| GET | `/ah/api/production` | ah | account-health/worker/src/production.js | each card picture is a signed file link and the signing key is on the old side, and the team list is a roster kept in old code |
| GET | `/ah/api/pulse/status` | ah | account-health/worker/src/pulse.js | on the stays on old list of the written plan: the outage monitor is a timed job there |
| GET | `/ah/api/standing` | ah | account-health/worker/src/standing.js | protected file (standing.js): forwarded, never ported |
| GET | `/ah/api/supply/client` | ah | account-health/worker/src/stock.js | reads the stock worker with a token the engine does not hold |
| GET | `/ah/api/tiktok/report` | ah | account-health/worker/src/worker.js | reads an ad platform live with a key the old worker holds |
| POST | `/ah/api/tiktok/start` | ah | account-health/worker/src/tiktok.js | starts an ad platform sign in with a key held on the old side |
| GET | `/ah/api/tiktok/status` | ah | account-health/worker/src/tiktok.js | reads an ad platform sign in held on the old side |
| GET | `/ah/api/trybe/review` | ah | account-health/worker/src/trybe.js | reads the creator tool live with a key held on the old side |
| GET | `/ah/api/trybe/scorecard` | ah | account-health/worker/src/trybe.js | reads the creator tool live with a key held on the old side |
| GET | `/ah/api/trybe/video` | ah | account-health/worker/src/trybe.js | asks the creator tool for a link with a key held on the old side |
| GET | `/ah/api/trybe` | ah | account-health/worker/src/trybe.js | reads the creator tool live with a key held on the old side |
| GET | `/pw/api/ad-creatives` | pw | profit/worker/src/worker.js | the old profit worker only passes this on to the old account-health worker |
| GET | `/pw/api/assets/footage` | pw | profit/worker/src/worker.js | no old route exists: the old answer is passed through as it is |
| PUT | `/pw/api/brand/rules` | pw | profit/worker/src/brand.js | the old profit worker clears its answer cache on every write, which the engine cannot do |
| GET | `/pw/api/costs/sheet` | pw | profit/worker/src/costs.js | no old route exists for this read |
| POST | `/pw/api/costs/sheet` | pw | profit/worker/src/costs.js | an upload, and the old profit worker clears its answer cache on every write, which the engine cannot do |
| DELETE | `/pw/api/costs` | pw | profit/worker/src/costs.js | changes what profit shows, grades the cost check again and stores the grade |
| GET | `/pw/api/costs` | pw | profit/worker/src/worker.js | needs the day by day money model (cost check, last 30 days of costs), which the metrics group owns |
| PUT | `/pw/api/costs` | pw | profit/worker/src/costs.js | changes what profit shows, grades the cost check again and stores the grade |
| GET | `/pw/api/expenses` | pw | profit/worker/src/expenses.js | needs the day by day money model (cost check, last 30 days of costs), which the metrics group owns |
| PUT | `/pw/api/expenses` | pw | profit/worker/src/expenses.js | changes what profit shows, and the old profit worker clears its answer cache on every write, which the engine cannot do |
| GET | `/pw/api/hub/command` | pw | profit/worker/src/hub.js | on the stays on old list of the written plan |
| GET | `/pw/api/hub/live` | pw | profit/worker/src/hub.js | Reads the tracker live for today, which needs a key the engine does not hold. |
| GET | `/pw/api/requests` | pw | profit/worker/src/worker.js | no old route on this side: the old answer is passed through so the screens see what they saw before |
| GET | `/pw/api/season/war` | pw | profit/worker/src/season.js | protected file (season.js) and it reads the tracker live |
| GET | `/pw/api/season` | pw | profit/worker/src/season.js | protected file (season.js): forwarded, never ported |

## Borrowed fields

Ported routes that take a field from one old GET.

| Method | Path | Fields |
|---|---|---|
| GET | `/ah/api/automations/people` | GET /ah/api/team: domain, owner (for team) |
| PUT | `/ah/api/automations/people` | GET /ah/api/team: domain, owner (who counts as team) |
| GET | `/ah/api/automations` | GET /ah/api/team: domain, owner (for team_size) |
| GET | `/ah/api/clients` | locus |
| POST | `/ah/api/connect-ai/keys` | address |
| GET | `/ah/api/connect-ai` | address |
| GET | `/ah/api/meetings/monday` | brands[].open[].url and agency_open[].url (the screens address) |
| GET | `/ah/api/meetings` | connected, webhook, meetings[].with, open[].items[].url (the screens address) |
| GET | `/ah/api/settings` | slackInteractive, hasSlackToken, hasTwKey, buyerOwner, buyerChannel |
| GET | `/ah/api/team` | domain, owner |
| GET | `/pw/api/client-pages` | pages[].url (the screens address in front of the token) |
