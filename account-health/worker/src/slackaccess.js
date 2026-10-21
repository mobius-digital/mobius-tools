/**
 * WHO MAY USE LOCUS IN SLACK, AND WHERE (2026-10-21).
 *
 * Cole: "whoever I give access to in settings can use Locus... myself and the team, and everyone else (clients
 * and other outside people) not, unless we change it in the settings." Viktor works the same way.
 *
 * The order, first match wins:
 *   1. Cole: always.
 *   2. Someone on the list (settings.slackAccess.people, keyed by Slack user id):
 *        off   = never, even a teammate;
 *        guest = an outside person Cole let in (a client, a partner agency), read-only, limited to their brands.
 *   3. The team: a full member of our Slack with a Mobius email, or an email Locus allows (Team and access).
 *   4. Everyone else: no answer. On a tag they get a private note only they can see.
 *
 * Where: DMs, group DMs, a brand's internal channel, the agency channel, and ANY other channel the app is in,
 * when the person asking passes the list. settings.slackAccess.channels = { <id>: { brand, off } } names the brand
 * of a channel that is not a brand's own (#lucky-email -> Lucky), or keeps Locus quiet there (off).
 */

export const OWNER_SLACK = 'U06C37MDWD7';
const KEY = 'slackAccess';
const DENY = 'Locus only answers people the Mobius Digital team has given access. Ask Cole if you need it.';

const clean = s => String(s || '').trim();
const isUid = s => /^[UW][A-Z0-9]{5,20}$/.test(s);
const isCid = s => /^[CG][A-Z0-9]{5,20}$/.test(s);

export function normalize(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const people = {}, channels = {};
  for (const [id, p] of Object.entries(a.people || {})) {
    if (!isUid(id) || id === OWNER_SLACK || !p) continue;
    const level = p.level === 'off' ? 'off' : 'guest';
    people[id] = { level, name: clean(p.name).slice(0, 80), brands: Array.isArray(p.brands) ? p.brands.map(clean).filter(Boolean).slice(0, 30) : [],
      by: clean(p.by).slice(0, 120), at: clean(p.at).slice(0, 40) };
  }
  for (const [id, c] of Object.entries(a.channels || {})) {
    if (!isCid(id) || !c) continue;
    channels[id] = { name: clean(c.name).slice(0, 80), brand: clean(c.brand).slice(0, 60) || null, off: !!c.off, by: clean(c.by).slice(0, 120), at: clean(c.at).slice(0, 40) };
  }
  return { people, channels };
}

export async function readAccess(env, getSetting) {
  let raw = null;
  try { raw = JSON.parse((await getSetting(env, KEY)) || 'null'); } catch { raw = null; }
  return normalize(raw);
}
export async function writeAccess(env, putSetting, access) {
  const a = normalize(access);
  await putSetting(env, KEY, JSON.stringify(a));
  return a;
}

/* users.info, kept a few minutes in the isolate: every tag would otherwise cost a Slack call. */
const USERS = new Map();
async function userInfo(env, slack, uid) {
  const hit = USERS.get(uid);
  if (hit && hit.at > Date.now() - 300e3) return hit.u;
  const r = await slack(env, 'users.info', { user: uid });
  if (!r?.ok) throw new Error(r?.error || 'Slack did not answer');
  USERS.set(uid, { u: r.user || {}, at: Date.now() });
  return r.user || {};
}

/**
 * Who is asking, and may they use Locus.
 * deps = { slack, getSetting, emailAllowed, userBrands } (userBrands(env) -> {email: [brand ids]}).
 * Answers { ok, role: owner | team | guest, name, email, brands (null = every brand) } or { ok: false, reply, role }.
 */
export async function whoIs(env, deps, uid) {
  if (!uid) return { ok: false, role: 'none', reply: DENY };
  const access = await readAccess(env, deps.getSetting);
  if (uid === OWNER_SLACK) {
    const u = await userInfo(env, deps.slack, uid).catch(() => ({}));
    return { ok: true, role: 'owner', name: u.profile?.real_name || u.real_name || 'Cole', email: String(u.profile?.email || '').toLowerCase(), brands: null, access };
  }
  const listed = access.people[uid];
  if (listed?.level === 'off') return { ok: false, role: 'off', name: listed.name, reply: DENY, access };
  const u = await userInfo(env, deps.slack, uid);
  const name = u.profile?.real_name || u.real_name || u.name || listed?.name || 'someone';
  if (u.is_bot || u.deleted) return { ok: false, role: 'bot', name, reply: DENY, access };
  if (listed?.level === 'guest') return { ok: true, role: 'guest', name, email: String(u.profile?.email || '').toLowerCase(), brands: listed.brands.length ? listed.brands : null, access };
  const email = String(u.profile?.email || '').toLowerCase();
  const no = { ok: false, role: 'none', name, reply: DENY, access };
  if (u.is_restricted || u.is_ultra_restricted || u.is_stranger || !email) return no;
  const map = (await deps.userBrands(env).catch(() => ({}))) || {};
  if (!(await deps.emailAllowed(env, email)) && !map[email]) return no;
  const only = Array.isArray(map[email]) && map[email].length ? map[email] : null;
  return { ok: true, role: 'team', name, email, brands: only, access };
}

/* The channel's name and whether people outside our workspace are in it, once a day per channel. */
export async function channelInfo(env, deps, ch) {
  const key = `chanInfo:${ch}`;
  try {
    const hit = JSON.parse((await deps.getSetting(env, key)) || 'null');
    if (hit && hit.at > Date.now() - 86400e3) return hit;
  } catch { /* read again */ }
  const r = await deps.slack(env, 'conversations.info', { channel: ch }).catch(() => null);
  const c = r?.channel || {};
  const out = { name: c.name || '', shared: !!(c.is_ext_shared || c.is_shared || c.is_pending_ext_shared), at: Date.now(), ok: !!r?.ok };
  if (r?.ok) await deps.putSetting(env, key, JSON.stringify(out)).catch(() => {});
  return out;
}

/* A channel that is not a brand's own: its brand from the settings, else the one brand whose name starts the
   channel's name (#lucky-email -> Lucky Golf; two brands that fit = none, the words decide). */
export async function brandForChannel(env, access, ch, chanName, brands) {
  const set = access.channels[ch]?.brand;
  if (set) return brands.find(b => b.id === set) || null;
  const n = String(chanName || '').toLowerCase();
  if (!n) return null;
  const fits = brands.filter(b => {
    const words = String(b.name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    const first = words[0], whole = words.join('-');
    return first && first.length >= 3 && (n === whole || n.startsWith(whole + '-') || n === first || n.startsWith(first + '-'));
  });
  return fits.length === 1 ? fits[0] : null;
}

export { DENY };
