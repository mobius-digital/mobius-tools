/* WHO SENDS IT (2026-11-26). One setting decides, per kind of message, whether it comes from Locus (the Slack app's
 * bot, the app mailbox) or from the owner (Cole: his Slack user token, his own mailbox).
 *
 * Stored in settings.senders = {"all": "cole"|"locus"|null, "kinds": {kind: "cole"|"locus"}}. A kind's value wins,
 * then "all", then the kind's default. The defaults are today's senders exactly, so nothing changes until someone
 * flips a pill on Agency settings > Sending and notifications. One kind's default differs on paper: login_email
 * defaults to Locus, but there is no Locus mailbox yet (LOCUS_MAIL_FROM unset), so it still resolves to Cole.
 *
 * Locked kinds always come from Locus, whatever is stored:
 *   approval_ask      most go to Cole's own DM (a DM from Cole to Cole never notifies him), and their cards are
 *                     rewritten in place with the bot token, which cannot edit a user token message.
 *   strategist_reply  an answer Cole did not write must not carry his name.
 *   creator_discord   Discord has no "as a person" token.
 *   internal_alert, team_notice   no send path passes these kinds yet, so a switch would change nothing.
 *
 * Rules: an unknown kind is Locus (never Cole by accident). A kind set to Cole with no SLACK_USER_TOKEN throws; it
 * never quietly posts as the bot. An email kind set to Locus while LOCUS_MAIL_FROM is unset resolves to Cole and
 * says so (fallback: true). */

export const SENDER_KINDS = {
  client_checkin:   { def: 'cole',  label: 'Client check-in updates' },
  client_daily:     { def: 'cole',  label: 'Client daily' },
  client_report:    { def: 'cole',  label: 'Weekly and monthly reports' },
  client_update:    { def: 'cole',  label: '"What we did" updates' },
  client_recap:     { def: 'cole',  label: 'Call recaps' },
  client_outage:    { def: 'locus', label: 'Platform outage notes to clients' },
  client_post:      { def: 'locus', label: 'Strategist posts in a client channel' },
  onboarding_slack: { def: 'cole',  label: 'Onboarding in Slack (welcome, Shopify note)' },
  onboarding_email: { def: 'cole',  label: 'Onboarding emails (welcome, agreement, reminders)', email: true },
  login_email:      { def: 'locus', label: 'Sign in links and client login invites', email: true },
  /* Locked until the team alert and notice paths pass these kinds (none does yet), so the page never shows a switch
     that changes nothing. */
  internal_alert:   { def: 'locus', label: 'Alerts to the team', locked: true,
    why: 'This one always comes from Locus for now: the team alerts do not read this setting yet.' },
  team_notice:      { def: 'locus', label: 'Team notices', locked: true,
    why: 'This one always comes from Locus for now: the team alerts do not read this setting yet.' },
  approval_ask:     { def: 'locus', label: 'Approval asks (drafts, War Room, batches)', locked: true,
    why: 'Most go to your own DM, and a DM from you to you never notifies you. Their cards are also rewritten in place, which only works for the app.' },
  strategist_reply: { def: 'locus', label: 'Strategist answers in threads', locked: true,
    why: 'An answer you did not write must not carry your name.' },
  creator_discord:  { def: 'locus', label: 'Creator Discord posts', locked: true,
    why: 'Discord has no way to post as a person.' },
};
export const SENDER_VALUES = ['cole', 'locus'];
export const APP_NAME = 'Locus';
const ICON = 'https://tools.go-mobius-digital.com/favicon.png';
const NO_MAILBOX = 'Locus email is not set up yet, so these still come from you.';

const okWho = v => (SENDER_VALUES.includes(v) ? v : null);

/** Clean a stored or posted value: known kinds only, the two values only, locked kinds dropped, email kinds set to
 *  'locus' dropped while there is no Locus mailbox. `mailbox` = the LOCUS_MAIL_FROM value (or anything truthy). */
export function sendersOf(raw, { mailbox = null } = {}) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const src = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const kinds = {};
  const inK = src.kinds && typeof src.kinds === 'object' && !Array.isArray(src.kinds) ? src.kinds : {};
  for (const [k, val] of Object.entries(inK)) {
    const def = SENDER_KINDS[k];
    const w = okWho(val);
    if (!def || !w || def.locked) continue;
    if (def.email && w === 'locus' && !mailbox) continue;
    kinds[k] = w;
  }
  return { all: okWho(src.all), kinds };
}

/** The top switch: one tap sets every kind, so the per kind values are cleared. */
export function setAll(obj, who) { return { all: okWho(who), kinds: {} }; }
/** One pill: only that kind changes. */
export function setKind(obj, kind, who) {
  const s = sendersOf(obj, { mailbox: true });
  const kinds = { ...s.kinds };
  if (okWho(who) && SENDER_KINDS[kind] && !SENDER_KINDS[kind].locked) kinds[kind] = who;
  return { all: s.all, kinds };
}

