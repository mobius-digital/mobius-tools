# Label an email → it lands in Ledger

The thing Cole actually wanted: see a receipt, put a label on it, and it forwards
itself to the #finance channel. No filter to maintain, no sender list to keep up
to date, works for a vendor we have never seen before.

**Gmail filters cannot do this.** A filter runs once, at the moment mail is
delivered, and never looks at that message again — so it cannot react to a label
or a star you add afterwards. That limitation is real, and it is why the
sender-list filter exists as the automatic path.

Either option below adds the manual path alongside it. They are not exclusive:
the filter catches the predictable vendors on its own, and the label handles
anything it missed.

---

## Option A — Zapier (already paid for, no code)

1. Gmail → create a label called **To Ledger**
2. Zapier → **Create Zap**
3. Trigger: **Gmail → New Labeled Email**, label **To Ledger**
4. Action: **Email by Zapier → Send Outbound Email**
   - To: the #finance channel address
   - Subject: `{{Subject}}`
   - Body: `{{Body Plain}}`
   - Attachments: `{{Attachments}}`
5. Turn it on

Fires within a couple of minutes of labelling. Costs one task per receipt.

Zapier cannot remove the label afterwards without a second step, so add a
Gmail → *Remove Label from Email* action if a growing label bothers you.

---

## Option B — Google Apps Script (free, runs on Google's servers)

Nothing installed, nothing to keep alive on a laptop, no Zapier tasks consumed.

1. Gmail → create a label called **To Ledger**
2. Go to **https://script.google.com** → **New project**
3. Delete what is there, paste the script below, and put the #finance address in
   `TO`
4. Save. Run `forwardToLedger` once — Google asks for permission the first time,
   which is expected: it is your own script acting on your own mailbox
5. Left sidebar → **Triggers** (the clock) → **Add Trigger**
   - Function: `forwardToLedger`
   - Event source: **Time-driven** → **Minutes timer** → **Every 10 minutes**
6. Save

```javascript
// Forward anything labelled "To Ledger" into the finance channel, then take the
// label off so the same receipt is never sent twice. Runs every 10 minutes.
var TO = 'PUT-THE-FINANCE-CHANNEL-ADDRESS-HERE';
var LABEL = 'To Ledger';

function forwardToLedger() {
  var label = GmailApp.getUserLabelByName(LABEL);
  if (!label) return;                     // label renamed or deleted

  // 25 threads a run is plenty at this volume and stays well inside Gmail's
  // daily forwarding quota even if a backlog is labelled all at once.
  var threads = label.getThreads(0, 25);
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    var sentAll = true;
    for (var j = 0; j < messages.length; j++) {
      try {
        messages[j].forward(TO);
      } catch (e) {
        // Leave the label on if anything failed, so the next run retries it
        // rather than silently dropping a receipt.
        sentAll = false;
        console.log('forward failed: ' + e);
      }
    }
    if (sentAll) threads[i].removeLabel(label);
  }
}
```

---

## Which one

Apps Script, unless you would rather not touch code at all. It is free, it runs
on Google's own servers, and it removes the label as it goes so the list stays
empty and you can see at a glance that nothing is stuck.

## Star instead of a label?

Change `getUserLabelByName(LABEL).getThreads(...)` to
`GmailApp.search('is:starred')` and unstar with `threads[i].unstar()`. A label is
better: stars get used for other things, and a wrong star would forward
something private into Slack.
