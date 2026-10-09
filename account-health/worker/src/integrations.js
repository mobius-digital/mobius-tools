import { tiktokStatus } from './tiktok.js';
import { googleProbe, adsAccounts } from './google.js';
const safeJsonI = v => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
/**
 * CONNECTIONS (2026-10-07). Cole: "I'm trying to figure out which things need access once and
 * which need access all the time... what gets access automatically because it's the agency's
 * account... an integration page where we make sure all the integrations are there and if
 * something breaks we know how to fix it from within the settings."
 *
 * Two kinds, and the page says which is which:
 *   AGENCY (connected once, on the worker or by Cole signing in; every brand rides on it):
 *     Meta, Triple Whale, Google (ONE item with five checks: sign-in, Drive and Gmail, Analytics,
 *     Search Console, Ads API), the TikTok app, Asana, Slack, Stripe, Frame, Claude, the Studio image
 *     key, Gemini, Atria, Canva, the downloader, the Lucky creator app. `group`: Data / Work /
 *     AI and creative / Lucky only.
 *   PER BRAND (set at onboarding, by the New client flow or by hand on Integrations), grouped by
 *     what Locus gets (`group`): Ads (Meta, Google Ads, TikTok), Store (Triple Whale, Shopify),
 *     Website (GA4, Search Console), Email and SMS (Klaviyo OR Attentive, one item), Work (Asana,
 *     Drive, Frame). Slack channels, the creator link and the onboarding answers are NOT here since
 *     2026-10-09: they are settings and Brand pages, not integrations.
 *
 * integrationsReport(env) is read by GET /api/integrations (Locus Settings > Integrations) and by the
 * Strategist's `integrations` view. Item: { key, name, state, note, fix, used_by, steps, input } plus
 * (2026-10-09) group, gets (one line of what Locus gets), and where it applies:
 *   state    ok | part (partly connected: Google Ads or TikTok only through Triple Whale, Attentive
 *            through Triple Whale) | warn | bad | off
 *   levels   [{name, on, note}] for a connection with two depths (Through Triple Whale / Direct)
 *   options  [{value, label, linked_to}] the ids Locus can already SEE, so the page offers a pick
 *            instead of a paste box; `linked_to` names the brand already using one (null = free).
 *            The pick is sent to PUT /api/brand-links as { act, [input.key]: value }.
 *   checks   (agency google) [{name, ok, note}]
 *   tool / tools (email) which email tool the brand uses; switched by PUT /api/brand-links email_tool.
 * Nothing here changes anything; the fixes point at the screen that does.
 */
import { atriaStatus } from './atria.js';
import { frameStatus } from './frame.js';

const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const set = v => !!String(v || '').trim();
const daysAgo = ymd => ymd ? Math.round((Date.now() - Date.parse(`${ymd}T12:00:00Z`)) / 864e5) : null;

