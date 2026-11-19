# Ice & Gold Black Friday client page, v3 (2026-11-19): the live Meta structure.
# Ads, statuses and budgets are read live from Meta by account-health /api/season-meta; this file only
# says which campaigns and boxes to show, in plain words. PUT the printed JSON as season answer bf_plan.
import json
BFCM, HOLIDAY, FOUR, EVERYDAY = "120247796971840658", "120247798028990658", "120247975226630658", "120247563364210658"
EVERYONE, MODEL, PAST = "120247797929670658", "120248110000150658", "120247798012710658"
bf_sets = [
    {"id": EVERYONE, "label": "Everyone", "who": "Anyone in the US. Meta finds the buyers, past buyers included."},
    {"id": MODEL, "label": "AI model test", "who": "New people only, AI model photos. Off Nov 28 if no sales."},
    {"id": PAST, "label": "Past buyers", "who": "People who bought before. Off, because the Everyone box already reaches them."},
]
plan = {
    "title": "Black Friday 2026: how your ads are set up",
    "lede": "This is your Meta account as it is right now. Tap any ad to see it full size; videos play.",
    "asks": [{"q": "Do we want to start Black Friday on Monday (Nov 23)? We 100% can if you want to. It's not a problem either way, it's just whether you want to.",
              "options": [{"label": "Start Mon Nov 23", "note": "The deal and the ads go live Monday."}, {"label": "Keep Thu Nov 26", "note": "The plan below, as it is."}]}],
    "asks_note": "Just tell us in our chat.",
    "meta": {
        "cap": 50,
        "cm": "CM deal|^cm-|^57-|^60-",
        "makers": [["BF deal|CM deal|BF v2|BF cut|^LY", "Recut of a winner"], ["^Trybe", "Creator"], ["^(54|58)-", "William"], ["^63-", "Fela"], ["^Fela", "Fela"]],
        "maker_default": "Mobius team",
        "sections": [
            {"title": "Black Friday", "nav": "Black Friday", "campaign": BFCM, "open": True, "sets": bf_sets,
             "sub": "Thu Nov 26 to Mon Nov 30. One budget for the whole campaign: $300 Thu, $500 Fri and Mon, then the ladder below.",
             "camp_labels": {BFCM: "Black Friday 2026"}, "notes": {BFCM: "Ends by itself Dec 1, 12am"}},
            {"title": "Cyber Monday", "nav": "Cyber Monday", "campaign": BFCM, "mode": "cm", "sets": bf_sets[:2],
             "sub": "Mon Nov 30. These ads wait, paused, inside the Black Friday boxes and switch on at 12am."},
            {"title": "Holiday 2026", "nav": "Holiday", "campaign": HOLIDAY, "mode": "plain",
             "sub": "Dec 4 to Dec 17. Gift ads, order by Dec 18.",
             "labels": {"120247798090270658": "New people", "120247798175500658": "Visitors", "120247798209140658": "Past buyers", "120247857785780658": "Gift cards"},
             "who": {"120247798090270658": "People who have not bought yet.", "120247798175500658": "People who visited the site or engaged in the last 180 days.",
                     "120247798209140658": "People who bought before.", "120247857785780658": "Gift card ads, on hold until gift cards are on the site."}},
            {"title": "Also running", "nav": "Also running", "campaigns": [FOUR, EVERYDAY], "mode": "plain", "active_only": True,
             "sub": "Your everyday ads keep running, smaller during the sale.",
             "labels": {"120247563730630658": "Best sellers (photos)", "120247975228410658": "Everyone"},
             "camp_labels": {FOUR: "4 for $150", EVERYDAY: "Everyday ads"},
             "notes": {FOUR: "$50/day during the sale, $100 after", EVERYDAY: "$50/day during the sale, $100 after"}},
        ],
    },
    "ladder": {
        "intro": "Every move is judged on MER: all store sales divided by all ad spend, over the last 3 hours. The target is 2.5.",
        "rungs": [{"line": "MER 3.5+", "tone": "up2", "action": "Raise budget 100%"}, {"line": "MER 3.0 to 3.49", "tone": "up", "action": "Raise budget 50%"},
                  {"line": "MER 2.5 to 2.99", "tone": "up", "action": "Raise budget 25%"}, {"line": "MER 2.2 to 2.49", "tone": "hold", "action": "Hold"},
                  {"line": "MER 1.5 to 2.19", "tone": "down", "action": "Pull back 25%. Turn off ads that spent 2x the goal with no sale"},
                  {"line": "Under 1.5", "tone": "down2", "action": "Back to the starting budget, check the site and checkout"}],
        "checks": [{"when": "Thu Nov 26, 12am", "budget": "$300", "what": "Black Friday ads go live. 4 for $150 and Everyday ads drop to $50"},
                   {"when": "Thu 9am, 1pm, 5pm, 9pm", "budget": "by the ladder", "what": "First reads of the sale"},
                   {"when": "Fri Nov 27, 12am", "budget": "$500", "what": "Black Friday starts higher"},
                   {"when": "Fri to Sun, 9am, 1pm, 5pm, 9pm", "budget": "by the ladder", "what": "Same rules. AI model test checked Sat: off if no sales"},
                   {"when": "Mon Nov 30, 12am", "budget": "$500", "what": "Cyber Monday ads switch on. Back to a $500 start"},
                   {"when": "Mon 9am, 1pm, 5pm, 9pm", "budget": "by the ladder", "what": "Last day of the sale"},
                   {"when": "Tue Dec 1, 12am", "budget": "$100 each", "what": "Sale ends. 4 for $150 and Everyday ads back to $100"},
                   {"when": "Fri Dec 4", "budget": "$50", "what": "Holiday gifting starts"}]},
}
print(json.dumps(plan))
