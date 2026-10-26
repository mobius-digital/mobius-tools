/* THE DAILY CHECK-IN (2026-10-26, Cole: "I feel out of the loop... I never know what the ads look like or what the angles are").
 * Plan page: https://claude.ai/artifact/NnZHXMrMCzJxZbDC9mkzMG
 *
 * #daily-checkin (settings.checkinChannel) gets ONE Locus post a weekday at the morning hour. Its buttons open a short
 * Slack form for the person's role (settings.checkinPeople = {slack id: {name, roles: strategist|buyer|designer|editor}}):
 *   Post my plan     what's today (chips) + a rich text box with their brands as headings + walkthrough + Need from Cole
 *   Post what I did  their morning lines as tick boxes + what didn't get done + seen in the data (buyer) + tomorrow
 *   Post my week     (Mondays) one rich text box; each brand's part is ALSO posted in that brand's internal channel
 *   I'm out today    one tap
 * Every answer is posted in the day post's THREAD under the person's name, their own formatting kept (the rich_text
 * block goes through as typed). The day post itself is the board: one line per person (plan / wrap-up / out), the
 * red "Need from Cole" lines and the batches sent for review, redrawn with chat.update after every answer.
 * Four hours past the morning hour, anyone with no plan and not out gets one DM with the button.
 *
 * FINISHED ADS (reviewPost): a person moving a Production card to Review posts the card to its brand's INTERNAL
 * channel: who sent it, the angle and the test from the brief, every ad's newest version as a picture (public signed
 * JPEG at /rv/<file>.<sig>.jpg), Approve all / Ask for changes / Open in Locus. Approve all = prodwork decideMany;
 * Ask for changes = a form (pick the ad, the note) = prodwork decide. No call in 24 hours = approved
 * ("no notes from Cole in 24 hours"), by the hourly tick.
 *
 * State lives in settings: `checkin:<date>` = the day {channel, ts, people: {U: {plan, wrap, week, out, items, need}},
 * sent}; `checkinNudged:<date>`; `rvPost:<card>` = {channel, ts, at, act, done}; `rvOpen` = [card ids]. */
import { slackIdOf, morningHour } from './morningcard.js';
import { adsOf, decide, decideMany, htmlToText, isCarousel } from './prodwork.js';
import { teamOf } from './calendar.js';
import { ROSTER } from './actions.js';

const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const ORIGIN = 'https://mobius-account-health.mobius-digital.workers.dev';
export const DEFAULT_CHANNEL = 'C0CC92YD8CU';
export const DEFAULT_PEOPLE = {
  U09PZ3ZV5HD: { name: 'Noma', roles: ['strategist'] },
  U06K732S4BD: { name: 'Ahsan', roles: ['strategist', 'buyer'] },
  U08534TEBCZ: { name: 'William', roles: ['designer'] },
  U07N0RRSP4J: { name: 'Ravo', roles: ['editor'] },
};
const DAY_TYPES = ['Briefs', 'Research', 'Making', 'Revisions', 'Launches', 'Meetings'];
const NUDGE_AFTER = 4;           // hours past the morning hour
const AUTO_APPROVE_HOURS = 24;
const PAUSED = /galway|instyler|gum of gods|judyp|le pickle|popby|golf sock|harborline/i;

const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const clean = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pt = t => ({ type: 'plain_text', text: String(t).slice(0, 150), emoji: true });
const md = t => ({ type: 'mrkdwn', text: String(t).slice(0, 2990) });
const tz = 'America/Chicago';
const clock = (iso = new Date().toISOString()) => new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
const dayName = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
const weekday = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();   // 0 Sun .. 6 Sat

/* ---------- settings ---------- */
async function channelOf(env, d) { return (await d.getSetting(env, 'checkinChannel')) || DEFAULT_CHANNEL; }
async function peopleOf(env, d) {
  const set = safe(await d.getSetting(env, 'checkinPeople'), null);
  return set && typeof set === 'object' && Object.keys(set).length ? set : DEFAULT_PEOPLE;
}
async function dayOf(env, d, date) { return safe(await d.getSetting(env, `checkin:${date}`), null); }
async function saveDay(env, d, date, day) { await d.putSetting(env, `checkin:${date}`, JSON.stringify(day)); }
const personOf = (people, uid, uname) => people[uid] || { name: clean(uname, 30) || 'Someone', roles: [] };
const has = (p, r) => (p.roles || []).includes(r);

/* The brands a person works on, from the season answers (strategist / buyer) the morning card already reads. */
async function brandsFor(env, d, p) {
  const brands = (await d.listBrands(env)).filter(b => !PAUSED.test(b.name || '') && !/^demo_/.test(b.act_id));
  if (!has(p, 'strategist') && !has(p, 'buyer')) return [];
  const team = await teamOf(env, brands.map(b => b.act_id)).catch(() => ({}));
  const me = String(p.name || '').toLowerCase();
  return brands.filter(b => { const t = team[b.act_id] || {}; return (has(p, 'strategist') && String(t.strat || '').toLowerCase().startsWith(me)) || (has(p, 'buyer') && String(t.buyer || '').toLowerCase().startsWith(me)); })
    .map(b => shortName(b.name));
}
export const shortName = n => String(n || '').replace(/\s+(golf|sports|co\.?)$/i, '').trim();

