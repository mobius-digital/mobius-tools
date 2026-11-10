// Offline checks for My work (src/mywork.js): who sees what, the merged lists, dedupe, the 5am DM once a day, team only.
// Run: node test-mywork.mjs
import { _test } from './src/mywork.js';
import { DEFAULT_PEOPLE } from './src/checkin.js';
const { peopleFrom, access, forPerson, dmText, dmWindow, isPerson, myWorkDmTick, handleMyWork } = _test;
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };

const NOMA = 'U09PZ3ZV5HD', AHSAN = 'U06K732S4BD';
const people = peopleFrom(DEFAULT_PEOPLE);
const noma = people.find(p => p.name === 'Noma'), ahsan = people.find(p => p.name === 'Ahsan');

// 1. People: the roster's emails joined to the check-in Slack ids.
ok(noma && noma.slack === NOMA && noma.email.includes('@'), 'Noma has her Slack id and email');
ok(ahsan && ahsan.slack === AHSAN && ahsan.email === 'ahsan@go-mobius-digital.com', 'Ahsan has his Slack id and email');
ok(isPerson('Nomaqhawe Molife', 'Noma') && isPerson('noma', 'Noma') && !isPerson('Ahsan', 'Noma') && !isPerson('', 'Noma'), 'full Slack / Asana names match the first name');

// 2. Access: the owner opens anyone; a teammate only themself; strangers and other names are refused.
const OWNER = 'cole@go-mobius-digital.com';
ok(access({ email: OWNER, ownerEmail: OWNER, people, who: 'Noma' }).person === noma, 'Cole opens Noma');
ok(access({ email: OWNER, ownerEmail: OWNER, people, who: '' }).people.length === people.length, 'Cole sees everyone in the switcher');
ok(access({ email: null, ownerEmail: OWNER, people, who: 'Ahsan' }).owner === true, 'the admin token is the owner');
const self = access({ email: 'ahsan@go-mobius-digital.com', ownerEmail: OWNER, people, who: '' });
ok(self.person === ahsan && self.people.length === 1 && self.owner === false, 'Ahsan sees only himself');
ok(access({ email: 'ahsan@go-mobius-digital.com', ownerEmail: OWNER, people, who: 'Noma' }).status === 403, 'Ahsan cannot open Noma');
ok(access({ email: 'stranger@example.com', ownerEmail: OWNER, people, who: '' }).status === 403, 'someone off the roster is refused');
ok(access({ email: OWNER, ownerEmail: OWNER, people, who: 'Nobody' }).status === 404, 'an unknown name is a 404');

