/* Supply - the season screens and Settings: Performance, Lineup plan, Timeline,
   Settings (categories and lines, factories, lifecycle, rules, Slack, data). */
'use strict';

/* ======================================================================
   PERFORMANCE: category, then one row per line, then the ranked list
   ====================================================================== */
window.renderPerformance = function (m) {
  const s = st();
  const cat = s.categories.find(c => c.id === S.cat) || s.categories[0];
  if (!cat) { title('Performance'); m.innerHTML = `<div class="card"><div class="empty"><b>No categories yet</b>Set them up in Settings.</div></div>`; return; }
  const lines = s.lines.filter(l => l.categoryId === cat.id);
  const line = lines.find(l => l.id === S.perfLine) || lines[0];
  const ps = lines.flatMap(l => productsOf(l));
  const sold90 = ps.reduce((a, p) => a + p.sold90, 0), onHand = ps.reduce((a, p) => a + p.onHand, 0), vel = ps.reduce((a, p) => a + p.velocity, 0);
  const rev = ps.reduce((a, p) => a + p.sold90 * (p.price || 0), 0);
  const dead = ps.reduce((a, p) => ({ units: a.units + p.deadUnits, cost: a.cost + (p.deadCost || 0) }), { units: 0, cost: 0 });
  title(`Performance <em>· ${esc(cat.name)}</em>`, 'What sells and what does not. Pick a category, then a product line.',
    `<div class="seg">${s.categories.map(c => `<button class="${c.id === cat.id ? 'on' : ''}" onclick="S.cat='${c.id}';S.perfLine='';render()">${esc(c.name)}</button>`).join('')}</div>`);
  m.innerHTML = `
    <div class="rollup">
      <div class="ru"><div class="l">Sold, 90 days</div><div class="v">${fmtInt(sold90)}<small>units</small></div><div class="s">${money(rev)} at retail · ${plural(ps.length, 'product')} in ${plural(lines.length, 'line')}</div></div>
      <div class="ru" data-tip="Units sold over 90 days, divided by those units plus what is still on the shelf"><div class="l">Sold through</div><div class="v">${sold90 + onHand ? Math.round(100 * sold90 / (sold90 + onHand)) : 0}%</div><div class="s">of what was available these 90 days</div></div>
      <div class="ru"><div class="l">Weeks of stock</div><div class="v">${vel > 0.001 ? Math.round(onHand / (vel * 7)) : '—'}</div><div class="s">at the current rate · ${fmtInt(onHand)} on hand</div></div>
      <div class="ru ${dead.cost ? 'warn' : ''}"><div class="l">Dead stock</div><div class="v">${money(dead.cost)}<small>at cost</small></div><div class="s">${fmtInt(dead.units)} units with no sale in 90 days</div></div>
    </div>
    <div class="card flush">
      <div class="card-hd"><b>Product lines in ${esc(cat.name)}</b><span class="tiny">One row per line. A new Shopify product type appears here once it is sorted into a line in Settings.</span></div>
      <div class="tbl-wrap"><table>
        <tr><th>Line</th><th class="num">Designs</th><th class="num">Sold, 90 days</th><th class="num" data-tip="Units sold in 90 days, divided by those units plus what is still on the shelf">Sold through</th><th class="num">Weeks of stock</th><th class="num">Dead stock</th><th>To order</th><th>Cut zone</th><th></th></tr>
        ${lines.map(l => `<tr class="click ${l.id === line?.id ? 'near' : ''}" onclick="S.perfLine='${l.id}';render()"><td style="padding-left:18px"><b>${esc(l.name)}</b><div class="tiny">${axisLabel(l.axis)} · ${esc(l.factoryName || 'no factory')}</div></td><td class="num">${l.designs}</td><td class="num">${fmtInt(l.sold90)}</td><td class="num">${l.sellThrough == null ? '—' : l.sellThrough + '%'}</td><td class="num">${l.weeksOfCover ?? '—'}</td><td class="num">${l.dead.cost ? money(l.dead.cost) : '—'}</td><td>${l.toOrder ? pill('bad', plural(l.toOrder, 'product')) : pill('good', 'none')}</td><td>${l.cutCandidates ? pill('warn', plural(l.cutCandidates, 'design')) : l.cutRulePct ? '<span class="tiny">none</span>' : '<span class="tiny">manual</span>'}</td><td><span class="btn sm ${l.id === line?.id ? '' : 'quiet'}">${l.id === line?.id ? 'Viewing' : 'Open'}</span></td></tr>`).join('')}
      </table></div></div>
    ${line ? lineDetailHTML(line) : ''}`;
};
function axisLabel(a) { return { size: 'sized', hand: 'by hand', loft_hand: 'by loft and hand', hand_size: 'by hand and size', none: 'one variant' }[a] || a; }
function lineDetailHTML(l) {
  const ps = productsOf(l).filter(p => p.lifecycle !== 'drop').sort((a, b) => b.sold90 - a.sold90);
  const max = Math.max(1, ...ps.map(p => p.sold90));
  const bandIds = new Set(l.plan.filter(x => x.band).map(x => x.productId));
  const curve = Object.entries(l.sizeCurve).filter(([k]) => k !== '').sort((a, b) => sizeOrder(a[0]) - sizeOrder(b[0]));
  const drops = productsOf(l).filter(p => p.lifecycle === 'drop');
  return `<div class="two">
    <div class="card">
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:12px;flex-wrap:wrap"><h3>${esc(l.name)}, ranked</h3><span class="tiny">Units sold in 90 days${l.cutRulePct ? `. Shaded rows are the cut zone: the bottom ${l.cutRulePct}% of the line` : '. No cut rule on this line'}</span></div>
      <div class="stack" style="gap:6px">${ps.map((p, i) => `<div class="rank ${bandIds.has(p.id) ? 'band' : ''}" onclick="openProduct('${p.id}')"><span class="tiny">${i + 1}</span><span class="n">${esc(p.title)}${p.decision === 'cut' ? ' <span class="tiny">cut</span>' : ''}</span><div class="bar h10"><i class="${bandIds.has(p.id) ? 'warn' : ''}" style="width:${Math.round(p.sold90 / max * 100)}%"></i></div><span class="num">${p.sold90}</span><span class="tiny" style="text-align:right">${fmtInt(p.onHand)} left</span></div>`).join('') || '<div class="hint">No products in this line yet.</div>'}</div>
      ${drops.length ? `<div class="tiny" style="margin-top:12px">Limited drops, not ranked: ${drops.map(p => `${esc(p.title)} (${p.sold90} in 90d)`).join(', ')}.</div>` : ''}
    </div>
    <div class="stack">
      ${curve.length > 1 ? `<div class="card"><h3>${l.axis === 'loft_hand' ? 'Loft mix' : l.axis === 'hand' ? 'Hand mix' : 'Size curve'}, ${esc(l.name.toLowerCase())}</h3><div class="hint">Share of units sold in 90 days (${fmtInt(l.sizeCurveSample)} units). This is the split a new order gets.${Object.keys(lineById(l.id).sizeCurve).length && JSON.stringify(l.sizeCurve) !== JSON.stringify(l.sizeCurveLearned) ? ' Set by hand in Settings.' : ''}</div>
        <div style="display:flex;gap:8px;align-items:flex-end;height:150px;margin-top:14px">${curve.map(([k, v]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end" data-tip="${esc(k)}<small>${Math.round(v * 100)}% of units</small>"><span style="font-size:12px;font-weight:700">${Math.round(v * 100)}%</span><div style="width:100%;height:${Math.max(2, Math.round(v * 200))}px;background:${v >= 0.2 ? 'linear-gradient(180deg,#62BDEA,#2E88B8)' : '#B9D6E6'};border-radius:4px 4px 0 0"></div><span class="tiny">${esc(k)}</span></div>`).join('')}</div></div>` : ''}
      <div class="card"><h3>What the numbers say</h3><div class="hint" style="display:flex;flex-direction:column;gap:6px">
        ${lineInsights(l, ps).map(t => `<div>${t}</div>`).join('')}</div></div>
      <div class="card"><h3>Plan this line</h3><div class="hint">${l.target ? `Target ${l.target} designs · ${l.keep} keep, ${l.decide} to decide, ${l.cut} cut, ${l.openSlots} open slots.` : 'No assortment target yet. Set one in Settings to get open slots.'}</div><div style="margin-top:10px"><button class="btn" onclick="S.planLine='${l.id}';setTab('lineup')">Open in Lineup plan ${ic('arrow')}</button></div></div>
    </div></div>`;
}
function sizeOrder(k) { const o = { xs: 0, s: 1, small: 1, m: 2, medium: 2, l: 3, large: 3, xl: 4, 'extra large': 4, xxl: 5, '2xl': 5, '3xl': 6, xxxl: 6, '4xl': 7 }; const n = parseFloat(k); return o[String(k).toLowerCase()] ?? (Number.isFinite(n) ? 100 + n : 50); }
function lineInsights(l, ps) {
  const out = [];
  if (ps.length >= 2) { const top = ps[0], bottom = ps[ps.length - 1]; out.push(`<b>${esc(top.title)}</b> leads with ${top.sold90} units; <b>${esc(bottom.title)}</b> sold ${bottom.sold90}. The top ${Math.max(1, Math.round(ps.length / 3))} designs carry ${Math.round(100 * ps.slice(0, Math.max(1, Math.round(ps.length / 3))).reduce((a, p) => a + p.sold90, 0) / Math.max(1, l.sold90))}% of the line.`); }
  const curve = Object.entries(l.sizeCurve).filter(([k]) => k).sort((a, b) => b[1] - a[1]);
  if (curve.length > 2) out.push(`${esc(curve[0][0])} is ${Math.round(curve[0][1] * 100)}% of units; ${curve.slice(-2).map(([k, v]) => `${esc(k)} ${Math.round(v * 100)}%`).join(' and ')}. Tail sizes are where dead stock comes from.`);
  if (l.dead.cost) out.push(`${money(l.dead.cost)} sits in ${l.dead.units} units that have not sold in 90 days.`);
  if (l.weeksOfCover != null) out.push(l.weeksOfCover > 52 ? `At the current rate the shelf lasts ${l.weeksOfCover} weeks. Reorders should be small until it clears.` : l.weeksOfCover < 12 ? `Only ${l.weeksOfCover} weeks of cover. Watch the order window.` : `${l.weeksOfCover} weeks of cover, a comfortable shelf.`);
  const rising = ps.filter(p => p.trend === 'rising' || p.trend === 'spiking'); if (rising.length) out.push(`Rising on the month: ${rising.slice(0, 3).map(p => esc(p.title)).join(', ')}.`);
  return out;
}

/* ======================================================================
   LINEUP PLAN: a ranked list with a decision on every row
   ====================================================================== */
window.renderLineup = function (m) {
  const s = st();
  const planned = s.lines.filter(l => l.planned);
  const line = planned.find(l => l.id === S.planLine) || planned[0];
  if (!line) { title('Lineup plan', 'Decide what stays for next season, line by line.'); m.innerHTML = `<div class="card sc br"><h3>No line is planned yet</h3><div class="hint">Lineup plan switches itself on for any line with six or more designs. None has that many yet.</div><div style="margin-top:10px"><button class="btn primary" onclick="S.setTab='lines';setTab('settings')">Open Settings</button></div></div>`; return; }
  if (!line) { title('Lineup plan'); m.innerHTML = `<div class="card"><div class="empty"><b>No product lines yet</b>Set them up in Settings.</div></div>`; return; }
  const season = s.settings.season_name || nextSeason();
  const ps = productsOf(line).filter(p => p.lifecycle !== 'drop');
  const planById = Object.fromEntries(line.plan.map(x => [x.productId, x]));
  const ranked = line.plan.map(x => ({ ...x, p: productById(x.productId) })).filter(x => x.p);
  const slots = s.slots.filter(sl => sl.line_id === line.id);
  const missing = Math.max(0, line.openSlots - slots.length);
  const perDesign = line.moq || factoryById(line.factoryId)?.moq_default || 100;
  const unitCost = median(ps.map(p => p.cost).filter(x => x != null));
  title(`Lineup plan <em>· ${esc(line.categoryName || '')} · ${esc(line.name)}</em>`, `Decide what stays for ${esc(season)}. ${plural(ps.length, 'design')} today${line.target ? `, target ${line.target}` : ', no target yet'}${line.cutRulePct ? `, cut rule bottom ${line.cutRulePct}% by 90-day sales` : ', manual cuts'}.`,
    `<select onchange="S.planLine=this.value;render()">${planned.map(l => `<option value="${l.id}" ${l.id === line.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select><button class="btn" onclick="editLineTarget('${line.id}')">Target ${line.target ?? '—'} ${ic('chev')}</button>`);
  m.innerHTML = `
    <div class="card sc br" style="padding:12px 18px"><div class="hint">Any line with six or more designs is planned here automatically: right now ${planned.map(l => l.name).join(', ')}. Lines with a handful of models (putters, wedges) are not. The target and the cut rule can be changed per line in Settings.</div></div>
    <div class="two wide">
      <div class="card flush"><div class="tbl-wrap"><table>
        <tr><th style="width:36px"></th><th>Design</th><th class="num">Sold, 90 days</th><th class="num">On hand</th><th class="num">Weeks of stock</th><th>Decision</th></tr>
        ${ranked.map(x => { const p = x.p; const cls = x.state === 'cut' ? 'band' : x.state === 'decide' ? 'near' : ''; const note = x.state === 'cut' ? (x.decided ? 'cut by you: no more reorders, sells down' : 'in the cut zone: no more reorders, sells down') : x.state === 'decide' ? 'just above the cut zone: your call' : x.decided ? 'kept by you' : ''; return `<tr class="${cls}"><td style="padding-left:18px" class="tiny">${x.rank}</td><td class="click" onclick="openProduct('${p.id}')"><b>${esc(p.title)}</b>${p.lifecycle === 'seasonal' ? ' ' + pill('brand', 'Seasonal') : ''}${note ? `<div class="tiny">${note}</div>` : ''}</td><td class="num">${p.sold90}</td><td class="num">${fmtInt(p.onHand)}</td><td class="num">${p.weeksOfCover ?? '—'}</td><td><span class="seg sm"><button class="${x.state === 'keep' ? 'on' : ''}" onclick="decide('${p.id}','keep')">Keep</button><button class="${x.state === 'cut' ? 'on' : ''}" onclick="decide('${p.id}','cut')">Cut</button></span>${x.decided ? ` <button class="btn quiet sm" data-tip="Back to the rule's verdict" onclick="decide('${p.id}',null)">Reset</button>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="6"><div class="empty">No designs in this line.</div></td></tr>`}
      </table></div></div>
      <div class="stack">
        <div class="card key"><h3>Where the plan stands</h3>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 6px">${[['Keep', line.keep, 'var(--good)'], ['Decide', line.decide, 'var(--brand-ink)'], ['Cut', line.cut, 'var(--warn)'], ['Open slots', line.openSlots, 'var(--ink)']].map(([l, v, c]) => `<div><div style="font-size:24px;font-weight:700;letter-spacing:-.028em;color:${c}">${v}</div><div class="tiny">${l}</div></div>`).join('')}</div>
          <div class="hint">${line.target ? `Target ${line.target} minus ${line.keep} kept and ${line.decide} undecided leaves ${line.openSlots} to make.${line.decide ? ` If you cut the undecided ${line.decide === 1 ? 'one' : 'ones'} it is ${line.openSlots + line.decide}.` : ''}` : 'Set a target to see how many new designs the season needs.'}</div></div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:baseline"><h3>Open slots</h3><span class="tiny">${plural(slots.length, 'slot')}${missing ? ` · ${missing} still to create` : ''}</span></div>
          <div class="hint" style="margin-bottom:8px">A slot is a placeholder with dates. The design work itself is an Asana task; the slot tracks whether it is on time.</div>
          ${slots.map(sl => slotRow(sl)).join('')}
          ${missing ? `<div style="margin-top:10px"><button class="btn primary" onclick="createSlots('${line.id}',${missing})">${ic('plus')}Create ${plural(missing, 'slot')} for ${esc(season)}</button></div>` : `<div style="margin-top:10px"><button class="btn sm" onclick="createSlots('${line.id}',1)">${ic('plus')}Add a slot</button></div>`}
        </div>
        <div class="card sc br"><h3>What this does to the next order</h3><div class="hint">${line.keep + line.decide} kept designs and ${line.openSlots} new at ${perDesign} units each is ${fmtInt((line.keep + line.decide + line.openSlots) * perDesign)} ${esc(line.name.toLowerCase())}${unitCost != null ? `, about ${money((line.keep + line.decide + line.openSlots) * perDesign * unitCost)} at cost` : ''}. ${line.cut ? `The ${line.cut} cut${line.cut > 1 ? 's' : ''} stop reorders that would not have sold.` : ''}</div><div style="margin-top:10px"><button class="btn primary" onclick="setTab('timeline')">See it on the Timeline ${ic('arrow')}</button></div></div>
      </div>
    </div>`;
};
function nextSeason() { const y = new Date().getFullYear(); const mth = new Date().getMonth(); return mth >= 6 ? `Spring ${y + 1}` : `Fall ${y}`; }
function median(xs) { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
async function decide(pid, decision) { await save(`/api/products/${pid}`, { decision }, 'PUT', decision === 'cut' ? 'Cut. It stops reordering and sells down.' : decision === 'keep' ? 'Kept' : 'Back to the rule'); }
async function editLineTarget(lid) {
  const l = lineById(lid);
  const r = await modal({ title: `${l.name}: assortment target`, hint: 'How many designs this line should carry next season. The difference from what you keep becomes open slots.', fields: [
    { key: 'target', label: 'Target designs', type: 'number', value: l.target ?? '', min: 0 },
    { key: 'cut', label: 'Cut zone, bottom % by 90-day sales', type: 'number', value: l.cutRulePct ?? '', min: 0, help: 'Leave empty for manual cuts only.' }] });
  if (!r) return;
  const row = st().db.lines.find(x => x.id === lid);
  await save('/api/lines', { ...row, target_designs: r.target === '' ? null : +r.target, cut_rule_pct: r.cut === '' ? null : +r.cut });
}
const SLOT_STATUS = { needs_brief: ['Needs a brief', 'unk'], in_design: ['In design', 'brand'], tech_pack: ['Tech pack', 'brand'], sampling: ['Sampling', 'brand'], approved: ['Approved', 'good'], ordered: ['Ordered', 'good'], live: ['Live', 'good'] };
function slotRow(sl) {
  const [t, k] = SLOT_STATUS[sl.status] || [sl.status, 'unk'];
  return `<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-top:1px solid #EDF1F4;flex-wrap:wrap">
    <div class="click" style="flex:1;min-width:180px;cursor:pointer" onclick="openSlot('${sl.id}')"><b style="font-size:13.5px">${esc(sl.name)}</b><div class="tiny">brief ${fmtDate(sl.dates.briefDue)} · tech pack ${fmtDate(sl.dates.techPackDue)} · sample ${fmtDate(sl.dates.sampleDue)} · order ${fmtDate(sl.dates.orderBy)} · on site ${fmtDate(sl.dates.onSite)}${sl.late ? ' · <span style="color:var(--bad);font-weight:700">late</span>' : ''}</div></div>
    ${asanaPill(sl)}${pill(sl.late && sl.status !== 'live' ? 'bad' : k, t)}${asanaButton(sl, 'sm')}</div>`;
}

/* ---------- the Asana hand-off ----------
   An open slot is a placeholder; the design work itself is an Asana task.
   Supply makes that task (name, brief-due date, every other date, a link back
   here), then shows whether Asana still has it open. */
const asanaState = sl => sl.asana_done === 1 ? ['good', 'Asana: done'] : sl.asana_done === 0 ? ['brand', 'Asana: open'] : sl.asana_task ? ['unk', 'Asana: linked'] : null;
function asanaPill(sl) { const a = asanaState(sl); return a ? pill(a[0], a[1]) : ''; }
function asanaButton(sl, size = '') {
  const cls = `btn ${size}`.trim();
  if (sl.asana_task) return `<a class="${cls} quiet" href="${esc(sl.asana_task)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Open in Asana</a>`;
  return `<button class="${cls}" onclick="event.stopPropagation();slotToAsana('${sl.id}')">Create in Asana</button>`;
}
/** Make the task. The project it lands in is a setting, so say so if it is missing. */
async function slotToAsana(id) {
  if (!st().settings.asana_project) {
    const go = await modal({ title: 'Which Asana project?', hint: 'Supply files every design task in one project. Choose it once in Settings, under Asana, and this button works from then on.', fields: false, confirm: 'Open Settings' });
    if (go) { S.setTab = 'asana'; setTab('settings'); }
    return;
  }
  toast('Creating the task in Asana…');
  try {
    const r = await api(`/api/slots/${encodeURIComponent(id)}/asana`, { method: 'POST' });
    await load({ quiet: true });
    toast(r.created ? 'Task created in Asana' : 'This slot already had a task');
    if (S.open?.slotId === id) openSlot(id);
  } catch (e) { toast(e.message, { kind: 'err' }); }
}
/** Ask Asana where the task stands. Runs whenever a slot is opened. */
async function refreshSlotAsana(id) {
  const sl = st().slots.find(x => x.id === id);
  if (!sl || !sl.asana_gid || DEV_STATE) return;
  try {
    const r = await api(`/api/slots/${encodeURIComponent(id)}/asana`);
    sl.asana_done = r.task ? (r.task.completed ? 1 : 0) : null;
    sl.asanaTask = r.task || null; sl.asanaGone = !!r.gone;
    if (S.open?.slotId === id && S.sheetKind === 'slot') { const box = $('#slAsanaBox'); if (box) box.innerHTML = asanaSheetHTML(sl); }
    else render();
  } catch (e) { const box = $('#slAsanaBox'); if (box) box.insertAdjacentHTML('beforeend', `<div class="tiny" style="color:var(--bad)">Could not reach Asana: ${esc(e.message)}</div>`); }
}
function asanaSheetHTML(sl) {
  const t = sl.asanaTask, a = asanaState(sl);
  const steps = (st().settings.design_steps || DEFAULT_STEPS).length;
  if (!sl.asana_task) return `<div class="hint">No task yet. Creating one puts the brief-due date, the other dates and a link back to this slot in your Asana project${steps ? `, with a ${steps}-step checklist under it` : ''}.</div><div style="margin-top:10px">${asanaButton(sl)}</div>`;
  const detail = sl.asanaGone ? 'That task is no longer in Asana. It was deleted or you cannot see it.'
    : t ? `${t.completed ? 'Marked done' : 'Still open'} in Asana${t.section ? `, in ${esc(t.section)}` : ''}${t.due_on ? `, due ${fmtDate(t.due_on, { year: true })}` : ''}${t.assignee ? `, with ${esc(t.assignee)}` : ''}${t.steps ? `, ${plural(t.steps, 'step')} on its checklist` : ''}. The due date follows the stage you set here.`
    : sl.asana_gid ? 'Checking Asana…' : 'A link you pasted. Supply cannot read the status of a task it did not create.';
  return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${a ? pill(a[0], a[1]) : ''}${asanaButton(sl)}</div><div class="hint" style="margin-top:8px">${detail}</div>`;
}
async function createSlots(lineId, n) {
  const l = lineById(lineId); const s = st();
  const r = await modal({ title: `New ${plural(n, 'design slot')} for ${l.name}`, hint: 'One date by hand: when the designs must be on the site. Supply works the brief, sample and order dates back from it using the factory lead time.', fields: [
    { key: 'season', label: 'Season', value: s.settings.season_name || nextSeason() },
    { key: 'on_site', label: 'On the site by', type: 'date', value: s.settings.season_on_site || defaultOnSite() },
    { key: 'count', label: 'How many', type: 'number', value: n, min: 1 }], confirm: 'Create' });
  if (!r) return;
  const existing = s.slots.filter(x => x.line_id === lineId).length;
  for (let i = 0; i < Math.max(1, +r.count || 1); i++) await api('/api/slots', { method: 'POST', body: { line_id: lineId, name: `${r.season} design ${existing + i + 1}`, season: r.season, on_site_at: r.on_site, status: 'needs_brief' } });
  await save('/api/settings', { season_name: r.season, season_on_site: r.on_site }, 'PUT', `${plural(+r.count || 1, 'slot')} created`);
}
function defaultOnSite() { const y = new Date().getFullYear(); return new Date().getMonth() >= 6 ? `${y + 1}-03-01` : `${y}-09-01`; }
function openSlot(id) {
  const sl = st().slots.find(x => x.id === id); if (!sl) return;
  S.open = { slotId: id };
  const d = sl.dates;
  openSheet(`
    <div class="sh-top"><div><h3>${esc(sl.name)}</h3><div class="sm">${esc(sl.lineName || '')} · ${esc(sl.season || '')} · ${pill(SLOT_STATUS[sl.status]?.[1] || 'unk', SLOT_STATUS[sl.status]?.[0] || sl.status)}</div></div><div class="sh-nav"><button onclick="closeSheet()">${ic('x')}</button></div></div>
    <div class="fields">
      <div class="field"><label>Name</label><input id="slName" value="${esc(sl.name)}"></div>
      <div class="field"><label>Status</label><select id="slStatus">${Object.entries(SLOT_STATUS).map(([k, [l]]) => `<option value="${k}" ${sl.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>On the site by</label><input type="date" id="slSite" value="${sl.on_site_at}"><div class="help">The one date typed by hand. The rest derive from it.</div></div>
      <div class="field"><label>Asana task</label><input id="slAsana" value="${esc(sl.asana_task || '')}" placeholder="Paste a task link, or use the button below"><div class="help">The brief, mockups and samples live there. Empty this field to unlink the task.</div></div>
      <div class="field" style="grid-column:1/-1"><label>Notes</label><textarea id="slNotes">${esc(sl.notes || '')}</textarea></div>
    </div>
    <div class="panel"><h4>Asana</h4><div class="sub">The design work itself. Supply tracks whether it is still open.</div>
      <div id="slAsanaBox" style="margin-top:8px">${asanaSheetHTML(sl)}</div></div>
    <div class="panel"><h4>Dates, worked backwards</h4><div class="sub">Change a factory lead time or the on-site date and these move.</div>
      <table style="font-size:13px">${[['Design starts', d.designStart, false], ['Brief due', d.briefDue, sl.lateParts?.brief], ['Tech pack due', d.techPackDue, sl.lateParts?.techPack], ['Sample due', d.sampleDue, sl.lateParts?.sample], ['Order by', d.orderBy, sl.lateParts?.order], ['Production ends', d.productionEnd, false], ['Lands', d.lands, false], ['On the site', d.onSite, false]].map(([l, v, late]) => `<tr><td class="tiny">${l}</td><td><b style="${late ? 'color:var(--bad)' : ''}">${fmtDate(v, { year: true })}</b>${late ? ' <span class="tiny" style="color:var(--bad)">late</span>' : ''}</td></tr>`).join('')}</table></div>
    <div class="sh-foot"><button class="btn primary" onclick="saveSlot()">Save</button><span style="flex:1"></span><button class="btn quiet danger" onclick="deleteSlot()">Delete slot</button></div>`, 'slot');
  refreshSlotAsana(id);
}
async function saveSlot() { const sl = st().slots.find(x => x.id === S.open.slotId); await save('/api/slots', { ...sl, name: $('#slName').value, status: $('#slStatus').value, on_site_at: $('#slSite').value, asana_task: $('#slAsana').value, notes: $('#slNotes').value, brief_due: null, sample_due: null, order_by: null, lands_at: null }); closeSheet(); }
async function deleteSlot() { const ok = await modal({ title: 'Delete this slot?', fields: false, confirm: 'Delete', danger: true, hint: 'The Asana task, if any, is not touched.' }); if (!ok) return; await save(`/api/slots/${S.open.slotId}`, null, 'DELETE', 'Deleted'); closeSheet(); }

/* ======================================================================
   TIMELINE: a real date scale, drawn in SVG
   ====================================================================== */
window.renderTimeline = function (m) {
  const s = st();
  const items = timelineItems(s);
  const from = s.today, to = addDays(s.today, 200);
  const filtered = items.filter(it => S.tlFilter === 'all' || it.kind === S.tlFilter);
  title(`Timeline <em>· ${fmtDate(from)} to ${fmtDate(to, { year: true })}</em>`, 'The next six months as bars: each order from the day it is sent to the day it lands, and each new design from brief to launch. Click a bar to open it.',
    `<div class="seg"><button class="${S.tlFilter === 'all' ? 'on' : ''}" onclick="S.tlFilter='all';render()">Everything</button><button class="${S.tlFilter === 'order' ? 'on' : ''}" onclick="S.tlFilter='order';render()">Orders</button><button class="${S.tlFilter === 'slot' ? 'on' : ''}" onclick="S.tlFilter='slot';render()">New designs</button></div>`);
  const deadlines = filtered.flatMap(it => it.marks.map(mk => ({ ...mk, item: it }))).filter(mk => mk.date >= addDays(from, -7)).sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 12);
  const closures = s.factories.flatMap(f => (f.closures || []).map(c => ({ ...c, factory: f.name })));
  const emptyMsg = S.tlFilter === 'slot' ? `<b>No design slots yet</b>Set a target on a line in Lineup plan and create its slots; they appear here with their dates worked back from launch.` : S.tlFilter === 'order' ? `<b>Nothing to order or on the way</b>Orders you log and products inside their order window appear here.` : `<b>Nothing to draw</b>Orders on the way, products to order and design slots appear here.`;
  m.innerHTML = `<div class="two tl-grid">
    <div class="card" style="padding:14px 18px 10px">${filtered.length ? ganttSVG(filtered, from, to, closures) : `<div class="empty">${emptyMsg}</div>`}</div>
    <div class="stack">
      <div class="card key" style="padding:8px 18px 6px"><div style="padding:8px 0 4px"><h3>Dates to hit</h3><div class="hint">The same bars as a list, soonest first. Red is already late.</div></div>
        ${deadlines.map(mk => `<div class="click" style="display:grid;grid-template-columns:76px 1fr auto;gap:10px;align-items:center;padding:9px 0;border-top:1px solid #EDF1F4;cursor:pointer" onclick="${mk.item.open}"><b style="font-size:13px;color:${mk.late ? 'var(--bad)' : 'var(--ink)'}">${fmtDate(mk.date)}</b><div><div style="font-size:13px;font-weight:600">${esc(mk.label)}</div><div class="tiny">${esc(mk.item.sub)}</div></div><span style="width:8px;height:8px;border-radius:50%;background:${mk.late ? 'var(--bad)' : mk.good ? 'var(--good)' : 'var(--brand-ink)'}"></span></div>`).join('') || '<div class="hint">No deadlines in the window.</div>'}
        ${closures.map(c => `<div style="display:grid;grid-template-columns:76px 1fr;gap:10px;padding:9px 0;border-top:1px solid #EDF1F4"><b style="font-size:13px">${fmtDate(c.from)}</b><div><div style="font-size:13px;font-weight:600">${esc(c.factory)} closed</div><div class="tiny">${esc(c.label || '')} · to ${fmtDate(c.to)}</div></div></div>`).join('')}
      </div>
      <div class="card"><h3>Where the dates come from</h3><div class="hint">On-site date, minus ${s.settings.site_prep_days} days to get it live, minus shipping, minus production, minus ${s.settings.buffer_days} days of buffer, gives the order-by date. Minus ${s.settings.slack_days} days of slack, ${s.settings.sample_days} days of sampling and ${s.settings.design_days} of design gives the brief date. Change a lead time in Settings and every bar moves.</div></div>
    </div></div>`;
};
function timelineItems(s) {
  const items = [];
  const openO = s.orders.filter(o => OPEN_STATUSES.includes(o.status));
  for (const o of openO) {
    const f = factoryById(o.factory_id); const sent = o.sent_at || s.today; const prodEnd = f ? addDays(sent, f.production_days) : null; const lands = o.expected_at || (f ? addDays(prodEnd, f.shipping_days) : addDays(sent, 60));
    items.push({ kind: 'order', group: 'On the way', label: `${o.productTitles[0] || o.id}${o.productTitles.length > 1 ? ` +${o.productTitles.length - 1}` : ''}`, sub: `${o.id} · ${fmtInt(o.units)} units · ${o.status}`, open: `openOrder('${o.id}')`,
      phases: prodEnd && prodEnd < lands ? [[sent, prodEnd, 'production', '#C9962A'], [prodEnd, lands, 'ship', '#7A8794']] : [[sent, lands, o.status === 'shipped' ? 'ship' : 'in progress', '#7A8794']],
      marks: [{ date: lands, label: `${o.productTitles[0] || o.id} lands`, good: true, late: !!o.overdue }] });
  }
  for (const p of s.products.filter(p => ['out', 'order', 'gap', 'soon'].includes(p.status) && p.leadDays != null).sort((a, b) => (a.orderByDate || '0') < (b.orderByDate || '0') ? -1 : 1).slice(0, 8)) {
    const f = factoryById(p.factoryId); const send = p.orderByDate && p.orderByDate > s.today ? p.orderByDate : s.today;
    const prod = f ? f.production_days : Math.round(p.leadDays * 0.6), ship = f ? f.shipping_days : Math.round(p.leadDays * 0.3);
    const prodEnd = addDays(send, prod), shipEnd = addDays(prodEnd, ship), lands = addDays(send, p.leadDays);
    const it = { kind: 'order', group: 'To place', label: p.title, sub: `${fmtInt(p.suggested)} units · ${p.factoryName || 'no factory'}${p.overdue ? ' · overdue since ' + fmtDate(p.orderByDate) : ''}`, open: `openProduct('${p.id}')`,
      phases: [[send, prodEnd, `production ${prod} d`, '#C9962A'], [prodEnd, shipEnd, `ship ${ship} d`, '#7A8794'], [shipEnd, lands, '', '#C3CED8']],
      marks: [{ date: send, label: p.overdue || p.status === 'out' ? `Send ${p.title} order now` : `Send ${p.title} order`, late: p.overdue || p.status === 'out' }, { date: lands, label: `${p.title} lands`, good: true }] };
    if (p.runOutDate && p.runOutDate < lands) it.oos = [p.runOutDate < s.today ? s.today : p.runOutDate, lands, `sold out ${daysBetween(p.runOutDate < s.today ? s.today : p.runOutDate, lands)} days`];
    items.push(it);
  }
  for (const sl of s.slots) {
    const d = sl.dates; const f = factoryById(sl.factoryId);
    items.push({ kind: 'slot', group: sl.season || 'New designs', label: sl.name, sub: `${sl.lineName || ''} · ${SLOT_STATUS[sl.status]?.[0] || sl.status}`, open: `openSlot('${sl.id}')`,
      phases: [[d.designStart, d.briefDue, 'design', '#14608C'], [d.briefDue, d.sampleDue, 'sample', '#62BDEA'], [d.sampleDue, d.orderBy, '', '#DCE7EE'], [d.orderBy, d.productionEnd, f ? `production ${f.production_days} d` : 'production', '#C9962A'], [d.productionEnd, d.lands, 'ship', '#7A8794'], [d.lands, d.onSite, '', '#C3CED8']],
      marks: [{ date: d.briefDue, label: `${sl.name}: brief due`, late: sl.lateParts?.brief }, { date: d.sampleDue, label: `${sl.name}: sample due`, late: sl.lateParts?.sample }, { date: d.orderBy, label: `${sl.name}: order by`, late: sl.lateParts?.order }, { date: d.onSite, label: `${sl.name} on site`, good: true }] });
  }
  return items;
}
function ganttSVG(items, from, to, closures) {
  const W = 900, LAB = 214, X0 = LAB, X1 = W - 96, PW = X1 - X0, RH = 44, GH = 30, TOP = 48;
  const N = daysBetween(from, to);
  const x = t => X0 + Math.max(0, Math.min(N, daysBetween(from, t))) / N * PW;
  const groups = [...new Set(items.map(i => i.group))].map(g => [g, items.filter(i => i.group === g)]);
  const H = TOP + groups.length * GH + items.length * RH + 10;
  let out = '';
  let d = new Date(from + 'T12:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  for (; d.toISOString().slice(0, 10) <= to; d.setUTCMonth(d.getUTCMonth() + 1)) { const t = d.toISOString().slice(0, 10); out += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="' + (TOP - 8) + '" y2="' + H + '" stroke="#E3EAEF"/><text x="' + (x(t) + 6) + '" y="' + (TOP - 14) + '" font-size="10.5" font-weight="700" fill="#8195A2" letter-spacing=".06em">' + d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase() + '</text>'; }
  for (const c of closures) if (c.to >= from && c.from <= to) out += '<rect x="' + x(c.from) + '" y="' + (TOP - 8) + '" width="' + Math.max(2, x(c.to) - x(c.from)) + '" height="' + (H - TOP + 8) + '" fill="#EDF1F4"/><text x="' + (x(c.from) + x(c.to)) / 2 + '" y="' + (TOP - 14) + '" font-size="10" font-weight="700" fill="#647684" text-anchor="middle">factory closed</text>';
  let y = TOP;
  for (const [g, rs] of groups) {
    out += '<text x="0" y="' + (y + 19) + '" font-size="11" font-weight="700" fill="#647684" letter-spacing=".1em">' + esc(g.toUpperCase()) + '</text><line x1="0" x2="' + W + '" y1="' + (y + GH - 1) + '" y2="' + (y + GH - 1) + '" stroke="#DFE7EC"/>';
    y += GH;
    for (const r of rs) {
      out += '<g style="cursor:pointer" onclick="' + r.open + '"><rect x="0" y="' + y + '" width="' + W + '" height="' + RH + '" fill="transparent"/><text x="0" y="' + (y + 19) + '" font-size="13" font-weight="700" fill="#13202B">' + esc(r.label.slice(0, 26)) + '</text><text x="0" y="' + (y + 34) + '" font-size="11.5" fill="#647684">' + esc(r.sub.slice(0, 38)) + '</text>';
      let barEnd = null;
      for (const [a, b, lab, col] of r.phases) {
        if (b < from) continue; const xa = x(a), xb = x(b), w = Math.max(2, xb - xa); barEnd = xb;
        out += '<rect x="' + xa + '" y="' + (y + 20) + '" width="' + w + '" height="16" rx="4" fill="' + col + '" data-tip="' + esc(lab || 'buffer') + '<small>' + fmtDate(a) + ' to ' + fmtDate(b) + ' · ' + daysBetween(a, b) + ' days</small>"/>';
        if (lab && w > lab.length * 6.4 + 12) out += '<text x="' + (xa + 7) + '" y="' + (y + 32) + '" font-size="10.5" font-weight="700" fill="' + (['#62BDEA', '#DCE7EE', '#C3CED8'].includes(col) ? '#0C161D' : '#fff') + '" pointer-events="none">' + esc(lab) + '</text>';
      }
      // the stretch with nothing to sell, drawn over the bar in red hatch, explained in the tip
      if (r.oos) out += '<rect x="' + x(r.oos[0]) + '" y="' + (y + 20) + '" width="' + Math.max(2, x(r.oos[1]) - x(r.oos[0])) + '" height="16" rx="4" fill="url(#tlhatch)" data-tip="Nothing to sell<small>' + esc(r.oos[2]) + '</small>"/>';
      // one label per row: the send date (or late), above the bar
      const send = r.marks.find(mk => !mk.good);
      if (send && send.date >= from && send.date <= to) { const xm = x(send.date); out += '<path d="M' + xm + ',' + (y + 22) + ' l6,6 l-6,6 l-6,-6z" fill="' + (send.late ? '#C63A2F' : '#0C161D') + '" stroke="#fff" stroke-width="1.5"/><text x="' + (xm + 10) + '" y="' + (y + 13) + '" font-size="10.5" font-weight="700" fill="' + (send.late ? '#C63A2F' : '#13202B') + '">' + (send.late ? 'Late: send now' : 'Send by ' + fmtDate(send.date)) + '</text>'; }
      // the landing date, at the end of the bar in its own column
      const land = r.marks.find(mk => mk.good);
      if (land && barEnd != null) out += '<path d="M' + (Math.min(barEnd, X1) + 7) + ',' + (y + 22) + ' l6,6 l-6,6 l-6,-6z" fill="#1C7A46" stroke="#fff" stroke-width="1.5"/><text x="' + (X1 + 10) + '" y="' + (y + 32) + '" font-size="11" font-weight="700" fill="#1C7A46">' + (land.label.includes('on site') ? 'on site ' : 'lands ') + fmtDate(land.date) + '</text>';
      out += '</g><line x1="' + X0 + '" x2="' + W + '" y1="' + (y + RH - 1) + '" y2="' + (y + RH - 1) + '" stroke="#EDF1F4"/>';
      y += RH;
    }
  }
  const xt = x(from);
  out += '<line x1="' + xt + '" x2="' + xt + '" y1="' + (TOP - 8) + '" y2="' + H + '" stroke="#C63A2F" stroke-width="1.5" stroke-dasharray="3 3"/><rect x="' + (xt - 22) + '" y="' + (TOP - 46) + '" width="44" height="16" rx="8" fill="#C63A2F"/><text x="' + xt + '" y="' + (TOP - 35) + '" font-size="9.5" font-weight="700" fill="#fff" text-anchor="middle">TODAY</text>';
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '"><defs><pattern id="tlhatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#C63A2F" stroke-width="2" stroke-opacity=".55"/></pattern></defs>' + out + '</svg>' +
    '<div class="legend"><span><i style="background:#C9962A"></i>Factory making it</span><span><i style="background:#7A8794"></i>On the water</span><span><i class="hatch"></i>Nothing to sell while you wait</span><span><i class="dia"></i>Send the order</span><span><i class="dia" style="background:#1C7A46"></i>Lands</span></div>';
}

/* ======================================================================
   SETTINGS
   ====================================================================== */
window.renderSettings = function (m) {
  const s = st(); S.setTab = S.setTab || 'lines';
  title('Settings', 'How this brand buys. Categories and lines, factories, kinds of product, rules, Slack, data.',
    `<div class="seg">${[['lines', 'Categories and lines'], ['factories', 'Factories'], ['lifecycle', 'Kinds of product'], ['rules', 'Rules'], ['asana', 'Asana'], ['slack', 'Slack and data']].map(([k, l]) => `<button class="${S.setTab === k ? 'on' : ''}" onclick="S.setTab='${k}';render()">${l}</button>`).join('')}</div>`);
  m.innerHTML = { lines: settingsLines, factories: settingsFactories, lifecycle: settingsLifecycle, rules: settingsRules, asana: settingsAsana, slack: settingsSlack }[S.setTab](s);
  if (S.setTab === 'slack') loadSlack();
  if (S.setTab === 'asana') loadAsanaProjects();
};
function settingsLines(s) {
  const unsorted = s.shopTypes.filter(t => !s.db.typeMap.some(tm => tm.shop_type === t));
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;align-items:start">
      ${s.categories.map(c => { const ls = s.lines.filter(l => l.categoryId === c.id); return `<div class="card flush">
        <div class="card-hd"><div><b>${esc(c.name)}</b><div class="tiny">${plural(ls.length, 'line')} · ${ls.reduce((a, l) => a + l.designs, 0)} products</div></div><span style="margin-left:auto;display:flex;gap:6px"><button class="btn quiet sm" onclick="editCategory('${c.id}')">Rename</button><button class="btn quiet sm" onclick="addLine('${c.id}')">${ic('plus')}Line</button></span></div>
        ${ls.map(l => { const row = s.db.lines.find(x => x.id === l.id); const types = s.db.typeMap.filter(tm => tm.line_id === l.id).map(tm => tm.shop_type); return `<div class="click" style="padding:11px 16px;border-top:1px solid #EDF1F4;cursor:pointer" onclick="editLine('${l.id}')"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:13.5px">${esc(l.name)}</b><span class="tiny">${plural(l.designs, 'product')}</span></div><div class="tiny">Variants mean: ${axisLabel(l.axis)} · ${esc(l.factoryName || 'no factory')}${row?.lead_override_days != null ? ` · lead ${row.lead_override_days} d` : ''}</div><div class="tiny">${l.moq ? `minimum ${l.moq} · ` : ''}${l.target ? `target ${l.target} designs · ` : ''}${l.cutRulePct ? `cut zone bottom ${l.cutRulePct}%` : 'manual cuts'} · Shopify types: ${types.length ? esc(types.join(', ')) : '<span style="color:var(--warn)">none</span>'}</div></div>`; }).join('')}
      </div>`; }).join('')}
      <div class="card" style="border-style:dashed;background:transparent;box-shadow:none"><h3>Add a category</h3><div class="hint">Gear, Bags, whatever comes next. Lines go inside it.</div><div style="margin-top:10px"><button class="btn" onclick="addCategory()">${ic('plus')}Category</button></div></div>
    </div>
    <div class="card sc ${unsorted.length ? 'wn' : 'ok'}"><div class="decision"><div><h3>${unsorted.length ? `Unsorted: ${plural(unsorted.length, 'Shopify product type')}` : 'Every Shopify product type is sorted'}</h3><div class="hint">${unsorted.length ? `${esc(unsorted.join(', '))}. New types appear here the morning after they are created in Shopify; drop each into a line once and its products are forecast from then on.` : 'New types will appear here the morning after they are created in Shopify.'}</div></div>${unsorted.length ? `<button class="btn primary" onclick="sortTypes()">Sort now ${ic('arrow')}</button>` : ''}</div></div>`;
}
async function addCategory() { const r = await modal({ title: 'New category', hint: 'A category holds product lines. Clubs, Apparel, Accessories, Gear.', fields: [{ key: 'name', label: 'Name' }] }); if (!r?.name) return; await save('/api/categories', { name: r.name, sort: st().categories.length }); }
async function editCategory(id) { const c = st().categories.find(x => x.id === id); const r = await modal({ title: 'Rename category', fields: [{ key: 'name', label: 'Name', value: c.name }] }); if (!r?.name) return; await save('/api/categories', { id, name: r.name, sort: c.sort }); }
const AXES = [['none', 'One variant (or variants do not matter)'], ['size', 'Size (S, M, L…)'], ['hand', 'Hand (right, left)'], ['loft_hand', 'Loft and hand (clubs)'], ['hand_size', 'Hand and size (gloves)']];
function lineFields(row, s) {
  return [
    { key: 'name', label: 'Line name', value: row?.name || '' },
    { key: 'category_id', label: 'Category', type: 'select', value: row?.category_id || s.categories[0]?.id, options: s.categories.map(c => [c.id, c.name]) },
    { key: 'variant_axis', label: 'What the variants mean', type: 'select', value: row?.variant_axis || 'none', options: AXES, help: 'Drives the size curve and how orders are split.' },
    { key: 'factory_id', label: 'Factory', type: 'select', value: row?.factory_id || '', options: [['', 'None yet'], ...s.factories.map(f => [f.id, f.name])] },
    { key: 'lead_override_days', label: 'Lead time override (days)', type: 'number', value: row?.lead_override_days ?? '', min: 0, help: 'Production plus shipping, when this line differs from its factory. Empty uses the factory.' },
    { key: 'moq', label: 'Minimum order per style', type: 'number', value: row?.moq ?? '', min: 0, help: 'Empty uses the factory default.' },
    { key: 'target_designs', label: 'Assortment target', type: 'number', value: row?.target_designs ?? '', min: 0, help: 'How many designs next season. Creates open slots.' },
    { key: 'cut_rule_pct', label: 'Cut zone, bottom %', type: 'number', value: row?.cut_rule_pct ?? '', min: 0, help: 'By 90-day sales. Empty means manual cuts only.' },
  ];
}
async function addLine(catId) { const s = st(); const r = await modal({ title: 'New product line', hint: 'Hoodies, Quarter zips, Beanies, Bags. Then sort its Shopify types into it.', fields: lineFields({ category_id: catId }, s), confirm: 'Create' }); if (!r?.name) return; await save('/api/lines', clean(r), 'PUT', 'Line created'); }
async function editLine(id) {
  const s = st(); const row = s.db.lines.find(x => x.id === id); const l = lineById(id);
  const types = s.shopTypes; const mapped = s.db.typeMap.filter(tm => tm.line_id === id).map(tm => tm.shop_type);
  const curveNow = row.size_curve ? (typeof row.size_curve === 'string' ? JSON.parse(row.size_curve) : row.size_curve) : null;
  const p = modal({ title: row.name, hint: 'Everything about this line. Shopify product types are sorted below.', fields: [...lineFields(row, s),
    { key: 'types', label: 'Shopify product types in this line', value: mapped.join(', '), wide: true, help: `Comma separated. Known types: ${types.join(', ')}` },
    { key: 'curve', label: `${l.axis === 'loft_hand' ? 'Loft mix' : 'Size curve'} override`, value: curveNow ? Object.entries(curveNow).map(([k, v]) => `${k} ${v}`).join(', ') : '', wide: true, help: `Empty learns it from sales (now: ${Object.entries(l.sizeCurveLearned).filter(([k]) => k).map(([k, v]) => `${k} ${Math.round(v * 100)}`).join(', ') || 'no sales yet'}). To set by hand: "S 5, M 20, L 45, XL 25, XXL 5".` }], confirm: 'Save' , body: `<div style="display:flex;gap:8px;margin-bottom:4px"><button class="btn sm danger" id="mDel">Delete line</button></div>` });
  let wantsDelete = false;
  $('#mDel').onclick = () => { wantsDelete = true; $('#mCancel').click(); };
  const r = await p;
  if (wantsDelete) {
    const ok = await modal({ title: `Delete ${row.name}?`, hint: `${plural(l.designs, 'product')} lose their line and show as unsorted until you sort their Shopify types again. Orders and history are untouched.`, fields: false, confirm: 'Delete line', danger: true });
    if (ok) await save(`/api/lines/${encodeURIComponent(id)}`, null, 'DELETE', 'Line deleted');
    return;
  }
  if (!r) return;
  const curve = {}; for (const part of (r.curve || '').split(',')) { const mm = /^\s*(.+?)\s+([\d.]+)\s*$/.exec(part); if (mm) curve[mm[1]] = +mm[2]; }
  try {
    await api('/api/lines', { method: 'PUT', body: { ...clean(r), id, size_curve: Object.keys(curve).length ? curve : null } });
    const want = (r.types || '').split(',').map(t => t.trim()).filter(Boolean);
    const patch = {}; for (const t of mapped) if (!want.includes(t)) patch[t] = null; for (const t of want) patch[t] = id;
    if (Object.keys(patch).length) await api('/api/type-map', { method: 'PUT', body: patch });
    await load({ quiet: true }); toast('Saved');
  } catch (e) { toast(e.message, { kind: 'err' }); }
}
function clean(r) { const o = { ...r }; for (const k of ['lead_override_days', 'moq', 'target_designs', 'cut_rule_pct', 'sort']) if (k in o) o[k] = o[k] === '' ? null : +o[k]; delete o.types; delete o.curve; if (o.factory_id === '') o.factory_id = null; return o; }
async function sortTypes() {
  const s = st(); const unsorted = s.shopTypes.filter(t => !s.db.typeMap.some(tm => tm.shop_type === t));
  const r = await modal({ title: 'Sort product types into lines', hint: 'Pick a line for each. Products in that type are forecast from the next load.', fields: unsorted.map(t => ({ key: t, label: t || '(no type)', type: 'select', value: '', options: [['', 'Leave unsorted'], ...s.lines.map(l => [l.id, `${l.categoryName} · ${l.name}`])] })) });
  if (!r) return; const patch = {}; for (const [t, v] of Object.entries(r)) if (v) patch[t] = v; if (Object.keys(patch).length) await save('/api/type-map', patch);
}
function settingsFactories(s) {
  return `<div class="card flush"><div class="card-hd"><div><b>Factories</b><div class="tiny">Lead times live here. A line can override its lead time; a product can override that.</div></div><button class="btn sm" style="margin-left:auto" onclick="editFactory(null)">${ic('plus')}Factory</button></div>
    <div class="tbl-wrap"><table><tr><th>Factory</th><th>Makes</th><th class="num">Production</th><th class="num">Shipping</th><th class="num">Order every</th><th class="num">Minimum</th><th>Closed</th><th>Next window</th><th></th></tr>
    ${s.factories.map(f => `<tr class="click" onclick="editFactory('${f.id}')"><td style="padding-left:18px"><b>${esc(f.name)}</b>${f.contact ? `<div class="tiny">${esc(f.contact)}</div>` : ''}</td><td class="tiny wrap">${esc(s.lines.filter(l => l.factoryId === f.id).map(l => l.name).join(', ') || 'nothing yet')}</td><td class="num">${f.production_days} d</td><td class="num">${f.shipping_days} d</td><td class="num">${f.order_cycle_days} d</td><td class="num">${f.moq_default ?? '—'}</td><td class="tiny">${(f.closures || []).map(c => `${fmtDate(c.from)} to ${fmtDate(c.to)}`).join('; ') || '—'}</td><td class="tiny">${fmtDate(f.nextWindow.from)}</td><td><span class="btn quiet sm">Edit</span></td></tr>`).join('') || `<tr><td colspan="9"><div class="empty">No factories yet.</div></td></tr>`}
    </table></div></div>`;
}
async function editFactory(id) {
  const f = id ? st().factories.find(x => x.id === id) : null;
  const r = await modal({ title: f ? f.name : 'New factory', hint: 'Days are calendar days. Closures block production; anything that has to land after a closure is scheduled around it.', fields: [
    { key: 'name', label: 'Name', value: f?.name || '' }, { key: 'contact', label: 'Contact', value: f?.contact || '', placeholder: 'Name, email' },
    { key: 'production_days', label: 'Production days', type: 'number', value: f?.production_days ?? 60, min: 0 }, { key: 'shipping_days', label: 'Shipping days', type: 'number', value: f?.shipping_days ?? 30, min: 0 },
    { key: 'order_cycle_days', label: 'You order every (days)', type: 'number', value: f?.order_cycle_days ?? 90, min: 1, help: 'Sets the order window on Reorder.' }, { key: 'moq_default', label: 'Minimum order per style', type: 'number', value: f?.moq_default ?? '', min: 0 },
    { key: 'closures', label: 'Closures', value: (f?.closures || []).map(c => `${c.from} to ${c.to}${c.label ? ` ${c.label}` : ''}`).join('; '), wide: true, help: 'YYYY-MM-DD to YYYY-MM-DD label; separate with semicolons. Example: 2027-02-06 to 2027-02-20 Chinese New Year' },
    { key: 'notes', label: 'Notes', type: 'textarea', value: f?.notes || '', wide: true }] });
  if (!r?.name) return;
  const closures = (r.closures || '').split(';').map(x => /(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\s*(.*)/.exec(x.trim())).filter(Boolean).map(mm => ({ from: mm[1], to: mm[2], label: mm[3] || '' }));
  await save('/api/factories', { id: f?.id, name: r.name, contact: r.contact, production_days: +r.production_days, shipping_days: +r.shipping_days, order_cycle_days: +r.order_cycle_days, moq_default: r.moq_default === '' ? null : +r.moq_default, closures, notes: r.notes });
}
function settingsLifecycle(s) {
  const groups = Object.keys(LIFECYCLE).map(k => [k, s.products.filter(p => p.lifecycle === k)]);
  return `<div class="card"><h3>Kind of product</h3><div class="hint">Every product is one of these. It decides whether Supply forecasts it for reorder. Change it here or on the product's own sheet.</div>
    <table style="margin-top:10px;font-size:13px"><tr><th>Status</th><th class="num">Products</th><th>Means</th></tr>
      ${[['core', 'Always forecast. Zero stock is an emergency.'], ['seasonal', 'Forecast against its season.'], ['drop', 'Sells out on purpose. Never asks for a reorder.'], ['winding_down', 'No reorder; sells the rest down. The cut decision sets this too.'], ['discontinued', 'Hidden everywhere except history.']].map(([k, d]) => `<tr><td>${pill({ core: 'brand', seasonal: 'brand', drop: 'good', winding_down: 'warn', discontinued: 'unk' }[k], LIFECYCLE[k])}</td><td class="num">${groups.find(g => g[0] === k)[1].length}</td><td class="tiny wrap">${d}</td></tr>`).join('')}</table></div>
    <div class="card flush"><div class="card-hd"><b>Every product</b><span class="tiny">Change the kind here; it saves at once.</span></div><div class="tbl-wrap"><table><tr><th>Product</th><th>Line</th><th class="num">On hand</th><th class="num">Sold 90d</th><th>Status</th><th>Kind</th></tr>
      ${s.products.map(p => `<tr><td style="padding-left:18px" class="click" onclick="openProduct('${p.id}')"><b>${esc(p.title)}</b></td><td class="tiny">${esc(p.lineName || 'unsorted')}</td><td class="num">${fmtInt(p.onHand)}</td><td class="num">${p.sold90}</td><td>${statusPill(p)}</td><td><select onchange="setProduct('${p.id}',{lifecycle:this.value})">${Object.entries(LIFECYCLE).map(([k, l]) => `<option value="${k}" ${p.lifecycle === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`).join('')}
    </table></div></div>`;
}
function settingsRules(s) {
  const R = [['buffer_days', 'Buffer days', 'Padding on every lead time for customs and surprises.'], ['cover_days', 'Coverage after landing (days)', 'How many days of sales an order should cover once it lands.'], ['watch_days', 'Coming-up window (days)', 'How far past the order window a product still shows as coming up.'],
    ['reliable_days', 'Days on the shelf before a size has its own rate', 'Below this, a size\'s demand comes from the line\'s size curve.'], ['site_prep_days', 'Days from landing to on the site', 'Receiving, photography, listing.'], ['design_days', 'Design days', 'From brief to first sample request.'], ['sample_days', 'Sampling days', 'From sample request to approval.'], ['tech_pack_days', 'Tech pack to sample in hand (days)', 'What the factory needs from getting the tech pack to the sample arriving. Sets the tech pack date.'], ['slack_days', 'Slack before the order date', 'Room for a second sample round.'], ['dead_days', 'Dead stock after (days without a sale)', '']];
  return `<div class="card"><h3>Rules</h3><div class="hint">The numbers behind every date and suggestion. Change one and every screen follows.</div>
    <div class="fields" style="margin-top:12px">${R.map(([k, l, h]) => `<div class="field"><label>${l}</label><input type="number" min="0" value="${s.settings[k] ?? ''}" onchange="save('/api/settings',{${k}:+this.value})">${h ? `<div class="help">${h}</div>` : ''}</div>`).join('')}
      <div class="field"><label>Season name</label><input value="${esc(s.settings.season_name || '')}" placeholder="${nextSeason()}" onchange="save('/api/settings',{season_name:this.value})"></div>
      <div class="field"><label>Season on-site date</label><input type="date" value="${esc(s.settings.season_on_site || '')}" onchange="save('/api/settings',{season_on_site:this.value})"></div>
    </div></div>
    <div class="card"><h3>How a status is decided</h3><div class="hint">Core sizes are the ones carrying 80% of a product's sales. A product is <b>Out</b> when core sizes at zero carry half its sales; otherwise an empty size is a size gap. <b>Order now</b> when the order-by date (run-out minus lead time) is inside the factory's order window. <b>Coming up</b> within the window plus ${s.settings.watch_days} days. <b>Stock gap</b> when an order is on the way but lands after the run-out. <b>On the way</b> when it lands in time.</div></div>`;
}
function settingsAsana(s) {
  const named = s.settings.asana_project_name;
  return `<div class="two even">
    <div class="card"><h3>Where design tasks go</h3><div class="hint">Every open slot on Lineup plan can become one Asana task: the slot's name, the brief-due date as the task's due date, the sample, order and on-site dates in the description, and a link back to the slot. Pick the project they land in.</div>
      <div class="fields" style="margin-top:12px"><div class="field" style="grid-column:1/-1"><label>Asana project</label><select id="asProj"><option>loading…</option></select><div class="help" id="asWho">${named ? `Today: ${esc(named)}.` : 'Nothing chosen yet, so the Create in Asana buttons will ask for this first.'}</div></div>
        <div class="field" style="grid-column:1/-1"><label>Checklist on every design task</label><textarea id="asSteps" rows="8" style="min-height:150px">${esc((s.settings.design_steps || DEFAULT_STEPS).join('\n'))}</textarea><div class="help">One step per line, created as subtasks under the task. A step that mentions the brief, the tech pack, the sample, the order or the site is dated from that. Leave it empty for no checklist.</div></div></div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" onclick="saveAsanaProject()">Save</button><button class="btn quiet" onclick="loadAsanaProjects()">Reload the list</button></div><div class="msg" id="asMsg"></div></div>
    <div class="card"><h3>How the hand-off behaves</h3><div class="hint">Supply creates the task once. After that the button on the slot opens it instead, and the slot shows whether Asana still has it open or someone has ticked it off; that is re-read every time the slot is opened.<br><br>Moving the on-site date moves the slot's dates but not the dates on a task already made. Emptying the Asana field on a slot unlinks the task without touching it in Asana.<br><br>The token is a personal access token held by the worker, so tasks are created as whoever made that token.</div></div>
  </div>`;
}
async function loadAsanaProjects() {
  const sel = $('#asProj'); if (!sel) return;
  const msg = $('#asMsg'); const cur = st().settings.asana_project || '';
  try {
    const r = await api('/api/asana/projects');
    if (!r.connected) { sel.innerHTML = '<option value="">Asana is not connected</option>'; msg.className = 'msg err'; msg.textContent = 'This worker has no Asana token yet, so it cannot list projects or make tasks.'; return; }
    sel.innerHTML = '<option value="">No project (the buttons stay off)</option>' + (r.projects || []).map(p => `<option value="${esc(p.gid)}" data-n="${esc(p.name)}" ${p.gid === String(cur) ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    if (r.me?.name) $('#asWho').textContent = `Tasks are created as ${r.me.name}. ${st().settings.asana_project_name ? `They go in ${st().settings.asana_project_name}.` : 'Choose the project.'}`;
  } catch (e) { sel.innerHTML = '<option value="">Could not reach Asana</option>'; msg.className = 'msg err'; msg.textContent = e.message; }
}
const DEFAULT_STEPS = ['Brief written and approved', 'Artwork approved', 'Tech pack built and sent to the factory', 'Sample requested', 'Sample reviewed and notes sent', 'Sample approved', 'Added to an order', 'Listed on the site'];
async function saveAsanaProject() {
  const sel = $('#asProj'), msg = $('#asMsg');
  const name = sel.selectedOptions[0]?.dataset.n || '';
  const steps = $('#asSteps').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 20);
  msg.className = 'msg'; msg.textContent = 'Saving…';
  try { await save('/api/settings', { asana_project: sel.value, asana_project_name: name, design_steps: steps }, 'PUT', null); msg.className = 'msg ok'; msg.textContent = sel.value ? `Design tasks go in ${name}, with ${plural(steps.length, 'step')}.` : 'No project set.'; }
  catch (e) { msg.className = 'msg err'; msg.textContent = e.message; }
}
function settingsSlack(s) {
  return `<div class="two even">
    <div class="card"><h3>Slack</h3><div class="hint">The morning digest is built from this screen's decisions (to order, landings, revenue at risk) and posted by the hourly Shopify check at the hour below. Reorder alerts fire the moment a product crosses its order date.</div>
      <div class="fields" style="margin-top:12px" id="slackFields"><div class="field"><label>Channel</label><select id="slChan"><option>loading…</option></select></div><div class="field"><label>Digest hour (Central)</label><select id="slHour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${h === 0 ? '12 am' : h < 12 ? h + ' am' : h === 12 ? '12 pm' : (h - 12) + ' pm'}</option>`).join('')}</select></div><div class="field"><label>Send the digest</label><select id="slMode"><option value="always">Every day</option><option value="issues">Only when something needs a decision</option></select></div></div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" onclick="saveSlack()">Save</button><button class="btn" onclick="api('/api/digest',{method:'POST'}).then(r=>toast(r.ok?'Digest posted to Slack':(r.error||'Slack said no'),{kind:r.ok?'':'err'})).catch(e=>toast(e.message,{kind:'err'}))">Send the digest now</button><button class="btn quiet" onclick="previewDigest()">Preview</button></div><div class="msg" id="slackMsg"></div></div>
    <div class="card"><h3>Data</h3><div class="hint">Shopify is read every hour by the Restock worker. ${plural(s.historyDays, 'day')} of sales history since ${fmtDate(s.historyStart, { year: true })}. Seasonality needs a year; the read_all_orders scope on the Shopify app unlocks a two-year backfill.</div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="runSnapshot()">Run a snapshot now</button><button class="btn" onclick="backfill()">Backfill 2 years of sales</button><button class="btn quiet" onclick="showChangelog()">Changelog</button></div><div class="msg" id="dataMsg"></div></div>
    <div class="card"><h3>The tour</h3><div class="hint">A two-minute walk through every screen in plain words. It ran on your first visit.</div><div style="margin-top:10px"><button class="btn" onclick="startTour()">Take the tour again</button></div></div>
    <div class="card"><h3>Brand</h3><div class="hint">${esc(s.brandName)} · ${esc(s.db.brand?.shop_domain || '')} · ${esc(s.tz)}. More brands are switched on in the worker (one row each), same Restock-style Shopify app per store.</div></div>
  </div>`;
}
async function backfill() {
  const ok = await modal({ title: 'Backfill sales history', hint: 'Re-pulls orders from Shopify in chunks. Without the read_all_orders scope Shopify only returns the last 60 days, so this mostly matters after the scope is added. Safe to run more than once.', fields: false, confirm: 'Start' });
  if (!ok) return;
  $('#dataMsg').textContent = 'Working…';
  try { let r; do { r = await api('/api/shopify/backfill', { method: 'POST', body: { days: 730 } }); $('#dataMsg').textContent = `${r.ordersProcessed} orders so far…`; } while (!r.done); $('#dataMsg').textContent = `Done. History starts ${fmtDate(r.historyStart, { year: true })}.`; await load({ quiet: true }); }
  catch (e) { $('#dataMsg').textContent = e.message; }
}
/* Slack channel, digest hour and mode live in the Restock worker's settings (it
   owns the Slack token and the cron); Supply reads and writes them through it. */
async function loadSlack() {
  try {
    const [cfg, ch] = await Promise.all([api('/api/shopify/settings'), api('/api/shopify/channels').catch(() => ({ channels: [] }))]);
    const cur = cfg.stores?.[S.brand]?.channel || '';
    const sel = $('#slChan'); if (!sel) return;
    sel.innerHTML = `<option value="">No channel (digest off)</option>` + (ch.channels || []).map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>#${esc(c.name)}${c.is_member ? '' : ' (invite the bot first)'}</option>`).join('');
    if (cur && !(ch.channels || []).some(c => c.id === cur)) sel.insertAdjacentHTML('beforeend', `<option value="${esc(cur)}" selected>${esc(cur)}</option>`);
    $('#slHour').value = String(cfg.digestHourLocal ?? 6); $('#slMode').value = cfg.digestMode || 'always';
  } catch (e) { const m = $('#slackMsg'); if (m) { m.textContent = e.message; m.className = 'msg err'; } }
}
async function saveSlack() {
  const m = $('#slackMsg'); m.textContent = 'Saving…'; m.className = 'msg';
  try {
    await api('/api/shopify/settings', { method: 'PUT', body: { digestHourLocal: +$('#slHour').value, digestMode: $('#slMode').value, stores: { [S.brand]: { channel: $('#slChan').value } } } });
    await save('/api/settings', { digest_hour: +$('#slHour').value }, 'PUT', null);
    m.textContent = 'Saved.'; m.className = 'msg ok';
  } catch (e) { m.textContent = e.message; m.className = 'msg err'; }
}
async function previewDigest() {
  const r = await api('/api/digest');
  const blocks = r.attachments?.[0]?.blocks || [];
  const text = blocks.map(b => b.text?.text || (b.elements || []).map(e => e.text).join(' ') || (b.type === 'divider' ? '────' : '')).join('\n\n');
  await modal({ title: 'Tomorrow morning in Slack', fields: false, confirm: 'Close', body: `<pre style="white-space:pre-wrap;font:12.5px/1.5 var(--sans);background:var(--bg);padding:12px 14px;border-radius:8px;max-height:50vh;overflow:auto">${esc(text)}</pre>` });
}
async function showChangelog() {
  const r = await api('/api/changelog');
  await modal({ title: 'Changelog', fields: false, confirm: 'Close', body: `<div style="max-height:50vh;overflow:auto;font-size:12.5px">${(r.entries || []).map(e => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(e.action)}</b> ${esc(e.entity)} ${esc(e.entity_id || '')} <span class="tiny">· ${esc(e.actor || '')} · ${new Date(e.at.replace(' ', 'T') + 'Z').toLocaleString('en-US', { timeZone: 'America/Chicago' })}</span></div>`).join('') || '<div class="hint">Nothing yet.</div>'}</div>` });
}
