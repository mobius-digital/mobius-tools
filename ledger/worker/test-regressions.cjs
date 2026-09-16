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
vm.runInContext(source+'\nglobalThis.api={worker,computeReport,periodReport,validSession,bankRefresh,syncStripe,comparePlaid,applyBankJob,saveJob,withLedgerLease,processSlackReceipts,importPlaidRange,receiptMatch,heldReceiptMatch,retryHeldReceipts,selfCheck,tidyHourglasses};',context);
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
      const r=await context.api.comparePlaid(env,'2026-08-01','2026-10-01');assert.equal(r.onBankNotInBooks,1);assert.equal(r.discrepancyCount,1);assert.match(r.discrepancies[0].reason,/Amount differs/);
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
    await check('held matcher: card spelling differs but amount exact attaches',()=>{
      const rows=[{id:1,type:'out',vendor:'SPO*OAXACAMARGARITABEDWARDSVILLE',amount:50.30,date:'2026-09-14'}];
      const d=context.api.heldReceiptMatch(rows,'Oaxaca Margarita Bar & Mexican Restaurant',50.30,'2026-09-12');
      assert.equal(d.row.id,1);assert.equal(d.confirm,false);
    });
    await check('held matcher: card spelling AND amount differ asks first',()=>{
      const rows=[{id:1,type:'out',vendor:'SPO*OAXACAMARGARITABEDWARDSVILLE',amount:60.36,date:'2026-09-14'}];
      const d=context.api.heldReceiptMatch(rows,'Oaxaca Margarita Bar',50.30,'2026-09-12');
      assert.equal(d.row.id,1);assert.equal(d.confirm,true);
    });
    await check('held matcher: same name with a tip still attaches',()=>{
      const d=context.api.heldReceiptMatch([{id:3,type:'out',vendor:'Oaxaca',amount:60,date:'2026-09-13'}],'Oaxaca',50,'2026-09-12');
      assert.equal(d.row.id,3);assert.equal(d.confirm,false);
    });
    await check('held matcher: two plausible charges is never a guess',()=>{
      const rows=[{id:1,type:'out',vendor:'SPO*OAXACA EDWARDSVILLE',amount:50.30,date:'2026-09-13'},{id:2,type:'out',vendor:'TST*OAXACA GRILL',amount:50.30,date:'2026-09-14'}];
      assert.equal(context.api.heldReceiptMatch(rows,'Oaxaca',50.30,'2026-09-12'),null);
      assert.equal(context.api.heldReceiptMatch([{id:4,type:'out',vendor:'Anthropic',amount:90,date:'2026-09-12'},{id:5,type:'out',vendor:'Anthropic',amount:95,date:'2026-09-12'}],'Anthropic',88,'2026-09-12'),null);
    });
    await check('held matcher: unrelated vendor and fuzzy name past a week are refused',()=>{
      assert.equal(context.api.heldReceiptMatch([{id:1,type:'out',vendor:'OpenAI',amount:90,date:'2026-09-12'}],'Anthropic',90,'2026-09-12'),null);
      assert.equal(context.api.heldReceiptMatch([{id:1,type:'out',vendor:'SPO*OAXACAEDWARDSVILLE',amount:50.30,date:'2026-09-22'}],'Oaxaca',50.30,'2026-09-12'),null);
    });
    await check('held sweep finds the right charge past many same-amount decoys, and never overwrites a receipt',async()=>{
      db.exec("DELETE FROM settings WHERE key LIKE 'pend:%'; UPDATE months SET status='open'");
      for(let i=0;i<6;i++) db.prepare("INSERT INTO transactions(date,month,type,vendor,amount,source) VALUES('2026-09-20','2026-09','out',?,40,'plaid')").run('Decoy '+i);
      const target=Number(db.prepare("INSERT INTO transactions(date,month,type,vendor,amount,source) VALUES('2026-09-21','2026-09','out','SQ *HEARTLAND BREWING',40,'plaid')").run().lastInsertRowid);
      await env.RECEIPTS.put('pend:1:held',new TextEncoder().encode('held receipt').buffer);
      db.prepare('INSERT INTO settings VALUES(?,?)').run('pend:1:held',JSON.stringify({name:'r.jpg',type:'image/jpeg',date:'2026-09-20',vendor:'Heartland Brewing Co',amount:40}));
      // something else attaches first: the sweep must leave it alone and keep holding
      db.prepare("UPDATE transactions SET receipt_key='other' WHERE id=?").run(target);
      await context.api.retryHeldReceipts(env);
      assert.equal(db.prepare('SELECT receipt_key FROM transactions WHERE id=?').get(target).receipt_key,'other');
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key='pend:1:held'").get().n,1);
      db.prepare("UPDATE transactions SET receipt_key=NULL WHERE id=?").run(target);
      const out=await context.api.retryHeldReceipts(env);
      assert.equal(out.attached,1);
      assert.match(db.prepare('SELECT receipt_key FROM transactions WHERE id=?').get(target).receipt_key,/^rcpt:/);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE vendor LIKE 'Decoy%' AND receipt_key IS NOT NULL").get().n,0);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key='pend:1:held'").get().n,0);
    });
    await check('conditional attach loses the race cleanly',async()=>{
      const target=Number(db.prepare("INSERT INTO transactions(date,month,type,vendor,amount,source) VALUES('2026-09-21','2026-09','out','Race Vendor',33,'plaid')").run().lastInsertRowid);
      await env.RECEIPTS.put('pend:3:race',new TextEncoder().encode('race receipt').buffer);
      db.prepare('INSERT INTO settings VALUES(?,?)').run('pend:3:race',JSON.stringify({name:'x.jpg',type:'image/jpeg',date:'2026-09-21',vendor:'Race Vendor',amount:33}));
      // the row is read as empty, then filled by another writer before the sweep's write lands
      const realGet=env.RECEIPTS.get;
      env.RECEIPTS.get=async k=>{if(k==='pend:3:race')db.prepare("UPDATE transactions SET receipt_key='winner' WHERE id=?").run(target);return realGet(k);};
      const out=await context.api.retryHeldReceipts(env);
      env.RECEIPTS.get=realGet;
      assert.equal(out.attached,0);
      assert.equal(db.prepare('SELECT receipt_key FROM transactions WHERE id=?').get(target).receipt_key,'winner');
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key='pend:3:race'").get().n,1);
      assert.ok(await env.RECEIPTS.get('pend:3:race'));
      db.exec("DELETE FROM settings WHERE key='pend:3:race'");
    });
    await check('held sweep asks once, yes or discard, when name and amount both differ',async()=>{
      const tipKey='pend:'+Date.now()+':tip';
      const posts=[];const prev=context.slackMock;
      context.slackMock=async(e,method,params)=>{if(method==='chat.postMessage')posts.push(params);return prev(e,method,params);};
      vm.runInContext('slack = slackMock',context);
      const target=Number(db.prepare("INSERT INTO transactions(date,month,type,vendor,amount,source) VALUES('2026-09-23','2026-09','out','SPO*OAXACAMARGARITABEDWARDSVILLE',60.36,'plaid')").run().lastInsertRowid);
      await env.RECEIPTS.put(tipKey,new TextEncoder().encode('tip receipt').buffer);
      db.prepare('INSERT INTO settings VALUES(?,?)').run(tipKey,JSON.stringify({name:'t.jpg',type:'image/jpeg',date:'2026-09-22',vendor:'Oaxaca Margarita Bar',amount:50.30,ch:'C_TEST'}));
      await context.api.retryHeldReceipts(env);await context.api.retryHeldReceipts(env);
      context.slackMock=prev;vm.runInContext('slack = slackMock',context);
      const asks=posts.filter(p=>/Is this the one/.test(p.text));
      assert.equal(asks.length,1);
      const btn=asks[0].blocks[1].elements;assert.equal(btn.length,2);assert.equal(btn[1].action_id,'led_drop');assert.equal(btn[0].action_id,'led_attach');
      assert.deepEqual(JSON.parse(btn[0].value),{file:tipKey,to:target});
      assert.equal(db.prepare('SELECT receipt_key FROM transactions WHERE id=?').get(target).receipt_key,null);
      db.exec("DELETE FROM settings WHERE key='"+tipKey+"'");
    });
    await check('nightly check separates missing, disagreeing and unrecorded charges, and records only verified ones',async()=>{
      db.exec("DELETE FROM transactions WHERE plaid_id IS NOT NULL AND month='2026-07'");
      db.exec("INSERT INTO transactions(date,month,type,vendor,amount,plaid_id,source) VALUES('2026-07-05','2026-07','out','Legacy ok',25,'legacy-ok','plaid'),('2026-07-06','2026-07','out','Legacy wrong',30,'legacy-bad','plaid'),('2026-07-07','2026-07','in','Client deposit',100,'legacy-in','plaid')");
      db.exec("INSERT INTO months(month,status) VALUES('2026-07','closed') ON CONFLICT(month) DO UPDATE SET status='closed'");
      db.prepare("INSERT OR REPLACE INTO settings VALUES('plaidItems',?)").run(JSON.stringify([{item_id:'item1',access_token:'fake',accounts:{acct:{name:'Novo'}}}]));
      const lines=[
        {transaction_id:'legacy-ok',account_id:'acct',date:'2026-07-05',amount:25,iso_currency_code:'USD',name:'Legacy ok'},
        {transaction_id:'legacy-bad',account_id:'acct',date:'2026-07-06',amount:35,iso_currency_code:'USD',name:'Legacy wrong'},
        {transaction_id:'legacy-in',account_id:'acct',date:'2026-07-07',amount:-100,iso_currency_code:'USD',name:'Client deposit'},
        {transaction_id:'not-booked',account_id:'acct',date:'2026-07-08',amount:12,iso_currency_code:'USD',name:'Never booked'}];
      context.fetch=async()=>Response.json({total_transactions:lines.length,transactions:lines});
      const chk=await context.api.selfCheck(env,'2026-07-01','2026-08-01');
      const what=chk.problems.map(p=>p.what).join(' | ');
      assert.match(what,/1 charge is on the bank and not in the books/);
      assert.match(what,/1 booked charge disagrees with the bank/);
      assert.doesNotMatch(what,/no bank record/);
      const prov=db.prepare("SELECT plaid_id,origin FROM bank_provenance WHERE plaid_id LIKE 'legacy%' ORDER BY plaid_id").all().map(r=>r.plaid_id+':'+r.origin);
      assert.deepEqual(prov,['legacy-in:repair','legacy-ok:repair']);
      // the closed rows themselves are untouched, and the record cannot be rewritten
      assert.equal(db.prepare("SELECT bank_item_id FROM transactions WHERE plaid_id='legacy-ok'").get().bank_item_id,null);
      assert.throws(()=>db.exec("UPDATE bank_provenance SET amount=1 WHERE plaid_id='legacy-ok'"),/append-only/);
      assert.throws(()=>db.exec("DELETE FROM bank_provenance WHERE plaid_id='legacy-ok'"),/append-only/);
      const again=await context.api.selfCheck(env,'2026-07-01','2026-08-01');
      assert.equal(again.problems.filter(p=>/bank/.test(p.what)).length,2);
      assert.equal(db.prepare("SELECT amount FROM transactions WHERE plaid_id='legacy-bad'").get().amount,30);
    });
    await check('DataDive receipt from its parent company attaches',()=>{
      const d=context.api.heldReceiptMatch([{id:826,type:'out',vendor:'Datadive.tools',amount:39,date:'2026-09-14'}],'Seller Systems Software LLC',39,'2026-09-14');
      assert.equal(d.row.id,826);assert.equal(d.confirm,false);
    });
    await check('attached receipt swaps its hourglass for a tick',async()=>{
      const calls=[];const prev=context.slackMock;
      context.slackMock=async(e,method,params)=>{calls.push([method,params]);return prev(e,method,params);};
      vm.runInContext('slack = slackMock',context);
      db.prepare("INSERT INTO transactions(date,month,type,vendor,amount,source) VALUES('2026-09-24','2026-09','out','Tick Vendor',21,'plaid')").run();
      await env.RECEIPTS.put('pend:4:tick',new TextEncoder().encode('tick receipt').buffer);
      db.prepare('INSERT INTO settings VALUES(?,?)').run('pend:4:tick',JSON.stringify({name:'k.jpg',type:'image/jpeg',date:'2026-09-24',vendor:'Tick Vendor',amount:21,ch:'C_TEST',ts:'111.222'}));
      await context.api.retryHeldReceipts(env);
      context.slackMock=prev;vm.runInContext('slack = slackMock',context);
      const r=calls.filter(([m,p])=>m.startsWith('reactions.')&&p.timestamp==='111.222').map(([m,p])=>m+':'+p.name);
      assert.ok(r.includes('reactions.remove:hourglass_flowing_sand'));assert.ok(r.includes('reactions.add:white_check_mark'));
    });
    await check('hourglass tidy clears finished receipts and leaves waiting ones',async()=>{
      const calls=[];const prev=context.slackMock;
      db.prepare('INSERT INTO settings VALUES(?,?)').run('pend:5:wait',JSON.stringify({name:'w.jpg',type:'image/jpeg',date:'2026-09-24',vendor:'Still Waiting',amount:9,ch:'C_TEST',ts:'3.0'}));
      const hg=[{name:'hourglass_flowing_sand',users:['BOT'],count:1}];
      context.slackMock=async(e,method,params)=>{
        calls.push([method,params]);
        if(method==='conversations.history')return {ok:true,messages:[{ts:'1.0',reactions:hg},{ts:'2.0',reactions:hg},{ts:'3.0',reactions:hg},{ts:'4.0',reactions:[{name:'white_check_mark',users:['BOT']}]}]};
        if(method==='conversations.replies')return {ok:true,messages:params.ts==='1.0'?[{ts:'1.0'},{ts:'1.1',text:':white_check_mark: The X charge landed'}]:[{ts:'2.0'},{ts:'2.1',text:'✓ Discarded · that receipt will not be asked about again.'}]};
        return prev(e,method,params);
      };
      vm.runInContext('slack = slackMock',context);
      const out=await context.api.tidyHourglasses(env);
      context.slackMock=prev;vm.runInContext('slack = slackMock',context);
      assert.equal(out.cleared,2);
      const r=calls.filter(([m])=>m.startsWith('reactions.')).map(([m,p])=>p.timestamp+' '+m+':'+p.name);
      assert.ok(r.includes('1.0 reactions.add:white_check_mark'));
      assert.ok(r.includes('2.0 reactions.remove:hourglass_flowing_sand'));
      assert.ok(!r.includes('2.0 reactions.add:white_check_mark'));
      assert.ok(!r.some(x=>x.startsWith('3.0')));
      db.exec("DELETE FROM settings WHERE key='pend:5:wait'");
    });
    await check('unanswered held receipt: asked at 5 days, last call at 25, then quiet',async()=>{
      const posts=[];const prev=context.slackMock;
      context.slackMock=async(e,method,params)=>{if(method==='chat.postMessage')posts.push(params.text);return prev(e,method,params);};
      vm.runInContext('slack = slackMock',context);
      const key=d=>'pend:'+(Date.now()-d*86400e3)+':old';
      await env.RECEIPTS.put(key(6),new TextEncoder().encode('x').buffer);
      db.prepare('INSERT INTO settings VALUES(?,?)').run(key(6),JSON.stringify({name:'o.jpg',type:'image/jpeg',date:'2026-08-01',vendor:'Nowhere Inc',amount:77,ch:'C_TEST'}));
      await context.api.retryHeldReceipts(env);await context.api.retryHeldReceipts(env);
      assert.equal(posts.filter(t=>/waiting 6 days/.test(t)).length,1);
      const row=db.prepare("SELECT key,value FROM settings WHERE key LIKE 'pend:%:old'").get();
      db.prepare('DELETE FROM settings WHERE key=?').run(row.key);
      db.prepare('INSERT INTO settings VALUES(?,?)').run(key(26),row.value);
      await context.api.retryHeldReceipts(env);await context.api.retryHeldReceipts(env);
      context.slackMock=prev;vm.runInContext('slack = slackMock',context);
      assert.equal(posts.filter(t=>/Last call/.test(t)).length,1);
      assert.ok(posts.every(t=>t.startsWith('<@')));
      db.exec("DELETE FROM settings WHERE key LIKE 'pend:%:old'");
    });
    await check('notification settings: ping by default, quiet and channel respected, junk refused',async()=>{
      const request=async(path,method='GET',body)=>context.api.worker.fetch(new Request('https://local'+path,{method,headers:{Authorization:'Bearer local-test-only','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});
      db.exec("DELETE FROM settings WHERE key='notify'");
      const posts=[];const prev=context.slackMock;
      context.slackMock=async(e,method,params)=>{if(method==='chat.postMessage')posts.push(params);return prev(e,method,params);};
      vm.runInContext('slack = slackMock',context);
      const land=async(tag)=>{
        db.prepare("INSERT INTO transactions(date,month,type,vendor,amount,source) VALUES('2026-09-25','2026-09','out',?,17,'plaid')").run('Land '+tag);
        const k='pend:'+Date.now()+':'+tag;
        await env.RECEIPTS.put(k,new TextEncoder().encode('land '+tag).buffer);
        db.prepare('INSERT INTO settings VALUES(?,?)').run(k,JSON.stringify({name:'l.jpg',type:'image/jpeg',date:'2026-09-25',vendor:'Land '+tag,amount:17,ch:'C_TEST',ts:'9.'+tag}));
        await context.api.retryHeldReceipts(env);
        return posts.filter(p=>/charge landed/.test(p.text)&&p.thread_ts==='9.'+tag)[0];
      };
      const a=await land('a');assert.match(a.text,/^<@OWNER>/);assert.equal(a.reply_broadcast,undefined);
      let r=await request('/api/settings','PUT',{notify:{landed:'quiet',problems:'nonsense'}});
      assert.deepEqual((await r.json()).notify,{landed:'quiet',decisions:'ping',problems:'ping'});
      const b=await land('b');assert.doesNotMatch(b.text,/<@/);assert.equal(b.reply_broadcast,undefined);
      await request('/api/settings','PUT',{notify:{landed:'channel'}});
      const c=await land('c');assert.doesNotMatch(c.text,/<@/);assert.equal(c.reply_broadcast,true);
      assert.equal((await (await request('/api/boot')).json()).notify.landed,'channel');
      context.slackMock=prev;vm.runInContext('slack = slackMock',context);
      db.exec("DELETE FROM settings WHERE key='notify'");
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