/* ---------- rich text ---------- */
const bold = t => ({ type: 'text', text: t, style: { bold: true } });
function headings(names) {
  if (!names.length) return undefined;
  return { type: 'rich_text', elements: names.map((n, i) => ({ type: 'rich_text_section', elements: [bold(n), { type: 'text', text: i < names.length - 1 ? '\n\n' : '\n' }] })) };
}
const inlineText = els => (els || []).map(e => e.type === 'text' ? e.text : e.type === 'link' ? (e.text || e.url) : e.type === 'user' ? '@someone' : e.type === 'emoji' ? '' : e.type === 'channel' ? '#channel' : '').join('');
const isHeading = els => { const t = (els || []).filter(e => e.type === 'text' && e.text.trim()); return t.length >= 1 && t.every(e => e.style?.bold); };
/** Every line a person wrote, each with the brand heading above it ("Dartee: brief batch 15"). */
export function linesOf(rt) {
  const out = [];
  let brand = '';
  const sect = els => {
    let line = [];
    const flush = () => { if (!line.length) return; const txt = clean(inlineText(line), 300); if (txt) { if (isHeading(line)) brand = txt.replace(/:$/, ''); else out.push(brand ? `${brand}: ${txt}` : txt); } line = []; };
    for (const e of els || []) {
      if (e.type === 'text' && e.text.includes('\n')) {
        const parts = e.text.split('\n');
        parts.forEach((p, i) => { if (p) line.push({ ...e, text: p }); if (i < parts.length - 1) flush(); });
      } else line.push(e);
    }
    flush();
  };
  for (const el of rt?.elements || []) {
    if (el.type === 'rich_text_section' || el.type === 'rich_text_quote' || el.type === 'rich_text_preformatted') sect(el.elements);
    else if (el.type === 'rich_text_list') for (const li of el.elements || []) { const txt = clean(inlineText(li.elements), 300); if (txt) out.push(brand ? `${brand}: ${txt}` : txt); }
  }
  return out;
}
/** Split a week's rich text into one rich_text per brand heading. Returns [{brand, rt}]. */
export function splitByBrand(rt, brandNames) {
  const parts = [];
  let cur = null;
  const match = t => { const w = clean(t, 60).replace(/:$/, '').toLowerCase(); return brandNames.find(n => { const b = n.toLowerCase(); return w === b || b.startsWith(w + ' ') || w.startsWith(b.split(' ')[0]) && w.length >= 3; }) || null; };
  for (const el of rt?.elements || []) {
    if (el.type === 'rich_text_section' && el.elements?.length && el.elements[0].type === 'text' && el.elements[0].style?.bold) {
      const first = el.elements[0].text.split('\n')[0];
      const b = match(first);
      if (b) {
        cur = { brand: b, rt: { type: 'rich_text', elements: [] } };
        parts.push(cur);
        const rest = el.elements.slice(1);
        const firstRest = el.elements[0].text.split('\n').slice(1).join('\n');
        const els = [...(firstRest.trim() ? [{ ...el.elements[0], text: firstRest, style: undefined }] : []), ...rest].filter(e => !(e.type === 'text' && !e.text.trim()));
        if (els.length) cur.rt.elements.push({ type: 'rich_text_section', elements: els });
        continue;
      }
    }
    if (cur) cur.rt.elements.push(el);
  }
  return parts.filter(p => p.rt.elements.length);
}
const rtEmpty = rt => !linesOf(rt).length;
/* A plan line without its "Why: ...", cut at a word: the tick box label and the wrap-up line. */
export const shortLine = (t, n = 74) => { const x = clean(String(t).split(/\s+why:/i)[0], 400).replace(/[.,;:]$/, ''); if (x.length <= n) return x; const c = x.slice(0, n - 1); return c.slice(0, Math.max(c.lastIndexOf(' '), 30)).replace(/[ ,;:.]+$/, '') + '…'; };

