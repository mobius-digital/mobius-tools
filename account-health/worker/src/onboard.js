/**
 * CLIENT ONBOARDING (2026-11-26). The contract is the onboarding spec (side-session notes, onboarding-spec.md); Cole's
 * eleven decisions of Nov 26 are law. In one paragraph: the owner fills one New client screen and presses Send once.
 * This file makes the brand (newclient.js insertRun), the Get started link (p_br_onboard, no Asana), the checklist row
 * (p_onboard), the client login and its invite link (clients.js, opening new Locus at /profit/v5/), and sends the
 * ticked parts in order: the welcome email (Cole's Gmail), the agreement (Cole's Gmail, the old signing page), the first
 * invoice (Stripe, one off), then the Mobius extras (two Slack channels, the Slack Connect invite AFTER the welcome,
 * Frame, Ledger). The client makes a login (Google or an emailed 6 digit code, clients.js), fills a short profile, then
 * does four steps in any order (sign and pay, connect, ten questions, a link to their photos and videos), each with
 * "Someone else does this". Until every step is done the screens hold them on Get started (the gate rides on /api/me,
 * onboardGate below). The team sees one line per client, one page per client, and My day / bell lines (onboardLines,
 * read by mywork.js) with a Remind them button. The hourly tick (onboardTick) emails the client on day 3 and day 7
 * about connect, brief and assets, never about money or signing.
 *
 * Table p_onboard (made on first use, ensureOnboard). Its JSON columns are written ONE KEY AT A TIME (setOnb, json_set,
 * the newclient.js setStep pattern): the screens, the hourly tick and the webhooks all write them. A done_at is never
 * cleared: the gate only moves forward.
 *
 * Other agencies (settings onboardExtras = 'off') get only: a brand, connect (both layers) and invites. No agreement,
 * payment, brief, Slack, Frame or Ledger. Absent or anything else = on (this database is the Mobius account).
 *
 * Shopify: no Shopify API (the Partner API included) can send a collaborator request. A person on the team sends it from
 * the Partner dashboard; Locus puts it on My day with the store address and the code, and the page says so plainly.
 */
import { sendMail as sendMailAs, testRecipient } from './mail.js';
/* Onboarding mail comes from the onboarding_email sender (Agency settings > Sending): Cole by default. */
const sendMail = (env, to, subject, text) => sendMailAs(env, to, subject, text, { kind: 'onboarding_email' });
import { integrationsReport } from './integrations.js';
import { connectToken, connectPost } from './connect.js';
import { storeKey as klaviyoStore } from './klaviyo.js';
import { setTripleWhale, connSet } from './brands.js';
import { MOBIUS_BM } from './metaaccess.js';
import { upsertClient, ensureInvite, putClientUser, LINK_PLACEHOLDER } from './clients.js';
import { brandsFor, onbSteps, onbHeld, forgetHeld } from './brandguard.js';
import { roster, insertRun, runStep, getRun, setStep, ensureTable as ensureNewClient, sendReminder, releaseHeld } from './newclient.js';
import { contractDefaults, contractHtml, resendSigningLink, ensureContractTable } from './contract.js';
import { prefillNow } from './research.js';

/* Module constants only (clients.js imports this file, so nothing imported is read at load time). */
const OWNER = 'cole@go-mobius-digital.com';
const DOMAIN = 'go-mobius-digital.com';
const LOCUS_V5 = 'https://locus.go-mobius-digital.com/profit/v5/';
const SIGN_PAGE = 'https://tools.go-mobius-digital.com/onboard/sign.html?t=';
const MCC_DEFAULT = '5566468199';
const DAY = 864e5;
export const STEP_KEYS = ['sign_pay', 'connect', 'brief', 'assets'];
const HANDABLE = ['connect', 'brief', 'assets'];

const lower = s => String(s || '').trim().toLowerCase();
const emailOk = e => /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(String(e || ''));
const firstName = s => String(s || '').trim().split(/\s+/)[0] || 'there';
const safe = (s, fb) => { if (s == null || s === '') return fb; if (typeof s !== 'string') return s; try { const v = JSON.parse(s); return v == null ? fb : v; } catch { return fb; } };
const nowIso = () => new Date().toISOString();
const noDash = s => String(s ?? '').replace(/\s*[\u2014\u2013]\s*/g, ', ');
const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const daysSince = iso => iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY)) : 0;
const maskEmail = e => { const [u, d] = String(e).split('@'); return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}`; };
const v5Slug = s => String(s || '').replace(/_/g, '-');
const startLink = slug => `${LOCUS_V5}#/brand/${v5Slug(slug)}/get-started/index`;
const err = (status, m) => Object.assign(new Error(m), { status });
const fmtGads = id => { const d = String(id || '').replace(/\D/g, ''); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d; };
const andList = a => a.length <= 1 ? (a[0] || '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;

async function getS(env, key, dflt = null) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
  if (!row || row.value == null) return dflt;
  return safe(row.value, row.value);
}
async function putS(env, key, v) {
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify(v)).run();
}
const dropS = (env, key) => env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(key).run().catch(() => {});
const settingStr = async (env, key) => { const v = await getS(env, key, ''); return typeof v === 'string' ? v.trim() : ''; };

