/* The welcome cards: a few short cards the first time a client opens the app past the setup gate (app.js), and a
   preview for the team (Get started > Preview welcome cards). Swipe, arrow keys, the dots, Skip on every card, Done
   on the last. The last card asks for feedback: "Message the team" opens a small box that files a request, and
   "Open Slack" shows when the brand has a shared Slack channel.
   Writes (account-health), never in the preview or in sample mode:
     PUT  /api/clients/me { welcome_seen: true }       when the cards close, so they show once per person
     POST /api/requests { act, kind: 'request', title: 'Locus feedback', text }
     GET  /api/onboard?act=                             read once when the cards open, only for the Slack link */

import { h, button, sheet, toast, addStyles } from '../../kit.js';
import { api, SAMPLE, dropSaved } from '../../data.js';
import { APP_NAME, OWNER_FIRST } from '../../config.js';

const CSS = `
.wc{display:grid;gap:18px;min-width:0}
.wc-view{overflow:hidden;touch-action:pan-y;border-radius:16px}
.wc-track{display:flex;transition:transform var(--t) var(--ease)}
.wc-card{flex:0 0 100%;min-width:0;display:grid;gap:12px;align-content:start;padding:28px 26px;min-height:230px;border-radius:16px;background:var(--bg-sunk)}
.wc-card .n{font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--faint)}
.wc-card h3{margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em;line-height:1.2}
.wc-card p{margin:0;font-size:15.5px;line-height:1.55;color:var(--ink-2)}
.wc-dots{display:flex;gap:8px;justify-content:center}
.wc-dots button{width:9px;height:9px;padding:0;border:0;border-radius:50%;background:var(--line-strong);cursor:pointer}
.wc-dots button.on{background:var(--ink);width:22px;border-radius:999px}
.wc-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.wc-foot .lx-sp{flex:1}
.wc-msg{display:grid;gap:12px}
`;

function cards(brand) {
  const b = (brand && brand.name) || 'your brand';
  return [
    { t: 'This is ' + APP_NAME, p: 'The app we run ' + b + ' from. Your sales, your ads and your plan in one place, the same numbers we look at.' },
    { t: 'What it does for you', p: 'It shows what your ads earn, what to change next, and what we are working on. Nothing changes in your ads without a tap.' },
    { t: 'Getting around', p: 'The menu on the left is the whole app. On a phone it is the More tab at the bottom.' },
    { t: 'Where things live', p: 'Home and This month for your numbers. Ads for every platform. Reports for what we send you. Creative review and Requests for what needs your yes. Assets opens your photo and video folder.' },
    { t: 'Tell us what is missing', p: LAST_CARD, last: true },
  ];
}
/* The owner's words for the last card (2026-11-26), exactly. */
export const LAST_CARD = APP_NAME + ' is new and we keep building it. Look around. If something is missing, confusing, or you have an idea that would help you, tell ' + OWNER_FIRST + '. Tap below to message the team, or tell him in Slack.';
export const _cards = cards;

