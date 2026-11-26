/**
 * How an answer is shaped and checked before it goes out. Round 17 (2026-11-26, AI eval: most answers ran about twice
 * as long as asked, one cost per sale was worked out wrong, one client draft carried ad set names), tuned to the round
 * 20 answer standard (the first sentence is the answer, one source line written by code, a word range per type).
 *
 *   answerKind / answerNote   the type of question, its word range, its first-sentence rule and ONE short example,
 *                             told to the model with the question
 *   answerProblems            the post-step: over the range, an answer that does not start with the answer, a client
 *                             draft without its team line or with internal names, a headline over 32 characters, a
 *                             Slack fact with no link or date, Meta's own count without its label = one rewrite round
 *   rewriteOk                 a rewrite never goes out if it dropped a warning (wait window, anchor, broken
 *                             pixel or page) or the "---- draft ----" line the first answer had
 *   finishAnswer / sourceLine the ONE source line, written by code from the reads that worked and that the answer
 *                             used (where, which dates; tax and Amazon only where the read itself shows them); the
 *                             model's "Assumed:" line is folded into it. Never on a one-line card reply.
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
 * is read: a prompt the app writes (the Monday review, a scheduled question) passes noCheck and gets none of this.
 * Word counts leave out cards, charts, tables and the source line. Ad windows are never copied here: they are the
 * brand's own ad rules (Brand settings, /api/brand/rules), read by the assistant.
 * Lists are NOT cut by code (round 20 review: a cut hid warnings, fix steps and the changes on a waiting card, inside
 * a draft too, behind a "tap to see all" that nothing served); the note asks for the top 3 and the word range does
 * the rest. The type is read from the person's own words: an "[ACCESS RULE: ...]" the app puts in front is skipped.
 * A client's own login (opts.client) gets its own shape: the word range and answer-first only, no team draft line,
 * no Slack or Meta-label checks and no code-written source line (its sources carry the agency's internal names).
 * Plugs into ask/engine.js through config hooks (answerNote, answerCheck, rewriteOk, finishAnswer, dateLine) and
 * into strategist.js tools.
 */

export const MIN_SALES = 3;
/* The house line for a lead campaign (memory lead-cpl-kpi; morningcard.js LEAD_CPL_MAX is the same $0.75). */
export const LEAD_CPL = { low: 0.5, high: 0.75 };
export const BIG_STEP = 0.5;
export const HEADLINE_MAX = 32;
export const LIST_MAX = 3;

/* ---------------- the types of answer ---------------- */
/* min / max words of writing (cards, charts, tables and the source line not counted), what the first sentence is,
   and one short example. Made-up brand only. */
export const KINDS = {
  lookup: { min: 15, max: 40, label: 'a number lookup', first: 'the number first, then one comparison, then one so-what only if it is off',
    ex: 'Harbor Golf sold $4,210 yesterday, 18% under its normal Tuesday ($5,140, last 28 days). No email went out, which is most of the gap.' },
  list: { min: 15, max: 60, label: 'a short ranked list (top 3)', first: 'the top item and its number first',
    ex: 'The polo try-on video leads at $28 a sale (11 sales), then the hat bundle still at $34 (6) and the founder story at $41 (4).' },
  why: { min: 50, max: 70, label: 'why something changed', first: 'the change with both numbers first, then 1 to 3 causes each with its number and date, then whether it needs action',
    ex: 'Sales fell 22%, $31,400 to $24,500 (Nov 12 to 18 against the 28 days before). Two causes: prospecting went from $600 to $400 a day on Nov 11, about 1,900 fewer visits, and no email went out Nov 14 to 17 (usually $3,100 a week). Cost per sale held, so the fix is the email, not the ads.' },
  do: { min: 60, max: 80, label: 'what to do', first: 'the ONE move first (or "Hold" and the date to look again), then why in 2 or 3 numbers read at ad set level first; a change goes on a card',
    ex: 'Raise New people from $400 to $500 a day. The set ran $38 a sale against the $47 goal over 9 days with 31 sales, past its wait window, and frequency is 1.6, so there is room. Past buyers stays as it is. Look again Monday Nov 30. Tap Apply to do it.' },
  change: { min: 5, max: 40, label: 'a change (the card does the talking)', first: 'what the card will do first',
    ex: 'Card up to pause the hat bundle ad: it stops spending at once and the Change Log can undo it. Tap Apply to do it.' },
  creative: { min: 10, max: 80, label: 'creative ideas (up to 3, one line each)', first: 'the first idea first; up to 3 ideas, one line each, headlines 32 characters or less; the detail goes in the card',
    ex: '1. Rain round: the polo stays dry on a wet tee box. Headline "Rain round, dry polo".\n2. Caddie test: a caddie picks the hat from ten. Headline "The caddie picked this one".\n3. Bag drop: four colors on one cart. Headline "Four colors, one bag".' },
  make: { min: 10, max: 100, label: 'making something', first: 'what was made, with its link, first',
    ex: 'Brief 418 is in Asana with the angle, three concepts and one ad each: <link>.' },
  draft: { min: 60, max: 110, label: 'a client message draft', first: 'one team line "Draft for #<channel>, not sent", then the "---- draft ----" line, then the message, the answer to their question first',
    ex: 'Draft for #harbor-golf, not sent\n---- draft ----\nHi Sam, from Nov 1 to 25 the store did $84,200 on $21,000 of ad spend, a 4.0x MER. The Black Friday ads start tonight with the 30% offer. ...' },
  health: { min: 20, max: 80, label: 'a health check', first: '"Nothing off." when nothing is off; otherwise the one thing off and its number first',
    ex: 'Nothing off. Sales, spend and MER for the last 28 days sit in their normal range, and every ad set is on goal or still in its wait window.' },
  facts: { min: 20, max: 60, label: 'a fact from Slack or the notes', first: 'the fact first, then who said it, when, and the link',
    ex: 'The Black Friday offer is 30% off sitewide plus a free hat over $100. Sam said it in #harbor-golf on Nov 11: <link>.' },
  refusal: { min: 15, max: 50, label: 'a refusal', first: 'what you will not do first, then where that is done instead',
    ex: 'I do not change billing. The owner does that in Stripe or the Ledger.' },
};
/* A client's own login has no cards and no actions, and reads no internal names: its change and do types say what
   the team does instead, with no card, Apply, set name or wait window. */
