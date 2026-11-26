/* Quiet jobs and agency feature switches (2026-11-26, Cole: "Locus is the workplace; Slack is for talking").
 *
 * A job in QUIET_JOBS is a team Slack post nobody reads any more. It is NOT deleted: it goes quiet behind
 * settings `jobOn:<id>`. Only the exact value 'on' runs it; a missing key (the default) keeps it quiet. Every older
 * switch a job already had (fyiRoundup, callNudge, smokeQuiet, todayPost ...) is still honored: both must allow.
 * Bookkeeping that is not a Slack post (stamps, state, stored lines, auto finish) keeps running.
 *
 * Feature switches (settings `feature:<name>` = 'on' | 'off'):
 *   creatorProgram  Trybe, creator suggestions and Discord posts. Missing = derived: on when this workspace already
 *                   has creator data (a brand with a Trybe key, or any creatorEngine:* setting), off on an empty one.
 *   socialPosting   Locus Social posting. Missing = off (parked: Mobius does not offer it).
 * And one read only fact for the menus: siteReviewsOpen, any site review link still open or sent in the last 30 days.
 *
 * Money warnings and client sends are NOT in this list (they keep their Slack posts until Dec 5). */

export const QUIET_JOBS = [
  { id: 'fyiRoundup', name: 'End of day FYI roundup', was: 'One post per brand at 4pm with what nobody has to act on', instead: 'Nothing: FYI lines are still stored' },
  { id: 'mondayBriefing', name: 'Monday Strategist briefing', was: 'A Monday morning written briefing', instead: 'Nothing needed' },
  { id: 'meetingFinishedDm', name: 'Meetings finished or left open', was: 'A DM when Locus finished a call at noon, or one was left open', instead: 'The Calls page shows which calls are finished' },
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
];
const JOB_IDS = new Set(QUIET_JOBS.map(j => j.id));
export const FEATURES = ['creatorProgram', 'socialPosting'];

/** A settings read straight from D1 (the raw stored text). */
export async function directGet(env, key) {
  const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
  return r ? r.value ?? null : null;
}
/** 'on' whether the getter hands back the raw text or a parsed value. */
const isWord = (v, w) => v != null && String(v).trim().replace(/^"|"$/g, '').toLowerCase() === w;

/** Is a quiet job switched back on? True only for settings `jobOn:<id>` = 'on'. */
export async function jobOn(env, id, get = directGet) {
  const v = await Promise.resolve().then(() => get(env, `jobOn:${id}`)).catch(() => null);
  return isWord(v, 'on');
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
async function hasCreatorData(env) {
  const keyed = await env.DB.prepare(`SELECT act_id FROM p_br_doc WHERE line_id = '' AND key = 'trybe' LIMIT 1`).first().catch(() => null);
  if (keyed) return true;
  const eng = await env.DB.prepare(`SELECT key FROM settings WHERE key LIKE 'creatorEngine:%' LIMIT 1`).first().catch(() => null);
  return !!eng;
}

/** Is an agency feature on? creatorProgram derives from the data when unset; socialPosting is off when unset. */
export async function featureOn(env, name, get = directGet) {
  const v = await Promise.resolve().then(() => get(env, `feature:${name}`)).catch(() => null);
  if (isWord(v, 'on')) return true;
  if (isWord(v, 'off')) return false;
  if (name === 'creatorProgram') return cached('creatorProgram', () => hasCreatorData(env));
  return false;
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

/** The quiet jobs with their current switch, for GET /api/settings. */
export async function jobsView(env, get = directGet) {
  const out = [];
  for (const j of QUIET_JOBS) out.push({ ...j, on: await jobOn(env, j.id, get) });
  return out;
}
