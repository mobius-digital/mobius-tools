/* POST /api/slack/example-dm (2026-11-26): post example Slack messages, in order, as the Locus bot to the OWNER's
 * own DM, so a new message design can be seen in Slack before any real path sends it.
 *
 * Body: { messages: [{ text, blocks, attachments? }] }. There is no "to": the recipient is always the owner's Slack
 * user id (OWNER_SLACK), never a channel from the body.
 * Owner only (the same isOwner as PUT /api/settings; the admin key counts). Limits: at most 8 messages, at most 50
 * blocks each, body under 40 KB. Every message must open with a context block whose text begins "Example, not real",
 * so nobody can mistake it for a live message; otherwise the request is refused before anything posts. The
 * notification text and any attachment fallback get the same marker in front, so a push or preview line says it too.
 * -> { ok: true, posted: [ts...] } or { ok: false, error, posted } when Slack refuses one (the ones before it stay). */
import { OWNER_SLACK } from './slackaccess.js';

export const EXAMPLE_MARK = 'Example, not real';
export const MAX_MESSAGES = 8;
export const MAX_BLOCKS = 50;
export const MAX_BODY = 40 * 1024;

const markText = b => {
  if (!b || b.type !== 'context' || !Array.isArray(b.elements) || !b.elements.length) return '';
  const e = b.elements[0];
  return e && typeof e.text === 'string' ? e.text : (e && e.text && typeof e.text.text === 'string' ? e.text.text : '');
};

/* The marker in front of a notification or fallback line, once. */
const marked = t => {
  const s = typeof t === 'string' ? t.trim() : '';
  if (!s) return EXAMPLE_MARK;
  return s.startsWith(EXAMPLE_MARK) ? s : `${EXAMPLE_MARK}: ${s}`;
};

/** Checks the parsed body. -> { messages } or { error } (a 400). */
export function checkExampleBody(body) {
  const msgs = body && Array.isArray(body.messages) ? body.messages : null;
  if (!msgs || !msgs.length) return { error: 'Send messages: a list of { text, blocks }.' };
  if (msgs.length > MAX_MESSAGES) return { error: `At most ${MAX_MESSAGES} messages at a time.` };
  const out = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i] || {};
    const n = i + 1;
    if (!Array.isArray(m.blocks) || !m.blocks.length) return { error: `Message ${n} has no blocks.` };
    if (m.blocks.length > MAX_BLOCKS) return { error: `Message ${n} has more than ${MAX_BLOCKS} blocks.` };
    if (!markText(m.blocks[0]).trim().startsWith(EXAMPLE_MARK)) return { error: `Message ${n} must start with a context block that begins "${EXAMPLE_MARK}".` };
    if (m.attachments != null && !Array.isArray(m.attachments)) return { error: `Message ${n}: attachments must be a list.` };
    const attachments = m.attachments ? m.attachments.map(a => (a && typeof a === 'object' ? { ...a, fallback: marked(a.fallback) } : a)) : null;
    out.push({ text: marked(m.text), blocks: m.blocks, attachments });
  }
  return { messages: out };
}

/** The route. deps: { isOwner: boolean, slackPost(env, channel, text, blocks, opts), json? } (worker.js slackPost, which
 *  is sender.js slackPostWith with the worker's fetch, and worker.js json, which adds the CORS headers). */
export async function handleExampleDm(request, env, { isOwner, slackPost, json: workerJson }) {
  const json = workerJson || ((o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } }));
  if (!isOwner) return json({ ok: false, error: 'Only the owner can send example messages.' }, 403);
  const raw = await request.text().catch(() => '');
  if (new TextEncoder().encode(raw).length >= MAX_BODY) return json({ ok: false, error: 'The body must be under 40 KB.' }, 400);
  let body = null;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'The body is not JSON.' }, 400); }
  const c = checkExampleBody(body);
  if (c.error) return json({ ok: false, error: c.error }, 400);
  if (!env || !env.SLACK_BOT_TOKEN) return json({ ok: false, error: 'No Slack bot token is set.' }, 500);
  const posted = [];
  for (const m of c.messages) {
    try {
      /* Always the bot (asUser false) and always the owner's DM: posting to a user id opens the app's DM with them. */
      const r = await slackPost(env, OWNER_SLACK, m.text, m.blocks, { asUser: false, username: 'Locus', ...(m.attachments ? { attachments: m.attachments } : {}) });
      posted.push(r && r.ts ? r.ts : null);
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e), posted }, 502);
    }
  }
  return json({ ok: true, posted });
}
