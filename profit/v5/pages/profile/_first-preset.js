/* The first notify preset: a one time sheet after sign in that asks how this person wants to hear (Cole 2026-11-26).
   A new teammate, a client, or a brand without an agency picks one of three presets in one step:
     Only urgent / Only urgent + morning brief / Everything that needs me      (the middle one is pre-selected)
   plus where it also goes ("Also send to": Slack DM and email, only the channels that are ready), and taps Save.
   A preset only fills the channels that are on (account-health notify.js fillPreset), and a person with nothing saved
   starts with every channel off, so the sheet shows the channels next to the preset instead of promising a reach it
   does not have. Someone already on the morning brief DM list starts with Slack DM on (the server's default).

   Closing it without Save (Escape, the X, outside the sheet) saves NOTHING on the server: this browser stops asking
   (localStorage), and the server keeps no snapshot made from one moment's state (a failed DM list lookup would
   otherwise save a silent Slack DM opt out). The Profile link counts the same. A route change (browser Back) is not
   an answer: it asks again next time.

   When it shows: account-health GET /api/me/delivery answers notify_chosen false (this person never saved a notify
   choice; notify.js keeps it in p_person_delivery.notify_json). Someone who already saved one never sees it. An
   older server that does not answer notify_chosen shows nothing. A client login is asked too (2026-11-26), in client
   words, once the server answers the client list (catalog.audience 'client': its updates and reports, approvals and
   replies from its team, never an internal alert); an older server's client answer shows nothing. Never over
   "See as client", never while a new client is held on Get started, and never on top of another sheet (app.js opens
   it after the welcome cards are up, and it waits until they close).
   Save: PUT /api/me/delivery { notify: { preset, channels } }, the same body the Profile > How things reach me page
   sends. Only an answer that says notify_chosen true counts as saved (an engine answer without notify does not).
   Once this browser knows the answer is saved for this login it stops asking the server (localStorage, a convenience
   only: the server stays the truth).
   Sample: ?sample=1&firstpreset=1 shows it (add &as=client for the client words and list). Nothing is saved.

   The top half is pure (no DOM, no imports) so test-first-preset.mjs runs it in node; the sheet loads kit.js late. */

export const CHOICES = ['only_urgent', 'urgent_brief', 'everything'];
export const DEFAULT_PRESET = 'urgent_brief';

/* The team's words are the server's (notify.js NOTIFY_PRESETS); these are the fallback when an answer has none. */
const TEAM_WORDS = {
  only_urgent: { name: 'Only urgent', sub: 'Money at risk or something broken.' },
  urgent_brief: { name: 'Only urgent + morning brief', sub: 'The same, plus one short morning brief.' },
  everything: { name: 'Everything that needs me', sub: 'Every row in your bell, the moment it lands.' },
};
/* A client hears about its own brand from its team, never the agency's internal alarms. The server's words are
   notify.js CLIENT_PRESETS; these are the fallback. */
const CLIENT_WORDS = {
  only_urgent: { name: 'Only urgent', sub: 'Only when an approval is due soon.' },
  urgent_brief: { name: 'Only urgent + morning brief', sub: 'The same, plus your daily update and reports.' },
  everything: { name: 'Everything that needs me', sub: 'Every approval, reply and update from your team, as it comes in.' },
};

/** Is this catalog written for this reader? A client reads only a client catalog, the team never one. */
const forReader = (catalog, client) => !!catalog && (catalog.audience === 'client') === !!client;

/** The three choices, in order, with the words this person reads. catalog = the server's catalog (or null). The
    server's words are used only when the catalog is for this reader (a team catalog never gives a client its words). */
export function choices({ client = false, catalog = null } = {}) {
  const fromServer = forReader(catalog, client) && Array.isArray(catalog.presets) ? catalog.presets : [];
  return CHOICES.map(id => {
    const own = client ? CLIENT_WORDS[id] : TEAM_WORDS[id];
    const s = fromServer.find(p => p && p.id === id);
    return { id, name: (s && s.name) || own.name, sub: (s && s.sub) || own.sub };
  });
}

/** The preset the sheet opens on: a saved non custom preset (only in a forced sample), else the default. */
export function startPreset(notify) {
  const p = notify && notify.preset;
  return CHOICES.includes(p) ? p : DEFAULT_PRESET;
}

/** Ask the server at all? Not in sample (unless forced), not over "See as client", not while held on Get started,
    not when this browser already knows the choice is made for this login. A client login is asked like the team. */
export function shouldFetch({ sample = false, forced = false, asClient = false, held = false, known = false } = {}) {
  if (forced) return true;
  return !sample && !asClient && !held && !known;
}

/** Show the sheet for this answer? Only an explicit notify_chosen false from a server that has the presets, and for
    a client only the client list (an older server answered a client a list in no preset: every pick saved the same). */
