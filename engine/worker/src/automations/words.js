/* The words of an automation: what a person can pick, and the small helpers every file here shares.
   The screens read these lists from the answer, so every label is the old one, letter for letter. */
// from account-health/worker/src/automations.js (the constants and small helpers near 65 to 185)

export const ORG = 'default';
export const REPORT_AI_USD = 0.1;      // one report narrative, an estimate

const DASH = new RegExp(`\\s*[${String.fromCharCode(8212, 8211)}]\\s*`, 'g');

export const rid = p => p + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
export const clip = (s, n) => String(s ?? '').slice(0, n);
export const noDash = s => String(s ?? '').replace(DASH, ', ');
export const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
export const hourWord = h => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;

/** A whole number between lo and hi, or the fallback. */
export function int(v, lo, hi, fb) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fb;
}

/** A saved JSON column. The old rule: empty or broken reads as the fallback, a value that is not text is kept. */
export function safe(s, fb) {
  if (s == null || s === '') return fb;
  if (typeof s !== 'string') return s;
  try {
    const v = JSON.parse(s);
    return v == null ? fb : v;
  } catch {
    return fb;   // not JSON: the caller named the fallback, as the old helper did
  }
}

export function okTz(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;   // not a time zone the runtime knows: the answer is simply no
  }
}

export const DAY_NAME = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
export const STAGES = ['brief', 'making', 'review', 'ready', 'scheduled', 'live', 'off'];
export const STAGE_WORD = { brief: 'Brief', making: 'Making', review: 'Review', ready: 'Ready', scheduled: 'Scheduled', live: 'Live', off: 'Off' };
export const METRIC_WORD = { spend: 'ad spend', mer: 'MER', roas: 'Meta ROAS (Triple Whale)' };
export const WINDOW_WORD = { yesterday: 'yesterday', last7: 'over the last 7 days' };
export const EVERY_WORD = { day: 'Every day', weekday: 'Every weekday', week: 'Every week', month: 'On the 1st of the month' };

export const TRIGGERS = {
  schedule: 'On a schedule', card_status: 'A production card moves to a stage', card_stale: 'A card has sat in a stage',
  plan_missing: 'A daily plan is missing by a time', report_drafted: 'A report is drafted',
  report_unsent: 'A report is still unsent by a time', sync_failing: 'A brand\'s numbers stopped syncing', metric: 'A number crosses a line',
};

export const ACTIONS = {
  task: { label: 'Put a task on a home list', ai: false, tap: false },
  draft_report: { label: 'Draft a report (never sent)', ai: true, tap: false },
  ai_check: { label: 'Ask the AI checker to look at the card', ai: true, tap: false },
  propose: { label: 'Suggest a change (a person makes it)', ai: false, tap: true,
    not_yet: 'Locus does not make this change in this version. It arrives as a suggestion. You make the change in Ads and tap "I did it", or tap "No".' },
  stop_spend: { label: 'Stop spend without asking', ai: false, tap: false,
    not_yet: 'Saved and shown, but it does not run in this version. It arrives as a suggestion that a person acts on instead.' },
};

export const MODES = {
  now: 'Right away', morning_read: 'In my morning read', only_if_missing: 'Only if missing', daily_line: 'One line a day', mute: 'Mute',
};

export const ROLES = { owner: 'the brand owner', buyer: 'the buyer', strategist: 'the strategist', maker: 'the card\'s maker',
  email_owner: 'the email owner', reviewer: 'the reviewer' };

export const PROPOSALS = { pause: 'pausing it', min_off: 'taking the minimum off', budget: 'a budget change', off: 'turning it off' };

const pairs = map => Object.entries(map).map(([id, label]) => ({ id, label }));

/** The pick lists behind each changeable word, so a screen never types its own. */
export const OPTIONS = {
  'when.type': pairs(TRIGGERS),
  'when.status': STAGES.map(id => ({ id, label: STAGE_WORD[id] })),
  'when.every': [{ id: 'day', label: 'Every day' }, { id: 'weekday', label: 'Every weekday' },
    ...Object.entries(DAY_NAME).map(([k, v]) => ({ id: 'week:' + k, label: 'Every ' + v })), { id: 'month', label: 'On the 1st of the month' }],
  'when.hour': Array.from({ length: 24 }, (_, i) => ({ id: i, label: hourWord(i) })),
  'when.period': [{ id: 'any', label: 'weekly or monthly' }, { id: 'weekly', label: 'weekly' }, { id: 'monthly', label: 'monthly' }],
  'when.metric': pairs(METRIC_WORD),
  'when.window': pairs(WINDOW_WORD),
  'when.compare': [{ id: 'below', label: 'under' }, { id: 'above', label: 'over' }],
  'if.days': [{ id: 'weekdays', label: 'weekday' }, { id: 'weekend', label: 'weekend' }],
  'do.type': Object.entries(ACTIONS).map(([id, a]) => ({ id, label: a.label, ai: a.ai, not_yet: a.not_yet || null })),
  'do.period': [{ id: 'weekly', label: 'weekly' }, { id: 'monthly', label: 'monthly' }],
  'do.change': pairs(PROPOSALS),
  'tell.who': [{ id: 'me', label: 'me' }, { id: 'team', label: 'the whole team' },
    ...Object.entries(ROLES).map(([k, v]) => ({ id: 'role:' + k, label: v })),
    { id: 'clients', label: 'the client\'s people' }, { id: 'person', label: 'a person, by email' }],
};
