/* Group production: cards, requests, my work, the library, the calendar (CONTRACT.md sections 3 and 5).
   Ported: requests, the photo library, saved reference ads. The rest is forwarded, each row says why. */
import * as s from './service.js';
import { queries } from './queries.js';

export const name = 'production';
export { queries };

const AH = 'account-health/worker/src/';
const fwd = (old, file, why) => ({ old, file, engine: 'forward', why });

export const routes = [
  /* ---- ported ---- */
  { method: 'GET', path: '/ah/api/requests',
    access: { team: true, client: true, brand: 'need' },
    input: { query: { act: 'brand?' } },
    handler: s.listRequests,
    doc: 'Requests and approvals of one brand or of every brand: each item, its thread, what it points at, and how many wait on each side.',
    source: { old: 'ah', file: `${AH}requests.js`, engine: 'new' } },

  { method: 'GET', path: '/ah/api/assets',
    access: { team: true, client: true, brand: 'need' },
    input: { query: { act: 'brand?', q: 'string?', people: 'string?', setting: 'string?', source: 'string?', limit: 'string?' } },
    handler: s.listAssets,
    doc: 'The photo library of one brand: the pictures that match the search, counts by state and setting, and where it is read from.',
    source: { old: 'ah', file: `${AH}assets.js`, engine: 'new' } },

  { method: 'GET', path: '/pw/api/inspo',
    access: { team: true, client: true, brand: 'need' },
    input: { query: { act: 'brand?' } },
    handler: s.listInspo,
    doc: 'The links and pictures people saved as inspiration for one brand, newest first.',
    source: { old: 'pw', file: 'profit/worker/src/inspo.js', engine: 'new' } },

  /* ---- forwarded reads ---- */
  { method: 'GET', path: '/ah/api/production',
    access: { team: true, client: true, brand: 'need' },
    input: { query: { act: 'brand?' } },
    handler: 'forward',
    doc: 'The production board: every open card of a brand or of all brands. A client gets its own Needs you and Coming up lists.',
    source: fwd('ah', `${AH}production.js`, 'each card picture is a signed file link and the signing key is on the old side, and the team list is a roster kept in old code') },

  { method: 'GET', path: '/ah/api/production/card',
    access: { team: true, client: true, brand: 'none', own: [{ in: 'query', key: 'id', table: 'p_br_batch' }] },
    input: { query: { id: 'id' } },
    handler: 'forward',
    doc: 'One card: its brief, files, versions, notes and comments. A client may open only a card of its own brand.',
    source: fwd('ah', `${AH}prodwork.js`, 'file links are signed with a key on the old side, a first open reads the brief from the task tool, and it asks the video service whether a conversion is ready') },

  { method: 'GET', path: '/ah/api/production/photos',
    access: { team: true, client: false, brand: 'none' },
    input: null,
    handler: 'forward',
    doc: 'The photo of each person on the team, by name, for the faces on cards.',
    source: fwd('ah', `${AH}prodwork.js`, 'the roster is kept in old code, a missing photo is looked up in the chat app, and the result is saved back') },

  { method: 'GET', path: '/ah/api/mywork',
    access: { team: true, client: false, brand: 'none' },
    input: { query: { who: 'string?' } },
    handler: 'forward',
    doc: 'The work list of one person: tasks, cards, chat asks and plan lines, with their notes and saved items.',
    source: fwd('ah', `${AH}mywork.js`, 'who is on the team, who is the owner and who runs each brand are lists kept in old code, and its cards come from the board, which needs signed links') },

  { method: 'GET', path: '/ah/api/calendar',
    access: { team: true, client: true, brand: 'need' },
    input: { query: { act: 'brand?', from: 'day?', to: 'day?', lite: 'string?' } },
    handler: 'forward',
    doc: 'The marketing calendar of one brand or all brands between two days: dates, countdown steps, emails, planned sends and social posts.',
    source: fwd('ah', `${AH}calendar.js`, 'drop dates come from the supply worker, and email sends and task state are read live with keys on the old side') },

  { method: 'GET', path: '/pw/api/requests',
    access: { team: true, client: true, brand: 'need' },
    input: { query: { act: 'brand?' } },
    handler: 'forward',
    doc: 'The requests list as the bell asks for it on the profit side. The old profit worker has no such route, so its answer is passed through.',
    source: fwd('pw', 'profit/worker/src/worker.js', 'no old route on this side: the old answer is passed through so the screens see what they saw before') },

  { method: 'GET', path: '/pw/api/assets/footage',
    access: { team: true, client: false, brand: 'opt' },
    input: { query: { act: 'brand?' } },
    handler: 'forward',
    doc: 'The footage library of one brand. No old route exists yet, so the old answer is passed through as it is.',
    source: fwd('pw', 'profit/worker/src/worker.js', 'no old route exists: the old answer is passed through as it is') },

  /* ---- forwarded writes ---- */
  { method: 'POST', path: '/ah/api/actions',
    access: { team: true, client: false, brand: 'opt' },
    input: null,
    handler: 'forward',
    doc: 'Add a task to the team list, for a brand or for the agency.',
    source: fwd('ah', `${AH}actions.js`, 'a write that does more than rows: the owner is matched to the roster in old code, and a new task may be filed on a calendar by the old worker') },

  { method: 'POST', path: '/ah/api/actions/done',
    access: { team: true, client: false, brand: 'none' },
    input: null,
    handler: 'forward',
    doc: 'Tick a task done, or back to open.',
    source: fwd('ah', `${AH}actions.js`, 'a write that does more than rows: a tick also runs the follow ups the old worker has registered for a finished task') },
];
