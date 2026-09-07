/**
 * Google Drive — read-only, for importing the years of receipts that already
 * live in Cole's `Taxes/<year>/<month>/Expenses/<type>` folders.
 *
 * Ledger only ever reads. The OAuth scope asked for is drive.readonly, so the
 * worst a leaked token could do is read files, never change or delete them.
 *
 * The refresh token lives in the settings table beside the Plaid access tokens
 * — same database, same trust boundary, and unlike a Worker secret it can be
 * written at runtime, which is the whole point of an OAuth callback.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

export const driveReady = env => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export function driveAuthUrl(env, redirectUri, state) {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',      // we need a refresh token, not just an hour
    prompt: 'consent',           // force one, even on a re-authorisation
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${p}`;
}

export async function driveExchangeCode(env, code, redirectUri) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  const j = await r.json();
  if (!j.refresh_token) throw new Error(j.error_description || j.error || 'no refresh token returned');
  return j.refresh_token;
}

/** Access tokens last an hour; mint one and keep it until it is nearly stale. */
export async function driveAccessToken(env, store) {
  const now = Date.now();
  if (store.access && store.expires > now + 60e3) return store.access;
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: store.refresh, grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google: ' + (j.error_description || j.error || 'token refresh failed'));
  store.access = j.access_token;
  store.expires = now + (j.expires_in || 3600) * 1000;
  return store.access;
}

async function driveGet(env, store, path, params) {
  const token = await driveAccessToken(env, store);
  const r = await fetch(`https://www.googleapis.com/drive/v3/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  if (j.error) throw new Error('Drive: ' + (j.error.message || r.status));
  return j;
}

/** A folder id out of any of the shapes Drive puts in the address bar. */
export function driveFolderId(input) {
  const s = String(input || '').trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null;
}

/* Cole's folders read `1.  January` … `12. December` (the first has two
 * spaces), sitting under a year folder. Taking the month from the PATH is far
 * better than guessing it from a receipt's own date: it is how he filed it, and
 * it narrows the amount match to one month instead of a whole year. */
const MONTH_NAMES = ['january','february','march','april','may','june',
                     'july','august','september','october','november','december'];
export function monthFromPath(parts) {
  let year = null, mon = null;
  for (const p of parts) {
    const y = String(p).match(/\b(20\d{2})\b/);
    if (y) year = y[1];
    const cleaned = String(p).toLowerCase().replace(/[^a-z]/g, '');
    const i = MONTH_NAMES.indexOf(cleaned);
    if (i >= 0) mon = String(i + 1).padStart(2, '0');
    else {
      const n = String(p).match(/^\s*(\d{1,2})\s*[.\-]/);
      if (n && +n[1] >= 1 && +n[1] <= 12) mon = String(+n[1]).padStart(2, '0');
    }
  }
  return year && mon ? `${year}-${mon}` : null;
}

const FOLDER = 'application/vnd.google-apps.folder';

/**
 * Walk a folder tree, returning every readable receipt file with the month its
 * path implies. Breadth-first with a cap, so a mis-pasted link to My Drive
 * cannot turn into an unbounded crawl.
 */
export async function driveListReceipts(env, store, rootId, { maxFiles = 2000, maxFolders = 400 } = {}) {
  const out = [];
  const queue = [{ id: rootId, path: [] }];
  let folders = 0;
  while (queue.length && out.length < maxFiles && folders < maxFolders) {
    const { id, path } = queue.shift();
    folders++;
    let pageToken;
    do {
      const j = await driveGet(env, store, 'files', {
        q: `'${id}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size)',
        pageSize: '200', ...(pageToken ? { pageToken } : {}),
      });
      for (const f of j.files || []) {
        if (f.mimeType === FOLDER) { queue.push({ id: f.id, path: [...path, f.name] }); continue; }
        const ok = f.mimeType === 'application/pdf' || /^image\//.test(f.mimeType || '');
        if (!ok) continue;
        out.push({
          id: f.id, name: f.name, mimeType: f.mimeType, size: +(f.size || 0),
          month: monthFromPath([...path, f.name]),
          path: path.join(' / '),
        });
      }
      pageToken = j.nextPageToken;
    } while (pageToken && out.length < maxFiles);
  }
  return out;
}

export async function driveDownload(env, store, fileId) {
  const token = await driveAccessToken(env, store);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error('Drive download ' + r.status);
  return await r.arrayBuffer();
}
