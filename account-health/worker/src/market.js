/* THE MARKET ON A DAY (2026-10-09). "Was it us or the market?" for Home > Yesterday, the Yesterday
 * Slack post (moved.js) and the Strategist's `market` view. GET /api/market?date=YYYY-MM-DD returns
 * { date, pulse, breezeway, chatter }, three hints of different strength:
 *
 *   pulse      Mobius Pulse (our own outage monitor, mobius-ad-status worker): platform incidents that
 *              overlapped the date (a US Central day) and any platform not operational right now.
 *              Pulse keeps its last 60 status CHANGES, newest first, not intervals: they are paired
 *              here per platform + service (operational -> degraded/outage opens, -> operational
 *              closes). History reaches back about ten days; `covered` says whether the date is inside it.
 *              AI tools (OpenAI, Anthropic) are left out: they do not move ad results.
 *   breezeway  Breezeway's public "headwinds" file: one Meta cost-per-purchase score a day across about
 *              50 of their own customers (NORMAL / BAD / VERY BAD). Unofficial; a hint, not a verdict.
 *              Cached a UTC day in settings `breezeway:<UTC date>` (last 60 days only, ~15KB).
 *   chatter    Claude Haiku with web search, asked ONCE per date whether advertisers on X, Reddit or in
 *              the news reported Meta or Google Ads problems that day. Cached forever in settings
 *              `chatter:<date>`; a failure is stored too and retried at most once an hour. Only for a
 *              finished day (before today, Central) in the last 30 days. Switch: settings
 *              `marketChatter` ('off' stops new calls; on by default). About 3 to 5 cents a date.
 *
 * Nothing here posts or writes anything but its own cache rows. */
let F = fetch;
export function useFetch(f) { F = f; }
/* Pulse is a worker on the same account, so its workers.dev URL is refused from here (2026-10-10: the Strategist said
   "Pulse returned an error"). The PULSE service binding reaches it; meterEnv hands it over at every entry point. */
let PULSE = null;
export function usePulse(b) { if (b && typeof b.fetch === 'function') PULSE = b; }

const PULSE_URL = 'https://mobius-ad-status.mobius-digital.workers.dev/api/status';
const BREEZEWAY_URL = 'https://headwinds.s3.us-east-1.amazonaws.com/cpa_z_data.json';
export const BREEZEWAY_NOTE = 'Breezeway: Meta cost per purchase across about 50 of their own customers, one score for the whole panel. Unofficial public file; a hint, not a verdict.';
/* The cheapest Haiku already used in this worker (the Strategist's reply gate). */
const CHATTER_MODEL = 'claude-haiku-4-5-20251001';
const PRICE = { in: 1, out: 5, search: 0.01 };   // $ per million tokens; $ per search
const AI = /^(openai|anthropic)$/;
const TZ = 'America/Chicago';

const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const getS = async (env, k) => (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null))?.value || null;
const putS = (env, k, v) => env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, v).run().catch(() => {});
const ymd = (d = new Date(), tz = TZ) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(`${s}T12:00:00Z`));
export const centralToday = () => ymd();
const noDash = s => String(s || '').replace(/\s*[\u2014\u2013]\s*/g, ', ');

/** Midnight Central at the start of `date`, as epoch ms (05:00 or 06:00 UTC depending on DST). */
function centralStart(date) {
  for (const h of [5, 6]) {
    const t = Date.parse(`${date}T0${h}:00:00Z`);
    const hr = +new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date(t)) % 24;
    if (hr === 0 && ymd(new Date(t)) === date) return t;
  }
  return Date.parse(`${date}T06:00:00Z`);
}