/* ---------- the day post (the board) ---------- */
function boardBlocks(date, day, people) {
  const rows = Object.entries(people).map(([uid, p]) => {
    const s = day.people?.[uid] || {};
    if (s.out) return `*${p.name}*  _out today${s.back ? `, back ${s.back}` : ''}_`;
    const plan = s.plan ? `plan ✓ ${clock(s.plan.at)}${s.plan.types?.length ? ` (${s.plan.types.join(', ')})` : ''}` : 'plan: not yet';
    const wrap = s.wrap ? `wrap-up ✓ ${clock(s.wrap.at)}` : 'wrap-up: not yet';
    const week = weekday(date) === 1 ? (s.week ? ` · week ✓` : ' · week: not yet') : '';
    return `*${p.name}*  ${plan} · ${wrap}${week}`;
  });
  const need = Object.entries(people).flatMap(([uid, p]) => (day.people?.[uid]?.need || []).map(n => `• ${p.name}: ${esc(n)}`));
  const sent = (day.sent || []).map(s => `• ${esc(s.label)} (${esc(s.by)})`);
  const blocks = [
    { type: 'section', text: md(`*☀️ ${dayName(date)} · Daily check-in*\nTap a button below. Everything you post goes in this thread.`) },
    { type: 'section', text: md(rows.join('\n') || '_No one on the check-in list yet._') },
  ];
  if (need.length) blocks.push({ type: 'section', text: md(`🔴 *Need from Cole*\n${need.join('\n')}`) });
  if (sent.length) blocks.push({ type: 'section', text: md(`🖼️ *Sent to Cole for review*\n${sent.join('\n')}`) });
  const btns = [
    { type: 'button', action_id: 'ci_plan', style: 'primary', text: pt('Post my plan'), value: date },
    { type: 'button', action_id: 'ci_wrap', text: pt('Post what I did'), value: date },
    ...(weekday(date) === 1 ? [{ type: 'button', action_id: 'ci_week', text: pt('Post my week'), value: date }] : []),
    { type: 'button', action_id: 'ci_out', text: pt("I'm out today"), value: date },
  ];
  blocks.push({ type: 'actions', block_id: 'ci_btns', elements: btns });
  return blocks;
}
async function redraw(env, d, date, day) {
  if (!day?.ts) return;
  const people = await peopleOf(env, d);
  await d.slackApi(env, 'chat.update', { channel: day.channel, ts: day.ts, text: `${dayName(date)} check-in`, blocks: boardBlocks(date, day, people) }).catch(() => {});
}
/** Today's day post, made if missing (only on a weekday from the morning hour, unless forced). */
export async function ensureDay(env, d, { force = false, date = d.centralDate() } = {}) {
  let day = await dayOf(env, d, date);
  if (day?.ts) return day;
  if (!force && (weekday(date) === 0 || weekday(date) === 6)) return null;
  const channel = await channelOf(env, d);
  day = { channel, people: {}, sent: [], ...(day || {}) };
  const people = await peopleOf(env, d);
  const r = await d.slackApi(env, 'chat.postMessage', { channel, text: `${dayName(date)} check-in`, blocks: boardBlocks(date, day, people), unfurl_links: false });
  if (!r?.ok) throw new Error(`could not post the check-in: ${r?.error || 'no answer'}`);
  day.ts = r.ts; day.channel = r.channel || channel;
  await saveDay(env, d, date, day);
  return day;
}

/* ---------- the forms ---------- */
const input = (block_id, label, element, opts = {}) => ({ type: 'input', block_id, optional: opts.optional !== false, label: pt(label), element, ...(opts.hint ? { hint: pt(opts.hint) } : {}) });
const rich = (action_id, initial, placeholder) => ({ type: 'rich_text_input', action_id, ...(initial ? { initial_value: initial } : {}), ...(placeholder ? { placeholder: pt(placeholder) } : {}) });
const plain = (action_id, placeholder, multi = false) => ({ type: 'plain_text_input', action_id, multiline: multi, ...(placeholder ? { placeholder: pt(placeholder) } : {}) });
const checks = (action_id, opts) => ({ type: 'checkboxes', action_id, options: opts.map(o => ({ text: pt(o.text), value: o.value })) });

