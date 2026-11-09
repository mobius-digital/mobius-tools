/* PLATFORM STATUS (2026-11-06): the outage monitor that used to be its own worker (Mobius Pulse, mobius-ad-status)
 * now lives inside Locus. Cole: "remove the other Pulse thing ... Locus alerts would just get alerted then, and then
 * I would just click on there if I want to send it to all clients."
 *
 *   pulseTick      every 5 minutes (the 5-minute cron): read the public status feeds, keep the state and the last
 *                  300 changes in the settings table, and post a card to #outages when a service changes.
 *   pulseStatus    the same JSON the old /api/status gave (Tools > Platform status, the Day check, the Strategist).
 *   pulseButton    "Send to all clients" on the card: posts the notice to EVERY active brand's client channel,
 *                  read from the brands table at the moment of the tap. The old Pulse kept its own hand-ticked
 *                  list, which is why Ice & Gold and Yak (added after it was ticked) never got the Nov 6 notice.
 *
 * Alerts only on a change between two readable states; a feed that fails to load is "unknown" and never alerts. */

export const PLATFORMS = [
  { id: 'meta', short: 'Meta', name: 'Meta Ads', color: '#0866FF', type: 'metastatus', url: 'https://metastatus.com/data/orgs.json', link: 'https://metastatus.com',
    orgs: ['ads-manager', 'marketing-api', 'fbs', 'graph-api', 'catalog', 'fb-ig-shops', 'audience-network', 'facebook-login', 'ctx', 'whatsapp-business-api', 'ig-boost'] },
  { id: 'google-ads', short: 'Google', name: 'Google Ads', color: '#4285F4', type: 'google_incidents', url: 'https://ads.google.com/status/publisher/incidents.json', link: 'https://ads.google.com/status/publisher/', services: null },
  { id: 'shopify', short: 'Shopify', name: 'Shopify', color: '#5E8E3E', type: 'statuspage', url: 'https://www.shopifystatus.com/api/v2/summary.json', link: 'https://www.shopifystatus.com',
    components: ['Admin', 'Checkout', 'Storefront', 'API & Mobile', 'API', 'Point of Sale', 'Reports and Analytics', 'Support', 'Oxygen', 'Third party services'] },
  { id: 'pinterest', short: 'Pinterest', name: 'Pinterest Ads', color: '#E60023', type: 'statuspage', url: 'https://status.pinterest.com/api/v2/summary.json', link: 'https://status.pinterest.com', components: null },
  { id: 'openai', short: 'OpenAI', name: 'OpenAI / ChatGPT', color: '#10A37F', type: 'statuspage', url: 'https://status.openai.com/api/v2/summary.json', link: 'https://status.openai.com', components: null },
  { id: 'anthropic', short: 'Claude', name: 'Claude / Anthropic', color: '#D97757', type: 'statuspage', url: 'https://status.anthropic.com/api/v2/summary.json', link: 'https://status.anthropic.com', components: null },
  { id: 'microsoft-ads', name: 'Microsoft Ads', color: '#00A4EF', type: 'link', link: 'https://status.ads.microsoft.com/' },
  { id: 'tiktok-ads', name: 'TikTok Ads', color: '#111111', type: 'link', link: 'https://ads.tiktok.com/' },
  { id: 'linkedin-ads', name: 'LinkedIn Ads', color: '#0A66C2', type: 'link', link: 'https://www.linkedin.com/campaignmanager/' },
  { id: 'snapchat-ads', name: 'Snapchat Ads', color: '#FFFC00', type: 'link', link: 'https://ads.snapchat.com/' },
  { id: 'x-ads', name: 'X Ads', color: '#111111', type: 'link', link: 'https://ads.x.com/' },
  { id: 'amazon-ads', name: 'Amazon Ads', color: '#FF9900', type: 'link', link: 'https://advertising.amazon.com/' },
  { id: 'apple-ads', name: 'Apple Search Ads', color: '#555555', type: 'link', link: 'https://searchads.apple.com/' },
];
/* Alerts for the platforms that move ads or the store. OpenAI, Claude and Pinterest are watched, never posted
   (the old Pulse settings had them switched off too). */
