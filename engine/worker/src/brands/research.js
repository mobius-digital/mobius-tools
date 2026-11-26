/* The brand page: everything known about one brand's research and every creative test it has run.
   Ads join a test by the number that starts the ad name, or by a tag a person set. Revenue and orders
   per ad are the tracker's (last platform click), never the ad platform's own count. */
// from profit/worker/src/brand.js (batchNumOf, adUniverse, addAd, finish, suggest, boxOf, payload)
import { roas, cpa, ctr, cpm, safeDiv } from '../numbers/defs.js';
import { safeJson } from '../platform/text.js';
import { addDays, dayDiff } from '../platform/time.js';
import { rulesFor } from './rules.js';

const STALE_DAYS = 14;
const ADS_MANAGER = 'https://adsmanager.facebook.com/adsmanager/manage/ads';
const round2 = n => Math.round(n * 100) / 100;
const dayOf = date => date.toISOString().slice(0, 10);

/** "326-5 | Still" -> 326, "293 C | Still" -> 293. A name with no leading number gives null. */
export function batchNumOf(name) {
  const m = /^\s*(?:[A-Za-z]{2,4}_)?#?(\d{1,4})(?=$|[^\d])/.exec(name || '');
  return m ? String(parseInt(m[1], 10)) : null;
}

function numKey(n) {
  const p = parseInt(String(n || '').replace(/^\D+/, ''), 10);
  return Number.isFinite(p) ? String(p) : String(n || '').trim().toLowerCase();
}

/* One row per ad: its spend, its tracker revenue and orders, the test number in its name, its tag. */
function adUniverse(ads, spend, revenue, tags) {
  const sp = Object.fromEntries(spend.map(r => [r.ad_id, r]));
  const rv = Object.fromEntries(revenue.map(r => [r.ad_id, r]));
  const tg = Object.fromEntries(tags.map(r => [r.ad_id, r.batch_id]));
  return ads.map(a => {
    const s = sp[a.ad_id] || {}, r = rv[a.ad_id] || {};
    return { ad_id: a.ad_id, name: a.name, created: (a.created_time || '').slice(0, 10), status: a.status, media_type: a.media_type,
      spend: s.spend || 0, spend30: s.spend30 || 0, first: s.first || null, last: s.last || null,
      rev: r.rev || 0, orders: r.orders || 0, impr: s.impr || 0, clicks: s.clicks || 0, v3: s.v3 || 0, atc: s.atc || 0,
      num: batchNumOf(a.name), tag: tg[a.ad_id] || null };
  });
}

const blank = () => ({ ads: 0, running: 0, spend: 0, spend30: 0, rev: 0, orders: 0, impr: 0, clicks: 0, v3: 0, atc: 0, first: null, last: null });

function addAd(st, a) {
  st.ads++; st.spend += a.spend; st.spend30 += a.spend30; st.rev += a.rev; st.orders += a.orders;
  st.impr += a.impr || 0; st.clicks += a.clicks || 0; st.v3 += a.v3 || 0; st.atc += a.atc || 0;
  if (a.spend30 > 0) st.running++;
  if (a.first && (!st.first || a.first < st.first)) st.first = a.first;
  if (a.last && (!st.last || a.last > st.last)) st.last = a.last;
}

const rounded = v => (v === null ? null : round2(v));

/* The totals of one test, with the numbers a buyer judges on. Each formula is the one in numbers/defs.js. */
function finish(st) {
  return { ...st, spend: round2(st.spend), rev: round2(st.rev),
    roas: st.spend > 0 ? rounded(roas(st.rev, st.spend)) : null,
    cpa: st.orders > 0 ? rounded(cpa(st.spend, st.orders)) : null,
    ctr: st.impr > 0 ? ctr(st.clicks, st.impr) : null,
    hook: st.impr > 0 && st.v3 > 0 ? safeDiv(st.v3, st.impr) : null,
    cpm: st.impr > 0 ? rounded(cpm(st.spend, st.impr)) : null,
    cpatc: st.atc > 0 ? rounded(safeDiv(st.spend, st.atc)) : null };
}

