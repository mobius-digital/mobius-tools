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
 *                                                 (calendar.js stores calCountdown each morning)     (at 8am, then hourly while steps are open) drops the step
 *   comments   the card's maker (changes asked)  "N cards with comments or changes for you"         a new version is uploaded, the card
 *              or the person tagged (@Name)                                                         leaves Making, or the person answers (a tag: a week,
 *                                                                                                     or the card goes live or off)
 *   newmeta    the owner                         "N new Meta ad accounts to match to a client"      the account is matched (a meta
 *                                                 (only accounts NEW since a discovery, kept 14 days   connection on the new client), or
 *                                                  in settings newMetaFresh by worker.js)              14 days pass
 *                                                 "Give Locus access to N new client ad accounts"
 *   connect    the owner                         "N client connect asks waiting on you"             the key is pasted (p_br_doc) or the
 *                                                 (Klaviyo key, Clarity token, Google request)        Google request goes through
 *   creators   the buyer / the reviewer          "N approved creator videos to load"                loaded into Meta / reviewed in Trybe
 *              (agency switch creatorProgram)    "N creator videos to review" (+ "N waiting 2 days or more")
 *                                                 "Answer N creators waiting in Discord"             the next morning's snapshot (trybe.js
 *                                                 Monday: "Rebook N creators this week"               settings trybeAsks) no longer lists it
 *   weekplan is also behind the agency switch feature:weekPlan (a54; missing = on, as today).
 *
 * Reads are quiet: one that fails leaves its line out and never breaks My day. No client names, no em dashes. */
import { DEFAULT_PEOPLE, DEFAULT_CHANNEL } from './checkin.js';
import { morningHour } from './morningcard.js';
import { laneOwner } from './lane.js';
import { teamOf } from './calendar.js';
import { featureOn } from './jobflags.js';

export const LINE_SOURCES = ['checkin', 'weekplan', 'dates', 'comments', 'newmeta', 'connect', 'creators'];
const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
/* Every line also carries an absolute `link`: the v5 bell and My day open `v5` first, but the old Locus My work page
   (profit/mywork.js, the page the 5am DM opens) only knows `link`. */
