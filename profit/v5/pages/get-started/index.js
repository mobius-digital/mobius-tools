/* Get started: a new client's setup checklist (route brand/<brand>/get-started/index).
   Client view (a client login, or the team with "See as client" on): a short profile first, then four steps in any
   order (Sign and pay, Connect, Ten questions, Photos and videos), each with "Someone else does this". Until every
   step is done the router keeps a client here (router.js gateOf). A colleague handed one step sees only that step.
   Team view: the same steps read only, who waits on whom, Remind them, team ticks, the brief answers, the budget,
   Mark finished, and the owner's parts (send a part, approve a signer, release a held invoice).

   Live data, all on the account-health worker (contract: onboarding-spec.md section 9):
     GET  /api/onboard?act=<brand id>                     the whole state (the client answer has no team block)
     PUT  /api/clients/me { name, title, phone }          the profile
     PUT  /api/onboard/brief { act, answers: { key } }    one answer at a time, saved on blur
     PUT  /api/onboard/connect { act, platform, said | skip | inputs | layer + ticked }
     PUT  /api/brand/assets-link { act, url, label }
     POST /api/onboard/handoff { act, step, email, name, role }
     POST /api/onboard/remind { act, step }               team (sign and pay: owner)
     POST /api/onboard/finish | /reopen { act }           team | owner
     PUT  /api/onboard/budget { act, amount, open }       team
     POST /api/onboard/send-part { act, part, confirm }   owner
     POST /api/research/prefill { act }                   team, "Read their website now" (streams)
   Sample mode (?sample=1): _sample/index.json (client view) or _sample/team.json (team view); every click changes
   the page on this device only and nothing is sent. */

import { h, button, pill, statusDot, toast, sheet, field, em, empty, segmented, toggle, put, svgNode, money } from '../../kit.js';
import { countTiles } from '../a-settings/_look.js';
import { icon } from '../../icons.js';
import { APP_NAME, ORG_SHORT, OWNER_FIRST, workers, token } from '../../config.js';
import { dropSaved } from '../../data.js';
import { css, ah, lineButtons, copyRow, bar, days, SAMPLE_SAID } from './_ui.js';

const STATE_WORD = { done: 'done', waiting: 'waiting on us', todo: 'your turn', na: 'nothing to do' };
const KIND = { drive: 'Google Drive', dropbox: 'Dropbox', air: 'Air', frame: 'Frame', box: 'Box', link: 'Link' };
const dateOf = iso => { const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? iso + 'T12:00:00' : iso); return t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; };
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'the page'; } };
const ownerOf = D => (D && D.owner_first) || OWNER_FIRST;
const firstOf = n => String(n || '').trim().split(/\s+/)[0] || '';

/* page state, so a click can redraw without the router */
let CUR = null;                 // { el, D, ctx }
const OPEN = new Set();         // open step cards
const HOW = new Set();          // open "Show me how" boxes
let opened = '';                // the brand the open state belongs to
let EDIT_ASSETS = false;
const SAMPLES = new Map();      // sample data per view, changed in place by clicks

const brandName = (ctx, D) => (D && D.brand && D.brand.name) || (ctx.brand && ctx.brand.name) || 'Your brand';
const slugNow = (ctx, D) => (D && D.brand && D.brand.slug) || (ctx.brand && ctx.brand.slug) || '';
const teamView = ctx => !ctx.isClient;
const realClient = ctx => ctx.isClient && !ctx.asClient;
const needsProfile = (ctx, D) => realClient(ctx) && D.profile && !D.profile.done;

function titleOf(ctx, D) {
  const b = brandName(ctx, D);
  if (!D || D.none) return ['Get ', em('started')];
  if (teamView(ctx)) return [b + ': ', em('setting up')];
  if (D.only) return [b + ': ', em('your part')];
  if (needsProfile(ctx, D)) return ['First, ', em('who are you?')];
  return ["Let's get " + b + ' ', em('set up')];
}

/* ---------- writes ---------- */
/** One write. Sample: run local() on the page data and send nothing. Real: the call, then the whole state again. */
async function write(path, method, body, local, { reread = true } = {}) {
  const { ctx, D } = CUR;
  if (ctx.sample) { local && local(D); recompute(D); redraw(); return { sample: true }; }
  const r = await ah(ctx, path, method, { act: ctx.brand.id, ...body });
  if (reread) await reread_(r);
  return r;
}
async function reread_() {
  const { ctx, D } = CUR;
  const fresh = await ctx.api('/api/onboard?act=' + encodeURIComponent(ctx.brand.id), { worker: 'ah' });
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, fresh);
  redraw();
}
const fail = e => toast(e && e.message ? e.message : 'That did not go through. Try again.', { tone: 'bad', ms: 5000 });

/** Sample only: work out what the server would (steps done, counts, the gate). A done step never comes undone. */
function recompute(D) {
  const set = (k, v) => { const s = (D.steps || []).find(x => x.key === k); if (s && v && !s.done) { s.done = true; s.done_at = new Date().toISOString(); s.waiting_on = null; } };
  const sp = D.sign_pay;
  if (sp) set('sign_pay', (!sp.agreement || !sp.agreement.used || sp.agreement.status === 'signed') && (!sp.invoice || !sp.invoice.used || sp.invoice.status === 'paid'));
  const P = (D.connect && D.connect.platforms) || [];
  set('connect', P.every(p => p.skipped || !Object.values(p.layers || {}).some(l => l.state === 'todo')));
  for (const p of P) p.done = !p.skipped && Object.values(p.layers || {}).every(l => l.state === 'done' || l.state === 'na');
  if (D.connect) { D.connect.total = P.filter(p => !p.skipped).length; D.connect.done = P.filter(p => p.done).length; }
  const B = D.brief;
  if (B) { B.answered = (B.questions || []).filter(q => String(B.answers[q.key] || '').trim()).length; B.total = (B.questions || []).length; B.done = B.answered === B.total; set('brief', B.done); }
  set('assets', !!(D.assets && D.assets.url));
  D.progress = { done: (D.steps || []).filter(s => s.done).length, total: (D.steps || []).length };
  D.gated = !D.finished_at && (D.steps || []).some(s => !s.done);
}

