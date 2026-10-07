/**
 * KLAVIYO, DIRECT (2026-10-07). Cole: Triple Whale only carries email totals; "how many segments do
 * we have, which flow is dead, build a segment" need Klaviyo itself, and every brand uses Klaviyo.
 *
 * One PRIVATE API KEY PER BRAND (there is no agency-wide Klaviyo access), pasted on Locus Settings >
 * Connections (PUT /api/brand-links {act, klaviyo_key}). The key is verified against GET /api/accounts/
 * before it is stored, kept in p_br_doc key 'klaviyo' {key, account_id, company, verified_at}, and
 * NEVER sent back to the browser (the report shows the company name and when it was verified).
 *
 * Reads only, for now: lists, segments (with profile counts), flows (status, trigger), campaigns
 * (recent sends with results), the account's metrics. Writes (create a segment, pause a flow) come
 * as Strategist actions once the reads are trusted.
 */
const API = 'https://a.klaviyo.com';
const REVISION = '2025-07-15';
let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };

export async function klaviyo(key, path, init = {}) {
  const res = await F(`${API}${path}`, { method: init.method || 'GET',
    headers: { Authorization: `Klaviyo-API-Key ${key}`, revision: REVISION, accept: 'application/vnd.api+json', ...(init.body ? { 'content-type': 'application/vnd.api+json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const said = data.errors?.[0]?.detail || data.errors?.[0]?.title || '';
    throw Object.assign(new Error(res.status === 401 || res.status === 403 ? `Klaviyo refused the key${said ? ` (${said})` : ''}. It must be a PRIVATE key with read scopes.` : `Klaviyo ${res.status}${said ? `: ${said}` : ''}`), { status: res.status });
  }
  return data;
}
/* Follows `links.next` up to `pages` pages. */
async function all(key, path, pages = 5) {
  const out = []; let next = `${API}${path}`;
  for (let i = 0; i < pages && next; i++) {
    const r = await klaviyo(key, next.replace(API, ''));
    out.push(...(r.data || []));
    next = r.links?.next || null;
  }
  return out;
}

/** The key must open the account; returns what the account is called. */
export async function verifyKey(key) {
  /* Only the obvious wrong thing is refused here (a 6-character PUBLIC key, or nothing); Klaviyo
     itself decides whether the key opens the account. Cole's real key was refused by a stricter
     pattern on 2026-10-07, which is worse than a wasted call. */
  const k = String(key || '').replace(/\s+/g, '');
  if (k.length < 12) throw new Error('That is too short to be a private key. A Klaviyo PRIVATE key starts with pk_ and is about 40 characters; the 6-character public key cannot read anything.');
  const r = await klaviyo(k, '/api/accounts/');
  const a = (r.data || [])[0];
  if (!a) throw new Error('The key works but opens no account.');
  return { account_id: a.id, company: a.attributes?.contact_information?.organization_name || a.attributes?.test_account === false ? (a.attributes?.contact_information?.organization_name || 'Klaviyo account') : 'Klaviyo account', timezone: a.attributes?.timezone || null, test: !!a.attributes?.test_account };
}

export async function keyFor(env, act) {
  const r = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'klaviyo'`).bind(act).first().catch(() => null);
  return safeJson(r?.data_json, null);
}
export async function storeKey(env, act, key) {
  const v = await verifyKey(key);
  await env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', 'klaviyo', ?2, 'approved', 'staff', datetime('now'))
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
    .bind(act, JSON.stringify({ key: String(key).replace(/\s+/g, ''), ...v, verified_at: new Date().toISOString() })).run();
  return v;
}
export async function forgetKey(env, act) {
  await env.DB.prepare(`DELETE FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'klaviyo'`).bind(act).run();
}

const ago = iso => iso ? Math.round((Date.now() - Date.parse(iso)) / 864e5) : null;
/**
 * What the Strategist reads. `what`: overview (counts + the account), lists, segments, flows,
 * campaigns (last 30 sent, with results), metrics. Everything is read live; nothing is cached.
 */
export async function klaviyoView(env, act, what = 'overview') {
  const doc = await keyFor(env, act);
  if (!doc?.key) return { error: 'Klaviyo is not connected for this brand. Settings > Connections > Klaviyo: paste the brand\'s private API key (Klaviyo > Settings > API keys > Create private key, read scopes).' };
  const k = doc.key;
  const base = { company: doc.company, account_id: doc.account_id, verified_at: doc.verified_at };
  if (what === 'lists') {
    const rows = await all(k, '/api/lists/?fields[list]=name,created,updated,opt_in_process&additional-fields[list]=profile_count');
    return { ...base, lists: rows.map(x => ({ id: x.id, name: x.attributes?.name, profiles: x.attributes?.profile_count ?? null, opt_in: x.attributes?.opt_in_process, created: x.attributes?.created?.slice(0, 10) })) };
  }
  if (what === 'segments') {
    const rows = await all(k, '/api/segments/?fields[segment]=name,created,updated,is_active,is_processing,is_starred&additional-fields[segment]=profile_count');
    return { ...base, segments: rows.map(x => ({ id: x.id, name: x.attributes?.name, profiles: x.attributes?.profile_count ?? null, active: x.attributes?.is_active, starred: x.attributes?.is_starred, updated: x.attributes?.updated?.slice(0, 10) })) };
  }
  if (what === 'flows') {
    const rows = await all(k, '/api/flows/?fields[flow]=name,status,archived,created,updated,trigger_type');
    return { ...base, flows: rows.filter(x => !x.attributes?.archived).map(x => ({ id: x.id, name: x.attributes?.name, status: x.attributes?.status, trigger: x.attributes?.trigger_type, updated: x.attributes?.updated?.slice(0, 10) })),
      how_to_read: 'status live = sending, manual = built but off, draft = unfinished. A brand with no live abandoned-cart, welcome, post-purchase or winback flow has a gap worth naming.' };
  }
  if (what === 'campaigns') {
    const rows = await all(k, `/api/campaigns/?filter=${encodeURIComponent("equals(messages.channel,'email')")}&fields[campaign]=name,status,send_time,created,updated&sort=-send_time`, 2);
    const sent = rows.filter(x => x.attributes?.send_time).slice(0, 30);
    let results = {};
    try {
      const metric = await placedOrderMetric(k);
      const filter = 'any(campaign_id,[' + sent.map(x => JSON.stringify(x.id)).join(',') + '])';
      const attributes = { statistics: ['recipients', 'open_rate', 'click_rate', 'conversion_rate', 'conversion_value', 'unsubscribe_rate'], timeframe: { key: 'last_90_days' }, conversion_metric_id: metric, filter };
      const r = await klaviyo(k, '/api/campaign-values-reports/', { method: 'POST', body: { data: { type: 'campaign-values-report', attributes } } });
      for (const row of r.data?.attributes?.results || []) results[row.groupings?.campaign_id] = row.statistics;
    } catch (e) { results = { error: e.message }; }
    return { ...base, campaigns: sent.map(x => ({ id: x.id, name: x.attributes?.name, sent: x.attributes?.send_time?.slice(0, 10), status: x.attributes?.status, ...(results[x.id] || {}) })), results_note: results.error ? `Results could not be read: ${results.error}` : 'open_rate, click_rate, conversion_rate are fractions (0.42 = 42%); conversion_value is revenue attributed to the campaign by Klaviyo (Placed Order), not Triple Whale.' };
  }
  if (what === 'metrics') {
    const rows = await all(k, '/api/metrics/?fields[metric]=name,integration', 3);
    return { ...base, metrics: rows.map(x => ({ id: x.id, name: x.attributes?.name, integration: x.attributes?.integration?.name })) };
  }
  const [lists, segments, flows] = await Promise.all([
    all(k, '/api/lists/?fields[list]=name&additional-fields[list]=profile_count', 2), all(k, '/api/segments/?fields[segment]=name,is_active&additional-fields[segment]=profile_count', 3), all(k, '/api/flows/?fields[flow]=name,status,archived,trigger_type', 3),
  ]);
  const live = flows.filter(f => !f.attributes?.archived && f.attributes?.status === 'live');
  return { ...base, lists: lists.length, segments: segments.length, flows_total: flows.filter(f => !f.attributes?.archived).length, flows_live: live.length,
    live_flows: live.map(f => f.attributes?.name), biggest_lists: lists.map(x => ({ name: x.attributes?.name, profiles: x.attributes?.profile_count ?? null })).sort((a, b) => (b.profiles || 0) - (a.profiles || 0)).slice(0, 5),
    biggest_segments: segments.map(x => ({ name: x.attributes?.name, profiles: x.attributes?.profile_count ?? null })).sort((a, b) => (b.profiles || 0) - (a.profiles || 0)).slice(0, 8),
    how_to_read: `Connected as ${doc.company || 'the account'} (verified ${String(doc.verified_at || '').slice(0, 10)}, key age ${ago(doc.verified_at) ?? '?'} days). Ask for what=lists, segments, flows, campaigns or metrics for the full lists.` };
}
async function placedOrderMetric(k) {
  const rows = await all(k, '/api/metrics/?fields[metric]=name,integration', 3);
  const m = rows.find(x => x.attributes?.name === 'Placed Order' && /shopify/i.test(x.attributes?.integration?.name || '')) || rows.find(x => x.attributes?.name === 'Placed Order');
  if (!m) throw new Error('no Placed Order metric in this account');
  return m.id;
}
