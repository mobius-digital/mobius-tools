/**
 * Gmail, read-only, for going and finding a receipt instead of waiting to be
 * sent one. Same Google client as Drive (an Internal app, so no review), its
 * own refresh token in settings.gmailAuth, scope gmail.readonly: the worst a
 * leaked token could do is read mail, never send, delete or label it.
 *
 * Why the AMOUNT is the search key: bank lines name vendors badly ("SQ *TRYBE",
 * "PADDLE.NET* N8N") but a receipt always prints the total, and Gmail indexes
 * "10.85" inside "$10.85". Tested on Cole's mailbox 2026-10-03: the amount plus
 * a date window found the exact Anthropic receipt and nothing else.
 */
import { driveAccessToken } from './drive.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export function gmailAuthUrl(env, redirectUri, state) {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code',
    scope: GMAIL_SCOPE, access_type: 'offline', prompt: 'consent', state,
  });
  return `${AUTH_URL}?${p}`;
}

async function gget(env, store, path, params = {}) {
  const token = await driveAccessToken(env, store);   // scope-agnostic refresh
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error('Gmail: ' + (j.error.message || r.status));
  return j;
}

/** Message ids for a Gmail query, newest first. */
export async function gmailSearch(env, store, q, max = 6) {
  const j = await gget(env, store, 'messages', { q, maxResults: String(max) });
  return (j.messages || []).map(m => m.id);
}

const b64urlBytes = s => {
  const bin = atob(String(s || '').replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64urlText = s => new TextDecoder().decode(b64urlBytes(s));

/** One message, flattened: headers, html/text bodies, attachment list. */
export async function gmailMessage(env, store, id) {
  const m = await gget(env, store, `messages/${id}`, { format: 'full' });
  const head = n => (m.payload?.headers || []).find(h => h.name.toLowerCase() === n)?.value || '';
  const out = { id, from: head('from'), subject: head('subject'), date: head('date'),
                snippet: m.snippet || '', html: '', text: '', attachments: [],
                link: `https://mail.google.com/mail/u/0/#all/${m.threadId || id}` };
  const walk = p => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId)
      out.attachments.push({ name: p.filename, mimeType: p.mimeType, attachmentId: p.body.attachmentId, size: p.body.size || 0 });
    else if (p.mimeType === 'text/html' && p.body?.data && !out.html) out.html = b64urlText(p.body.data);
    else if (p.mimeType === 'text/plain' && p.body?.data && !out.text) out.text = b64urlText(p.body.data);
    for (const c of p.parts || []) walk(c);
  };
  walk(m.payload);
  return out;
}

export async function gmailAttachment(env, store, msgId, attId) {
  const j = await gget(env, store, `messages/${msgId}/attachments/${attId}`);
  return b64urlBytes(j.data);
}

/** Gmail dates are YYYY/MM/DD; `before:` is exclusive. */
export const gmailDay = ymd => String(ymd).slice(0, 10).replace(/-/g, '/');

/** "1234.5" -> ["1234.50", "1,234.50"]: receipts print either. */
export function amountTerms(amount) {
  const plain = Math.abs(Number(amount)).toFixed(2);
  const comma = Number(plain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return [...new Set([plain, comma])];
}

/* The one word of a bank line most likely to be in the sender or subject.
 * "PADDLE.NET* N8N" -> "n8n" would be ideal, but the first real word is
 * what the vendor rules usually leave behind, and it is only the fallback. */
const NOISE = new Set(['inc', 'llc', 'ltd', 'co', 'corp', 'the', 'com', 'www', 'sq', 'tst', 'pp', 'paypal', 'payment', 'pmt', 'ach', 'online', 'purchase', 'debit', 'card']);
export function vendorWord(vendor) {
  const words = String(vendor || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !NOISE.has(w) && !/^\d+$/.test(w));
  return words[0] || null;
}