/* ---------- small parts ---------- */
function tick(layer, team) {
  const word = team && layer.state === 'todo' ? 'their turn' : STATE_WORD[layer.state] || layer.state || '';
  return h('div', { class: 'gs-tick ' + (layer.state || 'todo') }, h('span', { class: 'ic', 'aria-hidden': 'true' }, svgNode(icon('check'))),
    h('b', null, layer.label || ''), h('small', null, (layer.checks_itself ? 'Checks itself' : 'We tick this') + ', ' + word));
}
function stepPill(s, D, ctx) {
  if (s.done) return pill('good', 'Done');
  if (s.holder && s.holder.handed && !isMe(ctx, s.holder)) return pill('warn', 'Waiting on ' + (s.holder.name || 'them'));
  if (s.waiting_on === 'us') return pill('warn', 'Waiting on us');
  return pill('', 'To do');
}
const isMe = (ctx, who) => !!(who && who.email && ctx.me && ctx.me.email && who.email.toLowerCase() === String(ctx.me.email).toLowerCase());

/* ---------- step 1: sign and pay ---------- */
function signPay(D, ctx, team) {
  const sp = D.sign_pay;
  if (!sp) return h('p', { class: 'gs-hint' }, ORG_SHORT + ' looks after this one.');
  const owner = ownerOf(D), out = [];
  const a = sp.agreement, inv = sp.invoice;
  if (a && a.used) {
    out.push(h('div', { class: 'gs-part' }, h('h4', null, 'The agreement'),
      a.status === 'signed' ? statusDot('good', 'Signed' + (a.signed_at ? ' ' + dateOf(a.signed_at) : ''))
        : a.sign_url && !team ? [h('p', { class: 'gs-hint' }, 'Read it, then sign with your name. It takes a minute.'),
            h('div', { class: 'gs-acts' }, ctx.sample ? button('Read and sign', { primary: true, onclick: () => write('', '', null, d => { d.sign_pay.agreement.status = 'signed'; d.sign_pay.agreement.signed_at = new Date().toISOString(); toast('Sample: marked as signed.'); }) })
              : button('Read and sign', { primary: true, href: a.sign_url, target: '_blank', icon: 'arrow' }))]
        : a.status === 'sent' ? statusDot('warn', 'Sent' + (a.signer && team ? ' to ' + a.signer : '') + ', not signed yet')
        : h('p', { class: 'gs-hint' }, team ? 'Not sent yet.' : 'Your agreement is on its way from ' + owner + '.')));
  }
  if (inv && inv.used) {
    const line = [inv.amount != null ? money(inv.amount) : null, inv.due ? 'due ' + dateOf(inv.due) : null].filter(Boolean).join(', ');
    out.push(h('div', { class: 'gs-part' }, h('h4', null, 'The first invoice' + (line ? ': ' + line : '')),
      inv.status === 'paid' ? statusDot('good', 'Paid')
        : inv.pay_url && !team ? [inv.note ? h('p', { class: 'gs-hint' }, inv.note) : null,
            h('div', { class: 'gs-acts' }, ctx.sample ? button('Pay the invoice', { primary: true, onclick: () => write('', '', null, d => { d.sign_pay.invoice.status = 'paid'; toast('Sample: marked as paid.'); }) })
              : button('Pay the invoice', { primary: true, href: inv.pay_url, target: '_blank', icon: 'arrow' }))]
        : inv.status === 'open' || inv.status === 'sent' ? statusDot('warn', 'Sent, not paid yet')
        : h('p', { class: 'gs-hint' }, team ? 'Not sent yet.' : 'Your invoice is on its way from ' + owner + '.')));
  }
  if (sp.pending_signer) out.push(h('p', { class: 'gs-hint' }, 'We asked ' + ORG_SHORT + ' to send it to ' + (sp.pending_signer.name || sp.pending_signer.email || 'them') + '.'));
  if (team && ctx.role === 'owner') out.push(ownerParts(D, ctx));
  return out;
}

