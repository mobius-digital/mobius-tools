/* Sign in. People sign in on this page and land in this app. Nothing here opens the old app.
   The ways in are the ones the workers offer (there is no password route: a person signs in as themselves):
     1. Google: Google's own button, on this page, in a popup. The answer goes to POST /api/google-login.
        This is the main button, and the only way in for the team.
     2. An emailed one time link, for invited clients only (the worker mails nobody else):
        POST /api/clients/login-link sends it, POST /api/clients/signin redeems ?signin=<token>.
     3. A client invite link, ?invite=<token>: GET /api/clients/invite-info says whose it is. This is "make your login":
      Google (1), or an emailed 6 digit code: POST /api/clients/code { invite } sends it, POST /api/clients/code/verify
      { invite, code } answers the same session shape as /api/clients/signin. A brand new client then lands on Get started.
   All four routes are on the account-health worker. The session is stored exactly as the live app stores it
   (keepSession below), so every tool on this address sees the same sign in.
   Nothing typed here is logged or stored: an email goes into the one request and nowhere else.
   In sample mode nothing is sent. */

import { put } from '../kit.js';
import { h, s, svgNode, field, statusDot, legend, gauge, takeaway, em, addStyles } from '../kit.js';
import { mark, icon, GOOGLE_G } from '../icons.js';
import { APP_NAME, APP_WORD, ORG_NAME, ORG_SHORT, LS, SAMPLE, workers, GOOGLE_CLIENT_ID, GOOGLE_SCRIPT, googleHopUrl, SIGNIN_LINK_MIN } from '../config.js';

/* ---------- the sign in itself (app.js uses these for a link in the address) ---------- */

const OFFLINE = 'Could not reach the sign in service. Check the connection and try again.';
async function ask(path, body) {
  if (SAMPLE) throw new Error('Sample mode sends nothing.');
  let res;
  try {
    res = await fetch(workers().ah + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new Error(OFFLINE); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error || 'Something went wrong. Try again.'); e.status = res.status; throw e; }
  return j;
}

/** Store a session the way the live app does (profit/index.html keepSession): this app's key and the shared keys. */
export function keepSession(j) {
  if (!j || !j.token) throw new Error('The sign in did not finish. Try again.');
  try {
    localStorage.setItem(LS.tok, j.token);
    localStorage.setItem(LS.shared, j.token);
    localStorage.setItem(LS.email, j.email || '');
    localStorage.setItem(LS.sharedExp, String(j.exp || 0));
    if (j.role === 'client') localStorage.setItem(LS.role, 'client'); else localStorage.removeItem(LS.role);
  } catch { throw new Error('This browser would not save the sign in. Turn off private mode and try again.'); }
}

/** Redeem an emailed one time link (?signin=<token>) and store the session. */
export async function redeemLink(t) { keepSession(await ask('/api/clients/signin', { t })); }

/** Whose invite is this (?invite=<token>)? Always answers: { ok, name, email (masked), brands, token } or { ok: false, error }.
    The worker answers ok: false for a dead or expired invite. When it could not be asked at all (no connection,
    a server error) the answer also carries retry: true: the invite may be fine, so the caller must keep it. */
export async function readInvite(t) {
  try { return { ...(await ask('/api/clients/invite-info?t=' + encodeURIComponent(t))), token: t }; }
  catch { return { ok: false, retry: true, error: 'Could not read this invite. Check the connection and try again.' }; }
}

/** The address the person first asked for, without a one time token and without the sign in route. */
export function backAddress() {
  const q = new URLSearchParams(location.search);
  q.delete('signin'); q.delete('invite');
  const qs = q.toString();
  const hash = /^#\/?signin(\/|$)/.test(location.hash) ? '' : location.hash;
  return location.pathname + (qs ? '?' + qs : '') + hash;
}

/* Google's script, once. Rejects when it cannot load, so the button can fall back. */
let gsi = null;
function loadGoogle() {
  const ready = () => !!(window.google && window.google.accounts && window.google.accounts.id);
  if (ready()) return Promise.resolve();
  if (!gsi) {
    gsi = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = GOOGLE_SCRIPT; el.async = true;
      el.onload = () => (ready() ? resolve() : reject(new Error('blocked')));
      el.onerror = () => reject(new Error('blocked'));
      setTimeout(() => reject(new Error('slow')), 8000);
      document.head.append(el);
    });
    gsi.catch(() => { gsi = null; });
  }
  return gsi;
}

