/* Assets: where the brand's photos and videos live. One link per brand (Google Drive, Dropbox, Air, Frame or any
   link). Locus never copies, reads or stores the files: the button opens their folder.
   Live data (account-health):
     GET /api/brand/assets-link?act=<brand id>   { url, label, kind, at, by, from: 'link' | 'drive' | null }
                                                 from 'drive' = the older Drive folder link, shown until a link is pasted
     PUT /api/brand/assets-link { act, url, label }   url '' removes it
   Client and team both read and change it. Sample mode: _sample/index.json, nothing is sent. */

import { h, button, field, toast, empty, em, put, statusDot, card, addStyles, safeHref } from '../../kit.js';
import { pageHelp } from '../../defs.js';
import { APP_NAME } from '../../config.js';

const KIND = { drive: 'Google Drive', dropbox: 'Dropbox', air: 'Air', frame: 'Frame', box: 'Box', link: 'A link' };
const kindOf = u => /drive\.google|docs\.google/.test(u) ? 'drive' : /dropbox\./.test(u) ? 'dropbox' : /air\.inc/.test(u) ? 'air' : /frame\.io|(^|\/\/)f\.io/.test(u) ? 'frame' : /box\.com/.test(u) ? 'box' : 'link';
const dateOf = iso => { const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? iso + 'T12:00:00' : iso); return t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };

addStyles('lx-as-css', `
.as{display:grid;gap:var(--sp-6);max-width:760px}
.as-help{display:flex;justify-content:flex-end}
.as-one{display:grid;gap:14px;justify-items:start;margin-top:12px}
.as-one dl{display:grid;grid-template-columns:90px minmax(0,1fr);gap:6px 12px;margin:0;font-size:13.5px;width:100%}
.as-one dt{color:var(--muted)}.as-one dd{margin:0;overflow-wrap:anywhere;color:var(--ink-2)}
.as-form{display:grid;gap:12px}
.as-acts{display:flex;gap:10px;flex-wrap:wrap}
.as-err{color:var(--bad);font-size:13px;font-weight:600;margin:0}
`);

let editing = false;
function draw(el, d, ctx) {
  if (!ctx.brand) return put(el, empty({ title: 'Pick a brand', text: 'Assets belong to one brand.' }));
  const A = d && d.url ? d : null;
  const help = h('div', { class: 'as-help' }, pageHelp({ body: [{ title: 'What it is for', text: 'The one link to where this brand\'s photos and videos live: Google Drive, Dropbox, Air, Frame or any link. Anyone on the brand, client or team, can open or change it.' },
    { title: 'Your files stay yours', text: APP_NAME + ' does not copy, read or store the files. The button opens your folder.' }] }));
  const copy = async () => { try { await navigator.clipboard.writeText(A.url); toast('Link copied.'); } catch { toast('The link: ' + A.url, { ms: 9000 }); } };
  if (A && !editing) {
    return put(el, h('div', { class: 'as' }, help,
      card({ title: A.label || 'Photos and videos', note: APP_NAME + ' opens your folder; it never copies the files.', action: h('span', { class: 'lx-chip' }, KIND[A.kind] || KIND.link) },
        h('div', { class: 'as-one' },
          h('dl', null, A.at ? [h('dt', null, 'Added'), h('dd', null, dateOf(A.at))] : null, h('dt', null, 'Link'), h('dd', null, A.url)),
          A.from === 'drive' ? statusDot('warn', 'This is the older Drive folder. Paste the link you use now if it moved.') : null,
          h('div', { class: 'as-acts' }, safeHref(A.url) && button('Open the folder', { primary: true, href: safeHref(A.url), target: '_blank', icon: 'arrow', title: 'Opens the folder in a new tab' }),
            button('Copy link', { ghost: true, onclick: copy }),
            button('Change the link', { ghost: true, onclick: () => { editing = true; draw(el, d, ctx); } }))))));
  }
  const url = field({ label: 'Paste a link to where your photos and videos live (Google Drive, Dropbox, Air, Frame, anything)', type: 'url', inputmode: 'url', placeholder: 'https://', value: A ? A.url : '' });
  const label = field({ label: 'A name for it (optional)', placeholder: 'Brand photos', value: A && A.label ? A.label : '', maxlength: 60 });
  const err = h('p', { class: 'as-err', role: 'alert', hidden: true });
  const save = button('Save', { primary: true, onclick: async () => {
    const u = url.input.value.trim();
    if (!/^https:\/\/\S+\.\S+/.test(u) || u.length > 500) { err.textContent = 'Paste the whole link. It starts with https://'; err.hidden = false; return; }
    err.hidden = true;
    const next = { url: u, label: label.input.value.trim(), kind: kindOf(u), at: new Date().toISOString(), from: 'link' };
    if (ctx.sample) { Object.assign(d, next); editing = false; draw(el, d, ctx); return toast('Sample numbers: saved on this page only.'); }
    save.disabled = true;
    try {
      const r = await ctx.api('/api/brand/assets-link', { worker: 'ah', method: 'PUT', body: { act: ctx.brand.id, url: u, label: next.label } });
      Object.assign(d, next, r && r.kind ? { kind: r.kind } : {});
      editing = false; draw(el, d, ctx); toast('Saved.');
    } catch (e) { save.disabled = false; toast(e.message || 'Not saved. Try again.', { tone: 'bad', ms: 5000 }); }
  } });
  put(el, h('div', { class: 'as' }, help,
    card({ title: A ? 'Change the link' : 'No folder linked yet', note: APP_NAME + ' opens your folder; it never copies the files.' },
      h('div', { class: 'as-form' }, url, label, err, h('div', { class: 'as-acts' }, save, A ? button('Keep the old link', { ghost: true, onclick: () => { editing = false; draw(el, d, ctx); } }) : null)))));
}

export default {
  title: (ctx) => ['Where are ' + (ctx.brand ? ctx.brand.name + "'s" : 'the') + ' ', em('photos and videos?')],
  eyebrow: 'Assets',
  ranges: false,
  async load(ctx) {
    if (!ctx.brand) return null;
    try { return await ctx.api('/api/brand/assets-link?act=' + encodeURIComponent(ctx.brand.id), { worker: 'ah', signal: ctx.signal }); }
    catch (e) { if (e && e.status === 404) return {}; throw e; }
  },
  render(el, d, ctx) { editing = false; draw(el, d || {}, ctx); },
};