export function shouldShow(answer, { forced = false, client = false } = {}) {
  if (forced) return true;
  return !!answer && answer.notify_chosen === false && !!answer.catalog && Array.isArray(answer.catalog.presets) && forReader(answer.catalog, client);
}

/** The "Also send to" channels this person can turn on here: Slack DM and email when the server says they are ready.
    In the app is always on and never a choice; Phone has no sender yet. A client gets the same channels as the team. */
export function channelChoices({ catalog = null } = {}) {
  const list = catalog && Array.isArray(catalog.channels) ? catalog.channels : [];
  return list.filter(c => c && (c.id === 'slack_dm' || c.id === 'email') && c.ready === true)
    .map(c => ({ id: c.id, name: c.name || (c.id === 'slack_dm' ? 'Slack DM' : 'Email') }));
}

/** The switches the sheet opens on: what the server says is on now, only for the offered channels. */
export function startChannels(notify, offered) {
  const on = (notify && notify.channels) || {};
  return Object.fromEntries((offered || []).map(c => [c.id, on[c.id] === true]));
}

/** Does this pick reach anyone outside the app? */
export const reachesOutside = channels => Object.values(channels || {}).some(v => v === true);

/** The PUT body for a Save. Anything that is not one of the three saves the default. channels: only Slack DM and
    email, as booleans (a channel not offered here is left as it is on the server). */
export function saveBody(preset, channels = null) {
  const id = CHOICES.includes(preset) ? preset : DEFAULT_PRESET;
  const ch = {};
  if (channels && typeof channels === 'object') for (const c of ['slack_dm', 'email']) if (c in channels) ch[c] = channels[c] === true;
  return Object.keys(ch).length ? { notify: { channels: ch, preset: id } } : { notify: { preset: id } };
}

/** A PUT answer counts as saved only when it says so (the engine's port of me/delivery answers 200 without notify). */
export const savedOk = answer => !!answer && answer.notify_chosen === true;

/** What a close does. save: the pick goes to the server. dismiss (Escape, X, outside) and link (the Profile link):
    nothing is saved, this browser stops asking. route (Back, any other route change): nothing, asked next time. */
export function closeOutcome(how) {
  if (how === 'save') return { put: true, remember: true };
  if (how === 'dismiss' || how === 'link') return { put: false, remember: true };
  return { put: false, remember: false };
}

/** The localStorage key that remembers "saved" for one login. */
export const knownKey = email => 'lx5_first_preset|' + String(email || '').trim().toLowerCase();

/* ---------- the sheet (browser only) ---------- */

const CSS = `
.fp{display:grid;gap:16px;min-width:0}
.fp-lead{margin:0;font-size:14.5px;line-height:1.5;color:var(--ink-2)}
.fp-list{display:grid;gap:10px}
.fp-opt{display:grid;gap:3px;width:100%;min-height:64px;padding:14px 18px;border:1px solid var(--line);border-radius:16px;background:var(--surface);color:inherit;font:inherit;text-align:left;cursor:pointer}
.fp-opt b{font-size:16px;font-weight:600}
.fp-opt span{font-size:13.5px;line-height:1.45;color:var(--muted)}
.fp-opt:hover{border-color:var(--line-strong)}
.fp-opt[aria-checked="true"]{background:var(--ink);border-color:var(--ink);color:var(--surface)}
.fp-opt[aria-checked="true"] span{color:inherit;opacity:.78}
.fp-foot{display:grid;gap:10px}
.fp-foot .lx-btn{width:100%;justify-content:center}
.fp-note{margin:0;font-size:12.5px;line-height:1.5;color:var(--muted);text-align:center}
.fp-note a{color:inherit;text-decoration:underline}
.fp-ch{display:grid;gap:8px}
.fp-ch h3{margin:0;font-size:13px;font-weight:600;color:var(--muted)}
.fp-ch-row{display:flex;flex-wrap:wrap;gap:8px 20px}
.fp-ch-hint{margin:0;font-size:13px;line-height:1.45;color:var(--muted)}
`;

const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* memory only */ } };

/* Run fn once no other sheet is open (the welcome cards for a new client come first). */
function whenClear(fn) {
  const busy = () => !!document.querySelector('body > .lx-overlay');
  if (!busy()) return fn();
  const mo = new MutationObserver(() => { if (!busy()) { mo.disconnect(); setTimeout(fn, 250); } });
  mo.observe(document.body, { childList: true });
}

/** askOnce({ st, held }): app.js calls this once per boot, after the first page is up. st = shell.state(). */
export async function askOnce({ st, held = false } = {}) {
  const { SAMPLE, QS } = await import('../../config.js');
  const forced = SAMPLE && QS.get('firstpreset') === '1';
  const email = st && st.me && st.me.email;
  const key = knownKey(email);
  if (!shouldFetch({ sample: SAMPLE, forced, asClient: !!(st && st.asClient), held, known: !!email && read(key) === '1' })) return;
  const client = forced ? st.role === 'client' : !!st && (st.realRole === 'client' || !!(st.me && st.me.client));
  const data = await import('../../data.js');
  let answer;
  try {
    answer = forced ? await data.fixture(client ? 'profile/_sample/delivery-client.json' : 'profile/_sample/delivery.json') : await data.api('/api/me/delivery', { worker: 'ah' });
  } catch { return; }                                        // an admin token, an older server, no connection: ask later
  if (!forced && answer && answer.notify_chosen === true && email) write(key, '1');
  if (!shouldShow(answer, { forced, client })) return;
  whenClear(() => open({ answer, client, forced, remember: () => { if (email && !forced) write(key, '1'); } }));
}

