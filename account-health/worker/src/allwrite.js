/**
 * Every connection's hands in one place for strategist.js (2026-10-17): the writes added in the full-control pass and
 * `write_access`, which says per connection what the stored token may change today and how to fix what it may not.
 * The Meta / Asana / Drive / Klaviyo / Frame / calendar actions stay registered where they were (metawrite.js,
 * klaviyowrite.js, stratmake.js, strategist.js); this file adds Slack, Google Ads, TikTok, Shopify and undo_change.
 */
import { slackActions } from './slackwrite.js';
import { googleTools, googleActions } from './googlewrite.js';
import { tiktokTools, tiktokActions, tiktokAccess } from './tiktokwrite.js';
import { shopifyActions, shopifyAccess } from './shopifywrite.js';
import { undoActions, accessTool, slackScopes } from './extwrite.js';
import { metaActions, metaCan, metaActs, gget } from './metawrite.js';
import { adsCustomer, adsQuery, adsMutate, adsError } from './google.js';
import { googleToken } from './asana-brand.js';
import { klaviyoCan } from './klaviyowrite.js';
import { frameStatus } from './frame.js';

const DRIVE_RW = 'https://www.googleapis.com/auth/drive';
const BUSINESS_ID = '695359915477596';

function probes(d) {
  const brandsOf = async (env, brand) => brand ? [brand] : (await d.listAccounts(env, true));
  return {
    slack: env => slackScopes(env, d),
    meta: async (env, brand) => {
      let scopes = null; try { scopes = (await gget(d, env, 'me/permissions')).data?.filter(x => x.status === 'granted').map(x => x.permission) || null; } catch {}
      const accounts = [];
      for (const b of await brandsOf(env, brand)) for (const m of await metaActs(env, b.act_id)) {
        const c = await metaCan(env, m.act, d, m.name).catch(e => ({ can: false, fix: e.message }));
        accounts.push({ brand: b.name, account: m.act, can_write: !!c.can, ...(c.can ? {} : { fix: c.fix }) });
      }
      const want = ['ads_management', 'business_management', 'pages_manage_metadata', 'pages_read_engagement', 'pages_show_list', 'catalog_management'];
      return { token_scopes: scopes, missing_scopes: scopes ? want.filter(s => !scopes.includes(s)) : 'a system-user token does not list them', accounts,
        known_gaps: [`Pages: assigning a client's Facebook page to the team needs pages_manage_metadata on the Mobius Tools token (Business ${BUSINESS_ID}).`, 'Pixels: Meta answers "(#10) Application does not have permission" when Locus assigns a pixel; assigned by hand in Business settings > Data sources > Datasets.'] };
    },
    google: async (env, brand) => {
      const out = [];
      for (const b of await brandsOf(env, brand)) {
        const cid = await adsCustomer(env, b.act_id); if (!cid) { if (brand) out.push({ brand: b.name, linked: false }); continue; }
        try {
          const r = (await adsQuery(env, cid, `SELECT campaign.resource_name, campaign.name FROM campaign WHERE campaign.status != 'REMOVED' LIMIT 1`)).results?.[0];
          if (r) await adsMutate(env, cid, 'campaigns', [{ update: { resourceName: r.campaign.resourceName, name: r.campaign.name }, updateMask: 'name' }], true);
          out.push({ brand: b.name, customer: cid, can_write: true });
        } catch (e) { out.push({ brand: b.name, customer: cid, can_write: false, said: adsError(e) }); }
        if (!brand && out.length >= 4) break;
      }
      return { accounts: out, note: brand ? null : 'First four linked brands checked; pass brand for one.' };
    },
    drive: async env => { try { await googleToken(env, 'cole@go-mobius-digital.com', DRIVE_RW); return { can_write: true }; } catch (e) { return { can_write: false, said: e.message, fix: `Google Admin > Security > API controls > Domain-wide delegation > the Locus service account > add ${DRIVE_RW}.` }; } },
    klaviyo: async (env, brand) => {
      const out = [];
      for (const b of await brandsOf(env, brand)) { const c = await klaviyoCan(env, b.act_id).catch(e => ({ error: e.message })); if (c.error && !brand && /not connected|Attentive/.test(c.error)) continue; out.push({ brand: b.name, ...(c.error ? { error: c.error } : { flows: c.flows, campaigns: c.campaigns, templates: c.templates, fix: c.fix }) }); }
      return { keys: out, note: 'Lists and segments need lists:write / segments:write on the key; a missing one is named on the first refusal.' };
    },
    shopify: (env, brand) => shopifyAccess(env, brand),
    tiktok: env => tiktokAccess(env),
    frame: async env => { const s = await frameStatus(env).catch(e => ({ error: e.message })); return { ...s, rule: 'Locus never deletes or archives anything in Frame (review links die with it).' }; },
    asana: async env => ({ can_write: !!env.ASANA_TOKEN }),
  };
}

export function extraTools(d) { return [...googleTools(d), ...tiktokTools(d), ...accessTool(d, probes(d))]; }
export function extraActions(d) {
  const metaUndo = metaActions(d).find(a => a.name === 'meta_undo');
  return [...slackActions(d), ...googleActions(d), ...tiktokActions(d), ...shopifyActions(d), ...undoActions(d, metaUndo)];
}
/** The actions that always show a card, whoever asks: things a client or a customer receives, or a file shared out. */
export const CARD_ONLY = ['klaviyo_campaign_schedule', 'klaviyo_flow_status', 'drive_share', 'slack_post_client'];
