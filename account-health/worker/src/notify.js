/* How each person hears about things (2026-11-26, Cole: "like a normal SaaS").
 *
 * Every notification lands in Locus (the bell, Home) for everyone, always. On top of that a person picks ONE preset
 * (Only urgent / Only urgent + morning brief / Everything that needs me) and the channels it may also use (Slack DM,
 * email, phone). The Customize list shows each type with its own Slack / email / phone cells: a preset fills them,
 * and editing one cell turns the state into "custom".
 *
 * Stored in p_person_delivery.notify_json (one column added on first use):
 *   { preset, channels: { slack_dm, email, push }, types: { [typeId]: { slack_dm, email, push } } }
 * A person with nothing saved = preset urgent_brief with every channel off: nothing leaves Locus until they turn a
 * channel on. The one exception: someone already on the morning brief DM list starts with Slack DM on, because that
 * is what happens to them today (the page must show the truth, and a first save must not drop the DM).
 *
 * A send path never decides who wants what itself: it calls personWants(env, d, email, typeId, channel).
 * The v5 page (profit/v5/pages/profile/_notify.js) carries the same fill rules so a tap fills at once.
 *
 * A client login (2026-11-26) gets the same three presets in its own words (CLIENT_PRESETS) over its own short list
 * (who: client): its updates and reports, what waits on its approval, replies from its team. Urgent for a client is
 * an approval due within a day or late. A client never sees a team type, and a client row (audience client) never
 * counts for a team send path. */

export const NOTIFY_PRESETS = [
  { id: 'only_urgent', name: 'Only urgent', sub: 'Money at risk or something broken.' },
  { id: 'urgent_brief', name: 'Only urgent + morning brief', sub: 'The same, plus one short morning brief.' },
  { id: 'everything', name: 'Everything that needs me', sub: 'Every row in your bell, the moment it lands.' },
  { id: 'custom', name: 'Custom', sub: 'You changed one below. Pick a preset to reset.' },
];
const PRESET_IDS = NOTIFY_PRESETS.map(p => p.id);
export const CHANNEL_IDS = ['slack_dm', 'email', 'push'];

const U = ['only_urgent', 'urgent_brief', 'everything'];
const E = ['everything'];
/** The catalog. who: team | owner | client. copy: now (a Slack DM really goes), dec5 (copies start when settings
 *  notifyCopies is 'on'), soon (saved, no sender yet). */
