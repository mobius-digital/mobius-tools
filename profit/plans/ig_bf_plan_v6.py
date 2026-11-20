# Ice & Gold Black Friday client page, v6 (2026-11-20, Cole's approved setup: photos / videos / AI test, backups, Cyber Monday). Was v5 (2026-11-20, Cole: "still confusing"): 3 sections.
# 1 calendar grid Nov 23 to Dec 31 (times from the ig-* scheduled tasks), 2 the recommended setup only,
# 3 every live ad with filter chips. Then goal, ladder, questions. PUT the JSON as season answer bf_plan.
import json
BFCM, HOLIDAY = "120247796971840658", "120247798028990658"
EVERYONE, MODEL = "120247797929670658", "120248110000150658"
VIDEOS = "120248143883440658"
CHECK = {"t": "9am, 1pm, 5pm, 9pm", "text": "We check results and move the budget by the rules below.", "short": "4 checks", "kind": "budget"}
def ev(d, t, short, kind, text): return {"d": d, "t": t, "short": short, "kind": kind, "text": text}
def chk(d): return dict(CHECK, d=d)
events = [
    ev("2026-11-23", "", "Early start?", "ask", "If you want an early start, Black Friday ads go live today instead of Thu Nov 26. See the questions at the bottom."),
    ev("2026-11-25", "11:59pm", "Studs end", "end", "Free studs offer ends. Those ads come off."),
    ev("2026-11-26", "12am", "BF ads on 12am", "bf", "Black Friday ads go live."),
    ev("2026-11-26", "12am", "$300", "budget", "Sale budget $300 a day. 4 for $150 and everyday ads go down to $50 a day each."),
    ev("2026-11-27", "12am", "$500", "budget", "Sale budget goes to $500 a day."), chk("2026-11-27"),
    chk("2026-11-28"), ev("2026-11-28", "Morning", "Test check", "end", "AI model test: it comes off if it has no sales."),
    chk("2026-11-29"),
    ev("2026-11-30", "12am", "CM ads on 12am", "cm", "Cyber Monday ads go live. Black Friday ads with no sales come off."),
    ev("2026-11-30", "12am", "$500", "budget", "Sale budget $500 a day, then the rules below."), chk("2026-11-30"),
    ev("2026-12-01", "12am", "Sale ends 12am", "end", "Black Friday and Cyber Monday ads end by themselves. 4 for $150 and everyday ads go back to $100 a day."),
    ev("2026-12-04", "12am", "Xmas ads on 12am", "xmas", "Christmas gifting ads go live, $50 a day."),
    ev("2026-12-17", "11:59pm", "Xmas ends", "end", "Christmas ads end. Last order-by date is Dec 17 or Dec 18 (see the questions at the bottom)."),
]
plan = {
    "layout": "v5",
    "title": "Ice & Gold Black Friday",
    "lede": "The plan, the calendar, how it is set up, and every ad. All times Eastern.",
    "calendar": {"from": "2026-11-23", "to": "2026-12-31", "events": events,
                 "ranges": [{"from": "2026-11-26", "to": "2026-11-30", "kind": "bf"}, {"from": "2026-12-04", "to": "2026-12-17", "kind": "xmas"}],
                 "note": "All times Eastern. Tap a day for the details."},
    "planbox_title": "The plan",
    "planbox": [
        {"when": "Nov 26, 12am", "text": "48 ads go on. Every photo looks different and says the deal big."},
        {"when": "Nov 26 to 29", "text": "An ad that spends $171 with no sale, or costs over $86 a sale, comes off. A backup from the same group goes on."},
        {"when": "Nov 30, 12am", "text": "The same rule turns off the losers, the winners stay, and the Cyber Monday ads go on next to them."},
        {"when": "Dec 1, 12am", "text": "The sale ends."}],
    "structure": {"campaign": BFCM, "label": "BFCM 2026",
                  "sub": "One campaign, one budget, three groups of ads.",
                  "lines": ["One budget: $300 Nov 26, $500 Nov 27 to 30. Meta moves it to the ads that sell."],
                  "sets": [{"id": EVERYONE, "label": "Photos", "who": "Everyone in the US, past buyers included."},
                           {"id": VIDEOS, "label": "Videos", "who": "Everyone in the US, past buyers included."},
                           {"id": MODEL, "label": "AI model test", "who": "New people only.", "note": "off Nov 28 if no sales"}]},
    "meta": {"cm": "CM deal|^cm-|^57-|^60-",
             "makers": [["^(bf|cm)-", "Mobius"], ["^(38|52|53|57|59|60|61)-", "Ahsan"], ["^(54|58)-", "William"],
                        ["BF deal|CM deal|BF v2|BF cut|^LY", "Recut"], ["^Trybe", "Creator"], ["^63-", "Fela"], ["^Fela", "Fela"]],
             "maker_default": "Team"},
    "ads": {"mode": "by_set", "campaign": BFCM,
            "intro": "Read live from Meta, by group. Tap any ad to see it full size; videos play.",
            "sets": [{"id": EVERYONE, "label": "Photos"}, {"id": VIDEOS, "label": "Videos"}, {"id": MODEL, "label": "AI model test"}],
            "footnote": "Christmas ads are their own campaign, starting Dec 4."},
    "goal": {"big": "$57 per sale", "line": "We want every $1 in ads to bring back $2.50."},
    "ladder": {
        "title": "When we raise or lower the budget",
        "intro": "We look at the whole store: every sale divided by every ad dollar. Checked 4 times a day.",
        "rungs": [{"line": "3.5x or more", "tone": "up2", "action": "Double the budget"},
                  {"line": "3.0x to 3.49x", "tone": "up", "action": "Raise it 50%"},
                  {"line": "2.5x to 2.99x", "tone": "up", "action": "Raise it 25%"},
                  {"line": "2.2x to 2.49x", "tone": "hold", "action": "Hold"},
                  {"line": "1.5x to 2.19x", "tone": "down", "action": "Cut 25%"},
                  {"line": "Under 1.5x", "tone": "down2", "action": "Back to $500, and check the site and checkout"}],
        "note": "We start at $300 on Thanksgiving and $500 Black Friday, then the ladder decides."},
    "asks_title": "What we need from you, Fela",
    "asks": [
        {"q": "When do you want the Black Friday ads to start? Either is fine with us.",
         "options": [{"label": "Thu Nov 26 (as planned)", "note": ""}, {"label": "Mon Nov 23 (start early)", "note": ""}]},
        {"q": "Christmas order-by date: our holiday ads say Dec 18, the plan says Dec 17. Which is right?",
         "options": [{"label": "Dec 18", "note": ""}, {"label": "Dec 17", "note": "We change the ads."}]},
        {"q": "Free studs: what are they worth, $39 or $59?",
         "options": [{"label": "$39", "note": ""}, {"label": "$59", "note": ""}]}],
    "asks_note": "Just reply in our chat.",
}
s = json.dumps(plan)
assert "—" not in s
print(s)
