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
import { getWrites } from './strattools.js';
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
/**
 * meta_create_ad with frame_file or video_url (2026-11-26 review): metawrite.js (protected) uploads the video into the
 * ad account inside propose(), so Meta would fetch a link the model chose before anyone tapped, and keep it after a No
 * thanks. Here the card is described on a copy of the action whose one advideos POST is answered locally (brand, ad
 * set, permission, page and the Frame link are still checked for real; any other POST is refused), and the upload
 * itself moves to the tap: apply runs the real propose (the upload) and then the real apply (the ad).
 */
const LOCAL_ID = 'on_the_tap';
export function holdUploads(d, actions) {
  const real = actions.find(a => a.name === 'meta_create_ad');
  if (!real) return actions;
  const xfetch = (url, init) => {
    if (String(init?.method || 'GET').toUpperCase() === 'GET') return d.xfetch(url, init);
    if (/\/advideos$/.test(String(url).split('?')[0])) return Promise.resolve(new Response(JSON.stringify({ id: LOCAL_ID }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return Promise.reject(new Error('Nothing is written to Meta before the tap.'));
  };
  const dry = metaActions({ ...d, xfetch }).find(a => a.name === 'meta_create_ad');
  const held = {
    ...real,
    propose: async (env, input, h, ctx) => {
      if (!(input?.frame_file || input?.video_url)) return real.propose(env, input, h, ctx);
      const r = await dry.propose(env, input, h, ctx);
      if (!r || r.error) return r;
      const { media, ...rest } = r.patch || {};
      const from = media?.from || 'the file';
      return { ...r,
        detail: String(r.detail || '').replace(/^Video: [^\n]*/, `Video: ${from}. Nothing is uploaded yet: on the tap it goes into the ad account, then the ad is made.`),
        patch: { ...rest, upload_on_tap: true, input: { ...input } } };
    },
    apply: async (env, p, h, ctx) => {
      if (!p?.upload_on_tap) return real.apply(env, p, h, ctx);
      const r = await real.propose(env, p.input || {}, h, ctx);
      if (!r || r.error) return { error: r?.error || 'The video could not be uploaded.' };
      return real.apply(env, { ...r.patch, proposer: p.proposer ?? r.patch.proposer }, h, ctx);
    },
  };
  return actions.map(a => (a === real ? held : a));
}

/**
 * ALWAYS A TAP (2026-11-25, the owner, after a safety trace). THE ONE PLACE FOR THE RULE.
 *
 * The assistant never changes anything by its own decision, whoever asks (the owner included) and wherever they ask
 * (Locus chat, Slack, a scheduled question, a review). There is no list of "direct" actions any more and no setting
 * that brings one back:
 *   1. Every ACTION (Meta, Google, TikTok, Shopify, Klaviyo, Slack posts, settings, billing day, locus_write, Asana,
 *      Drive, Frame, the calendar, undo) is a card. ask/engine.js runAction only ever proposes; the one caller of an
 *      action's apply() is applyProposal, reached by a person's tap (POST /api/ask/apply, the Slack Apply button).
 *   2. The plain TOOLS below are not actions but still post to people, make a public link or spend money on
 *      generation. They are held as a card too: card() says what the card reads, and returning null means "nothing
 *      leaves and nothing is spent here, run it now" (a download button in the app, a report shown to the asker).
 *      done() is the line the person reads after the tap.
 * Reads, lookups, memory notes (remember / forget / save_skill / watch_for) and drafts nobody outside sees stay direct.
 * A new tool that posts, publishes or spends gets a line here, or it must be an action.
 */
const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const kb = s => { const n = String(s ?? '').length; return n > 2000 ? Math.round(n / 1000) + 'KB' : n + ' characters'; };
export const TAP_TOOLS = {
  /* Spends money: about $0.25 to $0.42 an image. A redo needs the first image, which a card never shows the model. */
  make_image: {
    card: i => i.redo_of ? { error: 'Images are made on a tap now, so there is no image in this answer to redo. Send the whole brief again without redo_of.' }
      : { summary: `Make an image: ${cut(i.title || i.brief, 100)}`, detail: `About $0.25 to $0.42 on the image AI. ${i.format || '4:5'}${i.product ? ', ' + cut(i.product, 60) : ''}.\n${cut(i.brief, 700)}` },
    done: r => { const m = (r.flags?.media || [])[0]; return m?.url ? `Image made: ${m.url}` : 'Image made.'; },
  },
  /* Spends money: up to 24 ads at about $0.35 each, and posts them in the thread. */
  studio_make: {
    card: i => { const b = Array.isArray(i.batches) ? i.batches : []; return { summary: `Make the ads of ${b.length || 'the'} Studio batch${b.length === 1 ? '' : 'es'}`, detail: `About $0.35 an ad on the image AI, up to 24 ads.\n${b.slice(0, 8).map(x => `${cut(x.batch_id, 40)}: ${cut(x.product, 60)}`).join('\n')}` }; },
    done: r => cut(String(r.text || 'Making the ads now.').split(' Tell the person')[0], 400),
  },
  /* A link that opens without a login (public), or a new share in the client's Frame project (secure). */
  frame_share: {
    card: i => ({ summary: `Make a ${i.access === 'secure' ? 'secure' : 'public'} Frame review link for ${cut(i.target, 80)}`, detail: i.access === 'secure' ? 'Only people invited in Frame can open it.' : `Anyone with the link can open it without a login${i.downloads ? ', and download the files' : ''}.` }),
    done: r => { const l = (r.flags?.links || [])[0]; return l?.url ? `Review link: ${l.url}` : cut(r.text, 300); },
  },
  /* In Slack the file is posted into the thread for everyone there. In Locus it is a download button for the asker only. */
  post_file: {
    card: (i, ctx) => ctx?.surface === 'slack' && ctx?.channel ? { summary: `Post the file ${cut(i.filename, 80)} in this thread`, detail: `${kb(i.content)}${i.comment ? '. With the line: ' + cut(i.comment, 300) : ''}` } : null,
    done: (r, i) => `The file ${cut(i.filename, 80)} is in the thread.`,
  },
  /* A Slack canvas everyone in the channel can open. */
  make_canvas: {
    card: (i, ctx) => ctx?.surface === 'slack' ? { summary: `Make the Slack canvas "${cut(i.title, 100)}"`, detail: `${kb(i.markdown)}. Everyone in this channel can open it.` } : null,
    done: r => cut(String(r.text || 'Canvas made.').split('. Link it')[0], 400),
  },
  /* Starts the ideas pipeline: it spends on a teardown and posts a draft card in the thread. */
  draft_from_thread: {
    card: (i, ctx) => ctx?.ev?.channel ? { summary: `Start the ideas pipeline on this thread${i.brand ? ' for ' + cut(i.brand, 60) : ''}`, detail: `It opens the references in the thread, does a teardown and posts a draft card here.${i.steer ? '\nSteer: ' + cut(i.steer, 300) : ''}` } : null,
    done: () => 'The ideas pipeline is reading the thread. Its draft card lands here in a minute or two.',
  },
  /* A sandbox run: in Slack its files are uploaded into the thread for everyone there, so it waits for a tap. In Locus
     the files are download buttons for the asker only, so it answers at once. */
  run_analysis: {
    card: (i, ctx) => ctx?.surface === 'slack' && ctx?.channel ? { summary: `Run the analysis and post its files in this thread: ${cut(i.ask, 90)}`, detail: `About $0.10 to $0.40 in the sandbox. ${kb(i.data)} of data${i.files ? `, files: ${cut(i.files, 120)}` : ''}.\n${cut(i.ask, 600)}` } : null,
    done: r => cut(String(r.text || 'The analysis ran.').replace(/^[\s\S]*?The sandbox says:\s*/, '').split('\nAnswer from this')[0], 1500),
  },
  /* A read door that a few GET routes write through (strattools.js getWrites: Asana passes, ?post=1, tidy runs).
     Those wait for a tap; every other path reads at once. A client's own login cannot tap, so it is refused there. */
  locus_get: {
    card: (i, ctx) => {
      const w = getWrites(i.path);
      if (!w) return null;
      if (ctx?.client) return { error: 'That route changes something, so it is not open from this login.' };
      return { summary: `Run ${cut(String(i.path).split('?')[0], 100)} in Locus`, detail: `GET ${cut(i.path, 400)}\nIt is not a plain read: ${w}.` };
    },
    done: r => cut(String(r.text || 'Done in Locus.'), 300),
  },
  /* The report itself is shown to the asker at once. Its public link and PDF (open without a login) wait for the tap.
     A client's own login cannot tap Apply, so a client gets the report on screen and no link. */
  make_report: {
    card: (i, ctx) => ctx?.client ? null : { summary: `Make a share link and PDF for "${cut(i.title, 100)}"`, detail: 'Anyone with the link can open the report without a login.' },
    done: r => r.report?.share ? `Share link: ${r.report.share}${r.report.pdf ? `\nPDF: ${r.report.pdf}` : ''}` : 'Share link made.',
  },
};
