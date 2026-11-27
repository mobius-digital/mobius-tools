/* Send, Edit and Do not send for one waiting client message, done in v5. Shared by Agency > To send and the
   brand Reports page. Every call is the one old Locus makes, with the same body:

   Daily update (brief), what the client gets is the short client post, not the team's long brief:
     GET  /api/brief-client-post?act=&date=          the exact post Send will put in the client channel
     PUT  /api/brief-client-post { act, date, text }  save a hand edit of that post (Edit)
     PUT  /api/brief-client-post { act, date, text: '', reset: true }   back to the built post
     POST /api/brief-send { act, date }               Send: posts in the client channel, as the owner
     POST /api/brief-send { act, date, to: 'team' }   a brand with no client channel: post in its team channel
     POST /api/brief-skip { act, date }               Do not send
   Weekly or monthly report (2026-11-26: a report sends only once "How we read it" is approved; the server refuses
   otherwise, and here Send on an unapproved report opens the brand's Reports page instead):
     GET  /api/report-read?act=&period=&start=        { status: none|points|drafted|approved, read_text, ... } (team only)
     GET  /api/report?act=&period=&start=             the report, for its summary (= the approved read)
     GET  /api/client-post/preview?act=               the weekly post as the client sees it (latest weekly only)
     POST /api/report-send { act, period, start }     Send: posts in the client channel and freezes the report
     POST /api/report-send { act, period, start, to: 'team' }   no client channel: post in the team channel
     POST /api/report-skip { act, period, start }     Do not send
   GET  /api/slack-channels                           the channel's name for the confirm sheet (read once)
   GET  /api/draft-holds?act=                         drafts whose numbers look incomplete (team only):
                                                      { holds: [{ kind, act_id, period, start, reason }] }. A held item
                                                      (item.hold = the reason) shows the reason as one warning line, and
                                                      its Send asks twice. What the client gets is unchanged.

   Sample mode never calls a route: every write is simulated and says so. */

import { h, addStyles, put, button, sheet, toast, statusDot } from '../../kit.js';
import { fixture } from '../../data.js';
import { legacyUrl, APP_NAME } from '../../config.js';
import { short, span } from '../calendar/_cr.js';
import { canWrite } from '../production/_act.js';
import { forgetWaiting } from '../../bell.js';

const SAMPLE_NOTE = 'Sample: nothing was changed';

const CSS = `.sd{display:grid;gap:16px}
.sd-where{margin:0;font-size:14.5px;line-height:1.5;color:var(--ink)}
.sd-note{margin:0;font-size:13px;line-height:1.5;color:var(--muted)}
.sd-hold{margin:0;padding:10px 12px;border-radius:10px;background:var(--warn-bg);color:var(--warn);font-size:14px;line-height:1.5}
.sd-err{margin:0;padding:10px 12px;border-radius:10px;background:var(--bad-bg);color:var(--bad);font-size:14px;line-height:1.5}
.sd-post{margin:0;padding:14px 16px;border-radius:12px;background:var(--bg-sunk);box-shadow:inset 0 0 0 1px var(--line);font-size:14.5px;line-height:1.55;color:var(--ink);white-space:pre-wrap;word-break:break-word;max-height:46vh;overflow:auto}
.sd-post b{font-weight:600}
.sd-lab{margin:0 0 -8px;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.sd-acts{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.sd-ta{min-height:260px;font-size:14.5px}
.sd-old{font-size:13px;color:var(--muted)}
.sd-row{display:inline-flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end}
@media (max-width:759px){
  .sd-acts .lx-btn{min-height:44px;flex:1 1 auto}
  .sd-row{justify-content:flex-start}
  .sd-row .lx-btn{min-height:44px}
}`;
const style = () => addStyles('lx-sd-css', CSS);

/* ---------- what an item is ---------- */
/** item: { kind: 'brief' | 'report', act_id, brand, day, end, period, status } */
const nameOf = i => i.kind === 'brief' ? 'daily update for ' + short(i.day) : (i.period === 'monthly' ? 'monthly report, ' : 'weekly report, ') + span(i.day, i.end);
const Cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const errText = e => (e && e.message) || 'No answer from the server.';