/* the owner's parts: approve a named signer, send a part that was not sent */
function ownerParts(D, ctx) {
  const sp = D.sign_pay || {}, kids = [];
  const ps = sp.pending_signer;
  if (ps) kids.push(h('div', { class: 'gs-line' }, h('div', null, h('b', null, (D.team && D.team.contact && D.team.contact.name ? D.team.contact.name : 'The client') + ' says ' + (ps.name || ps.email) + ' ' + (ps.role === 'payer' ? 'pays' : ps.role === 'signer' ? 'signs' : 'signs and pays') + '.'), h('small', null, 'Yes sends the same signing link and the Stripe pay link to them.')),
    h('div', { class: 'gs-acts' }, lineButtons(ctx, { onboard: { act: D.act, kind: 'signer', action: { kind: 'signer' } } }, { primary: true, onDone: () => reread_().catch(() => {}) }).filter(b => b.tagName === 'BUTTON'))));
  const parts = [];
  if (D.team && D.team.welcome_sent === false) parts.push(['welcome', 'Send the welcome email']);
  if (sp.agreement && sp.agreement.used && sp.agreement.status === 'not_sent') parts.push(['agreement', 'Send the agreement']);
  if (sp.invoice && sp.invoice.used && sp.invoice.status === 'not_sent') parts.push(['invoice', 'Send the first invoice']);
  if (parts.length) kids.push(h('div', { class: 'gs-acts' }, parts.map(([part, label]) => button(label, { onclick: () => confirmPart(ctx, part, label) }))));
  return kids.length ? h('div', { class: 'gs-part' }, h('h4', null, 'Only you'), kids) : null;
}
function confirmPart(ctx, part, label) {
  const go = button(label, { primary: true, large: true, onclick: async () => {
    if (ctx.sample) { sh.close(); return toast(SAMPLE_SAID); }
    go.disabled = true;
    try { const r = await ah(ctx, '/api/onboard/send-part', 'POST', { act: ctx.brand.id, part, confirm: true }); sh.close(); toast((r.result && r.result.text) || 'Sent.'); await reread_(); }
    catch (e) { go.disabled = false; fail(e); }
  } });
  const sh = sheet({ title: label + '?', side: 'center', body: h('div', { class: 'gs-form' },
    h('p', { class: 'gs-lede' }, part === 'welcome' ? 'The welcome email goes from your Gmail with their sign in link. The shared Slack invite follows it.'
      : part === 'agreement' ? 'The agreement goes from your Gmail with the signing link. Pressing Send signs it for ' + ORG_SHORT + '.'
      : 'Stripe emails the first invoice. When it is paid the card is saved and the retainer bills itself on the same day each month.'),
    h('div', { class: 'gs-acts' }, go, button('Not yet', { onclick: () => sh.close() }))) });
}

/* ---------- step 2: connect ---------- */
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const cleanShop = v => String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

function layerHow(p, k, layer, ctx, team) {
  const kids = [];
  if (layer.clicks && layer.clicks.length) kids.push(h('ol', null, layer.clicks.map(c => h('li', null, c.replace(/^\d+\.\s*/, '')))));
  (layer.copy || []).forEach(([l, v]) => kids.push(copyRow(l, v)));
  if (layer.url && layer.state !== 'done') {
    const install = k === 'app' && p.key === 'shopify';
    kids.push(h('div', { class: 'gs-acts' }, ctx.sample && install && !team
      ? button('Install', { primary: true, onclick: () => write('', '', null, d => { setLayer(d, p.key, 'app', 'done'); toast('Sample: marked as installed.'); }) })
      : button(install ? 'Install' : 'Open ' + hostOf(layer.url), { primary: install, href: layer.url, target: '_blank', icon: 'arrow' })));
  }
  if (layer.inputs && layer.inputs.length) kids.push(inputsForm(p, layer, ctx));
  if (layer.note) kids.push(h('p', { class: 'note' }, layer.note));
  return kids.length ? h('div', { class: 'gs-part' }, h('h4', null, layer.label), kids) : null;
}
function setLayer(D, key, k, state) {
  const p = D.connect.platforms.find(x => x.key === key);
  if (p && p.layers[k]) p.layers[k].state = state;
}
function inputsForm(p, layer, ctx) {
  const fields = layer.inputs.map(i => field({ label: i.label, placeholder: i.placeholder || '', type: i.secret ? 'password' : 'text', value: i.secret ? '' : (i.value || ''), autocomplete: 'off', spellcheck: 'false' }));
  const err = h('p', { class: 'gs-err', role: 'alert', hidden: true });
  const save = button('Save', { onclick: async () => {
    const inputs = {};
    layer.inputs.forEach((i, n) => { const v = fields[n].input.value.trim(); if (v) inputs[i.key] = v; });
    if (inputs.shop_url != null) { inputs.shop_url = cleanShop(inputs.shop_url); if (!SHOP_RE.test(inputs.shop_url)) { err.textContent = 'Use the store address that ends in .myshopify.com.'; err.hidden = false; return; } }
    if (inputs.customer_id != null && !/^\d{3}-?\d{3}-?\d{4}$/.test(inputs.customer_id)) { err.textContent = 'The customer ID is 10 digits, like 123-456-7890.'; err.hidden = false; return; }
    if (!Object.keys(inputs).length) { err.textContent = 'Fill in at least one box.'; err.hidden = false; return; }
    err.hidden = true; save.disabled = true;
    try {
      await write('/api/onboard/connect', 'PUT', { platform: p.key, inputs }, d => {
        const l = d.connect.platforms.find(x => x.key === p.key).layers.team;
        l.state = 'waiting'; (l.inputs || []).forEach(i => { if (!i.secret && inputs[i.key]) i.value = inputs[i.key]; });
      });
      toast('Saved. We take it from here.');
    } catch (e) { save.disabled = false; fail(e); }
  } });
  return h('div', { class: 'gs-form' }, h('div', { class: 'gs-inputs' }, fields, h('div', null, save)), err);
}

