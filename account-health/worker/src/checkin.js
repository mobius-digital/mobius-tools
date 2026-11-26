/* THE DAILY CHECK-IN (2026-10-26, Cole: "I feel out of the loop... I never know what the ads look like or what the angles are").
 * Plan page: https://claude.ai/artifact/NnZHXMrMCzJxZbDC9mkzMG
 *
 * #daily-checkin (settings.checkinChannel) gets ONE Locus post a weekday at the morning hour. Its buttons open a short
 * Slack form for the person's role (settings.checkinPeople = {slack id: {name, roles: strategist|buyer|designer|editor}}):
 *   Post my plan     what's today (chips) + a rich text box with their brands as headings + walkthrough + Blocked on (Cole, the client, a creator, the team: each one becomes a Locus task)
 *   Post what I did  their morning lines as tick boxes + what didn't get done + seen in the data (buyer) + tomorrow
 *   Post my week     (Mondays) one rich text box; each brand's part is ALSO posted in that brand's internal channel
 *   I'm out today    one tap
 * Every answer is posted in the day post's THREAD under the person's name, their own formatting kept (the rich_text
 * block goes through as typed). The day post itself is the board: one line per person (plan / wrap-up / out), the
 * red "Blocked" lines, who missed the last check-in, and the batches sent for review, redrawn with chat.update after every answer.
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
import { AUTO_APPROVE_KEY } from './clientchan.js';
import { teamOf } from './calendar.js';
import { ROSTER, addAction } from './actions.js';
import { laneBlocks, laneWho } from './lane.js';
import { houseMessage } from './house.js';
import { jobOn } from './jobflags.js';

const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
const ORIGIN = 'https://mobius-account-health.mobius-digital.workers.dev';
export const DEFAULT_CHANNEL = 'C0CC92YD8CU';
export const DEFAULT_PEOPLE = {
  U09PZ3ZV5HD: { name: 'Noma', roles: ['strategist'] },
  U06K732S4BD: { name: 'Ahsan', roles: ['strategist', 'buyer'] },
  U08534TEBCZ: { name: 'William', roles: ['designer'] },
  U07N0RRSP4J: { name: 'Ravo', roles: ['editor'] },
};
/* 2026-11-16 (Cole: "is there anything for Google?... Meta, Google, Amazon, TikTok"): the Google and Amazon people post
   ONLY the week (no daily plan, never counted as missing a check-in). `brands` = the act ids they run. `dm`: not in
   #daily-checkin (Hamza is a Slack Connect guest), so the Monday button reaches them by DM. Added on top of
   settings.checkinPeople, so an older saved list still gets them. */
export const WEEK_ONLY_PEOPLE = {
  U09A6NTSUQJ: { name: 'Radhesh', roles: ['google'], weekOnly: true, channel: 'google', brands: ['brand_lucky_golf', 'brand_grunk_dolfer', 'brand_bonk_golf', 'brand_dartee_golf'] },
  U0AKT1XHNNQ: { name: 'Hamza', roles: ['amazon'], weekOnly: true, channel: 'amazon', dm: true, brands: ['brand_bonk_golf'] },
};
const CHANNELS = [['meta', 'Meta'], ['google', 'Google'], ['amazon', 'Amazon'], ['tiktok', 'TikTok'], ['email', 'Email'], ['other', 'Other']];
const chLabel = v => (CHANNELS.find(c => c[0] === v) || [null, 'Meta'])[1];
const DAY_TYPES = ['Briefs', 'Research', 'Making', 'Revisions', 'Launches', 'Meetings'];
const NUDGE_AFTER = 4;           // hours past the morning hour
const AUTO_APPROVE_HOURS = 24;
/* settings.checkinAutoApprove: absent = a review card nobody answered in 24 hours is approved by the timer (as it always
   was); '0' = the timer never approves, the card stays waiting for a person. The note a timer approval leaves never names
   a person: nobody looked at it. */
export { AUTO_APPROVE_KEY };
export const AUTO_APPROVE_WHO = 'Locus (automatic)';
export const AUTO_APPROVE_NOTE = `Approved automatically after ${AUTO_APPROVE_HOURS} hours with no answer. Nobody looked at it.`;
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
  const base = set && typeof set === 'object' && Object.keys(set).length ? set : DEFAULT_PEOPLE;
  return { ...WEEK_ONLY_PEOPLE, ...base };
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
/* Every active brand, the person's own first (Ahsan, 2026-10-27: "do I log each brand separately?"). A new brand in Locus
   shows up here by itself. Each gets its own box in the plan and week forms. */