/* ---------------- Pulse ---------------- */
let pulseMemo = null;   // { at, j } per isolate, 5 minutes: the Yesterday grid asks for several dates at once
async function pulseJson() {
  if (pulseMemo && Date.now() - pulseMemo.at < 5 * 60e3) return pulseMemo.j;
  const r = PULSE ? await PULSE.fetch(new Request(PULSE_URL, { headers: { accept: 'application/json' } })) : await F(PULSE_URL, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`Pulse answered ${r.status}`);
  const j = await r.json();
  pulseMemo = { at: Date.now(), j };
  return j;
}
const RANK = { operational: 0, degraded: 1, maintenance: 1, outage: 2 };
/** Pulse's status changes paired into intervals per platform + service. */
export function pulseIntervals(incidents) {
  const ev = [...(incidents || [])].filter(i => i && i.ts && !AI.test(i.platformId || '')).sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
  const open = new Map(), out = [];
  for (const i of ev) {
    const k = `${i.platformId}|${i.service}`;
    let cur = open.get(k);
    if (i.to === 'operational') {
      /* A close with no open: it started before Pulse's history begins. */
      if (!cur) cur = { platform_id: i.platformId, platform: i.platform, service: i.service, state: i.from, note: i.note, start: null };
      cur.end = i.ts; out.push(cur); open.delete(k); continue;
    }
    if (!cur) { cur = { platform_id: i.platformId, platform: i.platform, service: i.service, state: i.to, note: i.note, start: i.from === 'operational' ? i.ts : null, end: null }; open.set(k, cur); }
    else if ((RANK[i.to] || 1) > (RANK[cur.state] || 1)) { cur.state = i.to; cur.note = i.note || cur.note; }
  }
  for (const v of open.values()) out.push(v);
  return out;
}
/** Meta's WhatsApp / messaging services never move ad results. */
const adsRelated = x => !(x.platform_id === 'meta' && /whatsapp|messenger|messaging/i.test(`${x.service} ${x.note}`));

export async function pulseFor(env, date) {
  try {
    const j = await pulseJson();
    const s = centralStart(date), e = centralStart(addDays(date, 1));
    const all = j.incidents || [];
    const from = all.reduce((m, i) => (!m || i.ts < m ? i.ts : m), null);
    const incidents = pulseIntervals(all)
      .filter(x => (x.start ? Date.parse(x.start) : -Infinity) < e && (x.end ? Date.parse(x.end) : Infinity) > s)
      .map(x => ({ platform: x.platform, platform_id: x.platform_id, service: x.service, title: `${x.platform}: ${x.service}, ${x.state === 'outage' ? 'outage' : x.note || x.state}`,
        state: x.state, start: x.start, end: x.end, ads_related: adsRelated(x) }));
    const now = (j.platforms || []).filter(p => p.state && p.state.worst && p.state.worst !== 'operational' && !AI.test(p.id))
      .map(p => ({ platform: p.name, platform_id: p.id, state: p.state.worst, link: p.link,
        services: Object.values(p.state.services || {}).filter(v => v.state !== 'operational').map(v => v.name) }));
    return { as_of: j.lastRun || null, history_from: from, covered: !!from && Date.parse(from) <= s, incidents, now,
      meta_outage: incidents.some(x => x.platform_id === 'meta' && x.ads_related),
      google_outage: incidents.some(x => x.platform_id === 'google-ads') };
  } catch (e) { return { error: e.message, incidents: [], now: [] }; }
}

