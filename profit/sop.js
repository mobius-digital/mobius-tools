/* HOW WE WORK. A section of How to use Locus (index.html renderGuide): the Monday, the three calls (team, client,
 * creator), the creative kickoff, revisions and due dates, on one printable page.
 * 2026-11-09: rewritten as the Mobius Call Playbook Cole approved (https://claude.ai/artifact/X6EBgQMTRDuyiWRKU37dGK):
 * every call has the same three parts, what is ready before, the steps on the call with minutes, what happens after.
 * The 2026-10-12 version (docs/operating-cadence-2026-10-12.md) is in git history. Change the words here when the rhythm
 * changes. Static, no data. No em dashes. Exports window.SopPage = { html(), mount(host) }.
 */
(() => {
  const MONDAY = [
    ['5:00am', 'Each brand’s weekly report posts in its internal Slack channel.', 'Locus'],
    ['5:30am', 'Buying: /buy all. The ad moves are made before the team call.', 'Cole'],
    ['7:00am', 'A reminder in #daily-checkin names any brand with no Monday plan yet.', 'Locus'],
    ['By 7:30am', 'The Monday plan, as a reply under each brand’s weekly report: three numbers, winners and losers, this week’s batches (product, angle, how many, format, who makes it, due date), what you need from Cole. Fix any “What we’re doing” line in the report that the team did not decide.', 'Ahsan, Noma'],
    ['By 7:30am', 'The Google and Amazon line in the same thread: spend, results, what is changing.', 'Radhesh, Hamza'],
    ['8:00am', 'Team call, 60 minutes.', 'Team'],
    ['9:30am to 1:30pm', 'Client calls, 30 minutes each.', 'Cole'],
    ['From noon', 'A Slack message to Cole for any call left open an hour without Finish.', 'Locus'],
    ['Afternoon', 'Briefs written from the batches the team call approved.', 'Ahsan, Noma'],
    ['4:30 to 7:30pm', 'Creator calls on Discord: Grunk 4:30, Dartee 5:00, Ice & Gold 5:30, Party Patch 6:00, then Lucky on its Stage.', 'Cole'],
  ];
  const WEEK = [
    ['Tuesday or Wednesday', 'Creative kickoff with William and Ravo. Group whatever briefs are ready.', 'Strategist + makers'],
    ['Kickoff + 2 working days', 'Creative delivered. Kickoff Tuesday is due Thursday end of day; Wednesday is due Friday.', 'William, Ravo'],
    ['Within 24 hours of delivery', 'One numbered feedback note on the Production card. One round. A second round on the same ad is a quick call.', 'Strategists'],
    ['Friday', 'Each creator Discord gets #winners. Strategist QC, then Cole approves the ads.', 'Locus, Cole'],
    ['Next Monday', 'Approved ads go live, or sooner when they are ready.', 'Cole'],
  ];
  /* Each call: where it runs, how long, then [before], [steps: name, minutes, what], [after]. */
  const CALLS = [
    { name: 'Team call', when: 'Monday 8:00am, 60 minutes', where: 'Work > Meetings > Run a call > Monday call',
      before: ['Each brand’s weekly report is in its Slack channel.', 'Ahsan and Noma have posted the Monday plan for each brand.', 'Radhesh and Hamza have added Google and Amazon.', 'Cole has run /buy, so the ad moves are made.'],
      steps: [['This week’s one focus', 3, 'One line for every brand, like “Early Black Friday: scale what holds”.'],
        ['Each brand, red ones first', 6, 'a. Last week’s items: tick done or not. b. The read: the strategist says it in their own words; nobody reads the report aloud. c. Being made: what is on the board, what is late. d. New items: one sentence, one owner, one date.'],
        ['Green brands', 2, 'On plan, nothing open: move on.'],
        ['Team items', 5, 'Blockers from the check-ins, Mobius Build work.'],
        ['Finish', 2, 'Press Finish before anyone leaves the call.']],
      after: ['Finish puts every new item on Tasks with its owner and date.', '“This week” goes into each client report.', 'One note per brand in its internal channel.', 'Briefs get written in the afternoon; kickoff Tuesday or Wednesday.'] },
    { name: 'Client call', when: 'Monday 9:30am to 1:30pm, 30 minutes each', where: 'pick the brand > Work > Client call',
      before: ['The report matches what the team call decided. Nothing in it we did not agree to.', 'The ads to show are picked: what went live, what waits for their OK.', 'Their open asks are on Requests (the slide fills itself).', 'Fireflies is invited.'],
      steps: [['Their news', 3, 'Ask first and listen. Launches, stock, what customers say, anything that changed.'],
        ['Last week', 7, 'The numbers, the best and worst ads, in plain words.'],
        ['Ads', 5, 'What went live, what needs their OK.'],
        ['This week', 3, 'What we are doing, from the team call.'],
        ['Requests', 3, 'What we need from them, each with a date.'],
        ['Coming up', 2, 'The next five weeks: sale dates, order-by cutoffs. An offer is locked only when it is live on their site.'],
        ['Finish', 2, 'Read the recap back, tick Post it, press Finish.']],
      after: ['Finish saves their asks on Requests and adds “This week” to their report.', 'The report goes to the client the same day.', 'Cole sends the Slack update in their channel with the link to their Updates page.', 'Fireflies adds only what was said and not typed.'] },
    { name: 'Creator call', when: 'Monday 4:30 to 7:30pm on Discord, 20 minutes each (Lucky 45)', where: 'Work > Meetings > Run a call > Creator call',
      before: ['Friday: Locus posts #winners (creator videos with a Triple Whale sale that week).', 'Monday morning: Locus posts #this-week with the videos to film, the deal and the call time.', 'Ahsan or Noma picks this week’s set for their brands by noon.', 'Pick 2 or 3 winners to play and 2 “skip this” examples.'],
      steps: [['What’s new', 2, 'The deal, the dates, any contest.'],
        ['What sold', 5, 'Play the winners. Say why each worked: the hook, the first 3 seconds, the offer.'],
        ['What we want', 6, 'The videos to film this week and the first line of each. Want vs skip.'],
        ['Questions', 5, 'Lucky: the guest creator first (their numbers, their ads), then open questions.'],
        ['One ask, one date', 2, 'Like “2 videos by Sunday”. Reviews come back within 2 days. Tick Post it to put it in #this-week.']],
      after: ['Record it. Lucky’s replay goes in the app’s Call replays and #announcements.', 'The ask is in #this-week when Post it was ticked.', 'Thursday: follow ups to anyone who has not uploaded.'] },
  ];
  const KICKOFF = [
    'The idea in one sentence, and why we are testing it (what the report said).',
    'Who it is for and how they should feel.',
    'Two or three reference ads, and what to take from each.',
    'The assets in Drive, and the brand rules that apply.',
    'The maker’s questions and their own pitch. A better way wins.',
    'Agree the count, the format and the due date (kickoff plus two full working days).',
    'The strategist leaves one note on the card: what we agreed, what changed, the due date. That note is the record.',
  ];
  const RULES = [
    ['Revisions', 'Feedback is one numbered note on the Production card within 24 hours of delivery. One round. The maker turns a round in 24 hours. A second round on the same ad is a quick call.'],
    ['Due dates', 'The card’s due date is the deadline. If something blocks you (assets, an unclear brief, too much on your plate), say so in your check-in at least 24 hours before it is due.'],
    ['Creative', 'Last week’s winners and losers decide this week’s batches. More versions of what works; stop what does not.'],
    ['Where things live', 'Tasks and Requests are in Locus. Briefs and ads are cards on Production. Reports are in Locus. Slack carries the headline, the reminders and the conversation.'],
  ];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function css() {
    if (document.getElementById('sopcss')) return;
    const st = document.createElement('style'); st.id = 'sopcss';
    st.textContent = `
      .sop{display:flex;flex-direction:column;gap:12px}
      .sop .sop-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
      .sop .sop-tbl th,.sop .sop-tbl td{text-align:left;vertical-align:top;padding:8px 10px;border-top:1px solid var(--line)}
      .sop .sop-tbl th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border-top:0}
      .sop .sop-tbl td:first-child{white-space:nowrap;font-weight:600}
      .sop .sop-tw{overflow-x:auto}
      .sop ol,.sop ul{margin:0;padding:0 0 0 20px;font-size:13.5px;line-height:1.55}
      .sop li{margin:0 0 6px}
      .sop .sop-rule b{display:block;margin:0 0 2px}
      .sop .sop-rule{font-size:13.5px;line-height:1.55;margin:0 0 12px}
      .sop .sop-cols{display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:16px}
      .sop .sop-cols h4{margin:0 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
      .sop .sop-steps{list-style:none;padding:0}
      .sop .sop-steps li{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:0 0 8px;margin:0 0 8px;border-bottom:1px solid var(--line)}
      .sop .sop-steps li:last-child{border-bottom:0;margin:0}
      .sop .sop-steps b{font-weight:600}
      .sop .sop-steps .m{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
      .sop .sop-steps .w{grid-column:1/-1;color:var(--ink-2)}
      @media (max-width:860px){.sop .sop-cols{grid-template-columns:1fr}}
      @media print{.sop .set-card{break-inside:avoid}}
    `;
    document.head.appendChild(st);
  }
  const card = (title, hint, body) => `<div class="set-card card"><h3 style="margin:0 0 4px">${esc(title)}</h3>${hint ? `<p class="hint" style="margin:0 0 10px">${esc(hint)}</p>` : ''}${body}</div>`;
  const table = rows => `<div class="sop-tw"><table class="sop-tbl"><tr><th>When</th><th>What</th><th>Who</th></tr>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</table></div>`;
  const callCard = c => card(c.name, `${c.when}. Run it from ${c.where}, and share that screen.`,
    `<div class="sop-cols">
      <div><h4>Ready before</h4><ul>${c.before.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div><h4>On the call</h4><ol class="sop-steps">${c.steps.map(s => `<li><b>${esc(s[0])}</b><span class="m">${s[1]} min</span><span class="w">${esc(s[2])}</span></li>`).join('')}</ol></div>
      <div><h4>After</h4><ul>${c.after.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </div>`);
  function html() {
    css();
    return `<div class="sop">
      <div class="row" style="justify-content:flex-end;margin:0"><button type="button" class="btn" onclick="window.print()">Print or save as PDF</button></div>
      ${card('Monday', 'Every Monday, the same way. Every time is Central.', table(MONDAY))}
      ${CALLS.map(callCard).join('')}
      ${card('The rest of the week', '', table(WEEK))}
      ${card('The creative kickoff', 'Required for every brief. A real conversation about the idea, not a read-through. 15 to 20 minutes for a group of briefs. Run it from Work > Meetings > Run a call > Creative kickoff.', `<ol>${KICKOFF.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`)}
      ${card('Revisions, due dates, creative', '', RULES.map(r => `<div class="sop-rule"><b>${esc(r[0])}</b>${esc(r[1])}</div>`).join(''))}
    </div>`;
  }
  function mount(host) { if (host) host.innerHTML = html(); }
  window.SopPage = { html, mount };
})();