function platform(p, D, ctx, team) {
  const L = p.layers || {};
  const state = p.skipped ? 'skipped' : p.done ? 'done' : Object.values(L).some(l => l.state === 'todo') ? 'todo' : 'waiting';
  const tag = { done: pill('good', 'Done'), skipped: pill('', 'Not used'), todo: pill('', team ? 'Client to do' : 'To do'), waiting: pill('warn', 'Waiting on us') }[state];
  const kids = [h('div', { class: 'hd' }, h('b', null, p.title), tag, !p.needed && !p.skipped ? h('span', { class: 'gs-hint' }, 'only if you use it') : null)];
  if (p.why) kids.push(h('p', { class: 'why' }, p.why));
  if (p.skipped) {
    kids.push(h('div', { class: 'gs-acts' }, h('span', { class: 'gs-hint' }, team ? 'They said they do not use this.' : 'You said you do not use this.'),
      button('We do use it', { onclick: () => write('/api/onboard/connect', 'PUT', { platform: p.key, skip: false }, d => { d.connect.platforms.find(x => x.key === p.key).skipped = false; }).catch(fail) })));
    return h('div', { class: 'gs-plat' }, kids);
  }
  kids.push(h('div', { class: 'gs-ticks' }, ['team', 'app'].filter(k => L[k]).map(k => tick(L[k], team))));
  const parts = ['team', 'app'].filter(k => L[k]).map(k => layerHow(p, k, L[k], ctx, team)).filter(Boolean);
  if (parts.length) {
    const how = h('details', { class: 'gs-how', open: HOW.has(p.key) || null, ontoggle: e => { e.target.open ? HOW.add(p.key) : HOW.delete(p.key); } }, h('summary', null, team ? 'What they were asked to do' : 'Show me how'), parts);
    kids.push(how);
  }
  const acts = [];
  if (!team) {
    /* Email inputs are optional (a key, or another tool's name): adding our email as a user is enough there. */
    if (L.team && L.team.state === 'todo' && (!(L.team.inputs || []).length || p.key === 'email')) acts.push(button('I did this', { primary: true, onclick: () => write('/api/onboard/connect', 'PUT', { platform: p.key, said: true }, d => setLayer(d, p.key, 'team', 'waiting')).then(() => toast('Thanks. We check it and tick it.')).catch(fail) }));
    if (!p.done) acts.push(button("We don't use this", { ghost: true, onclick: () => write('/api/onboard/connect', 'PUT', { platform: p.key, skip: true }, d => { d.connect.platforms.find(x => x.key === p.key).skipped = true; }).catch(fail) }));
  } else {
    for (const k of ['team', 'app']) {
      const l = L[k];
      /* Any open layer, a self checking one too: a person has looked (Instagram, a property Google cannot see). */
      if (l && l.state !== 'done' && l.state !== 'na') acts.push(button('Tick: ' + l.label, { onclick: () => write('/api/onboard/connect', 'PUT', { platform: p.key, layer: k, ticked: true }, d => setLayer(d, p.key, k, 'done')).then(() => toast('Ticked.')).catch(fail) }));
    }
  }
  if (acts.length) kids.push(h('div', { class: 'gs-acts' }, acts));
  return h('div', { class: 'gs-plat' }, kids);
}
function connect(D, ctx, team) {
  const C = D.connect || { platforms: [] };
  return [
    h('p', { class: 'gs-hint' }, C.note || 'Green ticks marked Checks itself turn on when ' + APP_NAME + ' can really see the account. The others are ticked by our team once we have looked.'),
    h('p', { class: 'gs-hint' }, h('b', null, (C.done || 0) + ' of ' + (C.total || 0) + ' connected.'), ' Each one has two ticks: giving our team access, and ' + APP_NAME + ' reading it.'),
    h('div', null, (C.platforms || []).map(p => platform(p, D, ctx, team))),
  ];
}

/* ---------- step 3: the ten questions ---------- */
let briefCount = null;
function brief(D, ctx, team) {
  const B = D.brief || { questions: [], answers: {} };
  briefCount = h('b', null, (B.answered || 0) + ' of ' + (B.total || 0) + ' answered.');
  if (team) {
    const ask = (D.team && D.team.ask_on_call) || [];
    return [h('p', { class: 'gs-hint' }, briefCount),
      h('div', null, (B.questions || []).map(q => {
        const a = (B.unsure || []).includes(q.key) ? '__unsure' : B.answers[q.key];
        return h('div', { class: 'gs-q' }, h('div', { class: 'qt' }, h('i', null, q.n), h('b', null, q.text)),
          !a ? h('p', { class: 'gs-ans none' }, 'Not answered yet') : a === '__unsure' ? h('p', { class: 'gs-ans none' }, 'Not sure. Ask on the call.') : h('p', { class: 'gs-ans' }, a));
      })),
      ask.length ? h('div', { class: 'gs-part' }, h('h4', null, 'Ask on the call'), h('ol', { class: 'gs-hint' }, ask.map(x => h('li', null, x)))) : null];
  }
  return [h('p', { class: 'gs-hint' }, briefCount, ' Short answers are fine. It saves as you go.'),
    h('div', null, (B.questions || []).map(q => question(q, B, ctx)))];
}
function question(q, B, ctx) {
  const cur = B.answers[q.key] || '';
  const unsure = cur === '__unsure' || (B.unsure || []).includes(q.key);
  const ta = h('textarea', { class: 'lx-input', rows: 3, 'aria-label': q.text, maxlength: 4000 });
  ta.value = unsure ? '' : cur;
  const saved = h('span', { class: 'saved', 'aria-live': 'polite' });
  const notSure = button("I'm not sure", { class: unsure ? 'on' : '' });
  let last = unsure ? '__unsure' : cur;
  /* Saves of one question run one after another and each sends the LATEST value, so a blur save racing an
     "I'm not sure" tap can never land last with the old text: the last tap wins. */
  let want = null, chain = Promise.resolve();
  const save = val => { want = val; chain = chain.then(run, run); return chain; };
  async function run() {
    const val = want;
    if (val === last) return;
    saved.textContent = 'Saving';
    try {
      if (ctx.sample) { B.answers[q.key] = val; if (!val) delete B.answers[q.key]; recompute(CUR.D); }
      else {
        const r = await ah(ctx, '/api/onboard/brief', 'PUT', { act: ctx.brand.id, answers: { [q.key]: val } });
        if (r && r.brief) Object.assign(B, r.brief);
      }
      last = val; saved.textContent = 'Saved';
      notSure.classList.toggle('on', val === '__unsure');
      if (briefCount) briefCount.textContent = (B.answered || 0) + ' of ' + (B.total || 0) + ' answered.';
      const step = (CUR.D.steps || []).find(s => s.key === 'brief');
      if (B.done && step && !step.done) { if (ctx.sample) redraw(); else await reread_(); }
      else if (ctx.sample && B.done) redraw();
    } catch (e) { saved.textContent = 'Not saved'; fail(e); }
  }
  const now = () => (want != null ? want : last);
  ta.addEventListener('blur', () => save(ta.value.trim() || (now() === '__unsure' ? '__unsure' : '')));
  notSure.addEventListener('click', () => { const on = now() !== '__unsure'; if (on) ta.value = ''; save(on ? '__unsure' : ta.value.trim()); });
  const draft = q.draft && !cur ? h('div', { class: 'gs-draft' }, h('span', null, 'From your website: ' + q.draft),
    button('Use this', { onclick: e => { ta.value = q.draft; e.currentTarget.parentNode.remove(); save(q.draft); } })) : null;
  return h('div', { class: 'gs-q' }, h('div', { class: 'qt' }, h('i', null, q.n), h('b', null, q.text)),
    q.hint ? h('p', { class: 'gs-hint' }, q.hint) : null, draft, ta, h('div', { class: 'row' }, notSure, saved));
}

