/**
 * Mobius Pulse — ad platform monitoring worker (Cloudflare Workers)
 *
 * Polls ad-platform status feeds every 5 minutes (cron), detects up/down
 * transitions, posts alerts to an internal Slack channel with a
 * "Send to client channels" button, and serves a JSON feed for the dashboard.
 *
 * Bindings (see wrangler.toml):
 *   KV                  — KV namespace for state, settings, incident history
 * Secrets (wrangler secret put <NAME>):
 *   SLACK_BOT_TOKEN     — xoxb- token from the Slack app
 *   SLACK_SIGNING_SECRET— Slack app signing secret (verifies button clicks)
 *   ADMIN_TOKEN         — long random string; guards the settings API
 */

/* ------------------------------------------------------------------ */
/*  Platform registry                                                  */
/* ------------------------------------------------------------------ */

const PLATFORMS = [
  {
    id: 'meta', short: 'Meta', name: 'Meta Ads', color: '#0866FF',
    type: 'metastatus',
    url: 'https://metastatus.com/data/orgs.json',
    link: 'https://metastatus.com',
    // metastatus org ids we surface (null = all)
    orgs: ['ads-manager', 'marketing-api', 'fbs', 'graph-api', 'catalog',
           'fb-ig-shops', 'audience-network', 'facebook-login', 'ctx',
           'whatsapp-business-api', 'ig-boost'],
  },
  {
    id: 'google-ads', short: 'Google', name: 'Google Ads', color: '#4285F4',
    type: 'google_incidents',
    url: 'https://ads.google.com/status/publisher/incidents.json',
    link: 'https://ads.google.com/status/publisher/',
    // service_name whitelist (trimmed compare, null = all)
    services: null,
  },
  {
    id: 'shopify', short: 'Shopify', name: 'Shopify', color: '#5E8E3E',
    type: 'statuspage',
    url: 'https://www.shopifystatus.com/api/v2/summary.json',
    link: 'https://www.shopifystatus.com',
    components: ['Admin', 'Checkout', 'Storefront', 'API & Mobile', 'API',
                 'Point of Sale', 'Reports and Analytics', 'Support', 'Oxygen', 'Third party services'],
  },
  {
    id: 'pinterest', short: 'Pinterest', name: 'Pinterest Ads', color: '#E60023',
    type: 'statuspage',
    url: 'https://status.pinterest.com/api/v2/summary.json',
    link: 'https://status.pinterest.com',
    components: null,
  },
  {
    id: 'openai', short: 'OpenAI', name: 'OpenAI / ChatGPT', color: '#10A37F',
    type: 'statuspage',
    url: 'https://status.openai.com/api/v2/summary.json',
    link: 'https://status.openai.com',
    components: null,
  },
  {
    id: 'anthropic', short: 'Claude', name: 'Claude / Anthropic', color: '#D97757',
    type: 'statuspage',
    url: 'https://status.anthropic.com/api/v2/summary.json',
    link: 'https://status.anthropic.com',
    components: null,
  },
  // ---- link-only (no public machine-readable feed today) ----
  { id: 'microsoft-ads', name: 'Microsoft Ads', color: '#00A4EF', type: 'link', link: 'https://status.ads.microsoft.com/' },
  { id: 'tiktok-ads',    name: 'TikTok Ads',    color: '#111111', type: 'link', link: 'https://ads.tiktok.com/' },
  { id: 'linkedin-ads',  name: 'LinkedIn Ads',  color: '#0A66C2', type: 'link', link: 'https://www.linkedin.com/campaignmanager/' },
  { id: 'snapchat-ads',  name: 'Snapchat Ads',  color: '#FFFC00', type: 'link', link: 'https://ads.snapchat.com/' },
  { id: 'x-ads',         name: 'X Ads',         color: '#111111', type: 'link', link: 'https://ads.x.com/' },
  { id: 'amazon-ads',    name: 'Amazon Ads',    color: '#FF9900', type: 'link', link: 'https://advertising.amazon.com/' },
  { id: 'apple-ads',     name: 'Apple Search Ads', color: '#555555', type: 'link', link: 'https://searchads.apple.com/' },
];

const STATE_RANK = { operational: 0, degraded: 1, outage: 2, unknown: 0.5 };
const HISTORY_CAP = 300;
const FETCH_TIMEOUT_MS = 15000;