/** showWelcome({ brand, me, preview, team_chat }) */
export function showWelcome({ brand = null, me = null, preview = false, team_chat = null } = {}) {
  addStyles('lx-wc-css', CSS);
  const list = cards(brand);
  let at = 0, slack = team_chat && team_chat.slack_url ? team_chat.slack_url : null, closed = false;
  const track = h('div', { class: 'wc-track' });
  const dots = h('div', { class: 'wc-dots', role: 'tablist', 'aria-label': 'Cards' });
  const foot = h('div', { class: 'wc-foot' });
  const view = h('div', { class: 'wc-view', 'aria-roledescription': 'carousel', 'aria-live': 'polite' }, track);
  const slackSlot = h('span');

  const paint = () => {
    track.style.transform = 'translateX(' + (-100 * at) + '%)';
    [...track.children].forEach((c, i) => { c.setAttribute('aria-hidden', String(i !== at)); c.inert = i !== at; });
    [...dots.children].forEach((d, i) => { d.classList.toggle('on', i === at); d.setAttribute('aria-selected', String(i === at)); });
    const last = at === list.length - 1;
    foot.replaceChildren(...[
      at > 0 ? button('Back', { ghost: true, onclick: () => go(at - 1) }) : null,
      h('span', { class: 'lx-sp' }),
      last ? null : button('Skip', { ghost: true, onclick: () => close() }),
      last ? button('Done', { primary: true, onclick: () => close() }) : button('Next', { primary: true, icon: 'arrow', onclick: () => go(at + 1) })].filter(Boolean));
  };
  const go = i => { at = Math.max(0, Math.min(list.length - 1, i)); paint(); };

  list.forEach((c, i) => {
    track.append(h('section', { class: 'wc-card', role: 'group', 'aria-label': (i + 1) + ' of ' + list.length },
      h('span', { class: 'n' }, (i + 1) + ' OF ' + list.length), h('h3', null, c.t), h('p', null, c.p),
      c.last ? h('div', { class: 'wc-foot' }, button('Message the team', { primary: true, onclick: () => message(brand, preview) }), slackSlot) : null));
    dots.append(h('button', { type: 'button', role: 'tab', 'aria-label': 'Card ' + (i + 1), onclick: () => go(i) }));
  });
  const drawSlack = () => slackSlot.replaceChildren(slack ? button('Open Slack', { href: slack, target: '_blank' }) : '');
  drawSlack();

  /* swipe */
  let x0 = null;
  view.addEventListener('pointerdown', e => { x0 = e.clientX; });
  view.addEventListener('pointerup', e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1)); });
  const key = e => { if (e.key === 'ArrowRight') go(at + 1); else if (e.key === 'ArrowLeft') go(at - 1); };
  document.addEventListener('keydown', key);

  const sh = sheet({ title: preview ? 'Welcome cards (preview)' : 'Welcome to ' + APP_NAME, side: 'center', body: h('div', { class: 'wc' }, view, dots, foot), onClose: () => close(true) });
  paint();

  /* the brand's shared Slack channel, read once (a client of a brand with no setup row simply gets no Slack button) */
  if (!slack && !preview && !SAMPLE && brand && brand.id) {
    api('/api/onboard?act=' + encodeURIComponent(brand.id), { worker: 'ah' }).then(d => { if (d && d.team_chat && d.team_chat.slack_url) { slack = d.team_chat.slack_url; drawSlack(); } }).catch(() => {});
  }

  function close(fromSheet) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', key);
    if (!fromSheet) sh.close();
    if (preview || SAMPLE) return;
    /* Seen now: in this page's state, and the saved boot copy goes so the next visit reads /api/me afresh
       (a saved copy would still say welcome_seen false and show the cards again). */
    if (me && me.client) me.client.welcome_seen = true;
    dropSaved('boot').catch(() => {});
    api('/api/clients/me', { worker: 'ah', method: 'PUT', body: { welcome_seen: true } }).catch(() => {});
  }
}

/* "Message the team": a small box that files a request on the brand */
function message(brand, preview) {
  const ta = h('textarea', { class: 'lx-input', rows: 4, maxlength: 2000, placeholder: 'What is missing, confusing, or would help you?', 'aria-label': 'Your message' });
  const send = button('Send', { primary: true, large: true, onclick: async () => {
    const text = ta.value.trim();
    if (!text) return ta.focus();
    if (preview || SAMPLE) { s.close(); return toast('Preview: nothing was sent.'); }
    send.disabled = true;
    try {
      await api('/api/requests', { worker: 'ah', method: 'POST', body: { act: brand && brand.id, kind: 'request', title: APP_NAME + ' feedback', text } });
      s.close(); toast('Sent. Thank you.');
    } catch (e) { send.disabled = false; toast(e.message || 'That did not send. Try again.', { tone: 'bad', ms: 5000 }); }
  } });
  const s = sheet({ title: 'Message the team', side: 'center', body: h('div', { class: 'wc-msg' }, ta, h('div', { class: 'wc-foot' }, send, button('Cancel', { onclick: () => s.close() }))) });
  setTimeout(() => ta.focus(), 30);
}
