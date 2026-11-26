/* A database shaped like the real binding (prepare, bind, all, first, run, batch), backed by the SQLite
   that ships with Node. Tests only. Nothing here runs in the worker. */
import { DatabaseSync } from 'node:sqlite';

const clean = row => (row ? { ...row } : row);

class Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }

  bind(...values) { return new Statement(this.db, this.sql, values); }

  async all() {
    this.db.log.push(this.sql);
    return { results: this.db.raw.prepare(this.sql).all(...this.values).map(clean), success: true, meta: {} };
  }

  async first() {
    this.db.log.push(this.sql);
    return clean(this.db.raw.prepare(this.sql).get(...this.values)) || null;
  }

  async run() {
    this.db.log.push(this.sql);
    const r = this.db.raw.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export class FakeD1 {
  constructor() { this.raw = new DatabaseSync(':memory:'); this.log = []; }

  prepare(sql) { return new Statement(this, sql); }

  async batch(statements) {
    const out = [];
    for (const s of statements) out.push(/^\s*select/i.test(s.sql) ? await s.all() : await s.run());
    return out;
  }

  /** Run plain SQL text (schema files). */
  exec(sql) { this.raw.exec(sql); }

  /** Insert plain objects into a table. */
  insert(table, rows) {
    for (const row of rows || []) {
      const keys = Object.keys(row);
      const values = keys.map(k => (row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k] === true ? 1 : row[k] === false ? 0 : row[k]));
      this.raw.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...values);
    }
  }

  /** Every row of a table, for a test that checks what a write did. */
  rows(table, where = '1=1') { return this.raw.prepare(`SELECT * FROM ${table} WHERE ${where}`).all().map(clean); }
}