/* ------------------------------------------------------------------ */
/*  Parsers — each returns [{ key, name, state, note }]                */
/*  state: 'operational' | 'degraded' | 'outage'                       */
/* ------------------------------------------------------------------ */

function parseStatuspage(json, platform) {
  const comps = (json.components || [])
    .filter(c => !c.group) // skip group containers
    .filter(c => !platform.components || platform.components.includes(c.name));
  return comps.map(c => ({
    key: c.id,
    name: c.name,
    state: c.status === 'operational' ? 'operational'
         : (c.status === 'degraded_performance' || c.status === 'under_maintenance') ? 'degraded'
         : 'outage', // partial_outage, major_outage
    note: c.status.replace(/_/g, ' '),
  }));
}

function parseMetastatus(json, platform) {
  const orgs = json.filter(o => !platform.orgs || platform.orgs.includes(o.id));
  const out = [];
  for (const org of orgs) {
    // Roll each org (product) up to one service line; note worst sub-service.
    let worst = 'operational';
    let note = 'No known issues';
    for (const svc of org.services || []) {
      const s = String(svc.status || '').toLowerCase();
      let st = 'operational';
      if (s && !s.includes('no known issues') && !s.includes('resolved')) {
        st = (s.includes('major') || s.includes('outage')) ? 'outage' : 'degraded';
      }
      if (STATE_RANK[st] > STATE_RANK[worst]) { worst = st; note = `${svc.name}: ${svc.status}`; }
    }
    out.push({ key: org.id, name: org.name, state: worst, note });
  }
  return out;
}

function parseGoogleIncidents(json, platform) {
  // Feed is a list of incidents (open incidents have no `end`).
  // Surface one service line per product with an open incident;
  // plus a synthetic "All Google Ads products" line when everything is clear.
  const open = (json || []).filter(i => !i.end);
  const byService = new Map();
  for (const inc of open) {
    const name = String(inc.service_name || 'Google Ads').trim();
    if (platform.services && !platform.services.includes(name)) continue;
    const sev = String(inc.status_impact || inc.severity || '').toLowerCase();
    const state = (sev.includes('outage') && !sev.includes('partial')) ? 'outage' : 'degraded';
    const prev = byService.get(name);
    if (!prev || STATE_RANK[state] > STATE_RANK[prev.state]) {
      byService.set(name, {
        key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name, state,
        note: (inc.external_desc || '').slice(0, 200),
      });
    }
  }
  if (byService.size === 0) {
    return [{ key: 'all', name: 'All Google Ads products', state: 'operational', note: 'No open incidents' }];
  }
  return [...byService.values()];
}

const PARSERS = {
  statuspage: parseStatuspage,
  metastatus: parseMetastatus,
  google_incidents: parseGoogleIncidents,
};

/* ------------------------------------------------------------------ */
/*  Polling + diffing                                                  */
/* ------------------------------------------------------------------ */

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'MobiusPulse/1.0 (+https://tools.go-mobius-digital.com/pulse)' },
      cf: { cacheTtl: 0 },
    });
  } finally { clearTimeout(t); }
}

