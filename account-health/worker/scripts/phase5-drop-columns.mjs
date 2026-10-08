/* Phase 5 of the brand-first rebuild: the old brand columns leave the Meta accounts table.
 *   node scripts/phase5-drop-columns.mjs --db=<database id> [--dry]
 * Since phase 3 these live on `brands` and nothing reads them from `accounts` (checked by grep before this
 * ran: every remaining query on accounts touches only the Meta sync columns). Take a time-travel bookmark
 * first. Idempotent: a column already gone is skipped. */
import { remoteEnv } from './d1rest.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const DRY = process.argv.includes('--dry');
const database = arg('db');
if (!database) { console.error('--db=<database id> is required'); process.exit(1); }
const { DB } = await remoteEnv({ database });

const DROP = ['active', 'monthly_budget', 'budgets_json', 'target_cpa', 'target_roas', 'slack_channel', 'brief_channel',
  'tw_shop', 'google_spend_json', 'goals_json', 'brief_enabled', 'brief_review', 'review_first', 'report_channel',
  'report_config_json', 'report_client_channel', 'demo', 'tw_attr_cursor', 'tw_attr_done'];
const KEEP = ['act_id', 'name', 'currency', 'tz', 'account_status', 'added_at', 'last_sync_insights', 'last_sync_activities',
  'last_error', 'ads_backfill_done', 'ads_video_done', 'ads_video_cursor', 'ads_metrics_version', 'ads_metrics_cursor'];

const cols = (await DB.prepare(`SELECT name FROM pragma_table_info('accounts')`).all()).results.map(r => r.name);
const unknown = cols.filter(c => !DROP.includes(c) && !KEEP.includes(c));
if (unknown.length) { console.error(`accounts has columns this script does not know: ${unknown.join(', ')}. Decide on them first.`); process.exit(1); }
for (const c of DROP.filter(c => cols.includes(c))) {
  if (DRY) { console.log(`[dry] drop ${c}`); continue; }
  await DB.prepare(`ALTER TABLE accounts DROP COLUMN "${c}"`).run();
  console.log(`dropped ${c}`);
}
const after = (await DB.prepare(`SELECT name FROM pragma_table_info('accounts')`).all()).results.map(r => r.name);
console.log('accounts now:', after.join(', '));
const v = await DB.prepare(`SELECT COUNT(*) n FROM brand_accounts`).first();
console.log(`brand_accounts still reads: ${v.n} brands`);