function planHint(p) {
  if (has(p, 'strategist') && has(p, 'buyer')) return 'Under each brand: what you are working on and why. Briefs, research, launches, cuts. Bold, bullets, links and @mentions all work.';
  if (has(p, 'strategist')) return 'Under each brand: the brief or research you are on and why. Bold, bullets, links and @mentions all work.';
  if (has(p, 'buyer')) return 'Under each brand: what you are launching, cutting or scaling, and why.';
  if (has(p, 'designer') || has(p, 'editor')) return 'Per brand: the batch and how many ads you are making today. Write each brand in bold on its own line.';
  return 'What you are working on today, per brand, and why.';
}
function weekHint(p) {
  if (has(p, 'strategist')) return 'Under each brand, one block per batch: Batch · title · how many ads · due. Then Angle / What we\'re testing / Why. Each brand\'s part is copied to its internal channel.';
  if (has(p, 'buyer')) return 'Under each brand: the spend plan, what you will cut or launch, what new ads you need and by when.';
  return 'Per brand: the batches in your queue and when each one is done.';
}
export async function planModal(env, d, uid, uname, date) {
  const people = await peopleOf(env, d);
  const p = personOf(people, uid, uname);
  const names = await brandsFor(env, d, p).catch(() => []);
  const blocks = [
    input('type', "What's today?", checks('v', DAY_TYPES.map(t => ({ text: t, value: t })))),
    input('plan', 'My plan for today', rich('v', headings(names), 'Dartee: brief batch 15, Game of Belts. Why: ...'), { optional: false, hint: planHint(p) }),
    ...(has(p, 'strategist') ? [input('walk', 'Walkthrough with the creative team today?', plain('v', 'Yes, 10am with Ravo and William (Dartee 15)'))] : []),
    input('need', 'Need from Cole', plain('v', 'Only if something is blocked on Cole', true)),
  ];
  return { type: 'modal', callback_id: 'ci_plan_submit', private_metadata: JSON.stringify({ date }), title: pt('Post my plan'), submit: pt('Post'), close: pt('Cancel'), blocks };
}
export async function wrapModal(env, d, uid, uname, date) {
  const people = await peopleOf(env, d);
  const p = personOf(people, uid, uname);
  const day = (await dayOf(env, d, date)) || {};
  const items = (day.people?.[uid]?.items || []).slice(0, 10);
  const blocks = [
    ...(items.length ? [input('done', 'Tick what got done', checks('v', items.map((t, i) => ({ text: shortLine(t), value: String(i) }))), { hint: 'Anything left unticked shows as not done.' })]
      : [{ type: 'context', elements: [md('_No plan posted today, so there is nothing to tick. Write what you did below._')] }]),
    input('notdone', items.length ? "What didn't get done, and why" : 'What I did today', rich('v', undefined, items.length ? 'Grunk 9: waiting on the gift box photos from the client' : 'Dartee 15 brief done, sent to the team'), { optional: !!items.length }),
    input('extra', 'Anything else I finished', rich('v')),
    ...(has(p, 'buyer') ? [input('seen', 'One thing I saw in the data', plain('v', 'Dartee founder videos are at 2.1% CTR, double the statics. @Noma more of these?', true), { hint: 'Tag the strategist on that brand.' })] : []),
    input('tomorrow', 'First thing tomorrow', plain('v')),
    input('need', 'Need from Cole', plain('v', 'Only if something is blocked on Cole', true)),
  ];
  return { type: 'modal', callback_id: 'ci_wrap_submit', private_metadata: JSON.stringify({ date }), title: pt('Post what I did'), submit: pt('Post'), close: pt('Cancel'), blocks };
}
export async function weekModal(env, d, uid, uname, date) {
  const people = await peopleOf(env, d);
  const p = personOf(people, uid, uname);
  const names = await brandsFor(env, d, p).catch(() => []);
  const blocks = [
    input('week', 'My plan for the week', rich('v', headings(names), 'Batch 15 · Game of Belts giveaway · 8 ads · due Wed'), { optional: false, hint: weekHint(p) }),
    ...(has(p, 'strategist') ? [input('walk', 'Walkthroughs this week', plain('v', 'Tue 10am with Ravo and William (Dartee 15, Lucky 14)'))] : []),
    input('need', 'Need from Cole', plain('v', 'Only if something is blocked on Cole', true)),
  ];
  return { type: 'modal', callback_id: 'ci_week_submit', private_metadata: JSON.stringify({ date }), title: pt('Post my week'), submit: pt('Post'), close: pt('Cancel'), blocks };
}

/* ---------- posting an answer ---------- */
const val = (view, b) => view?.state?.values?.[b]?.v;
const head = (who, what, extra) => ({ type: 'section', text: md(`*${who}'s ${what}*${extra ? ` · ${extra}` : ''}`) });
const ctxLine = t => ({ type: 'context', elements: [md(t)] });

async function postInThread(env, d, day, text, blocks) {
  const r = await d.slackApi(env, 'chat.postMessage', { channel: day.channel, thread_ts: day.ts, text, blocks, unfurl_links: false });
  if (!r?.ok) throw new Error(r?.error || 'Slack refused the post');
  return r;
}