const ALERT_ON = new Set(['meta', 'google-ads', 'shopify']);
const OUTAGES_CHANNEL = 'C0BHXMYRE5V';   // #outages
const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
const RANK = { operational: 0, degraded: 1, outage: 2, unknown: 0.5 };
const HISTORY_CAP = 300;
const K = { state: 'pulse:state', history: 'pulse:history', lastRun: 'pulse:lastRun' };

/* ---------------- feeds ---------------- */
function parseStatuspage(json, p) {
  return (json.components || []).filter(c => !c.group).filter(c => !p.components || p.components.includes(c.name)).map(c => ({
    key: c.id, name: c.name,
    state: c.status === 'operational' ? 'operational' : (c.status === 'degraded_performance' || c.status === 'under_maintenance') ? 'degraded' : 'outage',
    note: String(c.status || '').replace(/_/g, ' '),
  }));
}
function parseMetastatus(json, p) {
  return (json || []).filter(o => !p.orgs || p.orgs.includes(o.id)).map(org => {
    let worst = 'operational', note = 'No known issues';
    for (const svc of org.services || []) {
      const s = String(svc.status || '').toLowerCase();
      let st = 'operational';
      if (s && !s.includes('no known issues') && !s.includes('resolved')) st = (s.includes('major') || s.includes('outage')) ? 'outage' : 'degraded';
      if (RANK[st] > RANK[worst]) { worst = st; note = `${svc.name}: ${svc.status}`; }
    }
    return { key: org.id, name: org.name, state: worst, note };
  });
}
function parseGoogle(json, p) {
  const by = new Map();
  for (const inc of (json || []).filter(i => !i.end)) {
    const name = String(inc.service_name || 'Google Ads').trim();
    if (p.services && !p.services.includes(name)) continue;
    const sev = String(inc.status_impact || inc.severity || '').toLowerCase();
    const state = (sev.includes('outage') && !sev.includes('partial')) ? 'outage' : 'degraded';
    const prev = by.get(name);
    if (!prev || RANK[state] > RANK[prev.state]) by.set(name, { key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, state, note: String(inc.external_desc || '').slice(0, 200) });
  }
  return by.size ? [...by.values()] : [{ key: 'all', name: 'All Google Ads products', state: 'operational', note: 'No open incidents' }];
}
const PARSE = { statuspage: parseStatuspage, metastatus: parseMetastatus, google_incidents: parseGoogle };

async function poll(p, F) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await F(p.url, { signal: ctrl.signal, headers: { 'User-Agent': 'MobiusLocus/1.0 (+https://locus.go-mobius-digital.com)' }, cf: { cacheTtl: 0 } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const services = PARSE[p.type](await r.json(), p);
    return { id: p.id, name: p.name, ok: true, worst: services.reduce((w, s) => RANK[s.state] > RANK[w] ? s.state : w, 'operational'), services };
  } catch (e) {
    return { id: p.id, name: p.name, ok: false, worst: 'unknown', services: [], error: String(e?.message || e) };
  } finally { clearTimeout(t); }
}

/* ---------------- storage (the settings table) ---------------- */
async function get(env, k) { const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null); try { return r?.value ? JSON.parse(r.value) : null; } catch { return null; } }
async function put(env, k, v) { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, JSON.stringify(v)).run(); }

/** The JSON the old Pulse /api/status served, same shape, so the screen and market.js read it unchanged. */
export async function pulseStatus(env) {
  const [state, history, lastRun] = await Promise.all([get(env, K.state), get(env, K.history), get(env, K.lastRun)]);
  return {
    lastRun,
    platforms: PLATFORMS.map(p => ({ id: p.id, name: p.name, color: p.color, type: p.type, link: p.link, ...(state?.[p.id] ? { state: state[p.id] } : {}) })),
    incidents: (history || []).slice(0, 60),
  };
}

