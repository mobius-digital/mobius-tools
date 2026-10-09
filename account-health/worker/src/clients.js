/**
 * CLIENT LOGINS (2026-10-09). A client is an email (any domain, Google sign-in) tied to one or more brands,
 * read-only. Who may do what is decided in brandguard.js (the allowlist); this file is the records, the
 * invite email and the client-safe Strategist.
 *
 *   settings.clientUsers  = { email: { brands: [brand_x], name, invited_at, invited_by, last_invite,
 *                                       last_sign_in, last_seen, welcomed_at } }
 *   settings.clientAccess = { brand_x: { pl, strategist, changes, creators } }   (all off by default)
 *
 * Routes (mounted in worker.js before the admin gate; each checks its own caller):
 *   GET  /api/clients?act=            team: the client logins (a limited teammate sees only their brands' rows)
 *   GET  /api/clients/draft           team: the invite email text for {brands, name, email}
 *   POST /api/clients/invite          OWNER: add or update clients and, with send:true + approved:true, email them
 *   POST /api/clients/remove          OWNER: {email, brand?} take one brand or the whole login away
 *   PUT  /api/clients/access          OWNER: {act, pl?, strategist?, changes?, creators?}
 *   GET  /api/clients/me              the signed-in client: their brands, switches, creator link
 *   PUT  /api/clients/me              the signed-in client: {name?, welcomed?} (their own profile only)
 * Nothing here sends anything unless the owner pressed Send on text they saw (the New client rule).
 */
import { sendMail } from './mail.js';
import { clientOf, clientScope, brandsFor, CLIENT_SWITCHES } from './brandguard.js';

const OWNER = 'cole@go-mobius-digital.com';
const DOMAIN = 'go-mobius-digital.com';
export const LOCUS_URL = 'https://tools.go-mobius-digital.com/profit/';
const lower = s => String(s || '').trim().toLowerCase();
const emailOk = e => /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(e);
const firstName = s => String(s || '').trim().split(/\s+/)[0] || '';

async function getJson(env, key, dflt) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
  try { const v = JSON.parse(row?.value || ''); return v == null ? dflt : v; } catch { return dflt; }
}
async function putJson(env, key, v) {
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify(v)).run();
}
async function brandNames(env, ids) {
  if (!ids.length) return {};
  const ph = ids.map((_, i) => `?${i + 1}`).join(',');
  const rows = (await env.DB.prepare(`SELECT id, name FROM brands WHERE id IN (${ph})`).bind(...ids).all().catch(() => ({ results: [] }))).results || [];
  return Object.fromEntries(rows.map(r => [r.id, r.name]));
}

/* ---------------- the invite email ---------------- */
export function inviteDraft({ brands = [], name = '', email = '' }) {
  const list = brands.filter(Boolean);
  const what = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0] || 'your brand';
  const hi = firstName(name) || 'there';
  const who = email || 'the email this was sent to';
  return {
    subject: `Your Locus login for ${list.length === 1 ? list[0] : 'your brands'}`,
    body: `Hi ${hi},

You now have your own login to Locus, the dashboard we use to run ${what}. It shows the numbers we look at every day: sales, ad spend and results by channel, email and SMS, your store, the marketing calendar and the reports we send you.

To sign in:
- Open ${LOCUS_URL}
- Press Continue with Google and pick ${who}

If ${who} is not a Google account yet, you can still use it: on Google's sign-in screen choose Create account, then "Use my current email address instead". It takes a minute and needs no Gmail.

On the calendar you can add your own dates (a launch, a sale, an event) and leave a note on ours. Everything else is read-only, so there is nothing you can break.

Any question, ask us in Slack or reply to this email.

Talk soon,`,
  };
}

/* ---------------- records ---------------- */
async function teamGuests(env) { return ((await getJson(env, 'allowedEmails', [])) || []).map(lower); }

