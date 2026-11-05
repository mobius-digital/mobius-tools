/* DISCORD FOR THE CREATOR PROGRAM (2026-11-05, Trybe Scale).
 *
 * Each brand's creators talk in a Discord server; Trybe is only where they upload, get samples and get paid.
 * Locus holds ONE bot token for the agency (p_br_doc act 'agency', key 'discord') and each brand's server id
 * (p_br_doc key 'discord' on the brand). With those, Locus can build a server from the template below, post in it,
 * read it and move a creator to VIP. The token never leaves this file: only "has a token" and the bot's name do.
 *
 * The look (2026-11-05, Cole: "we don't want it to just say Locus across everything"): each brand sets a mascot
 * (name + picture), a brand emoji, a colour and a server picture. Build applies them: server icon, the bot's name
 * (and picture, where Discord allows it) in that server, role colours, emoji channel names, and every post goes out
 * through a channel webhook as the mascot, in a card with the brand colour. Changing the look reposts the first posts.
 *
 * Routes (staff only, mounted by amb.js under /api/amb/discord):
 *   GET  /api/amb/discord?act=            what is connected: bot, server, channels, invite, look
 *   PUT  /api/amb/discord/token {token}   store the agency bot token (checked with one real call)
 *   PUT  /api/amb/discord/server {act, guild_id}   which server is this brand's (the bot must be in it)
 *   PUT  /api/amb/discord/look {act, mascot, avatar, emoji, color, icon}   save the look and apply it
 *   POST /api/amb/discord/build {act, core, vip}   make the roles, channels and first posts; safe to run twice
 *   GET  /api/amb/discord/messages?act=&channel=questions&limit=50   recent messages, oldest first
 *   POST /api/amb/discord/post {act, channel, text, pin}             post as the mascot
 *   POST /api/amb/discord/vip {act, user_id, on}                     give or take the VIP role
 * No em dashes in anything this posts. */
const API = 'https://discord.com/api/v10';
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const noDash = s => String(s || '').replace(/\s*[—–]\s*/g, ', ');
const VIEW = 1024n, SEND = 2048n, CONNECT = 1048576n;
const HEX = /^#[0-9a-f]{6}$/i;
const VIP_GOLD = 0xF1C40F;

async function doc(env, act) {
  const r = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'discord'`).bind(act).first().catch(() => null);
  return safeJson(r?.data_json, null);
}
async function putDoc(env, act, data) {
  await env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', 'discord', ?2, 'approved', 'staff', datetime('now'))
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).bind(act, JSON.stringify(data)).run();
}
async function dc(token, method, path, body, auth = true) {
  for (let i = 0; i < 4; i++) {
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'LocusCreators (https://locus.go-mobius-digital.com, 1)' };
    if (auth) headers.Authorization = `Bot ${token}`;
    const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await new Promise(z => setTimeout(z, Math.min(5000, Math.ceil((j.retry_after || 1) * 1000)))); continue; }
    if (r.status === 204) return null;
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      if (r.status === 401) throw new Error('Discord did not accept the bot token.');
      if (r.status === 403) throw new Error('The bot is not allowed to do that. Invite it to the server with the Administrator permission.');
      if (r.status === 404) throw new Error('Discord could not find that. Is the bot in this server?');
      throw new Error(`Discord answered ${r.status}${j && j.message ? `: ${j.message}` : ''}`);
    }
    return j;
  }
  throw new Error('Discord asked us to slow down. Try again in a minute.');
}
/* A picture link as a data URI, for the server icon and the bot's picture in a server. */
async function dataUri(url) {
  const r = await fetch(url, { headers: { Accept: 'image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1', 'User-Agent': 'Mozilla/5.0 LocusCreators' } });
  if (!r.ok) throw new Error(`Could not open the picture (${r.status}).`);
  const type = (r.headers.get('content-type') || 'image/png').split(';')[0];
  if (!/^image\/(png|jpeg|gif|webp)$/.test(type)) throw new Error('That link is not a picture.');
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > 8e6) throw new Error('That picture is too big.');
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(s)}`;
}

