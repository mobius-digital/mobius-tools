/* Every statement of the automations group. The tables are the old ones, as they are.
   A row a person owns is held to them by :email, which the data door checks for a client login. */
// from account-health/worker/src/automations.js (the SELECT, INSERT, UPDATE and DELETE lines of handleAutomations and teamList)

const TEAM_ONLY = 'a team only route. The old handler reads this whole, then keeps what the caller may see';
const MINE = 'a person\'s own rows, held to the caller by :email';
const SEEN = `({{brands:brand_id}} OR owner_person = :email)`;

export const queries = {
  /* Are the old tables there. The old worker makes them on first use, the engine never makes a table. */
  ready: { scope: 'none', why: 'checks the old tables exist, reads no row. :email keeps it open to a client login',
    sql: `SELECT (SELECT COUNT(*) FROM p_automation WHERE 0) + (SELECT COUNT(*) FROM p_automation_run WHERE 0)
          + (SELECT COUNT(*) FROM p_automation_sub WHERE 0) + (SELECT COUNT(*) FROM p_notice WHERE 0)
          + (SELECT COUNT(*) FROM p_person_delivery WHERE 0) AS n WHERE :email IS NOT NULL` },

  /* settings and brands, team only */
  settingsMany: { scope: 'none', why: 'agency settings, no brand column. ' + TEAM_ONLY,
    sql: `SELECT key, value FROM settings WHERE key IN (:keys)` },
  allBrands: { scope: 'none', why: 'the brand names behind the sentences and the role notes. ' + TEAM_ONLY,
    sql: `SELECT act_id, name, active FROM brand_accounts ORDER BY active DESC, name` },
  prefPeople: { scope: 'none', why: 'the team list: anyone who saved their own settings. ' + TEAM_ONLY,
    sql: `SELECT SUBSTR(key, 11) AS e FROM settings WHERE key LIKE 'userPrefs:%'` },
  deliveryPeople: { scope: 'none', why: 'the team list: anyone who saved how things reach them. ' + TEAM_ONLY,
    sql: `SELECT person_id AS e FROM p_person_delivery` },
  ownerPeople: { scope: 'none', why: 'the team list: anyone who made an automation. ' + TEAM_ONLY,
    sql: `SELECT DISTINCT owner_person AS e FROM p_automation WHERE owner_person IS NOT NULL` },

  /* automations: the caller's brands, or the ones they made */
  autosSeen: { scope: 'brands', sql: `SELECT * FROM p_automation WHERE ${SEEN} ORDER BY created_at DESC` },
  autoById: { scope: 'brands', sql: `SELECT * FROM p_automation WHERE id = :id AND ${SEEN}` },
  runsRecent: { scope: 'none', why: 'the last 60 runs of the workspace, then kept to the automations the caller sees. ' + TEAM_ONLY,
    sql: `SELECT id, automation_id, brand_id, started_at, result, why, title, ai_in, ai_out, ai_usd, tapped_by, tapped_at
          FROM p_automation_run WHERE result != 'folded' ORDER BY started_at DESC LIMIT 60` },
  autoUpdate: { scope: 'brands', write: true,
    sql: `UPDATE p_automation SET brand_id = :brand, name = :name, trigger_json = :when, conditions_json = :if, actions_json = :do,
          audience_json = :tell, state = :state, may_act_alone = :alone, updated_at = :now, version = version + 1,
          fail_count = CASE WHEN :state = 'on' THEN 0 ELSE fail_count END,
          cursor = CASE WHEN state != 'on' AND :state = 'on' THEN :now ELSE cursor END
          WHERE id = :id AND ${SEEN}` },
  autoInsert: { scope: 'none', write: true, why: 'a new automation. The handler checked the brand is one the caller sees. ' + TEAM_ONLY,
    sql: `INSERT INTO p_automation (id, org_id, scope, brand_id, owner_person, name, template_key, kind, trigger_json, conditions_json,
          actions_json, audience_json, state, may_act_alone, cursor, created_by, created_at, updated_at)
          VALUES (:id, :org, :scope, :brand, :owner, :name, :template, :kind, :when, :if, :do, :tell, :state, :alone, :now, :by, :now, :now)` },
  autoDelete: { scope: 'brands', write: true, sql: `DELETE FROM p_automation WHERE id = :id AND ${SEEN}` },
  autoSubsDelete: { scope: 'none', write: true, why: 'the choices people saved for an automation that was just deleted. ' + TEAM_ONLY,
    sql: `DELETE FROM p_automation_sub WHERE automation_id = :id` },

  /* the bell */
  noticesMine: { scope: 'none', why: MINE,
    sql: `SELECT * FROM p_notice WHERE person_id = :email ORDER BY created_at DESC LIMIT 200` },

  /* how things reach me */
  autosLive: { scope: 'brands',
    sql: `SELECT * FROM p_automation WHERE state != 'draft' AND ({{brands:brand_id}} OR brand_id = 'all' OR owner_person = :email)
          ORDER BY created_at` },
  deliveryMine: { scope: 'none', why: MINE, sql: `SELECT * FROM p_person_delivery WHERE person_id = :email` },
  subsMine: { scope: 'none', why: MINE, sql: `SELECT * FROM p_automation_sub WHERE person_id = :email` },
  deliverySave: { scope: 'none', write: true, why: MINE,
    sql: `INSERT INTO p_person_delivery (person_id, org_id, tz, read_hour, read_days, quiet_from, quiet_to, break_quiet_json, mode, ways_json, updated_at)
          VALUES (:email, :org, :tz, :read_hour, :read_days, :quiet_from, :quiet_to, :break_quiet, :mode, :ways, :now)
          ON CONFLICT(person_id) DO UPDATE SET tz = excluded.tz, read_hour = excluded.read_hour, read_days = excluded.read_days,
          quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to, break_quiet_json = excluded.break_quiet_json,
          mode = excluded.mode, ways_json = excluded.ways_json, updated_at = excluded.updated_at` },
  subSave: { scope: 'none', write: true, why: MINE,
    sql: `INSERT INTO p_automation_sub (automation_id, person_id, mode, ways_json, at_hour, updated_at)
          VALUES (:automation_id, :email, :mode, :ways, :at_hour, :now)
          ON CONFLICT(automation_id, person_id) DO UPDATE SET mode = excluded.mode, ways_json = excluded.ways_json,
          at_hour = excluded.at_hour, updated_at = excluded.updated_at` },
  subDrop: { scope: 'none', write: true, why: MINE,
    sql: `DELETE FROM p_automation_sub WHERE automation_id = :automation_id AND person_id = :email` },
};
