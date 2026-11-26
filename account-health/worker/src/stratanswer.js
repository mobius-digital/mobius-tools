/**
 * How an answer is checked before it goes out (2026-11-26, AI eval round 17: 38 of 45 passed; most answers ran
 * about twice as long as asked, one cost per sale was worked out wrong, one client draft carried ad set names).
 *
 *   answerKind / answerNote   a word budget per kind of question, told to the model with the question
 *   answerProblems            the post-step: over budget, or internal names in a client draft = one rewrite round
 *   clientLeaks               internal set / campaign / test names and ids in text meant for a client
 *   calc (tool)               cost per sale, ROAS, CPA, MER, CAC, AOV, cost per lead, margin, a budget step and
 *                             weekday names, computed in code; under MIN_SALES it says "too few sales to call"
 *   dateLine                  today with its weekday, the last 14 days by name, and the 28-day "normal" window
 *   flagBigBudgets            a budget card that moves more than 50% says so in its first words
 *   storeExtras               product margin (what is taken out) and whether Amazon is inside a store number
 *
 * The kind sets a LENGTH CEILING and, for a client draft only, the leak check on the text after the "---- draft ----"
 * line; it never decides what the assistant does or which tools it uses. A draft needs a writing verb AND a client
 * or a send, so a question that only mentions a message or a channel is not one. Only the person's own question
 * is read: a prompt the app writes (the Monday review, a scheduled question) passes noCheck and gets neither.
 * Plugs into ask/engine.js through config hooks (answerNote, answerCheck, dateLine) and into strategist.js tools.
 */

export const MIN_SALES = 3;
/* The house line for a lead campaign (memory lead-cpl-kpi; morningcard.js LEAD_CPL_MAX is the same $0.75). */
export const LEAD_CPL = { low: 0.5, high: 0.75 };
export const BIG_STEP = 0.5;

/* ---------------- length ---------------- */
export const BUDGETS = { lookup: 40, list: 60, facts: 60, change: 40, changed: 80, make: 100, decision: 120, draft: 110 };
const LABEL = { lookup: 'a number lookup', list: 'a short ranked list', facts: 'a fact from Slack or the account history', change: 'a change (the card does the talking)',
  changed: 'what changed / a summary', make: 'making something', decision: 'a decision or recommendation', draft: 'a client draft' };

export function answerKind(question) {
  const q = String(question || '').replace(/\s+/g, ' ').trim();
  const more = /\b(list (them )?all|every one|full list|all of them|in full|all \d+|show me everything)\b/i.test(q);
  const pick = kind => ({ kind, words: BUDGETS[kind] * (more ? 2 : 1), more, label: LABEL[kind] });
  /* A client draft = asked to WRITE something (draft / write / reword / compose / reply to / respond to) for a client
     or customer, or to send or paste. "What did the client say in their last message?" is not one. */
  const writing = /\b(draft|write|rewrite|reword|compose|reply to|respond to)\b/i.test(q) || /\b(give me|get me|need|want)\b[^.?!]{0,30}\b(message|note|reply|update|email|post|text)\b/i.test(q);
  if (writing && /\b(clients?|customers?|send|paste)\b/i.test(q)) return pick('draft');
  if (/^(please |can you |could you )?(on [^,]+, )?(turn (on|off)|pause|resume|raise|lower|increase|decrease|cut|change|set|switch|rename|duplicate|launch|stop|start|move|add|remove)\b/i.test(q)) return pick('change');
  if (/^(please |can you |could you )?(write|make|create|build|fill in|generate|design|draft)\b/i.test(q)) return pick('make');
  if (/\bshould\b|\bwhat would you\b|\bworth fixing\b|\bdo first\b|\brecommend|\bnext (batch|step|test)|\bangles?\b|\bconcepts?\b|\bideas?\b|\bpriorit|\bwhat to (do|test|make)\b|\bwhich .*\b(best|working|winning|worth)\b/i.test(q)) return pick('decision');
  if (/\bwhat changed\b|\bwhy\b|\bsummar|\brecap\b|\bworst\b|\bagainst\b|\bvs\.?\b|\bcompared?\b|\btrend|\banything off\b|\bnormal\b|\bon pace\b|\bpace\b|\bdid .* match\b|\bdropped\b/i.test(q)) return pick('changed');
  if (/\b(said|say|says|tell|told|agreed|asked|slack|launched|link|links|where can|when does|when is|who)\b/i.test(q)) return pick('facts');
  if (/\btop \d+\b|\bwhich \d+\b|\brank/i.test(q)) return pick('list');
  if (/^(what|how much|how many|which|when|was|were|did|is|are)\b/i.test(q) && q.split(' ').length <= 40) return pick('lookup');
  return pick('decision');
}

