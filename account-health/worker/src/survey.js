/**
 * POST-PURCHASE SURVEY (2026-10-10): "how did you hear about us", from Fairing or KnoCommerce, checked against
 * Triple Whale. Cole's rule stands: Triple Whale lastPlatformClick is the attribution everywhere. This is a reality
 * CHECK on it, never a replacement: what the customer SAID for the same orders Triple Whale credited.
 *
 * FAIRING (confirmed from docs.fairing.co, "List all responses" + "The response object"):
 *   GET https://app.fairing.co/api/responses   Authorization: <secret token>   (no "Bearer")
 *   inserted_at_min / inserted_at_max (ISO UTC), sort=inserted_at_asc, limit (max 1000), cursor `starting_after`;
 *   envelope { data, next, prev } where next is the full URL of the next page. 100 requests a minute per store.
 *   Row fields used: id, inserted_at, question, question_id, response, other, other_response, order_id, customer_id.
 * KNOCOMMERCE (confirmed from Kno's own OpenAPI spec, developers.knocommerce.com, v1.3.0):
 *   POST https://api.knocommerce.com/api/oauth2/token?grant_type=client_credentials&scope=RESPONSES
 *     Authorization: Basic base64(urlencode(client_id):urlencode(client_secret))  ->  { access_token, expires_in }
 *   GET https://app-api.knocommerce.com/api/rest/responses?maxPageSize=250&expand=order&status=completed
 *     &updatedAt[gte]=...  Authorization: Bearer <token>  ->  { results, nextPageToken, hasMore }
 *   The spec types each item of a response's `response` array and its `order` only as "object", so the answer
 *   and order fields are read defensively (questionId / label / value / otherValue; order.id / order_id).
 *   Verify on the first real key: test-survey.mjs pins the shape assumed.
 *
 * Storage: the key (Fairing) or client id + secret (Kno) in p_br_doc key 'survey_fairing' / 'survey_kno', NEVER
 * returned. Answers land in D1 table survey_responses (created here at runtime), one row per answer, with the channel
 * the answer maps to. A sync runs at most every 6 hours when the card or the Strategist reads (first one: 90 days),
 * capped at 12 calls a sync. No emails are stored or returned.
 */
let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }
const FAIRING = 'https://app.fairing.co/api/responses';
const KNO_TOKEN = 'https://api.knocommerce.com/api/oauth2/token';
const KNO_API = 'https://app-api.knocommerce.com/api/rest/responses';
const SYNC_TTL = 6 * 3600e3, MAX_CALLS = 12, FIRST_DAYS = 90;
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const DOC = { fairing: 'survey_fairing', knocommerce: 'survey_kno' };
const NAME = { fairing: 'Fairing', knocommerce: 'KnoCommerce' };

async function getSetting(env, key) {
  const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
  return safeJson(r?.value, null);
}
async function putSetting(env, key, v) {
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify(v)).run().catch(() => {});
}
let tabled = false;
async function ensureTable(env) {
  if (tabled) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS survey_responses (act_id TEXT NOT NULL, provider TEXT NOT NULL, id TEXT NOT NULL,
    order_id TEXT, customer_id TEXT, date TEXT NOT NULL, question_id TEXT, question TEXT, answer TEXT, other_text TEXT, channel TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (act_id, provider, id))`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS survey_responses_q ON survey_responses (act_id, question_id, date)`).run().catch(() => {});
  tabled = true;
}

