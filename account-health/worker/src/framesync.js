/**
 * FRAME IN STEP WITH PRODUCTION (2026-10-15). Cole deleted Ice & Gold ads in Locus after Fela's comments, but Frame still
 * held them plus every v1, so the media buyer downloaded old ads. Now, whenever a version is deleted in Locus or a newer
 * one is uploaded, the card's Frame concept folder is put in step for THAT ad:
 *
 *   - the ad's current Locus version (newest not deleted) stays in the concept folder; if Frame does not have it, it is
 *     moved back from the old folder (same title) or sent to Frame by remote upload (Frame fetches the signed Locus link);
 *   - every other Frame file of that ad (same "<num>-<n>" prefix, a title that is not the current one) is MOVED into a
 *     sibling folder "zz Old versions (do not launch)" under the concept folder's parent (Ad Concepts), made if missing;
 *   - an ad Locus no longer has at all (every version deleted) has all its Frame files moved.
 *
 * NEVER DELETES a Frame file or folder: review links live on them (see frame.js and the frame-review-links memory).
 * Runs in waitUntil, never blocks the delete or the upload. Frame allows about 10 moves a minute: a 429 waits and tries
 * again twice; what is still undone stays in `frame_json.pending` and the hourly tick (brandAsanaTick) runs it again.
 *
 * The card's concept folder: the Frame link on the card (`asset_url`, next.frame.io/project/<p>/<folder>, from the Asana
 * notes) or, with no link, the brand's project (its frame connection, else the project named like the brand) >
 * Ad Concepts > the folder whose name starts with the card number ("3 - Gold you never have to check"). Found once,
 * kept on the card in `frame_json` {account, project, folder, parent}; an empty `asset_url` gets the link too.
 * Files are matched to ads by the number prefix in their name (prodwork.js adOf), to versions by title: the name without
 * the ad number, the extension and a trailing "v2" / "final" / "(1)".
 * Tests: node test-production2.mjs (Frame mocked).
 */
import { frameApi, frameToken } from './frame.js';
import { adOf, fileUrl } from './prodwork.js';
import { safeJson } from './research.js';
import { connGet } from './brands.js';

export const OLD_FOLDER = 'zz Old versions (do not launch)';
const PUBLIC = env => env.AH_PUBLIC || 'https://mobius-account-health.mobius-digital.workers.dev';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
let sleep = ms => new Promise(r => setTimeout(r, ms));
export function useSleep(f) { sleep = f; }

let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare(`SELECT frame_json FROM p_br_batch LIMIT 1`).first().catch(async () => { await env.DB.prepare(`ALTER TABLE p_br_batch ADD COLUMN frame_json TEXT`).run().catch(() => {}); });
  ready = true;
}

/** The title a file name stands for: no extension, no ad number, no trailing version word. "5-4 Spell it out MOM v2" and
 *  "5-4 Spell it out MOM.png" are both "spell it out mom". */
export function titleOf(name) {
  return String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/^[^\d]*\d{1,4}[-_ ]\d{1,2}(?!\d)/, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/(?:^|\s+)(?:(?:v|version )\d{1,3}|final|copy|\d{1,2})(?:\s+(?:(?:v|version )\d{1,3}|final|copy|\d{1,2}))*$/, '').trim();
}
/** The version a name says ("9-1 Cold v2", "version 3"), else null. */
export function verOf(name) {
  const m = /(?:^|[\s_-])v(?:ersion)?[\s_-]?(\d{1,3})(?![\d])(?!.*(?:^|[\s_-])v(?:ersion)?[\s_-]?\d)/i.exec(String(name || '').replace(/\.[a-z0-9]{2,5}$/i, ''));
  return m ? +m[1] : null;
}
/* a Frame title is the current version when they agree, or Frame's adds words (a resize: "spell it out mom 9x16") */
const sameTitle = (frame, cur) => !cur || frame === cur || frame.startsWith(cur + ' ');
/* ...and when the Frame name says a version, it is the current one's (its own "v2", else its Locus number) */
const isCurrent = (it, cur) => {
  if (!sameTitle(titleOf(it.name), titleOf(cur.name))) return false;
  const v = verOf(it.name);
  return v == null || v === (verOf(cur.name) ?? cur.version);
};

