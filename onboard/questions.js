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
  adsMcc: '556-646-8199',
};
const LOOM = {
  meta: 'https://www.loom.com/share/5775fe7e6ee54ea89927e319a54b7ebd',
  google: 'https://www.loom.com/share/a137cdef52784270bc937d440b4d83b6',
  drive: 'https://www.loom.com/share/a143560ddbfc48dfa956844eb37bca74',
};
const STEPS = [
  /* The rest of the client's Asana "Client Responsible" list. `link: 'drive'` is
     the brand's own Google Drive folder, set in Locus (Brand info > At a glance). */
  { id: 'start', title: 'Getting started', intro: 'The quick admin first. Most of these tick themselves the moment they are done.',
    fields: [
      { id: 'st_invoice', label: 'Pay the first invoice', type: 'check', auto: true, link: 'invoice', help: 'Ticks itself the moment it is paid.', steps: ['It is in your email from Stripe, or open it with the button below. We start once it is paid.'] },
      { id: 'st_agreement', label: 'Sign the agreement', type: 'check', auto: true, link: 'sign', help: 'Ticks itself the moment you sign.', steps: ['Read it and sign it on the page linked below (also in your email).'] },
      { id: 'st_slack', label: 'Join our shared Slack channel', type: 'check', auto: true, help: 'Ticks itself the moment you join.', steps: ['Look for an email from Slack titled "Mobius Digital invited you to a channel" (check spam).', 'Click Accept invitation. If your company uses Slack, pick your workspace; if not, Slack makes you a free login in a minute.', 'The channel is named after your brand. Say hi so we know you are in.', 'Done looks like: the channel in your Slack sidebar. This box ticks itself.'] },
      { id: 'st_call', label: 'Book your strategy call', type: 'check', auto: true, help: 'Ticks itself the moment you book.', steps: ['Pick a time that suits you. We go through this form together on the call.'], go: [['Book the call', MOBIUS.calendly]] },
    ] },
  /* ACCESS (rewritten 2026-11-13, Cole: "full access everywhere, don't cop out with view-only or limited roles";
     "every integration gets its own numbered steps: where to go, what to paste, what it looks like when done"; no
     videos). Each box asks for the HIGHEST role the platform lets a partner have; `note` says why when a platform caps
     it. `na: true` boxes can be answered "We don't use this" (answer '__na'), so nothing reads as optional. */
  { id: 'access', title: 'Access and content', intro: 'This is the one thing we cannot start without, so it comes first. Every box below is needed: invite us from inside each platform with full access, then tick it. Each one has the exact clicks. If a platform truly does not apply to you, tap "We don\'t use this" on it.',
    fields: [
      { id: 'acc_meta', label: 'Meta (Facebook and Instagram): Full control of every asset', type: 'check', na: true,
        steps: [
          'Open business.facebook.com/settings on a computer. If you run more than one business, pick yours at the top left.',
          'In the left menu open Users, then Partners.',
          'Click the blue Add button, then "Give a partner access to your assets".',
          'Paste our Business ID (copy it below) and click Next.',
          'Tick every asset on the list: ad accounts, Pages, pixels and datasets, Instagram accounts and catalogs.',
          'For each one switch on Full control (the top switch, "Manage" for ad accounts). Not partial access.',
          'Click Save changes.',
          'Done looks like: Mobius Digital listed under Users > Partners, with every asset showing Full control. We add our team on our side.'],
        copy: [['Our Meta Business ID', MOBIUS.bmId]] },
      { id: 'gads_id', label: 'Google Ads: your customer ID', type: 'text', na: true, help: 'The 10-digit number at the top right of Google Ads.',
        why: 'We send a request from the Mobius manager account. Accepting it gives our team full access, with no separate invites.',
        how: ['Go to ads.google.com and sign in.', 'Look at the top right, next to your name: a 10-digit number in three groups.', 'If you have more than one account, click the account picker and choose the one for this brand.', 'Copy that number here.'], example: '123-456-7890' },
      { id: 'acc_gads_link', label: 'Google Ads: accept our manager link (full access)', type: 'check', na: true,
        steps: [
          'Add your customer ID above first. We send our request from the Mobius manager account (ID below).',
          'In Google Ads click Admin (the gear icon, left menu).',
          'Click Access and security, then the Managers tab.',
          'Find the request from Mobius Digital and click Accept. A manager link is full access: we can run and change everything.',
          'Done looks like: Mobius Digital in the Managers tab with the status Active.'],
        copy: [['Our Google Ads manager ID', MOBIUS.adsMcc]] },
      { id: 'acc_ga4', label: 'Google Analytics: Administrator', type: 'check', na: true,
        steps: [
          'Go to analytics.google.com and pick this website\'s property (top left).',
          'Click Admin, the gear at the bottom left.',
          'Under Account, click Account access management (this covers every property; use Property access management if you only own the property).',
          'Click the blue + at the top right, then Add users.',
          'Paste our email (copy it below) and tick Administrator. Not Editor, Analyst or Viewer.',
          'Click Add.',
          'Done looks like: our email in the list with the role Administrator.'],
        copy: [MOBIUS.team[0]] },
      { id: 'acc_gsc', label: 'Google Search Console: Full user (the highest a partner can be added as)', type: 'check', na: true,
        steps: [
          'Go to search.google.com/search-console and pick your website (top left).',
          'Click Settings at the bottom of the left menu, then Users and permissions.',
          'Click Add user, paste our email (below), set Permission to Full (not Restricted) and click Add.',
          'Done looks like: our email in the list with the permission Full.',
          'Why not Owner: Search Console only makes someone an owner when they verify the site themselves. Full lets us see and do everything we need.'],
        copy: [MOBIUS.team[0]] },
      { id: 'acc_gtm', label: 'Google Tag Manager: Administrator and Publish', type: 'check', na: true,
        steps: [
          'Go to tagmanager.google.com and open the account for this website.',
          'Click Admin at the top, then User Management (under Account).',
          'Click the blue +, then Add users, and paste our email (below).',
          'Set Account permissions to Administrator.',
          'Under Container permissions, set each container to Publish (the highest).',
          'Click Invite.',
          'Done looks like: our email under User Management with Administrator.',
          'No Tag Manager on your site? Tap "We don\'t use this".'],
        copy: [MOBIUS.team[0]] },
      { id: 'acc_clarity', label: 'Microsoft Clarity: Admin', type: 'check', na: true,
        steps: [
          'No Clarity yet? In Shopify open Apps, search the Shopify App Store for "Microsoft Clarity", install it (free) and follow the two set-up screens.',
          'Go to clarity.microsoft.com and open this website\'s project.',
          'Click Settings, then Team, then Add team member.',
          'Paste our email (below), choose Admin (not Member) and click Add.',
          'Done looks like: our email under Team with the role Admin.'],
        copy: [MOBIUS.team[0]] },
      { id: 'shopify_url', label: 'Shopify: your store address', type: 'text', help: 'The one that ends in .myshopify.com.',
        why: 'We send you a collaborator request from our side, so you never have to make us an account.',
        how: ['Open your Shopify admin.', 'Click Settings at the bottom left, then Domains.', 'Copy the address that ends in .myshopify.com. That is the one we need, not your normal website address.', 'Quicker way: look at the browser address bar in your Shopify admin. It shows admin.shopify.com/store/yourstore; your address is yourstore.myshopify.com.'], example: 'yourstore.myshopify.com' },
      { id: 'shopify_code', label: 'Shopify: your collaborator request code, if your store uses one', type: 'text', help: 'Leave it empty if your store lets anyone send a request.',
        how: ['Open your Shopify admin and click Settings at the bottom left.', 'Click Users (on some stores: Users and permissions).', 'Scroll down to Collaborators.', 'If it says "Anyone can send a collaborator request", leave this box empty.', 'If it says "Only people with a collaborator request code", copy the 4-digit code shown there.'], example: '4821' },
      { id: 'acc_shopify', label: 'Shopify: approve our collaborator request with every permission', type: 'check',
        steps: [
          'Add your store address above first. We send the request from our Shopify Partner account, asking for every permission.',
          'Shopify emails the store owner: open it and click Review request (or in Shopify go to Settings, then Users, and find Mobius Digital under Collaborators).',
          'Leave every permission ticked. Do not untick any: we need full access to run ads, fix tracking and build pages.',
          'Click Accept access.',
          'Done looks like: Mobius Digital listed under Settings > Users > Collaborators.'] },
      { id: 'acc_tw', label: 'Triple Whale: Admin for both of us', type: 'check', na: true,
        steps: [
          'Go to app.triplewhale.com and pick this store at the top left.',
          'Click the gear (Settings) at the bottom left, then Users.',
          'Click Invite user and paste the first email below. Set the role to Admin (not Member or Viewer) and send.',
          'Do the same for the second email.',
          'Done looks like: both emails in the Users list with the role Admin.',
          'Use a different attribution tool? Invite the same two emails as admins there, and tell us in the last box.'],
        copy: MOBIUS.team },
      { id: 'acc_klaviyo', label: 'Klaviyo: Admin', type: 'check', na: true,
        steps: [
          'Go to klaviyo.com and log in. If you have more than one account, switch to this brand (click your name at the bottom left).',
          'Click your name at the bottom left, then Settings, then Users.',
          'Click Add new user and paste our email (below).',
          'Choose Admin. It is the highest role Klaviyo lets you give someone else (Owner can only be one person).',
          'Click Send invite.',
          'Done looks like: our email under Users with the role Admin.',
          'Use a different email tool? Invite our email as an admin there, and tell us in the last box.'],
        copy: [MOBIUS.team[0]] },
      { id: 'acc_tiktok', label: 'TikTok Ads: Admin, and the ad account with Admin access', type: 'check', na: true,
        steps: [
          'Go to business.tiktok.com and open your Business Center.',
          'Click Users in the left menu, then Members, then Invite member.',
          'Paste both of our emails (below), choose Admin and send the invite.',
          'Then click Assets, then Advertiser accounts, and pick this brand\'s ad account.',
          'Click Assign member, choose our emails and give Admin (full) access.',
          'Done looks like: both emails under Members as Admin, and listed on the ad account with Admin.'],
        copy: MOBIUS.team },
      { id: 'content_link', label: 'Your content library: where your photos, videos and past ads live', type: 'url',
        why: 'Share it with us as it is. You do not need to move or re-upload anything.',
        how: ['Google Drive: right-click the folder, click Share, then Copy link.', 'Dropbox: hover the folder, click Share, then Copy link.', 'Frame.io or anything else: open the share option on the folder and copy the link.', 'Paste the link here.'], example: 'https://drive.google.com/drive/folders/1AbC...' },
      { id: 'content_shared', label: 'Your content library: share it with us as Editor', type: 'check',
        steps: [
          'Open the same folder\'s Share settings (Google Drive: right-click > Share. Dropbox: Share).',
          'Paste both of our emails (below).',
          'Set the access to Editor (Dropbox: Can edit). Not Viewer: we add finished ads and organise files.',
          'Click Send (Dropbox: Share).',
          'Done looks like: both emails listed on the folder as Editor.'],
        copy: MOBIUS.team },
      { id: 'st_drive', label: 'Files that are not in your library? Send them to your folder with us', type: 'check', link: 'drive',
        steps: [
          'Open the folder with the button below. It is called From the client.',
          'Drag in anything we could use in ads: videos, photos, GIFs, past ads, product shots, lifestyle and model shoots, customer videos (UGC).',
          'Sort it into folders if you can (past ads, product shoots, lifestyle, videos, UGC). It gets your ads live sooner.'] },
      { id: 'acc_notes', label: 'Anything else we should know? (a platform you use that is not listed, or one you do not use)', type: 'long' },
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
      { id: 'approver', label: 'Who approves ads on your side, and how fast?', type: 'text', why: 'So nothing sits waiting. Add the rest of your team in Slack once you are in.' },
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
      { id: 'ad_spend', label: 'What you spend on ads per month right now', type: 'money', help: 'All platforms together. Roughly is fine.' },
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
      { id: 'bundle_upsell', label: 'Buy more, save more?', type: 'text', help: 'Buy 2 for 5% off, buy 3 for 10% off.' },
      { id: 'upsell_bundle', label: 'Bundles that pair products', type: 'text' },
      { id: 'returning_offers', label: 'Offers or campaigns for existing customers', type: 'text' },
      { id: 'reorder_cycle', label: 'How often do customers reorder?', type: 'text' },
      { id: 'loyalty', label: 'Loyalty program', type: 'text' },
      { id: 'success_90', label: 'What would make the next 90 days a success?', type: 'long', why: 'We plan the first quarter around this, so say it in your own words.' },
      { id: 'tried_failed', label: 'What have you tried in ads that did not work?', type: 'long', help: 'Past agencies, angles, offers, channels. Saves us repeating it.' },
      { id: 'key_dates', label: 'Launches, sales and key dates coming up', type: 'long', help: 'One per line, with the date if you know it.' },
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
    ] },
  { id: 'brand', title: 'Your brand', intro: 'How you look and sound, and what to never do.',
    fields: [
      { id: 'brand_guide', label: 'Brand guide', type: 'file', why: 'Keeps every ad on brand from day one.' },
      { id: 'logo', label: 'High-res logo', type: 'file', help: 'PNG with a transparent background, at least 1200px wide, or an EPS.' },
      { id: 'fonts', label: 'Brand fonts', type: 'list', cols: [['use', 'Used for', 'text'], ['font', 'Font', 'text']], seed: [{ use: 'Wordmark / title' }, { use: 'Headers' }, { use: 'Body' }] },
      { id: 'colors', label: 'Brand colours', type: 'list', help: 'Hex codes, like #13202B.', cols: [['use', 'Used as', 'text'], ['hex', 'Hex code', 'text']], seed: [{ use: 'Primary' }, { use: 'Secondary' }, { use: 'Tertiary' }] },
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
      { id: 'comments', label: 'Do you reply to comments on posts and ads?', type: 'yesno' },
    ] },
  /* 2026-10-15 audit: VIP segments and reorder reminders are read from Klaviyo directly now, and dates live in the
     Locus calendar, so those three questions are gone. Old answers stay in answers_json. */
  { id: 'extras', title: 'Nice to have', intro: 'Optional. Skip anything you do not have to hand.',
    fields: [
      { id: 'faq_videos', label: 'Do you have videos answering these? How many?', type: 'text' },
      { id: 'emojis', label: 'Emojis you use on social', type: 'text' },
      { id: 'post_freq', label: 'How often you post', type: 'text', help: 'For example: Instagram 3-5 a week, Facebook 3 a week.' },
      { id: 'shoots', label: 'How often you do photoshoots, and what kind', type: 'text' },
      { id: 'cro', label: 'Website testing (CRO): tool and who owns it', type: 'text' },
      { id: 'gift_threshold', label: 'Free gift or discount over a certain spend', type: 'text', help: 'For example: free hat over $150.' },
      { id: 'bolt_ons', label: 'Add-ons at checkout', type: 'text', help: 'Gift wrap, priority shipping, a small extra.' },
      { id: 'post_purchase', label: 'One-click upsell after purchase', type: 'text' },
      { id: 'custom', label: 'Engraving, monogramming or customisation', type: 'text' },
      { id: 'referral', label: 'Referral or affiliate program', type: 'text' },
      { id: 'subscription', label: 'Could a subscription work?', type: 'text' },
    ] },
];