/* ---------- sample data ---------- */
let samplePosts = null;
async function sampleData() {
  if (!samplePosts) samplePosts = fixture('a-to-send/_sample/posts.json').catch(() => ({}));
  return samplePosts;
}
const sampleKey = i => i.kind === 'brief' ? i.act_id + '|' + i.day : i.act_id + '|' + i.period + '|' + i.day;
/* Hand edits made in sample mode live only on this page, so the flow can be clicked through. */
const SAMPLE_EDITS = new Map();

/* ---------- the client channel ---------- */
/** { known, has, id }. known is false when the brand list did not say (the server then decides). */
async function channelOf(i, ctx) {
  if (ctx.sample) {
    const d = await sampleData();
    const ch = (d.channels || {})[i.act_id];
    return { known: ch !== undefined, has: !!ch, id: ch || null, name: ch || null };
  }
  const b = (ctx.brands || []).find(x => x.id === i.act_id);
  if (!b || !('client_channel' in b)) return { known: false, has: true, id: null, name: null };
  return { known: true, has: !!b.client_channel, id: b.client_channel || null, name: null };
}
let chanNames = null;
async function channelName(ch, ctx) {
  if (ch.name) return ch.name;
  if (!ch.id || ctx.sample) return null;
  if (!chanNames) chanNames = ctx.api('/api/slack-channels', { worker: 'ah' })
    .then(r => Object.fromEntries((r.channels || []).map(c => [c.id, c.name])), () => ({}));
  const map = await chanNames;
  return map[ch.id] ? '#' + map[ch.id] : null;
}
/** True when the brand has no client channel, as far as the brand list says. For the row, no waiting. */
export function noChannel(i, ctx, sampleChannels) {
  if (ctx.sample) return !!sampleChannels && sampleChannels[i.act_id] === null;
  const b = (ctx.brands || []).find(x => x.id === i.act_id);
  return !!b && ('client_channel' in b) && !b.client_channel;
}
export async function sampleChannels() { return (await sampleData()).channels || {}; }

/* ---------- How we read it ---------- */
/** The report's read: GET /api/report-read. Sample mode reads the fixture. Throws when the server does not answer. */
export async function readStatusOf(i, ctx, signal) {
  if (ctx.sample) {
    const d = await sampleData();
    return (d.reads || {})[sampleKey(i)] || { status: 'none' };
  }
  const q = `act=${encodeURIComponent(i.act_id)}&period=${encodeURIComponent(i.period)}&start=${encodeURIComponent(i.day)}`;
  const r = await ctx.api('/api/report-read?' + q, { worker: 'ah', signal });
  if (r && r.error) throw new Error(r.error);
  return r || { status: 'none' };
}
/** True when a report may be offered Send: its read is approved and has words. */
export const readApproved = read => !!read && read.status === 'approved' && !!String(read.read_text || '').trim();
/** Open the brand's Reports page, where the read is written and approved. */
export function openReports(i, ctx) {
  const b = (ctx.brands || []).find(x => x.id === i.act_id);
  const r = { view: 'brand', brand: b ? b.slug : undefined, line: 'reports', tab: 'index' };
  if (ctx.go) ctx.go(r); else location.hash = '#/brand/' + encodeURIComponent(r.brand || '') + '/reports/index';
}
/** The sheet for a report whose read is not approved yet: say so and go to the Reports page. */
function needsRead(i, ctx, sh, body, read) {
  const what = read && read.status === 'drafted' ? 'How we read it is written but not approved yet.'
    : read && read.status === 'points' ? 'The talking points are ready. How we read it is written after the call.'
      : 'How we read it is not written yet.';
  put(body,
    h('p', { class: 'sd-where' }, h('b', null, (i.brand || 'This brand') + '. '), what),
    h('p', { class: 'sd-note' }, 'A report goes to the client only with an approved read at the top. Write it and approve it on the Reports page of the brand.'),
    h('div', { class: 'sd-acts' },
      button('Open Reports', { primary: true, large: true, onclick: () => { sh.close(); openReports(i, ctx); } }),
      button('Not now', { ghost: true, large: true, onclick: () => sh.close() })));
}

