/* Group production: the reads answered from the shared database.
   Requests and approvals, the photo library, saved reference ads. */
// from account-health/worker/src/requests.js (listRequests, previewOf)
// from account-health/worker/src/assets.js (listAssets, sourcesFor)
// from profit/worker/src/inspo.js (the GET branch of handleInspo)
import { fail } from '../platform/errors.js';
import { safeJson, isBrandId } from '../platform/text.js';

const DAY_MS = 864e5;
const AD_ID = /^[a-f0-9]{24}$/;
const MAX_PREVIEW_CHUNKS = 25;          // keeps one request inside the statement budget
const NO_NAME = 'The team';             // a row with no name and no email (the old code typed the agency name here)
const clean = (s, n = 2000) => String(s ?? '').trim().slice(0, n);

/* 'pat@x' becomes 'Pat'. The name shown when a row has no name of its own. */
function nameOfEmail(email) {
  const local = String(email || '').split('@')[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : NO_NAME;
}

/* How many ids fit in one IN list beside the brand ids the door adds (100 values at most). */
const chunkSize = ctx => Math.max(10, 90 - (ctx.scope.ids || []).length);

function chunks(list, n) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

const adIdsOf = row => String(row.ref || '').split(',').filter(x => AD_ID.test(x)).slice(0, 40);

/* ---------- requests and approvals ---------- */

async function threadsOf(ctx, rows) {
  const threads = new Map();
  for (const ids of chunks(rows.map(r => r.id), chunkSize(ctx))) {
    for (const m of await ctx.db.all('production.requestMessages', { ids })) {
      if (!threads.has(m.request_id)) threads.set(m.request_id, []);
      threads.get(m.request_id).push({ by: m.by_name || nameOfEmail(m.by_email), role: m.by_role, text: m.text, at: m.created_at });
    }
  }
  return threads;
}

/* What each item points at: the Studio ads of an approval, or its calendar date. Read in a few
   statements for the whole list. null when the list is too long for one request. */
async function previewsOf(ctx, rows) {
  const adIds = [...new Set(rows.filter(r => r.what === 'studio').flatMap(adIdsOf))];
  const dateIds = [...new Set(rows.filter(r => r.what === 'date' && r.ref).map(r => String(r.ref)))];
  const size = chunkSize(ctx);
  if (Math.ceil(adIds.length / size) + Math.ceil(dateIds.length / size) > MAX_PREVIEW_CHUNKS) return null;
  const ads = new Map(), dates = new Map();
  for (const ids of chunks(adIds, size)) for (const a of await ctx.db.all('production.studioAds', { ids })) ads.set(a.id, a);
  const cal = dateIds.length ? ctx.other('CAL') : null;
  for (const ids of chunks(dateIds, size)) for (const e of await cal.all('production.calendarDates', { ids })) dates.set(e.id, e);
  return { ads, dates };
}

function adOut(r) {
  const spec = safeJson(r.spec_json, {});
  return { id: r.id, img: r.has_final ? 'final' : 'full', v: String(r.updated_at || '').replace(/\D/g, ''),
    approved: r.status === 'approved', headline: clean(spec.headline || '', 140) };
}

function previewOf(row, found) {
  if (row.what === 'studio') {
    return { ads: adIdsOf(row).map(id => found.ads.get(id)).filter(r => r && r.status !== 'deleted').map(adOut) };
  }
  if (row.what === 'date' && row.ref) {
    const e = found.dates.get(String(row.ref));
    if (!e) return { date: null };
    return { date: { id: e.id, name: e.name, start: e.launch_date, end: e.promo_end_date || null, offer: e.brief || '',
      confirmed: e.status === 'confirmed' || e.status === 'completed', cancelled: e.status === 'cancelled' } };
  }
  return {};
}

function requestOut(r, names, threads, found) {
  return { id: r.id, act_id: r.act_id, brand: names.get(r.act_id) || r.act_id, kind: r.kind, what: r.what || null, ref: r.ref || null,
    title: r.title, body: r.body || '', link: r.link || '', status: r.status, by: r.by_name || nameOfEmail(r.by_email), by_role: r.by_role,
    decided_by: r.decided_by || null, decided_at: r.decided_at || null, decision_note: r.decision_note || '',
    created_at: r.created_at, updated_at: r.updated_at, thread: (threads.get(r.id) || []).slice(-50), ...previewOf(r, found) };
}

/** GET /ah/api/requests: open items and the ones closed in the last 60 days, newest change first. */
export async function listRequests(ctx) {
  const since = new Date(ctx.now.getTime() - 60 * DAY_MS).toISOString();
  const rows = await ctx.db.all('production.requestRows', { since, exact: ctx.scope.brand || '' });
  const found = await previewsOf(ctx, rows);
  if (!found) return ctx.forward('too many previews for one request');
  const names = new Map((await ctx.db.all('production.brandNames', {})).map(b => [b.act_id, b.name]));
  const threads = rows.length ? await threadsOf(ctx, rows) : new Map();
  const items = rows.map(r => requestOut(r, names, threads, found));
  /* Waiting for the client: open approvals and asks. Waiting for the team: open client requests and
     approvals the client answered with changes. */
  const waiting_client = items.filter(i => (i.kind === 'approval' || i.kind === 'ask') && i.status === 'open').length;
  const waiting_team = items.filter(i => (i.kind === 'request' && i.status === 'open') || (i.kind === 'approval' && i.status === 'changes')).length;
  return { items, waiting_client, waiting_team };
}

/* ---------- the photo library ---------- */

const folderId = u => (/folders\/([\w-]{10,})/.exec(String(u || '')) || /^([\w-]{20,})$/.exec(String(u || '').trim()) || [])[1] || null;

/* The folders the library is read from: the brand's drive connection, then any extra folders. */
async function sourcesFor(ctx) {
  const drive = await ctx.db.one('production.assetDrive', {});
  const row = await ctx.db.one('production.assetFolders', {});
  const doc = safeJson(row && row.data_json, {});
  const ids = [doc.drive === false ? null : folderId(drive && drive.external_id), ...(doc.folders || []).map(folderId)].filter(Boolean);
  return [...new Set(ids)];
}

function assetParams(q) {
  const words = String(q.q || '').toLowerCase().split(/\s+/).filter(x => x.length > 1).slice(0, 6);
  const asked = Number(q.limit) || 120;
  const p = { people: q.people === 'yes' || q.people === 'no' ? q.people : '', setting: q.setting || '',
    locus: q.source === 'locus' ? 1 : 0, limit: asked > 0 ? Math.min(asked, 400) : 400 };
  for (let i = 0; i < 6; i++) p[`w${i + 1}`] = words[i] ? `%${words[i]}%` : '';
  return p;
}

function assetOut(r) {
  const { look_json, ...rest } = r;
  return { ...rest, look: look_json ? safeJson(look_json, null) : null };
}

/** GET /ah/api/assets: search one brand's photo library. Words match the description, name, products, tags and path. */
export async function listAssets(ctx, input) {
  const act = ctx.scope.brand || '';
  if (!isBrandId(act)) fail(400, 'act is required');
  const rows = await ctx.db.all('production.assetRows', assetParams(input.query));
  const counts = await ctx.db.all('production.assetCounts', {});
  const settings = await ctx.db.all('production.assetSettings', {});
  const looks = await ctx.db.one('production.assetLooks', {});
  const at = await ctx.db.one('production.assetSyncedAt', {});
  return { act, items: rows.map(assetOut), looks: (looks && looks.n) || 0,
    counts: Object.fromEntries(counts.map(r => [r.status, r.n])), settings,
    synced_at: (at && at.value) || null, sources: await sourcesFor(ctx) };
}

/* ---------- saved reference ads ---------- */

const inspoOut = r => ({ id: r.id, act: r.act_id, kind: r.kind, url: r.url, image: r.image, title: r.title, site: r.site,
  note: r.note, by: r.created_by, at: r.created_at });

/** GET /pw/api/inspo: what people saved as inspiration for one brand, newest first. */
export async function listInspo(ctx, input) {
  if (!input.query.act) fail(400, 'Pick a brand.');
  if (!ctx.scope.brand) return { items: [] };   // "all" names no brand, and the old exact match found no rows for it
  return { items: (await ctx.db.all('production.inspoRows', {})).map(inspoOut) };
}
