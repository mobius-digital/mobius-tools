/**
 * CLIENT LOGINS (2026-10-09), THE BRAND EDITION since 2026-10-10. A client is an email (any domain, Google sign-in)
 * tied to one or more brands, and gets everything Locus has for those brands (docs/locus-hub/editions.md). Who may
 * do what is decided in brandguard.js (the allowlist); this file is the records, the invite email and the client's
 * door to the assistant.
 *
 *   settings.clientUsers  = { email: { brands: [brand_x], name, invited_at, invited_by, last_invite,
 *                                       last_sign_in, last_seen, welcomed_at } }
 *   settings.clientAccess is no longer read: the four switches are gone, everything is on.
 *
 * Routes (mounted in worker.js before the admin gate; each checks its own caller):
 *   GET  /api/clients?act=            team: the client logins (a limited teammate sees only their brands' rows)
 *   GET  /api/clients/draft           team: the invite email text for {brands, name, email}
 *   POST /api/clients/invite          OWNER: add or update clients and, with send:true + approved:true, email them
 *   POST /api/clients/remove          OWNER: {email, brand?} take one brand or the whole login away
 *   GET  /api/clients/me              the signed-in client: their brands, creator link
 *   PUT  /api/clients/me              the signed-in client: {name?, welcomed?} (their own profile only)
 * Nothing here sends anything unless the owner pressed Send on text they saw (the New client rule).
 */
import { sendMail } from './mail.js';
import { clientOf, clientScope, brandsFor, CLIENT_SWITCHES, CLIENT_CAPS, capUse, capAdd, capMessage } from './brandguard.js';

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

You now have your own login to Locus, the system we use to run ${what}. You see exactly what we see: sales and profit, ad spend and results by channel, email and SMS, your store and customers, stock, the creative studio, the marketing calendar, your plan and goals, and the reports we send you.

To sign in:
- Open ${LOCUS_URL}
- Press Continue with Google and pick ${who}

If ${who} is not a Google account yet, you can still use it: on Google's sign-in screen choose Create account, then "Use my current email address instead". It takes a minute and needs no Gmail.

You can work in it too: add dates to the calendar, ask us for something under Requests, set your goals, make ads in the studio, and ask the assistant anything about your numbers. Changes to live ads always show you what will happen and wait for you to confirm.

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
    /* The creator link, where the page is live. */
    for (const b of me?.brands || []) {
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
    const allIds = [...new Set(Object.values(users).flatMap(u => (u && u.brands) || []))];
    const names = await brandNames(env, allIds);
    const rows = Object.entries(users).map(([email, u]) => ({ email, name: u.name || null, brands: (u.brands || []).filter(b => !only || only.has(b)).map(b => ({ id: b, name: names[b] || b })),
      invited_at: u.invited_at || null, invited_by: u.invited_by || null, last_invite: u.last_invite || null, last_sign_in: u.last_sign_in || null, last_seen: u.last_seen || null }))
      .filter(r => r.brands.length && (!act || act === 'all' || r.brands.some(b => b.id === act)))
      .sort((a, b) => a.email.localeCompare(b.email));
    /* `access` and `switches` stay in the answer (always everything) for any screen that still reads them. */
    const acc = act && act !== 'all' ? { [act]: { ...CLIENT_SWITCHES } } : {};
    return json({ clients: rows, access: acc, switches: [], can_edit: owner, locus: LOCUS_URL });
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

  return json({ error: 'not found' }, 404);
}

/* ---------------- the assistant, for a client ----------------
 * THE BRAND EDITION (2026-10-10, Cole: a client gets everything a brand has). A client's question runs on the SAME
 * engine as the team's (ask/engine.js answerWeb, the Strategist config), in its client mode: pinned to the client's
 * brand with the ACCESS RULE, only the tools that read Locus through the client's OWN sign-in (locus_routes,
 * locus_get: brandguard's allowlist and scrub apply to every read), reports, files and the web. Never the SQL gate,
 * the app views, the agency's memory, skills, Slack or playbook, and no actions from the chat (the same buttons are on
 * the pages). Capped per client per day in dollars (settings clientAsk:<date>:<email>, $2, shared with the AI reads on
 * screens), and every question is in the usage log under the client's email (logRun). */
export async function clientAsk(env, request, body, d) {
  const cs = clientScope(request);
  if (!cs) return { error: 'unauthorized', status: 401 };
  if (!env.ANTHROPIC_API_KEY) return { error: 'The assistant is not set up on this server.' };
  const act = String(body.act || body.screen?.act_id || '');
  const brand = cs.brandOf(act);
  if (!brand) return { error: 'Pick your brand first.', status: 403 };
  const q = String(body.question || '').trim().slice(0, 4000);
  if (!q) return { error: 'Ask something.' };
  const use = await capUse(env, 'clientAsk', cs.email);
  if ((use.cost || 0) >= CLIENT_CAPS.clientAsk.max) return { error: capMessage('clientAsk'), status: 429 };
  const name = (await brandNames(env, [brand]))[brand] || 'your brand';
  const runId = /^[a-z0-9]{6,16}$/.test(String(body.runId || '')) ? body.runId : null;
  if (runId) await putJson(env, `askRunWho:${runId}`, cs.email).catch(() => {});
  const { engine, h } = d.strategist();
  let r;
  try {
    r = await engine.answerWeb(env, q, body.history, h(), {
      screen: { ...(body.screen && typeof body.screen === 'object' ? body.screen : {}), act_id: brand, brand_selected: name },
      runId, auth: request.headers.get('Authorization') || '', who: cs.email, client: { brand, name, email: cs.email },
    });
  } finally {
    if (runId) await env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(`askRunWho:${runId}`).run().catch(() => {});
  }
  const cost = +(r?.cost || 0);
  const now = await capAdd(env, 'clientAsk', cs.email, cost);
  const answer = String(r?.answer || '').replace(/\u2014/g, ',');
  return { ...r, answer, client: true, isOwner: false, spent_today: now.cost, cap: CLIENT_CAPS.clientAsk.max };
}

/** May this client read or stop this running answer? Only the client that started it. */
export async function clientOwnsRun(env, request, id) {
  const cs = clientScope(request);
  if (!cs || !/^[a-z0-9]{6,16}$/.test(String(id || ''))) return false;
  return (await getJson(env, `askRunWho:${id}`, null)) === cs.email;
}