/** One-time carry-over from the old worker's KV (state + history), so the screen keeps its 14 days. */
export async function pulseImport(env, { state, history }) {
  if (state && typeof state === 'object') await put(env, K.state, state);
  if (Array.isArray(history)) await put(env, K.history, history.slice(0, HISTORY_CAP));
  return { state: !!state, history: Array.isArray(history) ? history.length : 0 };
}

/* ---------------- the 5-minute tick ---------------- */
export async function pulseTick(env, { F = fetch, slackApi } = {}) {
  const prevState = (await get(env, K.state)) || {};
  const results = await Promise.all(PLATFORMS.filter(p => p.type !== 'link').map(p => poll(p, F)));
  const now = new Date().toISOString(), next = {}, changes = [];
  for (const r of results) {
    const prev = prevState[r.id] || { services: {} };
    /* A feed that did not load keeps its last known services, so the next good read compares against them. */
    if (!r.ok && prev.services && Object.keys(prev.services).length) { next[r.id] = { ...prev, ok: false, error: r.error, checkedAt: now }; continue; }
    const svc = {};
    for (const s of r.services) {
      svc[s.key] = { name: s.name, state: s.state, note: s.note };
      const before = prev.services?.[s.key]?.state;
      if (before && before !== s.state) {
        /* On recovery the platform has usually cleared its text: quote what it is recovering from. */
        changes.push({ platformId: r.id, platform: r.name, service: s.name, from: before, to: s.state, note: s.state === 'operational' ? (prev.services[s.key].note || '') : s.note });
      }
    }
    next[r.id] = { name: r.name, worst: r.worst, ok: r.ok, error: r.error || null, services: svc, checkedAt: now };
  }
  const writes = [put(env, K.lastRun, now)];
  const stable = o => JSON.stringify(o).replace(/"checkedAt":"[^"]*"/g, '');
  if (stable(next) !== stable(prevState)) writes.push(put(env, K.state, next));
  if (changes.length) {
    const history = (await get(env, K.history)) || [];
    for (const t of changes) history.unshift({ ts: now, ...t, kind: t.to === 'operational' ? 'resolved' : 'incident' });
    writes.push(put(env, K.history, history.slice(0, HISTORY_CAP)));
  }
  await Promise.all(writes);

  const posted = [];
  const groups = {};
  for (const t of changes.filter(t => ALERT_ON.has(t.platformId))) (groups[t.platformId] ||= []).push(t);
  for (const [pid, list] of Object.entries(groups)) {
    if (!slackApi) break;
    const p = PLATFORMS.find(x => x.id === pid), id = `pulse:alert:${Date.now()}:${pid}`;
    const card = alertCard(p, list, { button: id, team: true });
    const r = await slackApi(env, 'chat.postMessage', { channel: OUTAGES_CHANNEL, username: 'Locus', icon_url: 'https://tools.go-mobius-digital.com/favicon.png', unfurl_links: false, ...card });
    await put(env, id, { pid, list, channel: r?.channel || OUTAGES_CHANNEL, ts: r?.ts || null, at: now });
    posted.push({ pid, ok: !!r?.ok, error: r?.ok ? undefined : r?.error });
  }
  return { checked: results.length, changes: changes.length, posted };
}

