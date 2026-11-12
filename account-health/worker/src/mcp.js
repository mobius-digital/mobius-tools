/**
 * LOCUS MCP (2026-11-01): Claude Code reaches Locus and Mobius's Slack straight through this worker, never through
 * Cole's Chrome. Cole: "you literally made Locus, I don't understand why you don't have access to Locus."
 *
 *   POST /mcp      MCP over Streamable HTTP (JSON-RPC 2.0, plain JSON answers, no server-initiated stream)
 *   GET  /mcp      405 (nothing is pushed to the client)
 *   DELETE /mcp    204 (sessions are stateless; a client may say goodbye)
 *
 * Auth: `Authorization: Bearer <MCP_TOKEN>` (secret; the ADMIN_TOKEN works too). Cole sets the token once in his
 * Claude Code MCP config (README.md next to wrangler.toml). The endpoint sits ABOVE the brand guard, because the
 * token carries no session: every Locus call below is made AS COLE (a minted owner session, the same one Locus
 * itself would hold), so a client's limits never apply and the handlers name him.
 *
 * Locus tools are thin wrappers over the admin API: locus_get / locus_post take any route from routes.js (ah routes
 * run in-process, profit routes over the PROFIT binding), and the named helpers cover what sessions use most
 * (production cards, uploads, review links, Meta live + write, Klaviyo). Slack tools use the worker's own tokens.
 *
 * EVERY WRITE LEAVES ONE ROW in `activities` as "Claude Code (Cole)" (event_type claude_code_write), so the Change Log
 * says what a session did. A Meta write is logged by the route itself (p_meta_write + activities, with `by`
 * "Claude Code (Cole)"), so it is not logged twice here.
 *
 * Slack: an internal channel or a teammate's DM is open to the bot. A client's channel, a Slack Connect channel or a
 * guest DM is CLIENT-FACING and refused unless `as_cole: true` is passed explicitly, in which case the post goes out
 * under Cole's own name (SLACK_USER_TOKEN), never the bot's.
 */
import { ROUTES } from './routes.js';
import { search, readThread, permalink } from './slackindex.js';
import { channelOf, personOf, classify } from './slackwrite.js';
import { resolveBrandId } from './brands.js';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const VERSION = '1.0.0';
const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const AH_ORIGIN = 'https://ah.internal';
const OWNER = 'cole@go-mobius-digital.com';
const ACTOR = 'Claude Code (Cole)';
const MAX_TEXT = 60000;
/* Never through the generic door: anything that reaches a client or moves money (same list as the Strategist). */
const CLIENT_FACING = /\/api\/(report-send|brief-send|send|newclient\/(email|invoice|stripe|send|welcome)|stripe|invoice|calendar\/client|ledger\/pay|payout)/i;

const clip = (s, n) => String(s ?? '').slice(0, n);
const rpcError = (id, code, message, data) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

/* ---------------- auth ---------------- */
function tokenOk(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const tok = auth.slice(7).trim();
  if (!tok) return false;
  const same = (a, b) => {
    const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
    if (x.length !== y.length) return false;
    let r = 0; for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
    return r === 0;
  };
  return (!!env.MCP_TOKEN && same(tok, env.MCP_TOKEN)) || (!!env.ADMIN_TOKEN && same(tok, env.ADMIN_TOKEN));
}

