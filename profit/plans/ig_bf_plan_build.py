import json, datetime
def ads(pairs, kind):
    return [{"id": i, "label": l, "kind": kind} for l, i in pairs]
winners = [("Top seller","120248110753280658"),("Fela: why I started","120248110757010658"),("Fela: the necklace","120248113781970658"),
 ("Fela: how to buy gold","120248113788260658"),("Packing an order","120248113786600658"),("Adeola: Gold Link Set","120248113789760658"),
 ("Adeola: July 23","120248098814470658"),("Adeola: studded herringbone","120248098814660658"),("Adeola: July 1","120248098814700658"),
 ("Adeola: October 17","120248098814890658"),("Adeola: the set","120248098814130658")]
creators = [("Chanler","120248110757300658"),("Gabrielle: earrings","120248113794050658"),("Hazel","120248110753460658"),
 ("Kelly: lion coin","120248113795930658"),("Raghda","120248110757230658")]
newv = [("New video 1","120248094268570658"),("New video 2","120248094270270658")]
stills = ["120248094272420658","120248094283070658","120248094296630658","120248094306200658","120248094317550658","120248094323500658",
 "120247797930200658","120247797930350658","120247797930580658","120247797933030658","120247797933280658","120247797934120658"]
model = ["120248112845810658","120248112852830658","120248112843700658","120248112835900658","120248110085080658","120248110106200658",
 "120248110073110658","120248110092780658","120248110094960658","120248110087620658","120248110090950658","120248110089690658",
 "120248110104980658","120248110066130658","120248110082800658","120248110069380658","120248110068040658","120248110064390658",
 "120248110098440658","120248110096580658","120248110107220658","120248110063230658","120248110076830658","120248110071140658",
 "120248110061570658","120248110079250658","120248110075070658","120248110113350658","120248110103160658","120248110081550658",
 "120248110101290658"]
cmv = [("Fela: how to buy gold","120248113815700658"),("Adeola: Gold Link Set","120248113817010658"),("Fela: the necklace","120248113808850658"),
 ("Packing an order","120248113811770658"),("Kelly: lion coin","120248113820890658"),("Gabrielle: earrings","120248113819550658"),
 ("Adeola: studded herringbone","120248111538770658"),("Adeola: October 17","120248111537220658"),("Adeola: July 23","120248111540160658"),
 ("Adeola: the set","120248111540790658"),("Hazel","120248111404200658"),("Fela: why I started","120248111462070658"),
 ("Top seller","120248111407770658"),("Adeola: July 1","120248111465410658"),("Chanler","120248111463660658"),("Raghda","120248111462760658"),
 ("Cyber Monday video 1","120248094348410658"),("Cyber Monday video 2","120248094351980658"),("Cyber Monday video 3","120248094356120658"),("Cyber Monday video 4","120248094359780658")]
cms = ["120247857752460658","120247857754790658","120247857756080658","120247857757790658","120247857759460658",
 "120248094365360658","120248094371860658","120248094377740658","120248094384910658","120248094392060658","120248094399310658",
 "120248094405980658","120248094427850658","120248094445350658","120248094461250658"]
cmmodel = ["120248110116820658","120248110118590658","120248110119570658","120248110121410658","120248110122820658","120248110123410658"]
st = lambda ids: [{"id": i, "label": "", "kind": "still"} for i in ids]
groups = [
 {"tab":"Black Friday","title":"Past winners, now with the deal","sub":"Videos that already sold for you, recut with the Black Friday offer.","ads":ads(winners,"video")},
 {"tab":"Black Friday","title":"Creators","sub":"Real people wearing it.","ads":ads(creators,"video")},
 {"tab":"Black Friday","title":"New videos","ads":ads(newv,"video")},
 {"tab":"Black Friday","title":"Photos","ads":st(stills)},
 {"tab":"Black Friday","title":"Model photo test","sub":"New people only. Comes off Nov 28 if it has no sales.","ads":st(model)},
 {"tab":"Cyber Monday","title":"Videos","sub":"Ready and waiting. They switch on Nov 30 at 12:00am.","waiting":"Nov 30","ads":ads(cmv,"video")},
 {"tab":"Cyber Monday","title":"Photos","waiting":"Nov 30","ads":st(cms)},
 {"tab":"Cyber Monday","title":"Model photo test","waiting":"Nov 30","ads":st(cmmodel)},
]
assert [len(g["ads"]) for g in groups] == [11,5,2,12,31,20,15,6], [len(g["ads"]) for g in groups]
allids = [a["id"] for g in groups for a in g["ads"]]; assert len(set(allids)) == len(allids)
def B(bf, ev, f4, extra=None):
    out = []
    if bf: out.append({"name":"Black Friday campaign","amount":bf})
    out += [{"name":"Everyday ads","amount":ev},{"name":"4 for $150","amount":f4}]
    if extra: out.append(extra)
    return out
