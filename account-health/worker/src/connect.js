import { integrationsReport } from './integrations.js';
import { autoMatch as googleMatch } from './google.js';
import { setTripleWhale, connSet } from './brands.js';
/**
 * THE CONNECT LINK (2026-10-15). Cole: "some of these clients probably don't have Microsoft Clarity and we just need
 * to get access to that. Can we set up some sort of link that I can send to all the clients that still need certain
 * integrations attached, and then it auto updates for them."
 *
 * One link per brand, no login: onboard/connect.html?c=<token>. It lists ONLY what Locus still cannot read for that
 * brand, each with the exact clicks, and ticks itself off as things connect (the page re-reads every 30 seconds).
 * The client only gives access; keys are ours (Cole, 2026-10-15). On the page itself:
 *   - Clarity / Klaviyo: invite our email, tap "Done, I invited you" (settings `connectInvited:<brand>`, Slack line to
 *     the team); Cole then makes the token / key from the staff list ("Your turn", `yours` in connectOverview).
 *   - Google Ads: type the customer ID; Locus sends the Mobius manager request itself, they click Accept.
 *   - Triple Whale: type the store address.
 *   - "We don't use this": hides the item for good (settings `connectSkip:<brand>`), staff can see it.
 * Everything else (Meta, GA4, Search Console, Triple Whale invite) is "invite us"; Locus notices on its own:
 * the hourly Meta partner sweep + auto-connect, the hourly Google match, the Triple Whale sync.
 *
 * Token: settings `connectTokens` {token: brand_id}; one per brand, made the first time staff ask for it.
 * The answer to the public GET never carries a note, a fix, an id or a key: titles, states and the steps only.
 */
const safe = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const getS = async (env, k) => (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null))?.value || null;
const putS = (env, k, v) => env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, v).run();

const COLE = 'cole@go-mobius-digital.com', BM = '695359915477596', MCC = '556-646-8199';
/* The client's words. Order = the order on the page. `skip` = may say "we don't use this". */
const ITEMS = {
  meta: { title: 'Meta (Facebook and Instagram)', why: 'Your ad results, every ad and the audiences.', skip: false, auto: true,
    steps: ['Go to business.facebook.com/settings and pick your business.', 'Open Users > Partners, click Add, then "Give a partner access to your assets".',
      'Paste our Business ID (below) and click Next.', 'Tick every asset and give each one Full control: ad accounts, Pages, pixels and datasets, the Instagram account and catalogs. Then Save.',
      'That is all. We assign our team on our side automatically.'], copy: [['Our Meta Business ID', BM]], url: 'https://business.facebook.com/settings/partners' },
  tw: { title: 'Triple Whale', why: 'Your sales, orders and which ads really sold, in one place.', skip: false, auto: true,
    steps: ['Open Triple Whale > Settings > Users and click Invite.', 'Add our email with the Admin role.'], copy: [['Our email', COLE]], url: 'https://app.triplewhale.com',
    input: { key: 'tw_shop', label: 'Your Shopify store address', placeholder: 'yourstore.myshopify.com' } },
  google_ads: { title: 'Google Ads', why: 'Your Google campaigns and search terms next to everything else.', skip: true,
    steps: ['Type your Google Ads customer ID below (the 10-digit number at the top right of Google Ads). We send the request from our side.',
      'In Google Ads open Admin > Access and security > Managers and click Accept on the Mobius Digital request.'],
    copy: [['Our Google Ads manager ID', MCC]], url: 'https://ads.google.com/aw/accountaccess/managers',
    input: { key: 'google_ads', label: 'Google Ads customer ID', placeholder: '123-456-7890' } },
  ga4: { title: 'Google Analytics', why: 'How people move through your website.', skip: true, auto: true,
    steps: ['Go to analytics.google.com and pick your website property.', 'Click Admin (the gear, bottom left), then Property access management.',
      'Click +, Add users, add our email, choose Administrator and click Add.'], copy: [['Our email', COLE]], url: 'https://analytics.google.com/analytics/web/' },
  gsc: { title: 'Google Search Console', why: 'What people search on Google before they find you.', skip: true, auto: true,
    steps: ['Go to search.google.com/search-console and pick your website.', 'Open Settings > Users and permissions > Add user.', 'Add our email with Full permission.'],
    copy: [['Our email', COLE]], url: 'https://search.google.com/search-console/users' },
  /* 2026-10-15 (Cole): the client only INVITES us. Making the Clarity token and the Klaviyo key is our job, on the
     staff list ("Your turn"). The client taps "Done, I invited you" and Cole gets a Slack line. */
  clarity: { title: 'Microsoft Clarity', why: 'Where shoppers get stuck on your site: rage clicks, dead clicks and how far they scroll. Free.', skip: true, invite: true,
    steps: ['Already use Clarity? Open your project at clarity.microsoft.com, then Settings > Team > Add team member.', 'Add our email as an Admin.',
      'No Clarity yet? Nothing to do: we set it up through your Shopify access.'], copy: [['Our email', COLE]], url: 'https://clarity.microsoft.com/projects' },
  email: { title: 'Klaviyo', why: 'Your email and SMS results, flows and lists.', skip: true, invite: true,
    steps: ['In Klaviyo click your name (bottom left) > Settings > Users > Add new user.', 'Add our email with the Admin role.'],
    copy: [['Our email', COLE]], url: 'https://www.klaviyo.com/settings/account/users' },
};

