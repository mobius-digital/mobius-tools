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
const money = v => v == null ? 'n/a' : `$${Math.round(v).toLocaleString('en-US')}`;
const k = v => v == null ? 'n/a' : Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`;
const x = v => v == null ? 'n/a' : `${(Math.round(v * 100) / 100).toFixed(2)}x`;
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const W = { scale: 'Scale +50%', hold: 'Hold', cut: 'Cut 25%' };
const ORDER = { cut: 0, scale: 1, hold: 2 };
const DOT = v => v === 'good' ? '🟢' : v === 'warn' ? '🟡' : v === 'bad' ? '🔴' : '⚪';
const COLOR = { scale: '#2EB67D', hold: '#ECB22E', cut: '#E01E5A', done: '#868686' };
const tone = (v, kpi) => v == null || !kpi ? '' : v >= kpi ? 'good' : v >= kpi * 0.8 ? 'warn' : 'bad';
const hourOf = slot => { const h = +String(slot || '').split('T')[1]; return isNaN(h) ? '' : h === 12 ? '12pm' : h === 0 ? '12am' : h < 12 ? `${h}am` : `${h - 12}pm`; };
const dayName = slot => new Date(String(slot).split('T')[0] + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

function totals(rec) {
  const ok = rec.brands.filter(b => !b.no_sales && b.so_far && b.so_far.sales != null);
  const s = ok.reduce((t, b) => t + b.so_far.sales, 0), p = ok.reduce((t, b) => t + b.so_far.spend, 0), g = ok.reduce((t, b) => t + (b.goal || 0), 0);
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
    accessory: btn('Approve', link(b.act_id), b.suggest.call === 'scale' ? 'primary' : 'danger') });
  blocks.push({ type: 'divider' }, md('*Brands* 📊'));
  const field = b => {
    const s = b.so_far || {}, l6 = b.last6 || {}, m = b.meta || {}, g = b.suggest || {}, ap = (rec.approved || {})[b.act_id], dd = d && d.per[b.act_id];
    const call = ap ? `approved ${money(ap.to)}/day` : `${W[g.call] || 'Hold'}`;
    const lines = [`\`${b.name}\` ${DOT(ap ? 'good' : g.call === 'scale' ? 'good' : g.call === 'cut' ? 'bad' : 'warn')} ${call}`];
    if (b.no_sales) lines.push(`> *Spend:* ${k(s.spend)}`, '> _No Triple Whale store_');
    else lines.push(`> *Sales:* ${k(s.sales)} of ${k(b.goal)}${dd ? `, _+${k(dd.sales)}_` : ''}`, `> *MER:* ${x(s.mer)}, _${x(l6.mer)} last 6h_`);
    lines.push(`> *Budget:* ${m.camp && m.camp.daily ? `${money(m.camp.daily)}/day` : 'n/a'}${m.headroom != null ? `, _${k(m.headroom)} room_` : ''}`);
    return { type: 'mrkdwn', text: lines.join('\n') };
  };
  for (let i = 0; i < B.length; i += 2) blocks.push({ type: 'section', fields: B.slice(i, i + 2).map(field) });
  blocks.push({ type: 'divider' }, { type: 'context', elements: [{ type: 'mrkdwn', text: `Sales and MER: Triple Whale · Budgets: Meta${rec.next ? ` · Next check-in ${rec.next}` : ''} · Nothing changes until you tap Approve · <${link()}|Open the War Room>` }] });
  return { blocks };
}

/* ---------- 'board': a scoreboard with a colored bar per brand ---------- */
function boardBlocks(rec, prev, link) {
  const T = totals(rec), d = since(rec, prev), N = needs(rec), B = sorted(rec);
  const bar = p => { const n = Math.max(0, Math.min(20, Math.round(p / 5))); return '▰'.repeat(n) + '▱'.repeat(20 - n); };
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `Where we stand · ${hourOf(rec.slot)}`, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${rec.label.replace(/,? \d+(am|pm) CT$/, '')} · Black Friday weekend${rec.dry ? ' · dry run, the weekend starts Thu Nov 26' : ''}${rec.next ? ` · next check-in ${rec.next}` : ''}` }] },
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
    if (g.to && !ap) sec.accessory = btn('Approve', link(b.act_id), g.call === 'scale' ? 'primary' : 'danger');
    const why = `${g.why || ''}${g.note ? ` ${g.note}` : ''}`.trim();
    return { color: ap ? COLOR.done : COLOR[g.call] || COLOR.hold, blocks: [sec, { type: 'section', fields }, ...(why ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: why }] }] : [])] };
  });
  attachments.push({ color: '#4C7AE6', blocks: [{ type: 'actions', elements: [btn('Open the War Room', link())] },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Sales and MER from Triple Whale, budgets from Meta. Nothing changes until you tap Approve on the War Room.' }] }] });
  return { blocks, attachments };
}

/** The DM in a Block Kit style ('wc' or 'board'), plus the plain `text` Slack shows in the notification. */
export function standingCard(rec, prev, style, link) {
  const T = totals(rec), N = needs(rec);
  const text = `Where we stand, ${rec.label}: ${k(T.s)} of ${k(T.g)} (${pct(T.s, T.g)}%), MER ${x(T.mer)}.${N.length ? ` ${N.length} to approve: ${N.map(b => `${b.name} ${W[b.suggest.call].toLowerCase()}`).join(', ')}.` : ' Nothing to approve.'}`;
  return { text, ...(style === 'wc' ? wcBlocks(rec, prev, link) : boardBlocks(rec, prev, link)) };
}
