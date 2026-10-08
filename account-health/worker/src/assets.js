/**
 * THE PHOTO LIBRARY (Locus, 2026-10-08). Every image under each brand's Drive folder(s), indexed and
 * tagged once, so Studio and the team can find "a man in a polo on a white background" without digging.
 *
 * - Source: the brand's Drive folder from Settings > Connections (p_br_doc 'links'.drive) plus any extra
 *   folders in p_br_doc 'assets'.folders. Read as Cole (GOOGLE_AS) through the service account, so a folder a
 *   brand shares with cole@ works the same as ours. Files are NEVER moved, renamed or copied in Drive.
 * - Index: one row per image in p_asset (about 1KB a row). New or changed files are found by walking the
 *   folder tree and comparing modifiedTime: no AI involved, Drive API calls only.
 * - Tags: each NEW image is shown once to Claude Haiku as a 640px thumbnail (about a tenth of a cent) and
 *   gets people / setting / shot / products / colours / a one-line description. The thumbnail is kept in R2
 *   (assets/<act>/<file id>.jpg) so the library loads fast and never re-asks Drive.
 * - Runs: hourly, one brand at a time (stalest first), within the subrequest budget; or Sync now.
 * Folders whose name says agreement / contract / invoice / legal are skipped.
 */
import { googleToken } from './asana-brand.js';

let F = fetch;
export function useFetch(f) { F = f; }
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const AS = env => env.GOOGLE_AS || 'cole@go-mobius-digital.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const SKIP = /agreement|contract|invoice|legal|finance|billing/i;
const TAG_MODEL = 'claude-haiku-4-5-20251001';
let tabled = false;

async function ensure(env) {
  if (tabled) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_asset (act_id TEXT NOT NULL, file_id TEXT NOT NULL, name TEXT, mime TEXT, folder TEXT, path TEXT, modified TEXT,
    w INTEGER, h INTEGER, thumb_src TEXT, thumb_key TEXT, status TEXT DEFAULT 'new', people INTEGER, setting TEXT, shot TEXT, products TEXT, colors TEXT, descr TEXT, tags_json TEXT,
    tagged_at TEXT, seen_at TEXT, PRIMARY KEY (act_id, file_id))`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_asset_status ON p_asset (act_id, status)`).run().catch(() => {});
  /* 2026-10-08: Studio's Dress step writes LOOKS into the same table (source 'locus', kind 'look'), so the
     library shows them beside the Drive photos. The profit worker runs the same guarded ALTERs (studio.js
     ensureLooks); a column that already exists just throws and is skipped. */
  for (const c of ['source TEXT', 'kind TEXT', 'cost REAL', 'look_json TEXT']) await env.DB.prepare(`ALTER TABLE p_asset ADD COLUMN ${c}`).run().catch(() => {});
  tabled = true;
}
const folderId = u => (/folders\/([\w-]{10,})/.exec(String(u || '')) || /^([\w-]{20,})$/.exec(String(u || '').trim()) || [])[1] || null;

export async function sourcesFor(env, act) {
  const rows = await env.DB.prepare(`SELECT key, data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key IN ('links', 'assets')`).bind(act).all().catch(() => ({ results: [] }));
  const by = Object.fromEntries((rows.results || []).map(r => [r.key, safeJson(r.data_json, {}) || {}]));
  const ids = [folderId(by.links?.drive), ...((by.assets?.folders) || []).map(folderId)].filter(Boolean);
  return [...new Set(ids)];
}

