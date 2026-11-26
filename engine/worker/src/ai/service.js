/* Group ai, Connect your AI: is it on, my keys, my calls, the cards that wait for a tap.
   The old door did its own sign in above the brand guard: any signed in person with an email of their
   own may use it (a client login too), each for their own keys and their own brands. */
// from account-health/worker/src/connectai.js (handleApi, createKey, keyOut, propOut, waitingProposals, limitsOf)
import { fail, isEngineError } from '../platform/errors.js';
import { safeJson, isPlainObject } from '../platform/text.js';
import { DEFAULT_DAYS, MAX_DAYS, MAX_LIVE_KEYS, LIMITS, TOOL_NAMES } from './fixed.js';

const DAY = 86400e3;
const NOT_ON = 'Connecting your own AI is not switched on yet.';
const truthy = v => /^(1|on|true|yes)$/i.test(String(v || '').trim());
const plainText = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, n);
const iso = ctx => ctx.now.toISOString();

/* The person behind the session. A sign in with no email of its own (the shared admin key) has no keys. */
function personOf(ctx) {
  const c = ctx.caller;
  if (!c.email) fail(401, 'Sign in as yourself to connect your AI.');
  return { email: c.email, role: c.kind, owner: c.kind === 'owner', can_act: c.view_only !== true };
}

function limitsOf(text) {
  const j = safeJson(text, {}) || {};
  const n = (v, d) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : d);
  return { perMin: n(j.perMin, LIMITS.perMin), perDay: n(j.perDay, LIMITS.perDay), proposalsPerDay: n(j.proposalsPerDay, LIMITS.proposalsPerDay) };
}

async function flagsOf(ctx, me) {
  const rows = await ctx.db.all('ai.flags', { email: me.email });
  const by = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return { on: truthy(by.connectAi), applies: truthy(by.connectAiApply), limits: limitsOf(by.connectAiLimits) };
}

/* The address an AI app is given is the old worker's own door, which only the old side knows. */
async function addressOf(ctx) {
  const old = await ctx.legacy.get('ah', '/api/connect-ai', { cache_s: 300 });
  return old && typeof old.address === 'string' ? old.address : null;
}

const keyState = (row, now) => (row.revoked_at ? 'revoked' : Date.parse(row.expires_at) <= now ? 'expired' : 'live');
const keyOut = (row, now) => ({ id: row.id, label: row.label || '', starts_with: row.prefix, email: row.email, role: row.role,
  brands: safeJson(row.brands_json, []), created_at: row.created_at, expires_at: row.expires_at, last_used_at: row.last_used_at || null,
  revoked_at: row.revoked_at || null, state: keyState(row, now) });

/** GET /api/connect-ai */
export async function status(ctx) {
  const me = personOf(ctx);
  const f = await flagsOf(ctx, me);
  return { on: f.on, address: await addressOf(ctx), you: { email: me.email, role: me.role }, can_switch: me.owner,
    default_days: DEFAULT_DAYS, max_days: MAX_DAYS, max_keys: MAX_LIVE_KEYS, limits: f.limits,
    applies_on_yes: f.on ? f.applies : false, tools: TOOL_NAMES, can_act: me.can_act };
}

/** GET /api/connect-ai/keys */
export async function listKeys(ctx, input) {
  const me = personOf(ctx);
  const { on } = await flagsOf(ctx, me);
  if (!on) return { on, keys: [] };
  const everyone = input.query.all === '1' && me.owner;
  const rows = everyone ? await ctx.db.all('ai.keysAll', {}) : await ctx.db.all('ai.keysMine', { email: me.email });
  return { on, keys: rows.map(r => keyOut(r, ctx.now.getTime())) };
}

/** GET /api/connect-ai/calls */
export async function listCalls(ctx, input) {
  const me = personOf(ctx);
  const { on } = await flagsOf(ctx, me);
  if (!on) return { on, calls: [] };
  const everyone = input.query.all === '1' && me.owner;
  const rows = everyone ? await ctx.db.all('ai.callsAll', {}) : await ctx.db.all('ai.callsMine', { email: me.email });
  return { on, calls: rows.map(r => ({ key_id: r.key_id, email: r.email, tool: r.tool, brand_id: r.act_id || null, at: r.at,
    ok: !!r.ok, note: r.note || null })) };
}

/* The brands the person may see today, in the old order (live brands first, then by name). */
async function myBrands(ctx) {
  const rows = (await ctx.brands.list({ active: false })).filter(a => a && a.act_id);
  return rows.slice().sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0));
}

/* The old code made the key tables on first use. The engine never makes a table, so when the first
   read of one breaks, this one request goes to the old worker, which makes it and answers. */
async function readOrForward(ctx, read) {
  try {
    return { rows: await read() };
  } catch (e) {
    if (isEngineError(e)) throw e;
    ctx.log.note = `the key table could not be read here: ${String(e && e.message).slice(0, 120)}`;
    return { forward: ctx.forward('the key table could not be read here, the old worker makes it on first use') };
  }
}

