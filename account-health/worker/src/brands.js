/* Brands and their connections (2026-10-08, the brand-first rebuild).
 *
 * Until now a brand in Locus WAS its Meta ad account: `accounts.act_id` keyed everything, so a
 * brand with no Meta account shared (Speedin) could not exist, and a brand with two ad accounts
 * (Party Patch) showed up twice. From here a brand is its own record with a permanent id
 * (`brand_<slug>`, never an outside id), and Meta, Triple Whale, Shopify, Google, TikTok, Klaviyo,
 * Asana, Drive and Frame are CONNECTIONS on top of it, any number of each.
 *
 *   brands       id, slug, name, status (active | paused | demo), tz, currency,
 *                internal_channel (the team's -internal Slack channel: the Strategist and the ideas
 *                bot answer there) and client_channel (where briefs and reports are sent),
 *                legacy_key = the id the older tables still file this brand's rows under
 *                (its act_ id today; equal to `id` for a brand born without Meta). Phase 3 of the
 *                plan moves those rows onto `id` and this column goes away.
 *   connections  brand_id, kind, external_id (UNIQUE per kind: an outside account belongs to one
 *                brand), label, is_primary, status, last_sync, last_error, source (mirror | locus).
 *                NEVER a secret here: the Strategist can read this table. Keys stay where they are.
 *   brand_alias  any old id -> brand id, kept forever, so old Slack buttons, old links, Asana
 *                webhooks, Supply and saved browser picks keep resolving.
 *
 * Phase 5 (2026-10-08): `connections` is the ONE place a connection's id lives. Every integration reads
 * and writes it through connGet / connSet / connClear. Secrets and an integration's own working state
 * stay in p_br_doc (the Klaviyo private key, Asana webhook ids), written by the same function that
 * writes the connection, so the two never drift. Plan: docs/locus-brand-first-plan.html. */

export const BRAND_SQL = [
  `CREATE TABLE IF NOT EXISTS brands (
     id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'active', tz TEXT NOT NULL DEFAULT 'America/Chicago', currency TEXT NOT NULL DEFAULT 'USD',
     internal_channel TEXT, client_channel TEXT,
     legacy_key TEXT UNIQUE, source TEXT NOT NULL DEFAULT 'mirror',
     created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX IF NOT EXISTS brands_internal_idx ON brands (internal_channel)`,
  `CREATE TABLE IF NOT EXISTS connections (
     id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, kind TEXT NOT NULL, external_id TEXT NOT NULL,
     label TEXT, is_primary INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'connected',
     config_json TEXT NOT NULL DEFAULT '{}', last_sync TEXT, last_error TEXT, source TEXT NOT NULL DEFAULT 'mirror',
     added_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE (kind, external_id))`,
  `CREATE INDEX IF NOT EXISTS connections_brand_idx ON connections (brand_id, kind)`,
  `CREATE TABLE IF NOT EXISTS brand_alias (
     alias TEXT PRIMARY KEY, brand_id TEXT NOT NULL, kind TEXT NOT NULL, added_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX IF NOT EXISTS brand_alias_brand_idx ON brand_alias (brand_id)`,
];

/* Every kind a connection can be. The label is what a person reads. */
export const KINDS = {
  meta: 'Meta ad account', triple_whale: 'Triple Whale', shopify: 'Shopify',
  google_ads: 'Google Ads', ga4: 'Google Analytics', gsc: 'Search Console',
  tiktok: 'TikTok ads', klaviyo: 'Klaviyo', attentive: 'Attentive',
  asana: 'Asana project', drive: 'Drive folder', frame: 'Frame project',
};

let ensured = false;
export async function ensureBrandTables(env) {
  if (ensured) return;
  await env.DB.batch(BRAND_SQL.map(s => env.DB.prepare(s)));
  ensured = true;
}

const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };

export function slugify(name) {
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'brand';
}

/** Any id a brand has ever had (brand_x, act_123, asana_456, its slug) -> the brand row, or null. */
export async function brandOf(env, id) {
  if (!id) return null;
  await ensureBrandTables(env);
  const s = String(id);
  return (await env.DB.prepare(`SELECT * FROM brands WHERE id = ?1 OR slug = ?1 OR legacy_key = ?1 LIMIT 1`).bind(s).first())
    || (await env.DB.prepare(`SELECT b.* FROM brand_alias a JOIN brands b ON b.id = a.brand_id WHERE a.alias = ?1`).bind(s).first())
    || null;
}

