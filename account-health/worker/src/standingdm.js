/* THE CHECK-IN DM, BLOCK KIT (2026-11-22). Cole: the rich_text list "doesn't look the best"; he means Well Copy's APP
 * message (the automated "Happy Monday!" recap in their deck: bold section titles with an emoji, a divider between
 * sections, two columns of fields, each name in orange code, each metric on its own quote bar, the change in italics).
 * Two layouts, picked on https://claude.ai/artifact/Sq6oGmX1JZtYn7Jw4PAB45 and stored in settings `standingDmStyle`:
 *   'wc'    = Well Copy's app message, matched: greeting, "Weekend so far:", two-column brand fields with quote bars.
 *   'board' = a scoreboard: a header block, summary fields, then one colored bar per brand (legacy attachment `color`,
 *             green scale / yellow hold / red cut) with its numbers as fields and an Approve button.
 * Both say what changed since the previous check-in when there is one, and put what needs Cole first.
 * Buttons are link buttons with action_id `noop_open` (the only link id the Slack router acks): they open that brand on
 * the War Room, where Approve is the two-tap write. Nothing in Slack writes to Meta. */
import { counted } from './standingimg.js';
const money = v => v == null ? 'n/a' : `$${Math.round(v).toLocaleString('en-US')}`;
const k = v => v == null ? 'n/a' : Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`;
const x = v => v == null ? 'n/a' : `${(Math.round(v * 100) / 100).toFixed(2)}x`;
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const W = { scale: 'Raise 50%', raise: 'Raise 25%', hold: 'Hold', cut: 'Cut 25%' };
const ORDER = { cut: 0, scale: 1, hold: 2 };
const DOT = v => v === 'good' ? '🟢' : v === 'warn' ? '🟡' : v === 'bad' ? '🔴' : '⚪';
const COLOR = { scale: '#2EB67D', hold: '#ECB22E', cut: '#E01E5A', done: '#868686' };
const tone = (v, kpi) => v == null || !kpi ? '' : v >= kpi ? 'good' : v >= kpi * 0.8 ? 'warn' : 'bad';
const hourOf = slot => { const h = +String(slot || '').split('T')[1]; return isNaN(h) ? '' : h === 12 ? '12pm' : h === 0 ? '12am' : h < 12 ? `${h}am` : `${h - 12}pm`; };
const dayName = slot => new Date(String(slot).split('T')[0] + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

/* Where the sales came from (profit storesource.js, 2026-11-26): each brand of the standing payload carries
   store_source for its whole sale days; today so far is always Triple Whale's live read. Until a brand is on
   Shopify the words are exactly the old ones. */
const onShopify = b => b && b.store_source === 'shopify';
export function salesSource(rec) {
  const live = (rec.brands || []).filter(b => !b.no_sales), n = live.filter(onShopify).length;
  if (!n) return 'Triple Whale';
  return n === live.length ? 'Shopify for whole days, Triple Whale today' : 'Shopify or Triple Whale per brand, Triple Whale today';
}
const brandSource = b => (onShopify(b) ? 'Shopify for whole days, Triple Whale today' : 'Triple Whale');

function totals(rec) {
  const ok = rec.brands.filter(b => !b.no_sales && b.so_far && b.so_far.sales != null), live = ok.filter(b => counted(rec, b));
  const s = live.reduce((t, b) => t + b.so_far.sales, 0), p = live.reduce((t, b) => t + b.so_far.spend, 0), g = ok.reduce((t, b) => t + (b.goal || 0), 0);
  return { s, p, g, mer: p ? s / p : null };
}
/** What moved since the previous check-in of the same run (live or dry). */
function since(rec, prev) {
  if (!prev || !prev.brands || prev.slot >= rec.slot || !!prev.dry !== !!rec.dry) return null;
  const a = totals(rec), b = totals(prev), ds = a.s - b.s, dp = a.p - b.p;
  const per = {};
  for (const r of rec.brands) {
    const o = prev.brands.find(z => z.act_id === r.act_id); if (!o || !o.so_far || !r.so_far) continue;
    per[r.act_id] = { sales: (r.so_far.sales || 0) - (o.so_far.sales || 0), spend: (r.so_far.spend || 0) - (o.so_far.spend || 0) };
  }
  return { label: hourOf(prev.slot), sales: ds, spend: dp, mer: dp > 0 ? ds / dp : null, per };
}
const sorted = rec => [...rec.brands].sort((a, b) => (ORDER[(a.suggest || {}).call] ?? 2) - (ORDER[(b.suggest || {}).call] ?? 2));
const needs = rec => sorted(rec).filter(b => (b.suggest || {}).to && !(rec.approved || {})[b.act_id]);
/* Approve in Slack itself (Cole 2026-11-24): a real button, handled by standing.js handleClientUpdateButton (ws_approve). */
const apBtn = (rec, act, style) => ({ type: 'button', action_id: 'ws_approve', text: { type: 'plain_text', text: 'Approve', emoji: true }, value: `${rec.slot}|${act}`, ...(style ? { style } : {}) });
const btn = (text, url, style) => ({ type: 'button', action_id: 'noop_open', text: { type: 'plain_text', text, emoji: true }, url, ...(style ? { style } : {}) });

/* ---------- 'wc': Well Copy's app message, matched ---------- */
function wcBlocks(rec, prev, link) {
  const T = totals(rec), d = since(rec, prev), N = needs(rec), B = sorted(rec);
  const md = t => ({ type: 'section', text: { type: 'mrkdwn', text: t } });
  const head = `${rec.dry ? 'Dry run' : `Happy ${dayName(rec.slot)}`}! 👋\nHere is where we stand on Black Friday weekend: _${rec.label}_`;
  const stats = [`*Weekend Sales: ${k(T.s)}*, which is _${pct(T.s, T.g)}% of the ${k(T.g)} goal${d ? ` / +${k(d.sales)} since ${d.label}` : ''}_`,
    `*MER: ${x(T.mer)}* ${DOT(tone(T.mer, 2.5))}, _vs the 2.50x KPI${d && d.mer != null ? ` / ${x(d.mer)} since ${d.label}` : ''}_`,
    `*Ad Spend: ${k(T.p)}*${d ? `, _+${k(d.spend)} since ${d.label}_` : ''}`].join('\n\n');
  const blocks = [md(head), { type: 'divider' }, md(`*Weekend So Far:*\n\n${stats}`)];
  blocks.push({ type: 'divider' }, md(`*Needs Your Yes* ✅`));
  if (!N.length) blocks.push(md('_Nothing to approve. Every brand is on Hold._'));
  for (const b of N) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `\`${b.name}\`\n> *${W[b.suggest.call]}:* ${money(b.meta.camp.daily)} to ${money(b.suggest.to)}/day\n> _${b.suggest.why || ''}_` },
    accessory: apBtn(rec, b.act_id, (b.suggest.call === 'scale' || b.suggest.call === 'raise') ? 'primary' : 'danger') });
  blocks.push({ type: 'divider' }, md('*Brands* 📊'));
  const field = b => {
    const s = b.so_far || {}, l6 = b.last6 || {}, m = b.meta || {}, g = b.suggest || {}, ap = (rec.approved || {})[b.act_id], dd = d && d.per[b.act_id];
    const call = ap ? `approved ${money(ap.to)}/day` : `${W[g.call] || 'Hold'}`;
    const lines = [`\`${b.name}\` ${DOT(ap ? 'good' : (g.call === 'scale' || g.call === 'raise') ? 'good' : g.call === 'cut' ? 'bad' : 'warn')} ${call}`];
    if (b.no_sales) lines.push(`> *Spend:* ${k(s.spend)}`, '> _No Triple Whale store_');
    else lines.push(`> *Sales:* ${k(s.sales)} of ${k(b.goal)}${dd ? `, _+${k(dd.sales)}_` : ''}`, `> *MER:* ${x(s.mer)}, _${x(l6.mer)} last 6h_`);
    lines.push(`> *Budget:* ${m.camp && m.camp.daily ? `${money(m.camp.daily)}/day` : 'n/a'}${m.headroom != null ? `, _${k(m.headroom)} room_` : ''}`);
    return { type: 'mrkdwn', text: lines.join('\n') };
  };
  for (let i = 0; i < B.length; i += 2) blocks.push({ type: 'section', fields: B.slice(i, i + 2).map(field) });
  blocks.push({ type: 'divider' }, { type: 'context', elements: [{ type: 'mrkdwn', text: `Sales and MER: ${salesSource(rec)} · Budgets: Meta${rec.next ? ` · Next check-in ${rec.next}` : ''} · Nothing changes until you tap Approve · <${link()}|Open the War Room>` }] });
  return { blocks };
}