async function open({ answer, client, forced, remember }) {
  const [{ h, button, sheet, toast, toggle, addStyles }, { api }, router, { APP_NAME }] = await Promise.all([
    import('../../kit.js'), import('../../data.js'), import('../../router.js'), import('../../config.js')]);
  addStyles('fp-css', CSS);
  const list = choices({ client, catalog: answer && answer.catalog });
  let picked = startPreset(forced ? null : answer && answer.notify), done = false, how = 'dismiss';
  const offered = channelChoices({ catalog: answer && answer.catalog });
  const ch = startChannels(answer && answer.notify, offered);

  const opts = list.map(c => h('button', { type: 'button', class: 'fp-opt', role: 'radio', 'aria-checked': 'false', 'data-id': c.id,
    onclick: () => { picked = c.id; paint(); } }, h('b', null, c.name), h('span', null, c.sub)));
  const paint = () => opts.forEach(b => { const on = b.dataset.id === picked; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  const group = h('div', { class: 'fp-list', role: 'radiogroup', 'aria-label': 'How you hear' }, opts);
  group.addEventListener('keydown', e => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = (CHOICES.indexOf(picked) + step + CHOICES.length) % CHOICES.length;
    picked = CHOICES[i]; paint(); opts[i].focus();
  });

  let where = null;
  try { const r = router.currentRoute(); if (r) where = router.href(router.normalise({ ...r, line: 'profile', tab: 'delivery' })); } catch { /* text only */ }
  const place = 'Profile > How things reach me';
  const note = h('p', { class: 'fp-note' }, 'Change any time in ', where ? h('a', { href: where, onclick: () => { how = 'link'; } }, place) : place, '.');
  const save = button('Save', { primary: true, large: true, onclick: () => { how = 'save'; sh.close(); } });

  /* "Also send to": a preset reaches nobody outside the app until one of these is on. */
  const hint = h('p', { class: 'fp-ch-hint' });
  const paintHint = () => {
    hint.textContent = !offered.length
      ? (client ? 'For now everything stays here in ' + APP_NAME + '. Email starts once it is set up.'
        : 'Slack and email are not set up yet, so for now everything stays here in ' + APP_NAME + '.')
      : reachesOutside(ch) ? '' : 'With nothing on, everything stays here in ' + APP_NAME + '.';
    hint.hidden = !hint.textContent;
  };
  const chBox = h('div', { class: 'fp-ch' }, h('h3', null, 'Also send to'),
    offered.length ? h('div', { class: 'fp-ch-row' }, offered.map(c => toggle({ label: c.name, checked: ch[c.id], onchange: v => { ch[c.id] = !!v; paintHint(); } }))) : null,
    hint);
  paintHint();

  const lead = client
    ? 'Everything always shows here in ' + APP_NAME + '. Pick how much you want to hear from your team, and where.'
    : 'Everything always shows here in ' + APP_NAME + '. Pick what also reaches you outside it, and where.';
  /* A route change closes the sheet (kit.js sheet listens for hashchange). This listener is added first, so it runs
     before the sheet's own and marks the close as a route change, not an answer. */
  const onRoute = () => { if (how === 'dismiss') how = 'route'; };
  window.addEventListener('hashchange', onRoute);
  const sh = sheet({ title: 'How should ' + APP_NAME + ' reach you?', side: 'center',
    body: h('div', { class: 'fp' }, h('p', { class: 'fp-lead' }, lead), group, chBox, h('div', { class: 'fp-foot' }, save, note)),
    onClose: () => finish() });
  paint();

  /* Every close lands here once. Only Save writes to the server (closeOutcome). */
  async function finish() {
    if (done) return;
    done = true;
    window.removeEventListener('hashchange', onRoute);
    const out = closeOutcome(how);
    if (forced) { if (out.put) toast('Sample mode: nothing is saved.'); return; }
    if (!out.put) { if (out.remember) remember(); return; }
    try {
      const res = await api('/api/me/delivery', { worker: 'ah', method: 'PUT', body: saveBody(picked, ch) });
      if (!savedOk(res)) throw new Error('Not saved. It asks again next time.');
      remember();
      toast('Saved.');
    } catch (e) {
      /* not saved: it asks again next time */
      toast((e && e.message) || 'Not saved. It asks again next time.', { tone: 'bad', ms: 5000 });
    }
  }
}