/* the product picture on the right: sample figures, drawn once */
function picture() {
  const cum = [3850, 6650, 9100, 10250, 12400, 14700, 19300, 22000, 25600, 27900, 30000, 32400, 35100, 38200, 40100, 43500, 43950, 45050, 46100, 46700, 47200, 47641];
  const scale = 44721 / 47641, max = 50000, x1 = 470, yTop = 26, yBot = 196;
  const pts = cum.map((v, i) => [x1 * i / (cum.length - 1), yBot - (yBot - yTop) * v * scale / max]);
  let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i], mx = ((p[0] + q[0]) / 2).toFixed(1);
    d += ` C${mx} ${p[1].toFixed(1)} ${mx} ${q[1].toFixed(1)} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  const py0 = yBot - (yBot - yTop) * 1860 / max, py1 = yBot - (yBot - yTop) * 40924 / max;
  const svg = s('svg', { class: 'ch lx-plot', viewBox: '0 0 520 220', preserveAspectRatio: 'none' },
    [50, 106, 162].map(y => s('line', { class: 'gl', x1: 28, x2: 492, y1: y, y2: y })),
    s('path', { class: 'area', d: `${d} L${last[0].toFixed(1)} 220 L0 220 Z` }),
    s('path', { class: 'cmp', d: `M0 ${py0.toFixed(1)} L${x1} ${py1.toFixed(1)}` }),
    s('path', { class: 's1', d }),
    s('circle', { class: 'dot', cx: last[0].toFixed(1), cy: last[1].toFixed(1), r: 5.5 }));
  return h('section', { class: 'lx-si-right', 'aria-hidden': 'true' },
    h('div', { class: 'lx-si-copy' }, h('h2', null, 'Every number,', h('br'), 'in its ', em('place.')), h('p', null, 'See what is working and what to do next.')),
    h('div', { class: 'lx-si-card lx-si-main' },
      h('div', { class: 'hd' }, h('div', { class: 'l' }, 'Sales this month'), h('div', { class: 'v' }, '$44,721'),
        h('div', { class: 'sub' }, statusDot('good', '9% ahead of plan'), h('span', null, 'plan $40,924'))),
      legend([{ name: 'Sales', lead: true }, { name: 'Plan', color: '#A3ABBD' }]), svg),
    h('div', { class: 'lx-si-card lx-si-side', style: { top: '316px' } },
      h('div', { class: 'l' }, 'MER, whole store'), h('div', { class: 'v' }, '1.75x'),
      h('div', { style: { marginTop: '14px' } }, gauge({ value: 1.75, goal: 2.5, max: 3, thin: true })),
      h('div', { class: 's', style: { display: 'flex', justifyContent: 'space-between', marginTop: '10px' } }, h('span', null, '0'), h('span', null, 'goal 2.50x'))),
    h('div', { class: 'lx-si-card lx-si-side', style: { top: '498px' } },
      h('div', { class: 'l' }, 'New customers'), h('div', { class: 'v' }, '231'), h('div', { class: 's' }, 'Nov 1 to 22')),
    h('div', { class: 'lx-si-ai' }, takeaway(['Sales are ', h('b', null, '$3,797 ahead'), ' of plan this month.'])));
}

const firstName = n => String(n || '').trim().split(/\s+/)[0];

export default {
  title: 'Sign in',
  /* ctx: { message, sample, invite, onDone }. onDone runs once the session is stored (app.js then loads the app). */
  render(el, _data, ctx = {}) {
    const sample = !!ctx.sample;
    const inv = ctx.invite && ctx.invite.ok ? ctx.invite : null;
    const done = () => (ctx.onDone ? ctx.onDone() : location.reload());
    const toSample = () => { say('Sample mode. Nothing is sent.', 'good'); setTimeout(() => { location.href = './?sample=1'; }, 600); };

    /* one line under the buttons: what is happening, and what went wrong */
    const line = h('p', { class: 'lx-si-note', role: 'status', 'aria-live': 'polite', style: { minHeight: '18px', lineHeight: '1.45' } });
    function say(text, tone) {
      line.textContent = text || '';
      line.style.color = tone === 'bad' ? 'var(--bad)' : tone === 'good' ? 'var(--good)' : '';
      line.style.fontWeight = tone === 'bad' ? '600' : '';
      line.setAttribute('role', tone === 'bad' ? 'alert' : 'status');
    }

    const email = inv ? null : field({ label: 'Email', type: 'email', name: 'email', placeholder: 'you@yourbrand.com', autocomplete: 'email', inputmode: 'email', icon: 'email', id: 'si-email',
      hint: 'For invited clients. No password: we email you a sign in link.' });
    const goText = inv ? 'Email me a code' : 'Email me a sign in link';
    const goLabel = h('span', null, goText);
    const go = h('button', { class: 'lx-btn', type: 'submit' }, goLabel, svgNode(icon('arrow')));
    const gLabel = h('span', null, 'Continue with Google');
    /* Our own button shows only until Google's is drawn, or when Google's cannot load here. */
    const gBtn = h('button', { class: 'lx-btn primary', type: 'button', onclick: () => googleClick() }, svgNode(GOOGLE_G), gLabel);
    /* Google's real button, drawn by Google and shown as it is. Nothing see through sits over the page,
       so a tap always lands on something the person can see. */
    const gSlot = h('div', { style: { display: 'none', justifyContent: 'center', alignItems: 'center', minHeight: '50px' } });
    const gWrap = h('div', null, gBtn, gSlot);
    /* The way round, always in reach: if Google's button does nothing on this address, the Google page signs
       the person in and sends them straight back. An invite cannot go that way (the hop would lose it). */
    const gHelp = sample ? null : h('p', { class: 'lx-si-note', style: { marginTop: '10px' } },
      inv ? 'Google button not working? Use the emailed code below.'
        : ['Google button not working? ', h('a', { href: googleHopUrl(backAddress()), style: { color: 'var(--ink)', fontWeight: '600', textDecoration: 'underline' } }, 'Sign in on the Google page')]);
    const teamNote = inv ? null : h('p', { class: 'lx-si-note', style: { marginTop: '10px' } }, `The ${ORG_SHORT} team signs in with Google.`);

    let busy = false, gState = 'loading';
    function working(on, what) {
      busy = on;
      go.disabled = on; gBtn.disabled = on; if (email) email.input.disabled = on;
      if (codeBox) codeBox.boxes.forEach(b => { b.disabled = on; });
      gSlot.style.pointerEvents = on ? 'none' : ''; gSlot.style.opacity = on ? '.55' : '';
      goLabel.textContent = on && what === 'email' ? 'Sending' : goText;
      gLabel.textContent = on && what === 'google' ? 'Signing you in' : 'Continue with Google';
      form.setAttribute('aria-busy', on ? 'true' : 'false');
    }

    /* the emailed 6 digit code (invite only): six boxes, paste fills all of them, the sixth digit checks it */
    let codeBox = null, sentAt = 0;
    const again = h('button', { class: 'lx-btn ghost', type: 'button', disabled: true, onclick: () => sendCode(true) }, 'Send a new code');
    function codeBoxes() {
      addStyles('lx-si-code', '.lx-si-code{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:4px 0 12px}.lx-si-code input{height:56px;padding:0;text-align:center;font:600 24px var(--sans);font-variant-numeric:tabular-nums}');
      const boxes = Array.from({ length: 6 }, (_, i) => h('input', { class: 'lx-input', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 1, autocomplete: i === 0 ? 'one-time-code' : 'off', 'aria-label': 'Digit ' + (i + 1) }));
      const fill = (from, digits) => { digits.split('').slice(0, 6 - from).forEach((d, k) => { boxes[from + k].value = d; }); const next = boxes.find(b => !b.value); (next || boxes[5]).focus(); if (boxes.every(b => b.value)) verify(boxes.map(b => b.value).join('')); };
      boxes.forEach((b, i) => {
        b.addEventListener('input', () => { const d = b.value.replace(/\D/g, ''); b.value = ''; if (d) fill(i, d); });
        b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].focus(); e.preventDefault(); } });
        b.addEventListener('paste', e => { const d = ((e.clipboardData && e.clipboardData.getData('text')) || '').replace(/\D/g, ''); if (d) { e.preventDefault(); fill(i, d); } });
      });
      const el = h('div', null, h('label', { class: 'lx-si-note', style: { display: 'block', fontWeight: '600', color: 'var(--ink-2)' } }, 'Your 6 digit code'), h('div', { class: 'lx-si-code' }, boxes), again);
      el.boxes = boxes;
      return el;
    }
    async function sendCode(resend) {
      if (busy) return;
      if (Date.now() - sentAt < 60e3 && resend) return say('Wait a minute before asking for a new code.', 'bad');
      if (!codeBox) { codeBox = codeBoxes(); go.replaceWith(codeBox); }
      if (sample) { say('Sample mode: nothing was sent. Type any 6 digits.', 'good'); codeBox.boxes[0].focus(); return; }
      working(true, 'email'); say('Sending your code.');
      try {
        const r = await ask('/api/clients/code', { invite: inv.token });
        if (r && r.ok === false) throw new Error(r.error || 'That invite no longer works. Ask for a new one.');
        sentAt = Date.now(); again.disabled = true; setTimeout(() => { again.disabled = false; }, 60e3);
        say('We sent a 6 digit code to ' + ((r && r.to) || inv.email || 'your email') + '. It works for 10 minutes. Check spam if it is not there in a minute.', 'good');
      } catch (e) { say(e.message, 'bad'); }
      working(false);
      codeBox.boxes[0].focus();
    }
    async function verify(code) {
      if (busy) return;
      if (sample) { say('Sample mode. Opening the sample checklist.', 'good'); setTimeout(() => { location.href = './?sample=1&as=client&onboarding=1'; }, 500); return; }
      working(true, 'code'); say('Checking your code.');
      try { keepSession(await ask('/api/clients/code/verify', { invite: inv.token, code })); done(); }
      catch (e) { say(e.message, 'bad'); working(false); codeBox.boxes.forEach(b => { b.value = ''; }); codeBox.boxes[0].focus(); }
    }

    /* the emailed link */
    async function sendLink() {
      if (busy) return;
      if (sample) return toSample();
      const to = email ? email.input.value.trim() : '';
      if (!inv && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { say('Type your email, like you@yourbrand.com.', 'bad'); email.input.focus(); return; }
      working(true, 'email'); say('Sending your link.');
      try {
        const r = await ask('/api/clients/login-link', inv ? { invite: inv.token } : { email: to });
        say(`If ${r.to || to} has a ${APP_NAME} login, a sign in link is on its way. Open it on this device within ${SIGNIN_LINK_MIN} minutes. Check spam if it is not there in a minute.`, 'good');
      } catch (e) { say(e.message, 'bad'); }
      working(false);
    }

    /* Google */
    async function googleAnswer(resp) {
      if (busy) return;
      if (!resp || !resp.credential) return say('Google did not finish. Try again.', 'bad');
      working(true, 'google'); say('Signing you in.');
      try {
        keepSession(await ask('/api/google-login', { credential: resp.credential, ...(inv ? { invite: inv.token } : {}) }));
        done();
      } catch (e) {
        const who = /^(\S+@\S+) has no /.exec(e.message || '');
        say(who ? `${who[1]} is not invited to ${APP_NAME}. Use your invite link, sign in with the invited email, or ask ${ORG_SHORT} to invite this one.` : e.message, 'bad');
        working(false);
      }
    }
    /* our own button is on screen only while Google's is not */
    function googleClick() {
      if (busy) return;
      if (sample) return toSample();
      if (gState === 'failed') {
        if (inv) return say('Google could not load here. Use the email link below.', 'bad');
        say('Opening Google.'); location.href = googleHopUrl(backAddress()); return;
      }
      say('Google is still loading. Try again in a moment.');
    }
    function drawGoogle() {
      if (!gWrap.isConnected) return;
      const w = Math.max(200, Math.min(400, Math.round(gWrap.offsetWidth) || 384));
      try {
        window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: googleAnswer, ux_mode: 'popup', context: 'signin' });
        window.google.accounts.id.renderButton(gSlot, { type: 'standard', theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'continue_with', logo_alignment: 'center', width: w });
      } catch { gState = 'failed'; return; }
      if (!gSlot.firstChild) { gState = 'failed'; return; }   // Google drew nothing: keep our own button and its way round
      gSlot.style.display = 'flex';
      gBtn.style.display = 'none';
      gState = 'ready';
    }

    const or = () => h('div', { class: 'lx-si-or' }, 'or');
    const form = h('form', { class: 'lx-si-form', novalidate: true, onsubmit: e => { e.preventDefault(); if (!inv) return sendLink(); if (!codeBox) return sendCode(false); const c = codeBox.boxes.map(b => b.value).join(''); if (c.length === 6) verify(c); } },
      h('h1', null, inv ? (inv.name ? firstName(inv.name) + ', make your login' : 'Make your login') : 'Sign in to ' + APP_NAME),
      h('p', { class: 'lede' }, inv
        ? ['for ' + APP_NAME + ' at ', h('b', { style: { color: 'var(--ink)', fontWeight: '600' } }, (inv.brands || []).join(', ') || 'your brand'), '. Use Google, or we email you a 6 digit code. No password.']
        : 'Your store, your ads and what to do next.'),
      ctx.message ? h('p', { class: 'lx-pill warn', role: 'alert', style: { height: 'auto', padding: '8px 12px', marginBottom: '16px', whiteSpace: 'normal', lineHeight: '1.4' } }, ctx.message) : null,
      inv ? [gWrap, gHelp, or(), go] : [gWrap, teamNote, gHelp, or(), email, go],
      line,
      inv ? null : h('div', { class: 'lx-si-client' }, svgNode(icon('link')), h('span', null, h('b', null, 'Clients:'), ' use the link in your invite, or your invited email above')));

    put(el, h('div', { class: 'lx-si' },
      h('section', { class: 'lx-si-left' },
        h('a', { class: 'lx-logo', href: './' + (sample ? '?sample=1' : ''), 'aria-label': APP_NAME }, svgNode(mark(34)), h('b', null, APP_WORD)),
        form,
        h('div', { class: 'lx-si-foot' }, h('span', null, 'by ' + ORG_NAME), h('span', null, h('a', { href: '../../privacy/' }, 'Privacy')))),
      picture()));

    if (sample) return;
    loadGoogle().then(drawGoogle).catch(() => { gState = 'failed'; });
  },
};

