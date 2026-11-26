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
 *                                      (read_only:true = a look-and-approve login)
 *   POST /api/clients/access          OWNER: {email, read_only} turns look-and-approve on or off for one login
 *   POST /api/clients/remove          OWNER: {email, brand?} take one brand or the whole login away
 *   POST /api/clients/preview         OWNER: {email} a session token for an invited client, to see Locus as they do
 *   GET  /api/clients/me              the signed-in client: their brands, creator link
 *   PUT  /api/clients/me              the signed-in client: {name?, welcomed?} (their own profile only)
 * Nothing here sends anything unless the owner pressed Send on text they saw (the New client rule).
 */
import { sendMail as sendMailAs, sendProductMail } from './mail.js';
import { onboardGate } from './onboard.js';
/* Sign in links and login invites come from the login_email sender: Locus once a Locus mailbox exists, Cole until then. */
const sendMail = (env, to, subject, text) => sendMailAs(env, to, subject, text, { kind: 'login_email' });
import { clientOf, clientScope, brandsFor, CLIENT_SWITCHES, CLIENT_CAPS, capUse, capAdd, capMessage, HQ_BRAND, HQ_DOMAIN } from './brandguard.js';

const OWNER = 'cole@go-mobius-digital.com';
const DOMAIN = 'go-mobius-digital.com';
export const LOCUS_URL = 'https://locus.go-mobius-digital.com/profit/';
/* New Locus (profit/v5): where an onboarding invite opens (2026-11-26). */
export const ONBOARD_URL = LOCUS_URL + 'v5/';
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
/** One client login written (or removed with rec = null) by its own key inside settings.clientUsers, in one statement,
 *  so two requests changing two different logins at the same moment never drop each other's write (a whole-blob write
 *  from an older copy did). An address a JSON path cannot quote safely falls back to the whole-blob write. */
export async function putClientUser(env, email, rec) {
  const e = lower(email);
  if (!e) return;
  if (/["\\]/.test(e)) {
    const users = (await getJson(env, 'clientUsers', {})) || {};
    if (rec) users[e] = rec; else delete users[e];
    return putJson(env, 'clientUsers', users);
  }
  const path = `$."${e}"`;
  if (!rec) { await env.DB.prepare(`UPDATE settings SET value = json_remove(value, ?2) WHERE key = ?1 AND json_valid(value)`).bind('clientUsers', path).run(); return; }
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, json_object(?2, json(?3)))
    ON CONFLICT(key) DO UPDATE SET value = json_set(CASE WHEN json_valid(settings.value) AND json_type(settings.value) = 'object' THEN settings.value ELSE '{}' END, ?4, json(?3))`)
    .bind('clientUsers', e, JSON.stringify(rec), path).run();
}
async function brandNames(env, ids) {
  if (!ids.length) return {};
  const ph = ids.map((_, i) => `?${i + 1}`).join(',');
  const rows = (await env.DB.prepare(`SELECT id, name FROM brands WHERE id IN (${ph})`).bind(...ids).all().catch(() => ({ results: [] }))).results || [];
  return Object.fromEntries(rows.map(r => [r.id, r.name]));
}

/* ---------------- invite links and emailed sign-in links (2026-11-06) ----------------
 * Cole: clients could not sign in when the invited email was not a Google account (Rob at Yak: Outlook) or when they
 * use another address (Shreya). So an invite is a LINK, not an address:
 *  - the invite link (`?invite=<token>`, 30 days, one use) lets the person sign in with ANY Google account; that Google
 *    email takes over the invited login (`invited_as` keeps the address we sent it to);
 *  - "Email me a sign-in link" sends a one-time link (`?signin=<token>`, 20 minutes) to an invited address, so a person
 *    with no Google account at all still gets in.
 * Tokens: users[email].invite = {token, exp}; settings `signin:<token>` = {email, exp}. */
export const LINK_PLACEHOLDER = '{{sign-in link}}';
const INVITE_DAYS = 30, SIGNIN_MIN = 20;
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const inviteUrl = (t, base = LOCUS_URL) => `${base}?invite=${t}`;
const maskEmail = e => { const [u, d] = String(e).split('@'); return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}`; };

/** The client's current invite link, made (or renewed when expired) on the way. `base` = where the link opens
 *  (onboarding passes ONBOARD_URL, new Locus); old callers keep the old Locus. */
