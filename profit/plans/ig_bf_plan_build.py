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
groups[0]["title"]="Past winners"; groups[0]["sub"]="Videos that already sold for you, recut with the Black Friday deal."
groups[4]["sub"]="New people only. Comes off Sat Nov 28 if it has no sales."
groups[5]["sub"]="Ready now. They switch on Mon Nov 30 at 12:00am."
for g in groups: g.pop("waiting", None)
plan = {
 "title": "Black Friday 2026: the plan and the ads",
 "lede": "Tap a phase or a campaign to jump to it. Tap any ad to see it full size.",
 "asks": [{"q": "Do we want to start Black Friday on Monday (Nov 23)? We 100% can if you want to. It's not a problem either way, it's just whether you want to.",
   "options": [{"label": "Start Mon Nov 23", "note": "The deal and the ads go live Monday."}, {"label": "Keep Thu Nov 26", "note": "The plan below, as it is."}]}],
 "asks_note": "Just tell us in our chat.",
 "timeline": [
  {"name": "Early Bird", "when": "Now to Nov 25", "note": "Free studs over $125", "color": "var(--p-eb)", "camp": "eb"},
  {"name": "Black Friday", "when": "Nov 26 to 30", "note": "Save up to $100 + free studs", "color": "var(--p-bf)", "camp": "bf"},
  {"name": "Cyber Monday", "when": "Nov 30", "note": "Same deal, new ads", "color": "var(--p-cm)", "camp": "cm"},
  {"name": "Gifting", "when": "From Dec 4", "note": "Order by Dec 18", "color": "var(--p-gift)", "camp": "gift"}],
 "campaigns": [
  {"key": "eb", "name": "Early Bird", "sets": "Free studs over $125", "when": "Now to Nov 25", "starts": "$150/day", "ads": "live"},
  {"key": "bf", "name": "Black Friday", "sets": "One budget, 2 groups: Everyone, and a model photo test for new people", "when": "Thu Nov 26 to Mon Nov 30", "starts": "$300 Thu, $500 Fri", "ads": "61", "tab": "Black Friday"},
  {"key": "cm", "name": "Cyber Monday", "sets": "Added to the Black Friday groups", "when": "Mon Nov 30", "starts": "$500 Mon", "ads": "+41", "tab": "Cyber Monday"},
  {"key": "f4", "name": "4 for $150", "sets": "All season. Does not stack with the sale", "when": "All season", "starts": "$50 in the sale, $100 after", "ads": "live"},
  {"key": "ev", "name": "Everyday ads", "sets": "Your best sellers, all year", "when": "All season", "starts": "$50 in the sale, $100 after", "ads": "live"},
  {"key": "gift", "name": "Holiday gifting", "sets": "Order by Dec 18", "when": "From Fri Dec 4", "starts": "$50/day", "ads": ""}],
 "ladder": {
  "intro": "Every move is judged on MER: all store sales divided by all ad spend, over the last 3 hours. The target is 2.5.",
  "rungs": [{"line": "MER 3.5+", "tone": "up2", "action": "Raise budget 100%"},
   {"line": "MER 3.0 to 3.49", "tone": "up", "action": "Raise budget 50%"},
   {"line": "MER 2.5 to 2.99", "tone": "up", "action": "Raise budget 25%"},
   {"line": "MER 2.2 to 2.49", "tone": "hold", "action": "Hold"},
   {"line": "MER 1.5 to 2.19", "tone": "down", "action": "Pull back 25%. Turn off ads that spent 2x the goal with no sale"},
   {"line": "Under 1.5", "tone": "down2", "action": "Back to the starting budget, check the site and checkout"}],
  "checks": [
   {"when": "Thu Nov 26, 12am", "budget": "$300", "what": "Black Friday ads go live. 4 for $150 and Everyday ads drop to $50"},
   {"when": "Thu 9am, 1pm, 5pm, 9pm", "budget": "by the ladder", "what": "First reads of the sale"},
   {"when": "Fri Nov 27, 12am", "budget": "$500", "what": "Black Friday starts higher"},
   {"when": "Fri to Sun, 9am, 1pm, 5pm, 9pm", "budget": "by the ladder", "what": "Same rules. Model photo test checked Sat: off if no sales"},
   {"when": "Mon Nov 30, 12am", "budget": "$500", "what": "Cyber Monday ads switch on. Back to a $500 start"},
   {"when": "Mon 9am, 1pm, 5pm, 9pm", "budget": "by the ladder", "what": "Last day of the sale"},
   {"when": "Tue Dec 1, 12am", "budget": "$100 each", "what": "Sale ends. 4 for $150 and Everyday ads back to $100"},
   {"when": "Fri Dec 4", "budget": "$50", "what": "Holiday gifting starts"}]},
 "groups": groups}
open("ig_bf_plan.json", "w").write(json.dumps(plan))
print(len(json.dumps(plan)), len(allids))