/** Frame calls with the 10-a-minute move limit in mind: a 429 waits and tries again (twice). */
async function fapi(env, method, path, body) {
  for (let i = 0; ; i++) {
    try { return await frameApi(env, method, path, body); }
    catch (e) {
      if (i < 2 && (e.status === 429 || /\b429\b|rate limit|too many/i.test(e.message))) { await sleep(7000 * (i + 1)); continue; }
      throw e;
    }
  }
}
async function children(env, A, folder) {
  const out = []; let next = `/accounts/${A}/folders/${folder}/children?page_size=100`;
  for (let i = 0; i < 10 && next; i++) {
    const j = await fapi(env, 'GET', next);
    out.push(...(Array.isArray(j.data) ? j.data : []));
    const n = j.links?.next;
    next = n ? n.replace(/^https?:\/\/[^/]+/, '').replace(/^\/?v4(?=\/)/, '') : null;
    if (next && !next.startsWith('/')) next = '/' + next;
  }
  return out;
}
async function accountOf(env) {
  const j = await fapi(env, 'GET', '/accounts');
  const a = (Array.isArray(j.data) ? j.data : [])[0];
  if (!a) throw new Error('This Frame login sees no account.');
  return a.id;
}

/** The card's Frame concept folder, from its link or found by number under the brand's Ad Concepts. Null = none. */
async function folderOf(env, d, r, fj) {
  if (fj.folder && fj.account && fj.parent) return fj;
  const A = fj.account || await accountOf(env);
  const num = String(parseInt(r.num, 10) || '');
  if (!num) return null;
  /* only a folder named for this card ("5 - A gift that...") counts: a link to Ad Concepts or a project would put the
     old folder in the wrong place */
  const isCard = name => new RegExp(`^#?${num}(?!\\d)\\s*[-_.:]?\\s`).test(String(name || '').trim() + ' ');
  const ids = String(r.asset_url || '').match(UUID) || [];
  for (const id of ids.slice(1).reverse()) {   // next.frame.io/project/<project>/<folder or file>
    let f = await fapi(env, 'GET', `/accounts/${A}/folders/${id}`).then(j => j.data).catch(() => null);
    if (!f) { const file = await fapi(env, 'GET', `/accounts/${A}/files/${id}`).then(j => j.data).catch(() => null); if (file?.parent_id) f = await fapi(env, 'GET', `/accounts/${A}/folders/${file.parent_id}`).then(j => j.data).catch(() => null); }
    if (f?.id && f.parent_id && isCard(f.name)) return { account: A, project: f.project_id || ids[0], folder: f.id, parent: f.parent_id, name: f.name };
  }
  /* no link: the brand's project > Ad Concepts > "<num> - ..." */
  let project = String((await connGet(env, r.act_id, 'frame').catch(() => null))?.external_id || '').match(UUID)?.[0] || null;
  if (!project) {
    const brand = d && d.listBrands ? (await d.listBrands(env)).find(b => b.act_id === r.act_id)?.name : null;
    if (!brand) return null;
    for (const w of (await fapi(env, 'GET', `/accounts/${A}/workspaces`)).data || []) {
      const ps = (await fapi(env, 'GET', `/accounts/${A}/workspaces/${w.id}/projects?page_size=100`).catch(() => ({ data: [] }))).data || [];
      const p = ps.find(x => String(x.name || '').toLowerCase().trim() === brand.toLowerCase().trim());
      if (p) { project = p.id; break; }
    }
  }
  if (!project) return null;
  const root = (await fapi(env, 'GET', `/accounts/${A}/projects/${project}`)).data?.root_folder_id;
  const concepts = root && (await children(env, A, root)).find(x => x.type === 'folder' && /^ad concepts$/i.test(String(x.name || '').trim()));
  if (!concepts) return null;
  const f = (await children(env, A, concepts.id)).find(x => x.type === 'folder' && isCard(x.name));
  return f ? { account: A, project, folder: f.id, parent: concepts.id, name: f.name, found: true } : null;
}

/** The old-versions folder beside the concept folder: one per Ad Concepts, made once (a D1 claim stops two syncs
 *  running at the same moment from making twins). */