/** Add brands to (or create) one client login. Returns an error string or null. */
async function upsertClient(env, email, brands, by, name) {
  const e = lower(email);
  if (!emailOk(e)) return `${email || 'That'} does not look like an email address.`;
  if (e.endsWith('@' + DOMAIN) || e === lower(env.OWNER_EMAIL || OWNER)) return `${e} is a Mobius account. Mobius people go in Team and access, not here.`;
  if ((await teamGuests(env)).includes(e)) return `${e} is on the team list (Team and access). Remove them there first if they should be a client.`;
  const users = (await getJson(env, 'clientUsers', {})) || {};
  const cur = users[e] && typeof users[e] === 'object' ? users[e] : { invited_at: new Date().toISOString(), invited_by: by || 'admin' };
  cur.brands = [...new Set([...(Array.isArray(cur.brands) ? cur.brands : []), ...brands])];
  if (name && !cur.name) cur.name = String(name).trim().slice(0, 80);
  users[e] = cur;
  await putJson(env, 'clientUsers', users);
  return null;
}

async function setAccess(env, act, sw) {
  const all = (await getJson(env, 'clientAccess', {})) || {};
  const cur = { ...CLIENT_SWITCHES, ...(all[act] || {}) };
  for (const k of Object.keys(CLIENT_SWITCHES)) if (typeof sw[k] === 'boolean') cur[k] = sw[k];
  all[act] = cur;
  await putJson(env, 'clientAccess', all);
  return cur;
}

/** Record a client's sign-in (googleLogin) or a page open (/api/me, at most once an hour). */
export async function touchClient(env, email, kind) {
  const e = lower(email);
  const users = (await getJson(env, 'clientUsers', {})) || {};
  if (!users[e]) return;
  const now = new Date().toISOString();
  if (kind === 'seen' && users[e].last_seen && Date.now() - Date.parse(users[e].last_seen) < 3600e3) return;
  users[e][kind === 'login' ? 'last_sign_in' : 'last_seen'] = now;
  if (kind === 'login') users[e].last_seen = now;
  await putJson(env, 'clientUsers', users);
}

/** What /api/me adds for a client. */
export async function meClient(env, email) {
  const c = await clientOf(env, email).catch(() => null);
  if (!c) return null;
  const names = await brandNames(env, c.brands);
  const users = (await getJson(env, 'clientUsers', {})) || {};
  return { name: c.name, welcomed: !!users[c.email]?.welcomed_at, brands: c.brands.map(b => ({ id: b, name: names[b] || b, access: c.access[b] })) };
}