export function answerNote(question) {
  const b = answerKind(question);
  const draft = b.kind === 'draft' ? ` Put the draft last, after a line exactly "---- draft ----"; the draft itself at most ${b.words} words, the line above it at most 20.` : '';
  return `[Length for this answer: ${b.label}, at most ${b.words} words outside a table or chart.${draft} ${b.more ? 'They asked for the full list: give it.' : 'Any list: the top 3 only, unless the question asks for more.'} Before you finish, cut every sentence that is not the answer: no method, no recap, no background.]`;
}

/** Words a person reads: fenced blocks (charts) and table rows do not count. */
export function wordCount(text) {
  const body = String(text || '').replace(/```[\s\S]*?```/g, ' ').split('\n').filter(l => !/^\s*\|/.test(l)).join(' ');
  return body.split(/\s+/).filter(w => /[\p{L}\p{N}$%]/u.test(w)).length;
}

const DRAFT_LINE = /^-{2,}\s*draft\s*-{2,}\s*$/im;
export function splitDraftText(text) {
  const s = String(text || ''), m = s.match(DRAFT_LINE);
  return m ? { answer: s.slice(0, m.index).trim(), draft: s.slice(m.index + m[0].length).trim() } : { answer: s.trim(), draft: '' };
}

/** Text a client reads, with links taken out: a Slack link "<url|label>" keeps its label, a bare URL goes (the brand's
 *  Updates or Your ads link carries the brand id on purpose; a Slack permalink carries a long number). Table rows go. */
export function clientProse(text) {
  return String(text || '')
    .replace(/<((?:https?|mailto):[^>|\s]*)(?:\|([^>]*))?>/gi, (m, url, label) => label || ' ')
    .replace(/\[([^\]]*)\]\((?:https?|mailto):[^)\s]*\)/gi, '$1')
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>()]+/gi, ' ')
    .split('\n').filter(l => !/^\s*\|/.test(l)).join('\n');
}

const NOT_A_TEST = '(?:new\\s+|more\\s+|different\\s+|other\\s+)?(?:ads?|videos?|images?|statics?|creatives?|hooks?|angles?|versions?|variations?|concepts?|headlines?|people|customers?|audiences?)\\b';
const TEST_NO = new RegExp(`\\b(?:batch|brief|ad set|adset)\\s*#?\\d{2,4}(?:-\\d+)?\\b|\\btest\\s*(?:#\\d{1,4}\\b|\\d{2,4}-\\d+\\b|\\d{3,4}\\b(?!\\s+${NOT_A_TEST}))`, 'i');

/** Internal names and ids a client must never read: "412-1 | UGC", "[MD] CBO", "test 395", act_/brand_ ids, Meta ids.
 *  Links are taken out first (clientProse); plain words a client may well read ("test 30 new ads", "gift card 100",
 *  "red | blue", "[USD]", an order or tracking number) do not count. */
