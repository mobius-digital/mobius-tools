/* TODAY'S CALLS IN SLACK (2026-10-13). Cole: "the point of today's calls is that if something's there, we can make a
 * call right then and there... it also sends a message into Slack." Once per Central day from 8am (to 1pm, like the
 * old What-moved post), for every active brand that is not paused (moved.js SKIP, memory paused-brands and
 * golf-sock-paused), this reads the media buyer's list the page shows (profit worker /api/hub/today?act=<brand>,
 * hub.js buyerList) as the owner over the PROFIT service binding (a minted session, like morning.js) and, ONLY when
 * there are Scale / Cut / Trim / Refresh rows, posts ONE message to the brand's INTERNAL channel
 * (brand_accounts.slack_channel, never brief_channel): the call, the ad set or ad, the money at stake, the why in plain
 * words, and an "Open in Locus" button to Ads > Today for that brand. Fix rows ride in the Daily Brief already; Call
 * rows (tests) are on the page. Nothing is written to Meta by this post: the buttons on the page do that.
 *   todayTick(env, d): inside the hourly cron, right after meetingsTick. State: settings `todayDone` =
 *   {date, acts: {brand: status}, tries: {brand: n}}; a brand whose read failed is tried once more next hour.
 *   Budget: d.canAfford(40) BEFORE each brand (never mid-brand). Switch: settings `todayPost` ('off' stops it).
 *   2026-10-13: OFF while the morning card is on (settings.morningCard); the card reuses readToday and messageFor. */
import { SKIP as PAUSED } from './moved.js';
import { laneBlocks, noDash } from './lane.js';
const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
export const TODAY_HOUR = 8, TODAY_LAST_HOUR = 13;
const KINDS = ['scale', 'cut', 'trim', 'refresh', 'mixed'];
const VERB = { scale: 'Scale', cut: 'Cut', trim: 'Trim', refresh: 'Refresh', mixed: 'Mixed, your call' };
const sym = c => (!c || c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : c === 'CAD' ? 'CA$' : c === 'AUD' ? 'A$' : c + ' ');
const money = (n, c) => n == null || !isFinite(n) ? '' : sym(c) + Math.round(n).toLocaleString('en-US');
const mk = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Reads /api/hub/today?act=<brand> as the owner. d.profit(path, token) may replace the binding (tests). */
export async function readToday(env, d, act) {
  const owner = env.OWNER_EMAIL || 'cole@go-mobius-digital.com';
  const { token } = await d.mintSession(env, owner);
  const call = d.profit || (async (path, tok) => {
    if (!env.PROFIT) throw new Error('The PROFIT service binding is missing on account-health.');
    const res = await env.PROFIT.fetch(new Request(PROFIT_ORIGIN + path, { headers: { Authorization: `Bearer ${tok}` } }));
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    return j;
  });
  return call(`/api/hub/today?act=${encodeURIComponent(act)}`, token);
}
/** One line per row: the call, what, the money at stake, the full why. */
export function lineFor(r) {
  const what = r.ad ? `the ad "${r.ad}" in "${r.adset || ''}"` : `"${r.adset || ''}"`;
  const stake = r.stake > 0 ? `, ${money(r.stake, r.currency)} at stake` : '';
  return `*${VERB[r.kind] || r.kind}* ${mk(what)}${stake}. ${mk(String(r.why ?? '').replace(/\s+/g, ' ').trim())}`.trim();
}
/** The message for one brand, or null when there is nothing to call today (Fix and Call rows are not posted).
 *  2026-10-15 (Cole: the FULL list in Slack, never folded, like Viktor's posts): Slack folds ONE tall section behind
 *  Show more, never a message of many short blocks. So every call is its own section, the why in full, sorted by money
 *  at stake. Slack takes 50 blocks a message: past that the calls carry on in `rest` (more messages, same shape). */