/* What the numbers say about a test. The verdict itself stays the buyer's call. */
function suggest(st, rules, today) {
  if (!st || !(st.spend > 0)) return 'not_live';
  const age = st.first ? dayDiff(st.first, today) : 0;
  const enough = st.spend >= rules.judge_spend || (age >= rules.judge_days && st.spend >= rules.judge_spend / 3);
  if (!enough) return 'too_early';
  /* A brand whose goal is ROAS judges its tests on ROAS. Every other brand on the goal cost. */
  if (rules.test_cpa && !(rules.goal_metric === 'roas' && rules.test_roas)) {
    const cost = st.orders > 0 ? cpa(st.spend, st.orders) : null;
    const two = (st.orders || 0) >= 2;   // one sale is noise
    if (two && cost != null && cost <= rules.test_cpa) return 'winner';
    if (two && cost != null && cost <= Math.max(rules.acct_avg || 0, rules.test_cpa * (1 + rules.yellow_pct / 100))) return 'keep';
    return 'loser';
  }
  const r = st.spend > 0 ? roas(st.rev, st.spend) : 0;
  if (r >= rules.win_roas) return 'winner';
  if (r < rules.lose_roas) return 'loser';
  return 'keep';
}

/* Which box a test sits in: call (ready for the buyer), running, making or done. */
function boxOf(b, st, sug, rules, today) {
  if (b.verdict || b.stage === 'done') return 'done';
  const judgeDays = (rules && rules.judge_days) || 7;
  if (st.spend > 0) {
    if (st.last && dayDiff(st.last, today) > STALE_DAYS) return 'done';
    if (st.first && dayDiff(st.first, today) + 1 > judgeDays + 14) return 'done';
    if (b.asana_result !== 'keep' && ['winner', 'loser', 'keep'].includes(sug)) return 'call';
    if (b.asana_result !== 'keep' && sug === 'too_early' && st.first && dayDiff(st.first, today) + 1 > judgeDays) return 'call';
    return 'running';
  }
  if (b.stage === 'idea' || b.stage === 'production') return 'making';
  const since = (b.created_at || '').slice(0, 10);
  return since && dayDiff(since, today) > 30 ? 'done' : 'running';
}

/* Ads -> tests. A tag set by hand wins over the number in the name. */
function joinAds(ads, batches) {
  const byNum = Object.fromEntries(batches.map(b => [numKey(b.num), b.id]));
  const byId = Object.fromEntries(batches.map(b => [b.id, b]));
  const stats = {}, untagged = [];
  for (const a of ads) {
    const bid = a.tag && byId[a.tag] ? a.tag : a.num ? byNum[a.num] : null;
    if (bid) {
      const st = stats[bid] || (stats[bid] = blank());
      addAd(st, a);
      (st.list || (st.list = [])).push(a.ad_id);
    } else if (a.spend > 0) untagged.push(a);
  }
  return { stats, untagged };
}

function adsManagerLink(acct, list) {
  if (!list || !list.length || !acct.meta_act) return null;
  return `${ADS_MANAGER}?act=${acct.meta_act.replace(/^act_/, '')}&selected_ad_ids=${list.slice(0, 30).join(',')}`;
}

function shapeBatch(b, raw, rules, acct, today) {
  const st = finish(raw || blank());
  const sug = suggest(st, rules, today);
  const box = boxOf(b, st, sug, rules, today);
  const { legacy_json, ...rest } = b;
  return { ...rest, legacy: safeJson(legacy_json, null), ad_ids: (raw && raw.list) || [], stats: st, suggest: sug, box,
    auto_done: box === 'done' && !b.verdict && b.stage !== 'done',
    needs_call: box === 'call',
    thin: !!(['winner', 'loser'].includes(b.verdict) && (sug === 'too_early' || sug === 'not_live')),
    ads_manager: adsManagerLink(acct, raw && raw.list) };
}

const byNumThenNewest = (x, y) => (parseInt(y.num, 10) || 0) - (parseInt(x.num, 10) || 0) || String(y.created_at).localeCompare(String(x.created_at));

