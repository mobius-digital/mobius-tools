/* Quiet jobs and agency feature switches (2026-11-26, Cole: "Locus is the workplace; Slack is for talking").
 *
 * A job in QUIET_JOBS is a team Slack post that can go quiet. It is NOT deleted: it sits behind settings
 * `jobOn:<id>`. KEEP EVERYTHING ON UNTIL DEC 2 (round 21 research, review notes: nothing is switched off or deleted
 * before Dec 2, Dartee jobs Dec 5): the default of every job is what it does live today, so a deploy changes no post.
 * Only the exact value 'off' quiets a job; a missing key (the default), 'on' or anything else runs it as before. The
 * owner switches one off from Agency settings. Every older switch a job already had (fyiRoundup, callNudge,
 * smokeQuiet, todayPost ...) is still honored: both must allow, so a job that is already off by its own switch stays off.
 * Bookkeeping that is not a Slack post (stamps, state, stored lines, auto finish) keeps running either way.
 *
 * Feature switches (settings `feature:<name>` = 'on' | 'off'):
 *   creatorProgram  Trybe, creator suggestions and Discord posts. Missing = derived: on when this workspace already
 *                   has creator data (a brand with a Trybe key, or any creatorEngine:* setting), off on an empty one.
 *   socialPosting   Locus Social. Missing = on, as it runs today (its ticks check their own brands); 'off' parks it.
 *   weekPlan        The Monday "write this week's plan" line (a54, 2026-11-26): the strategist's My day row and the
 *                   Monday agenda row (GET /api/mywork/weekplan). Missing = on (Mobius runs it); 'off' hides both.
 *                   Set with PUT /api/settings { features: { weekPlan: false } }. Not in featuresNow (GET /api/notices
 *                   is ported by the engine, so its answer is left as it was).
 * And one read only fact for the menus: siteReviewsOpen, any site review link still open or sent in the last 30 days.
 *
 * Money warnings and client sends are NOT in this list (they keep their Slack posts until Dec 5), with two exceptions
 * that carry hold: 'Dec 5' (outagePost, unsentNoonPost): their switch exists so the Dec 5 flip is one setting, and the
 * page says not before Dec 5.
 *
 * MOVE LINES (2026-11-26, movelines.js): the ten ids after autoApprove are the Slack posts whose Locus line now lives on
 * My day or the bell. Each runs exactly as today until its jobOn:<id> is 'off' (Dec 2, or Dec 5 for hold). */

