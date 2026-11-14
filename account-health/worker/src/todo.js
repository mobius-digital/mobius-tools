/**
 * YOU NEED TO DO (2026-11-13, Cole before Synergy Labs): every onboarding step that is on MOBIUS, per brand, worked
 * out live from what Locus already records, so an item disappears the moment it is done. Nothing is stored here.
 *
 *   GET  /api/ask/todo?act=<brand|all>    staff: { brands: [{ id, name, items: [{ key, text, why, kind, url?, run?, act?, field? }] }] }
 *   POST /api/ask/todo/shopify-sent {run}  staff: the "I sent the request" button (same as the Slack one, newclient.js)
 *
 * kind: 'setup' opens the New client setup screen (run id), 'link' opens url, 'shopify' has Open Partners + I sent it,
 * 'key' is a paste box (field = /api/brand-links key), 'slack' opens the client channel.
 * Client-side steps (paying, signing, sharing access) are NOT here: they are on the client's onboarding and connect pages.
 */
import { connectList } from './connect.js';

const safe = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const emailOk = e => /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(String(e || ''));
const YOURS = {
  email: { field: 'klaviyo_key', label: 'Klaviyo private key', url: 'https://www.klaviyo.com/settings/account/api-keys',
    how: 'Klaviyo > switch to the brand > Settings > API keys > Create Private API Key (Full Access), then paste it here.' },
  clarity: { field: 'clarity_token', label: 'Clarity API token', url: 'https://clarity.microsoft.com/projects',
    how: "The brand's Clarity project > Settings > Data Export > Generate new API token, then paste it here." },
};
/* Brands that are never chased (paused, demo, Cole's own test account). Same list as connect.js connectOverview. */
const SKIP = /golf sock|harborline|galway|instyler|gum of gods|judyp|le pickle|popby/i;

async function runItems(env, r) {
  const st = safe(r.steps_json, {});
  const ans = r.token ? safe((await env.DB.prepare(`SELECT answers_json FROM p_br_onboard WHERE token = ?1`).bind(r.token).first().catch(() => null))?.answers_json, {}) : {};
  const out = [];
  /* `skip_<key>` = Cole pressed Not needed (e.g. a second brand covered by the first brand's agreement). */
  const setup = (key, text, why) => { if (!st[`skip_${key}`]) out.push({ key, text, why, kind: 'setup', run: r.id, skippable: true }); };
  if (st.email?.status !== 'done' && emailOk(r.contact_email)) setup('email', `Send ${r.name} the welcome email`, 'It carries their onboarding link; their Asana and Drive invites go out right after it.');
  if (r.retainer > 0 && st.stripe?.status !== 'done') setup('stripe', `Send ${r.name} the first invoice`, 'Work starts when it is paid; the card is then saved for autopay.');
  if (st.stripe?.paid && !st.stripe?.autopay) setup('autopay', `Switch on autopay for ${r.name}`, 'They paid, but the subscription did not move to automatic charging. Press Check if paid.');
  if (st.contract?.status !== 'done') setup('contract', `Send ${r.name} the agreement`, 'They sign it inside their onboarding link.');
  /* Slack: Slack refuses the API invite (not_allowed_token_type), so the client is invited from the channel by hand.
     Done once a person from outside our workspace is in (the welcome posts then). */
  if (r.slack_client && !st.slack?.client_invited && !st.slack_welcome && !st.skip_slack && emailOk(r.contact_email))
    out.push({ key: 'slack', kind: 'slack', run: r.id, skippable: true, url: `https://slack.com/app_redirect?channel=${r.slack_client}`, text: `Invite ${r.contact_email} to ${r.name}'s Slack channel`, why: 'Channel > Add people > their email. Slack does not let Locus send this invite.' });
  /* Shopify: no API for a collaborator request, so Cole sends it from the Partner dashboard. Shown once the client gave the store. */
  const m = /([a-z0-9][a-z0-9-]*)\.myshopify\.com/i.exec(String(ans.shopify_url || ''));
  const store = st.shopify_ping?.store || (m ? `${m[1].toLowerCase()}.myshopify.com` : null);
  const code = String(ans.shopify_code || '').trim();
  if (store && !st.shopify_ping?.sent)
    out.push({ key: 'shopify', kind: 'shopify', run: r.id, url: 'https://partners.shopify.com/organizations', text: `Send the Shopify collaborator request for ${store}`, why: `Partners > Stores > Add store > Request access, paste ${store}${code && code !== '__unsure' ? ` and the code ${code}` : ''}. Then press I sent it: Locus asks them to approve.` });
  return out;
}

