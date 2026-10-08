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

/* Klaviyo (2026-10) refuses additional-fields=profile_count on the LIST and SEGMENT collections;
   it is only on the single-object route. So counts are read one by one for the few that show. */
/* That route allows 1 call a second when profile_count is asked for, so they run one at a time. */
async function withCounts(key, kind, rows, max = 8) {
  const out = [];
  for (const [i, x] of rows.slice(0, max).entries()) {
    if (i) await new Promise(r => setTimeout(r, 1050));
    try { const r = await klaviyo(key, `/api/${kind}s/${x.id}/?fields[${kind}]=name&additional-fields[${kind}]=profile_count`); out.push({ ...x, profiles: r.data?.attributes?.profile_count ?? null }); }
    catch { out.push({ ...x, profiles: null }); }
  }
  return out.concat(rows.slice(max).map(x => ({ ...x, profiles: null })));
}
const ago = iso => iso ? Math.round((Date.now() - Date.parse(iso)) / 864e5) : null;
/**
 * What the Strategist reads. `what`: overview (counts + the account), lists, segments, flows,
 * campaigns (last 30 sent, with results), metrics. Everything is read live; nothing is cached.
 */
/* Reporting endpoints allow 225 calls a day per account, so every report is cached per brand
   (Locus v2, 2026-10-07): 6 hours in `settings` as `klv:<act>:<what>`. */