/* ---------- numbers that look incomplete (drafthold.js on the server) ---------- */
const holdKey = (kind, act, period, day) => kind + '|' + act + '|' + (kind === 'brief' ? 'daily' : period) + '|' + day;
/** The held drafts: a Map of key -> reason. One read, never in sample mode; any failure reads as no holds. */
export async function readHolds(ctx, act, signal) {
  if (ctx.sample || ctx.isClient) return new Map();
  try {
    const r = await ctx.api('/api/draft-holds?act=' + encodeURIComponent(act || 'all'), { worker: 'ah', signal });
    return new Map(((r && r.holds) || []).map(x => [holdKey(x.kind, x.act_id, x.period, x.start), x.reason]));
  } catch (e) { if (e && e.name === 'AbortError') throw e; return new Map(); }
}
/** The reason a waiting item is held, or null. */
export const holdOf = (holds, i) => (holds && holds.get(holdKey(i.kind, i.act_id, i.period, i.day))) || null;
/** The one warning line on a held draft. */
export const holdLine = reason => reason ? (style(), h('p', { class: 'sd-hold' }, reason + '. Check the numbers before this goes to the client.')) : null;
/** A Send that asks twice when the numbers look incomplete: the first tap turns it into "Send anyway".
    Returns true when the click should go on and send. */
export function askTwice(btn, reason, note) {
  if (!reason || btn.dataset.sure === '1') return true;
  btn.dataset.sure = '1';
  btn.textContent = 'Send anyway';
  if (note) put(note, h('p', { class: 'sd-hold' }, reason + '. Tap Send anyway to send it as it is.'));
  return false;
}

/* ---------- reading the text ---------- */
export async function readBrief(i, ctx) {
  if (ctx.sample) {
    const d = await sampleData();
    const text = SAMPLE_EDITS.get(sampleKey(i)) || (d.briefs || {})[sampleKey(i)] || d.brief_default || '';
    return { text, edited: SAMPLE_EDITS.has(sampleKey(i)), sent: i.status === 'sent' };
  }
  return ctx.api(`/api/brief-client-post?act=${encodeURIComponent(i.act_id)}&date=${encodeURIComponent(i.day)}`, { worker: 'ah' });
}
async function readReport(i, ctx, { post = true } = {}) {
  if (ctx.sample) {
    const d = await sampleData();
    const r = (d.reports || {})[sampleKey(i)] || d.report_default || {};
    return { summary: SAMPLE_EDITS.has(sampleKey(i)) ? SAMPLE_EDITS.get(sampleKey(i)) : r.summary || '', post: i.period === 'weekly' ? r.post || null : null };
  }
  const act = encodeURIComponent(i.act_id);
  const rep = await ctx.api(`/api/report?act=${act}&period=${encodeURIComponent(i.period)}&start=${encodeURIComponent(i.day)}`, { worker: 'ah' });
  let text = null;
  /* The exact weekly post is only built for the brand's newest weekly report, so use it only when it is this one. */
  if (post && i.period === 'weekly') {
    try { const p = await ctx.api('/api/client-post/preview?act=' + act, { worker: 'ah' }); if (p && p.weekly && p.weekly.start === i.day) text = p.weekly.text || null; }
    catch { text = null; }
  }
  return { summary: rep.summary || '', post: text };
}

/** Slack text on screen: *bold*, <url|label> as the label. Never HTML from the server. */
export function slackText(t) {
  const out = h('div', { class: 'sd-post' });
  const re = /<([^>|]+)\|([^>]+)>|<([^>]+)>|\*([^*\n]+)\*/g;
  let at = 0, m;
  const s = String(t || '');
  while ((m = re.exec(s))) {
    if (m.index > at) out.append(s.slice(at, m.index));
    if (m[2]) out.append(h('u', null, m[2]));
    else if (m[3]) out.append(m[3]);
    else out.append(h('b', null, m[4]));
    at = re.lastIndex;
  }
  if (at < s.length) out.append(s.slice(at));
  return out;
}
const loading = text => h('p', { class: 'sd-note' }, text || 'Reading it...');
const oldLink = i => {
  const url = legacyUrl(i.kind === 'brief' ? 'brief' : 'reports', i.act_id);
  return url ? h('a', { class: 'sd-old', href: url }, 'Open in old ' + APP_NAME) : null;
};

/** Where it went or goes: the client channel's name ('#name') or null when it cannot be told. Reads only. */
export async function whereOf(i, ctx) {
  try { const ch = await channelOf(i, ctx); return ch.has ? await channelName(ch, ctx) : null; } catch { return null; }
}