export async function ensureInvite(env, email, base = LOCUS_URL) {
  const e = lower(email);
  const users = (await getJson(env, 'clientUsers', {})) || {};
  if (!users[e]) return null;
  const cur = users[e].invite;
  if (cur?.token && Date.parse(cur.exp) > Date.now() + 86400e3) return inviteUrl(cur.token, base);
  users[e].invite = { token: hex(16), exp: new Date(Date.now() + INVITE_DAYS * 86400e3).toISOString() };
  await putClientUser(env, e, users[e]);
  return inviteUrl(users[e].invite.token, base);
}
/** Where an emailed sign-in link opens: new Locus (ONBOARD_URL) when any of the login's brands has an onboarding
 *  checklist, so the Get started gate applies; else the old address. */
async function onboardBase(env, brands) {
  const list = (brands || []).filter(b => /^brand_[a-z0-9_]+$/.test(b));
  if (!list.length) return LOCUS_URL;
  const ph = list.map((_, i) => `?${i + 1}`).join(',');
  const hit = await env.DB.prepare(`SELECT 1 FROM p_onboard WHERE act_id IN (${ph}) LIMIT 1`).bind(...list).first().catch(() => null);
  return hit ? ONBOARD_URL : LOCUS_URL;
}
function findInvite(users, token) {
  if (!/^[0-9a-f]{32}$/.test(token || '')) return null;
  for (const [email, u] of Object.entries(users)) if (u?.invite?.token === token) return { email, u, live: Date.parse(u.invite.exp) > Date.now() };
  return null;
}

/** Google sign-in through an invite link: the Google email takes over the invited login. Returns true when it did,
 *  false when there was nothing to claim, or {error} when the claim is refused.
 *  Team and Mobius emails never become clients (googleLogin checks the team first).
 *  A one-job invite (onboard_only, a colleague handed one setup step) is never merged into a login that reaches any
 *  other brand, or that is a full login without the brand: the merge would drop the limit and hand over a whole brand. */
export const ONE_JOB_REFUSED = 'Use the email this was sent to, or ask Mobius.';
export async function claimInvite(env, token, googleEmail) {
  const g = lower(googleEmail);
  if (!emailOk(g) || g.endsWith('@' + DOMAIN) || g === lower(env.OWNER_EMAIL || OWNER) || (await teamGuests(env)).includes(g)) return false;
  const users = (await getJson(env, 'clientUsers', {})) || {};
  const hit = findInvite(users, token);
  if (!hit || !hit.live) return false;
  const rec = { ...hit.u }; delete rec.invite;
  if (hit.email !== g) {
    const into = users[g] && typeof users[g] === 'object' ? users[g] : null;
    const oneJob = Array.isArray(rec.onboard_only) && rec.onboard_only.length;
    if (into && oneJob) {
      const recBrands = rec.brands || [], intoBrands = into.brands || [];
      const sameBrandOnly = intoBrands.length > 0 && intoBrands.every(b => recBrands.includes(b));
      const intoOneJob = Array.isArray(into.onboard_only) && into.onboard_only.length;
      /* Allowed: the same brand only, and the login is either already full there (nothing new) or another one-job login
         (the jobs add up). Anything else is refused. */
      if (!sameBrandOnly) return { error: ONE_JOB_REFUSED };
      users[g] = intoOneJob ? { ...into, onboard_only: [...new Set([...into.onboard_only, ...rec.onboard_only])], name: into.name || rec.name } : { ...into, name: into.name || rec.name };
    } else users[g] = into ? { ...into, brands: [...new Set([...(into.brands || []), ...(rec.brands || [])])], name: into.name || rec.name } : { ...rec, invited_as: hit.email };
    /* The invited address is remembered on the login that took it over: an onboarding step holder, the run's contact
       and every reminder still name the invited address, and onboard.js liveLogin finds this login through it. */
    users[g].claimed_from = [...new Set([...(Array.isArray(users[g].claimed_from) ? users[g].claimed_from : []), ...(Array.isArray(rec.claimed_from) ? rec.claimed_from : []), hit.email])].slice(-10);
    delete users[hit.email];
  } else users[g] = rec;
  await putJson(env, 'clientUsers', users);
  return true;
}

