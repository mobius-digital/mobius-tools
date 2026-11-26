/* Group ai: Connect your AI, free lookups, the assistant's settings (CONTRACT.md section 10).
   Connect your AI is open to every signed in person with an email of their own, a client login too: the old
   door sat above the brand guard and did its own check. Everything about the assistant is the team's. */
import * as c from './service.js';
import * as a from './assistant.js';
import { queries } from './queries.js';

export const name = 'ai';
export { queries };

const CONNECT = 'account-health/worker/src/connectai.js';
const LOOKUP = 'account-health/worker/src/lookups.js';
const ASK = 'account-health/worker/src/worker.js';
const person = { team: true, client: true, brand: 'none' };        // each person's own keys and cards
/* Making and turning off my OWN key: a view only teammate and a look and approve client may too, as in the old
   door (connectai.js sat above the view only check and the brand guard). Every statement binds :email. */
const ownKey = { ...person, look_may: true };
/* filter: false on the two lists that carry brand_id: the old door sat above the brand guard, and the handler
   keeps to the caller's brands itself, so a client or a teammate with a brand list keeps brand_id on each row. */
const team = { team: true, client: false, brand: 'none' };
const ported = (file, more = {}) => ({ old: 'ah', file, engine: 'new', ...more });
const sent = (file, why) => ({ old: 'ah', file, engine: 'forward', why });

export const routes = [
  { method: 'GET', path: '/ah/api/connect-ai', access: person, input: null, handler: c.status,
    doc: 'Connect your AI: is it on, the address to give an AI app, who I am, the limits.',
    source: ported(CONNECT, { borrows: ['address'] }) },
  { method: 'GET', path: '/ah/api/connect-ai/keys', access: person, input: { query: { all: 'string?' } }, handler: c.listKeys,
    doc: 'My keys, never the key itself. The owner may ask for everyone with all=1.', source: ported(CONNECT) },
  { method: 'POST', path: '/ah/api/connect-ai/keys', access: ownKey, input: null, handler: c.makeKey,
    doc: 'Make a key (label, days, brands). The key is in this one answer, only its hash is kept. No secret is used.',
    source: ported(CONNECT, { borrows: ['address'] }) },
  { method: 'POST', path: '/ah/api/connect-ai/keys/revoke', access: ownKey, input: null, handler: c.revokeKey,
    doc: 'Turn one of my keys off for good (id). The owner may turn off any key.', source: ported(CONNECT) },
  { method: 'GET', path: '/ah/api/connect-ai/calls', access: { ...person, filter: false }, input: { query: { all: 'string?' } }, handler: c.listCalls,
    doc: 'The last calls my keys made: tool, brand, time. The owner may ask for everyone with all=1.', source: ported(CONNECT) },
  { method: 'GET', path: '/ah/api/connect-ai/switch', access: person, input: null, handler: 'forward',
    doc: 'The old engine has no read for the switch (its state is in GET connect-ai). The old answer is passed on.',
    source: sent(CONNECT, 'no old route for this read: the old answer is passed through as it is') },
  { method: 'PUT', path: '/ah/api/connect-ai/switch', access: { team: true, client: false, owner_only: true, brand: 'none' },
    input: null, handler: 'forward', doc: 'The owner turns Connect your AI on or off for everyone.',
    source: sent(CONNECT, 'switching on makes the key, call and card tables on first use, and the engine never makes a table') },
  { method: 'GET', path: '/ah/api/connect-ai/proposals', access: { team: true, client: true, brand: 'opt', filter: false },
    input: { query: { act: 'brand?', all: 'string?' } }, handler: c.listCards,
    doc: 'The cards an AI made that wait for a tap. A client login sees only its own side\'s cards on its own brands.',
    source: ported(CONNECT) },
  { method: 'POST', path: '/ah/api/connect-ai/proposals/check', access: person, input: null, handler: 'forward',
    doc: 'What a yes on a card would really change, read from the ad platform. Changes nothing.',
    source: sent(CONNECT, 'reads the ad platform live through the protected ad change file') },
  { method: 'POST', path: '/ah/api/connect-ai/proposals/decide', access: person, input: null, handler: 'forward',
    doc: 'The tap on a card: yes or no. A yes can change an ad.',
    source: sent(CONNECT, 'a yes can change an ad through the protected ad change file') },

  { method: 'GET', path: '/ah/api/lookups', access: team, input: null, handler: a.listLookups,
    doc: 'The questions answered free by code, whether that is switched on, and the share of questions it took.',
    source: ported(LOOKUP) },
  { method: 'POST', path: '/ah/api/lookup', access: { team: true, client: false, brand: 'opt' }, input: null, handler: 'forward',
    doc: 'One free answer to a question, written by code from the brand\'s numbers.',
    source: sent(LOOKUP, 'reads the tracker and the ad platform live, may call a small model, and writes a usage row') },

  { method: 'POST', path: '/ah/api/ask', access: { team: true, client: true, brand: 'need' }, input: null, handler: 'forward',
    doc: 'Ask the assistant a question. A client login is pinned to its own brand.',
    source: sent(ASK, 'calls a model') },
  { method: 'GET', path: '/ah/api/ask/settings', access: team, input: null, handler: a.askSettings,
    doc: 'The assistant\'s depth, standing instructions and the channels it reads.', source: ported(ASK) },
  { method: 'PUT', path: '/ah/api/ask/settings', access: team, input: null, handler: 'forward',
    doc: 'Change the assistant\'s depth, standing instructions or channels.',
    source: sent(ASK, 'a write that also clears a channel list kept inside the old worker') },
  { method: 'GET', path: '/ah/api/ask/usage', access: team, input: { query: { days: 'num?' } }, handler: a.askUsage,
    doc: 'Answers and cost of the assistant for the last days (30, at most 90): by day, person, model, brand.',
    source: ported(ASK) },
  { method: 'GET', path: '/ah/api/ask/findings', access: team, input: null, handler: a.askFindings,
    doc: 'What the assistant found, its memory, the agency brief and playbook. Forwarded while either text is still the default.',
    source: ported(ASK) },
  { method: 'GET', path: '/ah/api/ask/brief', access: team, input: null, handler: 'forward',
    doc: 'The old engine has no read for the brief (it comes inside ask/findings). The old answer is passed on.',
    source: sent(ASK, 'no old route for this read: the old answer is passed through as it is') },
  { method: 'PUT', path: '/ah/api/ask/brief', access: team, input: null, handler: a.saveBrief,
    doc: 'Save the "about your agency" text every answer reads (text, at most 4000 characters). One settings row.',
    source: ported(ASK) },
];