/* ---------- step 4: photos and videos ---------- */
function assets(D, ctx, team) {
  const A = D.assets;
  const line = h('p', { class: 'gs-hint' }, APP_NAME + ' does not copy your files. It opens your folder.');
  if (A && A.url && !EDIT_ASSETS) {
    return [h('div', { class: 'gs-acts' }, button('Open the folder', { primary: !team, href: A.url, target: '_blank', icon: 'arrow' }),
      button('Change the link', { ghost: true, onclick: () => { EDIT_ASSETS = true; redraw(); } })),
      h('p', { class: 'gs-hint' }, [KIND[A.kind] || 'Link', A.label, A.at ? 'added ' + dateOf(A.at) : null].filter(Boolean).join(', ')), line];
  }
  const f = field({ label: 'Paste a link to where your photos and videos live (Google Drive, Dropbox, Air, Frame, anything)', type: 'url', placeholder: 'https://', value: A && A.url ? A.url : '', inputmode: 'url' });
  const err = h('p', { class: 'gs-err', role: 'alert', hidden: true });
  const save = button('Save', { primary: !team, onclick: async () => {
    const url = f.input.value.trim();
    if (!/^https:\/\/\S+\.\S+/.test(url) || url.length > 500) { err.textContent = 'Paste the whole link. It starts with https://'; err.hidden = false; return; }
    err.hidden = true; save.disabled = true;
    try {
      await write('/api/brand/assets-link', 'PUT', { url, label: '' }, d => { d.assets = { url, label: '', kind: /drive\.google/.test(url) ? 'drive' : /dropbox/.test(url) ? 'dropbox' : /air\.inc/.test(url) ? 'air' : /frame\.io|f\.io/.test(url) ? 'frame' : 'link', at: new Date().toISOString(), from: 'link' }; });
      EDIT_ASSETS = false; toast('Saved.');
    } catch (e) { save.disabled = false; fail(e); }
  } });
  return [h('div', { class: 'gs-form' }, f, h('div', { class: 'gs-acts' }, save, A && A.url ? button('Keep the old link', { ghost: true, onclick: () => { EDIT_ASSETS = false; redraw(); } }) : null), err), line];
}

/* ---------- someone else does this ---------- */
function handOff(D, ctx, s) {
  const pay = s.key === 'sign_pay';
  const email = field({ label: 'Their email', type: 'email', placeholder: 'name@example.com', autocomplete: 'off', inputmode: 'email' });
  const name = field({ label: 'Their name', placeholder: 'First and last name', autocomplete: 'off' });
  let role = 'both';
  const err = h('p', { class: 'gs-err', role: 'alert', hidden: true });
  const send = button('Send', { primary: true, large: true, onclick: async () => {
    const e = email.input.value.trim(), n = name.input.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { err.textContent = 'Type their email, like sam@example.com.'; err.hidden = false; return; }
    if (!n) { err.textContent = 'Type their name.'; err.hidden = false; return; }
    err.hidden = true; send.disabled = true;
    try {
      const r = await write('/api/onboard/handoff', 'POST', { step: s.key, email: e, name: n, ...(pay ? { role } : {}) }, d => {
        if (pay) d.sign_pay.pending_signer = { name: n, role, asked_at: new Date().toISOString() };
        else { const st = d.steps.find(x => x.key === s.key); st.holder = { email: e, name: n, handed: true }; }
      });
      sh.close();
      toast(pay ? ((r && r.text) || 'We asked ' + ORG_SHORT + ' to send it to ' + firstOf(n) + '.') : 'We emailed ' + firstOf(n) + '. Their part shows here when it is done.');
    } catch (x) { send.disabled = false; fail(x); }
  } });
  const sh = sheet({ title: 'Someone else does this', side: 'center', body: h('div', { class: 'gs-form' },
    h('p', { class: 'gs-lede' }, pay ? 'Name who signs, who pays, or both. We ask ' + ORG_SHORT + ' to send it to them.' : 'We email them a link and a quick login. They only see this one job.'),
    email, name,
    pay ? segmented([{ id: 'signer', label: 'Signs' }, { id: 'payer', label: 'Pays' }, { id: 'both', label: 'Both' }], role, id => { role = id; }) : null,
    err, h('div', { class: 'gs-acts' }, send, button('Cancel', { onclick: () => sh.close() }))) });
  setTimeout(() => email.input.focus(), 30);
}
function takeBack(D, ctx, s) {
  const me = ctx.me || {};
  return write('/api/onboard/handoff', 'POST', { step: s.key, email: me.email || '', name: me.name || '' }, d => { d.steps.find(x => x.key === s.key).holder = { email: me.email, name: me.name, handed: false }; })
    .then(() => toast('It is yours again.')).catch(fail);
}

