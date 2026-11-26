/* Your profile > How things reach me. Each person's own choice, saved to their account (not this device).
   Three cards, phone first:
     1. How you hear     three presets (Only urgent, Only urgent + morning brief, Everything that needs me). "Custom"
                         shows as the current one, not tappable, once a single row below was changed.
     2. Also send to     In Locus (always), Slack DM, Email, Phone. A channel the server says is not ready is dimmed.
     3. Customize        one row per kind of notification, grouped Urgent, Needs you, Morning, with a pill per channel.
   Everything drawn comes from the server: account-health GET /api/me/delivery answers `notify` (the choice) and
   `catalog` (the types, presets and channels this person may pick, and copies_on). Saves go to PUT /api/me/delivery
   with { notify: { preset } }, { notify: { channels } } or { notify: { preset: 'custom', types: { [id]: cell } } }.
   Each tap fills the page at once (the pure rules in _notify.js, the same as the worker's), then saves; a refusal
   puts the page back and says why. Sample mode saves nothing.
   The older choices (the default mode, quiet hours, one by one per automation) are still in the route's answer and
   keep working for the automations engine. This page no longer draws them. */

import { h, put, em, card, toast, addStyles, empty } from '../../kit.js';
import { style, ah } from '../automations/_auto.js';
import { seenAsClient, clientsOwn, staleHold } from './_own.js';
import { normalNotify, applyPreset, applyChannels, applyCell, cellOn, isCustom } from './_notify.js';

const power = ctx => (ctx.isClient ? Promise.resolve({ power: null, can_power: false })
  : ah(ctx, '/api/automations').then(a => ({ power: !!a.power, can_power: !!a.can_power }), e => { if (e && e.name === 'AbortError') throw e; return { power: null, can_power: false }; }));
const load = async ctx => { if (seenAsClient(ctx)) return { preview: true }; const [d, p] = await Promise.all([ah(ctx, '/api/me/delivery'), power(ctx)]); return { ...d, ...p }; };

const CSS = `
.nt{display:grid;gap:var(--sp-6);min-width:0}
.nt-presets{display:grid;gap:10px}
.nt-preset{display:grid;gap:2px;width:100%;min-height:56px;padding:12px 16px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:inherit;font:inherit;text-align:left;cursor:pointer}
.nt-preset b{font-size:15px;font-weight:600}
.nt-preset span{font-size:13px;color:var(--muted);line-height:1.45}
.nt-preset:hover{border-color:var(--line-strong)}
.nt-preset[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:var(--surface)}
.nt-preset[aria-pressed="true"] span{color:inherit;opacity:.78}
.nt-preset.custom{cursor:default}
.nt-pills{display:flex;flex-wrap:wrap;gap:8px}
.nt-pill{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 16px;border:1px solid var(--line-strong);border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:14px;cursor:pointer}
.nt-pill[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:var(--surface)}
.nt-pill.locked{cursor:default;background:var(--surface-2);border-color:var(--line);color:var(--ink-2)}
.nt-pill[aria-disabled="true"]{opacity:.45;cursor:not-allowed}
.nt-pill small{font-size:12px;opacity:.8}
.nt-chan{display:grid;gap:10px}
.nt-why{margin:0;font-size:12.5px;color:var(--muted);line-height:1.5}
.nt-g{display:grid;gap:0}
.nt-g + .nt-g{margin-top:18px}
.nt-g h3{margin:0 0 4px;font-size:13px;font-weight:600;color:var(--muted);letter-spacing:.02em}
.nt-row{display:grid;gap:8px;padding:14px 0;border-top:1px solid var(--line);min-width:0}
.nt-row:first-of-type{border-top:0}
.nt-row b{font-size:14.5px;font-weight:600}
.nt-row p{margin:0;font-size:13px;color:var(--muted);line-height:1.45}
.nt-row .nt-pills{gap:6px}
.nt-row .nt-pill{padding:0 12px;font-size:13.5px}
.nt-copy{margin:6px 0 0;padding:10px 12px;border-radius:10px;background:var(--surface-2);font-size:12.5px;color:var(--ink-2);line-height:1.5}
@media (min-width:760px){.nt-presets{grid-template-columns:repeat(3,minmax(0,1fr))}.nt-presets .custom{grid-column:1/-1}}
`;

