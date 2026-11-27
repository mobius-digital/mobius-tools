/* What works > Hooks. "Which first 3 seconds make people stop?" Video only, one card per video.
   Live data: GET /api/hub/creative (profit worker): hook rate (3 second views / impressions), hold rate, click rate and
   Triple Whale sales per Meta video ad; GET /api/ad-creatives (account-health) for the first frame.
   Not built yet: the video reader on our own ads (the first line said, the text on screen, the hook type). Until it is,
   real cards say "First line not read yet" and the hook type grouping sits behind "Tags are being re-checked". */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, card, kpi, takeaway, segmented, legend, lineChart, delta, em, money, num, pct, x, skeleton, empty, platformChip, sourceLine } from '../../kit.js';
import { css, gate, noAds, loadAds, sampleAds, art, meter, findingButton, thin, thinWords, p1, dl, helpBar, winOf, tileRow, secHead, openAd, adThumb } from './_ww.js';

const MIN_VIEWS = 2000;                       // under this many impressions a hook rate is not shown
const ST = { shelf: 'all', more: false };
const median = v => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const pts = (v, n) => Math.round((v - n) * 100);
const short = (t, n = 18) => (t.length > n ? t.slice(0, n - 1).replace(/[,\s]+$/, '') + '...' : t);

function shape(d) {
  const vids = d.ads.filter(a => a.kind === 'video' && a.hook != null && a.impressions >= MIN_VIEWS).sort((a, b) => b.hook - a.hook);
  const normal = median(vids.map(a => a.hook));
  const holdN = median(vids.map(a => a.hold).filter(v => v != null));
  const k = Math.max(1, Math.round(vids.length / 3));
  const hi = vids.length >= 3 ? vids[k - 1].hook : Infinity, lo = vids.length >= 3 ? vids[vids.length - k].hook : -Infinity;
  const over = a => d.has_sales && d.goal_cpa && (a.cpa ? a.cpa > d.goal_cpa : a.spend > d.goal_cpa);
  const shelves = {
    all: vids,
    best: vids.filter(a => a.hook >= hi),
    weak: vids.filter(a => a.hook >= hi && over(a)),
    quiet: vids.filter(a => a.hook <= lo && d.has_sales && d.goal_cpa && a.cpa && a.cpa <= d.goal_cpa * 1.15),
  };
  return { vids, normal, holdN, shelves, few: d.ads.filter(a => a.kind === 'video' && a.impressions < MIN_VIEWS).length };
}

function hookCard(a, d, s, ctx) {
  const diff = s.normal != null ? pts(a.hook, s.normal) : null;
  const sales = d.has_sales;
  const line = a.first_line ? '"' + a.first_line + '"' : a.frame ? 'No speech' : 'First line not read yet';
  const open = () => openAd(ctx, a, d);
  return h('article', { class: 'ww-c ww-hk open', role: 'button', tabindex: '0', 'aria-label': 'Open ' + a.name, onclick: e => { if (e.target.closest('.lx-def,a,button')) return; open(); }, onkeydown: e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); open(); } } },
    art({ ...a, cap: a.frame || null, over: a.over }),
    h('div', null, h('div', { class: 'q' + (a.first_line ? '' : ' none') }, line), h('div', { class: 'sub', style: { marginTop: '4px' }, title: a.name }, a.name)),
    h('div', null,
      h('div', { class: 'hr' }, h('b', null, pct(a.hook)), dl('hook rate', 'hook_rate'), diff != null ? delta(diff / 100, { text: (diff > 0 ? '+' : '') + diff + ' pts vs normal' }) : null),
      meter(a.hook, s.normal, { max: Math.max(0.5, ...s.vids.map(v => v.hook)), goalTitle: 'Normal ' + pct(s.normal) }),
      h('div', { class: 'sub', style: { marginTop: '6px' } }, num(a.impressions) + ' impressions' + (a.half_at ? `, half the viewers gone by 0:${String(a.half_at).padStart(2, '0')}` : ''))),
    h('div', { class: 'ww-st' },
      h('div', null, dl('Hold rate', 'hold_rate'), h('b', { class: a.hold == null ? 'dim' : '' }, a.hold == null ? 'no data' : pct(a.hold))),
      h('div', null, h('span', null, 'Cost per sale'), h('b', { class: !sales || thin(a.tw_orders) ? 'dim' : d.goal_cpa && a.cpa > d.goal_cpa ? 'bad' : '' }, !sales ? 'no data' : a.cpa ? money(a.cpa) : 'no sale'),
        sales && thin(a.tw_orders) ? h('small', null, thinWords(a.tw_orders)) : null)),
    h('div', { class: 'ww-two' },
      findingButton(ctx, () => ({ say: [h('b', null, a.name), ` stops ${pct(a.hook)} of people. Normal here is ${pct(s.normal)}.`], measure: 'hook rate',
        proof: [{ value: a.hook, text: pct(a.hook), name: short(a.name), sub: 'this video' }], normal: { value: s.normal, text: pct(s.normal), name: 'Normal', sub: 'all videos' },
        brief: { title: 'New videos on this opening', make: 'Three new videos that open the same way as ' + a.name, hook: a.first_line ? '"' + a.first_line + '"' : a.frame || null, why: `Stops ${pct(a.hook)}, normal is ${pct(s.normal)}.`, format: 'Video, 9:16 and 4:5', count: 3 } }), 'Use this hook'),
      findingButton(ctx, () => ({ say: [h('b', null, a.name), ` stops people (${pct(a.hook)}) but sells ${a.cpa ? 'at ' + money(a.cpa) + ' a sale' : 'nothing yet'}.`], measure: 'hook rate',
        proof: [{ value: a.hook, text: pct(a.hook), name: short(a.name), sub: 'this video' }], normal: { value: s.normal, text: pct(s.normal), name: 'Normal', sub: 'all videos' },
        brief: { title: 'Recut: same opening, new ending', make: 'Recut ' + a.name + ' with the offer by second 5', why: 'The opening works and the rest does not.', format: 'Video, 9:16 and 4:5', count: 2 } }), 'Recut')));
}

