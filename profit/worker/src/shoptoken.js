/**
 * ONE DOOR TO A STORE'S SHOPIFY TOKEN (2026-11-24, App Store requirement 3.1.2).
 *
 * Public apps must use EXPIRING offline tokens: the access token lasts about an hour, the refresh token 90 days, and
 * every refresh hands back a NEW refresh token that replaces the old one. So nothing may read p_shopify.access_token
 * and use it directly any more. Every reader, in both workers (they share the database), calls:
 *
 *   shopToken(env, shop)   -> a token good for at least 5 more minutes, or null when the store is not connected
 *
 * It refreshes a token that is about to run out, and swaps an old never-expiring token for an expiring one the first
 * time it sees it (Shopify's one-call migration, no reinstall). Same idea as the Supply engine's getAccessToken
 * (supply/engine/src/worker.js), with D1 as the cache because both workers already share this table.
 *
 * A worker that does not hold the app secret (account-health) passes `remote`, a function that asks the profit worker
 * to do the refresh (POST /api/shopify/token-refresh); the fresh token is then read from the shared table. The token
 * itself never travels between workers.
 *
 * Shopify's rules this follows (shopify.dev, "implement token exchange" and "migrate to expiring offline tokens"):
 *   - form-encoded POST to https://<shop>/admin/oauth/access_token
 *   - new token:  grant_type token-exchange (or the install code) + expiring=1
 *   - refresh:    grant_type=refresh_token, refresh_token, client_id, client_secret
 *   - migrate:    token-exchange with subject_token = the old offline token, both token types offline, expiring=1
 *   - 401 on refresh is final (the refresh token is spent or expired): do not retry, the store reopens the app
 *   - 5xx / 429 / network: safe to retry with the same refresh token
 */
const TOKEN_URL = shop => `https://${shop}/admin/oauth/access_token`;
const OFFLINE = 'urn:shopify:params:oauth:token-type:offline-access-token';
const EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
/** Refresh this long before the token runs out, so a request that starts now cannot outlive it. */
export const REFRESH_MARGIN_S = 5 * 60;
const COLS = ['refresh_token TEXT', 'expires_at INTEGER', 'refresh_expires_at INTEGER'];
const SELECT = `SELECT shop, act_id, access_token, scopes, uninstalled_at, refresh_token, expires_at, refresh_expires_at FROM p_shopify WHERE shop = ?1`;

/** Add the three token columns if this database predates them (migrations/shopify-001-expiring-tokens.sql does the
 *  same by hand). Harmless when they exist: each ALTER fails on its own and is ignored. */
export async function ensureTokenColumns(env) {
  for (const c of COLS) await env.DB.prepare(`ALTER TABLE p_shopify ADD COLUMN ${c}`).run().catch(() => {});
}
async function readRow(env, shop) {
  try { return await env.DB.prepare(SELECT).bind(shop).first(); }
  catch (e) {
    if (!/no such column/i.test(String(e?.message || e))) return null;
    await ensureTokenColumns(env);
    return env.DB.prepare(SELECT).bind(shop).first().catch(() => null);
  }
}