const V5_BASE = `${LOCUS}v5/`;
export const v5Link = hash => `${V5_BASE}${hash}`;
/* worker.js autoConnectMeta keeps the Meta ad accounts that were NEW at a discovery here ([{ act, name, at }]), 14 days. */
export const NEW_META_KEY = 'newMetaFresh';
export const NEW_META_DAYS = 14;
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
  /* a54: the Monday week plan is our process, so it sits behind the agency switch feature:weekPlan (missing = on) */
  out.weekPlanOn = await quiet(() => featureOn(env, 'weekPlan', d && d.getSetting ? (e, k) => d.getSetting(e, k) : undefined), true);
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
    /* Only the accounts that were NEW at a discovery (the ones the Slack ask was about) and are still on no brand and
       never synced; the old pool of unrelated unconnected accounts is never counted. */
    const cut = new Date(Date.parse(today + 'T12:00:00Z') - NEW_META_DAYS * 864e5).toISOString();
    const fresh = (safe(await S(NEW_META_KEY), []) || []).filter(f => f && f.act && String(f.at || '') >= cut);
    let untracked = 0;
    if (fresh.length) {
      const pool = new Set((((await env.DB.prepare(`SELECT act_id FROM accounts WHERE act_id LIKE 'act_%'
        AND NOT EXISTS (SELECT 1 FROM connections c WHERE c.kind = 'meta' AND c.external_id = accounts.act_id)
        AND NOT EXISTS (SELECT 1 FROM daily_insights d WHERE d.act_id = accounts.act_id)`).all().catch(() => ({ results: [] }))).results) || []).map(r => r.act_id));
      untracked = new Set(fresh.filter(f => pool.has(f.act)).map(f => f.act)).size;
    }
    return { waiting: runs.map(r => ({ name: clean(r.name, 60), blocked: !!(safe(r.steps_json, {}) || {}).meta_blocked })), untracked };
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
    /* this morning's asks snapshot (trybe.js trybeTick, settings trybeAsks): reviews 2+ days old, Discord, rebook */
    const snap = safe(await S('trybeAsks'), null);
    const asks = snap && snap.date === today && Array.isArray(snap.brands)
      ? snap.brands.filter(a => a && a.act && ((+a.old_review || 0) > 0 || (+a.discord || 0) > 0 || (Array.isArray(a.rebook) && a.rebook.length))) : [];
    if (!live.length && !asks.length) return { brands: [], team: {}, asks: [] };
    const name = id => (brands.find(b => b.act_id === id) || {}).name || id;
    const team = await teamOf(env, [...new Set([...live.map(r => r.act_id), ...asks.map(a => a.act)])]).catch(() => ({}));
    return { brands: live.map(r => ({ act: r.act_id, name: name(r.act_id), review: +r.review || 0, queue: +r.queue || 0 })), team,
      asks: asks.map(a => ({ act: a.act, name: name(a.act) || a.name, old_review: +a.old_review || 0, discord: +a.discord || 0, rebook: (a.rebook || []).map(c => clean(c && c.name, 60)).filter(Boolean) })) };
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
  /* a step owner stored as two names ("A + B", "A and B", "A, B") reaches each of them */
  const meAny = who => !!who && String(who).split(/\s*(?:\+|&|,|\band\b)\s*/i).some(w => me(w.trim()));

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
  if (mp && L.weekPlanOn !== false && mp.date === today && Array.isArray(mp.brands)) {
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
      if (!(meAny(e.who) || (owner && !e.who))) continue;
      const when = e.start === tomorrow ? 'tomorrow' : dayLabel(e.start);
      out.push({ id: `date:${e.id || e.event}:${e.start}:${clean(e.who, 30)}`, source: 'dates', bucket: e.start === tomorrow ? 'today' : 'week',
        text: `${noDash(clean(e.event, 80))} goes live ${when}: ${many(e.steps.length, 'step')} open`, detail: noDash(e.steps.join(', ')) + '.',
        from: 'Calendar', brand: noDash(e.brand || ''), act_id: e.act || '', due: e.start, v5: V5.calendar, link: v5Link(V5.calendar), btn_label: 'Open the calendar', done: false });
    }
  }

  /* a57: changes asked on a card I make, or a comment that tags me, not answered yet */
  if (Array.isArray(L.comments) && L.comments.length) {
    const name = String(person.name || '').toLowerCase();
    const tag = name ? new RegExp(`@${reEsc(name)}(?![a-z])`, 'i') : null;
    const mine = cm => isPerson(cm.author_name, person.name) || (!!person.email && String(cm.author_email || '').toLowerCase() === person.email);
    const tagFrom = tkey(addDays(today, -7));                               // a plain tag is a nudge for a week, not a fortnight
    const last = {};
    for (const cm of L.comments) if (mine(cm) && tkey(cm.created_at) > (last[cm.batch_id] || '')) last[cm.batch_id] = tkey(cm.created_at);
    const open = new Map();
    for (const cm of L.comments) {
      if (mine(cm)) continue;
      const at = tkey(cm.created_at);
      if (last[cm.batch_id] && last[cm.batch_id] > at) continue;            // I answered on the card after it
      let why = null;
      const stage = String(cm.board_stage || '');
      if (cm.kind === 'change_request' && isPerson(cm.assignee_name, person.name)) {
        const moved = !!stage && !['brief', 'making'].includes(stage);       // left Making: review, ready, scheduled, live, off, done
        const newer = (L.versions || {})[cm.batch_id] && tkey(L.versions[cm.batch_id]) > at;
        if (!moved && !newer) why = 'changes';
      } else if (tag && at >= tagFrom && !['live', 'off', 'done'].includes(stage) && tag.test(String(cm.body || ''))) why = 'tag';
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
        ...(list.length === 1 ? { link: `${LOCUS}?open=production&card=${encodeURIComponent(one.id)}`, btn_label: 'Open card' } : { v5: V5.production, link: v5Link(V5.production), btn_label: 'Open the pipeline' }), done: false });
    }
  }

  if (owner) {
    /* a59: a new client still waiting on its Meta ad account */
    const nc = L.newClients;
    if (nc && Array.isArray(nc.waiting) && nc.waiting.length) {
      const free = nc.waiting.filter(w => !w.blocked), blocked = nc.waiting.filter(w => w.blocked);
      if (nc.untracked > 0 && free.length) out.push({ id: `newmeta:match:${today}`, source: 'newmeta', bucket: 'today',
        text: `${many(nc.untracked, 'new Meta ad account')} to match to a client`, detail: `Waiting on their ad account: ${listOf(free.map(w => noDash(w.name)))}.`,
        from: 'New client', brand: '', act_id: '', due: '', v5: V5.newClient, link: v5Link(V5.newClient), btn_label: 'Match it', done: false });
      if (blocked.length) out.push({ id: `newmeta:access:${today}`, source: 'newmeta', bucket: 'today',
        text: `Give Locus access to ${many(blocked.length, 'new client ad account')}`, detail: `Add the Mobius Tools system user in Business Settings for ${listOf(blocked.map(w => noDash(w.name)))}.`,
        from: 'New client', brand: '', act_id: '', due: '', v5: V5.newClient, link: v5Link(V5.newClient), btn_label: 'Open', done: false });
    }
    /* a58: a client invited us and only we can finish it */
    if (Array.isArray(L.connect) && L.connect.length) {
      const a = L.connect;
      out.push({ id: `connect:${today}`, source: 'connect', bucket: 'today', text: `${many(a.length, 'client connect ask')} waiting on you`,
        detail: a.slice(0, 5).map(x => `${x.label} for ${noDash(x.name || x.act)}: ${x.how}`).join('; ') + (a.length > 5 ? `; and ${a.length - 5} more` : '') + '.',
        from: 'Connect link', brand: a.length === 1 ? noDash(a[0].name || '') : '', act_id: a.length === 1 ? a[0].act : '', due: '', v5: V5.integrations, link: v5Link(V5.integrations), btn_label: 'Open Integrations', done: false });
    }
  }

  /* a45: creator videos waiting, to the brand's buyer (load) and reviewer (review); the agency switch decides */
  const cr = L.creators;
  if (cr && Array.isArray(cr.brands)) {
    const load = cr.brands.filter(b => b.queue > 0 && me(laneOwner('MEDIA BUYING', (cr.team || {})[b.act])));
    const review = cr.brands.filter(b => b.review > 0 && me(laneOwner('CREATORS', (cr.team || {})[b.act])));
    const sum = (xs, k) => xs.reduce((n, b) => n + b[k], 0);
    /* the asks snapshot, all for the reviewer (the CREATORS lane: review, Discord and rebooking, as the post tagged) */
    const asks = (cr.asks || []).filter(a => me(laneOwner('CREATORS', (cr.team || {})[a.act])));
    const oldOf = act => (asks.find(a => a.act === act) || {}).old_review || 0;
    if (load.length) out.push({ id: `creators:load:${today}`, source: 'creators', bucket: 'today', text: `${many(sum(load, 'queue'), 'approved creator video')} to load`,
      detail: load.map(b => `${noDash(b.name)} ${b.queue}`).join(', ') + '.', from: 'Creators', brand: load.length === 1 ? noDash(load[0].name) : '', act_id: load.length === 1 ? load[0].act : '', due: '',
      v5: V5.creatorsLoad, link: v5Link(V5.creatorsLoad), btn_label: 'Open Creators', done: false });
    if (review.length) {
      const old = review.reduce((n, b) => n + oldOf(b.act), 0);
      out.push({ id: `creators:review:${today}`, source: 'creators', bucket: 'today', text: `${many(sum(review, 'review'), 'creator video')} to review`,
        detail: review.map(b => `${noDash(b.name)} ${b.review}`).join(', ') + '.' + (old ? ` ${many(old, 'video')} waiting 2 days or more.` : ''), from: 'Creators', brand: review.length === 1 ? noDash(review[0].name) : '', act_id: review.length === 1 ? review[0].act : '', due: '',
        v5: V5.creatorsReview, link: v5Link(V5.creatorsReview), btn_label: 'Review', done: false });
    }
    const dc = asks.filter(a => a.discord > 0);
    if (dc.length) out.push({ id: `creators:discord:${today}`, source: 'creators', bucket: 'today', text: `Answer ${many(sum(dc, 'discord'), 'creator')} waiting in Discord`,
      detail: dc.map(a => `${noDash(a.name)} ${a.discord}`).join(', ') + '. Counted this morning.', from: 'Creators', brand: dc.length === 1 ? noDash(dc[0].name) : '', act_id: dc.length === 1 ? dc[0].act : '', due: '',
      v5: V5.creatorsReview, link: v5Link(V5.creatorsReview), btn_label: 'Open Creators', done: false });
    const rb = asks.filter(a => a.rebook.length);
    if (rb.length) out.push({ id: `creators:rebook:${today}`, source: 'creators', bucket: 'today', text: `Rebook ${many(rb.reduce((n, a) => n + a.rebook.length, 0), 'creator')} this week`,
      detail: rb.map(a => `${noDash(a.name)}: ${listOf(a.rebook.map(noDash))}`).join('; ') + '. Their ads beat the account cost per sale and they have gone quiet.', from: 'Creators', brand: rb.length === 1 ? noDash(rb[0].name) : '', act_id: rb.length === 1 ? rb[0].act : '', due: '',
      v5: V5.creatorsReview, link: v5Link(V5.creatorsReview), btn_label: 'Open Creators', done: false });
  }
  return out;
}