/* ---------------- Breezeway ---------------- */
async function breezewayRows(env, date) {
  const today = new Date().toISOString().slice(0, 10), key = `breezeway:${today}`;
  let c = safeJson(await getS(env, key), null);
  const last = c?.rows?.length ? c.rows[c.rows.length - 1].date : null;
  const first = c?.rows?.length ? c.rows[0].date : null;
  /* Fresh enough: the cache has the date, or the date is newer than the file and we looked within the hour. */
  if (c && (date <= last && date >= first || date > last && Date.now() - Date.parse(c.at) < 3600e3)) return { rows: c.rows, at: c.at };
  const r = await F(BREEZEWAY_URL, { headers: { accept: 'application/json' } });
  if (!r.ok) { if (c) return { rows: c.rows, at: c.at, stale: `Breezeway answered ${r.status}` }; throw new Error(`Breezeway answered ${r.status}`); }
  const all = (await r.json() || []).filter(x => x && isDate(x.date)).sort((a, b) => a.date < b.date ? -1 : 1);
  const at = new Date().toISOString();
  await putS(env, key, JSON.stringify({ at, rows: all.slice(-60) }));
  await env.DB.prepare(`DELETE FROM settings WHERE key LIKE 'breezeway:%' AND key != ?1`).bind(key).run().catch(() => {});
  /* An older date than the cache keeps: answered from the full file this once, not cached. */
  return { rows: all, at };
}
export async function breezewayFor(env, date) {
  try {
    const { rows, at, stale } = await breezewayRows(env, date);
    const x = rows.find(r => r.date === date) || null;
    return { entry: x, status: x?.hyb_status || null, latest: rows.length ? rows[rows.length - 1].date : null, fetched_at: at, ...(stale ? { stale } : {}), note: BREEZEWAY_NOTE };
  } catch (e) { return { entry: null, status: null, error: e.message, note: BREEZEWAY_NOTE }; }
}

/* ---------------- Chatter (Claude + web search, once per date) ---------------- */
const CHATTER_SYSTEM = `You check whether online advertisers reported problems with Meta Ads or Google Ads on one specific day.
Search X/Twitter, Reddit (r/FacebookAds, r/PPC, r/googleads) and ad industry news. Count only reports dated that day or clearly describing that day: delivery stopped or slowed, CPMs or costs spiking, conversions or tracking missing, Ads Manager or Google Ads down, spend running away. Several independent reports = issues. One isolated complaint, or nothing found = normal.
Reply with JSON only, no other text:
{"meta": "normal" | "issues", "google": "normal" | "issues", "summary": "one plain sentence a media buyer would say", "sources": [{"title": "...", "url": "..."}]}
At most 4 sources, only pages you actually found. Plain words, no em dashes.`;