/* ------------------------------------------------------------------------------------------ */
/*  THE TABLE                                                                                  */
/* ------------------------------------------------------------------------------------------ */
let made = false;
export async function ensureOnboard(env) {
  if (made) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_onboard (
    act_id TEXT PRIMARY KEY, run_id TEXT, token TEXT,
    extras INTEGER NOT NULL DEFAULT 1, sign_pay INTEGER NOT NULL DEFAULT 1, uses_agreement INTEGER NOT NULL DEFAULT 1, uses_invoice INTEGER NOT NULL DEFAULT 1,
    services_json TEXT NOT NULL DEFAULT '[]', goal_measure TEXT NOT NULL DEFAULT 'cpa', ad_budget REAL, budget_open INTEGER NOT NULL DEFAULT 0,
    gate INTEGER NOT NULL DEFAULT 1, steps_json TEXT NOT NULL DEFAULT '{}', connect_json TEXT NOT NULL DEFAULT '{}', reminders_json TEXT NOT NULL DEFAULT '{}',
    sent_at TEXT, finished_at TEXT, finished_by TEXT,
    created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  made = true;
}
/** For tests. */
export function _resetOnboard() { made = false; }

/** Writes one key of a JSON column (path = 'a.b.c' or ['a','b','c']), making the parents on the way. undefined removes it. */
export async function setOnb(env, act, col, path, val) {
  if (!['steps_json', 'connect_json', 'reminders_json'].includes(col)) throw new Error('bad column');
  const segs = Array.isArray(path) ? path.map(String) : String(path).split('.');
  if (!segs.length || segs.some(x => !/^[A-Za-z0-9_]{1,40}$/.test(x))) throw new Error('bad path');
  const full = '$.' + segs.join('.');
  let expr = col;
  for (let i = 1; i < segs.length; i++) {
    const p = '$.' + segs.slice(0, i).join('.');
    expr = `json_set(${expr}, '${p}', json(COALESCE(json_extract(${col}, '${p}'), '{}')))`;
  }
  if (val === undefined) await env.DB.prepare(`UPDATE p_onboard SET ${col} = json_remove(${expr}, '${full}'), updated_at = datetime('now') WHERE act_id = ?1`).bind(act).run();
  else await env.DB.prepare(`UPDATE p_onboard SET ${col} = json_set(${expr}, '${full}', json(?2)), updated_at = datetime('now') WHERE act_id = ?1`).bind(act, JSON.stringify(val)).run();
}

async function onbRow(env, act) {
  await ensureOnboard(env);
  const r = await env.DB.prepare(`SELECT * FROM p_onboard WHERE act_id = ?1`).bind(act).first();
  if (!r) return null;
  return { ...r, steps: safe(r.steps_json, {}), conn: safe(r.connect_json, {}), rem: safe(r.reminders_json, {}), services: safe(r.services_json, []) };
}

/* ------------------------------------------------------------------------------------------ */
/*  THE BRIEF: ten questions (exact wording, spec 1.3)                                         */
/* ------------------------------------------------------------------------------------------ */
const GOAL_Q = {
  cpa: 'What cost per sale would you be happy with?',
  cpnc: 'What cost per new customer would you be happy with?',
  roas: 'What return on ad spend would you be happy with?',
  cpl: 'What cost per lead would you be happy with?',
};
export const QUESTIONS = [
  { n: 1, key: 'solves', when: 'always', text: 'What does your product solve, and why do people buy it?', hint: 'In your words, the way you would tell a friend.' },
  { n: 2, key: 'uvp', when: 'always', text: 'What makes you different from the other options a customer has?', hint: 'What would a customer miss if you were gone?' },
  { n: 3, key: 'dos_donts', when: 'always', text: 'What must we never say, and what must we always say? Include any claims you legally cannot make.', hint: 'Words, claims, competitors, topics. Short lists are fine.' },
  { n: 4, key: 'push_products', when: 'ads', text: 'Which products should we push, and which should we leave alone?', hint: 'Best sellers, margins, stock running low.' },
  { n: 5, key: 'offers', when: 'ads', text: 'Which offers are we allowed to run, and how deep can a discount go?', hint: 'Codes, bundles, free shipping, the most you can give away.' },
  { n: 6, key: 'goal_answer', when: 'ads', text: null, hint: 'A rough number is fine. We confirm it with you on the call.' },
  { n: 7, key: 'success_90', when: 'always', text: 'What would make the next 90 days a success for you?', hint: 'Sales, new customers, a launch, anything.' },
  { n: 8, key: 'tried_failed', when: 'ads', text: 'What have you tried in ads that did not work?', hint: 'Agencies, offers, angles, platforms.' },
  { n: 9, key: 'ugc_ok', when: 'always', text: 'Can we use customer photos, reviews and creator videos in ads? Any limits?', hint: 'Yes, no, or yes with rules.' },
  { n: 10, key: 'approver', when: 'approves', text: 'Who says yes to an ad on your side, and how fast?', hint: 'A name and a rough time, like "Pat, within a day".' },
];
const BRIEF_KEYS = new Set(QUESTIONS.map(q => q.key));
const ADS = ['meta_ads', 'google_ads', 'tiktok_ads'];
function shownQuestions(services, measure, approves) {
  const ads = (services || []).some(s => ADS.includes(s));
  return QUESTIONS.filter(q => q.when === 'always' || (q.when === 'ads' && ads) || (q.when === 'approves' && approves))
    .map(q => ({ ...q, text: q.key === 'goal_answer' ? (GOAL_Q[measure] || GOAL_Q.cpa) : q.text }));
}
function briefState(shown, answers, prefill) {
  const ans = answers || {}, pre = prefill || {};
  const drafts = { solves: [pre.solves, pre.why_you].filter(Boolean).join(' '), uvp: pre.uvp, offers: Array.isArray(pre.offers) ? pre.offers.join('; ') : pre.offers };
  const has = k => typeof ans[k] === 'string' && ans[k].trim() !== '';
  const answered = shown.filter(q => has(q.key)).length;
  return {
    done: answered === shown.length && shown.length > 0, answered, total: shown.length,
    questions: shown.map(q => ({ n: q.n, key: q.key, text: q.text, hint: q.hint, draft: !has(q.key) && drafts[q.key] ? String(drafts[q.key]).slice(0, 1500) : '' })),
    answers: Object.fromEntries(shown.filter(q => has(q.key) && ans[q.key] !== '__unsure').map(q => [q.key, ans[q.key]])),
    unsure: shown.filter(q => ans[q.key] === '__unsure').map(q => q.key),
  };
}

/* ------------------------------------------------------------------------------------------ */
/*  CONNECT: every platform, two layers (spec 1.4)                                             */
/* ------------------------------------------------------------------------------------------ */
/** Our own ids and address: settings agencyAccess, each falling back to what the code already holds. */
export async function agencyAccess(env) {
  const a = (await getS(env, 'agencyAccess', {})) || {};
  const mccRaw = String(a.google_mcc || env.GOOGLE_ADS_MCC || MCC_DEFAULT).replace(/\D/g, '');
  const lv = a.levels || {};
  return {
    business_id: String(a.business_id || MOBIUS_BM),
    google_mcc: mccRaw.length === 10 ? `${mccRaw.slice(0, 3)}-${mccRaw.slice(3, 6)}-${mccRaw.slice(6)}` : mccRaw,
    team_email: lower(a.team_email || env.OWNER_EMAIL || OWNER),
    tiktok_bc: String(a.tiktok_bc || ''),
    levels: { ga4: lv.ga4 || 'Administrator', gsc: lv.gsc || 'Full', clarity: lv.clarity || 'Admin', email: lv.email || 'Admin', tw: lv.tw || 'Admin' },
  };
}

export const PLATFORMS = [
  { key: 'shopify', title: 'Shopify', short: 'Shopify', why: 'Your orders, products and customers.', need: () => true },
  { key: 'meta', title: 'Meta (Facebook and Instagram)', short: 'Meta', why: 'Your ad results, every ad and the audiences.', need: s => s.includes('meta_ads') },
  { key: 'google_ads', title: 'Google Ads', short: 'Google Ads', why: 'Your Google campaigns and search terms next to everything else.', need: s => s.includes('google_ads') },
  { key: 'ga4', title: 'Google Analytics', short: 'Google Analytics', why: 'How people move through your website.', need: () => true },
  { key: 'gsc', title: 'Google Search Console', short: 'Search Console', why: 'What people search on Google before they find you.', need: () => true },
  { key: 'clarity', title: 'Microsoft Clarity', short: 'Clarity', why: 'Where shoppers get stuck on your site. Free.', need: () => true },
  { key: 'email', title: 'Klaviyo (or your email tool)', short: 'your email tool', why: 'Your email and SMS results, flows and lists.', need: s => s.includes('email') },
  { key: 'tiktok', title: 'TikTok (if you use it)', short: 'TikTok', why: 'Your TikTok ad results.', need: s => s.includes('tiktok_ads') },
  { key: 'tw', title: 'Triple Whale', short: 'Triple Whale', why: 'Your sales and which ads really sold, in one place.', need: () => true, extras: true },
];
const PKEYS = PLATFORMS.map(p => p.key);
/* Keys connect.js (the old connect link) also knows, so "we don't use this" and "I did this" agree with it. */
const CONNECT_KEYS = { meta: 'meta', ga4: 'ga4', gsc: 'gsc', google_ads: 'google_ads', clarity: 'clarity', email: 'email', tw: 'tw' };
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const shopOf = v => lower(v).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const SHOPIFY_HONEST = 'Shopify does not let anyone send this request automatically, so a person on our team sends it by hand, usually the same day.';
const KEY_STEPS = {
  clarity: "Open the brand's Clarity project (none yet? install the free Microsoft Clarity app in their Shopify admin first) > Settings > Data Export > Generate new API token. Paste it in Locus > Brand settings > Integrations.",
  email: 'Open Klaviyo and switch to the brand (account menu, bottom left) > Settings > API keys > Create Private API Key > name it Mobius > Full Access > Create. Paste it in Locus > Brand settings > Integrations.',
};

/** The two layers of one platform, from what a person said or ticked (cj), the live checks and our ids. */
function layersFor(p, cj, live, ag, installUrl) {
  const it = live.items[p.key] || {};
  const ok = it.state === 'ok';
  const team = cj.team || {}, app = cj.app || {};
  const inputs = team.inputs || {};
  const other = p.key === 'email' && !!cj.tool;
  const T = { label: 'Give us access', clicks: [], copy: [], url: null, inputs: [], note: '', checks_itself: false };
  const A = { label: 'Locus reads it', clicks: [], note: 'Nothing to do. This ticks itself.', checks_itself: true };
  let teamCheck = false;
  switch (p.key) {
    case 'shopify':
      T.clicks = ['In Shopify admin open Settings > Domains and copy your store address that ends in .myshopify.com.',
        'Open Settings > Users > Security. Under Collaborators, copy the Collaborator request code (if your store has one).',
        'Paste both below and press Save.',
        'We send the request from our Shopify Partner account; Shopify emails you, you press Approve (Settings > Users > Collaborators).'];
      T.url = 'https://admin.shopify.com/settings/users';
      T.inputs = [{ key: 'shop_url', label: 'Your store address', placeholder: 'yourstore.myshopify.com', secret: false }, { key: 'code', label: 'Collaborator request code (if your store has one)', placeholder: '', secret: false }];
      T.note = SHOPIFY_HONEST;
      A.label = 'Install the Locus app';
      /* No install link yet (the app is still in Shopify's review): nothing for the client to press, so the layer waits
         on us and never holds the gate. With a link it is the client's to do. */
      A.clicks = installUrl ? ['Press Install. Shopify opens your admin and asks you to approve the app.', 'Approve it. This box ticks itself.'] : [];
      A.url = installUrl || null;
      A.note = installUrl ? 'This box ticks itself once the app is installed.' : 'Nothing to do yet. We send you the install link once the Locus app is on the Shopify App Store.';
      break;
    case 'meta':
      T.clicks = ['Open business.facebook.com/settings and pick your business.', 'Users > Partners > Add > "Give a partner access to your assets".',
        'Paste our Business ID and press Next.', 'Tick every asset and give each Full control: ad accounts, Pages, pixels and datasets, the Instagram account and catalogs. Save.'];
      T.copy = [['Our Meta Business ID', ag.business_id]]; T.url = 'https://business.facebook.com/settings/partners';
      T.note = 'Locus does not check the Instagram account yet. Your team looks at it before the first ad.';
      T.checks_itself = true; teamCheck = !!live.conns.meta; A.label = 'Locus reads your ads';
      break;
    case 'google_ads':
      T.clicks = ['Type your Google Ads customer ID below (10 digits, top right in Google Ads). We send the request.',
        'In Google Ads open Admin > Access and security > Managers and press Accept on the Mobius Digital request.'];
      T.copy = [['Our manager ID', ag.google_mcc]]; T.url = 'https://ads.google.com/aw/accountaccess/managers';
      T.inputs = [{ key: 'customer_id', label: 'Google Ads customer ID', placeholder: '123-456-7890', secret: false }];
      T.checks_itself = true; teamCheck = !!live.conns.google_ads;
      break;
    case 'ga4':
      T.clicks = ['Open analytics.google.com and pick your website.', 'Admin (the gear, bottom left) > Property access management.', `Press +, Add users, add our email, choose ${ag.levels.ga4}, press Add.`];
      T.copy = [['Our email', ag.team_email]]; T.url = 'https://analytics.google.com/analytics/web/';
      T.checks_itself = true; teamCheck = !!live.conns.ga4;
      break;
    case 'gsc':
      T.clicks = ['Open search.google.com/search-console and pick your website.', 'Settings > Users and permissions > Add user.', `Add our email with ${ag.levels.gsc} permission.`];
      T.copy = [['Our email', ag.team_email]]; T.url = 'https://search.google.com/search-console/users';
      T.checks_itself = true; teamCheck = !!live.conns.gsc;
      break;
    case 'clarity':
      T.clicks = ['Open clarity.microsoft.com and your project. No Clarity yet? Install the free Microsoft Clarity app from the Shopify App Store first.', 'Settings > Team > Add team member.', `Add our email as ${ag.levels.clarity}.`];
      T.copy = [['Our email', ag.team_email]]; T.url = 'https://clarity.microsoft.com/projects';
      A.note = 'Nothing to do. Our team makes the key, then this ticks itself.';
      break;
    case 'email':
      if (other) {
        T.clicks = [`In ${cj.tool}, add our email as a user with admin access.`];
        T.copy = [['Our email', ag.team_email]];
      } else {
        T.clicks = ['Either: in Klaviyo click your name (bottom left) > Settings > Users > Add new user.', `Add our email as ${ag.levels.email}.`,
          'Or paste a key: Settings > API keys > Create Private API Key > name it Locus > Full Access > Create, paste it below.'];
        T.copy = [['Our email', ag.team_email]]; T.url = 'https://www.klaviyo.com/settings/account/users';
        T.inputs = [{ key: 'key', label: 'Klaviyo private key (optional)', placeholder: 'pk_...', secret: true }, { key: 'tool', label: 'Not Klaviyo? The name of your email tool', placeholder: 'Attentive, Omnisend...', secret: false }];
        T.checks_itself = ok; teamCheck = ok;
      }
      break;
    case 'tiktok':
      T.clicks = ag.tiktok_bc ? ['Open business.tiktok.com and your Business Center.', 'Partners > Add partner > paste our Business Center ID.', 'Share your ad account with Admin access.']
        : ['Ask us for our Business Center ID, then: Partners > Add partner in your Business Center, and share your ad account with Admin access.'];
      T.copy = ag.tiktok_bc ? [['Our Business Center ID', ag.tiktok_bc]] : []; T.url = 'https://business.tiktok.com/';
      break;
    case 'tw':
      T.clicks = ['Open Triple Whale > Settings > Users and press Invite.', `Add our email as ${ag.levels.tw}.`, 'Type your store address below.'];
      T.copy = [['Our email', ag.team_email]]; T.url = 'https://app.triplewhale.com';
      T.inputs = [{ key: 'shop_url', label: 'Your store address', placeholder: 'yourstore.myshopify.com', secret: false }];
      T.checks_itself = true; teamCheck = ok;
      break;
  }
  /* What they already saved shows in the boxes again (never a secret). */
  T.inputs = T.inputs.map(i => ({ ...i, value: i.secret ? '' : i.key === 'tool' ? String(cj.tool || '') : String(inputs[i.key] || '') }));
  const hasInputs = p.key === 'shopify' ? !!inputs.shop_url : p.key === 'google_ads' ? !!inputs.customer_id : p.key === 'tw' ? !!inputs.shop_url : p.key === 'email' ? !!(inputs.key_at || other) : false;
  T.state = (T.checks_itself && teamCheck) || team.ticked_at ? 'done' : team.said_at || hasInputs ? 'waiting' : 'todo';
  if (T.state === 'waiting' && p.key === 'tw' && inputs.shop_url) T.note = 'Got it. Your team checks the store and ticks this.';
  if (T.state === 'waiting' && p.key === 'google_ads' && inputs.customer_id) T.note = inputs.confirm ? 'Got it. Your team checks this one and ticks it.' : 'Request sent. Accept it in Google Ads (Admin > Access and security > Managers).';
  if (p.key === 'shopify') A.state = ok || app.ticked_at ? 'done' : installUrl ? 'todo' : 'waiting';
  else if (other) { A.state = 'na'; A.note = 'Nothing to do here. Your email numbers reach Locus through Triple Whale.'; A.checks_itself = false; }
  else A.state = ok || app.ticked_at ? 'done' : 'waiting';
  return { team: T, app: A };
}

/** The live checks for one brand: integrations states (45 seconds in settings onbConnect:<act>) and its connections. */
async function liveFor(env, act, { all = null } = {}) {
  let items = all ? all[act] : null;
  if (!items) {
    const ck = `onbConnect:${act}`;
    const hit = await getS(env, ck, null);
    if (hit && Date.now() - hit.at < 45e3) items = hit.items;
    else {
      const rep = await integrationsReport(env, { brand: act }).catch(() => null);
      const b = (rep?.brands || []).find(x => x.act_id === act);
      items = Object.fromEntries((b?.items || []).map(i => [i.key, { state: i.state, tool: i.tool || null }]));
      await putS(env, ck, { at: Date.now(), items }).catch(() => {});
    }
  }
  const rows = (await env.DB.prepare(`SELECT kind FROM connections WHERE brand_id = ?1`).bind(act).all().catch(() => ({ results: [] }))).results || [];
  const conns = {}; for (const r of rows) conns[r.kind] = true;
  return { items: items || {}, conns };
}
/** Every brand at once for the team lines (5 minutes in settings onbConnectAll). */
async function liveAll(env) {
  const hit = await getS(env, 'onbConnectAll', null);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.brands;
  const rep = await integrationsReport(env).catch(() => null);
  const brands = {};
  for (const b of rep?.brands || []) brands[b.act_id] = Object.fromEntries((b.items || []).map(i => [i.key, { state: i.state, tool: i.tool || null }]));
  await putS(env, 'onbConnectAll', { at: Date.now(), brands }).catch(() => {});
  return brands;
}

function connectState(row, live, ag, installUrl) {
  const svc = row.services || [];
  const platforms = PLATFORMS.filter(p => !p.extras || row.extras).map(p => {
    const cj = row.conn[p.key] || {};
    const layers = layersFor(p, cj, live, ag, installUrl);
    const skipped = !!cj.skip;
    const done = !skipped && ['done', 'na'].includes(layers.team.state) && ['done', 'na'].includes(layers.app.state);
    return { key: p.key, title: p.title, short: p.short, why: p.why, needed: !!p.need(svc), skipped, done, layers };
  });
  const counted = platforms.filter(p => !p.skipped);
  return {
    done: counted.filter(p => p.done).length, total: counted.length,
    waiting: counted.filter(p => !p.done && p.layers.team.state !== 'todo' && p.layers.app.state !== 'todo').length,
    gateDone: counted.every(p => p.layers.team.state !== 'todo' && p.layers.app.state !== 'todo'),
    todoNames: counted.filter(p => p.layers.team.state === 'todo' || p.layers.app.state === 'todo').map(p => p.short),
    note: 'Green ticks marked Checks itself turn on when Locus can really see the account. The others are ticked by our team once we have looked.',
    platforms,
  };
}

/* ------------------------------------------------------------------------------------------ */
/*  THE ASSETS LINK (spec 1.5): Locus never reads, copies or stores the files                  */
/* ------------------------------------------------------------------------------------------ */
const kindOf = url => { const h = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } })();
  return /(^|\.)drive\.google\.com$/.test(h) ? 'drive' : /dropbox\.com$/.test(h) ? 'dropbox' : /(^|\.)air\.inc$/.test(h) ? 'air' : /(frame\.io|(^|\.)f\.io)$/.test(h) ? 'frame' : /(^|\.)box\.com$/.test(h) ? 'box' : 'link'; };
/* Checked on the way OUT too: the stored row could have been written by another route, and the url becomes an href on
   the team's screens. Only a plain https link of 500 characters or less is ever handed back. */
const LINK_OK = u => typeof u === 'string' && u.length <= 500 && /^https:\/\/[^\s<>"']+$/.test(u);
export async function assetsLink(env, act) {
  const row = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'assets_link'`).bind(act).first().catch(() => null);
  const d = safe(row?.data_json, null);
  if (d && LINK_OK(d.url)) return { url: d.url, label: d.label || '', kind: d.kind || kindOf(d.url), at: d.at || null, by: d.by || null, from: 'link' };
  /* An older brand still gets an Assets button: the Drive link Locus already knows. */
  const prof = safe((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'profile'`).bind(act).first().catch(() => null))?.data_json, {}) || {};
  const nc = await env.DB.prepare(`SELECT drive_url FROM p_newclient WHERE act_id = ?1 AND drive_url IS NOT NULL ORDER BY created_at DESC LIMIT 1`).bind(act).first().catch(() => null);
  const conn = await env.DB.prepare(`SELECT external_id FROM connections WHERE brand_id = ?1 AND kind = 'drive' LIMIT 1`).bind(act).first().catch(() => null);
  const drive = [prof.drive, nc?.drive_url, conn?.external_id].find(LINK_OK);
  return drive ? { url: drive, label: '', kind: 'drive', at: null, by: null, from: 'drive' } : { url: null, label: '', kind: null, at: null, by: null, from: null };
}
async function setAssetsLink(env, act, url, label, by) {
  const u = String(url || '').trim();
  if (!u) { await env.DB.prepare(`DELETE FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'assets_link'`).bind(act).run(); return { url: null, kind: null }; }
  if (!LINK_OK(u)) throw err(400, 'Paste the full link, starting with https://');
  const d = { url: u, label: String(label || '').replace(/[<>]/g, '').trim().slice(0, 80), kind: kindOf(u), at: nowIso(), by: lower(by) || null };
  await env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at, updated_by) VALUES (?1, '', 'assets_link', ?2, 'approved', 'onboard', datetime('now'), ?3)
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).bind(act, JSON.stringify(d), d.by).run();
  return { url: d.url, kind: d.kind };
}

/* ------------------------------------------------------------------------------------------ */
/*  ONE CLIENT'S WHOLE STATE                                                                   */
/* ------------------------------------------------------------------------------------------ */
const STEP_META = {
  sign_pay: { label: 'Sign and pay', why: 'This makes it official so we can start.' },
  connect: { label: 'Connect your accounts', why: 'So we see your store and your ads the way you do.' },
  brief: { label: 'Ten questions', why: 'Only you know these answers. They steer every ad we write.' },
  assets: { label: 'Your photos and videos', why: 'So our ads use your real photos and videos.' },
};
/* Decision 11: another agency's client (extras off) gets connect only; the brief and the assets link are Mobius extras.
   The gate, reminders, the list line and the team lines all follow this one rule. */
/* The rule itself lives in brandguard.js (onbSteps), so the server's hold and this answer can never differ. */
const shownSteps = row => onbSteps(row);
/** Day 0 for reminders and the client waiting lines: when the welcome email really went, never before. */
const welcomeAt = g => (g.runSteps.email?.status === 'done' ? (g.runSteps.email.at || g.row.sent_at || null) : null);
/** The login that holds this address for this brand today: the address itself, or the login that claimed its invite
 *  with another Google address (clients.js claimInvite moves the login and keeps the invited address as invited_as and
 *  in claimed_from). The step holder and the run's contact stay the INVITED address, so every reminder, line and hand
 *  off resolves through here and mails the live login. null = no login for this brand (removed: never emailed). */