export async function submitCheckin(env, d, p) {
  const cb = p.view?.callback_id || '';
  const meta = safe(p.view?.private_metadata, {}) || {};
  const uid = p.user?.id;
  const date = meta.date || d.centralDate();
  const people = await peopleOf(env, d);
  const me = personOf(people, uid, p.user?.name);
  const day = await ensureDay(env, d, { force: true, date });
  day.people = day.people || {};
  const s = day.people[uid] = day.people[uid] || {};
  const now = new Date().toISOString();
  const need = clean(val(p.view, 'need')?.value, 500);

  if (cb === 'ci_plan_submit') {
    const rt = val(p.view, 'plan')?.rich_text_value;
    const types = (val(p.view, 'type')?.selected_options || []).map(o => o.value);
    const walk = clean(val(p.view, 'walk')?.value, 300);
    const blocks = [head(me.name, 'plan', types.join(', ')), rt, ...(walk ? [ctxLine(`📅 *Walkthrough:* ${esc(walk)}`)] : []), ...(need ? [ctxLine(`🔴 *Need from Cole:* ${esc(need)}`)] : [])].filter(Boolean);
    await postInThread(env, d, day, `${me.name}'s plan`, blocks);
    s.plan = { at: now, types }; s.items = linesOf(rt); s.out = false;
    if (walk) s.items.push(`Walkthrough: ${walk}`);
  } else if (cb === 'ci_wrap_submit') {
    const picked = new Set((val(p.view, 'done')?.selected_options || []).map(o => +o.value));
    const items = s.items || [];
    const notdone = val(p.view, 'notdone')?.rich_text_value, extra = val(p.view, 'extra')?.rich_text_value;
    const seen = clean(val(p.view, 'seen')?.value, 500), tomorrow = clean(val(p.view, 'tomorrow')?.value, 300);
    const ticks = items.map((t, i) => `${picked.has(i) ? '✅' : '❌'} ${esc(shortLine(t, 140))}`).join('\n');
    const sentMine = (day.sent || []).filter(x => x.uid === uid).map(x => x.label);
    const blocks = [head(me.name, 'wrap-up', items.length ? `${picked.size} of ${items.length} done` : '')];
    if (ticks) blocks.push({ type: 'section', text: md(ticks) });
    if (notdone && !rtEmpty(notdone)) blocks.push(ctxLine(items.length ? "*Didn't get done:*" : '*What I did:*'), notdone);
    if (extra && !rtEmpty(extra)) blocks.push(ctxLine('*Also finished:*'), extra);
    if (sentMine.length) blocks.push(ctxLine(`🖼️ *Sent to Cole for review:* ${sentMine.map(esc).join(', ')}`));
    if (seen) blocks.push({ type: 'section', text: md(`👀 *Seen in the data:* ${esc(seen).replace(/@(\w+)/g, (m, n) => m)}`) });
    if (tomorrow) blocks.push(ctxLine(`*Tomorrow:* ${esc(tomorrow)}`));
    if (need) blocks.push(ctxLine(`🔴 *Need from Cole:* ${esc(need)}`));
    await postInThread(env, d, day, `${me.name}'s wrap-up`, blocks);
    s.wrap = { at: now, done: picked.size, of: items.length };
  } else if (cb === 'ci_week_submit') {
    const rt = val(p.view, 'week')?.rich_text_value;
    const walk = clean(val(p.view, 'walk')?.value, 300);
    const blocks = [head(me.name, 'week', `${dayName(date)} to Fri`), rt, ...(walk ? [ctxLine(`📅 *Walkthroughs:* ${esc(walk)}`)] : []), ...(need ? [ctxLine(`🔴 *Need from Cole:* ${esc(need)}`)] : [])].filter(Boolean);
    const brands = (await d.listBrands(env)).filter(b => !PAUSED.test(b.name || ''));
    const parts = splitByBrand(rt, brands.map(b => shortName(b.name)));
    const copied = [];
    for (const part of parts) {
      const b = brands.find(x => shortName(x.name) === part.brand);
      if (!b?.slack_channel || b.slack_channel === b.brief_channel) continue;
      const r = await d.slackApi(env, 'chat.postMessage', { channel: b.slack_channel, text: `${me.name}'s week for ${part.brand}`, unfurl_links: false,
        blocks: [{ type: 'section', text: md(`*${me.name}'s week · ${part.brand}* (from #daily-checkin)`) }, part.rt] }).catch(() => null);
      if (r?.ok) copied.push(part.brand);
    }
    if (copied.length) blocks.push(ctxLine(`Copied to ${copied.map(n => `#${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-internal`).join(', ')}`));
    await postInThread(env, d, day, `${me.name}'s week`, blocks);
    s.week = { at: now, brands: copied };
  } else return;
  s.need = need ? [...(s.need || []).filter(n => n !== need), need].slice(-3) : (s.need || []);
  await saveDay(env, d, date, day);
  await redraw(env, d, date, day);
}

/** The buttons on the day post. Modals open inside Slack's three seconds; "out" is posted after the ack. */
export async function checkinAction(env, ctx, d, p) {
  const a = p.actions?.[0] || {};
  const date = a.value || d.centralDate();
  const uid = p.user?.id, uname = p.user?.name;
  if (a.action_id === 'ci_out') {
    ctx.waitUntil((async () => {
      const people = await peopleOf(env, d);
      const me = personOf(people, uid, uname);
      const day = await ensureDay(env, d, { force: true, date });
      day.people = day.people || {};
      const s = day.people[uid] = day.people[uid] || {};
      if (s.out) return;
      s.out = true;
      await postInThread(env, d, day, `${me.name} is out today`, [ctxLine(`🌴 *${me.name}* is out today.`)]).catch(() => {});
      await saveDay(env, d, date, day);
      await redraw(env, d, date, day);
    })());
    return;
  }
  const make = a.action_id === 'ci_plan' ? planModal : a.action_id === 'ci_wrap' ? wrapModal : a.action_id === 'ci_week' ? weekModal : null;
  if (!make) return;
  const view = await make(env, d, uid, uname, date);
  const r = await d.slackApi(env, 'views.open', { trigger_id: p.trigger_id, view });
  if (!r?.ok) console.log('checkin views.open: ' + JSON.stringify(r?.response_metadata || r?.error));
}

/* ---------- finished ads to Cole ---------- */
async function rvSig(env, fid) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET || env.ADMIN_TOKEN || 'locus'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`rv.${fid}`)))].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
}
const rvUrl = async (env, fid) => `${ORIGIN}/rv/${fid}.${await rvSig(env, fid)}.jpg?v=2`;   // v: Slack caches a failed picture by URL
/** GET /rv/<file>.<sig>.jpg: a Production picture as a 1200-wide JPEG for Slack's image block. Public, signed, no expiry
 *  (a Slack message lives for ever). Made once by the Images binding, kept next to the original in R2. */
