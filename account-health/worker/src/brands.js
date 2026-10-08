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
 * Phase 1 (this file): the old tables are still the source of truth. `syncRegistry` mirrors them
 * here every hour and after a brand is switched on, and only ever touches what it mirrored
 * (source 'mirror'); brands and connections made in Locus (source 'locus') are left alone.
 * Plan: docs/locus-brand-first-plan.html. */

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

/* What the old tables say each brand's connections are. Pure: rows in, connection list out. */
export function derivedConnections(acct, docs, shop) {
  const out = [];
  const add = (kind, external_id, label, extra = {}) => {
    if (external_id == null || String(external_id).trim() === '') return;
    out.push({ kind, external_id: String(external_id).trim(), label: label || null, is_primary: 1, status: 'connected', config: {}, last_sync: null, last_error: null, ...extra });
  };
  if (/^act_\d+$/.test(acct.act_id)) add('meta', acct.act_id, acct.name, {
    status: acct.last_error ? 'error' : 'connected', last_sync: acct.last_sync_insights || null, last_error: acct.last_error || null });
  if (acct.tw_shop) add('triple_whale', acct.tw_shop, acct.tw_shop);
  if (shop && !shop.uninstalled_at) add('shopify', shop.shop, shop.shop, { last_sync: shop.last_sync_at || null });
  const g = docs.google || {};
  add('google_ads', g.ads, null); add('ga4', g.ga4, null); add('gsc', g.gsc, null);
  add('tiktok', (docs.tiktok || {}).advertiser_id, null);
  const k = docs.klaviyo || {};
  if (k.key) add('klaviyo', k.account_id || `klaviyo_${acct.act_id}`, k.company || null, { last_sync: k.verified_at || null });
  const a = docs.asana || {};
  add('asana', a.project_gid, a.project_name || null, { config: a.url ? { url: a.url } : {} });
  const links = docs.links || {};
  add('drive', links.drive || (docs.profile || {}).drive, null);
  add('frame', links.frame, null);
  return out;
}

const DOC_KEYS = ['google', 'tiktok', 'klaviyo', 'asana', 'links', 'profile'];

/** Mirror the old tables into brands / connections / brand_alias. Idempotent; writes only what
 *  changed, in one batch. Returns what it did. */