export const NOTIFY_TYPES = [
  { id: 'spend_high', name: 'Spend far above normal', note: 'A brand spends much more than its normal day and its budgets.', group: 'urgent', urgent: true, who: 'team', presets: U, copy: 'dec5' },
  { id: 'spend_low', name: 'Spend far below normal', note: 'A brand spends much less than its normal day.', group: 'urgent', urgent: true, who: 'team', presets: U, copy: 'dec5' },
  { id: 'brief_failed', name: 'A client daily did not go out', note: 'The client was not messaged and needs a look.', group: 'urgent', urgent: true, who: 'team', presets: U, copy: 'dec5' },
  { id: 'claude_failed', name: 'Claude key or credit failed', note: 'Written summaries stop until the key or credit is fixed.', group: 'urgent', urgent: true, who: 'owner', presets: U, copy: 'dec5' },
  { id: 'meta_sync', name: 'Meta sync failing', note: 'Ad numbers go stale until the sync works again.', group: 'urgent', urgent: true, who: 'owner', presets: U, copy: 'dec5' },
  { id: 'outage', name: 'Shopify, Meta or Google is down', note: 'The platform says it has problems right now.', group: 'urgent', urgent: true, who: 'owner', presets: U, copy: 'dec5' },
  /* The alarms (alarms.js, round 21). copy 'now' = they also DM in Slack tonight (urgent.js DM_TONIGHT). */
  { id: 'account_blocked', name: 'Ad account blocked or out of limit', note: 'A Meta ad account is disabled, unpaid or at its spending limit. Also a Slack DM until Dec 5.', group: 'urgent', urgent: true, who: 'team', presets: U, copy: 'now' },
  { id: 'campaign_stalled', name: 'A live campaign stopped spending', note: 'A live campaign with a budget spends far under its pace today. Also a Slack DM until Dec 5.', group: 'urgent', urgent: true, who: 'team', presets: U, copy: 'now' },
  { id: 'no_orders', name: 'Ads spending, no store orders', note: 'No store order for hours while ads spend: the store or checkout may be down. Also a Slack DM until Dec 5.', group: 'urgent', urgent: true, who: 'team', presets: U, copy: 'now' },
  { id: 'over_budget', name: "Spend far over today's budgets", note: "Today's spend is far past the daily budgets set.", group: 'urgent', urgent: true, who: 'team', presets: U, copy: 'dec5' },
  { id: 'ad_rejected', name: 'Ads rejected in a live campaign', note: 'The first rejection of the day right away, later ones in the count.', group: 'urgent', urgent: true, who: 'team', presets: U, copy: 'dec5' },
  { id: 'tracking_lost', name: 'Purchases not tracked', note: 'The store had orders but the pixel or Triple Whale recorded far fewer. Checked once a day.', group: 'urgent', urgent: true, who: 'team', presets: U, copy: 'dec5' },
  { id: 'sold_out', name: 'Advertised product sold out', note: 'A sold out product that a live ad links to. Only for brands where it is switched on.', group: 'urgent', urgent: true, who: 'team', presets: U, copy: 'dec5' },
  { id: 'ad_calls', name: 'Ad calls waiting on you', note: 'Ad calls that need a Yes or No.', group: 'needs_me', urgent: false, who: 'team', presets: E, copy: 'soon' },
  { id: 'client_send', name: 'Client updates to send', note: 'Client dailies and reports waiting to send.', group: 'needs_me', urgent: false, who: 'team', presets: E, copy: 'soon' },
  { id: 'review', name: 'Review waiting on you', note: 'Creative cards waiting on your review.', group: 'needs_me', urgent: false, who: 'team', presets: E, copy: 'soon' },
  { id: 'client_requests', name: 'Client requests', note: 'Client requests waiting on the team.', group: 'needs_me', urgent: false, who: 'team', presets: E, copy: 'soon' },
  { id: 'card_changes', name: 'Card comments and changes asked', note: 'Comments that tag you and cards sent back to you.', group: 'needs_me', urgent: false, who: 'team', presets: E, copy: 'soon' },
  { id: 'tasks_late', name: 'Tasks late or due today', note: 'Your tasks that are late or due today.', group: 'needs_me', urgent: false, who: 'team', presets: E, copy: 'soon' },
  { id: 'war_room', name: 'War Room check-in waiting', note: 'Brands waiting on Approve in the War Room.', group: 'needs_me', urgent: false, who: 'owner', presets: E, copy: 'soon' },
  { id: 'morning_brief', name: 'Morning brief', note: 'One short list of your work today.', group: 'brief', urgent: false, who: 'team', presets: ['urgent_brief', 'everything'], copy: 'now' },
  /* A client login's own list (2026-11-26, Cole: clients get their own presets). Only their own brand's updates,
     approvals and replies; never an internal alert. Urgent for a client = an approval with a deadline that is due
     within a day or already late. No sender reaches a client outside Locus yet (copy 'soon'). */
  { id: 'client_approval_due', name: 'An approval is due soon', note: 'Something waiting on your yes has a deadline today or is already late.', group: 'urgent', urgent: true, who: 'client', presets: U, copy: 'soon' },
  { id: 'client_waiting', name: 'Waiting on your approval', note: 'New ads to review and requests that need your yes.', group: 'needs_me', urgent: false, who: 'client', presets: E, copy: 'soon' },
  { id: 'client_replies', name: 'Replies from your team', note: 'Answers to your requests and your comments.', group: 'needs_me', urgent: false, who: 'client', presets: E, copy: 'soon' },
  { id: 'client_daily', name: 'Your daily update', note: 'How your brand did yesterday, in a few lines.', group: 'brief', urgent: false, who: 'client', presets: ['urgent_brief', 'everything'], copy: 'soon' },
  { id: 'client_reports', name: 'A report is ready', note: 'Your weekly and monthly reports, when they are ready to read.', group: 'brief', urgent: false, who: 'client', presets: ['urgent_brief', 'everything'], copy: 'soon' },
];
/** The same three presets in a client's words: their team's approvals and updates, never the agency's alarms. */
export const CLIENT_PRESETS = [
  { id: 'only_urgent', name: 'Only urgent', sub: 'Only when an approval is due soon.' },
  { id: 'urgent_brief', name: 'Only urgent + morning brief', sub: 'The same, plus your daily update and reports.' },
  { id: 'everything', name: 'Everything that needs me', sub: 'Every approval, reply and update from your team, as it comes in.' },
  { id: 'custom', name: 'Custom', sub: 'You changed one below. Pick a preset to reset.' },
];
const TYPE = Object.fromEntries(NOTIFY_TYPES.map(t => [t.id, t]));
export const typeOf = id => TYPE[id] || null;

