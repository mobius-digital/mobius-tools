/* Group ai: the fixed lists the old routes answer with. Nothing here is worked out. */
// from account-health/worker/src/connectai.js (limits, TOOL_NAMES), lookups.js (LOOKUPS, SETTING, REVENUE_DEF), strattools.js (PRESETS)

export const DEFAULT_DAYS = 90, MAX_DAYS = 365, MAX_LIVE_KEYS = 5;
export const LIMITS = { perMin: 60, perDay: 1500, proposalsPerDay: 30 };

/* The tools a connected AI app is given, in the order the old door lists them. */
export const TOOL_NAMES = ['list_brands', 'get_numbers', 'platform_overview', 'top_ads', 'suggestions_waiting',
  'production_board', 'calendar', 'list_reports', 'get_report', 'costs_summary', 'propose_change'];

export const LOOKUP_SETTING = 'freeLookups';
/* The words the old route sends for "what revenue means". Kept word for word so the answer is the same. */
export const REVENUE_DEF = 'Revenue is store net sales less tax, from Triple Whale.';

const L = (id, title, example, line, tab, dates = true) => ({ id, title, example, needs_dates: dates, page: { line, tab } });
export const LOOKUPS = [
  L('revenue', 'Revenue', 'What was revenue yesterday?', 'sales', 'by-day'),
  L('ad_spend', 'Ad spend, every platform', 'How much did we spend on ads last week?', 'month', 'pace'),
  L('mer', 'MER (revenue for each ad dollar)', 'What was MER this month?', 'month', 'pace'),
  L('orders', 'Orders', 'How many orders on Nov 16?', 'sales', 'by-day'),
  L('aov', 'Average order value', 'What was AOV last month?', 'sales', 'by-day'),
  L('new_customers', 'New customers', 'How many new customers last week?', 'customers', 'snapshot'),
  L('cac', 'Cost per new customer', 'What was CAC this month?', 'customers', 'snapshot'),
  L('new_vs_returning', 'New against returning orders', 'What share of orders were new customers last week?', 'customers', 'snapshot'),
  L('gross_margin', 'Product margin', 'What was gross margin last week?', 'month', 'profit'),
  L('platform_spend', 'Spend on one platform', 'How much did we spend on Meta yesterday?', 'platforms', 'side-by-side'),
  L('platform_roas', 'ROAS on one platform', 'What was Google ROAS last week?', 'platforms', 'side-by-side'),
  L('spend_today', 'Spend so far today', 'How much have we spent today?', 'meta', 'live-now'),
  L('top_ads', 'Top Meta ads', 'Top 5 ads by spend last week', 'meta', 'top-ads'),
  L('cost_per_lead', 'Cost per lead', 'What was the cost per lead last week?', 'meta', 'overview'),
  L('campaign_budget', 'Budget of a campaign', 'What is the budget of the Evergreen campaign?', 'meta', 'overview', false),
  L('last_launch', 'When new ads last went in', 'When were new ads last launched?', 'meta', 'changes'),
  L('brand_goal', 'The goals set for the brand', 'What is the goal ROAS?', 'brand-settings', 'goals', false),
  L('sale_dates', 'When a sale starts and ends', 'When does the Black Friday sale end?', 'calendar', 'index', false),
  L('sale_offer', 'The offer for a sale', 'What is the offer for Cyber Monday?', 'offers', 'index', false),
  L('next_on_calendar', 'What is next on the calendar', 'What is next on the calendar?', 'calendar', 'index', false),
  L('card_status', 'Status of a production card', 'What is the status of card 412?', 'production', 'board', false),
  L('card_due', 'When a card is due', 'When is batch 412 due?', 'production', 'board', false),
  L('card_owner', 'Who has a card', 'Who is assigned to brief 412?', 'production', 'board', false),
  L('due_this_week', 'What is due', 'What briefs are due this week?', 'production', 'board'),
  L('in_review', 'What is waiting for review', 'What is waiting for review?', 'production', 'board', false),
];

/* The three depths of the assistant. The old settings route sends this map as it is. */
export const PRESETS = {
  smart: { model: 'claude-opus-5-5', effort: 'medium', label: 'Opus 5.5' },
  quick: { model: 'claude-sonnet-5-5', effort: 'medium', label: 'Sonnet 5.5' },
  deep: { model: 'claude-opus-5-5', effort: 'high', label: 'Opus 5.5 deep' },
};

/* The settings rows the assistant keeps (the old engine's memory prefix plus the name). */
export const ASK_KEYS = { model: 'strategistModel', instructions: 'strategistInstructions', indexChannels: 'strategistIndexChannels',
  channel: 'strategistChannel', brief: 'strategistBrief', playbook: 'strategistPlaybook', notes: 'strategistNotes',
  watches: 'strategistWatches', muted: 'strategistMuted', pending: 'strategistPending', lastBriefing: 'strategistLastBriefing' };
export const ASK_TZ = 'America/Chicago';