/* What Cole does once the client has invited him (the staff list's "Your turn"). `field` = the /api/brand-links key. */
const YOURS = {
  email: { field: 'klaviyo_key', label: 'Klaviyo private key', url: 'https://www.klaviyo.com/settings/account/api-keys',
    steps: 'Open Klaviyo and switch to the brand (account menu, bottom left) > Settings > API keys > Create Private API Key > name it Mobius > Full Access > Create. Copy it and paste it here.' },
  clarity: { field: 'clarity_token', label: 'Clarity API token', url: 'https://clarity.microsoft.com/projects',
    steps: "Open the brand's Clarity project (none yet? install the free Microsoft Clarity app in their Shopify admin first) > Settings > Data Export > Generate new API token. Copy it and paste it here." },
};
const invitedOf = async (env, id) => safe(await getS(env, `connectInvited:${id}`), {});

async function tokens(env) { return safe(await getS(env, 'connectTokens'), {}); }
/** The brand's link token, made on first ask. */
export async function connectToken(env, brandId) {
  const t = await tokens(env);
  const have = Object.entries(t).find(([, b]) => b === brandId);
  if (have) return have[0];
  const tok = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  t[tok] = brandId; await putS(env, 'connectTokens', JSON.stringify(t));
  return tok;
}
async function brandOfToken(env, tok) {
  const id = (await tokens(env))[String(tok || '')];
  if (!id) throw Object.assign(new Error('This link is not valid any more. Ask your Mobius contact for a new one.'), { status: 404 });
  const b = await env.DB.prepare(`SELECT id, name FROM brands WHERE id = ?1`).bind(id).first();
  if (!b) throw Object.assign(new Error('This link is not valid any more.'), { status: 404 });
  return b;
}
const skipsOf = async (env, id) => safe(await getS(env, `connectSkip:${id}`), []);

/** One brand's list: every item, done or not. `public` strips it to what a client may see. */
export async function connectList(env, brandId) {
  const rep = await integrationsReport(env, { brand: brandId });
  const b = (rep.brands || []).find(x => x.id === brandId || x.act_id === brandId) || (rep.brands || [])[0];
  const by = Object.fromEntries((b?.items || []).map(i => [i.key, i]));
  const skips = await skipsOf(env, brandId);
  const pend = safe(await getS(env, `connectPending:${brandId}`), {});
  const inv = await invitedOf(env, brandId);
  const out = [];
  for (const [key, it] of Object.entries(ITEMS)) {
    const r = by[key]; if (!r) continue;
    /* Attentive brands: email reaches Locus through Triple Whale; nothing for the client to paste. */
    if (key === 'email' && r.tool === 'attentive') continue;
    /* Meta: an ad account on the brand means the client already shared it (data may still be syncing). */
    const done = r.state === 'ok' || (key === 'meta' && !r.input);
    const state = done ? 'done' : skips.includes(key) ? 'skipped' : (pend[key] || inv[key]) ? 'waiting' : 'todo';
    out.push({ key, state, title: it.title, why: it.why, steps: it.steps, copy: it.copy || [], url: it.url || null, skip: it.skip, auto: !!it.auto,
      input: !done && it.input && !(key === 'tw' && r.state !== 'off') ? it.input : null,
      invite: !!it.invite && !done, invited: !!inv[key],
      waiting: pend[key] ? pend[key].note : inv[key] ? 'Thanks. We finish this one on our side.' : null });
  }
  return { brand: b?.name || null, items: out };
}

