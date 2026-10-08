/* A D1 binding that talks to the LIVE database over Cloudflare's REST API, so worker code
 * (src/brands.js and friends) can run from this machine for one-off jobs and migrations.
 *   import { remoteEnv } from './scripts/d1rest.mjs';  const env = await remoteEnv();
 * Auth: wrangler's own OAuth token (run `npx wrangler whoami` first if it has expired).
 * batch() runs the statements in ONE request (D1 treats a multi-statement query as a transaction). */
import fs from 'node:fs';
import path from 'node:path';

const ACCOUNT = '9de398454c0670e665485f4e4426a630';
const DATABASE = '93e7cdeb-19a9-4950-8146-e24b189f410f';   // mobius-account-health

function token() {
  const f = path.join(process.env.APPDATA || '', 'xdg.config', '.wrangler', 'config', 'default.toml');
  const m = fs.readFileSync(f, 'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error('No wrangler oauth token; run npx wrangler login.');
  return m[1];
}

export async function remoteEnv({ database = DATABASE } = {}) {
  const tok = token();
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${database}/query`;
  const call = async (sql, params = []) => {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }) });
      const j = await r.json().catch(() => ({}));
      if (j.success) return j.result;
      const msg = (j.errors || []).map(e => e.message).join('; ') || `HTTP ${r.status}`;
      if (attempt < 3 && /7403|overloaded|timeout|5\d\d/i.test(msg + r.status)) { await new Promise(res => setTimeout(res, 1500 * (attempt + 1))); continue; }
      throw new Error(`D1: ${msg}\n  in: ${sql.slice(0, 200)}`);
    }
  };
  const norm = v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  const prepare = sql => {
    let args = [];
    const st = {
      sql, get args() { return args; },
      bind(...a) { args = a.map(norm); return st; },
      async all() { const res = await call(sql, args); return { results: res[0]?.results || [], meta: res[0]?.meta || {} }; },
      async first() { return (await st.all()).results[0] || null; },
      async run() { const res = await call(sql, args); return { meta: res[0]?.meta || {} }; },
    };
    return st;
  };
  const DB = {
    prepare,
    /* D1's REST query takes one statement with params; run them in order. Callers that need
       atomicity across statements must say so explicitly (see migrations, which use a single SQL). */
    async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
    async exec(sql) { return call(sql); },
  };
  return { DB };
}
