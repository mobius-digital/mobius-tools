# Ledger correctness audit — 45 assertions across 16 scenarios.
# Run against a LOCAL worker only (never production):
#   printf "ADMIN_TOKEN=localtest-9f2b\n" > .dev.vars
#   wrangler d1 execute mobius-ledger --local --file=schema.sql
#   wrangler dev --local --port 8987   (then: python test-audit.py; delete .dev.vars after)
import json, urllib.request, urllib.error

BASE = 'http://localhost:8987'; TOK = 'localtest-9f2b'
def api(path, method='GET', body=None):
    req = urllib.request.Request(BASE + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': 'Bearer ' + TOK, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            ct = r.headers.get('Content-Type', '')
            raw = r.read()
            return r.status, (json.loads(raw or b'{}') if 'json' in ct else {'_raw': len(raw), '_ct': ct})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

P, F = [], []
def ck(name, cond, info=''):
    (P if cond else F).append(name + ('' if cond else '  << ' + str(info)[:160]))

# ---------- T1: basic report math ----------
add = lambda rows: api('/api/transactions', 'POST', {'rows': rows})[1]
r1 = add([
  {'date':'2026-04-03','type':'in','vendor':'Client A','amount':3000},
  {'date':'2026-04-05','type':'out','vendor':'SoftCo','amount':100,'tax_cat':'Software & subscriptions'},
  {'date':'2026-04-06','type':'fee','vendor':'Stripe','amount':20},
  {'date':'2026-04-07','type':'transfer','vendor':'Amex autopay','amount':500},
  {'date':'2026-04-08','type':'out','vendor':'Golf shop','amount':50,'tax_cat':'Personal — review'},
])
ck('T1 five rows inserted', len(r1.get('inserted',[])) == 5, r1)
s, rep = api('/api/report?month=2026-04')
R = rep['report']
ck('T1 revenue 3000', R['revenue'] == 3000, R['revenue'])
ck('T1 expenses 100 (transfer+personal excluded)', R['expenses'] == 100, R['expenses'])
ck('T1 fees 20', R['fees'] == 20, R['fees'])
ck('T1 net 2880', R['net'] == 2880, R['net'])
ck('T1 transfers tracked 500', R['transfers'] == 500, R['transfers'])
ck('T1 personal tracked 50', R['personal'] == 50, R['personal'])
ck('T1 margin 96', R['margin'] == 96, R['margin'])
ck('T1 split sums to net', round(sum(R['split'].values()),2) == R['net'], R['split'])

# ---------- T2: unknown vendor goes to review, still counted ----------
add([{'date':'2026-04-09','type':'out','vendor':'Mystery Diner','amount':60}])
s, rep = api('/api/report?month=2026-04'); R = rep['report']
ck('T2 review row still counted in expenses', R['expenses'] == 160, R['expenses'])
s, summ = api('/api/summary?month=2026-04')
ck('T2 attention.review == 1', summ['attention']['review'] == 1, summ['attention'])

# ---------- T3: close blocked by review; categorize clears it ----------
s, c = api('/api/close', 'POST', {'month':'2026-04'})
ck('T3 close refused while review > 0', s == 400 and c.get('review') == 1, (s, c))
s, txns = api('/api/transactions?month=2026-04')
myst = [t for t in txns['transactions'] if t['vendor'] == 'Mystery Diner'][0]
s, u = api('/api/transaction', 'PUT', {'id': myst['id'], 'tax_cat': 'Meals (50%)'})
ck('T3 categorize sets ok + derived bucket', u['transaction']['status'] == 'ok' and u['transaction']['bucket'] == 'Meals & entertainment', u.get('transaction'))
s, boot = api('/api/boot')
ck('T3 vendor default learned', any(v['name'] == 'Mystery Diner' and v['tax_cat'] == 'Meals (50%)' for v in boot['vendors']), 'not learned')

# ---------- T4: recurring engine idempotent; paid client skipped ----------
api('/api/vendor', 'POST', {'name':'TestSub','tax_cat':'Software & subscriptions','recurring':True,'expected_amount':15})
api('/api/client', 'POST', {'name':'Client A','retainer':3000})
api('/api/client', 'POST', {'name':'Client B','retainer':2000})
s, rc1 = api('/api/recurring', 'POST', {'month':'2026-04'})
s, rc2 = api('/api/recurring', 'POST', {'month':'2026-04'})
ck('T4 first run creates 2 (TestSub + Client B; paid Client A skipped)', rc1.get('created') == 2, rc1)
ck('T4 second run creates 0', rc2.get('created') == 0, rc2)
s, txns = api('/api/transactions?month=2026-04')
exp_rows = [t for t in txns['transactions'] if t['expected'] == 1]
ck('T4 exactly 2 expected rows', len(exp_rows) == 2, [t['vendor'] for t in exp_rows])
ck('T4 expected rows NOT in report', api('/api/report?month=2026-04')[1]['report']['revenue'] == 3000, 'expected leaked into report')

# ---------- T5: close demands a decision on expected rows, then freezes ----------
s, c = api('/api/close', 'POST', {'month':'2026-04'})
ck('T5 close refused: expected unconfirmed', s == 400 and c.get('expected') == 2, (s, c))
s, c = api('/api/close', 'POST', {'month':'2026-04', 'dropExpected': True})
ck('T5 close succeeds with dropExpected', s == 200 and c.get('ok'), c)
ck('T5 frozen report expenses 160', c['report']['expenses'] == 160, c['report']['expenses'])
s, txns = api('/api/transactions?month=2026-04')
ck('T5 expected rows deleted on close', not any(t['expected'] == 1 for t in txns['transactions']), 'still there')

# ---------- T6: a closed month is frozen ----------
s, rep = api('/api/report?month=2026-04')
ck('T6 report serves frozen json', rep.get('frozen') is True, rep)
r6 = add([{'date':'2026-04-15','type':'out','vendor':'Sneaky','amount':99,'tax_cat':'Software & subscriptions'}])
ck('T6 insert into closed month refused', len(r6.get('inserted',[])) == 0, r6)
some = [t for t in txns['transactions'] if t['vendor'] == 'SoftCo'][0]
s, u = api('/api/transaction', 'PUT', {'id': some['id'], 'amount': 999})
ck('T6 amount edit on closed refused', s == 400, (s, u))
s, u = api('/api/transaction', 'PUT', {'id': some['id'], 'tax_cat': 'Product testing'})
ck('T6 category edit on closed allowed', s == 200, (s, u))
s, d = api('/api/transaction?id=%d' % some['id'], 'DELETE')
ck('T6 delete on closed refused', s == 400, (s, d))

# ---------- T7 (FIX): cannot move a row INTO a closed month ----------
r7 = add([{'date':'2026-05-02','type':'out','vendor':'Mover','amount':10,'tax_cat':'Software & subscriptions'}])
mover = r7['inserted'][0]['id']
s, u = api('/api/transaction', 'PUT', {'id': mover, 'date': '2026-04-20'})
ck('T7 date edit into closed month refused', s == 400 and 'closed' in str(u.get('error','')), (s, u))

# ---------- T8 (FIX): reopened month reports LIVE numbers ----------
api('/api/reopen', 'POST', {'month':'2026-04'})
s, rep = api('/api/report?month=2026-04')
ck('T8 reopened month is not frozen', rep.get('frozen') is False, rep.get('frozen'))
ck('T8 reopened report is live (expenses 160)', rep['report']['expenses'] == 160, rep['report'].get('expenses'))
add([{'date':'2026-04-16','type':'out','vendor':'LateBill','amount':40,'tax_cat':'Software & subscriptions'}])
s, rep = api('/api/report?month=2026-04')
ck('T8 live report moves with the edit (200)', rep['report']['expenses'] == 200, rep['report']['expenses'])
s, c = api('/api/close', 'POST', {'month':'2026-04'})
ck('T8 re-close freezes the new truth (200)', c['report']['expenses'] == 200, c.get('report'))

# ---------- T9: receipt attach / replace / delete; attach works on closed ----------
s, txns = api('/api/transactions?month=2026-04')
soft = [t for t in txns['transactions'] if t['vendor'] == 'SoftCo'][0]
s, a1 = api('/api/receipt', 'POST', {'id': soft['id'], 'name': 'r1.pdf', 'type': 'application/pdf', 'data': 'aGVsbG8gd29ybGQ='})
ck('T9 attach on closed month allowed', s == 200 and a1.get('ok'), (s, a1))
k1 = a1.get('key')
s, a2 = api('/api/receipt', 'POST', {'id': soft['id'], 'name': 'r2.pdf', 'type': 'application/pdf', 'data': 'c2Vjb25kIGZpbGU='})
ck('T9 replace returns a new key', a2.get('key') and a2['key'] != k1, (a1, a2))
s, g = api('/api/receipt?id=%d' % soft['id'])
ck('T9 receipt downloads', s == 200 and g.get('_raw') == 11, (s, g))
s, d = api('/api/receipt?id=%d' % soft['id'], 'DELETE')
s, g = api('/api/receipt?id=%d' % soft['id'])
ck('T9 deleted receipt 404s', s == 404, (s, g))

# ---------- T10: bulk skips closed months ----------
s, b = api('/api/transactions/bulk', 'POST', {'ids': [soft['id'], mover], 'tax_cat': 'Software & subscriptions'})
ck('T10 bulk: 1 updated, 1 closed-skipped', b.get('updated') == 1 and b.get('skippedClosed') == 1, b)

# ---------- T11 (FIX): home chart excludes personal ----------
s, summ = api('/api/summary?month=2026-04')
row4 = [y for y in summ['year'] if y['month'] == '2026-04'][0]
ck('T11 year expenses exclude personal (200 not 250)', round(row4['expenses'],2) == 200, row4)

# ---------- T12: statement PDF builds ----------
s, pdf = api('/api/statement.pdf?period=month&month=2026-04')
ck('T12 statement.pdf 200 + pdf bytes', s == 200 and pdf.get('_ct','').startswith('application/pdf') and pdf.get('_raw',0) > 2000, (s, pdf))

# ---------- T13: month boundary ----------
r13 = add([
  {'date':'2026-05-31','type':'out','vendor':'EdgeA','amount':1,'tax_cat':'Software & subscriptions'},
  {'date':'2026-06-01','type':'out','vendor':'EdgeB','amount':1,'tax_cat':'Software & subscriptions'}])
mA = [x for x in r13['inserted'] if x['vendor']=='EdgeA'][0]['month']
mB = [x for x in r13['inserted'] if x['vendor']=='EdgeB'][0]['month']
ck('T13 May 31 lands in 2026-05', mA == '2026-05', mA)
ck('T13 Jun 1 lands in 2026-06', mB == '2026-06', mB)

# ---------- T14: penny precision ----------
add([{'date':'2026-06-02','type':'out','vendor':'P1','amount':33.33,'tax_cat':'Software & subscriptions'},
     {'date':'2026-06-03','type':'out','vendor':'P2','amount':33.34,'tax_cat':'Software & subscriptions'},
     {'date':'2026-06-04','type':'out','vendor':'P3','amount':33.33,'tax_cat':'Software & subscriptions'}])
s, rep = api('/api/report?month=2026-06')
ck('T14 33.33+33.34+33.33+1.00 == 101.00 exactly', rep['report']['expenses'] == 101.0, rep['report']['expenses'])

# ---------- T15: refund (negative out) shrinks expenses ----------
add([{'date':'2026-06-05','type':'out','vendor':'P1','amount':-33.33,'tax_cat':'Software & subscriptions'}])
s, rep = api('/api/report?month=2026-06')
ck('T15 refund reduces expenses to 67.67', rep['report']['expenses'] == 67.67, rep['report']['expenses'])

# ---------- T16: pack raw data has everything (audit trail) ----------
s, pk = api('/api/pack?from=2026-04&to=2026-04')
types = set(t['type'] for t in pk['transactions'])
ck('T16 pack keeps transfers in the raw ledger', 'transfer' in types, types)
ck('T16 pack has no expected rows', all(t['expected'] == 0 for t in pk['transactions']), 'expected leaked')

print('PASS %d  FAIL %d' % (len(P), len(F)))
for x in F: print('FAIL:', x)
