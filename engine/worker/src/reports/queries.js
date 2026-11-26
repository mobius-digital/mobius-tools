/* Every statement the reports group runs. The brand filter is filled in by the data door, never by input. */
// from account-health/worker/src/worker.js (briefs, reports, report), meetings.js, actions.js,
// profit/worker/src/snapshot.js and clientpage.js

const NO_BRAND_COL = 'the table has no brand column. The route is team only';

export const queries = {
  /* Daily briefs. The old route matched the brand id itself, so the one brand form does the same. */
  briefsOne: { scope: 'brand',
    sql: `SELECT b.*, acc.name AS account_name FROM briefs b JOIN brand_accounts acc ON acc.act_id = b.act_id
          WHERE b.act_id = {{brand_id}} ORDER BY b.date DESC LIMIT 60` },
  briefsAll: { scope: 'brands',
    sql: `SELECT b.*, acc.name AS account_name FROM briefs b JOIN brand_accounts acc ON acc.act_id = b.act_id
          WHERE {{brands:b.act_id}} ORDER BY b.date DESC LIMIT 60` },

  /* Weekly and monthly reports: the list (no numbers) and one report with its frozen numbers. read_status is the
     How we read it status (account-health reportread.js p_report_read: none | points | drafted | approved), so the
     To send page needs no read per draft. p_report_read is made on first use by the old side: until it exists the
     service falls back to the Plain forms (read_status left out). */
  reportsOne: { scope: 'brand',
    sql: `SELECT r.act_id, r.period, r.period_start, r.period_end, r.status, r.generated_at, r.sent_at,
                 acc.name AS account_name, acc.currency, rr.status AS read_status
          FROM reports r JOIN brand_accounts acc ON acc.act_id = r.act_id
          LEFT JOIN p_report_read rr ON rr.act_id = r.act_id AND rr.period = r.period AND rr.period_start = r.period_start
          WHERE r.act_id = {{brand_id}} ORDER BY r.period_start DESC, r.period LIMIT 80` },
  reportsAll: { scope: 'brands',
    sql: `SELECT r.act_id, r.period, r.period_start, r.period_end, r.status, r.generated_at, r.sent_at,
                 acc.name AS account_name, acc.currency, rr.status AS read_status
          FROM reports r JOIN brand_accounts acc ON acc.act_id = r.act_id
          LEFT JOIN p_report_read rr ON rr.act_id = r.act_id AND rr.period = r.period AND rr.period_start = r.period_start
          WHERE {{brands:r.act_id}} ORDER BY r.period_start DESC, r.period LIMIT 80` },
  reportsOnePlain: { scope: 'brand',
    sql: `SELECT r.act_id, r.period, r.period_start, r.period_end, r.status, r.generated_at, r.sent_at,
                 acc.name AS account_name, acc.currency
          FROM reports r JOIN brand_accounts acc ON acc.act_id = r.act_id
          WHERE r.act_id = {{brand_id}} ORDER BY r.period_start DESC, r.period LIMIT 80` },
  reportsAllPlain: { scope: 'brands',
    sql: `SELECT r.act_id, r.period, r.period_start, r.period_end, r.status, r.generated_at, r.sent_at,
                 acc.name AS account_name, acc.currency
          FROM reports r JOIN brand_accounts acc ON acc.act_id = r.act_id
          WHERE {{brands:r.act_id}} ORDER BY r.period_start DESC, r.period LIMIT 80` },
  reportOne: { scope: 'brand',
    sql: `SELECT * FROM reports WHERE act_id = {{brand_id}} AND period = :period AND period_start = :start` },

  /* Shared links. */
  snapshots: { scope: 'brands',
    sql: `SELECT s.token, s.act_id, s.kind, s.title, s.page, s.created_by, s.created_at, s.expires_at, s.revoked,
                 s.views, s.last_view, a.name AS brand
          FROM p_snapshot s LEFT JOIN brand_accounts a ON a.act_id = s.act_id
          WHERE {{brands:s.act_id}} ORDER BY s.created_at DESC LIMIT 300` },
  clientPages: { scope: 'none', why: 'a client page lists its brands in one text column. The handler keeps a limited teammate to their brands',
    sql: `SELECT token, slug, title, acts, created_by, created_at, updated_at, revoked, views, last_view
          FROM p_client_page ORDER BY updated_at DESC LIMIT 300` },

  /* Meetings. */
  meetingOne: { scope: 'none', why: NO_BRAND_COL,
    sql: `SELECT * FROM p_meeting WHERE id = :id` },
  meetingList: { scope: 'none', why: NO_BRAND_COL,
    sql: `SELECT id, title, date, at, duration, kind, status, error, cost, confirmed_by, confirmed_at, chars,
                 attendees_json, notes_json, result_json
          FROM p_meeting WHERE date >= :since ORDER BY at DESC LIMIT 100` },
  /* Open tasks of the caller's brands, and the ones that belong to no brand (the agency's own). */
  openActions: { scope: 'brands',
    sql: `SELECT * FROM p_action WHERE status = 'open' AND ({{brands:act_id}} OR act_id = '')
          ORDER BY CASE WHEN due = '' THEN 1 ELSE 0 END, due, created_at` },

  /* The Monday meeting screen. */
  weeklyLatest: { scope: 'brands',
    sql: `SELECT r.act_id, r.period, r.period_start, r.period_end, r.status, r.summary, r.data_json, r.slack_ts,
                 r.slack_channel, r.sent_at
          FROM reports r WHERE {{brands:r.act_id}} AND r.period = 'weekly'
            AND r.period_start = (SELECT MAX(x.period_start) FROM reports x WHERE x.act_id = r.act_id AND x.period = 'weekly')` },
  settingsMany: { scope: 'none', why: 'settings rows have no brand column. The keys are built from the caller\'s own brands',
    sql: `SELECT key, value FROM settings WHERE key IN (:keys)` },
  chatThreads: { scope: 'none', why: 'chat rows are named by channel and thread, both taken from the caller\'s own brands',
    sql: `SELECT channel, thread_ts, ts, name, user, text, bot FROM slack_msg
          WHERE channel IN (:channels) AND thread_ts IN (:threads) AND ts != thread_ts ORDER BY ts` },
  chatDayPosts: { scope: 'none', why: 'chat rows are named by channel and day, the channel taken from the caller\'s own brands',
    sql: `SELECT channel, day, ts, name, user, text FROM slack_msg
          WHERE channel IN (:channels) AND day IN (:days) AND bot = 0 AND (thread_ts IS NULL OR thread_ts = ts)
            AND length(text) > 120 ORDER BY ts` },
};