/* The template. `ro` = only the team posts; `vip` = hidden from everyone but VIP and the team. `e` = the channel's
   emoji, the same in every brand so creators learn one layout; the brand's own emoji marks the categories. */
const CATS = ['START HERE', 'FILM', 'WINS', 'VIP', 'CALL'];
const CHANNELS = [
  { cat: 'START HERE', name: 'welcome', e: '👋', ro: true, topic: 'How this works. Read this first.' },
  { cat: 'START HERE', name: 'rules', e: '📌', ro: true, topic: 'What gets a video approved.' },
  { cat: 'START HERE', name: 'announcements', e: '📣', ro: true, topic: 'News from the team.' },
  { cat: 'FILM', name: 'this-week', e: '🎬', ro: true, topic: 'The videos to film this week. One idea every weekday.' },
  { cat: 'FILM', name: 'questions', e: '💬', topic: 'Ask anything. We answer within a day.' },
  { cat: 'FILM', name: 'feedback-before-upload', e: '🎯', topic: 'Post a video here and get notes before you upload it.' },
  { cat: 'WINS', name: 'winners', e: '🏆', ro: true, topic: 'The videos that sold, every Friday.' },
  { cat: 'VIP', name: 'vip', e: '💎', vip: true, topic: 'For creators whose videos made sales.' },
  { cat: 'VIP', name: 'vip-briefs', e: '🔒', vip: true, ro: true, topic: 'Next week, early.' },
  { cat: 'CALL', name: 'Monday Call', e: '🎙️', voice: true },
];
const styled = c => c.voice ? `${c.e} ${c.name}` : `${c.e}・${c.name}`;
const catName = (look, cat) => look.emoji ? `${look.emoji} ${cat}` : cat;

export function firstPosts(b) {
  const ch = n => (b.ch && b.ch[n] ? `<#${b.ch[n]}>` : `#${n}`);
  const skip = (b.skip || []).slice(0, 4).map(x => `Do not: ${String(x).replace(/\.$/, '')}.`);
  const rules = [...skip, 'If you say the deal, say it exactly as written on the hub.', 'No music playing and no other brand logos in the shot.', '30 to 45 seconds, filmed upright on a phone.', 'One video per idea. Write the idea name in the notes when you upload.'];
  const me = b.mascot && b.mascot !== b.name ? `I'm ${b.mascot}. I post the videos to film every weekday and the winners every Friday. The team answers your questions.\n\n` : '';
  return {
    welcome: { title: `Welcome to ${b.name} Creators`, text: `${me}This Discord is where we talk. TRYBE is only where you upload your videos and get paid.\n\n**How it works**\n1. Open the creator hub: ${b.hub}\n2. Pick one of this week's videos and film it on your phone.\n3. Upload it on TRYBE.\n4. We run the good ones as ads.${b.core ? ` You earn ${b.core}.` : ' You earn on every sale.'}\n\n**Where things are**\n${ch('rules')} what gets a video approved\n${ch('this-week')} one video idea every weekday\n${ch('questions')} anything you are unsure about\n${ch('feedback-before-upload')} post a video and get notes first\n${ch('winners')} the videos that sold, every Friday\n\n**Moving up**\nWhen your videos make sales you get invited to VIP.${b.vip ? ` VIP earns ${b.vip}.` : ' VIP earns more.'}` },
    rules: { title: 'The rules', text: `A video that breaks one cannot run as an ad.\n\n${rules.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nThe full list, with examples: ${b.hub}#rules\n\n**In this server:** be kind, no selling to each other, and ask before you share someone else's video.` },
    'this-week': { title: "This week's videos are up", text: `${b.hub}\n\nFive videos to film. Each one has an example to watch, the first line to say and the shots to get.\n\nStart with idea 1. A new one is posted here every weekday morning.` },
    vip: { title: 'Welcome to VIP', text: `You are here because your videos made sales. That is the only way in.\n\n1. ${b.vip ? `You now earn ${b.vip}.` : 'You now earn more on every sale.'}\n2. You get next week's videos here first, on Friday.\n3. When a video of yours wins, we ask you first for the next version.\n\nKeep VIP private. Other creators earn their way in the same way you did.` },
  };
}

