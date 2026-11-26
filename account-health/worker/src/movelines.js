/* THE MOVE LINES (2026-11-26, Cole approved all 8 automation groups: "move to Locus" items get their Locus line NOW,
 * their Slack posts switch off after Dec 2, their code goes a week later). Checklist: side-session notes move-checklist.md.
 *
 * Each line is one row on the person's My day (and the bell, through GET /api/mywork), for the right person, grouped
 * (one row with a count), and it clears itself: every line is worked out live from the data on each read, so the row
 * is simply gone once the thing is done. Nobody ticks a move line. None of them is ever in the 5am My work DM
 * (mywork.js DM_SKIP): that Slack post stays byte for byte what it is today.
 *
 *   source     who                              the line                                          clears when
 *   checkin    a daily check-in person          "Your plan for today is not in" (top of My day,   a plan or "out today" is posted
 *              (not a week only guest)           never a bell row: a self nudge)                    (settings checkin:<date>)
 *   weekplan   the brand's strategist (else     Monday: "Write this week's plan for N brands"      the week is posted (weekplan:<monday>)
 *              the owner)                        (callnudge.js stores mondayPlans:<date> at 7am)    or the Monday is over
 *   dates      the owner of an open step         "<date> goes live tomorrow: N steps open"          the date goes live; the snapshot
 *                                                 (calendar.js stores calCountdown each morning)     (refreshed daily at 8am) drops the step
 *   comments   the card's maker (changes asked)  "N cards with comments or changes for you"         a new version is uploaded, the card
 *              or the person tagged (@Name)                                                         leaves Making, or the person answers
 *   newmeta    the owner                         "N new Meta ad accounts to match to a client"      the account is matched (a meta
 *                                                 "Give Locus access to N new client ad accounts"     connection on the new client)
 *   connect    the owner                         "N client connect asks waiting on you"             the key is pasted (p_br_doc) or the
 *                                                 (Klaviyo key, Clarity token, Google request)        Google request goes through
 *   creators   the buyer / the reviewer          "N approved creator videos to load"                loaded into Meta / reviewed in Trybe
 *              (agency switch creatorProgram)    "N creator videos to review"
 *
 * Reads are quiet: one that fails leaves its line out and never breaks My day. No client names, no em dashes. */
import { DEFAULT_PEOPLE, DEFAULT_CHANNEL } from './checkin.js';
import { morningHour } from './morningcard.js';
import { laneOwner } from './lane.js';
import { teamOf } from './calendar.js';
import { featureOn } from './jobflags.js';

export const LINE_SOURCES = ['checkin', 'weekplan', 'dates', 'comments', 'newmeta', 'connect', 'creators'];
const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
export const V5 = {
  production: '#/agency/all/a-production/pipeline',
  calendar: '#/agency/all/a-calendar/index',
  newClient: '#/agency/all/a-clients/new',
  integrations: '#/agency/all/a-settings/integrations',
  creatorsReview: '#/agency/all/a-creators/to-review',
  creatorsLoad: '#/agency/all/a-creators/by-brand',
};
/* The keys only we can make once a client invited us (connect.js YOURS): the p_br_doc row that means "made". */
const YOURS_DOC = { email: ['klaviyo', 'Klaviyo private key'], clarity: ['clarity', 'Clarity API token'] };

const safe = (s, d) => { if (s == null || s === '') return d; if (typeof s !== 'string') return s; try { const v = JSON.parse(s); return v == null ? d : v; } catch { return d; } };
const clean = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const noDash = s => String(s ?? '').replace(/\s*[—–]\s*/g, ', ');
const many = (n, one, more) => `${n} ${n === 1 ? one : more || one + 's'}`;
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();
const mondayOf = ymd => addDays(ymd, -((dow(ymd) + 6) % 7));
const dayLabel = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
/** One sortable form for D1 times ("2026-11-20 10:00:00") and ISO times ("2026-11-20T10:00:00.000Z"). */
export const tkey = t => String(t || '').replace('T', ' ').replace(/\.\d+/, '').replace(/Z$/, '').slice(0, 19);
const listOf = (names, max = 4) => names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- reading (each part quiet) ---------- */
const getS = async (env, d, k) => (d && d.getSetting ? d.getSetting(env, k) : (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first())?.value);
async function quiet(fn, fb) { try { return await fn(); } catch { return fb; } }

