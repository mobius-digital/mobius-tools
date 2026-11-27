/* Agency settings > Team. ONE roster: every person, what they can open, and their Slack link.
   Real mode:
     account-health GET /api/team       who can sign in (email, access, brands they see, guest or on the domain), the domain,
                                        the owner, can_set_brands (true for the owner), and safe_remove once the server keeps
                                        a removed person's brands (then a member can carry removed: true)
     account-health PUT /api/team       { email, role, brands } invites or changes a person; { email, remove: true } removes
     account-health GET /api/settings   slackSendWho: who may press Send on a client message (owner or anyone)
     account-health PUT /api/settings   { slackSendWho }, through the Save bar
   Only the owner sees Invite and Remove (the server refuses anyone else). A guest off the domain must be given brands
   when invited, so a new guest never opens every brand. Remove shows only when the server says safe_remove, so a
   removed person can never come back with full access. A person's job has no server home: it shows in sample mode only. */

import { OLD_LOCUS } from '../../config.js';
import { put } from '../../kit.js';
import { h, em, empty, card, table, avatar, statusDot, button, sheet, toast } from '../../kit.js';
import { css, stage, saveBar, group, row, fold, setHelp, pick, onOff, exampleChip } from '../brand-settings/_set.js';

const ACCESS_HELP = 'Owner: every brand and every money page; the only one who invites and removes. Team: signs in with the agency email and opens the brands given (or every brand when none are picked). Viewer: reads only, changes nothing. Invited, off the domain: a guest with another email, who only ever opens the brands picked for them.';

const JOBS = [{ id: '', label: 'Not set' }, { id: 'owner', label: 'Owner' }, { id: 'strategist', label: 'Creative strategist' }, { id: 'buyer', label: 'Media buyer' },
  { id: 'editor', label: 'Editor' }, { id: 'designer', label: 'Designer' }, { id: 'google', label: 'Google' }, { id: 'amazon', label: 'Amazon' }, { id: 'email', label: 'Email and SMS' }];
const ACCESS = { owner: 'Owner', admin: 'Team', viewer: 'Viewer', contractor: 'Contractor' };
const nameOf = p => p.name || String(p.email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
/* Where the team signs in today: the live app (one folder up), until this new app is the front door. */
const appAddress = () => { try { return new URL(OLD_LOCUS, location.href).href; } catch { return 'the app'; } };
const sayErr = e => (e && e.message) || 'No answer from the server.';

/** One write to PUT /api/team, or a toast in sample mode. Reads the page again after a save.
    check(answer) may return a problem in words: the save is then reported as not done. */
async function teamWrite(ctx, body, done, reload, check) {
  if (ctx.sample) { toast('Sample: nothing saved'); return true; }
  try {
    const r = await ctx.api('/api/team', { worker: 'ah', method: 'PUT', body });
    const bad = check ? check(r || {}) : null;
    if (bad) { toast('Not saved as asked: ' + bad, { tone: 'bad', ms: 8000 }); reload(); return false; }
    toast(done, { ms: 5000 });
    reload();
    return true;
  } catch (e) { toast('Not saved: ' + sayErr(e), { tone: 'bad', ms: 6000 }); return false; }
}

/** The invite sheet: email, Team or Viewer, and the brands. A guest off the domain must have at least one brand. */
function inviteSheet(ctx, data, reload) {
  const brands = ctx.brands || [];
  const ticked = new Set();
  const email = h('input', { class: 'lx-input', type: 'email', placeholder: 'name@company.com', 'aria-label': 'Email address', autocomplete: 'off' });
  const access = h('select', { class: 'lx-input lx-st-sel', 'aria-label': 'Access' }, h('option', { value: 'admin' }, 'Team'), h('option', { value: 'viewer' }, 'Viewer, read only'));
  const need = h('p', { class: 'lx-tm-need', role: 'status' });
  const send = button('Send', { primary: true, large: true });
  const no = button('Not yet', { large: true });
  const known = email => (data.people || []).find(p => String(p.email).toLowerCase() === email);
  const onDomain = () => !!data.domain && String(email.value).trim().toLowerCase().endsWith('@' + String(data.domain).toLowerCase());
  const valid = () => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email.value).trim());
  const paint = () => {
    const guestNeedsBrand = !onDomain() && !ticked.size;
    send.disabled = !valid() || guestNeedsBrand;
    const was = known(String(email.value).trim().toLowerCase());
    need.textContent = valid() && guestNeedsBrand ? 'Pick the brands this person may see.'
      : onDomain() && !ticked.size ? (was && was.brands && was.brands.length ? 'No brands picked: they keep the ' + was.brands.length + ' they have now.' : 'On the team domain with no brands picked: they see every brand.') : '';
  };
  const boxes = h('div', { class: 'lx-tm-brands', role: 'group', 'aria-label': 'Brands they may see' },
    brands.length ? brands.map(b => h('label', null,
      h('input', { type: 'checkbox', value: b.id, onchange: e => { e.target.checked ? ticked.add(b.id) : ticked.delete(b.id); paint(); } }),
      h('span', null, b.name))) : h('p', { class: 'lx-tm-need' }, 'No brands to pick yet.'));
  email.addEventListener('input', paint);
  const body = h('div', { class: 'lx-tm-inv' },
    h('label', { class: 'lx-tm-f' }, h('span', null, 'Email'), email),
    h('label', { class: 'lx-tm-f' }, h('span', null, 'Access'), access),
    h('div', { class: 'lx-tm-f' }, h('span', null, 'Brands they may see'), boxes),
    need,
    h('p', { class: 'lx-tm-sub' }, 'No email is sent today. Tell them to sign in at ' + appAddress() + '.'),
    h('div', { class: 'lx-tm-acts' }, send, no));
  const sh = sheet({ title: 'Invite someone', body });
  no.addEventListener('click', () => sh.close());
  send.addEventListener('click', async () => {
    if (send.disabled) return;
    const b = { email: String(email.value).trim().toLowerCase(), role: access.value === 'viewer' ? 'viewer' : 'admin' };
    if (ticked.size) b.brands = [...ticked];
    else if (!onDomain()) return paint();         // never an empty brand list for a guest
    send.disabled = no.disabled = true;
    const guest = !onDomain();
    /* the server stores [] as every brand: a guest whose brands did not all come back is reported, never trusted */
    const check = r => guest && !(Array.isArray(r.brands) && r.brands.length) ? 'the server kept no brands for this guest, so they would open every brand. Remove them now.' : null;
    const ok = await teamWrite(ctx, b, 'Saved. Tell them to sign in at ' + appAddress() + '. No email is sent.', reload, check);
    if (ok) sh.close(); else { no.disabled = false; paint(); }
  });
  paint();
  setTimeout(() => email.focus(), 50);
}