export async function serveReviewPic(env, path) {
  const m = path.match(/^\/rv\/([\w-]+)\.([0-9a-f]{24})\.jpg$/);
  if (!m || m[2] !== await rvSig(env, m[1])) return new Response('not found', { status: 404 });
  const f = await env.DB.prepare(`SELECT r2_key, mime, deleted_at FROM p_work_file WHERE id = ?1`).bind(m[1]).first();
  if (!f || f.deleted_at || !env.MEDIA) return new Response('gone', { status: 404 });
  const key = `${f.r2_key}.w1200.jpg`;
  const hdr = { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' };
  const have = await env.MEDIA.get(key).catch(() => null);
  if (have) return new Response(have.body, { headers: hdr });
  const orig = await env.MEDIA.get(f.r2_key);
  if (!orig) return new Response('gone', { status: 404 });
  if (!env.IMAGES) return new Response(orig.body, { headers: { ...hdr, 'content-type': f.mime || 'image/png' } });
  try {
    const r = (await env.IMAGES.input(orig.body).transform({ width: 1200, fit: 'scale-down' }).output({ format: 'image/jpeg', quality: 86 })).response();
    const buf = await r.arrayBuffer();
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType: 'image/jpeg' } }).catch(() => {});
    return new Response(buf, { headers: hdr });
  } catch { const o = await env.MEDIA.get(f.r2_key); return new Response(o.body, { headers: { ...hdr, 'content-type': f.mime || 'image/png' } }); }
}