const PER_MSG = 45;
/** One call in the lane format (2026-11-09): the call on its line, "Why:" under it. */
export function callLine(r) {
  const what = r.ad ? `the ad "${r.ad}" in "${r.adset || ''}"` : `"${r.adset || ''}"`;
  const stake = r.stake > 0 ? `, ${money(r.stake, r.currency)} at stake` : '';
  const why = noDash(String(r.why ?? '').replace(/\s+/g, ' ').trim());
  return `*${VERB[r.kind] || r.kind}* ${mk(what)}${stake}${why ? `\nWhy: ${mk(why)}` : ''}`;
}
/** who (optional) = the media buyer's tag or name; nobody named = Cole (lane.js). */
export function messageFor(brand, rows, who) {
  const list = (rows || []).filter(r => KINDS.includes(r.kind)).sort((p, q) => (q.stake || 0) - (p.stake || 0));
  if (!list.length) return null;
  const lines = list.map(callLine);
  const url = `${LOCUS}?open=today&act=${encodeURIComponent(brand.act_id)}`;
  /* Lane first (lane.js): "*MEDIA BUYING · Brand*", the buyer tagged with the one ask, then one section per call. */
  const lane = laneBlocks({ lane: 'MEDIA BUYING', brand: brand.name, who, ask: `Make today's ${list.length} ad call${list.length === 1 ? '' : 's'}` });
  const head = lane.text;
  const sec = l => ({ type: 'section', text: { type: 'mrkdwn', text: l.slice(0, 2900) } });
  const chunks = [];
  for (let i = 0; i < lines.length; i += PER_MSG) chunks.push(lines.slice(i, i + PER_MSG));
  const rest = chunks.slice(1).map((c, i) => ({ text: `${head} (${i + 2} of ${chunks.length})\n${c.join('\n')}`, blocks: c.map(sec) }));
  return { text: `${head}\n${chunks[0].join('\n')}`, rest, blocks: [
    lane.blocks[0],
    ...chunks[0].map(sec),
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url }] },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Do it on the page writes the change to Meta after you confirm it. Switch this post off in Agency settings (todayPost).' }] },
  ] };
}

export async function todayTick(env, d) {
  if ((await d.getSetting(env, 'todayPost')) === 'off') return { skipped: 'off' };
  /* 2026-10-13: the morning card (morningcard.js) carries today's calls as one line and this list in its thread. */
  if (d.cardOn && await d.cardOn(env)) return { skipped: 'the morning card carries it' };
  const hour = d.centralHour();
  if (hour < TODAY_HOUR) return { skipped: `before ${TODAY_HOUR}am Central` };
  if (hour > TODAY_LAST_HOUR) return { skipped: 'after 1pm Central' };
  const today = d.centralDate();
  let state = {}; try { state = JSON.parse((await d.getSetting(env, 'todayDone')) || '{}') || {}; } catch {}
  if (state.date !== today) state = { date: today, acts: {}, tries: {} };
  state.acts = state.acts || {}; state.tries = state.tries || {};
  const brands = (await d.listAccounts(env, true)).filter(a => !PAUSED.test(a.name || '') && !state.acts[a.act_id]);
  if (!brands.length) return { skipped: 'all checked today', done: Object.keys(state.acts).length };
  const out = { date: today, posted: [], quiet: [], skipped: [], failed: [] };
  for (const a of brands) {
    if (!d.canAfford(40)) { out.deferred = 'budget'; break; }
    /* Never a client channel: no internal channel, or the internal channel IS the client channel, means no post. */
    if (!a.slack_channel || a.slack_channel === a.brief_channel) { state.acts[a.act_id] = 'no internal channel'; out.skipped.push(a.name); continue; }
    let r;
    try { r = await readToday(env, d, a.act_id); }
    catch (e) {
      state.tries[a.act_id] = (state.tries[a.act_id] || 0) + 1;
      if (state.tries[a.act_id] >= 2) state.acts[a.act_id] = `failed: ${e.message}`;
      out.failed.push(`${a.name} (${e.message})`); continue;
    }
    const buyer = d.teamOf ? (((await d.teamOf(env, [a.act_id]).catch(() => ({}))) || {})[a.act_id] || {}).buyer : null;
    const msg = messageFor(a, r && r.rows, buyer && d.tagOf ? (await d.tagOf(env, buyer).catch(() => null)) || buyer : buyer);
    if (!msg) { state.acts[a.act_id] = 'nothing to call'; out.quiet.push(a.name); continue; }
    try { await d.slackPost(env, a.slack_channel, msg.text, msg.blocks, { username: 'Locus' }); for (const m of msg.rest || []) await d.slackPost(env, a.slack_channel, m.text, m.blocks, { username: 'Locus' }); state.acts[a.act_id] = 'posted'; out.posted.push(a.name); }
    catch (e) { state.acts[a.act_id] = `failed: ${e.message}`; out.failed.push(`${a.name} (${e.message})`); }
  }
  await d.putSetting(env, 'todayDone', JSON.stringify(state));
  return out;
}
