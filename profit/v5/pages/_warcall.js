/* War Room v2: the math, as pure functions (no fetch, no DOM). Both War Room pages use it, and a later Slack port can.

   Inputs are the stored check-in records (GET /api/standing): per brand today, week, so_far, kpi, hold, goal, the
   modes (watch, client_approve, no_sales, mode) and meta {camps[], camp, on, limit, limit_src}.

   What it works out, per brand:
     windows    the store in three windows: Since last check-in, Today, This week (sales, spend, MER)
     light      the store light, the gate: green (raises allowed, cuts held), amber (cuts only), red (cuts only, and the
                biggest spender is cut when no campaign qualifies)
   THE NOW DECIDES (rule w2): every call, the store light and each campaign, is made on Since last check-in and Today.
   This week is shown as context: it only breaks a tie (Since and Today disagree) or adds a note, and never blocks a
   raise on its own. One bad day does not decide what happens now. The minimum spend guards stay, so a tiny window
   (under MIN_STORE_SPEND today, under MIN_SINCE_SPEND or MIN_CAMP_SPEND since) never decides.
     camps      every live campaign with its own three windows and its own ROAS in each (Triple Whale attributed, last
                click), its own call (Raise 50%, Raise 25%, Hold, Cut 25%, Put it back) against the campaign ROAS line,
                and the guards (pace, Meta limit room, "not read yet" warning). Never a forced wait.
   MER is the whole store only (all sales over all ad spend). A campaign is judged on its ROAS, never on a MER.
   The campaign ROAS line: the brand's goal ROAS (accounts.target_roas) is the hold line; break-even ROAS is the
   record's own when it has one (and it is not over the goal), else goal ROAS / 1.25 (an assumption the page states).
   A campaign with no Triple Whale sales on record all week is not read (the sync may be behind), never read as 0x.
   Sales are Triple Whale; spend and budgets are Meta. Nothing here changes anything. */

export const CADENCE_DEFAULT = 6;
export const MIN_STORE_SPEND = 150;
export const MIN_CAMP_SPEND = 50;
export const MIN_SINCE_SPEND = 50;
export const READ_HOURS = 3;
export const READ_SHARE = 0.2;
export const PACE_MIN = 0.7;
export const MAX_STEP = 0.5;          // no more than 50% in one tap
export const MIN_BUDGET = 5;          // a cut never goes under $5 a day
export const FIRST_HOUR = 8;          // the first check-in of the day, Central
export const LAST_HOUR = 22;          // no check-in after 10pm Central
export const CADENCE_CHOICES = [3, 4, 6, 8, 10];
export const BE_ROAS_DIV = 1.25;      // break-even ROAS when the record has none: goal ROAS / 1.25 (stated on the page)
export const FAST_BUDGET = 1000;      // live Meta budgets at or over this a day: the page SUGGESTS every 4 hours, never sets it
export const FAST_CADENCE = 4;

const ok = n => n != null && isFinite(n);
const num = v => (ok(+v) && v !== null && v !== '' ? +v : null);

/* ---------- time (slots are Central "YYYY-MM-DDTHH") ---------- */
export const slotDate = slot => String(slot || '').split('T')[0];
export const slotHour = slot => +String(slot || '').split('T')[1] || 0;
const slotMs = slot => { const [d, h] = String(slot).split('T'); return Date.parse(d + 'T' + String(h || '00').padStart(2, '0') + ':00:00Z'); };
const msSlot = ms => new Date(ms).toISOString().slice(0, 13);
/** slotAdd('2026-11-26T08', -1) is '2026-11-26T07'. */
export const slotAdd = (slot, hours) => msSlot(slotMs(slot) + hours * 3600e3);
/** Hours from slot b to slot a. */
export const slotDiff = (a, b) => Math.round((slotMs(a) - slotMs(b)) / 3600e3);
export const dayAdd = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const mondayOf = ymd => { const dow = new Date(ymd + 'T12:00:00Z').getUTCDay(); return dayAdd(ymd, -((dow + 6) % 7)); };
export const hourWord = h => { h = ((Math.round(h) % 24) + 24) % 24; return h === 0 ? '12am' : h < 12 ? h + 'am' : h === 12 ? '12pm' : (h - 12) + 'pm'; };
export const weekday = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
export const dayLabel = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');

