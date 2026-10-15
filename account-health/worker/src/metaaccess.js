/**
 * Access checks (2026-10-09, Cole: "I should have full access to everything; does this have to happen for every new
 * client?").
 *   GET  /api/access          (admin) every active brand: what the Meta token may do on each ad account (user_tasks),
 *                             and whether the Slack app is in each brand channel (conversations.info as the bot).
 *   POST /api/access/meta     (admin) {act?}: the system user grants ITSELF Manage on ad accounts it can already see
 *                             (POST /{act}/assigned_users), so a new client needs no manual step when Meta allows it.
 * The system user is whoever owns META_TOKEN ("Mobius Tools"). Meta only lets it assign an account that our business
 * (695359915477596) already has as a partner asset with permission to assign; otherwise the answer says so.
 */
const G = 'https://graph.facebook.com/v23.0';

async function graph(deps, env, path, params = {}, method = 'GET') {
  const qs = new URLSearchParams({ ...params, access_token: env.META_TOKEN });
  const url = method === 'GET' ? `${G}/${path}?${qs}` : `${G}/${path}`;
  const r = await deps.xfetch(url, method === 'GET' ? {} : { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: qs.toString() });
  return r.json().catch(() => ({}));
}

async function metaAccounts(env) {
  const { results } = await env.DB.prepare(`SELECT b.id, b.name, c.external_id AS act FROM brands b JOIN connections c ON c.brand_id = b.id AND c.kind = 'meta'
    WHERE b.status IN ('active', 'demo') ORDER BY b.name`).all();
  return results || [];
}

export async function accessReport(env, deps) {
  const me = await graph(deps, env, 'me', { fields: 'id,name' });
  const meta = [];
  for (const a of await metaAccounts(env)) {
    const act = String(a.act).startsWith('act_') ? a.act : `act_${a.act}`;
    const r = await graph(deps, env, act, { fields: 'name,user_tasks,business{id,name},owner' });
    const tasks = r.user_tasks || [];
    meta.push({ brand: a.name, act, account: r.name || null, owner_business: r.business?.name || null,
      can: tasks.includes('MANAGE') ? 'manage' : tasks.includes('ADVERTISE') ? 'advertise' : tasks.length ? 'view' : 'none', tasks, error: r.error?.message || null });
  }
  const { results: chans } = await env.DB.prepare(`SELECT name, internal_channel, client_channel FROM brands WHERE status IN ('active', 'demo') ORDER BY name`).all();
  const slack = [];
  for (const b of chans || []) for (const [side, ch] of [['internal', b.internal_channel], ['client', b.client_channel]]) {
    if (!ch) continue;
    const r = await deps.slackApi(env, 'conversations.info', { channel: ch });
    slack.push({ brand: b.name, side, channel: ch, name: r.channel?.name || null, member: r.channel?.is_member ?? null,
      shared: !!(r.channel?.is_ext_shared || r.channel?.is_shared), archived: !!r.channel?.is_archived, error: r.ok ? null : r.error });
  }
  return { system_user: me.name ? `${me.name} (${me.id})` : null, meta, slack };
}

/** The system user assigns itself MANAGE on each account it can see but not change. */
export async function grantSelf(env, deps, { act = null } = {}) {
  const me = await graph(deps, env, 'me', { fields: 'id' });
  if (!me.id) return { error: 'Could not read the Meta token owner.' };
  const out = [];
  for (const a of await metaAccounts(env)) {
    const id = String(a.act).startsWith('act_') ? a.act : `act_${a.act}`;
    if (act && id !== act && a.id !== act) continue;
    const cur = await graph(deps, env, id, { fields: 'user_tasks' });
    if ((cur.user_tasks || []).includes('MANAGE')) { out.push({ brand: a.name, act: id, result: 'already manage' }); continue; }
    const r = await graph(deps, env, `${id}/assigned_users`, { user: me.id, tasks: JSON.stringify(['MANAGE', 'ADVERTISE', 'ANALYZE']), business: '695359915477596' }, 'POST');
    out.push({ brand: a.name, act: id, result: r.success ? 'granted' : 'refused', error: r.error?.message || null });
  }
  return { system_user: me.id, accounts: out };
}