export async function syncRegistry(env) {
  await ensureBrandTables(env);
  const DB = env.DB;
  const accts = (await DB.prepare(`SELECT * FROM accounts WHERE active = 1 OR demo = 1`).all()).results || [];
  const docRows = (await DB.prepare(`SELECT act_id, key, data_json FROM p_br_doc WHERE line_id = '' AND key IN (${DOC_KEYS.map(k => `'${k}'`).join(',')})`).all().catch(() => ({ results: [] }))).results || [];
  const shops = (await DB.prepare(`SELECT shop, act_id, uninstalled_at, last_sync_at FROM p_shopify`).all().catch(() => ({ results: [] }))).results || [];
  const brands = (await DB.prepare(`SELECT * FROM brands`).all()).results || [];
  const aliases = (await DB.prepare(`SELECT alias, brand_id FROM brand_alias`).all()).results || [];
  const conns = (await DB.prepare(`SELECT * FROM connections`).all()).results || [];

  const docs = {};
  for (const d of docRows) (docs[d.act_id] ||= {})[d.key] = safeJson(d.data_json, {});
  const byLegacy = new Map(brands.filter(b => b.legacy_key).map(b => [b.legacy_key, b]));
  const byId = new Map(brands.map(b => [b.id, b]));
  const aliasTo = new Map(aliases.map(a => [a.alias, a.brand_id]));
  const usedSlugs = new Set(brands.map(b => b.slug));
  const connBy = new Map(conns.map(c => [`${c.kind}|${c.external_id}`, c]));

  const st = [];
  const did = { brandsAdded: [], brandsUpdated: 0, connectionsAdded: 0, connectionsUpdated: 0, connectionsRemoved: 0, conflicts: [] };
  const mirrored = new Set();

  for (const a of accts) {
    let b = byLegacy.get(a.act_id) || byId.get(aliasTo.get(a.act_id));
    const status = a.demo ? 'demo' : a.active ? 'active' : 'paused';
    const fields = { name: a.name, status, tz: a.tz || 'America/Chicago', currency: a.currency || 'USD',
      internal_channel: a.slack_channel || null, client_channel: a.brief_channel || null };
    if (!b) {
      let slug = slugify(a.name), n = 2;
      while (usedSlugs.has(slug)) slug = `${slugify(a.name)}_${n++}`;
      usedSlugs.add(slug);
      b = { id: `brand_${slug}`, slug, legacy_key: a.act_id, ...fields };
      st.push(DB.prepare(`INSERT INTO brands (id, slug, name, status, tz, currency, internal_channel, client_channel, legacy_key, source)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'mirror')`)
        .bind(b.id, slug, fields.name, status, fields.tz, fields.currency, fields.internal_channel, fields.client_channel, a.act_id));
      byLegacy.set(a.act_id, b); byId.set(b.id, b);
      did.brandsAdded.push(b.id);
    } else if (b.source !== 'locus' && Object.keys(fields).some(k => (b[k] ?? null) !== (fields[k] ?? null))) {
      st.push(DB.prepare(`UPDATE brands SET name = ?2, status = ?3, tz = ?4, currency = ?5, internal_channel = ?6, client_channel = ?7, updated_at = datetime('now') WHERE id = ?1`)
        .bind(b.id, fields.name, status, fields.tz, fields.currency, fields.internal_channel, fields.client_channel));
      did.brandsUpdated++;
    }
    if (!aliasTo.has(a.act_id)) { st.push(DB.prepare(`INSERT OR IGNORE INTO brand_alias (alias, brand_id, kind) VALUES (?1, ?2, 'meta_act')`).bind(a.act_id, b.id)); aliasTo.set(a.act_id, b.id); }

    const shop = shops.find(s => s.shop === a.tw_shop || s.act_id === a.act_id) || null;
    for (const c of derivedConnections(a, docs[a.act_id] || {}, shop)) {
      const key = `${c.kind}|${c.external_id}`;
      mirrored.add(key);
      const have = connBy.get(key);
      const cfg = JSON.stringify(c.config || {});
      if (!have) {
        st.push(DB.prepare(`INSERT INTO connections (id, brand_id, kind, external_id, label, is_primary, status, config_json, last_sync, last_error, source)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'mirror')`)
          .bind(`${c.kind}:${c.external_id}`, b.id, c.kind, c.external_id, c.label, c.is_primary, c.status, cfg, c.last_sync, c.last_error));
        connBy.set(key, { ...c, brand_id: b.id, source: 'mirror' });
        did.connectionsAdded++;
      } else if (have.brand_id !== b.id) {
        // The same outside account is on two brands in the old tables. Keep the first; say so.
        did.conflicts.push(`${c.kind} ${c.external_id} is on ${have.brand_id} and ${b.id}`);
      } else if (have.source === 'mirror' && (have.label !== c.label || have.status !== c.status || have.config_json !== cfg || (have.last_sync ?? null) !== c.last_sync || (have.last_error ?? null) !== c.last_error)) {
        st.push(DB.prepare(`UPDATE connections SET label = ?2, status = ?3, config_json = ?4, last_sync = ?5, last_error = ?6, updated_at = datetime('now') WHERE id = ?1`)
          .bind(have.id, c.label, c.status, cfg, c.last_sync, c.last_error));
        did.connectionsUpdated++;
      }
    }
  }
  // A mirrored connection whose source row is gone (a Klaviyo key forgotten, a Google id cleared).
  // Only for brands the mirror still covers, so a brand switched off keeps its record.
  const covered = new Set(accts.map(a => byLegacy.get(a.act_id)?.id).filter(Boolean));
  for (const c of conns) {
    if (c.source === 'mirror' && covered.has(c.brand_id) && !mirrored.has(`${c.kind}|${c.external_id}`)) {
      st.push(DB.prepare(`DELETE FROM connections WHERE id = ?1 AND source = 'mirror'`).bind(c.id));
      did.connectionsRemoved++;
    }
  }
  // A brand that was on and has been switched off in the old table.
  for (const b of brands) {
    if (b.source === 'mirror' && b.status === 'active' && /^act_/.test(b.legacy_key || '') && !accts.some(a => a.act_id === b.legacy_key)) {
      st.push(DB.prepare(`UPDATE brands SET status = 'paused', updated_at = datetime('now') WHERE id = ?1`).bind(b.id));
      did.brandsUpdated++;
    }
  }
  for (let i = 0; i < st.length; i += 50) await DB.batch(st.slice(i, i + 50));
  return { ...did, writes: st.length };
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
