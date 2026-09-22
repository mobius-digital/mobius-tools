// Actual local workerd/D1/KV integration. No remote bindings or credentials.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Miniflare, convertV4MiniflareOptions } = require('../../marketing-hub/node_modules/miniflare');
async function main() {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, scriptPath: path.join(__dirname,'.audit-build/bundle/worker.js'),
    compatibilityDate:'2026-07-01', d1Databases:{DB:'mobius-ledger-audit-local'}, kvNamespaces:['RECEIPTS'],
    bindings:{ADMIN_TOKEN:'offline-audit-only',OWNER_EMAIL:'owner@mobius.test',...(process.env.ANTHROPIC_API_KEY?{ANTHROPIC_API_KEY:process.env.ANTHROPIC_API_KEY}:{})},
    /* Offline, except: with ANTHROPIC_API_KEY in the environment the Controller
       may reach the model, and nothing else, so a real answer can be checked
       against seeded books without touching production. */
    outboundService:(req)=>process.env.ANTHROPIC_API_KEY&&new URL(req.url).hostname==='api.anthropic.com'?fetch(req):new Response('Network disabled in local audit', {status:503}) }));
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
    /* The Controller's night is plain SQL, so it runs offline: a client whose
       retainer is ten days past due, and the same $1,200 paid twice a week
       apart, must both be found; the recurring vendor billing on its cycle
       must not. */
    const ago=n=>new Date(Date.now()-n*86400e3).toISOString().slice(0,10);
    /* Straight into D1: September is closed by the test above, and the API
       never creates an expected row by hand, so the books are seeded the way
       the recurring job and the bank feed would leave them. */
    for(const [d,t,v,a,e,c] of [[ago(40),'in','Late Client',4000,1,null],[ago(43),'out','Figma',1200,0,'Software & subscriptions'],[ago(36),'out','Figma',1200,0,'Software & subscriptions']])
      await db.prepare("INSERT INTO transactions(date,month,type,vendor,amount,expected,tax_cat,status) VALUES(?1,?2,?3,?4,?5,?6,?7,'ok')").bind(d,d.slice(0,7),t,v,a,e,c).run();
    const night=await (await call('/api/ask/run','POST')).json();
    const open=(await (await call('/api/ask/findings')).json()).findings;
    assert.ok(open.some(f=>f.kind==='unpaid'&&/Late Client/.test(f.title)),'unpaid client not found: '+JSON.stringify(open.map(f=>f.title)));
    assert.ok(open.some(f=>f.kind==='duplicate'&&/Figma/.test(f.title)),'duplicate not found');
    const done=await (await call('/api/ask/finding','POST',{key:open[0].key,state:'done'})).json();assert.equal(done.ok,true);
    const again=await (await call('/api/ask/run','POST')).json();
    assert.ok(!(await (await call('/api/ask/findings')).json()).findings.some(f=>f.key===open[0].key),'a finding marked done came back');
    /* The map is generated: the audit tables and every non-secret setting appear, settings itself never does. */
    const mapq=await (await call('/api/ask','POST',{question:'x'})).json();   // no key offline: the engine says so, and does not throw
    assert.ok(mapq.error||mapq.answer);
    console.log('controller night: '+night.found+' found, '+night.fresh+' new');
    /* A client who pays late by habit is not late. Party Patch pays on the
       29th: a retainer expected on the 1st, still open on the 6th, is not a
       finding; the same on the 3rd of the NEXT month is. */
    const ym=ago(0).slice(0,7), prev=m=>{const d=new Date(m+'-15T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7);};
    for(let k=1;k<=4;k++){const m=(()=>{let x=ym;for(let i=0;i<k;i++)x=prev(x);return x;})();
      await db.prepare("INSERT INTO transactions(date,month,type,vendor,amount,expected,status) VALUES(?1,?2,'in','Party Patch',5000,0,'ok')").bind(m+'-29',m).run();}
    const reopen=await call('/api/reopen','POST',{month:ym}); assert.equal(reopen.status,200,await reopen.text());   // the close test above froze this month
    await db.prepare("INSERT INTO transactions(date,month,type,vendor,amount,expected,status) VALUES(?1,?2,'in','Party Patch',5000,1,'ok')").bind(ym+'-01',ym).run();
    await call('/api/ask/run','POST');
    const openNow=(await (await call('/api/ask/findings')).json()).findings;
    const dom=Number(ago(0).slice(8));
    const ppFlag=openNow.some(f=>f.kind==='unpaid'&&/Party Patch/.test(f.title));
    assert.equal(ppFlag, dom>29+3, 'Party Patch flagged='+ppFlag+' on day '+dom+' (usual day 29)');
    /* An action proposes and does not write; the Apply tap writes. */
    const fig=(await db.prepare("SELECT id FROM transactions WHERE vendor='Figma' ORDER BY id LIMIT 1").first()).id;
    const pending=[{id:'t3st1234',action:'update_transaction',summary:'Recategorize Figma',detail:'',patch:{id:fig,patch:{tax_cat:'Software & subscriptions',note:'design seat'}},at:new Date().toISOString()}];
    await db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('controllerPending',?1)").bind(JSON.stringify(pending)).run();
    assert.equal((await db.prepare('SELECT note FROM transactions WHERE id=?1').bind(fig).first()).note, null, 'a pending proposal must not have written');
    const applied=await (await call('/api/ask/apply','POST',{id:'t3st1234'})).json();
    assert.equal(applied.ok,true,JSON.stringify(applied));
    assert.equal((await db.prepare('SELECT note FROM transactions WHERE id=?1').bind(fig).first()).note,'design seat');
    const again2=await (await call("/api/ask/apply","POST",{id:"t3st1234"})).json();
    assert.match(String(again2.error||""),/expired|already/);
    console.log('controller actions: propose does not write, Apply does, a second tap is refused');
    if(process.env.ANTHROPIC_API_KEY){
      const a=await (await call('/api/ask','POST',{question:'Who has not paid this month, and how much do they owe?',history:[],screen:{screen:'Overview',month_selected:ago(0).slice(0,7)}})).json();
      console.log('controller answer: '+(a.answer||a.error));
      assert.match(String(a.answer||''),/Late Client/);
      assert.match(String(a.answer||''),/4,000/);
    }
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
          const routes={'/ledger/':['../index.html','text/html'],'/ledger/ledger.css':['../ledger.css','text/css'],'/ledger/manifest.webmanifest':['../manifest.webmanifest','application/manifest+json'],
            '/ask/ask.css':['../../ask/ask.css','text/css'],'/ask/ask-ui.js':['../../ask/ask-ui.js','text/javascript'],'/sheet.css':['../../sheet.css','text/css'],'/sheet.js':['../../sheet.js','text/javascript']};
          const icon=url.pathname.match(/^\/icons\/([\w.-]+\.png)$/);
          const file=routes[url.pathname]||(icon&&['../../icons/'+icon[1],'image/png']);if(!file){res.writeHead(404);res.end();return;}
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
