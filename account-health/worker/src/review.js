/* THE MONDAY ACCOUNT REVIEW (2026-10-10). Every Monday, Central, after the briefs and the weekly reports, the
 * Strategist reviews each active brand the way a senior strategist would before the week starts: the audit
 * (command center reasons and fatigue, the Day check verdicts), goals against the plan, creative fatigue,
 * budgets and structure (meta_read), stock, and the calendar for the next 14 days. It posts ONE message to the
 * brand's INTERNAL channel (brand_accounts.slack_channel, never brief_channel) with the read, and each change it
 * would make as an Apply card in the thread under it. Nothing is applied on its own: the cards are the engine's
 * own proposals (ACTIONS propose, apply on the tap), exactly as askschedule.js kind 'task' posts them.
 *
 * Why the cards go in the thread and not inside the one message: an Apply tap answers with replace_original
 * (worker.js, the ask_apply handler), which would wipe the whole read on the first tap.
 *
 * Switch: settings `mondayReview` = 'on' runs it; anything else (the default) is off. Cole turns it on in Locus:
 * Agency settings > The Strategist > Monday account review.
 * Cost: ONE Strategist answer per brand per Monday (the workspace model, Opus 5.5 medium by default), recorded in
 * strat_run like every other answer (who = "Monday review", brand = the brand). Roughly $0.40 to $1.00 a brand,
 * so about $3 to $8 a Monday for eight brands. Hard caps: MAX_BRANDS a Monday, MAX_PER_TICK an hour, MAX_TRIES per
 * brand, MAX_CARDS per brand. Every brand waits for `subCanAfford(COST_REVIEW)` BEFORE it starts (the budget rule).
 * State: settings `mondayReviewDone` = {date, acts: {brand id: {status, at, tries, ts, cards, cost}}}.
 *
 * Routes (admin; mounted inside the /api/ask block, so a client login never reaches them):
 *   GET  /api/ask/review              the switch, when it runs, this Monday's state per brand
 *   PUT  /api/ask/review {on}         turn it on or off
 *   POST /api/ask/review/preview {act} the review for one brand now, built and returned, posted NOWHERE
 */
import { slackAnswer } from './askschedule.js';
import { resolveBrandId } from './brands.js';

/* Paused brands, the test account and the demo never get a review (memory: paused-brands, golf-sock-paused). */
const SKIP = /galway|instyler|gum of gods|judy ?p|le ?pickle|popby|golf sock|harborline/i;
export const COST_REVIEW = 200;   // subrequests one review may use: ~10 tool rounds of D1 + Graph + Anthropic
export const MAX_PER_TICK = 2;    // an Opus answer takes a minute or two; two an hour keeps the tick short
export const MAX_BRANDS = 12;     // a Monday never reviews more brands than this
const MAX_TRIES = 2;              // a brand whose answer failed is tried once more, then left
export const MAX_CARDS = 4;       // at most this many Apply cards per brand
const REPORT_OFFSET = 2;          // same as worker.js REPORT_HOUR_OFFSET: runs once the weekly reports have had their hour
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const CH = /^[CG][A-Z0-9]{6,}$/;

export const isOn = async (env, d) => String((await d.getSetting(env, 'mondayReview').catch(() => null)) || '').toLowerCase() === 'on';
const dowOf = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();
const hourWord = h => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
async function startHour(env, d) { const bh = d.briefHour ? await d.briefHour(env).catch(() => 9) : 9; return Math.min(23, (Number.isInteger(+bh) ? +bh : 9) + REPORT_OFFSET); }

async function doneState(env, d) {
  let s = {}; try { s = JSON.parse((await d.getSetting(env, 'mondayReviewDone')) || '{}') || {}; } catch {}
  return s && s.date === d.centralDate() ? { date: s.date, acts: s.acts || {} } : { date: d.centralDate(), acts: {}, last: s && s.date ? s : null };
}
async function saveState(env, d, st) { await d.putSetting(env, 'mondayReviewDone', JSON.stringify({ date: st.date, acts: st.acts })); }

/** The brands a review covers: active, not paused, not the test account. Each with why it would be skipped. */
export async function reviewBrands(env, d) {
  const accts = await d.listAccounts(env, true);
  return accts.filter(a => !SKIP.test(a.name || '')).slice(0, MAX_BRANDS).map(a => {
    const ch = String(a.slack_channel || '').trim();
    /* The internal channel only. A brand whose "internal" channel is also its client channel is refused: the read
       carries the team's numbers and proposed changes. */
    const why = !CH.test(ch) ? 'no internal Slack channel set' : ch === String(a.brief_channel || '').trim() ? 'its internal channel is the client channel' : null;
    return { act_id: a.act_id, name: a.name, channel: CH.test(ch) ? ch : null, skip: why };
  });
}

