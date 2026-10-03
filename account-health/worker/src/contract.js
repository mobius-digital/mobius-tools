/**
 * The services agreement, signed inside the onboarding link (2026-10-02). Replaces
 * DocuSign for the standard retainer agreement.
 *
 * The text is the "Mobius Digital Services Agreement - Brand" Google Doc, with the
 * blanks filled from the New client form (company, contact, start date, term, payment
 * terms). Cole reads the filled copy on the setup screen, edits the term and payment
 * lines if needed, and presses "Send for signature": that records HIS signature
 * (name, time, IP) and emails the client a link to onboard/sign.html?t=<onboarding
 * token>. The client reads it, types their full name, ticks the consent box and
 * presses Sign. That records their name, email, time, IP and browser, plus a SHA-256
 * of the exact text they signed, and emails both sides a link to the signed copy.
 *
 * What makes it hold up (ESIGN / UETA): intent to sign (typed name + explicit
 * consent), consent to do it electronically (the tick box says so), the record is
 * kept and tamper-evident (the hash), and each party gets a copy. The signed page
 * prints to PDF from the browser. Nothing is ever edited after signing: the text
 * is frozen on send.
 *
 * Table: p_contract (one per onboarding token). Public routes by token:
 *   GET  /api/sign/:token           the agreement, and the signature if signed
 *   POST /api/sign/:token           { name, agree: true }  the client's signature
 */
import { googleToken } from './asana-brand.js';
import { sendMail } from './mail.js';

let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }

const SIGN_PAGE = 'https://tools.go-mobius-digital.com/onboard/sign.html?t=';
const OWNER = 'cole@go-mobius-digital.com';
const PROVIDER = 'Cole Wetzler';
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const longDate = ymd => { const d = new Date(`${ymd}T12:00:00Z`); return isNaN(d) ? ymd : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); };
export const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');