// 3. The merged lists.
const today = '2026-11-10';   // a Tuesday
const ts = (day, h) => String(Date.parse(`${day}T${String(h).padStart(2, '0')}:00:00Z`) / 1000) + '.000100';
const g = {
  today, domain: 'mobiusdigitalhq', names: { [NOMA]: 'Noma', [AHSAN]: 'Ahsan' },
  brands: [{ act_id: 'brand_dartee_golf', name: 'Dartee Golf' }, { act_id: 'brand_ice_and_gold', name: 'Ice & Gold' }, { act_id: 'brand_grunk_dolfer', name: 'Grunk' }, { act_id: 'brand_bonk_golf', name: 'Bonk Golf' }],
  tasks: [
    { id: 't1', act_id: 'brand_dartee_golf', text: 'Send Cole the BFCM count', owner: 'Noma', due: '', status: 'open', source: 'monday', url: 'u1' },
    { id: 't2', act_id: 'brand_dartee_golf', text: 'Old thing', owner: 'Noma', due: '2026-11-06', status: 'open', source: 'manual' },
    { id: 't3', act_id: 'brand_grunk_dolfer', text: 'Ahsan thing', owner: 'Ahsan', due: today, status: 'open' },
    { id: 't4', act_id: '', text: 'Next week thing', owner: 'Noma', due: '2026-11-13', status: 'open' },
  ],
  cards: [
    { id: 'c1', act_id: 'brand_dartee_golf', brand: 'Dartee Golf', num: '412', title: 'Christmas gifting', board: 'making', assignee: 'Nomaqhawe Molife', due: today },
    { id: 'c2', act_id: 'brand_dartee_golf', brand: 'Dartee Golf', num: '400', title: 'EB 5 pieces for $150', board: 'brief', assignee: 'Noma', due: '2026-11-03' },
    { id: 'c3', act_id: 'brand_dartee_golf', brand: 'Dartee Golf', num: '401', title: 'Approved still', board: 'ready', assignee: 'Noma', due: '2026-11-03' },   // Ready is never late
    { id: 'c4', act_id: 'brand_dartee_golf', brand: 'Dartee Golf', num: '402', title: 'Cyber Monday: 3 briefs', board: 'brief', assignee: 'Noma', due: '' },
    { id: 'c5', act_id: 'brand_dartee_golf', brand: 'Dartee Golf', num: '403', title: 'Live one', board: 'live', assignee: 'Noma', due: '2026-11-01' },
  ],
  mentions: [   // newest first, as the query reads them
    { channel: 'C1', ts: ts('2026-11-09', 15), thread_ts: ts('2026-11-07', 12), user: 'U06C37MDWD7', name: 'Cole Wetzler', text: `@${NOMA} any news on this?`, brand: 'brand_ice_and_gold' },
    { channel: 'C1', ts: ts('2026-11-08', 15), thread_ts: ts('2026-11-07', 12), user: 'U06C37MDWD7', name: 'Cole Wetzler', text: `@${NOMA} first ask`, brand: 'brand_ice_and_gold' },   // same thread: one row
    { channel: 'C2', ts: ts('2026-11-06', 15), thread_ts: null, user: 'UFELA', name: 'Fela', text: `@${NOMA} does this naming work? I'll upload more`, brand: 'brand_ice_and_gold' },   // answered below
    { channel: 'C3', ts: ts('2026-11-05', 15), thread_ts: null, user: NOMA, name: 'Nomaqhawe Molife', text: `note to self @${NOMA}`, brand: 'brand_dartee_golf' },   // her own: no
    { channel: 'C4', ts: ts('2026-11-05', 16), thread_ts: null, user: 'U06C37MDWD7', name: 'Cole Wetzler', text: `@${AHSAN} is #455 close enough?`, brand: 'brand_grunk_dolfer' },
  ],
  own: [{ channel: 'C2', ts: ts('2026-11-06', 16), thread_ts: ts('2026-11-06', 15), user: NOMA }],
  call: { id: 'monday:2026-11-09', date: '2026-11-09', state_json: JSON.stringify({ brands: {
    brand_dartee_golf: { batches: [{ text: 'Cyber Monday: 3 briefs', vote: 'y' }, { text: 'Christmas: 5 concepts', vote: 'c', note: 'make it 3' }, { text: 'Dropped idea', vote: 'n' }, { text: 'Not voted', vote: '' }],
      eplan: [{ text: 'Thanksgiving email to the list', vote: 'y' }], gplan: [{ text: 'Raise the PMax budget', vote: 'y' }] },
    brand_grunk_dolfer: { batches: [{ text: 'Racing collection hooks', vote: 'y' }] },
  } }) },
  dismissed: [{ who: 'Noma', key: 'card:c1:' + today }],
};
const r = forPerson(g, noma);
const by = id => r.items.find(i => i.id === id);
ok(by('task:t1') && by('task:t1').bucket === 'today', 'a task with no date is for today');
ok(by('task:t2') && by('task:t2').bucket === 'late', 'a task past due is late');
ok(by('task:t4') && by('task:t4').bucket === 'week', 'a task due later is this week');
ok(!by('task:t3'), "Ahsan's task is not on Noma's list");
ok(by('card:c1:' + today).bucket === 'today' && by('card:c1:' + today).done === true, 'a card due today is for today, and ticked off here shows done');
ok(by('card:c2:2026-11-03').bucket === 'late', 'a Brief card past due is late');
ok(by('card:c3:2026-11-03').bucket === 'today', 'a Ready card is never late');
ok(!r.items.some(i => i.ref === 'c5'), 'a Live card is not on the list');
const slack = r.items.filter(i => i.source === 'slack');
ok(slack.length === 1 && slack[0].text === 'any news on this?' && slack[0].from === 'Cole', 'one Slack row per thread (the newest), her own message and the answered one dropped');
ok(slack[0].link.includes('mobiusdigitalhq.slack.com/archives/C1/') && slack[0].link.includes('thread_ts='), 'the Slack row links the thread');
ok(slack[0].bucket === 'today' && slack[0].brand === 'Ice & Gold', 'Slack asks are for today, under their brand');
const plan = r.items.filter(i => i.source === 'call');
ok(plan.length === 2 && plan.every(i => i.bucket === 'week'), 'Monday plan: the Yes and Changes lines (meta + email), this week');
ok(!plan.some(i => /Cyber Monday/.test(i.text)) && r.items.filter(i => /Cyber Monday: 3 briefs/.test(i.text)).length === 1, 'a plan line that is already a card shows once');
ok(plan.some(i => i.changes && /make it 3/.test(i.detail)), 'a Changes line carries the note from the call');
ok(!r.items.some(i => /Raise the PMax/.test(i.text)), 'the Google plan goes to Radhesh, not the strategist');
ok(forPerson(g, people.find(p => p.name === 'Radhesh')).items.some(i => /Raise the PMax/.test(i.text)), 'Radhesh gets the Google plan line');
ok(r.counts.slack === 1 && r.counts.late === 2 && r.counts.today === 3, 'counts are open items only (the ticked card is not counted)');
ok(r.quiet.includes('Bonk Golf') && !r.quiet.includes('Dartee Golf'), 'brands with nothing open are named as quiet');
const ra = forPerson(g, ahsan);
ok(ra.items.some(i => i.id === 'task:t3') && ra.items.some(i => i.source === 'slack') && ra.items.some(i => /Racing/.test(i.text)) && !ra.items.some(i => i.act_id === 'brand_dartee_golf'), "Ahsan's list is his own");