/** What the invite page shows before sign-in: whose invite, which brands. Nothing else. */
async function inviteInfo(env, token) {
  const users = (await getJson(env, 'clientUsers', {})) || {};
  const hit = findInvite(users, token);
  if (!hit) return { ok: false, error: 'This invite link is not valid any more. Ask Mobius for a new one.' };
  if (!hit.live) return { ok: false, error: 'This invite link has expired. Ask Mobius for a new one.' };
  const names = await brandNames(env, hit.u.brands || []);
  return { ok: true, name: firstName(hit.u.name), email: maskEmail(hit.email), brands: (hit.u.brands || []).map(b => names[b] || b) };
}

/** Email a one-time sign-in link to an invited client. Always answers the same way (no telling who has a login). */
async function sendSigninLink(env, email, invite) {
  const users = (await getJson(env, 'clientUsers', {})) || {};
  let e = lower(email);
  if (invite) { const hit = findInvite(users, invite); if (!hit || !hit.live) return { ok: false, error: 'This invite link is not valid any more. Ask Mobius for a new one.' }; e = hit.email; }
  const done = { ok: true, to: e && invite ? maskEmail(e) : null };
  if (!emailOk(e) || !users[e]) return done;
  const gate = `signinSent:${e}`;
  const last = await getJson(env, gate, 0);
  if (Date.now() - (+last || 0) < 60e3) return done;
  await putJson(env, gate, Date.now());
  const t = hex(24);
  await putJson(env, `signin:${t}`, { email: e, exp: Date.now() + SIGNIN_MIN * 60e3 });
  const hi = firstName(users[e].name) || 'there';
  /* A login still being set up (any of its brands has an onboarding checklist) signs in to new Locus, where the Get
     started gate lives; everyone else keeps the old address. */
  const base = await onboardBase(env, users[e].brands || []);
  await sendMail(env, e, 'Your Locus sign-in link', `Hi ${hi},

Here is your link to sign in to Locus:
${base}?signin=${t}

It works once, for the next ${SIGNIN_MIN} minutes. If you did not ask for it, ignore this email.`);
  return done;
}

/** Redeem an emailed sign-in link. One use. */
async function redeemSignin(env, token, mintSession) {
  if (!/^[0-9a-f]{48}$/.test(token || '')) return null;
  const key = `signin:${token}`;
  const v = await getJson(env, key, null);
  await env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(key).run().catch(() => {});
  if (!v || v.exp < Date.now()) return null;
  const users = (await getJson(env, 'clientUsers', {})) || {};
  if (!users[v.email]) return null;
  if (users[v.email].invite) { delete users[v.email].invite; await putJson(env, 'clientUsers', users); }
  await touchClient(env, v.email, 'login').catch(() => {});
  return { ...(await mintSession(env, v.email)), role: 'client', name: users[v.email].name || '' };
}

/* ---------------- the emailed 6 digit code (onboarding, 2026-11-26) ----------------
 * The invite page offers Google or "Email me a code". The code is 6 random digits, kept only as a SHA-256 of
 * code + invite + SESSION_SECRET in settings `code:<invite>` = {h, exp, tries, sent_at, sends}. 10 minutes, 5 tries,
 * one send a minute and 5 an hour per invite. The right code is one use: the row and the invite token go, and the
 * answer is a session in the same shape as /api/clients/signin. Sent by sendProductMail (a system mail). */