let tabled = false;
export async function ensureContractTable(env) {
  if (tabled) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_contract (
    token TEXT PRIMARY KEY, act_id TEXT, brand TEXT NOT NULL, vars_json TEXT NOT NULL DEFAULT '{}', html TEXT NOT NULL, hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent', sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    provider_name TEXT, provider_ip TEXT, provider_at TEXT,
    client_name TEXT, client_email TEXT, client_ip TEXT, client_ua TEXT, signed_at TEXT, copies_sent INTEGER NOT NULL DEFAULT 0)`).run();
  tabled = true;
}

/** Defaults for the editable lines, from what the New client form knows. */
export function contractDefaults(r) {
  const amt = r.retainer > 0 ? money(r.retainer) : '[amount]';
  return {
    company: r.name, client_name: r.contact_name || '', start_date: r.start_date || new Date().toISOString().slice(0, 10),
    term: 'one (1) month, renewing month to month',
    payment: `A monthly retainer of ${amt}, invoiced in advance each month. The first invoice is due before work begins; from the second month the retainer is charged automatically on the same day each month to the payment method on file.`,
  };
}

/** The agreement as HTML. Same words as the Google Doc, blanks filled. */
export function contractHtml(v) {
  const start = longDate(v.start_date);
  const li = (t, a, b) => `<li><strong>${t}</strong><ul><li>${a}</li><li>${b}</li></ul></li>`;
  return `<article class="agreement">
<h1>Mobius Digital Services Agreement</h1>
<p>This Services Agreement ("Agreement") is entered into as of <strong>${esc(start)}</strong>, by and between: <strong>Mobius Digital, LLC</strong> ("Provider") and <strong>${esc(v.company)}</strong>, represented by <strong>${esc(v.client_name)}</strong> ("Client"). Together referred to as the "Parties."</p>
<h2>1. Term</h2>
<p>The term of this Agreement shall begin on <strong>${esc(start)}</strong> and shall remain in effect for a period of <strong>${esc(v.term)}</strong>.</p>
<p>This Agreement will automatically renew for an additional term of the same length unless either Party provides written notice of termination at least seven (7) days prior to the end of the current term.</p>
<h2>2. Scope of Services</h2>
<p>Provider agrees to perform the following marketing and advertising services ("Services") for Client:</p>
<ol>
${li('Ad Conceptualization', "Develop innovative ad concepts that align with the Client's brand and target audience.", 'Craft unique selling propositions and key messaging for each campaign.')}
${li('Copywriting', 'Write compelling ad copy tailored to Facebook and Instagram.', "Ensure messaging aligns with Client's voice and campaign objectives.")}
${li('User-Generated Content (UGC) Script Creation', 'Create engaging scripts that highlight product or service benefits.', 'Direct tone and style to ensure authenticity and brand alignment.')}
${li('Ad Graphic Design', 'Design visually appealing graphics for both UGC and static ads.', 'Optimize visuals for performance across platforms.')}
${li('Ad Campaign Execution', 'Set up and launch ad campaigns on Facebook and Instagram.', 'Manage ad placements, targeting, and budgets.')}
${li('Performance Analysis and Reporting', 'Monitor, analyze, and report on campaign results.', 'Provide actionable insights and recommendations.')}
${li('Client Communication and Support', 'Conduct regular strategy and performance calls.', 'Maintain open communication through Slack or equivalent channel.')}
</ol>
<h2>3. Payment Terms</h2>
<p>Client agrees to compensate Provider as follows:</p>
<p>${esc(v.payment)}</p>
<ul>
<li>Payment is <strong>due upon receipt</strong> of invoice.</li>
<li>Services may be paused or terminated if payment is not received within seven (7) days of the due date.</li>
<li>All payments are <strong>non-refundable</strong> once services commence.</li>
</ul>
<h2>4. Late Payment</h2>
<p>In case of late payment, Provider reserves the right to charge statutory interest in accordance with the laws of Illinois and to pause ongoing work until payment is received.</p>
<h2>5. Termination</h2>
<p>Either Party may terminate this Agreement for any reason, with or without cause, by providing written notice at least seven (7) days before the end of the current term.</p>
<h2>6. Creative Property</h2>
<p>Provider may redistribute any creative content produced for Client (after it has been publicly posted by Client) on Provider's social media channels or marketing materials. If Client requests removal of such content, Provider shall comply within forty-eight (48) hours.</p>
<h2>7. Governing Law</h2>
<p>This Agreement shall be governed by and construed in accordance with the laws of the <strong>State of Illinois</strong>. Any disputes arising from this Agreement shall be handled by a competent court located in Illinois.</p>
<h2>8. Entire Agreement</h2>
<p>This document constitutes the entire agreement between the Parties. Any modification or waiver must be in writing and signed by both Parties.</p>
<h2>9. Electronic Signatures</h2>
<p>The Parties agree that this Agreement may be signed electronically, that an electronic signature made by typing one's name and confirming consent on the signing page has the same effect as a handwritten signature, and that the electronic record of this Agreement, including the time, email address and network address recorded at signing, is the signed original.</p>
<h2>In Witness Whereof</h2>
<p>Both Parties acknowledge that they have read and understood this Agreement and agree to all terms and conditions stated herein.</p>
</article>`;
}

/** Cole's edits, on a cheap model. Only what the instruction says changes; the rest of the
 *  words stay exactly as they are. Returns the whole agreement as HTML. ~1 cent a go. */
export async function aiEdit(env, html, instruction) {
  const ask = String(instruction || '').trim().slice(0, 3000);
  if (!ask) throw new Error('Say what should change.');
  const res = await F('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 8000,
      system: 'You edit a services agreement for a small ad agency. You get the agreement as HTML and an instruction from the agency owner. Change ONLY what the instruction asks for; every other sentence stays word for word. Keep the same HTML structure (one <article class="agreement"> with h1, h2, p, ol, ul, li, strong). Write plain English, no em dashes. If the instruction changes money, put the full payment terms in section 3 as one clear paragraph plus the three bullet points that are already there. If it asks for a new clause, add it as a numbered section before "In Witness Whereof" and renumber nothing else. If the instruction is missing something you would need to write it properly (an amount, a date, what exactly a new service covers, who pays for what), do NOT guess: reply with one line starting QUESTION: followed by the questions, and no HTML. Otherwise return ONLY the HTML, nothing before or after it.',
      messages: [{ role: 'user', content: `THE AGREEMENT:\n${html}\n\nTHE INSTRUCTION:\n${ask}` }] }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `Claude ${res.status}`);
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const q = /^\s*QUESTION:\s*([\s\S]+)$/.exec(text);
  if (q) return { question: q[1].trim().slice(0, 1500), cost: Math.round((((j.usage || {}).input_tokens || 0) * 1 + ((j.usage || {}).output_tokens || 0) * 5) / 1e6 * 10000) / 10000 };
  const m = /<article[\s\S]*<\/article>/.exec(text);
  if (!m) throw new Error('The AI did not return the agreement. Try wording the change differently.');
  const out = m[0].replace(/\u2014/g, ',').replace(/<script[\s\S]*?<\/script>/gi, '');
  const usage = j.usage || {};
  return { html: out, cost: Math.round(((usage.input_tokens || 0) * 1 + (usage.output_tokens || 0) * 5) / 1e6 * 10000) / 10000 };
}

/** An amendment to a SIGNED agreement, drafted on Haiku from Cole's plain words. It names the
 *  original, lists only what changes as numbered items, and keeps everything else in force.
 *  Missing facts come back as { question } instead of a guess. */
export async function aiAmend(env, signed, instruction, n, base) {
  const ask = String(instruction || '').trim().slice(0, 3000);
  if (!ask) throw new Error('Say what is changing.');
  const signedOn = (signed.signed_at || signed.sent_at || '').slice(0, 10);
  const res = await F('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 6000,
      system: `You write an amendment to a services agreement for a small ad agency, Mobius Digital, LLC. You get the SIGNED agreement and the owner's description of what is changing. Write Amendment No. ${n}. Output ONE <article class="agreement"> with: <h1>Amendment No. ${n} to the Mobius Digital Services Agreement</h1>; a <p> saying this amends the Services Agreement dated ${signedOn} between Mobius Digital, LLC ("Provider") and the client named in it ("Client") (the "Agreement"), effective on the date given in the instruction or, if none, on the date both Parties sign; <h2>Changes</h2> and an <ol> of numbered changes, each naming the section it changes and the new wording in full (for new services, what they include; for money, the full amount and when it is billed); <h2>Everything else stays the same</h2> with a <p> saying all other terms of the Agreement remain in full force and that if this Amendment and the Agreement conflict, this Amendment wins for the matters it covers. Plain English, no em dashes. If the description is missing something you would need (an amount, a start date, what exactly a new service covers, which section it replaces), do NOT guess: reply with one line starting QUESTION: and the questions, no HTML. Otherwise return ONLY the HTML.`,
      messages: [{ role: 'user', content: `THE SIGNED AGREEMENT:\n${signed.html}\n\n${base ? `THE CURRENT DRAFT OF THIS AMENDMENT (revise it):\n${base}\n\n` : ''}WHAT IS CHANGING:\n${ask}` }] }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `Claude ${res.status}`);
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const usage = j.usage || {};
  const cost = Math.round(((usage.input_tokens || 0) * 1 + (usage.output_tokens || 0) * 5) / 1e6 * 10000) / 10000;
  const q = /^\s*QUESTION:\s*([\s\S]+)$/.exec(text);
  if (q) return { question: q[1].trim().slice(0, 1500), cost };
  const m = /<article[\s\S]*<\/article>/.exec(text);
  if (!m) throw new Error('The AI did not return an amendment. Try wording it differently.');
  return { html: m[0].replace(/\u2014/g, ',').replace(/<script[\s\S]*?<\/script>/gi, ''), cost };
}