/** Every kind with its resolved value, for GET /api/settings and the page. `stored` = settings.senders (raw or object). */
export function resolveSenders(stored, env = {}) {
  const mailbox = env && env.LOCUS_MAIL_FROM ? String(env.LOCUS_MAIL_FROM) : null;
  const s = sendersOf(stored, { mailbox: true });
  const out = {};
  for (const [k, def] of Object.entries(SENDER_KINDS)) {
    let who = def.locked ? 'locus' : (s.kinds[k] || s.all || def.def);
    let fallback = false;
    if (def.email && who === 'locus' && !mailbox) { who = 'cole'; fallback = true; }
    out[k] = { who, def: def.def, label: def.label, locked: !!def.locked, email: !!def.email, fallback,
      ...(def.locked ? { why: def.why } : fallback ? { why: NO_MAILBOX } : {}) };
  }
  return { all: s.all, kinds: s.kinds, resolved: out, mailbox: !!mailbox };
}

/* A small cache so a burst of posts in one request reads the setting once. Keyed by the env object, kept 15 seconds;
   PUT /api/settings clears it (clearSenderCache) so a change shows on the next post. */
const CACHE = new WeakMap();
const TTL = 15000;
export function clearSenderCache(env) { if (env && typeof env === 'object') CACHE.delete(env); }
async function storedSenders(env) {
  const hit = env && typeof env === 'object' ? CACHE.get(env) : null;
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  let v = null;
  try { v = env && env.DB ? (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind('senders').first())?.value ?? null : null; } catch { v = null; }
  if (env && typeof env === 'object') CACHE.set(env, { at: Date.now(), v });
  return v;
}

/** Who sends this kind, with what. Throws when a Slack kind resolves to Cole and there is no SLACK_USER_TOKEN.
 *  -> { kind, who, locked, fallback, slack: {token, asUser, username?, icon_url?} | null, mail: {subject, fromName, signature} | null } */
export async function senderFor(env, kind) {
  const def = SENDER_KINDS[kind];
  if (!def) return { kind, who: 'locus', locked: false, fallback: false, slack: botSlack(env), mail: null };
  const r = resolveSenders(await storedSenders(env), env).resolved[kind];
  if (def.email) {
    const mail = r.who === 'locus'
      ? { subject: String(env.LOCUS_MAIL_FROM), fromName: APP_NAME, signature: false }
      : { subject: null, fromName: null, signature: true };   // null = mail.js's owner mailbox and signature, as today
    return { kind, who: r.who, locked: r.locked, fallback: r.fallback, slack: null, mail };
  }
  if (r.who === 'cole') {
    if (!env || !env.SLACK_USER_TOKEN) throw new Error('No Slack user token is set, so this cannot be sent as you rather than as the app. Add SLACK_USER_TOKEN in Cloudflare, or set this message to come from Locus in Agency settings > Sending and notifications.');
    return { kind, who: 'cole', locked: false, fallback: false, slack: { token: env.SLACK_USER_TOKEN, asUser: true }, mail: null };
  }
  return { kind, who: 'locus', locked: r.locked, fallback: false, slack: botSlack(env), mail: null };
}
const botSlack = env => ({ token: env ? env.SLACK_BOT_TOKEN : undefined, asUser: false, username: APP_NAME, icon_url: ICON });

/** The token for a kind, or null when it cannot be had (for code that quietly skips Slack when there is no token,
 *  as the onboarding posts do today). */
export async function senderToken(env, kind) {
  try { const s = await senderFor(env, kind); return (s.slack && s.slack.token) || null; } catch { return null; }
}

/** For code that reads env.SLACK_USER_TOKEN itself (the protected standing.js): Locus = the same env with the bot
 *  token in that slot; Cole = env as is. */
export function envFor(env, who) {
  if (who !== 'locus' || !env) return env;
  return { ...env, SLACK_USER_TOKEN: env.SLACK_BOT_TOKEN };
}

/** chat.postMessage with a resolved sender: the user token posts plainly; the bot adds the app name and icon unless the
 *  caller gave its own. Returns Slack's parsed answer (never throws for a Slack error). */