export function liveLogin(users, email, act) {
  const e = lower(email);
  if (!e) return null;
  const has = u => !!(u && typeof u === 'object' && Array.isArray(u.brands) && u.brands.includes(act));
  if (has(users[e])) return e;
  for (const [k, u] of Object.entries(users || {})) {
    if (!has(u)) continue;
    if (lower(u.invited_as) === e || (Array.isArray(u.claimed_from) && u.claimed_from.some(x => lower(x) === e))) return k;
  }
  return null;
}
/** Does this person still have a login for this brand? (A removed login is never emailed or reminded.) */
const hasLogin = (users, email, act) => !!liveLogin(users, email, act);

/** Everything one brand's checklist reads, gathered once. `all` = the all-brands integration states (team lines). */
async function gatherOne(env, row, { all = null } = {}) {
  const brand = await env.DB.prepare(`SELECT id, name, slug, target_cpa, target_roas, client_channel FROM brands WHERE id = ?1`).bind(row.act_id).first().catch(() => null) || { id: row.act_id, name: row.act_id, slug: row.act_id };
  const run = row.run_id ? await getRun(env, row.run_id).catch(() => null) : null;
  const ob = await env.DB.prepare(`SELECT token, answers_json, prefill_json, status FROM p_br_onboard WHERE act_id = ?1`).bind(row.act_id).first().catch(() => null);
  await ensureContractTable(env).catch(() => {});
  const contract = row.token ? await env.DB.prepare(`SELECT status, sent_at, signed_at, client_email FROM p_contract WHERE token = ?1`).bind(row.token).first().catch(() => null) : null;
  const live = await liveFor(env, row.act_id, { all });
  const ag = await agencyAccess(env);
  const installUrl = await settingStr(env, 'shopifyInstallUrl');
  const approves = (await settingStr(env, 'clientApprovesAds')) !== 'off';
  const assets = await assetsLink(env, row.act_id);
  const users = await clientUsers(env);
  return { row, brand, run, runSteps: safe(run?.steps_json, {}), ob, answers: safe(ob?.answers_json, {}), prefill: safe(ob?.prefill_json, {}), contract, live, ag, installUrl, approves, assets, users };
}

function signPayState(g) {
  const { row, contract, runSteps } = g;
  const stp = runSteps.stripe || {};
  const agreement = { used: !!row.uses_agreement, status: !row.uses_agreement ? null : contract?.status === 'signed' ? 'signed' : contract ? 'sent' : 'not_sent',
    sign_url: contract && row.token ? SIGN_PAGE + row.token : null, signer: contract?.client_email || null, signed_at: contract?.signed_at || null, sent_at: contract?.sent_at || null };
  const amount = Number(g.run?.retainer) || 0;
  const invoice = { used: !!row.uses_invoice && amount > 0, status: !(row.uses_invoice && amount > 0) ? null : stp.paid ? 'paid' : stp.invoice && stp.status === 'done' ? 'open' : 'not_sent',
    pay_url: stp.url || null, amount, currency: 'usd', due: stp.sent_at ? new Date(Date.parse(stp.sent_at) + 7 * DAY).toISOString().slice(0, 10) : null, sent_at: stp.sent_at || null,
    note: amount > 0 ? `When it is paid the card is saved and ${money(amount)} is charged on the same day each month after that.` : '' };
  const done = (!agreement.used || agreement.status === 'signed') && (!invoice.used || invoice.status === 'paid');
  const pend = (row.steps.sign_pay || {}).pending_signer || null;
  return { done, agreement, invoice, pending_signer: pend ? { name: pend.name || '', role: pend.role || 'both', asked_at: pend.asked_at || null } : null,
    declined: !!(row.steps.sign_pay || {}).signer_declined_at };
}

/** Works out each step, writes any newly reached done_at (and finished_at), and returns the whole picture. */
async function compute(env, g, { persist = true } = {}) {
  const { row } = g;
  const shown = shownQuestions(row.services, row.goal_measure, g.approves);
  const brief = briefState(shown, g.answers, g.prefill);
  const connect = connectState(row, g.live, g.ag, g.installUrl);
  const sp = signPayState(g);
  const now = { sign_pay: sp.done, connect: connect.gateDone, brief: brief.done, assets: !!g.assets.url };
  const steps = shownSteps(row);
  if (persist) {
    for (const k of steps) if (now[k] && !(row.steps[k] || {}).done_at) {
      await setOnb(env, row.act_id, 'steps_json', [k, 'done_at'], nowIso());
      await setOnb(env, row.act_id, 'steps_json', [k, 'done_by'], 'auto');
      row.steps[k] = { ...(row.steps[k] || {}), done_at: nowIso(), done_by: 'auto' };
    }
    if (brief.done && g.ob && g.ob.status !== 'submitted') await env.DB.prepare(`UPDATE p_br_onboard SET status = 'submitted', submitted_at = datetime('now'), updated_at = datetime('now') WHERE act_id = ?1`).bind(row.act_id).run().catch(() => {});
    if (!row.finished_at && steps.every(k => (row.steps[k] || {}).done_at)) {
      const at = nowIso();
      await env.DB.prepare(`UPDATE p_onboard SET finished_at = ?2, finished_by = 'auto', updated_at = datetime('now') WHERE act_id = ?1 AND finished_at IS NULL`).bind(row.act_id, at).run();
      row.finished_at = at; row.finished_by = 'auto';
    }
  }
  return { brief, connect, sp, now, steps };
}

const gatedOf = row => onbHeld(row, row.steps);

async function clientUsers(env) { return (await getS(env, 'clientUsers', {})) || {}; }