async function askChatter(env, date) {
  const nice = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  /* Cole's list of advertisers he follows on X (settings marketHandles, comma separated), checked first when set. */
  const handles = String((await getS(env, 'marketHandles')) || '').split(/[,\s]+/).map(h => h.trim().replace(/^@?/, '@')).filter(h => h.length > 1).slice(0, 12);
  const messages = [{ role: 'user', content: `The day: ${nice} (${date}), US time. Did advertisers report Meta Ads or Google Ads problems that day?${handles.length ? ` Look first at what these advertisers posted on X around that day: ${handles.join(', ')}.` : ''}` }];
  const use = { in: 0, out: 0, searches: 0 };
  let last = null;
  for (let turn = 0; turn < 3; turn++) {
    const res = await F('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: CHATTER_MODEL, max_tokens: 1500, system: CHATTER_SYSTEM, messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error?.message || `Claude API HTTP ${res.status}`);
    const u = j.usage || {};
    use.in += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    use.out += u.output_tokens || 0;
    use.searches += u.server_tool_use?.web_search_requests || 0;
    last = j;
    if (j.stop_reason !== 'pause_turn') break;
    /* A long search turn: hand the partial answer back and let it finish. */
    if (messages.length > 1) messages.pop();
    messages.push({ role: 'assistant', content: j.content });
  }
  const cost = Math.round((use.in / 1e6 * PRICE.in + use.out / 1e6 * PRICE.out + use.searches * PRICE.search) * 10000) / 10000;
  if (last?.stop_reason === 'refusal') throw Object.assign(new Error('Claude declined the search'), { cost });
  const text = (last?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const a = text.indexOf('{'), z = text.lastIndexOf('}');
  const p = a >= 0 ? safeJson(text.slice(a, z + 1), null) : null;
  if (!p) throw Object.assign(new Error('The answer was not readable JSON'), { cost });
  /* Sources: the model's, else the pages the search returned. */
  let sources = (Array.isArray(p.sources) ? p.sources : []).filter(s => s && /^https?:\/\//.test(s.url || '')).map(s => ({ title: noDash(String(s.title || s.url).slice(0, 140)), url: String(s.url) }));
  if (!sources.length) for (const b of last.content || []) if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url) sources.push({ title: noDash(String(r.title || r.url).slice(0, 140)), url: r.url });
  return { meta: p.meta === 'issues' ? 'issues' : 'normal', google: p.google === 'issues' ? 'issues' : 'normal',
    summary: noDash(String(p.summary || '').slice(0, 300)), sources: sources.slice(0, 4), cost, searches: use.searches, model: CHATTER_MODEL };
}

/** The chatter for one date. `call: false` only reads the cache (the cron path never spends). */
export async function chatterFor(env, date, { call = true } = {}) {
  const key = `chatter:${date}`;
  const c = safeJson(await getS(env, key), null);
  if (c?.status === 'ok') return { status: 'ok', ...c.data, asked_at: c.at };
  if ((await getS(env, 'marketChatter')) === 'off') return { status: 'off', note: 'Switched off in Settings (marketChatter).' };
  const today = centralToday();
  if (date >= today) return { status: 'not yet', note: 'Asked once the day is over.' };
  if (date < addDays(today, -30)) return { status: 'too old', note: 'Only asked for the last 30 days.' };
  if (c?.status === 'pending' && Date.now() - Date.parse(c.at) < 3 * 60e3) return { status: 'pending', note: 'Being asked right now.' };
  if (c?.status === 'error' && Date.now() - Date.parse(c.at) < 3600e3) return { status: 'error', error: c.error, asked_at: c.at, retry_after: new Date(Date.parse(c.at) + 3600e3).toISOString() };
  if (!call) return { status: 'not asked' };
  if (!env.ANTHROPIC_API_KEY) return { status: 'error', error: 'ANTHROPIC_API_KEY is not set on the account-health worker.' };
  /* Claimed before the call, so two screens opening at once never pay twice. */
  await putS(env, key, JSON.stringify({ status: 'pending', at: new Date().toISOString(), tries: (c?.tries || 0) + 1 }));
  try {
    const data = await askChatter(env, date);
    const at = new Date().toISOString();
    await putS(env, key, JSON.stringify({ status: 'ok', at, data, tries: (c?.tries || 0) + 1 }));
    console.log(`market chatter ${date}: meta ${data.meta}, google ${data.google}, $${data.cost} (${data.searches} searches)`);
    return { status: 'ok', ...data, asked_at: at };
  } catch (e) {
    const at = new Date().toISOString();
    await putS(env, key, JSON.stringify({ status: 'error', at, error: e.message, cost: e.cost || 0, tries: (c?.tries || 0) + 1 }));
    console.log(`market chatter ${date} failed: ${e.message}`);
    return { status: 'error', error: e.message, asked_at: at };
  }
}

/** GET /api/market and the Strategist's `market` view. */
export async function marketFor(env, date, { call = true } = {}) {
  if (!isDate(date)) date = addDays(centralToday(), -1);
  const [pulse, breezeway, chatter] = await Promise.all([pulseFor(env, date), breezewayFor(env, date), chatterFor(env, date, { call })]);
  return { date, pulse, breezeway, chatter };
}

/** One plain line for the Yesterday post when the market looked bad that day, else null. Pulse and
 *  Breezeway only (never a Claude call). `memo` is a Map the caller keeps for one tick. */
export async function marketLine(env, date, memo) {
  if (memo?.has(date)) return memo.get(date);
  const [p, b] = await Promise.all([pulseFor(env, date), breezewayFor(env, date)]);
  const bits = [];
  const meta = (p.incidents || []).filter(x => x.platform_id === 'meta' && x.ads_related);
  if (meta.length) bits.push(`Meta reported ${meta.some(x => x.state === 'outage') ? 'an outage' : 'a problem'} that day (${[...new Set(meta.map(x => x.service))].slice(0, 2).join(', ')})`);
  if (b.status === 'BAD' || b.status === 'VERY BAD') bits.push(`Breezeway called it a ${b.status === 'VERY BAD' ? 'very bad' : 'bad'} Meta day across their panel (a hint, not proof)`);
  const line = bits.length ? `Market: ${bits.join('. ')}.` : null;
  memo?.set(date, line);
  return line;
}

/* ---------------- WAS IT A BAD DAY ON META? (2026-10-09, Cole: "the goal is Breezeway's: was it a bad day on Meta,
 * open to everybody", not a report card per brand). One answer per day from FOUR independent signs:
 *   ours       our own brands' Meta cost per purchase against each brand's last 28 days, averaged across brands
 *              (Breezeway's method on our accounts). Meta's own purchase count on purpose: this measures Meta's
 *              auction that day, and Triple Whale's credit lands a day late. "High" = in our top 15% of days.
 *   breezeway  their public panel says BAD or VERY BAD (bigger panel, but it called 28 of 125 days bad).
 *   outage     Meta posted an ads-related problem on its status page (Pulse).
 *   chatter    advertisers on X / Reddit reported problems (latest days only; Claude web search, cached).
 * Calibrated on Feb to Oct 2026: ours and Breezeway agreed on only ~1 in 4 of their bad days, so one sign alone is
 * "mixed", TWO OR MORE = a bad day on Meta (about once a month), three or more, or ours in its top 1%, = very bad.
 * GET /api/metaday?days=30. Objects carry act_id = brand id, so brandguard shows a client only their own brand. */
const META_SKIP = /golf sock|harborline|galway|instyler|gum of gods|judy ?p|le ?pickle|popby/i;
const lstat = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return { m, s: Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length) || 1e-9 }; };
export async function metaDay(env, { days = 30 } = {}) {
  const today = centralToday(), last = addDays(today, -1), first = addDays(last, -(days - 1)), from = addDays(last, -240);
  const { results: conns } = await env.DB.prepare(`SELECT c.brand_id, c.external_id, b.name FROM connections c JOIN brands b ON b.id = c.brand_id
    WHERE c.kind = 'meta' AND c.status != 'backup' AND b.status = 'active'`).all();
  const brandOf = {}, nameOf = {};
  for (const c of conns || []) { if (META_SKIP.test(c.name || '')) continue; brandOf[c.external_id] = c.brand_id; nameOf[c.brand_id] = c.name; }
  const acts = Object.keys(brandOf);
  const B = {};
  if (acts.length) {
    const { results } = await env.DB.prepare(`SELECT act_id, date, spend, impressions, link_clicks, purchases FROM daily_insights WHERE date BETWEEN ?1 AND ?2 AND act_id IN (${acts.map((_, i) => `?${i + 3}`).join(',')})`).bind(from, last, ...acts).all();
    for (const r of results || []) { const b = brandOf[r.act_id]; const o = ((B[b] ??= {})[r.date] ??= { s: 0, i: 0, c: 0, p: 0 }); o.s += r.spend || 0; o.i += r.impressions || 0; o.c += r.link_clicks || 0; o.p += r.purchases || 0; }
  }
  const lcpa = x => Math.log(x.s / (x.p + 0.5)), lcpm = x => x.i ? Math.log(x.s / x.i * 1000) : null;
  const zOf = (days2, d, f) => { const x = days2[d]; if (!x || x.s < 50) return null; const v = f(x); if (v == null) return null;
    const base = Array.from({ length: 28 }, (_, i) => days2[addDays(d, -1 - i)]).filter(y => y && y.s >= 50).map(f).filter(y => y != null);
    if (base.length < 15) return null; const { m, s } = lstat(base); return { z: (v - m) / s, change: Math.exp(v - m) - 1 }; };
  const panel = d => { const zs = [], cpm = []; for (const days2 of Object.values(B)) { const a = zOf(days2, d, lcpa); if (a) zs.push(a.z); const c = zOf(days2, d, lcpm); if (c) cpm.push(c.change); }
    return zs.length >= 3 ? { score: zs.reduce((s, x) => s + x, 0) / zs.length, n: zs.length, worse: zs.filter(z => z >= 1).length, cpm: cpm.length ? cpm.reduce((s, x) => s + x, 0) / cpm.length : null } : null; };
  /* thresholds from our own history (fallbacks measured 2026-10-09: p85 0.6, p99 1.23) */
  const hist = []; for (let d = addDays(last, -180); d <= last; d = addDays(d, 1)) { const p = panel(d); if (p) hist.push(p.score); }
  hist.sort((a, b) => a - b);
  const q = p => hist[Math.floor(p * (hist.length - 1))];
  const hi = hist.length >= 60 ? q(0.85) : 0.6, top = hist.length >= 60 ? q(0.99) : 1.23;
  let bw = []; try { bw = (await breezewayRows(env, last)).rows; } catch {}
  const BW = Object.fromEntries(bw.map(x => [x.date, x.hyb_status]));
  let ints = []; try { ints = pulseIntervals((await pulseJson()).incidents).filter(x => x.platform_id === 'meta' && adsRelated(x)); } catch {}
  const out = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const p = panel(d), s = centralStart(d), e = centralStart(addDays(d, 1));
    const outage = ints.filter(x => (x.start ? Date.parse(x.start) : -Infinity) < e && (x.end ? Date.parse(x.end) : Infinity) > s);
    const ch = safeJson(await getS(env, `chatter:${d}`), null);
    const chat = ch?.status === 'ok' ? ch.data : null;
    const signs = {
      ours: p ? { high: p.score >= hi, score: Math.round(p.score * 100) / 100, brands: p.n, worse: p.worse, cpm_change: p.cpm } : null,
      breezeway: BW[d] || null,
      outage: outage.length ? outage.map(x => `${x.service}: ${x.state === 'outage' ? 'outage' : x.note || x.state}`) : [],
      chatter: chat ? { issues: chat.meta === 'issues', summary: chat.summary, sources: chat.sources || [] } : null,
    };
    const hits = [signs.ours?.high, signs.breezeway && signs.breezeway !== 'NORMAL', signs.outage.length > 0, signs.chatter?.issues].filter(Boolean).length;
    const verdict = hits >= 3 || (hits >= 2 && p && p.score >= top) ? 'vbad' : hits >= 2 ? 'bad' : hits === 1 ? 'mixed' : 'normal';
    out.push({ date: d, verdict, hits, signs });
  }
  /* the latest day, brand by brand (Meta's numbers, so a brand can see whether it followed the market) */
  const brands = Object.entries(B).map(([b, days2]) => { const x = days2[last], a = zOf(days2, last, lcpa);
    const base = Array.from({ length: 28 }, (_, i) => days2[addDays(last, -1 - i)]).filter(y => y && y.s >= 50);
    const cpaN = base.length ? base.reduce((t, y) => t + y.s, 0) / Math.max(1, base.reduce((t, y) => t + y.p, 0)) : null;
    return x && x.s >= 50 ? { act_id: b, name: nameOf[b], spend: Math.round(x.s), cpa: x.p ? Math.round(x.s / x.p) : null, cpa_normal: cpaN ? Math.round(cpaN) : null, change: a ? Math.round(a.change * 100) / 100 : null, unusual: !!a && a.z >= 1 } : null; }).filter(Boolean)
    .sort((x, y) => (y.change ?? -9) - (x.change ?? -9));
  return { as_of: new Date().toISOString(), days: out, latest: out[out.length - 1] || null, brands, thresholds: { high: Math.round(hi * 100) / 100, top: Math.round(top * 100) / 100, history_days: hist.length },
    how: 'A bad day on Meta when two or more of four signs agree: our brands paying more per sale than usual (top 15% of days), other advertisers (Breezeway) calling it bad, Meta posting a problem, and advertisers reporting problems online. One sign = mixed.' };
}