/**
 * THE PARTNER SWEEP (2026-10-15). Cole: "every single time they give access to our partner account, I have to go in
 * there and manually assign those two people. I would love for it to just auto assign to everything."
 * When a client adds Mobius as a partner, Meta puts the assets on our business but assigns them to NOBODY, not even
 * our admins or the Mobius Tools system user (so Locus could not see a new account either). Every hour this walks
 * what clients shared with our business (ad accounts, Pages, pixels/datasets, catalogs) and assigns:
 *   - the Mobius Tools system user (Locus), and
 *   - the team by name (DEFAULT_TEAM, or settings `metaTeam` = a JSON list of names exactly as Meta shows them).
 * Full tasks first; when Meta refuses (the client gave less than full control) it retries with the smaller set, and
 * the answer says what stuck. Never removes anyone. `dry` = report only.
 */
export const MOBIUS_BM = '695359915477596';
/* Cole 2026-10-15: himself, Ahsan (both of his Meta logins), the strategist(s), and Locus. Change with settings `metaTeam`. */
const DEFAULT_TEAM = ['Cole Wetzler', 'Ahsan Abidi', 'Ahsan Raza', 'NOMA MOLIFE'];
const KINDS = [
  { kind: 'ad account', edge: 'client_ad_accounts', fields: 'id,name,business{id}', tasks: [['MANAGE', 'ADVERTISE', 'ANALYZE'], ['ADVERTISE', 'ANALYZE'], ['ANALYZE']] },
  { kind: 'Page', edge: 'client_pages', fields: 'id,name,business{id}', tasks: [['MANAGE', 'CREATE_CONTENT', 'MODERATE', 'ADVERTISE', 'ANALYZE'], ['CREATE_CONTENT', 'MODERATE', 'ADVERTISE', 'ANALYZE'], ['ADVERTISE', 'ANALYZE']] },
  { kind: 'pixel', edge: 'client_pixels', fields: 'id,name,owner_business{id}', tasks: [['EDIT', 'ANALYZE'], ['ANALYZE']] },
  { kind: 'catalog', edge: 'client_product_catalogs', fields: 'id,name,business{id}', tasks: [['MANAGE', 'ADVERTISE'], ['ADVERTISE']] },
];
async function all(deps, env, path, params) {
  const out = []; let after = null;
  for (let i = 0; i < 5; i++) {
    const r = await graph(deps, env, path, { ...params, limit: '100', ...(after ? { after } : {}) });
    if (r.error) { if (!out.length) throw new Error(r.error.message); break; }
    out.push(...(r.data || []));
    after = r.paging?.next ? r.paging?.cursors?.after : null;
    if (!after) break;
  }
  return out;
}
export async function partnerSweep(env, deps, { dry = false, canAfford = () => true } = {}) {
  const me = await graph(deps, env, 'me', { fields: 'id,name' });
  if (!me.id) return { error: 'Could not read the Meta token owner.' };
  /* Meta hides Business settings > People from a system user (business_users comes back empty), so the team is a
     list of NAMES (settings `metaTeam`, default below) and their ids are read off the client assets they already sit
     on (assigned_users answers id + name; ids are the same on every asset of our business). */
  let names = DEFAULT_TEAM;
  try { const v = JSON.parse((await env.DB.prepare(`SELECT value FROM settings WHERE key = 'metaTeam'`).first())?.value || 'null'); if (Array.isArray(v) && v.length) names = v; } catch {}
  const want = new Set(names.map(n => String(n).trim().toLowerCase()));
  const lists = [];
  for (const K of KINDS) {
    try { lists.push([K, await all(deps, env, `${MOBIUS_BM}/${K.edge}`, { fields: K.fields })]); }
    catch (e) { lists.push([K, null, e.message]); }
  }
  const ids = new Map([[String(me.id), `${me.name} (Locus)`]]);
  const seen = new Map();
  for (const a of (lists[0][1] || []).slice(0, 30)) {
    if (!canAfford()) break;
    const cur = await graph(deps, env, `${a.id}/assigned_users`, { business: MOBIUS_BM, fields: 'id,name', limit: '200' });
    seen.set(a.id, cur);
    for (const u of cur.data || []) if (want.has(String(u.name || '').trim().toLowerCase())) ids.set(String(u.id), u.name);
  }
  const team = [...ids].map(([id, name]) => ({ id, name }));
  /* Only CURRENT clients and anything shared from now on. Past clients' old assets stay as they are: the first run
     records every id it sees (settings `metaSweepSeen`); after that an asset is filled when its owner business is a
     live brand's (from that brand's ad account) or when it is new since the last look (a new client sharing). */
  const live = new Set((await metaAccounts(env)).map(a => String(a.act).replace(/^act_/, '')));
  const liveBiz = new Set((lists[0][1] || []).filter(a => live.has(String(a.id).replace(/^act_/, ''))).map(a => a.business?.id).filter(Boolean));
  const seenRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'metaSweepSeen'`).first().catch(() => null);
  const baseline = seenRow ? new Set(JSON.parse(seenRow.value || '[]')) : null;
  const allIds = lists.flatMap(([, as]) => (as || []).map(a => String(a.id)));
  const ownerOf = a => a.business?.id || a.owner_business?.id || null;
  const inScope = a => liveBiz.has(ownerOf(a)) || (baseline ? !baseline.has(String(a.id)) : false);
  const out = { team: team.map(t => t.name), missing_names: names.filter(n => !team.some(t => t.name.trim().toLowerCase() === String(n).trim().toLowerCase())), assets: [], errors: [] };
  for (const [K, assets, err] of lists) {
    if (!assets) { out.errors.push(`${K.kind}s: ${err}`); continue; }
    for (const a of assets) {
      if (!inScope(a)) continue;
      if (!canAfford()) { out.stopped = 'budget'; return out; }
      const cur = seen.get(a.id) || await graph(deps, env, `${a.id}/assigned_users`, { business: MOBIUS_BM, fields: 'id,name', limit: '200' });
      /* Pages need pages_manage_metadata on the Mobius Tools token; until it has it, say so once, not per Page. */
      if (cur.error && /pages_manage_metadata/.test(cur.error.message)) { out.errors.push('Pages: the Mobius Tools token needs the pages_manage_metadata permission (Business settings > System users > Mobius Tools > Generate new token, tick it). Until then assign Pages by hand.'); break; }
      if (cur.error) { out.assets.push({ kind: K.kind, id: a.id, name: a.name, error: cur.error.message }); continue; }
      const have = new Set((cur.data || []).map(u => String(u.id)));
      seen.delete(a.id);
      const missing = team.filter(t => !have.has(String(t.id)));
      const row = { kind: K.kind, id: a.id, name: a.name, already: (cur.data || []).map(u => u.name), added: [], refused: [] };
      for (const t of missing) {
        if (dry) { row.added.push(`${t.name} (would add)`); continue; }
        let ok = false, err = null;
        for (const tasks of K.tasks) {
          const r = await graph(deps, env, `${a.id}/assigned_users`, { user: t.id, tasks: JSON.stringify(tasks), business: MOBIUS_BM }, 'POST');
          if (r.success) { ok = true; row.added.push(`${t.name}: ${tasks.join(', ').toLowerCase()}`); break; }
          err = r.error?.message || 'refused';
        }
        if (!ok) row.refused.push(`${t.name}: ${err}`);
        /* "(#10) Application does not have permission": the app itself may not assign this kind (pixels today). Say it
           once and move on instead of spending every hour on refusals. */
        if (!ok && /Application does not have permission/.test(err || '')) { row.app_blocked = true; break; }
      }
      if (row.app_blocked) { out.errors.push(`${K.kind}s: Meta does not let the Mobius Tools app assign these; assign by hand in Business settings.`); break; }
      if (row.added.length || row.refused.length || row.error) out.assets.push(row);
      else out.assets.push({ kind: K.kind, id: a.id, name: a.name, ok: true, already: row.already });
    }
  }
  if (!dry) await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('metaSweepSeen', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(JSON.stringify([...new Set([...(baseline || []), ...allIds])])).run().catch(() => {});
  out.added = out.assets.reduce((n, a) => n + (a.added?.filter(x => !x.includes('would add')).length || 0), 0);
  return out;
}
