/* Reports, briefs and shared links: the reads the new screens make, answered from the shared database. */
// from account-health/worker/src/worker.js (briefs near 10873, reports near 10883, report near 10894)
// from account-health/worker/src/brandguard.js (sentOnlyList, sentOnlyOne: a client sees what was sent)
// from profit/worker/src/snapshot.js (the Shared links list) and profit/worker/src/clientpage.js (the list)
import { fail } from '../platform/errors.js';
import { safeJson } from '../platform/text.js';

const NO_REPORT = 'no report for that period';
const isClient = ctx => ctx.caller.kind === 'client';
const sentOnly = rows => rows.filter(r => r && r.status === 'sent');

/** GET /api/briefs. The last 60 daily briefs, one brand or every brand the caller has. */
export async function listBriefs(ctx) {
  const rows = await ctx.db.all(ctx.scope.brand ? 'reports.briefsOne' : 'reports.briefsAll', {});
  return { rows: isClient(ctx) ? sentOnly(rows) : rows };
}

/** GET /api/reports. The last 80 weekly and monthly reports, without their numbers. can_skip: the old side
 *  has POST /api/report-skip (Do not send), and says so on every answer, a client's included. A team answer also
 *  carries read_status per row (How we read it, team only; null when none was started). */
export async function listReports(ctx) {
  const name = ctx.scope.brand ? 'reports.reportsOne' : 'reports.reportsAll';
  let rows;
  try { rows = await ctx.db.all(name, {}); }
  catch (e) {
    if (!/no such table/i.test(String(e && e.message))) throw e;
    rows = await ctx.db.all(name + 'Plain', {});                                 // p_report_read not made yet
  }
  if (isClient(ctx)) return { rows: sentOnly(rows).map(({ read_status, ...r }) => r), can_skip: true };   // never the last run or the read
  return { rows, lastRun: await ctx.settings.getJson('lastReportRun', null), can_skip: true };
}

/** GET /api/report. One report with its frozen numbers. A client only gets one that was sent. */
export async function oneReport(ctx, input) {
  const { period, start } = input.query;
  if (!ctx.scope.brand || !period || !start) fail(404, NO_REPORT);
  const row = await ctx.db.one('reports.reportOne', { period, start });
  if (!row) fail(404, NO_REPORT);
  if (isClient(ctx) && row.status !== 'sent') fail(404, NO_REPORT);
  const { data_json, ...rest } = row;
  return { ...rest, data: safeJson(data_json, null) };
}

const sqlTime = date => date.toISOString().replace('T', ' ').slice(0, 19);

/** GET /api/snapshots. The shared links of the caller's brands. `live` is false once revoked or expired. */
export async function listSnapshots(ctx) {
  const rows = await ctx.db.all('reports.snapshots', {});
  const now = sqlTime(ctx.now);
  return { links: rows.map(r => ({ ...r, revoked: !!r.revoked, live: !r.revoked && (!r.expires_at || r.expires_at > now) })) };
}

/* The public address of a client page is the screens' own address, which the engine does not hold.
   It is read off one old answer: the link of any page, with its token cut from the end. */
async function pageBase(ctx, rows) {
  if (!rows.length) return '';
  const old = await ctx.legacy.get('pw', '/api/client-pages', { cache_s: 600 });
  const pages = old && Array.isArray(old.pages) ? old.pages : [];
  const hit = pages.find(p => p && typeof p.url === 'string' && p.token && p.url.endsWith(p.token));
  return hit ? hit.url.slice(0, -String(hit.token).length) : '';
}

/** GET /api/client-pages. Hand built client pages, all of them or the ones attached to one brand.
 *  Team only. A teammate limited to some brands gets the pages of those brands (the old route gave all). */
export async function listClientPages(ctx, input) {
  const raw = input.query.act || '';
  /* The old route looked for the word it was given, so "all" matched no page. Kept as it was. */
  const act = raw === 'all' ? 'all' : ctx.scope.brand || raw;
  const only = ctx.caller.ids || null;
  const rows = (await ctx.db.all('reports.clientPages', {})).map(r => ({ ...r, acts: String(r.acts || '').split(',') }))
    .filter(r => (!act || r.acts.includes(act)) && (!only || r.acts.some(a => only.has(a))));
  const base = await pageBase(ctx, rows);
  return { pages: rows.map(r => ({ ...r, revoked: !!r.revoked, url: base ? base + r.token : null })) };
}