export async function connectGet(env, tok, { force = false } = {}) {
  const b = await brandOfToken(env, tok);
  /* The page re-reads every 30 seconds and the report also probes Google and TikTok, so one answer is kept 45 seconds.
     Opening the page is also the moment to look for new Google access (cheap; at most every 5 minutes). */
  const ck = `connectCache:${b.id}`;
  const hit = safe(await getS(env, ck), null);
  if (!force && hit && Date.now() - hit.at < 45e3) return hit.data;
  const last = Number(await getS(env, `connectLook:${b.id}`)) || 0;
  if (force || Date.now() - last > 5 * 60e3) {
    await putS(env, `connectLook:${b.id}`, String(Date.now())).catch(() => {});
    await googleMatch(env).catch(() => {}); await adsPendingCheck(env, b.id).catch(() => {});
  }
  const l = await connectList(env, b.id);
  const data = { brand: b.name, items: l.items, left: l.items.filter(i => i.state === 'todo' || i.state === 'waiting').length };
  await putS(env, ck, JSON.stringify({ at: Date.now(), data })).catch(() => {});
  return data;
}

/** The client finishes one item on the page. */
export async function connectPost(env, tok, body, deps) {
  const b = await brandOfToken(env, tok);
  const key = String(body.key || ''), val = String(body.value || '').trim();
  if (!ITEMS[key]) throw Object.assign(new Error('Unknown item.'), { status: 400 });
  if (body.skip !== undefined) {
    const s = new Set(await skipsOf(env, b.id)); body.skip ? s.add(key) : s.delete(key);
    await putS(env, `connectSkip:${b.id}`, JSON.stringify([...s]));
  } else if (body.invited !== undefined) {
    if (!ITEMS[key].invite) throw Object.assign(new Error('Nothing to confirm for this one.'), { status: 400 });
    const inv = await invitedOf(env, b.id);
    if (body.invited) inv[key] = new Date().toISOString(); else delete inv[key];
    await putS(env, `connectInvited:${b.id}`, JSON.stringify(inv));
    if (body.invited && deps.tellTeam) await deps.tellTeam(`${b.name} invited you to ${ITEMS[key].title}. Your turn: make the ${YOURS[key].label} and paste it in Locus (Agency settings > Integrations > Ask clients for what is missing).`).catch(() => {});
    return connectGet(env, tok, { force: true });
  } else if (key === 'tw') {
    const shop = val.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) throw Object.assign(new Error('That should end in .myshopify.com. Shopify shows it under Settings > Domains.'), { status: 400 });
    await setTripleWhale(env, b.id, shop);
  } else if (key === 'google_ads') {
    const id = val.replace(/\D/g, '');
    if (id.length !== 10) throw Object.assign(new Error('A Google Ads customer ID has 10 digits, like 123-456-7890.'), { status: 400 });
    const sent = await deps.adsInvite(env, id).catch(e => ({ error: e.message }));
    const pend = safe(await getS(env, `connectPending:${b.id}`), {});
    pend.google_ads = { id, at: new Date().toISOString(), note: sent.error ? 'We got your ID and will send the request shortly.' : 'Request sent. Accept it in Google Ads (Admin > Access and security > Managers).', error: sent.error || null };
    await putS(env, `connectPending:${b.id}`, JSON.stringify(pend));
    if (sent.error && deps.tellTeam) await deps.tellTeam(`${b.name} gave their Google Ads ID ${id} on the connect link, but Locus could not send the manager request: ${sent.error}. Send it from the Mobius manager by hand.`).catch(() => {});
  } else throw Object.assign(new Error('Nothing to save for this one: invite us and it ticks itself.'), { status: 400 });
  if (deps.tellTeam && body.skip === undefined && body.invited === undefined) await deps.tellTeam(`${b.name} connected ${ITEMS[key].title} on their connect link.`).catch(() => {});
  return connectGet(env, tok, { force: true });
}