async function brandItems(env, brandId) {
  const out = [];
  const l = await connectList(env, brandId).catch(() => ({ items: [] }));
  for (const it of l.items || []) {
    if (YOURS[it.key] && (it.state === 'todo' || it.state === 'waiting') && it.invited)
      out.push({ key: `key:${it.key}`, kind: 'key', act: brandId, field: YOURS[it.key].field, url: YOURS[it.key].url, text: `Paste the ${YOURS[it.key].label}`, why: `They invited you. ${YOURS[it.key].how}` });
    /* Triple Whale: the client's invite lands in Cole's email; until he accepts it Locus cannot read the shop. */
    if (it.key === 'tw' && it.state === 'waiting')
      out.push({ key: 'tw', kind: 'link', url: 'https://app.triplewhale.com', text: 'Accept their Triple Whale invite', why: 'They invited you; the invite is in your email. Every sales number in Locus runs on it.' });
  }
  /* Google Ads: Locus could not send the manager request itself. */
  const pend = safe((await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(`connectPending:${brandId}`).first().catch(() => null))?.value, {});
  if (pend.google_ads?.error) out.push({ key: 'gads', kind: 'link', url: 'https://ads.google.com/aw/accountaccess/managers', text: `Send the Google Ads manager request to ${pend.google_ads.id}`, why: `Locus could not send it: ${pend.google_ads.error}` });
  return out;
}

export async function todoList(env, act) {
  const one = act && act !== 'all' ? act : null;
  const brands = ((await env.DB.prepare(one ? `SELECT id, name FROM brands WHERE id = ?1` : `SELECT id, name FROM brands WHERE status = 'active' ORDER BY name`).bind(...(one ? [one] : [])).all().catch(() => ({ results: [] }))).results || [])
    .filter(b => one || !SKIP.test(b.name));
  const runs = ((await env.DB.prepare(`SELECT * FROM p_newclient WHERE created_at >= datetime('now', '-120 days')`).all().catch(() => ({ results: [] }))).results || []);
  const out = [];
  for (const b of brands) {
    const items = [];
    for (const r of runs.filter(r => r.act_id === b.id)) items.push(...await runItems(env, r));
    items.push(...await brandItems(env, b.id));
    if (items.length || one) out.push({ id: b.id, name: b.name, items });
  }
  return { brands: out };
}

export async function todoSkip(env, run, key) {
  if (!['email', 'stripe', 'contract', 'slack'].includes(key)) throw Object.assign(new Error('That step cannot be skipped.'), { status: 400 });
  const r = await env.DB.prepare(`UPDATE p_newclient SET steps_json = json_set(steps_json, ?2, 1) WHERE id = ?1`).bind(String(run || ''), `$.skip_${key}`).run();
  if (!r.meta?.changes) throw Object.assign(new Error('That client is no longer in Locus.'), { status: 404 });
  /* The client's own form box for that step would never tick otherwise (a second brand on one agreement or invoice). */
  const box = { stripe: 'st_invoice', contract: 'st_agreement' }[key];
  if (box) await env.DB.prepare(`UPDATE p_br_onboard SET answers_json = json_set(COALESCE(answers_json, '{}'), ?2, json('true')) WHERE token = (SELECT token FROM p_newclient WHERE id = ?1)`).bind(String(run), `$.${box}`).run().catch(() => {});
  return { ok: true };
}
