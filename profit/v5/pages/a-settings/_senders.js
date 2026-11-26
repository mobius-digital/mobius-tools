/* Who each kind of message comes from: the pure part of Agency settings > Sending and notifications > Who it comes from.
   The worker (account-health sender.js) is the source of truth: GET /api/settings answers `senders` resolved
   ({ all, kinds, resolved: { kind: { who, label, locked, why, email, fallback } }, mailbox }). This file only reads that
   answer and builds the next value to save; it has no DOM, so a test can run it as is.
   SAMPLE_SENDERS is the same shape with today's defaults, for sample mode (nothing saves there). */

export const VALUES = ['locus', 'cole'];

const K = (label, def, extra = {}) => ({ label, def, ...extra });
const ORDER = {
  client_checkin: K('Client check-in updates', 'cole'),
  client_daily: K('Client daily', 'cole'),
  client_report: K('Weekly and monthly reports', 'cole'),
  client_update: K('"What we did" updates', 'cole'),
  client_recap: K('Call recaps', 'cole'),
  client_outage: K('Platform outage notes to clients', 'locus'),
  client_post: K('Strategist posts in a client channel', 'locus'),
  onboarding_slack: K('Onboarding in Slack (welcome, Shopify note)', 'cole'),
  onboarding_email: K('Onboarding emails (welcome, agreement, reminders)', 'cole', { email: true }),
  login_email: K('Sign in links and client login invites', 'locus', { email: true }),
  internal_alert: K('Alerts to the team', 'locus', { locked: true, why: 'This one always comes from Locus for now: the team alerts do not read this setting yet.' }),
  team_notice: K('Team notices', 'locus', { locked: true, why: 'This one always comes from Locus for now: the team alerts do not read this setting yet.' }),
  approval_ask: K('Approval asks (drafts, War Room, batches)', 'locus', { locked: true, why: 'Most go to your own DM, and a DM from you to you never notifies you. Their cards are also rewritten in place, which only works for the app.' }),
  strategist_reply: K('Strategist answers in threads', 'locus', { locked: true, why: 'An answer you did not write must not carry your name.' }),
  creator_discord: K('Creator Discord posts', 'locus', { locked: true, why: 'Discord has no way to post as a person.' }),
};
export const NO_MAILBOX = 'Locus email is not set up yet, so these still come from you.';

/** The sample answer: today's senders, no Locus mailbox. */
export const SAMPLE_SENDERS = {
  all: null, kinds: {}, mailbox: false,
  resolved: Object.fromEntries(Object.entries(ORDER).map(([k, v]) => {
    const fallback = !!(v.email && v.def === 'locus');
    return [k, { who: fallback ? 'cole' : v.def, def: v.def, label: v.label, locked: !!v.locked, email: !!v.email, fallback, ...(v.locked ? { why: v.why } : fallback ? { why: NO_MAILBOX } : {}) }];
  })),
};

/** The value to keep on the page and save: { all, kinds } only. */
export function storedOf(s) {
  const src = s && typeof s === 'object' ? s : {};
  const kinds = {};
  for (const [k, v] of Object.entries(src.kinds || {})) if (ORDER[k] && !ORDER[k].locked && VALUES.includes(v)) kinds[k] = v;
  return { all: VALUES.includes(src.all) ? src.all : null, kinds };
}

/** What each row shows for a staged value. `answer` = the server's resolved answer (for labels, locks, the mailbox). */
export function senderRows(answer, staged) {
  const a = answer && answer.resolved ? answer : SAMPLE_SENDERS;
  const st = storedOf(staged || a);
  return Object.keys(ORDER).filter(k => a.resolved[k]).map(k => {
    const r = a.resolved[k];
    let who = r.locked ? 'locus' : (st.kinds[k] || st.all || r.def || ORDER[k].def);
    let fallback = false;
    if (r.email && who === 'locus' && !a.mailbox) { who = 'cole'; fallback = true; }
    return { kind: k, label: r.label || ORDER[k].label, who, locked: !!r.locked, email: !!r.email, fallback, noApp: !!(r.email && !a.mailbox),
      why: r.locked ? r.why : (r.email && !a.mailbox ? NO_MAILBOX : '') };
  });
}

/** The top switch: 'locus', 'cole' or 'mixed' over the rows a person can change (an email row that falls back to the owner
 *  because there is no Locus mailbox does not count). */
export function topState(rows) {
  const free = rows.filter(r => !r.locked && !r.fallback);
  const set = new Set(free.map(r => r.who));
  return set.size === 1 ? [...set][0] : 'mixed';
}

/** One tap on the top switch sets every kind: the per kind values are cleared. */
export const applyTop = (stored, who) => ({ all: VALUES.includes(who) ? who : null, kinds: {} });
/** One pill: only that kind changes. Locked kinds never change. */
export function applyKind(stored, kind, who) {
  const s = storedOf(stored);
  if (!ORDER[kind] || ORDER[kind].locked || !VALUES.includes(who)) return s;
  return { all: s.all, kinds: { ...s.kinds, [kind]: who } };
}
