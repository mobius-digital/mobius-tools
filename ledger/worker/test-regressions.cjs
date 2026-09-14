const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
if (!process.argv.includes('--baseline')) {
  for (const f of fs.readdirSync(path.join(__dirname, 'migrations')).sort())
    db.exec(fs.readFileSync(path.join(__dirname, 'migrations', f), 'utf8'));
}
const DB = { prepare(sql) {
  let args = [];
  const stmt = () => db.prepare(sql.replace(/\?(\d+)/g, (_, n) => ':p' + n));
  const values = () => Object.fromEntries(args.map((v,i) => ['p'+(i+1), v]));
  return { bind(...a) { args=a; return this; }, async first() { return stmt().get(values()) || null; },
    async all() { return { results: stmt().all(values()) }; }, async run() { const r=stmt().run(values()); return { meta: { changes:r.changes,last_row_id:Number(r.lastInsertRowid) } }; } };
}, async batch(stmts) { db.exec('BEGIN'); try { const r=[]; for(const s of stmts) r.push(await s.run()); db.exec('COMMIT'); return r; } catch(e) { db.exec('ROLLBACK'); throw e; } } };
const source=fs.readFileSync(path.join(__dirname,'src/worker.js'),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'').replace('export default {','const worker = {');
const context=vm.createContext({ console, crypto:require('node:crypto').webcrypto, Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Buffer,atob,btoa,Blob,FormData,fetch:async()=>{throw Error('Offline tests prohibit network');} });
vm.runInContext(source+'\nglobalThis.api={worker,computeReport,periodReport,validSession,bankRefresh,syncStripe,comparePlaid,applyBankJob,saveJob,withLedgerLease,processSlackReceipts,importPlaidRange,receiptMatch};',context);
const env={DB,ADMIN_TOKEN:'local-test-only',OWNER_EMAIL:'owner@mobius.test',AUTH:{fetch:async()=>Response.json({email:'intruder@example.test'})}};
async function main(){
  db.exec("INSERT INTO transactions(date,month,type,vendor,amount,tax_cat) VALUES('2026-08-01','2026-08','out','Meal',100,'Meals')");
  const snap=await context.api.computeReport(env,'2026-08'); snap.expenses=42;
  db.prepare("INSERT INTO months VALUES('2026-08','closed','2026-09-01',?)").run(JSON.stringify(snap));
  const checks=[];
  const check=async(name,fn)=>{try{await fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});}};
  await check('AUTH rejects nonmember',async()=>assert.equal(await context.api.validSession(env,'mds.test'),false));
  await check('PDF uses frozen report',async()=>assert.equal((await context.api.periodReport(env,'month','2026-08')).r.expenses,42));
  await check('closed category edit rejected',async()=>{
    const r=await context.api.worker.fetch(new Request('https://local/api/transaction',{method:'PUT',headers:{Authorization:'Bearer local-test-only','Content-Type':'application/json'},body:JSON.stringify({id:1,tax_cat:'Personal'})}),env,{waitUntil(){}});
    assert.ok(r.status>=400); assert.equal(db.prepare('SELECT tax_cat FROM transactions WHERE id=1').get().tax_cat,'Meals');
  });
  await check('CPA excludes income tax',()=>{const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');const expr=html.match(/const packExp = ([^;]+);/)[1];assert.equal(vm.runInNewContext('('+expr+')')({type:'out',tax_cat:'Income tax',amount:5000}),false);});
  if (!process.argv.includes('--baseline')) {
    await check('database rejects closed financial updates from any writer',()=>assert.throws(()=>db.exec("UPDATE transactions SET amount=120 WHERE id=1"),/closed/));
    await check('database permits closed receipt metadata',()=>db.exec("UPDATE transactions SET receipt_name='receipt.pdf' WHERE id=1"));
    await check('database rejects insert into closed period',()=>assert.throws(()=>db.exec("INSERT INTO transactions(date,month,type,vendor,amount) VALUES('2026-08-02','2026-08','out','x',1)"),/closed/));
    await check('paid refresh defaults off',async()=>assert.match((await context.api.bankRefresh(env)).why,/disabled/));
  }

  if (!process.argv.includes('--baseline')) {
    const request=async(path,method='GET',body)=>context.api.worker.fetch(new Request('https://local'+path,{method,headers:{Authorization:'Bearer local-test-only','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});
    await check('frontend script parses',()=>{const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);});
    await check('CSV quoted commas, escaped quotes and signed refunds',()=>{
      const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');const code=html.slice(html.indexOf('function csvRecords'),html.indexOf('async function runImport'));
      const ctx=vm.createContext({});vm.runInContext(code,ctx);
      const rows=ctx.parseCsv('date,description,amount\n2026-09-01,"Merchant, Inc",-50\n2026-09-02,"A ""quoted"" name",12');
      assert.equal(rows[0].amount,-50);assert.equal(rows[0].vendor,'Merchant, Inc');assert.equal(rows[1].vendor,'A "quoted" name');
      assert.throws(()=>ctx.parseCsv('date,description,amount\n2026-09-01,x,oops'),/row 2/);
    });
    await check('CSV replay does not duplicate money',async()=>{
      const body={rows:[{date:'2026-09-02',vendor:'Imported',amount:-50,type:'out',source:'import',import_id:'a'.repeat(64)+':2'}]};
      assert.equal((await request('/api/transactions','POST',body)).status,200);
      assert.equal((await request('/api/transactions','POST',body)).status,200);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE vendor='Imported'").get().n,1);
    });
    await check('report and PDF share frozen totals',async()=>{
      const r=await (await request('/api/report?month=2026-08')).json();assert.equal(r.report.expenses,(await context.api.periodReport(env,'month','2026-08')).r.expenses);
    });
    await check('close snapshots and rejects later writes',async()=>{
      const r=await request('/api/close','POST',{month:'2026-10',force:true});assert.equal(r.status,200,await r.text());
      assert.throws(()=>db.exec("INSERT INTO transactions(date,month,type,vendor,amount) VALUES('2026-10-01','2026-10','out','blocked',12)"),/closed/);
    });
    await check('lease exclusion and stale writer fencing',async()=>{
      await context.api.withLedgerLease(env,'test',async leased=>{
        const other=await context.api.withLedgerLease(env,'test',async()=>{throw Error('entered twice');});assert.match(other.skipped,/another/);
        db.exec("UPDATE ledger_leases SET owner='replacement' WHERE name='test'");
        await assert.rejects(()=>leased.DB.prepare("INSERT INTO settings VALUES('forbidden','1')").run(),/CHECK/);
      });
      assert.equal(db.prepare("SELECT value FROM settings WHERE key='forbidden'").get(),undefined);
    });
    const charge={id:'ch_test',paid:true,status:'succeeded',created:Date.parse('2026-09-10T12:00:00Z')/1000,amount:10000,customer:{id:'cus_test',name:'Test client'},balance_transaction:null};
    context.fetch=async url=>{
      const u=new URL(url);if(u.hostname!=='api.stripe.com')throw Error('Unexpected mocked URL '+url);
      return Response.json(u.pathname.includes('/refunds')?{data:[],has_more:false}:u.pathname.endsWith('/ch_test')?charge:{data:[charge],has_more:false});
    };
    env.STRIPE_KEY='offline-key';db.exec("INSERT INTO clients(name,retainer) VALUES('Test client',100)");
    await check('late Stripe fees repair and zero corrections persist',async()=>{
      await context.api.syncStripe(env,'2026-09-01','2026-09-30');
      charge.balance_transaction={fee:300};await context.api.syncStripe(env,'2026-09-01','2026-09-30');
      assert.equal(db.prepare("SELECT amount FROM transactions WHERE stripe_id='stripefees:2026-09'").get().amount,3);
      charge.balance_transaction={fee:0};await context.api.syncStripe(env,'2026-09-01','2026-09-30');
      assert.equal(db.prepare("SELECT amount FROM transactions WHERE stripe_id='stripefees:2026-09'").get().amount,0);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE stripe_id='ch_test'").get().n,1);
    });
    await check('confirmed expected row becomes duplicate review, not doubled revenue',async()=>{
      charge.id='ch_confirmed';charge.customer={id:'cus_confirmed',name:'Confirmed'};
      db.exec("INSERT INTO clients(name) VALUES('Confirmed'); INSERT INTO transactions(date,month,type,vendor,amount,expected,source) VALUES('2026-09-10','2026-09','in','Confirmed',100,0,'recurring')");
      await context.api.syncStripe(env,'2026-09-01','2026-09-30');
      assert.equal(db.prepare("SELECT SUM(amount) AS n FROM transactions WHERE vendor='Confirmed'").get().n,100);
      assert.ok(db.prepare("SELECT id FROM ledger_jobs WHERE id='stripe-duplicate:ch_confirmed' AND status='pending'").get());
    });
    await check('closed bank correction persists and replays on reopen',async()=>{
      db.exec("INSERT INTO transactions(date,month,type,vendor,amount,plaid_id) VALUES('2026-09-01','2026-09','out','Bank',100,'bank-test')");
      const row=db.prepare("SELECT id FROM transactions WHERE plaid_id='bank-test'").get();
      const payload={event:'modified',item:{},t:{transaction_id:'bank-test',date:'2026-08-20',amount:120,account_id:'acct',iso_currency_code:'USD'}};
      assert.equal(await context.api.applyBankJob(env,'bank-job',payload),false);
      assert.equal(db.prepare('SELECT amount FROM transactions WHERE id=?').get(row.id).amount,100);
      db.exec("UPDATE months SET status='open' WHERE month='2026-08'");
      assert.equal(await context.api.applyBankJob(env,'bank-job',payload),true);
      assert.equal(db.prepare('SELECT amount FROM transactions WHERE id=?').get(row.id).amount,120);
    });
    await check('bank comparison rejects changed amounts and unrelated same amounts',async()=>{
      env.PLAID_CLIENT_ID='offline';env.PLAID_SECRET='offline';
      db.prepare("INSERT OR REPLACE INTO settings VALUES('plaidItems',?)").run(JSON.stringify([{access_token:'fake',accounts:{acct:{name:'Mobius test'}}}]));
      context.fetch=async()=>Response.json({total_transactions:2,transactions:[{transaction_id:'bank-test',account_id:'acct',date:'2026-08-20',amount:125,iso_currency_code:'USD'},{transaction_id:'missing',account_id:'acct',date:'2026-09-10',amount:100,iso_currency_code:'USD'}]});
      const r=await context.api.comparePlaid(env,'2026-08-01','2026-10-01');assert.equal(r.onBankNotInBooks,2);
    });
    await check('receipt preview cannot serve active HTML',async()=>{
      const row=db.prepare("SELECT id FROM transactions WHERE vendor='Imported'").get();
      db.prepare("UPDATE transactions SET receipt_key='test-html',receipt_type='text/html',receipt_name='receipt.html' WHERE id=?").run(row.id);
      env.RECEIPTS={get:async()=>new TextEncoder().encode('<script>alert(1)</script>').buffer};
      const r=await request('/api/receipt?id='+row.id);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^text\/plain/);assert.match(r.headers.get('content-security-policy'),/sandbox/);
    });
  }

  if (!process.argv.includes('--baseline')) {
    let pages=0;
    env.SLACK_BOT_TOKEN='offline';env.SLACK_SIGNING_SECRET='offline-signature';
    db.prepare("INSERT OR REPLACE INTO settings VALUES('slackReceipts',?)").run(JSON.stringify({channelId:'C_TEST',selfUserId:'BOT'}));
    context.slackMock=async(_env,method,params)=>{
      if(method==='auth.test')return {ok:true,user_id:'BOT',team_id:'T_TEST'};
      if(method==='users.lookupByEmail')return {ok:true,user:{id:'OWNER'}};
      if(method==='conversations.history') {pages++;return {ok:true,messages:[{ts:params.cursor?'1':'2',user:'OWNER',files:[{id:params.cursor?'older':'newer',mimetype:'application/pdf',url_private:'https://offline.invalid/file'}]}],response_metadata:{next_cursor:params.cursor?'':'page2'}};}
      return {ok:true};
    };
    vm.runInContext('slack = slackMock',context);
    context.fetch=async()=>{throw Error('injected download failure');};
    await check('Slack drains pagination and retains failed file jobs',async()=>{
      await context.api.processSlackReceipts(env);assert.equal(pages,2);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger_jobs WHERE kind='slack-file' AND status='pending' AND error IS NOT NULL").get().n,2);
      const cfg=JSON.parse(db.prepare("SELECT value FROM settings WHERE key='slackReceipts'").get().value);assert.deepEqual(cfg.seen,[]);
    });
    const blobs=new Map([['pend:123:file',new TextEncoder().encode('test receipt').buffer]]);
    env.RECEIPTS={get:async k=>blobs.get(k)||null,put:async(k,v)=>blobs.set(k,v),delete:async k=>blobs.delete(k)};
    db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('pend:123:file',JSON.stringify({name:'receipt.pdf',type:'application/pdf',month:'2026-09',date:'2026-09-12',vendor:'New receipt',amount:47,note:null}));
    const signedAction=async(user)=>{
      const payload={type:'block_actions',team:{id:'T_TEST'},user:{id:user},actions:[{action_id:'led_file',value:JSON.stringify({file:'pend:123:file'})}]};
      const raw=new URLSearchParams({payload:JSON.stringify(payload)}).toString(),ts=String(Math.floor(Date.now()/1000));
      const sig='v0='+require('node:crypto').createHmac('sha256',env.SLACK_SIGNING_SECRET).update('v0:'+ts+':'+raw).digest('hex');
      const pending=[];const r=await context.api.worker.fetch(new Request('https://local/api/slack-interact',{method:'POST',body:raw,headers:{'x-slack-request-timestamp':ts,'x-slack-signature':sig}}),env,{waitUntil:p=>pending.push(p)});
      for(let i=0;i<pending.length;i++)await pending[i];return r;
    };
    await check('signed Slack non-owner cannot file money',async()=>{
      await signedAction('INTRUDER');assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE vendor='New receipt'").get().n,0);
    });
    await check('Slack file action loads metadata and replay is idempotent',async()=>{
      await signedAction('OWNER');await signedAction('OWNER');
      const rows=db.prepare("SELECT * FROM transactions WHERE vendor='New receipt'").all();assert.equal(rows.length,1);assert.ok(rows[0].receipt_key);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger_jobs WHERE kind='slack-action' AND error IS NOT NULL").get().n,0);
    });
    await check('vendor handler contains data, not executable user strings',()=>{
      const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');const snippet=html.slice(html.indexOf('function catCell(v)'),html.indexOf('function filterVendors'));
      const ctx=vm.createContext({S:{boot:{taxCats:['Meals']}},esc:s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';')});vm.runInContext(snippet,ctx);
      const output=ctx.catCell({name:"O'Reilly\" onfocus=bad()",tax_cat:'Meals',bucket:'Other'}).tax;
      assert.ok(output.includes('data-name='));assert.ok(!output.includes('onchange='));assert.ok(output.includes('&#39;'));
    });
  }
  if(!process.argv.includes('--baseline')) {
    await check('shared matcher rejects unrelated vendors and ambiguous payments',()=>{
      const rows=[{id:1,type:'out',vendor:'OpenAI',amount:90,date:'2026-09-01'}];
      assert.equal(context.api.receiptMatch(rows,'Anthropic',90,'2026-09-01'),null);
      assert.equal(context.api.receiptMatch([...rows,{...rows[0],id:2}],'OpenAI',90,'2026-09-01'),null);
      assert.equal(context.api.receiptMatch(rows,'OpenAI',75,'2026-09-01',true).id,1);
    });
    await check('fenced batches support atomic multi-statement writes',async()=>{
      await context.api.withLedgerLease(env,'batch-test',async leased=>{
        await leased.DB.batch([leased.DB.prepare("INSERT INTO settings VALUES('batch-a','1')"),leased.DB.prepare("INSERT INTO settings VALUES('batch-b','2')")]);
      });assert.equal(db.prepare("SELECT value FROM settings WHERE key='batch-b'").get().value,'2');
    });
  }
  console.log(JSON.stringify(checks,null,2));
  if(!process.argv.includes('--baseline')&&checks.some(x=>!x.pass))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