/* ---------------- channels ---------------- */
export const CHANNELS = [
  ['facebook_instagram', 'Facebook / Instagram'], ['tiktok', 'TikTok'], ['google_youtube', 'Google / YouTube'],
  ['podcast', 'Podcast'], ['word_of_mouth', 'Friend / word of mouth'], ['influencer', 'Influencer / creator'], ['other', 'Other'],
];
const LABEL = Object.fromEntries(CHANNELS);
/** An answer -> one of the seven channels. Order matters: "a golfer on YouTube" is an influencer, "YouTube ad" is YouTube. */
export function channelOf(text) {
  const s = ` ${String(text || '').toLowerCase()} `;
  if (!s.trim()) return 'other';
  if (/influenc|creator|youtuber|tiktoker|ambassador|blogger|streamer|\bpro golfer\b/.test(s)) return 'influencer';
  if (/podcast|spotify|apple podcasts|\bradio\b|sirius/.test(s)) return 'podcast';
  if (/tik ?tok/.test(s)) return 'tiktok';
  if (/facebook|instagram|\binsta\b|\bfb\b|\big\b|\bmeta\b|reels?\b/.test(s)) return 'facebook_instagram';
  if (/google|youtube|\byt\b|search engine|searched|\bsearch\b|shopping ad/.test(s)) return 'google_youtube';
  if (/friend|family|word of mouth|referr|recommend|co-?worker|colleague|buddy|husband|wife|son\b|daughter|dad\b|mom\b|brother|sister|partner|in person|playing partner|saw (it|one|someone)|on the course|golf course|\bclub(house)?\b/.test(s)) return 'word_of_mouth';
  return 'other';
}
/** Triple Whale's lastPlatformClick source (tw_orders.source) on the same scale. null = no ad click (organic / direct). */
export function twChannel(src) {
  const s = String(src || '').toLowerCase();
  if (!s || s === 'organic' || s === 'direct' || s === 'excluded') return null;
  if (s === 'meta' || /facebook|instagram/.test(s)) return 'facebook_instagram';
  if (s === 'tiktok') return 'tiktok';
  if (s === 'google' || /youtube/.test(s)) return 'google_youtube';
  return 'other_click:' + s;
}
/* Shopify order ids as Triple Whale stores them (the number): "gid://shopify/Order/123" -> "123". An order NAME (#1001) never matches. */
const orderKey = v => { const s = String(v ?? '').trim(); if (!s) return null; const m = s.match(/\/(\d+)$/); return m ? m[1] : s; };

