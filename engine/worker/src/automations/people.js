/* Who is who for the automations screens: the caller, the settings rows, the roles per brand and the team list. */
// from account-health/worker/src/automations.js (whoOf, setting, emailsIn, rolesOf, teamList, onTeam)
// and account-health/worker/src/worker.js (emailAllowed)
import { lower } from '../platform/text.js';
import { swallowed } from '../platform/log.js';
import { ROLES, isEmail, safe } from './words.js';

const KEYS = ['automationsOn', 'automationRoles', 'allowedEmails', 'userBrands', 'userRoles', 'clientUsers', 'removedEmails'];

/** The caller as the old handler saw them. A sign in with no name reads as 'admin', as before. */
export function meOf(ctx) {
  const c = ctx.caller;
  const client = c.kind === 'client';
  const viewer = !client && c.view_only === true;
  const only = c.ids || null;
  return { email: c.email || 'admin', named: !!c.email, client, only, viewer, owner: c.kind === 'owner' && !viewer,
    sees: brand => !only || (!!brand && brand !== 'all' && only.has(brand)) };
}

/** Are the old tables there. They are made by the old worker on first use. No: the handler forwards. */
export async function tablesReady(ctx, me) {
  try {
    await ctx.db.one('automations.ready', { email: me.email });
    return true;
  } catch (e) {
    if (e && e.name === 'EngineError') throw e;
    swallowed('the automations tables are not made yet, so the old worker answers and makes them', e);
    return false;
  }
}

export const emailsIn = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v) : []).map(lower).filter(isEmail);

const lowerKeys = o => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).map(([k, v]) => [lower(k), v]));

/** The settings rows these routes read, in one statement. Team only. */
export async function settingsOf(ctx) {
  const rows = await ctx.db.all('automations.settingsMany', { keys: KEYS });
  const raw = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return { power: lower(raw.automationsOn) === 'on', saved: safe(raw.automationRoles, {}), allowed: emailsInList(safe(raw.allowedEmails, [])),
    userBrands: safe(raw.userBrands, {}), userRoles: safe(raw.userRoles, {}), clients: lowerKeys(safe(raw.clientUsers, {})),
    removed: emailsInList(safe(raw.removedEmails, [])) };
}

/* The old emailAllowed reads the invited list as a plain list of text. */
function emailsInList(v) {
  return (Array.isArray(v) ? v : []).map(e => String(e).toLowerCase());
}

/** The roles as saved: { all: { buyer: email }, <brand id>: { owner: email } }. */
export function rolesFrom(saved) {
  const out = {};
  for (const [k, m] of Object.entries(saved || {})) {
    if (k === 'team' || !m || typeof m !== 'object') continue;
    const one = {};
    for (const r of Object.keys(ROLES)) if (isEmail(lower(m[r]))) one[r] = lower(m[r]);
    if (Object.keys(one).length) out[k] = one;
  }
  return out;
}

/** The agency's own mail domain and the owner's email. The old worker holds both in its code and its keys,
 *  so they are borrowed from its team answer and kept five minutes. null when they could not be learned. */
export async function teamFacts(ctx) {
  try {
    const t = await ctx.legacy.get('ah', '/api/team', { cache_s: 300 });
    const domain = lower(t && t.domain);
    return domain ? { domain, owner: lower(t.owner) } : null;
  } catch (e) {
    swallowed('the old team answer could not be read, so this request is forwarded', e);
    return null;
  }
}

/** Taken off on the Team screen (settings.removedEmails). The owner never is, as the old isRemovedEmail says. */
export const isRemoved = (facts, s, email) => {
  const e = lower(email);
  return !!e && e !== lower(facts && facts.owner) && (s.removed || []).includes(e);
};

/** May this email sign in as team, as the old emailAllowed says: not taken off on the Team screen (checked
 *  before the domain rule, so a removed teammate on the agency's domain is out too), then on the agency's
 *  domain or invited by hand. */
export const onTeam = (facts, s, email) => !!email && !isRemoved(facts, s, email)
  && (email.toLowerCase().endsWith('@' + facts.domain) || s.allowed.includes(email.toLowerCase()));

/** "The whole team": everyone who may sign in and is not a client, from every place a team email is written down. */
export async function teamList(ctx, s, facts) {
  const found = new Set();
  const add = v => { const e = lower(v); if (isEmail(e)) found.add(e); };
  add(facts.owner);
  emailsIn(s.allowed).forEach(add);
  emailsIn(s.userBrands).forEach(add);
  emailsIn(s.userRoles).forEach(add);
  emailsIn(s.saved.team).forEach(add);
  for (const [k, m] of Object.entries(s.saved || {})) if (k !== 'team' && m && typeof m === 'object') Object.values(m).forEach(add);
  const lists = await ctx.db.batch([['automations.prefPeople', {}], ['automations.deliveryPeople', {}], ['automations.ownerPeople', {}]]);
  for (const rows of lists) for (const r of rows) add(r.e);
  return [...found].filter(e => onTeam(facts, s, e)).sort();
}