/** What the Strategist is asked. It reads with its own tools; the list says where, not what to conclude. */
export function reviewPrompt(b, today) {
  const id = b.act_id;
  return `[Monday account review for ${b.name} (${id}), ${today}. It runs on its own every Monday and your answer is posted to the team's INTERNAL Slack channel for ${b.name}. Nobody is there to answer questions back, so do not ask any.]
Review ${b.name} for the week ahead the way a senior strategist does on a Monday morning. Read before you judge, about this brand only:
1. The audit: locus_get /api/hub/command?act=${id} (the command center: what needs a call and why, fatigue, stuck work) and locus_get /api/hub/yesterday?act=${id} (the Day check verdicts for the last 14 days).
2. Goals against the plan: the plan view (goals and this month's plan) against month to date. If a giveaway is running (the store view's giveaway block, or locus_get /api/hub/giveaway?act=${id}), the MER floor applies to SALES spend (Sales MER) and the giveaway is judged on cost per entry against its most to pay and its pace to the entries goal, never on MER.
3. Creative fatigue: the creatives view (14 days) and the tests view. A tiring ad is judged by its role in its ad set, not alone.
4. Budgets and structure: meta_read (live campaigns, ad sets, budgets). Judge each ad set first, then each ad by its role in that set. Never cut the anchor of an ad set that is working.
5. Stock: the stock view. Do not put more spend behind a product that runs out soon; say where the spend can go instead.
6. The calendar: the calendar view, only what goes live or is due in the next 14 days (launches, sales, emails, countdown steps still open).
7. What the team already did: the changes view for the last 7 days, so you never propose undoing a change made on purpose.
If a source is not connected or has no data, say so in a few words and move on.
Then write the read for the team: one line on where ${b.name} stands against its goal, then only the few things that matter this week, worst first, each with the number and why. Revenue, orders, ROAS and CPA are Triple Whale's; say "Meta-reported" for a number that is Meta's own.
Then PROPOSE the changes you would make this week with your actions, at most ${MAX_CARDS}, the most valuable first. Each proposal is posted under your message as an Apply card for a person to approve; nothing is applied on its own. Propose only what the data supports. If nothing should change, say so and propose nothing. Do not build a report, save memory, schedule anything or post anywhere. Keep the read under 250 words, plain English, no em dashes.`;
}