/** Central date and hour (with minutes as a fraction) of a moment. */
export function central(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const hour = (+p.hour % 24) + (+p.minute) / 60;
  return { date: `${p.year}-${p.month}-${p.day}`, hour, slot: `${p.year}-${p.month}-${p.day}T${String(Math.floor(hour)).padStart(2, '0')}` };
}
/** "2:10pm" in Central. */
export const clockCT = ms => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).replace(' ', '').toLowerCase();

/* ---------- shelf life of a check-in call ---------- */
/** The server's Approve refuses a check-in older than this (account-health standing.js approve()). */
export const CALL_SHELF_H = 6;
export const OUT_OF_DATE = 'Out of date, wait for the next check-in';
/** True when a call made at check-in time `at` must not be approved at `now`: past the 6 hour shelf life, or made on
    another day in Central (its "today" numbers are a day that is over). A missing or unreadable time is out of date. */
export function callOutOfDate(at, now = Date.now()) {
  const t = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(t)) return true;
  if ((now - t) / 3600e3 > CALL_SHELF_H) return true;
  return central(t).date !== central(now).date;
}
/** "As of 8:00pm Fri check-in": what a tile drawn from a saved check-in really shows. */
export function asOfWords(at) {
  const t = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(t)) return 'As of the last check-in';
  return `As of ${clockCT(t)} ${weekday(central(t).date)} check-in`;
}

/* ---------- cadence ---------- */
/** The brand's check-in rhythm in hours, from the season answer `checkin_hours` (2 to 12, missing = 6). */
export function cadenceOf(answers) {
  const v = Math.round(num(answers && answers.checkin_hours));
  return v >= 2 && v <= 12 ? v : CADENCE_DEFAULT;
}
/** A check-in rhythm to suggest (never set): every 4 hours when the brand's live Meta budgets are big, else null.
    Only the brand's saved setting (or the 6 hour default) changes the rhythm. No brand has a default of its own. */
export function cadenceSuggest(cur, cad) {
  const on = num(cur && cur.meta && cur.meta.on);
  if (!(on >= FAST_BUDGET) || cad <= FAST_CADENCE) return null;
  return { hours: FAST_CADENCE, why: `Live Meta budgets are ${'$' + Math.round(on).toLocaleString('en-US')} a day, so ${cad} hours can move a lot of money. A suggestion only: nothing changes unless you pick it.` };
}
/** Due hours in a day: 8am, then every N hours while at or before 10pm. */
export function dueHours(cad) {
  const out = [];
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h += cad) out.push(h);
  return out;
}
/** The next due time after a Central hour, in words ("12pm", "8am tomorrow"). */
export function nextDue(cad, hourNow) {
  const n = dueHours(cad).find(h => h > hourNow);
  return n != null ? hourWord(n) : hourWord(FIRST_HOUR) + ' tomorrow';
}
/** Is a check-in due for this brand: a due hour has passed since the latest record. */
export function isDue(cad, latestSlot, now) {
  const c = central(now);
  const lastH = slotDate(latestSlot) === c.date ? slotHour(latestSlot) : -1;
  return dueHours(cad).some(h => h > lastH && h <= c.hour);
}

/* ---------- windows ---------- */
const win = (sales, spend) => ({ sales: ok(sales) ? sales : null, spend: ok(spend) ? spend : null, mer: ok(sales) && spend > 0 ? sales / spend : null });
const diff = (a, b, k) => (a && ok(a[k]) ? a[k] : null) == null ? null : Math.max(0, a[k] - (b && ok(b[k]) ? b[k] : 0));

/** How the Since window is cut against the previous record: same day, same week, or the sale so far. */
export function sinceBasis(curSlot, prvSlot) {
  if (!prvSlot) return null;
  const cd = slotDate(curSlot), pd = slotDate(prvSlot), ph = slotHour(prvSlot);
  const same = cd === pd ? 'day' : mondayOf(cd) === mondayOf(pd) ? 'week' : 'sale';
  const when = same === 'day' ? hourWord(ph) : pd === dayAdd(cd, -1) ? `${hourWord(ph)} yesterday` : `${weekday(pd)} ${hourWord(ph)}`;
  return { same, label: 'Since ' + when, short: when, prv_slot: prvSlot, synced: same !== 'day' };
}