/* The brand's look, with the hub's colour and logo as the fallbacks. */
function lookOf(d, b) {
  const l = d.look || {};
  const color = HEX.test(l.color || '') ? l.color : (HEX.test(b?.accent || '') ? b.accent : '#5865F2');
  return { mascot: l.mascot || b?.display_name || 'Creators', avatar: l.avatar || l.icon || b?.logo_url || '', emoji: l.emoji || '', color, icon: l.icon || b?.logo_url || '' };
}
const sigOf = (look, core, vip) => JSON.stringify([look.mascot, look.avatar, look.emoji, look.color, core || '', vip || '']);

/* Post as the mascot through the channel's webhook (made once, kept in the brand's doc). */
async function hookPost(token, d, key, chanId, look, msg) {
  d.hooks = d.hooks || {};
  let h = d.hooks[key];
  if (!h) { const w = await dc(token, 'POST', `/channels/${chanId}/webhooks`, { name: look.mascot.slice(0, 80) }); h = d.hooks[key] = { id: w.id, token: w.token }; }
  const body = { username: look.mascot.slice(0, 80), allowed_mentions: { parse: [] }, ...msg };
  if (/^https:\/\//.test(look.avatar)) body.avatar_url = look.avatar;
  try { return await dc(token, 'POST', `/webhooks/${h.id}/${h.token}?wait=true`, body, false); }
  catch (e) {
    if (!/could not find/i.test(e.message)) throw e;
    delete d.hooks[key];   // someone deleted the webhook in Discord: make a new one
    const w = await dc(token, 'POST', `/channels/${chanId}/webhooks`, { name: look.mascot.slice(0, 80) }); d.hooks[key] = { id: w.id, token: w.token };
    return dc(token, 'POST', `/webhooks/${w.id}/${w.token}?wait=true`, body, false);
  }
}

async function build(env, token, act, d, brand, opt) {
  const g = d.guild_id;
  const look = lookOf(d, brand.row);
  const colorInt = parseInt(look.color.slice(1), 16);
  const notes = [];
  /* Server picture and the bot's name (and picture) in this server. */
  if (look.icon && d.icon_set !== look.icon) {
    try { await dc(token, 'PATCH', `/guilds/${g}`, { icon: await dataUri(look.icon) }); d.icon_set = look.icon; }
    catch (e) { notes.push(`Server picture: ${e.message}`); }
  }
  if (d.nick_set !== look.mascot || d.avatar_set !== look.avatar) {
    let av = null; try { if (look.avatar) av = await dataUri(look.avatar); } catch (e) { notes.push(`Mascot picture: ${e.message}`); }
    try { await dc(token, 'PATCH', `/guilds/${g}/members/@me`, av ? { nick: look.mascot.slice(0, 32), avatar: av } : { nick: look.mascot.slice(0, 32) }); d.avatar_set = look.avatar; }
    catch { await dc(token, 'PATCH', `/guilds/${g}/members/@me`, { nick: look.mascot.slice(0, 32) }).catch(e => notes.push(`Bot name: ${e.message}`)); }
    d.nick_set = look.mascot;
  }
  /* Roles in the brand colour (VIP stays gold everywhere). */
  const roles = await dc(token, 'GET', `/guilds/${g}/roles`);
  const role = async (name, color) => {
    const r = roles.find(x => x.name === name) || await dc(token, 'POST', `/guilds/${g}/roles`, { name, mentionable: true, hoist: true, color });
    if (r.color !== color) await dc(token, 'PATCH', `/guilds/${g}/roles/${r.id}`, { color }).catch(() => {});
    return r.id;
  };
  const team = await role('Team', colorInt), vip = await role('VIP', VIP_GOLD);
  /* Categories and channels: found by the id we kept, else by name; renamed to the brand's style. */
  const have = await dc(token, 'GET', `/guilds/${g}/channels`);
  const byId = id => have.find(c => c.id === id);
  const byName = (names, type) => have.find(c => c.type === type && names.some(n => c.name.toLowerCase() === n.toLowerCase()));
  const cats = { ...(d.cats || {}) }, chans = { ...(d.channels || {}) }, made = [];
  for (const cat of CATS) {
    const want = catName(look, cat);
    let c = byId(cats[cat]) || byName([cat, want], 4);
    if (!c) c = await dc(token, 'POST', `/guilds/${g}/channels`, { name: want, type: 4 });
    else if (c.name !== want) await dc(token, 'PATCH', `/channels/${c.id}`, { name: want }).catch(e => notes.push(`${cat}: ${e.message}`));
    cats[cat] = c.id;
  }
  for (const c of CHANNELS) {
    const type = c.voice ? 2 : 0, want = styled(c);
    const ow = [];
    if (c.vip) ow.push({ id: g, type: 0, deny: String(VIEW) }, { id: vip, type: 0, allow: String(VIEW | (c.ro ? 0n : SEND)), deny: c.ro ? String(SEND) : '0' }, { id: team, type: 0, allow: String(VIEW | SEND) });
    else if (c.ro) ow.push({ id: g, type: 0, deny: String(SEND) }, { id: team, type: 0, allow: String(SEND) });
    else if (c.voice) ow.push({ id: g, type: 0, allow: String(VIEW | CONNECT) });
    let ch = byId(chans[c.name]) || byName([c.name, want], type);
    if (!ch) { ch = await dc(token, 'POST', `/guilds/${g}/channels`, { name: want, type, parent_id: cats[c.cat], topic: c.topic, permission_overwrites: ow }); made.push(c.name); }
    else if (ch.name !== want) await dc(token, 'PATCH', `/channels/${ch.id}`, { name: want }).catch(e => notes.push(`${c.name}: ${e.message}`));
    chans[c.name] = ch.id;
  }
  /* First posts, as the mascot. A new look or new pay words reposts them. */
  const core = opt.core || d.core || '', vipPay = opt.vip || d.vip || '';
  const sig = sigOf(look, core, vipPay);
  const posts = firstPosts({ name: brand.name, hub: brand.hub, skip: brand.skip, core, vip: vipPay, mascot: look.mascot, ch: chans });
  const posted = { ...(d.posted || {}) };
  for (const [name, p] of Object.entries(posts)) {
    const old = posted[name];
    if (old && typeof old === 'object' && old.sig === sig) continue;
    const oldId = typeof old === 'string' ? old : old?.id;
    if (oldId) await dc(token, 'DELETE', `/channels/${chans[name]}/messages/${oldId}`).catch(() => {});
    const m = await hookPost(token, d, name, chans[name], look, { embeds: [{ title: noDash(p.title).slice(0, 250), description: noDash(p.text).slice(0, 4000), color: colorInt }] });
    if (name !== 'this-week') await dc(token, 'PUT', `/channels/${chans[name]}/pins/${m.id}`).catch(() => {});
    posted[name] = { id: m.id, sig };
  }
  let invite = d.invite;
  if (!invite) { const iv = await dc(token, 'POST', `/channels/${chans.welcome}/invites`, { max_age: 0, max_uses: 0, unique: false }); invite = `https://discord.gg/${iv.code}`; }
  const out = { ...d, channels: chans, cats, roles: { team, vip }, posted, invite, core, vip: vipPay, built_at: new Date().toISOString() };
  await putDoc(env, act, out);
  /* The hub shows the invite on Start here. */
  const row = await env.DB.prepare(`SELECT week_json FROM p_amb_brand WHERE act_id = ?1`).bind(act).first().catch(() => null);
  if (row) { const w = safeJson(row.week_json, {}) || {}; if (w.discord !== invite) { w.discord = invite; await env.DB.prepare(`UPDATE p_amb_brand SET week_json = ?2, updated_at = datetime('now') WHERE act_id = ?1`).bind(act, JSON.stringify(w)).run(); } }
  return { made, out, notes };
}

const pub = (d, tok, me, b) => ({ has_token: !!tok, bot: me || null, guild_id: d?.guild_id || null, guild_name: d?.guild_name || null, built_at: d?.built_at || null, invite: d?.invite || null,
  channels: Object.keys(d?.channels || {}), core: d?.core || '', vip: d?.vip || '', look: { ...(d?.look || {}), ...lookOf(d || {}, b), saved: d?.look || {} } });

export async function handleDiscord(request, env, url, path, body, json, mustAccount, isClient) {
  if (isClient) return json({ error: 'That part is the Mobius team\'s.' }, 403);
  const method = request.method;
  const agency = await doc(env, 'agency');
  const token = agency?.token || '';
  try {
    if (path === '/api/amb/discord/token' && method === 'PUT') {
      const t = String(body.token || '').replace(/\s+/g, '');
      if (!t) { await env.DB.prepare(`DELETE FROM p_br_doc WHERE act_id = 'agency' AND line_id = '' AND key = 'discord'`).run(); return json({ ok: true, has_token: false }); }
      const me = await dc(t, 'GET', '/users/@me');
      const guilds = await dc(t, 'GET', '/users/@me/guilds').catch(() => []);
      await putDoc(env, 'agency', { token: t, bot: me.username, bot_id: me.id, verified_at: new Date().toISOString() });
      return json({ ok: true, has_token: true, bot: me.username, invite_bot: `https://discord.com/oauth2/authorize?client_id=${me.id}&scope=bot&permissions=8`, servers: (guilds || []).map(x => ({ id: x.id, name: x.name })) });
    }
    const act = url.searchParams.get('act') || body.act;
    if (path === '/api/amb/discord' && method === 'GET' && (!act || act === 'all')) {
      const guilds = token ? await dc(token, 'GET', '/users/@me/guilds').catch(() => []) : [];
      return json({ has_token: !!token, bot: agency?.bot || null, invite_bot: agency?.bot_id ? `https://discord.com/oauth2/authorize?client_id=${agency.bot_id}&scope=bot&permissions=8` : null, servers: (guilds || []).map(x => ({ id: x.id, name: x.name })) });
    }
    const acct = await mustAccount(env, act);
    const d = (await doc(env, acct.act_id)) || {};
    const b = await env.DB.prepare(`SELECT slug, display_name, accent, logo_url, checklist_json FROM p_amb_brand WHERE act_id = ?1`).bind(acct.act_id).first().catch(() => null);
    if (path === '/api/amb/discord' && method === 'GET') return json(pub(d, token, agency?.bot, b));
    if (!token) return json({ error: 'Add the Discord bot token first.' }, 400);
    if (path === '/api/amb/discord/server' && method === 'PUT') {
      const gid = String(body.guild_id || '').trim();
      if (!/^\d{15,22}$/.test(gid)) return json({ error: 'A server id is a long number. In Discord: right-click the server, Copy Server ID.' }, 400);
      const g = await dc(token, 'GET', `/guilds/${gid}`);
      const next = d.guild_id === gid ? { ...d, guild_name: g.name } : { guild_id: gid, guild_name: g.name, core: d.core || '', vip: d.vip || '', look: d.look };
      await putDoc(env, acct.act_id, next);
      return json({ ok: true, ...pub(next, token, agency?.bot, b) });
    }
    const brandOf = () => ({ row: b, name: b.display_name || acct.name, hub: `https://locus.go-mobius-digital.com/angles/${b.slug}/`, skip: safeJson(b.checklist_json, {})?.skip || [] });
    if (path === '/api/amb/discord/look' && method === 'PUT') {
      const s = (k, n) => noDash(body[k]).trim().slice(0, n);
      const look = { mascot: s('mascot', 32), avatar: s('avatar', 500), emoji: s('emoji', 16), color: s('color', 7), icon: s('icon', 500) };
      if (look.color && !HEX.test(look.color)) return json({ error: 'Colour must be a hex value like #0F7F73.' }, 400);
      for (const k of ['avatar', 'icon']) if (look[k] && !/^https:\/\/\S+$/i.test(look[k])) return json({ error: 'Picture links must start with https://' }, 400);
      if (/discord|clyde/i.test(look.mascot)) return json({ error: 'Discord does not allow "discord" in the mascot name.' }, 400);
      d.look = look;
      if (!d.guild_id || !b) { await putDoc(env, acct.act_id, d); return json({ ok: true, ...pub(d, token, agency?.bot, b) }); }
      const r = await build(env, token, acct.act_id, d, brandOf(), {});
      return json({ ok: true, notes: r.notes, ...pub(r.out, token, agency?.bot, b) });
    }
    if (!d.guild_id) return json({ error: 'Pick this brand\'s Discord server first.' }, 400);
    if (path === '/api/amb/discord/build' && method === 'POST') {
      if (!b) return json({ error: 'Set up this brand\'s creator hub first.' }, 400);
      const r = await build(env, token, acct.act_id, d, brandOf(), { core: noDash(body.core).slice(0, 120), vip: noDash(body.vip).slice(0, 160) });
      return json({ ok: true, made: r.made, notes: r.notes, ...pub(r.out, token, agency?.bot, b) });
    }
    const chan = name => (d.channels || {})[String(name || '').replace(/^#/, '')];
    if (path === '/api/amb/discord/messages' && method === 'GET') {
      const id = chan(url.searchParams.get('channel') || 'questions');
      if (!id) return json({ error: 'No such channel. Build the server first.' }, 404);
      const lim = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 50, 1), 100);
      const rows = await dc(token, 'GET', `/channels/${id}/messages?limit=${lim}`);
      return json({ channel: url.searchParams.get('channel') || 'questions', messages: (rows || []).reverse().map(m => ({ id: m.id, at: m.timestamp, user_id: m.author?.id, who: m.author?.global_name || m.author?.username, bot: !!(m.author?.bot || m.webhook_id), text: m.content || (m.embeds || []).map(e => [e.title, e.description].filter(Boolean).join('\n')).join('\n'), files: (m.attachments || []).length })) });
    }
    if (path === '/api/amb/discord/post' && method === 'POST') {
      const key = String(body.channel || '').replace(/^#/, '');
      const id = chan(key);
      const text = noDash(body.text).trim().slice(0, 1990);
      if (!id || !text) return json({ error: 'Give a channel and the text.' }, 400);
      const m = await hookPost(token, d, key, id, lookOf(d, b), { content: text, flags: 4 });
      await putDoc(env, acct.act_id, d);   // keeps a webhook made just now
      if (body.pin) await dc(token, 'PUT', `/channels/${id}/pins/${m.id}`).catch(() => {});
      return json({ ok: true, id: m.id });
    }
    if (path === '/api/amb/discord/vip' && method === 'POST') {
      const uid = String(body.user_id || '');
      if (!/^\d{15,22}$/.test(uid) || !d.roles?.vip) return json({ error: 'Give the member\'s user id, and build the server first.' }, 400);
      await dc(token, body.on === false ? 'DELETE' : 'PUT', `/guilds/${d.guild_id}/members/${uid}/roles/${d.roles.vip}`);
      return json({ ok: true, vip: body.on !== false });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status || 400); }
}
