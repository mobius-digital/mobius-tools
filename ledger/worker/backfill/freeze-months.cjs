// Freezes history months exactly as the worker's own /api/close does, in a
// local workerd, from rows that already carry their production ids. Prints the
// months SQL to apply in production.
const fs = require('node:fs');
const path = require('node:path');
const W = 'C:/Users/wetzl/OneDrive/Apps/Desktop/Mobius Digital/Mobius Digital Tools/ledger/worker';
const { Miniflare, convertV4MiniflareOptions } = require(W + '/../../marketing-hub/node_modules/miniflare');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outFile = process.argv[3];
(async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, scriptPath: W + '/.audit-build/bundle/worker.js',
    compatibilityDate: '2026-07-01', d1Databases: { DB: 'mobius-ledger-audit-local' }, kvNamespaces: ['RECEIPTS'],
    bindings: { ADMIN_TOKEN: 'offline-freeze', OWNER_EMAIL: 'owner@mobius.test' },
    outboundService: () => new Response('offline', { status: 503 }) }));
  try {
    const db = await mf.getD1Database('DB');
    for (const file of ['schema.sql', ...fs.readdirSync(W + '/migrations').sort().map(f => 'migrations/' + f)]) {
      let sql = '';
      for (const line of fs.readFileSync(path.join(W, file), 'utf8').split(/\r?\n/)) {
        sql += line.replace(/--.*$/, '') + '\n';
        const t = sql.trim(); if (!t) continue;
        if (/CREATE TRIGGER/i.test(t) ? /END;\s*$/i.test(t) : /;\s*$/.test(t)) { await db.prepare(t).run(); sql = ''; }
      }
    }
    const cols = ['id','date','month','type','vendor','amount','bucket','tax_cat','note','one_time','expected','status','receipt_key','receipt_name','receipt_type','source','created_at','receipt_skip'];
    for (const r of rows) {
      await db.prepare(`INSERT INTO transactions (${cols.join(',')}) VALUES (${cols.map((_, i) => '?' + (i + 1)).join(',')})`)
        .bind(...cols.map(c => r[c] ?? (c === 'one_time' || c === 'expected' || c === 'receipt_skip' ? 0 : null))).run();
    }
    const months = [...new Set(rows.map(r => r.month))].sort();
    const call = (u, body) => mf.dispatchFetch('http://local' + u, { method: 'POST',
      headers: { Authorization: 'Bearer offline-freeze', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const sql = [];
    for (const m of months) {
      const res = await call('/api/close', { month: m, force: true });
      if (res.status !== 200) throw new Error(m + ' ' + await res.text());
      const row = await db.prepare('SELECT month, report_json FROM months WHERE month = ?1').bind(m).first();
      const rep = JSON.parse(row.report_json);
      const closedAt = `${m.slice(0, 4)}-${m.slice(5)}-28T12:00:00Z`;
      sql.push(`INSERT INTO months (month, status, closed_at, report_json) VALUES ('${m}', 'closed', '${closedAt}', '${row.report_json.replace(/'/g, "''")}');`);
      console.log(m, 'rev', rep.revenue, 'exp', rep.expenses, 'fee', rep.fees, 'net', rep.net, 'rows', rep.txnCount);
    }
    fs.writeFileSync(outFile, sql.join('\n') + '\n');
  } finally { await mf.dispose(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
