/* Offline checks for THE SLACK LANE FORMAT (2026-11-09, src/lane.js): the one layout for every ask, the multi-ask
 * groups, who gets tagged, and the FYI roundup (stored during the day, one post per brand from 4pm Central, never a
 * client channel, once a day). In-memory SQLite (node:sqlite), Slack mocked: nothing leaves the machine.
 *   node test-lane.mjs              the checks
 *   node test-lane.mjs --samples    the checks, then sample messages as Slack would show them (for the PR) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { laneBlocks, laneLines, laneName, laneOwner, laneOfArea, whoText, fyi, roundupTick, roundupMessage, COLE } from './src/lane.js';
import { reminderMessage } from './src/actions.js';
import { minOffMessage } from './src/minoff.js';
import { messageFor } from './src/todaypost.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; },
  async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; };
const env = { DB: { prepare: stmt } };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);

let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', e.message); } };
const noDash = o => assert.ok(!/[—–]/.test(JSON.stringify(o)), 'no em or en dash anywhere');

await check('laneBlocks: lane + brand, the tagged person and the ask, Why:, then the buttons; fallback text "LANE · Brand: ask"', () => {
  const m = laneBlocks({ lane: 'media', brand: 'Dartee', who: COLE, ask: 'Turn off ad set 368', why: '$140 spent, 0 sales in 7 days',
    buttons: [{ type: 'button', action_id: 'do_it', text: { type: 'plain_text', text: 'Do it' }, value: '1' }, { label: 'Open', url: 'https://x' }] });
  assert.equal(m.blocks[0].text.text, '*MEDIA BUYING · Dartee*\n<@U06C37MDWD7>  Turn off ad set 368\nWhy: $140 spent, 0 sales in 7 days');
  assert.equal(m.text, 'MEDIA BUYING · Dartee: Turn off ad set 368');
  assert.equal(m.blocks[1].type, 'actions'); assert.deepEqual(m.blocks[1].elements.map(e => e.text.text), ['Do it', 'Open']);
  assert.equal(m.blocks[1].elements[1].action_id, 'noop_open', 'an Open link is a noop_open button');
  const n2 = laneBlocks({ lane: 'OPS', ask: 'Fix the sync — now' });
  assert.equal(n2.blocks[0].text.text, '*OPS · Agency*\n<@U06C37MDWD7>  Fix the sync, now', 'no brand = Agency, no person = Cole, dashes go');
  assert.equal(n2.blocks.length, 1, 'no why, no buttons: nothing else');
  const two = laneBlocks({ ask: 'x', buttons: [{ label: 'A', url: 'https://a' }, { label: 'B', url: 'https://b' }] });
  assert.equal(two.blocks.filter(b => b.type === 'actions').length, 2, 'two noop_open buttons never share a block (ids must be unique in one)');
  noDash([m, n2]);
});

await check('who: a Slack id, a tag, a bold name; nobody named ("the strategist", empty, Nobody) tags Cole', () => {
  assert.equal(whoText('U07N0RRSP4J'), '<@U07N0RRSP4J>'); assert.equal(whoText('<@U1234567>'), '<@U1234567>');
  assert.equal(whoText('Ravo'), '*Ravo*'); assert.equal(whoText('*Ravo*'), '*Ravo*');
  for (const w of ['', null, 'the strategist', 'the email owner', 'Nobody owns these', 'Cole']) assert.equal(whoText(w), `<@${COLE}>`, String(w));
});

await check('lanes: a fixed list of six; areas, roles and owners map onto it', () => {
  assert.equal(laneName('creative strategy'), 'CREATIVE'); assert.equal(laneName('client update'), 'CLIENT'); assert.equal(laneName('trybe'), 'CREATORS');
  assert.equal(laneName('MEDIA BUYING'), 'MEDIA BUYING'); assert.equal(laneName('whatever'), 'OPS');
  assert.equal(laneOfArea('ads'), 'MEDIA BUYING'); assert.equal(laneOfArea('email'), 'EMAIL'); assert.equal(laneOfArea('', 'brief'), 'CREATIVE'); assert.equal(laneOfArea(''), null);
  const team = { strat: 'Ahsan', buyer: 'Cole', email: 'the email owner' };
  assert.equal(laneOwner('MEDIA BUYING', team), 'Cole'); assert.equal(laneOwner('CREATIVE', team), 'Ahsan'); assert.equal(laneOwner('CREATORS', team), 'Ahsan');
  assert.equal(laneOwner('EMAIL', team), 'Ahsan', 'no email owner named: the strategist'); assert.equal(laneOwner('OPS', team), 'Cole');
  assert.equal(laneOwner('CREATIVE', { strat: 'the strategist' }), 'Cole', 'nobody named = Cole');
});

await check('laneLines: one header per lane + brand, one line per ask with its own tag; same lane + brand merge', () => {
  const m = laneLines([
    { lane: 'MEDIA BUYING', brand: 'Dartee', items: [{ who: '<@U_AHSAN>', ask: 'Cut 2 ad sets', why: '$2.4K at stake' }] },
    { lane: 'CREATIVE', brand: 'Dartee', items: [{ who: 'Ravo', ask: 'Finish 312 Hook test (3 days late)' }] },
    { lane: 'MEDIA BUYING', brand: 'Dartee', items: [{ who: '', ask: 'Fix Leads: $0.91 a lead' }] },
  ], { foot: ['Yesterday $1,438 (plan $1,800)'] });
  assert.equal(m.blocks[0].text.text, '*MEDIA BUYING · Dartee*\n<@U_AHSAN>  Cut 2 ad sets _($2.4K at stake)_\n<@U06C37MDWD7>  Fix Leads: $0.91 a lead');
  assert.equal(m.blocks[1].text.text, '*CREATIVE · Dartee*\n*Ravo*  Finish 312 Hook test (3 days late)');
  assert.equal(m.blocks[2].type, 'context');
  assert.match(m.text, /^MEDIA BUYING · Dartee: Cut 2 ad sets \(and 2 more\)\n/, 'the notification line first, then every line');
});

await check('fyi(): stored once per brand + day + lane + line; never throws', async () => {
  assert.equal(await fyi(env, { act: 'brand_dartee', lane: 'client', line: 'Nick (client) approved "Black Friday offer".' }), true);
  await fyi(env, { act: 'brand_dartee', lane: 'client', line: 'Nick (client) approved "Black Friday offer".' });
  await fyi(env, { act: 'brand_dartee', lane: 'CREATORS', line: 'New VIP creators: Bo ($1,240), Jo ($980).' });
  await fyi(env, { act: 'brand_dartee', lane: 'MEDIA BUYING', line: 'Monday test calls: nothing to pause or take off this week (4 keep, 2 too early to call)' });
  await fyi(env, { act: 'brand_beta', lane: 'OPS', line: 'Beta signed the services agreement (Bea Smith).' });
  await fyi(env, { act: 'brand_gamma', lane: 'OPS', line: 'Gamma has no internal channel of its own.' });
  await fyi(env, { act: '', lane: 'OPS', line: 'Locus check, Mon Nov 9: all 112 checks passed.' });
  assert.equal(await fyi(env, { act: 'x', lane: 'OPS', line: '   ' }), false, 'an empty line is not stored');
  assert.equal(await fyi({}, { act: 'x', lane: 'OPS', line: 'no db' }), false, 'no database: false, no throw');
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM slack_fyi`).get().n, 6);
});

const posts = [];
let hour = 15;
const d = { centralHour: () => hour, centralDate: () => '2026-11-09', canAfford: () => true,
  listAccounts: async () => [
    { act_id: 'brand_dartee', name: 'Dartee', slack_channel: 'C_DARTEE_IN', brief_channel: 'C_DARTEE_CLIENT' },
    { act_id: 'brand_beta', name: 'Beta', slack_channel: 'C_BETA_IN', brief_channel: null },
    { act_id: 'brand_gamma', name: 'Gamma', slack_channel: 'C_GAMMA', brief_channel: 'C_GAMMA' },
  ],
  slackPost: async (e, channel, text, blocks, opts) => { posts.push({ channel, text, blocks, opts }); return { ok: true, ts: String(posts.length) }; } };
db.prepare(`INSERT INTO settings (key, value) VALUES ('slackChannel', 'C_AGENCY')`).run();

await check('roundupTick: nothing before 4pm Central; at 4pm one post per brand (internal channel, lanes in order), the agency lines to the agency channel', async () => {
  assert.match((await roundupTick(env, d)).skipped, /before 16:00/);
  hour = 16;
  const r = await roundupTick(env, d);
  assert.deepEqual(posts.map(p => p.channel).sort(), ['C_AGENCY', 'C_BETA_IN', 'C_DARTEE_IN']);
  const dartee = posts.find(p => p.channel === 'C_DARTEE_IN');
  assert.equal(dartee.blocks[0].text.text, '*FYI · Dartee · Mon Nov 9*\n*MEDIA BUYING*\n• Monday test calls: nothing to pause or take off this week (4 keep, 2 too early to call)\n*CREATORS*\n• New VIP creators: Bo ($1,240), Jo ($980).\n*CLIENT*\n• Nick (client) approved "Black Friday offer".');
  assert.equal(dartee.text, 'FYI · Dartee: 3 things from today');
  assert.ok(!posts.some(p => /CLIENT$|C_GAMMA/.test(p.channel)), 'never a client channel; a brand whose internal channel is the client one gets nothing');
  assert.deepEqual(r.dropped, ['Gamma']);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM slack_fyi WHERE posted_at IS NULL`).get().n, 0, 'every line is marked');
  noDash(posts);
});

await check('roundupTick: once a day; a line queued after the post waits for tomorrow; the switch stops it', async () => {
  posts.length = 0; hour = 18;
  await fyi(env, { act: 'brand_dartee', lane: 'OPS', line: 'A late line.' });
  const r = await roundupTick(env, d);
  assert.equal(posts.length, 0, JSON.stringify(r));
  db.prepare(`UPDATE settings SET value = '{}' WHERE key = 'fyiRoundupDone'`).run();
  db.prepare(`INSERT INTO settings (key, value) VALUES ('fyiRoundup', 'off')`).run();
  assert.deepEqual(await roundupTick(env, d), { skipped: 'off' });
  db.prepare(`DELETE FROM settings WHERE key = 'fyiRoundup'`).run();
  await roundupTick(env, d);
  assert.equal(posts.length, 1); assert.match(posts[0].blocks[0].text.text, /\*OPS\*\n• A late line\.$/);
});

await check('the reminder, the test minimums and the calls list all start lane first', () => {
  const r = reminderMessage('Dartee', 'Ahsan', [{ id: 'a', act_id: 'brand_dartee', text: 'Write the BFCM flow', area: 'email', due: '2026-11-08' }], '2026-11-09', '<@U_AHSAN>');
  assert.match(r.blocks[0].text.text, /^\*EMAIL · Dartee\*\n<@U_AHSAN>  Write the BFCM flow\nWhy: was due /);
  const m = minOffMessage({ act: 'brand_dartee', date: '2026-11-09', brand: 'Dartee', tag: '<@U_COLE>', items: [{ id: '1', name: '368 | Broad', min: 20, day: 9, why: 'judged' }] });
  assert.equal(m.blocks[0].text.text, '*MEDIA BUYING · Dartee*\n<@U_COLE>  Take 1 test minimum off');
  const c = messageFor({ act_id: 'brand_dartee', name: 'Dartee' }, [{ kind: 'cut', adset: '368 | Broad', stake: 140, why: '$140 spent, 0 sales in 7 days.' }], '<@U_COLE>');
  assert.equal(c.blocks[0].text.text, "*MEDIA BUYING · Dartee*\n<@U_COLE>  Make today's 1 ad call");
  assert.equal(c.blocks[1].text.text, '*Cut* "368 | Broad", $140 at stake\nWhy: $140 spent, 0 sales in 7 days.');
});

console.log(`\n${n}/${n + bad} passed`);

if (process.argv.includes('--samples')) {
  /* What Slack shows, as text (the mrkdwn of each block; buttons in brackets). */
  const show = (title, m) => {
    console.log(`\n--- ${title}`);
    for (const b of m.blocks) {
      if (b.type === 'section') console.log(b.text ? b.text.text : '');
      else if (b.type === 'context') console.log(b.elements.map(e => e.text).join(' '));
      else if (b.type === 'actions') console.log(b.elements.map(e => `[${e.text.text}]`).join('  '));
    }
    console.log(`(notification: ${m.text.split('\n')[0]})`);
  };
  show('An ask (buyer list row)', laneBlocks({ lane: 'MEDIA BUYING', brand: 'Dartee', who: '<@U06C37MDWD7>', ask: 'Turn off ad set 368', why: '$140 spent, 0 sales in 7 days',
    buttons: [{ type: 'button', action_id: 'x', text: { type: 'plain_text', text: 'Do it' } }, { label: 'Open', url: 'https://x' }] }));
  show('A client request (requests.js)', laneBlocks({ lane: 'CLIENT', brand: 'Bonk', who: '<@U_AHSAN>', ask: "Handle Floyd's request: Pause the hoodie ads", why: 'We sold out of medium.', buttons: [{ label: 'Open in Locus', url: 'https://x' }] }));
  show('The morning card (several asks, several people)', laneLines([
    { lane: 'OPS', brand: 'Dartee', items: [{ who: '<@U06C37MDWD7>', ask: 'Sign the Trybe renewal' }] },
    { lane: 'MEDIA BUYING', brand: 'Dartee', items: [{ who: '<@U_AHSAN>', ask: "Today's ad calls: cut 2 ad sets, scale 1 · $2.4K at stake" }] },
    { lane: 'CREATIVE', brand: 'Dartee', items: [{ who: '*Ravo*', ask: 'Finish 312 Hook test (3 days late)' }] },
    { lane: 'CLIENT', brand: 'Dartee', items: [{ who: '<@U_AHSAN>', ask: 'Chase the client: Fall polo samples · 4 days' }] },
  ], { foot: ['Yesterday $1,438 (plan $1,800) · MER 2.11x'], buttons: [{ label: 'Open Dartee in Locus', url: 'https://x' }] }));
  show('The end-of-day roundup', roundupMessage('Dartee', '2026-11-09', [
    { lane: 'MEDIA BUYING', line: 'Monday test calls: nothing to pause or take off this week (4 keep, 2 too early to call)' },
    { lane: 'CREATORS', line: 'New VIP creators: Bo ($1,240), Jo ($980). Discord VIP role is on; the Trybe move waits for Cole\'s yes in Locus.' },
    { lane: 'CLIENT', line: 'Nick (client) approved "Black Friday offer". The date is confirmed on the calendar.' },
    { lane: 'OPS', line: 'Dartee connected Klaviyo on their connect link.' },
  ], { act: 'brand_dartee' }));
}
if (bad) process.exit(1);