/** One brand's review: ask, then post (unless dry). Returns what happened; never throws. */
export async function reviewBrand(env, d, b, { dry = false, who = 'Monday review' } = {}) {
  const today = d.centralDate();
  const { engine, h } = d.strategist();
  const r = await engine.answerWeb(env, reviewPrompt(b, today), [], h(), {
    who, screen: { screen: 'Monday account review (Slack)', brand_selected: b.name, act_id: b.act_id },
  }).catch(e => ({ error: String(e.message || e) }));
  if (!r || r.error) return { error: (r && r.error) || 'no answer' };
  const text = slackAnswer(r.answer || '');
  const proposals = (r.proposals || []).slice(0, MAX_CARDS);
  const chunks = []; for (let i = 0; i < text.length && chunks.length < 8; i += 2900) chunks.push(text.slice(i, i + 2900));
  const n = proposals.length;
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `*Monday review: ${b.name}*` } },
    ...chunks.map(c => ({ type: 'section', text: { type: 'mrkdwn', text: c } })),
    { type: 'context', elements: [{ type: 'mrkdwn', text: `The Strategist's Monday account review, run automatically. ${n ? `${n} suggested change${n > 1 ? 's' : ''} in the thread, each waiting for a person to press Apply.` : 'No changes suggested.'}${r.costLine ? ` ${r.costLine}.` : ''} Turn it off in Locus: Agency settings > The Strategist.` }] },
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?open=overview&act=${encodeURIComponent(b.act_id)}`, action_id: 'noop_open' }] },
  ];
  const cost = +r.cost || 0;
  if (dry) return { ok: true, dry: true, brand: b.name, channel: b.channel, text, blocks, proposals: proposals.map(p => ({ summary: p.summary, detail: p.detail || '' })), cost, costLine: r.costLine || null, model: r.model };
  if (!b.channel || b.skip) return { error: b.skip || 'no internal channel' };
  const fallback = `Monday review: ${b.name}`;
  const msg = { channel: b.channel, text: fallback, blocks, unfurl_links: false, username: 'Strategist' };
  let posted = await d.slackApi(env, 'chat.postMessage', msg).catch(e => ({ ok: false, error: e.message }));
  if (posted && posted.ok === false && /missing_scope|invalid_arg|not_allowed/.test(String(posted.error || ''))) { const { username, ...plain } = msg; posted = await d.slackApi(env, 'chat.postMessage', plain).catch(e => ({ ok: false, error: e.message })); }
  if (!posted || posted.ok === false) return { error: `Slack said ${posted?.error || 'nothing'}`, cost };
  let cards = 0;
  for (const p of proposals) {
    const c = await d.slackApi(env, 'chat.postMessage', { channel: b.channel, thread_ts: posted.ts, text: p.summary, blocks: engine.proposalBlocks(p), unfurl_links: false, username: 'Strategist' }).catch(() => null);
    if (c?.ok) cards++;
  }
  return { ok: true, ts: posted.ts, cards, cost };
}

/** The hourly job. d = hubDeps() + briefHour. Monday only, from the reports hour, once per brand. */
export async function reviewTick(env, d) {
  if (!(await isOn(env, d))) return { off: true };
  const today = d.centralDate();
  if (dowOf(today) !== 1) return { notMonday: true };
  if (d.centralHour() < await startHour(env, d)) return { waiting: true };
  const st = await doneState(env, d);
  const out = { ran: [], skipped: [], errors: [] };
  const brands = await reviewBrands(env, d);
  /* Brands that cannot get a review are written down first (no cost), so Locus shows why. */
  const skips = brands.filter(b => b.skip && st.acts[b.act_id]?.status !== 'skipped');
  for (const b of skips) { st.acts[b.act_id] = { status: 'skipped', why: b.skip, at: new Date().toISOString() }; out.skipped.push(`${b.name}: ${b.skip}`); }
  if (skips.length) await saveState(env, d, st);
  for (const b of brands) {
    const cur = st.acts[b.act_id] || {};
    if (b.skip || cur.status === 'ok' || (cur.tries || 0) >= MAX_TRIES) continue;
    if (out.ran.length + out.errors.length >= MAX_PER_TICK) { out.deferred = true; break; }
    /* The budget rule: decide BEFORE the brand starts, never mid-brand. */
    if (!d.subCanAfford(COST_REVIEW)) { out.deferred = true; break; }
    /* The try is written down first, so a run that dies half way is not retried for ever. */
    st.acts[b.act_id] = { ...cur, status: 'running', tries: (cur.tries || 0) + 1, at: new Date().toISOString() };
    await saveState(env, d, st);
    const r = await reviewBrand(env, d, b).catch(e => ({ error: e.message }));
    st.acts[b.act_id] = r.error
      ? { ...st.acts[b.act_id], status: 'error', error: String(r.error).slice(0, 200), cost: r.cost || 0 }
      : { ...st.acts[b.act_id], status: 'ok', ts: r.ts, cards: r.cards, cost: r.cost || 0 };
    await saveState(env, d, st);
    if (r.error) out.errors.push(`${b.name}: ${r.error}`); else out.ran.push(b.name);
  }
  return out;
}

/** The routes. Returns null when the path is not one of these. */
export async function handleReview(request, env, path, json, d) {
  if (!path.startsWith('/api/ask/review')) return null;
  if (!(await d.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (path === '/api/ask/review' && request.method === 'GET') {
    const st = await doneState(env, d);
    const h = await startHour(env, d);
    const brands = (await reviewBrands(env, d)).map(b => ({ ...b, today: st.acts[b.act_id] || null }));
    return json({ on: await isOn(env, d), when: `Mondays from ${hourWord(h)} Central, after the briefs and weekly reports, ${MAX_PER_TICK} brands an hour`,
      date: st.date, last: st.last || null, brands, max_cards: MAX_CARDS,
      cost: 'One Strategist answer per brand per Monday, about $0.40 to $1.00 each on Opus 5.5.' });
  }
  if (path === '/api/ask/review' && request.method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    await d.putSetting(env, 'mondayReview', b.on ? 'on' : 'off');
    return json({ ok: true, on: !!b.on });
  }
  if (path === '/api/ask/review/preview' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const id = await resolveBrandId(env, String(b.act || '')).catch(() => null);
    const brand = (await reviewBrands(env, d)).find(x => x.act_id === id || x.act_id === b.act);
    if (!brand) return json({ error: 'Pick an active brand. Paused brands and the test account are never reviewed.' }, 400);
    const email = await d.sessionEmail(env, request).catch(() => null);
    const r = await reviewBrand(env, d, brand, { dry: true, who: `${email || 'admin'} (preview)` });
    return json(r, r.error ? 400 : 200);
  }
  return json({ error: 'not found' }, 404);
}
