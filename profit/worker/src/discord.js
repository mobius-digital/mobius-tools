/* DISCORD FOR THE CREATOR PROGRAM (2026-11-05, Trybe Scale).
 *
 * Each brand's creators talk in a Discord server; Trybe is only where they upload, get samples and get paid.
 * Locus holds ONE bot token for the agency (p_br_doc act 'agency', key 'discord') and each brand's server id
 * (p_br_doc key 'discord' on the brand). With those, Locus can build a server from the template below, post in it,
 * read it and move a creator to VIP. The token never leaves this file: only "has a token" and the bot's name do.
 *
 * Routes (staff only, mounted by amb.js under /api/amb/discord):
 *   GET  /api/amb/discord?act=            what is connected: bot, server, channels, invite
 *   PUT  /api/amb/discord/token {token}   store the agency bot token (checked with one real call)
 *   PUT  /api/amb/discord/server {act, guild_id}   which server is this brand's (the bot must be in it)
 *   POST /api/amb/discord/build {act, core, vip}   make the roles, channels and first posts; safe to run twice
 *   GET  /api/amb/discord/messages?act=&channel=questions&limit=50   recent messages, oldest first
 *   POST /api/amb/discord/post {act, channel, text, pin}             post as the bot
 *   POST /api/amb/discord/vip {act, user_id, on}                     give or take the VIP role
 * No em dashes in anything this posts. */
const API = 'https://discord.com/api/v10';
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const noDash = s => String(s || '').replace(/\s*[—–]\s*/g, ', ');
const VIEW = 1024n, SEND = 2048n, CONNECT = 1048576n;

async function doc(env, act) {
  const r = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'discord'`).bind(act).first().catch(() => null);
  return safeJson(r?.data_json, null);
}
async function putDoc(env, act, data) {
  await env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', 'discord', ?2, 'approved', 'staff', datetime('now'))
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).bind(act, JSON.stringify(data)).run();
}
async function dc(token, method, path, body) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(API + path, { method, headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'LocusCreators (https://locus.go-mobius-digital.com, 1)' }, body: body ? JSON.stringify(body) : undefined });
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

/* The template. `ro` = only the team posts; `vip` = hidden from everyone but VIP and the team. */
const CHANNELS = [
  { cat: 'START HERE', name: 'welcome', ro: true, topic: 'How this works. Read this first.' },
  { cat: 'START HERE', name: 'rules', ro: true, topic: 'What gets a video approved.' },
  { cat: 'START HERE', name: 'announcements', ro: true, topic: 'News from the team.' },
  { cat: 'FILM', name: 'this-week', ro: true, topic: 'The videos to film this week. One idea every weekday.' },
  { cat: 'FILM', name: 'questions', topic: 'Ask anything. We answer within a day.' },
  { cat: 'FILM', name: 'feedback-before-upload', topic: 'Post a video here and get notes before you upload it.' },
  { cat: 'WINS', name: 'winners', ro: true, topic: 'The videos that sold, every Friday.' },
  { cat: 'VIP', name: 'vip', vip: true, topic: 'For creators whose videos made sales.' },
  { cat: 'VIP', name: 'vip-briefs', vip: true, ro: true, topic: 'Next week, early.' },
  { cat: 'CALL', name: 'Monday Call', voice: true },
];
export function firstPosts(b) {
  const skip = (b.skip || []).slice(0, 4).map(x => `Do not: ${String(x).replace(/\.$/, '')}.`);
  const rules = [...skip, 'If you say the deal, say it exactly as written on the hub.', 'No music playing and no other brand logos in the shot.', '30 to 45 seconds, filmed upright on a phone.', 'One video per idea. Write the idea name in the notes when you upload.'];
  return {
    welcome: `**Welcome to ${b.name} Creators.**\n\nThis Discord is where we talk. TRYBE is only where you upload your videos and get paid.\n\n**How it works**\n1. Open the creator hub: ${b.hub}\n2. Pick one of this week's videos and film it on your phone.\n3. Upload it on TRYBE.\n4. We run the good ones as ads.${b.core ? ` You earn ${b.core}.` : ' You earn on every sale.'}\n\n**Where things are**\n#rules has what gets a video approved.\n#this-week has one video idea every weekday.\n#questions is for anything you are unsure about.\n#feedback-before-upload is where you post a video and get notes first.\n#winners shows the videos that sold, every Friday.\n\n**Moving up**\nWhen your videos make sales you get invited to VIP.${b.vip ? ` VIP earns ${b.vip}.` : ' VIP earns more.'}`,
    rules: `**The rules.** A video that breaks one cannot run as an ad.\n\n${rules.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nThe full list, with examples: ${b.hub}#rules\n\n**In this server:** be kind, no selling to each other, and ask before you share someone else's video.`,
    'this-week': `**This week's videos are up:** ${b.hub}\n\nFive videos to film. Each one has an example to watch, the first line to say and the shots to get.\n\nStart with idea 1. A new one is posted here every weekday morning.`,
    vip: `**Welcome to VIP.**\n\nYou are here because your videos made sales. That is the only way in.\n\n1. ${b.vip ? `You now earn ${b.vip}.` : 'You now earn more on every sale.'}\n2. You get next week's videos here first, on Friday.\n3. When a video of yours wins, we ask you first for the next version.\n\nKeep VIP private. Other creators earn their way in the same way you did.`,
  };
}