/** Everything the move lines need, read once per My day read. `brands` = listBrands rows. */
export async function gatherLines(env, d, { today, brands = [] } = {}) {
  const S = k => quiet(() => getS(env, d, k), null);
  const out = { today };
  out.checkin = await quiet(async () => ({
    people: safe(await S('checkinPeople'), null) || DEFAULT_PEOPLE,
    day: safe(await S(`checkin:${today}`), null),
    off: (await S('checkinPost')) === 'off',
    hour: d && d.centralHour ? d.centralHour() : null,
    from: await morningHour(env).catch(() => 5),
    channel: (await S('checkinChannel')) || DEFAULT_CHANNEL,
  }), null);
  out.mondayPlans = safe(await S(`mondayPlans:${today}`), null);
  out.weekplan = safe(await S(`weekplan:${mondayOf(today)}`), {}) || {};
  out.countdown = safe(await S('calCountdown'), null);
  const since = addDays(today, -14);
  out.comments = await quiet(async () => ((await env.DB.prepare(`SELECT c.id, c.batch_id, c.act_id, c.author_name, c.author_email, c.body, c.kind, c.created_at,
      b.num, b.title, b.assignee_name, b.board_stage FROM p_work_comment c JOIN p_br_batch b ON b.id = c.batch_id
      WHERE c.created_at >= ?1 ORDER BY c.created_at LIMIT 800`).bind(since).all()).results) || [], []);
  out.versions = await quiet(async () => Object.fromEntries((((await env.DB.prepare(`SELECT batch_id, MAX(created_at) AS at FROM p_work_file
      WHERE kind = 'version' AND deleted_at IS NULL AND created_at >= ?1 GROUP BY batch_id`).bind(since).all()).results) || []).map(r => [r.batch_id, r.at])), {});
  out.newClients = await quiet(async () => {
    const runs = ((await env.DB.prepare(`SELECT name, steps_json FROM p_newclient WHERE (act_id IS NULL OR NOT EXISTS (SELECT 1 FROM connections c WHERE c.brand_id = p_newclient.act_id AND c.kind = 'meta'))
      AND slack_internal IS NOT NULL AND created_at > datetime('now', '-45 days')`).all()).results) || [];
    if (!runs.length) return { waiting: [], untracked: 0 };
    const u = await env.DB.prepare(`SELECT COUNT(*) AS n FROM accounts WHERE act_id LIKE 'act_%'
      AND NOT EXISTS (SELECT 1 FROM connections c WHERE c.kind = 'meta' AND c.external_id = accounts.act_id)
      AND NOT EXISTS (SELECT 1 FROM daily_insights d WHERE d.act_id = accounts.act_id)`).first().catch(() => null);
    return { waiting: runs.map(r => ({ name: clean(r.name, 60), blocked: !!(safe(r.steps_json, {}) || {}).meta_blocked })), untracked: +(u && u.n) || 0 };
  }, null);
  out.connect = await quiet(async () => {
    const rows = ((await env.DB.prepare(`SELECT key, value FROM settings WHERE key LIKE 'connectInvited:%' OR key LIKE 'connectPending:%'`).all()).results) || [];
    if (!rows.length) return [];
    const docs = new Set((((await env.DB.prepare(`SELECT act_id, key FROM p_br_doc WHERE line_id = '' AND key IN ('klaviyo', 'clarity')`).all().catch(() => ({ results: [] }))).results) || []).map(r => `${r.act_id}|${r.key}`));
    const names = Object.fromEntries((((await env.DB.prepare(`SELECT id, name FROM brands`).all().catch(() => ({ results: [] }))).results) || []).map(r => [r.id, r.name]));
    const asks = [];
    for (const r of rows) {
      const pend = r.key.startsWith('connectPending:');
      const id = r.key.slice(r.key.indexOf(':') + 1), v = safe(r.value, {}) || {};
      if (pend) { if (v.google_ads && v.google_ads.error) asks.push({ act: id, name: names[id] || '', key: 'google_ads', label: 'Google Ads manager request', how: 'send it by hand from the Mobius manager' }); continue; }
      for (const k of Object.keys(v)) {
        const y = YOURS_DOC[k];
        if (y && !docs.has(`${id}|${y[0]}`)) asks.push({ act: id, name: names[id] || '', key: k, label: y[1], how: 'make it and paste it in Locus' });
      }
    }
    return asks;
  }, []);
  out.creators = await quiet(async () => {
    if (!(await featureOn(env, 'creatorProgram', d && d.getSetting ? (e, k) => d.getSetting(e, k) : undefined))) return null;
    const NL = `status = 'approved' AND ads_count = 0 AND NOT EXISTS (SELECT 1 FROM p_trybe_ad a WHERE a.act_id = s.act_id AND a.trybe_id = s.trybe_id)`;
    const rows = ((await env.DB.prepare(`SELECT act_id, SUM(status = 'pending') AS review, SUM(${NL}) AS queue FROM p_trybe_sub s GROUP BY act_id`).all()).results) || [];
    const live = rows.filter(r => (+r.review || 0) + (+r.queue || 0) > 0);
    if (!live.length) return { brands: [], team: {} };
    const name = id => (brands.find(b => b.act_id === id) || {}).name || id;
    const team = await teamOf(env, live.map(r => r.act_id)).catch(() => ({}));
    return { brands: live.map(r => ({ act: r.act_id, name: name(r.act_id), review: +r.review || 0, queue: +r.queue || 0 })), team };
  }, null);
  return out;
}