function removeSheet(ctx, p, reload) {
  const go = button('Remove', { primary: true, large: true });
  const no = button('Not yet', { large: true });
  const sh = sheet({ title: 'Remove ' + nameOf(p) + '?', side: 'center', body: h('div', { class: 'lx-tm-inv' },
    h('p', null, 'They lose access on their next click. Their brands are kept if you let them back in.'),
    h('div', { class: 'lx-tm-acts' }, go, no)) });
  no.addEventListener('click', () => sh.close());
  go.addEventListener('click', async () => {
    go.disabled = no.disabled = true;
    const ok = await teamWrite(ctx, { email: p.email, remove: true }, nameOf(p) + ' is removed.', reload);
    if (ok) sh.close(); else { go.disabled = no.disabled = false; }
  });
}

/** The brands one person may open, as a checklist (read here; change them by inviting the same email again). */
function brandsSheet(ctx, p) {
  const all = ctx.brands || [], mine = new Set(p.brands || []), every = p.access === 'owner' || !mine.size;
  sheet({ title: nameOf(p) + ': brands', side: 'center', body: h('div', { class: 'lx-tm-inv' },
    h('p', { class: 'lx-tm-sub' }, every ? 'Opens every brand.' : 'Opens ' + mine.size + ' of ' + all.length + ' brands.'),
    h('ul', { class: 'lx-tm-list' }, all.map(b => { const on = every || mine.has(b.id); return h('li', { class: on ? 'on' : '' }, h('span', { 'aria-hidden': 'true' }, on ? '✓' : ''), h('span', null, b.name), on ? null : h('small', null, 'not given')); })),
    h('p', { class: 'lx-tm-sub' }, 'To change them, the owner invites the same email again with the new brands ticked.')) });
}