async function drive(env, path) {
  const tok = await googleToken(env, AS(env), SCOPE);
  const res = await F(`https://www.googleapis.com/drive/v3/${path}`, { headers: { Authorization: `Bearer ${tok}` } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `Drive ${res.status}`);
  return j;
}

/** Walk the folders, upsert every image; changed files go back to 'new'. Returns counts. */
export async function syncAssets(env, act, { maxFolders = 500, maxFiles = 10000 } = {}) {
  await ensure(env);
  const roots = await sourcesFor(env, act);
  if (!roots.length) return { act, error: 'No Drive folder for this brand: Settings > Connections > Google Drive folder.' };
  const queue = roots.map(id => ({ id, path: '' })), seen = new Set(); let folders = 0, files = 0, fresh = 0;
  const now = new Date().toISOString();
  while (queue.length && folders < maxFolders && files < maxFiles) {
    const f = queue.shift(); if (seen.has(f.id)) continue; seen.add(f.id); folders++;
    let token = '';
    do {
      const q = encodeURIComponent(`'${f.id}' in parents and trashed = false`);
      const j = await drive(env, `files?q=${q}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=nextPageToken,files(id,name,mimeType,modifiedTime,thumbnailLink,imageMediaMetadata(width,height))${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
      const batch = [];
      for (const x of j.files || []) {
        if (x.mimeType === 'application/vnd.google-apps.folder') { if (!SKIP.test(x.name)) queue.push({ id: x.id, path: (f.path ? f.path + ' / ' : '') + x.name }); continue; }
        if (!/^image\//.test(x.mimeType || '')) continue;
        files++;
        batch.push(env.DB.prepare(`INSERT INTO p_asset (act_id, file_id, name, mime, folder, path, modified, w, h, thumb_src, status, seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'new', ?11)
          ON CONFLICT(act_id, file_id) DO UPDATE SET name = excluded.name, path = excluded.path, thumb_src = excluded.thumb_src, seen_at = excluded.seen_at,
          status = CASE WHEN p_asset.modified IS NOT excluded.modified THEN 'new' ELSE p_asset.status END, modified = excluded.modified`)
          .bind(act, x.id, x.name, x.mimeType, f.id, f.path, x.modifiedTime, x.imageMediaMetadata?.width || null, x.imageMediaMetadata?.height || null, x.thumbnailLink || null, now));
      }
      for (let i = 0; i < batch.length; i += 50) await env.DB.batch(batch.slice(i, i + 50));
      token = j.nextPageToken || '';
    } while (token);
  }
  /* Files that disappeared from Drive (deleted or moved out) stop showing; nothing is deleted from Drive. */
  const complete = !queue.length;   // only a full walk may decide a file is gone
  if (complete) await env.DB.prepare(`UPDATE p_asset SET status = 'gone' WHERE act_id = ?1 AND (seen_at IS NULL OR seen_at < ?2) AND status != 'gone' AND COALESCE(source, 'drive') != 'locus'`).bind(act, now).run();
  fresh = (await env.DB.prepare(`SELECT COUNT(*) n FROM p_asset WHERE act_id = ?1 AND status = 'new'`).bind(act).first())?.n || 0;
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(`assetsSyncAt:${act}`, now).run().catch(() => {});
  return { act, folders, files, to_tag: fresh, complete };
}

const TAG_SYSTEM = `You tag product and lifestyle photos for an ad agency's photo library. Answer ONLY with JSON:
{"people": <number of people visible, 0 if none>, "setting": "white background" | "studio" | "lifestyle indoor" | "lifestyle outdoor" | "golf course" | "flat lay" | "graphic" | "other",
 "shot": "close-up" | "product detail" | "half body" | "full body" | "group" | "scene", "products": [short names of the brand's products you can see, from the list if one matches],
 "wearing": [clothing or accessories a person wears, e.g. "polo", "hat", "glove"], "colors": [up to 3 main colours], "description": "one plain sentence a designer would search for"}`;

/** Tag up to `limit` new images for a brand: thumbnail to R2, then one small vision call each. */
export async function tagAssets(env, act, limit = 25) {
  await ensure(env);
  if (!env.ANTHROPIC_API_KEY) return { error: 'ANTHROPIC_API_KEY not set' };
  const brand = await env.DB.prepare(`SELECT name FROM accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
  const pt = safeJson((await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(`productTitles:${act}`).first().catch(() => null))?.value, {}) || {};
  const products = [...new Set(Object.values(pt.titles || pt).filter(x => typeof x === 'string'))].slice(0, 60);
  const { results } = await env.DB.prepare(`SELECT file_id, name, thumb_src FROM p_asset WHERE act_id = ?1 AND status = 'new' ORDER BY modified DESC LIMIT ?2`).bind(act, limit).all();
  let done = 0, failed = 0, inTok = 0, outTok = 0;
  const tok = await googleToken(env, AS(env), SCOPE);
  for (const r of results || []) {
    try {
      let src = r.thumb_src;
      if (!src) { const m = await drive(env, `files/${r.file_id}?fields=thumbnailLink&supportsAllDrives=true`); src = m.thumbnailLink; }
      if (!src) throw new Error('no thumbnail');
      const img = await F(src.replace(/=s\d+$/, '=s640'), { headers: { Authorization: `Bearer ${tok}` } });
      if (!img.ok) throw new Error(`thumbnail ${img.status}`);
      const buf = await img.arrayBuffer();
      const key = `assets/${act}/${r.file_id}.jpg`;
      if (env.MEDIA) await env.MEDIA.put(key, buf, { httpMetadata: { contentType: img.headers.get('content-type') || 'image/jpeg' } });
      let b64 = ''; const u8 = new Uint8Array(buf); for (let i = 0; i < u8.length; i += 0x8000) b64 += String.fromCharCode(...u8.subarray(i, i + 0x8000)); b64 = btoa(b64);
      const res = await F('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: TAG_MODEL, max_tokens: 400, system: TAG_SYSTEM, messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: (img.headers.get('content-type') || 'image/jpeg').split(';')[0], data: b64 } },
          { type: 'text', text: `Brand: ${brand?.name || ''}. File name: ${r.name}.${products.length ? ` The brand's products: ${products.join('; ')}.` : ''}` }] }] }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error?.message || `Claude ${res.status}`);
      inTok += j.usage?.input_tokens || 0; outTok += j.usage?.output_tokens || 0;
      const txt = (j.content || []).map(c => c.text || '').join(''); const t = safeJson((txt.match(/\{[\s\S]*\}/) || [])[0], null);
      if (!t) throw new Error('no tags');
      await env.DB.prepare(`UPDATE p_asset SET status = 'tagged', thumb_key = ?3, people = ?4, setting = ?5, shot = ?6, products = ?7, colors = ?8, descr = ?9, tags_json = ?10, tagged_at = ?11 WHERE act_id = ?1 AND file_id = ?2`)
        .bind(act, r.file_id, key, +t.people || 0, String(t.setting || ''), String(t.shot || ''), (t.products || []).join(', '), (t.colors || []).join(', '), String(t.description || '').slice(0, 300), JSON.stringify(t), new Date().toISOString()).run();
      done++;
    } catch (e) {
      failed++;
      await env.DB.prepare(`UPDATE p_asset SET status = 'failed', tags_json = ?3 WHERE act_id = ?1 AND file_id = ?2`).bind(act, r.file_id, JSON.stringify({ error: String(e.message || e).slice(0, 200) })).run().catch(() => {});
    }
  }
  const cost = inTok / 1e6 * 1 + outTok / 1e6 * 5;
  return { act, tagged: done, failed, cost: Math.round(cost * 10000) / 10000 };
}

/** Search the library. Words match the description, name, products, clothing, setting and colours. */
export async function listAssets(env, act, p = {}) {
  await ensure(env);
  const where = [`act_id = ?1`, `status IN ('tagged', 'new')`], args = [act];
  const add = (sql, v) => { args.push(v); where.push(sql.replace('?', `?${args.length}`)); };
  if (p.people === 'yes') where.push('people > 0'); if (p.people === 'no') where.push('people = 0');
  if (p.setting) add('setting = ?', p.setting);
  if (p.source === 'locus') where.push(`source = 'locus'`);
  for (const w of String(p.q || '').toLowerCase().split(/\s+/).filter(x => x.length > 1).slice(0, 6)) add(`lower(COALESCE(descr,'') || ' ' || COALESCE(name,'') || ' ' || COALESCE(products,'') || ' ' || COALESCE(tags_json,'') || ' ' || COALESCE(path,'')) LIKE ?`, `%${w}%`);
  const lim = Math.min(+p.limit || 120, 400);
  const { results } = await env.DB.prepare(`SELECT file_id, name, path, w, h, status, people, setting, shot, products, colors, descr, thumb_key, modified, source, kind, cost, look_json FROM p_asset WHERE ${where.join(' AND ')} ORDER BY modified DESC LIMIT ${lim}`).bind(...args).all();
  const counts = await env.DB.prepare(`SELECT status, COUNT(*) n FROM p_asset WHERE act_id = ?1 GROUP BY status`).bind(act).all();
  const settings = await env.DB.prepare(`SELECT setting, COUNT(*) n FROM p_asset WHERE act_id = ?1 AND status = 'tagged' GROUP BY setting ORDER BY n DESC`).bind(act).all();
  const looks = (await env.DB.prepare(`SELECT COUNT(*) n FROM p_asset WHERE act_id = ?1 AND source = 'locus' AND status = 'tagged'`).bind(act).first().catch(() => null))?.n || 0;
  const at = (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(`assetsSyncAt:${act}`).first().catch(() => null))?.value || null;
  return { act, items: (results || []).map(r => ({ ...r, look: r.look_json ? safeJson(r.look_json, null) : null, look_json: undefined })), looks, counts: Object.fromEntries((counts.results || []).map(r => [r.status, r.n])), settings: settings.results || [], synced_at: at, sources: await sourcesFor(env, act) };
}

/** One library image at Studio size, for the browser to shrink and upload like a file it picked (2026-10-08).
 *  Drive photos come through Drive's own thumbnail service at 1600px: always a JPEG or PNG the browser can
 *  draw (a camera RAW, HEIC or a 40MB original never reaches the Worker), and the browser takes it to 1568px.
 *  A look (made by Locus) is already ours in R2. */
export async function assetFile(env, act, id) {
  await ensure(env);
  const row = await env.DB.prepare(`SELECT file_id, name, mime, thumb_key, source FROM p_asset WHERE act_id = ?1 AND file_id = ?2`).bind(act, id).first();
  if (!row) throw new Error('That image is not in this brand’s library.');
  if (row.source === 'locus') {
    const obj = row.thumb_key && env.MEDIA ? await env.MEDIA.get(row.thumb_key) : null;
    if (!obj) throw new Error('That look is missing from storage.');
    return { buf: await obj.arrayBuffer(), type: obj.httpMetadata?.contentType || 'image/jpeg', name: row.name };
  }
  const m = await drive(env, `files/${row.file_id}?fields=thumbnailLink,mimeType,size&supportsAllDrives=true`);
  const tok = await googleToken(env, AS(env), SCOPE);
  if (m.thumbnailLink) {
    const r = await F(m.thumbnailLink.replace(/=s\d+$/, '=s1600'), { headers: { Authorization: `Bearer ${tok}` } });
    if (r.ok) return { buf: await r.arrayBuffer(), type: (r.headers.get('content-type') || 'image/jpeg').split(';')[0], name: row.name };
  }
  /* No thumbnail (rare: a file Drive has not processed yet): the original, if it is a web image and not huge. */
  if (!/^image\/(jpeg|png|webp)$/.test(m.mimeType || '') || +m.size > 25e6) throw new Error('Drive has no preview of that image yet. Try again in a few minutes.');
  const r = await F(`https://www.googleapis.com/drive/v3/files/${row.file_id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error(`Drive ${r.status}`);
  return { buf: await r.arrayBuffer(), type: m.mimeType, name: row.name };
}

/** Take a look (made by Locus) out of the library. Drive photos are never touched here. */
export async function removeLook(env, act, id) {
  await ensure(env);
  const r = await env.DB.prepare(`UPDATE p_asset SET status = 'gone' WHERE act_id = ?1 AND file_id = ?2 AND source = 'locus'`).bind(act, id).run();
  return { ok: !!r.meta?.changes };
}

/** Hourly: the stalest brand (by last sync) gets a sync and a small tagging batch. */
export async function assetsTick(env, canAfford = () => true) {
  await ensure(env);
  const { results } = await env.DB.prepare(`SELECT a.act_id, s.value at FROM accounts a LEFT JOIN settings s ON s.key = 'assetsSyncAt:' || a.act_id WHERE a.active = 1 ORDER BY COALESCE(s.value, '') ASC LIMIT 1`).all();
  const a = results?.[0]; if (!a || !canAfford()) return { skipped: true };
  if (/golf sock/i.test(a.act_id)) return { skipped: true };
  const s = await syncAssets(env, a.act_id).catch(e => ({ act: a.act_id, error: e.message }));
  const t = canAfford() ? await tagAssets(env, a.act_id, 20).catch(e => ({ error: e.message })) : null;
  return { sync: s, tag: t };
}
