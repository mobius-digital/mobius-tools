/* Offline checks for THE HOUSE STYLE (2026-11-26, src/house.js): the one layout for every Slack message Locus
 * composes, its caps and limits, and houseLint on the messages the moved automations now build.
 * Made up numbers and names only. Nothing leaves the machine.
 *   node test-house.mjs              the checks
 *   node test-house.mjs --samples    the checks, then the three examples as plain text mocks */
import assert from 'node:assert/strict';
import { houseMessage, houseLint, personNote, houseTime, HOUSE, STATUS_COLOR, LIMITS } from './src/house.js';
import { laneBlocks } from './src/lane.js';
import { alertCard } from './src/pulse.js';
import { dmMessage } from './src/mywork.js';
import { boardBlocks } from './src/checkin.js';
import { deliveryMessage } from './src/delivery.js';

let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', String(e.stack || e).split('\n').slice(0, 4).join('\n    ')); } };
const NOW = new Date('2026-11-26T20:00:00Z');          // 2:00pm Central
const AT = new Date('2026-11-26T20:10:00Z');           // 2:10pm Central

await check('1. a full input: blocks in the fixed order, one divider, one actions block, text = header + summary', () => {
  const m = houseMessage({ title: 'Sample Golf is spending well below normal', tag: 'U0BUYER1', summary: 'Check why.',
    numbers: [{ label: 'Today so far', value: '$112' }, { label: 'Normal by now', value: '$640' }],
    lines: ['one', 'two'], image: { url: 'https://example.test/card.png', alt: 'card' },
    source: 'Meta', at: AT, now: NOW, context: 'compared with the last 7 days', buttons: [{ label: 'Open in Locus', url: 'https://example.test' }] });
  assert.deepEqual(m.blocks.map(b => b.type), ['header', 'section', 'section', 'section', 'image', 'divider', 'context', 'actions']);
  assert.equal(m.blocks[1].text.text, '<@U0BUYER1>  Check why.');
  assert.ok(m.blocks[2].fields, 'the numbers row is one section with fields');
  assert.equal(m.blocks[6].elements[0].text, 'Meta · 2:10pm CT · compared with the last 7 days');
  assert.equal(m.text, 'Sample Golf is spending well below normal. Check why.');
  assert.equal(m.attachments, undefined);
  assert.deepEqual(houseLint(m), []);
  const plain = houseMessage({ title: 'Just a title' });
  assert.deepEqual(plain.blocks.map(b => b.type), ['header']); assert.equal(plain.text, 'Just a title');
  const noDiv = houseMessage({ title: 't', numbers: [{ label: 'A', value: '1' }], source: 's' });
  assert.ok(!noDiv.blocks.some(b => b.type === 'divider'), 'numbers alone: no divider');
});

await check('2. caps: 4 numbers (a 2x2 grid in Slack), 5 lines then "and N more in Locus", 5 buttons; strict mode throws on more', () => {
  const m = houseMessage({ title: 't', numbers: [1, 2, 3, 4, 5].map(i => ({ label: 'N' + i, value: String(i) })), lines: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    buttons: [1, 2, 3, 4, 5, 6].map(i => ({ label: 'B' + i, url: 'https://example.test/' + i })) });
  const f = m.blocks.find(b => b.fields); assert.equal(f.fields.length, 4);
  const l = m.blocks.find(b => b.type === 'section' && /• a/.test(b.text?.text || ''));
  assert.equal(l.text.text, '• a\n• b\n• c\n• d\n• e\n_and 2 more in Locus_');
  const a = m.blocks.find(b => b.type === 'actions'); assert.equal(a.elements.length, 5);
  assert.deepEqual(a.elements.map(e => e.action_id), ['noop_open', 'noop_open_2', 'noop_open_3', 'noop_open_4', 'noop_open_5'], 'link buttons get unique ids');
  HOUSE.strict = true;
  try {
    assert.throws(() => houseMessage({ title: 't', numbers: [1, 2, 3, 4, 5].map(i => ({ label: 'x', value: 'y' })) }), /more than 4 numbers/);
    assert.throws(() => houseMessage({ title: 't', buttons: [1, 2, 3, 4, 5, 6].map(() => ({ label: 'x', url: 'https://example.test' })) }), /more than 5 buttons/);
    assert.throws(() => houseMessage({}), /a title is required/);
    assert.throws(() => houseMessage({ title: 't', buttons: [{ action_id: 'a', label: 'One' }, { action_id: 'a', label: 'Two' }] }), /duplicate action_id a/, 'a repeated id is never dropped quietly in tests');
  } finally { HOUSE.strict = false; }
});