async function build(env, token, act, d, brand, opt) {
  const g = d.guild_id;
  const roles = await dc(token, 'GET', `/guilds/${g}/roles`);
  const role = async name => (roles.find(r => r.name === name) || await dc(token, 'POST', `/guilds/${g}/roles`, { name, mentionable: true, hoist: true })).id;
  const team = await role('Team'), vip = await role('VIP');
  const have = await dc(token, 'GET', `/guilds/${g}/channels`);
  const find = (name, type) => have.find(c => c.name.toLowerCase() === name.toLowerCase() && c.type === type);
  const cats = {}, chans = { ...(d.channels || {}) }, made = [];
  for (const c of CHANNELS) {
    if (!cats[c.cat]) cats[c.cat] = (find(c.cat, 4) || await dc(token, 'POST', `/guilds/${g}/channels`, { name: c.cat, type: 4 })).id;
    const type = c.voice ? 2 : 0;
    const ow = [];
    if (c.vip) ow.push({ id: g, type: 0, deny: String(VIEW) }, { id: vip, type: 0, allow: String(VIEW | (c.ro ? 0n : SEND)), deny: c.ro ? String(SEND) : '0' }, { id: team, type: 0, allow: String(VIEW | SEND) });
    else if (c.ro) ow.push({ id: g, type: 0, deny: String(SEND) }, { id: team, type: 0, allow: String(SEND) });
    else if (c.voice) ow.push({ id: g, type: 0, allow: String(VIEW | CONNECT) });
    let ch = find(c.name, type);
    if (!ch) { ch = await dc(token, 'POST', `/guilds/${g}/channels`, { name: c.name, type, parent_id: cats[c.cat], topic: c.topic, permission_overwrites: ow }); made.push(c.name); }
    chans[c.name] = ch.id;
  }
  const posts = firstPosts({ name: brand.name, hub: brand.hub, skip: brand.skip, core: opt.core || d.core, vip: opt.vip || d.vip });
  const posted = { ...(d.posted || {}) };
  for (const [name, text] of Object.entries(posts)) {
    if (posted[name]) continue;
    const m = await dc(token, 'POST', `/channels/${chans[name]}/messages`, { content: noDash(text).slice(0, 1990), allowed_mentions: { parse: [] }, flags: 4 });
    if (name !== 'this-week') await dc(token, 'PUT', `/channels/${chans[name]}/pins/${m.id}`).catch(() => {});
    posted[name] = m.id;
  }
  let invite = d.invite;
  if (!invite) { const iv = await dc(token, 'POST', `/channels/${chans.welcome}/invites`, { max_age: 0, max_uses: 0, unique: false }); invite = `https://discord.gg/${iv.code}`; }
  const out = { ...d, channels: chans, roles: { team, vip }, posted, invite, core: opt.core || d.core || '', vip: opt.vip || d.vip || '', built_at: new Date().toISOString() };
  await putDoc(env, act, out);
  /* The hub shows the invite on Start here. */
  const row = await env.DB.prepare(`SELECT week_json FROM p_amb_brand WHERE act_id = ?1`).bind(act).first().catch(() => null);
  if (row) { const w = safeJson(row.week_json, {}) || {}; if (w.discord !== invite) { w.discord = invite; await env.DB.prepare(`UPDATE p_amb_brand SET week_json = ?2, updated_at = datetime('now') WHERE act_id = ?1`).bind(act, JSON.stringify(w)).run(); } }
  return { made, out };
}