/** Freezes the amendment, signs it as Cole, emails the client the same signing page. */
export async function sendAmendment(env, r, html, ip) {
  await ensureContractTable(env);
  const base = await env.DB.prepare(`SELECT * FROM p_contract WHERE token = ?1`).bind(r.token || '').first();
  if (base?.status !== 'signed') throw new Error('Amendments are for a signed agreement. This one is not signed yet: change it before it is signed instead.');
  if (!/^<article[\s\S]*<\/article>$/.test(String(html || '').trim())) throw new Error('Draft the amendment first.');
  const n = ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM p_contract WHERE token LIKE ?1`).bind(`${r.token}a%`).first())?.n || 0) + 1;
  const token = `${r.token}a${n}`;
  const clean = String(html).trim().replace(/<script[\s\S]*?<\/script>/gi, '');
  const hash = await sha256(textOf(clean));
  const now = new Date().toISOString();
  const v = { ...safeJson(base.vars_json, {}), amendment: n, of: r.token };
  await env.DB.prepare(`INSERT INTO p_contract (token, act_id, brand, vars_json, html, hash, status, sent_at, provider_name, provider_ip, provider_at, client_email)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'sent', ?7, ?8, ?9, ?7, ?10)`).bind(token, base.act_id, base.brand, JSON.stringify(v), clean, hash, now, PROVIDER, ip || null, base.client_email).run();
  const link = SIGN_PAGE + token;
  await gmail(env, base.client_email, `Amendment No. ${n} to your agreement with Mobius Digital: please sign`,
`Hi ${(v.client_name || '').split(/\s+/)[0] || 'there'},

