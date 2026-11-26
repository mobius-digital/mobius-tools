/* The template gallery: data, every one off. `ready` = every part runs in version one. A template that is
   not ready carries its sentence as text with [changeable words] in brackets and says what it waits for. */
// from account-health/worker/src/automations.js (TEMPLATES, gallery)
import { ACTIONS } from './words.js';
import { cleanAutomation, sentence } from './sentence.js';

const R = (key, group, a, more = {}) => ({ key, group, ready: true, automation: { template: key, state: 'draft', brand: 'all', if: [], do: [], ...a }, ...more });
const N = (key, group, text, waits, more = {}) => ({ key, group, ready: false, text, waits, ...more });
const who = (...r) => ({ who: r.map(x => (x === 'me' || x === 'team' ? { kind: x } : { kind: 'role', role: x })) });
export const TEMPLATES = [
  N('min_off', 'Ads', 'When a test minimum has been on [7 days] or the test is judged, propose taking it off and tell [the buyer].', 'the test minimum trigger', { tap: true }),
  R('mer_under_goal', 'Ads', { when: { type: 'metric', metric: 'mer', window: 'last7', compare: 'below', line: 'goal' }, tell: who('owner') }),
  N('zero_spend', 'Ads', 'When a live brand has spent nothing for [3 hours] in the day, tell [the buyer] and [the brand owner] right away.', 'spend by the hour'),
  N('cut_no_sale', 'Ads', 'When an ad has spent [3 times] the goal with no sale and is past its wait window, propose pausing it.', 'the ad call rules as a trigger', { tap: true }),
  N('loaded_check', 'Ads', 'When ads are loaded into Meta, put ["check they are spending"] on [the buyer]\'s list for the next morning.', 'the ads loaded trigger'),
  N('sale_ended', 'Ads', 'When a sale\'s end date passes, propose turning off [every ad tagged for it].', 'the sale dates trigger', { tap: true }),
  N('suggestions_line', 'Ads', 'When suggestions are waiting for a brand, give [the buyer] one line a day with the count, never one per ad.', 'the suggestions trigger'),
  R('review_check', 'Production', { when: { type: 'card_status', status: 'review' }, do: [{ type: 'ai_check' }], tell: who('maker') }, { ai: true }),
  N('sent_back', 'Production', 'When a card is sent back, tell [its maker] right away with the notes.', 'the sent back trigger'),
  R('stuck_making', 'Production', { when: { type: 'card_stale', status: 'making', days: 5 }, tell: who('maker', 'owner') }),
  R('ready_not_loaded', 'Production', { when: { type: 'card_stale', status: 'ready', days: 2 }, do: [{ type: 'task', text: 'Load it', due_days: 0 }], tell: who('buyer') }),
  N('live_tomorrow', 'Production', 'When something goes live [tomorrow] on the calendar and its ads are not Ready, tell [the strategist].', 'the calendar trigger'),
  N('creator_waiting', 'Production', 'When creator videos have waited [2 days] for review, give [the reviewer] one line a day with the count.', 'the creator videos trigger'),
  N('sale_no_email', 'Email and SMS', 'When a sale starts [tomorrow] and no campaign is scheduled for it, tell [the email owner].', 'email numbers by day'),
  N('flow_drop', 'Email and SMS', 'When a flow\'s weekly revenue falls by [half] against its normal week, tell [the email owner].', 'email numbers by day'),
  R('plan_sends', 'Email and SMS', { when: { type: 'schedule', every: 'week', day: 'mon', hour: 8 }, do: [{ type: 'task', text: 'Plan this week\'s sends', due_days: 1 }], tell: who('email_owner') }),
  N('meeting_report', 'Reports', '[Every Monday] before the team meeting, draft the agency meeting report and tell [the team] it is ready.', 'the meeting report'),
  R('brand_weekly', 'Reports', { when: { type: 'schedule', every: 'week', day: 'mon', hour: 7 }, do: [{ type: 'draft_report', period: 'weekly' }], tell: who('owner') }),
  R('monthly_report', 'Reports', { when: { type: 'schedule', every: 'month', hour: 7 }, do: [{ type: 'draft_report', period: 'monthly' }], tell: who('owner') }),
  R('unsent_noon', 'Reports', { when: { type: 'report_unsent', hour: 12 }, tell: who('owner') }),
  N('morning_read', 'Reports', '[Every weekday] at my hour, send me my morning read: what needs me, what changed, nothing else.', 'the morning read as one message. Held rows already wait for your hour'),
  R('plan_missing', 'Team', { when: { type: 'plan_missing', hour: 10 }, tell: who('me') }, { note: 'Pick "Only if missing" and you hear nothing on a day every plan is in.' }),
  N('client_request', 'Team', 'When a client sends a request or replies, tell [the brand owner] right away, quiet hours or not.', 'the client request trigger'),
  N('meeting_promises', 'Team', 'When a meeting ends, put each promise on [its owner]\'s list with the day it is due.', 'the meeting notes trigger'),
  R('sync_failing', 'Team', { when: { type: 'sync_failing', hours: 30 }, tell: who('owner') }, { note: 'Once, with the fixed repeat rule: the day, a day later, three days later, a week later, then quiet.' }),
];

const bracketParts = text => String(text).split(/(\[[^\]]+\])/).filter(Boolean)
  .map(s => (s[0] === '[' ? { t: 'slot', text: s.slice(1, -1), key: null } : { t: 'text', text: s }));

/** The gallery as the screens read it: one sentence each with its changeable words marked, all off. */
export function gallery() {
  return TEMPLATES.map(t => {
    if (!t.ready) {
      return { key: t.key, group: t.group, ready: false, on: false, waits: `Not ready yet. It waits for ${t.waits}.`, tap: !!t.tap,
        sentence: { text: t.text.replace(/[[\]]/g, ''), parts: bracketParts(t.text) } };
    }
    const c = cleanAutomation(t.automation).automation;
    return { key: t.key, group: t.group, ready: true, on: false, tap: c.do.some(a => a.type === 'propose'),
      ai: c.do.some(a => ACTIONS[a.type]?.ai), note: t.note || null, automation: c, sentence: sentence(c) };
  });
}