const nameOfEmail = e => { const r = ROSTER.find(x => x.email && x.email.toLowerCase() === String(e || '').toLowerCase()); return r ? r.name : clean(String(e || '').split('@')[0], 30) || 'Someone'; };
const fieldOf = (text, labels) => { for (const l of labels) { const m = text.match(new RegExp(`(?:^|\\n)\\s*${l}\\s*:?\\s*\\n?\\s*([^\\n]{3,})`, 'i')); if (m) return clean(m[1], 160); } return ''; };
async function cardState(env, id) {
  const r = await env.DB.prepare(`SELECT b.id, b.act_id, b.num, b.title, b.brief_json, b.brief_text, b.board_stage, a.name AS brand, a.slack_channel, a.brief_channel FROM p_br_batch b LEFT JOIN brand_accounts a ON a.act_id = b.act_id WHERE b.id = ?1`).bind(String(id)).first();
  if (!r) return null;
  const files = (await env.DB.prepare(`SELECT id, kind, version, ad, name, mime, created_at FROM p_work_file WHERE batch_id = ?1 AND deleted_at IS NULL`).bind(r.id).all()).results || [];
  const cs = (await env.DB.prepare(`SELECT * FROM p_work_comment WHERE batch_id = ?1 ORDER BY created_at, rowid`).bind(r.id).all()).results || [];
  const ads = adsOf(files.map(f => ({ ...f, ad: f.ad || '' })), cs.map(c => ({ ...c, file_id: c.file_id })), { carousel: isCarousel(r.brief_json) });
  return { r, files, ads };
}
/* The words of a review: who sent which batch, the angle and the test from the brief. */
function reviewHead(st, by) {
  const { r, ads } = st;
  const brief = safe(r.brief_json, {}) || {};
  const text = brief.html ? htmlToText(brief.html) : String(r.brief_text || '');
  const angle = fieldOf(text, ['Angle']).replace(/[.]$/, ''), testing = fieldOf(text, ["What we're testing", 'What we’re testing', 'Testing']).replace(/[.]$/, '');
  const label = `${shortName(r.brand)} ${r.num ? `batch ${r.num}` : ''}${r.title ? ` · ${clean(r.title, 60)}` : ''}`.trim();
  const line = [angle && `*Angle:* ${angle}`, testing && `*Testing:* ${testing}`, `${ads.length} ad${ads.length === 1 ? '' : 's'}`].filter(Boolean).join('  ·  ');
  return { label, head: `*${by} sent ${label} for your look*
${line}` };
}
/* Every picture of the batch (newest version of each ad, every card of a carousel) and the videos, in ad order. */
function reviewMedia(st) {
  const pics = [], videos = [];
  for (const a of st.ads) {
    const fs = a.carousel ? (a.cards || []) : [{ file_id: a.file_id }];
    for (const [i, f] of fs.entries()) {
      const file = st.files.find(x => x.id === (f.id || f.file_id));
      if (!file) continue;
      const title = `${a.ad || 'Ad'}${a.carousel ? ` card ${i + 1}` : ''}${a.version ? ` v${a.version}` : ''}`;
      if (/^video\//.test(file.mime || '')) videos.push(`▶ <${LOCUS}?open=production&card=${st.r.id}|${esc(title)} (video, watch in Locus)>`);
      else if (/^image\//.test(file.mime || '')) pics.push({ id: file.id, title });
    }
  }
  return { pics, videos };
}
/* The small message under the pictures: the buttons, or what was decided. */
function callBlocks(st, label, state) {
  if (state) return [{ type: 'section', text: md(`*${esc(label)}*: ${state}`) }];
  return [{ type: 'section', text: md(`Your call on *${esc(label)}*`) },
    { type: 'actions', block_id: 'rv_btns', elements: [
      { type: 'button', action_id: 'rv_all', style: 'primary', text: pt('Approve all'), value: st.r.id },
      { type: 'button', action_id: 'rv_chg', text: pt('Ask for changes'), value: st.r.id } ] },
    { type: 'actions', elements: [{ type: 'button', action_id: 'noop_open', text: pt('Open in Locus'), url: `${LOCUS}?open=production&card=${st.r.id}` }] },
    ctxLine(`No notes in ${AUTO_APPROVE_HOURS} hours = approved.`)];
}
/* Upload pictures as ONE message so Slack lays them out as a grid, 10 to a message (Slack's limit). */
async function postAlbum(env, d, channel, text, pics) {
  const out = [];
  for (let i = 0; i < pics.length; i += 10) {
    const files = [];
    for (const p of pics.slice(i, i + 10)) {
      const res = await serveReviewPic(env, new URL(await rvUrl(env, p.id)).pathname);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const a = await d.slackApi(env, 'files.getUploadURLExternal', { filename: `${p.title.replace(/[^\w-]+/g, '-')}.jpg`, length: bytes.length });
      if (!a?.ok) continue;
      const up = await (d.xfetch || fetch)(a.upload_url, { method: 'POST', body: bytes });
      if (up.ok) files.push({ id: a.file_id, title: p.title });
    }
    if (!files.length) continue;
    const more = pics.length > 10 ? ` (${i / 10 + 1} of ${Math.ceil(pics.length / 10)})` : '';
    const r = await d.slackApi(env, 'files.completeUploadExternal', { files, channel_id: channel, ...(i === 0 ? { initial_comment: text + more } : { initial_comment: more.trim() }) });
    if (r?.ok) out.push(...files.map(f => f.id));
  }
  return out;
}
/** A card moved to Review by a person: its ads, as a picture grid, in the brand's internal channel, then the buttons. */
export async function reviewPost(env, d, cardId, whoEmail, opts = {}) {
  const st = await cardState(env, cardId);
  if (!st || !st.ads.length) return { skipped: 'no ads uploaded' };
  const { r } = st;
  const channel = opts.channel || (r.slack_channel && r.slack_channel !== r.brief_channel ? r.slack_channel : null);
  if (!channel) return { skipped: 'no internal channel' };
  const by = nameOfEmail(whoEmail);
  const { label, head } = reviewHead(st, by);
  const { pics, videos } = reviewMedia(st);
  const text = `<@U06C37MDWD7> ${head}${videos.length ? '\n' + videos.join('\n') : ''}`;
  const files = pics.length ? await postAlbum(env, d, channel, text, pics) : [];
  if (!files.length) await d.slackApi(env, 'chat.postMessage', { channel, text, unfurl_links: false });
  /* Slack shares an upload a moment after completeUploadExternal answers: wait for the pictures to land so the
     buttons sit UNDER them, not above (seen 2026-10-26). */
  for (let i = 0; files.length && i < 10; i++) {
    const info = await d.slackApi(env, 'files.info', { file: files[files.length - 1] }).catch(() => null);
    const sh = info?.file?.shares || {};
    if ((sh.private || {})[channel] || (sh.public || {})[channel]) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  const res = await d.slackApi(env, 'chat.postMessage', { channel, text: `Your call on ${label}`, blocks: callBlocks(st, label, ''), unfurl_links: false });
  if (!res?.ok) return { error: res?.error || 'Slack refused' };
  if (opts.preview) return { ok: true, preview: true, channel, ts: res.ts, files };
  await d.putSetting(env, `rvPost:${r.id}`, JSON.stringify({ channel: res.channel || channel, ts: res.ts, at: new Date().toISOString(), act: r.act_id, by, label, files }));
  const open = safe(await d.getSetting(env, 'rvOpen'), []);
  await d.putSetting(env, 'rvOpen', JSON.stringify([...new Set([...open, r.id])].slice(-200)));
  /* the line on today's check-in board */
  const date = d.centralDate();
  const day = await dayOf(env, d, date);
  if (day?.ts) {
    const people = await peopleOf(env, d);
    const uid = Object.entries(people).find(([, p]) => p.name.toLowerCase() === by.toLowerCase())?.[0] || '';
    day.sent = [...(day.sent || []), { label, by, uid, card: r.id }].slice(-20);
    await saveDay(env, d, date, day);
    await redraw(env, d, date, day);
  }
  return { ok: true, channel, ts: res.ts, files };
}
async function redrawReview(env, d, cardId, state) {
  const rec = safe(await d.getSetting(env, `rvPost:${cardId}`), null);
  if (!rec?.ts) return;
  const st = await cardState(env, cardId);
  if (!st) return;
  await d.slackApi(env, 'chat.update', { channel: rec.channel, ts: rec.ts, text: state, blocks: callBlocks(st, rec.label || reviewHead(st, rec.by || '').label, state) }).catch(() => {});
  if (state) {
    await d.putSetting(env, `rvPost:${cardId}`, JSON.stringify({ ...rec, done: state }));
    const open = safe(await d.getSetting(env, 'rvOpen'), []);
    await d.putSetting(env, 'rvOpen', JSON.stringify(open.filter(x => x !== cardId)));
  }
}
export async function reviewAction(env, ctx, d, p) {
  const a = p.actions?.[0] || {};
  const id = String(a.value || '');
  const who = p.user?.name || p.user?.username || 'Slack';
  if (a.action_id === 'rv_chg') {
    const st = await cardState(env, id);
    if (!st) return;
    const opts = st.ads.filter(x => true).slice(0, 100).map(x => ({ text: pt(`${x.ad || 'Ad'}${x.version ? ` v${x.version}` : ''} · ${x.status}`), value: x.file_id }));
    const view = { type: 'modal', callback_id: 'rv_chg_submit', private_metadata: JSON.stringify({ id }), title: pt('Ask for changes'), submit: pt('Send to the maker'), close: pt('Cancel'),
      blocks: [input('ad', 'Which ad', { type: 'static_select', action_id: 'v', options: opts, ...(opts[0] ? { initial_option: opts[0] } : {}) }, { optional: false }),
        input('note', 'What to change', plain('v', 'Belt is too small, make it fill the frame', true), { optional: false })] };
    await d.slackApi(env, 'views.open', { trigger_id: p.trigger_id, view });
    return;
  }
  if (a.action_id === 'rv_all') ctx.waitUntil((async () => {
    try { await decideMany(env, d.prod, { id, all: true }, who, null, { later: false }); await redrawReview(env, d, id, `✅ Approved by ${who}, ${clock()}`); }
    catch (e) { await d.slackApi(env, 'chat.postEphemeral', { channel: p.channel?.id, user: p.user?.id, text: `Not approved: ${e.message}` }).catch(() => {}); }
  })());
}
export async function reviewSubmit(env, ctx, d, p) {
  const meta = safe(p.view?.private_metadata, {}) || {};
  const fid = p.view?.state?.values?.ad?.v?.selected_option?.value;
  const note = clean(p.view?.state?.values?.note?.v?.value, 4000);
  const who = p.user?.name || p.user?.username || 'Slack';
  ctx.waitUntil((async () => {
    try {
      await decide(env, d.prod, { id: meta.id, ok: false, file_id: fid, body: note }, who, null, { later: false });
      const rec = safe(await d.getSetting(env, `rvPost:${meta.id}`), null);
      const st = await cardState(env, meta.id);
      const ad = st?.ads.find(x => x.file_id === fid || (x.cards || []).some(c => c.id === fid));
      if (rec?.ts) await d.slackApi(env, 'chat.postMessage', { channel: rec.channel, thread_ts: rec.ts, text: `Changes asked on ${ad?.ad || 'an ad'}: ${note}`,
        blocks: [{ type: 'section', text: md(`✏️ *${esc(who)}* asked for changes on *${esc(ad?.ad || 'an ad')}*: ${esc(note)}\n_Sent back to Making; the maker got the note._`) }] }).catch(() => {});
    } catch (e) { console.log('review change: ' + e.message); }
  })());
}

/* ---------- the hourly tick ---------- */
export async function checkinTick(env, d) {
  if ((await d.getSetting(env, 'checkinPost')) === 'off') return { skipped: 'off' };
  const out = {};
  const date = d.centralDate(), hour = d.centralHour();
  const mh = await morningHour(env).catch(() => 5);
  if (hour >= mh && hour < 20) {
    const day = await ensureDay(env, d, { date }).catch(e => ({ error: e.message }));
    out.day = day?.error || (day?.ts ? 'posted' : 'weekend');
    /* one DM for anyone with no plan four hours in */
    if (day?.ts && hour >= mh + NUDGE_AFTER && !(await d.getSetting(env, `checkinNudged:${date}`))) {
      const people = await peopleOf(env, d);
      const late = Object.entries(people).filter(([uid]) => { const s = day.people?.[uid] || {}; return !s.plan && !s.out; });
      for (const [uid] of late) await d.slackApi(env, 'chat.postMessage', { channel: uid, text: 'No plan from you yet today.',
        blocks: [{ type: 'section', text: md(`No plan from you yet today. <https://slack.com/app_redirect?channel=${day.channel}|Open #daily-checkin>`) },
          { type: 'actions', elements: [{ type: 'button', action_id: 'ci_plan', style: 'primary', text: pt('Post my plan'), value: date }, { type: 'button', action_id: 'ci_out', text: pt("I'm out today"), value: date }] }] }).catch(() => {});
      await d.putSetting(env, `checkinNudged:${date}`, JSON.stringify(late.map(([u]) => u)));
      out.nudged = late.length;
    }
  }
  /* no notes in 24 hours = approved */
  const open = safe(await d.getSetting(env, 'rvOpen'), []);
  let approved = 0;
  for (const id of open.slice(0, 10)) {
    const rec = safe(await d.getSetting(env, `rvPost:${id}`), null);
    if (!rec || rec.done) continue;
    if (Date.now() - Date.parse(rec.at) < AUTO_APPROVE_HOURS * 3600e3) continue;
    const st = await cardState(env, id);
    const waiting = st?.ads.filter(a => a.status === 'review') || [];
    if (!waiting.length) { await redrawReview(env, d, id, '✅ Every ad has its call.'); continue; }
    try { await decideMany(env, d.prod, { id, all: true }, 'no notes from Cole in 24 hours', null, { later: false }); approved++; await redrawReview(env, d, id, `✅ Approved: no notes in ${AUTO_APPROVE_HOURS} hours`); }
    catch (e) { out.approveError = e.message; }
  }
  if (approved) out.autoApproved = approved;
  return out;
}
