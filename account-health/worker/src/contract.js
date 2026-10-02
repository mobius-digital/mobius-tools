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
    term: 'three (3) months',
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

/** A plain-text form of the same words, for the hash and the email. */
const textOf = html => html.replace(/<li>/g, '- ').replace(/<\/(p|li|h1|h2)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();

/* ---------------- email (Cole's Gmail, same delegation as the welcome email) ---------------- */
const b64url = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function gmail(env, to, subject, body) {
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
  const html = contractHtml(v);
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
    await env.DB.prepare(`UPDATE p_contract SET status = 'signed', client_name = ?2, client_ip = ?3, client_ua = ?4, signed_at = ?5 WHERE token = ?1 AND status != 'signed'`).bind(row.token, name, ip, ua, now).run();
    const fresh = await env.DB.prepare(`SELECT * FROM p_contract WHERE token = ?1`).bind(row.token).first();
    /* Both sides get a copy. The onboarding form's "Sign the agreement" box ticks itself. */
    const link = SIGN_PAGE + row.token;
    const note = `${fresh.brand}: services agreement signed by ${name} on ${now.slice(0, 10)}.\n\nThe signed copy (print or save as PDF from the page):\n${link}\n\nRecord: signed ${now} from ${ip || 'unknown address'}. Document fingerprint ${fresh.hash}.`;
    let copies = 0;
    for (const to of [fresh.client_email, OWNER].filter(Boolean)) { try { await gmail(env, to, `Signed: ${fresh.brand} services agreement`, note); copies++; } catch {} }
    await env.DB.prepare(`UPDATE p_contract SET copies_sent = ?2 WHERE token = ?1`).bind(row.token, copies).run();
    await env.DB.prepare(`UPDATE p_br_onboard SET answers_json = json_set(answers_json, '$.st_agreement', json('true')), updated_at = datetime('now') WHERE token = ?1`).bind(row.token).run().catch(() => {});
    return json({ ok: true, ...pub(fresh) });
  }
  return json({ error: 'method' }, 405);
}