await check('3. emoji and dashes out of the header and summary; a .gif image refused', () => {
  const m = houseMessage({ title: '📈 Sample Golf — check-in :bar_chart:', summary: '✅ Ahead of goal – nice ⚠️' });
  assert.equal(m.blocks[0].text.text, 'Sample Golf, check-in');
  assert.equal(m.blocks[1].text.text, 'Ahead of goal, nice');
  assert.ok(!/[—–]/.test(JSON.stringify(m)));
  const g = houseMessage({ title: 't', image: { url: 'https://example.test/a.gif' } });
  assert.ok(!g.blocks.some(b => b.type === 'image'), 'a GIF is dropped');
  HOUSE.strict = true;
  try { assert.throws(() => houseMessage({ title: 't', image: { url: 'https://example.test/a.gif' } }), /GIF/); } finally { HOUSE.strict = false; }
  assert.deepEqual(houseLint({ blocks: [{ type: 'header', text: { type: 'plain_text', text: '🚨 Down' } }] }), ['emoji in the header']);
  assert.ok(houseLint({ blocks: [{ type: 'header', text: { type: 'plain_text', text: 'x' } }, { type: 'image', image_url: 'https://example.test/x.gif' }] }).includes('a GIF'));
  assert.equal(personNote('Raised it — from $500 to $750'), 'Raised it, from $500 to $750', 'a person written message: only dashes out');
});

await check('4. no status = no attachments; status bad = one attachment with the bad color; a bar that is not a status fails the lint', () => {
  assert.equal(houseMessage({ title: 't', summary: 's' }).attachments, undefined);
  const m = houseMessage({ title: 'Meta: Ads Manager is down', summary: 'Outage.', status: 'bad', buttons: [{ label: 'Status page', url: 'https://example.test' }] });
  assert.equal(m.blocks.length, 1); assert.equal(m.blocks[0].type, 'header');
  assert.equal(m.attachments.length, 1); assert.equal(m.attachments[0].color, STATUS_COLOR.bad);
  assert.deepEqual(m.attachments[0].blocks.map(b => b.type), ['section', 'actions']);
  assert.deepEqual(houseLint(m), []);
  assert.ok(houseLint({ blocks: [{ type: 'header', text: { type: 'plain_text', text: 'x' } }], attachments: [{ color: '#2A9FD8', blocks: [] }] }).includes('a colored bar that is not a status'));
  assert.ok(houseLint({ blocks: [{ type: 'header', text: { type: 'plain_text', text: 'x' } }, { type: 'divider' }, { type: 'divider' }, { type: 'actions', elements: [] }, { type: 'actions', elements: [] }] }).length >= 2);
});

