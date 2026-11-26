/* The kernel's own statements. Any group may run these through ctx.db as 'platform.<name>'. */
export const queries = {
  settingGet: { scope: 'none', why: 'the old settings table is one row per key, no brand column',
    sql: `SELECT value FROM settings WHERE key = :key` },
  settingPut: { scope: 'none', write: true, why: 'the old settings table is one row per key, no brand column',
    sql: `INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT(key) DO UPDATE SET value = excluded.value` },
  brandByAnyId: { scope: 'none', why: 'turns any id into a brand id before a scope exists',
    sql: `SELECT id FROM brands WHERE id = :id OR slug = :id OR legacy_key = :id LIMIT 1` },
  brandByAlias: { scope: 'none', why: 'turns any id into a brand id before a scope exists',
    sql: `SELECT brand_id AS id FROM brand_alias WHERE alias = :id LIMIT 1` },
  brandIdsOf: { scope: 'none', why: 'the brand ids behind a list of ids, used to build the scope',
    sql: `SELECT brand_id AS id FROM brand_alias WHERE alias IN (:list)
          UNION SELECT id FROM brands WHERE id IN (:list) OR legacy_key IN (:list) OR slug IN (:list)` },
  aliasesOf: { scope: 'none', why: 'every id a list of brands answers to, used to build the scope',
    sql: `SELECT alias AS id FROM brand_alias WHERE brand_id IN (:list)
          UNION SELECT legacy_key FROM brands WHERE id IN (:list) AND legacy_key IS NOT NULL
          UNION SELECT external_id FROM connections WHERE brand_id IN (:list) AND kind = 'meta'` },
  brandList: { scope: 'brands',
    sql: `SELECT * FROM brand_accounts WHERE {{brands:act_id}} AND (demo IS NULL OR demo = 0)
          AND (:active = 0 OR active = 1) ORDER BY name` },
  brandOne: { scope: 'brands',
    sql: `SELECT * FROM brand_accounts WHERE {{brands:act_id}} AND act_id = :id` },
};

/* Tables a route row may name in access.own: the brand column, then the id columns that may be asked.
   The door builds no SQL from input, so the own check has one fixed statement per table and id column. */
export const OWN_TABLES = {
  p_br_batch: ['act_id', 'id'], p_work_comment: ['act_id', 'id'], activities: ['act_id', 'id'],
  p_inspo: ['act_id', 'id'], p_dashboard: ['act_id', 'id'], p_scenario: ['act_id', 'id'],
  p_studio_ad: ['act_id', 'id'], p_studio_batch: ['act_id', 'id'], p_amb_proof: ['act_id', 'id'],
  p_amb_brand: ['act_id', 'slug'], social_follow: ['act_id', 'id'], social_post: ['act_id', 'id'],
  social_post_out: ['act_id', 'id'], social_caption: ['act_id', 'id'],
};

export const ownQueryName = (table, idcol) => `own_${table}_${idcol}`;

for (const [table, [col, idcol]] of Object.entries(OWN_TABLES)) {
  queries[ownQueryName(table, idcol)] = { scope: 'none', why: 'who owns a record named by id, asked by the access check',
    sql: `SELECT ${col} AS b FROM ${table} WHERE ${idcol} = :id` };
}
