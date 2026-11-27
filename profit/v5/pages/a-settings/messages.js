/* Agency settings > Messages (2026-11-26). Every message Locus sends, grouped: who gets it, when, why, who it comes
   from (Locus or the owner, per the Sending setting), its status from the automation decisions (keep, move, off after
   Dec 2, parked), "Not on the house style yet" when its code does not build it with the house renderer, and the
   example drawn as a Slack style preview of its Block Kit.
   Real mode: account-health GET /api/messages/catalog (owner only; the worker answers 403 to anyone else).
   Sample mode (?sample=1): _sample/messages.json, written by account-health/worker/test-catalog.mjs --write-sample.
   Read only: nothing on this page saves or sends. */

import { put } from '../../kit.js';
import { h, em, empty, pill, addStyles } from '../../kit.js';
import { APP_NAME } from '../../config.js';

const TONE = { keep: 'good', move: '', 'off after Dec 2': 'bad', parked: '' };
const WORD = { keep: 'Keep', move: 'Moves to Locus', 'off after Dec 2': 'Off after Dec 2', parked: 'Parked' };
const BAR = { '#2EB67D': 'good', '#ECB22E': 'warn', '#E01E5A': 'bad' };

/* ---------- Slack mrkdwn to nodes (no HTML is parsed: text only) ---------- */
const TOKEN = /<([^>]+)>|\*([^*\n]+)\*|(^|[\s(])_([^_\n]+)_(?=[\s).,:;!?]|$)/g;
function inline(text) {
  const out = [];
  const s = String(text || '').replace(/&lt;/g, '‹').replace(/&gt;/g, '›').replace(/&amp;/g, '&');
  let last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(s))) {
    const pre = m[3] || '';
    out.push(s.slice(last, m.index) + pre);
    if (m[1] != null) {
      const inner = m[1];
      if (/^@[UW]/.test(inner)) out.push(h('span', { class: 'ms-tag' }, '@teammate'));
      else if (/^#C/.test(inner)) out.push(h('span', { class: 'ms-tag' }, '#' + (inner.split('|')[1] || 'channel')));
      else if (/^!(here|channel|everyone)/.test(inner)) out.push(h('span', { class: 'ms-tag' }, '@' + inner.slice(1)));
      else out.push(h('span', { class: 'ms-link' }, inner.includes('|') ? inner.split('|').slice(1).join('|') : inner));
    } else if (m[2] != null) out.push(h('b', null, m[2]));
    else if (m[4] != null) out.push(h('i', null, m[4]));
    last = TOKEN.lastIndex;
  }
  out.push(s.slice(last));
  return out.map(x => (typeof x === 'string' ? x.replace(/‹/g, '<').replace(/›/g, '>') : x)).filter(x => x !== '');
}
const mrkdwn = (text, cls) => h('div', { class: cls || 'ms-md' }, String(text || '').split('\n').flatMap((l, i) => (i ? [h('br'), ...inline(l)] : inline(l))));
const textOf = t => (t && typeof t === 'object' ? t.text : t) || '';

function block(b) {
  if (!b || !b.type) return null;
  if (b.type === 'header') return h('div', { class: 'ms-h' }, textOf(b.text));
  if (b.type === 'section') {
    const kids = [];
    if (b.text) kids.push(mrkdwn(textOf(b.text)));
    if (b.fields) kids.push(h('div', { class: 'ms-fields' }, b.fields.map(f => mrkdwn(textOf(f), 'ms-md ms-f'))));
    return h('div', { class: 'ms-s' }, kids);
  }
  if (b.type === 'context') return h('div', { class: 'ms-c' }, (b.elements || []).map(e => (e.type === 'image' ? null : mrkdwn(textOf(e), 'ms-md ms-ci'))));
  if (b.type === 'divider') return h('hr', { class: 'ms-d' });
  if (b.type === 'image') return h('div', { class: 'ms-img', role: 'img', 'aria-label': b.alt_text || 'picture' }, h('span', null, b.alt_text || 'Picture'));
  if (b.type === 'actions') return h('div', { class: 'ms-a' }, (b.elements || []).map(e => h('span', { class: 'ms-btn' + (e.style === 'primary' ? ' p' : e.style === 'danger' ? ' x' : '') }, textOf(e.text) || 'Open')));
  if (b.type === 'markdown') return mrkdwn(b.text);
  return null;
}

