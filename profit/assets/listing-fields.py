# -*- coding: utf-8 -*-
"""Listing copy revised to match the MERCHANT-FACING report, card for card.

The first draft listed cohorts and a daily Slack summary. Both exist, but in the
internal agency tool - a merchant's report has neither. Shopify checks that listing
content matches what the app actually does, so every line below now corresponds to a
card that is visibly present at the report link.
"""

APP_DETAILS = (
    'Mobius Digital reports what a store keeps after the costs that move with sales: '
    'product cost, fulfilment, handling, payment fees and advertising all come out, '
    'and what is left is your contribution margin.'
    '\n\n'
    'Your report opens on the month so far, measured against that month\'s revenue and '
    'ad spend plan, pro-rated to the days elapsed.'
    '\n\n'
    'It also shows revenue against ad spend day by day, first-time buyers against '
    'returning ones, which weekdays run above and below average, and six months of '
    'history.'
)

F = [
    ('App name', 30, 'Mobius Digital'),

    ('Introduction', 100,
     'See what your store keeps after every variable cost, measured against the '
     'plan for the month.'),

    ('App details', 500, APP_DETAILS),

    # Each one is a card that is actually on the report.
    ('Feature 1', 80, 'Contribution margin after product, fulfilment, fees and ad costs'),
    ('Feature 2', 80, 'Month to date pacing against a revenue and ad spend plan'),
    ('Feature 3', 80, 'Revenue against ad spend, day by day, across every channel'),
    ('Feature 4', 80, 'Revenue split between first time buyers and returning customers'),
    ('Feature 5', 80, 'Which weekdays run above and below an average day'),

    ('App card subtitle', 62, 'Know what your store keeps after product, shipping and ads'),

    ('Title tag', 60, 'Mobius Digital: store profit and contribution margin'),
    ('Meta description', 160,
     'Report what your store keeps after product, fulfilment, payment and ad costs. '
     'Track contribution margin and month to date pacing against plan.'),

    ('Screenshot 1 alt', 64, 'Monthly profit report from revenue down to margin'),
    ('Screenshot 2 alt', 64, 'Daily revenue against ad spend, and new versus returning'),
    ('Screenshot 3 alt', 64, 'Which weekdays run above and below an average day'),
    ('Feature media alt', 64, 'Store profit report showing revenue, costs and margin'),
]

print('%-22s %-7s %s' % ('FIELD', 'CHARS', 'STATUS'))
print('-' * 46)
bad = 0
for name, limit, text in F:
    n = len(text)
    if n > limit:
        bad += 1
    print('%-22s %3d/%-3d %s' % (name, n, limit, 'ok' if n <= limit else '>>> OVER <<<'))
print('\n%d over limit' % bad)