/* ---------- Send ---------- */
/** Send: one sheet with where it goes and the exact words, then a second tap sends. */
export async function sendSheet(i, ctx, done) {
  style();
  const body = h('div', { class: 'sd' }, loading());
  const sh = sheet({ title: 'Send the ' + nameOf(i) + '?', side: 'center', body });
  let ch, txt;
  if (i.kind === 'report') {
    let read = null;
    try { read = await readStatusOf(i, ctx); } catch { read = null; }
    if (!readApproved(read)) return needsRead(i, ctx, sh, body, read);
  }
  try {
    ch = await channelOf(i, ctx);
    txt = i.kind === 'brief' ? await readBrief(i, ctx) : await readReport(i, ctx);
  } catch (e) {
    return put(body, h('p', { class: 'sd-err' }, 'Could not read it: ' + errText(e)), h('div', { class: 'sd-acts' }, button('Close', { large: true, onclick: () => sh.close() })), oldLink(i));
  }
  if (i.kind === 'brief' && txt && txt.sent) {
    return put(body, h('p', { class: 'sd-where' }, 'This one was already sent. It cannot be sent again.'), slackText(txt.text), h('div', { class: 'sd-acts' }, button('Close', { large: true, onclick: () => sh.close() })));
  }
  if (ch.known && !ch.has) return teamOnly(i, ctx, sh, body, txt, done);

  const where = await channelName(ch, ctx);
  const brand = i.brand || 'this brand';
  const lines = [
    holdLine(i.hold),
    h('p', { class: 'sd-where' }, h('b', null, brand + '. '), 'Posts in the client\'s channel' + (where ? ', ' + where : '') + ', under your name. Everyone in that channel sees it.'),
  ].filter(Boolean);
  if (i.kind === 'brief') {
    lines.push(h('p', { class: 'sd-lab' }, 'What the client gets'), slackText(txt.text || ''), h('p', { class: 'sd-note' }, 'The full numbers go in one reply under it.' + (txt.edited ? ' This post was edited by hand.' : '')));
  } else {
    if (txt.post) lines.push(h('p', { class: 'sd-lab' }, 'What the client gets'), slackText(txt.post));
    else lines.push(h('p', { class: 'sd-note' }, 'The post opens with how we read it, then the numbers, the platforms and a link to the full report. It is built when it sends.'));
    if (txt.summary && !txt.post) lines.push(h('p', { class: 'sd-lab' }, 'How we read it'), slackText(txt.summary));
    lines.push(h('p', { class: 'sd-note' }, 'Once sent, the report is frozen for good.'));
  }
  const err = h('div');
  const go = button('Send it now', { primary: true, large: true });
  const edit = button('Edit first', { large: true, onclick: () => { sh.close(); if (i.kind === 'report') openReports(i, ctx); else editSheet(i, ctx, done); } });
  const back = button('Not now', { ghost: true, large: true, onclick: () => sh.close() });
  if (i.kind === 'brief' && !String(txt.text || '').trim()) go.disabled = true;
  go.addEventListener('click', async () => {
    /* numbers that look incomplete: the first tap only asks again */
    if (!askTwice(go, i.hold, err)) return;
    go.disabled = edit.disabled = back.disabled = true;
    put(err);
    try {
      if (ctx.sample) { toast(SAMPLE_NOTE); sh.close(); done && done('sent'); return; }
      const r = i.kind === 'brief'
        ? await ctx.api('/api/brief-send', { worker: 'ah', method: 'POST', body: { act: i.act_id, date: i.day } })
        : await ctx.api('/api/report-send', { worker: 'ah', method: 'POST', body: { act: i.act_id, period: i.period, start: i.day } });
      if (r && r.error) throw new Error(r.error);
      forgetWaiting(); sh.close();
      toast('Sent to ' + brand + (where ? ', ' + where : ''));
      done && done('sent');
    } catch (e) {
      go.disabled = edit.disabled = back.disabled = false;
      put(err, h('p', { class: 'sd-err' }, 'Not sent: ' + errText(e)));
    }
  });
  put(body, ...lines, err, h('div', { class: 'sd-acts' }, go, edit, back), oldLink(i));
}

