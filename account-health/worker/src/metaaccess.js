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
