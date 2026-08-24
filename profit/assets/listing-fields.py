# -*- coding: utf-8 -*-
"""Every text field on the App Store listing form, checked against its limit."""

APP_DETAILS = (
    'Mobius Digital reports what a store earns after the costs that move with sales. '
    'It reads your orders, products and customers, subtracts product cost, shipping, '
    'payment fees and ad spend, and shows the contribution margin left over.'
    '\n\n'
    'It also groups customers by the month they first bought, so you can see whether '
    'people come back and what a customer is worth over time.'
    '\n\n'
    'Figures are shown against a monthly revenue and spend plan you set, so you can '
    'tell early whether the store is on track.'
)

F = [
    ('App name', 30, 'Mobius Digital'),

    ('Introduction', 100,
     'See what your store keeps after every variable cost. Revenue, margin and '
     'customer value in one view.'),

    ('App details', 500, APP_DETAILS),

    ('Feature 1', 80, 'Contribution margin after product, shipping, payment fee and ad costs'),
    ('Feature 2', 80, 'Customer cohorts showing repeat rate and lifetime value by first order'),
    ('Feature 3', 80, 'Monthly revenue and spend plan, with month to date pacing against it'),
    ('Feature 4', 80, 'New versus returning revenue split and cost to acquire a customer'),
    ('Feature 5', 80, 'Daily summary of yesterday revenue, spend and margin versus plan'),

    ('App card subtitle', 62, 'Know what your store keeps after product, shipping and ads'),

    ('Search term 1', 20, 'profit margin'),
    ('Search term 2', 20, 'profitability'),
    ('Search term 3', 20, 'contribution margin'),
    ('Search term 4', 20, 'lifetime value'),
    ('Search term 5', 20, 'cohort analysis'),

    ('Title tag', 60, 'Mobius Digital: store profit and customer value reporting'),
    ('Meta description', 160,
     'Report what your store keeps after product, shipping, payment and ad costs. '
     'Track contribution margin, customer cohorts and monthly plan pacing.'),

    ('Screenshot 1 alt', 64, 'Profit dashboard showing revenue and contribution margin'),
    ('Screenshot 2 alt', 64, 'Customer cohorts with repeat rate and lifetime value'),
    ('Screenshot 3 alt', 64, 'Monthly plan with month to date pacing against target'),

    ('Account description', 255,
     'Read-only demo account. It opens on a single sample brand with fictional figures '
     'and no real merchant or customer data. Every tab is reachable from the top '
     'navigation; nothing needs to be set up first.'),
]

print('%-22s %-7s %s' % ('FIELD', 'CHARS', 'STATUS'))
print('-' * 46)
bad = 0
for name, limit, text in F:
    n = len(text)
    ok = n <= limit
    if not ok:
        bad += 1
    print('%-22s %3d/%-3d %s' % (name, n, limit, 'ok' if ok else '>>> OVER <<<'))
print()
print('%d field(s) over limit' % bad)