async function brandList(env, d, p) {
  const all = (await d.listBrands(env)).filter(b => !PAUSED.test(b.name || '') && !/^demo_/.test(b.act_id))
    .map(b => ({ a: b.act_id, n: shortName(b.name) })).sort((x, y) => x.n.localeCompare(y.n));
  const mine = new Set(await brandsFor(env, d, p).catch(() => []));
  return [...all.filter(b => mine.has(b.n)), ...all.filter(b => !mine.has(b.n))].slice(0, 20);
}

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
export function boardBlocks(date, day, people) {
  const monday = weekday(date) === 1;
  const rows = Object.entries(people).filter(([, p]) => !p.weekOnly || monday).map(([uid, p]) => {
    const s = day.people?.[uid] || {};
    if (p.weekOnly) return `*${p.name}*  ${s.week ? `week ✓ ${clock(s.week.at)}` : 'week: not yet'}`;
    if (s.out) return `*${p.name}*  _out today${s.back ? `, back ${s.back}` : ''}_`;
    const plan = s.plan ? `plan ✓ ${clock(s.plan.at)}${s.plan.types?.length ? ` (${s.plan.types.join(', ')})` : ''}` : 'plan: not yet';
    const wrap = s.wrap ? `wrap-up ✓ ${clock(s.wrap.at)}` : 'wrap-up: not yet';
    const week = weekday(date) === 1 && !isMaker(p) ? (s.week ? ` · week ✓` : ' · week: not yet') : '';
    return `*${p.name}*  ${plan} · ${wrap}${week}`;
  });
  const need = Object.entries(people).flatMap(([uid, p]) => (day.people?.[uid]?.need || []).map(n => `• ${p.name} needs from ${esc(needLine(n))}`));
  const sent = (day.sent || []).map(s => `• ${esc(s.label)} (${esc(s.by)})`);
  /* 2026-11-26 (the house style, house.js): header "Friday check-in", one summary line, one line per person (the
     board must show everyone, so these rows are not cut at 5), the needs and the sent reviews, the last check-in in the
     gray line, the buttons in one row. No emoji in the header. */
  const btns = [
    { type: 'button', action_id: 'ci_plan', style: 'primary', text: pt('Post my plan'), value: date },
    { type: 'button', action_id: 'ci_wrap', text: pt('Post what I did'), value: date },
    ...(weekday(date) === 1 ? [{ type: 'button', action_id: 'ci_week', text: pt('Post my week'), value: date }] : []),
    { type: 'button', action_id: 'ci_out', text: pt("I'm out today"), value: date },
  ];
  const hm = houseMessage({ title: `${dayName(date)} check-in`, summary: 'Tap a button below. Everything you post goes in this thread.',
    context: day.missed?.length ? `Last check-in: ${day.missed.join(' · ')}` : '', buttons: btns });
  const body = [{ type: 'section', text: md(rows.join('\n') || '_No one on the check-in list yet._') }];
  if (need.length) body.push({ type: 'section', text: md(`*Needs*\n${need.join('\n')}`) });
  if (sent.length) body.push({ type: 'section', text: md(`*Sent to Cole for review*\n${sent.join('\n')}`) });
  const blocks = [...hm.blocks.slice(0, 2), ...body, ...hm.blocks.slice(2)];
  const row = blocks.find(b => b.type === 'actions');
  if (row) row.block_id = 'ci_btns';
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
  /* who missed the last weekday's check-in, shown on today's post */
  const prev = new Date(date + 'T12:00:00Z');
  do prev.setUTCDate(prev.getUTCDate() - 1); while ([0, 6].includes(prev.getUTCDay()));
  const last = await dayOf(env, d, prev.toISOString().slice(0, 10));
  if (last?.ts) {
    const ppl = await peopleOf(env, d);
    day.missed = Object.entries(ppl).filter(([, p]) => !p.weekOnly).flatMap(([uid, p]) => { const s = last.people?.[uid] || {}; if (s.out) return []; if (!s.plan) return [`${p.name} no plan`]; if (!s.wrap) return [`${p.name} no wrap-up`]; return []; });
    if (!day.missed.length) day.missed = ['everyone posted'];
  }
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

/* "What I need" + "From who" (2026-11-16, Cole: "blocked on versus what you need, is it the same thing?"): ONE need,
   and who it is from. Each one becomes an open task in Locus: from Cole = Cole's task; from the client = it also goes in
   the brand's "What we need from the client" on the Monday call (week posts) and to their Requests on Finish. */
const BLOCKERS = [['cole', 'Cole'], ['client', 'the client'], ['creator', 'a creator'], ['team', 'someone on the team']];
const blockedInputs = () => [
  input('need', 'What I need (leave empty if nothing)', plain('v', 'Dartee: the final Early Bird price, so I can finish batch 16', true)),
  input('who', 'From who', { type: 'static_select', action_id: 'v', placeholder: pt('Cole, the client, a creator or the team'), options: BLOCKERS.map(([v, t]) => ({ text: pt(t.replace(/^./, c => c.toUpperCase())), value: v })) }),
];
/* Makers (designer / video editor) post no week: their week is their cards on Production, which the call shows. */
export const isMaker = p => (has(p, 'designer') || has(p, 'editor')) && !has(p, 'strategist') && !has(p, 'buyer') && !p.channel;
const blockerLabel = v => (BLOCKERS.find(b => b[0] === v) || [null, 'someone'])[1];
const needLine = n => typeof n === 'string' ? `Cole: ${n}` : `${blockerLabel(n.on)}: ${n.text}`;
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
/* One rich text box per brand (block ids `<prefix>_<brand id>`), plus one for anything that is not one brand's. */
const brandBoxes = (prefix, list, placeholder) => [
  ...list.map(b => input(`${prefix}_${b.a}`, b.n, rich('v', undefined, placeholder))),
  input(`${prefix}_other`, 'Anything else (not one brand)', rich('v', undefined, 'Agency work, meetings, research across brands')),
];
const planHolder = p => has(p, 'strategist') ? 'Brief batch 15, Game of Belts (8 ads). Why: the giveaway line doubled clicks'
  : has(p, 'buyer') ? 'Launch batch 12 into Early Bird, cut 3 tired ads. Why: frequency over 4'
  : 'Batch 15: 6 statics from Noma\'s brief';
/* The maker's day (2026-11-16, Cole: "I have stuff from yesterday I still need to complete, here's my main goal to get
   done today"): what is left from yesterday (filled from yesterday's unticked lines), today's main goal, anything else. */
async function leftFromYesterday(env, d, uid, date) {
  const prev = new Date(date + 'T12:00:00Z');
  do prev.setUTCDate(prev.getUTCDate() - 1); while ([0, 6].includes(prev.getUTCDay()));
  const s = (await dayOf(env, d, prev.toISOString().slice(0, 10)))?.people?.[uid];
  if (!s?.items?.length) return [];
  const done = new Set(s.wrap?.picked || []);
  return s.wrap?.picked ? s.items.filter((_, i) => !done.has(i)) : s.wrap ? [] : s.items;
}
export async function makerPlanModal(env, d, uid, p, date) {
  const left = (await leftFromYesterday(env, d, uid, date).catch(() => [])).slice(0, 8);
  const carry = { ...plain('v', 'Grunk 399: last 4 Cyber Monday cuts', true), ...(left.length ? { initial_value: left.join('\n').slice(0, 2900) } : {}) };
  const blocks = [
    { type: 'context', elements: [md(left.length ? '*Still finishing* is filled from yesterday\'s plan lines you did not tick. Fix it if it is wrong.' : '*Your day in three lines.*')] },
    input('carry', 'Still finishing from yesterday', carry),
    input('goal', "Today's main goal", plain('v', 'Dartee 430: 8 BF weekend statics to Review by 3pm')),
    input('more', 'Anything else today', plain('v', 'Revisions on Lucky 466 from Noma\'s notes', true)),
    ...blockedInputs(),
  ];
  return { type: 'modal', callback_id: 'ci_plan_submit', private_metadata: JSON.stringify({ date, maker: true }), title: pt('Post my plan'), submit: pt('Post'), close: pt('Cancel'), blocks };
}
const lines = t => String(t || '').split(/\n+/).map(x => clean(x, 300)).filter(Boolean);
export async function planModal(env, d, uid, uname, date) {
  const people = await peopleOf(env, d);
  const p = personOf(people, uid, uname);
  if (isMaker(p)) return makerPlanModal(env, d, uid, p, date);
  const list = await brandList(env, d, p);
  const blocks = [
    input('type', "What's today?", checks('v', DAY_TYPES.map(t => ({ text: t, value: t })))),
    { type: 'context', elements: [md(`*Fill only the brands you're on today.* Leave the rest empty. ${planHint(p)}`)] },
    ...brandBoxes('pb', list, planHolder(p)),
    ...(has(p, 'strategist') ? [input('walk', 'Walkthrough with the creative team today?', plain('v', 'Yes, 10am with Ravo and William (Dartee 15)'))] : []),
    ...blockedInputs(),
  ];
  return { type: 'modal', callback_id: 'ci_plan_submit', private_metadata: JSON.stringify({ date, brands: list }), title: pt('Post my plan'), submit: pt('Post'), close: pt('Cancel'), blocks };
}
/** The brands a person filled in, in form order: [{n, a, rt}]. */
function brandParts(view, prefix, list) {
  const parts = [];
  for (const b of [...(list || []), { a: 'other', n: 'Other' }]) {
    const rt = view?.state?.values?.[`${prefix}_${b.a}`]?.v?.rich_text_value;
    if (rt && !rtEmpty(rt)) parts.push({ ...b, rt });
  }
  return parts;
}
/** Run inside Slack's three seconds: a plan or week with no brand filled in is sent back with a note on the first box. */
export function checkinErrors(p) {
  const cb = p.view?.callback_id || '';
  if (cb === 'ci_week_submit') {
    const w = weekOf(p.view, null);
    if (w.brands.length || w.theme) return null;
    const first = (safe(p.view?.private_metadata, {}) || {}).open?.[0];
    return { [first ? `wf_${first.a}` : 'wk_theme']: 'Write a focus or a batch for at least one brand.' };
  }
  const prefix = cb === 'ci_plan_submit' ? 'pb' : null;
  if (!prefix) return null;
  const meta = safe(p.view?.private_metadata, {}) || {};
  if (meta.maker) { const v = id => clean(p.view?.state?.values?.[id]?.v?.value, 300); return v('goal') || v('carry') ? null : { goal: "Write today's main goal." }; }
  if (brandParts(p.view, prefix, meta.brands).length) return null;
  const first = meta.brands?.[0] ? `${prefix}_${meta.brands[0].a}` : `${prefix}_other`;
  return { [first]: 'Write something under at least one brand.' };
}
/* The filled brands as message blocks: the brand in bold, then exactly what they wrote. */
const partBlocks = parts => parts.flatMap(x => [{ type: 'section', text: md(`*${esc(x.n)}*`) }, x.rt]);
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
    ...blockedInputs(),
  ];
  return { type: 'modal', callback_id: 'ci_wrap_submit', private_metadata: JSON.stringify({ date }), title: pt('Post what I did'), submit: pt('Post'), close: pt('Cancel'), blocks };
}
/* ---------- Post my week (2026-11-16 rebuild, Cole's layout) ----------
 * "Here's your overall plan for the week... then the individual plan for Ice & Gold: what's the main focus, give me a
 * description, then what ads are you making this week: batch one, batch two, batch three, and a button that goes Add
 * batch." So: one theme line across the person's brands, then per brand a Main focus line and its batches, each with
 * its channel (Meta, Google, Amazon, TikTok, Email). Only the person's own brands open; "Add a brand" opens another,
 * "Add batch" adds a row (views.update keeps what was typed: same block and action ids). Block ids: wk_theme,
 * wf_<act> (focus), wb_<act>_<n> (batch), wc_<act>_<n> (its channel). The open brands and batch counts ride in
 * private_metadata.open = [{a, n, k}]. */
