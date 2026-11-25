/* Your profile: what the three "own" tabs share (Connect your AI, AI suggestions, How things reach me).
   Each one reads the signed in person's own things, so two cases need a plain state and no call:
   1. The team looking with "See as client". The worker would answer with the team member's own keys, cards and
      choices, and a tap there would be a real one. The same test as automations/_notices.js and needs-you.js.
   2. A sign in with no email of its own. The connect-ai routes answer 401 for it, which the shared api() reads as
      "the sign in ran out". They are read here with a quiet fetch that checks the session before saying so. */

import { h, put, empty } from '../../kit.js';
import { workers, token } from '../../config.js';
import { ApiError, storedClient } from '../../data.js';

/** True while a team member looks at the app as a client. A real client (and sample mode) is false. */
export const seenAsClient = ctx => !!ctx.isClient && !ctx.sample && !storedClient();

export function clientsOwn(el) {
  put(el, empty({ title: 'This is the client\'s own page', text: 'It shows when the client is signed in.' }));
}

export function noEmail(el) {
  put(el, empty({ title: 'Sign in with your own email', text: 'Connect your AI belongs to one person. This sign in has no email of its own, so it has no keys and no cards.' }));
}

/** The saved copy of a page can be the empty one kept while "See as client" was on. Back in the team view that
    copy is not the page: read again and draw. Returns true when it took over the drawing. */
export function staleHold(el, data, ctx, load, draw) {
  if (!data || data.preview !== true) return false;
  put(el, h('div', { class: 'lx-empty' }, h('p', null, 'Loading.')));
  Promise.resolve().then(() => load(ctx)).then(d => { if (el.isConnected && !(d && d.preview)) draw(el, d, ctx); },
    e => { if (el.isConnected && !(e && e.name === 'AbortError')) put(el, empty({ title: 'This page could not load', text: (e && e.message) || 'Something went wrong.' })); });
  return true;
}

/** GET one of the person's own connect-ai routes. A 401 here can mean "this sign in has no email" and not "signed
    out", so it does not open the sign in page by itself: /api/me is asked first (through the shared api(), which
    does open it when the session really ran out). A valid session with no email gets { no_email: true }. */
export async function ownGet(ctx, path, signal) {
  const res = await fetch(workers().ah + path, { headers: { Authorization: 'Bearer ' + token() }, signal });
  const j = await res.json().catch(() => ({}));
  if (res.ok) return j;
  if (res.status === 401) { await ctx.api('/api/me', { worker: 'ah', signal }); return { no_email: true }; }
  throw new ApiError(j.error || 'HTTP ' + res.status, res.status);
}
