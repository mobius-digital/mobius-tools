/* THE YESTERDAY POST (2026-10-09; was "What moved", 2026-10-08). Locus shows "What moved yesterday"
 * on Home (profit/worker/src/hub.js `movedMany`, GET /api/hub/moved). This posts to a brand's INTERNAL
 * channel (brands.internal_channel, slack_channel in brand_accounts; never brief_channel, which is the
 * client's) ONLY WHEN THE BRAND HAD A BAD DAY. Good moves and quiet days post nothing.
 *
 * THE MOVES ARE A COPY OF hub.js movedMany. Keep the two in step: yesterday against the SAME WEEKDAY
 * over the last 8 weeks (at least 4 of them with data), a move when 25%+ off normal AND at least 1.5
 * standard deviations, revenue and spend ignored when normal is under 150, revenue names orders vs
 * average order, MER names revenue vs spend, cost per new customer names spend, orders and average
 * order left out when revenue already moved, 3 per brand. One difference on purpose: here each brand
 * uses its OWN timezone for yesterday (hub.js uses the first brand's), and a brand whose yesterday has
 * not been synced since its own midnight is skipped and retried next hour, so a half-synced day never
 * reads as a revenue drop in Slack.
 *
 * THE VERDICT (`verdictOf`, before the 3-move cut): a move in the BAD direction on revenue (down), MER
 * (down) or cost per new customer (up) makes the day 'bad'; two of them, or any one at 2.5+ standard
 * deviations, makes it 'vbad'. Ad spend alone never counts (it is a choice, not a result); average
 * order and orders only show as the reason. Otherwise 'good' (a good move only) or 'normal'.
 *
 * The post: "Bad day yesterday: <brand>" (or "Very bad day..."), the date against the last N same
 * weekdays, one market line when Pulse saw a Meta outage that day or Breezeway called it BAD / VERY BAD
 * (market.js `marketLine`: cached, one lookup per date per tick, never a Claude call), a line per move,
 * and "Open Yesterday in Locus" (profit/?open=yesterday&act=<brand id>).
 *
 * Runs inside the account-health hourly cron (`movedTick`), from 8am to 1pm Central, once per
 * Central day per brand (settings `movedDone` = {date, acts}). Global switch: settings `movedPost`
 * ('off' stops it; on by default), editable in Locus Settings > Briefs and Slack.
 * Preview without posting: GET /api/moved-preview (admin), with each brand's verdict. */
import { marketLine, metaDay, chatterFor } from './market.js';
import { liveOn } from './calendar.js';
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
export const MOVED_HOUR = 8;
const MOVED_LAST_HOUR = 13;
/* Paused brands and the test account never get a post (memory: paused-brands, golf-sock-paused). */
const SKIP = /galway|instyler|gum of gods|judy ?p|le ?pickle|popby|golf sock/i;
const num = v => (v == null || !isFinite(+v) ? 0 : +v);
const IDS = ['totalSales', 'totalNetTaxes', 'blendedAds', 'totalOrders', 'newCustomersOrders'];

