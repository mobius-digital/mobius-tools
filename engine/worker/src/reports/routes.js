/* Group reports: reports, briefs, shared links, meetings, agency views, the sale reads, creators.
   Each row says who may use the route, what it takes, who answers and what it is for. */
import * as s from './service.js';
import { meetings } from './meetings.js';
import { mondayScreen } from './monday.js';
import { queries } from './queries.js';

export const name = 'reports';
export { queries };

const AH = 'account-health/worker/src/';
const PW = 'profit/worker/src/';
const PROXY = `${PW}worker.js (PROXY_PATHS, passed on to ${AH}worker.js)`;

/* A client sees its own brand only and must name it. The team may name one brand or none. */
const CLIENT_BRAND = { team: true, client: true, brand: 'need' };
const TEAM = { team: true, client: false, brand: 'opt' };
const TEAM_NO_BRAND = { team: true, client: false, brand: 'none' };

/* A route answered here. On the old profit side these three were only passed on, so both prefixes share one handler. */
function both(path, handler, doc, input) {
  return [['ah', `${AH}worker.js`], ['pw', PROXY]].map(([old, file]) => ({ method: 'GET', path: `/${old}${path}`,
    access: CLIENT_BRAND, input, handler, doc, source: { old, file, engine: 'new' } }));
}

/* A route sent on to the old worker, with the reason. */
function forward(path, access, file, doc, why) {
  return { method: 'GET', path, access, input: null, handler: 'forward', doc,
    source: { old: path.slice(1, 3), file, engine: 'forward', why } };
}

const ported = [
  ...both('/api/reports', s.listReports,
    'The last 80 weekly and monthly reports, without their numbers. A client gets only the ones that were sent (old rule sentOnlyList).',
    { query: { act: 'brand?' } }),
  ...both('/api/report', s.oneReport,
    'One weekly or monthly report with its frozen numbers. A client gets it only once it was sent (old rule sentOnlyOne).',
    { query: { act: 'brand?', period: 'string?', start: 'string?' } }),
  ...both('/api/briefs', s.listBriefs,
    'The last 60 daily briefs. A client gets only the ones that were sent (old rule sentOnlyList).',
    { query: { act: 'brand?' } }),
  { method: 'GET', path: '/pw/api/client-pages', access: TEAM, input: { query: { act: 'brand?' } }, handler: s.listClientPages,
    doc: 'Hand built client pages on a public link: all of them, or the ones attached to one brand. Team only.',
    source: { old: 'pw', file: `${PW}clientpage.js`, engine: 'new',
      borrows: ['pages[].url (the screens address in front of the token)'] } },
  { method: 'GET', path: '/pw/api/snapshots', access: { team: true, client: true, brand: 'none' }, input: null, handler: s.listSnapshots,
    doc: 'The shared links (frozen cards and pages) of the brands the caller has, newest first.',
    source: { old: 'pw', file: `${PW}snapshot.js`, engine: 'new' } },
  { method: 'GET', path: '/ah/api/meetings', access: TEAM_NO_BRAND, input: { query: { id: 'string?', open: 'string?' } }, handler: meetings,
    doc: 'Meetings of the last 60 days with the open tasks per brand, or one meeting with its notes when id is given. Team only.',
    source: { old: 'ah', file: `${AH}meetings.js`, engine: 'new',
      borrows: ['connected', 'webhook', 'meetings[].with', 'open[].items[].url (the screens address)'] } },
  { method: 'GET', path: '/ah/api/meetings/monday', access: TEAM_NO_BRAND, input: null, handler: mondayScreen,
    doc: 'The Monday meeting screen: per brand last week\'s report, the plan people posted and the open tasks. Team only.',
    source: { old: 'ah', file: `${AH}meetings.js`, engine: 'new',
      borrows: ['brands[].open[].url and agency_open[].url (the screens address)'] } },
];

const forwarded = [
  forward('/ah/api/agency/economics', { team: true, client: false, owner_only: true, brand: 'none' }, `${AH}agency.js`,
    'Agency money for a month: money in, team cost and AI cost per client. Owner only.',
    'reads the ledger worker and the task tool live'),
  forward('/ah/api/agency/workload', TEAM, `${AH}agency.js`,
    'Open tasks due this week or overdue, by person, across the brands.',
    'reads the task tool live'),
  forward('/ah/api/calls/screen', TEAM, `${AH}callscreen.js`,
    'The screen a call is run from: the report, the ad platforms and what was typed on the call.',
    'reads an ad platform live and may call a model'),
  forward('/ah/api/pulse/status', TEAM_NO_BRAND, `${AH}pulse.js`,
    'The state of each outside platform and the last changes, kept by the outage monitor.',
    'on the stays on old list of the written plan: the outage monitor is a timed job there'),
  forward('/pw/api/season', CLIENT_BRAND, `${PW}season.js`,
    'The stored sale season of one brand, or of every brand for the team.',
    'protected file (season.js): forwarded, never ported'),
  forward('/pw/api/season/war', CLIENT_BRAND, `${PW}season.js`,
    'The sale plan, the phases and today by the hour for one brand, or one row per brand for the team.',
    'protected file (season.js) and it reads the tracker live'),
  forward('/ah/api/standing', TEAM, `${AH}standing.js`,
    'The latest three hourly sale check in for every brand. Team only.',
    'protected file (standing.js): forwarded, never ported'),
  forward('/ah/api/trybe', CLIENT_BRAND, `${AH}trybe.js`,
    'Creators of one brand: live videos and people. For the team, act=all lists the brands with a program.',
    'reads the creator tool live with a key held on the old side'),
  forward('/ah/api/trybe/review', TEAM, `${AH}trybe.js`,
    'Creator videos waiting for a yes or no, for one brand. Team only.',
    'reads the creator tool live with a key held on the old side'),
  forward('/ah/api/trybe/scorecard', TEAM, `${AH}trybe.js`,
    'Every brand with a creator program: spend, sales, cost per sale and goal. Team only.',
    'reads the creator tool live with a key held on the old side'),
  forward('/ah/api/trybe/video', CLIENT_BRAND, `${AH}trybe.js`,
    'A short lived link to play one creator video of the caller\'s brand.',
    'asks the creator tool for a link with a key held on the old side'),
];

export const routes = [...ported, ...forwarded];