/* ---------------- calling Locus as Cole ---------------- */
function routeOf(path) {
  const p = path.split('?')[0];
  return ROUTES.find(x => x.p === p) || ROUTES.filter(x => x.m === 'ANY' && (p === x.p || p.startsWith(x.p + '/'))).sort((a, b) => b.p.length - a.p.length)[0]
    || ROUTES.filter(x => p.startsWith(x.p + '/')).sort((a, b) => b.p.length - a.p.length)[0] || null;
}
async function ownerAuth(env, d) { return 'Bearer ' + (await d.mintSession(env, env.OWNER_EMAIL || OWNER)).token; }
/** One call to a Locus route. `raw` = a prepared body + content type (uploads). Returns the parsed JSON, or {error}. */
async function callLocus(env, d, { method = 'GET', path, body = null, raw = null, auth = null }) {
  if (!/^\/api\//.test(path)) return { error: 'Locus routes start with /api/. Call locus_routes to find the one you mean.' };
  const r = routeOf(path);
  if (!r) return { error: `No Locus route ${path.split('?')[0]}. Call locus_routes and use a path it lists.` };
  if (method !== 'GET' && CLIENT_FACING.test(path)) return { error: 'That route reaches a client or moves money. It keeps its own buttons in Locus and Slack; ask Cole to press them.' };
  const headers = { Authorization: auth || (await ownerAuth(env, d)), 'X-Via': 'claude-code' };
  let init;
  if (raw) init = { method, headers: { ...headers, 'Content-Type': raw.type, 'Content-Length': String(raw.bytes.byteLength) }, body: raw.bytes };
  else init = { method, headers: { ...headers, 'Content-Type': 'application/json' }, ...(body != null && method !== 'GET' ? { body: JSON.stringify(body) } : {}) };
  let res;
  try {
    if (r.w === 'profit') {
      if (!env.PROFIT) return { error: 'The PROFIT service binding is missing on this worker.' };
      res = await env.PROFIT.fetch(new Request(PROFIT_ORIGIN + path, init));
    } else res = await d.ahFetch(new Request(AH_ORIGIN + path, init), env);
  } catch (e) { return { error: `Locus did not answer: ${e.message}` }; }
  const text = await res.text();
  let j; try { j = JSON.parse(text); } catch { j = { text: text.slice(0, 4000) }; }
  if (!res.ok) return { error: j?.error || `HTTP ${res.status}`, status: res.status, ...(j && typeof j === 'object' && !j.error ? { body: j } : {}) };
  return j;
}
const withQuery = (path, query) => {
  if (!query || typeof query !== 'object') return path;
  const u = new URL(path, AH_ORIGIN);
  for (const [k, v] of Object.entries(query)) if (v != null && v !== '') u.searchParams.set(k, String(v));
  return u.pathname + u.search;
};

/* ---------------- brands ---------------- */
async function brands(env, d) {
  const all = await d.listAccounts(env, false);
  return all.map(a => ({ act_id: a.act_id, name: a.name, active: !!a.active, currency: a.currency || 'USD', internal_channel: a.slack_channel || null, client_channel: a.brief_channel || null, meta_act: a.meta_act || null }));
}
/** A brand by id, name, slug or part of a name. */
async function brandArg(env, d, want) {
  const w = String(want || '').trim();
  if (!w || /^(all|agency|none)$/i.test(w)) return null;
  const id = await resolveBrandId(env, w).catch(() => null);
  if (id && /^brand_/.test(id)) return id;
  const accts = await d.listAccounts(env, false);
  const lw = w.toLowerCase();
  const a = accts.find(x => x.act_id === w || x.name.toLowerCase() === lw) || accts.find(x => x.name.toLowerCase().includes(lw)) || accts.find(x => x.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(lw.replace(/[^a-z0-9]/g, '')));
  if (!a) throw new Error(`No brand called "${w}". Call locus_brands for the list.`);
  return a.act_id;
}
const needBrand = async (env, d, want) => { const id = await brandArg(env, d, want); if (!id) throw new Error('Name the brand.'); return id; };

/* ---------------- the record: one activities row per write ---------------- */
/* A key, token, secret or password in a write's body never reaches the Change Log (2026-11-05: a brand's Trybe API key
   goes through PUT /api/trybe/key). The field name decides; the value is replaced, the rest of the body is kept. */
const SECRET_FIELD = /(^|_)(key|token|secret|password|passwd|pwd|authorization)$/i;
export const bodyForLog = body => JSON.stringify(body || {}, (k, v) => (k && SECRET_FIELD.test(k) && v != null && v !== '' ? '[hidden]' : v));
async function logWrite(env, { act, summary, object, note }) {
  await env.DB.prepare(`INSERT INTO activities (id, act_id, event_time, event_type, category, summary, note, confirmed, manual, actor, object_type, object_id)
    VALUES (?1, ?2, ?3, 'claude_code_write', 'other', ?4, ?5, 1, 1, ?6, 'mcp', ?7)`)
    .bind(`manual:${crypto.randomUUID()}`, act || 'agency', new Date().toISOString(), clip(summary, 300), note ? clip(note, 2000) : null, ACTOR, object ? clip(object, 200) : null).run().catch(() => {});
}
const actOfBody = async (env, d, body, path) => {
  const u = new URL(path, AH_ORIGIN);
  const cand = body?.act || body?.act_id || body?.brand || u.searchParams.get('act') || '';
  if (!cand || cand === 'all') return null;
  return brandArg(env, d, cand).catch(() => null);
};

/* ---------------- production cards ---------------- */
/** A card by its id, or by brand + number ("Ice & Gold card 41"). */
async function cardId(env, d, { id, num, brand }) {
  if (id && !/^\d+$/.test(String(id))) return String(id);
  const n = String(num || id || '').trim();
  if (!n) throw new Error('Give the card id, or its number with the brand.');
  const act = await needBrand(env, d, brand);
  const row = await env.DB.prepare(`SELECT id FROM p_br_batch WHERE act_id = ?1 AND CAST(num AS INTEGER) = ?2 ORDER BY created_at DESC LIMIT 1`).bind(act, +n).first();
  if (!row) throw new Error(`No card number ${n} for that brand.`);
  return row.id;
}
async function fetchBytes(env, d, url, { max = 95 * 1024 * 1024 } = {}) {
  const r = await d.xfetch(url, { headers: { 'User-Agent': 'Locus/1.0 (Claude Code MCP)' } });
  if (!r.ok) throw new Error(`Could not fetch the file (HTTP ${r.status}).`);
  const len = +r.headers.get('Content-Length') || 0;
  if (len > max) throw new Error('That file is bigger than 95MB. Upload it in parts from the Files tab.');
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.byteLength > max) throw new Error('That file is bigger than 95MB. Upload it in parts from the Files tab.');
  return { bytes, type: (r.headers.get('Content-Type') || '').split(';')[0].trim() };
}
const b64bytes = s => { const bin = atob(String(s).replace(/^data:[^,]*,/, '').replace(/\s+/g, '')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const mimeOfName = name => ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' })[String(name || '').split('.').pop().toLowerCase()] || '';

/* ---------------- Slack ---------------- */
let NAMES = { at: 0, map: {} };
async function userNames(env, d) {
  if (Date.now() - NAMES.at < 10 * 60e3 && Object.keys(NAMES.map).length) return NAMES.map;
  const map = {}; let cursor = '';
  for (let i = 0; i < 5; i++) {
    const j = await d.slackApi(env, 'users.list', { limit: 1000, ...(cursor ? { cursor } : {}) });
    if (!j.ok) break;
    for (const u of j.members || []) map[u.id] = u.real_name || u.profile?.real_name || u.name || u.id;
    cursor = j.response_metadata?.next_cursor || '';
    if (!cursor) break;
  }
  if (Object.keys(map).length) NAMES = { at: Date.now(), map };
  return map;
}
const when = ts => new Date(Number(String(ts).split('.')[0]) * 1000).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const plain = s => String(s || '').replace(/<@([UW][A-Z0-9]+)(\|[^>]*)?>/g, (_, id) => `@${NAMES.map[id] || id}`).replace(/<#([CG][A-Z0-9]+)\|([^>]*)>/g, '#$2').replace(/<(https?:[^|>]+)\|([^>]*)>/g, '$2 ($1)').replace(/<(https?:[^>]+)>/g, '$1');
const slackDeps = d => ({ slack: d.slackApi, listAccounts: d.listAccounts });
async function slackUser(env, d, method, params) {
  if (!env.SLACK_USER_TOKEN) return { ok: false, error: 'no_user_token' };
  const body = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString();
  return d.xfetch(`https://slack.com/api/${method}`, { method: 'POST', headers: { Authorization: `Bearer ${env.SLACK_USER_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
}
/** Where a post goes: a channel (classified internal / client / outside) or a teammate's DM. */
async function destination(env, d, to) {
  const sd = slackDeps(d);
  const w = String(to || '').trim();
  if (!w) throw new Error('Say where: #channel, a channel id, a Slack link, or a person (@name, U id or email).');
  const dm = async () => {
    const p = await personOf(env, sd, w);
    if (p.gone || p.bot) throw new Error(`${p.name} is not someone Locus can message.`);
    const o = await d.slackApi(env, 'conversations.open', { users: p.id });
    if (!o.ok) throw new Error(`Slack refused opening a DM: ${o.error}`);
    return { id: o.channel.id, kind: p.guest ? 'outside' : 'internal', label: `a DM to ${p.name}`, brand: null };
  };
  if (/^<@|^[UW][A-Z0-9]{6,}$|^@|^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(w)) return dm();
  if (/^#|^[CDG][A-Z0-9]{6,}$|<#|archives\//i.test(w)) return classify(env, sd, (await channelOf(env, sd, w, null)).id);
  let c = null; try { c = await channelOf(env, sd, w, null); } catch {}
  return c ? classify(env, sd, c.id) : dm();
}

/* ---------------- the tools ---------------- */
function tools(d) {
  const t = (name, description, properties, required, run) => ({ def: { name, description, inputSchema: { type: 'object', properties, ...(required?.length ? { required } : {}) } }, run });
  const S = (description, extra = {}) => ({ type: 'string', description, ...extra });
  return [
    /* ---- Locus, generic ---- */
    t('locus_brands', 'Every brand Locus knows: id, name, active, currency, its internal and client Slack channel ids, its Meta ad account. Call it first when a tool wants a brand.', {}, [],
      async env => brands(env, d)),
    t('locus_routes', 'Find a Locus API route by words in its path or purpose (e.g. "production", "meta", "klaviyo", "actions"). Returns worker, method, path and what it is for. With no query, the route prefixes and how many routes each holds. Use before locus_get / locus_post on a route you are not sure of.',
      { q: S('Words to match in the path or purpose (optional).'), limit: { type: 'integer', description: 'Max routes to return (default 60).' } }, [],
      async (env, input) => {
        const q = String(input.q || '').toLowerCase().trim();
        if (!q) {
          const counts = {};
          for (const r of ROUTES) { const k = r.p.split('/').slice(0, 3).join('/'); counts[k] = (counts[k] || 0) + 1; }
          return { prefixes: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ prefix: p, routes: n })), total: ROUTES.length };
        }
        const words = q.split(/\s+/).filter(Boolean);
        const hits = ROUTES.filter(r => words.every(w => r.p.toLowerCase().includes(w) || String(r.n || '').toLowerCase().includes(w)));
        return { routes: hits.slice(0, Math.min(200, +input.limit || 60)).map(r => ({ worker: r.w, method: r.m, path: r.p, purpose: clip(r.n, 200) || undefined, file: r.f })), total: hits.length,
          note: 'method ANY = a prefix route; a listed GET may also take POST (the list is generated from the code). Routes with ?act= take a brand id from locus_brands.' };
      }),
    t('locus_get', 'GET any Locus API route as Cole (owner). Give the path from locus_routes and the query as an object (act = brand id from locus_brands).',
      { path: S('e.g. /api/production or /api/actions'), query: { type: 'object', description: 'Query string fields, e.g. {"act": "brand_lucky"}', additionalProperties: true } }, ['path'],
      async (env, input) => callLocus(env, d, { method: 'GET', path: withQuery(String(input.path || ''), input.query) })),
    t('locus_post', 'Write through any Locus API route as Cole (owner): POST by default, or PUT / DELETE. Give the path and the JSON body the screen sends. Logged in the Change Log as "Claude Code (Cole)". Routes that reach a client or move money are refused; those keep their own buttons.',
      { path: S('e.g. /api/production/move'), method: S('POST (default), PUT or DELETE', { enum: ['POST', 'PUT', 'DELETE'] }), body: { type: 'object', description: 'The JSON body.', additionalProperties: true },
        query: { type: 'object', description: 'Query string fields, if the route reads them.', additionalProperties: true }, why: S('One line on why, for the Change Log (optional).') }, ['path'],
      async (env, input) => {
        const method = ['POST', 'PUT', 'DELETE'].includes(String(input.method || '').toUpperCase()) ? String(input.method).toUpperCase() : 'POST';
        const path = withQuery(String(input.path || ''), input.query);
        const r = await callLocus(env, d, { method, path, body: input.body || {} });
        if (!r.error && !/^\/api\/meta\/(write|undo)/.test(path)) await logWrite(env, { act: await actOfBody(env, d, input.body, path), summary: `${method} ${path.split('?')[0]}${input.why ? `: ${input.why}` : ''}`, object: path.split('?')[0], note: `Body: ${clip(bodyForLog(input.body), 1500)}` });
        return r;
      }),
    /* ---- Production ---- */
    t('production_cards', 'The Production board: open cards for one brand (or every brand), with id, number, title, column (brief | making | review | ready | scheduled | live | off; a live card may carry pause {paused_on, day, of}), format, assignee, due, versions, open notes. Pass archived=true for the cards archived in the last 60 days.',
      { brand: S('Brand name or id; omit for every brand.'), archived: { type: 'boolean' } }, [],
      async (env, input) => {
        const act = await brandArg(env, d, input.brand);
        const r = await callLocus(env, d, { path: withQuery(input.archived ? '/api/production/archived' : '/api/production', { act: act || 'all' }) });
        if (r.error) return r;
        const slim = c => ({ id: c.id, num: c.num, brand: c.brand, act_id: c.act_id, title: c.title, column: c.board, format: c.format, assignee: c.assignee, due: c.due, late: c.late, launch_on: c.launch_on, versions: c.versions, open_notes: c.open_notes, needs_client: c.needs_client || undefined, verdict: c.verdict || undefined, since: c.since, archived_at: c.archived_at, pause: c.pause || undefined, off_on: c.off_on || undefined });
        return { cards: (r.cards || []).map(slim), live: r.live, today: r.today };
      }),
    t('production_card', 'One Production card in full: the brief, every file (versions, inspiration, with URLs), comments and notes, the client state. By id, or by brand + number.',
      { id: S('Card id (or a bare number with brand).'), num: { type: 'integer', description: 'Card number, with brand.' }, brand: S('Brand, when giving a number.') }, [],
      async (env, input) => callLocus(env, d, { path: withQuery('/api/production/card', { id: await cardId(env, d, input) }) })),
    t('production_create', 'Make a new Production card (a brief) for a brand, in the Brief column. Returns the card.',
      { brand: S('Brand name or id.'), title: S('The brief in one line (what to make).'), owner: S('Teammate name (optional).'), due: S('YYYY-MM-DD (optional).') }, ['brand', 'title'],
      async (env, input) => {
        const act = await needBrand(env, d, input.brand);
        const r = await callLocus(env, d, { method: 'POST', path: '/api/production/brief', body: { act, text: input.title, owner: input.owner || '', due: input.due || '' } });
        if (!r.error) await logWrite(env, { act, summary: `Production: new card "${clip(input.title, 120)}"`, object: r.id || r.card?.id || null });
        return r;
      }),
    t('production_move', 'Move a card to a column: brief, making, review, ready, scheduled, live or off (Meta moves cards after Ready on its own each hour). Moving to review posts its ads to the brand internal channel for Cole, as a drag in Locus does.',
      { id: S('Card id (or a number with brand).'), num: { type: 'integer' }, brand: S('Brand, when giving a number.'), to: S('Column', { enum: ['brief', 'making', 'review', 'ready', 'scheduled', 'live', 'off'] }) }, ['to'],
      async (env, input) => {
        const id = await cardId(env, d, input);
        const r = await callLocus(env, d, { method: 'POST', path: '/api/production/move', body: { id, to: input.to } });
        if (!r.error) await logWrite(env, { act: await cardAct(env, id), summary: `Production: card ${id} moved to ${input.to}`, object: id });
        return r;
      }),
    t('production_archive', 'Archive a card off the board (it can be put back for 60 days with restore=true).',
      { id: S('Card id (or a number with brand).'), num: { type: 'integer' }, brand: S('Brand, when giving a number.'), restore: { type: 'boolean', description: 'true = put an archived card back.' } }, [],
      async (env, input) => {
        const id = await cardId(env, d, input);
        const r = await callLocus(env, d, { method: 'POST', path: input.restore ? '/api/production/card/restore' : '/api/production/card/delete', body: { id } });
        if (!r.error) await logWrite(env, { act: await cardAct(env, id), summary: `Production: card ${id} ${input.restore ? 'put back' : 'archived'}`, object: id });
        return r;
      }),
    t('production_field', 'Change one field on a card: owner, due (YYYY-MM-DD), launch (YYYY-MM-DD), format (Static | Video | UGC | Carousel) or title.',
      { id: S('Card id (or a number with brand).'), num: { type: 'integer' }, brand: S('Brand, when giving a number.'), field: S('owner | due | launch | format | title'), value: S('The new value.') }, ['field', 'value'],
      async (env, input) => {
        const id = await cardId(env, d, input);
        const r = await callLocus(env, d, { method: 'POST', path: '/api/production/field', body: { id, field: input.field, value: input.value } });
        if (!r.error) await logWrite(env, { act: await cardAct(env, id), summary: `Production: card ${id} ${input.field} = ${clip(input.value, 80)}`, object: id });
        return r;
      }),
    t('production_upload', 'Upload a file to a card from a URL or base64: an ad version (kind version, with the ad name it belongs to), inspiration (insp) or an inline brief image (inline). Images and videos up to 95MB. Returns the file with its URLs.',
      { id: S('Card id (or a number with brand).'), num: { type: 'integer' }, brand: S('Brand, when giving a number.'), url: S('Where to fetch the file (http/https).'), base64: S('The file as base64 (instead of url).'),
        name: S('File name with extension, e.g. IG-EBF-V12.jpg'), kind: S('version (default) | insp | inline', { enum: ['version', 'insp', 'inline'] }), mime: S('Content type, when the name does not say it.'), ad: S('For a version: the ad name it belongs to (optional).') }, ['name'],
      async (env, input) => {
        const id = await cardId(env, d, input);
        let raw;
        if (input.url) raw = await fetchBytes(env, d, String(input.url));
        else if (input.base64) raw = { bytes: b64bytes(input.base64), type: '' };
        else throw new Error('Give url or base64.');
        const type = input.mime || mimeOfName(input.name) || raw.type || 'application/octet-stream';
        const r = await callLocus(env, d, { method: 'POST', path: withQuery('/api/production/upload', { id, kind: input.kind || 'version', name: input.name, ...(input.ad ? { ad: input.ad } : {}) }), raw: { bytes: raw.bytes, type } });
        if (!r.error) await logWrite(env, { act: await cardAct(env, id), summary: `Production: uploaded ${clip(input.name, 80)} (${input.kind || 'version'}) to card ${id}`, object: id, note: input.url ? `From ${clip(input.url, 300)}` : 'From base64' });
        return r;
      }),
    t('production_share', 'Mint (or return) the client review link for a card: the page the client opens to approve its ads.',
      { id: S('Card id (or a number with brand).'), num: { type: 'integer' }, brand: S('Brand, when giving a number.') }, [],
      async (env, input) => {
        const id = await cardId(env, d, input);
        const r = await callLocus(env, d, { method: 'POST', path: '/api/production/share', body: { id } });
        if (!r.error) await logWrite(env, { act: await cardAct(env, id), summary: `Production: review link minted for card ${id}`, object: id, note: r.url });
        return r;
      }),
    /* ---- Meta ---- */
    t('meta_live', 'A brand\'s Meta account live from the API: campaigns, ad sets, budgets, statuses, and whether the token may write.',
      { brand: S('Brand name or id.') }, ['brand'],
      async (env, input) => callLocus(env, d, { path: withQuery('/api/meta/live', { act: await needBrand(env, d, input.brand) }) })),
    t('meta_write', 'Change one Meta object through Locus\'s own write path (brand check, before/after, p_meta_write for undo, Change Log as "Claude Code (Cole)"). kind: pause | resume | budget | min | cap | rename | ... as /api/meta/write takes; dry=true previews without writing. Same body as the Meta tab sends.',
      { brand: S('Brand name or id.'), kind: S('pause | resume | budget | min | cap | rename (what the route accepts).'), level: S('campaign | adset | ad'), object: S('The Meta id.'), amount: { type: 'number', description: 'For budget: the new daily budget in the account currency.' },
        min: { type: 'number' }, cap: { type: 'number' }, name: S('For rename.'), dry: { type: 'boolean' }, expect: { type: 'object', additionalProperties: true, description: 'The value you expect before (the write refuses if it moved).' }, extra: { type: 'object', additionalProperties: true, description: 'Any other body fields the route takes.' } }, ['brand', 'kind', 'level', 'object'],
      async (env, input) => {
        const act = await needBrand(env, d, input.brand);
        const { brand: _b, extra, ...rest } = input;
        const body = { ...(extra || {}), ...rest, act, by: ACTOR };
        return callLocus(env, d, { method: 'POST', path: '/api/meta/write', body, auth: env.ADMIN_TOKEN ? 'Bearer ' + env.ADMIN_TOKEN : null });
      }),
    t('meta_undo', 'Undo one Meta write (within 24 hours) by its write id from meta_write or the Change Log.',
      { brand: S('Brand name or id.'), write: S('The write id (mw_...).') }, ['brand', 'write'],
      async (env, input) => callLocus(env, d, { method: 'POST', path: '/api/meta/undo', body: { act: await needBrand(env, d, input.brand), write: input.write, by: ACTOR }, auth: env.ADMIN_TOKEN ? 'Bearer ' + env.ADMIN_TOKEN : null })),
    /* ---- Klaviyo ---- */
    t('klaviyo', 'Read a brand\'s Klaviyo: the overview by default, or what = daily | flow | templates | audiences | attentive (with from / to dates or an id).',
      { brand: S('Brand name or id.'), what: S('daily | flow | templates | audiences | attentive (optional).'), from: S('YYYY-MM-DD'), to: S('YYYY-MM-DD'), id: S('A flow / template id, when what needs one.') }, ['brand'],
      async (env, input) => callLocus(env, d, { path: withQuery('/api/klaviyo', { act: await needBrand(env, d, input.brand), what: input.what, from: input.from, to: input.to, id: input.id }) })),
    /* ---- Slack ---- */
    t('slack_search', 'Search Slack: the Locus index first (every brand channel, internal and client, a year back), then Slack\'s own search as Cole when the index is thin. Give distinctive words; filter by brand, side (internal | client), person or dates. Open a hit with slack_read_thread before quoting it.',
      { q: S('The distinctive words.'), brand: S('Brand name or id (optional).'), side: S('internal | client', { enum: ['internal', 'client'] }), from: S('A person\'s name.'), after: S('YYYY-MM-DD'), before: S('YYYY-MM-DD'), limit: { type: 'integer' } }, ['q'],
      async (env, input) => search(env, d.idx, { q: input.q, brand: await brandArg(env, d, input.brand), side: input.side, from: input.from, after: input.after, before: input.before, limit: input.limit || 12 })),
    t('slack_read_thread', 'One Slack thread or message, live: every reply, who said it, files posted. Give a Slack link, or a channel id + ts.',
      { link: S('A Slack permalink.'), channel: S('Channel id.'), ts: S('Message ts.') }, [],
      async (env, input) => readThread(env, d.idx, input)),
    t('slack_read_channel', 'The newest messages in a channel (or a DM), live from Slack, newest last. #name, id, or a Slack link; limit up to 200; oldest / latest as ts or YYYY-MM-DD.',
      { channel: S('#name, channel id, Slack link, or a person (@name, U id, email) for a DM.'), limit: { type: 'integer' }, oldest: S('ts or YYYY-MM-DD'), latest: S('ts or YYYY-MM-DD') }, ['channel'],
      async (env, input) => {
        const c = await destination(env, d, input.channel);   // a channel, or a person's DM
        const tsOf = v => (!v ? undefined : /^\d{4}-\d{2}-\d{2}$/.test(v) ? String(Math.floor(Date.parse(v + 'T00:00:00-05:00') / 1000)) : String(v));
        const params = { channel: c.id, limit: Math.min(200, +input.limit || 50), ...(tsOf(input.oldest) ? { oldest: tsOf(input.oldest) } : {}), ...(tsOf(input.latest) ? { latest: tsOf(input.latest) } : {}) };
        let j = await d.slackApi(env, 'conversations.history', params);
        if (!j.ok && /not_in_channel|channel_not_found/.test(j.error || '') && env.SLACK_USER_TOKEN) j = await slackUser(env, d, 'conversations.history', params);
        if (!j.ok) return { error: `Slack refused reading that channel: ${j.error}` };
        await userNames(env, d).catch(() => ({}));
        const domain = (await d.getSetting(env, 'slackDomain').catch(() => null)) || 'mobiusdigitalhq';
        const msgs = (j.messages || []).slice().reverse().map(m => ({ ts: m.ts, when: when(m.ts), who: m.bot_id ? (m.username || m.bot_profile?.name || 'bot') : (NAMES.map[m.user] || m.user), text: clip(plain(m.text), 2500),
          replies: m.reply_count || undefined, files: (m.files || []).map(f => ({ name: f.name, type: f.mimetype, url: f.url_private })).slice(0, 10), link: permalink(domain, c.id, m.ts, m.thread_ts) }));
        return { channel: c.id, where: c.label || undefined, messages: msgs, has_more: !!j.has_more };
      }),
    t('slack_list_channels', 'The channels Locus can see, with which brand each belongs to and whether it is internal or the client\'s. Filter by words in the name.',
      { q: S('Words in the channel name (optional).') }, [],
      async (env, input) => {
        const out = []; let cursor = '';
        for (let i = 0; i < 5; i++) {
          const j = await d.slackApi(env, 'conversations.list', { types: 'public_channel,private_channel', exclude_archived: true, limit: 1000, ...(cursor ? { cursor } : {}) });
          if (!j.ok) return { error: `Slack refused: ${j.error}` };
          out.push(...(j.channels || []));
          cursor = j.response_metadata?.next_cursor || '';
          if (!cursor) break;
        }
        const accts = await d.listAccounts(env, false);
        const q = String(input.q || '').toLowerCase();
        return { channels: out.filter(c => !q || c.name.includes(q)).map(c => {
          const client = accts.find(a => a.brief_channel === c.id && a.brief_channel !== a.slack_channel), own = accts.find(a => a.slack_channel === c.id);
          return { id: c.id, name: c.name, kind: client ? 'client' : (c.is_ext_shared || c.is_shared) ? 'outside' : 'internal', brand: (client || own)?.name || undefined, private: !!c.is_private, member: c.is_member !== false, members: c.num_members };
        }).sort((a, b) => a.name.localeCompare(b.name)) };
      }),
    t('slack_post', 'Post to Slack as the Locus bot: an internal channel, a thread in one, or a teammate\'s DM. A CLIENT channel (a brand\'s client channel, a Slack Connect channel, a guest DM) is refused unless as_cole is true, which posts under Cole\'s own name instead. Never set as_cole without Cole asking for it.',
      { to: S('#channel, channel id, Slack link, or a person (@name, U id, email).'), text: S('The message (Slack mrkdwn).'), thread_ts: S('Reply in this thread (optional).'), as_cole: { type: 'boolean', description: 'Post as Cole (his user token). Required for a client-facing channel. Only when Cole said so.' } }, ['to', 'text'],
      async (env, input) => {
        const dest = await destination(env, d, input.to);
        const asCole = input.as_cole === true;
        if (dest.kind !== 'internal' && !asCole) return { error: `${dest.label} is client-facing (${dest.kind}). Nothing was posted. Pass as_cole: true only if Cole asked for this to go to the client, and it will go out under his name.` };
        const text = clip(input.text, 12000);
        const r = await d.slackPost(env, dest.id, text, null, { asUser: asCole, thread_ts: input.thread_ts || undefined, username: 'Locus' });
        const domain = (await d.getSetting(env, 'slackDomain').catch(() => null)) || 'mobiusdigitalhq';
        await logWrite(env, { act: dest.brand?.act_id || null, summary: `Slack: posted in ${dest.label}${asCole ? ' as Cole' : ''}${input.thread_ts ? ' (thread reply)' : ''}`, object: `${r.channel || dest.id}/${r.ts || ''}`, note: text });
        return { ok: true, channel: r.channel || dest.id, ts: r.ts, where: dest.label, as: asCole ? 'Cole' : 'Locus bot', link: r.ts ? permalink(domain, r.channel || dest.id, r.ts, input.thread_ts) : undefined };
      }),
  ];
}
const cardAct = async (env, id) => (await env.DB.prepare(`SELECT act_id FROM p_br_batch WHERE id = ?1`).bind(String(id)).first().catch(() => null))?.act_id || null;

/* ---------------- the protocol ---------------- */
const INSTRUCTIONS = `Locus is Mobius Digital's agency hub; this server is Claude Code's direct door to it and to Mobius's Slack, as Cole (owner). Start with locus_brands. Any route: locus_routes, then locus_get / locus_post. Production cards, uploads and review links have their own tools. Every write is logged in the Change Log as "Claude Code (Cole)". Slack: internal channels and teammates are open; a client channel needs as_cole: true, and only when Cole asked. No em dashes in anything you post.`;

export async function handleMcp(request, env, ctx, d) {
  const url = new URL(request.url);
  if (url.pathname !== '/mcp') return null;
  const reply = (obj, status = 200, headers = {}) => new Response(obj == null ? null : JSON.stringify(obj), { status, headers: { ...(obj == null ? {} : { 'Content-Type': 'application/json' }), ...headers } });
  if (!tokenOk(request, env)) return reply({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer realm="locus-mcp"' });
  if (request.method === 'DELETE') return reply(null, 204);
  if (request.method === 'GET') return reply({ error: 'This server has nothing to push; send JSON-RPC by POST.' }, 405, { Allow: 'POST, DELETE' });
  if (request.method !== 'POST') return reply({ error: 'method not allowed' }, 405, { Allow: 'POST, DELETE' });
  let body;
  try { body = await request.json(); } catch { return reply(rpcError(null, -32700, 'Parse error'), 400); }
  const msgs = Array.isArray(body) ? body : [body];
  if (!msgs.length) return reply(rpcError(null, -32600, 'Invalid request'), 400);
  const T = tools(d);
  const out = [];
  let sessionHeader = null;
  for (const m of msgs) {
    if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') { out.push(rpcError(m?.id, -32600, 'Invalid request')); continue; }
    const isNotification = m.id === undefined || m.id === null;
    if (isNotification) continue;   // notifications/initialized, notifications/cancelled: nothing to say back
    try {
      switch (m.method) {
        case 'initialize': {
          const want = String(m.params?.protocolVersion || '');
          sessionHeader = crypto.randomUUID();
          out.push(rpcResult(m.id, { protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'locus', title: 'Locus', version: VERSION }, instructions: INSTRUCTIONS }));
          break;
        }
        case 'ping': out.push(rpcResult(m.id, {})); break;
        case 'tools/list': out.push(rpcResult(m.id, { tools: T.map(x => x.def) })); break;
        case 'tools/call': {
          const name = String(m.params?.name || '');
          const tool = T.find(x => x.def.name === name);
          if (!tool) { out.push(rpcError(m.id, -32602, `Unknown tool ${name}`)); break; }
          const args = m.params?.arguments && typeof m.params.arguments === 'object' ? m.params.arguments : {};
          let result, isError = false;
          try { result = await tool.run(env, args); } catch (e) { result = { error: e.message || String(e) }; }
          if (result && typeof result === 'object' && result.error && Object.keys(result).length <= 3) isError = true;
          let text = typeof result === 'string' ? result : JSON.stringify(result ?? null);
          if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + `\n[... cut at ${MAX_TEXT} characters; ask for less (a brand, a limit) ...]`;
          out.push(rpcResult(m.id, { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) }));
          break;
        }
        case 'resources/list': out.push(rpcResult(m.id, { resources: [] })); break;
        case 'prompts/list': out.push(rpcResult(m.id, { prompts: [] })); break;
        default: out.push(rpcError(m.id, -32601, `Method not found: ${m.method}`));
      }
    } catch (e) { out.push(rpcError(m.id, -32603, e.message || 'Internal error')); }
  }
  const headers = sessionHeader ? { 'Mcp-Session-Id': sessionHeader } : {};
  if (!out.length) return reply(null, 202, headers);
  return reply(Array.isArray(body) ? out : out[0], 200, headers);
}

export const _test = { routeOf, withQuery, tools };
