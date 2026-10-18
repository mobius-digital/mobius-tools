/**
 * THE STRATEGIST IN SLACK, BEYOND ITS OWN ANSWER (2026-10-17). Cole: "Locus should have every Slack permission."
 * Every action keeps the extwrite.js rules (look up first, before -> after, a p_ext_write row, a Change Log line,
 * undo where Slack allows it) and the one line Cole drew: INTERNAL channels and teammates are Locus's to use at once;
 * a client's channel (a brand's brief_channel) or any channel shared with another company (Slack Connect) or a guest
 * is CLIENT-FACING, and posting there is `slack_post_client`, which always shows a card (strategist.js cardOnly) and
 * follows `settings.slackSendWho` (owner = only Cole may approve, the default).
 *
 *   slack_post           post (or reply in a thread) in an internal channel, or DM a full member of the team
 *   slack_post_client    the same into a client-facing channel: ALWAYS a card; never applied straight from a message
 *   slack_schedule       schedule an internal post for later (undo = the scheduled message is deleted)
 *   slack_react          add or remove an emoji reaction on any message the bot can see
 *   slack_pin            pin or unpin a message in an internal channel
 *   slack_edit           change the words of one of Locus's own messages (internal channels)
 *   slack_delete         delete one of Locus's own messages (internal channels; cannot be undone)
 *   slack_invite         add teammates (or the Locus app itself) to an internal channel (undo = removed again)
 *   slack_channel        make a new internal channel, optionally private, and invite people (undo = archived)
 */
import { recordWrite, registerUndo, doneNote, brandOf, isOwner } from './extwrite.js';

const clip = (s, n) => String(s ?? '').slice(0, n);
const P = 'slack';
const say = (j, what) => `Slack refused ${what}: ${j?.error || 'no answer'}${j?.needed ? ` (needs the ${j.needed} scope: add it on api.slack.com > Your apps > Mobius Digital > OAuth & Permissions > Bot Token Scopes, then Reinstall to Workspace)` : ''}.`;