/** The answer of GET /api/onboard. viewer = 'client' | 'team'; only = a colleague's handed steps. */
async function stateFor(env, row, { viewer, only = null, viewerEmail = null, owner = false }) {
  const g = await gatherOne(env, row);
  const c = await compute(env, g);
  const users = await clientUsers(env);
  const run = g.run || {};
  const contact = { name: run.contact_name || '', email: lower(run.contact_email) };
  /* The contact's live login (they may have signed up with another Google address). */
  const contactLive = liveLogin(users, contact.email, row.act_id) || contact.email;
  const visible = (only && only.length ? c.steps.filter(k => only.includes(k)) : c.steps);
  const stepView = k => {
    const s = row.steps[k] || {};
    const raw = lower(s.holder || contact.email);
    const holderEmail = liveLogin(users, raw, row.act_id) || raw;
    const holder = { email: holderEmail, name: s.holder_name || (users[holderEmail]?.name) || (raw === contact.email ? contact.name : ''), handed: !!s.handed };
    const done = !!s.done_at;
    const waiting_on = done ? null
      : k === 'connect' && c.now.connect ? 'us'
      : k === 'sign_pay' && c.sp.agreement.used && c.sp.agreement.status === 'not_sent' ? 'us'
      : s.handed ? 'colleague' : 'client';
    return { key: k, label: STEP_META[k].label, why: STEP_META[k].why, done, done_at: s.done_at || null, holder, waiting_on, days_open: done ? 0 : daysSince(row.sent_at) };
  };
  const doneN = visible.filter(k => (row.steps[k] || {}).done_at).length;
  const me = viewerEmail ? users[lower(viewerEmail)] || {} : null;
  const profileOf = u => ({ name: u?.name || '', title: u?.title || '', phone: u?.phone || '', done: !!(String(u?.name || '').trim() && String(u?.title || '').trim()) });
  const out = {
    act: row.act_id, brand: { id: g.brand.id, name: g.brand.name, slug: v5Slug(g.brand.slug) }, viewer, only: only && only.length ? only : null, extras: !!row.extras,
    sent_at: row.sent_at, finished_at: row.finished_at || null, gated: gatedOf(row),
    profile: viewer === 'client' ? profileOf(me) : profileOf(users[contactLive]),
    progress: { done: doneN, total: visible.length },
    steps: visible.map(stepView),
    sign_pay: only && only.length ? null : (row.sign_pay ? { agreement: c.sp.agreement, invoice: c.sp.invoice, declined: c.sp.declined,
      /* The team also sees the email the client named, so the owner knows where Yes sends it. */
      pending_signer: c.sp.pending_signer && viewer === 'team' ? { ...c.sp.pending_signer, email: lower((row.steps.sign_pay || {}).pending_signer?.email) } : c.sp.pending_signer } : null),
    connect: visible.includes('connect') ? { done: c.connect.done, total: c.connect.total, note: c.connect.note, platforms: c.connect.platforms.map(({ short, ...p }) => p) } : null,
    brief: visible.includes('brief') ? c.brief : null,
    assets: visible.includes('assets') ? (g.assets.url ? g.assets : null) : null,
    next_line: (await settingStr(env, 'onboardNextLine')) || 'Your team will be in touch within one working day to book your kickoff call.',
    team_chat: only && only.length ? null : g.brand.client_channel ? { slack_url: `https://slack.com/app_redirect?channel=${g.brand.client_channel}` } : null,
  };
  if (viewer === 'team') {
    const lines = (await linesForBrand(env, g, c)).filter(l => owner || !l.to.owner_only);
    /* "Copy their link": the invite while they have never signed in (renewed when it ran out), else Get started. */
    const invite = users[contactLive] && !users[contactLive].last_sign_in ? await ensureInvite(env, contactLive, LOCUS_V5).catch(() => null) : startLink(g.brand.slug);
    out.team = {
      contact: { ...contact, ...(contactLive !== contact.email ? { signed_in_as: contactLive } : {}) }, invite_link: invite, budget: { amount: row.ad_budget == null ? null : Number(row.ad_budget), open: !!row.budget_open },
      reminders: { d3: g.row.rem.d3 || null, d7: g.row.rem.d7 || null, manual: g.row.rem.manual || [] },
      ask_on_call: [
        ...shownQuestions(row.services, row.goal_measure, g.approves).filter(q => !g.answers[q.key] || g.answers[q.key] === '__unsure').map(q => `${q.text}${g.answers[q.key] === '__unsure' ? ' (not sure)' : ''}`),
        'What an order costs to make and ship', 'Launches and key dates'],
      all_answers: Object.fromEntries(QUESTIONS.filter(q => g.answers[q.key]).map(q => [q.key, g.answers[q.key]])),
      lines: lines.map(lineItem),
      /* Only once the welcome really went, and only to someone who still has a login for this brand. */
      can_remind: Object.fromEntries([...HANDABLE.map(k => [k, remindable(g, c, k)]), ['sign_pay', owner && !!row.sign_pay && !c.now.sign_pay]]),
      run_id: row.run_id || null, slack_ok: !!(g.run && g.run.slack_client),
      /* false = the welcome email never went (unticked at Send, or it failed): the owner gets "Send the welcome email". */
      welcome_sent: g.run ? g.runSteps.email?.status === 'done' : null,
      held: g.runSteps.stripe?.held || null,
    };
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/*  THE GATE (spec 2.5): read by /api/me in ONE query                                          */
/* ------------------------------------------------------------------------------------------ */
/* Gated PER BRAND: a client whose second brand is being set up keeps the first one. `gated` = some brand is held (the
   first one is named in brand / slug / left); `gated_slugs` = every held brand; `all_gated` = every brand the login has
   is held, so pages with no brand (the landing) go to Get started too. A colleague (only) is always held. */
export async function onboardGate(env, email, brands, only) {
  const list = (brands || []).filter(b => /^brand_[a-z0-9_]+$/.test(b));
  if (!list.length) return null;
  const ph = list.map((_, i) => `?${i + 1}`).join(',');
  const rows = ((await env.DB.prepare(`SELECT o.act_id, o.extras, o.sign_pay, o.gate, o.steps_json, o.finished_at, b.slug FROM p_onboard o LEFT JOIN brands b ON b.id = o.act_id WHERE o.act_id IN (${ph})`).bind(...list).all().catch(() => ({ results: [] }))).results) || [];
  if (!rows.length) return null;
  const view = (r, steps) => {
    const st = safe(r.steps_json, {});
    const left = steps.filter(k => !(st[k] || {}).done_at);
    return { brand: r.act_id, slug: v5Slug(r.slug || r.act_id.replace(/^brand_/, '')), left, done: steps.length - left.length, total: steps.length };
  };
  if (only && only.length) {
    const r = rows[0];
    const v = view(r, only.filter(k => STEP_KEYS.includes(k)));
    return { gated: true, ...v, only, gated_slugs: [v.slug], gated_brands: [v.brand], all_gated: true };
  }
  const held = [];
  for (const r of rows) {
    const v = view(r, shownSteps(r));
    if (onbHeld(r, safe(r.steps_json, {}))) held.push(v);
  }
  /* gated_brands (brand ids) is what the engine's access check reads; the screens read the slugs. */
  const gated_slugs = held.map(v => v.slug), gated_brands = held.map(v => v.brand);
  const all_gated = held.length > 0 && list.every(b => held.some(v => v.brand === b));
  if (held.length) return { gated: true, ...held[0], only: null, gated_slugs, gated_brands, all_gated };
  return { gated: false, ...view(rows[0], shownSteps(rows[0])), only: null, gated_slugs: [], gated_brands: [], all_gated: false };
}

/* ------------------------------------------------------------------------------------------ */
/*  EMAIL WORDS (spec 3). Cole's voice; sendMail adds his signature.                           */
/* ------------------------------------------------------------------------------------------ */
export function welcomeText({ first, brand, signPay = true, agreement = true, invoice = true, slack = true, extras = true }) {
  const money = extras && signPay;
  const steps = money ? 'four short steps: sign and pay, connect your accounts, ten questions only you can answer, and a link to your photos and videos'
    : extras ? 'three short steps: connect your accounts, ten questions only you can answer, and a link to your photos and videos'
    : 'a few short steps: connect your accounts';
  const paper = !extras ? null : agreement && invoice ? 'Our agreement comes in a separate email from me, and the first invoice from Stripe. Both are on your checklist too.'
    : agreement ? 'Our agreement comes in a separate email from me. It is on your checklist too.'
    : invoice ? 'The first invoice comes from Stripe. It is on your checklist too.' : null;
  return {
    subject: `Welcome to Mobius Digital, ${first}`,
    body: [`Hi ${first},`, `Welcome aboard. We are excited to get started on ${brand}.`, `Everything starts from one link:\n${LINK_PLACEHOLDER}`,
      `It opens Locus, the app we run ${brand} from. Make your login (Google, or a code we email you), then ${steps}. It saves as you go. If someone else on your team should do a step, press "Someone else does this" and we email them.`,
      paper, extras && slack ? 'You will also get an invite to our shared Slack channel.' : null, 'Talk soon,'].filter(Boolean).join('\n\n'),
  };
}
export function reminderText({ first, brand, items, link, late = false }) {
  return {
    subject: late ? `${brand}: still waiting on a few setup steps` : `${brand}: a few minutes left on your setup`,
    body: `Hi ${first},\n\nA quick nudge on ${brand}'s setup in Locus. Still open for you:\n${items.map(i => `- ${i}`).join('\n')}\n\nYour link: ${link}\n\nAnything unclear, reply to this email.\n\nThanks,`,
  };
}
const JOBS = {
  connect: { job: b => `give us access to ${b}'s accounts (the store, Meta, Google and the rest)`, minutes: 10 },
  brief: { job: b => `answer ten short questions about ${b}`, minutes: 15 },
  assets: { job: b => `share the link to ${b}'s photos and videos`, minutes: 2 },
};
export function handoffText({ first, fromName, brand, step }) {
  const j = JOBS[step];
  return {
    subject: `${firstName(fromName)} asked you to help with ${brand}'s setup`,
    body: `Hi ${first},\n\n${fromName} at ${brand} asked you to ${j.job(brand)}. We are Mobius Digital, the agency running ${brand}'s marketing.\n\nIt takes about ${j.minutes} minutes. Open this link and make a quick login:\n${LINK_PLACEHOLDER}\n\nYou only see this one job.\n\nThanks,`,
  };
}
/** The open items of the given steps, as reminder lines. Never sign and pay. */
function openItems(c, steps) {
  const out = [];
  if (steps.includes('connect') && !c.now.connect) out.push(`Connect your accounts (${andList(c.connect.todoNames.slice(0, 3)) || 'a few'}${c.connect.todoNames.length > 3 ? ` and ${c.connect.todoNames.length - 3} more` : ''} left)`);
  if (steps.includes('brief') && !c.now.brief) out.push(`The ten questions (${c.brief.answered} of ${c.brief.total} answered)`);
  if (steps.includes('assets') && !c.now.assets) out.push('The link to your photos and videos');
  return out;
}
/** Where a holder's reminder points: their invite link if they never signed in, else Get started. */
async function linkFor(env, email, slug) {
  const users = await clientUsers(env);
  const u = users[lower(email)];
  if (u && !u.last_sign_in) { const l = await ensureInvite(env, email, LOCUS_V5).catch(() => null); if (l) return l; }
  return startLink(slug);
}

/* ------------------------------------------------------------------------------------------ */
/*  TEAM LINES (spec 2.7): live, nothing stored                                                */
/* ------------------------------------------------------------------------------------------ */
function teamOf(run) {
  const tj = safe(run?.team_json, {}) || {};
  const emails = [...new Set(Object.values(tj).flatMap(v => String(v || '').split(/[,\s]+/)).map(lower).filter(emailOk))];
  const buyer = String(tj.buyer || '').split(/[,\s]+/).map(lower).filter(emailOk);
  return { emails, buyer };
}
/** A step the team may remind about: shown, open, the welcome went, and its holder still has a login for this brand. */
function remindable(g, c, k) {
  if (!c.steps.includes(k) || c.now[k] || !welcomeAt(g)) return false;
  const h = lower((g.row.steps[k] || {}).holder || g.run?.contact_email);
  return emailOk(h) && hasLogin(g.users || {}, h, g.row.act_id);
}
/** The money lines that outlive onboarding: a held invoice ("Send it anyway") and a card that was not saved. They are
 *  built for every v2 run whatever finished_at says, because the next invoice arrives a month after setup ends. */
function billingLines(add, act, B, runSteps, toOwner) {
  const st = runSteps.stripe || {};
  if (st.held) add(`onb:${act}:invoice_held:${st.held.invoice}`, 'invoice_held', 'sign_pay', `${B}: next invoice held, ${st.held.why || 'the last one is not paid'}`, toOwner, { action: { kind: 'release', invoice: st.held.invoice } });
  if (st.paid && st.subscription && st.autopay === false) add(`onb:${act}:card`, 'card', 'sign_pay', `Card not saved for ${B}, next month's invoice is emailed instead`, toOwner, { action: null });
}
async function linesForBrand(env, g, c) {
  const { row, brand, run } = g;
  const B = brand.name, act = row.act_id, slug = v5Slug(brand.slug), link = startLink(brand.slug);
  const toOwner = { owner_only: true, emails: [], names: [] };
  const L = [];
  const days = daysSince(row.sent_at);
  const add = (id, kind, step, text, to, extra = {}) => L.push({ id, kind, step, text: noDash(text), to, act, brand: B, slug, link, days, bucket: days >= 7 ? 'late' : 'today', ...extra });
  if (row.finished_at) { billingLines(add, act, B, g.runSteps, toOwner); return L; }
  const team = teamOf(run);
  const names = (await roster(env).catch(() => [])).filter(p => team.emails.includes(lower(p.email))).map(p => p.name);
  const toTeam = { owner_only: false, emails: team.emails, names };
  const dWord = n => `${n} day${n === 1 ? '' : 's'}`;
  /* Waiting on the client: counted from the welcome email (none sent = the client does not know yet, so no line),
     and only for a holder who still has a login for this brand. */
  const wAt = welcomeAt(g);
  const wDays = wAt ? daysSince(wAt) : -1, band = wDays >= 7 ? 'd7' : 'd3';
  const waitLine = (id, step, text) => L.push({ id, kind: 'client_waiting', step, text: noDash(text), to: toTeam, act, brand: B, slug, link, days: wDays, bucket: wDays >= 7 ? 'late' : 'today', action: { kind: 'remind', step } });
  if (wDays >= 3) {
    if (remindable(g, c, 'connect')) {
      const n = c.connect.todoNames;
      waitLine(`onb:${act}:connect:${band}`, 'connect', `${B} has not connected ${andList(n.slice(0, 3)) || 'their accounts'}${n.length > 3 ? ` and ${n.length - 3} more` : ''}, ${dWord(wDays)}`);
    }
    if (remindable(g, c, 'brief')) waitLine(`onb:${act}:brief:${band}`, 'brief', `${B} brief ${c.brief.answered} of ${c.brief.total}, ${dWord(wDays)}`);
    if (remindable(g, c, 'assets')) waitLine(`onb:${act}:assets:${band}`, 'assets', `${B} has not linked their photos and videos, ${dWord(wDays)}`);
  }
  /* A hand off the server did not email (the address has a login for another brand): the owner decides. */
  for (const k of HANDABLE) {
    const bl = (row.steps[k] || {}).handoff_blocked;
    if (bl && bl.email && !(row.steps[k] || {}).done_at) add(`onb:${act}:handoff_blocked:${k}:${String(bl.email).replace(/[^a-z0-9.@_-]/gi, '')}`, 'handoff_blocked', k,
      `${bl.by_name || 'The client'} handed ${STEP_META[k].label.toLowerCase()} for ${B} to ${bl.name || bl.email}, who already has a Locus login for another brand. Nothing was emailed.`, toOwner,
      { action: null, detail: `${bl.name || ''} <${bl.email}>. If that is right, add ${B} to their login in Clients, then send them their link.` });
  }
  if (row.sign_pay) {
    const ag = c.sp.agreement, inv = c.sp.invoice;
    const ad = daysSince(ag.sent_at), id = daysSince(inv.sent_at);
    if (ag.used && ag.status === 'sent' && ad >= 3) add(`onb:${act}:sign:${ad >= 7 ? 'd7' : 'd3'}`, 'sign', 'sign_pay', `${B}: agreement sent ${ad} days ago, not signed`, toOwner, { action: { kind: 'remind', step: 'sign_pay' } });
    if (inv.used && inv.status === 'open' && id >= 3) add(`onb:${act}:pay:${id >= 7 ? 'd7' : 'd3'}`, 'pay', 'sign_pay', `${B}: invoice sent ${id} days ago, not paid`, toOwner, { action: { kind: 'remind', step: 'sign_pay' } });
    if (c.sp.pending_signer) {
      const p = (row.steps.sign_pay || {}).pending_signer || {};
      add(`onb:${act}:signer:${String(p.email || '').replace(/[^a-z0-9.@_-]/gi, '')}`, 'signer', 'sign_pay', `${run?.contact_name ? firstName(run.contact_name) : 'The client'} says ${p.name || p.email} ${p.role === 'payer' ? 'pays' : p.role === 'signer' ? 'signs' : 'signs and pays'} for ${B}. Send ${p.role === 'payer' ? 'the invoice' : 'the agreement'} to ${firstName(p.name || p.email)}?`, toOwner,
        { action: { kind: 'signer' }, detail: `${p.name || ''} <${p.email || ''}>` });
    }
  }
  /* Connect: Shopify collaborator request, checks waiting on us, keys to make, needed platforms skipped. */
  for (const p of c.connect.platforms) {
    const cj = row.conn[p.key] || {};
    if (p.key === 'shopify' && !p.skipped && cj.team?.inputs?.shop_url && p.layers.team.state !== 'done') {
      const store = cj.team.inputs.shop_url, code = cj.team.inputs.code || '';
      add(`onb:${act}:shopify_request:${store}`, 'shopify_request', 'connect', `Send the Shopify collaborator request for ${B}: ${store}, code ${code || 'none'}`, toTeam,
        { action: { kind: 'tick', platform: 'shopify', layer: 'team' }, detail: 'Shopify Partners > Stores > Add store > Request access to a store > paste the address and the code > tick every permission > Request access. Shopify has no way to send this automatically.' });
    }
    /* What a client typed that only the team may turn into a link (another brand's store or account must never be
       attached by a client): the team checks it is really theirs and ticks, and the tick makes the link. */
    if (p.key === 'tw' && !p.skipped && cj.team?.inputs?.shop_url && p.layers.team.state !== 'done')
      add(`onb:${act}:confirm_tw:${cj.team.inputs.shop_url}`, 'confirm_tw', 'connect', `Confirm ${B}'s Triple Whale store: ${cj.team.inputs.shop_url}`, toTeam,
        { action: { kind: 'tick', platform: 'tw', layer: 'team' }, detail: 'Check the store is really theirs (Triple Whale invite from them, the store name), then tick. The tick connects it.' });
    if (p.key === 'google_ads' && !p.skipped && cj.team?.inputs?.customer_id && cj.team.inputs.confirm && p.layers.team.state !== 'done')
      add(`onb:${act}:confirm_gads:${cj.team.inputs.customer_id}`, 'confirm_gads', 'connect', `Confirm ${B}'s Google Ads ID: ${fmtGads(cj.team.inputs.customer_id)}`, toTeam,
        { action: { kind: 'tick', platform: 'google_ads', layer: 'team' }, detail: cj.team.inputs.confirm === 'managed' ? 'That account is already under the Mobius manager, so Locus did not link it by itself. Check it is really theirs, then tick. The tick links it.'
          : cj.team.inputs.confirm === 'connect_link' ? 'They typed this on the old connect link, so Locus only kept it. Check it is really theirs and send the manager request if it is not under the Mobius manager yet, then tick. The tick links it.'
          : 'Locus could not send the manager request. Send it from the Mobius manager by hand, then tick once they accept. The tick links it.' });
    if (!p.skipped && p.layers.team.checks_itself && p.layers.team.state === 'waiting' && cj.team?.said_at && Date.now() - Date.parse(cj.team.said_at) > DAY)
      add(`onb:${act}:team_check:${p.key}`, 'team_check', 'connect', `Check ${B}'s ${p.short} access and tick it`, toTeam, { action: null });
    if (!p.skipped && ['clarity', 'email'].includes(p.key) && cj.team?.said_at && !cj.tool && p.layers.app.state !== 'done')
      add(`onb:${act}:make_key:${p.key}`, 'make_key', 'connect', `Make the ${p.key === 'clarity' ? 'Clarity API token' : 'Klaviyo private key'} for ${B}`, toTeam, { action: null, detail: KEY_STEPS[p.key] });
    if (p.skipped && p.needed) add(`onb:${act}:skipped_needed:${p.key}`, 'skipped_needed', 'connect', `${B} says they do not use ${p.short}`, toOwner, { action: null });
  }
  if (row.budget_open) add(`onb:${act}:budget`, 'budget', null, `Ask ${B} for the ad budget`, toOwner, { action: null });
  const ga = g.answers.goal_answer;
  if (typeof ga === 'string' && /\d/.test(ga) && !(Number(brand.target_cpa) > 0) && !(Number(brand.target_roas) > 0))
    add(`onb:${act}:goal`, 'goal', 'brief', `Confirm the goal for ${B}: the client said ${ga.slice(0, 80)}`, { owner_only: false, emails: team.buyer, names: [] }, { action: null, link: `${LOCUS_V5}#/brand/${slug}/brand-settings/goals` });
  billingLines(add, act, B, g.runSteps, toOwner);
  return L;
}
const lineItem = l => ({ id: l.id, kind: l.kind, step: l.step, text: l.text, detail: l.detail || '', act_id: l.act, brand: l.brand, slug: l.slug, link: l.link, bucket: l.bucket,
  when: `${l.days} day${l.days === 1 ? '' : 's'}`, owner_only: !!l.to.owner_only, action: l.action || null,
  remind: !!(l.action && l.action.kind === 'remind') });

/** Every open line, every brand (mywork.js gather). */
export async function onboardLines(env) {
  await ensureOnboard(env);
  const rows = ((await env.DB.prepare(`SELECT * FROM p_onboard WHERE finished_at IS NULL AND sent_at IS NOT NULL ORDER BY sent_at`).all().catch(() => ({ results: [] }))).results) || [];
  const out = [];
  if (rows.length) {
    const all = await liveAll(env);
    for (const raw of rows) {
      const row = { ...raw, steps: safe(raw.steps_json, {}), conn: safe(raw.connect_json, {}), rem: safe(raw.reminders_json, {}), services: safe(raw.services_json, []) };
      try { const g = await gatherOne(env, row, { all }); const c = await compute(env, g); out.push(...await linesForBrand(env, g, c)); } catch (e) { console.log('onboard lines: ' + e.message); }
    }
  }
  /* Finished setups still carry their billing lines (a held invoice, a card not saved): one cheap query, no gather. */
  const fin = ((await env.DB.prepare(`SELECT o.act_id, o.sent_at, n.steps_json AS run_steps, b.name, b.slug FROM p_onboard o JOIN p_newclient n ON n.id = o.run_id LEFT JOIN brands b ON b.id = o.act_id
    WHERE o.finished_at IS NOT NULL AND (json_extract(n.steps_json, '$.stripe.held') IS NOT NULL OR json_extract(n.steps_json, '$.stripe.autopay') = 0)`).all().catch(() => ({ results: [] }))).results) || [];
  const toOwner = { owner_only: true, emails: [], names: [] };
  for (const f of fin) {
    const B = f.name || f.act_id, slug = v5Slug(f.slug || f.act_id), link = startLink(f.slug || f.act_id), days = daysSince(f.sent_at);
    billingLines((id, kind, step, text, to, extra = {}) => out.push({ id, kind, step, text: noDash(text), to, act: f.act_id, brand: B, slug, link, days, bucket: 'today', ...extra }), f.act_id, B, safe(f.run_steps, {}), toOwner);
  }
  return out;
}
/** Does this line belong on this person's My day? The owner sees everything. Pure. */
export function lineFor(line, person, ownerEmail) {
  const em = lower(person.email), owner = (em && em === lower(ownerEmail || OWNER)) || String(person.name || '').toLowerCase() === 'cole';
  if (owner) return true;
  if (line.to.owner_only) return false;
  return (em && line.to.emails.includes(em)) || line.to.names.some(n => n.toLowerCase() === String(person.name || '').toLowerCase());
}
/** A line as a My day item (mywork.js forPerson). */
export function myWorkItem(l, done) {
  return { id: l.id, source: 'onboard', bucket: l.bucket, text: l.text, brand: l.brand, act_id: l.act, slug: l.slug, due: '', from: 'Onboarding',
    when: `${l.days} day${l.days === 1 ? '' : 's'}`, detail: l.detail || '', link: l.link,
    onboard: { act: l.act, step: l.step, kind: l.kind, remind: !!(l.action && l.action.kind === 'remind'), action: l.action || null }, done: !!done };
}

/* ------------------------------------------------------------------------------------------ */
/*  NEW CLIENT: options, preview, send (spec 2.1)                                              */
/* ------------------------------------------------------------------------------------------ */
const SERVICES = [{ key: 'meta_ads', label: 'Meta ads' }, { key: 'google_ads', label: 'Google ads' }, { key: 'tiktok_ads', label: 'TikTok ads' },
  { key: 'email', label: 'Email and SMS' }, { key: 'creative', label: 'Creative' }, { key: 'other', label: 'Other' }];
const MEASURES = [{ key: 'cpa', label: 'Cost per sale' }, { key: 'cpnc', label: 'Cost per new customer' }, { key: 'roas', label: 'Return on ad spend' }, { key: 'cpl', label: 'Cost per lead' }];
const extrasOn = async env => (await settingStr(env, 'onboardExtras')) !== 'off';
const centralYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function formOf(b, extras) {
  const svc = [...new Set((Array.isArray(b.services) ? b.services : []).filter(s => SERVICES.some(x => x.key === s)))];
  const send = b.send || {};
  const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    name: String(b.name || '').trim().slice(0, 80), website: String(b.website || '').trim().slice(0, 300),
    contact_name: String(b.contact_name || '').replace(/[<>]/g, '').trim().slice(0, 120), contact_email: lower(b.contact_email),
    services: svc, goal_measure: MEASURES.some(m => m.key === b.goal_measure) ? b.goal_measure : 'cpa',
    ad_budget: num(b.ad_budget), budget_open: !!b.budget_open,
    retainer: extras ? num(b.retainer) : null, start_date: /^\d{4}-\d{2}-\d{2}$/.test(b.start_date || '') ? b.start_date : centralYmd(),
    signer_name: String(b.signer_name || '').replace(/[<>]/g, '').trim().slice(0, 120), signer_email: lower(b.signer_email), payer_email: lower(b.payer_email),
    company_legal: String(b.company_legal || '').replace(/[<>]/g, '').trim().slice(0, 160),
    team: b.team && typeof b.team === 'object' ? b.team : {},
    /* "No agreement or invoice for this client" on the form (sign_pay: false): the checklist is three steps and nothing
       waits on a paper that is never coming. Send a part later from their setup page and the step comes back. */
    sign_pay: extras && b.sign_pay !== false,
    send: { welcome: send.welcome !== false, agreement: extras && b.sign_pay !== false && send.agreement !== false, invoice: extras && b.sign_pay !== false && send.invoice !== false },
  };
}
function agreementVars(f, override) {
  const base = contractDefaults({ name: f.company_legal || f.name, contact_name: f.signer_name || f.contact_name, retainer: f.retainer || 0, start_date: f.start_date });
  const vars = { ...base, ...Object.fromEntries(Object.entries(override || {}).filter(([k]) => ['client_name', 'company', 'start_date', 'term', 'payment'].includes(k)).map(([k, v]) => [k, String(v ?? '').trim()])) };
  const blanks = ['client_name', 'company', 'start_date', 'term', 'payment'].filter(k => !String(vars[k] || '').trim() || /\[amount\]/.test(String(vars[k])));
  return { vars, blanks };
}
async function preview(env, b) {
  const extras = await extrasOn(env);
  const f = formOf(b, extras);
  const problems = [];
  if (!f.name) problems.push('Give the brand a name.');
  if (!emailOk(f.contact_email)) problems.push('Add the client contact email.');
  if (f.signer_email && !emailOk(f.signer_email)) problems.push('The signer email does not look right.');
  if (f.payer_email && !emailOk(f.payer_email)) problems.push('The payer email does not look right.');
  const first = firstName(f.contact_name);
  const w = welcomeText({ first, brand: f.name || 'your brand', signPay: f.sign_pay, agreement: f.sign_pay && f.send.agreement, invoice: f.sign_pay && f.send.invoice && f.retainer > 0, slack: extras, extras });
  const out = { ok: true, welcome: { to: f.contact_email, subject: w.subject, body: w.body } };
  const toName = f.contact_name || f.contact_email;
  const confirm = [];
  if (f.send.welcome) confirm.push(`Welcome to ${toName}.`);
  if (extras && !f.sign_pay) {
    out.agreement = { used: false, to: f.signer_email || f.contact_email, vars: {}, html: '', blanks: [], ok_to_send: false };
    out.invoice = { used: false, to: f.payer_email || f.contact_email, amount: 0, currency: 'usd', due_days: 7, text: 'No agreement or invoice for this client.' };
    out.extras = ['Two Slack channels (team and shared)', 'A Frame project', 'Ledger'];
  } else if (extras) {
    const { vars, blanks } = agreementVars(f, b.agreement?.vars);
    const signerTo = f.signer_email || f.contact_email;
    out.agreement = { used: true, to: signerTo, vars, html: contractHtml(vars), blanks, ok_to_send: !blanks.length };
    if (f.send.agreement && blanks.length) problems.push(`The agreement has empty blanks: ${blanks.join(', ').replace(/_/g, ' ')}.`);
    const payer = f.payer_email || f.contact_email;
    out.invoice = f.retainer > 0 ? { used: true, to: payer, amount: f.retainer, currency: 'usd', due_days: 7,
      text: `First month, ${money(f.retainer)}, due in 7 days. When it is paid the card is saved and the retainer bills itself on the same day each month after that.` }
      : { used: false, to: payer, amount: 0, currency: 'usd', due_days: 7, text: 'No fee typed, so no invoice.' };
    if (f.send.invoice && f.retainer > 0 && !String(env.STRIPE_SECRET_KEY || '').trim()) problems.push('Stripe is not connected, so the invoice cannot go. Untick it or connect Stripe.');
    out.extras = ['Two Slack channels (team and shared)', 'A Frame project', 'Ledger'];
    if (f.send.agreement) confirm.push(`Agreement to ${f.signer_name || (f.signer_email ? f.signer_email : toName)}.`);
    if (f.send.invoice && f.retainer > 0) confirm.push(`Invoice for ${money(f.retainer)} to ${f.payer_email && f.payer_email !== f.contact_email ? f.payer_email : toName}.`);
    if (f.send.agreement) confirm.push('Pressing Send signs the agreement for Mobius Digital as Cole Wetzler.');
  }
  if (!confirm.length) confirm.push('Nothing is emailed now. Pressing Send makes the brand and their login.');
  out.confirm = confirm.join(' ');
  out.problems = problems;
  return { out, f, extras };
}
async function nameTaken(env, name) {
  await ensureNewClient(env);
  const a = await env.DB.prepare(`SELECT id FROM p_newclient WHERE lower(name) = lower(?1)`).bind(name).first().catch(() => null);
  if (a) return true;
  const b = await env.DB.prepare(`SELECT id FROM brands WHERE lower(name) = lower(?1)`).bind(name).first().catch(() => null);
  return !!b;
}
const res = (status, text, extra = {}) => ({ status, text: noDash(String(text || '')).slice(0, 600), ...extra });
const fromStep = s => res(s.status === 'failed' ? 'failed' : s.status === 'skipped' ? 'skipped' : 'done', s.text || (s.status === 'failed' ? 'Failed.' : 'Done.'));

async function sendWelcome(env, row, run, { subject, body }, who) {
  const brand = await env.DB.prepare(`SELECT name FROM brands WHERE id = ?1`).bind(row.act_id).first().catch(() => null);
  const email = lower(run.contact_email);
  const link = await ensureInvite(env, email, LOCUS_V5);
  if (!link) return res('failed', 'There is no client login for this email.');
  const w = welcomeText({ first: firstName(run.contact_name), brand: brand?.name || run.name, signPay: !!row.sign_pay, agreement: !!row.uses_agreement, invoice: !!row.uses_invoice && run.retainer > 0, slack: !!row.extras, extras: !!row.extras });
  const subj = String(subject || w.subject).replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  let text = noDash(String(body || w.body).trim().slice(0, 8000));
  text = text.includes(LINK_PLACEHOLDER) ? text.split(LINK_PLACEHOLDER).join(link) : `${text}\n\nYour link: ${link}`;
  try { await sendMail(env, email, subj, text); }
  catch (e) { return res('failed', /sign-in failed|unauthorized_client|access_denied|insufficient/i.test(e.message) ? 'Locus may not send from your Gmail yet. Copy the link and send it yourself.' : e.message); }
  const users = await clientUsers(env);
  if (users[email]) { users[email].last_invite = nowIso(); await putS(env, 'clientUsers', users); }
  await setStep(env, run.id, 'email', { status: 'done', at: nowIso(), text: `Sent to ${email} from Cole's Gmail.`, by: who || null });
  return res('done', `Sent to ${email} from Cole's Gmail.`);
}

async function doSend(env, b, who, deps, request) {
  if (b.confirm !== true) throw err(400, 'Press Send on the confirm sheet first.');
  const extras = await extrasOn(env);
  const askedExtras = !!(b.send && (b.send.agreement || b.send.invoice)) || Number(b.retainer) > 0;
  if (!extras && askedExtras) throw err(403, 'This account does not use agreements or invoices.');
  const { out: pv, f } = await preview(env, b);
  if (pv.problems.length) throw Object.assign(err(400, pv.problems[0]), { problems: pv.problems });
  if (await nameTaken(env, f.name)) throw err(409, `${f.name} is already in Locus. Open it from the Clients list.`);
  const results = {};
  const run0 = await insertRun(env, { name: f.name, website: f.website, contact_name: f.contact_name, contact_email: f.contact_email, retainer: f.retainer, start_date: f.start_date, team: f.team }, who);
  const act = run0.act_id;
  await setStep(env, run0.id, 'v', 2);
  await setStep(env, run0.id, 'services', f.services);
  if (f.payer_email) await setStep(env, run0.id, 'payer', f.payer_email);
  results.link = fromStep(await runStep(env, run0.id, 'link', {}));
  let run = await getRun(env, run0.id);
  /* The checklist row. */
  await ensureOnboard(env);
  const usesAgreement = f.sign_pay ? 1 : 0, usesInvoice = f.sign_pay && f.retainer > 0 ? 1 : 0;
  const signPay = extras && (usesAgreement || usesInvoice) ? 1 : 0;
  const holder = { holder: f.contact_email, holder_name: f.contact_name || '' };
  const steps = Object.fromEntries(STEP_KEYS.map(k => [k, { ...holder }]));
  await env.DB.prepare(`INSERT INTO p_onboard (act_id, run_id, token, extras, sign_pay, uses_agreement, uses_invoice, services_json, goal_measure, ad_budget, budget_open, gate, steps_json, sent_at, created_by)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?13, ?14)
    ON CONFLICT(act_id) DO UPDATE SET run_id = excluded.run_id, token = excluded.token, extras = excluded.extras, sign_pay = excluded.sign_pay, uses_agreement = excluded.uses_agreement, uses_invoice = excluded.uses_invoice,
      services_json = excluded.services_json, goal_measure = excluded.goal_measure, ad_budget = excluded.ad_budget, budget_open = excluded.budget_open, sent_at = excluded.sent_at, updated_at = datetime('now')`)
    .bind(act, run.id, run.token || null, extras ? 1 : 0, signPay, usesAgreement, usesInvoice, JSON.stringify(f.services), f.goal_measure, f.ad_budget, f.budget_open ? 1 : 0, JSON.stringify(steps), nowIso(), who || null).run();
  forgetHeld();
  /* The ad budget: the same column PUT /api/accounts/<brand> writes. */
  if (f.ad_budget != null) await env.DB.prepare(`UPDATE brands SET monthly_budget = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(act, f.ad_budget).run().catch(() => {});
  /* The client login and its invite link (new Locus). */
  const loginErr = await upsertClient(env, f.contact_email, [act], who, f.contact_name);
  const invite = loginErr ? null : await ensureInvite(env, f.contact_email, LOCUS_V5);
  results.login = loginErr ? res('failed', loginErr) : res('done', `Login made for ${f.contact_email}.`);
  const row = await onbRow(env, act);
  /* 1. welcome */
  results.welcome = !f.send.welcome ? res('skipped', 'Not ticked. Send it from their setup page.') : loginErr ? res('failed', 'No login, so no welcome.') : await sendWelcome(env, row, run, b.welcome || {}, who);
  /* 2. agreement */
  if (!extras) results.agreement = res('skipped', 'Not used on this account.');
  else if (!f.sign_pay) results.agreement = res('skipped', 'No agreement for this client.');
  else if (!f.send.agreement) results.agreement = res('skipped', 'Not ticked. Send it from their setup page.');
  else {
    const { vars } = agreementVars(f, b.agreement?.vars);
    const custom = /^<article[\s\S]*<\/article>$/.test(String(b.agreement?.html || '').trim()) ? String(b.agreement.html).trim() : undefined;
    results.agreement = fromStep(await runStep(env, run.id, 'contract', { approved: true, vars: { ...vars, ...(f.signer_email ? { sign_email: f.signer_email } : {}), ...(custom ? { html: custom } : {}) }, ip: request?.headers?.get('CF-Connecting-IP') || '' }));
  }
  /* 3. invoice */
  if (!extras) results.invoice = res('skipped', 'Not used on this account.');
  else if (!f.sign_pay) results.invoice = res('skipped', 'No invoice for this client.');
  else if (!(f.retainer > 0)) results.invoice = res('skipped', 'No fee typed, so no invoice.');
  else if (!f.send.invoice) results.invoice = res('skipped', 'Not ticked. Send it from their setup page.');
  else results.invoice = fromStep(await runStep(env, run.id, 'stripe', { approved: true }));
  /* 4. the Mobius extras: Slack (team), the Slack Connect invite only after the welcome, Frame, Ledger, the summary */
  if (!extras) for (const k of ['slack', 'slackInvite', 'frame', 'ledger', 'summary']) results[k] = res('skipped', 'Not used on this account.');
  else {
    results.slack = fromStep(await runStep(env, run.id, 'slack', { noClientInvite: true }));
    results.slackInvite = results.welcome.status === 'done' && results.slack.status === 'done' ? fromStep(await runStep(env, run.id, 'slackInvite', {}))
      : res('skipped', results.welcome.status !== 'done' ? 'Goes after the welcome email.' : 'No Slack channels yet.');
    results.frame = fromStep(await runStep(env, run.id, 'frame', {}));
    results.ledger = fromStep(await runStep(env, run.id, 'ledger', { mintSession: deps.mintSession }));
    results.summary = results.slack.status === 'done' ? fromStep(await runStep(env, run.id, 'summary', {})) : res('skipped', 'No internal channel yet.');
  }
  await env.DB.prepare(`DELETE FROM settings WHERE key = 'onbConnectAll'`).run().catch(() => {});
  const brand = await env.DB.prepare(`SELECT slug FROM brands WHERE id = ?1`).bind(act).first().catch(() => null);
  return { ok: true, act, slug: v5Slug(brand?.slug || ''), run_id: run.id, invite_link: invite, results };
}

/* ------------------------------------------------------------------------------------------ */
/*  CLIENT WRITES (spec 2.3)                                                                   */
/* ------------------------------------------------------------------------------------------ */
async function writeBrief(env, row, answers, by) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw err(400, 'Send the answers.');
  const keys = Object.keys(answers);
  const bad = keys.filter(k => !BRIEF_KEYS.has(k));
  if (bad.length) throw err(400, `Unknown question: ${bad.join(', ')}.`);
  const have = await env.DB.prepare(`SELECT act_id FROM p_br_onboard WHERE act_id = ?1`).bind(row.act_id).first().catch(() => null);
  if (!have) {
    const tok = row.token || [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare(`INSERT INTO p_br_onboard (act_id, token) VALUES (?1, ?2)`).bind(row.act_id, tok).run();
  }
  for (const k of keys) {
    const v = String(answers[k] ?? '').replace(/\r/g, '').trim().slice(0, 4000);
    if (!v) await env.DB.prepare(`UPDATE p_br_onboard SET answers_json = json_remove(answers_json, '$.' || ?2), updated_at = datetime('now') WHERE act_id = ?1`).bind(row.act_id, k).run();
    /* The status stays 'sent' until the brief is done (compute() then sets 'submitted'), as the spec says. */
    else await env.DB.prepare(`UPDATE p_br_onboard SET answers_json = json_set(answers_json, '$.' || ?2, ?3), updated_at = datetime('now') WHERE act_id = ?1`).bind(row.act_id, k, v).run();
  }
  return { by };
}

/* Which Google Ads accounts the Mobius manager already reaches (null = could not tell). Swappable for the tests. */
let adsProbe = async env => { const { googleProbe } = await import('./google.js'); const p = await googleProbe(env); return p.ads?.ok ? (p.ads.customers || []) : null; };
export function useAdsProbe(fn) { adsProbe = fn; }
const hasConn = async (env, act, kind) => !!(await env.DB.prepare(`SELECT 1 FROM connections WHERE brand_id = ?1 AND kind = ?2`).bind(act, kind).first().catch(() => null));

/** The team's tick on a layer is what turns a value a CLIENT typed into a link: a client never attaches a store or an
 *  ad account by itself, since Mobius's own access could then read another business through Locus. */
async function linkTyped(env, row, key) {
  const act = row.act_id, inputs = (row.conn[key] || {}).team?.inputs || {};
  if (key === 'tw' && inputs.shop_url && !(await hasConn(env, act, 'triple_whale'))) {
    try { await setTripleWhale(env, act, inputs.shop_url); } catch (e) { throw err(400, e.message); }
  }
  if (key === 'google_ads' && inputs.customer_id && !(await hasConn(env, act, 'google_ads'))) {
    try { await connSet(env, act, 'google_ads', inputs.customer_id); } catch (e) { throw err(400, e.message); }
  }
  /* The collaborator request was approved: the store address is the brand's Triple Whale shop too (extras), when none. */
  if (key === 'shopify' && row.extras && inputs.shop_url && !(await hasConn(env, act, 'triple_whale'))) await setTripleWhale(env, act, inputs.shop_url).catch(e => console.log('onboard tw from shopify: ' + e.message));
}

/** The OLD public connect link (connect.js connectPost, connect.html?c=) for a brand set up through onboarding: a
 *  Triple Whale store or a Google Ads ID typed there is only STORED, exactly as on Get started, and the team's Confirm
 *  line (their tick, linkTyped) makes the link. Nothing is linked, requested or put in connectPending. Returns false for
 *  a brand with no checklist (every older client keeps the old link as it was). */
export async function storeTypedForTeam(env, act, key, value) {
  await ensureOnboard(env).catch(() => {});
  const row = await onbRow(env, act).catch(() => null);
  if (!row) return false;
  if (key === 'tw') {
    if (await hasConn(env, act, 'triple_whale')) throw err(409, 'Your Triple Whale store is already connected. Ask your team to change it.');
    await setOnb(env, act, 'connect_json', ['tw', 'team', 'inputs'], { shop_url: value, at: nowIso(), via: 'connect_link' });
  } else if (key === 'google_ads') {
    if (await hasConn(env, act, 'google_ads')) throw err(409, 'Google Ads is already connected. Ask your team to change it.');
    await setOnb(env, act, 'connect_json', ['google_ads', 'team', 'inputs'], { customer_id: value, at: nowIso(), confirm: 'connect_link' });
  } else return false;
  await dropS(env, `onbConnect:${act}`);
  await dropS(env, 'onbConnectAll');
  return true;
}

/** A Google Ads ID a CLIENT typed. The manager request goes only to an account the Mobius manager does NOT already
 *  reach, once per brand per ID, at most 3 IDs a brand; the client's Accept then links it (connect.js adsPendingCheck).
 *  An ID the manager already reaches, a failed check or test mode (mailTestTo): nothing is sent or linked, and the team
 *  gets "Confirm <Brand>'s Google Ads ID" on My day; their tick links it. */
async function clientGads(env, row, id, viaConnect) {
  const cj = row.conn.google_ads || {};
  const asked = Array.isArray(cj.team?.requests) ? cj.team.requests : [];
  if (cj.team?.inputs?.customer_id === id) return;
  if (asked.length >= 3 && !asked.includes(id)) throw err(429, 'We already have a few IDs from you. Your team will check and get in touch.');
  let confirm = null;
  if (await testRecipient(env)) confirm = 'test';
  else {
    const managed = await adsProbe(env).catch(() => null);
    if (!managed) confirm = 'failed';
    else if (managed.includes(id)) confirm = 'managed';
    else if (!asked.includes(id)) {
      try { await viaConnect({ value: id }); } catch { confirm = 'failed'; }
      const pend = safe(await getS(env, `connectPending:${row.act_id}`, null), {}) || {};
      if (!confirm && pend.google_ads?.error) confirm = 'failed';
    }
  }
  await setOnb(env, row.act_id, 'connect_json', ['google_ads', 'team', 'inputs'], { customer_id: id, at: nowIso(), ...(confirm ? { confirm } : {}) });
  await setOnb(env, row.act_id, 'connect_json', ['google_ads', 'team', 'requests'], [...new Set([...asked, id])]);
}

const CLIENT_SAVE_FAIL = 'We could not save that. Your team will check it.';
async function writeConnect(env, row, b, { team, deps }) {
  const key = String(b.platform || '');
  if (!PKEYS.includes(key)) throw err(400, 'Unknown platform.');
  if (key === 'tw' && !row.extras) throw err(400, 'Unknown platform.');
  const act = row.act_id;
  const cdeps = deps.connectDeps || {};
  /* fromOnboard: this route already decided what may be sent (clientGads), so the old link's store-only rule for
     checklist brands does not apply to it. */
  const viaConnect = async body => { if (!CONNECT_KEYS[key]) return null; const tok = await connectToken(env, act); return connectPost(env, tok, { key: CONNECT_KEYS[key], ...body }, { ...cdeps, tellTeam: null, fromOnboard: true }); };
  if (b.layer !== undefined) {
    if (!team) throw err(403, 'Your team ticks that one.');
    if (!['team', 'app'].includes(b.layer)) throw err(400, 'Say which tick: team or app.');
    if (b.ticked !== false && b.layer === 'team') await linkTyped(env, row, key);
    await setOnb(env, act, 'connect_json', [key, b.layer, 'ticked_at'], b.ticked === false ? undefined : nowIso());
    await setOnb(env, act, 'connect_json', [key, b.layer, 'ticked_by'], b.ticked === false ? undefined : (deps.who || 'team'));
  } else if (b.said !== undefined) {
    await setOnb(env, act, 'connect_json', [key, 'team', 'said_at'], b.said ? nowIso() : undefined);
    /* The event: the client says it is done, so Locus looks now (partner sweep, Google match). No timers. */
    if (b.said && ['meta', 'ga4', 'gsc', 'google_ads'].includes(key)) await viaConnect({ invited: true }).catch(e => console.log('onboard said: ' + e.message));
  } else if (b.skip !== undefined) {
    await setOnb(env, act, 'connect_json', [key, 'skip'], !!b.skip);
    await setOnb(env, act, 'connect_json', [key, 'skip_at'], b.skip ? nowIso() : undefined);
    await viaConnect({ skip: !!b.skip }).catch(() => {});
  } else if (b.inputs && typeof b.inputs === 'object') {
    const inp = b.inputs;
    if (!team && row.finished_at) throw err(409, 'Setup is finished. Ask your team to change this.');
    const cj = row.conn[key] || {};
    if (key === 'shopify') {
      const shop = shopOf(inp.shop_url);
      if (!SHOP_RE.test(shop)) throw err(400, 'That should end in .myshopify.com. Shopify shows it under Settings > Domains.');
      if (!team && cj.team?.ticked_at) throw err(409, 'Your team already has this one. Ask them to change it.');
      const code = String(inp.code || '').replace(/\s+/g, '').slice(0, 12);
      await setOnb(env, act, 'connect_json', [key, 'team', 'inputs'], { shop_url: shop, code, at: nowIso() });
      await env.DB.prepare(`UPDATE p_br_onboard SET answers_json = json_set(json_set(answers_json, '$.shopify_url', ?2), '$.shopify_code', ?3), updated_at = datetime('now') WHERE act_id = ?1`).bind(act, shop, code).run().catch(() => {});
      /* Only the team's own typing links Triple Whale at once; a client's store waits for the team's tick (linkTyped). */
      if (team && row.extras && !(await hasConn(env, act, 'triple_whale'))) await setTripleWhale(env, act, shop).catch(() => {});
    } else if (key === 'google_ads') {
      const id = String(inp.customer_id || '').replace(/\D/g, '');
      if (id.length !== 10) throw err(400, 'A Google Ads customer ID has 10 digits, like 123-456-7890.');
      if (team) {
        await viaConnect({ value: id }).catch(e => { throw err(400, e.message); });
        await setOnb(env, act, 'connect_json', [key, 'team', 'inputs'], { customer_id: id, at: nowIso() });
      } else {
        if (await hasConn(env, act, 'google_ads')) throw err(409, 'Google Ads is already connected. Ask your team to change it.');
        try { await clientGads(env, row, id, viaConnect); } catch (e) { throw e.status && e.status < 500 ? e : err(400, CLIENT_SAVE_FAIL); }
      }
    } else if (key === 'tw') {
      const shop = shopOf(inp.shop_url);
      if (!SHOP_RE.test(shop)) throw err(400, 'That should end in .myshopify.com. Shopify shows it under Settings > Domains.');
      if (team) {
        try { await setTripleWhale(env, act, shop); } catch (e) { throw err(400, e.message); }
      } else if (await hasConn(env, act, 'triple_whale')) throw err(409, 'Your Triple Whale store is already connected. Ask your team to change it.');
      await setOnb(env, act, 'connect_json', [key, 'team', 'inputs'], { shop_url: shop, at: nowIso() });
    } else if (key === 'email' && inp.key !== undefined) {
      const k = String(inp.key || '').trim();
      if (!k) throw err(400, 'Paste the key first.');
      /* The same function PUT /api/brand-links {klaviyo_key} uses: checked against Klaviyo, kept, never echoed. */
      try { await klaviyoStore(env, act, k); } catch (e) { throw err(400, team ? e.message : 'Klaviyo did not accept that key. Check it is a Private API Key with Full Access.'); }
      await setOnb(env, act, 'connect_json', [key, 'team', 'inputs'], { key_at: nowIso() });
    } else if (key === 'email' && inp.tool !== undefined) {
      const tool = String(inp.tool || '').replace(/[<>]/g, '').trim().slice(0, 60);
      await setOnb(env, act, 'connect_json', [key, 'tool'], tool || undefined);
    } else throw err(400, 'Nothing to save for this one: invite us, then press I did this.');
  } else throw err(400, 'Say what changed.');
  await dropS(env, `onbConnect:${act}`);
  await dropS(env, 'onbConnectAll');
}

/* Hand off limits: each hand off mail goes from Cole's own Gmail, so a client can never use it to mail strangers or
   burn the daily send quota. One mail per step per address in 20 hours, five a day per brand, none once the step or
   the whole setup is done. Logged in reminders_json.handoffs [{step, to, at}]. */
const HANDOFF_GAP = 20 * 3600e3, HANDOFF_DAY = 5;
const SENT_TEXT = 'We emailed them.';

/** A step changes hands: the person who held it before loses it from their one-job login (and the login itself when
 *  it held nothing else). A full login of the brand is never touched. */
function dropOldHolder(users, row, step, newEmail) {
  const raw = lower((row.steps[step] || {}).holder);
  /* The old holder's live login: a colleague who claimed the invite with another Google address is found too. */
  const prev = raw ? (liveLogin(users, raw, row.act_id) || raw) : '';
  if (!prev || prev === newEmail || !users[prev]) return null;
  const u = users[prev];
  if (!Array.isArray(u.onboard_only) || !u.onboard_only.includes(step)) return null;
  u.onboard_only = u.onboard_only.filter(x => x !== step);
  if (!u.onboard_only.length) {
    const others = (u.brands || []).filter(x => x !== row.act_id);
    if (others.length) { u.brands = others; delete u.onboard_only; } else delete users[prev];
  }
  return prev;
}

/* The hand off mail slot, taken BEFORE the mail goes, in one statement (parallel presses all read the same log, so a
   read-check-write let a burst through): the entry is appended only while this address has none for this step in 20
   hours and the brand has fewer than five in a day. Old entries (over 7 days) are dropped first, also in one
   statement. Returns the slot id, or null when refused. */
async function takeHandoffSlot(env, act, step, to) {
  const now = Date.now();
  await env.DB.prepare(`UPDATE p_onboard SET reminders_json = json_set(reminders_json, '$.handoffs',
      json((SELECT COALESCE(json_group_array(json(j.value)), '[]') FROM json_each(p_onboard.reminders_json, '$.handoffs') AS j WHERE json_extract(j.value, '$.at') >= ?2)))
    WHERE act_id = ?1 AND json_type(reminders_json, '$.handoffs') = 'array'`).bind(act, new Date(now - 7 * DAY).toISOString()).run().catch(() => {});
  const n = [...crypto.getRandomValues(new Uint8Array(6))].map(b => b.toString(16).padStart(2, '0')).join('');
  const entry = { step, to, at: new Date(now).toISOString(), n };
  const took = await env.DB.prepare(`UPDATE p_onboard SET reminders_json = json_insert(
      CASE WHEN json_type(reminders_json, '$.handoffs') = 'array' THEN reminders_json ELSE json_set(reminders_json, '$.handoffs', json('[]')) END,
      '$.handoffs[#]', json(?2)), updated_at = datetime('now')
    WHERE act_id = ?1
      AND (SELECT COUNT(*) FROM json_each(p_onboard.reminders_json, '$.handoffs') AS j WHERE json_extract(j.value, '$.at') > ?3) < ?4
      AND NOT EXISTS (SELECT 1 FROM json_each(p_onboard.reminders_json, '$.handoffs') AS j
        WHERE json_extract(j.value, '$.step') = ?5 AND json_extract(j.value, '$.to') = ?6 AND json_extract(j.value, '$.at') > ?7)
    RETURNING act_id`).bind(act, JSON.stringify(entry), new Date(now - DAY).toISOString(), HANDOFF_DAY, step, to, new Date(now - HANDOFF_GAP).toISOString()).first();
  return took ? n : null;
}
/** A slot whose mail never went is given back. */
async function giveBackHandoffSlot(env, act, n) {
  await env.DB.prepare(`UPDATE p_onboard SET reminders_json = json_set(reminders_json, '$.handoffs',
      json((SELECT COALESCE(json_group_array(json(j.value)), '[]') FROM json_each(p_onboard.reminders_json, '$.handoffs') AS j WHERE json_extract(j.value, '$.n') IS NOT ?2)))
    WHERE act_id = ?1 AND json_type(reminders_json, '$.handoffs') = 'array'`).bind(act, n).run().catch(() => {});
}

async function handoff(env, row, cs, b, brandName) {
  const step = String(b.step || '');
  if (!STEP_KEYS.includes(step)) throw err(400, 'Unknown step.');
  if (!shownSteps(row).includes(step)) throw err(400, 'Unknown step.');
  if (row.finished_at) throw err(409, 'Setup is finished. Nothing left to hand on.');
  if ((row.steps[step] || {}).done_at) throw err(409, 'That step is done.');
  const email = lower(b.email), name = String(b.name || '').replace(/[<>]/g, '').trim().slice(0, 80);
  if (!emailOk(email)) throw err(400, 'That email does not look right.');
  if (step === 'sign_pay') {
    /* Never emails anyone: the owner says yes first (approve-signer). */
    const role = ['signer', 'payer', 'both'].includes(b.role) ? b.role : 'both';
    await setOnb(env, row.act_id, 'steps_json', ['sign_pay', 'pending_signer'], { email, name, role, asked_at: nowIso(), by: cs.email });
    await setOnb(env, row.act_id, 'steps_json', ['sign_pay', 'signer_declined_at'], undefined);
    return { ok: true, pending: true, text: `We asked Mobius to send it to ${firstName(name || email)}.` };
  }
  const guests = ((await getS(env, 'allowedEmails', [])) || []).map(lower);
  if (email.endsWith('@' + DOMAIN) || email === lower(env.OWNER_EMAIL || OWNER) || guests.includes(email)) throw err(400, 'That is a Mobius address. Pick someone on your team.');
  const self = email === lower(cs.email);
  const users = await clientUsers(env);
  const now = Date.now();
  const log = Array.isArray(row.rem.handoffs) ? row.rem.handoffs.filter(x => x && now - Date.parse(x.at) < 7 * DAY) : [];
  const setHolder = async (extra = {}) => {
    await setOnb(env, row.act_id, 'steps_json', [step, 'holder'], email);
    await setOnb(env, row.act_id, 'steps_json', [step, 'holder_name'], self ? (users[email]?.name || name || '') : (name || ''));
    await setOnb(env, row.act_id, 'steps_json', [step, 'handed'], !self);
    await setOnb(env, row.act_id, 'steps_json', [step, 'handed_at'], self ? undefined : nowIso());
    await setOnb(env, row.act_id, 'steps_json', [step, 'handed_by'], self ? undefined : cs.email);
    await setOnb(env, row.act_id, 'steps_json', [step, 'handoff_blocked'], extra.blocked || undefined);
  };
  /* Only the logins this press changed are written, each by its own key (putClientUser), so a login another request
     made at the same moment is never dropped by a whole-blob write from an older copy. */
  const writeUsers = async keys => { for (const k of [...new Set(keys.filter(Boolean))]) await putClientUser(env, k, users[k] || null); };
  if (self) {
    await writeUsers([dropOldHolder(users, row, step, email)]);
    await setHolder();
    return { ok: true, step, holder: { email, name: users[email]?.name || '' } };
  }
  if (log.some(x => x.step === step && x.to === email && now - Date.parse(x.at) < HANDOFF_GAP)) throw err(409, 'We emailed them already today. They can use the link in that email.');
  if (log.filter(x => now - Date.parse(x.at) < DAY).length >= HANDOFF_DAY) throw err(429, 'That is a lot of hand offs for one day. Try again tomorrow, or ask your team.');
  const cur = users[email];
  /* An address that already has a login for ANOTHER brand: nothing is emailed and no login changes; the client gets the
     same answer as any hand off (so nothing about other brands is told) and the owner decides on My day. The step has
     still changed hands, so the colleague who held it before loses it. */
  if (cur && Array.isArray(cur.brands) && cur.brands.some(x => x !== row.act_id)) {
    await writeUsers([dropOldHolder(users, row, step, email)]);
    await setHolder({ blocked: { email, name, at: nowIso(), by: cs.email, by_name: users[lower(cs.email)]?.name || cs.name || '' } });
    return { ok: true, step, holder: { email, name }, text: SENT_TEXT };
  }
  /* The mail slot is taken before anything changes or goes; a burst of presses gets no more than the limits allow. */
  const slot = await takeHandoffSlot(env, row.act_id, step, email);
  if (!slot) {
    const fresh = await onbRow(env, row.act_id);
    const l2 = Array.isArray(fresh?.rem?.handoffs) ? fresh.rem.handoffs : [];
    if (l2.some(x => x && x.step === step && x.to === email && Date.now() - Date.parse(x.at) < HANDOFF_GAP)) throw err(409, 'We emailed them already today. They can use the link in that email.');
    throw err(429, 'That is a lot of hand offs for one day. Try again tomorrow, or ask your team.');
  }
  const full = cur && Array.isArray(cur.brands) && cur.brands.includes(row.act_id) && !(Array.isArray(cur.onboard_only) && cur.onboard_only.length);
  const dropped = dropOldHolder(users, row, step, email);
  users[email] = full ? { ...cur, name: cur.name || name || null } : {
    ...(cur || { invited_at: nowIso() }), brands: [row.act_id], name: cur?.name || name || null, invited_by: cs.email, handed_by: cs.email,
    onboard_only: [...new Set([...((cur && cur.onboard_only) || []), step])].filter(x => HANDABLE.includes(x)),
  };
  await writeUsers([dropped, email]);
  await setHolder();
  const link = await ensureInvite(env, email, LOCUS_V5);
  const fromName = users[lower(cs.email)]?.name || cs.name || cs.email;
  const t = handoffText({ first: firstName(name), fromName, brand: brandName, step });
  try { await sendMail(env, email, t.subject, t.body.split(LINK_PLACEHOLDER).join(link)); }
  catch (e) { await giveBackHandoffSlot(env, row.act_id, slot); throw err(502, 'Could not send the email just now. Try again in a minute.'); }
  return { ok: true, step, holder: { email, name }, text: SENT_TEXT };
}

/* ------------------------------------------------------------------------------------------ */
/*  REMIND THEM (spec 2.6)                                                                     */
/* ------------------------------------------------------------------------------------------ */
async function remind(env, row, step, { owner, who }) {
  if (!STEP_KEYS.includes(step)) throw err(400, 'Unknown step.');
  if (step === 'sign_pay' && !owner) throw err(403, 'Only the owner reminds about the agreement and the invoice.');
  const last = (row.rem.manual || []).filter(x => x.step === step).map(x => Date.parse(x.at)).sort((a, b) => b - a)[0];
  if (last && Date.now() - last < 20 * 3600e3) { const h = Math.max(1, Math.round((Date.now() - last) / 3600e3)); throw err(409, `Reminded ${h} hour${h === 1 ? '' : 's'} ago`); }
  const g = await gatherOne(env, row);
  const c = await compute(env, g);
  let to, text;
  if (step === 'sign_pay') {
    if (!g.run) throw err(400, 'No setup run for this brand.');
    const did = [];
    if (c.sp.agreement.used && c.sp.agreement.status === 'sent') did.push(await sendReminder(env, g.run, 'agreement'));
    if (c.sp.invoice.used && c.sp.invoice.status === 'open') did.push(await sendReminder(env, g.run, 'invoice'));
    if (!did.length) throw err(409, 'Nothing to remind: nothing is waiting to be signed or paid.');
    to = c.sp.agreement.signer || g.run.contact_email; text = did.join(' ');
  } else {
    if (c.now[step]) throw err(409, 'That step is done.');
    if (!c.steps.includes(step)) throw err(400, 'Unknown step.');
    if (!welcomeAt(g)) throw err(409, 'The welcome email has not gone yet. Send it first.');
    const s = row.steps[step] || {};
    const held = lower(s.holder || g.run?.contact_email);
    if (!emailOk(held)) throw err(400, 'No email to remind.');
    const users = g.users;
    /* The live login: the invited address, or the Google address that claimed its invite. */
    to = liveLogin(users, held, row.act_id);
    if (!to) throw err(409, `${maskEmail(held)} has no login for this brand any more.`);
    const link = await linkFor(env, to, g.brand.slug);
    const m = reminderText({ first: firstName(s.holder_name || users[to]?.name || g.run?.contact_name), brand: g.brand.name, items: openItems(c, [step]), link });
    await sendMail(env, to, m.subject, m.body);
    text = `Reminder sent to ${maskEmail(to)}.`;
  }
  await setOnb(env, row.act_id, 'reminders_json', ['manual'], [...(row.rem.manual || []).slice(-19), { step, at: nowIso(), by: who || 'team', to: maskEmail(to) }]);
  return { ok: true, to: maskEmail(to), text };
}

/* ------------------------------------------------------------------------------------------ */
/*  THE HOURLY TICK (spec 5)                                                                   */
/* ------------------------------------------------------------------------------------------ */
export async function onboardTick(env, d = {}) {
  await ensureOnboard(env);
  const can = n => (typeof d.canAfford === 'function' ? d.canAfford(n) : true);
  const hour = typeof d.centralHour === 'function' ? d.centralHour() : 12;
  const out = { reminded: [], deferred: [], read: null };
  const rows = ((await env.DB.prepare(`SELECT * FROM p_onboard WHERE finished_at IS NULL AND sent_at IS NOT NULL ORDER BY sent_at`).all().catch(() => ({ results: [] }))).results) || [];
  const off = (await settingStr(env, 'onboardReminders')) === 'off';
  /* Weekdays only (Central): a nudge on a Saturday reads as a bot. */
  const ymd = typeof d.centralDate === 'function' ? d.centralDate() : centralYmd();
  const wd = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  const weekend = wd === 0 || wd === 6;
  if (!off && !weekend && hour >= 9 && hour < 17) {
    for (const raw of rows) {
      const row = { ...raw, steps: safe(raw.steps_json, {}), conn: safe(raw.connect_json, {}), rem: safe(raw.reminders_json, {}), services: safe(raw.services_json, []) };
      /* Cheap first look: the welcome can never go before Send, so under 3 days since Send is under 3 since the welcome. */
      if (daysSince(row.sent_at) < 3 || (row.rem.d3 && row.rem.d7)) continue;
      if (!can(60)) { out.deferred.push(row.act_id); break; }
      const g = await gatherOne(env, row).catch(() => null);
      /* No run (removed) or no welcome yet (unticked at Send, or it failed): the client has never heard from us, so
         nothing is sent and nothing is stamped. Day 0 is the welcome email, not the Send press. */
      if (!g || !g.run) continue;
      const wAt = welcomeAt(g);
      if (!wAt) continue;
      const day = daysSince(wAt);
      const which = day >= 7 && !row.rem.d7 ? 'd7' : day >= 3 && !row.rem.d3 ? 'd3' : null;
      if (!which) continue;
      const c = await compute(env, g);
      /* One email per holder of an open connect / brief / assets step who still has a login for this brand. Never
         sign and pay. */
      const users = g.users;
      const by = {};
      for (const k of HANDABLE) {
        if (!remindable(g, c, k)) continue;
        /* Mailed to the live login (a client who signed up with another Google address is still reached). */
        const h = liveLogin(users, row.steps[k]?.holder || g.run?.contact_email, row.act_id);
        if (!h) continue;
        (by[h] ||= { name: row.steps[k]?.holder_name || '', steps: [] }).steps.push(k);
      }
      /* A step still open that nobody could be mailed about: nothing is stamped, so the reminder still goes once
         the login is back (or the step is handed to someone who has one). */
      const open = HANDABLE.filter(k => c.steps.includes(k) && !c.now[k]);
      let sent = 0, tried = 0;
      for (const [to, v] of Object.entries(by)) {
        const items = openItems(c, v.steps);
        if (!items.length) continue;
        tried++;
        const m = reminderText({ first: firstName(v.name || users[to]?.name || g.run?.contact_name), brand: g.brand.name, items, link: await linkFor(env, to, g.brand.slug), late: which === 'd7' });
        try { await sendMail(env, to, m.subject, m.body); sent++; } catch (e) { console.log('onboard reminder: ' + e.message); }
      }
      /* Stamped right after the sends (the canAfford check before the brand is what stops a kill in between). Every
         send failed, or a step is open and nobody was mailed = nothing stamped, a later hour tries again. Nothing open
         = stamped. */
      if ((tried && !sent) || (open.length && !sent)) continue;
      const at = nowIso();
      await setOnb(env, row.act_id, 'reminders_json', [which], at);
      if (which === 'd7' && !row.rem.d3) await setOnb(env, row.act_id, 'reminders_json', ['d3'], at);
      out.reminded.push({ act: row.act_id, which, sent });
    }
  }
  /* The website read: one brand a tick, only with money left over. */
  if (env.ANTHROPIC_API_KEY && can(60)) {
    for (const raw of rows) {
      const ob = await env.DB.prepare(`SELECT prefill_json FROM p_br_onboard WHERE act_id = ?1`).bind(raw.act_id).first().catch(() => null);
      const pre = safe(ob?.prefill_json, {});
      if (!ob || pre._read_at || !pre.website) continue;
      try { const r = await prefillNow(env, raw.act_id); out.read = { act: raw.act_id, n: r.n }; }
      catch (e) {
        await env.DB.prepare(`UPDATE p_br_onboard SET prefill_json = json_set(json_set(prefill_json, '$._read_at', ?2), '$._read_error', ?3) WHERE act_id = ?1`).bind(raw.act_id, nowIso(), String(e.message).slice(0, 200)).run().catch(() => {});
        out.read = { act: raw.act_id, error: e.message };
      }
      break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/*  ROUTES                                                                                     */
/* ------------------------------------------------------------------------------------------ */
const ONB_PATHS = /^\/api\/onboard(\/[a-z-]+)?$|^\/api\/brand\/assets-link$/;
export async function handleOnboard(request, env, ctx, path, json, deps) {
  if (!ONB_PATHS.test(path)) return null;
  const url = new URL(request.url);
  const m = request.method;
  const cs = deps.clientScope(request);
  const who = cs ? cs.email : await deps.sessionEmail(env, request).catch(() => null);
  const admin = cs ? false : await deps.isAdmin(request, env);
  if (!cs && !admin) return json({ error: 'unauthorized' }, 401);
  const owner = admin && (!who || lower(who) === lower(env.OWNER_EMAIL || OWNER));
  const team = admin;
  const body = m === 'GET' ? {} : await request.json().catch(() => ({}));
  const only = cs ? (cs.onlyOnboard || null) : null;
  try {
    await ensureOnboard(env);
    /* The brand: a client's own (brandguard checked it; checked again here), or one the teammate may see. */
    const actOf = async () => {
      const raw = String(url.searchParams.get('act') || body.act || '');
      if (cs) { const bid = cs.brandOf(raw); if (!bid) throw err(403, 'You do not have access to that brand.'); return bid; }
      if (!/^brand_[a-z0-9_]+$/.test(raw)) throw err(400, 'Pick a brand.');
      const lim = await brandsFor(env, who).catch(() => null);
      if (lim && !lim.has(raw)) throw err(403, 'You do not have access to that brand.');
      return raw;
    };
    const needOwner = () => { if (!owner) throw err(403, 'Only the owner sends.'); };
    const needTeam = () => { if (!team) throw err(403, 'That is for your Mobius team.'); };
    const stepOk = s => { if (only && !only.includes(s)) throw err(403, 'Your login is for one setup job.'); };
    const rowOf = async act => { const r = await onbRow(env, act); if (!r) throw err(404, 'This brand has no setup checklist.'); return r; };

    /* ---- the owner's New client ---- */
    if (path === '/api/onboard/options' && m === 'GET') {
      needTeam();
      const extras = await extrasOn(env);
      const people = (await roster(env).catch(() => [])).map(p => ({ name: p.name, email: lower(p.email), role: p.role || '' }));
      return json({ extras, owner, team: people, services: extras ? SERVICES : SERVICES.filter(s => s.key !== 'creative' && s.key !== 'other'), measures: MEASURES,
        defaults: { start_date: centralYmd(), send: { welcome: true, agreement: extras, invoice: extras }, goal_measure: 'cpa' },
        stripe: !!String(env.STRIPE_SECRET_KEY || '').trim(), frame: true, approves_ads: (await settingStr(env, 'clientApprovesAds')) !== 'off' });
    }
    if (path === '/api/onboard/preview' && m === 'POST') {
      needOwner();
      const { out, f } = await preview(env, body);
      if (f.name && await nameTaken(env, f.name)) return json({ error: `${f.name} is already in Locus. Open it from the Clients list.` }, 409);
      return json(out);
    }
    if (path === '/api/onboard/send' && m === 'POST') {
      needOwner();
      try { return json(await doSend(env, body, who, deps, request)); }
      catch (e) { return json({ error: e.message, ...(e.problems ? { problems: e.problems } : {}) }, e.status || 500); }
    }
    if (path === '/api/onboard/send-part' && m === 'POST') {
      needOwner();
      if (body.confirm !== true) throw err(400, 'Press Send on the confirm sheet first.');
      const act = await actOf(); const row = await rowOf(act);
      const run = row.run_id ? await getRun(env, row.run_id) : null;
      if (!run) throw err(404, 'No setup run for this brand.');
      let result;
      if (body.part === 'welcome') {
        result = await sendWelcome(env, row, run, body.welcome || {}, who);
        if (result.status === 'done' && row.extras && run.slack_client) await runStep(env, run.id, 'slackInvite', {}).catch(() => {});
      } else if (body.part === 'agreement') {
        if (!row.extras) throw err(403, 'This account does not use agreements.');
        const f = formOf({ name: run.name, contact_name: run.contact_name, contact_email: run.contact_email, retainer: run.retainer, start_date: run.start_date, ...body }, true);
        const { vars, blanks } = agreementVars(f, body.agreement?.vars);
        if (blanks.length) throw err(400, `The agreement has empty blanks: ${blanks.join(', ').replace(/_/g, ' ')}.`);
        result = fromStep(await runStep(env, run.id, 'contract', { approved: true, vars: { ...vars, ...(f.signer_email ? { sign_email: f.signer_email } : {}) }, ip: request.headers.get('CF-Connecting-IP') || '' }));
      } else if (body.part === 'invoice') {
        if (!row.extras) throw err(403, 'This account does not use invoices.');
        result = fromStep(await runStep(env, run.id, 'stripe', { approved: true }));
      } else throw err(400, 'Say which part: welcome, agreement or invoice.');
      /* An agreement or invoice sent after the first Send (also for a client set up with none): the step is on now. */
      if (result.status !== 'failed' && (body.part === 'agreement' || body.part === 'invoice')) {
        await env.DB.prepare(`UPDATE p_onboard SET sign_pay = 1, ${body.part === 'agreement' ? 'uses_agreement' : 'uses_invoice'} = 1, updated_at = datetime('now') WHERE act_id = ?1`).bind(act).run();
      }
      return json({ ok: result.status !== 'failed', result });
    }
    if (path === '/api/onboard/approve-signer' && m === 'POST') {
      needOwner();
      const act = await actOf(); const row = await rowOf(act);
      const p = (row.steps.sign_pay || {}).pending_signer;
      if (!p) throw err(404, 'Nobody is waiting on that.');
      const run = row.run_id ? await getRun(env, row.run_id) : null;
      if (body.yes !== true) {
        await setOnb(env, act, 'steps_json', ['sign_pay', 'pending_signer'], undefined);
        await setOnb(env, act, 'steps_json', ['sign_pay', 'signer_declined_at'], nowIso());
        return json({ ok: true, sent_to: null });
      }
      const sent = [];
      if (p.role !== 'payer' && row.uses_agreement) { await resendSigningLink(env, row.token, p.email, p.name); sent.push('agreement'); }
      if (p.role !== 'signer' && row.uses_invoice) {
        const url2 = safe(run?.steps_json, {}).stripe?.url;
        if (url2) {
          await sendMail(env, p.email, `Your invoice from Mobius Digital`, `Hi ${firstName(p.name)},\n\n${run?.contact_name ? firstName(run.contact_name) : 'Your team'} asked us to send you the first invoice for ${run?.name || 'your brand'}. Pay here:\n${url2}\n\nWhen it is paid the card is saved and the retainer bills itself on the same day each month after that.\n\nThanks,`);
          await setStep(env, run.id, 'payer', p.email);
          sent.push('invoice');
        }
      }
      await setOnb(env, act, 'steps_json', ['sign_pay', 'pending_signer'], undefined);
      await setOnb(env, act, 'steps_json', ['sign_pay', 'approved_signer'], { ...p, at: nowIso(), sent });
      return json({ ok: true, sent_to: maskEmail(p.email), sent });
    }
    if (path === '/api/onboard/billing' && m === 'POST') {
      needOwner();
      const act = await actOf(); const row = await rowOf(act);
      const run = row.run_id ? await getRun(env, row.run_id) : null;
      if (!run) throw err(404, 'No setup run for this brand.');
      return json(await releaseHeld(env, run, String(body.release || '')).catch(e => { throw err(400, e.message); }));
    }
    if (path === '/api/onboard/reopen' && m === 'POST') {
      needOwner();
      const act = await actOf(); await rowOf(act);
      await env.DB.prepare(`UPDATE p_onboard SET finished_at = NULL, finished_by = NULL, updated_at = datetime('now') WHERE act_id = ?1`).bind(act).run();
      forgetHeld();
      return json({ ok: true });
    }

    /* ---- the team: list, finish, budget, remind ---- */
    if (path === '/api/onboard/list' && m === 'GET') {
      needTeam();
      const lim = await brandsFor(env, who).catch(() => null);
      /* Open setups, plus the ones finished in the last 30 days (each row costs a full gather, so the list must not grow
         with every client ever onboarded). */
      const rows = ((await env.DB.prepare(`SELECT * FROM p_onboard WHERE finished_at IS NULL OR finished_at >= ?1 ORDER BY sent_at DESC`).bind(new Date(Date.now() - 30 * DAY).toISOString()).all()).results || []).filter(r => !lim || lim.has(r.act_id));
      const out = [], all = await liveAll(env);
      for (const raw of rows) {
        const row = { ...raw, steps: safe(raw.steps_json, {}), conn: safe(raw.connect_json, {}), rem: safe(raw.reminders_json, {}), services: safe(raw.services_json, []) };
        const g = await gatherOne(env, row, { all });
        const c = await compute(env, g);
        const sp = c.sp;
        const parts = [];
        if (row.sign_pay && sp.agreement.used) parts.push(sp.agreement.status === 'signed' ? 'Signed.' : 'Not signed.');
        if (row.sign_pay && sp.invoice.used) parts.push(sp.invoice.status === 'paid' ? 'Paid.' : 'Not paid.');
        parts.push(`${c.connect.done} of ${c.connect.total} connected.`);
        if (c.steps.includes('brief')) parts.push(`Brief ${c.brief.answered} of ${c.brief.total}.`);
        if (c.steps.includes('assets')) parts.push(c.now.assets ? 'Assets linked.' : 'No assets link yet.');
        if (row.finished_at) parts.push('Finished.');
        const clientLeft = c.steps.some(k => !(row.steps[k] || {}).done_at && !(k === 'connect' && c.now.connect) && !(k === 'sign_pay' && sp.agreement.used && sp.agreement.status === 'not_sent'));
        out.push({ act: row.act_id, slug: v5Slug(g.brand.slug), name: g.brand.name, contact: g.run?.contact_name || g.run?.contact_email || '', sent_at: row.sent_at, days: daysSince(row.sent_at),
          finished_at: row.finished_at || null, gated: gatedOf(row),
          sign_pay: { used: !!row.sign_pay, signed: sp.agreement.status === 'signed', paid: sp.invoice.status === 'paid' },
          connect: { done: c.connect.done, total: c.connect.total, waiting: c.connect.waiting }, brief: { answered: c.brief.answered, total: c.brief.total }, assets: { linked: c.now.assets },
          waiting_on: row.finished_at ? null : clientLeft ? 'client' : 'us', line: parts.join(' ') });
      }
      return json({ clients: out });
    }
    if (path === '/api/onboard/finish' && m === 'POST') {
      needTeam();
      const act = await actOf(); const row = await rowOf(act);
      const at = nowIso();
      for (const k of shownSteps(row)) if (!(row.steps[k] || {}).done_at) { await setOnb(env, act, 'steps_json', [k, 'done_at'], at); await setOnb(env, act, 'steps_json', [k, 'done_by'], who || 'team'); }
      await env.DB.prepare(`UPDATE p_onboard SET finished_at = ?2, finished_by = ?3, updated_at = datetime('now') WHERE act_id = ?1`).bind(act, at, who || 'team').run();
      return json({ ok: true });
    }
    if (path === '/api/onboard/budget' && m === 'PUT') {
      needTeam();
      const act = await actOf(); await rowOf(act);
      const amount = body.amount === null || body.amount === '' || body.amount === undefined ? null : Number(body.amount);
      if (amount != null && !(Number.isFinite(amount) && amount >= 0)) throw err(400, 'Type the budget as a number.');
      await env.DB.prepare(`UPDATE p_onboard SET ad_budget = ?2, budget_open = ?3, updated_at = datetime('now') WHERE act_id = ?1`).bind(act, amount, body.open ? 1 : 0).run();
      if (amount != null) await env.DB.prepare(`UPDATE brands SET monthly_budget = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(act, amount).run().catch(() => {});
      return json({ ok: true });
    }
    if (path === '/api/onboard/remind' && m === 'POST') {
      needTeam();
      const act = await actOf(); const row = await rowOf(act);
      return json(await remind(env, row, String(body.step || ''), { owner, who }));
    }

    /* ---- one client's whole state (team or the client of that brand) ---- */
    if (path === '/api/onboard' && m === 'GET') {
      const act = await actOf(); const row = await rowOf(act);
      const st = await stateFor(env, row, { viewer: cs ? 'client' : 'team', only, viewerEmail: cs ? cs.email : null, owner });
      return json(st);
    }
    if (path === '/api/onboard/brief' && m === 'PUT') {
      const act = await actOf(); const row = await rowOf(act);
      stepOk('brief');
      await writeBrief(env, row, body.answers, who);
      const fresh = await stateFor(env, await rowOf(act), { viewer: cs ? 'client' : 'team', only, viewerEmail: cs ? cs.email : null, owner });
      return json({ ok: true, brief: fresh.brief, gated: fresh.gated });
    }
    if (path === '/api/onboard/connect' && m === 'PUT') {
      const act = await actOf(); const row = await rowOf(act);
      stepOk('connect');
      await writeConnect(env, row, body, { team: team && !cs, deps: { ...deps, who } });
      const fresh = await stateFor(env, await rowOf(act), { viewer: cs ? 'client' : 'team', only, viewerEmail: cs ? cs.email : null, owner });
      return json({ ok: true, connect: fresh.connect, gated: fresh.gated });
    }
    if (path === '/api/onboard/handoff' && m === 'POST') {
      if (!cs) throw err(403, 'The client hands a step to a colleague from their own login.');
      if (only) throw err(403, 'Your login is for one setup job.');
      const act = await actOf(); const row = await rowOf(act);
      const brand = await env.DB.prepare(`SELECT name FROM brands WHERE id = ?1`).bind(act).first().catch(() => null);
      return json(await handoff(env, row, cs, body, brand?.name || 'your brand'));
    }
    if (path === '/api/brand/assets-link') {
      const act = await actOf();
      if (m === 'GET') { stepOk('assets'); return json(await assetsLink(env, act)); }
      if (m === 'PUT') {
        stepOk('assets');
        const r = await setAssetsLink(env, act, body.url, body.label, who);
        const row = await onbRow(env, act);
        if (row) await compute(env, await gatherOne(env, row)).catch(() => {});
        return json({ ok: true, ...r });
      }
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status || 500); }
}

export const _test = { shownQuestions, briefState, layersFor, connectState, welcomeText, reminderText, handoffText, agreementVars, formOf, lineFor, myWorkItem, kindOf };
