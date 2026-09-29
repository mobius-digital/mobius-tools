/* Imports Viktor's source-verified brand research (2026-09-29) into Locus's research tables, so the
 * brand brain (account-health/worker/src/brain.js) reads it: Party Patch, Bonk Golf, Dartee Golf,
 * Grunk Dolfer (first run), then Lucky Golf on its own with --brand "Lucky Golf" (same day; research
 * only, Lucky's voice comes from its synced copy skill, see viktor/build_lucky.py).
 *
 * DO NOT RE-RUN BLINDLY. This ran ONCE on 2026-09-29. After that, staff may approve or edit the rows
 * in Locus, and a re-run would fight those edits. The script refuses to run while any Viktor row
 * exists; --replace deletes only Viktor rows that are STILL draft (approved ones are kept and their
 * inserts skipped), then re-inserts. Edit viktor/viktor_data.json (or re-run viktor/build.py from the
 * original docs) before replacing.
 *
 *   node profit/worker/migrations/viktor_import.mjs --dry       writes the SQL to the temp dir only
 *   node profit/worker/migrations/viktor_import.mjs             runs it against the remote D1
 *   node profit/worker/migrations/viktor_import.mjs --replace   see above
 *   --brand "Lucky Golf"   limits any of the above to one brand; the refusal check then only looks
 *                          at that brand's Viktor rows, so the other brands are never touched
 *
 * What it writes (every row is marked so it can be removed cleanly):
 *   p_br_line     new lines, id 'vk_<brand>_<line>'; existing lines only get about/products where
 *                 the existing text was thinner (Night Out Defense + Design Your Own products, Grunk
 *                 Apparel about + products). Nothing is ever deleted from p_br_line.
 *   p_br_persona  source 'viktor', status 'draft', id 'vk_...'
 *   p_br_voc      id 'vk_...', status 'draft', source = where the quote came from, url = the link,
 *                 theme = Viktor's quote ref (C12, P4...) that the personas cite. Quotes verbatim.
 *   p_br_comp     id 'vk_...', status 'draft', data_json.source 'viktor', complaints verbatim
 *   p_br_doc      source 'viktor', status 'draft': per line 'market' + 'mechanism' (Grunk Apparel
 *                 already has an APPROVED market doc from the sheet, so Viktor's goes to
 *                 'market_viktor' there and the brain merges it under the approved one), and
 *                 brand-level 'viktor_notes' {md, gaps, from}.
 * Before inserting it deletes, per brand, only the AI drafts research.js itself would replace
 * (persona status 'draft' AND source 'ai'; comp status 'draft' AND data_json.source 'ai').
 *
 * Remove everything it added:
 *   DELETE FROM p_br_persona WHERE source = 'viktor';
 *   DELETE FROM p_br_voc WHERE id LIKE 'vk\_%' ESCAPE '\';
 *   DELETE FROM p_br_comp WHERE id LIKE 'vk\_%' ESCAPE '\';
 *   DELETE FROM p_br_doc WHERE source = 'viktor';
 *   DELETE FROM p_br_line WHERE id LIKE 'vk\_%' ESCAPE '\';   (the three line text updates stay)
 *
 * Where the data came from: viktor/parse.py read the docs (quotes are checked as exact substrings of
 * the .docx text; Dartee's review links come from the docx hyperlinks), viktor/meta.py holds the
 * hand calls (line mapping, awareness and stage, claims made, open ground), viktor/notes.py the
 * brand notes, viktor/build.py joins them into viktor/viktor_data.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ALL = JSON.parse(readFileSync(join(HERE, 'viktor', 'viktor_data.json'), 'utf8'));
const dry = process.argv.includes('--dry'), replace = process.argv.includes('--replace');
const bi = process.argv.indexOf('--brand'), only = bi > 0 ? process.argv[bi + 1] : null;
if (only && !ALL[only]) { console.error(`No brand "${only}" in viktor_data.json`); process.exit(1); }
const DATA = only ? { [only]: ALL[only] } : ALL;

const sq = v => v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const js = o => sq(JSON.stringify(o));
const VK = `LIKE 'vk\\_%' ESCAPE '\\'`;

function wrangler(args) {
  for (let attempt = 0; ; attempt++) {
    try {
      return execFileSync(process.execPath, [join(WORKER, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'execute', 'mobius-account-health', '--remote', ...args],
        { cwd: WORKER, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      const msg = String(e.stdout || '') + String(e.stderr || '');
      if (attempt < 2 && /7403|10000|not authorized/i.test(msg)) { console.log('D1 auth hiccup, retrying'); continue; }
      throw new Error(msg || e.message);
    }
  }
}
const query = sql => { const out = wrangler(['--json', '--command', sql]); return JSON.parse(out.slice(out.indexOf('[')))[0].results || []; };

const acts = Object.values(DATA).map(r => sq(r.act)).join(', ');
if (!dry) {
  const A = `act_id IN (${acts})`;
  const [c] = query(`SELECT (SELECT COUNT(*) FROM p_br_persona WHERE ${A} AND source = 'viktor') + (SELECT COUNT(*) FROM p_br_voc WHERE ${A} AND id ${VK}) + (SELECT COUNT(*) FROM p_br_comp WHERE ${A} AND id ${VK}) + (SELECT COUNT(*) FROM p_br_doc WHERE ${A} AND source = 'viktor') + (SELECT COUNT(*) FROM p_br_line WHERE ${A} AND id ${VK}) AS n`);
  if (c.n > 0 && !replace) { console.error(`${c.n} Viktor rows already exist. This import already ran; read the header before using --replace.`); process.exit(1); }
}

const st = [];
for (const r of Object.values(DATA)) {
  const A = sq(r.act);
  st.push(`-- ${r.brand}`);
  // the AI drafts research.js would replace on its own re-run
  st.push(`DELETE FROM p_br_persona WHERE act_id = ${A} AND status = 'draft' AND source = 'ai';`);
  st.push(`DELETE FROM p_br_comp WHERE act_id = ${A} AND status = 'draft' AND json_extract(data_json, '$.source') = 'ai';`);
  if (replace) {
    for (const t of ['p_br_persona', 'p_br_voc', 'p_br_comp']) st.push(`DELETE FROM ${t} WHERE act_id = ${A} AND id ${VK} AND status = 'draft';`);
    st.push(`DELETE FROM p_br_doc WHERE act_id = ${A} AND source = 'viktor' AND status = 'draft';`);
  }
  for (const l of r.new_lines)
    st.push(`INSERT INTO p_br_line (id, act_id, name, about, products, sort) VALUES (${sq(l.id)}, ${A}, ${sq(l.name)}, ${sq(l.about)}, ${sq(l.products)}, ${l.sort}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, about = excluded.about, products = excluded.products;`);
  for (const u of r.line_updates)
    st.push(`UPDATE p_br_line SET ${['name', 'about', 'products'].filter(k => u[k]).map(k => `${k} = ${sq(u[k])}`).join(', ')} WHERE id = ${sq(u.id)} AND act_id = ${A};`);
  for (const p of r.personas)
    st.push(`INSERT OR IGNORE INTO p_br_persona (id, act_id, line_id, name, data_json, status, source, sort) VALUES (${sq(p.id)}, ${A}, ${sq(p.line_id)}, ${sq(p.name)}, ${js(p.data)}, 'draft', 'viktor', ${p.sort});`);
  for (const v of r.voc)
    st.push(`INSERT OR IGNORE INTO p_br_voc (id, act_id, line_id, kind, quote, source, url, theme, nugget, status) VALUES (${sq(v.id)}, ${A}, ${sq(v.line_id)}, ${sq(v.kind)}, ${sq(v.quote)}, ${sq(v.source)}, ${sq(v.url)}, ${sq(v.theme)}, ${v.nugget ? 1 : 0}, 'draft');`);
  for (const c of r.comps)
    st.push(`INSERT OR IGNORE INTO p_br_comp (id, act_id, line_id, name, url, data_json, status, sort) VALUES (${sq(c.id)}, ${A}, ${sq(c.line_id)}, ${sq(c.name)}, ${sq(c.url)}, ${js(c.data)}, 'draft', ${c.sort});`);
  for (const d of r.docs)
    st.push(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (${A}, ${sq(d.line_id)}, ${sq(d.key)}, ${js(d.data)}, 'draft', 'viktor', datetime('now'))
  ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, status = 'draft', source = 'viktor', updated_at = excluded.updated_at
  WHERE p_br_doc.status = 'draft' AND p_br_doc.source IN ('viktor', 'ai');`);
}
const file = join(tmpdir(), 'viktor_import.sql');
writeFileSync(file, st.join('\n') + '\n', 'utf8');
console.log(`${st.length} statements -> ${file}`);
for (const r of Object.values(DATA)) console.log(`${r.brand}: ${r.new_lines.length} new lines, ${r.line_updates.length} line text updates, ${r.personas.length} personas, ${r.voc.length} quotes, ${r.comps.length} competitors, ${r.docs.length} docs`);
if (dry) process.exit(0);
console.log(wrangler(['--file', file, '--yes']).split('\n').slice(-12).join('\n'));
const rows = query(`SELECT act_id, (SELECT COUNT(*) FROM p_br_persona p WHERE p.act_id = a.act_id AND p.source = 'viktor') personas, (SELECT COUNT(*) FROM p_br_voc v WHERE v.act_id = a.act_id AND v.id ${VK}) quotes, (SELECT COUNT(*) FROM p_br_comp c WHERE c.act_id = a.act_id AND c.id ${VK}) comps, (SELECT COUNT(*) FROM p_br_doc d WHERE d.act_id = a.act_id AND d.source = 'viktor') docs FROM accounts a WHERE act_id IN (${acts})`);
console.table(rows);
