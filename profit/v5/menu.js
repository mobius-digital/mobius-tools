/* The three menus as data. Source: game plan round 8, section 2 (the final menu).
   The side menu shows only the main lines. A line's sub pages are tabs across the top of its page.

   line  = { id, label, icon, who, tabs, note?, count?, foot?, top?, gap? }
   tab   = { id, label, team?, legacy, hidden? }   hidden: a working route that is not drawn as a tab
   who   = 'all' (team and client), 'team', or 'owner' (the owner alone)
   legacy = the old Locus page id (opens ../?open=<legacy>&act=<brand>), or null when there is none.
   A line with no sub pages has one tab with id 'index'.
   The page file for a route is always pages/<line id>/<tab id>.js */

import { AI_NAME, ORG_SHORT } from './config.js';
import { tabsFor, arrange } from './workshop.js';

const t = (id, label, legacy = null, team = false) => ({ id, label, legacy, team });
const one = (legacy = null) => [t('index', '', legacy)];
/** A route that works but is not drawn as a tab (reached from a link on another page). */
const hide = tab => ({ ...tab, hidden: true });
/** The tabs drawn across the top of a line's page. */
export const shownTabs = (line, role) => tabsFor(line, role).filter(x => !x.hidden && (role !== 'client' || !x.team));

/* Automations is one line in BOTH side menus (team only). In a brand view its pages show that brand's rows,
   in the agency view every brand's. viewOf() answers null for a line that sits in both, so the view you are in is kept. */
const AUTOMATIONS = { group: 'Automations', lines: [
  { id: 'automations', label: 'Automations', icon: 'bolt', who: 'team', tabs: [
    t('running', 'Running'), t('templates', 'Templates'), t('people', 'Who does what'), t('log', 'Run log')] },
] };

