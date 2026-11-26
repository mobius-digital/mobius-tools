/* THE HOUSE STYLE (2026-11-26): one layout for every Slack message Locus composes. Fixed in code; nothing here is a
 * setting and nobody can change it per person.
 *
 *   1. A bold header (Block Kit header, plain text, at most 150 characters): what it is about, brand and subject.
 *   2. At most one short summary line (at most 200 characters). For an ask: the tagged person and the one thing to do.
 *   3. A numbers row when numbers apply: up to three cells (Since last check-in, Today, This week, or the period that fits).
 *   4. An optional list: at most 5 bullet lines, then "and N more in Locus".
 *   5. An optional image (a Slack file id or a URL; never a GIF).
 *   6. A small gray context line: source and time ("Triple Whale · 2:00pm CT").
 *   7. At most one divider and at most one row of buttons (at most 5).
 *   8. No emoji in the header or summary, no GIFs, no colored bar unless the color means status (good / warn / bad).
 *      No em or en dashes anywhere.
 *   9. The notification text is the header plus the summary.
 *  10. A message a person wrote (a call recap, "what we did", a welcome) is not a card: personNote() only strips
 *      dashes and caps the length.
 *
 * Block order: header, summary, numbers, lines, image, divider (only when numbers and lines or an image are both there),
 * context, actions. With a status, everything after the header goes inside one attachment of that color. */

export const STATUS_COLOR = { good: '#2EB67D', warn: '#ECB22E', bad: '#E01E5A' };
export const LIMITS = { header: 150, summary: 200, section: 3000, button: 75, buttons: 5, numbers: 4, lines: 5 };

/** Tests set this to make a broken input throw; in the worker a broken input is repaired instead. */
export const HOUSE = { strict: false };

