/**
 * Calendly (2026-10-03, Cole: track when a new client books the strategy call).
 *
 * One webhook on Cole's Calendly organisation (invitee.created + invitee.canceled) points at
 * /calendly/webhook here. It is made through the API the first time CALENDLY_TOKEN is set (a personal
 * access token: Calendly > Integrations > API and webhooks), with a signing key Locus picks, kept in
 * settings.calendlyHook. Only the strategy-session event type counts.
 *
 * On a booking whose invitee email is a waiting new client's contact: the call time is saved on the run,
 * the client's "Book your strategy call" box ticks itself, the internal channel hears it, and Asana's
 * Client Resources > Call Link gets the time. A cancel undoes the box and says so.
 */
let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }

const API = 'https://api.calendly.com';
const HOOK = 'https://mobius-account-health.mobius-digital.workers.dev/calendly/webhook';
const STRATEGY = /strategy-session/;   // the event type's slug: calendly.com/mobius-digital/strategy-session
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };

async function cal(env, method, path, body) {
  const tok = String(env.CALENDLY_TOKEN || '').replace(/[^!-~]/g, '');
  if (!tok) throw new Error('CALENDLY_TOKEN is not set.');
  const res = await F(path.startsWith('http') ? path : `${API}${path}`, { method, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Calendly ${res.status}: ${j.message || j.title || ''}`);
  return j;
}
const getSet = async (env, k) => safeJson((await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null))?.value, null);
const putSet = (env, k, v) => env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, JSON.stringify(v)).run();

/** Makes the webhook once (and again if Calendly dropped it). Cheap when it exists. */
export async function ensureCalendlyHook(env) {
  if (!env.CALENDLY_TOKEN) return { skipped: 'no token' };
  const have = await getSet(env, 'calendlyHook');
  if (have?.uri && have.checked && Date.now() - have.checked < 864e5) return { ok: true };
  const me = (await cal(env, 'GET', '/users/me')).resource;
  if (have?.uri) {
    const h = await cal(env, 'GET', have.uri).catch(() => null);
    if (h?.resource?.state === 'active') { await putSet(env, 'calendlyHook', { ...have, checked: Date.now() }); return { ok: true }; }
    await cal(env, 'DELETE', have.uri).catch(() => {});
  }
  const key = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const made = await cal(env, 'POST', '/webhook_subscriptions', { url: HOOK, events: ['invitee.created', 'invitee.canceled'], organization: me.current_organization, user: me.uri, scope: 'user', signing_key: key });
  await putSet(env, 'calendlyHook', { uri: made.resource.uri, key, checked: Date.now() });
  return { ok: true, made: true };
}

async function verify(env, raw, header) {
  const cfg = await getSet(env, 'calendlyHook');
  const parts = Object.fromEntries(String(header || '').split(',').map(p => p.split('=')));
  if (!cfg?.key || !parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - +parts.t) > 300) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(cfg.key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hex = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${parts.t}.${raw}`)))].map(x => x.toString(16).padStart(2, '0')).join('');
  if (hex.length !== parts.v1.length) return false;
  let d = 0; for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return d === 0;
}

/** POST /calendly/webhook. `onBooked(env, run, info)` is newclient.js's reaction. */
export async function handleCalendly(request, env, onBooked) {
  const raw = await request.text();
  if (!(await verify(env, raw, request.headers.get('Calendly-Webhook-Signature')))) return new Response('bad signature', { status: 401 });
  const ev = safeJson(raw, {});
  const p = ev.payload || {};
  const email = String(p.email || '').toLowerCase();
  const se = p.scheduled_event || {};
  let slug = '';
  if (se.event_type) slug = (await cal(env, 'GET', se.event_type).catch(() => null))?.resource?.slug || '';
  if (!email || !STRATEGY.test(slug)) return new Response('ignored', { status: 200 });
  /* A reschedule arrives as a cancel (rescheduled: true) plus a fresh booking: only the booking counts. */
  if (ev.event === 'invitee.canceled' && p.rescheduled) return new Response('rescheduled', { status: 200 });
  const run = await env.DB.prepare(`SELECT * FROM p_newclient WHERE lower(contact_email) = ?1 ORDER BY created_at DESC LIMIT 1`).bind(email).first().catch(() => null);
  if (!run) return new Response('not a new client', { status: 200 });
  await onBooked(env, run, { canceled: ev.event === 'invitee.canceled', start: se.start_time, name: p.name, join: se.location?.join_url || null, reschedule: p.reschedule_url || null });
  return new Response('ok', { status: 200 });
}