/* ---------- brand view ---------- */
export const BRAND_MENU = [
  { group: null, lines: [
    { id: 'home', label: 'Home', icon: 'home', who: 'all', tabs: one('overview') },
  ] },
  { group: 'Business', lines: [
    { id: 'month', label: 'This month', icon: 'month', who: 'all', tabs: [
      t('pace', 'Pace', 'month'), t('weeks', 'Week by week'), t('profit', 'Profit', 'profit'), t('plan', 'Plan', 'plan')] },
    { id: 'funnel', label: 'Full funnel', icon: 'funnel', who: 'all', tabs: [
      t('whole', 'Whole funnel'), t('website-steps', 'Website steps', 'website'), t('path', 'Path to purchase')] },
    { id: 'customers', label: 'Customers', icon: 'customers', who: 'all', tabs: [
      t('snapshot', 'Snapshot', 'customers'), t('ltv', 'LTV', 'customers'), t('repeat', 'Repeat orders', 'customers'), t('buy-next', 'What they buy next')] },
    { id: 'sales', label: 'Sales', icon: 'sales', who: 'all', tabs: [
      t('by-day', 'By day', 'store'), t('products', 'Products', 'stock'), t('inventory', 'Inventory', 'stock')] },
    { id: 'website', label: 'Website', icon: 'website', who: 'all', tabs: [
      t('pages', 'Pages', 'website'), t('seo', 'SEO', 'search')] },
  ] },
  { group: 'Ads', lines: [
    { id: 'platforms', label: 'All platforms', icon: 'grid', who: 'all', tabs: [
      t('side-by-side', 'Side by side', 'channels'), t('live-now', 'Live now'), t('changes', 'Changes', 'changes')] },
    { id: 'meta', label: 'Meta', icon: 'meta', who: 'all', tabs: [
      t('overview', 'Overview', 'meta'), t('live-now', 'Live now', 'mtoday'), t('top-ads', 'Best ads', 'adcreative'),
      t('suggestions', 'Suggestions', 'buyer', true), t('load-ads', 'Load ads', 'launch', true), t('changes', 'Changes', 'changes')] },
    { id: 'google', label: 'Google', icon: 'google', who: 'all', tabs: [
      t('overview', 'Overview', 'google'), t('search-terms', 'Search terms', 'gterms'), t('products-ads', 'Products and creative', 'gads'),
      t('suggestions', 'Suggestions', null, true), t('changes', 'Changes', 'gchanges')] },
    { id: 'tiktok', label: 'TikTok', icon: 'tiktok', who: 'all', tabs: [
      t('overview', 'Overview', 'tiktok'), t('live-now', 'Live now'), t('top-videos', 'Best videos'),
      t('suggestions', 'Suggestions', null, true), t('changes', 'Changes')] },
    { id: 'amazon', label: 'Amazon', icon: 'amazon', who: 'all', tabs: [
      t('overview', 'Overview'), t('search', 'Search terms'), t('products', 'Products'), t('creative', 'Creative')] },
  ] },
  { group: 'Email & SMS', lines: [
    { id: 'email', label: 'Email & SMS', icon: 'email', who: 'all', tabs: [
      t('snapshot', 'Snapshot', 'email'), t('campaigns', 'Campaigns', 'email'), t('flows', 'Flows', 'email'), t('list-growth', 'List Growth', 'email')] },
  ] },
  { group: 'Creative', lines: [
    { id: 'creative-review', label: 'Creative review', icon: 'review', who: 'all', tabs: one('adcreative') },
    { id: 'what-works', label: 'What works', icon: 'bulb', who: 'all', tabs: [
      t('learned', 'Learned', 'tests'), t('hooks', 'Hooks'), t('ad-type', 'Ad type'), t('copy', 'Copy'),
      t('angles', 'Angles', 'angles'), t('landing-pages', 'Landing pages'), t('competitors', 'Competitors', 'inspo')] },
    { id: 'production', label: 'Production', icon: 'board', who: 'all', tabs: [t('board', 'Board', 'production')] },
    { id: 'creators', label: 'Creators', icon: 'creators', who: 'all', feature: 'creatorProgram', tabs: [
      t('to-review', 'To review', 'trybe'), t('videos', 'Videos', 'trybe'), t('people', 'People', 'trybe')] },
    /* the brand's own photo and video folder (Drive, Air, Dropbox, Frame or any link). Locus never copies the files. */
    { id: 'assets', label: 'Assets', icon: 'folder', who: 'all', tabs: one() },
    { id: 'library', label: 'Library', icon: 'library', who: 'all', tabs: [
      t('photos', 'Photos', 'library'), t('footage', 'Footage', 'library'), t('reference-ads', 'Reference ads', 'inspo')] },
  ] },
  { group: 'Calendar', lines: [
    { id: 'calendar', label: 'Calendar', icon: 'calendar', who: 'all', tabs: one('calendar') },
    { id: 'offers', label: 'Offers', icon: 'offers', who: 'all', tabs: one('season') },
    /* one page: the War Room. A client sees the pace and the plan on it, never the calls. The brand plan (the day by
       day goal and budget, the ladder, the offers) stays a route but not a tab: the War Room's plan table opens it.
       The old Pace address is not listed at all, so the router sends it to the War Room. */
    { id: 'black-friday', label: 'Black Friday', icon: 'star', who: 'all', note: 'in season', tabs: [
      t('war-room', 'War Room', 'warlive'), hide(t('plan', 'Plan', 'warplan'))] },
  ] },
  { group: 'Reports', lines: [
    { id: 'reports', label: 'Reports', icon: 'report', who: 'all', tabs: one('reports') },
    { id: 'documents', label: 'Documents', icon: 'folder', who: 'all', tabs: one('dash') },
    { id: 'requests', label: 'Requests', icon: 'chat', who: 'all', gap: true, tabs: one('requests') },
  ] },
  AUTOMATIONS,
  { group: null, foot: true, lines: [
    /* a client sees and changes its own goals and ad rules (every change is logged and the team is told); People and sending stays the team's */
    { id: 'brand-settings', label: 'Brand settings', icon: 'gear', who: 'all', foot: true, tabs: [
      t('goals', 'Goals', 'settings'), t('costs', 'Costs', 'costs'), t('brand', 'Brand', 'settings'), t('integrations', 'Integrations', 'settings'), t('people', 'People and sending', 'settings', true)] },
  ] },
];