/** The types this person may pick: a client gets only the client types, a teammate no owner only type and no client type. */
export function catalogTypes({ owner = false, client = false } = {}) {
  if (client) return NOTIFY_TYPES.filter(t => t.who === 'client');
  return NOTIFY_TYPES.filter(t => t.who === 'team' || (owner && t.who === 'owner'));
}
/** The channels as the page draws them. in_app is always on and never stored. */
export function channelsView(d = {}) {
  return [
    { id: 'in_app', name: 'In Locus', always: true, ready: true, note: 'Always' },
    { id: 'slack_dm', name: 'Slack DM', ready: !!d.slackApi, note: d.slackApi ? null : 'Slack is not connected.' },
    { id: 'email', name: 'Email', ready: !!d.sendEmail, note: d.sendEmail ? null : 'Saved. Email starts when the product mailbox is set up.' },
    { id: 'push', name: 'Phone', ready: false, note: 'Coming soon' },
  ];
}
/** The whole catalog answer of GET /api/me/delivery. */
export function catalogView(d, who, copiesOn) {
  const client = !!(who && who.client);
  const types = catalogTypes(who).map(t => ({ id: t.id, name: t.name, note: t.note, group: t.group, urgent: t.urgent, presets: t.presets.slice(), copy: t.copy }));
  return { audience: client ? 'client' : 'team', types, presets: (client ? CLIENT_PRESETS : NOTIFY_PRESETS).map(p => ({ ...p })), channels: channelsView(d), copies_on: !!copiesOn };
}

const bool = v => v === true;
const noChannels = () => ({ slack_dm: false, email: false, push: false });

/* ---- the rules (pure; the v5 _notify.js matches them) ---- */
/** For each type, a cell is true when the type is in the preset AND that channel is on. */
export function fillPreset(catalog, presetId, channels) {
  const ch = { ...noChannels(), ...(channels || {}) }, out = {};
  for (const t of catalog) {
    const inIt = (t.presets || []).includes(presetId);
    out[t.id] = { slack_dm: inIt && bool(ch.slack_dm), email: inIt && bool(ch.email), push: inIt && bool(ch.push) };
  }
  return out;
}
/** Pick a preset (not custom): the cells refill from it. */
export function applyPreset(catalog, n, presetId) {
  if (!PRESET_IDS.includes(presetId) || presetId === 'custom') return n;
  return { ...n, preset: presetId, types: fillPreset(catalog, presetId, n.channels) };
}
/** Change the "also send to" channels. A preset refills; custom keeps its cells (an off channel reads false at send time). */
export function applyChannels(catalog, n, channels) {
  const next = { ...n.channels };
  for (const c of CHANNEL_IDS) if (channels && c in channels) next[c] = bool(channels[c]);
  const out = { ...n, channels: next };
  return n.preset === 'custom' ? out : { ...out, types: fillPreset(catalog, n.preset, next) };
}
/** Edit one cell: the state becomes custom. */
export function applyCell(catalog, n, typeId, cell) {
  if (!catalog.some(t => t.id === typeId) || !cell || typeof cell !== 'object') return n;
  const cur = { ...noChannels(), ...(n.types[typeId] || {}) };
  for (const c of CHANNEL_IDS) if (c in cell) cur[c] = bool(cell[c]);
  return { ...n, preset: 'custom', types: { ...n.types, [typeId]: cur } };
}
export const isCustom = n => !!n && n.preset === 'custom';

/** The default for a person with nothing saved. slackDm = they already get a Slack DM today (the morning brief DM
 *  list), so the page shows Slack DM on and a first save keeps it, instead of silently dropping them. */
export function defaultNotify(catalog, { slackDm = false } = {}) {
  const channels = { ...noChannels(), slack_dm: !!slackDm };
  return { preset: 'urgent_brief', channels, types: fillPreset(catalog, 'urgent_brief', channels) };
}
/** A stored or sent notify made safe: unknown types and channels dropped, booleans only, complete for the catalog.
 *  A client keeps only the client types and is marked audience 'client'. A client's saved choice read with a team
 *  catalog (a send path walking every saved row: mywork.js dmRecipients, urgent.js personWants) reads as nothing on,
 *  so a client's "Slack DM on" never opts them into a team brief or an internal alert. */
export function cleanNotify(raw, catalog, { client = false } = {}) {
  const cat = client ? catalog.filter(t => t.who === 'client') : catalog.filter(t => t.who !== 'client');
  const r = raw && typeof raw === 'object' ? raw : {};
  if (!client && r.audience === 'client') return { preset: 'urgent_brief', channels: noChannels(), types: fillPreset(cat, 'urgent_brief', noChannels()) };
  const preset = PRESET_IDS.includes(r.preset) ? r.preset : 'urgent_brief';
  const channels = noChannels();
  for (const c of CHANNEL_IDS) channels[c] = bool(r.channels && r.channels[c]);
  let types;
  if (preset === 'custom') {
    types = {};
    for (const t of cat) {
      const cell = (r.types && r.types[t.id]) || {};
      types[t.id] = { slack_dm: bool(cell.slack_dm), email: bool(cell.email), push: bool(cell.push) };
    }
  } else types = fillPreset(cat, preset, channels);
  return client ? { audience: 'client', preset, channels, types } : { preset, channels, types };
}