const KLV_TTL = 6 * 3600e3;
async function cached(env, key, fn) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
  if (row?.value) { try { const v = JSON.parse(row.value); if (v.at && Date.now() - Date.parse(v.at) < KLV_TTL) return { ...v.data, cached_at: v.at }; } catch {} }
  const data = await fn();
  if (!data?.error && !/could not be read/i.test(data?.results_note || '')) await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify({ at: new Date().toISOString(), data })).run().catch(() => {});
  return data;
}
export async function klaviyoView(env, act, what = 'overview') {
  if (what === 'campaigns' || what === 'flows_report' || what === 'overview') return cached(env, `klv:${act}:${what}`, () => klaviyoViewRaw(env, act, what));
  return klaviyoViewRaw(env, act, what);
}
async function klaviyoViewRaw(env, act, what = 'overview') {
  const doc = await keyFor(env, act);
  if (!doc?.key) return { error: 'Klaviyo is not connected for this brand. Settings > Connections > Klaviyo: paste the brand\'s private API key (Klaviyo > Settings > API keys > Create private key, read scopes).' };
  const k = doc.key;
  const base = { company: doc.company, account_id: doc.account_id, verified_at: doc.verified_at };
  if (what === 'lists') {
    const rows = await all(k, '/api/lists/?fields[list]=name,created,updated,opt_in_process');
    const lists = await withCounts(k, 'list', rows.map(x => ({ id: x.id, name: x.attributes?.name, opt_in: x.attributes?.opt_in_process, created: x.attributes?.created?.slice(0, 10) })), 15);
    return { ...base, lists };
  }
  if (what === 'segments') {
    const rows = await all(k, '/api/segments/?fields[segment]=name,created,updated,is_active,is_processing,is_starred');
    const sorted = rows.map(x => ({ id: x.id, name: x.attributes?.name, active: x.attributes?.is_active, starred: x.attributes?.is_starred, updated: x.attributes?.updated?.slice(0, 10) })).sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0));
    return { ...base, segments: await withCounts(k, 'segment', sorted, 15) };
  }
  if (what === 'flows') {
    const rows = await all(k, '/api/flows/?fields[flow]=name,status,archived,created,updated,trigger_type');
    return { ...base, flows: rows.filter(x => !x.attributes?.archived).map(x => ({ id: x.id, name: x.attributes?.name, status: x.attributes?.status, trigger: x.attributes?.trigger_type, updated: x.attributes?.updated?.slice(0, 10) })),
      how_to_read: 'status live = sending, manual = built but off, draft = unfinished. A brand with no live abandoned-cart, welcome, post-purchase or winback flow has a gap worth naming.' };
  }
  if (what === 'campaigns') {
    /* Subject lines ride along as included campaign-messages (2026-10-08, for the subject-line and send-time
       views). If Klaviyo refuses the include, the list is read without it. */
    let rows, subj = {};
    try {
      const r0 = await klaviyo(k, `/api/campaigns/?filter=${encodeURIComponent("equals(messages.channel,'email')")}&fields[campaign]=name,status,send_time,created_at,updated_at&sort=-scheduled_at&include=campaign-messages&fields[campaign-message]=definition`);
      rows = r0.data || []; let next = r0.links?.next || null; const inc = [...(r0.included || [])];
      for (let i = 0; i < 2 && next; i++) { const r1 = await klaviyo(k, next.replace(API, '')); rows.push(...(r1.data || [])); inc.push(...(r1.included || [])); next = r1.links?.next || null; }
      const msgSubj = Object.fromEntries(inc.filter(x => x.type === 'campaign-message').map(x => [x.id, x.attributes?.definition?.content?.subject || x.attributes?.content?.subject || null]));
      for (const c of rows) { const mid = c.relationships?.['campaign-messages']?.data?.[0]?.id; if (mid && msgSubj[mid]) subj[c.id] = msgSubj[mid]; }
    } catch { rows = await all(k, `/api/campaigns/?filter=${encodeURIComponent("equals(messages.channel,'email')")}&fields[campaign]=name,status,send_time,created_at,updated_at&sort=-scheduled_at`, 3); }
    const sent = rows.filter(x => x.attributes?.send_time && /^sent$/i.test(x.attributes?.status || '')).sort((a, b) => String(b.attributes.send_time).localeCompare(String(a.attributes.send_time))).slice(0, 60);
    let results = {};
    try {
      const metric = await placedOrderMetric(k);
      const filter = 'contains-any(campaign_id,[' + sent.map(x => JSON.stringify(x.id)).join(',') + '])';
      const attributes = { statistics: ['recipients', 'open_rate', 'click_rate', 'conversion_rate', 'conversion_value', 'unsubscribe_rate'], timeframe: { key: 'last_90_days' }, conversion_metric_id: metric, filter };
      const r = await klaviyo(k, '/api/campaign-values-reports/', { method: 'POST', body: { data: { type: 'campaign-values-report', attributes } } });
      for (const row of r.data?.attributes?.results || []) results[row.groupings?.campaign_id] = row.statistics;
    } catch (e) { results = { error: e.message }; }
    return { ...base, campaigns: sent.map(x => ({ id: x.id, name: x.attributes?.name, subject: subj[x.id] || null, sent: x.attributes?.send_time?.slice(0, 10), send_time: x.attributes?.send_time || null, status: x.attributes?.status, ...(results[x.id] || {}) })), results_note: results.error ? `Results could not be read: ${results.error}` : 'open_rate, click_rate, conversion_rate are fractions (0.42 = 42%); conversion_value is revenue attributed to the campaign by Klaviyo (Placed Order), not Triple Whale.' };
  }
  /* Flow results (Locus v2): one flow-values-report over the last 90 days, grouped by flow,
     with the flow names joined in. */
  if (what === 'flows_report') {
    const flows = await all(k, '/api/flows/?fields[flow]=name,status,archived,trigger_type', 3);
    const names = Object.fromEntries(flows.map(f => [f.id, { name: f.attributes?.name, status: f.attributes?.status, trigger: f.attributes?.trigger_type, archived: f.attributes?.archived }]));
    let results = [], note = '';
    try {
      const metric = await placedOrderMetric(k);
      const attributes = { statistics: ['recipients', 'delivered', 'open_rate', 'click_rate', 'conversion_rate', 'conversions', 'conversion_value', 'revenue_per_recipient', 'unsubscribe_rate', 'bounce_rate'], timeframe: { key: 'last_90_days' }, conversion_metric_id: metric };
      const r = await klaviyo(k, '/api/flow-values-reports/', { method: 'POST', body: { data: { type: 'flow-values-report', attributes } } });
      const by = {};
      for (const row of r.data?.attributes?.results || []) {
        const id = row.groupings?.flow_id; if (!id) continue;
        const st = row.statistics || {}; const b = by[id] ||= { id, ...names[id], recipients: 0, delivered: 0, conversions: 0, conversion_value: 0, opens: 0, clicks: 0, unsubs: 0, channels: new Set() };
        b.recipients += st.recipients || 0; b.delivered += st.delivered || 0; b.conversions += st.conversions || 0; b.conversion_value += st.conversion_value || 0;
        b.opens += (st.open_rate || 0) * (st.delivered || 0); b.clicks += (st.click_rate || 0) * (st.delivered || 0); b.unsubs += (st.unsubscribe_rate || 0) * (st.delivered || 0);
        if (row.groupings?.send_channel) b.channels.add(row.groupings.send_channel);
      }
      results = Object.values(by).map(b => ({ id: b.id, name: b.name || b.id, status: b.status, trigger: b.trigger, channels: [...b.channels], recipients: b.recipients, delivered: b.delivered,
        open_rate: b.delivered ? b.opens / b.delivered : null, click_rate: b.delivered ? b.clicks / b.delivered : null, conversions: b.conversions, revenue: b.conversion_value,
        revenue_per_recipient: b.recipients ? b.conversion_value / b.recipients : null, conversion_rate: b.recipients ? b.conversions / b.recipients : null, unsubscribe_rate: b.delivered ? b.unsubs / b.delivered : null }))
        .sort((x, y) => (y.revenue || 0) - (x.revenue || 0));
    } catch (e) { note = `Flow results could not be read: ${e.message}`; }
    return { ...base, flows: results, results_note: note || 'Klaviyo placed-order attribution, last 90 days. Rates are fractions.' };
  }
  if (what === 'metrics') {
    const rows = await all(k, '/api/metrics/?fields[metric]=name,integration', 3);
    return { ...base, metrics: rows.map(x => ({ id: x.id, name: x.attributes?.name, integration: x.attributes?.integration?.name })) };
  }
  const [lists0, segments0, flows] = await Promise.all([
    all(k, '/api/lists/?fields[list]=name', 2), all(k, '/api/segments/?fields[segment]=name,is_active,is_starred', 3), all(k, '/api/flows/?fields[flow]=name,status,archived,trigger_type', 3),
  ]);
  /* Counts only for the lists and the starred / first segments (one call each, cached 6h). */
  const lists = await withCounts(k, 'list', lists0.map(x => ({ id: x.id, attributes: x.attributes })), 5);
  const segments = await withCounts(k, 'segment', segments0.map(x => ({ id: x.id, attributes: x.attributes })).sort((a, b) => (b.attributes?.is_starred ? 1 : 0) - (a.attributes?.is_starred ? 1 : 0)), 4);
  const live = flows.filter(f => !f.attributes?.archived && f.attributes?.status === 'live');
  return { ...base, lists: lists.length, segments: segments.length, flows_total: flows.filter(f => !f.attributes?.archived).length, flows_live: live.length,
    live_flows: live.map(f => f.attributes?.name), biggest_lists: lists.map(x => ({ name: x.attributes?.name, profiles: x.profiles })).sort((a, b) => (b.profiles || 0) - (a.profiles || 0)).slice(0, 5),
    biggest_segments: segments.map(x => ({ name: x.attributes?.name, profiles: x.profiles })).sort((a, b) => (b.profiles || 0) - (a.profiles || 0)).slice(0, 8),
    how_to_read: `Connected as ${doc.company || 'the account'} (verified ${String(doc.verified_at || '').slice(0, 10)}, key age ${ago(doc.verified_at) ?? '?'} days). Ask for what=lists, segments, flows, campaigns or metrics for the full lists.` };
}
async function placedOrderMetric(k) {
  const rows = await all(k, '/api/metrics/?fields[metric]=name,integration', 3);
  const m = rows.find(x => x.attributes?.name === 'Placed Order' && /shopify/i.test(x.attributes?.integration?.name || '')) || rows.find(x => x.attributes?.name === 'Placed Order');
  if (!m) throw new Error('no Placed Order metric in this account');
  return m.id;
}
