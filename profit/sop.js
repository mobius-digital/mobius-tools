/* HOW WE WORK (2026-10-13). A section of How to use Locus (index.html renderGuide; it was Agency settings > How we work
 * until 2026-10-13): the week, the Monday call, the creative kickoff call, the client call, revisions and due dates, on one printable page. The words are Cole's reset of 2026-10-12
 * (docs/operating-cadence-2026-10-12.md); change them here when the rhythm changes. Static, no data.
 * Exports window.SopPage = { html(), mount(host) }.
 */
(() => {
  const WEEK = [
    ['Every day, 6:00am', 'The Daily Brief posts (one agency channel for the drafts; the client gets theirs after review).', 'Locus'],
    ['Monday, 6:00am', 'The weekly report draft posts in each brand’s internal channel. The monthly on the 1st, same hour.', 'Locus'],
    ['Monday, by 7:45am', 'The Monday plan, as a reply under the weekly report card: takeaways, this week’s batches (product, angle, why, how many, format, designer, due date), anything you need from Cole. Your own words, never a pasted AI report.', 'Ahsan, Noma'],
    ['Monday, by 7:45am', 'Google and Amazon update in the same thread: spend, results, what is changing, what you need from us.', 'Radhesh, Hamza'],
    ['Monday, 8:00am', 'The Monday call (agenda below). Every action item goes on Action items on the call.', 'Team'],
    ['Monday, after the call', 'The client report goes out with “This week” and “What we need from you” added from the call notes.', 'Cole'],
    ['Monday afternoon', 'Briefs written. The batches were approved on the call, so the brief is the write-up.', 'Strategists'],
    ['Tuesday, end of day', 'Briefs in Asana with due dates. Wednesday is the latest, and only for a heavy brief.', 'Strategists'],
    ['Tuesday or Wednesday', 'Kickoff call with the creative team, booked the same day or the next working day. Group whatever briefs are ready.', 'Strategist + designer'],
    ['Kickoff + 2 working days', 'Creative delivered: statics and videos. Kickoff Tuesday is due Thursday end of day; Wednesday is due Friday.', 'William, Ravo'],
    ['Within 24 hours of delivery', 'One numbered feedback comment in Asana. One round. A second round on the same ad is a call, not comments.', 'Strategists'],
    ['Friday', 'Strategist QC, then Cole approves. If Cole has not answered by Monday 8am, strategist QC stands.', 'Cole'],
    ['Next Monday', 'Approved ads go live, or sooner when they are ready.', 'Strategists'],
  ];
  const CALL = [
    ['Open, 5 minutes', 'The one thing every brand does this week. Anything that touches every brand. Saved on Action items so the notes pick it up.'],
    ['Per brand, 6 to 8 minutes, red brands first', '1. Last week’s items: done or not. 2. The read: the strategist gives three numbers and the winners and losers in their own words; Cole does not read the report aloud. Creative drill-down happens on the Ads page, on screen. 3. The plan: approve, change or push back. 4. New items: owner, due date, on the list on the spot.'],
    ['Green brands, 2 minutes', 'Numbers on plan, nothing open, plan approved. Move on.'],
    ['Close, 5 minutes', 'Cross-brand items. Anything for Google or Amazon that was not per brand.'],
    ['After', 'The call notes land on Action items as a card to approve. Cole approves it once: tasks on the list, briefs numbered in Asana, “This week” into the client report, what the client owes into Requests, one note per brand in Slack.'],
  ];
  const KICKOFF = [
    'The idea in one sentence, and why we are testing it (what the report said).',
    'Who it is for and how they should feel.',
    'Two or three reference ads, and what to take from each.',
    'The assets in Drive, and the brand rules that apply.',
    'The designer’s questions and their own pitch. A better way wins.',
    'Agree the count, the format and the due date (kickoff plus two full working days).',
    'The strategist leaves one Asana comment: what we agreed, what changed, the due date. That comment is the record.',
  ];
  const CLIENT = [
    ['Before', 'The client report has gone out. The strategist knows the three numbers against goal, the winners and losers, and what is open on Requests.'],
    ['Their news, 5 minutes', 'Ask first, listen. Launches, stock, offers, what customers are saying, anything that changed on their side.'],
    ['The read, 10 minutes', 'Three numbers against goal and the MER floor, winners and losers, in plain words. Do not read the report aloud; they have it.'],
    ['This week, 5 minutes', 'What we are testing and why, in one line each. What we stopped and why.'],
    ['What we need from you, 5 minutes', 'Walk Requests: each item, who on their side, the date. New asks go on Requests on the call.'],
    ['Coming up, 5 minutes', 'Calendar, offers and stock for the next few weeks. An offer is locked only when it is live on their site.'],
    ['After', 'The call notes land on Action items as a card to approve. Cole approves it once: tasks on the list, what the client owes into Requests, a short recap in the client channel the same day.'],
  ];
  const RULES = [
    ['Revisions', 'Feedback is one numbered comment in Asana within 24 hours of delivery. One round. The designer turns a round in 24 hours. A second round on the same ad is a quick call.'],
    ['Due dates', 'The Asana due date is the deadline. If something is blocking you (assets, an unclear brief, too much on your plate), say so in the brand channel at least 24 hours before it is due.'],
    ['Creative', 'Last week’s winners and losers decide this week’s batches. More iterations on what works, kill what does not.'],
    ['Where things live', 'Action items live in Locus; a brief agreed on a call is made in Asana with its number, and briefs and creative production are still worked in Asana until the production board moves in. Locus is the memory: it reads Asana, Meta and Triple Whale and fills itself. Slack carries the headline, the reminders and the conversation; the report lives in Locus.'],
  ];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function css() {
    if (document.getElementById('sopcss')) return;
    const st = document.createElement('style'); st.id = 'sopcss';
    st.textContent = `
      .sop .sop-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
      .sop .sop-tbl th,.sop .sop-tbl td{text-align:left;vertical-align:top;padding:8px 10px;border-top:1px solid var(--line)}
      .sop .sop-tbl th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border-top:0}
      .sop .sop-tbl td:first-child{white-space:nowrap;font-weight:600}
      .sop ol,.sop ul{margin:0;padding:0 0 0 20px;font-size:13.5px;line-height:1.55}
      .sop li{margin:0 0 6px}
      .sop .sop-rule b{display:block;margin:0 0 2px}
      .sop .sop-rule{font-size:13.5px;line-height:1.55;margin:0 0 12px}
      @media print{.sop .set-card{break-inside:avoid}}
    `;
    document.head.appendChild(st);
  }
  const card = (title, hint, body) => `<div class="set-card card"><h3 style="margin:0 0 4px">${esc(title)}</h3>${hint ? `<p class="hint" style="margin:0 0 10px">${esc(hint)}</p>` : ''}${body}</div>`;
  function html() {
    css();
    return `<div class="sop">
      <div class="row" style="justify-content:flex-end;margin:0 0 12px"><button type="button" class="btn" onclick="window.print()">Print or save as PDF</button></div>
      ${card('The week', 'Set 2026-10-12. Every time is Central.', `<table class="sop-tbl"><tr><th>When</th><th>What</th><th>Who</th></tr>${WEEK.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</table>`)}
      ${card('The Monday call', 'Same order every week, per brand, with a clock. Run it from Work > Calls > Monday call and share that screen.', `<table class="sop-tbl"><tr><th>Part</th><th>What happens</th></tr>${CALL.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>`)}
      ${card('The creative kickoff call', 'Required for every brief. A real conversation about the idea, not a read-through. 15 to 20 minutes for a group of briefs. Run it from Work > Calls > Creative kickoff.', `<ol>${KICKOFF.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`)}
      ${card('The client call', 'Strategist leads, Cole joins when it matters. 30 minutes, same order every time. Run it from Work > Calls > Client call.', `<table class="sop-tbl"><tr><th>Part</th><th>What happens</th></tr>${CLIENT.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>`)}
      ${card('Revisions, due dates, creative', '', RULES.map(r => `<div class="sop-rule"><b>${esc(r[0])}</b>${esc(r[1])}</div>`).join(''))}
    </div>`;
  }
  function mount(host) { if (host) host.innerHTML = html(); }
  window.SopPage = { html, mount };
})();