function brandListFor(ctx, body, mine) {
  const ids = new Set(mine.map(a => a.act_id));
  let list = ctx.caller.brand_ids === null ? 'all' : [...ids];
  if (Array.isArray(body.brands) && body.brands.length) {
    const want = body.brands.map(String);
    if (want.some(b => !ids.has(b))) fail(403, 'One of those brands is not yours.');
    list = want;
  }
  return list;
}

const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hashKey(key) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(key)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** POST /api/connect-ai/keys {label, days, brands}. The key is in this one answer. Only its hash is kept. */
export async function makeKey(ctx, input) {
  const me = personOf(ctx);
  const { on } = await flagsOf(ctx, me);
  if (!on) fail(403, NOT_ON);
  const body = isPlainObject(input.body) ? input.body : {};
  const mine = await myBrands(ctx);
  if (!mine.length) fail(403, 'You have no brands yet, so there is nothing for a key to read.');
  const list = brandListFor(ctx, body, mine);
  const live = await readOrForward(ctx, () => ctx.db.one('ai.keysLive', { email: me.email, now: iso(ctx) }));
  if (live.forward) return live.forward;
  if (((live.rows && live.rows.n) || 0) >= MAX_LIVE_KEYS) fail(409, `You already have ${MAX_LIVE_KEYS} working keys. Turn one off first.`);
  const address = await addressOf(ctx);          // asked before the write, so a key is never made and then lost
  const life = Math.min(MAX_DAYS, Math.max(1, Math.floor(+body.days) || DEFAULT_DAYS));
  const key = 'lk_' + b64u(crypto.getRandomValues(new Uint8Array(30)));
  const row = { id: 'aik_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20), key_hash: await hashKey(key), prefix: key.slice(0, 7),
    email: me.email, role: me.role, brands_json: JSON.stringify(list), label: plainText(body.label, 60) || 'My AI',
    created_at: iso(ctx), expires_at: new Date(ctx.now.getTime() + life * DAY).toISOString() };
  await ctx.db.run('ai.keyAdd', row);
  return { key, ...keyOut({ ...row, last_used_at: null, revoked_at: null }, ctx.now.getTime()), address,
    personal_address: `${address}/${key}`, note: 'This is the only time the key is shown. Copy it now.' };
}

/** POST /api/connect-ai/keys/revoke {id}. My own key, or any key for the owner. */
export async function revokeKey(ctx, input) {
  const me = personOf(ctx);
  const body = isPlainObject(input.body) ? input.body : {};
  const who = { id: String(body.id || ''), email: me.email, any: me.owner ? 1 : 0 };
  const found = await readOrForward(ctx, () => ctx.db.one('ai.keyOne', who));
  if (found.forward) return found.forward;
  const row = found.rows;
  if (!row) fail(404, 'No key with that id.');
  if (!row.revoked_at) await ctx.db.run('ai.keyOff', { ...who, id: row.id, at: iso(ctx) });
  return { ok: true, id: row.id, state: 'revoked' };
}

const propOut = (r, now) => ({ id: r.id, brand_id: r.act_id, audience: r.audience === 'client' ? 'client' : 'team', kind: r.kind,
  title: r.title, why: r.why || '', level: r.level || null, object_id: r.object_id || null, object_name: r.object_name || null,
  amount: r.amount ?? null, before: r.before_text || null, after: r.after_text || null,
  status: r.status === 'waiting' && r.expires_at <= now ? 'expired' : r.status,
  proposed_by: r.by_email, through: r.by_app || 'an AI app', created_at: r.created_at, expires_at: r.expires_at,
  decided_by: r.decided_by || null, decided_at: r.decided_at || null, result: r.result || null });

/** GET /api/connect-ai/proposals?act=&all=1. The team sees every card on its brands. A client login sees
 *  only the cards its own side made, on its own brands. */
export async function listCards(ctx, input) {
  const me = personOf(ctx);
  const f = await flagsOf(ctx, me);
  if (!f.on) return { on: f.on, proposals: [], can_act: me.can_act };
  const ids = new Set((await myBrands(ctx)).map(a => a.act_id));
  const act = input.query.act || '';
  if (act && !ids.has(act)) fail(403, 'You do not have access to that brand.');
  const now = iso(ctx);
  const rows = await ctx.db.all('ai.cards', { act, all: input.query.all === '1' ? 1 : 0, now, limit: act ? 'one' : 'wide' });
  const mine = rows.filter(r => ids.has(r.act_id) && (me.role !== 'client' || r.audience === 'client'));
  return { on: f.on, applies_on_yes: f.applies, can_act: me.can_act, you: { role: me.role }, proposals: mine.map(r => propOut(r, now)) };
}