function findings(d, s, ctx) {
  const out = [];
  const best = s.shelves.best, weak = s.shelves.weak, quiet = s.shelves.quiet;
  const avg = list => list.reduce((t, a) => t + a.hook, 0) / list.length;
  /* a Pattern that only restates the figures at the top is left out; it shows only when there is nothing else to say */
  if (best.length >= 2 && !weak.length && !quiet.length) out.push({ kind: 'Pattern', say: [`${best.length === s.vids.length ? 'These' : 'The top'} ${num(best.length)} videos stop `, h('b', null, pct(avg(best))), ' of people against a normal of ', h('b', null, pct(s.normal)), '.'], proof: best, brief: 'More openings like the best ones' });
  if (weak.length >= 1) out.push({ kind: 'Recut list', say: [`${num(weak.length)} of the best hooks ${weak.length === 1 ? 'has' : 'have'} weak sales. The opening works and the rest does not, so keep the opening and recut the body.`], proof: weak, brief: 'Same opening, new ending' });
  if (quiet.length >= 1) out.push({ kind: 'New first 3 seconds', say: [`${num(quiet.length)} ${quiet.length === 1 ? 'video sells' : 'videos sell'} on goal but few people stop. A new opening could take ${quiet.length === 1 ? 'it' : 'them'} further.`], proof: quiet, brief: 'New first 3 seconds' });
  if (!out.length) return null;
  return card({ class: 'ww-cd', title: APP_NAME + ' AI noticed', note: 'Patterns across the videos below, not tests. A test is what makes one a fact.' },
    h('div', { class: 'ww-find', style: { marginTop: '16px' } }, out.map(f => h('div', { class: 'ww-f' },
      h('span', { class: 'lx-cap' }, f.kind),
      h('p', { class: 'say' }, f.say),
      h('div', { class: 'ww-thumbs' }, f.proof.slice(0, 4).map(a => adThumb(ctx, d, a, a.name, { pc: pct(a.hook) }))),
      findingButton(ctx, () => ({ say: f.say, measure: 'hook rate', proof: f.proof.slice(0, 3).map(a => ({ value: a.hook, text: pct(a.hook), name: short(a.name), sub: a.maker === 'creator' ? 'creator video' : 'brand video' })),
        normal: { value: s.normal, text: pct(s.normal), name: 'Normal', sub: 'all videos' }, brief: { title: f.brief, make: f.brief + ', 3 videos', why: f.kind, format: 'Video, 9:16 and 4:5', count: 3 } }), 'Make a brief from this')))));
}

