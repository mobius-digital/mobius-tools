import { connSet, connClear } from './brands.js';
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
  let res;
  /* Klaviyo answers 429 with Retry-After when a burst limit is hit (reports: 1 a second, 2 a minute). A wait of a
     few seconds is worth it; a longer one is not (the caller keeps its last good copy). */
  for (let tries = 0; ; tries++) {
    res = await F(`${API}${path}`, { method: init.method || 'GET',
      headers: { Authorization: `Klaviyo-API-Key ${key}`, revision: REVISION, accept: 'application/vnd.api+json', ...(init.body ? { 'content-type': 'application/vnd.api+json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined });
    const wait = +(res.headers?.get?.('retry-after') || 0);
    if (res.status !== 429 || tries >= 2 || wait > 6) break;
    await new Promise(r => setTimeout(r, Math.max(1, wait) * 1000 + 100));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const said = data.errors?.[0]?.detail || data.errors?.[0]?.title || '';
    throw Object.assign(new Error(res.status === 401 || res.status === 403 ? `Klaviyo refused the key${said ? ` (${said})` : ''}. It must be a PRIVATE key with read scopes.` : `Klaviyo ${res.status}${said ? `: ${said}` : ''}`), { status: res.status, said });
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
  /* The connection (account id, company) lives in `connections`; the private key stays here, never there. */
  await connSet(env, act, 'klaviyo', v.account_id || `klaviyo_${act}`, { label: v.company || null });
  return v;
}
export async function forgetKey(env, act) {
  await env.DB.prepare(`DELETE FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'klaviyo'`).bind(act).run();
  await connClear(env, act, 'klaviyo');
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
/* WHY THE EMAIL SCREEN WAS SLOW AND SOMETIMES BLANK (measured 2026-10-09 on the dev worker): once the 6-hour copy
   expired, the next open read Klaviyo live: overview 8 to 10 s (profile counts are one call a second), campaigns
   15 to 28 s (three pages plus a values report). Klaviyo's reporting endpoints allow about 2 calls a minute, so the
   Email board (every brand x 3 reads at once) tripped the limit; a failed report was never stored, so every open
   retried it, slowly, and failed again. Now:
   - STALE WHILE REFRESHING: an expired copy (up to 3 days old) is answered at once and refreshed in the
     background (`waitUntil`), so only a brand's very first read ever waits on Klaviyo.
   - A refresh that fails keeps the last good copy (marked `stale`, with the reason) instead of replacing it.
   - 10 MINUTES IN MEMORY: the same read in the same isolate within 10 minutes is answered from memory and two
     callers asking at once share one Klaviyo read. A failed or partial answer is never kept there, so Retry works. */
const KLV_STALE_MAX = 3 * 24 * 3600e3, MEM_TTL = 10 * 60e3;
const MEM = new Map();
const badData = d => !d || d.error || /could not be read/i.test(d.results_note || '');
async function cached(env, key, fn, bg) {
  const m = MEM.get(key); if (m && Date.now() - m.at < MEM_TTL) return m.p;
  const p = (async () => {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
    let v = null; if (row?.value) { try { v = JSON.parse(row.value); } catch {} }
    const age = v?.at ? Date.now() - Date.parse(v.at) : Infinity;
    if (v && age < KLV_TTL) return { ...v.data, cached_at: v.at };
    const refresh = async () => {
      const data = await fn();
      if (!badData(data)) await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify({ at: new Date().toISOString(), data })).run().catch(() => {});
      return data;
    };
    const old = v && age < KLV_STALE_MAX ? v : null;
    if (old && bg) { bg(refresh().then(() => MEM.delete(key)).catch(() => {})); return { ...old.data, cached_at: old.at, stale: true }; }
    let data; try { data = await refresh(); } catch (e) { if (old) return { ...old.data, cached_at: old.at, stale: true, refresh_error: e.message }; throw e; }
    if (badData(data) && old && !data?.error) return { ...old.data, cached_at: old.at, stale: true, refresh_error: data.results_note };
    return data;
  })();
  MEM.set(key, { at: Date.now(), p });
  p.then(d => { if (badData(d)) MEM.delete(key); }, () => MEM.delete(key));
  return p;
}
/** `bg` (optional) is the request's waitUntil: with it an expired copy is answered at once and refreshed behind. */
const CACHED = new Set(['campaigns', 'flows_report', 'overview', 'daily', 'templates', 'audiences']);
/* campaigns and flows_report changed shape on 2026-10-09 (SMS, upcoming, per-message results): new keys, so a copy
   cached before the deploy is never served as the new shape. */
const ckey = (act, what) => `klv:${act}:${what}${what === 'campaigns' || what === 'flows_report' ? ':2' : ''}`;
export async function klaviyoView(env, act, what = 'overview', bg, opts = {}) {
  if (what === 'attentive') return attentiveView(env, act, opts);
  if (CACHED.has(what)) return cached(env, ckey(act, what), () => klaviyoViewRaw(env, act, what, opts), bg);
  if (what === 'flow') return cached(env, `klv:${act}:flow:${opts.id}`, () => klaviyoViewRaw(env, act, what, { ...opts, env, act }), bg);
  return klaviyoViewRaw(env, act, what, opts);
}
/** After a write, the copies that show the old state are dropped (settings row and the in-memory copy). */
export async function bust(env, act, whats = ['campaigns', 'flows_report', 'overview']) {
  for (const w of whats) {
    const key = ckey(act, w); MEM.delete(key);
    await env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(key).run().catch(() => {});
  }
  for (const k of [...MEM.keys()]) if (k.startsWith(`klv:${act}:flow:`)) MEM.delete(k);
}
async function klaviyoViewRaw(env, act, what = 'overview', opts = {}) {
  const doc = await keyFor(env, act);
  if (!doc?.key) return { error: 'Klaviyo is not connected for this brand. Brand settings > Integrations > Klaviyo: paste the brand\'s private API key (Klaviyo > Settings > API keys > Create private key, read scopes).' };
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
       views). If Klaviyo refuses the include, the list is read without it. 2026-10-09 (Email and SMS pass): SMS
       campaigns too (Klaviyo makes the channel filter compulsory, so a second list), the message id (the
       revenue-after-send line matches on it), audiences, and the campaigns not sent yet (`upcoming`: drafts and
       scheduled sends, so Locus can schedule, unschedule, cancel and duplicate them). */
    const listOf = async (channel, pages) => {
      const q = `/api/campaigns/?filter=${encodeURIComponent(`equals(messages.channel,'${channel}')`)}&fields[campaign]=name,status,send_time,scheduled_at,created_at,updated_at,audiences,send_strategy&sort=-scheduled_at`;
      let rows = [], inc = [];
      try {
        const r0 = await klaviyo(k, `${q}&include=campaign-messages&fields[campaign-message]=definition`);
        rows = r0.data || []; inc = [...(r0.included || [])]; let next = r0.links?.next || null;
        for (let i = 1; i < pages && next; i++) { const r1 = await klaviyo(k, next.replace(API, '')); rows.push(...(r1.data || [])); inc.push(...(r1.included || [])); next = r1.links?.next || null; }
      } catch (e) { if (channel === 'sms') return []; rows = await all(k, q, pages); }
      const msg = Object.fromEntries(inc.filter(x => x.type === 'campaign-message').map(x => [x.id, x.attributes?.definition || x.attributes || {}]));
      return rows.map(c => { const mid = c.relationships?.['campaign-messages']?.data?.[0]?.id || null; const m = (mid && msg[mid]) || {};
        return { c, channel, mid, subject: m.content?.subject || null, preview: m.content?.preview_text || null }; });
    };
    const [em, sm] = await Promise.all([listOf('email', 3), listOf('sms', 1)]);
    const rows = em.concat(sm);
    const isSent = x => x.c.attributes?.send_time && /^sent$/i.test(x.c.attributes?.status || '');
    const sent = rows.filter(isSent).sort((a, b) => String(b.c.attributes.send_time).localeCompare(String(a.c.attributes.send_time))).slice(0, 60);
    const upcoming = rows.filter(x => !isSent(x) && !/cancel/i.test(x.c.attributes?.status || '')).slice(0, 25);
    let results = {}; const notes = [];
    let metric = null; try { metric = await placedOrderMetric(k); } catch (e) { notes.push(e.message); }
    const report = async (list, statistics) => {
      if (!list.length || !metric) return;
      const filter = 'contains-any(campaign_id,[' + list.map(x => JSON.stringify(x.c.id)).join(',') + '])';
      const r = await klaviyo(k, '/api/campaign-values-reports/', { method: 'POST', body: { data: { type: 'campaign-values-report', attributes: { statistics, timeframe: { key: 'last_90_days' }, conversion_metric_id: metric, filter } } } });
      for (const row of r.data?.attributes?.results || []) results[row.groupings?.campaign_id] = row.statistics;
    };
    try { await report(sent.filter(x => x.channel === 'email'), ['recipients', 'delivered', 'open_rate', 'click_rate', 'conversion_rate', 'conversions', 'conversion_value', 'unsubscribe_rate', 'spam_complaint_rate', 'bounce_rate']); }
    catch (e) { results.error = e.message; }
    /* SMS has no opens or spam complaints; its own report, best effort (a refusal never sinks the email rows). */
    try { await report(sent.filter(x => x.channel === 'sms'), ['recipients', 'delivered', 'click_rate', 'conversion_rate', 'conversions', 'conversion_value', 'unsubscribe_rate']); }
    catch (e) { notes.push(`SMS results could not be read: ${e.message}`); }
    const err = results.error; delete results.error;
    const shape = x => ({ id: x.c.id, message_id: x.mid, channel: x.channel, name: x.c.attributes?.name, subject: x.subject, preview: x.preview, status: x.c.attributes?.status,
      sent: x.c.attributes?.send_time?.slice(0, 10) || null, send_time: x.c.attributes?.send_time || null, /* scheduled_at is WHEN it was scheduled; the send time is the strategy's datetime */
      send_at: x.c.attributes?.send_strategy?.datetime || x.c.attributes?.send_time || null, scheduled_at: x.c.attributes?.scheduled_at || null,
      audiences: x.c.attributes?.audiences || null });
    return { ...base, timezone: doc.timezone || null, campaigns: sent.map(x => ({ ...shape(x), ...(results[x.c.id] || {}) })), upcoming: upcoming.map(shape),
      results_note: err ? `Results could not be read: ${err}` : `open_rate, click_rate, conversion_rate are fractions (0.42 = 42%); conversion_value is revenue attributed to the campaign by Klaviyo (Placed Order), not Triple Whale.${notes.length ? ' ' + notes.join(' ') : ''}` };
  }
  /* Flow results (Locus v2): one flow-values-report over the last 90 days, grouped by flow,
     with the flow names joined in. 2026-10-09: every flow that is not archived is listed (a flow switched off
     still shows, with its status, so it can be turned back on), and each flow keeps its messages' own results. */
  if (what === 'flows_report') {
    const flows = await all(k, '/api/flows/?fields[flow]=name,status,archived,trigger_type,updated', 3);
    const names = Object.fromEntries(flows.map(f => [f.id, { name: f.attributes?.name, status: f.attributes?.status, trigger: f.attributes?.trigger_type, archived: f.attributes?.archived, updated: f.attributes?.updated?.slice(0, 10) }]));
    let note = '';
    const by = {};
    try {
      const metric = await placedOrderMetric(k);
      const attributes = { statistics: ['recipients', 'delivered', 'open_rate', 'click_rate', 'conversion_rate', 'conversions', 'conversion_value', 'revenue_per_recipient', 'unsubscribe_rate', 'bounce_rate', 'spam_complaint_rate'], timeframe: { key: 'last_90_days' }, conversion_metric_id: metric };
      const r = await klaviyo(k, '/api/flow-values-reports/', { method: 'POST', body: { data: { type: 'flow-values-report', attributes } } });
      for (const row of r.data?.attributes?.results || []) {
        const id = row.groupings?.flow_id; if (!id) continue;
        const st = row.statistics || {}; const b = by[id] ||= { id, ...names[id], recipients: 0, delivered: 0, conversions: 0, conversion_value: 0, opens: 0, clicks: 0, unsubs: 0, spam: 0, bounces: 0, channels: new Set(), messages: [] };
        b.recipients += st.recipients || 0; b.delivered += st.delivered || 0; b.conversions += st.conversions || 0; b.conversion_value += st.conversion_value || 0;
        b.opens += (st.open_rate || 0) * (st.delivered || 0); b.clicks += (st.click_rate || 0) * (st.delivered || 0); b.unsubs += (st.unsubscribe_rate || 0) * (st.delivered || 0);
        b.spam += (st.spam_complaint_rate || 0) * (st.delivered || 0); b.bounces += (st.bounce_rate || 0) * (st.recipients || 0);
        const ch = row.groupings?.send_channel; if (ch) b.channels.add(ch);
        b.messages.push({ id: row.groupings?.flow_message_id || null, channel: ch || null, recipients: st.recipients || 0, delivered: st.delivered || 0, open_rate: ch === 'sms' ? null : st.open_rate ?? null, click_rate: st.click_rate ?? null,
          conversion_rate: st.conversion_rate ?? null, conversions: st.conversions || 0, revenue: st.conversion_value || 0, revenue_per_recipient: st.revenue_per_recipient ?? (st.recipients ? (st.conversion_value || 0) / st.recipients : null), unsubscribe_rate: st.unsubscribe_rate ?? null, bounce_rate: st.bounce_rate ?? null });
      }
    } catch (e) { note = `Flow results could not be read: ${e.message}`; }
    const results = Object.values(by).map(b => ({ id: b.id, name: b.name || b.id, status: b.status, trigger: b.trigger, updated: b.updated, channels: [...b.channels], recipients: b.recipients, delivered: b.delivered,
      open_rate: b.delivered ? b.opens / b.delivered : null, click_rate: b.delivered ? b.clicks / b.delivered : null, conversions: b.conversions, revenue: b.conversion_value,
      revenue_per_recipient: b.recipients ? b.conversion_value / b.recipients : null, conversion_rate: b.recipients ? b.conversions / b.recipients : null, unsubscribe_rate: b.delivered ? b.unsubs / b.delivered : null,
      spam_rate: b.delivered ? b.spam / b.delivered : null, bounce_rate: b.recipients ? b.bounces / b.recipients : null, messages: b.messages.sort((x, y) => y.recipients - x.recipients) }));
    /* The flows that sent nothing in 90 days (off, draft, or nobody triggered them) are listed after, with their status. */
    for (const [id, f] of Object.entries(names)) if (!by[id] && !f.archived) results.push({ id, name: f.name || id, status: f.status, trigger: f.trigger, updated: f.updated, channels: [], recipients: 0, delivered: 0, revenue: 0, conversions: 0, messages: [] });
    results.sort((x, y) => (y.revenue || 0) - (x.revenue || 0) || (y.recipients || 0) - (x.recipients || 0));
    return { ...base, flows: results, results_note: note || 'Klaviyo placed-order attribution, last 90 days. Rates are fractions.' };
  }
  if (what === 'daily') return { ...base, ...(await dailyRead(k, doc.timezone || opts.tz || 'America/Chicago')) };
  if (what === 'flow') {
    /* One flow's messages, named (2026-10-09): the expand row on the Flows table. Stats come from the cached
       flows_report; names, subjects and channels from each flow-message (a few calls, cached 6 hours). */
    const id = String(opts.id || '').trim(); if (!/^[\w-]{2,40}$/.test(id)) return { error: 'Which flow? Give its id.' };
    const f = await klaviyo(k, `/api/flows/${encodeURIComponent(id)}/?fields[flow]=name,status,trigger_type,updated`);
    const rep = opts.env ? await klaviyoView(opts.env, opts.act, 'flows_report').catch(() => null) : null;
    const row = (rep?.flows || []).find(x => x.id === id);
    const msgs = (row?.messages || []).slice(0, 14).map(m => ({ ...m }));
    for (let i = 0; i < msgs.length; i += 4) await Promise.all(msgs.slice(i, i + 4).map(async m => {
      if (!m.id) return;
      try { const r = await klaviyo(k, `/api/flow-messages/${encodeURIComponent(m.id)}/`); const at = r.data?.attributes || {};
        m.name = at.name || null; m.channel = m.channel || at.channel || null; m.subject = at.content?.subject || at.definition?.content?.subject || null; }
      catch { /* the stats still show without the name */ }
    }));
    return { ...base, flow: { id, name: f.data?.attributes?.name, status: f.data?.attributes?.status, trigger: f.data?.attributes?.trigger_type, updated: f.data?.attributes?.updated?.slice(0, 10) }, messages: msgs,
      how_to_read: 'Each message of the flow, last 90 days, Klaviyo placed-order attribution. Rates are fractions.' };
  }
  if (what === 'templates') {
    const rows = await all(k, '/api/templates/?fields[template]=name,editor_type,updated&sort=-updated', 6);
    return { ...base, templates: rows.map(x => ({ id: x.id, name: x.attributes?.name, editor: x.attributes?.editor_type, updated: x.attributes?.updated?.slice(0, 10) })) };
  }
  if (what === 'audiences') {
    /* What the "New draft" form offers: every list and segment by name (no counts: they cost a call a second),
       and the account's default sender. */
    const [lists, segs, acct] = await Promise.all([all(k, '/api/lists/?fields[list]=name', 3), all(k, '/api/segments/?fields[segment]=name,is_active,is_starred', 4), klaviyo(k, '/api/accounts/').catch(() => null)]);
    const ci = acct?.data?.[0]?.attributes?.contact_information || {};
    return { ...base, timezone: doc.timezone || null, from_email: ci.default_sender_email || null, from_label: ci.default_sender_name || ci.organization_name || null,
      lists: lists.map(x => ({ id: x.id, name: x.attributes?.name })), segments: segs.filter(x => x.attributes?.is_active !== false).map(x => ({ id: x.id, name: x.attributes?.name, starred: !!x.attributes?.is_starred })) };
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
async function placedOrderMetric(k, rows0) {
  const rows = rows0 || await all(k, '/api/metrics/?fields[metric]=name,integration', 3);
  const m = rows.find(x => x.attributes?.name === 'Placed Order' && /shopify/i.test(x.attributes?.integration?.name || '')) || rows.find(x => x.attributes?.name === 'Placed Order');
  if (!m) throw new Error('no Placed Order metric in this account');
  return m.id;
}

/* ---------------- the day-by-day read (2026-10-09, the Email and SMS pass) ----------------
   Klaviyo's metric-aggregates (event time, Klaviyo's own attribution; 60 calls a minute, far looser than the
   reporting endpoints' 2 a minute). 180 days, so the screen can draw any window up to 90 days with its compare
   period behind it. One call per metric:
     Placed Order by [$attributed_channel, $attributed_flow, $attributed_message]: email vs SMS revenue, flows vs
       campaigns, and every flow's and campaign's own revenue line (the sparklines and the after-send curve);
     Received / Opened / Clicked Email, Bounced Email, Marked Email as Spam, Unsubscribed: the rate lines;
     Received / Clicked SMS; subscribed vs unsubscribed: list growth.
   Metric names differ by account age, so each is found from a list of names; a missing one is reported, not faked. */
const DAILY_DAYS = 180, ATTR_DAYS = 120;
const MET = {
  received: ['Received Email'], opened: ['Opened Email'], clicked: ['Clicked Email'], bounced: ['Bounced Email'], spam: ['Marked Email as Spam'],
  unsub: ['Unsubscribed from Email Marketing', 'Unsubscribed'], sms_received: ['Received SMS'], sms_clicked: ['Clicked SMS'],
  gained: ['Subscribed to Email Marketing', 'Subscribed to List'], lost: ['Unsubscribed from Email Marketing', 'Unsubscribed', 'Unsubscribed from List'],
  sms_gained: ['Subscribed to SMS Marketing', 'Subscribed to SMS'], sms_lost: ['Unsubscribed from SMS Marketing', 'Unsubscribed from SMS'],
};
const ymdIn = (ts, tz) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)); } catch { return new Date(ts).toISOString().slice(0, 10); } };
const addDay = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export async function agg(k, metric, measurements, from, to, tz, by) {
  const attributes = { metric_id: metric, measurements, interval: 'day', timezone: tz, page_size: 500,
    filter: [`greater-or-equal(datetime,${from}T00:00:00)`, `less-than(datetime,${addDay(to, 1)}T00:00:00)`], ...(by ? { by } : {}) };
  const out = { dates: [], data: [] };
  for (let i = 0; i < 4; i++) {
    const r = await klaviyo(k, '/api/metric-aggregates/', { method: 'POST', body: { data: { type: 'metric-aggregate', attributes } } });
    const at = r.data?.attributes || {};
    if (!out.dates.length) out.dates = (at.dates || []).map(d => String(d).slice(0, 10));
    out.data.push(...(at.data || []));
    const next = r.links?.next; const cur = next ? new URL(next, API).searchParams.get('page_cursor') : null;
    if (!cur) break; attributes.page_cursor = cur;
  }
  return out;
}
async function dailyRead(k, tz) {
  const to = ymdIn(Date.now(), tz), from = addDay(to, -(DAILY_DAYS - 1)), afrom = addDay(to, -(ATTR_DAYS - 1));
  const mrows = await all(k, '/api/metrics/?fields[metric]=name,integration', 4);
  const find = names => { for (const n of names) { const m = mrows.find(x => x.attributes?.name === n && /klaviyo/i.test(x.attributes?.integration?.name || '')) || mrows.find(x => x.attributes?.name === n); if (m) return { id: m.id, name: n }; } return null; };
  const dates = []; for (let d = from; d <= to; d = addDay(d, 1)) dates.push(d);
  const idx = Object.fromEntries(dates.map((d, i) => [d, i]));
  const rows = dates.map(date => ({ date }));
  const missing = [], used = {}, errors = [];
  const put = (key, res, meas) => { for (const g of res.data) (g.measurements?.[meas] || []).forEach((v, i) => { const j = idx[res.dates[i]]; if (j != null && v) rows[j][key] = (rows[j][key] || 0) + v; }); };
  /* 1. Placed Order, attributed. */
  let byFlow = {}, byMsg = {}, attrDates = [];
  try {
    const po = await placedOrderMetric(k, mrows);
    let res, dims = ['$attributed_channel', '$attributed_flow', '$attributed_message'];
    try { res = await agg(k, po, ['sum_value', 'count'], from, to, tz, dims); }
    catch { dims = ['$attributed_channel']; res = await agg(k, po, ['sum_value', 'count'], from, to, tz, dims); }
    const di = n => dims.indexOf(n);
    attrDates = res.dates.filter(d => d >= afrom);
    const a0 = res.dates.indexOf(attrDates[0]);
    for (const g of res.data) {
      const ch = String(g.dimensions?.[di('$attributed_channel')] || '').toLowerCase(), flow = di('$attributed_flow') >= 0 ? g.dimensions?.[di('$attributed_flow')] || '' : '', msg = di('$attributed_message') >= 0 ? g.dimensions?.[di('$attributed_message')] || '' : '';
      if (!ch && !flow && !msg) continue;   // not credited to email or SMS
      const sv = g.measurements?.sum_value || [], cn = g.measurements?.count || [];
      const chan = /sms/.test(ch) ? 'sms' : 'email';
      sv.forEach((v, i) => { const j = idx[res.dates[i]]; if (j == null || !v) return; rows[j][`rev_${chan}`] = (rows[j][`rev_${chan}`] || 0) + v; if (dims.length > 1) rows[j][flow ? 'rev_flow' : 'rev_campaign'] = (rows[j][flow ? 'rev_flow' : 'rev_campaign'] || 0) + v; });
      cn.forEach((v, i) => { const j = idx[res.dates[i]]; if (j != null && v) rows[j][`orders_${chan}`] = (rows[j][`orders_${chan}`] || 0) + v; });
      if (a0 >= 0 && dims.length > 1) {
        const tail = sv.slice(a0).map(v => Math.round((v || 0) * 100) / 100);
        if (tail.some(v => v)) { const add = (m, key) => { const t = m[key] ||= tail.map(() => 0); tail.forEach((v, i) => { t[i] = Math.round((t[i] + v) * 100) / 100; }); }; if (flow) add(byFlow, flow); else if (msg) add(byMsg, msg); }
      }
    }
    used.placed_order = 'Placed Order';
  } catch (e) { errors.push(`Placed Order: ${e.message}`); }
  /* 2. The counts, two at a time (60 a minute is the limit; a 180-day read is ~12 calls). */
  const jobs = [['received', 'count'], ['opened', 'unique'], ['clicked', 'unique'], ['bounced', 'count'], ['spam', 'count'], ['unsub', 'count'], ['sms_received', 'count'], ['sms_clicked', 'unique'], ['gained', 'count'], ['lost', 'count'], ['sms_gained', 'count'], ['sms_lost', 'count']];
  const seen = new Map();
  for (let i = 0; i < jobs.length; i += 2) await Promise.all(jobs.slice(i, i + 2).map(async ([key, meas]) => {
    const m = find(MET[key]); if (!m) { missing.push(key); return; }
    used[key] = m.name;
    try {
      const sk = `${m.id}:${meas}`; let res = seen.get(sk);
      if (!res) { res = await agg(k, m.id, [meas], from, to, tz); seen.set(sk, res); }
      put(key, res, meas);
    } catch (e) { errors.push(`${m.name}: ${e.message}`); }
  }));
  return { timezone: tz, from, to, days: rows, attr_from: attrDates[0] || afrom, attr_dates: attrDates.length, by_flow: byFlow, by_message: byMsg, metrics_used: used, metrics_missing: missing,
    ...(errors.length ? { results_note: `Some lines could not be read: ${errors.join('; ')}` } : {}),
    how_to_read: 'Day by day in the account time zone, by EVENT time (an order lands on the day it happened, not the send day). rev_* and orders_* are Klaviyo-attributed Placed Order value and count; received/opened/clicked/bounced/spam/unsub are email events (opened and clicked are unique people a day); gained/lost are subscribes and unsubscribes. by_flow and by_message are revenue per day from attr_from.' };
}

/* Attentive brands (Ice & Gold): there is no direct Attentive connection, so the Email screen shows what Triple Whale
   credits to Attentive links (tw_ad_attr, last platform click), day by day. */
async function attentiveView(env, act, opts = {}) {
  const to = /^\d{4}-\d{2}-\d{2}$/.test(opts.to || '') ? opts.to : new Date().toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(opts.from || '') ? opts.from : addDay(to, -29);
  const r = await env.DB.prepare(`SELECT t.date, SUM(t.revenue) AS revenue, SUM(t.orders) AS orders FROM tw_ad_attr t
      WHERE t.act_id IN (SELECT ?1 UNION SELECT external_id FROM connections WHERE brand_id = ?1 AND kind IN ('meta','triple_whale') UNION SELECT legacy_key FROM brands WHERE id = ?1)
      AND lower(t.platform) LIKE '%attentive%' AND t.model = 'lastPlatformClick' AND t.date BETWEEN ?2 AND ?3 GROUP BY t.date ORDER BY t.date`).bind(act, from, to).all().catch(e => ({ results: [], error: e.message }));
  const days = r.results || [];
  return { tool: 'attentive', from, to, days, revenue: days.reduce((s, x) => s + (x.revenue || 0), 0), orders: days.reduce((s, x) => s + (x.orders || 0), 0),
    how_to_read: 'Orders Triple Whale credits to an Attentive link (utm_source=attentive), last platform click. Attentive itself is not connected directly, so there are no sends, opens, journeys or list numbers.' };
}
