/* The statements of the orgs group. Every one reads or writes the old settings table (one row per key,
   no brand column) or looks up brand names, so every one is scope none and says why. */
export const queries = {
  settingsMany: { scope: 'none', why: 'agency settings are one row per key, no brand column',
    sql: `SELECT key, value FROM settings WHERE key IN (:keys)` },
  prefsGet: { scope: 'none', why: 'one row per person, held to the caller by :email',
    sql: `SELECT value FROM settings WHERE key = 'userPrefs:' || :email` },
  prefsPut: { scope: 'none', write: true, why: 'one row per person, held to the caller by :email',
    sql: `INSERT INTO settings (key, value) VALUES ('userPrefs:' || :email, :value)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value` },
  brandNames: { scope: 'none', why: 'names for brand ids the handler already cut down to the brands of the caller',
    sql: `SELECT id, name FROM brands WHERE id IN (:ids)` },
};
