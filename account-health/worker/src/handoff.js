/* HAND OFFS TELL SOMEONE (journey audit 2026-11-26).
 *
 * A card changing hands used to tell nobody: an upload moved the card to Review in silence, the last approval moved it
 * to Ready in silence, and Send to client only set a flag. This writes ONE bell row (p_notice, the same table the
 * automations and the bell read) for the person who now has the card:
 *   reviewer  a card got new ads to review     (the brand's reviewer, else strategist, else the owner)
 *   buyer     a card is approved and ready     (the brand's buyer, else the owner)
 *   clients   a card was sent to the client    (every client login on that brand)
 * Roles come from settings.automationRoles ({ all: { role: email }, <brand id>: { role: email } }, set in Who does what).
 * Bell rows only: no Slack, no email (Slack stays where it already posts). A person who already has an open row for
 * the same card is not told twice. Never throws: a hand off must never fail the action behind it. */
import { addNotice, ensure } from './automations.js';
import { brandsFor, clientOf } from './brandguard.js';

const lower = s => String(s || '').trim().toLowerCase();
const isEmail = s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || ''));
const TEAM_DOMAIN = 'go-mobius-digital.com';
const parse = (s, f) => { try { return s == null ? f : JSON.parse(s); } catch { return f; } };

async function setting(env, key, fallback) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
  return parse(row?.value, fallback) ?? fallback;
}

/** The brand id (brand_...) for any id a card may carry. */
async function brandIdOf(env, id) {
  const s = String(id || '');
  if (!s || s.startsWith('brand_')) return s;
  const a = await env.DB.prepare(`SELECT brand_id FROM brand_alias WHERE alias = ?1`).bind(s).first().catch(() => null);
  if (a?.brand_id) return a.brand_id;
  const b = await env.DB.prepare(`SELECT id FROM brands WHERE legacy_key = ?1`).bind(s).first().catch(() => null);
  return b?.id || s;
}

async function teamFor(env, brand, to) {
  const roles = (await setting(env, 'automationRoles', {})) || {};
  const one = (roles[brand] && typeof roles[brand] === 'object' ? roles[brand] : {}) || {};
  const all = (roles.all && typeof roles.all === 'object' ? roles.all : {}) || {};
  const owner = lower(env.OWNER_EMAIL);
  const pick = to === 'reviewer'
    ? one.reviewer || all.reviewer || one.strategist || all.strategist || owner
    : one.buyer || all.buyer || owner;
  const e = lower(pick);
  if (!isEmail(e)) return [];
  /* Someone held to other brands never hears about this one. */
  const only = await brandsFor(env, e).catch(() => null);
  return only && !only.has(brand) ? [] : [e];
}

async function clientsFor(env, brand) {
  const users = (await setting(env, 'clientUsers', {})) || {};
  const out = [];
  for (const [email, u] of Object.entries(users)) {
    const e = lower(email);
    if (!u || typeof u !== 'object' || u.hq || e.endsWith('@' + TEAM_DOMAIN)) continue;
    if (!Array.isArray(u.brands) || !u.brands.includes(brand)) continue;
    const c = await clientOf(env, e).catch(() => null);   // the same check brandguard uses (team guests are never clients)
    if (c && c.brands.includes(brand)) out.push(e);
  }
  return out;
}

/** One bell row per person the hand off reaches. Returns { told: [emails] } or { error }. */
export async function tellHandoff(env, { brand_id, to, title, body = null, card_id = null } = {}) {
  try {
    const brand = await brandIdOf(env, brand_id);
    if (!brand || !title || !['reviewer', 'buyer', 'clients'].includes(to)) return { told: [] };
    const people = to === 'clients' ? await clientsFor(env, brand) : await teamFor(env, brand, to);
    if (!people.length) return { told: [] };
    await ensure(env);
    const told = [];
    for (const person of people) {
      const saved = String(title).replace(/\s*[\u2014\u2013]\s*/g, ', ').slice(0, 300);   // as addNotice stores it
      /* `for` marks the client rows, so clearClientHandoff closes only those (a client never sees the button). */
      const button = card_id ? { kind: 'card', card: String(card_id), for: to === 'clients' ? 'client' : to } : null;
      /* Told once per CARD: with a card, an open row for that same card stops a repeat (card B is still told while
         card A's row is open); with no card, an open row with the same title does. */
      const open = button
        ? await env.DB.prepare(`SELECT id FROM p_notice WHERE person_id = ?1 AND brand_id = ?2 AND kind = 'tell' AND state = 'open' AND button_json LIKE ?3 LIMIT 1`)
          .bind(person, brand, `%"card":"${button.card.replace(/[%_"\\]/g, '')}","for":"${button.for}"%`).first().catch(() => null)
        : await env.DB.prepare(`SELECT id FROM p_notice WHERE person_id = ?1 AND brand_id = ?2 AND title = ?3 AND state = 'open' LIMIT 1`).bind(person, brand, saved).first().catch(() => null);
      if (open) continue;
      await addNotice(env, { person, brand_id: brand, kind: 'tell', title, body, button, home: true, at: new Date().toISOString() });
      told.push(person);
    }
    return { told };
  } catch (e) { return { error: e.message }; }
}

/** The card's client bell rows are done once the card no longer waits on the client. Never throws. */
export async function clearClientHandoff(env, brand_id, card_id, by) {
  try {
    const brand = await brandIdOf(env, brand_id);
    await env.DB.prepare(`UPDATE p_notice SET state = 'done', done_at = ?2, done_by = ?3 WHERE brand_id = ?1 AND kind = 'tell' AND state = 'open' AND button_json LIKE ?4`)
      .bind(brand, new Date().toISOString(), String(by || 'Locus').slice(0, 120), `%"card":"${String(card_id).replace(/[%_"\\]/g, '')}","for":"client"%`).run();
  } catch { /* the bell row stays; the card already moved on */ }
}
