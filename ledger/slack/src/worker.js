/**
 * Cashew Slack router (2026-10-14).
 *
 * One Cashew Slack app, several separate sets of books. Slack allows one
 * Events URL and one Interactivity URL per app; this worker is both. It reads
 * which CHANNEL a request is about and hands it, untouched, to the worker that
 * keeps those books:
 *
 *   mobius  mobius-ledger (Mobius Digital's books)      default, and every DM
 *   lucky   lucky-ledger  (Lucky Golf's books)          the channels in TENANT_CHANNELS
 *
 * It verifies nothing and stores nothing: the raw body and both Slack signature
 * headers go through as they came, and each books worker checks the signature
 * against the Cashew app's secret itself. That keeps this worker secret-free
 * (nothing to paste, nothing to leak) and means it can never be a way around a
 * books worker's own gate.
 *
 * Why DMs are Mobius's: a DM carries no channel, so it has no books of its own.
 * Cole's default books are the agency's; the Lucky books are asked in
 * #lucky-finance. If that ever needs to change, the answer is a small question
 * ("which books?") in the Mobius worker, not routing by words here.
 */

const TARGETS = {
  mobius: { events: '/api/slack-events', interact: '/api/slack-interact' },
  lucky:  { events: '/api/slack-events', interact: '/api/slack-interact' },
};

function tenants(env) {
  try { return JSON.parse(env.TENANT_CHANNELS || '{}') || {}; } catch { return {}; }
}
function tenantOf(env, channel) {
  const t = channel && tenants(env)[channel];
  return t && TARGETS[t] ? t : 'mobius';
}

function safeJson(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

/* The channel an interactivity payload is about: a button tap carries it on
   container / channel; a modal submission carries none and goes to Mobius. */
function channelOfPayload(p) {
  return p?.container?.channel_id || p?.channel?.id || null;
}

async function forward(env, tenant, path, request, raw) {
  const t = TARGETS[tenant];
  const base = tenant === 'mobius' ? 'https://mobius-ledger.mobius-digital.workers.dev' : env.LUCKY_URL;
  const target = base + (path === 'events' ? t.events : t.interact);
  const req = new Request(target, {
    method: 'POST',
    headers: {
      'Content-Type': request.headers.get('content-type') || 'application/json',
      'x-slack-request-timestamp': request.headers.get('x-slack-request-timestamp') || '',
      'x-slack-signature': request.headers.get('x-slack-signature') || '',
      'x-slack-retry-num': request.headers.get('x-slack-retry-num') || '',
      'x-cashew-router': '1',
    },
    body: raw,
  });
  /* Same account = service binding (a public workers.dev fetch between two
     workers on one account is blocked). Another account = plain fetch. */
  const r = tenant === 'mobius' && env.MOBIUS ? await env.MOBIUS.fetch(req) : await fetch(req);
  return new Response(r.body, { status: r.status, headers: r.headers });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'GET') {
      return Response.json({
        service: 'cashew-slack: the Cashew Slack app router',
        event_subscriptions_request_url: 'https://cashew-slack.mobius-digital.workers.dev/slack/events',
        interactivity_request_url: 'https://cashew-slack.mobius-digital.workers.dev/slack',
        books: { mobius: !!env.MOBIUS, lucky: !!env.LUCKY_URL },
        channels: tenants(env),
      });
    }
    if (request.method !== 'POST') return new Response('', { status: 405 });

    const raw = await request.text();

    if (path === '/slack/events') {
      const body = safeJson(raw, null);
      /* Slack's URL check: an echo, nothing signed, nothing stored. */
      if (body?.type === 'url_verification') return Response.json({ challenge: body.challenge });
      const ev = body?.event || {};
      /* A reaction names its channel under item; a DM has channel_type im and is Mobius's. */
      const channel = ev.channel_type === 'im' ? null : (ev.channel || ev.item?.channel || null);
      return forward(env, tenantOf(env, channel), 'events', request, raw);
    }

    if (path === '/slack') {
      const form = new URLSearchParams(raw);
      if (form.get('ssl_check')) return new Response('', { status: 200 });
      const payload = safeJson(form.get('payload'), null);
      /* Unreadable = a quiet 200: Slack paints any other status as a red banner
         on the card, for a tap nobody was going to act on. */
      if (!payload) return new Response('', { status: 200 });
      return forward(env, tenantOf(env, channelOfPayload(payload)), 'interact', request, raw);
    }

    return new Response('', { status: 404 });
  },
};
