/* Client list > New client: one screen, one Send. The owner fills the form, checks the previews (the welcome email,
   the agreement with its blanks, the first invoice, the extras), confirms, and every ticked part goes out in order.
   Then the client's one link opens "make your login" and Get started.
   Live data (account-health, contract onboarding-spec.md sections 2.1 and 9):
     GET  /api/onboard/options     the team list, services, goal measures, defaults, owner?, extras?
     POST /api/onboard/preview     the form -> { welcome, agreement, invoice, extras, confirm, problems }  (writes nothing)
     POST /api/onboard/send        the form + welcome { subject, body } + agreement { vars } + confirm: true
                                   -> { ok, act, slug, run_id, invite_link, results: { part: { status, text } } }
   Only the owner previews and sends; the rest of the team sees the form with Send off. Other agencies (extras off) get
   only name, website, contact and services. Sample mode: _sample/new.json, nothing is sent. */

import { h, button, field, toggle, segmented, toast, sheet, em, empty, put, pill, statusDot, card, addStyles } from '../../kit.js';
import { datePick } from '../a-settings/_look.js';

/* this page's spacing: 16px between a card's title and its form; the two fields of a pair line up at the top
   (a hint under one field no longer pushes the other down) */
const NC_CSS = `.gs .lx-card>.gs-form,.gs .lx-card>.gs-res{margin-top:var(--sp-4,16px)}
.gs-form .two{align-items:start}
.gs-res .gs-fix{margin:4px 0 0;font-size:13px;color:var(--bad)}`;
import { APP_NAME } from '../../config.js';
import { dropSaved } from '../../data.js';
import { css } from '../get-started/_ui.js';

const ADS = ['meta_ads', 'google_ads', 'tiktok_ads'];
const ROLES = [['strategist', 'Strategist'], ['buyer', 'Media buyer'], ['editor', 'Editor'], ['designer', 'Designer']];
const PART = { link: 'Their link', login: 'Their login',welcome: 'Welcome email', agreement: 'Agreement', invoice: 'First invoice', slack: 'Slack channels', slackInvite: 'Shared Slack invite', frame: 'Frame project', ledger: 'Ledger', summary: 'Team summary' };
const BLANK = { client_name: 'Client name on the agreement', company: 'Company', start_date: 'Start date', term: 'Term', payment: 'Payment terms' };

let F = null, step = 'form', P = null, R = null, agreeVars = {};
const num = v => { const n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) && n > 0 ? n : null; };
const fail = e => toast(e && e.message ? e.message : 'That did not go through.', { tone: 'bad', ms: 5000 });

function fresh(o) {
  const d = o.defaults || {};
  const team = {};
  for (const [r] of ROLES) { const p = (o.team || []).find(x => x.role === r); team[r] = p ? p.email : ''; }
  return { name: '', website: '', contact_name: '', contact_email: '', services: [], goal_measure: d.goal_measure || 'cpa', ad_budget: '', budget_open: false,
    retainer: '', start_date: d.start_date || new Date().toISOString().slice(0, 10), signer_name: '', signer_email: '', payer_email: '', company_legal: '',
    team, sign_pay: true, send: { welcome: true, agreement: true, invoice: true, ...(d.send || {}) } };
}
function bodyOf(o) {
  const ads = F.services.some(s => ADS.includes(s));
  const b = { name: F.name.trim(), website: F.website.trim(), contact_name: F.contact_name.trim(), contact_email: F.contact_email.trim(), services: F.services.slice() };
  if (ads) Object.assign(b, { goal_measure: F.goal_measure, ad_budget: F.budget_open ? null : num(F.ad_budget), budget_open: !!F.budget_open });
  if (o.extras) Object.assign(b, { retainer: num(F.retainer), start_date: F.start_date, signer_name: F.signer_name.trim(), signer_email: F.signer_email.trim(),
    payer_email: F.payer_email.trim(), company_legal: F.company_legal.trim(), team: { ...F.team }, sign_pay: F.sign_pay !== false,
    send: F.sign_pay !== false ? { ...F.send } : { welcome: !!F.send.welcome, agreement: false, invoice: false } });
  else b.send = { welcome: !!F.send.welcome };
  return b;
}