/** A pending Google Ads ID becomes the brand's link once the account shows under the manager. */
export async function adsPendingCheck(env, brandId, deps = {}) {
  const pend = safe(await getS(env, `connectPending:${brandId}`), {});
  if (!pend.google_ads?.id) return null;
  const { googleProbe } = await import('./google.js');
  const p = await googleProbe(env);
  if ((p.ads?.customers || []).includes(pend.google_ads.id)) {
    await connSet(env, brandId, 'google_ads', pend.google_ads.id);
    delete pend.google_ads; await putS(env, `connectPending:${brandId}`, JSON.stringify(pend));
    return { linked: true };
  }
  return { linked: false };
}

/** Staff: every live brand, what is missing, and its link. */
export async function connectOverview(env, origin) {
  const { results } = await env.DB.prepare(`SELECT id, name FROM brands WHERE status = 'active' ORDER BY name`).all();
  /* Paused or test brands are never chased (The Golf Sock is Cole's test account). */
  const SKIP = /golf sock|harborline|galway|instyler|gum of gods|judyp|le pickle|popby/i;
  const out = [];
  for (const b of (results || []).filter(b => !SKIP.test(b.name))) {
    const l = await connectList(env, b.id).catch(() => ({ items: [] }));
    const tok = await connectToken(env, b.id);
    out.push({ id: b.id, name: b.name, link: `${origin}/onboard/connect.html?c=${tok}`,
      missing: l.items.filter(i => i.state === 'todo' || i.state === 'waiting').map(i => i.title),
      skipped: l.items.filter(i => i.state === 'skipped').map(i => i.title), done: l.items.filter(i => i.state === 'done').map(i => i.title),
      /* Your turn: the keys only Cole can make, once the client has invited him (or before, if he already has access). */
      yours: l.items.filter(i => YOURS[i.key] && (i.state === 'todo' || i.state === 'waiting'))
        .map(i => ({ key: i.key, title: i.title, invited: i.invited, ...YOURS[i.key] })) });
  }
  return { brands: out };
}

/** Hourly: every brand with a Google Ads ID waiting on the client's Accept. */
export async function pendingTick(env) {
  const { results } = await env.DB.prepare(`SELECT key FROM settings WHERE key LIKE 'connectPending:%'`).all().catch(() => ({ results: [] }));
  const out = [];
  for (const r of results || []) { const id = r.key.slice('connectPending:'.length); const x = await adsPendingCheck(env, id).catch(() => null); if (x) out.push({ id, ...x }); }
  return out;
}

/** Hourly: a Google Ads customer ID typed on the ONBOARDING form (answers gads_id) gets the Mobius manager request
 *  sent by Locus, so nobody on the team has to send it by hand. Once per brand (the pending row remembers it). */
export async function onboardAdsTick(env, adsInvite) {
  const { results } = await env.DB.prepare(`SELECT o.act_id, json_extract(o.answers_json, '$.gads_id') AS gid FROM p_br_onboard o
    WHERE o.act_id LIKE 'brand_%' AND json_extract(o.answers_json, '$.gads_id') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM connections c WHERE c.brand_id = o.act_id AND c.kind = 'google_ads')`).all().catch(() => ({ results: [] }));
  const out = [];
  for (const r of results || []) {
    const id = String(r.gid || '').replace(/\D/g, ''); if (id.length !== 10) continue;
    const pend = safe(await getS(env, `connectPending:${r.act_id}`), {});
    if (pend.google_ads?.id === id) continue;
    const sent = await adsInvite(env, id).catch(e => ({ error: e.message }));
    pend.google_ads = { id, at: new Date().toISOString(), from: 'onboarding', note: sent.error ? 'We got your ID and will send the request shortly.' : 'Request sent. Accept it in Google Ads (Admin > Access and security > Managers).', error: sent.error || null };
    await putS(env, `connectPending:${r.act_id}`, JSON.stringify(pend));
    out.push({ brand: r.act_id, id, error: sent.error || null });
  }
  return out;
}