function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  if (!d.ads || !d.ads.length) return [noAds(ctx)];
  const s = shape(d);
  if (!s.vids.length) return [empty({ title: 'No videos with enough views yet', text: `A hook rate shows once a video has ${num(MIN_VIEWS)} views. ${s.few ? num(s.few) + ' videos are still under that.' : 'This brand ran no video ads on these dates.'}` })];
  const top = s.vids[0];
  ctx.askWindow = winOf(ctx) || null;
  ctx.askContext = `What works, Hooks, ${winOf(ctx) || 'these dates'}: ${num(s.vids.length)} Meta video ads judged (${num(MIN_VIEWS)}+ impressions). Normal hook rate ${pct(s.normal)}, best ${pct(top.hook)} on ${top.name}`
    + (s.holdN != null ? `, normal hold rate ${pct(s.holdN)}` : '') + (s.shelves.weak.length ? `. ${num(s.shelves.weak.length)} of the best hooks sell over the cost per sale goal.` : '.');
  const chartList = s.vids.slice(0, 14);
  const gallery = h('div', { class: 'ww-stack', style: { gap: '18px' } });
  const SHELF = [{ id: 'all', label: 'All videos' }, { id: 'best', label: 'Best openers' }, { id: 'weak', label: 'Great hook, weak sales' }, { id: 'quiet', label: 'Sells but nobody stops' }];
  const paint = () => {
    const list = s.shelves[ST.shelf] || [];
    const shown = ST.more ? list : list.slice(0, 12);
    put(gallery, 
      secHead('The hook bank', `${winOf(ctx) || 'These dates'} · hook and hold rate Meta, cost per sale Triple Whale, last click · ${num(list.length)} ${list.length === 1 ? 'video' : 'videos'}` + (d.has_sales && d.goal_cpa ? ` · goal ${d.goal_roas ? x(d.goal_roas) + ', ' : ''}${money(d.goal_cpa)} per sale: red is over it, gray is under 30 orders` : ''),
        segmented(SHELF.filter(x => x.id === 'all' || x.id === 'best' || d.has_sales), ST.shelf, id => { ST.shelf = id; ST.more = false; paint(); })),
      shown.length ? h('div', { class: 'ww-grid' }, shown.map(a => hookCard(a, d, s, ctx))) : empty({ title: 'Nothing on this shelf', text: 'No video fits this shelf on these dates.' }),
      list.length > shown.length ? h('div', { style: { justifySelf: 'center' } }, h('button', { class: 'lx-btn', type: 'button', onclick: () => { ST.more = true; paint(); } }, `Show all ${list.length}`)) : '');
  };
  paint();
  return [
    helpBar([{ title: 'What it is for', text: 'Which openings make people stop scrolling. Every Meta video ad with ' + num(MIN_VIEWS) + ' impressions or more on the dates at the top, judged on hook rate first.' },
      { title: 'The words', text: 'Hook rate: people who watched 3 seconds, out of every time the video was shown. Hold rate: of those, the share who kept watching. Normal: the middle video on this page. Feed and Reels are mixed. Cost per sale is gray under 30 orders.' }], {},
      platformChip('meta'), h('span', { class: 'note ww-q-note' }, 'Meta video ads, the dates at the top')),
    tileRow([
      kpi({ label: 'Videos judged', value: num(s.vids.length), sub: `${num(MIN_VIEWS)}+ impressions each` + (s.few ? `, ${num(s.few)} under` : ''), window: winOf(ctx), source: 'Meta' }),
      kpi({ label: dl('Normal hook rate', 'normal_hook'), value: pct(s.normal), sub: 'The middle video here', window: winOf(ctx), source: 'Meta' }),
      kpi({ label: dl('Best hook rate', 'hook_rate'), value: pct(top.hook), sub: h('span', { class: 'ww-ell', title: top.name }, top.name), window: winOf(ctx), source: 'Meta' }),
      kpi({ label: dl('Normal hold rate', 'hold_rate'), value: s.holdN == null ? h('small', null, 'No data') : pct(s.holdN), sub: 'Of those who stopped, watched on', window: winOf(ctx), source: 'Meta' }),
    ], 4),
    s.shelves.weak.length ? takeaway([h('b', null, num(s.shelves.weak.length)), ` of the best hooks sell over goal: the opening works and the rest does not, so recut those first.`]) : null,
    card({ class: 'ww-cd', title: 'Hook rate, video by video', note: sourceLine(winOf(ctx), 'Meta'), action: legend([{ name: 'Best hook', square: true, color: 'var(--brand)' }, { name: 'Other videos', square: true, color: '#C9D0DE' }, { name: 'Normal ' + pct(s.normal), dashed: true }]) },
      h('div', { style: { marginTop: '18px' } }, lineChart({ windowLabel: 'Per video, ' + (winOf(ctx) || 'these dates'), series: [{ type: 'bar', tone: 'slate', values: chartList.map(a => a.hook), leadAt: 0, labels: v => pct(v), name: 'Hook rate' }], labels: chartList.map(a => short(a.name, 14)),
        goal: { value: s.normal, label: 'Normal ' + pct(s.normal) }, format: v => pct(v), height: 320, phoneHeight: 260, endLabels: false, yTicks: 4,
        hover: i => [h('b', null, chartList[i].name), ' ' + pct(chartList[i].hook) + ' hook rate, ' + num(chartList[i].impressions) + ' impressions'], label: 'Hook rate per video' }))),
    findings(d, s, ctx),
    gallery,
  ].filter(Boolean);
}

export default {
  title: ['Which first 3 seconds ', em('make people stop?')],
  eyebrow: 'What works',
  load: ctx => loadAds(ctx, { covers: true }),
  sample: () => sampleAds(),
  skeleton(el) { put(el, skeleton('kpi', 4), skeleton('chart'), skeleton('row', 4)); },
  render(el, d, ctx) {
    css();
    if (!document.getElementById('ww-hk-css')) { const st = document.createElement('style'); st.id = 'ww-hk-css'; st.textContent = '.ww-two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:auto}.ww-two .lx-btn{width:100%;padding:0 8px}.ww-ell{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}'; document.head.append(st); }
    put(el, ...view(d, ctx));
    if (new URLSearchParams(location.search).get('open') === '1') { const b = el.querySelector('.ww-f .lx-btn'); if (b) b.click(); }
  },
};