export function clientLeaks(text) {
  const s = clientProse(text), out = new Set();
  const add = (re, why) => { const m = s.match(re); if (m) out.add(`${why} ("${m[0].trim().slice(0, 40)}")`); };
  /* Names built with a pipe ("412-1 | UGC", "New people | Adv+", "Black Friday | Everyone"): the words each side of
     the pipe start with a capital, a digit or a tag, the way set and campaign names are written. */
  add(/(?:^|[^\w])[\dA-Z[#][\w\]#.+-]*[ \t]*\|[ \t]*[\dA-Z[][^\n|]{0,30}/, 'an internal ad, ad set or campaign name');
  add(/\[(?!(?:USD|CAD|EUR|GBP|AUD|NZD|MXN|JPY)\])[A-Z]{1,4}\][ \t]*[A-Z\d][^\n]{0,20}/, 'an internal campaign tag');
  add(TEST_NO, 'an internal test number');
  add(/\bact_\d{6,}\b|\bbrand_[a-z0-9_]{3,}\b/i, 'an internal account id');
  /* Meta object and account ids run 15 to 17 digits (120... ids up to 18); a 13 or 14 digit order number, or a
     number named as an order or tracking number, is not one. */
  add(/(?<!(?:order|tracking|invoice|receipt|confirmation)(?:\s+(?:number|no\.?|id))?\s*[#:]?\s*)(?<![\d.,$])(?:120\d{12,15}|\d{15,17})(?![\d,]|\.\d)/i, 'a Meta id');
  add(/\b(?:CBO|ABO|lastPlatformClick)\b|\bAdv\+/, 'internal jargon');
  return [...out];
}

/** The post-step: what is wrong with a finished answer, as plain instructions for one rewrite. Empty = send it. */
export function answerProblems(answer, question, { slack = 1.4 } = {}) {
  const b = answerKind(question), out = [];
  const { answer: head, draft } = splitDraftText(answer);
  if (b.kind === 'draft') {
    const text = draft || head;
    const n = wordCount(text);
    if (n > b.words * slack) out.push(`The client draft is ${n} words; make it ${b.words} or fewer (keep the numbers that answer the client, drop the rest).`);
    if (draft && wordCount(head) > 20 * 2) out.push(`The note above the draft is ${wordCount(head)} words; one line of 20 or fewer.`);
    /* Only the text after "---- draft ----" is the client's; the note above it is for the team and may name sets. */
    const leaks = draft ? clientLeaks(draft) : [];
    if (leaks.length) out.push(`The client text names internal things: ${leaks.join('; ')}. Say it in the client's words instead ("the ads for new customers", "the Black Friday ads"), no names, numbers or ids of ad sets, campaigns or tests.`);
  } else {
    const n = wordCount(answer);
    if (n > b.words * slack) out.push(`It is ${n} words; the limit for ${b.label} is ${b.words}. Keep the answer, the numbers that decide it and any link or card line; ${b.more ? '' : 'lists to the top 3; '}drop method, recap and background.`);
  }
  return out;
}

/* ---------------- dates ---------------- */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
export const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekday = ymd => ok(ymd) ? DAYS[new Date(`${ymd}T12:00:00Z`).getUTCDay()] : null;
const short = ymd => `${weekday(ymd).slice(0, 3)} ${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}`;

/** The date block: today by name, the last 14 days by name (never worked out in the model's head), and "normal". */
export function dateLine(today) {
  if (!ok(today)) return `Today is ${today}.`;
  const days = Array.from({ length: 14 }, (_, i) => short(addDays(today, -i - 1)));
  return `Today is ${weekday(today)}, ${MON[+today.slice(5, 7) - 1]} ${+today.slice(8, 10)}, ${today.slice(0, 4)} (${today}). The current month is ${today.slice(0, 7)}.\n`
    + `The last 14 days: ${days.join(', ')}. For any other date's weekday call calc with dates; never work a weekday out yourself.\n`
    + `"Normal" for a day means the last 28 full days (${addDays(today, -28)} to ${addDays(today, -1)}), the same weekday in them when it matters; never last week alone.`;
}

/* ---------------- calc ---------------- */
const num = v => (v === null || v === undefined || v === '' || !isFinite(+v)) ? null : +v;
const usd = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const x2 = n => (Math.round(n * 100) / 100).toFixed(2) + 'x';
const pct = n => (Math.round(n * 1000) / 10).toFixed(1) + '%';

/** Every ratio the assistant quotes, from the numbers it read. A ratio on fewer than MIN_SALES sales carries no call. */
export function calc(input = {}) {
  const i = input || {}, out = {}, min = Math.max(1, num(i.min_sales) ?? MIN_SALES);
  /* No fallbacks: MER and CAC need ad_spend (all ad spend, not one ad's), AOV needs orders (the store's, not attributed
     sales); one ad's spend or sales against whole-store sales gives a wrong figure that looks right. */
  const spend = num(i.spend), sales = num(i.sales), revenue = num(i.revenue), net = num(i.net_sales), ad = num(i.ad_spend),
    newc = num(i.new_customers), leads = num(i.leads), orders = num(i.orders), cost = num(i.product_costs);
  const few = sales != null && sales < min ? `too few sales to call (${sales} sale${sales === 1 ? '' : 's'}, the line is ${min})` : null;
  if (spend != null && sales != null) out.cost_per_sale = sales > 0 ? { value: usd(spend / sales), sum: `${usd(spend)} / ${sales}`, ...(few ? { call: few } : {}) } : { value: null, call: `no sales on ${usd(spend)}` };
  if (spend != null && revenue != null) out.roas = spend > 0 ? { value: x2(revenue / spend), sum: `${usd(revenue)} / ${usd(spend)}`, ...(few ? { call: few } : {}) } : { value: null, call: 'no spend' };
  if (net != null && ad != null) out.mer = ad > 0 ? { value: x2(net / ad), sum: `${usd(net)} / ${usd(ad)}` } : { value: null, call: 'no ad spend' };
  if (ad != null && newc != null) out.cac = newc > 0 ? { value: usd(ad / newc), sum: `${usd(ad)} / ${newc} new customers`, ...(newc < min ? { call: `too few new customers to call (${newc})` } : {}) } : { value: null, call: 'no new customers' };
  if (net != null && orders != null && orders > 0) out.aov = { value: usd(net / orders), sum: `${usd(net)} / ${orders} orders` };
  if (spend != null && leads != null) {
    const cpl = leads > 0 ? spend / leads : null;
    const goal = num(i.lead_goal);
    const line = goal ? `the brand's lead goal of ${usd(goal)}` : `the $${LEAD_CPL.low.toFixed(2)} to $${LEAD_CPL.high.toFixed(2)} lead line`;
    out.cost_per_lead = cpl == null ? { value: null, call: `no leads on ${usd(spend)}` }
      : { value: usd(cpl), sum: `${usd(spend)} / ${leads} leads`, against: cpl <= (goal || LEAD_CPL.high) ? `at or under ${line}` : `over ${line}` };
  }
  if (net != null && cost != null && net > 0) out.product_margin = { value: pct((net - cost) / net), sum: `(${usd(net)} - ${usd(cost)}) / ${usd(net)}`, taken_out: 'product costs only (no shipping, fees or ad spend)' };
  const bf = num(i.budget_from), bt = num(i.budget_to);
  if (bf != null && bt != null && bf > 0) { const step = (bt - bf) / bf; out.budget_change = { value: (step >= 0 ? '+' : '') + pct(step), sum: `${usd(bf)} -> ${usd(bt)}`, big: Math.abs(step) > BIG_STEP, ...(Math.abs(step) > BIG_STEP ? { call: 'a big change: over the 50% line in one step' } : {}) }; }
  if (Array.isArray(i.dates)) out.weekdays = Object.fromEntries(i.dates.slice(0, 31).map(d => [d, weekday(d) || 'not a YYYY-MM-DD date']));
  if (!Object.keys(out).length) return { error: 'Give the numbers you read: spend + sales (cost per sale), spend + revenue (ROAS), net_sales + ad_spend (MER), ad_spend + new_customers (CAC), net_sales + orders (AOV), spend + leads (cost per lead), net_sales + product_costs (margin), budget_from + budget_to, or dates.' };
  return out;
}

export function answerTools() {
  return [{
    def: { name: 'calc',
      description: 'Work out a ratio from numbers you already read, in code: cost per sale (spend + sales), ROAS (spend + revenue), MER (net_sales + ad_spend), CAC (ad_spend + new_customers), AOV (net_sales + orders), cost per lead (spend + leads, against the lead line or lead_goal), product margin (net_sales + product_costs), a budget step (budget_from + budget_to, flags over 50%), and weekday names (dates). ALWAYS use it before quoting any of these; never divide in your head. Under 3 sales it says too few sales to call.',
      input_schema: { type: 'object', properties: {
        spend: { type: 'number' }, sales: { type: 'number', description: 'Purchases / orders (a count).' }, revenue: { type: 'number', description: 'Attributed revenue (Triple Whale).' },
        net_sales: { type: 'number', description: 'Store sales, net of tax.' }, ad_spend: { type: 'number', description: 'All ad spend (blended), for MER and CAC; never the spend of one ad.' }, new_customers: { type: 'number' }, orders: { type: 'number', description: 'Store orders (a count), for AOV.' },
        leads: { type: 'number' }, lead_goal: { type: 'number', description: 'The brand\'s own cost-per-lead goal, when it has one.' }, product_costs: { type: 'number' },
        budget_from: { type: 'number' }, budget_to: { type: 'number' }, dates: { type: 'array', items: { type: 'string' }, description: 'YYYY-MM-DD dates to name the weekday of.' },
        min_sales: { type: 'number', description: 'Default 3.' } } } },
    run: async (env, input) => { const r = calc(input); return r.error ? { is_error: true, text: r.error } : { text: JSON.stringify(r) }; },
  }];
}

/* ---------------- cards ---------------- */
/** A budget card that moves more than 50% in one step says so first, whatever action made it. */
export function bigBudgetStep(patch) {
  const b = patch?.before, a = patch?.after;
  if (!b || !a || typeof b !== 'object' || typeof a !== 'object') return null;
  for (const k of Object.keys(a)) {
    if (!/budget|amount/i.test(k)) continue;
    const from = num(b[k]), to = num(a[k]);
    if (from > 0 && to != null && Math.abs(to - from) / from > BIG_STEP) return { step: (to - from) / from };
  }
  return null;
}
export function flagBigBudgets(actions) {
  return actions.map(act => !act.propose ? act : {
    ...act,
    propose: async (...args) => {
      const r = await act.propose(...args);
      const big = r && !r.error ? bigBudgetStep(r.patch) : null;
      if (!big) return r;
      const tag = `BIG CHANGE (${big.step >= 0 ? '+' : ''}${Math.round(big.step * 100)}%, over the 50% line)`;
      return { ...r, big: true, summary: `${tag}: ${r.summary || ''}`.slice(0, 220), detail: `${tag}. Learning resets on a step this size; check it was asked for in exactly this size.\n${r.detail || ''}` };
    },
  });
}

/* ---------------- store ---------------- */
/** Product margin the way the Locus screens show it (lookups.js gross_margin: net sales less product costs), and Amazon. */
export function storeExtras(piv, from, to) {
  const sum = k => { let s = 0, any = false; for (const [d, v] of Object.entries(piv?.[k] || {})) if (d >= from && d <= to && v != null) { s += +v; any = true; } return any ? s : null; };
  const net = sum('netSales') ?? sum('totalSales'), cost = sum('totalProductCosts');
  const amz = sum('totalAmazonSales'), amzO = sum('totalAmazonOrders');
  /* Triple Whale's Amazon metric does not settle it either way: a brand whose Amazon orders reach Shopify through a
     sync app shows the metric empty while those orders ARE inside net sales (worker.js amazonOrdersByDay, 2026-11-16).
     So the view never says in or out on the metric alone; source_name in store_sql decides. */
  const check = "store_sql on orders_table (source_name = 'amazon' or platform = 'amazon') for the same range";
  return {
    product_margin_pct: net > 0 && cost != null ? Math.round((net - cost) / net * 1000) / 10 : null,
    product_margin_taken_out: 'product costs only (Triple Whale net sales less product costs; no shipping, fees or ad spend). The Locus margin.',
    amazon: amz > 0 ? { in_store_numbers: null, metric_sales: Math.round(amz * 100) / 100, metric_orders: amzO, say: `Triple Whale's Amazon metric shows Amazon sales for this range, which alone does not say whether they are inside these store numbers. Check ${check} before saying Amazon is in or out.` }
      : { in_store_numbers: null, say: `Cannot tell from Triple Whale's Amazon metric (empty for this range): a brand that syncs Amazon orders into Shopify shows it empty while those orders ARE in the store numbers. Check ${check}; only if there are none, say "website only".` },
  };
}