/** A brand with no client channel: say so plainly. The one thing it can do is post in its own team channel. */
function teamOnly(i, ctx, sh, body, txt, done) {
  const err = h('div');
  const team = button('Post in the team channel', { large: true });
  const close = button('Close', { ghost: true, large: true, onclick: () => sh.close() });
  team.addEventListener('click', async () => {
    team.disabled = close.disabled = true;
    put(err);
    try {
      if (ctx.sample) { toast(SAMPLE_NOTE); sh.close(); return; }
      const r = i.kind === 'brief'
        ? await ctx.api('/api/brief-send', { worker: 'ah', method: 'POST', body: { act: i.act_id, date: i.day, to: 'team' } })
        : await ctx.api('/api/report-send', { worker: 'ah', method: 'POST', body: { act: i.act_id, period: i.period, start: i.day, to: 'team' } });
      if (r && r.error) throw new Error(r.error);
      forgetWaiting(); sh.close(); toast('Posted in the team channel');
    } catch (e) {
      team.disabled = close.disabled = false;
      put(err, h('p', { class: 'sd-err' }, 'Not posted: ' + errText(e)));
    }
  });
  const text = i.kind === 'brief' ? txt.text : txt.post || txt.summary;
  put(body,
    h('p', { class: 'sd-where' }, h('b', null, (i.brand || 'This brand') + ' has no client channel. '), 'Nothing can go to the client from here. Set a client channel in the brand\'s settings first.'),
    h('p', { class: 'sd-note' }, 'You can post it in the brand\'s own team channel instead. The client does not see that.'),
    text ? slackText(text) : null, err, h('div', { class: 'sd-acts' }, team, close), oldLink(i));
}

/* ---------- Edit ---------- */
/** Edit: the words in a box. Save writes them through the old app's route, then the Send sheet opens. */
export async function editSheet(i, ctx, done) {
  style();
  /* A report's words are "How we read it", written and approved on the brand's Reports page. */
  if (i.kind === 'report') return openReports(i, ctx);
  const body = h('div', { class: 'sd' }, loading());
  const sh = sheet({ title: (i.kind === 'brief' ? 'Edit the client post, ' : 'Edit the summary, ') + (i.brand || ''), side: 'center', body });
  let txt;
  try { txt = i.kind === 'brief' ? await readBrief(i, ctx) : await readReport(i, ctx, { post: false }); }
  catch (e) { return put(body, h('p', { class: 'sd-err' }, 'Could not read it: ' + errText(e)), h('div', { class: 'sd-acts' }, button('Close', { large: true, onclick: () => sh.close() })), oldLink(i)); }
  if (i.kind === 'brief' && txt.sent) return put(body, h('p', { class: 'sd-where' }, 'This one was already sent, so it is a record of what the client got.'), slackText(txt.text), oldLink(i));
  if (i.kind === 'brief' && txt.editable === false) return put(body, h('p', { class: 'sd-where' }, 'This brand has no client channel, so there is no client post to edit.'), h('div', { class: 'sd-acts' }, button('Close', { large: true, onclick: () => sh.close() })), oldLink(i));

  const ta = h('textarea', { class: 'lx-input sd-ta', 'aria-label': i.kind === 'brief' ? 'The client post' : 'The report summary' });
  ta.value = i.kind === 'brief' ? txt.text || '' : txt.summary || '';
  const err = h('div');
  const save = button('Save, then send', { primary: true, large: true });
  const only = button('Save only', { large: true });
  const cancel = button('Cancel', { ghost: true, large: true, onclick: () => sh.close() });
  const reset = i.kind === 'brief' && txt.edited ? button('Back to the numbers', { ghost: true, large: true }) : null;
  const all = [save, only, cancel, reset].filter(Boolean);
  const lock = on => all.forEach(b => { b.disabled = on; });

  const write = async (text, { resetIt = false } = {}) => {
    if (ctx.sample) {
      if (resetIt) SAMPLE_EDITS.delete(sampleKey(i)); else SAMPLE_EDITS.set(sampleKey(i), text);
      toast(SAMPLE_NOTE);
      return;
    }
    if (i.kind === 'brief') await ctx.api('/api/brief-client-post', { worker: 'ah', method: 'PUT', body: resetIt ? { act: i.act_id, date: i.day, text: '', reset: true } : { act: i.act_id, date: i.day, text } }).then(r => { if (r && r.error) throw new Error(r.error); });
    else await ctx.api('/api/report-summary', { worker: 'ah', method: 'PUT', body: { act: i.act_id, period: i.period, start: i.day, summary: text } }).then(r => { if (r && r.error) throw new Error(r.error); });
  };
  const run = async (then, opts) => {
    const text = ta.value;
    if (i.kind === 'brief' && !opts && !text.trim()) { put(err, h('p', { class: 'sd-err' }, 'The post cannot be empty.')); return; }
    lock(true); put(err);
    try {
      await write(text, opts);
      sh.close();
      if (!ctx.sample) toast(opts && opts.resetIt ? 'Back to the numbers' : 'Saved');
      done && done('edited', opts && opts.resetIt ? null : text);
      if (then) sendSheet(i, ctx, done);
    } catch (e) {
      lock(false);
      put(err, h('p', { class: 'sd-err' }, 'Not saved: ' + errText(e)));
    }
  };
  save.addEventListener('click', () => run(true));
  only.addEventListener('click', () => run(false));
  if (reset) reset.addEventListener('click', () => run(false, { resetIt: true }));
  put(body,
    h('p', { class: 'sd-note' }, i.kind === 'brief'
      ? 'This is what the client gets, word for word. The numbers reply under it stays as it is.'
      : 'This is the summary on the full report page the post links to. The Slack post itself is built from the numbers.'),
    ta, err, h('div', { class: 'sd-acts' }, save, only, reset, cancel));
  setTimeout(() => { try { ta.focus(); } catch {} }, 30);
}

