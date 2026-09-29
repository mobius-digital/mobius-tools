/* Loads the research part of docs/angles-<brand>.md into D1 (p_br_doc key 'research_notes'),
 * so the brand brain (account-health/worker/src/brain.js) can read it. 2026-09-29.
 * Keeps the brand, competitors, voice of customer, personas and Cole's decisions; drops the
 * performance tables and seasonality (older, Meta-reported; the angle library has the Triple
 * Whale results) and everything from "Phase 2" on (that is the creator link, already in D1).
 * Safe to re-run after editing a doc: it upserts.
 *   node profit/worker/migrations/research_notes.mjs [--dry]      (from the repo root)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DOCS = [
  ['act_313396960515158', 'docs/angles-grunk-dolfer.md'],
  ['act_963898971023823', 'docs/angles-dartee.md'],
];
const DROP = /what has worked|seasonality|still to do|still open/i;

function research(md) {
  const out = [];
  let dropLevel = 0;
  for (const line of md.split(/\r?\n/)) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h && /^phase 2/i.test(h[2])) break;
    if (h) {
      const lvl = h[1].length;
      if (dropLevel && lvl <= dropLevel) dropLevel = 0;
      if (!dropLevel && DROP.test(h[2])) { dropLevel = lvl; continue; }
    }
    if (!dropLevel) out.push(line);
  }
  return out.join('\n').replace(/\s*—\s*/g, ', ').replace(/\n{3,}/g, '\n\n').trim();
}

const sq = s => `'${String(s).replace(/'/g, "''")}'`;
const stmts = DOCS.map(([act, path]) => {
  const md = research(readFileSync(join(ROOT, path), 'utf8'));
  console.log(`${path}: ${md.length} characters kept`);
  const data = JSON.stringify({ md, from: path, loaded_at: new Date().toISOString().slice(0, 10) });
  return `INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (${sq(act)}, '', 'research_notes', ${sq(data)}, 'approved', 'docs', datetime('now'))
ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, status = excluded.status, source = excluded.source, updated_at = excluded.updated_at;`;
});
if (process.argv.includes('--dry')) process.exit(0);
const file = join(tmpdir(), 'research_notes.sql');
writeFileSync(file, stmts.join('\n'), 'utf8');
execSync(`npx wrangler d1 execute mobius-account-health --remote --file="${file}"`, { cwd: join(ROOT, 'account-health', 'worker'), stdio: 'inherit' });