export const QUIET_JOBS = [
  { id: 'fyiRoundup', name: 'End of day FYI roundup', was: 'One post per brand at 4pm with what nobody has to act on', instead: 'Nothing: FYI lines are still stored' },
  { id: 'mondayBriefing', name: 'Monday Strategist briefing', was: 'A Monday morning written briefing', instead: 'Nothing needed' },
  { id: 'meetingFinishedDm', name: 'Meetings finished at noon', was: 'A DM when Locus finished a call at noon (a call it could not finish still DMs)', instead: 'The Calls page shows which calls are finished' },
  { id: 'meetingNotesConfirm', name: 'Call notes to confirm', was: 'A post per call with notes to confirm', instead: 'Nothing needed' },
  { id: 'taskReminders', name: 'Task reminders', was: 'Reminders with Done buttons when a task is due or late', instead: 'The bell tasks row and My day' },
  { id: 'reviewPost', name: 'Card moved to Review', was: 'A post with the ads and Approve all when a card moves to Review', instead: 'The bell review row' },
  { id: 'smokePost', name: 'Morning self check failures', was: 'A post when the morning self check found a failure', instead: 'Agency > Status' },
  { id: 'leakLine', name: 'Leak line on the morning card', was: 'A line on the morning card when a new leak appeared', instead: 'The leaks list on the brand Overview' },
  { id: 'trybeRecutPost', name: 'Creator recut cards made', was: 'A post tagging the editor when recut cards were made', instead: "The editor's My day (the cards are assigned)" },
  { id: 'dashboardsSlack', name: 'Saved dashboards to Slack', was: 'Scheduled dashboard posts', instead: 'The dashboard pages (a dashboard that already has a schedule and a channel keeps posting)' },
  { id: 'jobErrorsPost', name: 'Job errors', was: 'A post when an automatic job had errors', instead: 'Agency > Status' },
  { id: 'todayPost', name: "Today's calls post", was: "Today's calls in each brand channel", instead: 'Meta > Suggestions' },
  { id: 'movedPost', name: 'What moved yesterday', was: 'A post on a bad day', instead: 'Nothing needed' },
  { id: 'morningLineDm', name: 'Morning line DM', was: 'The morning line as a Slack DM', instead: 'My day' },
  { id: 'askSchedules', name: 'Scheduled Strategist questions', was: 'Scheduled questions answered in Slack', instead: 'Nothing needed' },
  { id: 'mondayReview', name: 'Monday account review', was: 'A Monday review with Apply cards per brand', instead: 'Meta > Suggestions and the media buying call' },
  { id: 'mondayTestPost', name: 'Monday test post', was: 'The scheduled Monday test post per brand', instead: 'Nothing needed' },
  { id: 'autoApprove', name: 'Review auto approve', was: 'Approve a review after 24 hours with no answer', instead: 'Nothing needed' },
  { id: 'noPlanDm', name: 'No plan yet DM', was: 'A DM four hours in to anyone with no plan for today', instead: 'The top line of their My day' },
  { id: 'mondayPlansPost', name: 'Monday brands with no plan', was: 'A Monday 7am post tagging the strategists for brands with no week plan', instead: "The strategist's My day line on Mondays" },
  { id: 'calendarCountdown', name: 'Calendar countdown', was: 'Live tomorrow and a week out lines for steps still open', instead: "The step owner's My day line" },
  { id: 'cardCommentDm', name: 'Card comments and changes asked', was: 'A DM to the person tagged or the card maker, and the client changes line in the brand channel', instead: "The maker's My day line" },
  { id: 'requestPost', name: 'Client request line', was: 'A line in the brand channel when a client writes a request or replies', instead: 'The bell client requests row' },
  { id: 'connectAskPost', name: 'Client connect asks', was: 'A line when a client invited us or a Google request failed', instead: "The owner's My day line" },
  { id: 'newAccountPost', name: 'New ad account to match', was: 'A post in the new business channel for a new ad account, and the system user ask', instead: "The owner's My day line until it is matched" },
  { id: 'trybePost', name: 'Creator videos post', was: 'A morning post per brand with creator videos to review or load', instead: "The buyer's and reviewer's My day lines" },
  { id: 'outagePost', name: 'Outage card', was: 'A card in the outages channel when a platform goes down or comes back', instead: "The owner's outage alert in the bell", hold: 'Dec 5' },
  { id: 'unsentNoonPost', name: 'Client updates not sent by noon', was: 'A noon post with the unsent client updates as cards', instead: 'The bell client updates row and To send', hold: 'Dec 5' },
];
const JOB_IDS = new Set(QUIET_JOBS.map(j => j.id));
export const FEATURES = ['creatorProgram', 'socialPosting', 'weekPlan'];

/** A settings read straight from D1 (the raw stored text). */
export async function directGet(env, key) {
  const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
  return r ? r.value ?? null : null;
}
/** 'on' whether the getter hands back the raw text or a parsed value. */
const isWord = (v, w) => v != null && String(v).trim().replace(/^"|"$/g, '').toLowerCase() === w;

/** Does this job run? True (today's behavior) unless the owner saved settings `jobOn:<id>` = 'off'. A failed read
 *  runs it too: a database hiccup must never silence a post that runs today. */
export async function jobOn(env, id, get = directGet) {
  const v = await Promise.resolve().then(() => get(env, `jobOn:${id}`)).catch(() => null);
  return !isWord(v, 'off');
}

/** The jobs part of a PUT body, known ids only, as booleans. Owner only: anyone else gets null (refused). */
export function cleanJobs(body, isOwner) {
  if (!isOwner) return null;
  const out = {};
  const src = body && typeof body === 'object' ? body : {};
  for (const [k, v] of Object.entries(src)) if (JOB_IDS.has(k)) out[k] = v === true || isWord(v, 'on') || isWord(v, 'true');
  return out;
}
/** The features part of a PUT body: known names only, as booleans. */
export function cleanFeatures(body) {
  const out = {};
  const src = body && typeof body === 'object' ? body : {};
  for (const k of FEATURES) if (k in src) out[k] = src[k] === true || isWord(src[k], 'on') || isWord(src[k], 'true');
  return out;
}

/* ---- the derived switches, cached in memory 5 minutes ---- */
const CACHE_MS = 5 * 60e3;
let cache = {};
export function _resetFlags() { cache = {}; }
async function cached(key, fn) {
  const c = cache[key];
  if (c && Date.now() - c.at < CACHE_MS) return c.v;
  const v = await fn();
  cache[key] = { at: Date.now(), v };
  return v;
}
/** Does this workspace already run a creator program? Same read as trybe.js keyedBrands, plus the engine's keys. */
/* A failed read throws (and is not cached), so featureOn answers true and the creator jobs stay ON, like jobOn:
   one D1 hiccup must not switch the Trybe pull, the engine and the Discord posts off for five minutes. A missing table
   is a real "no data" (a workspace that never ran creators) and reads as false. */
