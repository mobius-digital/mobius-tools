/* Group ai: every statement this group runs, by name (CONTRACT.md section 6).
   A key and a call belong to one person, so those statements bind :email. The data door checks that
   value is the caller's own email before a client login may run them. */
// from account-health/worker/src/connectai.js, lookups.js (lookupShare), stratmem.js (usageSummary), ask/engine.js (openFindings)

const PERSON = 'a key and its calls belong to one person, not to a brand';
const OWNER = 'the owner sees every key and call. The handler asks for this only as the owner';
const AGENCY = 'the assistant is run by the agency: its log and findings have no brand column to filter on';

export const queries = {
  /* The three switches the old routes read for every signed in person, client logins too. The keys are
     fixed here, so nothing else in the settings table can be read through this statement. */
  flags: { scope: 'none', why: 'three agency switches (on, applies on yes, limits) that the old route shows every signed in person',
    sql: `SELECT key, value FROM settings WHERE key IN ('connectAi', 'connectAiApply', 'connectAiLimits') AND :email = :email` },

  keysMine: { scope: 'none', why: PERSON,
    sql: `SELECT * FROM p_ai_key WHERE email = :email ORDER BY created_at DESC LIMIT 100` },
  keysAll: { scope: 'none', why: OWNER,
    sql: `SELECT * FROM p_ai_key ORDER BY created_at DESC LIMIT 500` },
  keysLive: { scope: 'none', why: PERSON,
    sql: `SELECT COUNT(*) AS n FROM p_ai_key WHERE email = :email AND revoked_at IS NULL AND expires_at > :now` },
  keyAdd: { scope: 'none', write: true, why: PERSON,
    sql: `INSERT INTO p_ai_key (id, key_hash, prefix, email, role, brands_json, label, created_at, expires_at)
          VALUES (:id, :key_hash, :prefix, :email, :role, :brands_json, :label, :created_at, :expires_at)` },
  keyOne: { scope: 'none', why: PERSON,
    sql: `SELECT id, email, revoked_at FROM p_ai_key WHERE id = :id AND (email = :email OR :any = 1)` },
  keyOff: { scope: 'none', write: true, why: PERSON,
    sql: `UPDATE p_ai_key SET revoked_at = :at WHERE id = :id AND revoked_at IS NULL AND (email = :email OR :any = 1)` },

  callsMine: { scope: 'none', why: PERSON,
    sql: `SELECT key_id, email, tool, act_id, at, ok, note FROM p_ai_call WHERE email = :email ORDER BY id DESC LIMIT 100` },
  callsAll: { scope: 'none', why: OWNER,
    sql: `SELECT key_id, email, tool, act_id, at, ok, note FROM p_ai_call ORDER BY id DESC LIMIT 200` },

  /* The old code first marked late cards as expired, then read. A read does not write here: a waiting
     card past its time is left out, or shown as expired when every card is asked for. */
  cards: { scope: 'brands',
    sql: `SELECT * FROM p_ai_proposal WHERE {{brands:act_id}} AND (:act = '' OR act_id = :act)
          AND (:all = 1 OR (status = 'waiting' AND expires_at > :now))
          ORDER BY created_at DESC LIMIT {{pick:limit}}`,
    pick: { limit: { wide: '200', one: '100' } } },

  share: { scope: 'none', why: AGENCY,
    sql: `SELECT COALESCE(kind, 'assistant') AS kind, COUNT(*) AS n, ROUND(SUM(cost), 4) AS cost FROM strat_run
          WHERE at >= :since GROUP BY COALESCE(kind, 'assistant')` },

  usageTotal: { scope: 'none', why: AGENCY,
    sql: `SELECT COUNT(*) AS answers, ROUND(SUM(cost), 2) AS cost, SUM(in_tok) AS in_tok, SUM(out_tok) AS out_tok,
          ROUND(AVG(cost), 3) AS avg_cost, ROUND(AVG(ms) / 1000.0, 1) AS avg_seconds FROM strat_run WHERE at >= :since` },
  usageByDay: { scope: 'none', why: AGENCY,
    sql: `SELECT substr(at, 1, 10) AS day, COUNT(*) AS answers, ROUND(SUM(cost), 2) AS cost FROM strat_run
          WHERE at >= :since GROUP BY day ORDER BY day` },
  usageByPerson: { scope: 'none', why: AGENCY,
    sql: `SELECT COALESCE(who, 'unknown') AS who, COUNT(*) AS answers, ROUND(SUM(cost), 2) AS cost FROM strat_run
          WHERE at >= :since GROUP BY who ORDER BY cost DESC` },
  usageByModel: { scope: 'none', why: AGENCY,
    sql: `SELECT model, effort, COUNT(*) AS answers, ROUND(SUM(cost), 2) AS cost FROM strat_run
          WHERE at >= :since GROUP BY model, effort ORDER BY cost DESC` },
  usageByBrand: { scope: 'none', why: AGENCY,
    sql: `SELECT COALESCE(brand, 'agency') AS brand, COUNT(*) AS answers, ROUND(SUM(cost), 2) AS cost FROM strat_run
          WHERE at >= :since GROUP BY brand ORDER BY cost DESC` },
  usageRecent: { scope: 'none', why: AGENCY,
    sql: `SELECT at, surface, who, brand, question, model, effort, cost, steps, ms, stopped, error FROM strat_run
          WHERE at >= :since ORDER BY at DESC LIMIT 40` },

  findingsOpen: { scope: 'none', why: AGENCY,
    sql: `SELECT * FROM findings WHERE state = 'new' OR (state = 'snoozed' AND snooze_until <= :today) ORDER BY last_seen DESC` },
};