const CHAN_SHORT = { in_app: 'In Locus', slack_dm: 'Slack', email: 'Email', push: 'Phone' };
const GROUPS = [['urgent', 'Urgent'], ['needs_me', 'Needs you'], ['brief', 'Morning'], ['client', 'For you']];

function render(el, d, ctx) {
  style(); addStyles('nt-css', CSS);
  if (seenAsClient(ctx)) return clientsOwn(el);
  if (staleHold(el, d, ctx, load, render)) return;
  const cat = d && d.catalog;
  if (!cat || !Array.isArray(cat.types)) {
    return put(el, empty({ title: 'Your choices show here soon', text: 'The server has not been updated for this page yet. Everything still reaches you in the bell.' }));
  }
  const client = !!ctx.isClient;
  const types = cat.types;
  /* a client hears in Locus and by email only (the server forces the rest off) */
  const channels = (cat.channels || []).filter(c => !client || c.id === 'in_app' || c.id === 'email');
  const chanOf = id => channels.find(c => c.id === id) || null;
  const ready = id => { const c = chanOf(id); return !!(c && (c.always || c.ready)); };
  let st = normalNotify(d.notify, types);

  /* Quick taps: each save is numbered, and only the newest one's answer (or failure) repaints, so an older answer
     never overwrites the tap after it. */
  let seq = 0;
  const save = async (next, body) => {
    const before = st, mine = ++seq;
    st = next; d.notify = next; paint();
    if (ctx.sample) return toast('Sample mode: nothing is saved.');
    try {
      const r = await ah(ctx, '/api/me/delivery', { method: 'PUT', body: { notify: body } });
      if (mine !== seq) return;
      if (r && r.notify) { st = normalNotify(r.notify, types); d.notify = st; if (r.catalog) d.catalog = r.catalog; paint(); }
      toast('Saved.');
    } catch (e) {
      if (mine !== seq) return;
      st = before; d.notify = before; paint();
      toast((e && e.message) || 'Not saved.', { tone: 'bad', ms: 5000 });
    }
  };

  const root = h('div', { class: 'nt' });
  function paint() {
    /* 1. How you hear */
    const presets = (cat.presets || []).filter(p => p.id !== 'custom');
    const presetCard = client || !presets.length ? null : card({ title: 'How you hear', note: 'Everything always shows here in Locus. This picks what also reaches you outside it.' },
      h('div', { class: 'nt-presets', role: 'group', 'aria-label': 'How you hear' },
        presets.map(p => h('button', { type: 'button', class: 'nt-preset', 'aria-pressed': String(st.preset === p.id),
          onclick: () => { if (st.preset !== p.id) save(applyPreset(st, types, p.id), { preset: p.id }); } },
        h('b', null, p.name), p.sub ? h('span', null, p.sub) : null)),
        isCustom(st) ? h('div', { class: 'nt-preset custom', 'aria-pressed': 'true', role: 'status' },
          h('b', null, 'Custom'), h('span', null, 'You changed one below. Pick a preset to reset.')) : null));

    /* 2. Also send to */
    const notes = [];
    const chanPills = channels.map(c => {
      if (c.always || c.id === 'in_app') return h('span', { class: 'nt-pill locked', 'aria-label': c.name + ', always on' }, c.name, h('small', null, 'Always'));
      if (!ready(c.id)) {
        /* a short note ("Coming soon") sits in the pill; a longer one goes under the pills */
        const short = c.note && c.note.length <= 16;
        if (c.note && !short) notes.push(c.name + ': ' + c.note);
        return h('button', { type: 'button', class: 'nt-pill', 'aria-pressed': 'false', 'aria-disabled': 'true', 'aria-label': c.name + (c.note ? ', ' + c.note : ''),
          onclick: () => toast(c.note || (c.name + ' is not ready yet.')) }, c.name, short ? h('small', null, c.note) : null);
      }
      const on = !!st.channels[c.id];
      if (c.note) notes.push(c.name + ': ' + c.note);
      return h('button', { type: 'button', class: 'nt-pill', 'aria-pressed': String(on),
        onclick: () => {
          const chans = { ...st.channels, [c.id]: !on };
          if (!client) return save(applyChannels(st, types, { [c.id]: !on }), { channels: chans });
          /* A client has no preset card and its one type is in no preset, so the pill IS the cell: turning Email on
             turns it on for every type the client has, in the same save. */
          let next = applyChannels(st, types, { [c.id]: !on });
          for (const t of types) next = applyCell(next, types, t.id, c.id, !on);
          save(next, { channels: chans, types: Object.fromEntries(types.map(t => [t.id, next.types[t.id]])) });
        } }, c.name);
    });
    const chanCard = card({ title: 'Also send to', note: 'Nothing leaves Locus until you turn a channel on.' },
      h('div', { class: 'nt-chan' }, h('div', { class: 'nt-pills', role: 'group', 'aria-label': 'Also send to' }, chanPills),
        notes.length ? notes.map(n => h('p', { class: 'nt-why' }, n)) : null));

    /* 3. Customize */
    const offNames = channels.filter(c => c.id !== 'in_app' && !c.always && ready(c.id) && !st.channels[c.id]).map(c => c.name);
    const cellPill = (t, c) => {
      if (c.id === 'in_app' || c.always) return h('span', { class: 'nt-pill locked', 'aria-label': t.name + ': ' + c.name + ', always on' }, CHAN_SHORT.in_app);
      const label = CHAN_SHORT[c.id] || c.name;
      if (!ready(c.id)) return h('button', { type: 'button', class: 'nt-pill', 'aria-pressed': 'false', 'aria-disabled': 'true', 'aria-label': t.name + ': ' + c.name,
        onclick: () => toast(c.note || (c.name + ' is not ready yet.')) }, label);
      if (!st.channels[c.id]) return h('button', { type: 'button', class: 'nt-pill', 'aria-pressed': 'false', 'aria-disabled': 'true', 'aria-label': t.name + ': ' + c.name,
        onclick: () => toast('Turn on ' + c.name + ' above') }, label);
      const on = cellOn(st, t.id, c.id);
      return h('button', { type: 'button', class: 'nt-pill', 'aria-pressed': String(on), 'aria-label': t.name + ': ' + c.name,
        onclick: () => {
          const next = applyCell(st, types, t.id, c.id, !on);
          save(next, { preset: 'custom', types: { [t.id]: next.types[t.id] } });
        } }, label);
    };
    const copyLine = list => {
      const out = [];
      if (list.some(t => t.copy === 'dec5') && !cat.copies_on) out.push('Slack and email copies start Dec 5. Until then they show here in Locus.');
      if (list.some(t => t.copy === 'soon')) out.push('Slack copies are coming soon.');
      return out.length ? h('p', { class: 'nt-copy' }, out.join(' ')) : null;
    };
    const groups = GROUPS.map(([g, title]) => {
      const list = types.filter(t => t.group === g);
      if (!list.length) return null;
      return h('section', { class: 'nt-g', 'aria-label': title }, h('h3', null, title),
        list.map(t => h('div', { class: 'nt-row' }, h('div', null, h('b', null, t.name), t.note ? h('p', null, t.note) : null),
          h('div', { class: 'nt-pills', role: 'group', 'aria-label': t.name }, channels.map(c => cellPill(t, c))))),
        copyLine(list));
    }).filter(Boolean);
    const custom = card({ title: 'Customize', note: offNames.length ? 'Turn on ' + offNames.join(' or ') + ' above to pick it here.' : 'Change one row and the preset becomes Custom.' }, groups);

    put(root, presetCard, chanCard, custom);
  }
  paint();
  put(el, root);
}

export default {
  title: ['How things ', em('reach me')],
  eyebrow: 'Your profile',
  ranges: false,
  load, render,
};