/* ---------- one step card ---------- */
function stepCard(s, i, D, ctx, team) {
  const body = s.key === 'sign_pay' ? signPay(D, ctx, team) : s.key === 'connect' ? connect(D, ctx, team) : s.key === 'brief' ? brief(D, ctx, team) : assets(D, ctx, team);
  const foot = [];
  if (team) {
    const who = s.done ? 'Done ' + dateOf(s.done_at) : s.waiting_on === 'us' ? 'Waiting on us' : 'Waiting on ' + ((s.holder && s.holder.name) || 'the client') + (s.days_open ? ', ' + days(s.days_open) : '');
    foot.push(h('span', { class: 'who' }, who));
    const can = D.team && D.team.can_remind && D.team.can_remind[s.key] && (s.key !== 'sign_pay' || ctx.role === 'owner');
    if (!s.done && can) foot.push(...lineButtons(ctx, { onboard: { act: D.act, step: s.key, kind: 'client_waiting', action: { kind: 'remind', step: s.key } } }, { onDone: () => {} }).filter(b => b.tagName === 'BUTTON'));
  } else if (!D.only && !s.done) {
    if (s.holder && s.holder.handed && !isMe(ctx, s.holder)) foot.push(h('span', { class: 'who' }, 'Waiting on ' + (s.holder.name || 'them') + '.'), button("I'll do it myself", { ghost: true, onclick: () => takeBack(D, ctx, s) }));
    else foot.push(button('Someone else does this', { ghost: true, iconLeft: 'send', onclick: () => handOff(D, ctx, s) }));
  }
  const det = h('details', { class: 'gs-step' + (s.done ? ' done' : ''), open: OPEN.has(s.key) || null, ontoggle: e => { e.target.open ? OPEN.add(s.key) : OPEN.delete(s.key); } },
    h('summary', null, h('span', { class: 'dot' }, s.done ? svgNode(icon('check')) : String(i + 1)),
      h('span', { class: 't' }, h('b', null, s.label), s.why ? h('span', null, s.why) : null),
      h('span', { class: 'side' }, stepPill(s, D, ctx), svgNode(icon('chevron')))),
    h('div', { class: 'gs-body' }, body, foot.length ? h('div', { class: 'gs-foot' }, foot) : null));
  return det;
}

/* ---------- the finish ---------- */
async function openApp(ctx, D) {
  const slug = slugNow(ctx, D);
  if (ctx.sample) { location.href = './?sample=1&as=client&welcome=1#/brand/' + encodeURIComponent(slug) + '/home/index'; return; }
  try { await dropSaved('boot'); } catch {}
  history.replaceState(null, '', location.pathname + location.search + '#/brand/' + encodeURIComponent(slug) + '/home/index');
  location.reload();
}
function finished(D, ctx) {
  if (D.only) return h('div', { class: 'gs-done' }, h('b', null, 'Thanks, your part is done.'), h('span', null, 'You can close this page. ' + ORG_SHORT + ' takes it from here.'));
  return h('div', { class: 'gs-done' }, h('b', null, 'All done.'), h('span', null, D.next_line || 'Your team will be in touch within one working day to book your kickoff call.'),
    ctx.asClient ? button('Open ' + APP_NAME, { primary: true, href: ctx.href('home', 'index') }) : button('Open ' + APP_NAME, { primary: true, large: true, icon: 'arrow', onclick: () => openApp(ctx, D) }));
}

/* ---------- the profile ---------- */
function profile(D, ctx) {
  const p = D.profile || {};
  const name = field({ label: 'Your name', value: p.name || (ctx.me && ctx.me.name) || '', autocomplete: 'name', maxlength: 80 });
  const title = field({ label: 'Job title', value: p.title || '', placeholder: 'Founder, Marketing lead', autocomplete: 'organization-title', maxlength: 80 });
  const phone = field({ label: 'Phone (optional)', value: p.phone || '', type: 'tel', autocomplete: 'tel', maxlength: 30, hint: 'Only for when something is urgent.' });
  const err = h('p', { class: 'gs-err', role: 'alert', hidden: true });
  const go = button('Save and carry on', { primary: true, large: true, icon: 'arrow', onclick: async () => {
    const body = { name: name.input.value.trim(), title: title.input.value.trim(), phone: phone.input.value.trim() };
    if (!body.name || !body.title) { err.textContent = 'Fill in your name and job title.'; err.hidden = false; return; }
    if (body.phone && !/^[\d\s+().-]{5,30}$/.test(body.phone)) { err.textContent = 'A phone number has digits, spaces and + ( ) - . only.'; err.hidden = false; return; }
    err.hidden = true; go.disabled = true;
    try {
      if (ctx.sample) { D.profile = { ...body, done: true }; redraw(); }
      else { await ah(ctx, '/api/clients/me', 'PUT', body); await reread_(); }
      window.scrollTo(0, 0);
    } catch (e) { go.disabled = false; fail(e); }
  } });
  return h('section', { class: 'lx-card' }, h('div', { class: 'gs-form' },
    h('p', { class: 'gs-lede' }, 'Three quick things so your team knows who they are talking to.'),
    h('div', { class: 'two' }, name, title), phone, err, h('div', null, go)));
}