/** Does this notify want this type on this channel? in_app always; push never yet (no sender exists). */
export function wants(notify, typeId, channel) {
  if (channel === 'in_app') return true;
  if (channel === 'push') return false;
  if (!notify || !CHANNEL_IDS.includes(channel)) return false;
  return !!(notify.channels && notify.channels[channel]) && !!(notify.types && notify.types[typeId] && notify.types[typeId][channel]);
}

/* ---- storage ---- */
let ready = false;
/** The notify_json column. Call after automations.js ensure(env) made the table. A missing table leaves it for later. */
export async function ensureNotify(env) {
  if (ready) return true;
  try { await env.DB.prepare(`ALTER TABLE p_person_delivery ADD COLUMN notify_json TEXT`).run(); ready = true; }
  catch (e) { if (/duplicate column/i.test(String(e && e.message))) ready = true; }
  return ready;
}
export function _resetNotify() { ready = false; }

const lower = s => String(s || '').trim().toLowerCase();
const parse = s => { if (!s) return null; try { return JSON.parse(s); } catch { return null; } };

/** The saved notify_json for one person, or null when they never saved one. */
export async function savedNotify(env, email) {
  const r = await env.DB.prepare(`SELECT notify_json FROM p_person_delivery WHERE person_id = ?1`).bind(lower(email)).first().catch(() => null);
  return r ? parse(r.notify_json) : null;
}
/** Every saved notify, as { email: raw }. One read, for a send path that walks many people. */
export async function allSavedNotify(env) {
  const { results } = await env.DB.prepare(`SELECT person_id, notify_json FROM p_person_delivery WHERE notify_json IS NOT NULL`).all().catch(() => ({ results: [] }));
  const out = {};
  for (const r of results || []) { const v = parse(r.notify_json); if (v) out[lower(r.person_id)] = v; }
  return out;
}
/** One person's notify, resolved (the default when nothing is saved). The owner sees owner types. slackDm: this
 *  person is on today's morning brief DM list (mywork.js onMorningDmList), so their default has Slack DM on. */
export async function notifyOf(env, email, { client = false, owner = false, slackDm = false } = {}) {
  const cat = catalogTypes({ owner, client });
  const raw = await savedNotify(env, email);
  if (raw) return cleanNotify(raw, cat, { client });
  return client ? { audience: 'client', ...defaultNotify(cat) } : defaultNotify(cat, { slackDm });
}
/** Save one person's notify (the row is made when missing; the old columns keep their defaults). */
export async function saveNotify(env, email, n, at = new Date().toISOString()) {
  await ensureNotify(env);
  await env.DB.prepare(`INSERT INTO p_person_delivery (person_id, org_id, notify_json, updated_at) VALUES (?1, 'default', ?2, ?3)
    ON CONFLICT(person_id) DO UPDATE SET notify_json = excluded.notify_json, updated_at = excluded.updated_at`).bind(lower(email), JSON.stringify(n), at).run();
}
/** Apply a partial PUT body to the current notify: channels, then preset, then cells (a cell edit wins). */
export function applyBody(catalog, cur, body, { client = false } = {}) {
  let n = cur;
  if (body && body.channels && typeof body.channels === 'object') n = applyChannels(catalog, n, body.channels);
  if (body && typeof body.preset === 'string' && body.preset !== 'custom') n = applyPreset(catalog, n, body.preset);
  if (body && body.types && typeof body.types === 'object') for (const [id, cell] of Object.entries(body.types)) n = applyCell(catalog, n, id, cell);
  return cleanNotify(n, catalog, { client });
}

/** Is this channel ready to send at all? */
export function channelReady(d, channel) {
  if (channel === 'in_app') return true;
  if (channel === 'slack_dm') return !!(d && d.slackApi);
  if (channel === 'email') return !!(d && d.sendEmail);
  return false;
}
/** The one question a send path asks, per recipient per channel. */
export async function personWants(env, d, email, typeId, channel) {
  if (channel === 'in_app') return true;
  if (!channelReady(d, channel)) return false;
  const owner = !!email && lower(email) === lower((env && env.OWNER_EMAIL) || (d && d.ownerEmail));
  const n = await notifyOf(env, email, { owner }).catch(() => null);
  return wants(n, typeId, channel);
}