const CODE_MIN = 10, CODE_TRIES = 5;
const sha256hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const codeHash = (env, code, invite) => sha256hex(`${code}:${invite}:${env.SESSION_SECRET || env.ADMIN_TOKEN || ''}`);
export async function sendCode(env, invite) {
  const users = (await getJson(env, 'clientUsers', {})) || {};
  const hit = findInvite(users, invite);
  if (!hit || !hit.live) return { ok: false, error: 'This invite link is not valid any more. Ask Mobius for a new one.' };
  const key = `code:${invite}`;
  const now = Date.now();
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  const code = String(n).padStart(6, '0');
  const h = await codeHash(env, code, invite);
  /* The send slot is taken in ONE statement before the mail goes (parallel presses all read the same row, so a
     read-check-write let a burst through): the new code is written only when the last send is over a minute old and
     this hour has fewer than five. The hash is replaced in the same write, so only the newest code works. */
  await env.DB.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?1, '{}')`).bind(key).run();
  const took = await env.DB.prepare(`UPDATE settings SET value = json_object('h', ?2, 'exp', ?3, 'tries', 0, 'sent_at', ?4,
      'sends', json_insert((SELECT COALESCE(json_group_array(j.value), '[]') FROM json_each(settings.value, '$.sends') AS j WHERE j.value > ?5), '$[#]', ?4))
    WHERE key = ?1 AND json_valid(value) AND COALESCE(json_extract(value, '$.sent_at'), 0) <= ?6
      AND (SELECT COUNT(*) FROM json_each(settings.value, '$.sends') AS j WHERE j.value > ?5) < 5
    RETURNING key`).bind(key, h, now + CODE_MIN * 60e3, now, now - 3600e3, now - 60e3).first();
  if (!took) {
    const cur = await getJson(env, key, null);
    if (cur?.sent_at && now - cur.sent_at < 60e3) return { ok: true, to: maskEmail(hit.email), wait: true };
    return { ok: false, error: 'That is five codes this hour. Wait a little, or sign in with Google.' };
  }
  await sendProductMail(env, hit.email, 'Your Locus code', `Your code is ${code.slice(0, 3)} ${code.slice(3)}. It works for ${CODE_MIN} minutes. If you did not ask for it, ignore this email.`);
  return { ok: true, to: maskEmail(hit.email) };
}
export async function verifyCode(env, invite, code, mintSession) {
  const key = `code:${invite}`;
  const ranOut = { error: 'That code ran out. Ask for a new one.', status: 400 };
  /* A spent code keeps its row WITHOUT the hash: the send limits (sent_at, sends) live in it, so five wrong guesses or
     an expiry never reset the one-a-minute and five-an-hour limits on sending a new one. */
  const spend = v => putJson(env, key, { sent_at: v.sent_at || 0, sends: Array.isArray(v.sends) ? v.sends : [], tries: CODE_TRIES }).catch(() => {});
  const v = /^[0-9a-f]{32}$/.test(invite || '') ? await getJson(env, key, null) : null;
  if (!v || !v.h) return ranOut;
  if (!(v.exp > Date.now())) { await spend(v); return ranOut; }
  /* The try is counted BEFORE the code is compared, in one statement, so parallel guesses cannot all see tries = 0. */
  const took = await env.DB.prepare(`UPDATE settings SET value = json_set(value, '$.tries', COALESCE(json_extract(value, '$.tries'), 0) + 1)
    WHERE key = ?1 AND json_extract(value, '$.h') = ?2 AND COALESCE(json_extract(value, '$.tries'), 0) < ?3
    RETURNING json_extract(value, '$.tries') AS t`).bind(key, v.h, CODE_TRIES).first().catch(() => null);
  if (!took) { await spend(v); return ranOut; }
  const tries = Number(took.t) || CODE_TRIES;
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6 || (await codeHash(env, c, invite)) !== v.h) {
    if (tries >= CODE_TRIES) { await spend(v); return ranOut; }
    const left = CODE_TRIES - tries;
    return { error: `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`, status: 400 };
  }
  await env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(key).run().catch(() => {});
  const users = (await getJson(env, 'clientUsers', {})) || {};
  const hit = findInvite(users, invite);
  if (!hit || !hit.live) return { error: 'This invite link is not valid any more. Ask Mobius for a new one.', status: 400 };
  delete users[hit.email].invite;
  await putJson(env, 'clientUsers', users);
  await touchClient(env, hit.email, 'login').catch(() => {});
  return { ...(await mintSession(env, hit.email)), role: 'client', name: users[hit.email].name || '' };
}

/* ---------------- the invite email ---------------- */
export function inviteDraft({ brands = [], name = '' }) {
  const list = brands.filter(Boolean);
  const what = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0] || 'your brand';
  const hi = firstName(name) || 'there';
  return {
    subject: `Your Locus login for ${list.length === 1 ? list[0] : 'your brands'}`,
    body: `Hi ${hi},

You now have your own login to Locus, the system we use to run ${what}. You see exactly what we see: sales and profit, ad spend and results by channel, email and SMS, your store and customers, stock, the creative studio, the marketing calendar, your plan and goals, and the reports we send you.

To sign in, open your personal link:
${LINK_PLACEHOLDER}

Sign in with any Google account you like. No Google account? Press "Email me a sign-in link" on that page and we send a link to this address. After the first time, sign in at ${LOCUS_URL}