export const noDash = s => String(s ?? '').replace(/\s*[—–]\s*/g, ', ');
/* Unicode emoji and :shortcodes: (Slack turns ":bar_chart:" into a picture). Plain symbols like · stay. */
const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic})|[\u{1F3FB}-\u{1F3FF}])*️?/gu;
const SHORTCODE = /:[a-z][a-z0-9_+-]+:/gi;
export const noEmoji = s => String(s ?? '').replace(EMOJI, '').replace(SHORTCODE, '').replace(/️/g, '');
const squash = s => String(s ?? '').replace(/\s+/g, ' ').trim();
/* Slack mrkdwn to plain words: tags out, link labels kept, bold and italics marks out, entities back. */
export const plainOf = s => squash(String(s ?? '').replace(/<@[A-Z0-9]+>/g, '').replace(/<!(here|channel|everyone)>/g, '')
  .replace(/<([^|>]+)\|([^>]+)>/g, '$2').replace(/<(https?:[^>]+)>/g, '$1').replace(/(^|[\s(])[*_~]+|[*_~]+(?=[\s).,:;!?]|$)/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

/** Cut to n characters on a word, without leaving half a Slack link or tag behind. */
export function clip(s, n) {
  const t = String(s ?? '');
  if (t.length <= n) return t;
  let c = t.slice(0, Math.max(0, n - 3));
  const open = c.lastIndexOf('<');
  if (open > c.lastIndexOf('>')) c = c.slice(0, open);
  c = c.replace(/\s+\S*$/, '') || c;
  return `${c.trimEnd()}...`;
}

const CT = 'America/Chicago';
const dayKey = d => d.toLocaleDateString('en-CA', { timeZone: CT });
/** "2:00pm CT" today (Central), else "Nov 26, 2:00pm CT". `now` is for tests. */
export function houseTime(at, now = new Date()) {
  if (at == null || at === '') return '';
  const d = at instanceof Date ? at : new Date(at);
  if (isNaN(d)) return '';
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: CT }).replace(/\s?(AM|PM)$/i, m => m.trim().toLowerCase());
  if (dayKey(d) === dayKey(now)) return `${t} CT`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: CT })}, ${t} CT`;
}

const broken = msg => { if (HOUSE.strict) throw new Error(`houseMessage: ${msg}`); };
const isGif = img => /\.gif(\?|#|$)/i.test(String(img?.url || img?.image_url || '')) || /gif/i.test(String(img?.mimetype || ''));

/* One row of buttons. A repeated action_id would make Slack refuse the block; link buttons (noop_open) get a
   numbered id (noop_open_2), which the Slack actions route already acknowledges. Another repeated id is a caller bug:
   strict mode (tests) throws; in the worker the first button stays and the repeat is dropped. */
function buttonRow(buttons) {
  const els = [], ids = new Set();
  for (const b of (buttons || []).filter(Boolean)) {
    if (els.length >= LIMITS.buttons) { broken('more than 5 buttons'); break; }
    const el = b.type === 'button' ? { ...b } : {
      type: 'button', action_id: b.action_id || 'noop_open',
      text: { type: 'plain_text', text: String(b.label || b.text || 'Open') },
      ...(b.url ? { url: b.url } : {}), ...(b.value != null ? { value: String(b.value) } : {}),
      ...(b.style === 'primary' || b.style === 'danger' ? { style: b.style } : {}),
      ...(b.confirm ? { confirm: b.confirm } : {}),
    };
    el.text = { ...el.text, type: 'plain_text', text: clip(noEmoji(noDash(el.text?.text || 'Open')).trim() || 'Open', LIMITS.button) };
    let id = el.action_id || 'noop_open';
    if (ids.has(id)) {
      if (!/^noop_open/.test(id)) { broken(`duplicate action_id ${id}`); continue; }
      let k = 2; while (ids.has(`noop_open_${k}`)) k++; id = `noop_open_${k}`;
    }
    ids.add(id); el.action_id = id;
    els.push(el);
  }
  return els.length ? { type: 'actions', elements: els } : null;
}

/** Build one Locus Slack message. Returns { text, blocks, attachments? }. */
/* `maxNumbers` (2026-11-26, the client daily thread): a caller with one cell per ad channel may allow up to 10 cells, Slack's
   cap on a section's fields. Left out, the cap stays 4 and every other message is byte-identical. */
export function houseMessage({ title, summary, tag, numbers, lines, image, source, at, context, buttons, status, now, maxNumbers } = {}) {
  let head = squash(noEmoji(noDash(plainOf(title))));
  if (!head) { broken('a title is required'); head = squash(noEmoji(noDash(plainOf(summary)))) || 'Locus'; }
  head = clip(head, LIMITS.header);

  const tags = (Array.isArray(tag) ? tag : tag ? [tag] : []).map(t => String(t).trim()).filter(Boolean)
    .map(t => (/^[UW][A-Z0-9]{6,}$/.test(t) ? `<@${t}>` : t));
  const sum = clip(squash(noEmoji(noDash(summary))), LIMITS.summary);
  const sumLine = [tags.join(' '), sum].filter(Boolean).join('  ');

  const after = [];
  if (sumLine) after.push({ type: 'section', text: { type: 'mrkdwn', text: sumLine } });

  const nums = (numbers || []).filter(n => n && (n.label || n.value != null));
  const cap = maxNumbers > 0 ? Math.min(10, Math.floor(maxNumbers)) : LIMITS.numbers;
  if (nums.length > cap) broken(`more than ${cap} numbers`);
  const cells = nums.slice(0, cap).map(n => ({ type: 'mrkdwn',
    text: clip(noDash(`*${squash(n.label)}*\n${String(n.value ?? '').trim()}${n.note ? ` · ${squash(n.note)}` : ''}`), 2000) }));
  if (cells.length) after.push({ type: 'section', fields: cells });

  const list = (lines || []).map(l => squash(noDash(l))).filter(Boolean);
  if (list.length) {
    const shown = list.slice(0, LIMITS.lines).map(l => `• ${l}`);
    if (list.length > LIMITS.lines) shown.push(`_and ${list.length - LIMITS.lines} more in Locus_`);
    after.push({ type: 'section', text: { type: 'mrkdwn', text: clip(shown.join('\n'), LIMITS.section - 100) } });
  }

  let img = null;
  if (image && (image.slack_file_id || image.url || image.image_url)) {
    if (isGif(image)) broken('a GIF image');
    else img = { type: 'image', ...(image.slack_file_id ? { slack_file: { id: image.slack_file_id } } : { image_url: image.url || image.image_url }),
      alt_text: clip(squash(noDash(image.alt || head)), 1900) };
  }
  if (img) after.push(img);
  if (cells.length && (list.length || img)) after.push({ type: 'divider' });

  const when = houseTime(at, now || new Date());
  const ctx = [source, when, context].map(x => squash(noDash(x))).filter(Boolean).join(' · ');
  if (ctx) after.push({ type: 'context', elements: [{ type: 'mrkdwn', text: clip(ctx, 2900) }] });

  const row = buttonRow(buttons);
  if (row) after.push(row);

  const header = { type: 'header', text: { type: 'plain_text', text: head } };
  const sumPlain = plainOf(sum);
  const text = clip(sumPlain ? `${head}${/[.!?]$/.test(head) ? '' : '.'} ${sumPlain}` : head, 3000);
  if (status && !STATUS_COLOR[status]) broken(`unknown status ${status}`);
  if (status && STATUS_COLOR[status]) return { text, blocks: [header], attachments: [{ color: STATUS_COLOR[status], blocks: after }] };
  return { text, blocks: [header, ...after] };
}

/** Plain text a person wrote: only dashes out and a length cap. */
export function personNote(text, max = 3900) { return clip(noDash(text), max); }

/** The problems with a message, [] when it follows the house style. */
export function houseLint(msg) {
  const out = [];
  const m = msg || {};
  const all = [...(m.blocks || []), ...((m.attachments || []).flatMap(a => a.blocks || []))];
  const count = t => all.filter(b => b.type === t).length;
  if (count('divider') > 1) out.push('more than one divider');
  if (count('actions') > 1) out.push('more than one row of buttons');
  const h = (m.blocks || []).find(b => b.type === 'header');
  if (!h) out.push('no header');
  if (h) {
    const t = String(h.text?.text || '');
    if (t.length > LIMITS.header) out.push('header over 150 characters');
    if (noEmoji(t) !== t) out.push('emoji in the header');
  }
  for (const b of all) {
    if (b.type === 'section' && b.text && String(b.text.text || '').length > LIMITS.section) out.push('a section over 3000 characters');
    if (b.type === 'image' && isGif(b)) out.push('a GIF');
    if (b.type === 'actions') {
      if ((b.elements || []).length > LIMITS.buttons) out.push('more than 5 buttons');
      for (const e of b.elements || []) if (String(e.text?.text || '').length > LIMITS.button) out.push('a button label over 75 characters');
    }
  }
  const colors = Object.values(STATUS_COLOR);
  for (const a of m.attachments || []) if (a.color && !colors.includes(a.color)) out.push('a colored bar that is not a status');
  if (/[—–]/.test(JSON.stringify(m))) out.push('an em or en dash');
  return out;
}
