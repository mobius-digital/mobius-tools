/* Group orgs: who you are, people, agency settings (CONTRACT.md section 10).
   Access comes from the old code: /api/me and /api/me/prefs are open to a client login with no brand
   named (the lines in brandguard.js CLIENT_RULES). The team list, the client logins and the agency
   settings have no line there, so a client is refused. The four sign in doors are public. */
import * as s from './service.js';
import * as a from './agency.js';
import { queries } from './queries.js';

export const name = 'orgs';
export { queries };

const WORKER = 'account-health/worker/src/worker.js';
const PREFS = 'account-health/worker/src/prefs.js';
const CLIENTS = 'account-health/worker/src/clients.js';
const SIGN_IN = 'The session is signed with a key that lives on the old side.';

/* A public sign in door, forwarded as it is. */
const door = (method, path, doc, file, why) => ({ method, path, doc, handler: 'forward',
  access: { public: true, brand: 'none' }, source: { old: 'ah', file, engine: 'forward', why } });

export const routes = [
  { method: 'GET', path: '/ah/api/me',
    access: { client: true, brand: 'none' },
    handler: s.me,
    doc: 'Who is signed in: email, role and, for a client login, its brands.',
    source: { old: 'ah', file: WORKER } },

  { method: 'GET', path: '/ah/api/me/prefs',
    access: { client: true, brand: 'none' },
    handler: s.readPrefs,
    doc: 'Your own preferences: the morning message switch and the snoozed reminders.',
    source: { old: 'ah', file: PREFS } },

  { method: 'PUT', path: '/ah/api/me/prefs',
    access: { client: true, brand: 'none', fields: ['morning_dm', 'nudge', 'home_tiles'] },
    handler: s.savePrefs,
    doc: 'Save your own preferences. One settings row, your own.',
    source: { old: 'ah', file: PREFS } },

  { method: 'GET', path: '/ah/api/team',
    access: { brand: 'none' },
    handler: s.team,
    doc: 'The team list: who can sign in, view only or not, guest or not, and the brands each one sees.',
    source: { old: 'ah', file: WORKER, borrows: ['domain', 'owner'] } },

  { method: 'GET', path: '/ah/api/clients',
    access: { brand: 'opt' },
    input: { query: { act: 'brand?' } },
    handler: s.clients,
    doc: 'The client logins and the brands each can open. A teammate with a brand list sees only those brands.',
    source: { old: 'ah', file: CLIENTS, borrows: ['locus'] } },

  { method: 'GET', path: '/ah/api/settings',
    access: { brand: 'none' },
    handler: a.readSettings,
    doc: 'The agency settings: the switches, times and channels the settings screens show.',
    source: { old: 'ah', file: WORKER, borrows: a.BORROWED } },

  { method: 'PUT', path: '/ah/api/settings',
    access: { brand: 'none' },
    handler: a.saveSettings,
    doc: 'Save agency settings. Only the settings named in the body are written, nothing is sent.',
    source: { old: 'ah', file: WORKER } },

  door('POST', '/ah/api/google-login', 'Sign in with a Google account. Answers with a new session.', WORKER,
    `${SIGN_IN} The Google answer is also checked there.`),
  door('POST', '/ah/api/clients/signin', 'Sign in with a one time link from an email. Answers with a new session.', CLIENTS,
    SIGN_IN),
  door('POST', '/ah/api/clients/login-link', 'Email a one time sign in link to an invited client.', CLIENTS,
    'It sends mail, and the mail key lives on the old side.'),
  door('GET', '/ah/api/clients/invite-info', 'What an invite link shows before sign in: whose invite and which brands.', CLIENTS,
    'Part of the sign in page, kept with the other three doors so one side answers all of sign in.'),
];