async function hasCreatorData(env) {
  const read = sql => env.DB.prepare(sql).first().catch(e => { if (/no such table/i.test(String(e && e.message))) return null; throw e; });
  if (await read(`SELECT act_id FROM p_br_doc WHERE line_id = '' AND key = 'trybe' LIMIT 1`)) return true;
  return !!(await read(`SELECT key FROM settings WHERE key LIKE 'creatorEngine:%' LIMIT 1`));
}

/** Is an agency feature on? creatorProgram derives from the data when unset; socialPosting is on when unset (today). */
export async function featureOn(env, name, get = directGet) {
  const v = await Promise.resolve().then(() => get(env, `feature:${name}`)).catch(() => null);
  if (isWord(v, 'on')) return true;
  if (isWord(v, 'off')) return false;
  if (name === 'creatorProgram') return cached('creatorProgram', () => hasCreatorData(env)).catch(() => true);   // a failed read fails ON, uncached
  return name === 'socialPosting' || name === 'weekPlan';
}
/** Was the creator program switch saved by a person (true), or is it still derived (false)? */
export async function featureSaved(env, name, get = directGet) {
  const v = await Promise.resolve().then(() => get(env, `feature:${name}`)).catch(() => null);
  return isWord(v, 'on') || isWord(v, 'off');
}

/** Any site review link still open, or sent in the last 30 days. A missing table reads as false. */
export async function siteReviewsOpen(env, now = new Date()) {
  return cached('siteReviewsOpen', async () => {
    const since = new Date(now.getTime() - 30 * 864e5).toISOString();
    const r = await env.DB.prepare(`SELECT 1 AS x FROM p_site_review WHERE sent_at IS NULL OR sent_at >= ?1 LIMIT 1`).bind(since).first().catch(() => null);
    return !!r;
  });
}

/** What every signed in person learns from GET /api/notices. */
export async function featuresNow(env, get = directGet) {
  return {
    creatorProgram: await featureOn(env, 'creatorProgram', get),
    socialPosting: await featureOn(env, 'socialPosting', get),
    siteReviewsOpen: await siteReviewsOpen(env),
  };
}

/* ---- the older switches (2026-11-26) ----
   A quiet job's own switch is not the only thing that stops its post: most jobs had a switch before the quiet jobs
   list, and a few are stopped in code. Each entry below is the SAME check the job's own file makes (named beside it),
   answered as a plain reason, or null when that check lets the post run. jobsView uses them so the settings list shows
   what really happens. A failed read answers null (no reason), the same way a job reads a failed setting.
   s(key) hands back the exact stored text, as every one of these jobs reads it (no trim, no quotes stripped, no case
   change), so a hand edited value reads here exactly as the job reads it. */