async function post(F, shop, params) {
  const res = await F(TOKEN_URL(shop), {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params).toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw Object.assign(new Error(`Shopify token request failed (${res.status})`), { status: res.status });
  return j;
}
/** Shopify's answer -> what we store. expires_at / refresh_expires_at are unix seconds; null = a never-expiring token. */
export function tokenSet(j, nowS = Math.floor(Date.now() / 1000)) {
  return {
    token: j.access_token, scope: j.scope || null,
    refresh_token: j.refresh_token || null,
    expires_at: j.expires_in ? nowS + Number(j.expires_in) : null,
    refresh_expires_at: j.refresh_token_expires_in ? nowS + Number(j.refresh_token_expires_in) : null,
  };
}
const creds = env => ({ client_id: env.SHOPIFY_API_KEY, client_secret: env.SHOPIFY_API_SECRET });
const hasCreds = env => !!(env.SHOPIFY_API_KEY && env.SHOPIFY_API_SECRET);

/** The embedded app: trade the App Bridge session token for an expiring offline token. */
export async function exchangeSessionToken(env, shop, sessionToken, F = fetch) {
  return tokenSet(await post(F, shop, { ...creds(env), grant_type: EXCHANGE, subject_token: sessionToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token', requested_token_type: OFFLINE, expiring: '1' }));
}
/** The direct install link: trade the install code for an expiring offline token. */
export async function exchangeCode(env, shop, code, F = fetch) {
  return tokenSet(await post(F, shop, { ...creds(env), code, expiring: '1' }));
}

/** Write a token set over the row. `onlyIfRefresh` makes it a compare-and-swap on the refresh token we started from,
 *  so two refreshes racing each other cannot overwrite the newer pair with the older one. Returns true when written. */
async function writeTokens(env, shop, t, onlyIfRefresh) {
  const guard = onlyIfRefresh === undefined ? '' : ` AND COALESCE(refresh_token, '') = ?7`;
  const args = [shop, t.token, t.refresh_token, t.expires_at, t.refresh_expires_at, t.scope || null];
  if (onlyIfRefresh !== undefined) args.push(onlyIfRefresh || '');
  const r = await env.DB.prepare(
    `UPDATE p_shopify SET access_token = ?2, refresh_token = ?3, expires_at = ?4, refresh_expires_at = ?5, scopes = COALESCE(?6, scopes)
     WHERE shop = ?1 AND uninstalled_at IS NULL${guard}`).bind(...args).run();
  return !!r?.meta?.changes || r?.meta?.changes === undefined;
}
/** The store can no longer be read until its owner opens the app again (which exchanges a fresh token). */
async function forget(env, shop) {
  await env.DB.prepare(`UPDATE p_shopify SET access_token = '', refresh_token = NULL, expires_at = NULL, refresh_expires_at = NULL WHERE shop = ?1`).bind(shop).run().catch(() => {});
}

/**
 * A working token for this shop, or null (not installed, uninstalled, or the store has to reopen the app).
 * opts: F = fetch to use; now = () => ms; force = refresh even if the token still has time;
 *       remote = async shop => {} for a worker without the app secret (see the header).
 * Throws only when Shopify could not be reached AND the stored token has already run out.
 */
export async function shopToken(env, shop, { F = fetch, now = Date.now, force = false, remote } = {}) {
  const row = await readRow(env, shop);
  if (!row?.access_token || row.uninstalled_at) return null;
  const nowS = Math.floor(now() / 1000);
  const legacy = row.expires_at == null;                       // installed before expiring tokens
  const fresh = !legacy && row.expires_at - nowS > REFRESH_MARGIN_S;
  if (fresh && !force) return row.access_token;

  if (!hasCreds(env)) {
    if (!remote) return legacy || row.expires_at > nowS ? row.access_token : null;
    try { await remote(shop); } catch (e) { if (legacy || row.expires_at > nowS) return row.access_token; throw e; }
    const after = await readRow(env, shop);
    return after?.access_token && !after.uninstalled_at ? after.access_token : null;
  }

  if (legacy) {
    /* One call swaps the old token for an expiring pair and kills the old one. If it does not take (Shopify down, or
       the response was lost), keep using the old token: Shopify lets the same request be repeated for 7 days. */
    try {
      const t = tokenSet(await post(F, shop, { ...creds(env), grant_type: EXCHANGE, subject_token: row.access_token,
        subject_token_type: OFFLINE, requested_token_type: OFFLINE, expiring: '1' }), nowS);
      if (!t.refresh_token || !t.expires_at) return row.access_token;     // Shopify answered with a non-expiring token
      await writeTokens(env, shop, t);
      return t.token;
    } catch (e) {
      if (e.status === 401) { await forget(env, shop); return null; }      // the old token is already dead
      return row.access_token;
    }
  }

  if (!row.refresh_token) return row.expires_at > nowS ? row.access_token : (await forget(env, shop), null);
  try {
    const t = tokenSet(await post(F, shop, { ...creds(env), grant_type: 'refresh_token', refresh_token: row.refresh_token }), nowS);
    if (!t.refresh_token) t.refresh_token = row.refresh_token;
    if (!t.refresh_expires_at) t.refresh_expires_at = row.refresh_expires_at;
    if (!t.expires_at) t.expires_at = nowS + 3600;
    if (await writeTokens(env, shop, t, row.refresh_token)) return t.token;
    const other = await readRow(env, shop);                    // someone else refreshed in the same moment: use theirs
    return other?.access_token && !other.uninstalled_at ? other.access_token : null;
  } catch (e) {
    if (e.status === 401) {
      /* Final. Either another request just used this refresh token (then the row already holds the new pair), or the
         90 days ran out / access was taken back, and the store has to open the app again. */
      const other = await readRow(env, shop);
      if (other?.access_token && !other.uninstalled_at && other.refresh_token !== row.refresh_token && other.expires_at > nowS) return other.access_token;
      await forget(env, shop);
      return null;
    }
    if (row.expires_at > nowS) return row.access_token;        // Shopify hiccup, the token still has a little time
    throw new Error('Shopify did not answer the token refresh. Try again in a minute.');
  }
}
