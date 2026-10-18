/**
 * THE SHARED RECORD FOR EVERY WRITE OUTSIDE META (2026-10-17). Cole: "Locus should have every Slack permission and full
 * control over every connection we add." metawrite.js keeps its own p_meta_write table for Meta; every other connection
 * the Strategist can now change (Slack, Google Ads, TikTok, Shopify, Asana, Drive, Frame, Klaviyo additions) records here
 * with the same rules:
 *   - look the object up first and show the exact before -> after (each module's propose);
 *   - the brand check (the object must be the brand's own account / channel / store);
 *   - one `p_ext_write` row (before, after, how to undo it) and one manual `activities` line (the Change Log, filed
 *     under the brand's Meta account like klaviyowrite.js does), naming who asked or approved;
 *   - undo within 24 hours where the platform allows it (`undo_change`; a module registers its own undo with
 *     `registerUndo(platform, fn)`), and the note says when a change cannot be undone.
 * Also here: `write_access`, a read tool that says, per connection, what the stored token may change today and the
 * exact fix when it may not (Slack scopes from auth.test, Meta per ad account, Google, Drive, Klaviyo, Shopify, TikTok,
 * Frame, Asana). Off by design everywhere: posting to a client channel or sending to customers without a card, deleting
 * Frame files, passwords and secrets.
 */
import { resolveBrandId } from './brands.js';

export const UNDO_HOURS = 24;
const clip = (s, n) => String(s ?? '').slice(0, n);
const parse = (v, fb) => { if (v == null) return fb; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fb; } };
const rid = p => p + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
export const OWNER_EMAIL = 'cole@go-mobius-digital.com';
export const OWNER_SLACK = 'U06C37MDWD7';
export const isOwner = ctx => !!ctx && (ctx.whoId === OWNER_SLACK || ctx.ev?.user === OWNER_SLACK || String(ctx.who || '').toLowerCase() === OWNER_EMAIL || ctx.who === 'admin');

/* ---------------- the brand ---------------- */
export async function brandOf(env, d, want, ctx) {
  const w = String(want || ctx?.screen?.act_id || ctx?.screen?.act || '').trim();
  if (!w) return null;
  const accts = await d.listAccounts(env, false);
  const id = await resolveBrandId(env, w).catch(() => w);
  const lw = w.toLowerCase();
  return accts.find(a => a.act_id === id || a.meta_act === w) || accts.find(a => String(a.name).toLowerCase() === lw) || accts.find(a => String(a.name).toLowerCase().includes(lw)) || null;
}

/* ---------------- the record ---------------- */
const SQL = `CREATE TABLE IF NOT EXISTS p_ext_write (id TEXT PRIMARY KEY, platform TEXT NOT NULL, brand TEXT, object TEXT, name TEXT,
  action TEXT NOT NULL, before TEXT, after TEXT, undo TEXT, summary TEXT, by TEXT, at TEXT NOT NULL, undone TEXT)`;
