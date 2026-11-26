/**
 * Email from Cole's Gmail (2026-10-03). Everything Locus sends a client (the welcome email, the agreement,
 * an amendment, a Shopify heads-up) goes through here: the text Cole approved, turned into simple HTML
 * (paragraphs, bullet lines, clickable links) with his branded signature underneath.
 *
 * The Gmail API never adds the signature set in Gmail's own settings, so it is added here. The same
 * signature, for Gmail itself, is at tools.go-mobius-digital.com/brand/signature.html (copy, paste into
 * Gmail > Settings > Signature).
 *
 * THE SENDER SWITCH (2026-11-26, onboarding). Two senders:
 *   sendMail         Cole personally, through his Gmail. Every onboarding mail (welcome, agreement, hand off, the
 *                    day 3 and day 7 reminders, Remind them) goes this way (Cole's decision 8).
 *   sendProductMail  a system mail (today only the 6 digit sign up code). Resend when env.RESEND_API_KEY AND the
 *                    settings key mailFrom are both set; otherwise it falls through to sendMail. No Resend key
 *                    exists yet, so today it is Cole's Gmail. Moving product mail later = set the key and mailFrom.
 * Test guard, in both: env.MAIL_DRY set = no network at all, the message lands on the exported `outbox` and the
 * call answers {dry: true}; settings mailTestTo set = every recipient becomes that address and the subject starts
 * "[test for <original>] ".
 */
import { googleToken } from './asana-brand.js';
import { senderFor } from './sender.js';

let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }

const OWNER = 'cole@go-mobius-digital.com';
const LOGO = 'https://tools.go-mobius-digital.com/brand/mobius-logo-email.png';

/** Messages that were not sent because env.MAIL_DRY was set (tests read it). */
export const outbox = [];

export const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;font-family:Arial,Helvetica,sans-serif;color:#13202B">
<tr><td style="padding:0 16px 0 0;border-right:2px solid #2F9AD6;vertical-align:middle"><a href="https://go-mobius-digital.com"><img src="${LOGO}" width="150" alt="Mobius Digital" style="display:block;border:0;width:150px;height:auto"></a></td>
<td style="padding:0 0 0 16px;vertical-align:middle;font-size:13px;line-height:1.5"><b style="font-size:14px">Cole Wetzler</b><br><span style="color:#6B7A88">Founder, Mobius Digital</span><br><a href="mailto:${OWNER}" style="color:#2F9AD6;text-decoration:none">${OWNER}</a><br><a href="https://go-mobius-digital.com" style="color:#2F9AD6;text-decoration:none">go-mobius-digital.com</a></td></tr></table>`;

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Plain text to email HTML: blank lines make paragraphs, "- " lines make a list, URLs become links. */
export function textToHtml(text) {
  const link = s => esc(s).replace(/https?:\/\/[^\s<]+[^\s<.,)]/g, u => `<a href="${u}" style="color:#2F9AD6">${u}</a>`);
  const blocks = String(text || '').replace(/\r/g, '').trim().split(/\n{2,}/);
  return blocks.map(b => {
    const lines = b.split('\n');
    if (lines.every(l => /^\s*[-•]\s+/.test(l))) return `<ul style="margin:0 0 14px;padding-left:20px">${lines.map(l => `<li style="margin:4px 0">${link(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p style="margin:0 0 14px">${lines.map(link).join('<br>')}</p>`;
  }).join('');
}

const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64url = s => b64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function setting(env, key) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first();
    const raw = row?.value;
    if (raw == null || raw === '') return '';
    try { const v = JSON.parse(raw); return typeof v === 'string' ? v.trim() : ''; } catch { return String(raw).trim(); }
  } catch { return ''; }
}

/** The test guard, shared by both senders. Answers the (maybe rewritten) recipient and subject, or {dry} when
 *  nothing may leave. Exported so the old plain-text fallback in contract.js keeps the same rule. */
export async function mailGuard(env, to, subject, text, via) {
  const testTo = env?.DB ? await setting(env, 'mailTestTo') : '';
  if (testTo && /@/.test(testTo)) { subject = `[test for ${to}] ${subject}`; to = testTo; }
  if (env && env.MAIL_DRY) { outbox.push({ via, to, subject, text: String(text || '') }); return { dry: true, to, subject }; }
  return { dry: false, to, subject };
}

/** The test recipient (settings mailTestTo) or ''. Senders that are not mail (Stripe's invoice email, the Slack Connect
 *  invite, the Google Ads manager request) read it too, so a test Send never reaches a real client. */
export async function testRecipient(env) {
  const t = env?.DB ? await setting(env, 'mailTestTo') : '';
  return t && /@/.test(t) ? t : '';
}

/** Which sender a product mail would use right now: 'resend' or 'gmail'. */
export async function productSender(env) {
  const from = await setting(env, 'mailFrom');
  return env && env.RESEND_API_KEY && from ? 'resend' : 'gmail';
}

/** Sends `text` (as Cole approved it) from Cole's Gmail, as HTML with the signature, plus a plain-text part.
 *  opts.kind (sender.js SENDER_KINDS, an email kind) picks the mailbox: Cole's (as before, with his signature) or the
 *  Locus mailbox (LOCUS_MAIL_FROM, From name "Locus", no personal signature). No kind = Cole, exactly as before.
 *  The test guard (mailGuard) runs first, whatever the mailbox. */
export async function sendMail(env, to, subject, text, opts = {}) {
  const g = await mailGuard(env, to, subject, text, 'gmail');
  if (g.dry) return { dry: true };
  to = g.to; subject = g.subject;
  const s = opts.kind ? await senderFor(env, opts.kind).catch(() => null) : null;
  const app = !!(s && s.who === 'locus' && s.mail && s.mail.subject);
  const box = app ? s.mail.subject : OWNER;
  const tok = await googleToken(env, box, 'https://www.googleapis.com/auth/gmail.send');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#13202B;max-width:600px">${textToHtml(text)}${app ? '' : SIGNATURE_HTML}</div>`;
  const plain = app ? String(text).trim() : `${String(text).trim()}\n\nCole Wetzler\nFounder, Mobius Digital\n${OWNER}\ngo-mobius-digital.com`;
  const bnd = 'mobius' + crypto.randomUUID().replace(/-/g, '');
  const mime = [app ? `From: ${s.mail.fromName || 'Locus'} <${box}>` : `From: Cole Wetzler <${OWNER}>`, `To: ${to}`, `Subject: =?UTF-8?B?${b64(subject)}?=`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${bnd}"`, '',
    `--${bnd}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(plain),
    `--${bnd}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html),
    `--${bnd}--`, ''].join('\r\n');
  const res = await F('https://www.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64url(mime) }) });
  if (!res.ok) throw new Error(`Gmail: ${(await res.json().catch(() => ({}))).error?.message || res.status}`);
  return { sent: true, via: 'gmail' };
}

/** A system mail (the 6 digit code). Resend when a key and a sender are set, else Cole's Gmail (sendMail). */
export async function sendProductMail(env, to, subject, text) {
  if ((await productSender(env)) !== 'resend') return sendMail(env, to, subject, text);
  const g = await mailGuard(env, to, subject, text, 'resend');
  if (g.dry) return { dry: true };
  const from = await setting(env, 'mailFrom');
  const res = await F('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [g.to], subject: g.subject, text: String(text || ''), html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#13202B;max-width:600px">${textToHtml(text)}</div>` }) });
  if (!res.ok) throw new Error(`Resend: ${(await res.json().catch(() => ({}))).message || res.status}`);
  return { sent: true, via: 'resend' };
}