We have written up the change we discussed as Amendment No. ${n} to our services agreement. Read it and sign it here:
${link}

Everything else in the agreement stays the same. You get a copy by email the moment it is signed.

Cole
Mobius Digital`);
  return { token, n, url: link };
}

const textOf = html => html.replace(/<li>/g, '- ').replace(/<\/(p|li|h1|h2)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();

/* ---------------- email (Cole's Gmail, same delegation as the welcome email) ---------------- */
const b64url = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/* Every email goes through mail.js (HTML + Cole's signature). The old plain-text sender is kept below
   only as the fallback when that one throws. */
async function gmail(env, to, subject, body) {
  try { return await sendMail(env, to, subject, String(body).replace(/\n\nCole\nMobius Digital\s*$/, '\n\nThanks,')); } catch (e) { console.log('html mail: ' + e.message); }
  const tok = await googleToken(env, OWNER, 'https://www.googleapis.com/auth/gmail.send');
  const mime = [`From: Cole Wetzler <${OWNER}>`, `To: ${to}`, `Subject: =?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(subject)))}?=`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', body].join('\r\n');
  const res = await F('https://www.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64url(mime) }) });
  if (!res.ok) throw new Error(`Gmail: ${(await res.json().catch(() => ({}))).error?.message || res.status}`);
}

/* ---------------- send (Cole, from the setup screen) ---------------- */
/** Freezes the text, records Cole's signature, emails the client the signing link. */
export async function sendContract(env, r, vars, ip) {
  await ensureContractTable(env);
  if (!r.token) throw new Error('Make the onboarding link first: the agreement is signed inside it.');
  const have = await env.DB.prepare(`SELECT status FROM p_contract WHERE token = ?1`).bind(r.token).first();
  if (have?.status === 'signed') throw new Error('This agreement is already signed. It cannot be changed.');
  const v = { ...contractDefaults(r), ...Object.fromEntries(Object.entries(vars || {}).filter(([k, x]) => ['client_name', 'company', 'start_date', 'term', 'payment'].includes(k) && String(x || '').trim()).map(([k, x]) => [k, String(x).trim().slice(0, 2000)])) };
  if (!v.client_name) throw new Error('The agreement needs the client\'s full name (the person signing).');
  /* A text the AI edited for this client replaces the generated one, as is. */
  const custom = /^<article[\s\S]*<\/article>$/.test(String(vars?.html || '').trim()) ? String(vars.html).trim().replace(/<script[\s\S]*?<\/script>/gi, '') : null;
  if (custom) v.custom = true;
  const html = custom || contractHtml(v);
  const hash = await sha256(textOf(html));
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO p_contract (token, act_id, brand, vars_json, html, hash, status, sent_at, provider_name, provider_ip, provider_at, client_email)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'sent', ?7, ?8, ?9, ?7, ?10)
    ON CONFLICT(token) DO UPDATE SET act_id = excluded.act_id, vars_json = excluded.vars_json, html = excluded.html, hash = excluded.hash, status = 'sent', sent_at = excluded.sent_at, provider_name = excluded.provider_name, provider_ip = excluded.provider_ip, provider_at = excluded.provider_at, client_email = excluded.client_email`)
    .bind(r.token, r.act_id || r.pending_act || null, r.name, JSON.stringify(v), html, hash, now, PROVIDER, ip || null, r.contact_email || null).run();
  const link = SIGN_PAGE + r.token;
  await gmail(env, r.contact_email, `Your agreement with Mobius Digital: please sign`,
`Hi ${(v.client_name || '').split(/\s+/)[0] || 'there'},

Here is our services agreement for ${v.company}. Read it and sign it here:
${link}

It takes a minute: read, type your name, tick the box, press Sign. You get a copy by email the moment it is signed, and you can print or save it as a PDF from that page any time.

Cole
Mobius Digital`);
  return { url: link, hash, sent_at: now };
}