/* ---------------- keys ---------------- */
export async function surveyDoc(env, act, provider) {
  const r = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = ?2`).bind(act, DOC[provider]).first().catch(() => null);
  return safeJson(r?.data_json, null);
}
async function putDoc(env, act, provider, d) {
  await env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', ?2, ?3, 'approved', 'staff', datetime('now'))
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).bind(act, DOC[provider], JSON.stringify(d)).run();
}
/** Which provider this brand reads (Fairing first if both were pasted), with its doc. */
async function connected(env, act) {
  for (const p of ['fairing', 'knocommerce']) { const d = await surveyDoc(env, act, p); if (d && (d.key || d.client_id)) return { provider: p, doc: d }; }
  return null;
}
/** Presence only, for Integrations. */
export async function surveyStatus(env, act) {
  const out = {};
  for (const p of ['fairing', 'knocommerce']) { const d = await surveyDoc(env, act, p); out[p] = d && (d.key || d.client_id) ? { has: true, verified_at: d.verified_at || null } : { has: false }; }
  return out;
}

async function fairingGet(url, key) {
  const res = await F(url, { headers: { Authorization: String(key).trim(), Accept: 'application/json' } });
  const txt = await res.text();
  if (!res.ok) {
    throw Object.assign(new Error(res.status === 401 ? 'Fairing refused the key. Copy the secret token again from Fairing > Account (API credentials).'
      : res.status === 429 ? 'Fairing\'s rate limit (100 a minute) was hit; it reads again on the next open.'
      : `Fairing answered ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ''}`), { status: res.status });
  }
  const j = safeJson(txt, null);
  if (!j || !Array.isArray(j.data)) throw new Error('Fairing sent something Locus does not understand.');
  return j;
}
async function knoToken(env, act, doc, { force } = {}) {
  if (!force && doc.token && doc.token_exp && Date.parse(doc.token_exp) - Date.now() > 120e3) return doc.token;
  const basic = btoa(`${encodeURIComponent(doc.client_id)}:${encodeURIComponent(doc.client_secret)}`);
  const res = await F(`${KNO_TOKEN}?grant_type=client_credentials&scope=RESPONSES`, { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials&scope=RESPONSES' });
  const txt = await res.text(), j = safeJson(txt, {});
  if (!res.ok || !j.access_token) {
    throw Object.assign(new Error(res.status === 422 ? 'KnoCommerce says API access is not on this brand\'s plan.'
      : res.status === 400 || res.status === 401 ? 'KnoCommerce refused the client ID and secret. Make a new API client in Kno > Settings > API Access with the Responses permission.'
      : `KnoCommerce answered ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ''}`), { status: res.status });
  }
  doc.token = j.access_token; doc.token_exp = new Date(Date.now() + (+j.expires_in || 3600) * 1000).toISOString();
  if (act) await putDoc(env, act, 'knocommerce', doc);
  return doc.token;
}
async function knoGet(env, act, doc, params) {
  const url = `${KNO_API}?${new URLSearchParams(params)}`;
  let tok = await knoToken(env, act, doc);
  let res = await F(url, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' } });
  if (res.status === 401) { tok = await knoToken(env, act, doc, { force: true }); res = await F(url, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' } }); }
  const txt = await res.text();
  if (!res.ok) throw Object.assign(new Error(res.status === 403 ? 'The KnoCommerce API client lacks the Responses permission.' : res.status === 429 ? 'KnoCommerce rate-limited Locus; it reads again on the next open.' : `KnoCommerce answered ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ''}`), { status: res.status });
  const j = safeJson(txt, null);
  if (!j || !Array.isArray(j.results)) throw new Error('KnoCommerce sent something Locus does not understand.');
  return j;
}

/** Paste a Fairing secret token: one real read (limit 1) before it is kept. */
export async function storeFairing(env, act, key) {
  const k = String(key || '').trim();
  if (k.length < 16) throw new Error('That is too short to be a Fairing API key. In Fairing: Account > API credentials, copy the secret token.');
  await fairingGet(`${FAIRING}?limit=1`, k);
  await putDoc(env, act, 'fairing', { key: k, verified_at: new Date().toISOString() });
  await env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(`survey:${act}:sync`).run().catch(() => {});
  return { ok: true };
}
/** Paste KnoCommerce "client_id:client_secret" (one box): a real token exchange before it is kept. */
export async function storeKno(env, act, pair) {
  const s = String(pair || '').trim(), i = s.indexOf(':');
  if (i < 1 || i === s.length - 1) throw new Error('Paste the KnoCommerce client ID and client secret together as client_id:client_secret (one colon between them).');
  const doc = { client_id: s.slice(0, i).trim(), client_secret: s.slice(i + 1).trim() };
  await knoToken(env, null, doc);
  doc.verified_at = new Date().toISOString();
  await putDoc(env, act, 'knocommerce', doc);
  await env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(`survey:${act}:sync`).run().catch(() => {});
  return { ok: true };
}
export async function forgetSurvey(env, act, provider) {
  for (const p of provider ? [provider] : ['fairing', 'knocommerce']) {
    await env.DB.prepare(`DELETE FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = ?2`).bind(act, DOC[p]).run().catch(() => {});
    await ensureTable(env); await env.DB.prepare(`DELETE FROM survey_responses WHERE act_id = ?1 AND provider = ?2`).bind(act, p).run().catch(() => {});
  }
  await env.DB.prepare(`DELETE FROM settings WHERE key IN (?1, ?2)`).bind(`survey:${act}:sync`, `survey:${act}:question`).run().catch(() => {});
}

/* ---------------- rows ---------------- */
/** Fairing response object -> our row. */
export function fromFairing(r) {
  const other = r.other ? String(r.other_response || '').trim() : '';
  const answer = String(r.response ?? '').trim();
  return { id: String(r.id), order_id: orderKey(r.order_id), customer_id: r.customer_id != null ? String(r.customer_id) : null,
    date: String(r.inserted_at || r.response_provided_at || '').slice(0, 10), question_id: r.question_id != null ? String(r.question_id) : null,
    question: String(r.question || '').slice(0, 300), answer: answer.slice(0, 300), other_text: other.slice(0, 300) || null,
    channel: channelOf(other && /^other\b/i.test(answer) ? other : `${answer} ${other}`) };
}
/** KnoCommerce response object -> one row per answered question. */
export function fromKno(r) {
  const ord = r.order || {};
  const order_id = orderKey(ord.id ?? ord.order_id ?? ord.orderId ?? ord.shopify_order_id ?? ord.name);
  const date = String(r.completed_at || r.created_at || '').slice(0, 10);
  return (Array.isArray(r.response) ? r.response : []).map((a, i) => {
    const v = Array.isArray(a.value) ? a.value.join(', ') : a.value == null ? '' : String(a.value);
    const label = a.valueLabel ?? a.answerLabel ?? a.answer ?? a.label ?? '';
    const answer = String(v && !/^[0-9a-f-]{20,}$/i.test(v) ? v : label || v).trim();
    const other = a.other ? String(a.otherValue || a.other_value || '').trim() : '';
    const qid = a.questionId ?? a.question_id ?? a.id ?? `q${i}`;
    return { id: `${r.id}:${qid}`, order_id, customer_id: r.customer_id != null ? String(r.customer_id) : null, date, question_id: String(qid),
      question: String(a.question ?? a.questionLabel ?? a.title ?? a.questionTitle ?? (a.label && a.label !== answer ? a.label : '') ?? '').slice(0, 300),
      answer: answer.slice(0, 300), other_text: other.slice(0, 300) || null, channel: channelOf(other || answer) };
  }).filter(x => x.date && (x.answer || x.other_text));
}
async function storeRows(env, act, provider, rows) {
  if (!rows.length) return 0;
  await ensureTable(env);
  for (let i = 0; i < rows.length; i += 9) {          // 11 columns -> 9 rows under D1's 100 bound parameters
    const chunk = rows.slice(i, i + 9), binds = [];
    const sql = `INSERT INTO survey_responses (act_id, provider, id, order_id, customer_id, date, question_id, question, answer, other_text, channel) VALUES `
      + chunk.map((_, n) => `(${Array.from({ length: 11 }, (_, k) => `?${n * 11 + k + 1}`).join(',')})`).join(',')
      + ` ON CONFLICT(act_id, provider, id) DO UPDATE SET order_id = excluded.order_id, answer = excluded.answer, other_text = excluded.other_text, channel = excluded.channel, question = excluded.question, synced_at = datetime('now')`;
    for (const r of chunk) binds.push(act, provider, r.id, r.order_id, r.customer_id, r.date, r.question_id, r.question, r.answer, r.other_text, r.channel);
    await env.DB.prepare(sql).bind(...binds).run();
  }
  return rows.length;
}

/** Pull what is new since the last sync (first time: 90 days). Never throws; returns {pulled, calls, error?}. */
export async function syncSurvey(env, act, { force } = {}) {
  const c = await connected(env, act); if (!c) return { error: 'not_linked' };
  const sk = `survey:${act}:sync`, st = (await getSetting(env, sk)) || {};
  if (!force && st.at && st.provider === c.provider && Date.now() - Date.parse(st.at) < SYNC_TTL) return { skipped: true, at: st.at };
  const since = st.provider === c.provider && st.since ? st.since : new Date(Date.now() - FIRST_DAYS * 864e5).toISOString();
  let calls = 0, pulled = 0, newest = since, error = null;
  try {
    if (c.provider === 'fairing') {
      let url = `${FAIRING}?${new URLSearchParams({ inserted_at_min: since, sort: 'inserted_at_asc', limit: '1000' })}`;
      while (url && calls < MAX_CALLS) {
        const j = await fairingGet(url, c.doc.key); calls++;
        const rows = j.data.map(fromFairing).filter(r => r.date);
        pulled += await storeRows(env, act, 'fairing', rows);
        for (const r of j.data) if (r.inserted_at && r.inserted_at > newest) newest = r.inserted_at;
        url = j.data.length && j.next ? j.next : null;
      }
    } else {
      let token = null;
      do {
        const p = { maxPageSize: '250', expand: 'order', status: 'completed', 'updatedAt[gte]': since };
        if (token) p.pageToken = token;
        const j = await knoGet(env, act, c.doc, p); calls++;
        for (const r of j.results) { pulled += await storeRows(env, act, 'knocommerce', fromKno(r)); const u = r.updated_at || r.completed_at; if (u && u > newest) newest = u; }
        token = j.hasMore === false ? null : j.nextPageToken || null;
      } while (token && calls < MAX_CALLS);
    }
  } catch (e) { error = e.message; }
  /* Only move the cursor forward on a clean read, so a failed page is read again next time. */
  await putSetting(env, sk, { at: new Date().toISOString(), provider: c.provider, since: error ? since : newest, calls, pulled, error });
  return { pulled, calls, error };
}

/* ---------------- the report ---------------- */
/** Which question is "how did you hear about us": the pinned one, else the question whose answers map to a channel most. */
function pickQuestion(qs, pinned) {
  if (pinned && qs.some(q => q.id === pinned)) return pinned;
  const ranked = qs.filter(q => q.n >= 5).map(q => ({ ...q, fit: q.mapped / q.n })).sort((a, b) => (b.fit - a.fit) || (b.n - a.n));
  return (ranked[0] || qs.slice().sort((a, b) => b.n - a.n)[0] || {}).id || null;
}
const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;

/** What Store > Customers and the Strategist read. Never throws for "not connected". */
export async function surveyReport(env, act, { from, to, fresh } = {}) {
  const c = await connected(env, act);
  if (!c) return { error: 'not_linked', how_to_read: 'No post-purchase survey (Fairing or KnoCommerce) is connected for this brand. Brand settings > Integrations > Fairing.' };
  const today = new Date().toISOString().slice(0, 10);
  to = /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : today;
  from = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : new Date(Date.parse(to) - 29 * 864e5).toISOString().slice(0, 10);
  const sync = await syncSurvey(env, act, { force: fresh });
  await ensureTable(env);
  const { results: qrows } = await env.DB.prepare(`SELECT question_id AS id, MAX(question) AS text, COUNT(*) AS n, SUM(CASE WHEN channel <> 'other' THEN 1 ELSE 0 END) AS mapped
    FROM survey_responses WHERE act_id = ?1 AND provider = ?2 AND date BETWEEN ?3 AND ?4 GROUP BY question_id ORDER BY n DESC`).bind(act, c.provider, from, to).all();
  const questions = (qrows || []).map(q => ({ id: q.id, text: q.text, n: q.n, mapped: q.mapped }));
  const pinned = await getSetting(env, `survey:${act}:question`);
  const qid = pickQuestion(questions, pinned);
  const st = (await getSetting(env, `survey:${act}:sync`)) || {};
  const base = { provider: c.provider, provider_name: NAME[c.provider], from, to, synced_at: st.at || null, sync_error: sync.error || null,
    questions: questions.map(({ mapped, ...q }) => q), question: qid ? { id: qid, text: (questions.find(q => q.id === qid) || {}).text || '', pinned: pinned === qid } : null };
  if (!qid) return { ...base, responses: 0, channels: [], how_to_read: 'Connected, but no answers landed in this window yet.' };

  /* Every answer to that question in the window, joined to Triple Whale's order (same order id). */
  const { results } = await env.DB.prepare(`SELECT s.channel, s.answer, s.other_text, s.order_id, o.source AS tw_source
    FROM survey_responses s LEFT JOIN tw_orders o ON o.act_id = ?1 AND o.order_id = s.order_id
    WHERE s.act_id = ?1 AND s.provider = ?2 AND s.question_id = ?3 AND s.date BETWEEN ?4 AND ?5`).bind(act, c.provider, qid, from, to).all().catch(async e => {
      if (!/no such table/i.test(e.message)) throw e;   // tw_orders missing (no Triple Whale yet): answers only
      return env.DB.prepare(`SELECT channel, answer, other_text, order_id, NULL AS tw_source FROM survey_responses WHERE act_id = ?1 AND provider = ?2 AND question_id = ?3 AND date BETWEEN ?4 AND ?5`).bind(act, c.provider, qid, from, to).all();
    });
  const rows = results || [];
  const matched = rows.filter(r => r.tw_source != null);
  const ch = Object.fromEntries(CHANNELS.map(([k]) => [k, { key: k, label: LABEL[k], said_all: 0, said: 0, tw: 0, agree: 0 }]));
  const twElse = {}; let agree = 0, paid = 0, paidAgree = 0, noClick = 0;
  const answers = {};
  for (const r of rows) {
    ch[r.channel] ? ch[r.channel].said_all++ : ch.other.said_all++;
    const a = (r.other_text || r.answer || '').trim(); if (a) { const k = a.toLowerCase(); (answers[k] ||= { answer: a, channel: r.channel, n: 0 }).n++; }
  }
  for (const r of matched) {
    const said = ch[r.channel] ? r.channel : 'other', tw = twChannel(r.tw_source);
    ch[said].said++;
    if (tw == null) { noClick++; continue; }
    if (tw.startsWith('other_click:')) { const s = tw.slice(12); twElse[s] = (twElse[s] || 0) + 1; continue; }
    ch[tw].tw++; paid++;
    if (tw === said) { ch[tw].agree++; agree++; paidAgree++; }
  }
  const M = matched.length;
  const channels = Object.values(ch).map(x => ({ ...x, said_all_share: pct(x.said_all, rows.length), said_share: pct(x.said, M), tw_share: pct(x.tw, M), gap_pts: M ? Math.round((pct(x.said, M) - pct(x.tw, M)) * 10) / 10 : null }));
  const tw_other = [{ key: 'no_click', label: 'No ad click (organic or direct)', tw: noClick, tw_share: pct(noClick, M) },
    ...Object.entries(twElse).sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ key: s, label: `${s[0].toUpperCase()}${s.slice(1)} click`, tw: n, tw_share: pct(n, M) }))];
  const top = Object.values(answers).sort((a, b) => b.n - a.n).slice(0, 25);
  return { ...base, responses: rows.length, with_order: rows.filter(r => r.order_id).length, matched: M, match_rate: pct(M, rows.length),
    agreement: pct(agree, M), agreement_paid: pct(paidAgree, paid), paid_matched: paid, thin: M < 30, channels, tw_other, answers: top,
    how_to_read: 'Post-purchase survey answers ("how did you hear about us") for the window, grouped into channels. said_all = every answer; '
      + 'said / tw / agree = only the orders Triple Whale also has (matched by order id): what the customer said, what Triple Whale lastPlatformClick credited, and both. '
      + 'agreement = % of matched orders where the two name the same channel; agreement_paid = the same over orders Triple Whale credits to Meta, TikTok or Google. '
      + 'tw_other = matched orders Triple Whale credits to no ad (organic or direct) or to a non-ad click (email, SMS...): the survey says where those people first heard. '
      + 'A survey is recall, not tracking: use it to find channels clicks miss (podcast, word of mouth, influencer, upper-funnel video) and to sanity check a platform\'s credit; Triple Whale stays the attribution. Under 30 matched orders is noise.' };
}

/** Pin the question to read (Fairing question_id or Kno questionId), or clear the pin with an empty value. */
export async function setSurveyQuestion(env, act, qid) {
  const v = String(qid ?? '').trim();
  if (!v) { await env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(`survey:${act}:question`).run().catch(() => {}); return { ok: true, question: null }; }
  await putSetting(env, `survey:${act}:question`, v);
  return { ok: true, question: v };
}
