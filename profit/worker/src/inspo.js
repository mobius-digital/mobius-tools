/* Save to Locus (2026-10-21): anything a person saves as inspiration for a brand, from anywhere.
 * Three ways in, one route: paste a link (or an image) into the Ask bar, share a link from the phone
 * (manifest share_target -> /profit/?share=1&url=), or the desktop bookmarklet (/profit/?save=<url>).
 * Saved items show on Make > Inspiration for that brand, every angle, above the Atria boards.
 *
 * Routes (authed, mounted by worker.js):
 *   GET    /api/inspo?act=                  -> { items: [...] }  newest first, 200 max
 *   POST   /api/inspo { act, url?, image?, note?, title? }  -> { item }  a link is read once for its title and picture
 *   PATCH  /api/inspo { id, note?, title? }  -> { item }
 *   DELETE /api/inspo?id=
 * Table p_inspo (made on first use). The page is fetched server side with a 6s cap; a page that refuses
 * keeps the link with its host as the title. Nothing else reads the page. */
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, n);
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const isUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; } };

let made = false;
async function ensure(env) {
  if (made) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_inspo (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, kind TEXT NOT NULL, url TEXT, image TEXT,
    title TEXT, site TEXT, note TEXT, created_by TEXT, created_at TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_inspo_act ON p_inspo (act_id, created_at)`).run();
  made = true;
}

const ent = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function metaOf(html, name) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i'), m = html.match(re);
  if (!m) return '';
  const c = m[0].match(/content=["']([^"']*)["']/i);
  return c ? ent(c[1]) : '';
}
/** The page's title and picture, best effort. */
export async function readLink(u) {
  const site = new URL(u).hostname.replace(/^www\./, '');
  const out = { title: '', image: '', site };
  try {
    const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(6000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; LocusBot/1.0; +https://tools.go-mobius-digital.com/profit/)', accept: 'text/html' } });
    if (!r.ok || !/html/i.test(r.headers.get('content-type') || '')) return out;
    const html = (await r.text()).slice(0, 400000);
    out.title = clip(metaOf(html, 'og:title') || metaOf(html, 'twitter:title') || ent((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || ''), 200);
    let img = metaOf(html, 'og:image') || metaOf(html, 'twitter:image');
    if (img) { try { img = new URL(img, r.url || u).href; } catch { img = ''; } }
    out.image = isUrl(img) ? img.slice(0, 1000) : '';
  } catch {}
  return out;
}

const shape = r => ({ id: r.id, act: r.act_id, kind: r.kind, url: r.url, image: r.image, title: r.title, site: r.site, note: r.note, by: r.created_by, at: r.created_at });

export async function handleInspo({ path, request, env, url, json, email, accountsFor }) {
  if (path !== '/api/inspo') return null;
  await ensure(env);
  const m = request.method;
  if (m === 'GET') {
    const act = url.searchParams.get('act') || '';
    if (!act) return json({ error: 'Pick a brand.' }, 400);
    const { results } = await env.DB.prepare(`SELECT * FROM p_inspo WHERE act_id = ?1 ORDER BY created_at DESC LIMIT 200`).bind(act).all();
    return json({ items: (results || []).map(shape) });
  }
  const body = m === 'POST' || m === 'PATCH' ? await request.json().catch(() => ({})) : {};
  if (m === 'POST') {
    const act = String(body.act || '');
    const accts = await accountsFor();
    if (!act || act === 'all' || !accts.some(a => a.act_id === act)) return json({ error: 'Pick a brand to save it to.' }, 400);
    const link = clip(body.url, 2000), image = clip(body.image, 1000);
    if (!isUrl(link) && !isUrl(image)) return json({ error: 'That is not a link Locus can open.' }, 400);
    if (isUrl(link)) {
      const dup = await env.DB.prepare(`SELECT * FROM p_inspo WHERE act_id = ?1 AND url = ?2`).bind(act, link).first();
      if (dup) return json({ item: shape(dup), already: true });
    }
    const meta = isUrl(link) ? await readLink(link) : { title: '', image: '', site: '' };
    const row = { id: 'in_' + hex(12), act_id: act, kind: isUrl(link) ? 'link' : 'image', url: isUrl(link) ? link : null,
      image: isUrl(image) ? image : meta.image || null, title: clip(body.title, 200) || meta.title || meta.site || 'A picture',
      site: meta.site || null, note: clip(body.note, 1000) || null, created_by: email || null, created_at: new Date().toISOString() };
    await env.DB.prepare(`INSERT INTO p_inspo (id, act_id, kind, url, image, title, site, note, created_by, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`)
      .bind(row.id, row.act_id, row.kind, row.url, row.image, row.title, row.site, row.note, row.created_by, row.created_at).run();
    return json({ item: shape(row) });
  }
  if (m === 'PATCH') {
    const row = await env.DB.prepare(`SELECT * FROM p_inspo WHERE id = ?1`).bind(String(body.id || '')).first();
    if (!row) return json({ error: 'not found' }, 404);
    if ('note' in body) row.note = clip(body.note, 1000) || null;
    if ('title' in body && clip(body.title, 200)) row.title = clip(body.title, 200);
    await env.DB.prepare(`UPDATE p_inspo SET note = ?2, title = ?3 WHERE id = ?1`).bind(row.id, row.note, row.title).run();
    return json({ item: shape(row) });
  }
  if (m === 'DELETE') {
    await env.DB.prepare(`DELETE FROM p_inspo WHERE id = ?1`).bind(url.searchParams.get('id') || '').run();
    return json({ ok: true });
  }
  return null;
}