/** The moves for one brand on day `d`, from its pivot P = { metric: { date: value } }. Same as hub.js. */
export function movesFor(a, P, d, addDays) {
  const pctTxt = v => `${Math.abs(Math.round(v * 100))}% ${v >= 0 ? 'up' : 'down'}`;
  const day = dt => { const g = k => num(P[k] && P[k][dt]); const rev = g('totalSales') - g('totalNetTaxes'), sp = g('blendedAds'), o = g('totalOrders'), n = g('newCustomersOrders');
    return { has: !!(P.totalSales && P.totalSales[dt] != null), rev, sp, o, mer: sp ? rev / sp : null, aov: o ? rev / o : null, cac: n ? sp / n : null }; };
  const x = day(d); if (!x.has) return { flags: [], weeks: 0, nodata: true };
  /* Normal = the brand's own last 28 days (2026-10-09, tested: beats the same weekday over 8 weeks; keep hub.js yesterdayMany in step). */
  const base = Array.from({ length: 28 }, (_, i) => day(addDays(d, -1 - i))).filter(r => r.has);
  if (base.length < 20) return { flags: [], weeks: base.length };
  const mean = k => { const v = base.map(r => r[k]).filter(v => v != null && isFinite(v)); return v.length >= 4 ? v.reduce((s, y) => s + y, 0) / v.length : null; };
  const sd = k => { const m = mean(k); const v = base.map(r => r[k]).filter(v => v != null && isFinite(v)); return m == null ? null : Math.sqrt(v.reduce((s, y) => s + (y - m) ** 2, 0) / v.length); };
  const flags = [];
  for (const [k, label, lower] of [['rev', 'Revenue', false], ['mer', 'MER', false], ['sp', 'Ad spend', 'n'], ['cac', 'Cost per new customer', true], ['aov', 'Average order', false], ['o', 'Orders', false]]) {
    const m = mean(k), s = sd(k), v = x[k];
    if (m == null || v == null || !m) continue;
    if ((k === 'rev' || k === 'sp') && m < 150) continue;
    const ch = v / m - 1, z = s ? (v - m) / s : 0;
    if (!(k === 'rev' && ch <= -0.6) && (Math.abs(ch) < 0.25 || Math.abs(z) < 1.5)) continue;   // revenue down 60%+ always counts (keep hub.js in step)
    let why = '';
    if (k === 'rev') { const oc = mean('o') ? x.o / mean('o') - 1 : 0, ac = mean('aov') && x.aov ? x.aov / mean('aov') - 1 : 0; why = Math.abs(oc) >= Math.abs(ac) ? `orders ${pctTxt(oc)}` : `average order ${pctTxt(ac)}`; }
    if (k === 'mer') { const rc = mean('rev') ? x.rev / mean('rev') - 1 : 0, sc = mean('sp') ? x.sp / mean('sp') - 1 : 0; why = Math.abs(rc) >= Math.abs(sc) ? `revenue ${pctTxt(rc)}` : `spend ${pctTxt(sc)}`; }
    if (k === 'cac') { const sc = mean('sp') ? x.sp / mean('sp') - 1 : 0; why = `spend ${pctTxt(sc)}`; }
    flags.push({ metric: k, label, value: v, normal: m, change: ch, z, good: lower === 'n' ? null : ((ch > 0) !== !!lower), why });
  }
  const revHit = flags.some(f => f.metric === 'rev');
  const kept = flags.filter(f => !(revHit && (f.metric === 'o' || f.metric === 'aov')));
  /* The verdict reads every move, before the cut to 3, so a bad cost per new customer behind three
     other moves still counts. bad = the bad moves themselves, shown first in the post. */
  const v = verdictOf(kept);
  return { flags: kept.slice(0, 3), weeks: base.length, verdict: v.verdict, bad: v.bad };
}

/** Bad day or not, from the moves. Only the money results count: revenue down, MER down, cost per
 *  new customer up. Ad spend never does. vbad = 2+ bad moves, or one at 2.5+ standard deviations. */
const RESULT = new Set(['rev', 'mer', 'cac']);
export function verdictOf(flags) {
  const bad = (flags || []).filter(f => RESULT.has(f.metric) && f.good === false);
  if (bad.length) return { verdict: bad.length >= 2 || bad.some(f => Math.abs(f.z) >= 2.5) ? 'vbad' : 'bad', bad };
  return { verdict: (flags || []).some(f => f.good === true) ? 'good' : 'normal', bad };
}
const isBad = r => r.verdict === 'bad' || r.verdict === 'vbad';