export const CLIENT_KINDS = {
  change: { label: 'a change request', first: 'that changes to the ads are made by the team, then what to tell them',
    ex: 'Changes to your ads are made by your team, not from here. Tell them "pause the hat bundle ad" and they will take it from there.' },
  do: { first: 'the ONE thing worth doing first (or "Hold" and when to look again), then why in 2 or 3 numbers, in plain words',
    ex: 'Keep the Black Friday ads running as they are. They brought sales at $38 each against your $47 goal over the last 9 days, 31 sales in all. Your team will look again on Monday, Nov 30.' },
};
const kindText = (kind, client) => ({ ...KINDS[kind], ...(client ? CLIENT_KINDS[kind] || {} : {}) });
/* Kept for callers that read a plain ceiling per kind. */
export const BUDGETS = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.max]));

/* The person's own words: worker.js puts "[ACCESS RULE: ...]" in front of a limited person's question, and its words
   ("compare") must not decide the type. */
export const ownWords = s => String(s || '').replace(/^\s*\[ACCESS RULE:[^\]]*\]\s*/i, '');
const norm = s => ownWords(s).replace(/\s+/g, ' ').trim();
/** A question answered Yes or No ("Is", "Did", "Should"...), not a request ("Can you...") and not "A or B?". */
export function isYesNo(question) {
  const q = norm(question).replace(/^(?:on|for) [^,]{1,40}, /i, '');
  return /^(is|are|was|were|did|does|do|has|have|had|can|could|will|would|should|shall)\b/i.test(q)
    && !/^\w+\s+(you|u)\b/i.test(q) && !/\bor\b/i.test(q);
}
/** A question whose answer is a number ("how much", "what was the revenue"), so the first sentence must hold it. */
export function isNumberQ(question) {
  const q = norm(question);
  return /^(?:how (?:much|many)\b|what (?:is|was|are|were) (?:[\w'&-]+ ){0,4}?(?:revenue|sales|spend|mer|roas|cpa|aov|cac|orders?|costs?|budget|margin|rate|ctr|cpm|cpc|profit|total|count|frequency)\b)/i.test(q);
}
/** The number of items asked for ("top 5", "seven headlines"), when it is over the list cap. */
const NUMS = { four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 };
export function askedCount(question) {
  const m = norm(question).match(/\b(\d{1,2}|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\s+(?:[\w-]+\s+){0,2}?[\w-]+s\b/i);
  const n = m ? (NUMS[m[1].toLowerCase()] || +m[1]) : 0;
  return n > LIST_MAX ? Math.min(n, 30) : 0;
}

export function answerKind(question, { client = false } = {}) {
  const q = norm(question);
  const more = /\b(list (them )?all|every one|full list|all of them|in full|all \d+|show me everything|show all|see all|the rest|the others|the remaining|the other (\d+|two|three|four|five|six|seven|eight|nine|ten))\b/i.test(q);
  const pick = kind => ({ kind, words: KINDS[kind].max * (more ? 2 : 1), min: KINDS[kind].min, more, label: KINDS[kind].label });
  /* A client draft = asked to WRITE something (draft / write / reword / compose / reply to / respond to) for a client
     or customer, or to send or paste. "What did the client say in their last message?" is not one. */
  const writing = /\b(draft|write|rewrite|reword|compose|reply to|respond to)\b/i.test(q) || /\b(give me|get me|need|want)\b[^.?!]{0,30}\b(message|note|reply|update|email|post|text)\b/i.test(q);
  /* A client's own login writing to its customers is making something, not a team draft for a client channel. */
  if (writing && /\b(clients?|customers?|send|paste)\b/i.test(q)) return pick(client ? 'make' : 'draft');
  if (/^(please |can you |could you )?(on [^,]+, )?(turn (on|off)|pause|resume|raise|lower|increase|decrease|cut|change|set|switch|rename|duplicate|launch|stop|start|move|add|remove)\b/i.test(q)) return pick('change');
  if (/\b(ideas?|angles?|concepts?|hooks?|headlines?|taglines?)\b/i.test(q)) return pick('creative');
  if (/^(please |can you |could you )?(write|make|create|build|fill in|generate|design|draft)\b/i.test(q)) return pick('make');
  if (/\bshould\b|\bwhat would you\b|\bworth fixing\b|\bdo first\b|\brecommend|\bnext (batch|step|test)|\bpriorit|\bwhat (to|do (i|we)) (do|test|make)\b|\bwhich .*\b(best|working|winning|worth)\b/i.test(q)) return pick('do');
  if (/\bwhy\b|\bwhat changed\b|\bwhat happened\b|\bdropped\b|\bfell\b|\bspiked?\b|\bjumped\b|\bworst\b|\bagainst (last|the)\b|\bvs\.?\b|\bcompared?\b|\btrend|\bdid .* match\b/i.test(q)) return pick('why');
  if (/\banything (off|wrong|weird|broken|unusual)\b|\bhealth\b|\bon pace\b|\bpace\b|\bsummar|\brecap\b|\bnormal\b|\bhow (is|are|was|were|did) [^?]{0,40}\b(doing|going|look(ing)?|do)\b/i.test(q)) return pick('health');
  if (/\b(said|say|says|tell|told|agreed|asked|slack|launched|link|links|where can|when does|when is|who)\b/i.test(q)) return pick('facts');
  if (/\btop \d+\b|\bwhich \d+\b|\brank/i.test(q)) return pick('list');
  if (/^(what|how much|how many|which|when|was|were|did|is|are)\b/i.test(q) && q.split(' ').length <= 40) return pick('lookup');
  return pick('do');
}

export function answerNote(question, { client = false } = {}) {
  const b = answerKind(question, { client }), K = kindText(b.kind, client);
  const range = b.more ? `up to ${b.words}` : `${b.min} to ${b.words}`;
  const yn = isYesNo(question) && !['draft', 'change', 'make', 'creative'].includes(b.kind) ? ' It is a yes or no question: the first word is Yes or No.' : '';
  const draft = b.kind === 'draft' ? ` The team line, then a line exactly "---- draft ----", then the message (${b.min} to ${b.words} words): no internal ad set or campaign names, the same full date range as the store numbers, never sent by you.` : '';
  const list = b.more ? 'They asked for the full list: give it.' : `Lists: the top ${askedCount(question) || LIST_MAX}, but never leave out a warning${client ? '' : ', a fix step or a change the card will make'}.`;
  if (client) return `[Answer type: ${K.label}, ${range} words (charts not counted). First sentence = the answer: ${K.first}.${yn} ${list} No cards, no Apply and no internal ad set or campaign names: this login cannot change anything. Say in a few words which page or period the numbers came from. American English. Example: ${JSON.stringify(K.ex)}]`;
  return `[Answer type: ${K.label}, ${range} words (cards, charts and the source line not counted). First sentence = the answer: ${K.first}.${yn}${draft} ${list} Never write where the numbers came from: code adds the source line from what you read. If you assumed something (a date range, a brand, which of two readings), end with one line "Assumed: ...". American English. Ask back only when two readings give different numbers. Meta's own purchases or ROAS only as "Meta's own count, second opinion". Example: ${JSON.stringify(K.ex)}]`;
}

/* Lines that are not the writing: the code-written source line, the model's assumption line, the list tail, the
   card line. Fenced blocks (charts) and table rows do not count either. */
const NOT_WRITING = /^\s*(?:\*{0,2})(?:source|sources|assumed|assumption|assumptions)\s*:|^\s*Nothing has changed yet\. Tap Apply/i;
/** Words a person reads: fenced blocks (charts), table rows, the source line and card lines do not count. */
export function wordCount(text) {
  const body = String(text || '').replace(/```[\s\S]*?```/g, ' ').split('\n').filter(l => !/^\s*\|/.test(l) && !NOT_WRITING.test(l)).join(' ');
  return body.split(/\s+/).filter(w => /[\p{L}\p{N}$%]/u.test(w)).length;
}

const DRAFT_LINE = /^-{2,}\s*draft\s*-{2,}\s*$/im;
export function splitDraftText(text) {
  const s = String(text || ''), m = s.match(DRAFT_LINE);
  return m ? { answer: s.slice(0, m.index).trim(), draft: s.slice(m.index + m[0].length).trim() } : { answer: s.trim(), draft: '' };
}
const joinDraft = (head, draft) => draft ? `${head}\n---- draft ----\n${draft}` : head;

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

/* ---------------- what the answer must look like ---------------- */
const writingOf = text => String(text || '').replace(/```[\s\S]*?```/g, ' ').split('\n').filter(l => l.trim() && !/^\s*\|/.test(l) && !NOT_WRITING.test(l)).join('\n').trim();
/** The first sentence of the writing (markdown list marks and bold taken off). */
export function firstSentence(text) {
  const s = writingOf(text).replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s+/, '').replace(/\*\*/g, '');
  const m = s.match(/^[\s\S]*?(?:[.!?](?=\s|$)|\n|$)/);
  return (m ? m[0] : s).trim();
}
const PREAMBLE = /^(?:looking at|based on|after (?:checking|looking|reading)|i (?:checked|looked|read|pulled|went|dug|reviewed)|here(?:'s| is) (?:what|the breakdown|a breakdown|an overview)|so,|great question|good question|let me|to answer|first,? i)\b/i;
const REFUSAL = /^(?:i (?:can(?:no|')t|cannot|won't|will not|do not|don't|am not able to)\s+(?:change|do|make|send|move|touch|run|edit|delete|pay|refund|charge|give)|that(?:'s| is) not something i|not something i)\b/i;
/** A headline written in the answer: quoted after "Headline", or after "Headline:" up to the line or sentence end. */
export function headlinesIn(text) {
  const s = String(text || ''), out = [];
  for (const m of s.matchAll(/\bheadlines?\s*(?::|=|is|reads)?\s*["“]([^"”\n]{1,200})["”]/gi)) out.push(m[1].trim());
  for (const m of s.matchAll(/\bheadlines?\s*:\s*(?!["“])([^\n"“]{1,200}?)\s*(?=$|\n|\.(?:\s|$)|;|\|)/gim)) out.push(m[1].trim());
  return [...new Set(out)];
}
const HAS_LINK = /https?:\/\/|<https?:/i;
const HAS_DATE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\b|\b(?:yesterday|today|this morning|last night|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
/** Meta's own purchase / ROAS count, quoted without the "Meta's own count, second opinion" label. */
export function unlabelledMeta(text) {
  for (const sent of writingOf(text).split(/(?<=[.!?])\s+|\n/)) {
    if (/Meta's own count, second opinion/i.test(sent) || /\b(?:triple whale|TW)\b/i.test(sent)) continue;
    if (/\bMeta(?:'s)?\s+(?:own\s+)?(?:says|shows|showed|reports?|reported|claims?|claimed|counts?|counted|attributes|purchases?|sales|ROAS|conversions?|results)\b/i.test(sent)
      && /\b(?:purchases?|sales|ROAS|conversions?|results)\b/i.test(sent)) return sent.trim().slice(0, 80);
  }
  return null;
}

/** The post-step: what is wrong with a finished answer, as plain instructions for one rewrite. Empty = send it.
 *  `reads` is what the tools read on the way (a Slack fact must then carry its link and date). */
export function answerProblems(answer, question, { slack = 1.2, reads = [], client = false } = {}) {
  let b = answerKind(question, { client });
  const out = [];
  const { answer: head, draft } = splitDraftText(answer);
  if (b.kind !== 'draft' && REFUSAL.test(firstSentence(answer))) b = { ...b, kind: 'refusal', words: KINDS.refusal.max, label: KINDS.refusal.label };
  if (b.kind === 'draft') {
    const text = draft || head;
    const n = wordCount(text);
    if (n > b.words * slack) out.push(`The client draft is ${n} words; make it ${b.words} or fewer (keep the numbers that answer the client, drop the rest).`);
    if (!draft) out.push('Put one team line "Draft for #<the client channel>, not sent" first, then a line exactly "---- draft ----", then the message.');
    else if (!/^draft for #[\w.-]+,? not sent\.?$/i.test(writingOf(head).split('\n')[0] || '')) out.push('The line above the draft must be exactly "Draft for #<the client channel>, not sent" (one line, nothing else above the draft).');
    /* Only the text after "---- draft ----" is the client's; the note above it is for the team and may name sets. */
    const leaks = draft ? clientLeaks(draft) : [];
    if (leaks.length) out.push(`The client text names internal things: ${leaks.join('; ')}. Say it in the client's words instead ("the ads for new customers", "the Black Friday ads"), no names, numbers or ids of ad sets, campaigns or tests.`);
  } else {
    const n = wordCount(answer);
    if (n > b.words * slack) out.push(`It is ${n} words; the limit for ${b.label} is ${b.words}. Keep the answer, the numbers that decide it, any link or card line, every warning (a wait window, the anchor of a working set, a big change, anything broken) and every step; drop method, recap and background.`);
    const first = firstSentence(answer);
    if (!['make', 'change'].includes(b.kind)) {
      if (PREAMBLE.test(first)) out.push('Start with the answer itself, not how you found it: the first sentence is the answer.');
      else if (isYesNo(question) && !['creative', 'refusal'].includes(b.kind) && !/^(?:yes|no|not|nope|hold|nothing|none)\b/i.test(first)) out.push('It is a yes or no question: the first word is Yes or No.');
      else if (b.kind === 'lookup' && isNumberQ(question) && !/\d|\b(?:no|none|zero|nothing|nobody)\b/i.test(first)) out.push('Start with the number: the first sentence of a number question holds the number.');
    }
    if (['creative', 'make'].includes(b.kind)) {
      const long = headlinesIn(answer).filter(x => x.length > HEADLINE_MAX);
      if (long.length) out.push(`Headlines are ${HEADLINE_MAX} characters or less: ${long.map(x => `"${x}" is ${x.length}`).join('; ')}.`);
    }
    if (b.kind === 'creative') {
      const wordy = writingOf(answer).split('\n').filter(l => /^\s*(?:[-*•]|\d{1,2}[.)])\s+/.test(l) && wordCount(l) > 30);
      if (wordy.length) out.push('One line per idea (30 words or less); the detail goes in the card.');
    }
    if (!client && b.kind === 'facts' && (reads || []).some(r => r && !readFailed(r) && /^(search_slack|read_thread)$/.test(r.name))) {
      if (!HAS_LINK.test(answer)) out.push('A fact from Slack carries its link: add the link to the message you quoted.');
      if (!HAS_DATE.test(answer)) out.push('Say when it was said (the date of the message) and who said it.');
    }
  }
  const meta = client ? null : unlabelledMeta(draft ? `${head}\n${draft}` : answer);
  if (meta) out.push(`Meta's own purchases or ROAS may appear only labelled "Meta's own count, second opinion" ("${meta}"); the numbers are Triple Whale's.`);
  return out;
}

/* ---------------- the rewrite: what it may never lose ---------------- */
/* Words that carry a warning the person must read before tapping (house rules: a pause inside the wait window or of
   the anchor of a working set is told first; a broken pixel or page outranks any budget move). */
const WARN = /\b(?:wait(?:ing)? window|anchor|still learning|learning (?:phase|resets?)|big change|warning|careful|broken|stopped (?:firing|tracking|working)|not (?:firing|fired|tracking|tracked|loading|loaded)|(?:has|have|had)n't (?:fired|tracked|loaded)|out of stock|sold out|disabled|spending limit|rejected|restricted|404|is down|went down|cannot be undone|over the 50% line|too few sales to call)\b/gi;
/* "No anchor or wait window issue." names both words and warns of neither: a warning word right after no / not /
   without (or "no X or") does not count as a warning. */
const NEGATED = /\b(?:no|not|without|nor|never|isn't|aren't)\s+(?:(?:the|an?|any|its|their)\s+)?(?:[\w-]+(?:\s+[\w-]+)?\s+(?:or|nor)\s+)?(?:(?:the|an?|any|its|their)\s+)?$/i;
export function warnings(text) {
  const s = String(text || ''), out = new Set();
  for (const m of s.matchAll(WARN)) {
    const before = s.slice(Math.max(0, m.index - 60), m.index).split(/[.!?\n]/).pop();
    if (!NEGATED.test(before)) out.add(m[0].toLowerCase());
  }
  return out;
}
const LIST_LINE = /^\s*(?:[-*•]|\d{1,2}[.)])\s+\S/;
const listLines = text => String(text || '').split('\n').filter(l => LIST_LINE.test(l)).length;
/** A rewrite goes out only when it kept every warning the first answer had (said as a warning, not "no anchor"), its
 *  "---- draft ----" line and a draft body (at least the draft's minimum, or all of a shorter one), and, with a card
 *  waiting, every numbered or bulleted line (the changes on a waiting card are said in the words). */
export function rewriteOk(before, after, question = '', { cards = 0 } = {}) {
  const b = String(before || ''), a = String(after || '');
  if (DRAFT_LINE.test(b)) {
    if (!DRAFT_LINE.test(a)) return false;
    const db = wordCount(splitDraftText(b).draft), da = wordCount(splitDraftText(a).draft);
    if (da < Math.min(KINDS.draft.min, db)) return false;
  }
  const kept = warnings(a);
  for (const w of warnings(b)) if (!kept.has(w)) return false;
  if (cards > 0 && listLines(a) < listLines(b)) return false;
  return true;
}

/* ---------------- the source line: code writes it ---------------- */
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const md = ymd => `${MON3[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}`;
/** "Nov 1 to 25", "Oct 29 to Nov 25", "Nov 16", with the year only when the two years differ. */
export function rangeText(from, to) {
  if (!isYmd(from)) return '';
  if (!isYmd(to) || to === from) return md(from);
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${md(from)}, ${from.slice(0, 4)} to ${md(to)}, ${to.slice(0, 4)}`;
  return from.slice(0, 7) === to.slice(0, 7) ? `${md(from)} to ${+to.slice(8, 10)}` : `${md(from)} to ${md(to)}`;
}
/* Where each read comes from, in plain words. A read not named here (memory, skills, notes, cards) is not a source. */
const VIEW_SRC = { store: 'Triple Whale store', account: 'Triple Whale store', overview: 'Triple Whale store', series: 'Triple Whale store and Meta',
  customers: 'Triple Whale orders', what_worked: 'Triple Whale and Meta', creatives: 'Meta', creator_sets: 'Meta spend and Triple Whale sales', changes: 'the Change Log',
  tests: 'Locus tests', angles: 'Locus tests', google_ads: 'Google Ads', website: 'GA4', search: 'Search Console', tiktok_ads: 'TikTok',
  klaviyo: 'Klaviyo', stock: 'Shopify stock', calendar: 'the Locus calendar', leaks: 'the leak finder', market: 'Mobius Pulse and Breezeway',
  plan: 'the month plan', survey: 'the post-purchase survey', scenarios: 'Locus scenarios' };
/* Store reads (Amazon is said for each). Tax: only the views whose code takes tax out (strategist.js store: storePeriod
   "Revenue is net of tax"; series: netSales less totalNetTaxes). account, overview and customers say nothing on tax. */
const STORE_VIEWS = new Set(['store', 'account', 'overview', 'series', 'customers']);
const TAX_OUT_VIEWS = new Set(['store', 'series']);
const LAST_CLICK_VIEWS = new Set(['what_worked', 'account']);
/* Tax in a store_sql, read from the SQL itself: a tax column subtracted = tax out; order_revenue without that = tax in. */
const SQL_TAX_OUT = /-\s*(?:sum\s*\(\s*)?(?:\w+\.)?(?:taxes|total_tax(?:es)?|tax(?:_amount|_price)?)\b/i;
function sqlTax(sql) {
  if (SQL_TAX_OUT.test(sql)) return 'sales with tax out';
  if (/\border_revenue\b/i.test(sql)) return 'sales with tax in';
  return '';
}
/* The column bare or wrapped (lower(source_name), o.platform), the value plain or a LIKE pattern ('%amazon%'). */
const AMZ_COL = String.raw`(?:\w+\s*\(\s*)?(?:\w+\.)?(?:source_name|platform)(?:\s*\))?`;
const AMZ_VAL = String.raw`\(?\s*'%?amazon%?'`;
const AMZ_OUT = new RegExp(String.raw`${AMZ_COL}\s*(?:!=|<>|not\s+in|not\s+i?like)\s*${AMZ_VAL}|\bnot\s*\(?\s*${AMZ_COL}\s*(?:=|i?like|in)\s*${AMZ_VAL}`, 'i');
const AMZ_IN = new RegExp(String.raw`${AMZ_COL}\s*(?:=|in|i?like)\s*${AMZ_VAL}`, 'i');
function sqlAmazon(sql) {
  if (AMZ_OUT.test(sql)) return 'website only (Amazon out)';
  if (AMZ_IN.test(sql)) return 'Amazon orders checked';
  return 'Amazon not split out';
}
function sourceOf(r) {
  const i = r.input || {}, n = r.name;
  if (n === 'read_app') {
    if (!VIEW_SRC[i.view]) return null;
    const defs = [];
    if (TAX_OUT_VIEWS.has(i.view)) defs.push('sales with tax out');
    if (STORE_VIEWS.has(i.view)) defs.push('Amazon not split out');
    if (LAST_CLICK_VIEWS.has(i.view)) defs.push('Triple Whale last click');
    return { src: VIEW_SRC[i.view], defs };
  }
  if (n === 'store_sql') { const sql = String(i.sql || ''); return { src: 'Triple Whale orders', defs: [sqlTax(sql), sqlAmazon(sql)].filter(Boolean) }; }
  if (n === 'meta_read') return { src: 'Meta' };
  if (n === 'search_slack' || n === 'read_thread') return { src: 'Slack' };
  if (n === 'web_lookup') return { src: 'the web' };
  if (n === 'check_now') return { src: 'a live Locus check' };
  if (/^klaviyo/.test(n)) return { src: 'Klaviyo' };
  if (n === 'locus_get') {
    const p = String(i.path || '');
    if (/\/api\/brand\/rules/.test(p)) return { src: "the brand's ad rules" };
    if (/\/api\/buyer-list/.test(p)) return { src: 'Locus ad calls' };
    return { src: 'Locus' };
  }
  if (r.sql) return { src: 'Locus data' };
  return null;
}
/** A read that did not work: a tool error, or a view that answered with {"error": ...} (read_app never sets is_error:
 *  a range with no finished days, Klaviyo not connected, a view this surface does not have). */
export function readFailed(r) {
  if (!r || r.ok === false) return true;
  const t = String(r.text || '').trim();
  if (!t) return false;
  if (r.name === 'read_app' && !/^[[{]/.test(t)) return true;
  if (t[0] !== '{') return false;
  try { const j = JSON.parse(t); return !!j && typeof j === 'object' && (j.error != null || j.ok === false || j.connected === false); }
  catch { return /^\{\s*"error"\s*:/.test(t); }
}
/* The dates a read COVERED: the range it says it returned wins over the one it was asked for (the store view ends at
   yesterday, so a month-to-date read asked up to today covers up to yesterday). The input is only the fallback. */
function datesOf(r) {
  const i = r.input || {};
  const t = String(r.text || '');
  const m = t.match(/"from"\s*:\s*"(\d{4}-\d{2}-\d{2})"[\s\S]{0,400}?"to"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
  if (m) return rangeText(m[1], m[2]);
  if (isYmd(i.from)) return rangeText(i.from, isYmd(i.to) ? i.to : i.from);
  if (isYmd(i.date)) return rangeText(i.date, i.date);
  if (+i.days > 0) return `last ${+i.days} days`;
  return '';
}
/* calc counts as "worked out in code" only when it worked out a ratio, not when it only named weekdays. */
const CALC_RATIO = ['spend', 'sales', 'revenue', 'net_sales', 'ad_spend', 'new_customers', 'leads', 'orders', 'product_costs', 'budget_from', 'budget_to'];
const calcRatio = r => { try { return Object.keys(calc(r.input || {})).some(k => k !== 'weekdays' && k !== 'error') && CALC_RATIO.some(k => (r.input || {})[k] != null); } catch { return false; } };

/* Which reads the answer used: the numbers it quotes (100 or more, not a year; any decimal) are looked for in what each
   read returned. A read with no text to look in is kept; when no read holds any of them, all are kept. */
const NUM = /(?<![\w.])\d[\d,]*(?:\.\d+)?/g;
function answerNumbers(text) {
  const out = [];
  for (const m of String(text || '').replace(/```[\s\S]*?```/g, ' ').matchAll(NUM)) {
    const raw = m[0].replace(/,/g, ''), v = +raw, dec = (raw.split('.')[1] || '').length;
    if (!isFinite(v)) continue;
    if (dec) { if (v > 0) out.push({ v, dec }); continue; }
    if (v >= 100 && !(v >= 1990 && v <= 2099)) out.push({ v, dec: 0 });
  }
  return out;
}
function holds(read, nums) {
  /* read.nums: every number of the whole read (the engine keeps them; read.text is cut at 16,000 characters). */
  const vals = Array.isArray(read.nums) ? read.nums.filter(v => isFinite(v)) : [];
  for (const m of String(read.text || '').matchAll(NUM)) { const v = +m[0].replace(/,/g, ''); if (isFinite(v)) vals.push(v); }
  return nums.some(n => vals.some(x => n.dec ? Math.abs(Math.round(x * 10 ** n.dec) / 10 ** n.dec - n.v) < 1e-9 || Math.abs(Math.round(x * 100 * 10 ** n.dec) / 10 ** n.dec - n.v) < 1e-9
    : Math.abs(x - n.v) <= Math.max(0.5, n.v * 0.006)));
}

/* Reads that hold words, not figures (Slack, the Change Log) are judged by what the answer took from them, never by a
   number they happen to contain. Slack: its link, a #channel it holds, or the answer saying who said what. The Change
   Log: a date the answer names that the log holds. */
const TEXT_SRC = new Set(['Slack', 'the Change Log']);
const MON_IX = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function answerDays(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:\s+(?:to|through|-)\s+(\d{1,2})\b)?/gi)) {
    const mo = MON_IX[m[1].toLowerCase()], a = +m[2], z = Math.min(31, m[3] ? +m[3] : a);
    for (let d = a; d <= z; d++) out.add(`-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}
function textReadUsed(r, src, answer) {
  const t = String(r.text || ''), a = String(answer || '');
  if (src === 'Slack') {
    for (const m of a.matchAll(/https?:\/\/[^\s|>)]+/g)) if (t.includes(m[0])) return true;
    for (const m of a.matchAll(/#[a-z0-9][\w.-]{1,79}/gi)) if (t.toLowerCase().includes(m[0].toLowerCase())) return true;
    return /\b(?:slack|said|says|told|wrote|posted|agreed)\b/i.test(a);
  }
  for (const d of answerDays(a)) if (t.includes(d)) return true;
  return false;
}
const andList = a => a.length <= 1 ? (a[0] || '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
/** The one source line, from the reads that worked (and, given the answer, the ones it used): for each place, its
 *  dates and only the definitions that read shows (tax, Amazon, last click). */
export function sourceLine(reads = [], assumed = [], { answer = null } = {}) {
  let calcUsed = false;
  let used = [];
  for (const r of reads || []) {
    if (!r || r.action || readFailed(r)) continue;
    if (r.name === 'calc') { if (calcRatio(r)) calcUsed = true; continue; }
    const s = sourceOf(r);
    if (s) used.push({ r, s });
  }
  if (answer != null) {
    const nums = answerNumbers(answer);
    const has = r => !!String(r.text || '').trim() || (Array.isArray(r.nums) && r.nums.length > 0);
    const words = used.filter(({ s }) => TEXT_SRC.has(s.src)), figs = used.filter(({ s }) => !TEXT_SRC.has(s.src));
    const keptWords = words.filter(({ r, s }) => !has(r) || textReadUsed(r, s.src, answer));
    let keptFigs = figs;
    if (nums.length) { const k = figs.filter(({ r }) => !has(r) || holds(r, nums)); if (k.some(({ r }) => has(r))) keptFigs = k; }
    else if (keptWords.length) keptFigs = figs.filter(({ r }) => !has(r));
    /* Nothing left at all: every read is kept, as before. */
    if (keptWords.length || keptFigs.length) used = used.filter(u => keptWords.includes(u) || keptFigs.includes(u));
  }
  /* One segment per place: "Triple Whale store, Nov 1 to 25, sales with tax out, Amazon not split out". */
  const groups = new Map();
  for (const { r, s } of used) {
    const g = groups.get(s.src) || { dates: [], defs: [] };
    const d = datesOf(r); if (d && !g.dates.includes(d)) g.dates.push(d);
    for (const x of s.defs || []) if (x && !g.defs.includes(x)) g.defs.push(x);
    groups.set(s.src, g);
  }
  const as = (assumed || []).map(a => String(a).replace(/[.\s]+$/, '')).filter(Boolean);
  if (!groups.size) return as.length ? `Assumed: ${as.join('; ')}.` : '';
  const plain = [...groups.values()].every(g => !g.dates.length && !g.defs.length);
  const segs = plain ? [andList([...groups.keys()])]
    : [...groups.entries()].map(([src, g]) => [src, g.dates.slice(0, 3).join(' and '), ...g.defs].filter(Boolean).join(', '));
  if (calcUsed) segs.push('worked out in code');
  return `Source: ${segs.join('; ')}.${as.length ? ` Assumed: ${as.join('; ')}.` : ''}`;
}
/** The last step: any source line the model wrote goes, its "Assumed:" lines fold into the one line code writes, and
 *  that line sits at the end of the team's part (above a client draft, never inside it). A one-line reply over a
 *  waiting card ("Task ready: ... Tap Apply to add it.") gets no source line: the card is the reply. */
export function finishAnswer(answer, { reads = [], cards = 0 } = {}) {
  if (!answer) return answer;
  const { answer: head0, draft } = splitDraftText(answer);
  const assumed = [], links = [];
  const head = head0.split('\n').filter(l => {
    const a = l.match(/^\s*(?:\*{0,2})(?:assumed|assumption|assumptions)\s*:\s*\**\s*(.+)$/i);
    if (a) { assumed.push(a[1].replace(/\*+$/, '').trim()); return false; }
    if (!/^\s*(?:\*{0,2})(?:source|sources)\s*:/i.test(l)) return true;
    /* A link on the model's own source line (a Slack fact's link) stays: only the words of that line go. */
    for (const m of l.matchAll(/<https?:[^>\n]+>|\[[^\]\n]*\]\(https?:[^)\s]+\)|https?:\/\/[^\s<>()|]+/gi)) links.push(m[0]);
    return false;
  }).join('\n').replace(/\s+$/, '');
  const urlOf = x => (x.match(/https?:\/\/[^\s<>()|]+/) || [x])[0];
  const keepLinks = [...new Set(links)].filter(x => !head.includes(urlOf(x)));
  const oneLine = cards > 0 && !draft && head.split('\n').filter(l => l.trim() && !/^\s*Nothing has changed yet\. Tap Apply/i.test(l)).length <= 1;
  const line = oneLine ? (assumed.length ? `Assumed: ${assumed.map(a => a.replace(/[.\s]+$/, '')).join('; ')}.` : '') : sourceLine(reads, assumed, { answer: [head, ...keepLinks, draft].join('\n') });
  const tail = [keepLinks.length ? `Link: ${keepLinks.join(' ')}` : '', line].filter(Boolean).join('\n');
  const team = tail ? (head ? `${head}\n\n${tail}` : tail) : head;
  return draft ? joinDraft(team, draft) : team;
}

/* ---------------- dates ---------------- */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
export const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekday = ymd => ok(ymd) ? DAYS[new Date(`${ymd}T12:00:00Z`).getUTCDay()] : null;
const short = ymd => `${weekday(ymd).slice(0, 3)} ${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}`;

/** The date block: today by name, the last 14 days by name (never worked out in the model's head), and "normal". */
export function dateLine(today, { client = false } = {}) {
  if (!ok(today)) return `Today is ${today}.`;
  const days = Array.from({ length: 14 }, (_, i) => short(addDays(today, -i - 1)));
  return `Today is ${weekday(today)}, ${MON[+today.slice(5, 7) - 1]} ${+today.slice(8, 10)}, ${today.slice(0, 4)} (${today}). The current month is ${today.slice(0, 7)}.\n`
    + `The last 14 days: ${days.join(', ')}. ${client ? 'Name the weekday of no other date unless a tool gave it.' : "For any other date's weekday call calc with dates; never work a weekday out yourself."}\n`
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