async function pollPlatform(platform) {
  try {
    const res = await fetchWithTimeout(platform.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const services = PARSERS[platform.type](json, platform);
    const worst = services.reduce(
      (w, s) => STATE_RANK[s.state] > STATE_RANK[w] ? s.state : w, 'operational');
    return { id: platform.id, name: platform.name, ok: true, worst, services };
  } catch (err) {
    return { id: platform.id, name: platform.name, ok: false, worst: 'unknown',
             services: [], error: String(err && err.message || err) };
  }
}

async function runPoll(env, { force = false } = {}) {
  const [settings, prevState] = await Promise.all([
    getSettings(env),
    env.KV.get('state', 'json').then(v => v || {}),
  ]);

  const monitored = PLATFORMS.filter(p => p.type !== 'link');
  const results = await Promise.all(monitored.map(pollPlatform));

  const newState = {};
  const transitions = []; // {platform, service, from, to, note}

  for (const r of results) {
    const prev = prevState[r.id] || { services: {} };
    const svcStates = {};
    for (const s of r.services) {
      svcStates[s.key] = { name: s.name, state: s.state, note: s.note };
      const before = prev.services?.[s.key]?.state;
      if (before && before !== s.state && s.state !== 'unknown' && before !== 'unknown') {
        transitions.push({ platformId: r.id, platform: r.name, service: s.name,
                           from: before, to: s.state, note: s.note });
      }
    }
    newState[r.id] = {
      name: r.name, worst: r.worst, ok: r.ok, error: r.error || null,
      services: svcStates, checkedAt: new Date().toISOString(),
    };
  }

  // Persist. KV free tier allows 1k writes/day, so only write what changed:
  // lastRun every poll (the watchdog heartbeat), state/history on change only.
  const now = new Date().toISOString();
  const writes = [env.KV.put('lastRun', now)];

  const stateStr = JSON.stringify(newState);
  // strip volatile checkedAt before comparing so quiet polls skip the write
  const stable = s => s.replace(/"checkedAt":"[^"]*"/g, '');
  if (stable(stateStr) !== stable(JSON.stringify(prevState))) {
    writes.push(env.KV.put('state', stateStr));
  }

  if (transitions.length) {
    const history = (await env.KV.get('history', 'json')) || [];
    for (const t of transitions) {
      history.unshift({ ts: now, ...t,
        kind: t.to === 'operational' ? 'resolved' : 'incident' });
    }
    if (history.length > HISTORY_CAP) history.length = HISTORY_CAP;
    writes.push(env.KV.put('history', JSON.stringify(history)));
  }

  await Promise.all(writes);

  // Slack alerts — grouped per platform, honoring per-platform toggles
  const alertable = transitions.filter(t =>
    settings.platforms?.[t.platformId]?.alerts !== false);
  if (alertable.length && settings.channels?.internal && env.SLACK_BOT_TOKEN) {
    const groups = {};
    for (const t of alertable) (groups[t.platformId] ||= []).push(t);
    for (const [pid, ts] of Object.entries(groups)) {
      await sendAlert(env, settings, pid, ts);
    }
  }

  return { checked: results.length, transitions: transitions.length, alerted: alertable.length, at: now };
}

/* ------------------------------------------------------------------ */
/*  Slack                                                              */
/* ------------------------------------------------------------------ */

async function slackApi(env, method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) console.log(`Slack ${method} error: ${json.error}`);
  return json;
}

function fmtWhen() {
  return new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

const DASHBOARD_URL = 'https://tools.go-mobius-digital.com/pulse/';

/**
 * Build a Slack message in the AdStatus colored-bar card style:
 *
 *   ▌ ⚠️ Meta — Ads Manager                      title
 *   ▌ ───────────────────────                    single divider
 *   ▌ Outage detected                            bold status headline
 *   ▌ Ads Creation and Editing: Major disr…      gray detail
 *   ▌ Detected at: … · View details → · dash     gray footer (same block)
 *
 * Slack force-collapses attachments with too many blocks behind
 * "Show more", so the card is kept to ≤5 blocks: one divider only, and
 * the detail + footer share a single context block (visually identical
 * to separate blocks — context lines stack).
 * `short` is the platform's short display name ("Meta", "Google", "Shopify").
 */
function buildAlertMessage(short, transitions, { withButton, alertId, sentNote, link } = {}) {
  const isRecovery = transitions.every(t => t.to === 'operational');
  const hasOutage = transitions.some(t => t.to === 'outage');
  const color = isRecovery ? '#2EB67D' : hasOutage ? '#D0342C' : '#ECB22E';

  const blocks = [];
  transitions.forEach((t, i) => {
    const icon = t.to === 'operational' ? '✅' : '⚠️';
    // strip a redundant platform prefix ("Google Ad Manager" → "Ad Manager")
    const category = t.service.replace(new RegExp(`^${short}\\s+`, 'i'), '');
    const status = t.to === 'operational' ? 'Recovered'
      : t.to === 'outage' ? 'Outage detected'
      : 'Degraded performance';
    blocks.push({ type: 'section', text: { type: 'mrkdwn',
      text: `${icon}  *${short} — ${category}*` } });
    if (i === 0) blocks.push({ type: 'divider' });
    // status + detail share one section — a separate context block for the
    // detail plus the second divider would trip Slack's "Show more" collapse
    const detail = t.note && t.to !== 'operational' ? `\n${t.note.slice(0, 250)}` : '';
    blocks.push({ type: 'section', text: { type: 'mrkdwn',
      text: `*${status}*${detail}` } });
  });

  blocks.push({ type: 'divider' });
  const links = link
    ? `<${link}|View details →>   ·   <${DASHBOARD_URL}|Pulse dashboard>`
    : `<${DASHBOARD_URL}|Pulse dashboard →>`;
  const footerLines = [
    `${isRecovery ? 'Resolved' : 'Detected'} at: ${fmtWhen()}   ·   ${links}`,
    ...(sentNote ? [sentNote] : []),
  ];
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn',
    text: footerLines.join('\n') }] });

  if (withButton) {
    blocks.push({ type: 'actions', elements: [{
      type: 'button',
      style: isRecovery ? 'primary' : 'danger',
      text: { type: 'plain_text', text: '📣 Send to client channels', emoji: true },
      action_id: 'send_to_clients',
      value: alertId,
    }] });
  }

  // fallback lives on the attachment (not top-level text) so no summary
  // line renders above the card
  return {
    attachments: [{
      color,
      fallback: `${short}: ${transitions.map(t => `${t.service} → ${t.to}`).join(', ')}`,
      blocks,
    }],
  };
}