days = []
d0 = datetime.date(2026,11,19)
for i in range(16):
    d = d0 + datetime.timedelta(i); iso = d.isoformat(); sw = []; note = None
    if d.month == 11 and d.day <= 25: ph, bud = "eb", B(150,150,100)
    elif iso == "2026-11-26": ph, bud = "bf", B(300,50,50)
    elif iso == "2026-11-27": ph, bud = "bf", B(500,50,50)
    elif iso in ("2026-11-28","2026-11-29"): ph, bud = "bf", B(400,50,50)
    elif iso == "2026-11-30": ph, bud = "cm", B(500,50,50)
    elif iso in ("2026-12-01","2026-12-02","2026-12-03"): ph, bud = "norm", B(0,100,100)
    else: ph, bud = "gift", B(0,100,100,{"name":"Holiday gifting","amount":50})
    if ph in ("bf","cm"): note = "Starting budget. The scaling ladder can raise it during the day, up to $800."
    if iso == "2026-11-25": sw = [{"t":"11:59pm","text":"Early Bird ads switch off."}]
    if iso == "2026-11-26": sw = [{"t":"12:00am","text":"Black Friday ads switch on: 30 in Everyone, 31 in the model photo test."},{"t":"12:00am","text":"Everyday ads and 4 for $150 drop to $50 a day so the sale gets the money."}]
    if iso == "2026-11-27": sw = [{"t":"All day","text":"Black Friday. The biggest budget of the season."}]
    if iso == "2026-11-28": sw = [{"t":"Morning","text":"Model photo test checked. If it has no sales, it comes off."}]
    if iso == "2026-11-30": sw = [{"t":"12:00am","text":"Cyber Monday ads switch on next to the Black Friday ones."}]
    if iso == "2026-12-01": sw = [{"t":"12:00am","text":"The Black Friday box ends by itself."},{"t":"12:00am","text":"Everyday ads and 4 for $150 go back to $100 a day."}]
    if iso == "2026-12-04": sw = [{"t":"12:00am","text":"Holiday gifting ads switch on. Order by Dec 18."}]
    day = {"d":iso,"phase":ph,"budgets":bud,"switches":sw}
    if note: day["note"] = note
    days.append(day)
plan = {
 "title":"Black Friday ads","start":"2026-11-26",
 "lede":"Everything from now to December: the dates, the daily budgets, how we scale, and every ad. Tap anything to look closer. 4 for $150 runs all season and does not stack with the sale.",
 "stats":[{"v":"Nov 26","l":"Black Friday ads start"},{"v":"$600","l":"biggest day, Nov 27"},{"v":str(len(allids)),"l":"ads ready"}],
 "phases":[
  {"key":"eb","name":"Early Bird","when":"now to Nov 25","color":"var(--p-eb)","offer":"Free studs on orders over $125."},
  {"key":"bf","name":"Black Friday","when":"Nov 26 to 29","color":"var(--p-bf)","offer":"Spend $100, save $25. Spend $200, save $60 + free studs. Spend $300, save $100 + free studs."},
  {"key":"cm","name":"Cyber Monday","when":"Nov 30","color":"var(--p-cm)","offer":"Same deal, last day. Fresh Cyber Monday ads join in."},
  {"key":"norm","name":"Back to everyday","when":"Dec 1 to 3","color":"var(--p-norm)","offer":"Sale over. Everyday ads and 4 for $150 keep running."},
  {"key":"gift","name":"Gifting","when":"from Dec 4","color":"var(--p-gift)","offer":"Gift ads. Order by Dec 18 to get it in time."}],
 "days":days,
 "ladder":{"title":"When we scale, when we pull back",
  "sub":"We read the whole store: every sale divided by every ad dollar. When it is strong we add money, when it slips we pull back.",
  "rungs":[{"line":"2.5x or better","tone":"up","action":"Raise the budget 25%","note":"Up to $800 a day"},
   {"line":"1.5x to 2.5x","tone":"hold","action":"Hold steady","note":"Let it keep selling"},
   {"line":"Under 1.5x at 1pm","tone":"down","action":"Back to $300 a day","note":"Then build back up"}],
  "checks":["9am check","1pm check","5pm check"],
  "goal":"The goal: $57 per sale, which is $2.50 back for every $1 on ads."},
 "structure":{"title":"How it is built","sub":"One Black Friday campaign. Two boxes decide who sees which ads.",
  "campaign":"Black Friday 2026","campaign_note":"One budget. Meta moves the money to whichever ads sell, hour by hour.",
  "boxes":[{"name":"Everyone","when":"Nov 26 to Dec 1","who":"Everyone, past buyers included","counts":[{"text":"30 ads on"},{"text":"35 Cyber Monday ads waiting","wait":True}],"why":"One box for everyone, because the separate small boxes never spent."},
   {"name":"Model photo test","when":"Nov 26 to Dec 1","who":"New people only","counts":[{"text":"31 photos on"},{"text":"6 Cyber Monday photos waiting","wait":True}],"why":"To find new faces cheaply. Comes off Nov 28 if it has no sales."}],
  "also":[{"name":"Early Bird ads","note":"Running now, end Nov 25"},{"name":"Everyday ads","note":"Keep running, $50 a day over the sale"},{"name":"4 for $150","note":"All season, $50 a day over the sale"},{"name":"Holiday gifting","note":"From Dec 4, $50 a day"}]},
 "why":[{"what":"One box for everyone. ","why":"The separate small boxes never spent."},
  {"what":"Past winners, recut with the deal. ","why":"They already sold."},
  {"what":"Creators. ","why":"Your buyers trust real people."},
  {"what":"Model photo test. ","why":"To find new faces cheaply."}],
 "groups":groups}
open("ig_bf_plan.json","w").write(json.dumps(plan))
print(len(json.dumps(plan)), len(allids))