/* ---------------- routes ---------------- */
export async function handleClients(request, env, path, json, { isAdmin, sessionEmail }) {
  if (!path.startsWith('/api/clients')) return null;
  const url = new URL(request.url);
  const cs = clientScope(request);
  const who = await sessionEmail(env, request).catch(() => null);

  /* The client's own record. */
  if (path === '/api/clients/me') {
    if (!cs) {
      if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
      return json({ client: false });
    }
    if (request.method === 'PUT') {
      const b = await request.json().catch(() => ({}));
      const users = (await getJson(env, 'clientUsers', {})) || {};
      const me = users[cs.email]; if (!me) return json({ error: 'unauthorized' }, 401);
      if (typeof b.name === 'string') me.name = b.name.replace(/[<>]/g, '').trim().slice(0, 80) || null;
      if (b.welcomed) me.welcomed_at = me.welcomed_at || new Date().toISOString();
      await putJson(env, 'clientUsers', users);
      return json({ ok: true, name: me.name || null });
    }
    const me = await meClient(env, cs.email);
    /* The creator link, only where Cole switched Creators on and the page is live. */
    for (const b of me?.brands || []) {
      if (!b.access?.creators) continue;
      const row = await env.DB.prepare(`SELECT slug, live FROM p_amb_brand WHERE act_id = ?1`).bind(b.id).first().catch(() => null);
      if (row?.slug && row.live) b.creator_link = `https://tools.go-mobius-digital.com/angles/${row.slug}`;
    }
    return json({ client: true, email: cs.email, ...me });
  }

  /* Everything below is the team's (a client never reaches it: brandguard refuses first; this is the second lock). */
  if (cs) return json({ error: 'Your Locus login shows your own brand.' }, 403);
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const owner = !who || lower(who) === lower(env.OWNER_EMAIL || OWNER);

  if (path === '/api/clients' && request.method === 'GET') {
    const act = url.searchParams.get('act');
    const only = await brandsFor(env, who).catch(() => null);
    const users = (await getJson(env, 'clientUsers', {})) || {};
    const access = (await getJson(env, 'clientAccess', {})) || {};
    const allIds = [...new Set(Object.values(users).flatMap(u => (u && u.brands) || []))];
    const names = await brandNames(env, allIds);
    const rows = Object.entries(users).map(([email, u]) => ({ email, name: u.name || null, brands: (u.brands || []).filter(b => !only || only.has(b)).map(b => ({ id: b, name: names[b] || b })),
      invited_at: u.invited_at || null, invited_by: u.invited_by || null, last_invite: u.last_invite || null, last_sign_in: u.last_sign_in || null, last_seen: u.last_seen || null }))
      .filter(r => r.brands.length && (!act || act === 'all' || r.brands.some(b => b.id === act)))
      .sort((a, b) => a.email.localeCompare(b.email));
    const acc = act && act !== 'all' ? { [act]: { ...CLIENT_SWITCHES, ...(access[act] || {}) } } : Object.fromEntries(Object.entries(access).filter(([b]) => !only || only.has(b)));
    return json({ clients: rows, access: acc, switches: Object.keys(CLIENT_SWITCHES), can_edit: owner, locus: LOCUS_URL });
  }

  if (path === '/api/clients/draft' && request.method === 'GET') {
    const ids = String(url.searchParams.get('brands') || '').split(',').filter(x => /^brand_[a-z0-9_]+$/.test(x));
    const names = await brandNames(env, ids);
    return json(inviteDraft({ brands: ids.map(b => names[b] || b), name: url.searchParams.get('name') || '', email: lower(url.searchParams.get('email') || '') }));
  }

  if (!owner) return json({ error: 'Only Cole adds, changes or removes client logins.' }, 403);
  const b = await request.json().catch(() => ({}));

  if (path === '/api/clients/invite' && request.method === 'POST') {
    const emails = [...new Set((Array.isArray(b.emails) ? b.emails : String(b.emails || '').split(/[\s,;]+/)).map(lower).filter(Boolean))].slice(0, 20);
    if (!emails.length) return json({ error: 'Add at least one email.' }, 400);
    const ids = [...new Set((Array.isArray(b.brands) ? b.brands : []).map(String))];
    const names = await brandNames(env, ids);
    const brands = ids.filter(x => names[x]);
    if (!brands.length) return json({ error: 'Pick at least one brand.' }, 400);
    for (const e of emails) { const bad = !emailOk(e) ? `${e} does not look like an email address.` : null; if (bad) return json({ error: bad }, 400); }
    const send = !!b.send;
    if (send && !b.approved) return json({ error: 'The invite is only sent when you press Send on the text.' }, 400);
    const subject = String(b.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
    const text = String(b.body || '').trim().slice(0, 8000);
    if (send && (!subject || !text)) return json({ error: 'The email needs a subject and a message.' }, 400);
    const failed = [], added = [], sent = [];
    for (const e of emails) {
      const err = await upsertClient(env, e, brands, who, emails.length === 1 ? b.name : '');
      if (err) { failed.push({ email: e, error: err }); continue; }
      added.push(e);
    }
    if (b.access && typeof b.access === 'object') for (const x of brands) await setAccess(env, x, b.access);
    if (send) {
      for (const e of added) {
        try { await sendMail(env, e, subject, text); sent.push(e); }
        catch (err) { failed.push({ email: e, error: /sign-in failed|unauthorized_client|access_denied|insufficient/i.test(err.message) ? 'Locus may not send from your Gmail yet (gmail.send delegation). Copy the email and send it yourself.' : err.message }); }
      }
      if (sent.length) {
        const users = (await getJson(env, 'clientUsers', {})) || {};
        for (const e of sent) if (users[e]) users[e].last_invite = new Date().toISOString();
        await putJson(env, 'clientUsers', users);
      }
    }
    return json({ ok: !failed.length, added, sent, failed });
  }

  if (path === '/api/clients/remove' && request.method === 'POST') {
    const e = lower(b.email);
    const users = (await getJson(env, 'clientUsers', {})) || {};
    if (!users[e]) return json({ error: 'No client login with that email.' }, 404);
    if (b.brand) { users[e].brands = (users[e].brands || []).filter(x => x !== b.brand); if (!users[e].brands.length) delete users[e]; }
    else delete users[e];
    await putJson(env, 'clientUsers', users);
    return json({ ok: true, removed: !users[e] });
  }

  if (path === '/api/clients/access' && request.method === 'PUT') {
    const act = String(b.act || '');
    if (!/^brand_[a-z0-9_]+$/.test(act)) return json({ error: 'Pick a brand.' }, 400);
    return json({ ok: true, act, access: await setAccess(env, act, b) });
  }
  return json({ error: 'not found' }, 404);
}

/* ---------------- the client-safe Strategist ----------------
 * Off unless Cole switched it on for the brand (brandguard refuses /api/ask otherwise). It is NOT the team's
 * Strategist with a rule line on top: no SQL over the shared database, no internal memory or skills in the
 * prompt, no Slack, no actions, no memory writes. One read-only tool, `read_page`, reads a fixed list of the
 * client's own pages THROUGH THE CLIENT'S OWN LOGIN (so brandguard scrubs every answer exactly as it does for
 * the page), pinned to the brand. Haiku 4.5, 4 rounds, capped per client per day. */
const CLIENT_MODEL = 'claude-haiku-4-5-20251001';
const CAP_QUESTIONS = 20, CAP_DOLLARS = 0.5;
const PAGES = {
  overview: { w: 'profit', p: (a, d) => `/api/overview?act=${a}&days=${d}&series=0`, what: 'sales, orders, ad spend, MER, new customers for the window' },
  all_channels: { w: 'profit', p: (a, d) => `/api/hub/paid?platform=all&act=${a}&days=${d}`, what: 'every ad channel side by side' },
  meta: { w: 'profit', p: (a, d) => `/api/hub/paid?platform=meta&act=${a}&days=${d}`, what: 'Meta ads: spend, purchases, ROAS, CPA, campaigns' },
  google: { w: 'profit', p: (a, d) => `/api/hub/paid?platform=google&act=${a}&days=${d}`, what: 'Google ads as Triple Whale sees them' },
  store: { w: 'profit', p: (a, d) => `/api/hub/store?act=${a}&days=${d}`, what: 'store sales, orders, average order, new vs returning' },
  email: { w: 'profit', p: (a, d) => `/api/hub/email?act=${a}&days=${d}`, what: 'email and SMS revenue' },
  pl: { w: 'profit', p: (a, d) => `/api/client?act=${a}&days=${d}`, what: 'profit and loss (only when switched on)' },
  calendar: { w: 'ah', p: a => `/api/calendar?act=${a}&lite=1`, what: 'the marketing calendar' },
  reports: { w: 'ah', p: a => `/api/reports?act=${a}`, what: 'the reports sent to you' },
};
const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const AH_ORIGIN = 'https://mobius-account-health.mobius-digital.workers.dev';

export async function clientAsk(env, request, body, d) {
  const cs = clientScope(request);
  if (!cs) return { error: 'unauthorized', status: 401 };
  if (!env.ANTHROPIC_API_KEY) return { error: 'The Strategist is not set up on this server.' };
  const act = String(body.act || body.screen?.act_id || '');
  const brand = cs.brandOf(act);
  if (!brand || !cs.access[brand]?.strategist) return { error: 'That is switched off for your login.', status: 403 };
  const q = String(body.question || '').trim().slice(0, 1500);
  if (!q) return { error: 'Ask something.' };
  const day = new Date().toISOString().slice(0, 10);
  const key = `clientAsk:${day}:${cs.email}`;
  const use = (await getJson(env, key, null)) || { n: 0, cost: 0 };
  if (use.n >= CAP_QUESTIONS || use.cost >= CAP_DOLLARS) return { error: 'That is the limit of questions for today. It resets tomorrow, or ask us in Slack.' };
  const name = (await brandNames(env, [brand]))[brand] || 'your brand';
  const auth = request.headers.get('Authorization') || '';
  const read = async (page, days) => {
    const P = PAGES[page]; if (!P) return { error: 'No such page.' };
    if (page === 'pl' && !cs.access[brand]?.pl) return { error: 'Profit and loss is not switched on for this login.' };
    const n = Math.min(Math.max(+days || 30, 1), 180);
    const path = P.p(encodeURIComponent(brand), n);
    const init = { headers: { Authorization: auth } };
    const res = P.w === 'profit' ? (env.PROFIT ? await env.PROFIT.fetch(new Request(PROFIT_ORIGIN + path, init)) : null) : await d.ahFetch(new Request(AH_ORIGIN + path, init), env);
    if (!res) return { error: 'That page is not reachable from here.' };
    const t = await res.text();
    return res.ok ? t.slice(0, 14000) : { error: `HTTP ${res.status}` };
  };
  const system = `You answer questions from a CLIENT of Mobius Digital, inside Locus, about their own brand: ${name}. Today is ${day}.
Rules: talk about ${name} only; you know nothing about any other brand, the Mobius team's internal notes, costs or tools, and you never guess at them. Read the numbers with read_page before you state one; say which page and window each number came from. Plain sentences, no markdown, no em dashes, lead with the answer, two to four sentences. You cannot change anything: if they ask for a change (budgets, ads, offers, dates on our side), say their Mobius team handles it and they can ask in their Slack channel. Never promise results.`;
  const tools = [{ name: 'read_page', description: `Read one of ${name}'s Locus pages as JSON. Pages: ${Object.entries(PAGES).filter(([k]) => k !== 'pl' || cs.access[brand]?.pl).map(([k, v]) => `${k} (${v.what})`).join('; ')}.`,
    input_schema: { type: 'object', properties: { page: { type: 'string', enum: Object.keys(PAGES).filter(k => k !== 'pl' || cs.access[brand]?.pl) }, days: { type: 'number', description: 'window in days ending yesterday, default 30' } }, required: ['page'] } }];
  const messages = [];
  for (const m of (Array.isArray(body.history) ? body.history : []).slice(-6)) {
    const text = String(m?.text || '').slice(0, 1500); if (!text) continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += '\n\n' + text; else messages.push({ role, content: text });
  }
  if (messages.length && messages[0].role === 'assistant') messages.shift();
  if (messages.length && messages[messages.length - 1].role === 'user') messages[messages.length - 1].content += '\n\n' + q; else messages.push({ role: 'user', content: q });
  let inTok = 0, outTok = 0, answer = '';
  for (let round = 0; round < 4; round++) {
    const r = await d.xfetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CLIENT_MODEL, max_tokens: 900, system, messages, tools, ...(round === 3 ? { tool_choice: { type: 'none' } } : {}) }) });
    const j = await r.json().catch(() => ({}));
    if (!j.content) { answer = 'I could not answer that one right now. Ask us in Slack.'; break; }
    inTok += j.usage?.input_tokens || 0; outTok += j.usage?.output_tokens || 0;
    const calls = j.content.filter(c => c.type === 'tool_use');
    if (!calls.length) { answer = j.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim(); break; }
    messages.push({ role: 'assistant', content: j.content });
    const results = [];
    for (const c of calls) {
      const out = c.name === 'read_page' ? await read(c.input?.page, c.input?.days).catch(e => ({ error: e.message })) : { error: 'Not available.' };
      results.push({ type: 'tool_result', tool_use_id: c.id, content: typeof out === 'string' ? out : JSON.stringify(out), ...(typeof out === 'string' ? {} : { is_error: true }) });
    }
    messages.push({ role: 'user', content: results });
  }
  const cost = inTok / 1e6 * 1 + outTok / 1e6 * 5;
  await putJson(env, key, { n: use.n + 1, cost: +(use.cost + cost).toFixed(4) }).catch(() => {});
  return { answer: answer.replace(/\u2014/g, ',') || 'I could not work that one out.', cost: +cost.toFixed(4), model: CLIENT_MODEL, client: true };
}
