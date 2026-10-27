/* Offline checks for the photo library walker (src/assets.js, 2026-10-27): Drive shortcuts are followed (a shortcut
 * to a shared folder walks that folder, a shortcut to an image indexes the target once) and not-for-use folders are
 * skipped. In-memory SQLite, the Drive API mocked, a throwaway RSA key for the service-account JWT, nothing real.
 *   node test-assets.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied ALTER */ } } };
load(path.join(here, 'schema.sql'));
for (const f of ['brand-001.sql', 'brand-002.sql', 'brand-003.sql', 'brand-004.sql', 'brand-005.sql']) load(path.join(root, 'profit', 'worker', 'migrations', f));
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const DB = {
  prepare(sql) {
    let args = [];
    const st = () => db.prepare(bindSql(sql));
    return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; },
      async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } };
  },
  async batch(stmts) { for (const s of stmts) await s.run(); return []; },
};

const assets = await import('./src/assets.js');
const asanaBrand = await import('./src/asana-brand.js');

/* ---------------- fixtures: one brand whose Drive folder holds a shortcut to a client's shared folder ---------------- */
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, legacy_key, source) VALUES ('brand_bonk', 'bonk_golf', 'Bonk Golf', 'active', 'USD', 'America/Chicago', 'act_1', 'locus')`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source) VALUES ('d1', 'brand_bonk', 'drive', '1RootFolderIdAbcdefghijkl', 1, 'locus')`);
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { DB, GOOGLE_SA_KEY: JSON.stringify({ client_email: 'sa@test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };

const FOLDER = 'application/vnd.google-apps.folder', SHORTCUT = 'application/vnd.google-apps.shortcut';
const img = (id, name) => ({ id, name, mimeType: 'image/jpeg', modifiedTime: '2026-10-01T00:00:00Z', thumbnailLink: `https://t/${id}`, imageMediaMetadata: { width: 10, height: 10 } });
const TREE = {
  '1RootFolderIdAbcdefghijkl': [
    { id: 'A', name: 'Assets', mimeType: FOLDER },
    { id: 'AGR', name: 'Agreements', mimeType: FOLDER },
  ],
  A: [
    img('p1', 'own.jpg'),
    { id: 's1', name: 'Photos - BONK June', mimeType: SHORTCUT, shortcutDetails: { targetId: 'SHARED', targetMimeType: FOLDER } },
    { id: 's2', name: 'hero.jpg', mimeType: SHORTCUT, shortcutDetails: { targetId: 'p9', targetMimeType: 'image/jpeg' } },
    { id: 's3', name: 'brief.pdf', mimeType: SHORTCUT, shortcutDetails: { targetId: 'doc1', targetMimeType: 'application/pdf' } },
    { id: 's4', name: 'broken', mimeType: SHORTCUT },
    { id: 'ARCH', name: '06 - Archive', mimeType: FOLDER },
    { id: 'NFU', name: 'NOT for USE', mimeType: FOLDER },
    { id: 'NE', name: '05-needs edited ', mimeType: FOLDER },
  ],
  SHARED: [img('p2', 'june-1.jpg'), img('p3', 'june-2.jpg'), { id: 'loop', name: 'back to Assets', mimeType: SHORTCUT, shortcutDetails: { targetId: 'A', targetMimeType: FOLDER } }],
  AGR: [img('bad1', 'contract-scan.jpg')],
  ARCH: [img('bad2', 'old.jpg')],
  NFU: [img('bad3', 'nope.jpg')],
  NE: [img('bad4', 'raw.jpg')],
};
const FILES = { p9: img('p9', 'hero-target.jpg') };
const J = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o) });
const calls = [];
const drive = async (url) => {
  calls.push(url);
  const u = new URL(url);
  if (u.pathname.endsWith('/files')) {
    const parent = /'([^']+)' in parents/.exec(decodeURIComponent(u.searchParams.get('q')))[1];
    assert.match(u.searchParams.get('fields'), /shortcutDetails\(targetId,targetMimeType\)/, 'the list asks Drive for shortcut targets');
    return J({ files: TREE[parent] || [] });
  }
  const id = u.pathname.split('/').pop();
  return FILES[id] ? J(FILES[id]) : J({ error: { message: 'not found' } }, 404);
};
asanaBrand.useFetch(async url => url.startsWith('https://oauth2.googleapis.com/token') ? J({ access_token: 'tok', expires_in: 3600 }) : drive(url));
assets.useFetch(drive);

const r = await assets.syncAssets(env, 'brand_bonk');
assert.equal(r.error, undefined, r.error);
assert.equal(r.complete, true);
const rows = db.prepare(`SELECT file_id, name, path, status FROM p_asset WHERE act_id = 'brand_bonk' ORDER BY file_id`).all();
const ids = rows.map(x => x.file_id);
assert.deepEqual(ids, ['p1', 'p2', 'p3', 'p9'], `indexed: ${ids.join(', ')}`);
assert.equal(rows.find(x => x.file_id === 'p2').path, 'Assets / Photos - BONK June', 'the shared folder sits under the shortcut name');
assert.equal(rows.find(x => x.file_id === 'p9').name, 'hero-target.jpg', 'an image shortcut is indexed as its target');
assert.ok(!ids.some(x => x.startsWith('bad')), 'Agreements, Archive, NOT for USE and needs-edited folders are skipped');
assert.equal(calls.filter(u => /'A' in parents/.test(decodeURIComponent(u))).length, 1, 'a shortcut loop back to a walked folder is not walked twice');
assert.equal(r.files, 4);
console.log('test-assets: 8 checks passed');
