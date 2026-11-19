# Ice & Gold Black Friday client page, v4 (2026-11-19): very simple, top to bottom.
# Calendar times and budgets come from the scheduled tasks ig-nov26-bf-start, ig-nov27-black-friday,
# ig-nov30-cyber-monday, ig-dec1-back-to-normal. Ads are read live from Meta. PUT the JSON as bf_plan.
import json
BFCM, HOLIDAY, FOUR, EVERYDAY = "120247796971840658", "120247798028990658", "120247975226630658", "120247563364210658"
EVERYONE, MODEL = "120247797929670658", "120248110000150658"
plan = {
    "title": "Ice & Gold Black Friday",
    "lede": "The whole plan on one page. All times are Eastern.",
    "moments": [
        {"when": "Wed Nov 25, 11:59pm", "what": "Free studs offer ends. Those ads come off."},
        {"when": "Thu Nov 26, 12am", "what": "Black Friday ads start. Sale budget $300 a day. 4 for $150 and everyday ads go down to $50 a day each.", "hot": True},
        {"when": "Fri Nov 27, 12am", "what": "Sale budget goes to $500 a day.", "hot": True},
        {"when": "Nov 27 to 29", "what": "We check at 9am, 1pm, 5pm and 9pm and move the budget by the rules below."},
        {"when": "Mon Nov 30, 12am", "what": "Cyber Monday ads on. Black Friday ads with no sales come off. Sale budget $500 a day.", "hot": True},
        {"when": "Mon Nov 30", "what": "Checks at 9am, 1pm, 5pm and 9pm."},
        {"when": "Tue Dec 1, 12am", "what": "Back to normal. Black Friday ads end by themselves. 4 for $150 and everyday ads back to $100 a day."},
        {"when": "Dec 4 to Dec 17", "what": "Holiday gifting ads, $50 a day."},
    ],
    "meta": {
        "cap": 50,
        "hide_unused": True,
        "cm": "CM deal|^cm-|^57-|^60-",
        "makers": [["BF deal|CM deal|BF v2|BF cut|^LY", "Recut of a winner"], ["^Trybe", "Creator"], ["^(54|58)-", "William"], ["^63-", "Fela"], ["^Fela", "Fela"]],
        "maker_default": "Mobius team",
        "sections": [
            {"title": "Black Friday", "campaign": BFCM, "open": True,
             "sub": "Thu Nov 26 to Mon Nov 30. One budget for both boxes.",
             "sets": [{"id": EVERYONE, "label": "Everyone", "who": "Anyone in the US. Meta finds the buyers."},
                      {"id": MODEL, "label": "AI model test", "who": "New people only, AI model photos. Off Nov 28 if no sales."}],
             "camp_labels": {BFCM: "Black Friday 2026"}, "notes": {BFCM: "Ends by itself Dec 1, 12am"}},
            {"title": "Holiday gifting", "campaign": HOLIDAY, "mode": "plain", "active_only": True,
             "sub": "Dec 4 to Dec 17. $50 a day.",
             "labels": {"120247798090270658": "New people", "120247798175500658": "Visitors", "120247798209140658": "Past buyers"},
             "who": {"120247798090270658": "People who have not bought yet.", "120247798175500658": "People who visited the site or engaged in the last 180 days.",
                     "120247798209140658": "People who bought before."},
             "camp_labels": {HOLIDAY: "Holiday 2026"}},
            {"title": "Everyday ads", "campaigns": [FOUR, EVERYDAY], "mode": "plain", "active_only": True,
             "sub": "Keep running all season. $50 a day each during the sale, $100 after.",
             "labels": {"120247563730630658": "Best sellers", "120247975228410658": "Everyone"},
             "who": {"120247563730630658": "Anyone in the US.", "120247975228410658": "Anyone in the US."},
             "camp_labels": {FOUR: "4 for $150", EVERYDAY: "Everyday ads"}},
        ],
    },
    "goal": {"big": "$57 per sale", "line": "We want every $1 in ads to bring back $2.50."},
    "ladder": {
        "title": "When we raise or lower the budget",
        "intro": "We look at the whole store: every sale divided by every ad dollar. Checked 4 times a day.",
        "rungs": [{"line": "3.5x or more", "tone": "up2", "action": "Double the budget"},
                  {"line": "3.0x to 3.49x", "tone": "up", "action": "Raise it 50%"},
                  {"line": "2.5x to 2.99x", "tone": "up", "action": "Raise it 25%"},
                  {"line": "2.2x to 2.49x", "tone": "hold", "action": "Hold"},
                  {"line": "1.5x to 2.19x", "tone": "down", "action": "Cut 25%, and turn off any ad that spent $114 with no sale"},
                  {"line": "Under 1.5x", "tone": "down2", "action": "Back to $500, and check the site and checkout"}],
        "note": "We start at $300 on Thanksgiving and $500 Black Friday, then the ladder decides.",
    },
    "asks_title": "What we need from you, Fela",
    "asks": [
        {"q": "When do you want the Black Friday ads to start? Either is fine with us.",
         "options": [{"label": "Thu Nov 26 (as planned)", "note": ""}, {"label": "Mon Nov 23 (start early)", "note": ""}]},
        {"q": "Christmas order-by date: our holiday ads say Dec 18, the plan says Dec 17. Which is right?",
         "options": [{"label": "Dec 18", "note": ""}, {"label": "Dec 17", "note": "We change the ads."}]},
        {"q": "Free studs: what are they worth, $39 or $59?",
         "options": [{"label": "$39", "note": ""}, {"label": "$59", "note": ""}]},
    ],
    "asks_note": "Just reply in our chat.",
}
s = json.dumps(plan)
assert "—" not in s
print(s)