/* ---------------- who and where ---------------- */
async function pages(env, d, method, params, key, max = 5) {
  const out = []; let cursor = '';
  for (let i = 0; i < max; i++) {
    const j = await d.slack(env, method, { ...params, limit: 1000, ...(cursor ? { cursor } : {}) });
    if (!j.ok) { if (!out.length) throw new Error(say(j, method)); break; }
    out.push(...(j[key] || []));
    cursor = j.response_metadata?.next_cursor || '';
    if (!cursor) break;
  }
  return out;
}
/** "#lucky-internal", "C0123", "<#C0123|name>", a Slack link, or "here" (the conversation that asked). */
export async function channelOf(env, d, want, ctx) {
  const w = String(want || '').trim();
  if (!w || /^(here|this|this channel|this thread)$/i.test(w)) { if (ctx?.channel) return { id: ctx.channel }; throw new Error('Which channel? (#name or id)'); }
  const m = w.match(/<#([CG][A-Z0-9]+)/) || w.match(/archives\/([CDG][A-Z0-9]+)/) || w.match(/^([CDG][A-Z0-9]{6,})$/);
  if (m) return { id: m[1] };
  const name = w.replace(/^#/, '').toLowerCase();
  const list = await pages(env, d, 'conversations.list', { types: 'public_channel,private_channel', exclude_archived: true }, 'channels');
  const hit = list.find(c => c.name === name) || list.filter(c => c.name.includes(name)).sort((a, b) => a.name.length - b.name.length)[0];
  if (!hit) throw new Error(`No channel called #${name} that Locus can see (a private channel needs the app added first).`);
  return { id: hit.id, name: hit.name };
}
/** A teammate by @mention, U id, email or name ("Noma", "Ahsan Ali"). */
export async function personOf(env, d, want) {
  const w = String(want || '').trim();
  const m = w.match(/<@([UW][A-Z0-9]+)/) || w.match(/^([UW][A-Z0-9]{6,})$/);
  let u = null;
  if (m) { const j = await d.slack(env, 'users.info', { user: m[1] }); if (!j.ok) throw new Error(say(j, 'users.info')); u = j.user; }
  else if (/@/.test(w) && /\./.test(w)) { const j = await d.slack(env, 'users.lookupByEmail', { email: w.replace(/^@/, '') }); if (!j.ok) throw new Error(`No Slack member with the email ${w}.`); u = j.user; }
  else {
    const n = w.replace(/^@/, '').toLowerCase();
    const all = (await pages(env, d, 'users.list', {}, 'members')).filter(x => !x.deleted && !x.is_bot && x.id !== 'USLACKBOT');
    const nm = x => [x.name, x.real_name, x.profile?.display_name, x.profile?.real_name].filter(Boolean).map(s => String(s).toLowerCase());
    let hits = all.filter(x => nm(x).includes(n));
    if (!hits.length) hits = all.filter(x => nm(x).some(s => s.split(/\s+/)[0] === n.split(/\s+/)[0]));
    if (hits.length !== 1) throw new Error(hits.length ? `"${w}" matches ${hits.length} people: ${hits.slice(0, 6).map(x => x.real_name || x.name).join(', ')}. Say which.` : `No one in Slack called "${w}".`);
    u = hits[0];
  }
  return { id: u.id, name: u.real_name || u.profile?.real_name || u.name, guest: !!(u.is_restricted || u.is_ultra_restricted), bot: !!u.is_bot, gone: !!u.deleted };
}
/** Internal or client-facing, and whose. A brand's client channel, a Slack Connect channel or a guest DM is client-facing. */
export async function classify(env, d, id) {
  const accts = await d.listAccounts(env, false);
  const client = accts.find(a => a.brief_channel === id);
  const own = accts.find(a => a.slack_channel === id);
  const info = await d.slack(env, 'conversations.info', { channel: id });
  const c = info.channel || {};
  if (c.is_im) {
    const p = await personOf(env, d, c.user).catch(() => null);
    return { id, kind: p?.guest ? 'outside' : 'internal', label: `a DM with ${p?.name || c.user}`, member: true };
  }
  if (!info.ok && !client && !own) throw new Error(say(info, 'reading that channel'));
  const label = `#${c.name || client?.name || own?.name || id}`;
  if (client && client.brief_channel !== client.slack_channel) return { id, kind: 'client', brand: client, label, member: c.is_member !== false };
  if (c.is_ext_shared || c.is_shared || c.is_pending_ext_shared) return { id, kind: 'outside', brand: own || null, label, member: c.is_member !== false };
  return { id, kind: 'internal', brand: own || null, label, member: c.is_member !== false, private: !!c.is_private };
}
/** Where a post goes: a channel, or a DM opened with a teammate. */
async function destination(env, d, to, ctx) {
  const w = String(to || '').trim();
  const dm = async () => {
    const p = await personOf(env, d, w);
    if (p.gone || p.bot) throw new Error(`${p.name} is not someone Locus can message.`);
    const o = await d.slack(env, 'conversations.open', { users: p.id });
    if (!o.ok) throw new Error(say(o, 'opening a DM'));
    return { id: o.channel.id, kind: p.guest ? 'outside' : 'internal', label: `a DM to ${p.name}`, person: p, member: true };
  };
  if (/^<@|^[UW][A-Z0-9]{6,}$|^@|^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(w)) return dm();
  if (!w || /^#|^[CDG][A-Z0-9]{6,}$|<#|archives\/|^(here|this|this channel|this thread)$/i.test(w)) return classify(env, d, (await channelOf(env, d, w, ctx)).id);
  /* A bare word: a channel by that name first ("lucky-internal"), else a teammate ("Noma"). */
  let c = null; try { c = await channelOf(env, d, w, ctx); } catch {}
  return c ? classify(env, d, c.id) : dm();
}
/** A message: a Slack link, {channel, ts}, "this" (the message that asked) or "thread" (its thread's first message). */
export function messageOf(input, ctx) {
  const w = String(input.message || '').trim();
  const link = w.match(/archives\/([CDG][A-Z0-9]+)\/p(\d{10})(\d{6})/);
  if (link) { const t = w.match(/thread_ts=(\d+\.\d+)/); return { channel: link[1], ts: `${link[2]}.${link[3]}`, thread: t ? t[1] : null }; }
  if (/^(this|that)$/i.test(w) && ctx?.ev?.ts) return { channel: ctx.channel || ctx.ev.channel, ts: ctx.ev.ts };
  if (/^thread$/i.test(w) && ctx?.thread) return { channel: ctx.channel, ts: ctx.thread };
  if (input.ts && (input.channel || ctx?.channel)) return { channel: input.channel_id || null, channelName: input.channel, ts: String(input.ts) };
  return null;
}
async function messageRef(env, d, input, ctx) {
  const m = messageOf(input, ctx);
  if (!m) throw new Error('Which message? Give its Slack link (Copy link in Slack), or "this" for the message that asked.');
  if (!m.channel) m.channel = (await channelOf(env, d, m.channelName || 'here', ctx)).id;
  const h = await d.slack(env, 'conversations.history', { channel: m.channel, latest: m.ts, inclusive: true, limit: 1 });
  let msg = (h.messages || []).find(x => x.ts === m.ts);
  if (!msg) { const r = await d.slack(env, 'conversations.replies', { channel: m.channel, ts: m.thread || m.ts, latest: m.ts, inclusive: true, limit: 1 }); msg = (r.messages || []).find(x => x.ts === m.ts); }
  return { ...m, msg: msg || null };
}
const short = t => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 90 ? s.slice(0, 88) + '...' : s; };
async function botId(env, d) {
  const j = await d.slack(env, 'auth.test', {});
  return { bot: j.bot_id || null, user: j.user_id || null };
}
const permalink = async (env, d, channel, ts) => (await d.slack(env, 'chat.getPermalink', { channel, message_ts: ts }).catch(() => ({})))?.permalink || null;
const REASON = { type: 'string', description: 'Why, in one line (written in the Change Log).' };
const brandId = (c, b) => c?.brand?.act_id || b?.act_id || null;

/* ---------------- the actions ---------------- */
function postAction(d, client) {
  return {
    name: client ? 'slack_post_client' : 'slack_post',
    description: client
      ? 'Post a message (or a thread reply) into a CLIENT-FACING Slack channel: a brand\'s client channel or any channel shared with another company. Always a card the team approves first (only Cole when Settings say so). Write it as the agency would to the client; no internal notes, no costs, no tags of the team.'
      : 'Post a message, or reply in a thread, in any INTERNAL Slack channel (#name or id; "here" = this conversation) or DM a full member of the team (@name, U id or email). Use it to tell someone something, hand a task over, or share a finding in another channel. Never for a client channel (that is slack_post_client).',
    input_schema: { type: 'object', properties: {
      to: { type: 'string', description: '#channel, channel id, "here", or a teammate (@name, U id, email).' },
      text: { type: 'string', description: 'The message, Slack mrkdwn (*bold*, bullets "• ", <@U..> to tag someone). No em dashes.' },
      thread: { type: 'string', description: 'Reply in this thread: a Slack link to its first message, or its ts.' },
      broadcast: { type: 'boolean', description: 'A thread reply also shown in the channel.' },
      brand: { type: 'string' }, reason: REASON }, required: ['to', 'text'] },
    propose: async (env, i, h, ctx) => {
      let dst; try { dst = await destination(env, d, i.to, ctx); } catch (e) { return { error: e.message }; }
      if (!client && dst.kind !== 'internal') return { error: `${dst.label} is ${dst.kind === 'client' ? `${dst.brand?.name || 'a brand'}'s client channel` : 'shared with people outside Mobius'}. Posting there always goes through slack_post_client, which shows a card first.` };
      if (client && dst.kind === 'internal') return { error: `${dst.label} is internal: use slack_post.` };
      const text = clip(String(i.text || '').replace(/\u2014/g, ','), 3900).trim();
      if (!text) return { error: 'Write the message.' };
      let thread = null;
      if (i.thread) { const m = messageOf({ message: i.thread }, ctx); thread = m?.ts || (/^\d{10}\.\d{6}$/.test(String(i.thread)) ? String(i.thread) : null); if (!thread) return { error: 'thread must be a Slack link or a message ts.' }; }
      const b = await brandOf(env, d, i.brand, ctx).catch(() => null);
      return { summary: `${client ? 'Post to the client in' : 'Post in'} ${dst.label}${thread ? ' (thread reply)' : ''}: "${short(text)}"`,
        detail: `${text}${client ? '\n\nThe client sees this as soon as it is approved.' : ''}${dst.member === false && !dst.private ? '\nLocus joins the channel first.' : ''}`,
        patch: { channel: dst.id, label: dst.label, text, thread, broadcast: !!i.broadcast, brand: brandId(dst, b), client, reason: clip(i.reason, 300) || null, join: dst.member === false && !dst.private } };
    },
    apply: async (env, p, h, ctx) => {
      if (p.client) {
        const who = String((await d.getSetting(env, 'slackSendWho').catch(() => null)) || 'owner');
        if (who !== 'anyone' && !isOwner(ctx)) return { error: 'Posting to a client channel is Cole\'s to approve (Settings > Briefs and Slack > who may send to clients). Nothing was posted.' };
        const c = await classify(env, d, p.channel).catch(() => null);
        if (!c || c.kind === 'internal') return { error: 'That channel is not client-facing any more. Nothing was posted.' };
      } else {
        const c = await classify(env, d, p.channel).catch(e => ({ error: e.message }));
        if (c.error || c.kind !== 'internal') return { error: c.error || `${p.label} is client-facing now. Nothing was posted.` };
      }
      if (p.join) await d.slack(env, 'conversations.join', { channel: p.channel }).catch(() => {});
      const j = await d.slack(env, 'chat.postMessage', { channel: p.channel, text: p.text, unfurl_links: false, username: 'Locus', ...(p.thread ? { thread_ts: p.thread, ...(p.broadcast ? { reply_broadcast: true } : {}) } : {}) });
      if (!j.ok) return { error: say(j, 'the post') };
      const link = await permalink(env, d, j.channel, j.ts);
      const id = await recordWrite(env, { platform: P, brand: p.brand, object: `${j.channel}:${j.ts}`, name: p.label, action: p.client ? 'slack_post_client' : 'slack_post', before: null,
        after: { text: p.text }, undo: p.client ? null : { op: 'delete', channel: j.channel, ts: j.ts }, summary: `${p.client ? 'Posted to the client in' : 'Posted in'} ${p.label}: "${short(p.text)}"`, reason: p.reason, category: 'other', objectType: 'SLACK_MESSAGE', ctx });
      return { ok: true, note: doneNote(`Posted in ${p.label}${link ? `: ${link}` : ''}.${p.client ? ' A message the client has seen cannot be undone from Locus.' : ''}`, id, !p.client) };
    },
  };
}
const scheduleAction = d => ({
  name: 'slack_schedule',
  description: 'Schedule a message for later in an internal Slack channel or a teammate\'s DM ("remind Noma at 9 tomorrow to..."). at = "2026-10-18T09:00" Central, or a full ISO time; up to 120 days ahead.',
  input_schema: { type: 'object', properties: { to: { type: 'string' }, text: { type: 'string' }, at: { type: 'string' }, thread: { type: 'string' }, brand: { type: 'string' }, reason: REASON }, required: ['to', 'text', 'at'] },
  propose: async (env, i, h, ctx) => {
    let dst; try { dst = await destination(env, d, i.to, ctx); } catch (e) { return { error: e.message }; }
    if (dst.kind !== 'internal') return { error: `${dst.label} is client-facing. Locus schedules posts only inside the team.` };
    const at = whenOf(i.at);
    if (!at) return { error: 'at must be like 2026-10-18T09:00 (Central) or a full ISO time.' };
    const s = Math.floor(at.getTime() / 1000);
    if (s < Date.now() / 1000 + 60 || s > Date.now() / 1000 + 120 * 86400) return { error: 'Pick a time at least a minute ahead and under 120 days out.' };
    const text = clip(String(i.text || '').replace(/\u2014/g, ','), 3900).trim();
    if (!text) return { error: 'Write the message.' };
    const thread = i.thread ? (messageOf({ message: i.thread }, ctx)?.ts || String(i.thread)) : null;
    const b = await brandOf(env, d, i.brand, ctx).catch(() => null);
    const when = at.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';
    return { summary: `Schedule for ${when} in ${dst.label}: "${short(text)}"`, detail: text, patch: { channel: dst.id, label: dst.label, text, post_at: s, when, thread, brand: brandId(dst, b), reason: clip(i.reason, 300) || null } };
  },
  apply: async (env, p, h, ctx) => {
    const j = await d.slack(env, 'chat.scheduleMessage', { channel: p.channel, text: p.text, post_at: p.post_at, ...(p.thread ? { thread_ts: p.thread } : {}) });
    if (!j.ok) return { error: say(j, 'the scheduled post') };
    const id = await recordWrite(env, { platform: P, brand: p.brand, object: `${j.channel}:${j.scheduled_message_id}`, name: p.label, action: 'slack_schedule', after: { text: p.text, post_at: p.post_at },
      undo: { op: 'unschedule', channel: j.channel, id: j.scheduled_message_id }, summary: `Scheduled for ${p.when} in ${p.label}: "${short(p.text)}"`, reason: p.reason, objectType: 'SLACK_MESSAGE', ctx });
    return { ok: true, note: doneNote(`Scheduled for ${p.when} in ${p.label}.`, id) };
  },
});
/** "2026-10-18T09:00" in Central, or a full ISO time. */
function whenOf(s) {
  const v = String(s || '').trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v)) { const t = Date.parse(v); return isNaN(t) ? null : new Date(t); }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/); if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const off = t => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - t; };
  let t = wall; for (let k = 0; k < 2; k++) t = wall - off(t);
  return new Date(t);
}
const reactAction = d => ({
  name: 'slack_react',
  description: 'Add (or remove) an emoji reaction on a Slack message: ✅ to mark something done, :eyes: to say Locus is on it, any emoji name. message = a Slack link, or "this" for the message that asked.',
  input_schema: { type: 'object', properties: { message: { type: 'string' }, emoji: { type: 'string', description: 'The emoji name without colons: white_check_mark, eyes, fire, thumbsup.' }, remove: { type: 'boolean' }, reason: REASON }, required: ['message', 'emoji'] },
  propose: async (env, i, h, ctx) => {
    let m; try { m = await messageRef(env, d, i, ctx); } catch (e) { return { error: e.message }; }
    const name = String(i.emoji || '').replace(/:/g, '').trim().toLowerCase();
    if (!/^[a-z0-9_+'-]{1,60}$/.test(name)) return { error: 'emoji is a name like white_check_mark.' };
    const c = await classify(env, d, m.channel).catch(() => ({ label: m.channel }));
    return { summary: `${i.remove ? 'Remove' : 'Add'} :${name}: ${i.remove ? 'from' : 'on'} "${short(m.msg?.text || m.ts)}" in ${c.label}`, detail: m.msg ? `By ${m.msg.user || m.msg.username || 'someone'}.` : '',
      patch: { channel: m.channel, ts: m.ts, name, remove: !!i.remove, label: c.label, brand: brandId(c), text: short(m.msg?.text || '') } };
  },
  apply: async (env, p, h, ctx) => {
    const j = await d.slack(env, p.remove ? 'reactions.remove' : 'reactions.add', { channel: p.channel, timestamp: p.ts, name: p.name });
    if (!j.ok && !/already_reacted|no_reaction/.test(j.error || '')) return { error: say(j, 'the reaction') };
    const id = await recordWrite(env, { platform: P, brand: p.brand, object: `${p.channel}:${p.ts}`, name: p.label, action: 'slack_react', after: { [p.remove ? 'removed' : 'added']: p.name },
      undo: { op: p.remove ? 'react' : 'unreact', channel: p.channel, ts: p.ts, name: p.name }, summary: `${p.remove ? 'Removed' : 'Reacted'} :${p.name}: on "${p.text}" in ${p.label}`, objectType: 'SLACK_MESSAGE', ctx });
    return { ok: true, note: doneNote(`:${p.name}: ${p.remove ? 'removed' : 'added'}.`, id) };
  },
});
async function internalMessage(env, d, i, ctx, own) {
  const m = await messageRef(env, d, i, ctx);
  const c = await classify(env, d, m.channel);
  if (c.kind !== 'internal') throw new Error(`${c.label} is client-facing. Locus only ${own ? 'edits or deletes its messages' : 'pins'} inside the team.`);
  if (own) {
    const me = await botId(env, d);
    if (!m.msg) throw new Error('That message could not be read.');
    if (!(m.msg.bot_id && m.msg.bot_id === me.bot) && m.msg.user !== me.user) throw new Error('That is not one of Locus\'s own messages. Slack lets an app change only what it posted.');
  }
  return { m, c };
}
const pinAction = d => ({
  name: 'slack_pin',
  description: 'Pin (or unpin) a message in an internal Slack channel, e.g. the plan everyone should keep in view.',
  input_schema: { type: 'object', properties: { message: { type: 'string' }, unpin: { type: 'boolean' }, reason: REASON }, required: ['message'] },
  propose: async (env, i, h, ctx) => {
    let r; try { r = await internalMessage(env, d, i, ctx, false); } catch (e) { return { error: e.message }; }
    return { summary: `${i.unpin ? 'Unpin' : 'Pin'} "${short(r.m.msg?.text || r.m.ts)}" in ${r.c.label}`, detail: '', patch: { channel: r.m.channel, ts: r.m.ts, unpin: !!i.unpin, label: r.c.label, brand: brandId(r.c), text: short(r.m.msg?.text || ''), reason: clip(i.reason, 300) || null } };
  },
  apply: async (env, p, h, ctx) => {
    const j = await d.slack(env, p.unpin ? 'pins.remove' : 'pins.add', { channel: p.channel, timestamp: p.ts });
    if (!j.ok && !/already_pinned|no_pin/.test(j.error || '')) return { error: say(j, p.unpin ? 'the unpin' : 'the pin') };
    const id = await recordWrite(env, { platform: P, brand: p.brand, object: `${p.channel}:${p.ts}`, name: p.label, action: 'slack_pin', after: { pinned: !p.unpin },
      undo: { op: p.unpin ? 'pin' : 'unpin', channel: p.channel, ts: p.ts }, summary: `${p.unpin ? 'Unpinned' : 'Pinned'} "${p.text}" in ${p.label}`, reason: p.reason, objectType: 'SLACK_MESSAGE', ctx });
    return { ok: true, note: doneNote(`${p.unpin ? 'Unpinned' : 'Pinned'} in ${p.label}.`, id) };
  },
});
const editAction = d => ({
  name: 'slack_edit',
  description: 'Change the words of one of Locus\'s OWN messages in an internal channel (a wrong number, a stale plan). Slack only lets an app edit what it posted.',
  input_schema: { type: 'object', properties: { message: { type: 'string' }, text: { type: 'string' }, reason: REASON }, required: ['message', 'text'] },
  propose: async (env, i, h, ctx) => {
    let r; try { r = await internalMessage(env, d, i, ctx, true); } catch (e) { return { error: e.message }; }
    const text = clip(String(i.text || '').replace(/\u2014/g, ','), 3900).trim();
    if (!text) return { error: 'Give the new words.' };
    if (r.m.msg.blocks?.length) return { error: 'That message is a card with buttons; edit what it describes instead, and the card follows.' };
    return { summary: `Edit Locus's message in ${r.c.label}`, detail: `Was: ${short(r.m.msg.text)}\nNow: ${text}`, patch: { channel: r.m.channel, ts: r.m.ts, before: r.m.msg.text || '', text, label: r.c.label, brand: brandId(r.c), reason: clip(i.reason, 300) || null } };
  },
  apply: async (env, p, h, ctx) => {
    const j = await d.slack(env, 'chat.update', { channel: p.channel, ts: p.ts, text: p.text });
    if (!j.ok) return { error: say(j, 'the edit') };
    const id = await recordWrite(env, { platform: P, brand: p.brand, object: `${p.channel}:${p.ts}`, name: p.label, action: 'slack_edit', before: { text: p.before }, after: { text: p.text },
      undo: { op: 'edit', channel: p.channel, ts: p.ts, text: p.before }, summary: `Edited Locus's message in ${p.label}: "${short(p.text)}"`, reason: p.reason, objectType: 'SLACK_MESSAGE', ctx });
    return { ok: true, note: doneNote('Edited.', id) };
  },
});
const deleteAction = d => ({
  name: 'slack_delete',
  description: 'Delete one of Locus\'s OWN messages in an internal channel (a duplicate post, a mistake). It cannot be undone; the Change Log keeps its words.',
  input_schema: { type: 'object', properties: { message: { type: 'string' }, reason: REASON }, required: ['message'] },
  propose: async (env, i, h, ctx) => {
    let r; try { r = await internalMessage(env, d, i, ctx, true); } catch (e) { return { error: e.message }; }
    return { summary: `Delete Locus's message in ${r.c.label}: "${short(r.m.msg.text)}"`, detail: 'It cannot be put back; its words stay in the Change Log.', patch: { channel: r.m.channel, ts: r.m.ts, text: r.m.msg.text || '', label: r.c.label, brand: brandId(r.c), reason: clip(i.reason, 300) || null } };
  },
  apply: async (env, p, h, ctx) => {
    const j = await d.slack(env, 'chat.delete', { channel: p.channel, ts: p.ts });
    if (!j.ok && j.error !== 'message_not_found') return { error: say(j, 'the delete') };
    const id = await recordWrite(env, { platform: P, brand: p.brand, object: `${p.channel}:${p.ts}`, name: p.label, action: 'slack_delete', before: { text: p.text }, undo: null,
      summary: `Deleted Locus's message in ${p.label}: "${short(p.text)}"`, reason: p.reason, objectType: 'SLACK_MESSAGE', ctx });
    return { ok: true, note: doneNote('Deleted.', id, false) };
  },
});
const inviteAction = d => ({
  name: 'slack_invite',
  description: 'Add teammates to an internal Slack channel (by @name, email or U id), or add the Locus app itself to a channel it is not in (who: ["locus"]). Guests and outside people are refused.',
  input_schema: { type: 'object', properties: { channel: { type: 'string' }, who: { type: 'array', items: { type: 'string' } }, brand: { type: 'string' }, reason: REASON }, required: ['channel', 'who'] },
  propose: async (env, i, h, ctx) => {
    let ch; try { ch = await classify(env, d, (await channelOf(env, d, i.channel, ctx)).id); } catch (e) { return { error: e.message }; }
    if (ch.kind !== 'internal') return { error: `${ch.label} is client-facing. Add people to it in Slack yourself.` };
    const people = [], self = (i.who || []).some(w => /^(locus|the app|yourself|you|me)$/i.test(String(w).trim()));
    for (const w of i.who || []) {
      if (/^(locus|the app|yourself|you|me)$/i.test(String(w).trim())) continue;
      let p; try { p = await personOf(env, d, w); } catch (e) { return { error: e.message }; }
      if (p.guest || p.bot || p.gone) return { error: `${p.name} is ${p.guest ? 'a guest' : 'not a teammate'}; Locus only adds full members of the team.` };
      people.push(p);
    }
    if (!people.length && !self) return { error: 'Who should be added?' };
    if (self && ch.member) return { error: `Locus is already in ${ch.label}.` };
    return { summary: `Add ${[self ? 'Locus' : null, ...people.map(p => p.name)].filter(Boolean).join(', ')} to ${ch.label}`, detail: '', patch: { channel: ch.id, label: ch.label, self, users: people.map(p => p.id), names: people.map(p => p.name), brand: brandId(ch), reason: clip(i.reason, 300) || null } };
  },
  apply: async (env, p, h, ctx) => {
    if (p.self) { const j = await d.slack(env, 'conversations.join', { channel: p.channel }); if (!j.ok) return { error: `${say(j, 'joining')} A private channel needs someone in it to type /invite @Mobius Digital.` }; }
    if (p.users.length) { const j = await d.slack(env, 'conversations.invite', { channel: p.channel, users: p.users.join(',') }); if (!j.ok && j.error !== 'already_in_channel') return { error: say(j, 'the invite') }; }
    const id = await recordWrite(env, { platform: P, brand: p.brand, object: p.channel, name: p.label, action: 'slack_invite', after: { added: [...(p.self ? ['Locus'] : []), ...p.names] },
      undo: p.users.length ? { op: 'kick', channel: p.channel, users: p.users } : null, summary: `Added ${[p.self ? 'Locus' : null, ...p.names].filter(Boolean).join(', ')} to ${p.label}`, reason: p.reason, objectType: 'SLACK_CHANNEL', ctx });
    return { ok: true, note: doneNote(`Added to ${p.label}.`, id, !!p.users.length) };
  },
});
const channelAction = d => ({
  name: 'slack_channel',
  description: 'Make a new INTERNAL Slack channel (lowercase name, dashes), public or private, and add teammates to it (a new brand\'s -internal channel, a launch war room). Undo archives it.',
  input_schema: { type: 'object', properties: { name: { type: 'string' }, private: { type: 'boolean' }, purpose: { type: 'string' }, who: { type: 'array', items: { type: 'string' } }, brand: { type: 'string' }, reason: REASON }, required: ['name'] },
  propose: async (env, i, h, ctx) => {
    const name = String(i.name || '').toLowerCase().replace(/^#/, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    if (!name) return { error: 'Give the channel a name.' };
    const list = await pages(env, d, 'conversations.list', { types: 'public_channel,private_channel', exclude_archived: false }, 'channels').catch(() => []);
    if (list.some(c => c.name === name)) return { error: `#${name} already exists${list.find(c => c.name === name).is_archived ? ' (archived: unarchive it in Slack)' : ''}.` };
    const people = [];
    for (const w of i.who || []) { let p; try { p = await personOf(env, d, w); } catch (e) { return { error: e.message }; } if (p.guest || p.bot || p.gone) return { error: `${p.name} is not a full member of the team.` }; people.push(p); }
    const b = await brandOf(env, d, i.brand, ctx).catch(() => null);
    return { summary: `New ${i.private ? 'private' : 'public'} channel #${name}${people.length ? ` with ${people.map(p => p.name).join(', ')}` : ''}`, detail: i.purpose ? `Purpose: ${clip(i.purpose, 250)}` : '',
      patch: { name, private: !!i.private, purpose: clip(i.purpose, 250) || null, users: people.map(p => p.id), names: people.map(p => p.name), brand: b?.act_id || null, reason: clip(i.reason, 300) || null } };
  },
  apply: async (env, p, h, ctx) => {
    const j = await d.slack(env, 'conversations.create', { name: p.name, is_private: p.private });
    if (!j.ok) return { error: say(j, 'the new channel') };
    const ch = j.channel.id;
    if (p.purpose) await d.slack(env, 'conversations.setPurpose', { channel: ch, purpose: p.purpose }).catch(() => {});
    if (p.users.length) await d.slack(env, 'conversations.invite', { channel: ch, users: p.users.join(',') }).catch(() => {});
    const id = await recordWrite(env, { platform: P, brand: p.brand, object: ch, name: `#${p.name}`, action: 'slack_channel', after: { channel: ch, private: p.private, people: p.names },
      undo: { op: 'archive', channel: ch }, summary: `Made #${p.name}${p.names.length ? ` with ${p.names.join(', ')}` : ''}`, reason: p.reason, objectType: 'SLACK_CHANNEL', ctx });
    return { ok: true, channel: ch, note: doneNote(`#${p.name} is made (<#${ch}>).`, id) };
  },
});

registerUndo(P, async (env, d, row, u) => {
  const call = async (m, b, ok = []) => { const j = await d.slack(env, m, b); if (!j.ok && !ok.includes(j.error)) throw new Error(say(j, m)); return j; };
  if (u.op === 'delete') await call('chat.delete', { channel: u.channel, ts: u.ts }, ['message_not_found']);
  else if (u.op === 'unschedule') await call('chat.deleteScheduledMessage', { channel: u.channel, scheduled_message_id: u.id });
  else if (u.op === 'unreact') await call('reactions.remove', { channel: u.channel, timestamp: u.ts, name: u.name }, ['no_reaction']);
  else if (u.op === 'react') await call('reactions.add', { channel: u.channel, timestamp: u.ts, name: u.name }, ['already_reacted']);
  else if (u.op === 'unpin') await call('pins.remove', { channel: u.channel, timestamp: u.ts }, ['no_pin']);
  else if (u.op === 'pin') await call('pins.add', { channel: u.channel, timestamp: u.ts }, ['already_pinned']);
  else if (u.op === 'edit') await call('chat.update', { channel: u.channel, ts: u.ts, text: u.text });
  else if (u.op === 'kick') for (const user of u.users || []) await call('conversations.kick', { channel: u.channel, user }, ['not_in_channel']);
  else if (u.op === 'archive') await call('conversations.archive', { channel: u.channel }, ['already_archived']);
  else return { error: `Unknown Slack undo ${u.op}.` };
  return { ok: true, note: `Undone: ${row.summary}.` };
});

export function slackActions(d) {
  return [postAction(d, false), postAction(d, true), scheduleAction(d), reactAction(d), pinAction(d), editAction(d), deleteAction(d), inviteAction(d), channelAction(d)];
}
export const _test = { messageOf, whenOf };