/* ---------- Do not send ---------- */
/** Do not send: a check, then the one skip route for this row. Never a bulk route. Nothing is deleted. */
export function skipSheet(i, ctx, done) {
  style();
  const err = h('div');
  const go = button('Do not send', { primary: true, large: true });
  const no = button('Keep it', { large: true });
  const sh = sheet({ title: 'Do not send this one?', side: 'center', body: h('div', { class: 'sd' },
    h('p', { class: 'sd-where' }, h('b', null, Cap(nameOf(i)) + ' for ' + (i.brand || 'this brand') + '. '), 'This one will not go to the client. Nothing is deleted.'),
    err, h('div', { class: 'sd-acts' }, go, no)) });
  no.addEventListener('click', () => sh.close());
  go.addEventListener('click', async () => {
    go.disabled = no.disabled = true; put(err);
    try {
      if (ctx.sample) { toast(SAMPLE_NOTE); sh.close(); done && done('skipped'); return; }
      const r = i.kind === 'brief'
        ? await ctx.api('/api/brief-skip', { worker: 'ah', method: 'POST', body: { act: i.act_id, date: i.day } })
        : await ctx.api('/api/report-skip', { worker: 'ah', method: 'POST', body: { act: i.act_id, period: i.period, start: i.day } });
      if (r && r.error) throw new Error(r.error);
      forgetWaiting(); sh.close(); toast('Marked Do not send'); done && done('skipped');
    } catch (e) {
      go.disabled = no.disabled = false;
      put(err, h('p', { class: 'sd-err' }, 'Not saved: ' + errText(e)));
    }
  });
}

/* ---------- the three buttons on a row ---------- */
/** Send, Edit, Do not send for one waiting item. Team only: a client or "See as client" gets nothing.
    opts: { canSkip, noChannel, read, dots }. dots: false leaves the state words out (the row shows them in its Status cell). read: a report's read ({ status, read_text } from /api/report-read, or null
    when it was not read). A report whose read is not approved offers "Needs how we read it", which opens the
    brand's Reports page, instead of Send and Edit. */
export function actions(i, ctx, done, { canSkip = true, noChannel: none = false, read, dots = true } = {}) {
  if (!canWrite(ctx)) return null;
  style();
  const stop = fn => e => { if (e) e.stopPropagation(); fn(); };
  if (i.kind === 'report' && !readApproved(read)) return h('span', { class: 'sd-row' },
    dots ? statusDot('warn', read && read.status === 'drafted' ? 'Read needs approval' : 'Needs how we read it') : null,
    button('Open Reports', { primary: true, onclick: stop(() => openReports(i, ctx)) }),
    canSkip ? button('Do not send', { ghost: true, onclick: stop(() => skipSheet(i, ctx, done)) }) : null);
  return h('span', { class: 'sd-row' },
    none && dots ? statusDot('off', 'No client channel') : null,
    button(none ? 'Team post' : 'Send', { primary: !none, onclick: stop(() => sendSheet(i, ctx, done)) }),
    button('Edit', { onclick: stop(() => editSheet(i, ctx, done)) }),
    canSkip ? button('Do not send', { ghost: true, onclick: stop(() => skipSheet(i, ctx, done)) }) : null);
}
