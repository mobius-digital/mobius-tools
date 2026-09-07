/**
 * Mobius Slack router — the shared front door for Slack interactivity.
 *
 * WHY THIS EXISTS. Slack allows exactly ONE "Interactivity Request URL" per
 * Slack app, and the one "Mobius Digital" app serves three tools. That URL used
 * to point at the Ledger worker, which forwarded anything that wasn't Ledger's
 * to Pulse — which worked, but meant the URL in Slack's settings read
 * `mobius-ledger…` while actually serving Locus and Pulse too. Cole, 2026-09-07:
 * "why is it Mobius Ledger right now… is there any way to make it easier to
 * understand". This is that: one address, named for the job, owned by nobody.
 *
 * WHY NOT tools.go-mobius-digital.com/slack — the obvious nicer answer. A
 * Cloudflare Worker can only serve a hostname whose DNS Cloudflare hosts, and
 * this zone is on Squarespace/Google nameservers; `tools` is already a CNAME to
 * GitHub Pages. Cloudflare rejects adding a bare subdomain, so a branded URL
 * means moving the whole zone — which puts the Google Workspace MX records, and
 * therefore Cole's business email, in the blast radius. Not worth it for a URL
 * that is typed once and then never seen again. See the mobius-domains note.
 *
 * WHAT IT DOES. Verifies Slack's signature, works out which tool a payload
 * belongs to, and hands the request on over a service binding with the raw body
 * and both signature headers intact — so each tool verifies for itself and this
 * worker is never a way to bypass anything. It stores no data and holds no
 * token beyond the signing secret.
 *
 * Deploy:  npx wrangler deploy   (from this folder)
 * Secret:  npx wrangler secret put SLACK_SIGNING_SECRET   (same value as the
 *          other three workers — it is one Slack app)
 */

/* Slack signs every interaction: HMAC-SHA256 of "v0:<timestamp>:<raw body>".
   Fails closed with no secret set, rejects anything older than five minutes,
   and compares in constant time. */
async function verifySlackSig(env, ts, rawBody, sig) {
  if (!env.SLACK_SIGNING_SECRET || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - +ts) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SLACK_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${ts}:${rawBody}`));
  const mine = 'v0=' + [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (mine.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < mine.length; i++) diff |= mine.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

const safeJson = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch { return d; } };

/* WHO OWNS THIS PAYLOAD.
   Ledger — a block action whose value carries {id, tax} (the receipt category
            buttons and the category dropdown).
   Locus  — the Daily Brief and Reports cards: every action_id and every modal
            callback_id is prefixed brief_ / report_, plus the noop_open link
            buttons Slack reports anyway. Modal submissions carry NO actions
            array at all, which is why this cannot be a block_actions-only test.
   Pulse  — everything else, which is what it got before this existed.
   Pulse is the default deliberately: it is the oldest tool here and the one
   whose buttons must not change behaviour, so an unrecognised payload keeps
   going exactly where it always went. */
const LOCUS_ID = /^(brief|report)_|^noop_open$/;

function ownerOf(payload) {
  const acts = payload.type === 'block_actions' ? (payload.actions || []) : [];
  const ledger = acts.some(x => {
    const v = safeJson(x.selected_option?.value || x.value, null);
    return v && v.id !== undefined && v.tax !== undefined;
  });
  if (ledger) return 'ledger';
  if (acts.some(x => LOCUS_ID.test(x.action_id || ''))) return 'locus';
  if (payload.type === 'view_submission' && LOCUS_ID.test(payload.view?.callback_id || '')) return 'locus';
  return 'pulse';
}

const TARGETS = {
  ledger: ['LEDGER', 'https://mobius-ledger.mobius-digital.workers.dev/api/slack-interact'],
  locus: ['AUTH', 'https://mobius-account-health.mobius-digital.workers.dev/slack/actions'],
  pulse: ['PULSE', 'https://mobius-ad-status.mobius-digital.workers.dev/slack/interact'],
};

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    /* A plain GET is a human checking they pasted the right address. Say what
       this is and whether it is actually able to work, because "the URL is
       live" and "the secret is set" are different questions and only one of
       them is visible from Slack's settings page. */
    if (request.method === 'GET') {
      return Response.json({
        service: 'mobius-slack — Slack interactivity router',
        put_this_in_slack: 'https://mobius-slack.mobius-digital.workers.dev/slack',
        signing_secret_set: !!env.SLACK_SIGNING_SECRET,
        routes: { ledger: !!env.LEDGER, locus: !!env.AUTH, pulse: !!env.PULSE },
      });
    }

    if (request.method !== 'POST') return new Response('', { status: 405 });

    const raw = await request.text();
    const ok = await verifySlackSig(env, request.headers.get('x-slack-request-timestamp'), raw,
      request.headers.get('x-slack-signature'));
    if (!ok) return new Response('bad signature', { status: 401 });

    const form = new URLSearchParams(raw);
    if (form.get('ssl_check')) return new Response('', { status: 200 });

    const payload = safeJson(form.get('payload'), null);
    /* Anything unparseable still gets a 200. Slack renders a non-200 as a red
       banner across the message, which tells whoever pressed the button that
       their tool is broken — when the truth is that we could not read a payload
       we were never going to act on. */
    if (!payload) return new Response('', { status: 200 });

    const [bindingName, target] = TARGETS[ownerOf(payload)];
    const binding = env[bindingName];
    if (!binding) return new Response('', { status: 200 });

    return binding.fetch(new Request(target, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': request.headers.get('x-slack-request-timestamp') || '',
        'x-slack-signature': request.headers.get('x-slack-signature') || '',
      },
      body: raw,
    }));
  },
};