const pub = (d, tok, me) => ({ has_token: !!tok, bot: me || null, guild_id: d?.guild_id || null, guild_name: d?.guild_name || null, built_at: d?.built_at || null, invite: d?.invite || null,
  channels: Object.keys(d?.channels || {}), core: d?.core || '', vip: d?.vip || '' });

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
    if (path === '/api/amb/discord' && method === 'GET') return json(pub(d, token, agency?.bot));
    if (!token) return json({ error: 'Add the Discord bot token first.' }, 400);
    if (path === '/api/amb/discord/server' && method === 'PUT') {
      const gid = String(body.guild_id || '').trim();
      if (!/^\d{15,22}$/.test(gid)) return json({ error: 'A server id is a long number. In Discord: right-click the server, Copy Server ID.' }, 400);
      const g = await dc(token, 'GET', `/guilds/${gid}`);
      const next = d.guild_id === gid ? { ...d, guild_name: g.name } : { guild_id: gid, guild_name: g.name, core: d.core || '', vip: d.vip || '' };
      await putDoc(env, acct.act_id, next);
      return json({ ok: true, ...pub(next, token, agency?.bot) });
    }
    if (!d.guild_id) return json({ error: 'Pick this brand\'s Discord server first.' }, 400);
    if (path === '/api/amb/discord/build' && method === 'POST') {
      const b = await env.DB.prepare(`SELECT slug, display_name, checklist_json FROM p_amb_brand WHERE act_id = ?1`).bind(acct.act_id).first();
      if (!b) return json({ error: 'Set up this brand\'s creator hub first.' }, 400);
      const r = await build(env, token, acct.act_id, d, { name: b.display_name || acct.name, hub: `https://locus.go-mobius-digital.com/angles/${b.slug}/`, skip: safeJson(b.checklist_json, {})?.skip || [] }, { core: noDash(body.core).slice(0, 120), vip: noDash(body.vip).slice(0, 160) });
      return json({ ok: true, made: r.made, ...pub(r.out, token, agency?.bot) });
    }
    const chan = name => (d.channels || {})[String(name || '').replace(/^#/, '')];
    if (path === '/api/amb/discord/messages' && method === 'GET') {
      const id = chan(url.searchParams.get('channel') || 'questions');
      if (!id) return json({ error: 'No such channel. Build the server first.' }, 404);
      const lim = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 50, 1), 100);
      const rows = await dc(token, 'GET', `/channels/${id}/messages?limit=${lim}`);
      return json({ channel: url.searchParams.get('channel') || 'questions', messages: (rows || []).reverse().map(m => ({ id: m.id, at: m.timestamp, user_id: m.author?.id, who: m.author?.global_name || m.author?.username, bot: !!m.author?.bot, text: m.content, files: (m.attachments || []).length })) });
    }
    if (path === '/api/amb/discord/post' && method === 'POST') {
      const id = chan(body.channel);
      const text = noDash(body.text).trim().slice(0, 1990);
      if (!id || !text) return json({ error: 'Give a channel and the text.' }, 400);
      const m = await dc(token, 'POST', `/channels/${id}/messages`, { content: text, allowed_mentions: { parse: [] }, flags: 4 });
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