/* ---------- 'board': a scoreboard with a colored bar per brand ---------- */
function boardBlocks(rec, prev, link) {
  const T = totals(rec), d = since(rec, prev), N = needs(rec), B = sorted(rec);
  const bar = p => { const n = Math.max(0, Math.min(20, Math.round(p / 5))); return '▰'.repeat(n) + '▱'.repeat(20 - n); };
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `Where we stand · ${hourOf(rec.slot)}`, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${rec.label.replace(/,? \d+(am|pm) CT$/, '')} · Black Friday weekend${rec.dry ? ' · dry run on today, each brand counts from its own sale start' : ''}${rec.next ? ` · next check-in ${rec.next}` : ''}` }] },
    { type: 'section', text: { type: 'mrkdwn', text: `*${k(T.s)}* of ${k(T.g)} weekend goal\n\`${bar(pct(T.s, T.g))}\`  *${pct(T.s, T.g)}%*` } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: `*MER*\n${DOT(tone(T.mer, 2.5))} ${x(T.mer)} _vs 2.50x_` },
      { type: 'mrkdwn', text: `*Ad spend*\n${k(T.p)}` },
      { type: 'mrkdwn', text: `*Since ${d ? d.label : 'last check-in'}*\n${d ? `+${k(d.sales)} on +${k(d.spend)}${d.mer != null ? ` · ${x(d.mer)}` : ''}` : '_first check-in_'}` },
      { type: 'mrkdwn', text: `*Needs your yes*\n${N.length ? `${N.length} brand${N.length === 1 ? '' : 's'}` : 'Nothing'}` }] },
  ];
  const attachments = B.map(b => {
    const s = b.so_far || {}, l6 = b.last6 || {}, m = b.meta || {}, g = b.suggest || {}, ap = (rec.approved || {})[b.act_id], dd = d && d.per[b.act_id];
    const head = ap ? `*${b.name}* · approved by ${ap.by}, ${money(ap.from)} to ${money(ap.to)}/day` : `*${b.name}* · ${W[g.call] || 'Hold'}${g.to ? ` to ${money(g.to)}/day` : ''}`;
    const fields = b.no_sales
      ? [{ type: 'mrkdwn', text: `*Spend*\n${k(s.spend)}` }, { type: 'mrkdwn', text: '*Sales*\n_No Triple Whale store_' }]
      : [{ type: 'mrkdwn', text: `*Sales*\n${k(s.sales)} of ${k(b.goal)} · ${pct(s.sales, b.goal)}%${dd ? `\n_+${k(dd.sales)} since ${d.label}_` : ''}` },
        { type: 'mrkdwn', text: `*MER*\n${DOT(tone(s.mer, b.kpi))} ${x(s.mer)} so far\n_${x(l6.mer)} last 6h · KPI ${x(b.kpi)}_` }];
    fields.push({ type: 'mrkdwn', text: `*Budget*\n${m.camp && m.camp.daily ? `${money(m.camp.daily)}/day` : m.error ? 'Meta did not answer' : 'n/a'}` },
      { type: 'mrkdwn', text: `*Room under Meta's limit*\n${m.headroom != null ? money(m.headroom) : 'n/a'}` });
    const sec = { type: 'section', text: { type: 'mrkdwn', text: head } };
    if (g.to && !ap) sec.accessory = apBtn(rec, b.act_id, (g.call === 'scale' || g.call === 'raise') ? 'primary' : 'danger');
    const why = `${g.why || ''}${g.note ? ` ${g.note}` : ''}`.trim();
    return { color: ap ? COLOR.done : COLOR[g.call] || COLOR.hold, blocks: [sec, { type: 'section', fields }, ...(why ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: why }] }] : [])] };
  });
  attachments.push({ color: '#4C7AE6', blocks: [{ type: 'actions', elements: [btn('Open the War Room', link())] },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Sales and MER from ${salesSource(rec)}, budgets from Meta. Nothing changes until you tap Approve.` }] }] });
  return { blocks, attachments };
}

/* ---------- Take 4 (Cole, 2026-11-22: "real lines, big header lines, each number its own mini block") ----------
 * Shared pieces: a header block per section (Slack's big bold line), divider blocks between sections (a real line),
 * and every number its own small block: section `fields` (label over value, two columns) or one rich-text quote per
 * metric (each with its own gray bar, Well Copy's look). */
const H = t => ({ type: 'header', text: { type: 'plain_text', text: t, emoji: true } });
const DIV = { type: 'divider' };
const CTX = t => ({ type: 'context', elements: [{ type: 'mrkdwn', text: t }] });
const F = (label, value) => ({ type: 'mrkdwn', text: `*${label}*\n${value}` });
const callDot = (b, ap) => ap ? '✅' : DOT(['scale','raise'].includes((b.suggest || {}).call) ? 'good' : (b.suggest || {}).call === 'cut' ? 'bad' : 'warn');
const callText = (b, ap) => ap ? `Approved, ${money(ap.to)}/day` : `${W[(b.suggest || {}).call] || 'Hold'}${(b.suggest || {}).to ? ` to ${money(b.suggest.to)}/day` : ''}`;
function topBlocks(rec, prev) {
  const T = totals(rec), d = since(rec, prev), N = needs(rec);
  return [H(`📊 Where we stand · ${hourOf(rec.slot)}`),
    CTX(`${rec.label.replace(/,? \d+(am|pm) CT$/, '')} · Black Friday weekend${rec.dry ? ' · dry run on today, each brand counts from its own sale start' : ''}${rec.next ? ` · next check-in ${rec.next}` : ''}`),
    DIV, H('Weekend so far'),
    { type: 'section', fields: [F('Sales', `${k(T.s)}${d ? `  _+${k(d.sales)} since ${d.label}_` : ''}`), F('Of the goal', `${pct(T.s, T.g)}% of ${k(T.g)}`),
      F('MER', `${DOT(tone(T.mer, 2.5))} ${x(T.mer)}  _KPI 2.50x_`), F('Ad spend', `${k(T.p)}${d ? `  _+${k(d.spend)}_` : ''}`)] },
    { type: 'section', fields: [F('Needs your yes', N.length ? `${N.length} brand${N.length === 1 ? '' : 's'}` : 'Nothing'), F('On hold', `${rec.brands.length - N.length} brand${rec.brands.length - N.length === 1 ? '' : 's'}`)] }];
}
function needBlocks(rec, link) {
  const N = needs(rec);
  if (!N.length) return [DIV, H('Needs your yes'), CTX('Nothing to approve. Every brand is on Hold.')];
  return [DIV, H(`Needs your yes (${N.length})`), ...N.flatMap(b => [
    { type: 'section', text: { type: 'mrkdwn', text: `${callDot(b)} *${b.name}*\n${W[b.suggest.call]}: ${money(b.meta.camp.daily)} to *${money(b.suggest.to)}*/day` },
      accessory: apBtn(rec, b.act_id, (b.suggest.call === 'scale' || b.suggest.call === 'raise') ? 'primary' : 'danger') },
    ...(b.suggest.why ? [CTX(b.suggest.why)] : [])])];
}
const foot = (rec, link) => [DIV, CTX(`Sales and MER: ${salesSource(rec)} · Budgets: Meta · Nothing changes until you tap Approve · <${link()}|Open the War Room>`)];

/* A: Well Copy, line for line: each brand's name in orange code, then one quote line (own gray bar) per number. */
function aBlocks(rec, prev, link) {
  const d = since(rec, prev), B = sorted(rec);
  const brand = b => {
    const s = b.so_far || {}, l6 = b.last6 || {}, m = b.meta || {}, ap = (rec.approved || {})[b.act_id], dd = d && d.per[b.act_id];
    const q = (label, value, note) => ({ type: 'rich_text_quote', elements: [{ type: 'text', text: `${label}: `, style: { bold: true } }, { type: 'text', text: value }, ...(note ? [{ type: 'text', text: `,  ${note}`, style: { italic: true } }] : [])] });
    const lines = b.no_sales ? [q('Spend', k(s.spend), 'no Triple Whale store')]
      : [q('Sales', `${k(s.sales)} of ${k(b.goal)}`, dd ? `+${k(dd.sales)} since ${d.label}` : `${pct(s.sales, b.goal)}%`), q('MER', x(s.mer), `${x(l6.mer)} last 6h · KPI ${x(b.kpi)}`)];
    lines.push(q('Budget', m.camp && m.camp.daily ? `${money(m.camp.daily)}/day` : 'n/a', m.headroom != null ? `${k(m.headroom)} room` : null));
    return { type: 'rich_text', elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: b.name, style: { code: true } }, { type: 'text', text: `  ${callDot(b, ap)} ${callText(b, ap)}` }] }, ...lines] };
  };
  return { blocks: [...topBlocks(rec, prev), ...needBlocks(rec, link), DIV, H('Brands'), ...B.map(brand), ...foot(rec, link)] };
}
/* B: a grid: each brand gets a bold line with its call, then six small blocks in two columns, then a gray why. */
function bBlocks(rec, prev, link) {
  const d = since(rec, prev), B = sorted(rec);
  const brand = b => {
    const s = b.so_far || {}, l6 = b.last6 || {}, m = b.meta || {}, g = b.suggest || {}, ap = (rec.approved || {})[b.act_id], dd = d && d.per[b.act_id];
    const fields = b.no_sales ? [F('Spend', k(s.spend)), F('Sales', '_No Triple Whale store_')]
      : [F('Sales', `${k(s.sales)}${dd ? `  _+${k(dd.sales)}_` : ''}`), F('Of the goal', `${pct(s.sales, b.goal)}% of ${k(b.goal)}`),
        F('MER so far', `${DOT(tone(s.mer, b.kpi))} ${x(s.mer)}`), F('Last 6 hours', `${DOT(tone(l6.mer, b.kpi))} ${x(l6.mer)}  _KPI ${x(b.kpi)}_`)];
    fields.push(F('Budget', m.camp && m.camp.daily ? `${money(m.camp.daily)}/day` : 'n/a'), F('Room under limit', m.headroom != null ? money(m.headroom) : 'n/a'));
    return [DIV, { type: 'section', text: { type: 'mrkdwn', text: `${callDot(b, ap)} *${b.name}* · ${callText(b, ap)}` } }, { type: 'section', fields }, ...(g.why ? [CTX(g.why)] : [])];
  };
  return { blocks: [...topBlocks(rec, prev), ...needBlocks(rec, link), DIV, H('Brands'), ...B.flatMap(brand).slice(1), ...foot(rec, link)] };
}
/* C: color cards: the summary in the message, then one attachment per brand with a color bar and its small blocks. */
function cBlocks(rec, prev, link) {
  const d = since(rec, prev), B = sorted(rec);
  const attachments = B.map(b => {
    const s = b.so_far || {}, l6 = b.last6 || {}, m = b.meta || {}, g = b.suggest || {}, ap = (rec.approved || {})[b.act_id], dd = d && d.per[b.act_id];
    const fields = b.no_sales ? [F('Spend', k(s.spend)), F('Sales', '_No Triple Whale store_')]
      : [F('Sales', `${k(s.sales)} of ${k(b.goal)}${dd ? `\n_+${k(dd.sales)} since ${d.label}_` : ''}`), F('MER', `${x(s.mer)} so far\n_${x(l6.mer)} last 6h · KPI ${x(b.kpi)}_`)];
    fields.push(F('Budget', m.camp && m.camp.daily ? `${money(m.camp.daily)}/day` : 'n/a'), F('Room under limit', m.headroom != null ? money(m.headroom) : 'n/a'));
    const sec = { type: 'section', text: { type: 'mrkdwn', text: `*${b.name}*\n${callText(b, ap)}` } };
    if (g.to && !ap) sec.accessory = apBtn(rec, b.act_id, (g.call === 'scale' || g.call === 'raise') ? 'primary' : 'danger');
    return { color: ap ? COLOR.done : COLOR[g.call] || COLOR.hold, blocks: [sec, { type: 'section', fields }, ...(g.why ? [CTX(g.why)] : [])] };
  });
  return { blocks: [...topBlocks(rec, prev), DIV, H('Brands'), CTX('Green = scale, yellow = hold, red = cut. Approve here makes the change in Meta.')], attachments: [...attachments, { color: '#4C7AE6', blocks: foot(rec, link).slice(1) }] };
}
/* D: one designed image (a PNG scoreboard Locus draws: standingimg.js), then one short "what to do" line and the
 * Approve buttons. `img` is a Slack file id the DM uploaded (no public link), or an https URL. */
const imgBlock = (img, alt) => img ? { type: 'image', ...(/^https:/.test(img) ? { image_url: img } : { slack_file: { id: img } }), alt_text: alt } : CTX('_The scoreboard image is not drawn yet._');
export function todoLine(rec) {
  const N = needs(rec);
  if (!N.length) return '*To do:* nothing. Every brand holds until the next check-in.';
  return `*To do:* ${N.map(b => `${b.suggest.call === 'cut' ? 'cut' : 'raise'} ${b.name} ${money(b.meta.camp.daily)} to ${money(b.suggest.to)}/day`).join(', ')}. Tap Approve to do it.`;
}
/* The final format (Cole, 2026-11-22: "whatever you think, I agree"): the picture, then the one line in a color bar
 * (C's colors: red when a cut waits, green when a raise waits, yellow when everything holds), Raise/Cut buttons, link. */
function dBlocks(rec, prev, link, img) {
  const N = needs(rec), color = N.some(b => b.suggest.call === 'cut') ? COLOR.cut : N.length ? COLOR.scale : COLOR.hold;
  const bar = [{ type: 'section', text: { type: 'mrkdwn', text: todoLine(rec) } }, CTX(`<${link()}|Open the War Room>${rec.next ? ` · next check-in ${rec.next}` : ''}`)];
  const blocks = [imgBlock(img, 'Black Friday sale scoreboard: every brand, sales against goal, MER against KPI, the call')];
  /* Ids must differ inside one row: noop_open_<n> (the Slack router acks any noop_open_*). */
  if (N.length) blocks.push({ type: 'actions', elements: N.slice(0, 5).map((b, i) => ({ ...btn(`${b.suggest.call === 'cut' ? 'Cut' : 'Raise'} ${b.name}`, link(b.act_id), b.suggest.call === 'cut' ? 'danger' : 'primary'), action_id: `noop_open_${i}` })) });
  return { blocks, attachments: [{ color, fallback: todoLine(rec).replace(/\*/g, ''), blocks: bar }] };
}

/* ---------- CLIENT, one brand, hourly (2026-11-22 samples for Cole; not sent to any client yet) ----------
 * The same four looks for one brand's own channel: sales vs the weekend goal, ad spend, MER, the last 6 hours, and
 * one plain line on what we are doing. Nothing internal: no Approve, no Meta limit, no hold line. */
export function planLine(b) {
  const g = b.suggest || {}, d = b.meta && b.meta.camp ? b.meta.camp.daily : null;
  if (b.mode === 'plan' && b.sale) return `*What we are doing:* the Black Friday ads are loaded and ready. The sale starts ${new Date(b.sale.start + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}.`;
  if (b.no_sales) return `*What we are doing:* running the Black Friday ads at ${money(d)}/day. Sales numbers are not connected yet.`;
  if (g.call === 'scale' || g.call === 'raise') return `*What we are doing:* sales are beating the goal, so we are raising the Black Friday budget from ${money(d)} to ${money(g.to)} a day.`;
  if (g.call === 'cut') return `*What we are doing:* returns are under goal right now, so we are pulling the budget back from ${money(d)} to ${money(g.to)} a day and moving it to the ads that sell.`;
  return `*What we are doing:* holding the budget at ${money(d)} a day and checking again next hour.`;
}
export function clientCard(rec, act, style, prev, opt = {}) {
  const b = rec.brands.find(z => z.act_id === act); if (!b) return null;
  const s = b.so_far || {}, l6 = b.last6 || {}, o = prev && prev.brands ? prev.brands.find(z => z.act_id === act) : null;
  const dS = o && o.so_far && s.sales != null ? s.sales - (o.so_far.sales || 0) : null;
  const when = `${rec.label.replace(/,? \d+(am|pm) CT$/, '')} · ${hourOf(rec.slot)} CT${rec.dry ? " · dry run on today's numbers" : ''}`;
  const text = `${b.name}, ${hourOf(rec.slot)}: ${k(s.sales)} in sales (${pct(s.sales || 0, b.goal)}% of the weekend goal), MER ${x(s.mer)}.`;
  const head = [H(`${b.name} · Black Friday weekend`), CTX(when)];
  const plan = { type: 'section', text: { type: 'mrkdwn', text: planLine(b) } };
  const src = CTX(`Sales from ${brandSource(b)} · ad spend from Meta · MER = store sales ÷ ad spend`);
  if (style === 'a') {
    const q = (label, value, note) => ({ type: 'rich_text_quote', elements: [{ type: 'text', text: `${label}: `, style: { bold: true } }, { type: 'text', text: value }, ...(note ? [{ type: 'text', text: `,  ${note}`, style: { italic: true } }] : [])] });
    return { text, blocks: [...head, DIV, { type: 'rich_text', elements: [
      { type: 'rich_text_section', elements: [{ type: 'text', text: 'Weekend so far', style: { bold: true } }] },
      q('Sales', `${k(s.sales)} of ${k(b.goal)}`, dS != null ? `+${k(dS)} since the last update` : `${pct(s.sales || 0, b.goal)}% of the goal`),
      q('Ad spend', k(s.spend)), q('MER', x(s.mer), `goal ${x(b.kpi)}`), q('Last 6 hours', x(l6.mer), `${k(l6.sales)} on ${k(l6.spend)}`)] },
      DIV, plan, src] };
  }
  if (style === 'b') {
    return { text, blocks: [...head, DIV,
      { type: 'section', fields: [F('Sales', `${k(s.sales)}${dS != null ? `  _+${k(dS)}_` : ''}`), F('Of the goal', `${pct(s.sales || 0, b.goal)}% of ${k(b.goal)}`),
        F('MER', `${DOT(tone(s.mer, b.kpi))} ${x(s.mer)}  _goal ${x(b.kpi)}_`), F('Ad spend', k(s.spend)),
        F('Last 6 hours', `${DOT(tone(l6.mer, b.kpi))} ${x(l6.mer)}`), F('Since last update', dS != null ? `+${k(dS)}` : '_first update_')] },
      DIV, plan, src] };
  }
  if (style === 'c') {
    const col = tone(s.mer, b.kpi) === 'good' ? COLOR.scale : tone(s.mer, b.kpi) === 'warn' ? COLOR.hold : COLOR.cut;
    return { text, blocks: head, attachments: [
      { color: col, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `*${k(s.sales)}* in sales · ${pct(s.sales || 0, b.goal)}% of the ${k(b.goal)} weekend goal` } },
        { type: 'section', fields: [F('MER', `${x(s.mer)}  _goal ${x(b.kpi)}_`), F('Ad spend', k(s.spend)), F('Last 6 hours', x(l6.mer)), F('Since last update', dS != null ? `+${k(dS)}` : '_first update_')] }] },
      { color: '#4C7AE6', blocks: [plan, src] }] };
  }
  /* Final client format: the picture, then the one plain line in a color bar by MER against goal (C's colors). No buttons. */
  const col = !counted(rec, b) ? COLOR.done : tone(s.mer, b.kpi) === 'good' ? COLOR.scale : tone(s.mer, b.kpi) === 'bad' ? COLOR.cut : COLOR.hold;
  return { text, blocks: [imgBlock(opt.img, `${b.name} Black Friday sale: sales against goal, ad spend, MER`)], attachments: [{ color: col, blocks: [plan] }] };
}

/** The DM in a Block Kit style ('wc', 'board', 'a', 'b', 'c', 'd'), plus the plain `text` Slack shows in the notification. */
export function standingCard(rec, prev, style, link, opt = {}) {
  const T = totals(rec), N = needs(rec);
  const text = `Where we stand, ${rec.label}: ${k(T.s)} of ${k(T.g)} (${pct(T.s, T.g)}%), MER ${x(T.mer)}.${N.length ? ` ${N.length} to approve: ${N.map(b => `${b.name} ${W[b.suggest.call].toLowerCase()}`).join(', ')}.` : ' Nothing to approve.'}`;
  const f = { wc: wcBlocks, board: boardBlocks, a: aBlocks, b: bBlocks, c: cBlocks, d: (r, p, l) => dBlocks(r, p, l, opt.img) }[style] || boardBlocks;
  return { text, ...f(rec, prev, link) };
}