/** The brand whose INTERNAL Slack channel this is (active or demo), with its connections, or null. */
export async function brandByChannel(env, channel) {
  if (!channel) return null;
  await ensureBrandTables(env);
  const b = await env.DB.prepare(`SELECT * FROM brands WHERE internal_channel = ?1 AND status IN ('active', 'demo') ORDER BY source = 'mirror' DESC LIMIT 1`).bind(channel).first();
  if (!b) return null;
  const conns = (await env.DB.prepare(`SELECT kind, external_id, label, status FROM connections WHERE brand_id = ?1`).bind(b.id).all()).results || [];
  return { ...b, key: b.legacy_key || b.id, connections: conns };
}

/** One plain sentence on what a brand has connected and what it does not, for the Strategist. */
export function connectionNote(b) {
  const have = [...new Set((b.connections || []).filter(c => c.status !== 'disconnected').map(c => KINDS[c.kind] || c.kind))];
  const core = ['meta', 'triple_whale', 'shopify', 'klaviyo', 'google_ads', 'tiktok'];
  const missing = core.filter(k => !(b.connections || []).some(c => c.kind === k)).map(k => KINDS[k]);
  return `${b.name} has ${have.length ? have.join(', ') : 'nothing'} connected.${missing.length ? ` Not connected: ${missing.join(', ')}. Numbers from those do not exist for ${b.name} yet; say so plainly instead of guessing, and you can still use brand research, other brands' data and general strategy.` : ''}`;
}

/** A brand made in Locus with no outside account yet. It files under its own id from day one. */
export async function createBrand(env, { name, internal_channel, client_channel, tz, currency }) {
  await ensureBrandTables(env);
  const nm = String(name || '').trim();
  if (!nm) throw new Error('A brand needs a name.');
  const ch = v => { const s = String(v || '').trim(); if (s && !/^[CG][A-Z0-9]{6,}$/.test(s)) throw new Error(`"${s}" is not a Slack channel id (it looks like C0123ABCD).`); return s || null; };
  const internal = ch(internal_channel), client = ch(client_channel);
  if (internal) {
    const taken = await env.DB.prepare(`SELECT name FROM brands WHERE internal_channel = ?1 AND status IN ('active', 'demo')`).bind(internal).first();
    if (taken) throw new Error(`That channel is already ${taken.name}'s internal channel.`);
  }
  const base = slugify(nm);
  let slug = base, n = 2;
  while (await env.DB.prepare(`SELECT 1 FROM brands WHERE slug = ?1`).bind(slug).first()) slug = `${base}_${n++}`;
  const id = `brand_${slug}`;
  await env.DB.prepare(`INSERT INTO brands (id, slug, name, status, tz, currency, internal_channel, client_channel, legacy_key, source)
    VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?7, ?1, 'locus')`)
    .bind(id, slug, nm, tz || 'America/Chicago', currency || 'USD', internal, client).run();
  return { id, slug, name: nm };
}

/** The key the older tables file this brand under (phase 1 and 2): its legacy_key. */
export async function legacyKeyOf(env, id) {
  const b = await brandOf(env, id);
  return b ? (b.legacy_key || b.id) : null;
}

/** Brands with their connections, for the screens and the Strategist. Never returns secrets. */
export async function listBrands(env, { includePaused = true } = {}) {
  await ensureBrandTables(env);
  const brands = (await env.DB.prepare(`SELECT * FROM brands ${includePaused ? '' : `WHERE status = 'active'`} ORDER BY status = 'active' DESC, name`).all()).results || [];
  const conns = (await env.DB.prepare(`SELECT id, brand_id, kind, external_id, label, is_primary, status, config_json, last_sync, last_error, source FROM connections ORDER BY kind, is_primary DESC`).all()).results || [];
  const by = {};
  for (const c of conns) (by[c.brand_id] ||= []).push({ ...c, config: safeJson(c.config_json, {}), config_json: undefined });
  return brands.map(b => ({ ...b, connections: by[b.id] || [] }));
}