/* ---------- the team's extras ---------- */
function teamTop(D, ctx) {
  const T = D.team || {}, owner = ctx.role === 'owner';
  const pr = D.progress || { done: 0, total: 0 }, C = D.connect || {}, B = D.brief || {};
  const sent = D.sent_at ? Math.max(0, Math.round((Date.now() - Date.parse(D.sent_at)) / 864e5)) : null;
  const acts = [
    T.invite_link ? button('Copy their link', { iconLeft: 'link', onclick: async () => { try { await navigator.clipboard.writeText(T.invite_link); toast('Link copied.'); } catch { toast('Could not copy. It is ' + T.invite_link, { ms: 6000 }); } } }) : null,
    button('Read their website now', { onclick: e => readSite(ctx, e.currentTarget) }),
    button('Preview welcome cards', { onclick: () => import('./_welcome.js').then(m => m.showWelcome({ brand: ctx.brand, me: ctx.me, preview: true, team_chat: D.team_chat })) }),
    D.finished_at ? (owner ? button('Reopen', { ghost: true, onclick: () => write('/api/onboard/reopen', 'POST', {}, d => { d.finished_at = null; }).catch(fail) }) : null)
      : button('Mark finished', { ghost: true, onclick: () => write('/api/onboard/finish', 'POST', {}, d => { d.finished_at = new Date().toISOString(); d.steps.forEach(s => { s.done = true; }); }).then(() => toast('Marked finished. Their app is open now.')).catch(fail) }),
  ].filter(Boolean);
  const lines = T.lines || [];
  /* the tile names what is blocking: the first step not done, and who it waits on */
  const nextStep = (D.steps || []).find(st => !st.done);
  const nextWho = st => st.waiting_on === 'us' ? 'waiting on us' : 'waiting on ' + ((st.holder && st.holder.name) || 'the client');
  return [
    countTiles([
      { label: 'Steps done', value: pr.done + ' of ' + pr.total, sub: D.finished_at ? statusDot('good', 'Finished ' + dateOf(D.finished_at)) : nextStep ? statusDot('warn', 'Next: ' + nextStep.label + ', ' + nextWho(nextStep)) : 'App open', window: 'Right now', source: 'Their checklist' },
      { label: 'Accounts connected', value: (C.done || 0) + ' of ' + (C.total || 0), sub: missingWord(C), window: 'Right now', source: 'Their connections' },
      { label: 'Ten questions', value: (B.answered || 0) + ' of ' + (B.total || 0), sub: 'questions answered', window: 'Right now', source: 'Their answers' },
    ], { cols: 3 }),
    h('section', { class: 'lx-card gs-invite' }, h('div', { class: 'lx-sec' }, h('h3', null, 'Their invite'),
      h('span', { class: 'note' }, sent == null ? 'Not sent yet' : 'Sent ' + (sent === 0 ? 'today' : days(sent) + ' ago') + (T.contact ? ' to ' + T.contact.name : ''))),
      h('div', { class: 'gs-acts', style: { marginTop: '12px' } }, acts)),
    lines.length ? h('section', { class: 'lx-card' }, h('div', { class: 'lx-sec' }, h('h3', null, 'Needs a person'), h('span', { class: 'note' }, lines.length + (lines.length === 1 ? ' line' : ' lines') + ', also on My day')),
      h('div', { class: 'gs-lines' }, lines.map(l => h('div', { class: 'gs-line' }, h('div', null, h('b', null, l.text), l.detail ? h('small', null, l.detail) : l.when && !String(l.text).includes(l.when) ? h('small', null, l.when) : null),
        h('div', { class: 'gs-acts' }, lineButtons(ctx, l, { onDone: () => (ctx.sample ? null : reread_().catch(() => {})) }).filter(b => !(b.tagName === 'A' && /get-started/.test(b.getAttribute('href') || '')))))))) : null,
    budgetCard(D, ctx),
  ];
}
/** "What is still missing" under the Connected count, named, not "both ticks". */
function missingWord(C) {
  const left = (C.platforms || []).filter(p => p.needed !== false && !p.skipped && !p.done).map(p => p.title);
  return left.length ? 'Missing: ' + left.slice(0, 3).join(', ') + (left.length > 3 ? ' and ' + (left.length - 3) + ' more' : '') : (C.total ? 'every needed account' : 'nothing to connect');
}
const fmtMoney = v => { const n = Number(String(v || '').replace(/[$,\s]/g, '')); return n > 0 ? n.toLocaleString('en-US') : String(v || ''); };
function budgetCard(D, ctx) {
  const b = (D.team && D.team.budget) || {};
  let open = !!b.open;
  /* a money box: $ in front, thousands separated; the saved body is the same { amount, open } */
  const input = h('input', { class: 'gs-num', type: 'text', inputmode: 'decimal', value: b.amount != null ? fmtMoney(b.amount) : '', placeholder: '15,000', disabled: open || null, 'aria-label': 'Monthly ad budget in dollars' });
  input.addEventListener('blur', () => { input.value = fmtMoney(input.value); });
  const f = h('label', { class: 'lx-field gs-money' }, h('span', { class: 'l', hidden: true }, 'Monthly ad budget'), h('span', { class: 'gs-box' }, h('i', null, '$'), input, h('i', null, 'a month')));
  f.input = input;
  const t = toggle({ label: 'Client agreed to this budget', checked: !open, onchange: v => { open = !v; f.input.disabled = open; } });
  const save = button('Save the budget', { onclick: async () => {
    const amount = open ? null : Number(String(f.input.value).replace(/[$,\s]/g, ''));
    if (!open && !(amount > 0)) return toast('Type the monthly budget, or switch off Client agreed to this budget.', { tone: 'bad' });
    try { await write('/api/onboard/budget', 'PUT', { amount, open }, d => { d.team.budget = { amount, open }; }); toast('Saved. The brand budget is updated too.'); } catch (e) { fail(e); }
  } });
  return h('section', { class: 'lx-card' }, h('div', { class: 'lx-sec' }, h('h3', null, 'Their monthly ad budget'), h('span', { class: 'note' }, 'Also sets the brand budget')),
    h('div', { class: 'gs-budget', style: { marginTop: '12px' } }, f, t, h('span', { class: 'lx-sp' }), save));
}
async function readSite(ctx, btn) {
  if (ctx.sample) return toast(SAMPLE_SAID);
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Reading the website';
  toast('Reading their website. This takes a few minutes. Keep the page open.', { ms: 5000 });
  try {
    const res = await fetch(workers().ah + '/api/research/prefill', { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ act: ctx.brand.id }) });
    await res.text();
    if (!res.ok) throw new Error('The website read did not finish.');
    toast('Done. The drafts are in the brief.'); await reread_();
  } catch (e) { fail(e); }
  btn.disabled = false; btn.textContent = label;
}