function draw(el, data, ctx, reload) {
  css();
  data = data || {};
  const people = data.people || [];
  const owner = ctx.sample || !!data.can_set_brands;
  const invite = () => (owner ? button('Invite someone', { onclick: () => inviteSheet(ctx, data, reload) }) : null);
  if (!people.length) return put(el, empty({ title: 'Nobody on the team list yet', text: 'Everyone on the agency email domain can sign in.' + (owner ? ' Invite anyone else by email.' : ''), action: invite() }));
  const S = stage(ctx, {
    live: { 'agency.slackSendWho': data.send_who },
    /* through data.js saveSetting, so the session's cached agency settings are cleared too */
    savers: { 'agency.slackSendWho': async v => { await ctx.saveSetting('agency.slackSendWho', v); data.send_who = v; } },
  });
  const k = (p, n) => 'team:' + p.email + '.' + n;
  const nBrands = (ctx.brands || []).length;
  const ex = new Set(data.example || []);
  const me = String((ctx.me && ctx.me.email) || data.you || '').toLowerCase();
  const canRemove = owner && (ctx.sample || data.safe_remove === true);

  const cols = [
    { key: 'name', label: 'Person', sortable: true, value: nameOf, render: p => h('span', { class: 'lx-st-who' }, avatar({ ...p, name: nameOf(p) }, { size: 34 }), h('span', null, h('b', null, nameOf(p)), h('small', null, p.email))) },
    ctx.sample ? { key: 'job', label: 'Job', render: p => pick(S, k(p, 'job'), p.job || '', JOBS, { label: 'Job for ' + nameOf(p), width: 180 }) } : null,
    { key: 'access', label: 'Access', class: 'hide-sm', render: p => p.removed ? statusDot('off', 'Removed') : h('span', null, ACCESS[p.access] || 'Team', p.guest ? h('small', { class: 'lx-tm-sub' }, 'invited, off the domain') : null) },
    { key: 'brands', label: 'Brands', class: 'hide-md', render: p => h('button', { type: 'button', class: 'lx-tm-bn', title: 'See which brands', onclick: () => brandsSheet(ctx, p) }, p.access === 'owner' || !p.brands || !p.brands.length ? 'All ' + (nBrands || '') : p.brands.length + ' of ' + (nBrands || p.brands.length), h('span', { 'aria-hidden': 'true' }, ' ›')) },
    { key: 'slack', label: 'Slack', class: 'hide-md', render: p => p.slack == null ? h('span', { class: 'lx-foot' }, 'Not checked') : p.slack ? statusDot('good', 'Linked') : statusDot('off', 'Not linked') },
    canRemove ? { key: 'do', label: '', num: true, render: p => {
      if (p.access === 'owner' || String(p.email).toLowerCase() === me) return '';
      if (p.removed) return button('Let back in', { onclick: () => teamWrite(ctx, { email: p.email, role: p.access === 'viewer' ? 'viewer' : 'admin' }, nameOf(p) + ' can sign in again.', reload) });
      return button('Remove', { ghost: true, onclick: () => removeSheet(ctx, p, reload) });
    } } : null,
  ].filter(Boolean);
  const roster = table({ cols, rows: people, sort: null, roomy: true });

  const live = people.filter(p => !p.removed);
  const viewers = live.filter(p => p.access === 'viewer').length, guests = live.filter(p => p.guest).length;
  put(el, h('div', { class: 'lx-st' },
    saveBar(S, ctx, { help: setHelp({
      about: 'One roster: every person on the team, what they can open, and whether their Slack is linked. Only the owner invites and removes.',
      sections: [{ title: 'Access', text: ACCESS_HELP }],
      fixed: [
        ['Team email domain', data.domain ? '@' + data.domain : 'Not read yet', 'Anyone signed in with it is on the team. Others are invited one by one, with the brands they may see.'],
        ['Owner', data.owner_name || 'The agency owner', 'Sees every brand and every money page. Only the owner invites and removes.'],
        ['Photos', 'From each person’s Slack', 'Change it in Slack and it changes here.'],
      ] }), note: ctx.sample ? undefined : 'Invite and Remove save at once. Who can send to clients saves with this button.' }),
    card({ title: 'The team', note: ex.has('jobs') ? exampleChip() : live.length + (live.length === 1 ? ' person, ' : ' people, ') + guests + (guests === 1 ? ' guest, ' : ' guests, ') + viewers + (viewers === 1 ? ' viewer.' : ' viewers.'),
      flush: true, class: 'lx-st-card', action: invite() }, roster),
    group('Who can do what', null,
      row('Who can send to clients', 'Press Send on a client daily, a report or an update.', pick(S, 'agency.slackSendWho', data.send_who || 'owner', [{ id: 'owner', label: 'The owner only' }, { id: 'anyone', label: 'Anyone on the team' }], { label: 'Who can send to clients', width: 200 })),
      ctx.sample ? row('Who can approve ideas into briefs', null, pick(S, 'agency.ideaApprovers', data.approvers || 'owner_strategist', [{ id: 'owner', label: 'The owner' }, { id: 'owner_strategist', label: 'Owner and strategists' }, { id: 'anyone', label: 'Anyone on the team' }], { label: 'Who can approve ideas', width: 220 })) : null,
      ctx.sample ? row('Who sees other people’s work lists', null, pick(S, 'agency.seeOthers', data.see_others || 'owner', [{ id: 'owner', label: 'The owner only' }, { id: 'leads', label: 'Owner and account leads' }, { id: 'anyone', label: 'Everyone' }], { label: 'Who sees other work lists', width: 220 })) : null),
    ctx.sample ? fold('Advanced', 'Rarely touched',
      row('Contractors', 'A contractor sees only the brands and cards given to them, never money pages.', onOff(S, 'agency.contractorsOn', data.contractors ?? false, 'Allow contractors'))) : null,
  ));
}

