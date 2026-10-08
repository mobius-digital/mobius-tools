/* WHAT MOVED, POSTED TO SLACK (2026-10-08). Locus already shows "What moved yesterday" on Home
 * (profit/worker/src/hub.js `movedMany`, GET /api/hub/moved). This posts the same finding once a
 * day per brand to the brand's INTERNAL channel (accounts.slack_channel, never brief_channel, which
 * is the client's), and only when something moved: a quiet day posts nothing.
 *
 * THE RULE IS A COPY OF hub.js movedMany. Keep the two in step: yesterday against the SAME WEEKDAY
 * over the last 8 weeks (at least 4 of them with data), shown when 25%+ off normal AND at least 1.5
 * standard deviations, revenue and spend ignored when normal is under 150, revenue names orders vs
 * average order, MER names revenue vs spend, cost per new customer names spend, orders and average
 * order left out when revenue already moved, 3 per brand. One difference on purpose: here each
 * brand uses its OWN timezone for yesterday (hub.js uses the first brand's), and a brand whose
 * yesterday has not been synced since its own midnight is skipped and retried next hour, so a
 * half-synced day never reads as a revenue drop in Slack.
 *
 * Runs inside the account-health hourly cron (`movedTick`), from 8am to 1pm Central, once per
 * Central day per brand (settings `movedDone` = {date, acts}). Global switch: settings `movedPost`
 * ('off' stops it; on by default), editable in Locus Settings > Briefs and Slack.
 * Preview without posting: GET /api/moved-preview (admin). */
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
  const base = [7, 14, 21, 28, 35, 42, 49, 56].map(k => day(addDays(d, -k))).filter(r => r.has);
  if (base.length < 4) return { flags: [], weeks: base.length };
  const mean = k => { const v = base.map(r => r[k]).filter(v => v != null && isFinite(v)); return v.length >= 4 ? v.reduce((s, y) => s + y, 0) / v.length : null; };
  const sd = k => { const m = mean(k); const v = base.map(r => r[k]).filter(v => v != null && isFinite(v)); return m == null ? null : Math.sqrt(v.reduce((s, y) => s + (y - m) ** 2, 0) / v.length); };
  const flags = [];
  for (const [k, label, lower] of [['rev', 'Revenue', false], ['mer', 'MER', false], ['sp', 'Ad spend', 'n'], ['cac', 'Cost per new customer', true], ['aov', 'Average order', false], ['o', 'Orders', false]]) {
    const m = mean(k), s = sd(k), v = x[k];
    if (m == null || v == null || !m) continue;
    if ((k === 'rev' || k === 'sp') && m < 150) continue;
    const ch = v / m - 1, z = s ? (v - m) / s : 0;
    if (Math.abs(ch) < 0.25 || Math.abs(z) < 1.5) continue;
    let why = '';
    if (k === 'rev') { const oc = mean('o') ? x.o / mean('o') - 1 : 0, ac = mean('aov') && x.aov ? x.aov / mean('aov') - 1 : 0; why = Math.abs(oc) >= Math.abs(ac) ? `orders ${pctTxt(oc)}` : `average order ${pctTxt(ac)}`; }
    if (k === 'mer') { const rc = mean('rev') ? x.rev / mean('rev') - 1 : 0, sc = mean('sp') ? x.sp / mean('sp') - 1 : 0; why = Math.abs(rc) >= Math.abs(sc) ? `revenue ${pctTxt(rc)}` : `spend ${pctTxt(sc)}`; }
    if (k === 'cac') { const sc = mean('sp') ? x.sp / mean('sp') - 1 : 0; why = `spend ${pctTxt(sc)}`; }
    flags.push({ metric: k, label, value: v, normal: m, change: ch, z, good: lower === 'n' ? null : ((ch > 0) !== !!lower), why });
  }
  const revHit = flags.some(f => f.metric === 'rev');
  return { flags: flags.filter(f => !(revHit && (f.metric === 'o' || f.metric === 'aov'))).slice(0, 3), weeks: base.length };
}

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