export async function postAs(sender, body, F = (...a) => fetch(...a)) {
  const s = (sender && sender.slack) || {};
  if (!s.token) return { ok: false, error: 'no_token' };
  const payload = s.asUser ? body : { username: s.username, icon_url: s.icon_url, ...body };
  return F('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) })
    .then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
}

/** The name behind SLACK_USER_TOKEN for the page ("Cole"), read once from Slack and cached in settings. */
export async function senderPerson(env, { F = (...a) => fetch(...a), getSetting, putSetting } = {}) {
  const cached = getSetting ? await getSetting(env, 'senderPerson').catch(() => null) : null;
  if (cached) return cached;
  if (!env || !env.SLACK_USER_TOKEN) return null;
  const a = await F('https://slack.com/api/auth.test', { headers: { Authorization: `Bearer ${env.SLACK_USER_TOKEN}` } }).then(r => r.json()).catch(() => ({}));
  if (!a || !a.ok || !a.user_id) return null;
  const u = await F(`https://slack.com/api/users.info?user=${encodeURIComponent(a.user_id)}`, { headers: { Authorization: `Bearer ${env.SLACK_USER_TOKEN}` } }).then(r => r.json()).catch(() => ({}));
  const p = (u && u.user && (u.user.profile?.first_name || u.user.real_name || u.user.name)) || a.user || null;
  const first = p ? String(p).split(' ')[0] : null;
  if (first && putSetting) await putSetting(env, 'senderPerson', first).catch(() => {});
  return first;
}

/* ---------------- slackPost (moved here from worker.js unchanged, plus opts.kind) ----------------
   worker.js keeps a one line slackPost that calls this with its xfetch, so the behavior can be tested offline.
   opts.kind (a SENDER_KINDS key) decides asUser and the name override; opts.asUser alone keeps working for old callers. */
export async function slackPostWith(env, xfetch, channel, text, blocks, opts = {}) {
  if (opts.kind) {
    const s = await senderFor(env, opts.kind);
    const { kind, ...rest } = opts;
    opts = s.who === 'cole' ? { ...rest, asUser: true } : { ...rest, asUser: false, username: rest.username || 'Locus' };
  }
  const asUser = !!opts.asUser;
  const token = asUser ? env.SLACK_USER_TOKEN : env.SLACK_BOT_TOKEN;
  if (asUser && !token) {
    throw new Error('No Slack user token is set, so this cannot be sent as you rather than as the bot. Add SLACK_USER_TOKEN in Cloudflare, or post it from Slack by hand.');
  }
  const send = payload => xfetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json().catch(() => ({})));
  /* thread_ts: a reply (the morning card's thread, morningcard.js teamPost). Never reply_broadcast. */
  /* opts.attachments: a house style message with a status bar (house.js) puts its blocks in one colored attachment. */
  const base = { channel, text, ...(blocks ? { blocks } : {}), ...(opts.attachments ? { attachments: opts.attachments } : {}), ...(opts.thread_ts ? { thread_ts: opts.thread_ts } : {}) };
  if (asUser) {
    // A user token posts AS that user; overriding name or avatar is neither
    // possible nor wanted, so the identity fields are bot-only.
    const j = await send(base);
    if (!j.ok) {
      const hint = j.error === 'not_in_channel' ? ' - you are not a member of that channel. Join it in Slack and send again.'
        : (j.error === 'invalid_auth' || j.error === 'token_revoked') ? ' - the Slack user token is no longer valid and needs regenerating.'
        : j.error === 'missing_scope' ? ' - the Slack user token is missing the chat:write scope.'
        : '';
      throw new Error(`Slack: ${j.error || 'unknown error'}${hint}`);
    }
    // The caller gets {ts, channel} so an interactive card can be rewritten in
    // place later instead of a second message piling up underneath it.
    return { ts: j.ts, channel: j.channel };
  }
  /* Locus's own notes carry the Mobius mark, not the old chart emoji. */
  const face = opts.username === 'Locus' ? { icon_url: ICON } : { icon_emoji: opts.icon || ':bar_chart:' };
  let j = await send({ ...base, username: opts.username || 'Locus', ...face });
  if (!j.ok && /missing_scope|invalid_arg/i.test(j.error || '')) j = await send(base);
  if (!j.ok && j.error === 'not_in_channel') {
    /* A channel the bot was never added to (the agency #daily-briefs channel, 2026-10-12): join it once and
       send again. Public channels only; a private one still needs /invite in Slack, and the error says so. */
    const jr = await xfetch('https://slack.com/api/conversations.join', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    }).then(r => r.json().catch(() => ({}))).catch(() => ({}));
    /* THE JOIN FAILED FOR #daily-briefs (found 2026-10-13): the bot lacks channels:join, so every daily draft fell back
       to its brand's internal channel. Cole's own token (SLACK_USER_TOKEN, a member of the channel) can invite the
       bot instead, the same way newclient.js invites it into channels Cole made. */
    let inv = null;
    if (!jr.ok && env.SLACK_USER_TOKEN) {
      const call = (m, b) => xfetch(`https://slack.com/api/${m}`, { method: 'POST', headers: { 'Authorization': `Bearer ${env.SLACK_USER_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json().catch(() => ({}))).catch(() => ({}));
      const me = await xfetch('https://slack.com/api/auth.test', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json().catch(() => ({}))).catch(() => ({}));
      if (me.user_id) inv = await call('conversations.invite', { channel, users: me.user_id });
    }
    if (jr.ok || inv?.ok || inv?.error === 'already_in_channel') j = await send({ ...base, username: opts.username || 'Mobius Account Health', ...face });
    else j.error = `not_in_channel - add the Locus app to that channel in Slack (/invite @Locus)${jr.error ? `; join failed: ${jr.error}` : ''}${inv?.error ? `; invite as Cole failed: ${inv.error}` : ''}`;
  }
  if (!j.ok) throw new Error(`Slack: ${j.error || 'unknown error'}`);
  return { ts: j.ts, channel: j.channel };
}

/** buyerDeps' slackPost (the protected buyerlist.js posts its "what we did" with asUser): that one post becomes the
 *  client_update kind; every other post passes through untouched. */
export const buyerSlackPost = slackPost => (e, c, t, b, o) => slackPost(e, c, t, b, o && o.asUser ? { ...o, kind: 'client_update' } : o);