/** Attach an outside account to a brand by hand (source 'locus', so the mirror leaves it alone). */
export async function addConnection(env, brandId, { kind, external_id, label, is_primary = 0, config = {} }) {
  await ensureBrandTables(env);
  if (!KINDS[kind]) throw new Error(`Unknown connection kind "${kind}".`);
  const ext = String(external_id || '').trim();
  if (!ext) throw new Error('external_id is required.');
  if (kind === 'meta' && !/^act_\d+$/.test(ext)) throw new Error('A Meta ad account id looks like act_123456.');
  const b = await brandOf(env, brandId);
  if (!b) throw new Error(`No brand "${brandId}".`);
  const have = await env.DB.prepare(`SELECT brand_id FROM connections WHERE kind = ?1 AND external_id = ?2`).bind(kind, ext).first();
  if (have && have.brand_id !== b.id) throw new Error(`That ${KINDS[kind]} is already connected to ${have.brand_id}.`);
  await env.DB.prepare(`INSERT INTO connections (id, brand_id, kind, external_id, label, is_primary, status, config_json, source)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'connected', ?7, 'locus')
    ON CONFLICT(kind, external_id) DO UPDATE SET label = excluded.label, is_primary = excluded.is_primary, config_json = excluded.config_json, updated_at = datetime('now')`)
    .bind(`${kind}:${ext}`, b.id, kind, ext, label || null, is_primary ? 1 : 0, JSON.stringify(config || {})).run();
  if (kind === 'meta') await env.DB.prepare(`INSERT OR IGNORE INTO brand_alias (alias, brand_id, kind) VALUES (?1, ?2, 'meta_act')`).bind(ext, b.id).run();
  return { brand: b.id, kind, external_id: ext };
}

/* ==================================================================================================
 * PHASE 3: THE BRAND IS THE RECORD (2026-10-08)
 *
 * After scripts/phase3-migrate.mjs runs:
 *   - every brand-owned table files rows under the BRAND id (brand_lucky_golf), not a Meta id. The
 *     column is still called act_id in those tables (a name only; renaming it is a later sweep).
 *   - Meta's own data stays filed under the META ad account id: META_TABLES below. A brand's Meta
 *     numbers are the sum over its Meta connections: `act_id IN ${metaOf(n)}`.
 *   - brand settings (goals, budgets, targets, channels, brief/report options) live on `brands`;
 *     `accounts` is only each Meta ad account's own sync state (cursors, last sync, last error).
 *   - `brand_accounts` is a VIEW that shows each brand in the shape the code always used (act_id =
 *     the brand id, slack_channel, brief_channel, tw_shop, goals_json, last_sync_insights...), plus
 *     `meta_act` (the primary Meta account, null when none) and `brand_id`. Read brands from the
 *     view; write brand settings to `brands`, Meta sync state to `accounts` (WHERE act_id = meta act).
 *   - the registry mirror (syncRegistry) is RETIRED: brands are the source of truth.
 * ================================================================================================== */

/* Meta's own data. Keyed by the Meta ad account id forever. Everything else with an act_id column is the brand's. */
export const META_TABLES = ['accounts', 'activities', 'ad_daily', 'ads', 'daily_insights', 'hourly_insights', 'meta_adsets', 'meta_campaigns'];

/* Brand settings that moved from accounts to brands: [column, type]. */
export const BRAND_SETTING_COLS = [
  ['monthly_budget', 'REAL'], ['budgets_json', `TEXT NOT NULL DEFAULT '{}'`], ['goals_json', `TEXT NOT NULL DEFAULT '{}'`],
  ['target_cpa', 'REAL'], ['target_roas', 'REAL'], ['google_spend_json', 'TEXT'],
  ['brief_enabled', 'INTEGER NOT NULL DEFAULT 0'], ['brief_review', 'INTEGER NOT NULL DEFAULT 0'], ['review_first', 'INTEGER NOT NULL DEFAULT 1'],
  ['report_config_json', 'TEXT'], ['tw_attr_cursor', 'TEXT'], ['tw_attr_done', 'INTEGER NOT NULL DEFAULT 0'],
  /* The folder prefix this brand's files already sit under in R2 (its old act id), so nothing is moved. */
  ['storage_prefix', 'TEXT'],
];

export async function ensureBrandColumns(env) {
  await ensureBrandTables(env);
  for (const [c, t] of BRAND_SETTING_COLS) {
    try { await env.DB.prepare(`ALTER TABLE brands ADD COLUMN ${c} ${t}`).run(); }
    catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
  }
}