/* ---------- the page ---------- */
function redraw() { if (CUR && CUR.el.isConnected) draw(CUR.el, CUR.D, CUR.ctx); }

/* Back on this tab (they signed or paid in another one, a colleague finished a step): read the state again at once.
   Not while someone is typing in a box on the page, so nothing they typed is drawn over. */
let focusHooked = false;
function hookFocus() {
  if (focusHooked) return;
  focusHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !CUR || !CUR.el.isConnected || CUR.ctx.sample || !CUR.ctx.brand || !CUR.D || CUR.D.none) return;
    const a = document.activeElement;
    if (a && CUR.el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    reread_().then(() => { if (CUR && CUR.D && CUR.D.gated === false && realClient(CUR.ctx) && !CUR.D.only) redraw(); }).catch(() => {});
  });
}

function draw(el, D, ctx) {
  css();
  CUR = { el, D, ctx };
  hookFocus();
  if (!ctx.brand) return put(el, empty({ title: 'Pick a brand', text: 'Get started belongs to one brand. Pick it from the brand switcher.' }));
  if (!D || D.none) return put(el, empty(teamView(ctx)
    ? { title: 'No setup for this brand', text: 'This brand was not added through New client, so it has no checklist.', action: button('New client', { href: '#/agency/all/a-clients/new', icon: 'arrow' }) }
    : { title: 'Nothing to set up', text: 'Your setup is done.', action: button('Open ' + APP_NAME, { primary: true, href: ctx.href('home', 'index') }) }));
  const team = teamView(ctx);
  ctx.setTitle(titleOf(ctx, D), { eyebrow: team ? 'Get started' : null });
  if (opened !== D.act + '|' + team) {           // a new page: open the first step that is not done
    opened = D.act + '|' + team; OPEN.clear(); HOW.clear(); EDIT_ASSETS = false;
    const first = (D.steps || []).find(s => !s.done); if (first) OPEN.add(first.key);
  }
  if (!team && needsProfile(ctx, D)) return put(el, h('div', { class: 'gs' }, profile(D, ctx)));
  const steps = (D.steps || []).map((s, i) => stepCard(s, i, D, ctx, team));
  if (team) return put(el, h('div', { class: 'gs' }, teamTop(D, ctx), h('div', { class: 'gs', style: { gap: '12px' } }, steps)));
  const pr = D.progress || { done: 0, total: (D.steps || []).length };
  const head = D.only ? h('p', { class: 'gs-lede' }, 'You were asked to help with ' + brandName(ctx, D) + "'s setup. Here is your part.")
    : h('div', { class: 'gs-prog' }, h('div', { class: 'n' }, h('b', null, pr.done + ' of ' + pr.total + ' done'), h('span', { class: 'gs-hint' }, 'Any order. It saves as you go.')),
      bar(pr.done, pr.total), pr.done < pr.total ? h('p', { class: 'gs-hint' }, (D.sign_pay ? 'Only have 10 minutes? Do Sign and pay, your store and Meta. The rest can wait.' : 'Only have 10 minutes? Do your store and Meta. The rest can wait.')) : null);
  const allDone = D.only ? (D.steps || []).every(s => s.done) : !D.gated;
  put(el, h('div', { class: 'gs' }, allDone ? finished(D, ctx) : null, head, h('div', { class: 'gs', style: { gap: '12px' } }, steps)));
}

export default {
  title: (ctx, d) => titleOf(ctx, d),
  eyebrow: (ctx, d) => (d && !teamView(ctx) ? null : 'Get started'),
  ranges: false,
  stamp: false,                  /* a form or a conversation, not numbers: no "updated" stamp in the head */
  async load(ctx) {
    if (!ctx.brand) return null;
    try { return await ctx.api('/api/onboard?act=' + encodeURIComponent(ctx.brand.id), { worker: 'ah', signal: ctx.signal }); }
    catch (e) { if (e && (e.status === 404 || e.status === 409)) return { none: true }; throw e; }
  },
  async sample(ctx) {
    const key = teamView(ctx) ? 'team' : 'client';
    if (!SAMPLES.has(key)) {
      const d = await ctx.fixture(key === 'team' ? 'team.json' : 'index.json');
      /* a sample client who has already made a profile (me-client.json says so) skips it */
      if (key === 'client' && ctx.me && ctx.me.client && ctx.me.client.profile_done) d.profile.done = true;
      if (key === 'client' && !(ctx.me && ctx.me.client)) d.profile.done = true;
      SAMPLES.set(key, d);
    }
    return SAMPLES.get(key);
  },
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:120px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};