/** Does any brand have a scheduled Monday test post (asana-brand.js mondayTick: rules doc monday_post > 0)? */
async function anyMondayPost(env) {
  const r = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE line_id = '' AND key = 'rules'`).all()
    .catch(e => { if (/no such table/i.test(String(e && e.message))) return { results: [] }; throw e; });
  return (r.results || []).some(x => { try { return +(JSON.parse(x.data_json || '{}') || {}).monday_post > 0; } catch { return false; } });
}
export const OLDER_SWITCHES = {
  /* lane.js roundupTick */
  fyiRoundup: async s => (await s('fyiRoundup')) === 'off' ? 'The end of day roundup switch is off' : null,
  /* callnudge.js callNudgeTick: the whole tick stops */
  meetingFinishedDm: async s => (await s('callNudge')) === 'off' ? 'Call nudges are switched off' : null,
  /* meetings.js tellReady: posts only when meetingPings is 'on' */
  meetingNotesConfirm: async s => (await s('meetingPings')) !== 'on' ? 'Calls with notes to confirm are counted in the noon line instead' : null,
  /* actions.js actionTick */
  taskReminders: async s => (await s('actionRemind')) === 'off' ? 'Action reminders are switched off' : null,
  /* morningcard.js: the leak line rides on the morning card */
  leakLine: async s => (await s('morningCard')) === 'off' ? 'The morning message is off' : null,
  /* trybe.js trybeRecutAnnounce */
  trybeRecutPost: async (s, env, get) => (await featureOn(env, 'creatorProgram', get)) ? null : 'The creator program is off',
  /* worker.js alertScheduleTrouble: posts only when jobErrorsToSlack is 'on' */
  jobErrorsPost: async s => (await s('jobErrorsToSlack')) !== 'on' ? 'Job errors stay in Agency > Status (job errors to Slack is off)' : null,
  /* todaypost.js todayTick: its own switch, then the morning card (morningcard.js cardOn: on unless 'off') */
  todayPost: async s => (await s('todayPost')) === 'off' ? "Today's calls post is switched off"
    : (await s('morningCard')) !== 'off' ? "Today's calls are on the morning card" : null,
  /* moved.js movedTick: stopped in code since 2026-10-09 */
  movedPost: async () => 'A bad day is in the Daily Brief now',
  /* morning.js morningTick */
  morningLineDm: async s => (await s('morningDm')) === 'off' ? 'The morning line DM is switched off' : null,
  /* review.js reviewTick: runs only when mondayReview is 'on' */
  /* review.js isOn: lower case, no trim */
  mondayReview: async s => String((await s('mondayReview')) || '').toLowerCase() !== 'on' ? 'The Monday review switch is off' : null,
  /* asana-brand.js postMonday: the scheduled post runs only when settings mondayTestPost is 'on' (off since
     2026-11-20), and mondayTick only for brands whose rules set a Monday post */
  mondayTestPost: async (s, env) => (await s('mondayTestPost')) !== 'on' ? 'The scheduled Monday post is switched off'
    : (await anyMondayPost(env)) ? null : 'No brand has a Monday test post set',
  /* checkin.js autoApproveTick: off only on the exact value '0' (clientchan.js writeSwitches saves '0'/'1') */
  autoApprove: async s => (await s('checkinAutoApprove')) === '0' ? 'Auto approve is switched off' : null,
  /* checkin.js checkinTick: the whole tick stops */
  noPlanDm: async s => (await s('checkinPost')) === 'off' ? 'The daily check-in is switched off' : null,
  /* callnudge.js callNudgeTick */
  mondayPlansPost: async s => (await s('callNudge')) === 'off' ? 'Call nudges are switched off' : null,
  /* calendar.js calendarTick */
  calendarCountdown: async s => (await s('calendarPost')) === 'off' ? 'Calendar posts are switched off' : null,
  /* trybe.js trybeTick: posts only when trybeAlerts is 'on' */
  trybePost: async s => (await s('trybeAlerts')) !== 'on' ? 'The creator alerts switch is off' : null,
};

/* A job whose post still goes out with its own quiet switch off: answers the plain reason it still posts, or null.
   jobsView then shows it on (switch_on false), so the list says what really happens. */
export const STILL_POSTS = {
  /* worker.js dashboardTick: switched off it still runs when a dashboard already has a schedule and a channel */
  dashboardsSlack: async env => {
    const r = await env.DB.prepare(`SELECT 1 AS x FROM p_dashboard WHERE schedule IN ('daily','monday','first') AND channel IS NOT NULL AND channel != '' LIMIT 1`).first();
    return r ? 'A dashboard with a schedule and a channel keeps posting' : null;
  },
};

/** Why an older switch keeps this job's post off, or null. */
export async function olderOffReason(env, id, get = directGet) {
  const fn = OLDER_SWITCHES[id];
  if (!fn) return null;
  const s = k => Promise.resolve().then(() => get(env, k)).then(v => v ?? null).catch(() => null);
  return Promise.resolve().then(() => fn(s, env, get)).catch(() => null);
}

/** The quiet jobs for GET /api/settings, with their REAL state so every screen agrees:
 *  switch_on  the job's own quiet switch (what the toggle saves),
 *  on         does the post really go out (its own switch AND every older switch allow it),
 *  off_reason null when on; else a plain reason ('Switched off as a quiet job' for its own switch, or the older switch's),
 *  still_posts set (and on true) when the post still goes out with its own switch off (STILL_POSTS). */
export const OWN_OFF = 'Switched off as a quiet job';
export async function jobsView(env, get = directGet) {
  const out = [];
  for (const j of QUIET_JOBS) {
    const own = await jobOn(env, j.id, get);
    const older = own ? await olderOffReason(env, j.id, get) : null;
    const still = !own && STILL_POSTS[j.id] ? await Promise.resolve().then(() => STILL_POSTS[j.id](env)).catch(() => null) : null;
    if (still) { out.push({ ...j, switch_on: false, on: true, off_reason: null, still_posts: still }); continue; }
    out.push({ ...j, switch_on: own, on: own && !older, off_reason: own ? older : OWN_OFF });
  }
  return out;
}
