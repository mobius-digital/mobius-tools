/* Your profile: one page. The profile rows, then Sign-in as a card under them (it used to be a second tab row,
   which put "Profile" on screen twice). How notifications reach a person is
   its own tab on the line now (profile/delivery, saved to the account), which replaced the device-only page here.
   The menu gives this line one route (profile/index), so the tabs are local. Open one directly with ?ptab=sign-in.
   Live data: who you are from the stored session (/api/me, already loaded by the shell) and, for the team,
   role, brands and the Slack link from GET /api/mywork. */

import { put } from '../../kit.js';
import { h, button, card, em, statusDot, toast, sheet } from '../../kit.js';
import { APP_NAME, QS } from '../../config.js';
import { css, face, ic, store } from '../my-day/_ui.js';

/* ?ptab=sign-in still works: it scrolls to the Sign-in card */
const JUMP = QS.get('ptab') === 'sign-in';

const ZONES = { 'America/Chicago': 'Central Time', 'America/New_York': 'Eastern Time', 'America/Denver': 'Mountain Time', 'America/Los_Angeles': 'Pacific Time', 'America/Phoenix': 'Arizona Time' };
function zoneNow() {
  let z = '';
  try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
  return (ZONES[z] || z.replace(/_/g, ' ') || 'Your time') + ', ' + now + ' now';
}
const ROLE_WORD = { owner: 'Owner', team: 'Team', client: 'Client' };

/** The session and the My work answer, as the page's shape (the same shape as the fixture's "profile"). */
function fromLive(ctx, mw) {
  const me = ctx.me || {};
  const full = String(me.name || (mw && mw.person && mw.person.name) || (me.email || '').split('@')[0] || '').trim();
  const [first, ...rest] = full.split(/\s+/);
  const p = (mw && mw.person) || {};
  const mine = mw && Array.isArray(mw.brands) && mw.brands.length ? mw.brands : null;
  return {
    name: first || '', last_name: rest.join(' '), email: me.email || '',
    role: p.role || ROLE_WORD[ctx.role] || '', role_by: ctx.role === 'owner' ? null : 'the owner',
    brands: mine || (ctx.brands || []).map(b => b.name), brands_all: !mine && !ctx.isClient,
    tz: null, slack: mw ? { linked: !!p.slack, handle: p.name || first } : null,
    photo: me.photo || null, photo_from: me.photo ? 'Slack' : null, previews: null,
  };
}

function profileTab(host, p, ctx) {
  const who = { name: [p.name, p.last_name].filter(Boolean).join(' '), email: p.email, photo: p.photo };
  /* no lock icon: a muted line says who sets it, and the tooltip says why */
  const locked = by => by ? h('span', { title: 'Only the owner changes this' }, 'Set by ' + by) : '';
  const rows = [
    ['Name', p.name || 'No name on this sign-in', 'What the team sees'],
    ['Role', p.role || 'Not set', locked(p.role_by)],
    ['Brands', p.brands && p.brands.length ? (p.brands_all ? 'All ' + p.brands.length + ' brands' : p.brands.join(', ')) : 'No brands yet', locked(p.role_by)],
    ['Time zone', p.tz || zoneNow(), 'Due times use this'],
    ['Working hours', '9:00am to 5:00pm, Mon to Fri', p.previews ? 'Teammates see when you are off' : 'The team default for now'],
    ['Slack', p.slack == null ? 'Not checked' : p.slack.linked ? statusDot('good', 'Linked as @' + (p.slack.handle || p.name)) : statusDot('off', 'Not linked'),
      p.slack && p.slack.linked ? 'Reminders go here' : p.slack ? 'Ask the owner to add your Slack' : 'For the team'],
  ];
  const pv = p.previews || { comment: { when: 'now', text: 'Which hook goes first?' }, task: { text: 'Send the recut brief', due: 'Wed' }, promise: { text: 'sends the brief', due: 'by Wed' } };
  const cap = t => h('span', { class: 'lx-cap' }, t);
  put(host, h('div', { class: 'lx-pf-cols' },
    h('div', null, rows.map(([k, v, n]) => h('div', { class: 'lx-pf-row' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v), h('span', { class: 'n' }, n)))),
    h('aside', null, card({ title: 'Examples of where your photo shows', class: 'lx-pf-band' },
      cap('A comment'),
      h('div', { class: 'lx-pf-prev top' }, face(who, 34), h('span', { class: 't' }, h('b', null, p.name || 'You'), ' ', h('small', null, pv.comment.when), h('br'), pv.comment.text)),
      cap('A task row'),
      h('div', { class: 'lx-pf-prev' }, face(who, 22), h('b', { class: 't' }, pv.task.text), h('span', { class: 'r' }, pv.task.due)),
      cap('A meeting promise'),
      h('div', { class: 'lx-pf-prev' }, face(who, 22), h('span', { class: 't' }, h('b', null, p.name || 'You'), ' ' + pv.promise.text), h('span', { class: 'r' }, pv.promise.due))))));
}