function shapeAngles(angles, batches) {
  const zero = () => ({ batches: 0, spend: 0, rev: 0, winners: 0, losers: 0, judged: 0, last: null });
  const by = {};
  for (const b of batches) {
    if (!b.angle_id) continue;
    const s = by[b.angle_id] || (by[b.angle_id] = zero());
    s.batches++; s.spend += b.stats.spend; s.rev += b.stats.rev;
    if (b.verdict === 'winner') s.winners++;
    if (b.verdict === 'loser') s.losers++;
    if (b.verdict && b.verdict !== 'cancelled') s.judged++;
    /* Last tested = when its ads first spent. An imported test with no spend on record has no date. */
    const when = b.stats.first || (b.source === 'sheet' ? null : (b.created_at || '').slice(0, 10));
    if (when && (!s.last || when > s.last)) s.last = when;
  }
  return angles.map(a => {
    const s = by[a.id] || zero();
    return { ...a, stats: { ...s, spend: Math.round(s.spend), roas: s.spend > 0 ? rounded(roas(s.rev, s.spend)) : null,
      win_rate: s.judged ? Math.round((s.winners / s.judged) * 100) : null } };
  });
}

/* Ads that spent and belong to no test, for the last 30 days. */
function shapeUntagged(untagged, ads, today) {
  const since30 = addDays(today, -30);
  const recent = untagged.filter(a => a.last && a.last >= since30);
  const recentSpend = recent.reduce((t, a) => t + a.spend30, 0);
  const total30 = ads.reduce((t, a) => t + a.spend30, 0);
  return { spend30: Math.round(recentSpend),
    share30: total30 > 0 ? Math.round((recentSpend / total30) * 100) : 0,
    ads: untagged.sort((x, y) => (y.spend30 - x.spend30) || (y.spend - x.spend)).slice(0, 60)
      .map(a => ({ ad_id: a.ad_id, name: a.name, spend: Math.round(a.spend), spend30: Math.round(a.spend30), rev: Math.round(a.rev),
        roas: a.spend > 0 ? rounded(roas(a.rev, a.spend)) : null, last: a.last, trybe: /trybe=/i.test(a.name || '') })) };
}

function docMapOf(docs) {
  const map = {};
  for (const d of docs) {
    const line = map[d.line_id || ''] || (map[d.line_id || ''] = {});
    line[d.key] = { ...safeJson(d.data_json, {}), _status: d.status, _source: d.source, _updated: d.updated_at };
  }
  return map;
}

const withData = row => {
  const { data_json, ...rest } = row;
  return { ...rest, data: safeJson(data_json, {}) };
};

const shapeOnboard = o => (o ? { token: o.token, status: o.status, step: o.step, submitted_at: o.submitted_at, updated_at: o.updated_at,
  answers: safeJson(o.answers_json, {}), prefill: safeJson(o.prefill_json, {}) } : null);

/** The statements the page needs, as one batch. `since` = 30 days back from today. */
export function pageReads(today) {
  return [['brands.lines'], ['brands.docs'], ['brands.personas'], ['brands.voc'], ['brands.comps'], ['brands.angles'],
    ['brands.concepts'], ['brands.batches'], ['brands.runs'], ['brands.onboard'], ['brands.ads'],
    ['brands.adSpend', { since: addDays(today, -30) }], ['brands.adRevenue'], ['brands.adTags']];
}

/** acct = the brand row. rows = the answers of pageReads, in order. now = a Date. */
export function brandPage(acct, rows, now) {
  const [lines, docs, personas, voc, comps, angles, concepts, batches, runs, onboard, adRows, spend, revenue, tags] = rows;
  const today = dayOf(now);
  const ads = adUniverse(adRows, spend, revenue, tags);
  const docMap = docMapOf(docs);
  const rules = rulesFor(acct, docMap[''] && docMap[''].rules);
  const { stats, untagged } = joinAds(ads, batches);
  const outBatches = batches.map(b => shapeBatch(b, stats[b.id], rules, acct, today)).sort(byNumThenNewest);
  return {
    account: { act_id: acct.act_id, name: acct.name, currency: acct.currency, target_cpa: acct.target_cpa, target_roas: acct.target_roas },
    rules, lines, docs: docMap,
    personas: personas.map(withData),
    voc, comps: comps.map(withData),
    angles: shapeAngles(angles, outBatches), concepts, batches: outBatches,
    untagged: shapeUntagged(untagged, ads, today),
    onboard: shapeOnboard(onboard[0] || null),
    runs,
    next_num: String(Math.max(0, ...batches.map(b => parseInt(b.num, 10) || 0)) + 1),
    /* The old profit worker has its file store bound (its wrangler.toml), so the old answer is always true. */
    has_media: true,
  };
}