/* The primary Meta account of brand b (SQL expression over alias b). Backups never count as primary. */
const PRIMARY_META = `(SELECT external_id FROM connections WHERE brand_id = b.id AND kind = 'meta' ORDER BY is_primary DESC, added_at LIMIT 1)`;

/* The brand as the code has always seen it. Keep the column list in step with the old accounts table. */
export const BRAND_VIEW_SQL = `CREATE VIEW brand_accounts AS
SELECT b.id AS act_id, b.id AS brand_id, b.name, b.currency, b.tz,
  CASE WHEN b.status = 'active' THEN 1 ELSE 0 END AS active, b.status,
  b.monthly_budget, b.budgets_json, m.account_status, b.created_at AS added_at,
  m.last_sync_insights, m.last_sync_activities, m.last_error,
  b.target_cpa, b.target_roas, b.internal_channel AS slack_channel, m.ads_backfill_done,
  (SELECT external_id FROM connections WHERE brand_id = b.id AND kind = 'triple_whale' ORDER BY is_primary DESC LIMIT 1) AS tw_shop,
  b.google_spend_json, b.goals_json, b.brief_enabled, b.client_channel AS brief_channel,
  CASE WHEN b.status = 'demo' THEN 1 ELSE 0 END AS demo,
  NULL AS report_channel, b.report_config_json, NULL AS report_client_channel, b.brief_review, b.review_first,
  m.ads_video_done, m.ads_video_cursor, m.ads_metrics_version, m.ads_metrics_cursor,
  b.tw_attr_cursor, b.tw_attr_done, ${PRIMARY_META} AS meta_act, b.storage_prefix, b.slug,
  b.internal_channel, b.client_channel
FROM brands b LEFT JOIN accounts m ON m.act_id = ${PRIMARY_META}`;

/** SQL: the Meta ad account ids of the brand bound at ?n. Use as `act_id IN ${metaOf(1)}` on META_TABLES. */
export const metaOf = n => `(SELECT external_id FROM connections WHERE brand_id = ?${n} AND kind = 'meta')`;

/** A brand id as the routes accept it (old act_ / asana_ ids are resolved to one by `resolveBrandId`). */
export const isBrandId = s => /^brand_[a-z0-9_]+$/.test(String(s || ''));

/** Any id (brand id, old act_ id, asana_ id, demo id, slug) -> the brand id, or the input when unknown ('all' stays 'all'). */
export async function resolveBrandId(env, id) {
  if (!id || id === 'all' || isBrandId(id)) return id;
  const b = await brandOf(env, id).catch(() => null);
  return b ? b.id : id;
}

/** One brand in the old shape (from the view), by any id it has ever had. */
export async function acctOf(env, id) {
  const bid = await resolveBrandId(env, id);
  if (!bid) return null;
  return env.DB.prepare(`SELECT * FROM brand_accounts WHERE act_id = ?1`).bind(bid).first();
}

/** The Meta ad accounts Locus syncs: each active (or demo) brand's Meta connections that are not a
 *  backup, with that account's own sync state. Shaped like an old accounts row (act_id = the META
 *  account id) plus brand_id, name and tz of the brand, so the Meta sync code runs unchanged. */
export async function metaSyncRows(env) {
  return ((await env.DB.prepare(`SELECT m.*, b.id AS brand_id, b.name AS name, b.tz AS tz, b.currency AS currency
      FROM connections c JOIN brands b ON b.id = c.brand_id JOIN accounts m ON m.act_id = c.external_id
     WHERE c.kind = 'meta' AND b.status = 'active' AND COALESCE(json_extract(c.config_json, '$.role'), '') <> 'backup'
     ORDER BY m.last_sync_insights`).all()).results) || [];
}

/** Set (or clear, with an empty shop) a brand's Triple Whale shop: its one triple_whale connection. */
export async function setTripleWhale(env, brandId, shop) {
  const bid = await resolveBrandId(env, brandId);
  const s = String(shop || '').trim().toLowerCase();
  await env.DB.prepare(`DELETE FROM connections WHERE brand_id = ?1 AND kind = 'triple_whale'${s ? ' AND external_id <> ?2' : ''}`).bind(...(s ? [bid, s] : [bid])).run();
  if (!s) return null;
  const other = await env.DB.prepare(`SELECT brand_id FROM connections WHERE kind = 'triple_whale' AND external_id = ?1`).bind(s).first();
  if (other && other.brand_id !== bid) throw new Error(`Triple Whale shop ${s} is already connected to ${other.brand_id}.`);
  await env.DB.prepare(`INSERT INTO connections (id, brand_id, kind, external_id, label, is_primary, status, source)
    VALUES (?1, ?2, 'triple_whale', ?3, ?3, 1, 'connected', 'locus') ON CONFLICT(kind, external_id) DO NOTHING`).bind(`triple_whale:${s}`, bid, s).run();
  return s;
}