/** A Slack style preview of one Block Kit message: the sender line, the blocks, and the status bar when there is one. */
export function slackPreview(msg, { from = APP_NAME, app = true, time = '2:10 PM' } = {}) {
  if (!msg) return h('div', { class: 'ms-pv ms-none' }, 'No example.');
  const top = h('div', { class: 'ms-top' }, h('span', { class: 'ms-av' + (app ? ' app' : '') }, String(from || '?').slice(0, 1).toUpperCase()),
    h('b', null, from), app ? h('span', { class: 'ms-app' }, 'APP') : null, h('span', { class: 'ms-tm' }, time));
  const att = (msg.attachments || []).map(a => h('div', { class: 'ms-att ' + (BAR[String(a.color || '').toUpperCase()] || 'plain') },
    (a.blocks || []).map(block)));
  return h('div', { class: 'ms-pv' }, top, h('div', { class: 'ms-body' }, (msg.blocks || []).map(block), att));
}

function entryCard(e, person) {
  const fromLabel = e.fromLabel || (e.from === 'cole' ? person : e.from === 'locus' ? APP_NAME : 'Set per message');
  const chips = h('div', { class: 'ms-chips' },
    pill(TONE[e.status] || '', WORD[e.status] || e.status),
    e.onRenderer ? null : h('span', { class: 'lx-pill ms-off' }, 'Not on the house style yet'));
  const fact = (k, v) => h('div', { class: 'ms-fact' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
  return h('article', { class: 'ms-e', id: 'msg-' + e.id },
    h('div', { class: 'ms-meta' },
      h('div', { class: 'ms-name' }, h('b', null, e.name), chips),
      h('p', { class: 'ms-why' }, e.why),
      h('div', { class: 'ms-facts' },
        fact('Who gets it', e.who),
        fact('Where', e.channel),
        fact('When', e.when),
        fact('Comes from', fromLabel + (e.kindLabel ? ` (${e.kindLabel})` : '')),
        fact('Code', (e.where || []).join(', ') + (e.audit ? ` · ${e.audit}` : '')))),
    h('div', { class: 'ms-ex' }, h('span', { class: 'lx-cap' }, 'Example, made up numbers'),
      slackPreview(e.example, { from: fromLabel === person ? person : APP_NAME, app: e.from !== 'cole' })));
}

function render(el, data, ctx) {
  addStyles('ms-css', CSS);
  if (!data || data.denied || (!ctx.sample && ctx.role !== 'owner')) return put(el, empty({ title: 'Only the owner can see this page', text: 'It lists every message ' + APP_NAME + ' sends and who it comes from.' }));
  if (data.error) return put(el, empty({ title: 'The message list did not answer', text: 'Try again in a minute.' }));
  const entries = data.entries || [];
  if (!entries.length) return put(el, empty({ title: 'No messages listed', text: 'The catalog is empty.' }));
  const person = data.person || 'You';
  const state = { status: 'all', off: false };
  const statuses = data.statuses || ['keep', 'move', 'off after Dec 2', 'parked'];
  const c = data.counts || {};
  const list = h('div', { class: 'ms-list' });
  const paint = () => {
    const shown = entries.filter(e => (state.status === 'all' || e.status === state.status) && (!state.off || !e.onRenderer));
    const groups = (data.groups || [...new Set(entries.map(e => e.group))]).map(g => ({ g, rows: shown.filter(e => e.group === g) })).filter(x => x.rows.length);
    list.replaceChildren(...(groups.length ? groups.map(({ g, rows }) => h('section', { class: 'ms-g' },
      h('div', { class: 'lx-sec' }, h('h3', null, g), h('span', { class: 'note' }, `${rows.length} message${rows.length === 1 ? '' : 's'}`)),
      rows.map(e => entryCard(e, person)))) : [empty({ title: 'Nothing matches', text: 'Pick another filter.' })]));
  };
  const btn = (label, n, on, pick) => h('button', { type: 'button', class: 'ms-fb' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: pick }, label, h('span', { class: 'n' }, String(n)));
  const filters = h('div', { class: 'ms-filters' });
  const paintFilters = () => filters.replaceChildren(
    btn('All', entries.length, state.status === 'all', () => { state.status = 'all'; paintFilters(); paint(); }),
    ...statuses.map(s => btn(WORD[s] || s, c[s] ?? entries.filter(e => e.status === s).length, state.status === s, () => { state.status = s; paintFilters(); paint(); })),
    btn('Not on the house style', c.notOnRenderer ?? entries.filter(e => !e.onRenderer).length, state.off, () => { state.off = !state.off; paintFilters(); paint(); }));
  paintFilters(); paint();
  const intro = h('p', { class: 'ms-intro' }, `Every message ${APP_NAME} sends: Slack posts, DMs, client posts, emails and creator Discord posts. A check in the code fails when a new send, or a new edit of a sent message, is added without a line here. Who it comes from follows Agency settings > Sending and notifications.`);
  put(el, h('div', { class: 'ms' }, intro, filters, list));
}

export default {
  title: ['What does ', em(APP_NAME + ' send, and why?')],
  eyebrow: 'Agency settings',
  ranges: false,
  stamp: false,                  /* a form or a conversation, not numbers: no "updated" stamp in the head */
  async load(ctx) {
    if (ctx.role !== 'owner') return { denied: true };
    try { return await ctx.api('/api/messages/catalog', { worker: 'ah', signal: ctx.signal }); }
    catch (e) { if (e && e.name === 'AbortError') throw e; return /403|owner/i.test(String(e && (e.status || e.message))) ? { denied: true } : { error: true }; }
  },
  render,
};

const CSS = `
.ms{display:grid;gap:var(--sp-4,16px);min-width:0}
.ms-intro{font-size:13.5px;line-height:1.5;color:var(--ink-2);max-width:760px}
.ms-filters{display:flex;flex-wrap:wrap;gap:6px}
.ms-fb{font:inherit;font-size:12.5px;font-weight:500;padding:6px 11px;border-radius:999px;border:0;background:var(--surface);color:var(--ink-2);box-shadow:inset 0 0 0 1px var(--line-strong);cursor:pointer}
.ms-fb.on{background:var(--ink);color:var(--surface);box-shadow:none}
.ms-fb .n{margin-left:6px;font-weight:600;opacity:.6;font-variant-numeric:tabular-nums}
.ms-list{display:grid;gap:28px;min-width:0}
.ms-g{display:grid;gap:12px;min-width:0}
.ms-e{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:16px 24px;padding:18px 20px;border-radius:14px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line);min-width:0}
.ms-meta{display:grid;gap:8px;align-content:start;min-width:0}
.ms-name{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.ms-name b{font-size:15px;font-weight:600;letter-spacing:-.01em}
.ms-chips{display:flex;flex-wrap:wrap;gap:6px}
.lx-pill.ms-off{background:var(--warn-bg);color:var(--warn)}
.ms-why{font-size:13px;line-height:1.45;color:var(--ink-2)}
.ms-facts{display:grid;gap:4px;font-size:12.5px;line-height:1.4}
.ms-fact{display:grid;grid-template-columns:92px minmax(0,1fr);gap:8px}
.ms-fact .k{color:var(--muted)}
.ms-fact .v{color:var(--ink-2);overflow-wrap:anywhere}
.ms-ex{display:grid;gap:6px;align-content:start;min-width:0}
.ms-pv{border-radius:12px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);padding:12px 14px;font-size:13px;line-height:1.45;color:var(--ink);min-width:0;overflow-wrap:anywhere}
.ms-pv.ms-none{color:var(--muted)}
.ms-top{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.ms-av{width:20px;height:20px;border-radius:5px;background:var(--ink-2);color:var(--surface);font-size:11px;font-weight:700;display:grid;place-items:center;flex:none}
.ms-av.app{background:var(--ink)}
.ms-top b{font-size:13.5px}
.ms-app{font-size:9.5px;font-weight:600;color:var(--muted);background:var(--bg-sunk);border-radius:3px;padding:0 4px}
.ms-tm{font-size:11.5px;color:var(--muted)}
.ms-body{display:grid;gap:6px;min-width:0}
.ms-h{font-size:15px;font-weight:700;line-height:1.3}
.ms-s{display:grid;gap:6px}
.ms-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 16px}
.ms-c{font-size:11.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 10px}
.ms-d{border:0;border-top:1px solid var(--line-strong);margin:2px 0;width:100%}
.ms-img{height:96px;border-radius:8px;background:var(--bg-sunk);display:grid;place-items:center;font-size:11.5px;color:var(--muted);padding:8px;text-align:center}
.ms-a{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.ms-btn{font-size:12px;font-weight:600;padding:4px 11px;border-radius:999px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-strong);color:var(--ink)}
.ms-btn.p{box-shadow:inset 0 0 0 1.5px var(--good);color:var(--good)}
.ms-btn.x{box-shadow:inset 0 0 0 1.5px var(--bad);color:var(--bad)}
.ms-tag{color:#1D6FA5;background:rgba(29,111,165,.1);border-radius:3px;padding:0 2px}
.ms-link{color:#1D6FA5}
.ms-att{display:grid;gap:6px;padding-left:12px;border-left:4px solid var(--line-strong)}
.ms-att.good{border-left-color:#2EB67D}
.ms-att.warn{border-left-color:#ECB22E}
.ms-att.bad{border-left-color:#E01E5A}
@media (max-width:860px){.ms-e{grid-template-columns:minmax(0,1fr);padding:16px}}
@media (max-width:400px){.ms-fields{grid-template-columns:minmax(0,1fr)}.ms-fact{grid-template-columns:minmax(0,1fr);gap:0}.ms-e{padding:14px 12px}}
`;