const MAX_BATCHES = 10;
async function ownActs(env, d, p, list) {
  if (Array.isArray(p.brands) && p.brands.length) return list.filter(b => p.brands.includes(b.a));
  const mine = new Set(await brandsFor(env, d, p).catch(() => []));
  return list.filter(b => mine.has(b.n));
}
const focusHolder = p => p.channel === 'google' ? 'Move budget from Pmax Wedges to Pmax Hats. Build the BF search ad group, paused until Nov 26.'
  : p.channel === 'amazon' ? 'BF lightning deal on the top 3 hats. New photos on the Lefty listing.'
  : 'Black Friday ads loaded and approved by Wed';
const batchHolder = p => p.channel === 'google' ? 'Branded search BF ad group, 3 RSAs, live Nov 26'
  : p.channel === 'amazon' ? 'New A+ content for the Lefty hat'
  : 'Batch 15 · Game of Belts · 8 statics · due Wed';
export function weekView(p, meta) {
  const open = meta.open || [];
  const multi = !p.channel;   // strategists pick a channel per batch; Google / Amazon people are one channel
  const blocks = [
    { type: 'context', elements: [md(p.channel ? `*Your plan for the week.* The theme across your brands, then the main focus for each one. It shows on the Monday call in the ${chLabel(p.channel)} part.` : `*Your plan for the week.* One line for the theme, then each brand: the main focus and the batches you're making. It shows on the Monday call and is copied to each brand's channel.`)] },
    input('wk_theme', "This week's theme (all your brands)", plain('v', has(p, 'strategist') ? 'Every BF ad loaded by Wed, December gifting briefs by Fri' : focusHolder(p))),
  ];
  for (const b of open) {
    blocks.push({ type: 'header', text: pt(b.n) });
    /* One thing per line (Cole 2026-11-16: "bullet points, not a paragraph"): Enter = a new line = its own bullet. */
    blocks.push(input(`wf_${b.a}`, 'Main focus (one thing per line)', plain('v', focusHolder(p), true), { hint: 'Press Enter after each thing. Each line shows as its own bullet.' }));
    if (p.channel) continue;   // Google / Amazon: one focus per brand, no batches (Cole 2026-11-16)
    for (let i = 0; i < b.k; i++) {
      blocks.push(input(`wb_${b.a}_${i}`, `Batch ${i + 1}`, plain('v', batchHolder(p))));
      if (multi) blocks.push(input(`wc_${b.a}_${i}`, `Batch ${i + 1} channel`, { type: 'static_select', action_id: 'v', initial_option: { text: pt('Meta'), value: 'meta' }, options: CHANNELS.map(([v, t]) => ({ text: pt(t), value: v })) }));
    }
    if (b.k < MAX_BATCHES) blocks.push({ type: 'actions', block_id: `wa_${b.a}`, elements: [{ type: 'button', action_id: 'ci_wk_batch', text: pt('+ Add batch'), value: b.a }] });
  }
  const rest = (meta.brands || []).filter(b => !open.some(o => o.a === b.a));
  if (rest.length && blocks.length < 80) blocks.push({ type: 'divider' }, { type: 'actions', block_id: 'wk_more', elements: [{ type: 'static_select', action_id: 'ci_wk_brand', placeholder: pt('+ Add a brand'), options: rest.slice(0, 100).map(b => ({ text: pt(b.n), value: b.a })) }] });
  if (has(p, 'strategist')) blocks.push(input('walk', 'Walkthroughs this week', plain('v', 'Tue 10am with Ravo and William (Dartee 15, Lucky 14)')));
  blocks.push(...blockedInputs());
  return { type: 'modal', callback_id: 'ci_week_submit', private_metadata: JSON.stringify(meta), title: pt('Post my week'), submit: pt('Post'), close: pt('Cancel'), blocks: blocks.slice(0, 100) };
}
export async function weekModal(env, d, uid, uname, date) {
  const people = await peopleOf(env, d);
  const p = personOf(people, uid, uname);
  if (isMaker(p)) return { type: 'modal', title: pt('Post my week'), close: pt('Close'), blocks: [{ type: 'section', text: md(`No week post for you, ${p.name}. Your week is your cards on Production: the Monday call shows them under *Being made*. Keep posting your plan each morning.`) }] };
  const list = await brandList(env, d, p);
  const own = await ownActs(env, d, p, list);
  return weekView(p, { date, brands: list, open: own.map(b => ({ ...b, k: 1 })) });
}
/** "+ Add batch" / "+ Add a brand" inside the open form: redraw it with one more row. */
async function weekGrow(env, d, p0) {
  const a = p0.actions?.[0] || {};
  const meta = safe(p0.view?.private_metadata, {}) || {};
  meta.open = meta.open || [];
  if (a.action_id === 'ci_wk_batch') { const o = meta.open.find(x => x.a === a.value); if (o) o.k = Math.min(MAX_BATCHES, (o.k || 1) + 1); }
  else if (a.action_id === 'ci_wk_brand') { const v = a.selected_option?.value; const b = (meta.brands || []).find(x => x.a === v); if (b && !meta.open.some(x => x.a === v)) meta.open.push({ ...b, k: 1 }); }
  const people = await peopleOf(env, d);
  const p = personOf(people, p0.user?.id, p0.user?.name);
  const r = await d.slackApi(env, 'views.update', { view_id: p0.view?.id, hash: p0.view?.hash, view: weekView(p, meta) });
  if (!r?.ok) console.log('week views.update: ' + JSON.stringify(r?.error || r?.response_metadata));
}
/** What the week form holds: {theme, brands: [{a, n, focus, batches: [{text, ch}]}]} (brands with nothing typed left out). */
export function weekOf(view, p) {
  const meta = safe(view?.private_metadata, {}) || {};
  const v = id => view?.state?.values?.[id]?.v;
  const brands = [];
  for (const b of meta.open || []) {
    const focus = lines(v(`wf_${b.a}`)?.value).slice(0, 12).join('\n');
    const batches = [];
    for (let i = 0; i < (b.k || 1); i++) {
      const text = clean(v(`wb_${b.a}_${i}`)?.value, 400);
      if (text) batches.push({ text, ch: p?.channel || v(`wc_${b.a}_${i}`)?.selected_option?.value || 'meta' });
    }
    if (focus || batches.length) brands.push({ a: b.a, n: b.n, focus, batches });
  }
  return { theme: clean(v('wk_theme')?.value, 300), brands };
}
/* One brand as Slack text: focus, then a line per batch. `withName` = the brand in bold on top (the #daily-checkin post). */
const weekBrandText = (b, withName = true) => [...(withName ? [`*${esc(b.n)}*`] : []), ...(b.focus ? ['_Main focus:_', ...String(b.focus).split('\n').map(x => `• ${esc(x)}`)] : []), ...b.batches.map((x, i) => `• *Batch ${i + 1}* · ${chLabel(x.ch)}: ${esc(x.text)}`)].join('\n');

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
  const on = val(p.view, 'who')?.selected_option?.value || (need ? 'cole' : '');
  const needCtx = need ? [ctxLine(`🔴 *Needs from ${blockerLabel(on)}:* ${esc(need)}`)] : [];

  if (cb === 'ci_plan_submit' && meta.maker) {
    const carry = lines(val(p.view, 'carry')?.value), goal = clean(val(p.view, 'goal')?.value, 300), more = lines(val(p.view, 'more')?.value);
    const blocks = [head(me.name, 'plan'),
      ...(carry.length ? [{ type: 'section', text: md(`*Still finishing:*\n${carry.map(x => `• ${esc(x)}`).join('\n')}`) }] : []),
      ...(goal ? [{ type: 'section', text: md(`*Main goal today:* ${esc(goal)}`) }] : []),
      ...(more.length ? [{ type: 'section', text: md(`*Also:*\n${more.map(x => `• ${esc(x)}`).join('\n')}`) }] : []), ...needCtx];
    await postInThread(env, d, day, `${me.name}'s plan`, blocks);
    s.plan = { at: now, types: [] }; s.out = false;
    s.items = [...carry, ...(goal ? [goal] : []), ...more];
  } else if (cb === 'ci_plan_submit') {
    const parts = brandParts(p.view, 'pb', meta.brands);
    const types = (val(p.view, 'type')?.selected_options || []).map(o => o.value);
    const walk = clean(val(p.view, 'walk')?.value, 300);
    const blocks = [head(me.name, 'plan', types.join(', ')), ...partBlocks(parts), ...(walk ? [ctxLine(`📅 *Walkthrough:* ${esc(walk)}`)] : []), ...needCtx];
    await postInThread(env, d, day, `${me.name}'s plan`, blocks);
    s.plan = { at: now, types }; s.out = false;
    s.items = parts.flatMap(x => linesOf(x.rt).map(l => x.a === 'other' ? l : `${x.n}: ${l}`));
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
    blocks.push(...needCtx);
    await postInThread(env, d, day, `${me.name}'s wrap-up`, blocks);
    s.wrap = { at: now, done: picked.size, of: items.length, picked: [...picked] };
  } else if (cb === 'ci_week_submit') {
    const w = weekOf(p.view, me);
    const walk = clean(val(p.view, 'walk')?.value, 300);
    const role = me.channel ? chLabel(me.channel) : '';
    const blocks = [head(me.name, 'week', `${dayName(date)} to Fri${role ? ` · ${role}` : ''}`),
      ...(w.theme ? [{ type: 'section', text: md(`*This week:* ${esc(w.theme)}`) }] : []),
      ...w.brands.map(b => ({ type: 'section', text: md(weekBrandText(b)) })),
      ...(walk ? [ctxLine(`📅 *Walkthroughs:* ${esc(walk)}`)] : []), ...needCtx];
    const brands = await d.listBrands(env);
    const copied = [];
    for (const part of w.brands) {
      const b = brands.find(x => x.act_id === part.a);
      if (!b?.slack_channel || b.slack_channel === b.brief_channel) continue;
      const pb = [{ type: 'section', text: md(`*${me.name}'s week · ${esc(part.n)}*${role ? ` (${role})` : ''}${w.theme ? `\n_This week:_ ${esc(w.theme)}` : ''}\n${weekBrandText(part, false)}`) }];
      const ok = d.teamPost ? await d.teamPost(env, b.slack_channel, `${me.name}'s week for ${part.n}`, pb, {}).then(() => true).catch(() => false)
        : (await d.slackApi(env, 'chat.postMessage', { channel: b.slack_channel, text: `${me.name}'s week for ${part.n}`, unfurl_links: false, blocks: pb }).catch(() => null))?.ok;
      if (ok) copied.push(part.n);
    }
    if (copied.length) blocks.push(ctxLine(`Copied to ${copied.map(n => `#${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-internal`).join(', ')}`));
    await postInThread(env, d, day, `${me.name}'s week`, blocks);
    s.week = { at: now, brands: copied };
    /* The Monday call reads the week from here (meetings.js mondayScreen), not from the bot's copies in Slack
       (the call skips bot messages, so a copied week never reached it before 2026-11-16). */
    const key = `weekplan:${date}`;
    const all = safe(await d.getSetting(env, key), {}) || {};
    /* The need, tied to a brand (named in it, else the only brand posted), so the call shows it under that brand. */
    const nb = need ? (w.brands.find(b => need.toLowerCase().includes(b.n.toLowerCase().split(' ')[0])) || (w.brands.length === 1 ? w.brands[0] : null)) : null;
    all[uid] = { name: me.name, role, at: now, theme: w.theme, brands: w.brands, needs: need ? [{ on, text: need, act: nb?.a || '' }] : [] };
    await d.putSetting(env, key, JSON.stringify(all));
    if (w.theme) {
      const themes = Object.values(all).filter(x => x.theme).map(x => `${x.name}: ${x.theme}`).join(' · ');
      await d.putSetting(env, 'mondayTheme', JSON.stringify({ date, text: themes.slice(0, 600) }));
    }
  } else return;
  if (need && !(s.need || []).some(n => (n.text || n) === need)) {
    s.need = [...(s.need || []), { on, text: need }].slice(-3);
    /* the blocker as an open task in Locus: Cole's own when it waits on him, else the poster's (or the teammate they named) to chase */
    const brands = (await d.listBrands(env).catch(() => [])).filter(b => !PAUSED.test(b.name || ''));
    const low = need.toLowerCase();
    const brand = brands.find(b => low.includes(shortName(b.name).toLowerCase()));
    const named = ROSTER.find(r => r.name !== me.name && low.includes(r.name.toLowerCase()));
    const owner = on === 'cole' ? 'Cole' : on === 'team' && named ? named.name : me.name;
    await addAction(env, { act: brand?.act_id || '', text: on === 'cole' ? `${me.name} needs: ${need}` : `Get from ${blockerLabel(on)}: ${need}`,
      detail: `${me.name} is blocked on ${blockerLabel(on)} (daily check-in, ${dayName(date)}).`, owner, kind: on === 'client' ? 'client_owes' : 'team',
      source: 'manual', source_id: `checkin:${date}:${uid}`, created_by: me.name }).catch(e => console.log('checkin blocker task: ' + e.message));
  }
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
  if (a.action_id === 'ci_wk_batch' || a.action_id === 'ci_wk_brand') { ctx.waitUntil(weekGrow(env, d, p).catch(e => console.log('week grow: ' + e.message))); return; }
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
  const r = await env.DB.prepare(`SELECT b.id, b.act_id, b.num, b.title, b.brief_json, b.brief_text, b.board_stage, b.assignee_name, b.needs_client, b.client_sent_at, a.name AS brand, a.slack_channel, a.brief_channel FROM p_br_batch b LEFT JOIN brand_accounts a ON a.act_id = b.act_id WHERE b.id = ?1`).bind(String(id)).first();
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
  /* 2026-11-09 (the lane format, lane.js): "*CREATIVE · Brand*", Cole tagged with the ask, who sent it and what it tests. */
  const lane = laneBlocks({ lane: 'CREATIVE', brand: shortName(r.brand), who: 'Cole', ask: `Review ${label}`, why: `${by} sent it for your look · ${line}` });
  return { label, head: lane.mrkdwn };
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
  const text = `${head}${videos.length ? '\n' + videos.join('\n') : ''}`;   // the head tags Cole (lane format)
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
      /* 2026-11-09 (the lane format, lane.js): an ask to the card's maker, in the review's thread. */
      if (rec?.ts) {
        const m = laneBlocks({ lane: 'CREATIVE', brand: shortName(st?.r?.brand || ''), who: await laneWho(env, d, st?.r?.assignee_name || ''),
          ask: `Change ${esc(ad?.ad || 'the ad')}: ${esc(note)}`, why: `${esc(who)} asked; the card is back in Making` });
        await d.slackApi(env, 'chat.postMessage', { channel: rec.channel, thread_ts: rec.ts, text: m.text, blocks: m.blocks }).catch(() => {});
      }
    } catch (e) { console.log('review change: ' + e.message); }
  })());
}