/* ---------- the form ---------- */
function input(label, key, attrs = {}) {
  const f = field({ label, value: F[key] || '', ...attrs });
  f.input.addEventListener('input', () => { F[key] = f.input.value; });
  return f;
}
/** One date, picked on the Locus calendar (never the native date input): the shared datePick from a-settings/_look.js. */
function dateField(label, key) {
  const id = 'nc' + Math.random().toString(36).slice(2, 8);
  const pick = datePick(F[key] || '');
  pick.btn.id = id;
  pick.addEventListener('change', () => { F[key] = pick.value; });
  return h('div', { class: 'lx-field' }, h('label', { for: id }, label), pick);
}
function formView(el, o, ctx) {
  const owner = !!o.owner;
  const ads = F.services.some(s => ADS.includes(s));
  const chips = h('div', { class: 'gs-chips', role: 'group', 'aria-label': 'Services' }, (o.services || []).map(s => h('button', { type: 'button', class: F.services.includes(s.key) ? 'on' : '', 'aria-pressed': String(F.services.includes(s.key)),
    onclick: () => { F.services = F.services.includes(s.key) ? F.services.filter(x => x !== s.key) : [...F.services, s.key]; draw(el, o, ctx); } }, s.label)));
  const err = h('p', { class: 'gs-err', role: 'alert', hidden: true });
  const budget = input('Monthly ad budget', 'ad_budget', { inputmode: 'decimal', placeholder: 'For example 15000', disabled: F.budget_open || null });
  const parts = [
    card({ title: 'The client' }, h('div', { class: 'gs-form' },
      h('div', { class: 'two' }, input('Brand name', 'name', { placeholder: 'For example Northlake Golf', maxlength: 80 }), input('Website', 'website', { placeholder: 'For example northlakegolf.com', inputmode: 'url' })),
      h('div', { class: 'two' }, input('Contact name', 'contact_name', { placeholder: 'For example Pat Doyle', autocomplete: 'off' }), input('Contact email', 'contact_email', { type: 'email', placeholder: 'For example pat@example.com', autocomplete: 'off' })),
      h('div', { class: 'lx-field' }, h('label', null, 'What we run for them'), chips))),
    ads ? card({ title: 'Ads' }, h('div', { class: 'gs-form' },
      h('div', { class: 'two' }, budget, h('div', { class: 'lx-field' }, h('label', null, ' '), toggle({ label: 'Not agreed yet', checked: F.budget_open, onchange: v => { F.budget_open = v; budget.input.disabled = v; } }))),
      h('div', { class: 'lx-field' }, h('label', null, 'Their goal is a'), segmented((o.measures || []).map(m => ({ id: m.key, label: m.label })), F.goal_measure, id => { F.goal_measure = id; })),
      h('p', { class: 'gs-hint' }, 'This picks the wording of their goal question. The goal itself is agreed on the call.'))) : null,
  ];
  if (o.extras) {
    const pick = (role, label) => {
      const sel = h('select', { class: 'lx-input', 'aria-label': label, onchange: e => { F.team[role] = e.target.value; } },
        h('option', { value: '' }, 'Nobody yet'), (o.team || []).map(p => h('option', { value: p.email, selected: F.team[role] === p.email || null }, p.name)));
      return h('div', { class: 'lx-field' }, h('label', null, label), sel);
    };
    const sp = F.sign_pay !== false;
    parts.push(
      card({ title: 'Money and the agreement' }, h('div', { class: 'gs-form' },
        toggle({ label: 'They sign an agreement and pay through ' + APP_NAME, checked: sp, onchange: v => { F.sign_pay = v; draw(el, o, ctx); } }),
        sp ? [
          h('div', { class: 'two' }, input('Monthly fee', 'retainer', { inputmode: 'decimal', placeholder: 'For example 4000', hint: 'Leave it empty and no invoice is sent.' }), dateField('Start date', 'start_date')),
          h('div', { class: 'two' }, input('Who signs (optional)', 'signer_name', { placeholder: 'Name, if not the contact' }), input('Their email', 'signer_email', { type: 'email', placeholder: 'Email, if not the contact' })),
          h('div', { class: 'two' }, input('Who pays (optional)', 'payer_email', { type: 'email', placeholder: 'For example accounts@example.com' }), input('Legal company name (optional)', 'company_legal', { placeholder: 'For example Northlake Golf LLC' }))]
          : h('p', { class: 'gs-hint' }, 'No agreement and no invoice for this client, so their checklist has three steps. Send either one later from their setup page and the step comes back.'))),
      card({ title: 'Our team on it' }, h('div', { class: 'gs-form' }, h('div', { class: 'two' }, ROLES.map(([r, l]) => pick(r, l))))),
      card({ title: 'Send this now' }, h('div', { class: 'gs-form' },
        toggle({ label: 'Welcome email with their link', checked: F.send.welcome, onchange: v => { F.send.welcome = v; } }),
        sp ? toggle({ label: 'The agreement to sign', checked: F.send.agreement, onchange: v => { F.send.agreement = v; } }) : null,
        sp ? toggle({ label: 'The first invoice', checked: F.send.invoice, onchange: v => { F.send.invoice = v; } }) : null,
        h('p', { class: 'gs-hint' }, 'Anything left off can be sent later from their setup page.'))));
  } else {
    parts.push(h('p', { class: 'gs-lede' }, 'Your client gets one link: make a login, connect their accounts.'));
  }
  const check = button('Check and send', { primary: true, large: true, icon: 'arrow', disabled: !owner, onclick: async () => {
    const b = bodyOf(o);
    const miss = !b.name ? 'Type the brand name.' : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.contact_email) ? 'Type the contact email.' : !b.contact_name ? 'Type the contact name.' : !b.services.length ? 'Pick at least one thing we run.' : '';
    if (miss) { err.textContent = miss; err.hidden = false; return; }
    err.hidden = true; check.disabled = true;
    try {
      P = ctx.sample ? { ...o.preview } : await ctx.api('/api/onboard/preview', { worker: 'ah', method: 'POST', body: b });
      if (ctx.sample && P.welcome) P.welcome = { ...P.welcome, to: b.contact_email || P.welcome.to };
      agreeVars = { ...((P.agreement && P.agreement.vars) || {}) };
      step = 'preview'; draw(el, o, ctx); window.scrollTo(0, 0);
    } catch (e) { check.disabled = false; err.textContent = e.message || 'The check did not finish.'; err.hidden = false; }
  } });
  put(el, h('div', { class: 'gs' }, parts, err, h('div', { class: 'gs-acts' }, check, owner ? null : h('span', { class: 'gs-hint' }, 'Only the owner sends.'))));
}