async function sendAlert(env, settings, platformId, transitions) {
  const platform = PLATFORMS.find(p => p.id === platformId);
  const name = platform ? (platform.short || platform.name) : platformId;
  const link = platform ? platform.link : null;
  const alertId = `alert:${Date.now()}:${platformId}`;
  // Store the payload so the button click can re-render it for client channels
  await env.KV.put(alertId, JSON.stringify({ platformName: name, link, transitions }),
                   { expirationTtl: 7 * 24 * 3600 });
  await slackApi(env, 'chat.postMessage', {
    channel: settings.channels.internal,
    ...buildAlertMessage(name, transitions, { withButton: true, alertId, link }),
    unfurl_links: false,
  });
}

/** Verify Slack request signature (v0 scheme). */
async function verifySlackSignature(env, request, rawBody) {
  const ts = request.headers.get('x-slack-request-timestamp');
  const sig = request.headers.get('x-slack-signature');
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay guard
  const base = `v0:${ts}:${rawBody}`;
  const key = await crypto.subtle.importKey('raw',
    new TextEncoder().encode(env.SLACK_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(base));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  const expected = `v0=${hex}`;
  // constant-time-ish compare
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function handleSlackInteract(request, env, ctx) {
  const rawBody = await request.text();
  if (!(await verifySlackSignature(env, request, rawBody))) {
    return new Response('bad signature', { status: 401 });
  }
  const params = new URLSearchParams(rawBody);
  const payload = JSON.parse(params.get('payload') || '{}');
  const action = payload.actions && payload.actions[0];
  if (!action || action.action_id !== 'send_to_clients') {
    return new Response('', { status: 200 });
  }

  // Ack immediately; do the fan-out in the background.
  ctx.waitUntil((async () => {
    const settings = await getSettings(env);
    const stored = await env.KV.get(action.value, 'json');
    const user = payload.user ? `<@${payload.user.id}>` : 'someone';
    const clients = settings.channels?.clients || [];

    let sent = 0;
    if (stored) {
      for (const ch of clients) {
        const r = await slackApi(env, 'chat.postMessage', {
          channel: ch,
          ...buildAlertMessage(stored.platformName, stored.transitions,
            { withButton: false, link: stored.link }),
          unfurl_links: false,
        });
        if (r.ok) sent++;
      }
    }

    // Rebuild the original message without the fan-out button + a confirmation line.
    if (stored && payload.response_url) {
      const sentNote = sent > 0
        ? `📣 Sent to ${sent}/${clients.length} client channel${clients.length === 1 ? '' : 's'} by ${user}`
        : `⚠️ Not sent — ${clients.length === 0 ? 'no client channels configured in settings' : 'alert expired or Slack error'}`;
      await fetch(payload.response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replace_original: true,
          ...buildAlertMessage(stored.platformName, stored.transitions,
            { withButton: false, sentNote, link: stored.link }),
        }),
      });
    }
  })());

  return new Response('', { status: 200 });
}

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS = {
  channels: { internal: '', clients: [] },
  platforms: Object.fromEntries(
    PLATFORMS.filter(p => p.type !== 'link').map(p => [p.id, { alerts: true }])),
};