await check('5. houseLint passes on what the moved automations build: lane asks, the outage card, the alert rule, My work DM, the check-in board, the spend alert', async () => {
  const msgs = {
    laneBlocks: laneBlocks({ lane: 'MEDIA BUYING', brand: 'Sample Golf', who: 'U0BUYER1', ask: 'Turn off ad set 368', why: '$140 spent, 0 sales in 7 days', buttons: [{ label: 'Open', url: 'https://example.test' }, { label: 'Also', url: 'https://example.test/2' }] }),
    laneBlocksBad: laneBlocks({ lane: 'OPS', ask: 'Fix the sync', why: 'Meta said no', status: 'bad' }),
    alertCardTeam: alertCard({ id: 'shopify', short: 'Shopify', link: 'https://example.test/status' }, [{ service: 'Checkout', to: 'outage', note: 'Checkout is failing for some stores' }], { button: 'pulse:alert:1:shopify', team: true, at: AT, now: NOW }),
    alertCardClient: alertCard({ id: 'shopify', short: 'Shopify', link: 'https://example.test/status' }, [{ service: 'Checkout', to: 'operational', note: 'Checkout is failing' }], { at: AT, now: NOW }),
    myWork: dmMessage({ items: [{ text: 'Brief 412', brand: 'Sample Golf', bucket: 'today', source: 'card', num: 412, due: '2026-11-26' }, { text: 'Old one', brand: 'Other Co', bucket: 'late', source: 'task', due: '2026-11-20' }], counts: { slack: 0 } }, { slack: 'U0PERSON1', name: 'Pat' }, '2026-11-26', 'https://example.test/mywork', AT),
    board: { blocks: boardBlocks('2026-11-27', { people: { U1: { plan: { at: '2026-11-27T14:00:00Z' } } }, missed: ['Pat no wrap-up'], sent: [] }, { U1: { name: 'Pat' }, U2: { name: 'Sam' } }) },
    delivery: deliveryMessage({ name: 'Sample Golf', act_id: 'brand_sample', currency: 'USD' }, '<@U0BUYER1>', { period: 'today', spent: 112, normal: 640, budget: 900, hint: 'Worth a look in Ads Manager while the day is still live.' }, { at: AT, now: NOW }),
  };
  const { alertBlocks } = await import('./src/alerts.js');
  msgs.alertRule = alertBlocks({ act: 'brand_sample', metric: 'mer', window: 'today', baseline: 'fixed', comparison: 'below', threshold: 1.5, at_hour_central: 14 },
    [{ act_id: 'brand_sample', name: 'Sample Golf', value: 1.21, base: null, cur: 'USD', text: '*Sample Golf: MER today so far by 2pm Central is 1.21x, under your line of 1.50x.*' }], { brandName: 'Sample Golf', now: NOW });
  for (const [k, m] of Object.entries(msgs)) assert.deepEqual(houseLint(m), [], k);
  assert.equal(msgs.alertCardTeam.blocks[0].text.text, 'Shopify: Checkout is down');
  assert.equal(msgs.alertCardTeam.attachments[0].color, STATUS_COLOR.bad);
  assert.deepEqual(msgs.alertCardTeam.attachments[0].blocks.at(-1).elements.map(e => e.text.text), ['Send to all clients', 'Status page', 'Platform status in Locus'], 'one row of buttons');
  assert.ok(!JSON.stringify(msgs.alertCardClient).includes('Locus'), 'a client card has no Locus link and no buttons');
  assert.equal(msgs.alertRule.blocks[0].text.text, 'Sample Golf: MER today so far by 2pm Central is 1.21x, under your line of 1.50x');
  assert.equal(msgs.board.blocks[0].text.text, 'Fri Nov 27 check-in');
  assert.equal(msgs.board.blocks.find(b => b.type === 'actions').block_id, 'ci_btns', 'the board keeps its button block id');
});

await check('6. limits: header 150, section 3000, button label 75; Central time', () => {
  const m = houseMessage({ title: 'x'.repeat(400), summary: 'y '.repeat(400), lines: ['z'.repeat(5000)], buttons: [{ label: 'b'.repeat(200), url: 'https://example.test' }] });
  assert.ok(m.blocks[0].text.text.length <= LIMITS.header);
  assert.ok(m.blocks[1].text.text.length <= LIMITS.summary);
  for (const b of m.blocks) if (b.type === 'section' && b.text) assert.ok(b.text.text.length <= LIMITS.section);
  assert.ok(m.blocks.find(b => b.type === 'actions').elements[0].text.text.length <= LIMITS.button);
  assert.deepEqual(houseLint(m), []);
  assert.equal(houseTime(AT, NOW), '2:10pm CT');
  assert.equal(houseTime(new Date('2026-11-25T15:00:00Z'), NOW), 'Nov 25, 9:00am CT');
  assert.equal(houseTime(null), '');
});

