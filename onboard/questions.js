/* The onboarding questions, ONE list for the client's link (onboard/index.html)
 * and the staff view in Locus (profit/brand.js). Every field of the old Google
 * Sheet's yellow tabs lives here; nothing was dropped because a brand left it
 * empty. Change a question here and both sides change.
 *
 * Field types: text, long, money, number, url, email, yesno, choice, list, file, check
 * A `list` has `cols` ([id, label, type]) and repeats rows. `why` is the one-line
 * "why we ask" shown under the field. `calc` marks a read-only worked-out value.
 */
(function () {
'use strict';
/* What the client pastes into each platform. One place, so a change lands on
   every client's link at once. */
const MOBIUS = {
  bmId: '695359915477596',
  domain: 'go-mobius-digital.com',
  team: [['Cole', 'cole@go-mobius-digital.com'], ['Ahsan', 'ahsan@go-mobius-digital.com']],
  calendly: 'https://calendly.com/mobius-digital/strategy-session',
};
const LOOM = {
  meta: 'https://www.loom.com/share/5775fe7e6ee54ea89927e319a54b7ebd',
  google: 'https://www.loom.com/share/a137cdef52784270bc937d440b4d83b6',
  drive: 'https://www.loom.com/share/a143560ddbfc48dfa956844eb37bca74',
};
const STEPS = [
  /* The rest of the client's Asana "Client Responsible" list. `link: 'drive'` is
     the brand's own Google Drive folder, set in Locus (Brand info > At a glance). */
  { id: 'start', title: 'Getting started', intro: 'The quick admin first. Tick each one when it is done.',
    fields: [
      { id: 'st_invoice', label: 'Pay the first invoice', type: 'check', steps: ['It is in your email. We start once it is paid.'] },
      { id: 'st_agreement', label: 'Sign the agreement', type: 'check', steps: ['It is in your email too. Please sign it before the rest of onboarding.'] },
      { id: 'st_slack', label: 'Say hi in our shared Slack channel', type: 'check', steps: ['You will get an invite to a Slack channel with our team. Drop a quick hello so we know you are in.'] },
      { id: 'st_call', label: 'Book your strategy call', type: 'check', steps: ['Pick a time that suits you. We go through this form together on the call.'], go: [['Book the call', MOBIUS.calendly]] },
      { id: 'st_drive', label: 'Drop your content in your Google Drive folder', type: 'check', loom: LOOM.drive, link: 'drive',
        steps: [
          'Open your folder, then Assets > Insert client content.',
          'Add anything we could use in ads: videos, photos, GIFs, past ads, product shots, lifestyle and model shoots, customer videos (UGC).',
          'Sort it into sub-folders if you can (past ads, product shoots, lifestyle, videos, UGC). It gets your ads live sooner.',
          'Already have a Drive folder of your own? Paste its link in the Branding folder, or in the notes on the last step.',
        ] },
    ] },
  { id: 'team', title: 'You and your team', intro: 'Who we will be working with, and where to find you.',
    fields: [
      { id: 'company', label: 'Company name', type: 'text' },
      { id: 'website', label: 'Website', type: 'url' },
      { id: 'contact_name', label: 'Main contact', type: 'text' },
      { id: 'contact_email', label: 'Their email', type: 'email' },
      { id: 'contact_phone', label: 'Their phone', type: 'text' },
      { id: 'socials', label: 'Your social accounts', type: 'list', why: 'We study your organic posts before we write a single ad.',
        cols: [['network', 'Network', 'text'], ['handle', 'Handle or link', 'text']],
        seed: [{ network: 'Instagram' }, { network: 'Facebook' }, { network: 'TikTok' }, { network: 'YouTube' }, { network: 'X / Twitter' }, { network: 'Pinterest' }, { network: 'LinkedIn' }] },
      { id: 'team', label: 'Who else is on your side', type: 'list', why: 'So we know who approves ads, who owns the store and who to ask about stock.',
        cols: [['name', 'Name', 'text'], ['role', 'Role', 'text'], ['email', 'Email', 'text']] },
    ] },
  { id: 'products', title: 'Your products', intro: 'What you sell, what sells best, and where it ships.',
    fields: [
      { id: 'best_sellers', label: 'Your best sellers', type: 'list', why: 'We lead with what already sells, and we need to know what we can run out of.',
        cols: [['name', 'Product', 'text'], ['price', 'Price', 'money'], ['stock', 'Stock on hand', 'text'], ['lead', 'Reorder lead time', 'text'], ['push', 'Push in ads?', 'yesno']] },
      { id: 'focus_ranges', label: 'Any ranges you want us to focus on?', type: 'long' },
      { id: 'product_count', label: 'How many products do you have?', type: 'text' },
      { id: 'variants', label: 'Do products come in variants? Which?', type: 'text', help: 'Sizes, colours, flavours, strengths.' },
      { id: 'categories', label: 'Your product categories', type: 'list', why: 'Different categories often have different buyers, so they may need their own research.',
        cols: [['name', 'Category', 'text'], ['high', 'High margin products', 'text'], ['low', 'Low margin products', 'text']] },
      { id: 'features', label: 'The main features of your products', type: 'long' },
      { id: 'solves', label: 'What do your products solve? Why do people buy them, and how do they improve their life?', type: 'long', why: 'This is the single most useful answer on the whole form.' },
      { id: 'jargon', label: 'Any jargon or technical detail we should know?', type: 'long' },
      { id: 'cross_sells', label: 'Products that sell well together', type: 'long', help: 'Cross-sells, upsells and combinations.' },
      { id: 'regions', label: 'Where you ship', type: 'list', why: 'Each region can need its own ads, offers and shipping promise.',
        cols: [['region', 'Country or region', 'text'], ['ship_time', 'Standard shipping time', 'text'], ['expedited', 'Faster option and time', 'text'], ['role', 'Main market, growth market or occasional?', 'text'], ['wholesale', 'Wholesale there?', 'yesno'], ['site', 'Separate website or ad account?', 'text']] },
    ] },
  { id: 'numbers', title: 'Your numbers', intro: 'The last three months, roughly. We work out the break-even for you.',
    fields: [
      { id: 'aov', label: 'Average order value', type: 'money', why: 'Sets what a new customer is worth on day one.' },
      { id: 'cogs', label: 'What it costs you to make that order', type: 'money', help: 'Product cost for an average order, landed.' },
      { id: 'ship_cost', label: 'What shipping costs you per order', type: 'money', help: 'Leave empty if the customer pays it.' },
      { id: 'breakeven', label: 'Break-even cost per sale', type: 'money', calc: 'breakeven', why: 'The most we can pay for a sale and still not lose money on the first order.' },
      { id: 'target_cpa', label: 'The cost per sale you would be happy with', type: 'money' },
      { id: 'target_cpa_how', label: 'How did you arrive at that number?', type: 'long' },
      { id: 'product_costs', label: 'Cost and price per product or bundle', type: 'list', why: 'Some products can carry a much higher ad cost than others.',
        cols: [['name', 'Product or bundle', 'text'], ['cogs', 'Cost', 'money'], ['ship', 'Shipping', 'money'], ['price', 'Price', 'money']] },
    ] },
  { id: 'offers', title: 'Offers and growth', intro: 'What you run today to lift order value and bring people back.',
    fields: [
      { id: 'offers', label: 'Your best offers', type: 'long', why: 'Almost every brand runs offers to win new customers, and the more room we have to test them, the better the results.' },
      { id: 'codes', label: 'Discount codes running right now', type: 'long' },
      { id: 'free_ship', label: 'Free shipping over', type: 'money' },
      { id: 'gift_threshold', label: 'Free gift or discount over a certain spend', type: 'text', help: 'For example: free hat over $150.' },
      { id: 'bundle_upsell', label: 'Buy more, save more?', type: 'text', help: 'Buy 2 for 5% off, buy 3 for 10% off.' },
      { id: 'bolt_ons', label: 'Add-ons at checkout', type: 'text', help: 'Gift wrap, priority shipping, a small extra.' },
      { id: 'post_purchase', label: 'One-click upsell after purchase', type: 'text' },
      { id: 'upsell_bundle', label: 'Bundles that pair products', type: 'text' },
      { id: 'custom', label: 'Engraving, monogramming or customisation', type: 'text' },
      { id: 'returning_offers', label: 'Offers or campaigns for existing customers', type: 'text' },
      { id: 'vip', label: 'Are your top 20% of customers segmented?', type: 'yesno' },
      { id: 'reorder_cycle', label: 'How often do customers reorder?', type: 'text' },
      { id: 'reorder_flows', label: 'Automated reorder reminders?', type: 'yesno' },
      { id: 'loyalty', label: 'Loyalty program', type: 'text' },
      { id: 'referral', label: 'Referral or affiliate program', type: 'text' },
      { id: 'subscription', label: 'Could a subscription work?', type: 'text' },
    ] },
  { id: 'customers', title: 'Your customers', intro: 'Who buys from you, in your own words. We do deeper research on our side, so rough is fine.',
    fields: [
      { id: 'why_you', label: 'Why do customers buy from you over the competition?', type: 'long', help: 'Cheaper, better quality, cooler, faster shipping, a mission, better service, influencer power, fun sales, a great loyalty program...' },
      { id: 'uvp', label: 'What makes your brand different, in one or two sentences?', type: 'long' },
      { id: 'persona_doc', label: 'Link to any customer personas you already have', type: 'url' },
      { id: 'personas', label: 'Your main types of customer', type: 'list', why: 'We turn these into full research personas and test angles against each one.',
        cols: [['name', 'Nickname', 'text'], ['age', 'Age', 'text'], ['gender', 'Gender', 'text'], ['location', 'Location', 'text'], ['buys', 'What they buy', 'text'], ['interests', 'Interests', 'text'], ['offline', 'Where they spend time offline', 'text'], ['online', 'Where they spend time online', 'text'], ['follows', 'Accounts they follow', 'text'], ['media', 'Media they read or watch', 'text']] },
      { id: 'faqs', label: 'The 10 questions customers ask most', type: 'long', help: 'Most common first.' },
      { id: 'should_ask', label: 'The 10 questions customers SHOULD be asking', type: 'long' },
      { id: 'faq_videos', label: 'Do you have videos answering these? How many?', type: 'text' },
    ] },
  { id: 'brand', title: 'Your brand', intro: 'How you look and sound, and what to never do.',
    fields: [
      { id: 'brand_guide', label: 'Brand guide', type: 'file', why: 'Keeps every ad on brand from day one.' },
      { id: 'logo', label: 'High-res logo', type: 'file', help: 'PNG with a transparent background, at least 1200px wide, or an EPS.' },
      { id: 'fonts', label: 'Brand fonts', type: 'list', cols: [['use', 'Used for', 'text'], ['font', 'Font', 'text']], seed: [{ use: 'Wordmark / title' }, { use: 'Headers' }, { use: 'Body' }] },
      { id: 'colors', label: 'Brand colours', type: 'list', help: 'Hex codes, like #13202B.', cols: [['use', 'Used as', 'text'], ['hex', 'Hex code', 'text']], seed: [{ use: 'Primary' }, { use: 'Secondary' }, { use: 'Tertiary' }] },
      { id: 'emojis', label: 'Emojis you use on social', type: 'text' },
      { id: 'dos_donts', label: "Messaging do's and don'ts", type: 'long', why: 'The fastest way to avoid an ad you would never approve.' },
      { id: 'admired', label: 'Brands you look up to, and why', type: 'list', cols: [['name', 'Brand', 'text'], ['why', 'Why', 'text']] },
      { id: 'press', label: 'Press or articles about you', type: 'long', help: 'Links, one per line.' },
    ] },
  { id: 'market', title: 'Competitors and content', intro: 'Who you are up against, and what you already have to work with.',
    fields: [
      { id: 'competitors', label: 'Your competitors', type: 'list', why: 'We study their ads and their bad reviews to find the openings.',
        cols: [['name', 'Brand', 'text'], ['strengths', 'What they do well', 'text'], ['weaknesses', 'Where they fall short', 'text'], ['win', 'How you beat them', 'text']] },
      { id: 'best_posts', label: 'Your 5 favourite organic posts', type: 'long', help: 'Links, one per line.' },
      { id: 'worst_posts', label: 'Your 5 least favourite posts', type: 'long', help: 'Links, one per line.' },
      { id: 'best_ads', label: 'The 5 best ads you have run', type: 'long', help: 'Ideally 3 videos and 2 statics. Links, one per line.' },
      { id: 'influencers', label: 'Influencers that fit your brand', type: 'list', cols: [['handle', 'Handle', 'text'], ['notes', 'Notes', 'text']] },
      { id: 'content_counts', label: 'The content you already have', type: 'list', why: 'Tells us what we can launch with before anything new is shot.',
        cols: [['kind', 'Kind', 'text'], ['videos', 'Videos', 'number'], ['stills', 'Stills', 'number']],
        seed: [{ kind: 'Product-focused' }, { kind: 'Lifestyle' }, { kind: 'Customer-made (UGC)' }, { kind: 'Testimonials' }, { kind: 'Evergreen short social videos' }, { kind: 'High-production / editorial' }] },
      { id: 'ugc_rights', label: 'Can we use your UGC and social posts in ads? Any restrictions?', type: 'long' },
      { id: 'ugc_how', label: 'How do you collect customer content?', type: 'text' },
      { id: 'reviews_tool', label: 'How do you collect reviews?', type: 'text', help: 'For example Judge.me, Okendo, Yotpo.' },
      { id: 'strategy_doc', label: 'Documented marketing strategy? Link it here', type: 'url' },
      { id: 'content_calendar', label: 'Do you keep a content calendar?', type: 'yesno' },
      { id: 'post_freq', label: 'How often you post', type: 'text', help: 'For example: Instagram 3-5 a week, Facebook 3 a week.' },
      { id: 'shoots', label: 'How often you do photoshoots, and what kind', type: 'text' },
      { id: 'comments', label: 'Do you reply to comments on posts and ads?', type: 'yesno' },
      { id: 'cro', label: 'Website testing (CRO): tool and who owns it', type: 'text' },
    ] },
  /* Access, word for word from the client's Asana "Client Responsible" tasks and
     the Looms on them (2026-09-25). `steps`, `copy` and `loom` render as a how-to
     under the tick box. We never take a password: the client invites us. */
  { id: 'access', title: 'Access', intro: 'Invite us from inside each platform, then tick it off. Each one has the exact clicks and a short video. Skip any platform you do not use.',
    fields: [
      { id: 'acc_meta', label: 'Meta (Facebook and Instagram)', type: 'check', loom: LOOM.meta,
        steps: [
          'Go to business.facebook.com/settings and pick your business.',
          'Open Users > Partners, click Add, then "Give a partner access to your assets".',
          'Paste our Business ID (below) and click Next.',
          'Tick every asset you have and give each one Full control: Pages, ad accounts, pixels and datasets, the Instagram account, catalogs, commerce accounts, custom conversions, domains, offline event sets, block lists, apps and creative folders.',
          'Click Save changes once, at the end.',
        ],
        copy: [['Our Meta Business ID', MOBIUS.bmId]] },
      { id: 'acc_google', label: 'Google Ads', type: 'check', loom: LOOM.google,
        steps: [
          'Go to ads.google.com, open Tools and settings (Admin), then Access and security.',
          'Open the Security tab, find Allowed domains, add our domain (below) and click Save. Without this step Google blocks our invites.',
          'Go back to the Users tab, click the + button and add both of our emails.',
          'Choose Admin access and click Send invitation.',
        ],
        copy: [['Our domain', MOBIUS.domain], ...MOBIUS.team] },
      { id: 'shopify_url', label: 'Your Shopify store address', type: 'text', help: 'The one that ends in .myshopify.com. You can see it in Shopify under Settings > Domains.',
        why: 'We send you a collaborator request from our side, so you never have to make us an account.' },
      { id: 'shopify_code', label: 'Your collaborator request code, if you have one', type: 'text', help: 'Shopify > Settings > Users > Security, under Collaborators. Leave empty if it says anyone can send a request.' },
      { id: 'acc_shopify', label: 'Shopify: approve our collaborator request', type: 'check',
        steps: ['Once you add your store address above, we send the request.', 'You get an email from Shopify. Open it and click Approve (Settings > Users also shows it). That is it.'] },
      { id: 'acc_tw', label: 'Triple Whale (or the attribution tool you use)', type: 'check',
        steps: ['Open Settings > Users and click Invite.', 'Add both of our emails with the Admin role.'], copy: MOBIUS.team },
      { id: 'acc_klaviyo', label: 'Klaviyo (or the email tool you use)', type: 'check',
        steps: ['In Klaviyo: Settings > Users > Add new user.', 'Add our email with the Admin role.'], copy: [MOBIUS.team[0]] },
      { id: 'acc_tiktok', label: 'TikTok Ads, if you run them', type: 'check',
        steps: ['In TikTok Business Center: Users > Invite member.', 'Add both of our emails as Admin, and share the ad account with Full access.'], copy: MOBIUS.team },
      { id: 'acc_notes', label: 'Anything else we should know?', type: 'long' },
    ] },
];

/* Break-even per order = AOV minus product cost minus shipping you pay. */
function calc(id, a) {
  if (id !== 'breakeven') return null;
  const aov = +a.aov, cogs = +a.cogs || 0, ship = +a.ship_cost || 0;
  if (!(aov > 0)) return null;
  return Math.round((aov - cogs - ship) * 100) / 100;
}

/* The persona question set: the sheet's persona tab plus Schwartz, RMBC and the
   four forces. The AI answers every one; the staff edit screen shows every one. */
const PERSONA_Q = [
  ['summary', 'Who they are, in one line'],
  ['demo', 'Age, gender, location'],
  ['buys', 'What they buy'],
  ['desire', 'What they want, in their words'],
  ['struggle', 'Day-to-day struggles'],
  ['identity', 'How they want others to see them'],
  ['status', 'The status they want to reach'],
  ['how_helps', 'How the product gets them there'],
  ['beliefs', 'Beliefs we have to overcome'],
  ['objections', 'Top objections before buying'],
  ['tried_failed', 'What they tried that failed, and why'],
  ['not_tried', 'What they have not tried yet'],
  ['trigger', 'The moment they start looking'],
  ['push', 'Push: what frustrates them now'],
  ['pull', 'Pull: what draws them to us'],
  ['anxiety', 'Anxiety: what worries them about switching'],
  ['habit', 'Habit: what they do today instead'],
  ['interests', 'Interests'],
  ['online', 'Where they spend time online'],
  ['offline', 'Where they spend time offline'],
  ['follows', 'Accounts and media they follow'],
  ['words', 'Words and phrases they use'],
];

/* Eugene Schwartz. Awareness decides what the ad opens with; the stage decides
   how much the market has already been promised. */
const AWARENESS = [
  ['most', 'Most aware', 'Knows you and wants it. Lead with the offer.'],
  ['product', 'Product aware', 'Knows you, not convinced. Lead with proof.'],
  ['solution', 'Solution aware', 'Knows the kind of product, not yours. Lead with why yours is different.'],
  ['problem', 'Problem aware', 'Feels the pain, has no answer. Lead with the pain.'],
  ['unaware', 'Unaware', 'Not looking at all. Lead with identity or a story.'],
];
const STAGES = [
  ['1', 'Stage 1: first to say it', 'Just state the claim.'],
  ['2', 'Stage 2: others say it too', 'Make the claim bigger.'],
  ['3', 'Stage 3: claims are worn out', 'Introduce a new mechanism.'],
  ['4', 'Stage 4: mechanisms are copied', 'A better mechanism.'],
  ['5', 'Stage 5: heard it all', 'Identity. Sell who they become.'],
];

const api = { STEPS, calc, PERSONA_Q, AWARENESS, STAGES, MOBIUS, LOOM };
if (typeof window !== 'undefined') window.MOBIUS_ONBOARD = api;
if (typeof globalThis !== 'undefined') globalThis.MOBIUS_ONBOARD = api;
})();