async function getSettings(env) {
  const s = await env.KV.get('settings', 'json');
  if (!s) return structuredClone(DEFAULT_SETTINGS);
  // merge defaults for any platform added later
  for (const p of PLATFORMS.filter(p => p.type !== 'link')) {
    if (!s.platforms) s.platforms = {};
    if (!s.platforms[p.id]) s.platforms[p.id] = { alerts: true };
  }
  if (!s.channels) s.channels = { internal: '', clients: [] };
  return s;
}

function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  return env.ADMIN_TOKEN && auth === `Bearer ${env.ADMIN_TOKEN}`;
}

/* ------------------------------------------------------------------ */
/*  HTTP routes                                                        */
/* ------------------------------------------------------------------ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', ...CORS },
});

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPoll(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    /* ---- public ---- */
    if (path === '/health') {
      const lastRun = await env.KV.get('lastRun');
      return json({ ok: true, lastRun });
    }

    if (path === '/api/status') {
      const [state, history, lastRun] = await Promise.all([
        env.KV.get('state', 'json'),
        env.KV.get('history', 'json'),
        env.KV.get('lastRun'),
      ]);
      return json({
        lastRun,
        platforms: PLATFORMS.map(p => ({
          id: p.id, name: p.name, color: p.color, type: p.type, link: p.link,
          ...(state?.[p.id] ? { state: state[p.id] } : {}),
        })),
        incidents: (history || []).slice(0, 60),
      });
    }

    if (path === '/slack/interact' && request.method === 'POST') {
      return handleSlackInteract(request, env, ctx);
    }

    /* ---- admin ---- */
    if (path.startsWith('/api/')) {
      if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);

      if (path === '/api/settings' && request.method === 'GET') {
        return json(await getSettings(env));
      }

      if (path === '/api/settings' && request.method === 'PUT') {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') return json({ error: 'bad body' }, 400);
        const cur = await getSettings(env);
        const next = {
          channels: {
            internal: String(body.channels?.internal ?? cur.channels.internal ?? ''),
            clients: Array.isArray(body.channels?.clients)
              ? body.channels.clients.map(String).filter(Boolean)
              : cur.channels.clients,
          },
          platforms: { ...cur.platforms },
        };
        if (body.platforms && typeof body.platforms === 'object') {
          for (const [k, v] of Object.entries(body.platforms)) {
            if (next.platforms[k]) next.platforms[k] = { alerts: v?.alerts !== false };
          }
        }
        await env.KV.put('settings', JSON.stringify(next));
        return json(next);
      }

      if (path === '/api/channels') {
        // List channels the bot can see; is_member = bot can post there.
        // NB: conversations.list ignores JSON bodies — params must go in the
        // query string, otherwise `types` falls back to public_channel only
        // and private client channels never appear.
        const chans = [];
        let cursor = '';
        do {
          const qs = new URLSearchParams({
            types: 'public_channel,private_channel',
            exclude_archived: 'true', limit: '200',
            ...(cursor ? { cursor } : {}),
          });
          const res = await fetch(`https://slack.com/api/conversations.list?${qs}`, {
            headers: { 'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}` },
          });
          const r = await res.json();
          if (!r.ok) return json({ error: r.error || 'slack error' }, 502);
          for (const c of r.channels || []) {
            chans.push({ id: c.id, name: c.name, is_member: !!c.is_member, is_private: !!c.is_private });
          }
          cursor = r.response_metadata?.next_cursor || '';
        } while (cursor);
        chans.sort((a, b) => a.name.localeCompare(b.name));
        return json({ channels: chans });
      }

      if (path === '/api/test' && request.method === 'POST') {
        const settings = await getSettings(env);
        if (!settings.channels.internal) return json({ error: 'no internal channel configured' }, 400);
        await sendAlert(env, settings, 'meta', [{
          platformId: 'meta', platform: 'Meta Ads', service: 'Test alert',
          from: 'operational', to: 'outage',
          note: 'This is a test from the Mobius Pulse dashboard. Click the button to test client fan-out.',
        }]);
        return json({ ok: true });
      }

      if (path === '/api/poll' && request.method === 'POST') {
        return json(await runPoll(env, { force: true }));
      }
    }

    return json({ error: 'not found' }, 404);
  },
};