/** The R2 folder for a brand's files: its storage_prefix (old act id, where its files already are) or its id. */
export async function storagePrefix(env, brandId) {
  const bid = await resolveBrandId(env, brandId);
  const r = await env.DB.prepare(`SELECT storage_prefix FROM brands WHERE id = ?1`).bind(bid).first().catch(() => null);
  return r?.storage_prefix || bid;
}


/* ==================================================================================================
 * PHASE 5: connections are the one source of truth for what a brand has connected.
 * Single-valued kinds (everything but meta) hold at most one connection per brand: connSet replaces it.
 * ================================================================================================== */
const SINGLE = new Set(['triple_whale', 'shopify', 'google_ads', 'ga4', 'gsc', 'tiktok', 'klaviyo', 'attentive', 'asana', 'drive', 'frame']);

/** The brand's connection of this kind (primary first), or null. */
export async function connGet(env, brandId, kind) {
  const bid = await resolveBrandId(env, brandId);
  return env.DB.prepare(`SELECT * FROM connections WHERE brand_id = ?1 AND kind = ?2 ORDER BY is_primary DESC, added_at LIMIT 1`).bind(bid, kind).first();
}

/** Connect (or re-point) this kind for the brand. Empty id = clear it. Returns the external id or null. */
export async function connSet(env, brandId, kind, externalId, { label = null, config = {} } = {}) {
  if (!KINDS[kind]) throw new Error(`Unknown connection kind "${kind}".`);
  const bid = await resolveBrandId(env, brandId);
  const ext = String(externalId ?? '').trim();
  if (!ext) { await connClear(env, bid, kind); return null; }
  if (kind === 'meta') { await addConnection(env, bid, { kind, external_id: ext, label, is_primary: 1, config }); return ext; }
  const other = await env.DB.prepare(`SELECT brand_id FROM connections WHERE kind = ?1 AND external_id = ?2`).bind(kind, ext).first();
  if (other && other.brand_id !== bid) throw new Error(`That ${KINDS[kind]} (${ext}) is already connected to ${other.brand_id}.`);
  if (SINGLE.has(kind)) await env.DB.prepare(`DELETE FROM connections WHERE brand_id = ?1 AND kind = ?2 AND external_id <> ?3`).bind(bid, kind, ext).run();
  await env.DB.prepare(`INSERT INTO connections (id, brand_id, kind, external_id, label, is_primary, status, config_json, source)
    VALUES (?1, ?2, ?3, ?4, ?5, 1, 'connected', ?6, 'locus')
    ON CONFLICT(kind, external_id) DO UPDATE SET label = COALESCE(excluded.label, connections.label), config_json = excluded.config_json,
      status = 'connected', last_error = NULL, updated_at = datetime('now')`)
    .bind(`${kind}:${ext}`, bid, kind, ext, label, JSON.stringify(config || {})).run();
  return ext;
}

/** Remove this kind (or one account of it, for meta) from the brand. */
export async function connClear(env, brandId, kind, externalId) {
  const bid = await resolveBrandId(env, brandId);
  if (externalId) await env.DB.prepare(`DELETE FROM connections WHERE brand_id = ?1 AND kind = ?2 AND external_id = ?3`).bind(bid, kind, String(externalId)).run();
  else await env.DB.prepare(`DELETE FROM connections WHERE brand_id = ?1 AND kind = ?2`).bind(bid, kind).run();
}

/** Record a sync result on a connection (status + last_sync / last_error), for the Connections page. */
export async function connStatus(env, kind, externalId, error) {
  await env.DB.prepare(`UPDATE connections SET status = ?3, last_error = ?4, last_sync = CASE WHEN ?4 IS NULL THEN datetime('now') ELSE last_sync END,
    updated_at = datetime('now') WHERE kind = ?1 AND external_id = ?2`).bind(kind, String(externalId), error ? 'error' : 'connected', error ? String(error).slice(0, 300) : null).run().catch(() => {});
}