/** The store in three windows. cur and prv are the same brand in the latest and the previous check-in. */
export function storeWindows(cur, prv, basis) {
  const t = cur.today || {}, w = cur.week || {};
  const today = { ...win(t.sales, t.spend), label: 'Today' };
  today.readable = ok(today.spend) && today.spend >= MIN_STORE_SPEND;
  const week = { ...win(w.sales, w.spend), label: 'This week' };
  week.readable = ok(week.spend) && week.spend > 0;
  let since = null;
  if (prv && basis) {
    const k = basis.same === 'day' ? 'today' : basis.same === 'week' ? 'week' : 'so_far';
    const a = cur[k], b = prv[k];
    since = { ...win(diff(a, b, 'sales'), diff(a, b, 'spend')), label: basis.label, synced: basis.synced };
    since.readable = ok(since.spend) && since.spend >= MIN_SINCE_SPEND;
  }
  return { since, today, week };
}

/* ---------- campaigns ---------- */
/** Which campaigns get a line. Holiday before Dec 1 and Early access from Nov 26 are left out, and leads. */
export function campIncluded(c, ymd) {
  if (!c) return false;
  if (c.kind === 'leads') return false;
  const y = String(ymd || '').slice(0, 4);
  if (/holiday/i.test(c.name || '') && ymd < `${y}-12-01`) return false;
  if (/early/i.test(c.name || '') && ymd >= `${y}-11-26`) return false;
  return true;
}
const campRev = c => ({
  t_spend: num(c.spent) || 0, t_rev: ok(c.t_roas) ? c.t_roas * (num(c.spent) || 0) : 0,
  w_spend: num(c.w_spend), w_rev: ok(c.w_roas) && ok(num(c.w_spend)) ? c.w_roas * c.w_spend : 0,
});
/** One campaign's spend and revenue in the three windows. pc = the same campaign in prv (or null). */
function campSpendRev(c, pc, basis) {
  const r = campRev(c);
  const today = { spend: r.t_spend, rev: r.t_rev };
  const week = { spend: ok(r.w_spend) ? r.w_spend : r.t_spend, rev: ok(r.w_spend) ? r.w_rev : r.t_rev };
  let since = null;
  if (basis) {
    /* copy: no real Since cut could be made (campaign not in the previous record, an earlier week, or no week
       numbers), so Since is Today again. It is shown but never read as a second window. */
    if (!pc) since = { ...today, copy: true };
    else {
      const p = campRev(pc);
      if (basis.same === 'day') since = { spend: Math.max(0, r.t_spend - p.t_spend), rev: Math.max(0, r.t_rev - p.t_rev) };
      else if (basis.same === 'week' && ok(r.w_spend) && ok(p.w_spend)) since = { spend: Math.max(0, r.w_spend - p.w_spend), rev: Math.max(0, r.w_rev - p.w_rev) };
      else since = { ...today, copy: true };
    }
  }
  return { since, today, week };
}

/* ---------- the calls ---------- */
export const CALL_WORD = { raise50: 'Raise 50%', raise25: 'Raise 25%', hold: 'Hold', cut: 'Cut 25%', putback: 'Put it back' };
const PCT = { raise50: 0.5, raise25: 0.25, cut: -0.25 };
/** The amount for a step: rounded to $5, never under $5. */
export const stepTo = (daily, pct) => Math.max(MIN_BUDGET, Math.round(daily * (1 + pct) / 5) * 5);

/** The store light, decided on the now (Since last check-in and Today). This week only breaks a tie or adds a note.
    Returns { light, why, note, tie }: note is the week's context line when the week reads differently from the now. */