export async function integrationsReport(env, { brand = null } = {}) {
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then(r => r.results || []).catch(() => []);
  const first = (sql, ...b) => env.DB.prepare(sql).bind(...b).first().catch(() => null);
  const cfg = async k => (await first(`SELECT value FROM p_studio_cfg WHERE key = ?1`, k))?.value || null;
  const setting = async k => safeJson((await first(`SELECT value FROM settings WHERE key = ?1`, k))?.value, null);

  /* ---------------- agency-wide ---------------- */
  const fields = await setting('brandAsanaFields');
  const [atria, frame, openai, canvaId, canvaTok, discover, slackWho] = await Promise.all([
    atriaStatus(env).catch(() => ({ connected: false })), frameStatus(env).catch(() => ({ connected: false })),
    cfg('openai_key'), cfg('canva_client_id'), cfg('canva_tokens'), setting('lastDiscover'), setting('slackSendWho'),
  ]);
  /* used_by says which part of Locus leans on it, so "does Dartee have Stripe?" never comes up: these
     are Mobius's own, not a brand's. `only` names the one brand a connection serves (the Lucky app). */
  const AG = { meta: 'Data', tw: 'Data', google: 'Data', tiktok: 'Data', asana: 'Work', slack: 'Work', stripe: 'Work', frame: 'Work',
    anthropic: 'AI and creative', studio: 'AI and creative', gemini: 'AI and creative', atria: 'AI and creative', canva: 'AI and creative', downloader: 'AI and creative', lucky_app: 'Lucky only' };
  const A = (key, name, on, { warn = false, note = '', fix = '', used_by = '', only = null } = {}) => ({ key, name, group: AG[key] || 'Other', needs: 'once', state: on ? (warn ? 'warn' : 'ok') : 'off', note, fix, used_by, only });
  const luckyAct = (await first(`SELECT act_id FROM brand_accounts WHERE lower(name) LIKE 'lucky%' AND active = 1 LIMIT 1`))?.act_id || null;
  const [gp, tk] = await Promise.all([googleProbe(env).catch(() => ({})), tiktokStatus(env).catch(() => ({}))]);
  /* The Google Ads accounts under the Mobius manager, with their names (one extra call, only when the API answers). */
  const gAds = gp.ads?.ok ? await adsAccounts(env).catch(() => ({})) : {};
  const gsa = (safeJsonI(env.GOOGLE_SA_KEY) || {}).client_id || 'the service account';
  const asWho = gp.acting_as || 'cole@go-mobius-digital.com';
  const gsteps = (scope, apis) => `1) Google Workspace admin (admin.google.com) > Security > Access and data control > API controls > Manage domain-wide delegation > edit client ${gsa} > ADD ${scope} to the scopes already there (keep the existing ones). 2) console.cloud.google.com, the project that owns that service account > APIs and services > Enable: ${apis}.`;
  /* ONE Google item (2026-10-09): sign-in, the service account, and the three Google data APIs it reads. */
  const gChecks = [
    { name: 'Sign-in to Locus', ok: set(env.GOOGLE_CLIENT_ID), note: set(env.GOOGLE_CLIENT_ID) ? 'The team signs in with Google.' : 'No Google client id.', fix: 'Set GOOGLE_CLIENT_ID on the account-health worker.' },
    { name: 'Drive, Docs and Gmail', ok: set(env.GOOGLE_SA_KEY), note: set(env.GOOGLE_SA_KEY) ? 'Acts as Cole or Ahsan through the service account.' : 'No service account key.', fix: 'Set GOOGLE_SA_KEY (the service-account JSON with domain-wide delegation) on the account-health worker.' },
    { name: 'Google Analytics', ok: !!gp.ga4?.ok, note: gp.ga4?.ok ? `${gp.ga4.properties.length} properties visible as ${asWho}.` : `Not readable yet: ${gp.ga4?.error || 'not checked'}`,
      fix: gp.ga4?.ok ? '' : gsteps('https://www.googleapis.com/auth/analytics.readonly', 'Google Analytics Data API, Google Analytics Admin API') },
    { name: 'Search Console', ok: !!gp.gsc?.ok, note: gp.gsc?.ok ? `${gp.gsc.sites.length} sites visible as ${asWho}.` : `Not readable yet: ${gp.gsc?.error || 'not checked'}`,
      fix: gp.gsc?.ok ? '' : gsteps('https://www.googleapis.com/auth/webmasters.readonly', 'Google Search Console API') },
    { name: 'Google Ads API', ok: !!gp.ads?.ok, note: gp.ads?.ok ? `${(gAds.accounts || []).filter(x => !x.manager).length || gp.ads.customers.length} ad accounts reachable through the Mobius manager account 556-646-8199.` : `Not connected: ${gp.ads?.error || 'not checked'}`,
      fix: gp.ads?.ok ? '' : 'Developer tokens were retired on 2026-09-09; access belongs to the Cloud project. 1) console.cloud.google.com > project mobius-tools-506114 > APIs and services > Google Ads API > Overview. 2) Make sure the project has billing on a paid tier. 3) Apply for access there. 4) Each client\'s Google Ads account must be linked under the Mobius manager account 556-646-8199.' },
  ];
  const gOk = gChecks.filter(c => c.ok).length;
  const googleItem = { key: 'google', name: 'Google', group: 'Data', needs: 'once', state: gOk === gChecks.length ? 'ok' : gOk ? 'warn' : 'off',
    note: gOk === gChecks.length ? 'Sign-in, Drive and Gmail, Analytics, Search Console and Google Ads all working.' : `${gOk} of ${gChecks.length} working: ${gChecks.filter(c => !c.ok).map(c => c.name).join(', ')} not.`,
    fix: gChecks.filter(c => !c.ok).map(c => `${c.name}: ${c.fix}`).join(' '), used_by: 'signing in, Drive and Gmail, New client, Store > Website and Search, Ads > Google',
    only: null, checks: gChecks.map(({ name, ok, note }) => ({ name, ok, note })) };
  const agency = [
    A('meta', 'Meta (ads)', set(env.META_TOKEN), { used_by: 'every brand\'s ad data, the Meta tab, Test calls', note: discover?.at ? `Ad accounts last discovered ${discover.at.slice(0, 10)}.` : 'The Mobius Tools system-user token.', fix: 'Set META_TOKEN on the account-health worker (Meta Business > System users > Mobius Tools, with ads_read, business_management, pages_read_engagement).' }),
    A('tw', 'Triple Whale', set(env.TW_API_KEY), { used_by: 'revenue, attribution, orders for every brand', note: 'One key for every store; each brand names its shop below.', fix: 'Set TW_API_KEY on the account-health worker (Triple Whale > Settings > API keys).' }),
    googleItem,
    A('tiktok', 'TikTok app', !!tk.connected, { used_by: 'Ads > TikTok: campaigns from TikTok itself (Triple Whale totals until then)', warn: tk.app && !tk.connected, note: tk.connected ? `Connected ${String(tk.since || '').slice(0, 10)}: ${(tk.advertisers || []).map(a => a.name || a.id).join(', ')}.` : tk.app ? 'App set up; press Connect TikTok on Ads > TikTok and sign in.' : 'No TikTok developer app yet.', fix: '1) business-api.tiktok.com: sign in with the Mobius TikTok for Business account, Become a Developer, then My Apps > Create an app (Marketing API). 2) Ask for the scopes Ad Account Management (read) and Reporting. 3) Advertiser redirect URL: https://mobius-account-health.mobius-digital.workers.dev/tiktok/callback 4) When TikTok approves it (usually a few days), run these in account-health/worker and paste each value when asked: npx.cmd wrangler secret put TIKTOK_APP_ID, then npx.cmd wrangler secret put TIKTOK_APP_SECRET. 5) Locus > Ads > TikTok > Connect TikTok, sign in, tick every ad account.' }),
    A('asana', 'Asana', set(env.ASANA_TOKEN), { used_by: 'briefs, the test library, New client', warn: set(env.ASANA_TOKEN) && !fields?.workspace, note: fields?.workspace ? 'Locus fields (Angle, Testing, Result...) are on the workspace.' : 'Token set, fields not created yet.', fix: 'Set ASANA_TOKEN (a personal access token of a Mobius admin) on the account-health worker; the fields are created when the first brand connects its project.' }),
    A('slack', 'Slack (the Mobius Digital app)', set(env.SLACK_BOT_TOKEN), { used_by: 'the Strategist, the ideas pipeline, briefs, reports, the Ledger, Pulse', warn: set(env.SLACK_BOT_TOKEN) && !(set(env.SLACK_SIGNING_SECRET) && set(env.SLACK_USER_TOKEN)), note: [set(env.SLACK_SIGNING_SECRET) ? 'buttons work' : 'buttons dead (no signing secret)', set(env.SLACK_USER_TOKEN) ? `client sends as ${slackWho === 'anyone' ? 'anyone' : 'Cole'}` : 'no user token (client sends fail)'].join('; ') + '.', fix: 'Secrets on the account-health worker: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_USER_TOKEN (api.slack.com > the Mobius Digital app).' }),
    A('stripe', 'Stripe', set(env.STRIPE_SECRET_KEY), { used_by: 'New client only (the first invoice and autopay)', note: 'Mobius\'s own Stripe; no brand connects to it.', fix: 'Set STRIPE_SECRET_KEY on the account-health worker.' }),
    A('frame', 'Frame.io', !!frame.connected, { used_by: 'New client (the review project)', note: frame.connected ? `Connected${frame.since ? ' ' + String(frame.since).slice(0, 10) : ''}.` : 'Makes the review project for each new client.', fix: 'Locus > Settings > New client > Connect Frame (Adobe Developer Console app).' }),
    A('anthropic', 'Claude', set(env.ANTHROPIC_API_KEY), { used_by: 'the Strategist, briefs, reports, research, the ideas pipeline', fix: 'Set ANTHROPIC_API_KEY on the account-health worker.' }),
    A('studio', 'Studio image model (OpenAI)', set(openai), { used_by: 'Studio', note: 'Makes the static ads in Studio.', fix: 'Locus > Studio > Connections > paste the OpenAI key.' }),
    A('gemini', 'Gemini (watches reference videos)', set(env.GEMINI_API_KEY), { used_by: 'the ideas pipeline', note: 'Reads TikToks, Reels and uploads.', fix: 'Set GEMINI_API_KEY on the account-health worker (Google AI Studio).' }),
    A('atria', 'Atria (ad library)', !!atria.connected, { used_by: 'the ideas pipeline, Season swipe files, the creator links', note: atria.connected ? `Connected ${String(atria.since || '').slice(0, 10)}.` : 'Reference ads from Atria links are read through it.', fix: 'Locus > Studio > Connections > Connect Atria (Cole signs in once for the whole workspace).' }),
    A('canva', 'Canva', set(canvaId) && set(canvaTok), { used_by: 'Studio (optional)', warn: set(canvaId) && !set(canvaTok), note: set(canvaId) && !set(canvaTok) ? 'App set up, not signed in.' : 'Optional: pushes Studio ads into Canva.', fix: 'Locus > Studio > Connections > Connect Canva.' }),
    A('downloader', 'Video downloader (ScrapeCreators)', set(env.DOWNLOADER_KEY), { used_by: 'the ideas pipeline', note: 'Fetches TikTok and Instagram videos.', fix: 'Set DOWNLOADER_KEY on the account-health worker.' }),
    A('lucky_app', 'Lucky creator app', set(env.LUCKY_SUPABASE_URL) && set(env.LUCKY_SUPABASE_SERVICE_KEY), { used_by: 'the ideas pipeline, Lucky Golf only', only: luckyAct, note: 'Files creator angles into creators.luckygolf.com.', fix: 'Set LUCKY_SUPABASE_URL and LUCKY_SUPABASE_SERVICE_KEY on the account-health worker.' }),
  ];

  /* ---------------- per brand ---------------- */
  const accounts = (await q(`SELECT act_id, name, active, tz, slack_channel, brief_channel, tw_shop, last_sync_insights, last_error, meta_act FROM brand_accounts WHERE active = 1 ORDER BY name`))
    .filter(a => !brand || a.act_id === brand || a.meta_act === brand || a.name.toLowerCase().includes(String(brand).toLowerCase()));
  if (!accounts.length) return { agency, brands: [], as_of: new Date().toISOString() };
  const ids = accounts.map(a => a.act_id);
  const IN = ids.map((_, i) => `?${i + 1}`).join(',');
  /* Meta ad accounts Locus can see that no brand has (the pick list on a brand with no Meta account). */
  const freeMeta = await q(`SELECT act_id, name FROM accounts WHERE act_id NOT IN (SELECT external_id FROM connections WHERE kind = 'meta') ORDER BY name`).catch(() => []);
  const byAct = rows => Object.fromEntries(rows.map(r => [r.act_id, r]));
  const [metaD, twD, twO, twA, asanaDocs, nc, onb, shops, ga, kl, studioN, linkDocs, klDocs, gDocs, tkd, etool, ttTw, attn, used] = await Promise.all([
    /* daily_insights is Meta's: filed under the Meta account id. Map each back to its brand. */
    q(`SELECT c.brand_id AS act_id, MAX(d.date) AS latest FROM daily_insights d JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id WHERE c.brand_id IN (${IN}) GROUP BY c.brand_id`, ...ids).then(byAct),
    q(`SELECT act_id, MAX(date) AS latest FROM tw_daily WHERE act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    q(`SELECT act_id, MAX(date) AS latest, COUNT(*) AS n FROM tw_orders WHERE act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    q(`SELECT act_id, MAX(date) AS latest FROM tw_ad_attr WHERE act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    q(`SELECT act_id, data_json FROM p_br_doc WHERE line_id = '' AND key = 'asana' AND act_id IN (${IN})`, ...ids).then(rows => Object.fromEntries(rows.map(r => [r.act_id, safeJson(r.data_json, null)]))),
    q(`SELECT act_id, drive_url, steps_json FROM p_newclient WHERE act_id IN (${IN})`, ...ids).then(byAct),
    q(`SELECT act_id, status FROM p_br_onboard WHERE act_id IN (${IN})`, ...ids).then(byAct),
    q(`SELECT act_id, shop, access_token, installed_at, uninstalled_at, last_sync_at FROM p_shopify WHERE act_id IN (${IN})`, ...ids).then(rows => { const o = {}; for (const r of rows) if (!o[r.act_id] || (!r.uninstalled_at && r.access_token)) o[r.act_id] = r; return o; }),
    q(`SELECT act_id, SUM(value) AS v FROM tw_daily WHERE metric = 'ga_adCost' AND date >= date('now', '-14 days') AND act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    q(`SELECT act_id, SUM(value) AS v FROM tw_daily WHERE metric = 'klaviyoPlacedOrderSales' AND date >= date('now', '-14 days') AND act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    q(`SELECT act_id, COUNT(*) AS n FROM p_studio_batch WHERE act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    /* Brands onboarded before New client existed: their Drive folder and Frame project live outside
       Locus until someone pastes the links (PUT /api/brand-links -> the brand's drive / frame connections). */
    q(`SELECT brand_id, kind, external_id FROM connections WHERE kind IN ('drive', 'frame') AND brand_id IN (${IN})`, ...ids).then(rows => { const o = {}; for (const r of rows) (o[r.brand_id] ||= {})[r.kind] = r.external_id; return o; }),
    /* The brand's Klaviyo private key (klaviyo.js). Only its presence, company and date leave this function. */
    q(`SELECT act_id, data_json FROM p_br_doc WHERE line_id = '' AND key = 'klaviyo' AND act_id IN (${IN})`, ...ids).then(rows => Object.fromEntries(rows.map(r => { const d = safeJson(r.data_json, {}) || {}; return [r.act_id, { has: !!d.key, company: d.company, verified_at: d.verified_at }]; }))),
    q(`SELECT brand_id, kind, external_id FROM connections WHERE kind IN ('ga4', 'gsc', 'google_ads') AND brand_id IN (${IN})`, ...ids).then(rows => { const o = {}; for (const r of rows) (o[r.brand_id] ||= {})[r.kind === 'google_ads' ? 'ads' : r.kind] = r.external_id; return o; }),
    q(`SELECT brand_id, external_id FROM connections WHERE kind = 'tiktok' AND brand_id IN (${IN})`, ...ids).then(rows => Object.fromEntries(rows.map(r => [r.brand_id, { advertiser_id: r.external_id }]))),
    /* A brand's email tool (Ice & Gold = Attentive): settings emailTool:<act>; Klaviyo when unset. */
    q(`SELECT key, value FROM settings WHERE key LIKE 'emailTool:%'`).then(rows => Object.fromEntries(rows.map(r => [r.key.slice(10), r.value]))),
    /* TikTok as Triple Whale sees it: its spend, or orders credited to TikTok (last 14 days). */
    q(`SELECT act_id, SUM(v) AS v FROM (SELECT act_id, value AS v FROM tw_daily WHERE metric = 'tiktok_spend' AND date >= date('now', '-14 days') AND act_id IN (${IN})
         UNION ALL SELECT act_id, revenue AS v FROM tw_ad_attr WHERE platform = 'tiktok' AND model = 'lastPlatformClick' AND date >= date('now', '-14 days') AND act_id IN (${IN})) GROUP BY act_id`, ...ids).then(byAct),
    /* Attentive as Triple Whale sees it: orders credited to an Attentive link (utm_source=attentive), last 30 days. */
    q(`SELECT act_id, SUM(revenue) AS v, SUM(orders) AS n FROM tw_ad_attr WHERE lower(platform) LIKE '%attentive%' AND model = 'lastPlatformClick' AND date >= date('now', '-30 days') AND act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    /* Every brand's linked ids (all brands, not just the ones in this report), so a pick list can say who already uses one. */
    q(`SELECT c.kind, c.external_id, c.brand_id, b.name FROM connections c LEFT JOIN brand_accounts b ON b.act_id = c.brand_id WHERE c.kind IN ('google_ads', 'ga4', 'gsc', 'tiktok')`).then(rows => { const o = {}; for (const r of rows) o[`${r.kind}:${r.external_id}`] = r.name || r.brand_id; return o; }),
  ]);
  const usedBy = (kind, v) => used[`${kind}:${v}`] || null;
  const dashed = id => String(id).replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  /* What Locus can already SEE, as pick lists (2026-10-09): the page offers these instead of a paste box. */
  const mcc = String(env.GOOGLE_ADS_MCC || '5566468199').replace(/\D/g, '');
  const adsSeen = new Map();
  for (const x of gAds.accounts || []) if (!x.manager && x.id !== mcc) adsSeen.set(x.id, x.name);
  for (const id of gp.ads?.customers || []) if (id !== mcc && !adsSeen.has(id)) adsSeen.set(id, '');
  const OPT = {
    meta: freeMeta.map(m => ({ value: m.act_id, label: `${m.name} (${m.act_id})`, linked_to: null })),
    google_ads: [...adsSeen].map(([id, nm]) => ({ value: id, label: nm ? `${nm} (${dashed(id)})` : dashed(id), linked_to: usedBy('google_ads', id) })),
    ga4: (gp.ga4?.properties || []).map(p => ({ value: p.id, label: `${p.name} (${p.id})`, linked_to: usedBy('ga4', p.id) })),
    gsc: (gp.gsc?.sites || []).map(x => ({ value: x.url, label: x.url, linked_to: usedBy('gsc', x.url) })),
    tiktok: (tk.advertisers || []).map(x => ({ value: x.id, label: x.name ? `${x.name} (${x.id})` : x.id, linked_to: usedBy('tiktok', x.id) })),
  };
  /* Every item carries the exact steps a person follows when it is off (Cole, 2026-10-07: "it tells me
     exactly what to do, how to do it, what to name things"), and `input` when the fix is a thing to
     paste or pick (a link, a key, an id). The page draws them; PUT /api/brand-links takes the value. */
  const GROUP = { meta: 'Ads', google_ads: 'Ads', tiktok: 'Ads', tw: 'Store', shopify: 'Store', ga4: 'Website', gsc: 'Website', email: 'Email and SMS', asana: 'Work', drive: 'Work', frame: 'Work' };
  const C = (key, name, state, note, fix = '', extra = {}) => ({ key, name, group: GROUP[key] || 'Other', state, note, fix, ...extra });
  const BM = '695359915477596';
  const TWU = 'https://app.triplewhale.com';
  /* A step: t = what to do, u = the link to open, c = a value to copy with one tap (a name, an id). */
  const STEPS = {
    meta: [
      { t: 'The client opens Meta Business Settings > Users > Partners > Add > "Give a partner access to your assets".', u: 'https://business.facebook.com/settings/partners' },
      { t: 'They paste Mobius\'s Business ID, then tick the AD ACCOUNT (Manage campaigns), the PAGE (Full control), the PIXEL / dataset and the CATALOG.', c: BM },
      { t: 'Partner access covers that asset from then on; a NEW ad account they add later must be shared the same way (it is per asset, not "all future").' },
      { t: 'Locus discovers the account within the hour and switches it on by name for a waiting New client, or asks you in #mobius-newbiz. Then pick it here.' },
    ],
    tw: [
      { t: 'The client opens Triple Whale > Settings > Team and adds Cole as an admin.', u: TWU, c: 'cole@go-mobius-digital.com' },
      { t: 'Paste the store domain (xxx.myshopify.com) here. The nightly sync starts within the hour and backfills 400 days of orders one slice a night.' },
    ],
    shopify: [
      { t: 'Send the client the install link below. They sign in to their store admin and approve the Mobius Digital app (read orders, customers, products, reports).' },
      { t: 'Blocked today: Shopify paused the app review on 2026-08-31 until the post-install page shows a real report. Being fixed; until it passes, Triple Whale carries the store numbers.' },
    ],
    asana: [
      { t: 'New client makes the project from "MD - Template 2026 v2". For an older brand: Brand tab > Brand info > Connect Asana picks the project by the brand name, or choose it by hand.' },
      { t: 'The team writes every brief in the project\'s Creative Brief column; Locus numbers it, files the angle and judges the test. No webhook = hourly sync only, which is fine.' },
    ],
    drive: [{ t: 'New client makes the folder (Agreements + From the client). For an older brand, open the brand\'s folder in Drive, copy the link from the address bar and paste it here.', u: 'https://drive.google.com/drive/my-drive' }],
    frame: [{ t: 'New client makes the review project. For an older brand, open the project in Frame (next.frame.io), copy the link and paste it here.', u: 'https://next.frame.io' }],
    google_ads: [
      { t: 'Ask the client for their 10-digit Google Ads customer ID (top right in Google Ads, like 123-456-7890).' },
      { t: 'In the Mobius manager account: Accounts > the + button > Link existing account, paste their customer ID and send the request.', u: 'https://ads.google.com/aw/accounts', c: '556-646-8199' },
      { t: 'The client accepts it in their Google Ads: Admin > Access and security > Managers > Accept on the Mobius Digital request.', u: 'https://ads.google.com/aw/accountaccess/managers' },
      { t: 'Pick the account here. It shows in the list a few minutes after they accept.' },
      { t: 'Through Triple Whale (spend and sales by day): the client connects Google Ads in Triple Whale > Integrations, signing in with the Google account that owns the ad account.', u: TWU },
    ],
    ga4: [
      { t: 'The client opens Google Analytics > Admin > Property access management > + > Add users, and adds this email as a Viewer.', u: 'https://analytics.google.com/analytics/web/', c: asWho },
      { t: 'Pick the property here. It shows in the list once access is given (or paste the property ID: GA4 > Admin > Property details, a number like 312345678).' },
    ],
    gsc: [
      { t: 'The client opens Search Console > Settings > Users and permissions > Add user, adds this email and sets Permission to Full.', u: 'https://search.google.com/search-console/users', c: asWho },
      { t: 'Pick the site here. It shows in the list once access is given (or paste it exactly as Search Console shows it: sc-domain:brand.com or https://www.brand.com/).' },
    ],
    tiktok: [
      { t: 'The client opens TikTok Business Center > Partners > Add partner, adds the Mobius Digital Business Center and shares the ad account with it.', u: 'https://business.tiktok.com/' },
      { t: 'Cole presses Connect TikTok on Ads > TikTok again so the newly shared ad account is on our sign-in, then pick it here.' },
      { t: 'Through Triple Whale (spend and sales by day): the client connects TikTok in Triple Whale > Integrations.', u: TWU },
    ],
    klaviyo: [
      { t: 'In the brand\'s Klaviyo: Settings > API keys > Create Private API Key. Name it:', u: 'https://www.klaviyo.com/settings/account/api-keys', c: 'Locus (Mobius)' },
      { t: 'Access level: FULL ACCESS (Cole: Locus must be able to make changes, not only read). Create, then copy the key: Klaviyo shows it once.' },
      { t: 'Paste the key (pk_...) here. Locus checks it against the account before saving and never shows it again.' },
      { t: 'Also make sure Klaviyo is connected inside the brand\'s Triple Whale (Integrations) so email revenue lands on the P&L.', u: TWU },
    ],
    attentive: [
      { t: 'In Attentive, turn on link tracking (Settings > Google Analytics) so every link carries utm_source=attentive. That is how Triple Whale credits the orders to Attentive.', u: 'https://ui.attentivemobile.com' },
      { t: 'Make sure Attentive is connected in the client\'s Triple Whale (Integrations).', u: TWU },
      { t: 'Campaign and journey detail (sends, clicks, which journey) needs Attentive\'s beta connection or their nightly data files. Not built yet.' },
    ],
  };
  const GETS = {
    meta: 'Spend, delivery and every ad, synced hourly; sales on each ad credited by Triple Whale.',
    google_ads: 'Spend and sales by day through Triple Whale; campaigns, campaign types and search terms direct.',
    tiktok: 'Spend and sales by day through Triple Whale; campaigns from TikTok itself direct.',
    tw: 'Revenue, orders, customers, costs, and which ad each order came from.',
    shopify: 'Real cohorts, product names and receipts, and stock for Products.',
    ga4: 'Website traffic, channels, landing pages, devices and the shopping funnel.',
    gsc: 'Organic search: the queries, the pages, brand vs non-brand.',
    klaviyo: 'Email and SMS revenue, plus lists, segments, flows and campaign results.',
    attentive: 'Attentive revenue and orders, through Triple Whale.',
    asana: 'Briefs, numbered tests and the test library.',
    drive: 'The client folder: agreements, files from the client, the photo library.',
    frame: 'The review project for the creative.',
  };
  const brands = accounts.map(a => {
    const id = a.act_id, doc = asanaDocs[id], n = nc[id], ob = onb[id], sh = shops[id];
    const steps = safeJson(n?.steps_json, {}) || {};
    const links = linkDocs[id] || {};
    const frameUrl = steps.frame?.url || steps.frame?.project?.url || links.frame || null;
    const driveUrl = n?.drive_url || links.drive || null;
    const legacy = !n && !ob;   // a brand set up before New client and the onboarding link existed
    const metaAge = daysAgo(metaD[id]?.latest), twAge = daysAgo(twD[id]?.latest), attrAge = daysAgo(twA[id]?.latest);
    const kd = klDocs[id], gd = gDocs[id] || {};

    /* Google Ads: ONE item, two levels. ok = linked directly and readable; part = only through Triple Whale. */
    const gTw = (ga[id]?.v || 0) > 0, gDirect = !!gd.ads && !!gp.ads?.ok, gSeen = !gd.ads || adsSeen.has(gd.ads) || !adsSeen.size;
    const gState = gDirect && gSeen ? 'ok' : gTw ? 'part' : gd.ads ? 'warn' : 'off';
    const gNote = [
      gTw ? `Through Triple Whale: ${Math.round(ga[id].v)} spent in the last 14 days.` : 'No Google spend in Triple Whale in the last 14 days (not running, or Google Ads is not connected in the client\'s Triple Whale).',
      gd.ads ? `Direct: customer ${dashed(gd.ads)}${!gp.ads?.ok ? ' (Locus cannot read the Google Ads API yet: see Google on the agency side)' : !gSeen ? ' (not under the Mobius manager account: the client has to accept the link)' : ''}.` : 'Not linked directly: Ads > Google shows Triple Whale totals.',
    ].join(' ');
    /* TikTok: the same two levels. */
    const tTw = (ttTw[id]?.v || 0) > 0, tLinked = !!tkd[id]?.advertiser_id;
    const tState = tLinked && tk.connected ? 'ok' : tTw ? 'part' : tLinked ? 'warn' : 'off';
    const tNote = [
      tTw ? 'Through Triple Whale: TikTok spend or orders in the last 14 days.' : 'Nothing from TikTok in Triple Whale in the last 14 days.',
      tLinked ? `Direct: advertiser ${tkd[id].advertiser_id}${tk.connected ? '' : ' (TikTok is not connected agency-wide yet)'}.` : 'Not linked directly: Ads > TikTok shows Triple Whale totals.',
    ].join(' ');
    /* Email and SMS: ONE item, the brand's tool (settings emailTool:<act>). */
    const tool = etool[id] === 'attentive' ? 'attentive' : 'klaviyo';
    const klTw = (kl[id]?.v || 0) > 0, atTw = (attn[id]?.v || 0) > 0;
    const email = tool === 'attentive'
      ? C('email', 'Attentive', atTw ? 'part' : 'off',
        `${atTw ? `Through Triple Whale: ${Math.round(attn[id].v)} from ${attn[id].n || 0} orders on Attentive links in the last 30 days. ` : 'No orders credited to Attentive in Triple Whale in the last 30 days. '}Revenue and orders reach Locus through Triple Whale (campaigns only; no journeys, clicks or cost). Campaign and journey detail needs Attentive's beta connection or their nightly data files: not built yet.`,
        'Turn on link tracking in Attentive and connect Attentive in the client\'s Triple Whale.',
        { tool, tools: ['klaviyo', 'attentive'], gets: GETS.attentive, steps: STEPS.attentive, input: null,
          levels: [{ name: 'Through Triple Whale', on: atTw, note: 'Revenue and orders from Attentive links.' }, { name: 'Detail', on: false, note: 'Campaigns and journeys: not built.' }] })
      : C('email', 'Klaviyo', kd?.has ? 'ok' : klTw ? 'part' : 'off',
        kd?.has ? `Connected as ${kd.company || 'the account'} (key verified ${String(kd.verified_at || '').slice(0, 10)}). ${klTw ? `Email revenue in Triple Whale, last 14 days: ${Math.round(kl[id].v)}.` : 'No email revenue in Triple Whale in the last 14 days: connect Klaviyo inside the client\'s Triple Whale too.'}` : `Not connected. ${klTw ? 'Triple Whale carries the email revenue, but lists, segments, flows and campaigns need the brand\'s own key.' : 'No Klaviyo revenue in Triple Whale either.'}`,
        'Paste the brand\'s private API key.',
        { tool, tools: ['klaviyo', 'attentive'], gets: GETS.klaviyo, steps: STEPS.klaviyo, input: kd?.has ? null : { key: 'klaviyo_key', label: 'Private API key', placeholder: 'pk_...', secret: true },
          levels: [{ name: 'Through Triple Whale', on: klTw, note: 'Email revenue on the P&L.' }, { name: 'Direct', on: !!kd?.has, note: 'Lists, segments, flows and campaign results, read with the brand\'s own key.' }] });

    const items = [
      /* ---- Ads ---- */
      C('meta', 'Meta', a.last_error ? 'bad' : metaAge == null ? 'off' : metaAge > 2 ? 'warn' : 'ok',
        a.last_error ? `Sync failing: ${String(a.last_error).slice(0, 120)}` : metaAge == null ? (a.meta_act ? 'No Meta data yet.' : 'No Meta ad account connected.') : `Data through ${metaD[id].latest} (synced ${String(a.last_sync_insights || '').slice(0, 16) || 'never'}).`,
        a.last_error ? 'Check the token still sees this ad account (Meta Business > System users > assets), then Settings > Jobs and data.'
          : a.meta_act ? 'Partner access from the client, then the brand in Settings > Brands.'
          : `Once the client shares their ad account, pick it here.${freeMeta.length ? '' : ' Locus sees no unattached ad account yet.'}`,
        { gets: GETS.meta, steps: STEPS.meta, input: a.meta_act ? null : { key: 'meta', label: 'Meta ad account', placeholder: 'act_1234567890' }, options: a.meta_act ? [] : OPT.meta }),
      C('google_ads', 'Google Ads', gState, gNote, gState === 'ok' ? '' : 'Link the account under the Mobius manager and pick it here; for daily totals the client connects Google Ads in Triple Whale.',
        { gets: GETS.google_ads, steps: STEPS.google_ads, input: { key: 'google_ads', label: 'Google Ads customer ID', placeholder: '123-456-7890' }, options: OPT.google_ads,
          levels: [{ name: 'Through Triple Whale', on: gTw, note: 'Spend and sales by day, from the client\'s Triple Whale.' }, { name: 'Direct', on: gDirect && gSeen, note: 'Campaigns, campaign types, search terms, exact spend. Read through the Mobius manager account 556-646-8199.' }] }),
      C('tiktok', 'TikTok', tState, tNote, tState === 'ok' ? '' : 'The client adds the Mobius Business Center as a partner, then pick the ad account here.',
        { gets: GETS.tiktok, steps: STEPS.tiktok, input: { key: 'tiktok_id', label: 'TikTok advertiser ID', placeholder: '7012345678901234567' }, options: OPT.tiktok,
          levels: [{ name: 'Through Triple Whale', on: tTw, note: 'Spend and sales by day, from the client\'s Triple Whale.' }, { name: 'Direct', on: tLinked && !!tk.connected, note: 'Campaigns from TikTok itself, through the Mobius TikTok app.' }] }),
      /* ---- Store ---- */
      C('tw', 'Triple Whale', !set(a.tw_shop) ? 'off' : twAge == null ? 'bad' : twAge > 2 ? 'warn' : 'ok',
        !set(a.tw_shop) ? 'No shop set.' : twAge == null ? `Shop ${a.tw_shop} set, no data landed.` : `${a.tw_shop}: store data through ${twD[id].latest}${attrAge != null ? `, attribution through ${twA[id].latest}` : ', no attribution rows'}${twO[id] ? `, ${twO[id].n} orders stored` : ''}.`,
        'The client adds us to their Triple Whale, then the shop domain goes on the brand.', { gets: GETS.tw, steps: STEPS.tw, input: set(a.tw_shop) ? null : { key: 'tw_shop', label: 'Store domain', placeholder: 'brand.myshopify.com' } }),
      C('shopify', 'Shopify', sh?.access_token && !sh.uninstalled_at ? 'ok' : sh?.uninstalled_at ? 'bad' : 'off',
        sh?.access_token && !sh.uninstalled_at ? `${sh.shop} installed ${String(sh.installed_at).slice(0, 10)}${sh.last_sync_at ? `, cohorts ${String(sh.last_sync_at).slice(0, 10)}` : ''}.` : sh?.uninstalled_at ? `${sh.shop} removed the app ${String(sh.uninstalled_at).slice(0, 10)}.` : 'Not installed (Triple Whale carries the store numbers; Shopify adds real cohorts, product names and receipts).',
        'The client installs the Mobius Digital app from the link. Blocked until Shopify finishes reviewing the app.', { gets: GETS.shopify, steps: STEPS.shopify }),
      /* ---- Website (Google read directly, google.js) ---- */
      C('ga4', 'Google Analytics 4', gd.ga4 ? (gp.ga4?.ok ? 'ok' : 'warn') : 'off', gd.ga4 ? `Property ${gd.ga4}${gp.ga4?.ok ? '' : ' (Locus cannot read Google Analytics yet: see Google on the agency side)'}.` : 'No GA4 property linked: Store > Website stays empty.',
        'The client adds Cole as a Viewer, then pick the property here.', { gets: GETS.ga4, steps: STEPS.ga4, input: { key: 'ga4', label: 'GA4 property ID', placeholder: '312345678' }, options: OPT.ga4 }),
      C('gsc', 'Google Search Console', gd.gsc ? (gp.gsc?.ok ? 'ok' : 'warn') : 'off', gd.gsc ? `${gd.gsc}${gp.gsc?.ok ? '' : ' (Locus cannot read Search Console yet: see Google on the agency side)'}.` : 'No Search Console site linked: Store > Search stays empty.',
        'The client adds Cole as a Full user, then pick the site here.', { gets: GETS.gsc, steps: STEPS.gsc, input: { key: 'gsc', label: 'Search Console property', placeholder: 'sc-domain:brand.com' }, options: OPT.gsc }),
      /* ---- Email and SMS ---- */
      email,
      /* ---- Work ---- */
      C('asana', 'Asana project', doc?.project_gid ? (doc.hook_gid ? 'ok' : 'warn') : 'off',
        doc?.project_gid ? `${doc.project_name || doc.project_gid}, synced ${String(doc.last_sync || '').slice(0, 16) || 'never'}${doc.hook_gid ? '' : ', no webhook (hourly sync only)'}.` : 'Not connected: briefs are not read, nothing is numbered.',
        'Brand tab > Brand info > Connect Asana (picks the project by the brand name).', { gets: GETS.asana, steps: STEPS.asana }),
      C('drive', 'Google Drive folder', set(driveUrl) ? 'ok' : 'off', set(driveUrl) ? driveUrl : legacy ? 'Set up before New client existed, so the folder is not recorded here.' : 'No folder recorded.',
        legacy ? 'Paste the brand\'s Drive folder link.' : 'Settings > New client > Drive step makes it.', { gets: GETS.drive, steps: STEPS.drive, input: { key: 'drive', label: 'Drive folder link', placeholder: 'https://drive.google.com/drive/folders/...' } }),
      C('frame', 'Frame.io project', set(frameUrl) ? 'ok' : 'off', set(frameUrl) ? frameUrl : legacy ? 'Set up before New client existed, so the project is not recorded here.' : 'No review project recorded.',
        legacy ? 'Paste the brand\'s Frame project link.' : 'Settings > New client > Frame step (Frame must be connected agency-wide).', { gets: GETS.frame, steps: STEPS.frame, input: { key: 'frame', label: 'Frame project link', placeholder: 'https://next.frame.io/project/...' } }),
    ];
    const needs = items.filter(i => i.state === 'bad' || i.state === 'warn').length, off = items.filter(i => i.state === 'off').length;
    return { act_id: id, name: a.name, studio_batches: studioN[id]?.n || 0, items, summary: needs ? `${needs} to look at` : off ? `${off} not set up` : 'all connected' };
  });
  return { agency, brands, as_of: new Date().toISOString(),
    how_it_works: 'AGENCY connections are made once (a secret on the worker, or Cole signing in from Locus) and every brand rides on them. PER BRAND connections are made at onboarding: the New client flow makes the Asana project, Drive folder and Frame project; the ad accounts, the Triple Whale shop, the Shopify install, Google Analytics and Search Console access are given by the client. Google Ads and TikTok have two levels: through Triple Whale (daily totals, the client connects them inside Triple Whale) and direct (campaigns and detail, linked to Mobius). Email is Klaviyo (the brand\'s own key) or Attentive (through Triple Whale only, for now).' };
}
