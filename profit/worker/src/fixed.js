/* FIXED EXPENSES (2026-10-09, Triple Whale's "Edit expenses"). Per brand: software, salaries, the agency fee,
 * rent... each a monthly amount with a start month and an optional end month. Spread evenly over the days of
 * each month (a $3,000 month in October is $96.77 a day), so any window carries its share.
 *
 * They feed ONE new line only: NET PROFIT = contribution margin minus fixed expenses, on P&L and in the CM
 * drill-down. Contribution margin itself never changes (CTC's definition: variable costs only), and the brief,
 * reports and the Strategist keep reading CM.
 *
 *   table  p_fixed_cost (migrations/fixed-001.sql; also created on first use)
 *   GET  /api/fixed-costs?act=       the brand's list
 *   PUT  /api/fixed-costs {act, items:[{name, category, monthly, start_month, end_month}]}   replaces the list
 * Clients never reach either route (not on brandguard's CLIENT_RULES). */
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_fixed_cost (id INTEGER PRIMARY KEY AUTOINCREMENT, act_id TEXT NOT NULL, name TEXT NOT NULL,
    category TEXT, monthly REAL NOT NULL DEFAULT 0, start_month TEXT NOT NULL, end_month TEXT, created_by TEXT, updated_at TEXT DEFAULT (datetime('now')))`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_fixed_cost_act ON p_fixed_cost(act_id)`).run();
  ready = true;
}
const YM = /^\d{4}-\d{2}$/;
const dim = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
const nextDay = d => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
export const CATEGORIES = ['Software', 'Salaries', 'Agency fee', 'Rent', 'Insurance', 'Other'];

/** Fixed expenses prorated per day for many brands, one query.
 *  -> { act: { total, items: [{ name, category, monthly, amount }], byDate: { date: amount } } } */
export async function fixedFor(env, acts, from, to) {
  const out = Object.fromEntries(acts.map(a => [a, { total: 0, items: [], byDate: {} }]));
  if (!acts.length || !from || !to || from > to) return out;
  await ensure(env).catch(() => {});
  const ph = acts.map((_, i) => `?${i + 1}`).join(',');
  const { results } = await env.DB.prepare(`SELECT act_id, name, category, monthly, start_month, end_month FROM p_fixed_cost WHERE act_id IN (${ph}) ORDER BY monthly DESC`)
    .bind(...acts).all().catch(() => ({ results: [] }));
  for (const r of results || []) {
    const o = out[r.act_id]; if (!o) continue;
    let amount = 0;
    for (let d = from; d <= to; d = nextDay(d)) {
      const ym = d.slice(0, 7);
      if (ym < r.start_month || (r.end_month && ym > r.end_month)) continue;
      const v = (+r.monthly || 0) / dim(ym);
      amount += v; o.byDate[d] = (o.byDate[d] || 0) + v;
    }
    if (amount > 0) o.items.push({ name: r.name, category: r.category || null, monthly: +r.monthly || 0, amount: Math.round(amount * 100) / 100 });
    o.total += amount;
  }
  for (const a of acts) out[a].total = Math.round(out[a].total * 100) / 100;
  return out;
}

export async function handleFixed({ path, url, request, env, json, accountsFor, email }) {
  if (path !== '/api/fixed-costs') return null;
  await ensure(env);
  if (request.method === 'GET') {
    const act = url.searchParams.get('act') || '';
    const { results } = await env.DB.prepare(`SELECT id, name, category, monthly, start_month, end_month, updated_at FROM p_fixed_cost WHERE act_id = ?1 ORDER BY monthly DESC, id`).bind(act).all();
    return json({ act, items: results || [], categories: CATEGORIES });
  }
  if (request.method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const act = String(b.act || '');
    if (!(await accountsFor()).some(a => a.act_id === act)) return json({ error: 'unknown brand' }, 404);
    if (!Array.isArray(b.items) || b.items.length > 40) return json({ error: 'items must be a list of at most 40' }, 400);
    const items = [];
    for (const x of b.items) {
      const name = String(x.name || '').trim().slice(0, 60);
      const monthly = +String(x.monthly ?? '').replace(/[^0-9.]/g, '');
      const start = String(x.start_month || '').trim(), end = String(x.end_month || '').trim() || null;
      if (!name) return json({ error: 'Every expense needs a name.' }, 400);
      if (!isFinite(monthly) || monthly < 0 || monthly > 1e7) return json({ error: `${name}: the monthly amount is not a number.` }, 400);
      if (!YM.test(start)) return json({ error: `${name}: pick the month it starts.` }, 400);
      if (end && (!YM.test(end) || end < start)) return json({ error: `${name}: the end month is before the start.` }, 400);
      items.push([act, name, CATEGORIES.includes(x.category) ? x.category : null, monthly, start, end, email || null]);
    }
    const stmts = [env.DB.prepare(`DELETE FROM p_fixed_cost WHERE act_id = ?1`).bind(act),
      ...items.map(v => env.DB.prepare(`INSERT INTO p_fixed_cost (act_id, name, category, monthly, start_month, end_month, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(...v))];
    await env.DB.batch(stmts);
    return json({ ok: true, count: items.length });
  }
  return json({ error: 'method not allowed' }, 405);
}