/* An amendment's token is `<base>a<n>`, but a base token is hex and can itself end in "a" + digits,
   so the base comes from the amendment's own record (vars.of), never from stripping the token. */
const baseToken = c => safeJson(c.vars_json, {}).of || c.token;

/* The internal channel hears when an agreement or amendment is signed. */
async function signedPing(env, c) {
  const run = await env.DB.prepare(`SELECT slack_internal FROM p_newclient WHERE token = ?1`).bind(baseToken(c)).first().catch(() => null);
  if (!run?.slack_internal || !env.SLACK_BOT_TOKEN) return;
  const v = safeJson(c.vars_json, {});
  await F('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: run.slack_internal, unfurl_links: false, text: `*${c.brand} signed ${v.amendment ? `Amendment No. ${v.amendment}` : 'the services agreement'}* (${c.client_name}). A copy is in their Drive under Agreements.` }) });
}

/* ---------------- the signed copy, kept in the client's Drive (Agreements) ---------------- */
async function saveSignedToDrive(env, c) {
  const run = await env.DB.prepare(`SELECT steps_json FROM p_newclient WHERE token = ?1`).bind(baseToken(c)).first().catch(() => null);
  const folder = safeJson(run?.steps_json, {}).drive?.folders?.agreements;
  if (!folder) return;
  const v = safeJson(c.vars_json, {});
  const when = iso => iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Chicago' }) + ' CT' : '';
  const html = `<html><body style="font-family:Arial,sans-serif">${c.html}<hr><p><b>Signed electronically</b></p>
<p>Provider: ${esc(c.provider_name)}, Mobius Digital, LLC, ${esc(when(c.provider_at))}</p>
<p>Client: ${esc(c.client_name)} (${esc(c.client_email || '')}), ${esc(v.company || c.brand)}, ${esc(when(c.signed_at))}, from ${esc(c.client_ip || 'unknown address')}</p>
<p style="font-size:9pt;color:#666">Document fingerprint (SHA-256) ${esc(c.hash)}. Signed copy: ${SIGN_PAGE}${c.token}</p></body></html>`;
  const name = `${c.brand} - ${v.amendment ? `Amendment No. ${v.amendment}` : 'Services Agreement'} - signed ${String(c.signed_at || '').slice(0, 10)}`;
  const tok = await googleToken(env, OWNER, 'https://www.googleapis.com/auth/drive');
  const bnd = 'locus' + crypto.randomUUID().replace(/-/g, '');
  const body = `--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType: 'application/vnd.google-apps.document', parents: [folder] })}\r\n--${bnd}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${bnd}--`;
  const res = await F('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': `multipart/related; boundary=${bnd}` }, body });
  if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
  /* The kept copy is a PDF (Cole): Google turns the doc into one, the PDF is filed, the doc is removed. */
  const docId = (await res.json()).id;
  const pdf = await F(`https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=application/pdf`, { headers: { Authorization: `Bearer ${tok}` } });
  if (!pdf.ok) return;   // the Google Doc stays as the copy
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  const head = new TextEncoder().encode(`--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: `${name}.pdf`, mimeType: 'application/pdf', parents: [folder] })}\r\n--${bnd}\r\nContent-Type: application/pdf\r\n\r\n`);
  const tail = new TextEncoder().encode(`\r\n--${bnd}--`);
  const all = new Uint8Array(head.length + bytes.length + tail.length); all.set(head, 0); all.set(bytes, head.length); all.set(tail, head.length + bytes.length);
  const up = await F('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': `multipart/related; boundary=${bnd}` }, body: all });
  if (up.ok) await F(`https://www.googleapis.com/drive/v3/files/${docId}?supportsAllDrives=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } }).catch(() => {});
}

/* ---------------- public routes (the client) ---------------- */
export async function handleSign(request, env, path, json) {
  const m = /^\/api\/sign\/([a-f0-9]{24,40})$/.exec(path);
  if (!m) return null;
  await ensureContractTable(env);
  const row = await env.DB.prepare(`SELECT * FROM p_contract WHERE token = ?1`).bind(m[1]).first();
  if (!row) return json({ error: 'There is no agreement on this link yet. Ask your Mobius contact.' }, 404);
  const pub = r => ({ brand: r.brand, html: r.html, hash: r.hash, status: r.status, sent_at: r.sent_at, provider: { name: r.provider_name, at: r.provider_at },
    client: r.status === 'signed' ? { name: r.client_name, email: r.client_email, at: r.signed_at, ip: r.client_ip } : null, vars: safeJson(r.vars_json, {}) });
  if (request.method === 'GET') return json(pub(row));
  if (request.method === 'POST') {
    if (row.status === 'signed') return json({ error: 'This agreement is already signed.', ...pub(row) }, 409);
    const b = await request.json().catch(() => ({}));
    const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (name.split(' ').length < 2) return json({ error: 'Type your full name, first and last, exactly as you want it on the agreement.' }, 400);
    if (b.agree !== true) return json({ error: 'Tick the box to confirm you agree to sign electronically.' }, 400);
    /* The text is checked against its hash first: a signature on altered text is refused. */
    if ((await sha256(textOf(row.html))) !== row.hash) return json({ error: 'This agreement does not match its record. Ask your Mobius contact for a fresh one.' }, 409);
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ua = (request.headers.get('User-Agent') || '').slice(0, 300);
    const now = new Date().toISOString();
    const upd = await env.DB.prepare(`UPDATE p_contract SET status = 'signed', client_name = ?2, client_ip = ?3, client_ua = ?4, signed_at = ?5 WHERE token = ?1 AND status != 'signed'`).bind(row.token, name, ip, ua, now).run();
    /* A double press: the first one signed it and sends the copies; this one stops here. */
    if (!upd.meta?.changes) { const was = await env.DB.prepare(`SELECT * FROM p_contract WHERE token = ?1`).bind(row.token).first(); return json({ error: 'This agreement is already signed.', ...pub(was) }, 409); }
    const fresh = await env.DB.prepare(`SELECT * FROM p_contract WHERE token = ?1`).bind(row.token).first();
    /* Both sides get a copy. The onboarding form's "Sign the agreement" box ticks itself. */
    const link = SIGN_PAGE + row.token;
    const note = `${fresh.brand}: services agreement signed by ${name} on ${now.slice(0, 10)}.\n\nThe signed copy (print or save as PDF from the page):\n${link}\n\nRecord: signed ${now} from ${ip || 'unknown address'}. Document fingerprint ${fresh.hash}.`;
    let copies = 0;
    for (const to of [fresh.client_email, OWNER].filter(Boolean)) { try { await gmail(env, to, `Signed: ${fresh.brand} services agreement`, note); copies++; } catch {} }
    await env.DB.prepare(`UPDATE p_contract SET copies_sent = ?2 WHERE token = ?1`).bind(row.token, copies).run();
    await saveSignedToDrive(env, fresh).catch(e => console.log('agreement to drive: ' + e.message));
    await signedPing(env, fresh).catch(() => {});
    await env.DB.prepare(`UPDATE p_br_onboard SET answers_json = json_set(answers_json, '$.st_agreement', json('true')), updated_at = datetime('now') WHERE token = ?1`).bind(row.token).run().catch(() => {});
    return json({ ok: true, ...pub(fresh) });
  }
  return json({ error: 'method' }, 405);
}