/* ---------- the hourly tick ---------- */
/* ---------- the check-in in Locus (2026-11-26, move lines a10) ----------
   My day posts a plan or "I'm out today", and Agency > Team shows today's board: the SAME settings `checkin:<date>`
   the Slack form writes (day.people[slack id] = {plan: {at, types, via}, items, out, wrap}), so the Slack board, the
   "no plan yet" line (movelines.js) and the 10am summary all read one record. When today's day post is already up, a
   plan typed in Locus is also posted in its thread and the board is redrawn, exactly as the Slack form does, so the two
   never disagree. With no day post yet (before the morning hour, a weekend) the plan is only stored; ensureDay keeps it
   when the post goes up. Nothing here makes the day post itself. */
/** Today's board for Locus. Pure. `day` = settings checkin:<date> (or null), `people` = peopleOf. */
export function plansView(date, day, people) {
  const d = day || {};
  const monday = weekday(date) === 1;
  const rows = Object.entries(people || {}).filter(([, p]) => !p.weekOnly || monday).map(([uid, p]) => {
    const s = (d.people || {})[uid] || {};
    return { uid, name: clean(p.name, 40), roles: p.roles || [], week_only: !!p.weekOnly,
      state: s.out ? 'out' : s.plan ? 'plan' : 'none',
      plan: s.plan ? { at: s.plan.at || null, types: s.plan.types || [], via: s.plan.via || 'slack' } : null,
      items: (s.items || []).slice(0, 12).map(x => clean(x, 200)), out: !!s.out, back: s.back || null,
      wrap: s.wrap ? { at: s.wrap.at || null, done: s.wrap.done ?? null, of: s.wrap.of ?? null } : null,
      week: !!s.week, need: (s.need || []).map(n => needLine(n)) };
  });
  return { date, weekend: weekday(date) === 0 || weekday(date) === 6, posted: !!d.ts, channel: d.channel || null,
    counts: { plan: rows.filter(r => r.state === 'plan').length, out: rows.filter(r => r.state === 'out').length, none: rows.filter(r => r.state === 'none' && !r.week_only).length },
    people: rows };
}
export async function plansToday(env, d, { date = d.centralDate() } = {}) {
  return plansView(date, await dayOf(env, d, date), await peopleOf(env, d));
}
/** A plan or "out today" typed in Locus. `uid` = the person's Slack id (on the check-in list), `text` = one thing per
 *  line, `types` = what today is (the Slack form's chips). Returns the person's row. */
