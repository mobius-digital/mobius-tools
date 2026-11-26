/* Group automations: the bell, automations, delivery choices (CONTRACT.md sections 3 and 5).
   Reads and plain row saves are answered here from the shared database. Switching the workspace on, a test
   run and answering a row on the bell stay on the old worker: its timers, its chat app and its mail do them. */
import * as s from './service.js';
import * as mine from './mine.js';
import { queries } from './queries.js';

export const name = 'automations';
export { queries };

const FILE = 'account-health/worker/src/automations.js';
const TEAM = { team: true, client: false, brand: 'none' };
/* brandguard.js CLIENT_RULES: a client reaches only its own bell and its own delivery choices, no brand named. */
const MINE = { team: true, client: true, brand: 'none' };
const ported = (extra = {}) => ({ old: 'ah', file: FILE, engine: 'new', ...extra });
const forwarded = why => ({ old: 'ah', file: FILE, engine: 'forward', why });

export const routes = [
  { method: 'GET', path: '/ah/api/automations', access: TEAM, input: null, handler: s.listAutomations,
    doc: 'Every automation the caller sees, the template gallery, the last 60 runs and the pick lists.',
    source: ported({ borrows: ['GET /ah/api/team: domain, owner (for team_size)'], compare: { ignore: [] } }) },
  { method: 'PUT', path: '/ah/api/automations', access: TEAM, input: null, handler: s.saveAutomation,
    doc: 'Save one automation as a draft or switched off. A save that switches it on, or names a client, is forwarded to the old worker.',
    source: ported() },
  { method: 'DELETE', path: '/ah/api/automations', access: TEAM, input: { query: { id: 'string?' } }, handler: s.deleteAutomation,
    doc: 'Delete one automation and the choices people saved for it.', source: ported() },
  { method: 'GET', path: '/ah/api/automations/people', access: TEAM, input: null, handler: s.getPeople,
    doc: 'Who does what: the person behind each role per brand, and the team list.',
    source: ported({ borrows: ['GET /ah/api/team: domain, owner (for team)'] }) },
  { method: 'PUT', path: '/ah/api/automations/people', access: TEAM, input: null, handler: s.putPeople,
    doc: 'Save who does what. One settings row. Only the owner changes the team list.',
    source: ported({ borrows: ['GET /ah/api/team: domain, owner (who counts as team)'] }) },
  { method: 'GET', path: '/ah/api/automations/test', access: TEAM, input: null, handler: s.noGetTest,
    doc: 'Not found, as on the old worker: a test run is a POST.', source: ported() },
  { method: 'GET', path: '/ah/api/notices', access: MINE, input: null, handler: mine.listNotices,
    doc: 'The caller\'s own home list and bell rows. A client gets only the plain line for its own brands.',
    source: ported() },
  { method: 'GET', path: '/ah/api/me/delivery', access: MINE, input: null, handler: mine.getDelivery,
    doc: 'How things reach the caller, and their choice per automation.', source: ported() },
  { method: 'PUT', path: '/ah/api/me/delivery', access: { ...MINE, fields: ['delivery', 'per'] }, input: null, handler: mine.putDelivery,
    doc: 'Save the caller\'s own delivery defaults and their own choice per automation.', source: ported() },
  { method: 'POST', path: '/ah/api/automations/power', access: { ...TEAM, owner_only: true }, input: null, handler: 'forward',
    doc: 'The one switch: automations on or off for the whole workspace. Owner only.',
    source: forwarded('the old timers run automations, so switching them on stays beside them') },
  { method: 'POST', path: '/ah/api/automations/test', access: TEAM, input: null, handler: 'forward',
    doc: 'A dry run of one automation: what would have happened. Nothing is sent or saved.',
    source: forwarded('a test run reads live numbers and may call a model') },
  { method: 'POST', path: '/ah/api/notices/done', access: { ...MINE, fields: ['id', 'done', 'answer'] }, input: null, handler: 'forward',
    doc: 'Answer or tick a row on the bell. A held client message is sent or dropped here.',
    source: forwarded('a write that does more than rows: it can send a message to a client by chat or mail') },
];