export function storeLight(W, goal, be) {
  const { since: S, today: T, week: K } = W;
  if (!ok(goal)) return { light: null, why: 'No goal set, so no calls.' };
  const tRead = T.readable && ok(T.mer), sRead = !!(S && S.readable && ok(S.mer)), kRead = !!(K && K.readable && ok(K.mer));
  const fx = v => v.toFixed(2) + 'x';
  const band = v => (v >= goal ? 'over' : v >= be ? 'mid' : 'under');
  const weekNote = light => {
    if (!kRead) return '';
    const k = band(K.mer);
    if (light === 'green' && k !== 'over') return `This week is ${fx(K.mer)}, under the goal: context only, the now decides.`;
    if (light !== 'green' && k === 'over') return `This week is ${fx(K.mer)}, over the goal: context only, the now decides.`;
    return '';
  };
  const out = (light, why, tie) => ({ light, why, note: weekNote(light), tie: !!tie });
  if (!tRead) {
    /* too little spent today: today cannot decide, and Since alone never raises */
    /* a small Since window never decides alone: under break-even it is amber with a warning, never a forced cut */
    if (sRead && S.mer < be) return { light: 'amber', why: `Too early, ${'$' + Math.round(T.spend || 0).toLocaleString('en-US')} of ads today; since the last check-in the store MER is ${fx(S.mer)}, under the ${fx(be)} break-even. Watch it, no forced cut yet.`, early: true, note: '', tie: false };
    return { light: 'amber', why: `Too early, ${'$' + Math.round(T.spend || 0).toLocaleString('en-US')} of ads today.`, early: true, note: '', tie: false };
  }
  const t = band(T.mer), sb = sRead ? band(S.mer) : null;
  if (!sRead) {
    if (t === 'over') return out('green', `Store MER ${fx(T.mer)} today is over the ${fx(goal)} goal.`);
    if (t === 'under') return out('red', `Store MER ${fx(T.mer)} today is under the ${fx(be)} break-even.`);
    return out('amber', `Store MER ${fx(T.mer)} today is between break-even and the ${fx(goal)} goal, so no raises.`);
  }
  if (t === 'over' && sb === 'over') return out('green', `Store MER over the ${fx(goal)} goal today and since the last check-in.`);
  if (t === 'under' && sb === 'under') return out('red', `Store MER under the ${fx(be)} break-even today and since the last check-in.`);
  if (t === 'mid' && sb === 'mid') return out('amber', `Store MER between break-even and the ${fx(goal)} goal today and since the last check-in, so no raises.`);
  /* Since and Today disagree: this week breaks the tie */
  const kb = kRead ? band(K.mer) : null;
  const tieWhy = `Today ${fx(T.mer)} and since the last check-in ${fx(S.mer)} disagree`;
  if ((t === 'over' && sb === 'mid') || (t === 'mid' && sb === 'over')) {
    if (kb === 'over') return out('green', `${tieWhy}; this week ${fx(K.mer)} is over the ${fx(goal)} goal, so it breaks the tie toward raises.`, true);
    return out('amber', `${tieWhy}${kRead ? `, and this week ${fx(K.mer)} does not break the tie` : ''}, so no raises.`, true);
  }
  if ((t === 'under' && sb === 'mid') || (t === 'mid' && sb === 'under')) {
    if (kb === 'under') return out('red', `${tieWhy}; this week ${fx(K.mer)} is under the ${fx(be)} break-even too, so it breaks the tie toward cuts.`, true);
    return out('amber', `${tieWhy}, so no raises.`, true);
  }
  /* one window over goal, the other under break-even: too mixed to raise, and too mixed to force a cut */
  return out('amber', `${tieWhy} (one over the goal, one under break-even), so no raises.`, true);
}

/** The campaign ROAS line for a brand: goal ROAS (the hold line) and break-even ROAS.
    o.roas_goal / o.roas_be win over the record's own fields (target_roas or goal_roas, be_roas or break_even_roas). */
export function roasLine(cur, o = {}) {
  const goal = num(o.roas_goal ?? (cur && (cur.target_roas ?? cur.goal_roas)));
  /* unread: the goal list could not be read, so a missing goal is not known to be missing */
  if (!(goal > 0)) return { goal: null, be: null, assumed: false, unread: !!o.goal_unread };
  const rec = num(o.roas_be ?? (cur && (cur.be_roas ?? cur.break_even_roas)));
  if (rec > 0 && rec <= goal) return { goal, be: rec, assumed: false };
  /* why it is assumed: none on record, or the one on record is over the goal (then it cannot sit under the hold line) */
  return { goal, be: Math.round(goal / BE_ROAS_DIV * 100) / 100, assumed: true, reason: rec > 0 ? 'over_goal' : 'none', rec: rec > 0 ? rec : null };
}

/** A campaign's own call, decided on the now: its Triple Whale ROAS since the last check-in and today, against the
    campaign ROAS line. This week only breaks a tie (Since and Today disagree) or adds a note; it never blocks a raise. */
