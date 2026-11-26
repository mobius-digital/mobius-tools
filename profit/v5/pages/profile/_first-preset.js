/* The first notify preset: a one time sheet after sign in that asks how this person wants to hear (Cole 2026-11-26).
   A new teammate, a client, or a brand without an agency picks one of three presets in one step:
     Only urgent / Only urgent + morning brief / Everything that needs me      (the middle one is pre-selected)
   and taps Save. Closing the sheet any other way saves the default, so it is never asked twice.

   When it shows: account-health GET /api/me/delivery answers notify_chosen false (this person never saved a notify
   choice; notify.js keeps it in p_person_delivery.notify_json). A teammate who already saved one never sees it. An
   older server that does not answer notify_chosen shows nothing. Never over "See as client", never while a new client
   is held on Get started, and never on top of another sheet (it waits until the welcome cards close).
   Save: PUT /api/me/delivery { notify: { preset } }, the same body the Profile > How things reach me page sends.
   Once this browser knows the answer is saved for this login it stops asking the server (localStorage, a convenience
   only: the server stays the truth).
   Sample: ?sample=1&firstpreset=1 shows it (add &as=client for the client words). Nothing is saved.

   The top half is pure (no DOM, no imports) so test-first-preset.mjs runs it in node; the sheet loads kit.js late. */

export const CHOICES = ['only_urgent', 'urgent_brief', 'everything'];
export const DEFAULT_PRESET = 'urgent_brief';

/* The team's words are the server's (notify.js NOTIFY_PRESETS); these are the fallback when an answer has none. */
const TEAM_WORDS = {
  only_urgent: { name: 'Only urgent', sub: 'Money at risk or something broken.' },
  urgent_brief: { name: 'Only urgent + morning brief', sub: 'The same, plus one short morning brief.' },
  everything: { name: 'Everything that needs me', sub: 'Every row in your bell, the moment it lands.' },
};
/* A client hears about its own brand from its team, never the agency's internal alarms. */
const CLIENT_WORDS = {
  only_urgent: { name: 'Only urgent', sub: 'Only when something needs your answer right away.' },
  urgent_brief: { name: 'Only urgent + morning brief', sub: 'The same, plus one short morning summary.' },
  everything: { name: 'Everything that needs me', sub: 'Every approval and question from your team, as it comes in.' },
};

/** The three choices, in order, with the words this person reads. catalog = the server's catalog (or null). */
export function choices({ client = false, catalog = null } = {}) {
  const fromServer = !client && catalog && Array.isArray(catalog.presets) ? catalog.presets : [];
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
    not when this browser already knows the choice is saved for this login. */
export function shouldFetch({ sample = false, forced = false, asClient = false, held = false, known = false } = {}) {
  if (forced) return true;
  return !sample && !asClient && !held && !known;
}

/** Show the sheet for this answer? Only an explicit notify_chosen false from a server that has the presets. */
export function shouldShow(answer, { forced = false } = {}) {
  if (forced) return true;
  return !!answer && answer.notify_chosen === false && !!answer.catalog && Array.isArray(answer.catalog.presets);
}

/** The PUT body for a pick. Anything that is not one of the three saves the default. */
export const saveBody = preset => ({ notify: { preset: CHOICES.includes(preset) ? preset : DEFAULT_PRESET } });

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
  const data = await import('../../data.js');
  let answer;
  try {
    answer = forced ? await data.fixture('profile/_sample/delivery.json') : await data.api('/api/me/delivery', { worker: 'ah' });
  } catch { return; }                                        // an admin token, an older server, no connection: ask later
  if (!forced && answer && answer.notify_chosen === true && email) write(key, '1');
  if (!shouldShow(answer, { forced })) return;
  const client = forced ? st.role === 'client' : st.realRole === 'client';
  whenClear(() => open({ answer, client, forced, onSaved: () => { if (email && !forced) write(key, '1'); } }));
}

async function open({ answer, client, forced, onSaved }) {
  const [{ h, button, sheet, toast, addStyles }, { api }, router, { APP_NAME }] = await Promise.all([
    import('../../kit.js'), import('../../data.js'), import('../../router.js'), import('../../config.js')]);
  addStyles('fp-css', CSS);
  const list = choices({ client, catalog: answer && answer.catalog });
  let picked = startPreset(forced ? null : answer && answer.notify), done = false;

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
  const note = h('p', { class: 'fp-note' }, 'Change any time in ', where ? h('a', { href: where }, place) : place, '.');
  const save = button('Save', { primary: true, large: true, onclick: () => finish(picked) });
  const lead = client
    ? 'Everything always shows here in ' + APP_NAME + '. Pick how much you want to hear from your team.'
    : 'Everything always shows here in ' + APP_NAME + '. Pick what also reaches you outside it.';
  const sh = sheet({ title: 'How should ' + APP_NAME + ' reach you?', side: 'center',
    body: h('div', { class: 'fp' }, h('p', { class: 'fp-lead' }, lead), group, h('div', { class: 'fp-foot' }, save, note)),
    onClose: () => finish(DEFAULT_PRESET, true) });
  paint();

  /* Save, or closed any other way (Escape, the X, outside the sheet, the link above): the default is saved. */
  async function finish(preset, closed = false) {
    if (done) return;
    done = true;
    if (!closed) sh.close();
    if (forced) { toast('Sample mode: nothing is saved.'); return; }
    try {
      await api('/api/me/delivery', { worker: 'ah', method: 'PUT', body: saveBody(preset) });
      onSaved();
      if (!closed) toast('Saved.');
    } catch (e) {
      /* not saved: it asks again next time */
      if (!closed) toast((e && e.message) || 'Not saved. It asks again next time.', { tone: 'bad', ms: 5000 });
    }
  }
}