/** Every eligible brand's moves for its own yesterday, plus whether that day is fully synced. */
export async function movedAll(env, d) {
  const accts = (await d.listAccounts(env, true)).filter(a => a.slack_channel && !SKIP.test(a.name || ''));
  if (!accts.length) return [];
  const ys = Object.fromEntries(accts.map(a => [a.act_id, d.addDays(d.localDate(a.tz || 'America/Chicago'), -1)]));
  const days = Object.values(ys).sort();
  const from = d.addDays(days[0], -56), to = days[days.length - 1];
  const inl = (n, s) => Array.from({ length: n }, (_, i) => `?${i + s}`).join(',');
  const ids = accts.map(a => a.act_id);
  const { results } = await env.DB.prepare(`SELECT act_id, date, metric, value FROM tw_daily WHERE act_id IN (${inl(ids.length, 3)}) AND date BETWEEN ?1 AND ?2 AND metric IN (${inl(IDS.length, ids.length + 3)})`)
    .bind(from, to, ...ids, ...IDS).all();
  const piv = Object.fromEntries(ids.map(a => [a, {}]));
  for (const r of results || []) ((piv[r.act_id] ??= {})[r.metric] ??= {})[r.date] = r.value;
  /* Fresh = yesterday's totalSales row was written after the brand's own midnight. */
  const { results: syn } = await env.DB.prepare(`SELECT act_id, date, synced_at FROM tw_daily WHERE act_id IN (${inl(ids.length, 3)}) AND date BETWEEN ?1 AND ?2 AND metric = 'totalSales'`)
    .bind(days[0], to, ...ids).all();
  const synced = {}; for (const r of syn || []) if (r.date === ys[r.act_id]) synced[r.act_id] = r.synced_at;
  return accts.map(a => {
    const y = ys[a.act_id], s = synced[a.act_id];
    const fresh = !!s && d.localDate(a.tz || 'America/Chicago', new Date(String(s).replace(' ', 'T') + (/Z$|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'))) > y;
    return { a, date: y, fresh, ...movesFor(a, piv[a.act_id] || {}, y, d.addDays) };
  });
}

const money = (n, cur) => { const c = cur || 'USD', sym = c === 'USD' ? '$' : c + ' ';
  return Math.abs(n) >= 1000 ? `${n < 0 ? '-' : ''}${sym}${(Math.abs(n) / 1000).toFixed(1)}K` : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 }).format(n); };
const fmtOf = (k, v, cur) => k === 'mer' ? `${v.toFixed(2)}x` : k === 'o' ? Math.round(v).toLocaleString('en-US') : money(v, cur);

/** The Slack message for one brand's bad day: a header, the date against its normal, the market line
 *  (when there is one), one line per move (the bad ones first), the button. */
export function movedBlocks(r, market = null, onCal = []) {
  const { a, date, weeks } = r;
  const wd = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const nice = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  /* The bad moves first, then the rest of the shown moves, 4 at most. */
  const flags = [...(r.bad || []), ...(r.flags || []).filter(f => !(r.bad || []).some(b => b.metric === f.metric))].slice(0, 4);
  const lines = flags.map(f => {
    const pct = Math.abs(Math.round(f.change * 100));
    const tone = f.good === false ? ' (worth a look)' : '';
    return `• *${f.label}* ${fmtOf(f.metric, f.value, a.currency)}, ${pct}% ${f.change >= 0 ? 'above' : 'below'} a normal ${wd} (${fmtOf(f.metric, f.normal, a.currency)})${f.why ? `. Why: ${f.why}` : ''}${tone}.`;
  });
  const head = r.verdict === 'vbad' ? 'Very bad day yesterday' : 'Bad day yesterday';
  const text = `${head} at ${a.name}: ${(r.bad || flags).map(f => f.label.toLowerCase()).join(', ')}`;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `${head}: ${a.name}`.slice(0, 150) } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${nice} against ${a.name}'s own last 28 days. Store numbers from Triple Whale, paid orders only.` }] },
    ...(market ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: market.slice(0, 2900) }] }] : []),
    /* The calendar (2026-10-09): a sale starting or ending, or a drop, explains a day before any ad change does. */
    ...(onCal.length ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `On the calendar that day: ${onCal.map(e => `${e.name}${e.start === date ? ' (first day)' : ''}`).join(', ')}.`.slice(0, 2900) }] }] : []),
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n').slice(0, 2900) } },
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Day check in Locus' }, url: `${LOCUS}?open=yesterday&act=${encodeURIComponent(a.act_id)}`, action_id: 'noop_open' }] },
  ];
  return { text, blocks };
}
const marketSafe = (env, date, memo) => marketLine(env, date, memo).catch(() => null);

/** The hourly job. d = { getSetting, putSetting, listAccounts, localDate, addDays, centralHour, centralDate, slackPost, subCanAfford } */
/* THE 8AM POST IS THE DAY CHECK (2026-10-09, Cole: "the goal is: was it a bad day on Meta"). ONE message a day,
 * only when Meta had a bad day (two or more of the four signs in market.js metaDay agree), to the agency's internal
 * channel (settings strategistChannel, else slackChannel). A normal or mixed day posts nothing. The per-brand
 * "bad day for Lucky" posts above are no longer sent (movesFor / movedBlocks stay for the preview and the Strategist). */