/* ---------------- the card ---------------- */
function when(iso) {
  return new Date(iso || Date.now()).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short' });
}
/** The same colored-bar card for #outages and for the client channels. `button` = the stored alert id (internal only). */
export function alertCard(p, list, { button, at, footer, team } = {}) {
  const short = p?.short || p?.name || 'Platform';
  const fixed = list.every(t => t.to === 'operational'), down = list.some(t => t.to === 'outage');
  /* 2026-11-09 (the lane format, lane.js): the team card in #outages starts with its lane; a client never sees it. */
  const blocks = team ? [{ type: 'section', text: { type: 'mrkdwn', text: '*OPS · Agency*' } }] : [];
  list.forEach((t, i) => {
    const what = t.service.replace(new RegExp(`^${short}\\s+`, 'i'), '');
    const status = t.to === 'operational' ? 'Working again' : t.to === 'outage' ? 'Outage' : 'Slow or partly down';
    const note = String(t.note || '').slice(0, 250);
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `${t.to === 'operational' ? '✅' : '⚠️'}  *${short}: ${what}*` } });
    if (i === 0) blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${status}*${note ? `\n_${t.to === 'operational' ? 'Was: ' : ''}${note}_` : ''}` } });
  });
  const lines = [`${fixed ? 'Fixed' : 'Posted'} by ${short} at ${when(at)}${p?.link ? `   ·   <${p.link}|${short} status page>` : ''}`];
  if (button) lines[0] += `   ·   <${LOCUS}?open=pulse|Platform status in Locus>`;
  if (footer) lines.push(footer);
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: lines.join('\n') }] });
  if (button) blocks.push({ type: 'actions', elements: [{ type: 'button', action_id: 'pulse_send', value: button, style: fixed ? 'primary' : 'danger', text: { type: 'plain_text', text: 'Send to all clients' } }] });
  return { text: `${team ? 'OPS · Agency: ' : ''}${short}: ${list.map(t => `${t.service} ${t.to === 'operational' ? 'working again' : t.to}`).join(', ')}`, attachments: [{ color: fixed ? '#2EB67D' : down ? '#D0342C' : '#ECB22E', blocks }] };
}

/** Every active brand's client channel, read now (a new client is included the day it is set up). */
export async function clientChannels(env) {
  const rows = (await env.DB.prepare(`SELECT name, client_channel FROM brands WHERE status = 'active' AND client_channel IS NOT NULL AND client_channel <> '' ORDER BY name`).all()).results || [];
  const seen = new Set();
  return rows.filter(r => !seen.has(r.client_channel) && seen.add(r.client_channel));
}

/** "Send to all clients": acked at once, sent after, then the #outages card says who got it. */
export async function pulseButton(env, ctx, payload, { slackApi, ACK }) {
  const tap = (payload.actions || []).find(a => a.action_id === 'pulse_send');
  const id = String(tap?.value || ''), who = payload.user?.id ? `<@${payload.user.id}>` : 'someone';
  ctx.waitUntil((async () => {
    const a = id.startsWith('pulse:alert:') ? await get(env, id) : null;
    const ch = payload.channel?.id, ts = payload.message?.ts;
    if (!a) { if (ch && payload.user?.id) await slackApi(env, 'chat.postEphemeral', { channel: ch, user: payload.user.id, text: 'That alert is too old to send now.' }); return; }
    if (a.sent) { if (ch && payload.user?.id) await slackApi(env, 'chat.postEphemeral', { channel: ch, user: payload.user.id, text: `Already sent ${a.sent}. Nothing sent twice.` }); return; }
    a.sent = `by ${who} at ${when()}`; await put(env, id, a);   // claimed before sending, so a double tap cannot post twice
    const p = PLATFORMS.find(x => x.id === a.pid);
    const card = alertCard(p, a.list, { at: a.at });
    const list = await clientChannels(env), ok = [], bad = [];
    for (const c of list) {
      const r = await slackApi(env, 'chat.postMessage', { channel: c.client_channel, username: 'Mobius Digital', icon_url: 'https://tools.go-mobius-digital.com/favicon.png', unfurl_links: false, ...card });
      (r?.ok ? ok : bad).push(r?.ok ? c.name : `${c.name} (${r?.error || 'failed'})`);
    }
    a.result = { ok, bad }; await put(env, id, a);
    const note = `📣 Sent to ${ok.length} of ${list.length} clients ${a.sent}${ok.length ? `: ${ok.join(', ')}` : ''}${bad.length ? `\n⚠️ Not sent: ${bad.join(', ')}` : ''}`;
    if (ch && ts) await slackApi(env, 'chat.update', { channel: ch, ts, ...alertCard(p, a.list, { at: a.at, footer: note, team: true }) });
  })().catch(e => console.log('pulse send: ' + e.message)));
  return ACK();
}