export function ownCall(cw, goal, be) {
  const T = cw.today, S = cw.since, K = cw.week;
  if (!T || !T.readable) return { call: 'hold', why: 'Too early: under ' + '$' + MIN_CAMP_SPEND + ' spent today.', early: true, note: '' };
  const sRead = !!(S && S.readable && !S.copy), kRead = !!(K && K.readable);
  const fx = v => v.toFixed(2) + 'x';
  const note = call => {
    if (!kRead) return '';
    if ((call === 'raise50' || call === 'raise25') && K.roas < goal) return `This week ${fx(K.roas)} is under the goal ROAS: context only, the now decides.`;
    if (call === 'cut' && K.roas >= goal) return `This week ${fx(K.roas)} is over the goal ROAS: context only, the now decides.`;
    return '';
  };
  const res = (call, why, tie) => ({ call, why, note: note(call), tie: !!tie });
  if (T.roas >= 1.5 * goal && sRead && S.roas >= goal) return res('raise50', `ROAS today ${fx(T.roas)} is over 1.5 times the ${fx(goal)} goal ROAS, and since the last check-in ${fx(S.roas)} is over it too.`);
  if (T.roas >= goal && (!sRead || S.roas >= be)) return res('raise25', `ROAS today ${fx(T.roas)} is over the ${fx(goal)} goal ROAS` + (sRead ? `, and since the last check-in ${fx(S.roas)} is over the ${fx(be)} break-even.` : '.'));
  if (T.roas < be && (!sRead || S.roas < be)) return res('cut', `ROAS today ${fx(T.roas)} is under the ${fx(be)} break-even ROAS` + (sRead ? `, and so is since the last check-in (${fx(S.roas)}).` : '.'));
  /* the two windows of the now disagree: this week breaks the tie */
  if (sRead && T.roas >= goal && S.roas < be) {
    if (kRead && K.roas >= goal) return res('raise25', `Today ${fx(T.roas)} is over the goal ROAS but since the last check-in ${fx(S.roas)} is under break-even; this week ${fx(K.roas)} is over the goal, so it breaks the tie.`, true);
    return res('hold', `Today ${fx(T.roas)} is over the goal ROAS but since the last check-in ${fx(S.roas)} is under break-even${kRead ? `, and this week ${fx(K.roas)} does not break the tie` : ''}.`, true);
  }
  if (sRead && T.roas < be && S.roas >= be) {
    /* Since at or over the goal: the newest hours are good, so the week does not push a cut (as the store light) */
    if (S.roas >= goal) return res('hold', `Today ${fx(T.roas)} is under break-even, but since the last check-in ${fx(S.roas)} is over the ${fx(goal)} goal ROAS: too mixed to cut.`, true);
    if (kRead && K.roas < be) return res('cut', `Today ${fx(T.roas)} is under break-even and since the last check-in ${fx(S.roas)} is back over it; this week ${fx(K.roas)} is under break-even too, so it breaks the tie.`, true);
    return res('hold', `Today ${fx(T.roas)} is under break-even, but since the last check-in ${fx(S.roas)} is back over it.`, true);
  }
  return res('hold', `ROAS between the ${fx(be)} break-even and the ${fx(goal)} goal right now.`);
}

/** The two amounts in a Change Log budget summary, in the real forms ("$500/day → $625/day", "$500/day -> $625/day")
    and the plain one ("$500/day to $625/day"). An "Undone: ..." row went back, so its amounts are swapped. */
const AMT = String.raw`\$\s?([\d,]+(?:\.\d+)?)\s*(?:\/day|a day)?`;
const BUDGET_RE = new RegExp(AMT + String.raw`\s*(?:to|→|->)\s*` + AMT, 'i');
export function parseBudget(summary) {
  const s = String(summary || '');
  const m = s.match(BUDGET_RE);
  if (!m) return { from: null, to: null, undone: /^\s*Undone:/i.test(s) };
  let from = +m[1].replace(/,/g, ''), to = +m[2].replace(/,/g, '');
  const undone = /^\s*Undone:/i.test(s);
  if (undone) [from, to] = [to, from];
  return { from, to, undone };
}

/** The last budget change on a campaign from the activities rows (newest first or any order). */
export function lastBudgetChange(acts, campId) {
  const rows = (acts || []).filter(a => String(a.object_id || '') === String(campId) && (a.category === 'budget' || /\/day|a day|daily budget/i.test(String(a.summary || ''))))
    .sort((p, q) => Date.parse(q.event_time) - Date.parse(p.event_time));
  const a = rows[0];
  if (!a) return null;
  const { from, to, undone } = parseBudget(a.summary);
  return { at: Date.parse(a.event_time), from, to, undone, by: a.actor || null, summary: a.summary || '' };
}