/* ---------- the lines for one person (pure) ---------- */
/** lineItems(lines, person, { isPerson, strat, ownerEmail }) -> mywork items (source in LINE_SOURCES). */
export function lineItems(L, person, { isPerson, strat = {}, ownerEmail = '' } = {}) {
  const out = [];
  if (!L || !person) return out;
  const today = L.today, tomorrow = addDays(today, 1);
  const owner = !!person.email && person.email === String(ownerEmail || '').toLowerCase();
  const me = who => !!who && isPerson(who, person.name);

  /* a11: no plan yet, the top line of My day (weekdays, from the morning hour, once today's check-in post is up) */
  const c = L.checkin;
  if (c && !c.off && person.slack && c.people && c.people[person.slack] && !c.people[person.slack].weekOnly && dow(today) >= 1 && dow(today) <= 5
    && c.day && c.day.ts && (c.hour == null || c.hour >= c.from)) {
    const s = (c.day.people || {})[person.slack] || {};
    if (!s.plan && !s.out) out.push({ id: `checkin:${today}`, source: 'checkin', bucket: 'today', top: true, nudge: true, text: 'Your plan for today is not in',
      detail: 'Post it with Post my plan on today\'s check-in, or tap I\'m out today there.', from: 'Daily check-in', brand: '', act_id: '', due: '',
      link: `https://slack.com/app_redirect?channel=${encodeURIComponent(c.channel || DEFAULT_CHANNEL)}`, btn_label: 'Post my plan', done: false });
  }

  /* a31 + a54: Monday, the brands with no week plan yet, to their strategist (else the owner) */
  const mp = L.mondayPlans;
  if (mp && mp.date === today && Array.isArray(mp.brands)) {
    const planned = new Set(Object.values(L.weekplan || {}).flatMap(w => ((w && w.brands) || []).map(x => x && x.a)));
    const mine = mp.brands.filter(b => b && b.act && !planned.has(b.act) && (strat[b.act] ? me(strat[b.act]) : owner));
    if (mine.length) out.push({ id: `weekplan:${today}`, source: 'weekplan', bucket: 'today', text: `Write this week's plan for ${many(mine.length, 'brand')}`,
      detail: `No plan yet for ${listOf(mine.map(b => noDash(b.name || b.act)))}. The Monday call screen shows each brand's plan.`, from: 'Monday plan',
      brand: mine.length === 1 ? noDash(mine[0].name || '') : '', act_id: mine.length === 1 ? mine[0].act : '', due: '',
      link: `${LOCUS}?open=calls&call=monday`, btn_label: 'Open the Monday call', done: false });
  }

  /* a19: a date going live tomorrow or in 7 days with steps still open, to the owner of the open steps */
  const cd = L.countdown;
  if (cd && Array.isArray(cd.items)) {
    for (const e of cd.items) {
      if (!e || !e.start || e.start <= today || !Array.isArray(e.steps) || !e.steps.length) continue;
      if (!(me(e.who) || (owner && !e.who))) continue;
      const when = e.start === tomorrow ? 'tomorrow' : dayLabel(e.start);
      out.push({ id: `date:${e.id || e.event}:${e.start}:${clean(e.who, 30)}`, source: 'dates', bucket: e.start === tomorrow ? 'today' : 'week',
        text: `${noDash(clean(e.event, 80))} goes live ${when}: ${many(e.steps.length, 'step')} open`, detail: noDash(e.steps.join(', ')) + '.',
        from: 'Calendar', brand: noDash(e.brand || ''), act_id: e.act || '', due: e.start, v5: V5.calendar, btn_label: 'Open the calendar', done: false });
    }
  }

  /* a57: changes asked on a card I make, or a comment that tags me, not answered yet */
  if (Array.isArray(L.comments) && L.comments.length) {
    const name = String(person.name || '').toLowerCase();
    const tag = name ? new RegExp(`@${reEsc(name)}(?![a-z])`, 'i') : null;
    const mine = cm => isPerson(cm.author_name, person.name) || (!!person.email && String(cm.author_email || '').toLowerCase() === person.email);
    const last = {};
    for (const cm of L.comments) if (mine(cm) && tkey(cm.created_at) > (last[cm.batch_id] || '')) last[cm.batch_id] = tkey(cm.created_at);
    const open = new Map();
    for (const cm of L.comments) {
      if (mine(cm)) continue;
      const at = tkey(cm.created_at);
      if (last[cm.batch_id] && last[cm.batch_id] > at) continue;            // I answered on the card after it
      let why = null;
      if (cm.kind === 'change_request' && isPerson(cm.assignee_name, person.name)) {
        const moved = ['review', 'ready', 'live', 'done'].includes(String(cm.board_stage || ''));
        const newer = (L.versions || {})[cm.batch_id] && tkey(L.versions[cm.batch_id]) > at;
        if (!moved && !newer) why = 'changes';
      } else if (tag && tag.test(String(cm.body || ''))) why = 'tag';
      if (!why) continue;
      open.set(cm.batch_id, { id: cm.batch_id, num: cm.num, title: cm.title, act: cm.act_id, by: clean(String(cm.author_name || '').split(' ')[0], 30) || 'Someone', why });
    }
    const list = [...open.values()];
    if (list.length) {
      const one = list[0], label = x => `card ${String(x.num || '').trim() || ''} "${noDash(clean(x.title, 60))}"`.replace('card  ', 'card ');
      out.push({ id: `comments:${today}`, source: 'comments', bucket: 'today',
        text: list.length === 1 ? (one.why === 'changes' ? `Changes asked on ${label(one)}` : `${one.by} tagged you on ${label(one)}`) : `${many(list.length, 'card')} with comments or changes for you`,
        detail: list.slice(0, 5).map(x => `${x.why === 'changes' ? 'Changes asked' : `${x.by} tagged you`} on ${label(x)}`).join('; ') + (list.length > 5 ? `; and ${list.length - 5} more` : '') + '.',
        from: 'Card comments', brand: '', act_id: list.length === 1 ? one.act || '' : '', due: '',
        ...(list.length === 1 ? { link: `${LOCUS}?open=production&card=${encodeURIComponent(one.id)}`, btn_label: 'Open card' } : { v5: V5.production, btn_label: 'Open the pipeline' }), done: false });
    }
  }

  if (owner) {
    /* a59: a new client still waiting on its Meta ad account */
    const nc = L.newClients;
    if (nc && Array.isArray(nc.waiting) && nc.waiting.length) {
      const free = nc.waiting.filter(w => !w.blocked), blocked = nc.waiting.filter(w => w.blocked);
      if (nc.untracked > 0 && free.length) out.push({ id: `newmeta:match:${today}`, source: 'newmeta', bucket: 'today',
        text: `${many(nc.untracked, 'new Meta ad account')} to match to a client`, detail: `Waiting on their ad account: ${listOf(free.map(w => noDash(w.name)))}.`,
        from: 'New client', brand: '', act_id: '', due: '', v5: V5.newClient, btn_label: 'Match it', done: false });
      if (blocked.length) out.push({ id: `newmeta:access:${today}`, source: 'newmeta', bucket: 'today',
        text: `Give Locus access to ${many(blocked.length, 'new client ad account')}`, detail: `Add the Mobius Tools system user in Business Settings for ${listOf(blocked.map(w => noDash(w.name)))}.`,
        from: 'New client', brand: '', act_id: '', due: '', v5: V5.newClient, btn_label: 'Open', done: false });
    }
    /* a58: a client invited us and only we can finish it */
    if (Array.isArray(L.connect) && L.connect.length) {
      const a = L.connect;
      out.push({ id: `connect:${today}`, source: 'connect', bucket: 'today', text: `${many(a.length, 'client connect ask')} waiting on you`,
        detail: a.slice(0, 5).map(x => `${x.label} for ${noDash(x.name || x.act)}: ${x.how}`).join('; ') + (a.length > 5 ? `; and ${a.length - 5} more` : '') + '.',
        from: 'Connect link', brand: a.length === 1 ? noDash(a[0].name || '') : '', act_id: a.length === 1 ? a[0].act : '', due: '', v5: V5.integrations, btn_label: 'Open Integrations', done: false });
    }
  }

  /* a45: creator videos waiting, to the brand's buyer (load) and reviewer (review); the agency switch decides */
  const cr = L.creators;
  if (cr && Array.isArray(cr.brands)) {
    const load = cr.brands.filter(b => b.queue > 0 && me(laneOwner('MEDIA BUYING', (cr.team || {})[b.act])));
    const review = cr.brands.filter(b => b.review > 0 && me(laneOwner('CREATORS', (cr.team || {})[b.act])));
    const sum = (xs, k) => xs.reduce((n, b) => n + b[k], 0);
    if (load.length) out.push({ id: `creators:load:${today}`, source: 'creators', bucket: 'today', text: `${many(sum(load, 'queue'), 'approved creator video')} to load`,
      detail: load.map(b => `${noDash(b.name)} ${b.queue}`).join(', ') + '.', from: 'Creators', brand: load.length === 1 ? noDash(load[0].name) : '', act_id: load.length === 1 ? load[0].act : '', due: '',
      v5: V5.creatorsLoad, btn_label: 'Open Creators', done: false });
    if (review.length) out.push({ id: `creators:review:${today}`, source: 'creators', bucket: 'today', text: `${many(sum(review, 'review'), 'creator video')} to review`,
      detail: review.map(b => `${noDash(b.name)} ${b.review}`).join(', ') + '.', from: 'Creators', brand: review.length === 1 ? noDash(review[0].name) : '', act_id: review.length === 1 ? review[0].act : '', due: '',
      v5: V5.creatorsReview, btn_label: 'Review', done: false });
  }
  return out;
}

/* ---------- the snapshots the ticks leave for these lines ---------- */
/** calendar.js calendarTick: the open steps of dates going live tomorrow or in 7 days, one entry per date and owner.
 *  data = calendarData's answer; who = (step, brand team) -> first name (or '' for nobody named = the owner). Pure. */
export function countdownFrom(data, today, who) {
  const items = [];
  const brands = new Map(((data && data.brands) || []).map(b => [b.id, b]));
  for (const e of (data && data.items) || []) {
    if (e.start !== addDays(today, 1) && e.start !== addDays(today, 7)) continue;
    const b = brands.get(e.act) || {};
    const by = new Map();
    for (const s of (e.steps || []).filter(s => s.state !== 'done')) {
      const w = who(s, b.team || {}) || '';
      (by.get(w) || by.set(w, []).get(w)).push(s.label || s.key);
    }
    for (const [w, steps] of by) items.push({ id: String(e.id || ''), act: e.act, brand: b.name || '', event: clean(e.name, 80), start: e.start, who: w, steps });
  }
  return { date: today, items };
}