export async function planFromLocus(env, d, { uid, text = '', out = false, types = [], date = d.centralDate() } = {}) {
  const people = await peopleOf(env, d);
  const me = people[uid];
  if (!uid || !me) throw Object.assign(new Error('You are not on the daily check-in list. Ask the owner to add you.'), { status: 400 });
  if (me.weekOnly) throw Object.assign(new Error('You post a week, not a daily plan.'), { status: 400 });
  const items = String(text || '').split(/\n+/).map(x => clean(x.replace(/^[-*•]\s*/, ''), 300)).filter(Boolean).slice(0, 20);
  if (!out && !items.length) throw Object.assign(new Error('Write at least one thing for today.'), { status: 400 });
  const day = (await dayOf(env, d, date)) || { people: {}, sent: [] };
  day.people = day.people || {};
  const s = day.people[uid] = day.people[uid] || {};
  const now = new Date().toISOString();
  const kinds = (Array.isArray(types) ? types : []).filter(t => DAY_TYPES.includes(t));
  if (out) {
    if (s.out) return plansView(date, day, people).people.find(r => r.uid === uid);
    s.out = true;
    if (day.ts) await postInThread(env, d, day, `${me.name} is out today`, [ctxLine(`🌴 *${me.name}* is out today.`)]).catch(() => {});
  } else {
    s.plan = { at: now, types: kinds, via: 'locus' }; s.out = false;
    s.items = items;
    if (day.ts) await postInThread(env, d, day, `${me.name}'s plan`, [head(me.name, 'plan', kinds.join(', ')),
      { type: 'section', text: md(items.map(x => `• ${esc(x)}`).join('\n')) }, ctxLine('Posted from My day in Locus')]).catch(() => {});
  }
  await saveDay(env, d, date, day);
  if (day.ts) await redraw(env, d, date, day);
  return plansView(date, day, people).people.find(r => r.uid === uid);
}
export { DAY_TYPES };

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
      const late = Object.entries(people).filter(([uid, p]) => { const s = day.people?.[uid] || {}; return !p.weekOnly && !s.plan && !s.out; });
      /* 2026-11-26 (move lines): the same line is the top of each person's My day (movelines.js); this DM goes quiet
         with settings jobOn:noPlanDm = 'off'. The stamp is written either way. */
      const dmOn = await jobOn(env, 'noPlanDm', d.getSetting);
      for (const [uid] of dmOn ? late : []) {
        /* 2026-11-09 (the lane format, lane.js): "*OPS · Agency*", the person, the ask, the same two buttons. */
        const m = laneBlocks({ lane: 'OPS', brand: 'Agency', who: uid, ask: `Post your plan for today in <https://slack.com/app_redirect?channel=${day.channel}|#daily-checkin>`, why: 'no plan from you yet today',
          buttons: [{ type: 'button', action_id: 'ci_plan', style: 'primary', text: pt('Post my plan'), value: date }, { type: 'button', action_id: 'ci_out', text: pt("I'm out today"), value: date }] });
        await d.slackApi(env, 'chat.postMessage', { channel: uid, text: m.text, blocks: m.blocks }).catch(() => {});
      }
      await d.putSetting(env, `checkinNudged:${date}`, JSON.stringify(late.map(([u]) => u)));
      out.nudged = late.length;
    }
  }
  /* Monday: the week button by DM to anyone who is not in #daily-checkin (Hamza, a Slack Connect guest), once. */
  if (weekday(date) === 1 && hour >= mh && hour < 20 && !(await d.getSetting(env, `checkinWeekDm:${date}`))) {
    const people = await peopleOf(env, d);
    const sent = [];
    for (const [uid, p] of Object.entries(people).filter(([, p]) => p.dm)) {
      /* 2026-11-26 (the house style): header, one summary line, one button. */
      const hm = houseMessage({ title: 'Post your week for the Monday call', summary: `Morning ${p.name}. The main focus and what you're working on, per brand.`,
        buttons: [{ type: 'button', action_id: 'ci_week', style: 'primary', text: pt('Post my week'), value: date }] });
      const r = await d.slackApi(env, 'chat.postMessage', { channel: uid, text: hm.text, blocks: hm.blocks }).catch(e => ({ error: e.message }));
      sent.push(`${p.name}: ${r?.ok ? 'sent' : r?.error || 'failed'}`);
    }
    await d.putSetting(env, `checkinWeekDm:${date}`, JSON.stringify(sent));
    out.weekDm = sent;
  }
  await autoApproveTick(env, d, out);
  return out;
}
/* No answer in 24 hours = approved by the timer, unless settings.checkinAutoApprove is '0' (then nothing here runs and
   the card waits for a person). Its own function so the switch can be tested without the rest of the tick.
   A card sent to the client (needs_client) is NEVER approved by the timer (journey audit 2026-11-26): it waits for the
   client or a person, and it does not use up one of the ten cards judged per tick. */