async function oldFolder(env, A, parent, make = true) {
  const key = `frameOld:${parent}`;
  const read = async () => safeJson((await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null))?.value, null);
  let have = await read();
  if (have && have !== 'making') return have;
  const there = (await children(env, A, parent)).find(x => x.type === 'folder' && String(x.name || '').trim() === OLD_FOLDER);
  if (there) { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify(there.id)).run(); return there.id; }
  if (!make) return null;
  const claim = await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, '"making"') ON CONFLICT(key) DO NOTHING`).bind(key).run().catch(() => null);
  if (!claim || !(claim.meta?.changes > 0)) {
    for (let i = 0; i < 5; i++) { await sleep(1500); have = await read(); if (have && have !== 'making') return have; }
    throw new Error('Another sync is making the old-versions folder; tried again next hour.');
  }
  try {
    const f = (await fapi(env, 'POST', `/accounts/${A}/folders/${parent}/folders`, { data: { name: OLD_FOLDER } })).data;
    await env.DB.prepare(`UPDATE settings SET value = ?2 WHERE key = ?1`).bind(key, JSON.stringify(f.id)).run();
    return f.id;
  } catch (e) { await env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(key).run().catch(() => {}); throw e; }
}

async function saveFj(env, id, fj) { await env.DB.prepare(`UPDATE p_br_batch SET frame_json = ?2 WHERE id = ?1`).bind(id, JSON.stringify(fj)).run(); }
async function note(env, r, body) {
  await env.DB.prepare(`INSERT INTO p_work_comment (id, batch_id, act_id, author_name, author_role, body, kind) VALUES (?1, ?2, ?3, 'Locus', 'team', ?4, 'system')`)
    .bind(crypto.randomUUID().replace(/-/g, '').slice(0, 16), r.id, r.act_id, body).run().catch(() => {});
}

/** Put Frame in step for these ads of one card. Returns {moved, back, uploaded, kept, skipped?, error?}. */
export async function frameSync(env, d, cardId, ads, { origin } = {}) {
  await ensure(env);
  const r = await env.DB.prepare(`SELECT id, act_id, num, title, asset_url, frame_json FROM p_br_batch WHERE id = ?1`).bind(cardId).first();
  if (!r) return { skipped: 'no card' };
  let fj = safeJson(r.frame_json, {}) || {};
  /* only the ads asked for: another sync may be running for the others right now (five uploads at once) */
  const want = [...new Set((ads && ads.length ? ads : fj.pending || []).filter(Boolean))];
  if (!want.length) return { skipped: 'no ad' };
  if (!(await frameToken(env).catch(() => null))) return { skipped: 'Frame not connected' };
  const retry = !(ads && ads.length);
  fj = { ...fj, pending: [...new Set([...(fj.pending || []), ...want])], tries: retry ? (fj.tries || 0) + 1 : 0, at: Date.now() };
  await saveFj(env, r.id, fj);
  const out = { moved: [], back: [], uploaded: [], kept: [] };
  try {
    const where = await folderOf(env, d, r, fj);
    if (!where) { fj = { ...fj, pending: [], last: { at: new Date().toISOString(), none: 'no Frame folder for this card' } }; await saveFj(env, r.id, fj); return { ...out, skipped: 'no Frame folder' }; }
    fj = { ...fj, account: where.account, project: where.project, folder: where.folder, parent: where.parent };
    if (where.found && !r.asset_url) await env.DB.prepare(`UPDATE p_br_batch SET asset_url = ?2 WHERE id = ?1 AND (asset_url IS NULL OR asset_url = '')`).bind(r.id, `https://next.frame.io/project/${where.project}/${where.folder}`).run();
    const A = where.account;
    const files = (await env.DB.prepare(`SELECT id, ad, version, name, deleted_at FROM p_work_file WHERE batch_id = ?1 AND kind = 'version' ORDER BY version`).bind(r.id).all()).results || [];
    const inFolder = (await children(env, A, where.folder)).filter(x => x.type !== 'folder');
    let old = null, oldKids = null;
    const oldId = async () => old || (old = await oldFolder(env, A, where.parent));
    const move = async (it, to) => fapi(env, 'PATCH', `/accounts/${A}/${it.type === 'version_stack' ? 'version_stacks' : 'files'}/${it.id}/move`, { data: { parent_id: to } });
    const done = async ad => { fj.pending = (fj.pending || []).filter(a => a !== ad); await saveFj(env, r.id, fj); };
    for (const ad of want) {
      const mine = files.filter(f => (f.ad || '') === ad);
      if (!mine.length) { await done(ad); continue; }   // an ad Locus never had: Frame is left as it is
      const cur = mine.filter(f => !f.deleted_at).pop() || null;
      const frameOf = inFolder.filter(x => adOf(x.name, r.num) === ad);
      let has = false;
      for (const it of frameOf) {
        if (cur && isCurrent(it, cur)) { has = true; out.kept.push(it.name); continue; }
        await move(it, await oldId());
        out.moved.push(it.name);
      }
      if (cur && !has) {
        /* the current version is not in the concept folder: bring it back from the old folder, else send it */
        if (!oldKids) { const o = old || await oldFolder(env, A, where.parent, false); oldKids = o ? await children(env, A, o) : []; if (o) old = o; }
        const back = oldKids.filter(x => x.type !== 'folder' && adOf(x.name, r.num) === ad && isCurrent(x, cur));
        for (const b of back) { await move(b, where.folder); out.back.push(b.name); }
        oldKids = oldKids.filter(x => !back.includes(x));
        if (!back.length) {
          const src = await fileUrl(env, origin || PUBLIC(env), cur.id, 24);
          await fapi(env, 'POST', `/accounts/${A}/folders/${where.folder}/files/remote_upload`, { data: { name: String(cur.name || `${ad}.png`).slice(0, 120), source_url: src } });
          out.uploaded.push(cur.name);
        }
      }
      await done(ad);
    }
    fj = { ...fj, pending: fj.pending || [], last: { at: new Date().toISOString(), moved: out.moved.length, back: out.back.length, uploaded: out.uploaded.length } };
    await saveFj(env, r.id, fj);
    const parts = [];
    if (out.moved.length) parts.push(`moved ${out.moved.join(', ')} to "${OLD_FOLDER}"`);
    if (out.back.length) parts.push(`put ${out.back.join(', ')} back in the concept folder`);
    if (out.uploaded.length) parts.push(`sent ${out.uploaded.join(', ')} to the concept folder`);
    if (parts.length) await note(env, r, `Frame: ${parts.join('; ')}.`);
    return out;
  } catch (e) {
    /* a 429 or Frame down: the hourly tick tries again; after 6 tries (a folder gone, a lost permission) it stops */
    fj = { ...fj, last: { at: new Date().toISOString(), error: String(e.message || e).slice(0, 300) } };
    if ((fj.tries || 0) >= 6) fj.pending = [];
    await saveFj(env, r.id, fj).catch(() => {});
    console.log(`frameSync ${cardId}: ${e.message}`);
    return { ...out, error: e.message };
  }
}

/** Run one sync later (waitUntil) or now (tests). Never throws into the caller. */
export function frameLater(env, d, cardId, ads, opts) {
  const p = frameSync(env, d, cardId, ads, opts).catch(e => ({ error: e.message }));
  if (d && d.waitUntil) { d.waitUntil(p); return null; }
  return p;
}

/** The hourly retry: every card with ads still waiting (a 429 past the retries, Frame down). At most 5 cards a tick. */
export async function frameRetry(env, d = {}) {
  await ensure(env);
  const rows = (await env.DB.prepare(`SELECT id, frame_json FROM p_br_batch WHERE frame_json LIKE '%"pending":["%' LIMIT 20`).all().catch(() => ({ results: [] }))).results || [];
  const out = {};
  /* ten minutes after the last try, so a sync still running in waitUntil is never doubled */
  for (const r of rows.filter(x => (safeJson(x.frame_json, {})?.at || 0) < Date.now() - (d.anyAge ? 0 : 600e3)).slice(0, 5))
    out[r.id] = await frameSync(env, d, r.id, []).catch(e => ({ error: e.message }));
  return out;
}