// 4. The DM: lane format, the person tagged once, bullets, the link, no em dashes; nothing open = no DM.
const text = dmText(r, noma, today);
ok(text.startsWith('*MY WORK · Today*\n'), 'lane header');
ok(text.split(`<@${NOMA}>`).length === 2, 'tagged once');
ok(/\n• /.test(text) && text.includes('*Late*') && text.includes('*Coming up*'), 'bullets, Late and Coming up');
ok(text.endsWith('<https://locus.go-mobius-digital.com/profit/?open=mywork|Open My work>'), 'links to ?open=mywork');
ok(!/[\u2014\u2013]/.test(text), 'no em dashes');
ok(dmText({ items: [{ bucket: 'today', done: true, text: 'x', brand: 'b' }], counts: {} }, noma, today) === null, 'nothing open, no DM');

// 5. The 5am DM: weekdays 5:00 to 5:59 Central, once per person per day, off switch.
ok(dmWindow('2026-11-10', 5) && !dmWindow('2026-11-10', 6) && !dmWindow('2026-11-14', 5) && !dmWindow('2026-11-15', 5), 'only 5am on a weekday');
const fakeDB = { prepare: () => ({ bind() { return this; }, run: async () => ({}), first: async () => null, all: async () => ({ results: [] }) }), batch: async () => [] };
const env = { DB: fakeDB };
const mkDeps = (settings, hour = 5, date = today) => {
  const posts = [];
  return { posts, d: {
    getSetting: async (e, k) => settings.get(k) ?? null, putSetting: async (e, k, v) => { settings.set(k, v); },
    centralDate: () => date, centralHour: () => hour, canAfford: () => true,
    slackApi: async (e, m, b) => { posts.push(b); return { ok: true }; }, gather: async () => g,
  } };
};
const settings = new Map();
let run = mkDeps(settings);
let out = await myWorkDmTick(env, run.d);
ok(out.sent && out.sent.join() === 'Noma,Ahsan' && run.posts.length === 2 && run.posts[0].channel === NOMA, 'Noma and Ahsan get a DM at 5am');
run = mkDeps(settings);
out = await myWorkDmTick(env, run.d);
ok(run.posts.length === 0, 'the next tick the same day sends nothing');
run = mkDeps(settings, 5, '2026-11-11');
await myWorkDmTick(env, run.d);
ok(run.posts.length === 2, 'the next day sends again');
run = mkDeps(new Map([['myworkDm', 'off']]));
ok((await myWorkDmTick(env, run.d)).skipped === 'off' && !run.posts.length, "settings.myworkDm = 'off' stops it");
run = mkDeps(new Map(), 7);
await myWorkDmTick(env, run.d);
ok(!run.posts.length, 'not at 7am');
run = mkDeps(new Map([['myworkDmPeople', '["Noma"]']]));
await myWorkDmTick(env, run.d);
ok(run.posts.length === 1 && run.posts[0].channel === NOMA, 'settings.myworkDmPeople picks who gets it');
run = mkDeps(new Map()); run.d.canAfford = () => false;
ok((await myWorkDmTick(env, run.d)).deferred && !run.posts.length, 'metered: no budget, no DM');

// 6. Team only: no login 401, a client login 403, a teammate asking for someone else 403.
const json = (o, s = 200) => ({ status: s, body: o });
const req = (auth = 'x') => ({ method: 'GET', headers: new Map([['Authorization', 'Bearer ' + auth]]), json: async () => ({}) });
const hd = (o = {}) => ({ isAdmin: async () => true, clientScope: () => null, sessionEmail: async () => 'ahsan@go-mobius-digital.com', getSetting: async () => null, ...o });
const url = q => new URL('https://x.test/api/mywork' + q);
ok((await handleMyWork(req(), env, url(''), '/api/mywork', json, hd({ isAdmin: async () => false }))).status === 401, 'no login is refused');
ok((await handleMyWork(req(), env, url(''), '/api/mywork', json, hd({ clientScope: () => ({ email: 'client@brand.com' }) }))).status === 403, 'a client login is refused');
ok((await handleMyWork(req(), env, url('?who=Noma'), '/api/mywork', json, hd())).status === 403, 'Ahsan asking for Noma is refused');
ok((await handleMyWork(req(), env, url(''), '/api/other', json, hd())) === null, 'other paths are not this handler');

console.log(bad ? `${bad} of ${n} FAILED` : `${n}/${n} passed`);
process.exit(bad ? 1 : 0);
