/* TEST MINIMUMS DUE OFF, EVERY DAY (2026-10-15, Cole approved: "a DAILY check with a Slack button, every active brand").
 *
 * Before this, a test's minimum spend came off only on the Monday "Do it" (asana-brand.js runMondayPlan), and only for
 * brands with rules.monday_post on (Bonk, Lucky). Everyone else's minimums stayed on until someone remembered.
 * Now, once a Central day from the morning hour, every active brand (not paused, not The Golf Sock, not Harborline,
 * not demo_: morningcard.js `eligible`) gets the same judgement as Monday (asana-brand.js testMinimumsDue: judged and
 * not a loser, or past rules.min_days; and the minimum is still set in Meta, read live). When anything is due, ONE
 * reply goes under the brand's morning card (teamPost), the buyer tagged (calendar.js teamOf):
 *   "<set name>: test minimum $X/day is due off (day N, judged)."   [Take it off]
 *   ...                                                              [Take all N off]   (only when several)
 * Nothing is applied by itself. A tap runs metawrite.js locusWrite kind 'min_spend' with min 0 as the tapper (the Slack
 * name), so the write is the Locus one: fresh read, brand check, Manage check, p_meta_write row, Change Log line, undo
 * in Locus for 24 hours. The message is then redrawn: the line struck through, "Done by X, undo in Locus".
 *
 * Buttons: action ids minoff_one_<i> and minoff_all. The slack-router sends minoff_* to Locus (IDEA_ID in
 * slack-router/worker/src/worker.js).
 * State (settings): `minOffDone` = {date, acts, tries}; `minOff:<act>:<date>` = the posted message {act, date, brand,
 * channel, ts, tag, items[{id, name, min, day, why, done?, already?, err?, write?}]}. Switch: settings.minOffPost
 * ('off' stops it; Locus Agency settings > Slack and sending). */
import { eligible, morningHour, todaysCard, cardOn } from './morningcard.js';

export const COST_MINOFF_BRAND = 40;   // live Meta read (2 Graph calls per ad account) + the stats reads + the post
const WAIT_FOR_CARD = 3;               // hours past the morning hour to wait for today's card (the card waits up to 2 for its brief)
const MAX_ITEMS = 40;                  // Slack: 50 blocks a message

const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
async function getSetting(env, k) { const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null); return r?.value ?? null; }
async function putSetting(env, k, v) { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, String(v)).run(); }
const msgKey = (act, date) => `minOff:${act}:${date}`;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dollars = n => '$' + (+n || 0).toLocaleString('en-US', { minimumFractionDigits: +n % 1 ? 2 : 0, maximumFractionDigits: 2 });

export async function minOffOn(env) { return (await getSetting(env, 'minOffPost')) !== 'off'; }

/** One line per ad set. */
export function minOffLine(it) {
  const base = `${esc(it.name)}: test minimum ${dollars(it.min)}/day`;
  if (it.done) return it.already ? `~${base}~ Already off in Meta (checked by ${esc(it.done)})` : `~${base}~ Done by ${esc(it.done)}, undo in Locus`;
  return `${base} is due off (day ${it.day || '?'}, ${it.why}).${it.err ? ` _Didn't work: ${esc(it.err)}_` : ''}`;
}
/** The message (posted, and redrawn after a tap): the tag on the first line, a Take it off button per open line,
 *  Take all N off when two or more are open. */
export function minOffMessage(st) {
  const items = st.items || [];
  const open = items.filter(i => !i.done);
  const lines = items.map((it, i) => (i === 0 && st.tag ? `${st.tag} ` : '') + minOffLine(it));
  const blocks = items.map((it, i) => ({
    type: 'section', text: { type: 'mrkdwn', text: lines[i] },
    ...(it.done ? {} : { accessory: { type: 'button', action_id: `minoff_one_${i}`, text: { type: 'plain_text', text: 'Take it off' }, value: JSON.stringify({ a: st.act, d: st.date, s: it.id }) } }),
  }));
  if (open.length >= 2) blocks.push({ type: 'actions', elements: [{ type: 'button', action_id: 'minoff_all', style: 'primary', text: { type: 'plain_text', text: `Take all ${open.length} off` },
    value: JSON.stringify({ a: st.act, d: st.date }),
    confirm: { title: { type: 'plain_text', text: 'Take these minimums off?' }, text: { type: 'mrkdwn', text: `${open.length} test minimums set to $0 in Meta. Each one can be undone in Locus for 24 hours.` },
      confirm: { type: 'plain_text', text: 'Take them off' }, deny: { type: 'plain_text', text: 'Cancel' } } }] });
  return { text: lines.join('\n'), blocks };
}

/** The hourly tick: once per Central day per brand, from the morning hour. Waits (up to WAIT_FOR_CARD hours) for the
 *  brand's morning card so the line lands in its thread; then posts anyway (teamPost falls back to top-level). */
