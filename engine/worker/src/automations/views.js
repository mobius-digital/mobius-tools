/* How a saved row is shown: an automation, a row on the bell, a person's delivery choice. Pure. */
// from account-health/worker/src/automations.js (rowToAuto, notesOf, viewOf, roleNotes, noticeView, deliveryOf, choiceFor)
import { ACTIONS, MODES, ROLES, REPORT_AI_USD, safe, int } from './words.js';
import { sentence } from './sentence.js';

export const namesOf = accts => Object.fromEntries((accts || []).map(x => [x.act_id, x.name]));

export const rowToAuto = r => ({ id: r.id, name: r.name, brand: r.brand_id || 'all', owner: r.owner_person, template: r.template_key,
  state: r.state, may_act_alone: !!r.may_act_alone,
  when: safe(r.trigger_json, {}), if: safe(r.conditions_json, []), do: safe(r.actions_json, []), tell: safe(r.audience_json, { who: [] }),
  cursor: r.cursor || null, last_run_at: r.last_run_at || null, last_status: r.last_status || null, fail_count: r.fail_count || 0,
  created_by: r.created_by, created_at: r.created_at, updated_at: r.updated_at });

export function notesOf(a) {
  const n = [];
  const does = type => (a.do || []).some(x => x.type === type);
  if (does('stop_spend')) n.push(ACTIONS.stop_spend.not_yet);
  if (does('propose')) n.push(ACTIONS.propose.not_yet);
  if (does('ai_check')) n.push('The AI checker reads the words on the card. It does not look at the picture or video yet, and it says so on every check.');
  if (does('draft_report')) n.push(`The report is drafted and held. Nothing is sent to a client. Writing it costs AI, about ${Math.round(REPORT_AI_USD * 100)} cents a brand (an estimate), and it stops at the automations AI limit for the day. A draft still unsent at noon is listed in the team's daily "not sent yet" reminder in Slack, like any other draft.`);
  if (((a.tell && a.tell.who) || []).some(p => p.kind === 'clients' || p.client)) n.push('A client is never told straight away. The message waits as a draft, you see the exact words, and it goes only when you say send.');
  return n;
}

/** In plain words, the roles a sentence names that nobody holds yet. */
export function roleNotes(a, roles, accts) {
  const out = [];
  for (const p of (a.tell && a.tell.who) || []) {
    if (p.kind !== 'role' || (roles.all && roles.all[p.role])) continue;
    const brands = a.brand === 'all' ? (accts || []).map(x => x.act_id) : [a.brand];
    const without = brands.filter(b => !(roles[b] && roles[b][p.role]));
    if (!without.length) continue;
    out.push(`Nobody is set as ${ROLES[p.role]}${a.brand === 'all' && without.length < brands.length ? ' for some brands' : ''} yet, so the person who made this hears instead. Set it in Who does what.`);
  }
  return [...new Set(out)];
}

/** One automation as the list shows it. The cursor is never shown. */
export function viewOf(a, names, roles, accts) {
  const { cursor, ...rest } = a;
  return { ...rest, brand_name: a.brand === 'all' ? 'Any brand' : names[a.brand] || a.brand,
    sentence: sentence(a, { brandName: names[a.brand] }), notes: [...notesOf(a), ...roleNotes(a, roles, accts)],
    costs_ai: (a.do || []).some(x => ACTIONS[x.type]?.ai) };
}

export const noticeView = r => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, brand_id: r.brand_id, automation_id: r.automation_id,
  run_id: r.run_id, state: r.state, home: !!r.home, due_at: r.due_at, held_until: r.hold_until, button: safe(r.button_json, null),
  sent: safe(r.sent_json, {}), answer: r.answer, created_at: r.created_at, done_at: r.done_at });

/** What a client reads of a row: the plain line and nothing else. No button, no ids, no record of who sent it. */
export const clientNoticeView = r => ({ id: r.id, kind: 'tell', title: r.title, brand_id: r.brand_id, state: r.state, home: false,
  held_until: r.hold_until, created_at: r.created_at, done_at: r.done_at });

export function cleanWays(given, { client = false } = {}) {
  const w = given && typeof given === 'object' ? given : {};
  return { home: client ? false : w.home !== false, slack: client ? false : w.slack === true, email: w.email === true };
}

export const DEFAULT_DELIVERY = { tz: null, read_hour: 7, read_days: ['mon', 'tue', 'wed', 'thu', 'fri'], quiet_from: null, quiet_to: null,
  break_quiet: ['tap', 'down'], mode: 'now', ways: { home: true, slack: false, email: false } };

/** A person's saved defaults (a p_person_delivery row), or the defaults when nothing is saved. */
export function deliveryFrom(r) {
  if (!r) return { ...DEFAULT_DELIVERY, ways: { ...DEFAULT_DELIVERY.ways } };
  return { tz: r.tz || null, read_hour: int(r.read_hour, 0, 23, 7), read_days: safe(r.read_days, DEFAULT_DELIVERY.read_days),
    quiet_from: r.quiet_from == null ? null : int(r.quiet_from, 0, 23, null), quiet_to: r.quiet_to == null ? null : int(r.quiet_to, 0, 23, null),
    break_quiet: safe(r.break_quiet_json, DEFAULT_DELIVERY.break_quiet), mode: MODES[r.mode] ? r.mode : 'now',
    ways: cleanWays(safe(r.ways_json, DEFAULT_DELIVERY.ways)) };
}

/** One person's choice for one automation: their own setting for it (a p_automation_sub row), else their defaults. */
export function choiceOf(base, s) {
  if (!s) return { ...base, at_hour: base.read_hour, own: false };
  return { ...base, mode: MODES[s.mode] ? s.mode : base.mode, ways: s.ways_json ? cleanWays(safe(s.ways_json, base.ways)) : base.ways,
    at_hour: s.at_hour == null ? base.read_hour : int(s.at_hour, 0, 23, base.read_hour), own: true };
}