/* ---------- agency view (team only) ---------- */
export const AGENCY_MENU = [
  { group: 'All brands', lines: [
    { id: 'a-today', label: 'Today', icon: 'grid', who: 'team', tabs: one('morning') },
    { id: 'a-month', label: 'This month', icon: 'month', who: 'team', tabs: [t('pace', 'Pace', 'month'), t('profit', 'Profit', 'profit')] },
  ] },
  { group: 'Ads', lines: [
    { id: 'a-platforms', label: 'All platforms', icon: 'grid', who: 'team', tabs: [t('side-by-side', 'Side by side', 'channels'), t('changes', 'Changes', 'changes')] },
    { id: 'a-meta', label: 'Meta', icon: 'meta', who: 'team', tabs: [t('suggestions', 'Suggestions', 'buyer'), t('overview', 'Overview', 'meta'), t('load-ads', 'Load ads', 'launch')] },
    { id: 'a-google', label: 'Google', icon: 'google', who: 'team', tabs: [t('suggestions', 'Suggestions'), t('overview', 'Overview', 'google'), t('search-terms', 'Search terms', 'gterms')] },
  ] },
  { group: 'Creative', lines: [
    { id: 'a-production', label: 'Production', icon: 'board', who: 'team', tabs: [t('pipeline', 'Pipeline', 'production'), t('needs-someone', 'Needs someone', 'production')] },
    { id: 'a-creators', label: 'Creators', icon: 'creators', who: 'team', feature: 'creatorProgram', tabs: [t('to-review', 'To review', 'trybe'), t('by-brand', 'By brand', 'trybe')] },
  ] },
  { group: 'Calendar', lines: [
    { id: 'a-calendar', label: 'Calendar', icon: 'calendar', who: 'team', tabs: one('calendar') },
    { id: 'a-black-friday', label: 'Black Friday', icon: 'star', who: 'team', note: 'in season', tabs: [t('war-room', 'War Room', 'warlive')] },
  ] },
  { group: 'Reports', lines: [
    { id: 'a-to-send', label: 'To send', icon: 'send', who: 'team', tabs: one('reports') },
    { id: 'a-shared-links', label: 'Shared links', icon: 'link', who: 'team', tabs: one() },
  ] },
  { group: 'Clients', lines: [
    { id: 'a-clients', label: 'Client list', icon: 'customers', who: 'team', tabs: [t('index', 'Client list', 'settings'), t('new', 'New client')] },
    { id: 'a-requests', label: 'Requests', icon: 'chat', who: 'team', tabs: one('requests') },
    { id: 'a-meetings', label: 'Meetings', icon: 'monitor', who: 'team', tabs: [
      t('agenda', 'Agenda', 'calls'), t('pre-read', 'Pre-read'), t('run', 'Run the meeting', 'calls'), t('past', 'Past meetings', 'meetings')] },
  ] },
  { group: ORG_SHORT, lines: [
    { id: 'a-money', label: 'Money', icon: 'money', who: 'team', tabs: [t('billing', 'Billing', 'economics'), t('margin', 'Margin', 'economics')] },
    { id: 'a-team', label: 'Team', icon: 'customers', who: 'team', tabs: one('workload') },
    { id: 'a-status', label: 'Platform status', icon: 'pulse', who: 'team', tabs: one('pulse') },
  ] },
  AUTOMATIONS,
  { group: null, foot: true, lines: [
    { id: 'a-settings', label: 'Agency settings', icon: 'gear', who: 'team', foot: true, tabs: [
      t('clients', 'Clients', 'settings'), t('team', 'Team', 'settings'), t('integrations', 'Integrations', 'settings'), t('ask', AI_NAME, 'settings'),
      t('how-we-run-ads', 'How we run ads', 'settings'), t('sending', 'Sending and notifications', 'settings'), t('messages', 'Messages')] },
    { id: 'a-engine', label: 'Engine', icon: 'pulse', who: 'owner', foot: true, tabs: [t('compare', 'Compare'), t('switch', 'Switch')] },
  ] },
];

/* ---------- pages reached from the top bar, in both views ---------- */
export const TOP_LINES = [
  { id: 'ask', label: 'Ask ' + AI_NAME, icon: 'sparkle', who: 'team', top: true, tabs: [t('index', 'Ask'), t('free', 'Quick lookups', null, true)] },
  { id: 'my-day', label: 'My day', icon: 'day', who: 'team', top: true, tabs: one('mywork') },
  /* a new client's setup checklist. Not drawn in the top bar: reached by the gate, the Client list, My day and the bell */
  { id: 'get-started', label: 'Get started', icon: 'check', who: 'all', top: true, tabs: one() },
  { id: 'notifications', label: 'Notifications', icon: 'bell', who: 'all', top: true, tabs: [
    t('needs-you', 'Needs you'), t('watching', 'Watching'), t('done-today', 'Done today')] },
  { id: 'profile', label: 'Your profile', icon: 'customers', who: 'all', top: true, tabs: [
    t('index', 'Profile'), t('settings', 'My settings'), t('delivery', 'How things reach me'), t('connect-ai', 'Connect your AI'), t('ai-cards', 'AI suggestions')] },
];

/* ---------- agency feature switches ----------
   A line may carry feature: '<name>'. While that switch is off the line leaves the menus (the page and its code
   stay, and it still opens by its address). The switches come from GET /api/notices `features` (app.js reads them
   after boot and calls setFeatures). Until then everything is on, so nothing flickers away for this agency. */