/** The Slack message for one brand: a header, the rule in a line, one line per move, the button. */
export function movedBlocks(r) {
  const { a, date, flags, weeks } = r;
  const wd = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const nice = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const lines = flags.map(f => {
    const pct = Math.abs(Math.round(f.change * 100));
    const tone = f.good === false ? ' (worth a look)' : '';
    return `• *${f.label}* ${fmtOf(f.metric, f.value, a.currency)}, ${pct}% ${f.change >= 0 ? 'above' : 'below'} a normal ${wd} (${fmtOf(f.metric, f.normal, a.currency)})${f.why ? `. Why: ${f.why}` : ''}${tone}.`;
  });
  const text = `What moved yesterday at ${a.name}: ${flags.map(f => f.label.toLowerCase()).join(', ')}`;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `What moved yesterday: ${a.name}`.slice(0, 150) } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${nice} against the last ${weeks} ${wd}s. Only shown when a number is 25% or more off normal and unusual for this brand. Store numbers from Triple Whale.` }] },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n').slice(0, 2900) } },
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?open=overview&act=${encodeURIComponent(a.act_id)}`, action_id: 'noop_open' }] },
  ];
  return { text, blocks };
}

/** The hourly job. d = { getSetting, putSetting, listAccounts, localDate, addDays, centralHour, centralDate, slackPost, subCanAfford } */
export async function movedTick(env, d) {
  const hour = d.centralHour();
  if (hour < MOVED_HOUR) return { skipped: 'before 8am Central' };
  if (hour > MOVED_LAST_HOUR) return { skipped: 'after 1pm Central' };
  if ((await d.getSetting(env, 'movedPost')) === 'off') return { skipped: 'switched off in Settings' };
  const today = d.centralDate();
  let state = {}; try { state = JSON.parse((await d.getSetting(env, 'movedDone')) || '{}') || {}; } catch {}
  if (state.date !== today) state = { date: today, acts: [] };
  const done = new Set(state.acts || []);
  const all = await movedAll(env, d);
  const out = { posted: [], quiet: [], waiting: [], errors: [] };
  for (const r of all) {
    if (done.has(r.a.act_id)) continue;
    if (!r.fresh) { out.waiting.push(r.a.name); continue; }
    if (!r.flags.length) { out.quiet.push(r.a.name); done.add(r.a.act_id); continue; }
    if (!d.subCanAfford(4)) { out.deferred = true; break; }
    const m = movedBlocks(r);
    try { await d.slackPost(env, r.a.slack_channel, m.text, m.blocks, { username: 'Locus' }); out.posted.push(r.a.name); }
    catch (e) { out.errors.push(`${r.a.name}: ${e.message}`); }
    /* Recorded after each brand, posted or failed, so a kill later in the tick never re-posts it. */
    done.add(r.a.act_id);
    await d.putSetting(env, 'movedDone', JSON.stringify({ date: today, acts: [...done] }));
  }
  await d.putSetting(env, 'movedDone', JSON.stringify({ date: today, acts: [...done] }));
  return out;
}

/** GET /api/moved-preview: what would post right now, per brand, without posting. */
export async function movedPreview(env, d) {
  const all = await movedAll(env, d);
  let state = {}; try { state = JSON.parse((await d.getSetting(env, 'movedDone')) || '{}') || {}; } catch {}
  return {
    on: (await d.getSetting(env, 'movedPost')) !== 'off', done_today: state.date === d.centralDate() ? state.acts || [] : [],
    brands: all.map(r => ({ act_id: r.a.act_id, name: r.a.name, date: r.date, fresh: r.fresh, weeks: r.weeks, channel: r.a.slack_channel,
      moves: r.flags, would_post: r.fresh && r.flags.length > 0, message: r.flags.length ? movedBlocks(r) : null })),
  };
}