/** Spend on a campaign since a moment: spent now minus spent in the record nearest before it, same Central day only. */
function spentSince(campId, spentNow, atMs, records, curDate) {
  const before = (records || []).filter(r => r && slotDate(r.slot) === curDate && Date.parse(r.at) <= atMs)
    .sort((p, q) => Date.parse(q.at) - Date.parse(p.at))[0];
  if (!before) return spentNow;
  const b = (before.brand && before.brand.meta && before.brand.meta.camps || []).find(c => String(c.id) === String(campId));
  return Math.max(0, spentNow - (b ? num(b.spent) || 0 : 0));
}

/** Words for "1 hour" / "40 minutes". */
export function agoWords(ms) {
  const m = Math.max(0, Math.round(ms / 60e3));
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? '' : 's'}`;
}

/** Everything about one brand for one check-in.
    o = { cur, prv, basis, cadence, acts, records (each {slot, at, brand}), now, recDate, recHour, dismissed: Set,
          roas_goal, roas_be (the campaign ROAS line; else read from cur) } */
export function brandCalls(o) {
  const { cur, prv, basis, acts = [], records = [], now = Date.now() } = o;
  const recDate = o.recDate || slotDate(cur.slot || ''), recHour = o.recHour ?? FIRST_HOUR;
  /* goal and be are the STORE MER lines (the gate); rl is the CAMPAIGN ROAS line (each campaign's own call) */
  const goal = num(cur.kpi), be = num(cur.hold) ?? (ok(goal) ? goal * 0.8 : null);
  const rl = roasLine(cur, o), rGoal = rl.goal, rBe = rl.be;
  const W = storeWindows(cur, prv, basis);
  const m = cur.meta || {};
  const mode = cur.watch ? 'watch' : cur.no_sales ? 'no_sales' : cur.mode === 'plan' || cur.mode === 'after' ? cur.mode : cur.error ? 'error' : m.error ? 'meta_error' : 'live';
  const numbersOnly = mode !== 'live';
  const gate = numbersOnly ? { light: null, why: '' } : storeLight(W, goal, be);

  const all = m.camps || [];
  const prvCamps = (prv && prv.meta && prv.meta.camps) || [];
  const sr = all.map(c => campSpendRev(c, prvCamps.find(p => String(p.id) === String(c.id)) || null, basis));

  const camps = [];
  all.forEach((c, i) => {
    if (!campIncluded(c, recDate)) return;
    const s = sr[i], cw = {};
    for (const k of ['since', 'today', 'week']) {
      const x = s[k];
      if (!x) { cw[k] = null; continue; }
      /* ROAS = Triple Whale attributed sales (last click) over the campaign's own spend */
      const roas = x.spend > 0 ? x.rev / x.spend : null;
      cw[k] = { spend: x.spend, rev: x.rev, roas, readable: x.spend >= MIN_CAMP_SPEND && ok(roas), copy: !!x.copy };
    }
    /* no Triple Whale sales on record for this campaign all week: the sync may be behind, so it is not read as 0x */
    const noTw = num(c.w_ord) === 0 && !(num(c.w_roas) > 0) && !(num(c.t_roas) > 0) && !(num(c.t_ord) > 0);
    if (noTw) for (const k of ['since', 'today', 'week']) if (cw[k]) { cw[k].readable = false; cw[k].no_tw = true; }
    const daily = num(c.daily);
    camps.push({ id: String(c.id), name: c.name || 'Campaign', kind: c.kind || 'other', daily, spent: num(c.spent) || 0, abo: !daily, w: cw, notes: noTw ? ['No Triple Whale sales on record for this campaign this week, so its ROAS is not read. Check the Triple Whale sync.'] : [], no_tw: noTw, warn: null, call: 'hold', why: '', move: null });
  });

  if (!numbersOnly && gate.light) {
    for (const c of camps) {
      if (!ok(rGoal)) {
        c.call = 'hold'; c.no_goal = true;
        c.why = rl.unread ? 'The goal ROAS could not be read, so no campaign calls. Tap Refresh to read it again.' : 'No goal ROAS set for this brand (Brand settings > Goals), so no campaign calls.';
        continue;
      }
      const own = ownCall(c.w, rGoal, rBe);
      if (c.no_tw) { own.why = 'No Triple Whale sales on record this week, so its ROAS is not read: hold.'; own.early = false; }
      c.own = own.call; c.call = own.call; c.why = own.why; c.early = !!own.early; c.tie = !!own.tie;
      if (gate.light === 'green' && c.call === 'cut') { c.call = 'hold'; c.why = 'ROAS under break-even, but the store MER is over the goal: hold, it needs new ads.'; c.needs_ads = true; }
      if (gate.light !== 'green' && (c.call === 'raise50' || c.call === 'raise25')) { c.call = 'hold'; c.why = 'Its own numbers would raise, but ' + gate.why.charAt(0).toLowerCase() + gate.why.slice(1); }
      /* the week note explains the campaign's own call, so it only shows when the gate left that call standing */
      if (own.note && !c.no_tw && c.call === own.call) c.notes.push(own.note);
    }
    if (gate.light === 'red' && !camps.some(c => c.call === 'cut' && !c.abo)) {
      const big = camps.filter(c => !c.abo && c.spent > 0).sort((p, q) => q.spent - p.spent)[0];
      /* no goal ROAS (or it could not be read): no campaign calls at all, so no forced cut either; the card says why */
      if (big && !ok(rGoal)) big.why += ` The store MER is under break-even, but with no goal ROAS${rl.unread ? ' read' : ''} this page does not force a cut on the biggest spender. Look at it by hand, or set the goal ROAS.`;
      else if (big) { big.call = 'cut'; big.why = 'Store MER under break-even, and this campaign spends the most today.'; big.forced = true; }
    }
  }

  /* guards, best ROAS today first, so money goes to the best first */
  const order = [...camps].sort((p, q) => ((q.w.today && q.w.today.roas) || -1) - ((p.w.today && p.w.today.roas) || -1));
  const holidayOn = all.filter(c => /holiday/i.test(c.name || '') && recDate < recDate.slice(0, 4) + '-12-01').reduce((t, c) => t + (num(c.daily) || 0), 0);
  let onLive = ok(num(m.on)) ? num(m.on) - holidayOn : null;
  const limit = num(m.limit), onLive0 = onLive;
  for (const c of order) {
    /* room for a typed amount: the limit minus every other live budget as it stands */
    c.limit = limit; c.room = ok(limit) && ok(onLive0) && c.daily ? limit - (onLive0 - c.daily) : null;
    /* G-Read: the last budget change on this campaign (warning only, never blocks) */
    const lc = lastBudgetChange(acts, c.id);
    if (lc && isFinite(lc.at) && lc.at <= now && now - lc.at < 36 * 3600e3) {
      const newDaily = ok(lc.to) ? lc.to : c.daily;
      const since = spentSince(c.id, c.spent, lc.at, records, recDate);
      const young = now - lc.at < READ_HOURS * 3600e3, little = ok(newDaily) && since < READ_SHARE * newDaily;
      const verb = lc.undone ? 'Put back' : ok(lc.from) && ok(lc.to) ? (lc.to > lc.from ? 'Raised' : 'Cut') : 'Changed';
      c.last = { ...lc, spent_since: since, read: !young && !little };
      if (young || little) c.warn = `${verb} to ${ok(newDaily) ? '$' + Math.round(newDaily).toLocaleString('en-US') : 'a new budget'} at ${clockCT(lc.at)}, ${agoWords(now - lc.at)} and $${Math.round(since).toLocaleString('en-US')} ago, not read yet.`;
      else if (!numbersOnly && gate.light && verb === 'Raised' && c.w.since && c.w.since.readable && !c.w.since.copy && ok(rBe) && c.w.since.roas < rBe && ok(lc.from) && c.daily) {
        const back = Math.max(MIN_BUDGET, Math.round(lc.from));
        if (gate.light === 'green') {
          /* rule w3: never cut while the store is over goal */
          c.call = 'hold'; c.move = null; c.needs_ads = true; c.why = `The raise at ${clockCT(lc.at)} did not hold (ROAS in the hours since is under the ${rBe.toFixed(2)}x break-even), but the store MER is over the goal: hold, it needs new ads.`;
        } else if (back < c.daily) {
          c.call = 'putback'; c.why = `The raise at ${clockCT(lc.at)} has been read and ROAS in the hours since is under the ${rBe.toFixed(2)}x break-even.`;
          c.move = { from: c.daily, to: back, pct: (back - c.daily) / c.daily };
        }
      }
    }
    if (numbersOnly || !gate.light) { c.call = 'hold'; c.move = null; continue; }
    if (c.call === 'putback') continue;
    if (c.call === 'hold') continue;
    if (c.abo) { c.notes.push('Ad set budgets, change by hand in Ads Manager.'); continue; }
    const pct = PCT[c.call];
    let to = stepTo(c.daily, pct);
    if (pct > 0) {
      /* G-Pace: from 8am Central, a campaign not spending its budget gets no more */
      if (recHour >= FIRST_HOUR) {
        const pace = c.spent / (c.daily * Math.max(1, recHour) / 24);
        c.pace = pace;
        if (pace < PACE_MIN) { c.call = 'hold'; c.why = `Spent $${Math.round(c.spent).toLocaleString('en-US')} of $${Math.round(c.daily).toLocaleString('en-US')} today, more budget would not get spent.`; continue; }
      }
      /* G-Limit: room under the Meta daily limit, raises earlier in this pass counted */
      if (ok(limit) && ok(onLive)) {
        const room = limit - (onLive - c.daily);
        if (to > room) {
          const cap = Math.floor(room / 5) * 5;
          if (cap <= c.daily) { c.call = 'hold'; c.why = `No room under the $${Math.round(limit).toLocaleString('en-US')} Meta limit, ask Meta to raise it.`; continue; }
          to = cap; c.notes.push(`Capped at $${cap.toLocaleString('en-US')} by the $${Math.round(limit).toLocaleString('en-US')} Meta limit.`);
        }
        if (m.limit_src === 'known') c.notes.push('The limit is the last known figure, not read from Meta today.');
        onLive += to - c.daily;
      }
    }
    if (to === c.daily) { c.call = 'hold'; c.why = 'The step rounds to the same budget.'; continue; }
    c.move = { from: c.daily, to, pct: (to - c.daily) / c.daily };
  }
  if (cur.client_approve && !numbersOnly) camps.forEach(c => { if (c.move) c.notes.push('The client approves this in Slack.'); });

  return { act: cur.act_id, name: cur.name, goal, be, roas: rl, windows: W, gate, mode, camps, cadence: o.cadence || CADENCE_DEFAULT };
}

/** Does the page's move equal the check-in's own suggestion (then Approve goes through the check-in, so Slack fills in). */
export function matchesCheckin(cur, c) {
  const m = cur.meta || {}, s = cur.suggest || {};
  return !!(c && c.move && m.camp && String(m.camp.id) === String(c.id) && s.to && Math.round(s.to) === Math.round(c.move.to));
}

/** The client's words for a change, naming the campaign. manual: a budget typed by hand, so no claim about the goal. */
export function clientWhy(c, { manual = false } = {}) {
  if (!c || !c.move) return '';
  if (manual) return c.move.to > c.move.from ? `We gave ${c.name} more budget for Black Friday.` : c.move.to < c.move.from ? `We pulled the budget on ${c.name} back to protect the return.` : '';
  if (c.call === 'putback') return `The extra budget on ${c.name} did not hold its return, so we put it back.`;
  return c.move.to > c.move.from ? `Black Friday sales are running ahead of the goal, so we gave ${c.name} more budget.`
    : `${c.name} is running under the goal, so we pulled its budget back to protect the return.`;
}

/** The write id a Change Log row belongs to ("Write mw_..." on a write, "Undo of mw_..." on its undo), or null. */
export const writeIdOf = a => (a && a.write) || ((String((a && a.note) || '').match(/\b(mw_[0-9a-z]+)/i) || [])[1]) || null;
const isUndoRow = a => /^\s*Undone:/i.test(String((a && a.summary) || '')) || /\bUndo of\b/i.test(String((a && a.note) || ''));
/** The changes a client may read: rows with a client line, never an "Undone:" row, and never a write that was later
    undone (an "Undone:" row naming the same write id removes it). Oldest first. */
export function clientChanges(acts, act, fromMs) {
  const rows = (acts || []).filter(a => !a.act_id || a.act_id === act);
  const undone = new Set(rows.filter(isUndoRow).map(writeIdOf).filter(Boolean));
  return rows
    .filter(a => !isUndoRow(a) && String(a.client_why || '').trim() && Date.parse(a.event_time) >= fromMs && !(writeIdOf(a) && undone.has(writeIdOf(a))))
    .sort((p, q) => Date.parse(p.event_time) - Date.parse(q.event_time));
}

/** Tier for the client card: at or over goal, 90 to 100% of goal, under. */
export function tierOf(mer, goal) {
  if (!ok(mer) || !ok(goal)) return { key: 'none', word: '', color: '#8A94A6' };
  const r = mer / goal;
  return r >= 1 ? { key: 'good', word: 'Above goal', color: '#2EB67D' } : r >= 0.9 ? { key: 'near', word: 'Around goal', color: '#8A94A6' } : { key: 'under', word: 'Under goal', color: '#C98A00' };
}