/* ---------- the snapshots the ticks leave for these lines ---------- */
/** worker.js discoverAccounts: add the accounts new at this discovery ([{ act_id, name }]) to settings newMetaFresh,
 *  dropping entries older than NEW_META_DAYS. Writes only when something changes. */
export async function keepNewMeta(env, fresh = [], at = new Date().toISOString()) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(NEW_META_KEY).first().catch(() => null);
  const old = safe(row && row.value, []) || [];
  const cut = new Date(Date.parse(at) - NEW_META_DAYS * 864e5).toISOString();
  const keep = (Array.isArray(old) ? old : []).filter(f => f && f.act && String(f.at || '') >= cut);
  const have = new Set(keep.map(f => f.act));
  for (const f of fresh || []) if (f && f.act_id && !have.has(f.act_id)) { keep.push({ act: f.act_id, name: clean(f.name, 80), at }); have.add(f.act_id); }
  if (JSON.stringify(keep) === JSON.stringify(old)) return keep;
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(NEW_META_KEY, JSON.stringify(keep)).run();
  return keep;
}

/** calendar.js: the countdown snapshot is redone each hour after the 8am pass while it still lists open steps (so a
 *  step done at 10am leaves the line within the hour), and whenever it is missing or from another day. Pure. */
export function countdownStale(snap, today) {
  if (!snap || typeof snap !== 'object' || snap.date !== today) return true;
  return Array.isArray(snap.items) && snap.items.length > 0;
}
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