let FEATURES = { creatorProgram: true };
/** setFeatures({ creatorProgram, socialPosting, ... }). True when a switch the menus read changed. */
export function setFeatures(f) {
  if (!f || typeof f !== 'object') return false;
  const next = { ...FEATURES };
  for (const [k, v] of Object.entries(f)) if (typeof v === 'boolean') next[k] = v;
  const changed = JSON.stringify(next) !== JSON.stringify(FEATURES);
  FEATURES = next;
  return changed;
}
/** The switches as they stand now. */
export const featuresNow = () => ({ ...FEATURES });
const featureOk = l => !l.feature || FEATURES[l.feature] !== false;

/* ---------- reading the menus ---------- */
const canSee = (who, role) => (who === 'owner' ? role === 'owner' : who === 'all' || role !== 'client');

/** The menu for a view and a role. role: 'owner' | 'team' | 'client'. The client's is the trimmed brand menu.
    A line whose feature is off is left out. { allFeatures: true } keeps it (the router: a page still opens by URL). */
export function menuFor(view, role, { allFeatures = false, workshop = false } = {}) {
  const src = view === 'agency' && role !== 'client' ? AGENCY_MENU : BRAND_MENU;
  /* workshop.js: the owner gets the Workshop group, anyone else the live lines only; { workshop: true } keeps every line (the router) */
  return arrange(src.map(g => ({ ...g, lines: g.lines.filter(l => canSee(l.who, role) && (allFeatures || featureOk(l))).map(l => ({ ...l, tabs: tabsFor(l, role).filter(x => role !== 'client' || !x.team) })).filter(l => l.tabs.length) })), role, workshop)
    .filter(g => g.lines.length);
}

const ALL = () => [...BRAND_MENU, ...AGENCY_MENU].flatMap(g => g.lines).concat(TOP_LINES);

/** One line by id, from any menu. */
export function lineOf(id) { return ALL().find(l => l.id === id) || null; }

/** Which view a line belongs to: 'brand', 'agency', or null for the top bar pages and a line in both menus (they work in both). */
export function viewOf(lineId) {
  const inAgency = AGENCY_MENU.some(g => g.lines.some(l => l.id === lineId));
  const inBrand = BRAND_MENU.some(g => g.lines.some(l => l.id === lineId));
  if (inAgency && inBrand) return null;
  if (inAgency) return 'agency';
  if (inBrand) return 'brand';
  return null;
}

/** Every route id as { view, line, tab, label, file, legacy, team, hidden }. The README list is made from this. */
export function allRoutes() {
  const out = [];
  const add = (view, l) => l.tabs.forEach(x => out.push({
    view, line: l.id, tab: x.id, label: x.label ? l.label + ' > ' + x.label : l.label,
    file: `pages/${l.id}/${x.id}.js`, legacy: x.legacy, team: l.who === 'team' || !!x.team, hidden: !!x.hidden,
  }));
  BRAND_MENU.forEach(g => g.lines.forEach(l => add('brand', l)));
  AGENCY_MENU.forEach(g => g.lines.forEach(l => add('agency', l)));
  TOP_LINES.forEach(l => add('any', l));
  return out;
}

/* The five phone tabs. 'more' opens the whole menu as a sheet. */
export const PHONE_TABS = {
  team: [
    { id: 'home', label: 'Home', icon: 'home', line: 'home' },
    { id: 'ads', label: 'Ads', icon: 'grid', line: 'platforms' },
    { id: 'ask', label: 'Ask', icon: 'sparkle', line: 'ask', ask: true },
    { id: 'my-day', label: 'My day', icon: 'day', line: 'my-day' },
    { id: 'more', label: 'More', icon: 'more', more: true },
  ],
  agency: [
    { id: 'home', label: 'Today', icon: 'home', line: 'a-today' },
    { id: 'ads', label: 'Ads', icon: 'grid', line: 'a-platforms' },
    { id: 'ask', label: 'Ask', icon: 'sparkle', line: 'ask', ask: true },
    { id: 'my-day', label: 'My day', icon: 'day', line: 'my-day' },
    { id: 'more', label: 'More', icon: 'more', more: true },
  ],
  client: [
    { id: 'home', label: 'Home', icon: 'home', line: 'home' },
    { id: 'ads', label: 'Ads', icon: 'grid', line: 'platforms' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar', line: 'calendar' },
    { id: 'requests', label: 'Requests', icon: 'chat', line: 'requests' },
    { id: 'more', label: 'More', icon: 'more', more: true },
  ],
  /* a new client still on the setup checklist */
  setup: [
    { id: 'get-started', label: 'Get started', icon: 'check', line: 'get-started' },
    { id: 'profile', label: 'Profile', icon: 'customers', line: 'profile' },
  ],
};