export async function autoApproveTick(env, d, out = {}) {
  /* 2026-11-26: a quiet job (jobflags.js jobOn:autoApprove). */
  if (!(await jobOn(env, 'autoApprove', d.getSetting))) { out.autoApprove = 'quiet'; return out; }
  if ((await d.getSetting(env, AUTO_APPROVE_KEY)) === '0') { out.autoApprove = 'off'; return out; }
  const open = safe(await d.getSetting(env, 'rvOpen'), []);
  let approved = 0, judged = 0;
  for (const id of open.slice(0, 60)) {
    if (judged >= 10) break;
    const rec = safe(await d.getSetting(env, `rvPost:${id}`), null);
    if (!rec || rec.done) continue;
    if (Date.now() - Date.parse(rec.at) < AUTO_APPROVE_HOURS * 3600e3) continue;
    const st = await cardState(env, id);
    if (st && st.r && st.r.needs_client) { out.heldForClient = (out.heldForClient || 0) + 1; continue; }
    judged++;
    const waiting = st?.ads.filter(a => a.status === 'review') || [];
    if (!waiting.length) { await redrawReview(env, d, id, '✅ Every ad has its call.'); continue; }
    try {
      await (d.decideMany || decideMany)(env, d.prod, { id, all: true, body: AUTO_APPROVE_NOTE }, AUTO_APPROVE_WHO, null, { later: false, name: AUTO_APPROVE_WHO });
      approved++; await redrawReview(env, d, id, `✅ Approved automatically: no answer in ${AUTO_APPROVE_HOURS} hours`);
    } catch (e) { out.approveError = e.message; }
  }
  if (approved) out.autoApproved = approved;
  return out;
}
