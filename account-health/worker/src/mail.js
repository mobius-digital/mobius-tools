/**
 * Email from Cole's Gmail (2026-10-03). Everything Locus sends a client (the welcome email, the agreement,
 * an amendment, a Shopify heads-up) goes through here: the text Cole approved, turned into simple HTML
 * (paragraphs, bullet lines, clickable links) with his branded signature underneath.
 *
 * The Gmail API never adds the signature set in Gmail's own settings, so it is added here. The same
 * signature, for Gmail itself, is at tools.go-mobius-digital.com/brand/signature.html (copy, paste into
 * Gmail > Settings > Signature).
 */
import { googleToken } from './asana-brand.js';

let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }

const OWNER = 'cole@go-mobius-digital.com';
const LOGO = 'https://tools.go-mobius-digital.com/brand/mobius-logo-email.png';

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

/** Sends `text` (as Cole approved it) from Cole's Gmail, as HTML with the signature, plus a plain-text part. */
export async function sendMail(env, to, subject, text) {
  const tok = await googleToken(env, OWNER, 'https://www.googleapis.com/auth/gmail.send');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#13202B;max-width:600px">${textToHtml(text)}${SIGNATURE_HTML}</div>`;
  const plain = `${String(text).trim()}\n\nCole Wetzler\nFounder, Mobius Digital\n${OWNER}\ngo-mobius-digital.com`;
  const bnd = 'mobius' + crypto.randomUUID().replace(/-/g, '');
  const mime = [`From: Cole Wetzler <${OWNER}>`, `To: ${to}`, `Subject: =?UTF-8?B?${b64(subject)}?=`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${bnd}"`, '',
    `--${bnd}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(plain),
    `--${bnd}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html),
    `--${bnd}--`, ''].join('\r\n');
  const res = await F('https://www.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64url(mime) }) });
  if (!res.ok) throw new Error(`Gmail: ${(await res.json().catch(() => ({}))).error?.message || res.status}`);
}
