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
     t('running', 'Running'), t('templates', 'Templates'), t('log', 'Run log')] }
   ```

   and a `t('delivery', 'How things reach me')` tab on `profile`.
4. Nothing else changes. `_auto.js` uses only `kit.js`.

## Files

| File | Page |
|---|---|
| `running.js` | The list: one sentence per automation, an on/off switch, when it last ran |
| `templates.js` | The gallery: 25 ready sentences in five groups, every one off |
| `log.js` | The run log: what ran, what it did, and when it did nothing, why |
| `delivery.js` | Your profile, How things reach me |
| `_auto.js` | Shared: the sentence, the switch, the one-sentence editor in a bottom sheet with "Try it" |
| `_sample/*.json` | Sample mode files (made-up brands), built from the worker module so the words match |

## Worker routes they call (account-health)

`GET /api/automations`, `PUT /api/automations`, `DELETE /api/automations?id=`, `POST /api/automations/test`
(dry run, and `words_only` to re-read the sentence after a word changes), `POST /api/automations/power`,
`GET` and `PUT /api/me/delivery`. The bell and the home list read `GET /api/notices` and tick rows with
`POST /api/notices/done`.

## Checked

Sample mode at desktop width and at a 375 phone width: the four pages draw, the editor rises from the bottom, a word
opens its picker and the sentence updates. Real mode has not been run against the live worker.