let tabled = false;
export async function ensureExt(env) {
  if (tabled) return;
  await env.DB.prepare(SQL).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_ext_write_brand ON p_ext_write (brand, at)`).run().catch(() => {});
  tabled = true;
}
const approver = ctx => ctx?.who || 'someone in Locus';
/** The Change Log line, filed by the brand's Meta account (a brand with none keeps it under its own id). */
export async function logLine(env, brand, { platform, summary, reason, ctx, category, objectType, object, name, note }) {
  let file = brand || 'agency';
  if (brand) {
    const b = await env.DB.prepare(`SELECT meta_act FROM brand_accounts WHERE act_id = ?1`).bind(brand).first().catch(() => null);
    if (b?.meta_act) file = b.meta_act;
  }
  const locus = ctx?.via === 'locus';
  await env.DB.prepare(`INSERT INTO activities (id, act_id, event_time, event_type, category, summary, reason, note, confirmed, manual, actor, object_type, object_id, object_name)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, 1, ?9, ?10, ?11, ?12)`)
    .bind(`manual:${crypto.randomUUID()}`, file, new Date().toISOString(), `${platform}_write`, category || 'other', clip(summary, 500), reason || null, note || null,
      locus ? `${approver(ctx)} in Locus` : `the Strategist, for ${approver(ctx)}`, objectType || null, object ? String(object) : null, name || null).run().catch(() => {});
}
/** One write: the row (for undo) and the Change Log line. `undo` null = the platform cannot undo it (the note says so). */
export async function recordWrite(env, { platform, brand, object, name, action, before, after, undo, summary, reason, category, objectType, ctx }) {
  await ensureExt(env);
  const id = rid('xw_');
  await env.DB.prepare(`INSERT INTO p_ext_write (id, platform, brand, object, name, action, before, after, undo, summary, by, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`)
    .bind(id, platform, brand || null, object ? String(object) : null, name || null, action, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after),
      undo ? JSON.stringify(undo) : null, clip(summary, 500), approver(ctx), new Date().toISOString()).run();
  await logLine(env, brand, { platform, summary, reason, ctx, category, objectType, object, name, note: `Write ${id}. ${undo ? `Undo within ${UNDO_HOURS}h with undo_change.` : 'This one cannot be undone from Locus.'}` });
  return id;
}
/** The note every apply ends with. */
export const doneNote = (text, id, canUndo = true) => `${text} Logged in the Change Log${canUndo ? ` (undo: ${id})` : ''}.`;

/* ---------------- undo ---------------- */
const UNDO = {};
/** fn(env, d, row, spec, ctx) -> {ok, note} | {error} */
export function registerUndo(platform, fn) { UNDO[platform] = fn; }

export function undoActions(d, metaUndo) {
  return [{
    name: 'undo_change',
    description: 'Undo one of Locus\'s own changes from the last 24 hours on ANY connection (Slack, Google Ads, TikTok, Shopify, Asana, Drive, Frame, Klaviyo, Meta): give the write id from the note (xw_... or mw_...) or "last" with the brand. Puts back the before-state, or removes what the change made (a post, a keyword, a reaction). Some changes cannot be undone (a Frame comment, a sent message in a client channel): it says so.',
    input_schema: { type: 'object', properties: { brand: { type: 'string' }, write: { type: 'string', description: 'xw_... / mw_... id, or "last".' }, reason: { type: 'string' } }, required: ['write'] },
    propose: async (env, input, h, ctx) => {
      await ensureExt(env);
      const w0 = String(input.write || '').trim();
      if (/^mw_/.test(w0) && metaUndo) { const p = await metaUndo.propose(env, input, h, ctx); return p.error ? p : { ...p, patch: { meta: true, inner: p.patch } }; }
      const since = new Date(Date.now() - UNDO_HOURS * 3600e3).toISOString();
      let w;
      if (/^last$/i.test(w0)) {
        const brand = await brandOf(env, d, input.brand, ctx);
        if (!brand) return { error: 'Which brand\'s last change?' };
        w = await env.DB.prepare(`SELECT * FROM p_ext_write WHERE brand = ?1 AND undone IS NULL ORDER BY at DESC LIMIT 1`).bind(brand.act_id).first();
        const mw = metaUndo ? await env.DB.prepare(`SELECT id, at FROM p_meta_write WHERE brand = ?1 AND undone IS NULL AND action != 'meta_undo' ORDER BY at DESC LIMIT 1`).bind(brand.act_id).first().catch(() => null) : null;
        if (mw && (!w || mw.at > w.at)) { const p = await metaUndo.propose(env, { ...input, write: mw.id }, h, ctx); return p.error ? p : { ...p, patch: { meta: true, inner: p.patch } }; }
      } else w = await env.DB.prepare(`SELECT * FROM p_ext_write WHERE id = ?1`).bind(w0).first();
      if (!w) return { error: 'No change by that id (or nothing to undo for that brand).' };
      if (w.undone) return { error: `That change was already undone (${w.undone}).` };
      if (!w.undo) return { error: `"${w.summary}" cannot be undone from Locus. Change it back by hand.` };
      if (w.at < since) return { error: `That change is older than ${UNDO_HOURS} hours (${w.at}). Make the change again as a new one instead.` };
      if (!UNDO[w.platform]) return { error: `Undo is not built for ${w.platform}.` };
      return { summary: `Undo: ${clip(w.summary, 140)}`, detail: `Made by ${w.by} at ${String(w.at).slice(0, 16).replace('T', ' ')} UTC on ${w.platform}.${input.reason ? `\nWhy: ${clip(input.reason, 300)}` : ''}`,
        patch: { id: w.id, platform: w.platform, brand: w.brand, summary: w.summary, reason: clip(input.reason, 300) || null } };
    },
    apply: async (env, p, h, ctx) => {
      if (p.meta) return metaUndo.apply(env, p.inner, h, ctx);
      await ensureExt(env);
      const w = await env.DB.prepare(`SELECT * FROM p_ext_write WHERE id = ?1`).bind(p.id).first();
      if (!w) return { error: 'That change is gone.' };
      if (w.undone) return { error: 'Already undone.' };
      let r;
      try { r = await UNDO[w.platform](env, d, w, parse(w.undo, {}), ctx); } catch (e) { r = { error: e.message }; }
      if (r?.error) return { error: `Not undone: ${r.error}` };
      await env.DB.prepare(`UPDATE p_ext_write SET undone = ?2 WHERE id = ?1`).bind(w.id, `${new Date().toISOString()} by ${approver(ctx)}`).run();
      await logLine(env, w.brand, { platform: w.platform, summary: `Undone: ${w.summary}`, reason: p.reason, ctx, object: w.object, name: w.name, note: `Undo of ${w.id}.` });
      return { ok: true, note: r?.note || `Undone: ${w.summary}.` };
    },
  }];
}

/* ---------------- write_access: what each token may change today ---------------- */
const SLACK_WANT = {
  'chat:write': 'post and edit its own messages', 'chat:write.customize': 'post as "Locus"', 'chat:write.public': 'post in public channels it has not joined',
  'reactions:write': 'add reactions', 'reactions:read': 'see ✅ reactions (Done on reminders)', 'pins:write': 'pin messages',
  'channels:manage': 'make public channels, invite people, archive', 'groups:write': 'make private channels, invite people', 'channels:join': 'join public channels',
  'canvases:write': 'make canvases', 'files:write': 'upload files', 'im:write': 'DM people', 'users:read': 'see names', 'users:read.email': 'match teammates by email',
  'channels:history': 'read public channels', 'groups:history': 'read private channels', 'files:read': 'see uploaded images', 'bookmarks:write': 'add channel bookmarks',
};
export async function slackScopes(env, d) {
  if (!env.SLACK_BOT_TOKEN) return { error: 'SLACK_BOT_TOKEN is not set.' };
  const res = await d.xfetch('https://slack.com/api/auth.test', { method: 'POST', headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' });
  const j = await res.json().catch(() => ({}));
  const have = String(res.headers.get('x-oauth-scopes') || '').split(',').map(s => s.trim()).filter(Boolean);
  return { ok: !!j.ok, app_user: j.user || null, bot_id: j.bot_id || null, have, missing: Object.keys(SLACK_WANT).filter(s => !have.includes(s)).map(s => ({ scope: s, for: SLACK_WANT[s] })) };
}

/** Each probe is a read (or a validate-only call); nothing is changed. deps: the modules' own probes. */
export function accessTool(d, probes) {
  return [{
    def: { name: 'write_access',
      description: 'What Locus may CHANGE today on each connection (Slack scopes, Meta per ad account, Google Ads, Drive, Klaviyo, Shopify, TikTok, Frame, Asana), with the exact clicks to fix what is missing. Read it when someone asks "can you change X", before saying you cannot, and when a write was refused for permissions.',
      input_schema: { type: 'object', properties: { brand: { type: 'string', description: 'Limit the per-brand checks to one brand.' }, only: { type: 'string', description: 'One connection: slack, meta, google, drive, klaviyo, shopify, tiktok, frame, asana.' } } } },
    run: async (env, input, ctx) => {
      const brand = input.brand ? await brandOf(env, d, input.brand, ctx) : null;
      const out = {};
      for (const [k, fn] of Object.entries(probes)) {
        if (input.only && input.only !== k) continue;
        try { out[k] = await fn(env, brand); } catch (e) { out[k] = { error: e.message }; }
      }
      const s = JSON.stringify({ brand: brand?.name || 'all', checked: new Date().toISOString(), ...out });
      return { text: s.length > 20000 ? s.slice(0, 20000) + '... (trimmed: pass brand or only)' : s };
    },
  }];
}
export const _test = { reset: () => { tabled = false; }, UNDO };
