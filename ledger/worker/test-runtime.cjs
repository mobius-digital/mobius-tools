// Actual local workerd/D1/KV integration. No remote bindings or credentials.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Miniflare, convertV4MiniflareOptions } = require('../../marketing-hub/node_modules/miniflare');
async function main() {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, scriptPath: path.join(__dirname,'.audit-build/bundle/worker.js'),
    compatibilityDate:'2026-07-01', d1Databases:{DB:'mobius-ledger-audit-local'}, kvNamespaces:['RECEIPTS'],
    bindings:{ADMIN_TOKEN:'offline-audit-only',OWNER_EMAIL:'owner@mobius.test'},
    outboundService:()=>new Response('Network disabled in local audit', {status:503}) }));
  try {
    const db=await mf.getD1Database('DB');
    for(const file of ['schema.sql', ...fs.readdirSync(path.join(__dirname,'migrations')).sort().map(f=>'migrations/'+f)]) {
      let sql='';
      for(const line of fs.readFileSync(path.join(__dirname,file),'utf8').split(/\r?\n/)) {
        sql+=line.replace(/--.*$/,'')+'\n';
        const t=sql.trim(); if(!t)continue;
        if (/CREATE TRIGGER/i.test(t) ? /END;\s*$/i.test(t) : /;\s*$/.test(t)) { await db.prepare(t).run();sql=''; }
      }
      assert.equal(sql.trim(),'','Unparsed SQL in '+file);
    }
    const call=async(url,method='GET',body)=>mf.dispatchFetch('http://local'+url,{method,headers:{Authorization:'Bearer offline-audit-only','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const add=await call('/api/transactions','POST',{rows:[{date:'2026-09-01',type:'in',vendor:'Client',amount:1000},{date:'2026-09-02',type:'out',vendor:'Income tax',tax_cat:'Income tax',amount:500},{date:'2026-09-03',type:'out',vendor:'Software',tax_cat:'Software & subscriptions',amount:100}]});
    assert.equal(add.status,200,await add.text());
    const report=await (await call('/api/report?month=2026-09')).json();assert.equal(report.report.net,900);
    const close=await call('/api/close','POST',{month:'2026-09',force:true});assert.equal(close.status,200,await close.text());
    const pack=await (await call('/api/pack?from=2026-09&to=2026-09')).json();assert.equal(pack.monthReports[0].net,900);assert.equal(pack.transactions.length,3);
    const edit=await call('/api/transaction','PUT',{id:3,tax_cat:'Personal'});assert.equal(edit.status,409);
    const receipt=await call('/api/receipt','POST',{id:3,name:'email.html',type:'text/html',data:Buffer.from('<script>bad()</script>').toString('base64')});assert.equal(receipt.status,200,await receipt.text());
    const preview=await call('/api/receipt?id=3');assert.match(preview.headers.get('content-type'),/^text\/plain/);
    const pdf=await call('/api/statement.pdf?month=2026-09');assert.equal(pdf.status,200,await pdf.clone().text());assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
    const archive=await call('/api/receipts.zip?from=2026-09&to=2026-09');assert.equal(archive.status,200);assert.ok(Buffer.from(await archive.arrayBuffer()).includes(Buffer.from('manifest.json')));
    if(process.argv.includes('--serve')) {
      const http=require('node:http');
      const server=http.createServer(async(req,res)=>{
        try {
          const url=new URL(req.url,'http://127.0.0.1:8796');
          if(url.pathname.startsWith('/api/')) {
            const chunks=[];for await(const chunk of req)chunks.push(chunk);
            const response=await mf.dispatchFetch(url.href,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
            res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
          }
          const routes={'/ledger/':['../index.html','text/html'],'/mobius.css':['../../mobius.css','text/css']};
          const file=routes[url.pathname];if(!file){res.writeHead(404);res.end();return;}
          const contents=fs.readFileSync(path.resolve(__dirname,file[0]));res.setHeader('Content-Type',file[1]);res.end(contents);
        }catch(e){res.writeHead(500);res.end(e.message);}
      });
      server.listen(8796,'127.0.0.1',()=>console.log('LOCAL AUDIT UI: http://127.0.0.1:8796/ledger/ (token: offline-audit-only)'));
      await new Promise(()=>{});
    }
    console.log('PASS: workerd + D1 migrations + API + frozen CPA pack + receipt preview + PDF + archive manifest');
  } finally { await mf.dispose(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
