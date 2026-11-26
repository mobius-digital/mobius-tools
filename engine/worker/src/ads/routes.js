/* Group ads: paid numbers, creatives, changes, loaded ads. Meta, Google, TikTok, Amazon, every platform.
   No ad write lives here: ad changes stay on the old write path. */
import { hubPaid, hubCreative } from './service.js';
import { listActivities, listAdUpdates, listLaunches } from './changes.js';
import { queries } from './queries.js';

export const name = 'ads';
export { queries };

const HUB = 'profit/worker/src/hub.js';
const AH = 'account-health/worker/src/worker.js';
/* The old client rules (brandguard.js CLIENT_RULES): a client may read these for its own brand, and must name it. */
const CLIENT_OWN_BRAND = { team: true, client: true, brand: 'need' };
const WINDOW = { act: 'brand?', days: 'int?', from: 'day?', to: 'day?', model: 'string?', cmp: 'string?' };

/* A forwarded GET: the old worker answers, as the same person, and checks access again itself. */
const forwarded = (path, file, why, doc, access = CLIENT_OWN_BRAND) => ({ method: 'GET', path, access, input: null, handler: 'forward', doc,
  source: { old: path.slice(1, 3), file, engine: 'forward', why } });

const LIVE_AD_PLATFORM = 'reads an ad platform live with a key the old worker holds';

export const routes = [
  { method: 'GET', path: '/pw/api/hub/paid', access: CLIENT_OWN_BRAND,
    input: { query: { ...WINDOW, platform: 'string?' } }, handler: hubPaid,
    doc: 'Spend, delivery and credited sales per brand for Meta, Google, TikTok or all channels, with the window before.',
    source: { old: 'pw', file: HUB, engine: 'new' } },
  { method: 'GET', path: '/pw/api/hub/creative', access: CLIENT_OWN_BRAND,
    input: { query: WINDOW }, handler: hubCreative,
    doc: 'Every Meta ad of one brand with spend in the window, judged inside its ad set, with rollups by format, angle and type.',
    source: { old: 'pw', file: HUB, engine: 'new' } },
  { method: 'GET', path: '/ah/api/activities', access: CLIENT_OWN_BRAND,
    input: { query: { act: 'brand?', from: 'string?', to: 'string?', limit: 'int?' } }, handler: listActivities,
    doc: 'The change log: every change on the ad accounts, newest first, for one brand or every brand of the caller.',
    source: { old: 'ah', file: AH, engine: 'new' } },
  { method: 'GET', path: '/ah/api/ad-updates', access: CLIENT_OWN_BRAND,
    input: { query: { act: 'brand?', from: 'string?', to: 'string?' } }, handler: listAdUpdates,
    doc: 'The ad changes of one brand that carry a reason written for the client, with before and after, newest first.',
    source: { old: 'ah', file: AH, engine: 'new' } },
  { method: 'GET', path: '/ah/api/launch/list', access: CLIENT_OWN_BRAND,
    input: { query: { act: 'brand?', refresh: 'string?' } }, handler: listLaunches,
    doc: 'The ads loaded through the app with their last known state. Forwarded when refresh is asked or a learning waits to be filed.',
    source: { old: 'ah', file: 'account-health/worker/src/launch.js', engine: 'new' } },

  forwarded('/ah/api/meta/live', AH, LIVE_AD_PLATFORM, 'Campaigns, ad sets, ads and budgets as Meta has them right now.'),
  forwarded('/ah/api/pacing', AH, LIVE_AD_PLATFORM, 'Meta spend by hour today against a usual day.'),
  forwarded('/ah/api/ad-creatives', AH, `${LIVE_AD_PLATFORM}, and the old worker checks each named ad belongs to the caller`,
    'The picture, video and landing page of the named ads.'),
  forwarded('/pw/api/ad-creatives', 'profit/worker/src/worker.js', 'the old profit worker only passes this on to the old account-health worker',
    'The picture, video and landing page of the named ads (the profit address of the same route).'),
  forwarded('/ah/api/buyer-list', 'account-health/worker/src/buyerlist.js', 'protected file: the ad calls are made by the old worker only',
    'The ad calls of today from the ad rules, with the ads behind each.'),
  forwarded('/ah/api/google/ads', AH, LIVE_AD_PLATFORM, 'Google Ads campaigns and days, as Google counts them.'),
  forwarded('/ah/api/google/ads-ads', AH, LIVE_AD_PLATFORM, 'Google Ads ads and asset groups, top by spend.'),
  forwarded('/ah/api/google/ads-terms', AH, LIVE_AD_PLATFORM, 'Google Ads search terms, top by spend.'),
  forwarded('/ah/api/google/ads-changes', AH, LIVE_AD_PLATFORM, 'The change history Google keeps for one brand, last 30 days.'),
  forwarded('/ah/api/leaks', AH, 'reads ad platforms live and may call a model', 'The leak finder: wasted spend on Google and TikTok, with fixes.'),
  forwarded('/ah/api/tiktok/report', AH, LIVE_AD_PLATFORM, 'TikTok campaigns and days, as TikTok counts them.'),
  forwarded('/pw/api/hub/command', HUB, 'on the stays on old list of the written plan',
    'The agency view: why each brand needs attention. Team only.', { team: true, client: false, brand: 'opt' }),
];
