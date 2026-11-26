/* The one place for names, storage keys and where the workers live.
   THE PRODUCT NAME IS TYPED ON THE NEXT LINE AND NOWHERE ELSE. Change it there and every screen, tab
   title, button and message follows: the shell, the router and every page import APP_NAME or AI_NAME.
   Only comments and the names of code things (oldLocus(), OLD_LOCUS) still spell the old word. */

export const APP_NAME = 'Locus';
export const APP_WORD = APP_NAME.toLowerCase();      // the wordmark beside the mark
export const AI_NAME = APP_NAME + ' AI';
/* The agency. This is the ONLY place the name is typed; every screen, menu group and file reads it from here.
   (The storage keys and worker addresses below carry the same word because the live app and the
   deployed workers are named that way. They are addresses, not copy, and are derived from ORG_KEY.) */
export const ORG_NAME = 'Mobius Digital';
export const ORG_SHORT = ORG_NAME.split(' ')[0];                       // the menu group for the agency's own pages
/* The agency owner's first name, for the few client lines that name the person they talk to ("Tell Cole").
   A server answer that carries owner_first wins over this. */
export const OWNER_FIRST = 'Cole';
const ORG_KEY = ORG_SHORT.toLowerCase();                               // the prefix the live app uses for its keys
const ORG_HOST = ORG_NAME.toLowerCase().replace(/\s+/g, '-');           // the workers.dev account name

/* The live app's own keys (profit/index.html, const LS and keepSession). Same origin, so a
   person signed in to the live app is signed in here. Do not rename these. */
export const LS = {
  tok: 'pf_token',                 // the session token for this app
  shared: ORG_KEY + '_session',        // the shared sign-in every tool of the agency reads
  sharedExp: ORG_KEY + '_session_exp',
  email: ORG_KEY + '_session_email',
  role: ORG_KEY + '_session_role',     // 'client' or absent
  url: 'pf_worker',                // override for the profit worker (localhost only)
  ah: 'pf_ah',                     // override for the account-health worker (localhost only)
  act: 'pf_act',                   // the brand last opened in the live app (read only here)
};

/* Keys that belong to the new shell only. */
export const LS5 = {
  brand: 'lx5_brand',
  view: 'lx5_view',
  range: 'lx5_range',
  last: 'lx5_last',                // the last route, so opening the app lands where you left
  set: 'lx5_set',                  // the per person settings store (data.js setting / saveSetting), one JSON object per user
  asClient: 'lx5_as_client',       // "See as client" is on (sessionStorage: it ends with the browser tab)
  aiCard: 'lx5_ai_card',           // the card a link from a connected AI opened (sessionStorage, read once by profile/ai-cards)
  engine: 'lx5_engine',            // which engine answers in this browser: old, new or compare (engine.js)
  engineMiss: 'lx5_engine_miss',   // the calls the new engine got wrong or failed, kept for the compare page
  features: 'lx5_features',        // the last agency feature switches (GET /api/notices features), so the menu draws right at once
};

export const DEFAULT_PROFIT_URL = `https://${ORG_KEY}-profit.${ORG_HOST}.workers.dev`;
export const DEFAULT_AH_URL = `https://${ORG_KEY}-account-health.${ORG_HOST}.workers.dev`;
/* The new engine (engine/worker in the repo). One worker that answers both old workers' paths:
   <engine>/pw/api/... and <engine>/ah/api/... The name is the worker's own, an address and not copy. */
export const ENGINE_URL = `https://locus-engine.${ORG_HOST}.workers.dev`;
/* Which engine answers when a browser has made no choice of its own: 'old', 'new' or 'compare'.
   'new' = the new engine answers what it has its own code for. Any read it fails or does not answer in
   time is asked of the old engine (engine.js), and a write is never sent twice. The ways back, each one line:
     this browser   Agency > Engine > This browser > Old engine (or localStorage lx5_engine = 'old')
     everyone now   Agency > Engine > Everyone > Send everything back (the engine's own flag, no deploy)
     everyone       set this line back to 'old' */
export const ENGINE_DEFAULT = 'new';

const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
/* A developer's own machine and nothing else: localhost, 127.0.0.1, [::1] or a name ending in .localhost. */
const isLocal = () => /^(localhost|127\.0\.0\.1|\[::1\]|::1|[a-z0-9.-]+\.localhost)$/i.test(location.hostname);
/* A worker override: ?worker= or ?ah= in the address, or the pf_worker / pf_ah keys. Read ONLY on localhost.
   On a live host both are ignored, so a stray key or a crafted link can never point a signed in
   person's token at another server. It must also be a plain http(s) address. */
function override(param, key) {
  if (!isLocal()) return '';
  let v = ''; try { v = new URLSearchParams(location.search).get(param) || ''; } catch {}
  v = v || get(key) || '';
  return /^https?:\/\/\S+$/i.test(v) ? v : '';
}

/** Where the workers live: the defaults, except on localhost where a developer may point at their own. */
export function workers() {
  return {
    profit: (override('worker', LS.url) || DEFAULT_PROFIT_URL).replace(/\/+$/, ''),
    ah: (override('ah', LS.ah) || DEFAULT_AH_URL).replace(/\/+$/, ''),
    engine: (override('engine', 'pf_engine') || ENGINE_URL).replace(/\/+$/, ''),
  };
}

/** The stored session token, or '' when nobody is signed in. */
export function token() {
  const own = get(LS.tok);
  if (own) return own;
  const t = get(LS.shared);
  const exp = +get(LS.sharedExp) || 0;
  return t && (exp === 0 || exp > Date.now() + 60e3) ? t : '';
}

export const QS = new URLSearchParams(location.search);
/** Sample mode: every page draws from fixture files and no API is called. */
export const SAMPLE = QS.get('sample') === '1';

/* Old Locus is the live app one folder up. */
export const OLD_LOCUS = '../';

/* ---- Sign in. The new app signs people in on its own page (pages/_signin.js). ---- */
/* Google's sign in client for this site. Public by design: the same id the live pages use. */
export const GOOGLE_CLIENT_ID = '1095210859237-eqn8nsr9p3mcui7cuq17l3jas4dgpl8a.apps.googleusercontent.com';
export const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
/* Only if Google's button cannot load here: the old Google page, which sends the person straight back
   to the address in next= (a path on this site, never another site). */
export const googleHopUrl = back => '../../hq/?next=' + encodeURIComponent(back);
/* An emailed sign in link works once, for this many minutes (the worker's own rule). */
export const SIGNIN_LINK_MIN = 20;
export const OLD_UNTIL = 'to Dec 15';

/** The old Locus link for one page: ../?open=<old page id>&act=<brand id or all>. */
export function legacyUrl(openId, brandId) {
  if (!openId) return null;
  return OLD_LOCUS + '?open=' + encodeURIComponent(openId) + '&act=' + encodeURIComponent(brandId || 'all');
}