export function metaDayBlocks(m) {
  const L = m.latest, s = L.signs, nice = new Date(L.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const lines = [];
  if (s.ours && s.ours.high) lines.push(`• *Our brands* paid more per sale than usual on Meta (${s.ours.worse} of ${s.ours.brands} clearly worse${s.ours.cpm_change != null ? `, costs per 1,000 views ${s.ours.cpm_change >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(s.ours.cpm_change * 100))}%` : ''}).`);
  if (s.breezeway && s.breezeway !== 'NORMAL') lines.push(`• *Other advertisers* had a ${s.breezeway === 'VERY BAD' ? 'very bad' : 'bad'} Meta day too.`);
  if (s.outage.length) lines.push(`• *Meta posted a problem*: ${s.outage.slice(0, 2).join('; ')}.`);
  if (s.chatter && s.chatter.issues) lines.push(`• *Advertisers online* reported problems: ${s.chatter.summary || ''}`);
  const head = `${L.verdict === 'vbad' ? 'Very bad' : 'Bad'} day on Meta yesterday`;
  return { text: `${head}: ${L.hits} of 4 signs agree`, blocks: [
    { type: 'header', text: { type: 'plain_text', text: head } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${nice}. ${L.hits} of 4 signs agree. Hold big changes on Meta until it settles.` }] },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n').slice(0, 2900) || 'Two signs agree.' } },
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Day check in Locus' }, url: `${LOCUS}?open=yesterday`, action_id: 'noop_open' }] },
  ] };
}
export async function movedTick(env, d) {
  const hour = d.centralHour();
  if (hour < MOVED_HOUR) return { skipped: 'before 8am Central' };
  if (hour > MOVED_LAST_HOUR) return { skipped: 'after 1pm Central' };
  if ((await d.getSetting(env, 'movedPost')) === 'off') return { skipped: 'switched off in Settings' };
  const today = d.centralDate();
  let state = {}; try { state = JSON.parse((await d.getSetting(env, 'movedDone')) || '{}') || {}; } catch {}
  if (state.date === today && state.meta) return { skipped: 'checked today', verdict: state.verdict };
  if (!d.subCanAfford(30)) return { deferred: true };
  await chatterFor(env, d.addDays(today, -1)).catch(() => null);
  const m = await metaDay(env, { days: 1 });
  const L = m.latest; if (!L) return { skipped: 'no Meta data yet' };
  const out = { date: L.date, verdict: L.verdict, hits: L.hits };
  if (L.verdict === 'bad' || L.verdict === 'vbad') {
    const ch = (await d.getSetting(env, 'strategistChannel')) || (await d.getSetting(env, 'slackChannel'));
    if (ch) { const b = metaDayBlocks(m); try { await d.slackPost(env, ch, b.text, b.blocks, { username: 'Locus' }); out.posted = ch; } catch (e) { out.error = e.message; } }
    else out.error = 'No agency channel set (Agency settings, The Strategist)';
  }
  await d.putSetting(env, 'movedDone', JSON.stringify({ date: today, meta: true, verdict: L.verdict }));
  return out;
}

/** GET /api/moved-preview: what would post right now, per brand, without posting. */
export async function movedPreview(env, d) {
  const all = await movedAll(env, d);
  let state = {}; try { state = JSON.parse((await d.getSetting(env, 'movedDone')) || '{}') || {}; } catch {}
  const memo = new Map(), brands = [];
  for (const r of all) {
    const post = isBad(r);
    brands.push({ act_id: r.a.act_id, name: r.a.name, date: r.date, fresh: r.fresh, weeks: r.weeks, channel: r.a.slack_channel,
      verdict: r.verdict || (r.nodata ? 'no data' : 'normal'), moves: r.flags, bad: r.bad || [], would_post: r.fresh && post,
      message: post ? movedBlocks(r, await marketSafe(env, r.date, memo)) : null });
  }
  return { on: (await d.getSetting(env, 'movedPost')) !== 'off', done_today: state.date === d.centralDate() ? state.acts || [] : [], brands };
}