console.log(`\n${n}/${n + bad} passed`);

/* ---------------- the three examples, as plain text mocks ---------------- */
export function mock(m) {
  const out = [];
  const strip = s => String(s || '').replace(/<@([A-Z0-9]+)>/g, '@$1').replace(/<([^|>]+)\|([^>]+)>/g, '$2').replace(/\*([^*\n]+)\*/g, '$1').replace(/(^|\s)_([^_\n]+)_/g, '$1$2');
  const draw = (blocks, bar) => {
    for (const b of blocks) {
      const p = bar ? `▌(${bar}) ` : '';
      if (b.type === 'header') out.push(`${p}${b.text.text}   (bold)`);
      else if (b.type === 'section' && b.fields) {
        for (let i = 0; i < b.fields.length; i += 2) {
          const pair = b.fields.slice(i, i + 2).map(f => strip(f.text).split('\n'));
          const rows = Math.max(...pair.map(x => x.length));
          for (let r = 0; r < rows; r++) out.push(p + pair.map(x => (x[r] || '').padEnd(30)).join('').trimEnd());
        }
      } else if (b.type === 'section') out.push(...strip(b.text.text).split('\n').map(l => p + l));
      else if (b.type === 'image') out.push(`${p}[image: ${b.alt_text}]`);
      else if (b.type === 'divider') out.push(`${p}────────`);
      else if (b.type === 'context') out.push(`${p}${strip(b.elements.map(e => e.text).join(' '))}   (small, gray)`);
      else if (b.type === 'actions') out.push(p + b.elements.map(e => `[${e.text.text}]`).join(' '));
    }
  };
  draw(m.blocks || []);
  for (const a of m.attachments || []) draw(a.blocks || [], Object.entries(STATUS_COLOR).find(([, c]) => c === a.color)?.[0] || a.color);
  return out.join('\n');
}

if (process.argv.includes('--samples')) {
  /* A. Client check-in (standing.js is protected and ends Nov 30: this is the shape the next check-in is built in). */
  const A = houseMessage({ title: 'Sample Golf · Black Friday, 2pm check-in', summary: 'Ahead of goal today. We raised the Black Friday budget from $500 to $750 a day.',
    numbers: [{ label: 'Since last check-in', value: '$3,120 sales · 3.15x MER' }, { label: 'Today', value: '$5,480 sales · 2.93x MER' }, { label: 'This week', value: '$31,900 sales · 2.80x MER' }],
    image: { slack_file_id: 'F0EXAMPLE', alt: 'Sample Golf: since last check-in, today, this week, top ads' }, source: 'Triple Whale', at: NOW, now: NOW, context: 'goal 2.50x MER' });
  /* B. Client daily (kept as the person editable text post; see the report): the house shape it would take. */
  const B = houseMessage({ title: 'Sample Golf · Wed Nov 25', summary: 'Ahead of plan. Next: Black Friday ads go live tonight at 6pm.',
    numbers: [{ label: 'Yesterday', value: '$4,860 sales · 2.96x MER\n$1,640 ads · plan $4,200' }, { label: 'November so far', value: '$88.4K of $96K · 2.83x MER\n$31.2K ads · 25 of 30 days' }],
    source: 'Triple Whale', context: 'Amazon $410 (9 orders) included · more in the thread' });
  /* C. Spend well below normal (live: worker.js deliveryPass through delivery.js). */
  const C = deliveryMessage({ name: 'Sample Golf', act_id: 'brand_sample', currency: 'USD' }, '<@U0BUYER>', { period: 'today', spent: 112, normal: 640, budget: 900, hint: 'Worth a look in Ads Manager while the day is still live.' }, { at: AT, now: NOW });
  for (const [k, m] of Object.entries({ A, B, C })) console.log(`\n--- ${k} (text: ${m.text})\n${mock(m)}`);
}
if (bad) process.exit(1);