/* ---------- the previews ---------- */
const clean = html => String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
function preview(el, o, ctx) {
  const W = P.welcome || {}, A = P.agreement, I = P.invoice;
  const subject = field({ label: 'Subject', value: W.subject || '' });
  const text = h('textarea', { class: 'lx-input gs-mail', 'aria-label': 'Welcome email' }); text.value = W.body || '';
  const blanks = (A && A.blanks) || [];
  /* A filled blank redraws the agreement text (the preview is asked again, a moment after typing stops), so the confirm
     never shows old words. Only the agreement box changes: the field being typed in keeps its caret. */
  let redo = null, ask = 0;
  const reread = () => { clearTimeout(redo); redo = setTimeout(async () => {
    if (ctx.sample) return;
    const mine = ++ask;
    try {
      const np = await ctx.api('/api/onboard/preview', { worker: 'ah', method: 'POST', body: { ...bodyOf(o), agreement: { vars: { ...agreeVars } } } });
      if (mine !== ask || !np || !np.agreement) return;
      P = { ...P, agreement: { ...np.agreement, blanks: A.blanks }, confirm: np.confirm, problems: np.problems };
      if (np.agreement.html) agreeHtml.innerHTML = clean(np.agreement.html);
      paintOk();
    } catch { /* the old text stays; Send checks the blanks again on the server */ }
  }, 600); };
  const blankFields = blanks.map(k => { const f = field({ label: BLANK[k] || k, value: agreeVars[k] || '' }); f.input.addEventListener('input', () => { agreeVars[k] = f.input.value; paintOk(); reread(); }); return f; });
  const send = button('Send', { primary: true, large: true, icon: 'arrow' });
  const why = h('p', { class: 'gs-err', role: 'alert', hidden: true });
  const open = () => blanks.filter(k => !String(agreeVars[k] || '').trim());
  function paintOk() {
    const left = A && A.used ? open() : [];
    const probs = (P.problems || []).filter(p => !(left.length === 0 && /blank/i.test(p)));
    send.disabled = !o.owner || left.length > 0 || probs.length > 0;
    why.hidden = !(left.length || probs.length);
    why.textContent = left.length ? 'Fill in the agreement blanks first: ' + left.map(k => BLANK[k] || k).join(', ') + '.' : probs.join(' ');
  }
  const agreeHtml = h('div', { class: 'gs-agree' });
  if (A && A.html) agreeHtml.innerHTML = clean(A.html);
  send.addEventListener('click', () => confirmSend(el, o, ctx, { subject: subject.input.value.trim(), body: text.value }));
  put(el, h('div', { class: 'gs' },
    h('div', { class: 'gs-acts' }, button('Back to the form', { ghost: true, onclick: () => { step = 'form'; draw(el, o, ctx); } })),
    card({ title: 'Welcome email', note: W.to ? 'to ' + W.to + ', from your Gmail' : null }, h('div', { class: 'gs-form' }, subject, text,
      h('p', { class: 'gs-hint' }, '{{sign-in link}} becomes their own link when it is sent.'))),
    A && A.used ? card({ title: 'Agreement', note: A.to ? 'to ' + A.to : null }, h('div', { class: 'gs-form' }, agreeHtml,
      blankFields.length ? [h('p', { class: 'gs-hint' }, 'These are empty in the agreement. An agreement with a blank cannot be sent.'), h('div', { class: 'two' }, blankFields)] : statusDot('good', 'No blanks')))
      : null,
    I ? card({ title: 'First invoice', note: I.used && I.to ? 'to ' + I.to : null }, h('p', { class: 'gs-lede' }, I.text || (I.used ? '' : 'No fee typed, so no invoice.'))) : null,
    P.extras && P.extras.length ? card({ title: 'Also set up' }, h('ul', { class: 'gs-hint' }, P.extras.map(x => h('li', null, x)))) : null,
    why, h('div', { class: 'gs-acts' }, send, o.owner ? null : h('span', { class: 'gs-hint' }, 'Only the owner sends.'))));
  paintOk();
}
function confirmSend(el, o, ctx, welcome) {
  const go = button('Send', { primary: true, large: true, onclick: async () => {
    go.disabled = true;
    try {
      const body = { ...bodyOf(o), welcome, ...(P.agreement && P.agreement.used ? { agreement: { vars: { ...agreeVars } } } : {}), confirm: true };
      R = ctx.sample ? { ...o.sent, slug: o.sent.slug } : await ctx.api('/api/onboard/send', { worker: 'ah', method: 'POST', body });
      sh.close(); step = 'done'; draw(el, o, ctx); window.scrollTo(0, 0);
      if (ctx.sample) toast('Sample numbers: nothing was sent.');
    } catch (e) { go.disabled = false; fail(e); }
  } });
  const sh = sheet({ title: 'Send it all?', side: 'center', body: h('div', { class: 'gs-form' },
    h('p', { class: 'gs-lede' }, P.confirm || 'Send the ticked parts now?'),
    h('div', { class: 'gs-acts' }, go, button('Not yet', { onclick: () => sh.close() }))) });
}