/* SHOW ME HOW (2026-11-13, Cole): "it shouldn't be a video anymore, it should just tell them exactly how", and the
   "I'm not sure" button should give them the resource. Every field that needs looking up gets `how` (the exact clicks,
   numbered) and `example` (what the answer looks like); the form shows them in a "Show me how" drop-down. Tick boxes
   keep their numbered `steps`, rewritten here click by click, and no field links a video any more (`loom` dropped). */
const HOW = {
  /* You and your team */
  company: { example: 'Synergy Labs' },
  website: { example: 'https://yourbrand.com' },
  contact_phone: { example: '(555) 123-4567' },
  socials: { how: ['Open each profile and copy the link from the address bar, or type the handle.'], example: 'Instagram: @yourbrand' },
  approver: { example: 'Jane, usually the same day' },
  /* Products */
  best_sellers: { how: ['In Shopify open Analytics, then Reports, then "Sales by product".', 'Set the dates to the last 90 days.', 'The top 3 to 5 rows are your best sellers. Stock is on each product page under Inventory.'], example: 'Water Additive · $29.99 · 1,200 · 3 weeks · Yes' },
  product_count: { how: ['In Shopify open Products: the count is at the bottom of the list (active products only).'], example: '36' },
  /* Numbers */
  ad_spend: { how: ['Meta: in Ads Manager set the dates to Last 30 days and read "Amount spent" at the bottom of the Campaigns table.', 'Google: in Google Ads, Campaigns, Last 30 days, the Cost total.', 'Add the platforms together.'], example: '8000' },
  aov: { how: ['In Shopify open Analytics, set the dates to the last 90 days.', 'Read the "Average order value" card. No card? Divide total sales by orders for the same dates.'], example: '42.50' },
  cogs: { how: ['What you pay your supplier for the products in one average order, delivered to you (landed).', 'Shopify shows it if you filled in "Cost per item" on each product: Analytics, Reports, "Profit by product".'], example: '11.00' },
  ship_cost: { how: ['What you pay the carrier and the warehouse for one average order. Your 3PL or carrier invoice divided by orders shipped.'], example: '6.50' },
  target_cpa: { example: '20' },
  /* Offers */
  codes: { how: ['In Shopify open Discounts: every active code is listed with its value.'], example: 'WELCOME15: 15% off first order' },
  free_ship: { how: ['In Shopify open Settings, then Shipping and delivery, then your shipping zone: look for a free rate with a minimum order.'], example: '50' },
  key_dates: { example: 'Nov 27: Black Friday sale\nFeb 1: new flavour launch' },
  /* Customers */
  persona_doc: { how: ['Open the doc, click Share, set General access to "Anyone with the link", then Copy link.'], example: 'https://docs.google.com/document/d/...' },
  faqs: { how: ['Look at your customer service inbox, product reviews and Instagram comments for the questions that come up again and again.'] },
  /* Brand */
  brand_guide: { how: ['A PDF or doc with your logo rules, colours and fonts. No guide? Skip it and add the logo, fonts and colours below.'] },
  logo: { how: ['A PNG with a transparent background, at least 1200px wide, or the EPS/SVG from your designer.'] },
  fonts: { how: ['Ask your designer, or open your website, right-click a heading, choose Inspect and look for font-family.'], example: 'Headers: Montserrat Bold' },
  colors: { how: ['Ask your designer, or use a free colour picker browser extension on your website.'], example: '#13202B' },
  press: { example: 'https://www.forbes.com/...' },
  /* Competitors and content */
  best_posts: { how: ['Instagram: open the post, tap the three dots, then Copy link.', 'TikTok: open the video, tap Share, then Copy link.', 'Paste one link per line.'], example: 'https://www.instagram.com/p/C1a2B3c4D5e/' },
  worst_posts: { how: ['Same as above: open the post, three dots or Share, Copy link. One per line.'], example: 'https://www.tiktok.com/@yourbrand/video/7301234567890' },
  best_ads: { how: ['In Meta Ads Manager tick the ad, click Preview (the eye icon), then Share and Copy link.', 'Or find it in the Meta Ad Library (facebook.com/ads/library) and copy that link.', 'One per line.'], example: 'https://fb.me/adspreview/...' },
  reviews_tool: { how: ['In Shopify open Apps: your reviews app is in the list (Judge.me, Okendo, Yotpo, Loox, Stamped).'], example: 'Judge.me' },
  strategy_doc: { how: ['Open the doc, click Share, set General access to "Anyone with the link", then Copy link.'] },
};
for (const s of STEPS) for (const f of s.fields) if (HOW[f.id]) { Object.assign(f, HOW[f.id]); if (f.loom === null) delete f.loom; }

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
