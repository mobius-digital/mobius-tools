import { tiktokStatus } from './tiktok.js';
import { googleProbe } from './google.js';
const safeJsonI = v => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
/**
 * CONNECTIONS (2026-10-07). Cole: "I'm trying to figure out which things need access once and
 * which need access all the time... what gets access automatically because it's the agency's
 * account... an integration page where we make sure all the integrations are there and if
 * something breaks we know how to fix it from within the settings."
 *
 * Two kinds, and the page says which is which:
 *   AGENCY (connected once, on the worker or by Cole signing in; every brand rides on it):
 *     Meta, Triple Whale, Asana, Slack, Google (Drive / Docs as Cole or Ahsan), Atria, Frame,
 *     the Studio image key, Canva, Gemini (video), the downloader, Stripe, the Lucky creator
 *     app, the Shopify app itself (on the profit worker), the Claude key.
 *   PER BRAND (set at onboarding, by the New client flow or by hand in the Brand tab):
 *     the Meta ad account, the Triple Whale shop, the Shopify store install, the Asana project,
 *     the internal and client Slack channels, the Drive folder, the Frame project, the creator
 *     link, the onboarding answers. Google Ads and Klaviyo are not connections of ours: they
 *     arrive through Triple Whale, and the page shows whether that brand's data carries them.
 *
 * integrationsReport(env) is read by GET /api/integrations (Locus Settings > Connections) and
 * by the Strategist's `integrations` view. Every entry: { key, name, state: ok | warn | off,
 * note, fix }. Nothing here changes anything; the fixes point at the screen that does.
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
  const A = (key, name, on, { warn = false, note = '', fix = '', used_by = '', only = null } = {}) => ({ key, name, needs: 'once', state: on ? (warn ? 'warn' : 'ok') : 'off', note, fix, used_by, only });
  const luckyAct = (await first(`SELECT act_id FROM accounts WHERE lower(name) LIKE 'lucky%' AND active = 1 LIMIT 1`))?.act_id || null;
  const gp = await googleProbe(env).catch(() => ({}));
  const tk = await tiktokStatus(env).catch(() => ({}));
  const gsa = (safeJsonI(env.GOOGLE_SA_KEY) || {}).client_id || 'the service account';
  const gsteps = (scope, apis) => `1) Google Workspace admin (admin.google.com) > Security > Access and data control > API controls > Manage domain-wide delegation > edit client ${gsa} > ADD ${scope} to the scopes already there (keep the existing ones). 2) console.cloud.google.com, the project that owns that service account > APIs and services > Enable: ${apis}.`;
  const agency = [
    A('meta', 'Meta (ads)', set(env.META_TOKEN), { used_by: 'every brand\'s ad data, the Meta tab, Test calls', note: discover?.at ? `Ad accounts last discovered ${discover.at.slice(0, 10)}.` : 'The Mobius Tools system-user token.', fix: 'Set META_TOKEN on the account-health worker (Meta Business > System users > Mobius Tools, with ads_read, business_management, pages_read_engagement).' }),
    A('tw', 'Triple Whale', set(env.TW_API_KEY), { used_by: 'revenue, attribution, orders for every brand', note: 'One key for every store; each brand names its shop below.', fix: 'Set TW_API_KEY on the account-health worker (Triple Whale > Settings > API keys).' }),
    A('asana', 'Asana', set(env.ASANA_TOKEN), { used_by: 'briefs, the test library, New client', warn: set(env.ASANA_TOKEN) && !fields?.workspace, note: fields?.workspace ? 'Locus fields (Angle, Testing, Result...) are on the workspace.' : 'Token set, fields not created yet.', fix: 'Set ASANA_TOKEN (a personal access token of a Mobius admin) on the account-health worker; the fields are created when the first brand connects its project.' }),
    A('slack', 'Slack (the Mobius Digital app)', set(env.SLACK_BOT_TOKEN), { used_by: 'the Strategist, the ideas pipeline, briefs, reports, the Ledger, Pulse', warn: set(env.SLACK_BOT_TOKEN) && !(set(env.SLACK_SIGNING_SECRET) && set(env.SLACK_USER_TOKEN)), note: [set(env.SLACK_SIGNING_SECRET) ? 'buttons work' : 'buttons dead (no signing secret)', set(env.SLACK_USER_TOKEN) ? `client sends as ${slackWho === 'anyone' ? 'anyone' : 'Cole'}` : 'no user token (client sends fail)'].join('; ') + '.', fix: 'Secrets on the account-health worker: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_USER_TOKEN (api.slack.com > the Mobius Digital app).' }),
    A('google', 'Google (Drive, Docs, Gmail)', set(env.GOOGLE_SA_KEY), { used_by: 'reading briefs and Drive files, New client folders, the welcome email', note: 'Acts as Cole or Ahsan through the service account.', fix: 'Set GOOGLE_SA_KEY (the service-account JSON with domain-wide delegation) on the account-health worker.' }),
    A('anthropic', 'Claude', set(env.ANTHROPIC_API_KEY), { used_by: 'the Strategist, briefs, reports, research, the ideas pipeline', fix: 'Set ANTHROPIC_API_KEY on the account-health worker.' }),
    A('atria', 'Atria (ad library)', !!atria.connected, { used_by: 'the ideas pipeline, Season swipe files, the creator links', note: atria.connected ? `Connected ${String(atria.since || '').slice(0, 10)}.` : 'Reference ads from Atria links are read through it.', fix: 'Locus > Studio > Connections > Connect Atria (Cole signs in once for the whole workspace).' }),
    A('frame', 'Frame.io', !!frame.connected, { used_by: 'New client (the review project)', note: frame.connected ? `Connected${frame.since ? ' ' + String(frame.since).slice(0, 10) : ''}.` : 'Makes the review project for each new client.', fix: 'Locus > Settings > New client > Connect Frame (Adobe Developer Console app).' }),
    A('studio', 'Studio image model (OpenAI)', set(openai), { used_by: 'Studio', note: 'Makes the static ads in Studio.', fix: 'Locus > Studio > Connections > paste the OpenAI key.' }),
    A('canva', 'Canva', set(canvaId) && set(canvaTok), { used_by: 'Studio (optional)', warn: set(canvaId) && !set(canvaTok), note: set(canvaId) && !set(canvaTok) ? 'App set up, not signed in.' : 'Optional: pushes Studio ads into Canva.', fix: 'Locus > Studio > Connections > Connect Canva.' }),
    A('gemini', 'Gemini (watches reference videos)', set(env.GEMINI_API_KEY), { used_by: 'the ideas pipeline', note: 'Reads TikToks, Reels and uploads.', fix: 'Set GEMINI_API_KEY on the account-health worker (Google AI Studio).' }),
    A('downloader', 'Video downloader (ScrapeCreators)', set(env.DOWNLOADER_KEY), { used_by: 'the ideas pipeline', note: 'Fetches TikTok and Instagram videos.', fix: 'Set DOWNLOADER_KEY on the account-health worker.' }),
    A('stripe', 'Stripe', set(env.STRIPE_SECRET_KEY), { used_by: 'New client only (the first invoice and autopay)', note: 'Mobius\'s own Stripe; no brand connects to it.', fix: 'Set STRIPE_SECRET_KEY on the account-health worker.' }),
    A('lucky_app', 'Lucky creator app', set(env.LUCKY_SUPABASE_URL) && set(env.LUCKY_SUPABASE_SERVICE_KEY), { used_by: 'the ideas pipeline, Lucky Golf only', only: luckyAct, note: 'Files creator angles into creators.luckygolf.com.', fix: 'Set LUCKY_SUPABASE_URL and LUCKY_SUPABASE_SERVICE_KEY on the account-health worker.' }),
    A('ga4', 'Google Analytics 4 (website)', !!gp.ga4?.ok, { used_by: 'Store > Website: traffic, channels, landing pages, devices, the shopping funnel', note: gp.ga4?.ok ? `${gp.ga4.properties.length} properties visible as ${gp.acting_as}.` : `Not readable yet: ${gp.ga4?.error || 'not checked'}`, fix: gp.ga4?.ok ? `For a property not listed, add ${gp.acting_as} as a Viewer on it (GA4 > Admin > Property access management).` : gsteps('https://www.googleapis.com/auth/analytics.readonly', 'Google Analytics Data API, Google Analytics Admin API') + ` 3) On each client's GA4 property, add ${gp.acting_as || 'cole@go-mobius-digital.com'} as a Viewer.` }),
    A('gsc', 'Google Search Console (organic search)', !!gp.gsc?.ok, { used_by: 'Store > Search: queries, pages, brand vs non-brand', note: gp.gsc?.ok ? `${gp.gsc.sites.length} sites visible.` : `Not readable yet: ${gp.gsc?.error || 'not checked'}`, fix: gp.gsc?.ok ? `For a site not listed, add ${gp.acting_as} as a user (Search Console > Settings > Users and permissions).` : gsteps('https://www.googleapis.com/auth/webmasters.readonly', 'Google Search Console API') + ` 3) On each client's Search Console property, add ${gp.acting_as || 'cole@go-mobius-digital.com'} as a user.` }),
    A('gads', 'Google Ads (direct)', !!gp.ads?.ok, { used_by: 'Ads > Google: campaigns, types, search terms (Triple Whale totals until then)', note: gp.ads?.ok ? `${gp.ads.customers.length} ad accounts reachable through the Mobius manager account.` : `Not connected: ${gp.ads?.error || 'not checked'}`, fix: 'Developer tokens were retired on 2026-09-09; access now belongs to the Cloud project. 1) console.cloud.google.com > project mobius-tools-506114 > APIs and services > Google Ads API > Overview. 2) Complete brand verification for the project (OAuth consent screen > Branding). 3) Make sure the project has billing on a paid tier (Free Trial projects get rejected). 4) Apply for Basic access there; it is reviewed in minutes. 5) Each client’s Google Ads account must be linked under the Mobius manager account 556-646-8199.' }),
    A('tiktok', 'TikTok Ads (direct)', !!tk.connected, { used_by: 'Ads > TikTok: campaigns from TikTok itself (Triple Whale totals until then)', warn: tk.app && !tk.connected, note: tk.connected ? `Connected ${String(tk.since || '').slice(0, 10)}: ${(tk.advertisers || []).map(a => a.name || a.id).join(', ')}.` : tk.app ? 'App set up; press Connect TikTok on Ads > TikTok and sign in.' : 'No TikTok developer app yet.', fix: '1) business-api.tiktok.com: sign in with the Mobius TikTok for Business account, Become a Developer, then My Apps > Create an app (Marketing API). 2) Ask for the scopes Ad Account Management (read) and Reporting. 3) Advertiser redirect URL: https://mobius-account-health.mobius-digital.workers.dev/tiktok/callback 4) When TikTok approves it (usually a few days), run these in account-health/worker and paste each value when asked: npx.cmd wrangler secret put TIKTOK_APP_ID, then npx.cmd wrangler secret put TIKTOK_APP_SECRET. 5) Locus > Ads > TikTok > Connect TikTok, sign in, tick every ad account.' }),
    A('google_login', 'Google sign-in to Locus', set(env.GOOGLE_CLIENT_ID), { used_by: 'the team signing in', fix: 'Set GOOGLE_CLIENT_ID on the account-health worker.' }),
  ];

  /* ---------------- per brand ---------------- */
  const accounts = (await q(`SELECT act_id, name, active, tz, slack_channel, brief_channel, tw_shop, last_sync_insights, last_error FROM accounts WHERE active = 1 ORDER BY name`))
    .filter(a => !brand || a.act_id === brand || a.name.toLowerCase().includes(String(brand).toLowerCase()));
  if (!accounts.length) return { agency, brands: [], as_of: new Date().toISOString() };
  const ids = accounts.map(a => a.act_id);
  const IN = ids.map((_, i) => `?${i + 1}`).join(',');
  const byAct = rows => Object.fromEntries(rows.map(r => [r.act_id, r]));
  const [metaD, twD, twO, twA, asanaDocs, nc, hubs, onb, shops, ga, kl, studioN, hubN, linkDocs, klDocs, gDocs, tkd, etool] = await Promise.all([
    q(`SELECT act_id, MAX(date) AS latest FROM daily_insights WHERE act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    q(`SELECT act_id, MAX(date) AS latest FROM tw_daily WHERE act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    q(`SELECT act_id, MAX(date) AS latest, COUNT(*) AS n FROM tw_orders WHERE act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    q(`SELECT act_id, MAX(date) AS latest FROM tw_ad_attr WHERE act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    q(`SELECT act_id, data_json FROM p_br_doc WHERE line_id = '' AND key = 'asana' AND act_id IN (${IN})`, ...ids).then(rows => Object.fromEntries(rows.map(r => [r.act_id, safeJson(r.data_json, null)]))),
    q(`SELECT act_id, drive_url, slack_internal, slack_client, steps_json, asana_url FROM p_newclient WHERE act_id IN (${IN})`, ...ids).then(byAct),
    q(`SELECT act_id, slug, live FROM p_amb_brand WHERE act_id IN (${IN})`, ...ids).then(byAct),
    q(`SELECT act_id, status, submitted_at FROM p_br_onboard WHERE act_id IN (${IN})`, ...ids).then(byAct),
    q(`SELECT act_id, shop, access_token, installed_at, uninstalled_at, last_sync_at FROM p_shopify WHERE act_id IN (${IN})`, ...ids).then(rows => { const o = {}; for (const r of rows) if (!o[r.act_id] || (!r.uninstalled_at && r.access_token)) o[r.act_id] = r; return o; }),
    q(`SELECT act_id, SUM(value) AS v FROM tw_daily WHERE metric = 'ga_adCost' AND date >= date('now', '-14 days') AND act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    q(`SELECT act_id, SUM(value) AS v FROM tw_daily WHERE metric = 'klaviyoPlacedOrderSales' AND date >= date('now', '-14 days') AND act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    q(`SELECT act_id, COUNT(*) AS n FROM p_studio_batch WHERE act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    q(`SELECT act_id, COUNT(*) AS n FROM p_amb_angle WHERE status = 'live' AND act_id IN (${IN}) GROUP BY act_id`, ...ids).then(byAct),
    /* Brands onboarded before New client existed: their Drive folder and Frame project live outside
       Locus until someone pastes the links (PUT /api/brand-links -> p_br_doc key 'links'). */
    q(`SELECT act_id, data_json FROM p_br_doc WHERE line_id = '' AND key = 'links' AND act_id IN (${IN})`, ...ids).then(rows => Object.fromEntries(rows.map(r => [r.act_id, safeJson(r.data_json, {}) || {}]))),
    /* The brand's Klaviyo private key (klaviyo.js). Only its presence, company and date leave this function. */
    q(`SELECT act_id, data_json FROM p_br_doc WHERE line_id = '' AND key = 'klaviyo' AND act_id IN (${IN})`, ...ids).then(rows => Object.fromEntries(rows.map(r => { const d = safeJson(r.data_json, {}) || {}; return [r.act_id, { has: !!d.key, company: d.company, verified_at: d.verified_at }]; }))),
    q(`SELECT act_id, data_json FROM p_br_doc WHERE line_id = '' AND key = 'google' AND act_id IN (${IN})`, ...ids).then(rows => Object.fromEntries(rows.map(r => [r.act_id, safeJson(r.data_json, {}) || {}]))),
    q(`SELECT act_id, data_json FROM p_br_doc WHERE line_id = '' AND key = 'tiktok' AND act_id IN (${IN})`, ...ids).then(rows => Object.fromEntries(rows.map(r => [r.act_id, safeJson(r.data_json, {}) || {}]))),
    /* A brand whose email tool is not Klaviyo (Ice & Gold = Attentive): settings emailTool:<act>. */
    q(`SELECT key, value FROM settings WHERE key LIKE 'emailTool:%'`).then(rows => Object.fromEntries(rows.map(r => [r.key.slice(10), r.value]))),
  ]);
  /* Every item carries the exact steps a person follows when it is off (Cole, 2026-10-07: "it tells me
     exactly what to do, how to do it, what to name things"), and `input` when the fix is a thing to
     paste (a link, a key). The page draws them; PUT /api/brand-links takes the paste. */
  const C = (key, name, state, note, fix = '', extra = {}) => ({ key, name, state, note, fix, ...extra });
  const BM = '695359915477596';
  /* A step: t = what to do, u = the link to open, c = a value to copy with one tap (a name, an id). */
  const STEPS = {
    meta: [
      { t: 'The client opens Meta Business Settings > Users > Partners > Add > "Give a partner access to your assets".', u: 'https://business.facebook.com/settings/partners' },
      { t: 'They paste Mobius\'s Business ID, then tick the AD ACCOUNT (Manage campaigns), the PAGE (Full control), the PIXEL / dataset and the CATALOG.', c: BM },
      { t: 'Partner access covers that asset from then on; a NEW ad account they add later must be shared the same way (it is per asset, not "all future").' },
      { t: 'Locus discovers the account within the hour and switches it on by name for a waiting New client, or asks you in #mobius-newbiz. Older brands: Settings > Brands > + Add a brand.' },
    ],
    tw: [
      { t: 'The client opens Triple Whale > Settings > Team and adds Cole as an admin.', u: 'https://app.triplewhale.com', c: 'cole@go-mobius-digital.com' },
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
    slack_internal: [
      { t: 'New client makes "<brand>-internal" (private). For an older brand: open the channel in Slack > channel name > About > copy the Channel ID (starts with C).' },
      { t: 'Settings > Brands > the brand row > Team channel: paste the id. Invite @Mobius Digital to the channel (type /invite @Mobius Digital in it).' },
    ],
    slack_client: [
      { t: 'The client channel is where the Daily Brief and reports go. New client makes "<brand>" (private) and invites the client via Slack Connect.' },
      { t: 'Settings > Brands > the brand row > Client channel: paste the id. Leave it empty on purpose for a brand with no client channel (briefs are then auto-handled, never sent).' },
    ],
    drive: [{ t: 'New client makes the folder (Agreements + From the client). For an older brand, open the brand\'s folder in Drive, copy the link from the address bar and paste it here.', u: 'https://drive.google.com/drive/my-drive' }],
    frame: [{ t: 'New client makes the review project. For an older brand, open the project in Frame (next.frame.io), copy the link and paste it here.', u: 'https://next.frame.io' }],
    hub: [{ t: 'Creator link tab > pick the brand > set the intro, sections and angles > switch Live on. Lucky Golf uses its own creator app instead.' }],
    onboarding: [{ t: 'Brand tab > Client answers > send the onboarding link (new clients only; long-standing clients are pre-filled from research, never sent the form).' }],
    google_ads: [
      { t: 'The client opens Triple Whale > Integrations > Google Ads > Connect and signs in with the Google account that owns the ad account.', u: 'https://app.triplewhale.com' },
      { t: 'Locus reads Google spend and attribution through Triple Whale within a day. (Direct Google Ads access for deeper questions needs a developer token on our MCC: on the list.)' },
    ],
    klaviyo: [
      { t: 'In the brand\'s Klaviyo: Settings > API keys > Create Private API Key. Name it:', u: 'https://www.klaviyo.com/settings/account/api-keys', c: 'Locus (Mobius)' },
      { t: 'Access level: FULL ACCESS (Cole: Locus must be able to make changes, not only read). Create, then copy the key: Klaviyo shows it once.' },
      { t: 'Paste the key (pk_...) here. Locus checks it against the account before saving and never shows it again.' },
      { t: 'Also make sure Klaviyo is connected inside the brand\'s Triple Whale (Integrations) so email revenue lands on the P&L.' },
    ],
  };
  const brands = accounts.map(a => {
    const id = a.act_id, doc = asanaDocs[id], n = nc[id], hub = hubs[id], ob = onb[id], sh = shops[id];
    const steps = safeJson(n?.steps_json, {}) || {};
    const links = linkDocs[id] || {};
    const frameUrl = steps.frame?.url || steps.frame?.project?.url || links.frame || null;
    const driveUrl = n?.drive_url || links.drive || null;
    const legacy = !n && !ob;   // a brand set up before New client and the onboarding link existed
    const metaAge = daysAgo(metaD[id]?.latest), twAge = daysAgo(twD[id]?.latest), attrAge = daysAgo(twA[id]?.latest);
    const kd = klDocs[id], gd = gDocs[id] || {};
    const items = [
      C('meta', 'Meta ad account', a.last_error ? 'bad' : metaAge == null ? 'off' : metaAge > 2 ? 'warn' : 'ok',
        a.last_error ? `Sync failing: ${String(a.last_error).slice(0, 120)}` : metaAge == null ? 'No Meta data yet.' : `Data through ${metaD[id].latest} (synced ${String(a.last_sync_insights || '').slice(0, 16) || 'never'}).`,
        a.last_error ? 'Check the token still sees this ad account (Meta Business > System users > assets), then Settings > Jobs and data.' : 'Partner access from the client, then the brand in Settings > Brands.', { steps: STEPS.meta }),
      C('tw', 'Triple Whale', !set(a.tw_shop) ? 'off' : twAge == null ? 'bad' : twAge > 2 ? 'warn' : 'ok',
        !set(a.tw_shop) ? 'No shop set.' : twAge == null ? `Shop ${a.tw_shop} set, no data landed.` : `${a.tw_shop}: store data through ${twD[id].latest}${attrAge != null ? `, attribution through ${twA[id].latest}` : ', no attribution rows'}${twO[id] ? `, ${twO[id].n} orders stored` : ''}.`,
        'The client adds us to their Triple Whale, then the shop domain goes on the brand.', { steps: STEPS.tw, input: set(a.tw_shop) ? null : { key: 'tw_shop', label: 'Store domain', placeholder: 'brand.myshopify.com' } }),
      C('shopify', 'Shopify store', sh?.access_token && !sh.uninstalled_at ? 'ok' : sh?.uninstalled_at ? 'bad' : 'off',
        sh?.access_token && !sh.uninstalled_at ? `${sh.shop} installed ${String(sh.installed_at).slice(0, 10)}${sh.last_sync_at ? `, cohorts ${String(sh.last_sync_at).slice(0, 10)}` : ''}.` : sh?.uninstalled_at ? `${sh.shop} removed the app ${String(sh.uninstalled_at).slice(0, 10)}.` : 'Not installed (Triple Whale carries the store numbers; Shopify adds real cohorts, product names and receipts).',
        'The client installs the Mobius Digital app from the link. Blocked until Shopify finishes reviewing the app.', { steps: STEPS.shopify }),
      C('asana', 'Asana project', doc?.project_gid ? (doc.hook_gid ? 'ok' : 'warn') : 'off',
        doc?.project_gid ? `${doc.project_name || doc.project_gid}, synced ${String(doc.last_sync || '').slice(0, 16) || 'never'}${doc.hook_gid ? '' : ', no webhook (hourly sync only)'}.` : 'Not connected: briefs are not read, nothing is numbered.',
        'Brand tab > Brand info > Connect Asana (picks the project by the brand name).', { steps: STEPS.asana }),
      C('slack_internal', 'Slack internal channel', set(a.slack_channel) ? 'ok' : 'off', set(a.slack_channel) ? `${a.slack_channel}${n?.slack_internal && n.slack_internal !== a.slack_channel ? ` (New client made ${n.slack_internal})` : ''}: drafts, the Strategist, the ideas pipeline.` : 'No team channel: the Strategist and the ideas bot cannot be tagged for this brand.',
        'Settings > Brands > the brand > Team channel (the -internal channel id).', { steps: STEPS.slack_internal }),
      C('slack_client', 'Slack client channel', set(a.brief_channel) ? 'ok' : 'off', set(a.brief_channel) ? `${a.brief_channel}: the Daily Brief and reports go here.` : 'No client channel: briefs and reports are drafted and auto-handled, never sent.',
        'Settings > Brands > the brand > Client channel. Leave empty on purpose for a brand with no client channel.', { steps: STEPS.slack_client }),
      C('drive', 'Google Drive folder', set(driveUrl) ? 'ok' : 'off', set(driveUrl) ? driveUrl : legacy ? 'Set up before New client existed, so the folder is not recorded here.' : 'No folder recorded.',
        legacy ? 'Paste the brand\'s Drive folder link.' : 'Settings > New client > Drive step makes it.', { steps: STEPS.drive, input: { key: 'drive', label: 'Drive folder link', placeholder: 'https://drive.google.com/drive/folders/...' } }),
      C('frame', 'Frame.io project', set(frameUrl) ? 'ok' : 'off', set(frameUrl) ? frameUrl : legacy ? 'Set up before New client existed, so the project is not recorded here.' : 'No review project recorded.',
        legacy ? 'Paste the brand\'s Frame project link.' : 'Settings > New client > Frame step (Frame must be connected agency-wide).', { steps: STEPS.frame, input: { key: 'frame', label: 'Frame project link', placeholder: 'https://next.frame.io/project/...' } }),
      C('hub', 'Creator link', hub ? (hub.live ? 'ok' : 'warn') : 'off', hub ? `/angles/${hub.slug}, ${hubN[id]?.n || 0} live angle${hubN[id]?.n === 1 ? '' : 's'}${hub.live ? '' : ', link not live'}.` : 'No creator link (Lucky Golf uses its own creator app).', 'Creator link tab > set up the brand, switch Live on.', { steps: STEPS.hub }),
      /* Cole, 2026-10-07: long-standing clients are never sent the onboarding form. Their answers come from
         research, Asana and the website pre-fill (Brand tab > Client answers > Pre-fill), so this is "ok". */
      C('onboarding', 'Onboarding answers', ob ? (ob.status === 'submitted' ? 'ok' : 'warn') : legacy ? 'ok' : 'off', ob ? `${ob.status}${ob.submitted_at ? ' ' + String(ob.submitted_at).slice(0, 10) : ''}.` : legacy ? 'Long-standing client: no onboarding form, on purpose. Client answers are filled from research, Asana and the website pre-fill.' : 'No onboarding link sent.',
        legacy ? 'Nothing to do. To fill the call sheet without the client: Brand tab > Client answers > Pre-fill.' : 'Brand tab > Client answers > send the onboarding link.', { steps: STEPS.onboarding }),
      C('google_ads', 'Google Ads (via Triple Whale)', (ga[id]?.v || 0) > 0 ? 'ok' : 'off', (ga[id]?.v || 0) > 0 ? `Spend in the last 14 days: ${Math.round(ga[id].v)}.` : 'No Google spend in the last 14 days (either not running, or Google Ads is not connected in the client\'s Triple Whale).', 'The client connects Google Ads inside Triple Whale.', { steps: STEPS.google_ads }),
      /* Google read directly (google.js), 2026-10-08. The ids are pasted here or matched by Settings > Connections > Match Google. */
      C('ga4', 'Google Analytics 4', gd.ga4 ? (gp.ga4?.ok ? 'ok' : 'warn') : 'off', gd.ga4 ? `Property ${gd.ga4}${gp.ga4?.ok ? '' : ' (Locus cannot read Google Analytics yet: see the agency row)'}.` : 'No GA4 property linked: Store > Website stays empty.',
        'Paste the GA4 property ID (GA4 > Admin > Property details, a number like 312345678).', { input: { key: 'ga4', label: 'GA4 property ID', placeholder: '312345678' } }),
      C('gsc', 'Google Search Console', gd.gsc ? (gp.gsc?.ok ? 'ok' : 'warn') : 'off', gd.gsc ? `${gd.gsc}${gp.gsc?.ok ? '' : ' (Locus cannot read Search Console yet: see the agency row)'}.` : 'No Search Console site linked: Store > Search stays empty.',
        'Paste the property exactly as Search Console shows it (sc-domain:brand.com or https://www.brand.com/).', { input: { key: 'gsc', label: 'Search Console property', placeholder: 'sc-domain:brand.com' } }),
      C('gads_direct', 'Google Ads account (direct)', gd.ads ? (gp.ads?.ok ? 'ok' : 'warn') : 'off', gd.ads ? `Customer ${gd.ads}${gp.ads?.ok ? '' : ' (waiting on Basic access for the Cloud project)'}.` : 'Not linked directly; Ads > Google shows Triple Whale totals.',
        'Paste the 10-digit Google Ads customer ID (top right in Google Ads).', { input: { key: 'google_ads', label: 'Google Ads customer ID', placeholder: '123-456-7890' } }),
      C('tiktok_direct', 'TikTok ad account (direct)', tkd[id]?.advertiser_id ? (tk.connected ? 'ok' : 'warn') : 'off', tkd[id]?.advertiser_id ? `Advertiser ${tkd[id].advertiser_id}${tk.connected ? '' : ' (TikTok not connected agency-wide yet)'}.` : 'Not linked; Ads > TikTok shows Triple Whale totals.',
        'Paste the TikTok advertiser ID (TikTok Ads Manager, top left account menu).', { input: { key: 'tiktok_id', label: 'TikTok advertiser ID', placeholder: '7012345678901234567' } }),
      /* Klaviyo is a DIRECT connection now (klaviyo.js): the private key per brand. The Triple Whale side
         (email revenue on the P&L) is reported in the note, not as the connection. */
      etool[id] && !kd?.has ? C('klaviyo', `Email: ${etool[id][0].toUpperCase()}${etool[id].slice(1)}`, 'off', `This brand sends email and SMS through ${etool[id][0].toUpperCase()}${etool[id].slice(1)}, not Klaviyo. Its email revenue reaches Locus only if Triple Whale has ${etool[id][0].toUpperCase()}${etool[id].slice(1)} connected. Reading campaigns and flows directly is not built for it yet.`,
        `Ask the client to connect ${etool[id][0].toUpperCase()}${etool[id].slice(1)} inside their Triple Whale (Integrations).`) :
      C('klaviyo', 'Klaviyo', kd?.has ? 'ok' : 'off',
        kd?.has ? `Connected as ${kd.company || 'the account'} (key verified ${String(kd.verified_at || '').slice(0, 10)}). ${(kl[id]?.v || 0) > 0 ? `Email revenue in Triple Whale, last 14 days: ${Math.round(kl[id].v)}.` : 'No email revenue in Triple Whale in the last 14 days: connect Klaviyo inside the client\'s Triple Whale too.'}` : `Not connected. ${(kl[id]?.v || 0) > 0 ? 'Triple Whale carries the email revenue, but lists, segments, flows and campaigns need the brand\'s own key.' : 'No Klaviyo revenue in Triple Whale either.'}`,
        'Paste the brand\'s private API key.', { steps: STEPS.klaviyo, input: kd?.has ? null : { key: 'klaviyo_key', label: 'Private API key', placeholder: 'pk_...', secret: true } }),
    ];
    const needs = items.filter(i => i.state === 'bad' || i.state === 'warn').length, off = items.filter(i => i.state === 'off').length;
    return { act_id: id, name: a.name, studio_batches: studioN[id]?.n || 0, items, summary: needs ? `${needs} to look at` : off ? `${off} not set up` : 'all connected' };
  });
  return { agency, brands, as_of: new Date().toISOString(),
    how_it_works: 'AGENCY connections are made once (a secret on the worker, or Cole signing in from Locus) and every brand rides on them. PER BRAND connections are made at onboarding: the New client flow makes the Asana project, Drive folder, Slack channels and Frame project; the ad account, the Triple Whale shop and the Shopify install are given by the client. Google Ads and Klaviyo are the client\'s own connections inside Triple Whale.' };
}