You can work in it too: add dates to the calendar, ask us for something under Requests, set your goals, make ads in the studio, and ask the assistant anything about your numbers. Changes to live ads always show you what will happen and wait for you to confirm.

Any question, ask us in Slack or reply to this email.

Talk soon,`,
  };
}

/* ---------------- records ---------------- */
async function teamGuests(env) { return ((await getJson(env, 'allowedEmails', [])) || []).map(lower); }

/** Add brands to (or create) one client login. Returns an error string or null. */
export async function upsertClient(env, email, brands, by, name, readOnly) {
  const e = lower(email);
  if (!emailOk(e)) return `${email || 'That'} does not look like an email address.`;
  if (e.endsWith('@' + DOMAIN) || e === lower(env.OWNER_EMAIL || OWNER)) return `${e} is a Mobius account. Mobius people go in Team and access, not here.`;
  if ((await teamGuests(env)).includes(e)) return `${e} is on the team list (Team and access). Remove them there first if they should be a client.`;
  const users = (await getJson(env, 'clientUsers', {})) || {};
  const cur = users[e] && typeof users[e] === 'object' ? users[e] : { invited_at: new Date().toISOString(), invited_by: by || 'admin' };
  /* A one-job login (a colleague handed one setup step) that the team now makes a FULL login: the job limit goes when
     the team names every brand that login has, so the person is not locked to one step. Naming only another brand
     would turn the one job into a whole brand they were never given, so that is refused with a plain reason. */
  if (Array.isArray(cur.onboard_only) && cur.onboard_only.length) {
    const had = Array.isArray(cur.brands) ? cur.brands : [];
    if (!had.every(b => brands.includes(b))) return `${e} has a one-job setup login for another brand. Finish or remove it in Clients first.`;
    delete cur.onboard_only; delete cur.handed_by;
  }
  cur.brands = [...new Set([...(Array.isArray(cur.brands) ? cur.brands : []), ...brands])];
  if (name && !cur.name) cur.name = String(name).trim().slice(0, 80);
  /* Look-and-approve login (brandguard.js READONLY_CLIENT_MAY). An invite only ever narrows it; POST /api/clients/access widens. */
  if (readOnly) cur.readOnly = true;
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
/* ---------------- Locus inside Lucky HQ (2026-11-11) ----------------
 * hq.luckygolf.com opens Locus in a frame. Locus sits on another site, so its own sign-in is not there (browsers keep a
 * framed site's storage apart). HQ, which already knows who is signed in, signs a one-minute pass with the secret both
 * hold (LOCUS_HQ_SECRET) and hands it to the frame; POST /api/hq-signin swaps it for a session.
 * The session is never the person's own Locus login. It is a client login "<name>@hq.luckygolf.com", marked hq, which
 * brandguard.js holds to Lucky Golf whatever this row says. So the pass can only ever open Lucky. */
const b64uBytes = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function verifyHqPass(env, token) {
  try {
    if (!env.LOCUS_HQ_SECRET) return null;
    const [h, p, sig] = String(token || '').split('.');
    if (!h || !p || !sig || JSON.parse(new TextDecoder().decode(b64uBytes(h))).alg !== 'HS256') return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.LOCUS_HQ_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('HMAC', key, b64uBytes(sig), new TextEncoder().encode(h + '.' + p)))) return null;
    const v = JSON.parse(new TextDecoder().decode(b64uBytes(p)));
    const now = Date.now() / 1000;
    if (v.aud !== 'locus-hq' || v.iss !== 'lucky-hq' || v.brand !== HQ_BRAND || !(v.exp > now) || v.exp > now + 120) return null;
    return v;
  } catch { return null; }
}
export async function hqSignin(env, token, mintSession) {
  const v = await verifyHqPass(env, token);
  if (!v) return { error: 'That pass is not valid. Open Lucky HQ again.', status: 401 };
  const local = lower(String(v.email || '').split('@')[0]).replace(/[^a-z0-9._-]/g, '').slice(0, 40) || 'hq';
  const e = `${local}@${HQ_DOMAIN}`;
  if ((await teamGuests(env)).includes(e)) return { error: 'That login is not a Lucky HQ login.', status: 403 };
  const users = (await getJson(env, 'clientUsers', {})) || {};
  const now = new Date().toISOString(), cur = users[e] && typeof users[e] === 'object' ? users[e] : {};
  const name = String(v.name || '').trim().slice(0, 60) || local;
  /* can: 'read' in the pass = Lucky HQ's People list gave this person Ads to read, not to act. hq_until: the login
     lasts half an hour, then Locus asks HQ for a new pass (brandguard.js clientOf). */
  users[e] = { ...cur, brands: [HQ_BRAND], hq: true, readOnly: v.can === 'read', hq_until: Date.now() + 30 * 60e3, name, invited_at: cur.invited_at || now, invited_by: cur.invited_by || 'Lucky HQ', welcomed_at: cur.welcomed_at || now, last_sign_in: now, last_seen: now };
  delete users[e].invite;
  await putJson(env, 'clientUsers', users);
  const c = await clientOf(env, e);
  if (!c || !c.hq || c.brands.length !== 1 || c.brands[0] !== HQ_BRAND) return { error: 'That login is not a Lucky HQ login.', status: 403 };
  return { ...(await mintSession(env, e)), role: 'client', name, hq: true, ...(c.readOnly ? { readOnly: true } : {}) };
}

export async function meClient(env, email) {
  const c = await clientOf(env, email).catch(() => null);
  if (!c) return null;
  const names = await brandNames(env, c.brands);
  const users = (await getJson(env, 'clientUsers', {})) || {};
  const u = users[c.email] || {};
  /* Onboarding (2026-11-26): the profile, the welcome cards flag and the Get started gate, all from one read. */
  const onboarding = await onboardGate(env, c.email, c.brands, c.onlyOnboard || null).catch(() => null);
  return { name: c.name, title: u.title || '', phone: u.phone || '', ...(c.hq ? { hq: true } : {}), ...(c.readOnly ? { readOnly: true } : {}), welcomed: !!u.welcomed_at,
    welcome_seen: !!u.welcome_seen_at, profile_done: !!(String(u.name || '').trim() && String(u.title || '').trim()), onboarding,
    brands: c.brands.map(b => ({ id: b, name: names[b] || b, access: c.access[b] })) };
}

/* ---------------- routes ---------------- */
export async function handleClients(request, env, path, json, { isAdmin, sessionEmail, mintSession }) {
  if (!path.startsWith('/api/clients')) return null;
  const url = new URL(request.url);
  /* Public: the sign-in page's own routes (no session yet). */
  if (path === '/api/clients/invite-info' && request.method === 'GET') return json(await inviteInfo(env, url.searchParams.get('t')));
  if (path === '/api/clients/login-link' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    try { const r = await sendSigninLink(env, b.email, b.invite); return json(r, r.ok ? 200 : 400); }
    catch (e) { return json({ error: 'Could not send the email just now. Try again in a minute.' }, 502); }
  }
  if (path === '/api/clients/code' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    try { const r = await sendCode(env, String(b.invite || '')); return json(r, r.ok ? 200 : 400); }
    catch (e) { return json({ ok: false, error: 'Could not send the email just now. Try again in a minute.' }, 502); }
  }
  if (path === '/api/clients/code/verify' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    if (!mintSession) return json({ error: 'not wired' }, 500);
    const r = await verifyCode(env, String(b.invite || ''), b.code, mintSession);
    return r.error ? json({ error: r.error }, r.status || 400) : json(r);
  }
  if (path === '/api/clients/signin' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const s = mintSession ? await redeemSignin(env, b.t, mintSession) : null;
    return s ? json(s) : json({ error: 'This sign-in link has expired or was already used. Ask for a new one.' }, 401);
  }

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
      /* The short profile on sign up (2026-11-26): job title and an optional phone. */
      if (typeof b.title === 'string') me.title = b.title.replace(/[<>]/g, '').trim().slice(0, 80);
      if (typeof b.phone === 'string') {
        const ph = b.phone.trim().slice(0, 30);
        if (ph && !/^[0-9 +().-]+$/.test(ph)) return json({ error: 'A phone number has digits, spaces, + ( ) - and dots only.' }, 400);
        me.phone = ph;
      }
      if (b.welcomed) me.welcomed_at = me.welcomed_at || new Date().toISOString();
      if (b.welcome_seen) me.welcome_seen_at = me.welcome_seen_at || new Date().toISOString();
      await putJson(env, 'clientUsers', users);
      return json({ ok: true, name: me.name || null, title: me.title || '', phone: me.phone || '', welcome_seen: !!me.welcome_seen_at });
    }
    const me = await meClient(env, cs.email);
    /* The creator link, where the page is live. */
    for (const b of me?.brands || []) {
      const row = await env.DB.prepare(`SELECT slug, live FROM p_amb_brand WHERE act_id = ?1`).bind(b.id).first().catch(() => null);
      if (row?.slug && row.live) b.creator_link = `https://locus.go-mobius-digital.com/angles/${row.slug}`;
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
      invited_at: u.invited_at || null, invited_by: u.invited_by || null, last_invite: u.last_invite || null, last_sign_in: u.last_sign_in || null, last_seen: u.last_seen || null,
      invited_as: u.invited_as || null, read_only: u.readOnly === true }))
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
      const err = await upsertClient(env, e, brands, who, emails.length === 1 ? b.name : '', b.read_only === true);
      if (err) { failed.push({ email: e, error: err }); continue; }
      added.push(e);
    }
    const links = {};
    for (const e of added) links[e] = await ensureInvite(env, e);
    if (send) {
      for (const e of added) {
        /* Each person gets their own link where the text says {{sign-in link}} (or at the end if the line was edited out). */
        const body = text.includes(LINK_PLACEHOLDER) ? text.split(LINK_PLACEHOLDER).join(links[e]) : `${text}\n\nYour sign-in link: ${links[e]}`;
        try { await sendMail(env, e, subject, body); sent.push(e); }
        catch (err) { failed.push({ email: e, error: /sign-in failed|unauthorized_client|access_denied|insufficient/i.test(err.message) ? 'Locus may not send from your Gmail yet (gmail.send delegation). Copy the email and send it yourself.' : err.message }); }
      }
      if (sent.length) {
        const users = (await getJson(env, 'clientUsers', {})) || {};
        for (const e of sent) if (users[e]) users[e].last_invite = new Date().toISOString();
        await putJson(env, 'clientUsers', users);
      }
    }
    return json({ ok: !failed.length, added, sent, failed, links });
  }

  /* A client's invite link, to paste anywhere (Slack, a text). Owner. */
  if (path === '/api/clients/link' && request.method === 'POST') {
    const link = await ensureInvite(env, b.email);
    return link ? json({ ok: true, link }) : json({ error: 'No client login with that email.' }, 404);
  }

  /* See Locus as a client (2026-11-04): Cole signs in as an invited client without their Google account. Owner only. */
  if (path === '/api/clients/preview' && request.method === 'POST') {
    const e = lower(b.email);
    const users = (await getJson(env, 'clientUsers', {})) || {};
    if (!users[e]) return json({ error: 'No client login with that email.' }, 404);
    if (!mintSession) return json({ error: 'preview is not wired' }, 500);
    const s = await mintSession(env, e);
    return json({ ...s, role: 'client', name: users[e].name || '', brands: users[e].brands || [] });
  }

  /* Look-and-approve switch for one client login (journey audit 2026-11-26). Owner. read_only true = it may approve,
     comment and read, and every other change is refused (brandguard.js). Lucky HQ logins take theirs from the HQ pass. */
  if (path === '/api/clients/access' && request.method === 'POST') {
    const e = lower(b.email);
    if (typeof b.read_only !== 'boolean') return json({ error: 'Say read_only: true or false.' }, 400);
    const users = (await getJson(env, 'clientUsers', {})) || {};
    if (!users[e] || typeof users[e] !== 'object') return json({ error: 'No client login with that email.' }, 404);
    if (users[e].hq) return json({ error: 'A Lucky HQ login takes its access from Lucky HQ (Settings, People).' }, 400);
    if (b.read_only) users[e].readOnly = true; else delete users[e].readOnly;
    await putJson(env, 'clientUsers', users);
    return json({ ok: true, email: e, read_only: b.read_only });
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
  /* 2026-10-27 audit: never take over a run id that is already someone else's (a guessed team run). */
  if (runId) { const owner = await getJson(env, `askRunWho:${runId}`, null).catch(() => null); if (owner && owner !== cs.email) return { error: 'That run is not yours.', status: 403 }; await putJson(env, `askRunWho:${runId}`, cs.email).catch(() => {}); }
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
