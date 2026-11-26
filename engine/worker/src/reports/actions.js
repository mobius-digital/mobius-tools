/* Open tasks, grouped per brand, the shape the meetings list and the Monday screen read. Read only. */
// from account-health/worker/src/actions.js (listActions, openItems, itemUrl)

export const ymd = ms => new Date(ms).toISOString().slice(0, 10);

/** The Monday of the week a day is in. */
// from account-health/worker/src/meetings.js (mondayOf)
export function mondayOf(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/* A task's link opens the screens, and the engine does not hold the screens' address. It is read off
   one old answer: the link of any open task, up to its question mark. '' when there is no open task. */
export function appBaseFrom(old) {
  for (const group of (old && Array.isArray(old.open) ? old.open : [])) {
    for (const item of (group && Array.isArray(group.items) ? group.items : [])) {
      if (item && typeof item.url === 'string' && item.url.includes('?open=actions')) return item.url.split('?')[0];
    }
  }
  return '';
}

function itemUrl(base, row) {
  if (!base) return null;
  const brand = row.act_id ? `&act=${encodeURIComponent(row.act_id)}` : '';
  return `${base}?open=actions${brand}&item=${encodeURIComponent(row.id)}`;
}

/** Open tasks grouped per brand, the agency's own first, then by brand name. */
export async function openGroups(ctx, brands, base) {
  const rows = await ctx.db.all('reports.openActions', {});
  const nameOf = id => (id ? (brands.find(b => b.act_id === id) || {}).name || id : 'Agency-wide');
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.act_id)) by.set(r.act_id, { brand_id: r.act_id, name: nameOf(r.act_id), items: [] });
    by.get(r.act_id).items.push({ id: r.id, name: r.text, text: r.text, detail: r.detail || '', owner: r.owner, due: r.due,
      kind: r.kind, area: r.area || '', source: r.source, source_id: r.source_id, url: itemUrl(base, r),
      asana_url: r.asana_url || null, created: String(r.created_at || '').slice(0, 10) });
  }
  return [...by.values()].sort((a, b) => (a.brand_id ? 1 : 0) - (b.brand_id ? 1 : 0) || a.name.localeCompare(b.name));
}

/** The items of one group ('' is the agency's own), or an empty list. */
export const itemsOf = (groups, brandId) => (groups.find(g => g.brand_id === brandId) || {}).items || [];
