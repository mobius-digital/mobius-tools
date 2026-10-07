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
    A('google_login', 'Google sign-in to Locus', set(env.GOOGLE_CLIENT_ID), { used_by: 'the team signing in', fix: 'Set GOOGLE_CLIENT_ID on the account-health worker.' }),
  ];

  /* ---------------- per brand ---------------- */
  const accounts = (await q(`SELECT act_id, name, active, tz, slack_channel, brief_channel, tw_shop, last_sync_insights, last_error FROM accounts WHERE active = 1 ORDER BY name`))
    .filter(a => !brand || a.act_id === brand || a.name.toLowerCase().includes(String(brand).toLowerCase()));
  if (!accounts.length) return { agency, brands: [], as_of: new Date().toISOString() };
  const ids = accounts.map(a => a.act_id);
  const IN = ids.map((_, i) => `?${i + 1}`).join(',');
  const byAct = rows => Object.fromEntries(rows.map(r => [r.act_id, r]));
  const [metaD, twD, twO, twA, asanaDocs, nc, hubs, onb, shops, ga, kl, studioN, hubN, linkDocs] = await Promise.all([
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
  ]);
  const C = (key, name, state, note, fix = '') => ({ key, name, state, note, fix });
  const brands = accounts.map(a => {
    const id = a.act_id, doc = asanaDocs[id], n = nc[id], hub = hubs[id], ob = onb[id], sh = shops[id];
    const steps = safeJson(n?.steps_json, {}) || {};
    const links = linkDocs[id] || {};
    const frameUrl = steps.frame?.url || steps.frame?.project?.url || links.frame || null;
    const driveUrl = n?.drive_url || links.drive || null;
    const legacy = !n && !ob;   // a brand set up before New client and the onboarding link existed
    const metaAge = daysAgo(metaD[id]?.latest), twAge = daysAgo(twD[id]?.latest), attrAge = daysAgo(twA[id]?.latest);
    const items = [
      C('meta', 'Meta ad account', a.last_error ? 'bad' : metaAge == null ? 'off' : metaAge > 2 ? 'warn' : 'ok',
        a.last_error ? `Sync failing: ${String(a.last_error).slice(0, 120)}` : metaAge == null ? 'No Meta data yet.' : `Data through ${metaD[id].latest} (synced ${String(a.last_sync_insights || '').slice(0, 16) || 'never'}).`,
        a.last_error ? 'Check the token still sees this ad account (Meta Business > System users > assets), then Settings > Jobs and data.' : 'Add the brand in Settings > Brands (the ad account is the brand).'),
      C('tw', 'Triple Whale', !set(a.tw_shop) ? 'off' : twAge == null ? 'bad' : twAge > 2 ? 'warn' : 'ok',
        !set(a.tw_shop) ? 'No shop set.' : twAge == null ? `Shop ${a.tw_shop} set, no data landed.` : `${a.tw_shop}: store data through ${twD[id].latest}${attrAge != null ? `, attribution through ${twA[id].latest}` : ', no attribution rows'}${twO[id] ? `, ${twO[id].n} orders stored` : ''}.`,
        'Settings > Brands > open the brand > Triple Whale shop (the client adds cole@go-mobius-digital.com to their Triple Whale first).'),
      C('shopify', 'Shopify store', sh?.access_token && !sh.uninstalled_at ? 'ok' : sh?.uninstalled_at ? 'bad' : 'off',
        sh?.access_token && !sh.uninstalled_at ? `${sh.shop} installed ${String(sh.installed_at).slice(0, 10)}${sh.last_sync_at ? `, cohorts ${String(sh.last_sync_at).slice(0, 10)}` : ''}.` : sh?.uninstalled_at ? `${sh.shop} removed the app ${String(sh.uninstalled_at).slice(0, 10)}.` : 'Not installed (Triple Whale carries the store numbers; Shopify adds real cohorts, product names and receipts).',
        'Settings > Brands > the brand row > Install the Mobius Digital app (the client approves it as a collaborator). Blocked until Shopify finishes reviewing the app.'),
      C('asana', 'Asana project', doc?.project_gid ? (doc.hook_gid ? 'ok' : 'warn') : 'off',
        doc?.project_gid ? `${doc.project_name || doc.project_gid}, synced ${String(doc.last_sync || '').slice(0, 16) || 'never'}${doc.hook_gid ? '' : ', no webhook (hourly sync only)'}.` : 'Not connected: briefs are not read, nothing is numbered.',
        'Brand tab > Brand info > Connect Asana (picks the project by the brand name).'),
      C('slack_internal', 'Slack internal channel', set(a.slack_channel) ? 'ok' : 'off', set(a.slack_channel) ? `${a.slack_channel}${n?.slack_internal && n.slack_internal !== a.slack_channel ? ` (New client made ${n.slack_internal})` : ''}: drafts, the Strategist, the ideas pipeline.` : 'No team channel: the Strategist and the ideas bot cannot be tagged for this brand.',
        'Settings > Brands > the brand > Team channel (the -internal channel id).'),
      C('slack_client', 'Slack client channel', set(a.brief_channel) ? 'ok' : 'off', set(a.brief_channel) ? `${a.brief_channel}: the Daily Brief and reports go here.` : 'No client channel: briefs and reports are drafted and auto-handled, never sent.',
        'Settings > Brands > the brand > Client channel. Leave empty on purpose for a brand with no client channel.'),
      C('drive', 'Google Drive folder', set(driveUrl) ? 'ok' : 'off', set(driveUrl) ? driveUrl : legacy ? 'This brand was set up before New client existed, so its Drive folder is not recorded here. Paste the link below.' : 'No folder recorded.',
        legacy ? 'Paste the brand\'s Drive folder link here (saved on the brand).' : 'Settings > New client > Drive step makes it.'),
      C('frame', 'Frame.io project', set(frameUrl) ? 'ok' : 'off', set(frameUrl) ? frameUrl : legacy ? 'Set up before New client existed: its Frame project is not recorded here. Paste the link below.' : 'No review project recorded.',
        legacy ? 'Paste the brand\'s Frame project link here (saved on the brand).' : 'Settings > New client > Frame step (Frame must be connected agency-wide).'),
      C('hub', 'Creator link', hub ? (hub.live ? 'ok' : 'warn') : 'off', hub ? `/angles/${hub.slug}, ${hubN[id]?.n || 0} live angle${hubN[id]?.n === 1 ? '' : 's'}${hub.live ? '' : ', link not live'}.` : 'No creator link (Lucky Golf uses its own creator app).', 'Ambassadors tab > set up the brand, switch Live on.'),
      /* Cole, 2026-10-07: long-standing clients are never sent the onboarding form. Their answers come from
         research, Asana and the website pre-fill (Brand tab > Client answers > Pre-fill), so this is "ok". */
      C('onboarding', 'Onboarding answers', ob ? (ob.status === 'submitted' ? 'ok' : 'warn') : legacy ? 'ok' : 'off', ob ? `${ob.status}${ob.submitted_at ? ' ' + String(ob.submitted_at).slice(0, 10) : ''}.` : legacy ? 'Long-standing client: no onboarding form, on purpose. Client answers are filled from research, Asana and the website pre-fill.' : 'No onboarding link sent.',
        legacy ? 'Nothing to do. To fill the call sheet without the client: Brand tab > Client answers > Pre-fill.' : 'Brand tab > Client answers > send the onboarding link.'),
      C('google_ads', 'Google Ads (via Triple Whale)', (ga[id]?.v || 0) > 0 ? 'ok' : 'off', (ga[id]?.v || 0) > 0 ? `Spend in the last 14 days: ${Math.round(ga[id].v)}.` : 'No Google spend in the last 14 days (either not running, or Google Ads is not connected in the client\'s Triple Whale).', 'The client connects Google Ads inside Triple Whale (Integrations). Nothing to set in Locus.'),
      C('klaviyo', 'Klaviyo (via Triple Whale)', (kl[id]?.v || 0) > 0 ? 'ok' : 'off', (kl[id]?.v || 0) > 0 ? `Email revenue in the last 14 days: ${Math.round(kl[id].v)}.` : 'No Klaviyo revenue in the last 14 days (not connected in the client\'s Triple Whale, or no email sales).', 'The client connects Klaviyo inside Triple Whale (Integrations). Nothing to set in Locus.'),
    ];
    const needs = items.filter(i => i.state === 'bad' || i.state === 'warn').length, off = items.filter(i => i.state === 'off').length;
    return { act_id: id, name: a.name, studio_batches: studioN[id]?.n || 0, items, summary: needs ? `${needs} to look at` : off ? `${off} not set up` : 'all connected' };
  });
  return { agency, brands, as_of: new Date().toISOString(),
    how_it_works: 'AGENCY connections are made once (a secret on the worker, or Cole signing in from Locus) and every brand rides on them. PER BRAND connections are made at onboarding: the New client flow makes the Asana project, Drive folder, Slack channels and Frame project; the ad account, the Triple Whale shop and the Shopify install are given by the client. Google Ads and Klaviyo are the client\'s own connections inside Triple Whale.' };
}