const page = {
  title: ['Who is on ', em('the team?')],
  eyebrow: 'Agency settings',
  ranges: false,
  stamp: false,                  /* a form or a conversation, not numbers: no "updated" stamp in the head */
  async load(ctx) {
    const soft = p => p.catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
    const [t, sj] = await Promise.all([
      ctx.api('/api/team', { worker: 'ah', signal: ctx.signal }),
      soft(ctx.api('/api/settings', { worker: 'ah', signal: ctx.signal })),
    ]);
    const owner = String(t.owner || '').toLowerCase();
    const emails = new Set((t.members || []).map(m => String(m.email).toLowerCase()));
    const people = [
      ...(owner && !emails.has(owner) ? [{ email: owner, access: 'owner', brands: [] }] : []),
      ...(t.members || []).map(m => ({ email: m.email, access: String(m.email).toLowerCase() === owner ? 'owner' : m.role, guest: !!m.guest, brands: m.brands || [], slack: null, removed: !!m.removed })),
    ];
    return { people, domain: t.domain || null, owner_name: null, you: t.you || null, can_set_brands: !!t.can_set_brands, safe_remove: t.safe_remove === true,
      send_who: sj ? sj.slackSendWho : null, example: [] };
  },
  render(el, data, ctx) {
    const reload = async () => {
      if (ctx.sample) return;
      try { draw(el, await page.load({ ...ctx, signal: undefined }), ctx, reload); } catch { /* the next visit reads it again */ }
    };
    draw(el, data, ctx, reload);
  },
};
export default page;

import { addStyles } from '../../kit.js';
addStyles('lx-tm-css', `.lx-tm-sub{display:block;font-size:12px;color:var(--muted)}
.lx-tm-inv{display:grid;gap:16px;min-width:0}
.lx-tm-inv p{margin:0;font-size:14px;line-height:1.5}
.lx-tm-f{display:grid;gap:6px;min-width:0}
.lx-tm-f>span{font-size:13px;font-weight:600}
.lx-tm-f .lx-input{width:100%}
.lx-tm-brands{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px 14px;max-height:260px;overflow:auto;padding:2px}
.lx-tm-brands label{display:flex;align-items:center;gap:8px;font-size:14px;min-height:32px;cursor:pointer}
.lx-tm-need{font-size:13px!important;color:var(--muted)}
.lx-tm-need:empty{display:none}
.lx-tm-acts{display:flex;gap:10px;flex-wrap:wrap}
.lx-tm-bn{border:0;background:none;padding:4px 8px;margin:-4px -8px;border-radius:8px;font:inherit;color:var(--ink);cursor:pointer;white-space:nowrap}
.lx-tm-bn:hover{background:var(--row-hover)}
.lx-tm-list{list-style:none;margin:0;padding:0;display:grid;border-top:1px solid var(--line)}
.lx-tm-list li{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px;color:var(--muted)}
.lx-tm-list li.on{color:var(--ink)}
.lx-tm-list li>span:first-child{color:var(--good);font-weight:700}
.lx-tm-list small{font-size:12px;color:var(--faint)}
.lx-tm-acts .lx-btn{flex:1 1 140px;justify-content:center}`);