/* ---------- the results ---------- */
function results(el, o, ctx) {
  const r = R || {}, list = r.results || {};
  const nFail = Object.keys(PART).filter(k => list[k] && list[k].status === 'failed').length;
  const tone = s => (s === 'done' ? pill('good', 'Done') : s === 'failed' ? pill('bad', 'Failed') : pill('', 'Skipped'));
  const openIt = async () => {
    const hash = '#/brand/' + encodeURIComponent(r.slug || '') + '/get-started/index';
    if (ctx.sample) { location.hash = hash; return; }
    try { await dropSaved('boot'); } catch {}
    history.replaceState(null, '', location.pathname + location.search + hash);
    location.reload();                                 // the new brand joins the brand list on the next boot
  };
  put(el, h('div', { class: 'gs' },
    card({ title: nFail ? 'Sent, with ' + nFail + ' to fix' : 'Sent' }, h('div', { class: 'gs-res' },
      Object.keys(PART).filter(k => list[k]).map(k => h('div', null, tone(list[k].status), h('b', null, PART[k]), h('span', { class: 'gs-hint' }, list[k].text || ''),
        list[k].status === 'failed' ? h('p', { class: 'gs-fix' }, 'It keeps its reason. Send it again from their setup page.') : null)),
      h('p', { class: 'gs-hint' }, APP_NAME + ' reads their website on the next hourly run, or press Read their website now on their setup page.'))),
    r.invite_link ? h('div', { class: 'gs-acts' }, button('Copy their link', { iconLeft: 'link', onclick: async () => { try { await navigator.clipboard.writeText(r.invite_link); toast('Link copied.'); } catch { toast('Could not copy. It is ' + r.invite_link, { ms: 6000 }); } } })) : null,
    h('div', { class: 'gs-acts' }, button('Open ' + (F.name || 'their') + "'s setup", { primary: true, large: true, icon: 'arrow', onclick: openIt }),
      button('Set up another client', { ghost: true, onclick: () => { F = fresh(o); step = 'form'; P = R = null; draw(el, o, ctx); } }))));
}

function draw(el, o, ctx) {
  addStyles('lx-nc-css', NC_CSS);
  css();
  if (!o || !o.services) return put(el, empty({ title: 'New client did not load', text: 'Nothing was read. Try again in a minute.' }));
  if (!F) F = fresh(o);
  if (step === 'preview' && P) return preview(el, o, ctx);
  if (step === 'done' && R) return results(el, o, ctx);
  formView(el, o, ctx);
}

export default {
  title: ['Set up a ', em('new client')],
  eyebrow: 'Client list',
  ranges: false,
  stamp: false,                  /* a form, not numbers: no "updated" stamp */
  load: ctx => ctx.api('/api/onboard/options', { worker: 'ah', signal: ctx.signal }),
  render(el, o, ctx) { if (step === 'done' && !R) step = 'form'; draw(el, o, ctx); },
};
