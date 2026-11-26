/* The stock digest on Sales > Inventory (2026-11-26, move lines a66). The same lines the Supply worker's Monday digest
   posts to the stock channel in Slack (supply/worker/src/worker.js digestMessage): one summary line (to order, overdue,
   on the way and the next landing, money at risk, dead stock) and the first six decisions, each with its color.
   Read from the state the page already loads (GET /api/supply/client?act=&what=state on the account-health worker:
   the stock feed's own headline and decisions), so there is no second read and nothing new on the worker.
   Team only: the digest was the agency's post. Only brands with a stock feed have one. Pure: no DOM, no network. */

const fmtD = ymd => ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
const money = n => n == null ? '' : '$' + (Math.abs(n) >= 10000 ? Math.round(n / 1000) + 'k' : Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n));
const noDash = s => String(s == null ? '' : s).replace(/\s*[—–]\s*/g, ', ');
/* the digest's colors, as the page's status tones */
const TONE = { bad: 'bad', warn: 'warn', good: 'good', brand: '', unk: 'off' };

/** { summary, tone, items: [{ tone, title, body }], more } from the stock state, or null when it has no headline. */
export function digestLines(st, max = 6) {
  const h = st && st.headline;
  if (!h || typeof h !== 'object') return null;
  const parts = [
    `${h.toOrder || 0} to order${h.overdue ? ` (${h.overdue} overdue)` : ''}`,
    `${h.onTheWay || 0} on the way${h.nextLanding ? `, next lands ${fmtD(h.nextLanding)}` : ''}`,
    h.revenueAtRisk ? `${money(h.revenueAtRisk)} at risk` : null,
    h.dead && h.dead.cost ? `${money(h.dead.cost)} dead stock` : null,
  ].filter(Boolean);
  const all = Array.isArray(st.decisions) ? st.decisions : [];
  const items = all.slice(0, max).map(d => ({ tone: TONE[d && d.kind] ?? 'off', title: noDash(d && d.title), body: noDash(d && d.body) })).filter(x => x.title);
  return { summary: parts.join(', '), tone: h.overdue || h.toOrder ? 'bad' : h.onTheWay ? 'warn' : 'good', items, more: Math.max(0, all.length - items.length) };
}