export async function minOffTick(env, d) {
  if (!(await minOffOn(env))) return { skipped: 'off' };
  const hour = d.centralHour(), from = await morningHour(env);
  if (hour < from) return { skipped: `before ${from}am Central` };
  const today = d.centralDate();
  let st = safe(await getSetting(env, 'minOffDone'), {}) || {};
  if (st.date !== today) st = { date: today, acts: {}, tries: {} };
  st.acts = st.acts || {}; st.tries = st.tries || {};
  const brands = (await d.listAccounts(env, true)).filter(a => eligible(a) && !st.acts[a.act_id]);
  if (!brands.length) return { skipped: 'all checked today', done: Object.keys(st.acts).length };
  const cards = await cardOn(env);
  const team = d.teamOf ? await d.teamOf(env, brands.map(a => a.act_id)).catch(() => ({})) : {};
  const out = { date: today, posted: [], quiet: [], waiting: [], skipped: [], failed: [] };
  for (const a of brands) {
    /* No internal channel, or one that is the client's (2026-10-19): nothing posts. */
    if (!a.slack_channel || a.slack_channel === a.brief_channel) { st.acts[a.act_id] = 'no internal channel'; out.skipped.push(a.name); continue; }
    const cardCan = cards;
    if (cardCan && hour < from + WAIT_FOR_CARD && !(await todaysCard(env, a.slack_channel, today).catch(() => null))) { out.waiting.push(a.name); continue; }
    /* BEFORE the brand, never mid-brand (the subrequest budget rule). */
    if (!d.canAfford(COST_MINOFF_BRAND)) { out.deferred = 'budget'; break; }
    try {
      const r = await d.dueOff(env, a.act_id);
      if (r.error) throw new Error(r.error);
      const items = (r.due || []).slice(0, MAX_ITEMS).map(x => ({ id: String(x.id), name: x.name, min: x.min, day: x.day, why: x.why }));
      if (!items.length) { st.acts[a.act_id] = 'nothing due'; out.quiet.push(a.name); continue; }
      const buyer = team[a.act_id]?.buyer;
      const tag = buyer && d.tagOf ? await d.tagOf(env, buyer).catch(() => null) : null;
      const msg = { act: a.act_id, date: today, brand: a.name, channel: a.slack_channel, tag: tag || null, items };
      const m = minOffMessage(msg);
      const p = await d.teamPost(env, a.slack_channel, m.text, m.blocks, {});
      msg.ts = p?.ts || null;
      await putSetting(env, msgKey(a.act_id, today), JSON.stringify(msg));
      st.acts[a.act_id] = `posted ${items.length}`;
      out.posted.push(`${a.name} (${items.length})`);
    } catch (e) {
      st.tries[a.act_id] = (st.tries[a.act_id] || 0) + 1;
      if (st.tries[a.act_id] >= 2) st.acts[a.act_id] = `failed: ${e.message}`;
      out.failed.push(`${a.name} (${e.message})`);
    }
  }
  await putSetting(env, 'minOffDone', JSON.stringify(st));
  return out;
}

/** Take it off / Take all N off: acknowledged now, written after. Each set goes through locusWrite (d.write) as the
 *  tapper; nothing re-judged, nothing but the minimum changed. */
export async function handleMinOffButton(env, ctx, payload, d, { ACK, xfetch }) {
  const tap = (payload.actions || []).find(a => /^minoff_/.test(a.action_id || ''));
  const v = tap ? safe(tap.value, {}) || {} : {};
  if (!v.a || !v.d) return ACK();
  const say = body => payload.response_url ? xfetch(payload.response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {}) : null;
  ctx.waitUntil((async () => {
    const st = safe(await getSetting(env, msgKey(v.a, v.d)), null);
    if (!st) return say({ response_type: 'ephemeral', replace_original: false, text: 'That list is out of date. Tomorrow brings a fresh one.' });
    const who = (d.slackName ? await d.slackName(env, payload.user?.id).catch(() => null) : null) || payload.user?.name || 'someone';
    const targets = tap.action_id === 'minoff_all' ? st.items.filter(i => !i.done) : st.items.filter(i => i.id === String(v.s || '') && !i.done);
    if (!targets.length) return say({ response_type: 'ephemeral', replace_original: false, text: 'Already done.' });
    for (const it of targets) {
      const r = await d.write(env, { act: st.act, kind: 'min_spend', object: it.id, level: 'adset', min: 0,
        reason: `Test minimum due off (day ${it.day || '?'}, ${it.why}); taken off from the Slack button` }, { who }).catch(e => ({ error: e.message }));
      if (r && r.ok) { it.done = who; it.at = new Date().toISOString(); if (r.write) it.write = r.write; delete it.err; }
      else if (/Nothing would change/i.test(r?.error || '')) { it.done = who; it.already = true; delete it.err; }
      else it.err = r?.error || 'no answer';
    }
    await putSetting(env, msgKey(st.act, st.date), JSON.stringify(st));
    const m = minOffMessage(st);
    await say({ replace_original: true, text: m.text, blocks: m.blocks });
  })());
  return ACK();
}