function signinTab(host, p, ctx) {
  const rows = [
    ['Email', p.email || 'No email on this sign-in', 'You sign in with this'],
    ['Access', ROLE_WORD[ctx.role] || 'Team', ctx.isClient ? 'Your brand only' : 'Set by the owner'],
    ['How you sign in', 'Google, or a link sent to your email', 'No password to remember'],
  ];
  put(host, card({ title: 'Sign-in', note: 'Sign out is in the menu under your picture, top right', class: 'lx-pf-signin' },
    rows.map(([k, v, n]) => h('div', { class: 'lx-pf-row' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v), h('span', { class: 'n' }, n)))));
}

function draw(el, data, ctx) {
  css();
  const p = (data && data.profile) || fromLive(ctx, null);
  /* the same two initials as the top bar: the full name, not the first name only */
  const who = { name: [p.name, p.last_name].filter(Boolean).join(' '), email: p.email, photo: p.photo };
  const head = h('div'), body = h('div'), signin = h('div');
  const outKey = 'lx5_out_' + new Date().toLocaleDateString('en-CA');

  const paint = () => {
    {
      ctx.setTitle([p.name || 'You', p.last_name ? ' ' : null, p.last_name ? em(p.last_name) : null], { eyebrow: 'Your profile' });
      const isOut = !ctx.sample && store.get(outKey, false);
      const outBtn = button(isOut ? "You're out today" : "I'm out today", { ghost: true, onclick: () => {
        if (ctx.sample) return toast('Sample numbers: nothing is saved.');
        const next = !store.get(outKey, false); store.set(outKey, next);
        outBtn.firstChild.textContent = next ? "You're out today" : "I'm out today";
        toast(next ? 'Marked out today on this device. Telling the team comes with the notifications release.' : 'You are back in.');
      } });
      const photoBtn = h('button', { class: 'lx-btn primary', type: 'button', onclick: () => sheet({ title: 'Your photo', side: 'center',
        body: h('p', { style: { color: 'var(--ink-2)', lineHeight: 1.5 } }, 'Your photo comes from your Slack profile, at full size. Change it in Slack and it changes here. Uploading one straight to ' + APP_NAME + ' comes with the notifications release.') }) },
        ic('camera'), 'Change photo');
      put(head, h('section', { class: 'lx-hero line lx-pf-hero' }, h('div', { class: 'lx-hero-h' }, face(who, 64, true),
        h('div', null,
          h('p', null, [p.role, p.brands && p.brands.length ? p.brands.length + (p.brands.length === 1 ? ' brand' : ' brands') : ''].filter(Boolean).join(', '))),
        h('span', { class: 'lx-sp' }),
        h('div', { class: 'lx-pf-side' }, h('div', { class: 'lx-md-acts' }, outBtn, photoBtn),
          p.photo_from ? statusDot('good', 'Photo from ' + p.photo_from) : statusDot('off', 'No photo yet')))));
    }
    profileTab(body, p, ctx);
    signinTab(signin, p, ctx);
    put(el, h('div', { class: 'lx-pf-page' }, head, body, signin));       /* the title is the shell's; the hero under it */
  };
  paint();
  if (JUMP) requestAnimationFrame(() => signin.scrollIntoView({ block: 'start' }));
}

export default {
  title: 'Your profile',
  ranges: false,
  async load(ctx) {
    /* A client has no My work list; the team's answer adds role, brands and the Slack link. */
    const mw = ctx.isClient ? null : await ctx.api('/api/mywork', { worker: 'ah', signal: ctx.signal }).catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
    return { profile: fromLive(ctx, mw) };
  },
  render: draw,
};

import { addStyles } from '../../kit.js';
addStyles('lx-pf-page-css', `.lx-pf-page{display:grid;gap:var(--sp-6)}
.lx-pf-band{display:grid;gap:10px}
.lx-pf-band .lx-pf-prev{box-shadow:none;background:var(--surface-2);padding:10px 12px;border-radius:12px}
.lx-pf-signin .lx-pf-row{grid-template-columns:166px minmax(0,1fr) auto}
@media (max-width:759px){.lx-pf-signin .lx-pf-row{grid-template-columns:minmax(0,1fr) auto}}`);
