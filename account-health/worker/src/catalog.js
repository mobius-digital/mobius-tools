/* THE MESSAGE CATALOG (2026-11-26). One entry per distinct message Locus sends: Slack posts, DMs, client posts,
 * emails and the creator Discord posts, and the edits of messages already sent. test-catalog.mjs scans every send
 * call site in account-health/worker/src and profit/worker/src (RAW_SENDS and SEND_CALLS below) and fails when one is
 * not mapped here (SITES), when a mapped site no longer exists, or when a site points at an id that is not in the
 * catalog. The scan reads the code line by line, so a send hidden behind a helper it does not know would pass: a new
 * send helper goes in SEND_CALLS (and TRANSPORTS) in the same change.
 *
 * Each entry:
 *   id, group (the plain groups of the automation decisions), name, channel ('Slack DM' | 'internal channel' |
 *   'client channel' | 'email' | 'Discord', or two joined with ' or '), who (who gets it), when (trigger and timing in
 *   plain words), why (one sentence), kind (a sender.js SENDER_KINDS key, or null with fromNote), fixedFrom ('locus'
 *   when the code always sends as the app whatever the setting says), status ('keep' | 'move' | 'off after Dec 2' |
 *   'parked'), audit (the automation id, a1 to a67, when it has one), onRenderer (true when its code builds the
 *   message with house.js houseMessage, directly or through lane.js laneBlocks / lanePost), where (file:function
 *   list), example() (the message drawn in the house style from MADE UP numbers and names; for a message not on the
 *   renderer yet, what it WOULD look like).
 *
 * Status, from the decisions: "keep in Slack" and "agency switch" = keep; "move to Locus" and "keep in Locus" (a
 * message that becomes a Locus line, Slack only if the person picks it) = move; "delete" = off after Dec 2 (nothing
 * that warns about money or a client send changes before then); "park" = parked (code kept, hidden).
 *
 * GET /api/messages/catalog (owner only) answers catalogPayload(). No real client, number or email in here. */

import { houseMessage } from './house.js';
import { dailyCard } from './clientpost.js';
import { laneBlocks } from './lane.js';
import { deliveryMessage } from './delivery.js';
import { alertCard } from './pulse.js';
import { SENDER_KINDS, resolveSenders } from './sender.js';

export const STATUS = ['keep', 'move', 'off after Dec 2', 'parked'];
export const GROUPS = [
  'Client reports and updates',
  'Alerts when something breaks',
  'Ad calls and the War Room',
  'Team day (plans, check-ins, tasks, meetings)',
  'Creator program (Mobius only)',
  'Social posting and site reviews',
  'Old features we no longer run',
  'Answers and tools on request',
];
const [CLIENT, ALERTS, ADS, TEAM, CREATORS, SOCIAL, OLD, ASKED] = GROUPS;

/* Made up, for the examples only. */
const AT = new Date('2026-11-26T20:10:00Z');           // 2:10pm Central
const B1 = 'Northlake Golf', B2 = 'Pine Ridge Apparel', B3 = 'Summit Socks Co';
const U1 = 'U0SAMPLE1', U2 = 'U0SAMPLE2';
const OPEN = (label = 'Open in Locus') => ({ label, url: 'https://example.test/locus' });
const hm = o => houseMessage({ at: AT, now: AT, ...o });
const lane = o => laneBlocks(o);

const E = (id, group, name, o) => ({ id, group, name, ...o });

export const CATALOG = [
  /* ---------------- Client reports and updates ---------------- */
  E('client_daily', CLIENT, 'Client daily update', {
    channel: 'client channel', who: 'The client', kind: 'client_daily', status: 'keep', audit: 'a17', onRenderer: true,
    when: 'Each morning for yesterday, when Cole taps Send (or auto post is on). A missed day of the last two gets its own post; ad spend by channel goes in the thread. A draft the team edited goes out as their text.',
    why: 'The client sees yesterday and the month so far against the goal without opening anything.',
    where: ['worker.js:sendBrief', 'worker.js:editClientPost'],
    /* The real renderer (clientpost.js dailyCard, 2026-11-26), drawn from made up numbers. */
    example: () => { const { text, blocks } = dailyCard({ brand: B1, date: '2026-11-25', today: '2026-11-26', at: AT, now: AT,
      day: { sales: 3240, spend: 1200, mer: 2.70, amer: 1.35, plan: 3000 }, month: { ym: '2026-11', sales: 61200, plan: 75000, spend: 24000, new_rev: 30100 },
      others: [3900, 2800], next: 'Black Friday ads go live tonight at 6pm.' }); return { text, blocks }; } }),
  E('client_daily_thread_failed', CLIENT, 'Client daily thread did not post', {
    channel: 'internal channel', who: 'Cole', kind: 'internal_alert', status: 'move', audit: 'a23', onRenderer: true,
    when: 'Right after a client daily went out but its thread reply failed.',
    why: 'Someone posts the full numbers under the daily by hand so the client is not missing them.',
    where: ['worker.js:sendBrief'],
    example: () => lane({ lane: 'CLIENT', brand: B1, who: U1, ask: "Post the full brief in the thread under today's client daily by hand", why: 'the daily went out but its thread did not' }) }),
  E('client_report', CLIENT, 'Weekly and monthly client report', {
    channel: 'client channel', who: 'The client', kind: 'client_report', status: 'keep', audit: 'a18', onRenderer: false,
    when: 'Mondays after the team call (weekly) and the 1st (monthly), when Cole taps Send. A report with no approved read is refused.',
    why: 'It is the client product: our read, the numbers against the period before, our work and what we need from them.',
    where: ['worker.js:sendReport'],
    example: () => hm({ title: `${B1} · Weekly report, Nov 16 to 22`, summary: 'Sales up 12% on 8% less ad spend, so each ad dollar brought back more.',
      numbers: [{ label: 'Sales', value: '$18,400', note: 'up 12%' }, { label: 'Ad spend', value: '$6,900', note: 'down 8%' }, { label: 'MER (whole store)', value: '2.67x', note: 'was 2.21x' }],
      lines: ['Our work: 9 new ads launched, 6 changes to your ads', 'This week: Black Friday ads go live Thursday', 'We need from you: product photos for the gift guide'],
      source: 'Triple Whale', buttons: [OPEN('Open the full report')] }) }),
  E('client_checkin', CLIENT, 'Black Friday client check-in update', {
    channel: 'client channel', who: 'The client', kind: 'client_checkin', status: 'keep', audit: 'a36', onRenderer: false,
    when: 'After each War Room check-in, when Cole taps Send or Send all. Runs through Dec 4, the last sale day.',
    why: 'The client sees how the sale is going since the last check-in, today and this week.',
    where: ['standing.js:sendDraft'],
    example: () => hm({ title: `${B1} · Black Friday, 2pm check-in`, summary: 'Ahead of goal today. We raised the Black Friday budget from $400 to $600 a day.',
      numbers: [{ label: 'Since last check-in', value: '$2,180 sales · 3.10x MER' }, { label: 'Today', value: '$4,050 sales · 2.85x MER' }, { label: 'This week', value: '$22,600 sales · 2.70x MER' }],
      source: 'Triple Whale', context: 'goal 2.50x MER', status: 'good' }) }),
  E('client_approve_card', CLIENT, 'Client Approve button on a budget raise', {
    channel: 'client channel', who: 'The client (one brand that asked to approve raises)', kind: 'client_checkin', status: 'keep', audit: 'a37', onRenderer: false,
    when: 'With a check-in update that carries a raise waiting on the client. Runs through Dec 4.',
    why: 'The client decides on their own budget raise with one tap.',
    where: ['standing.js:sendDraft'],
    example: () => hm({ title: `${B3} · raise waiting on you`, summary: 'Black Friday is ahead of goal. Approve the raise and it goes live in Meta right away.',
      numbers: [{ label: 'Now', value: '$300 a day' }, { label: 'Raise to', value: '$450 a day' }],
      source: 'Triple Whale', buttons: [{ label: 'Approve $300 to $450', action_id: 'ws_capprove', style: 'primary', value: 'sample' }] }) }),
  E('client_checkin_card', CLIENT, 'Picture card on a client check-in update', {
    channel: 'client channel', who: 'The client', kind: 'client_checkin', status: 'keep', audit: 'a36', onRenderer: false,
    when: 'On top of a check-in update when the client picture card switch is on (off by default). Uploaded as the sender and shared only by the post; a failed card sends the text update alone.',
    why: 'The client sees the check-in numbers as one picture at a glance.',
    where: ['standing.js:userPng', 'standing.js:sendDraft'],
    example: () => hm({ title: `${B1} · Black Friday, 2pm check-in`, summary: 'The picture card sits above the update: sales, MER and spend since the last check-in.',
      image: { url: 'https://example.test/checkin-card.png', alt: 'Check-in picture card' }, source: 'Triple Whale' }) }),
  E('client_approve_done', CLIENT, 'Done, it is live in Meta', {
    channel: 'client channel', who: 'The client who tapped Approve', kind: null, fixedFrom: 'locus', fromNote: 'Always Locus (War Room code)', status: 'keep', audit: 'a37', onRenderer: false,
    when: 'Right after the client taps Approve and the raise goes through, in the thread.',
    why: 'The client knows their tap worked.',
    where: ['standing.js:handleClientUpdateButton'],
    example: () => hm({ title: 'Done, it is live in Meta', summary: `${B3} Black Friday budget is now $450 a day.`, source: 'Meta' }) }),
  E('client_update', CLIENT, '"What we did" update', {
    channel: 'client channel', who: 'The client', kind: 'client_update', status: 'keep', onRenderer: false,
    when: 'When Cole taps Post on the what we did screen after the ad calls.',
    why: 'The client hears in plain words what we changed in their ads and why.',
    where: ['buyerlist.js:handleBuyer@/api/buyer-list/what-we-did'],
    example: () => hm({ title: `${B2} · What we did today`, lines: ['Turned off two ads that spent $180 with no sales', 'Raised the gift set budget from $80 to $100 a day', 'Loaded 4 new holiday ads'], source: 'Meta' }) }),
  E('client_recap', CLIENT, 'Client call recap', {
    channel: 'client channel', who: 'The client', kind: 'client_recap', status: 'keep', onRenderer: false,
    when: 'When a client call is finished and the recap is ticked to post.',
    why: 'Everyone leaves the call with the same list of decisions and asks.',
    where: ['callscreen.js:finishCall'],
    example: () => hm({ title: `${B2} · Call recap, Nov 24`, lines: ['Gift guide ads go live Dec 1', 'You send the new product photos by Friday', 'We test a bundle offer next week'] }) }),
  E('client_outage', CLIENT, 'Platform outage note to clients', {
    channel: 'client channel', who: 'Every client channel', kind: 'client_outage', status: 'move', audit: 'a30', onRenderer: true,
    when: 'When Cole taps Send to all clients on an outage card.',
    why: 'Clients hear from us first when a platform problem explains a drop.',
    where: ['pulse.js:pulseButton'],
    example: () => alertCard({ id: 'shopify', short: 'Shopify', link: 'https://example.test/status' }, [{ service: 'Checkout', to: 'outage', note: 'Checkout is failing for some stores' }], { at: AT, now: AT }) }),
  E('client_post', CLIENT, 'Strategist post in a channel', {
    channel: 'client channel or internal channel', who: 'The client or the team, per the draft', kind: 'client_post', status: 'keep', onRenderer: false,
    when: 'When someone approves a post the Strategist drafted. A client channel needs the owner (or anyone, per the setting).',
    why: 'A drafted message goes out only after a person says yes.',
    where: ['slackwrite.js:postAction'],
    example: () => hm({ title: `${B1} · Holiday shipping dates`, summary: 'Last day to order for delivery by Dec 24 is Dec 17. We set the ads to say so from Dec 10.' }) }),
  E('onboarding_welcome', CLIENT, 'Welcome in the new client channel', {
    channel: 'client channel', who: 'The new client', kind: 'onboarding_slack', status: 'keep', audit: 'a60', onRenderer: false,
    when: 'Once, when the client first joins their Slack channel.',
    why: 'A new client sees their team, their links and what happens next.',
    where: ['newclient.js:welcomeOnJoin'],
    example: () => hm({ title: `Welcome, ${B2}!`, summary: 'This channel is where we talk day to day. Say hi, ask anything, drop files.',
      lines: ['Your team: strategist, media buyer, editor, designer', 'Finish your onboarding link', 'Book the strategy call', 'Then we start: research, first briefs, first ads'] }) }),
  E('onboarding_voice', CLIENT, 'Voice interview ask', {
    channel: 'client channel or email', who: 'The new client', kind: 'onboarding_slack', status: 'keep', audit: 'a60', onRenderer: false,
    when: 'Once, after the client sends the onboarding form. Email when they are not in Slack yet.',
    why: 'The voice interview is how ad copy learns to sound like the brand.',
    where: ['newclient.js:newClientTick'],
    example: () => hm({ title: 'One more thing: your voice interview', summary: 'When you have 20 minutes: you talk, we ask, then you rate a few sample lines.', buttons: [OPEN('Start the interview')] }) }),
  E('onboarding_shopify', CLIENT, 'Please approve our Shopify request', {
    channel: 'client channel or email', who: 'The new client', kind: 'onboarding_slack', status: 'keep', audit: 'a60', onRenderer: false,
    when: 'When the team marks the Shopify collaborator request as sent.',
    why: 'Store access unlocks sales numbers and tracking.',
    where: ['newclient.js:markShopifySent'],
    example: () => hm({ title: `Please approve our Shopify request for ${B2}`, summary: 'Shopify admin, Settings, Users: accept the request from our team.' }) }),
  E('onboarding_form_message', CLIENT, 'Client wrote from the onboarding form', {
    channel: 'internal channel or Slack DM', who: 'Cole', kind: 'team_notice', status: 'keep', audit: 'a60', onRenderer: true,
    when: 'When a new client sends a message from their onboarding form (at most one every 30 seconds).',
    why: 'A new client waiting on an answer gets one fast.',
    where: ['worker.js:handle@/api/onboard-message'],
    example: () => lane({ lane: 'CLIENT', brand: B2, who: U1, ask: 'Answer the message they sent from their onboarding form', why: '"Where do I send the product photos?"' }) }),
  E('email_agreement', CLIENT, 'Agreement email', {
    channel: 'email', who: 'The person who signs for the client', kind: 'onboarding_email', status: 'keep', audit: 'a60', onRenderer: false,
    when: 'When Cole presses Send on the agreement, and again for an updated agreement.',
    why: 'The client signs the services agreement before work starts.',
    where: ['contract.js:gmail'],
    example: () => hm({ title: 'Our services agreement is ready to sign', summary: `Hi Pat, the agreement for ${B2} is ready. It takes two minutes to sign.`, buttons: [OPEN('Review and sign')] }) }),
  E('email_welcome', CLIENT, 'Welcome email', {
    channel: 'email', who: 'The client contact', kind: 'onboarding_email', status: 'keep', audit: 'a60', onRenderer: false,
    when: 'On the welcome step of a new client.',
    why: 'The client gets every first step in one place.',
    where: ['newclient.js:stepEmail'],
    example: () => hm({ title: `Welcome to Mobius, ${B2}`, lines: ['Sign the agreement', 'Fill in the onboarding link', 'Book the strategy call'] }) }),
  E('email_welcome_locus', CLIENT, 'Welcome email with the Locus link', {
    channel: 'email', who: 'The client contact', kind: 'onboarding_email', status: 'keep', audit: 'a60', onRenderer: false,
    when: 'When the team sends the welcome from Get started.',
    why: 'The client signs in to Locus and finishes setup there.',
    where: ['onboard.js:sendWelcome'],
    example: () => hm({ title: `Welcome, ${B2}: your Locus link`, summary: 'Sign in to finish setup: sign and pay, connect your accounts, ten questions.', buttons: [OPEN('Open Locus')] }) }),
  E('email_reminders', CLIENT, 'Sign and onboarding reminder emails', {
    channel: 'email', who: 'The client contact or signer', kind: 'onboarding_email', status: 'keep', audit: 'a60', onRenderer: false,
    when: 'When the agreement or the onboarding link waits unsigned or unfinished.',
    why: 'Setup does not stall on a forgotten email.',
    where: ['newclient.js:sendReminder'],
    example: () => hm({ title: 'A quick reminder: our agreement is ready to sign', summary: 'Whenever you have a few minutes, here is your link.', buttons: [OPEN('Open it')] }) }),
  E('email_get_started_reminder', CLIENT, 'Get started reminder', {
    channel: 'email', who: 'Whoever holds an open setup step', kind: 'onboarding_email', status: 'keep', audit: 'a60', onRenderer: false,
    when: 'Day 3 and day 7 by itself, or when someone taps Remind on a step.',
    why: 'Open setup steps get finished.',
    where: ['onboard.js:onboardTick', 'onboard.js:remind'],
    example: () => hm({ title: `${B2}: 2 setup steps left`, lines: ['Connect Meta', 'Answer the ten questions'], buttons: [OPEN('Finish setup')] }) }),
  E('email_handoff', CLIENT, 'A setup step handed to you', {
    channel: 'email', who: 'The person the client handed a step to', kind: 'onboarding_email', status: 'keep', audit: 'a60', onRenderer: false,
    when: 'When a client hands one setup step to a colleague.',
    why: 'The right person on the client side does the step.',
    where: ['onboard.js:handoff'],
    example: () => hm({ title: `Pat asked you to connect Meta for ${B2}`, summary: 'It takes about five minutes.', buttons: [OPEN('Do it now')] }) }),
  E('email_payer', CLIENT, 'Invoice or agreement to the person who pays or signs', {
    channel: 'email', who: 'The payer or signer the client named', kind: 'onboarding_email', status: 'keep', audit: 'a60', onRenderer: false,
    when: 'When the client names someone else to pay or sign and it is approved.',
    why: 'The first invoice and the agreement reach the person who can act on them.',
    where: ['onboard.js:handleOnboard@/api/onboard/approve-signer'],
    example: () => hm({ title: 'Your invoice from Mobius Digital', summary: `Pat asked us to send you the first invoice for ${B2}.`, buttons: [OPEN('Open the invoice')] }) }),
  E('email_signin_link', CLIENT, 'Sign in link', {
    channel: 'email', who: 'A client login', kind: 'login_email', status: 'keep', onRenderer: false,
    when: 'When someone asks for a sign in link.',
    why: 'A client gets back into Locus without a password.',
    where: ['clients.js:sendSigninLink'],
    example: () => hm({ title: 'Your Locus sign in link', summary: 'It works once, for the next 30 minutes.', buttons: [OPEN('Sign in')] }) }),
  E('email_login_invite', CLIENT, 'Client login invite', {
    channel: 'email', who: 'A person at the client', kind: 'login_email', status: 'keep', onRenderer: false,
    when: 'When the team invites a client login from Agency settings > Clients.',
    why: 'Clients see their own numbers and updates in Locus.',
    where: ['clients.js:handleClients@/api/clients/invite'],
    example: () => hm({ title: `You are invited to ${B2} in Locus`, summary: 'Your numbers, ads and updates in one place.', buttons: [OPEN('Accept the invite')] }) }),
  E('email_signup_code', CLIENT, 'Sign up code', {
    channel: 'email', who: 'The person signing up', kind: null, fromNote: 'The app mail sender when one is set, else Cole\'s mailbox', status: 'keep', onRenderer: false,
    when: 'When someone signs up and asks for a code.',
    why: 'Proves the email address before an account is made.',
    where: ['clients.js:sendCode'],
    example: () => hm({ title: 'Your Locus code', summary: 'Your code is 123 456. It works for 10 minutes.' }) }),
  E('unsent_noon', CLIENT, 'Client updates not sent by noon', {
    channel: 'internal channel', who: 'Cole', kind: 'approval_ask', status: 'move', audit: 'a15', onRenderer: true,
    when: 'Daily at noon, when client updates still wait as drafts.',
    why: 'A client waits on these; the line says which.',
    where: ['worker.js:unsentAtNoonPass'],
    example: () => hm({ title: '3 client updates not sent', lines: [`${B1} daily`, `${B2} daily`, `${B3} weekly report`], buttons: [OPEN('Open To send')] }) }),
  E('draft_daily_card', CLIENT, 'Daily draft card to review', {
    channel: 'internal channel', who: 'Cole', kind: 'approval_ask', status: 'off after Dec 2', audit: 'a16', onRenderer: false,
    when: 'When a daily is drafted, and when it is reset, rewritten or re-posted from the brief card route.',
    why: 'Was the review step before a send; the To send page now has it.',
    where: ['worker.js:draftBrief', 'worker.js:handle@/api/brief-card', 'worker.js:slackSyncBrief', 'worker.js:upgradeCardsOnce'],
    example: () => hm({ title: `${B1} daily draft · Wed Nov 25`, summary: 'Ready to send.', buttons: [{ label: 'Send to client', action_id: 'sample_send', style: 'primary', value: 'sample' }, OPEN()] }) }),
  E('draft_report_card', CLIENT, 'Report draft card to review', {
    channel: 'internal channel', who: 'Cole', kind: 'approval_ask', status: 'off after Dec 2', audit: 'a16', onRenderer: false,
    when: 'When a weekly or monthly report is drafted, and when it is re-posted from the brief card route.',
    why: 'Was the review step before a send; the To send page now has it.',
    where: ['worker.js:postReportDraft', 'worker.js:handle@/api/brief-card', 'worker.js:slackSyncReport'],
    example: () => hm({ title: `${B2} weekly report draft · Nov 16 to 22`, summary: 'Needs a read approved before it can go.', buttons: [OPEN('Open the report')] }) }),
  E('team_copy', CLIENT, 'Daily or report posted to the team channel', {
    channel: 'internal channel', who: 'The team (brands with no client channel)', kind: 'team_notice', status: 'keep', onRenderer: false,
    when: 'When someone taps Post to team on a brand that has no client channel. Never automatic.',
    why: 'The team sees the same daily and report a client would.',
    where: ['worker.js:postBriefToTeam', 'worker.js:postReportToTeam'],
    example: () => hm({ title: `${B3} · Wed Nov 25`, summary: 'Under goal.', numbers: [{ label: 'Yesterday', value: '$820 sales · 1.90x MER', note: 'goal $1,000' }], source: 'Triple Whale' }) }),
  E('client_preview', CLIENT, 'Preview of a client post', {
    channel: 'internal channel', who: 'The team', kind: 'team_notice', status: 'keep', onRenderer: false,
    when: 'On request: the client post preview with post=1.',
    why: 'Shows exactly what the client would see before it goes.',
    where: ['worker.js:handle@/api/client-post/preview'],
    example: () => hm({ title: `Preview: ${B1} daily`, summary: 'Exactly as the client sees it.' }) }),
  E('client_request', CLIENT, 'A client made a request', {
    channel: 'internal channel', who: 'The brand team', kind: 'team_notice', status: 'move', audit: 'a56', onRenderer: true,
    when: 'When a client writes a request, replies, a request is decided or marked done.',
    why: 'A client waits on an answer.',
    where: ['requests.js:handleRequests@/api/requests', 'requests.js:handleRequests@/api/requests/reply', 'requests.js:handleRequests@/api/requests/decide', 'requests.js:handleRequests@/api/requests/done'],
    example: () => lane({ lane: 'CLIENT', brand: B2, who: U1, ask: 'Handle their request: holiday banner on the home page', why: 'asked today, needed by Dec 1' }) }),
  E('card_comment', CLIENT, 'Changes asked on a card, or you were tagged in a comment', {
    channel: 'internal channel or Slack DM', who: 'The card maker or the tagged person', kind: 'team_notice', status: 'move', audit: 'a57', onRenderer: true,
    when: 'When a client asks for changes on a card or someone tags a person in a card comment.',
    why: 'A person waits on the answer.',
    where: ['prodwork.js:notifyComment', 'prodwork.js:dm', 'prodwork.js:decide'],
    example: () => lane({ lane: 'CLIENT', brand: B1, who: U2, ask: 'Make the changes asked on card 412', why: '"Can the price be bigger on slide 2?"', buttons: [OPEN('Open card')] }) }),

  /* ---------------- Alerts when something breaks ---------------- */
  E('spend_low', ALERTS, 'Spend well below normal', {
    channel: 'internal channel', who: "The brand's buyer", kind: 'internal_alert', status: 'move', audit: 'a22', onRenderer: true,
    when: 'Morning and afternoon, when an account spends far under its own last 7 days.',
    why: 'A stuck campaign costs money by the hour, in season most of all.',
    where: ['worker.js:deliveryPass'],
    example: () => deliveryMessage({ name: B1, act_id: 'brand_sample', currency: 'USD' }, `<@${U1}>`, { period: 'today', spent: 95, normal: 520, budget: 700, hint: 'Worth a look in Ads Manager while the day is still live.' }, { at: AT, now: AT }) }),
  E('brief_failed', ALERTS, 'Daily brief failed to go out', {
    channel: 'internal channel', who: 'Cole', kind: 'internal_alert', status: 'move', audit: 'a23', onRenderer: true,
    when: 'Once per fault, when a daily brief could not be built or sent.',
    why: 'A client misses an update otherwise.',
    where: ['worker.js:alertBriefFailure'],
    example: () => lane({ lane: 'OPS', status: 'bad', brand: B1, who: U1, ask: `Fix the daily brief for ${B1}`, why: 'Triple Whale did not answer at 7am' }) }),
  E('claude_failed', ALERTS, 'Claude credit or key failed', {
    channel: 'internal channel', who: 'Cole', kind: 'internal_alert', status: 'move', audit: 'a24', onRenderer: true,
    when: 'At most every 12 hours while Claude calls fail.',
    why: 'It stops drafts and answers until fixed.',
    where: ['worker.js:alertClaudeFailure'],
    example: () => lane({ lane: 'OPS', status: 'bad', brand: 'Agency', who: U1, ask: 'Top up the Claude credit', why: 'the last 3 calls were refused' }) }),
  E('meta_sync_failed', ALERTS, 'Meta sync failing', {
    channel: 'internal channel', who: 'Cole', kind: 'internal_alert', status: 'move', audit: 'a25', onRenderer: true,
    when: 'At most every 12 hours while a brand we run fails to sync.',
    why: 'Numbers go stale for clients.',
    where: ['worker.js:alertSyncFailure'],
    example: () => lane({ lane: 'OPS', status: 'bad', brand: 'Agency', who: U1, ask: `Check the Meta connection for ${B2}`, why: 'sync failed 4 times since 6am' }) }),
  E('sync_errors', ALERTS, '"Look at N errors in nightly sync"', {
    channel: 'internal channel', who: 'The team', kind: 'internal_alert', status: 'off after Dec 2', audit: 'a26', onRenderer: true,
    when: 'Nightly, when the sync logged errors.',
    why: 'Was a nightly nudge; a real failure will show in the bell and the rest on the Status page.',
    where: ['worker.js:alertScheduleTrouble'],
    example: () => lane({ lane: 'OPS', status: 'bad', brand: 'Agency', who: U1, ask: 'Look at 3 errors in the nightly sync', why: 'all three were the same brand' }) }),
  E('smoke_failed', ALERTS, 'Locus self check failures', {
    channel: 'internal channel', who: 'The team', kind: 'internal_alert', status: 'move', audit: 'a27', onRenderer: false,
    when: 'Daily at 8am, when a page check failed (each failure at most once a week).',
    why: 'A broken page gets fixed before a client opens it.',
    where: ['smoke.js:finish'],
    example: () => hm({ title: 'Fix the 2 failed Locus checks', summary: '2 of 140 checks failed this morning.', lines: [`${B1} · Website: no answer`, `${B2} · Email: timed out`], status: 'bad', buttons: [OPEN('Open Status')] }) }),
  E('alarm_bridge_dm', ALERTS, 'Urgent alarm DM (until Dec 5)', {
    channel: 'Slack DM', who: "The brand's buyer and the owner", kind: 'internal_alert', status: 'keep', onRenderer: false,
    when: 'When an ad account is blocked or unpaid, a live campaign stopped spending, or ads spend with no store order for hours; once per thing per day, only until per person delivery copies go live on Dec 5.',
    why: 'Money stops right now and the bell is not on phones yet, so the row in Locus also gets a Slack DM.',
    where: ['urgent.js:copies'],
    example: () => hm({ title: `${B1}: ads spending, no order in 5 hours`, summary: 'Check the store and the checkout.', numbers: [{ label: 'Since the last order', value: '$180 ad spend' }, { label: 'Normal gap', value: 'about 2 hours' }], source: 'Triple Whale, Meta', status: 'bad', buttons: [OPEN()] }) }),
  E('nightly_findings', ALERTS, 'Strategist nightly findings', {
    channel: 'internal channel', who: 'The team', kind: 'internal_alert', status: 'off after Dec 2', audit: 'a28', onRenderer: false,
    when: 'Nightly, one post per finding (for example a brand under goal 3 days running).',
    why: 'Was a nightly repeat; the same check comes back as an automation you switch on.',
    where: ['worker.js:strategistNightly'],
    example: () => hm({ title: `${B1} is under its 2.50x MER goal 3 days running`, summary: 'Look at what changed on the account this week and at the creatives.',
      numbers: [{ label: '3 days ago', value: '1.90x' }, { label: '2 days ago', value: '2.10x' }, { label: 'Yesterday', value: '1.70x' }], source: 'Triple Whale', buttons: [OPEN()] }) }),
  E('monday_briefing', ALERTS, 'Monday briefing', {
    channel: 'internal channel', who: 'The team', kind: 'internal_alert', status: 'off after Dec 2', audit: 'a29', onRenderer: false,
    when: 'Sunday night.',
    why: 'Was a weekly summary nobody read.',
    where: ['worker.js:strategistBriefing'],
    example: () => hm({ title: 'Monday briefing', lines: [`${B1}: best week this month`, `${B2}: spend down 20%`] }) }),
  E('outage_card', ALERTS, 'Outage card', {
    channel: 'internal channel', who: 'The #outages channel', kind: 'internal_alert', status: 'move', audit: 'a30', onRenderer: true,
    when: 'Each time a platform we depend on goes down or comes back.',
    why: 'Checkout down on a sale weekend matters.',
    where: ['pulse.js:pulseTick'],
    example: () => alertCard({ id: 'shopify', short: 'Shopify', link: 'https://example.test/status' }, [{ service: 'Checkout', to: 'outage', note: 'Checkout is failing for some stores' }], { button: 'pulse:alert:1:shopify', team: true, at: AT, now: AT }) }),
  E('approve_failed', ALERTS, '"Approve did not go through"', {
    channel: 'Slack DM', who: 'Cole', kind: null, fixedFrom: 'locus', fromNote: 'Always Locus (War Room code)', status: 'keep', audit: 'a39', onRenderer: false,
    when: "Only when a client's Approve on a raise fails. Runs through Dec 4.",
    why: 'The money is not where the client thinks it is.',
    where: ['standing.js:handleClientUpdateButton'],
    example: () => hm({ title: `${B3} tapped Approve but it did not go through`, summary: 'Make the change by hand in Meta and tell them.', numbers: [{ label: 'Asked', value: '$300 to $450 a day' }], status: 'bad' }) }),
  E('alert_rule', ALERTS, 'Alert rule a person wrote', {
    channel: 'internal channel or Slack DM', who: "The rule's person or channel", kind: 'internal_alert', status: 'keep', audit: 'a40', onRenderer: true,
    when: 'At most once a day per rule, when its condition is true. Also on Test.',
    why: 'Someone asked to be told exactly this.',
    where: ['alerts.js:alertTick', 'alerts.js:handleAlerts@/api/alerts/test'],
    example: () => hm({ title: `${B1} MER is under 1.5x`, numbers: [{ label: 'Today', value: '1.32x' }, { label: 'Last 7 days', value: '1.61x' }], source: 'Triple Whale', context: 'rule by the owner', buttons: [OPEN()] }) }),
  E('new_ad_account', ALERTS, 'New ad account to match to a client', {
    channel: 'internal channel', who: 'Cole (#mobius-newbiz)', kind: 'team_notice', status: 'move', audit: 'a59', onRenderer: true,
    when: 'When an ad account new since the last look matched no client.',
    why: 'A new client cannot get numbers until their account is matched.',
    where: ['worker.js:autoConnectMeta'],
    example: () => lane({ lane: 'OPS', brand: 'Agency', who: U1, ask: 'Say whose new Meta ad account "Pine Ridge US" is', why: 'not theirs? Ignore this',
      buttons: [{ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: `Yes, it is ${B2}'s` }, action_id: 'nc_meta_yes', value: 'sample' }] }] }) }),
  E('meta_connect_ask', ALERTS, 'Add our access to a new client\'s Meta', {
    channel: 'internal channel', who: 'Cole', kind: 'team_notice', status: 'move', audit: 'a59', onRenderer: true,
    when: 'When a new client\'s ad account is matched but our system user or buyer is not on it yet.',
    why: 'Syncs and ad changes need that access.',
    where: ['worker.js:connectMetaFor'],
    example: () => lane({ lane: 'OPS', brand: B2, who: U1, ask: `Add the Mobius Tools system user to ${B2}'s ad account`, why: 'the sync cannot read it yet' }) }),
  E('newclient_internal', ALERTS, 'New client setup lines', {
    channel: 'internal channel', who: 'The brand team', kind: 'team_notice', status: 'keep', audit: 'a59', onRenderer: true,
    when: 'During a new client\'s setup, at each step that needs a person.',
    why: 'Setup steps land with the person who does them.',
    where: ['newclient.js:laneInternal'],
    example: () => lane({ lane: 'OPS', brand: B2, who: U1, ask: 'Book the strategy call', why: 'the onboarding form is in' }) }),
  E('newclient_summary', ALERTS, 'New client summary', {
    channel: 'internal channel', who: 'The brand team and #mobius-newbiz', kind: 'team_notice', status: 'keep', audit: 'a59', onRenderer: false,
    when: 'Once, when a new client\'s setup summary step runs.',
    why: 'The whole team knows a new client started, who is on it and where things are.',
    where: ['newclient.js:stepSummary'],
    example: () => hm({ title: `New client: ${B2}`, summary: 'Starting Dec 1.', lines: ['Strategist, media buyer, editor, designer picked', 'Client channel made', 'First invoice sent'] }) }),
  E('connect_ask', ALERTS, 'Client connect link asks', {
    channel: 'internal channel', who: 'Cole', kind: 'team_notice', status: 'move', audit: 'a58', onRenderer: true,
    when: 'When a client finishes an item on their connect link that needs us (an invite to accept, a request that failed).',
    why: 'Access a client gave us gets used the same day.',
    where: ['connect.js:connectPost', 'worker.js:handle@/api/connect/'],
    example: () => lane({ lane: 'OPS', brand: B1, who: U1, ask: `Make the Klaviyo key for ${B1} and paste it in Locus`, why: 'they invited us' }) }),

  /* ---------------- Ad calls and the War Room ---------------- */
  E('buyer_list', ADS, 'Buyer list post', {
    channel: 'internal channel', who: 'The buyer (#daily-briefs)', kind: 'approval_ask', status: 'move', audit: 'a4', onRenderer: true,
    when: 'Daily, the top ad calls with an Open button (turned off by a setting).',
    why: 'Was the daily list of calls; the calls stay on Meta > Suggestions.',
    where: ['buyerlist.js:postBuyerList'],
    example: () => lane({ lane: 'MEDIA BUYING', brand: B1, who: U1, ask: 'Make today\'s 5 ad calls', why: '2 cuts, 2 raises, 1 refresh', buttons: [OPEN('Open Suggestions')] }) }),
  E('min_off', ADS, 'Test minimums due off', {
    channel: 'internal channel', who: 'The buyer', kind: 'team_notice', status: 'move', audit: 'a3', onRenderer: true,
    when: 'Daily, when a test spend minimum reached its end.',
    why: 'Minimums left on push money at ads Meta would not pick.',
    where: ['minoff.js:minOffTick'],
    example: () => lane({ lane: 'MEDIA BUYING', brand: B1, who: U1, ask: 'Take the $20 minimum off ad set 368', why: 'its test ended today', buttons: [{ label: 'Take it off', action_id: 'sample_minoff', value: 'sample' }] }) }),
  E('war_room_checkin', ADS, 'War Room check-in', {
    channel: 'Slack DM', who: 'Cole', kind: 'approval_ask', status: 'keep', audit: 'a35', onRenderer: false,
    when: 'At each Black Friday check-in (8am, 2pm, 8pm CT today), through Dec 4.',
    why: 'Says a check-in is ready and opens the War Room, where the raises are approved.',
    where: ['standing.js:postRetry', 'standing.js:slackPng'],
    example: () => hm({ title: 'Black Friday check-in, 2pm', summary: '3 brands ahead of goal, 1 under. 2 raises wait on you.',
      numbers: [{ label: 'Since last check-in', value: '$9,800 sales · 2.90x' }, { label: 'Today', value: '$18,200 sales · 2.70x' }], source: 'Triple Whale', buttons: [OPEN('Open the War Room')] }) }),
  E('client_update_batch', ADS, 'Client updates batch, Send and Send all', {
    channel: 'Slack DM', who: 'Cole', kind: 'approval_ask', status: 'keep', audit: 'a36', onRenderer: false,
    when: 'After each check-in, one draft per client with a thread preview. Through Dec 4.',
    why: 'Cole sends the client check-in updates from one place.',
    where: ['standing.js:offerClientUpdate', 'standing.js:postBatch', 'standing.js:threadPreview', 'standing.js:saveBatch'],
    example: () => hm({ title: 'Client updates: 3 ready', lines: [B1, B2, B3], buttons: [{ label: 'Send all', action_id: 'sample_sendall', style: 'primary', value: 'sample' }] }) }),
  E('approve_receipt', ADS, '"Approved, live in Meta" receipt', {
    channel: 'Slack DM', who: 'Cole', kind: null, fixedFrom: 'locus', fromNote: 'Always Locus (War Room code)', status: 'off after Dec 2', audit: 'a38', onRenderer: false,
    when: 'Each time a client approves a raise themselves.',
    why: 'A receipt; the change is in Changes made.',
    where: ['standing.js:handleClientUpdateButton'],
    example: () => hm({ title: `${B3} approved: $300 to $450 a day`, summary: 'Live in Meta.', source: 'Meta' }) }),
  E('war_room_title_test', ADS, 'Title size test DM', {
    channel: 'Slack DM', who: 'Cole', kind: null, fixedFrom: 'locus', fromNote: 'Always Locus (a test)', status: 'keep', onRenderer: false,
    when: 'Only on request, from the War Room sample route.',
    why: 'Shows the four title sizes Slack can draw, to pick one.',
    where: ['standing.js:handleStanding@/api/standing/sample'],
    example: () => hm({ title: 'Black Friday Update', summary: 'Sales: $6,100 (normal text, for comparison)' }) }),
  E('todays_calls', ADS, "Today's calls post", {
    channel: 'internal channel', who: 'The brand channel', kind: 'team_notice', status: 'off after Dec 2', audit: 'a6', onRenderer: true,
    when: 'Was daily; switched off.',
    why: 'Replaced by the Buyer list long ago.',
    where: ['todaypost.js:todayTick'],
    example: () => lane({ lane: 'MEDIA BUYING', brand: B1, who: U1, ask: "Make today's 3 ad calls" }) }),
  E('monday_review', ADS, 'Monday account review', {
    channel: 'internal channel', who: 'The brand channel', kind: 'team_notice', status: 'off after Dec 2', audit: 'a52', onRenderer: true,
    when: 'Was Mondays; switched off.',
    why: '/buy does this now.',
    where: ['review.js:reviewBrand'],
    example: () => lane({ lane: 'MEDIA BUYING', brand: B1, who: U1, ask: 'Read the Monday review and decide on the 2 suggested changes' }) }),
  E('monday_test_post', ADS, 'Monday test calls post', {
    channel: 'internal channel', who: 'The brand channel', kind: 'team_notice', status: 'off after Dec 2', audit: 'a53', onRenderer: false,
    when: 'Was Mondays; off since Nov 20.',
    why: 'Posts nothing any more.',
    where: ['asana-brand.js:postMonday'],
    example: () => hm({ title: `${B1} · tests this week`, lines: ['Hook test: 3 openers', 'Offer test: bundle vs single'] }) }),

  /* ---------------- Team day ---------------- */
  E('morning_card', TEAM, 'Morning card per brand', {
    channel: 'internal channel', who: 'The brand team, people tagged', kind: 'team_notice', status: 'off after Dec 2', audit: 'a1', onRenderer: false,
    when: 'Daily at 5am per brand, with its calls, tasks, leak lines and dates in the thread.',
    why: 'Its useful parts move to My day and Brand > Today first, then the card stops.',
    where: ['morningcard.js:postCard', 'morningcard.js:redraw'],
    example: () => hm({ title: `${B1} · Thursday`, summary: 'Yesterday $3,240 sales at 2.70x MER.', lines: ['Media buying: 2 ad calls', 'Creative: card 412 due today', 'Client: chase the gift guide photos'], source: 'Triple Whale' }) }),
  E('task_reminders', TEAM, 'Late and due task lines with Done buttons', {
    channel: 'internal channel', who: 'The task owner', kind: 'team_notice', status: 'move', audit: 'a2', onRenderer: true,
    when: 'On the due day, then 1, 3 and 7 days late.',
    why: 'Was the nudge; it becomes one "N tasks late" line plus the list in My day.',
    where: ['actions.js:actionTick', 'actions.js:handleReaction'],
    example: () => lane({ lane: 'CREATIVE', brand: B1, who: U2, ask: 'Finish 2 late tasks', why: 'due Nov 24 and Nov 25', buttons: [{ label: 'Done', action_id: 'sample_done', value: 'sample' }] }) }),
  E('my_work', TEAM, 'My work DM', {
    channel: 'Slack DM', who: 'People who switched it on', kind: 'team_notice', status: 'keep', audit: 'a9', onRenderer: true,
    when: 'Weekdays at 5am.',
    why: 'Two people asked for their own tasks and cards first thing.',
    where: ['mywork.js:myWorkDmTick'],
    example: () => hm({ title: 'Your work today', tag: U2, summary: '3 things today, 1 late.', lines: ['Card 412 · ' + B1 + ' · due today', 'Brief the gift guide · ' + B2, 'Late: resize the holiday statics · ' + B3], source: 'Locus', buttons: [OPEN('Open My day')] }) }),
  E('checkin_board', TEAM, 'Daily check-in post and plan form', {
    channel: 'internal channel', who: 'The team (#daily-checkin)', kind: 'team_notice', status: 'move', audit: 'a10', onRenderer: true,
    when: 'Weekdays at 5am.',
    why: 'The team posts today\'s plan or says they are out.',
    where: ['checkin.js:ensureDay', 'checkin.js:redraw'],
    example: () => hm({ title: 'Friday check-in', summary: 'Tap a button below. Everything you post goes in this thread.', lines: ['Alex: plan posted', 'Sam: out today'],
      buttons: [{ label: 'Post my plan', action_id: 'ci_plan', style: 'primary', value: 'sample' }, { label: "I'm out today", action_id: 'ci_out', value: 'sample' }] }) }),
  E('checkin_reply', TEAM, 'Plan and out today replies in the check-in thread', {
    channel: 'internal channel', who: 'The team (#daily-checkin)', kind: 'team_notice', status: 'move', audit: 'a10', onRenderer: false,
    when: 'Each time a person posts a plan, a wrap-up or "out today".',
    why: 'Everyone sees who is doing what today.',
    where: ['checkin.js:postInThread'],
    example: () => hm({ title: "Alex's plan", lines: [`${B1}: 4 holiday statics`, `${B2}: brief the gift guide`] }) }),
  E('week_plan_copy', TEAM, "A person's week plan copied to the brand channel", {
    channel: 'internal channel', who: 'The brand team', kind: 'team_notice', status: 'move', audit: 'a54', onRenderer: false,
    when: 'When a person posts their week from the Monday form.',
    why: 'Each brand channel shows who works on it this week.',
    where: ['checkin.js:submitCheckin'],
    example: () => hm({ title: `Alex's week · ${B1}`, lines: ['Main focus: holiday gifting', 'Batch 1: 6 statics, Wednesday'] }) }),
  E('no_plan_dm', TEAM, '"No plan yet" DM', {
    channel: 'Slack DM', who: 'Each person with no plan 4 hours in', kind: 'team_notice', status: 'move', audit: 'a11', onRenderer: true,
    when: 'Weekdays, 4 hours after the check-in post, once.',
    why: 'Becomes the top line of the person\'s My day, not a ping.',
    where: ['checkin.js:checkinTick'],
    example: () => lane({ lane: 'OPS', brand: 'Agency', who: U2, ask: 'Post your plan for today in #daily-checkin', why: 'no plan from you yet today' }) }),
  E('guest_week_dm', TEAM, 'Monday "post your week" DM to guests', {
    channel: 'Slack DM', who: 'Slack guests with no Locus login', kind: 'team_notice', status: 'keep', audit: 'a12', onRenderer: true,
    when: 'Mondays in the morning.',
    why: 'Guests have no page to see it on.',
    where: ['checkin.js:checkinTick'],
    example: () => hm({ title: 'Post your week for the Monday call', summary: "Morning Sam. The main focus and what you're working on, per brand.", buttons: [{ label: 'Post my week', action_id: 'ci_week', style: 'primary', value: 'sample' }] }) }),
  E('card_review', TEAM, 'Card moved to Review, Approve all', {
    channel: 'internal channel', who: 'The reviewer', kind: 'approval_ask', status: 'move', audit: 'a13', onRenderer: false,
    when: 'Each time a designer moves an ad card to Review, plus the decision in its thread.',
    why: 'Becomes one line for the reviewer, "N cards waiting on review".',
    where: ['checkin.js:reviewPost', 'checkin.js:postAlbum', 'checkin.js:reviewSubmit', 'checkin.js:redrawReview'],
    example: () => hm({ title: `Review card 412 · ${B1}`, summary: '6 statics sent for your look.', buttons: [{ label: 'Approve all', action_id: 'sample_approve', style: 'primary', value: 'sample' }, OPEN('Open card')] }) }),
  E('calendar_countdown', TEAM, 'Calendar countdown (live tomorrow, a week out)', {
    channel: 'internal channel', who: 'Step owners', kind: 'team_notice', status: 'move', audit: 'a19', onRenderer: false,
    when: 'Daily from 8am, for steps still open before a launch.',
    why: 'Shows only to the owner of a step still open, after the "not built" check is fixed.',
    where: ['calendar.js:calendarTick'],
    example: () => hm({ title: `${B1} · Gift guide goes live tomorrow`, lines: ['Ads built: open (Sam)', 'Email scheduled: done'], buttons: [OPEN('Open the calendar')] }) }),
  E('fyi_roundup', TEAM, 'End of day FYI roundup', {
    channel: 'internal channel', who: 'The brand channel', kind: 'team_notice', status: 'off after Dec 2', audit: 'a21', onRenderer: false,
    when: 'Daily at 4pm.',
    why: 'Its own title said it needs no action; Brand > Today shows the day.',
    where: ['lane.js:roundupTick'],
    example: () => hm({ title: `FYI · ${B1} · Thursday`, lines: ['Ops: Klaviyo connected', 'Creative: card 412 approved'] }) }),
  E('monday_plans_missing', TEAM, 'Monday "brands with no Monday plan"', {
    channel: 'internal channel', who: 'Strategists (#daily-checkin)', kind: 'team_notice', status: 'move', audit: 'a31', onRenderer: false,
    when: 'Mondays at 7am, when a brand has no plan yet.',
    why: 'Becomes one Monday line for the strategist.',
    where: ['callnudge.js:callNudgeTick'],
    example: () => lane({ lane: 'CREATIVE', brand: 'Monday plans', who: U2, ask: `Post your week for ${B1} and ${B3} before the 8:00 team call`, why: 'the team call screen shows your plan' }) }),
  E('meetings_finished', TEAM, '"Meetings finished at noon" DM', {
    channel: 'Slack DM', who: 'Cole', kind: 'team_notice', status: 'off after Dec 2', audit: 'a32', onRenderer: false,
    when: 'Weekdays from noon, when Locus finished a meeting nobody closed (or could not).',
    why: 'Calls still finish on their own; the DM changes nothing.',
    where: ['callnudge.js:callNudgeTick'],
    example: () => hm({ title: 'Meetings finished at noon', summary: 'Nobody pressed Finish, so Locus did.', lines: [`${B1} client call`] }) }),
  E('meeting_notes_confirm', TEAM, 'Meeting notes to confirm', {
    channel: 'internal channel', who: 'Cole', kind: 'team_notice', status: 'off after Dec 2', audit: 'a33', onRenderer: true,
    when: 'When a recorded call\'s notes are ready.',
    why: 'Nobody confirmed one in five weeks.',
    where: ['meetings.js:tellReady'],
    example: () => lane({ lane: 'CLIENT', brand: 'Agency', who: U1, ask: `Confirm the notes from "${B1} weekly"`, why: '4 tasks and 1 request found' }) }),
  E('morning_line', TEAM, 'Morning line DM', {
    channel: 'Slack DM', who: 'People who opted in (nobody did)', kind: 'team_notice', status: 'off after Dec 2', audit: 'a8', onRenderer: false,
    when: 'Was each morning at the person\'s hour; also on request as a test.',
    why: 'The per person morning brief replaces it.',
    where: ['morning.js:morningTick', 'morning.js:handleMorning@/api/me/morning'],
    example: () => hm({ title: 'Your brands this morning', lines: [`${B1}: $3,240 yesterday, 2.70x`, `${B2}: $1,100 yesterday, 2.10x`], source: 'Triple Whale' }) }),
  E('automation_dm', TEAM, 'Automation message', {
    channel: 'Slack DM', who: 'The person an automation rule is for', kind: 'team_notice', status: 'keep', audit: 'a41', onRenderer: false,
    when: 'When a switched on automation fires and the person picked Slack (none are on yet).',
    why: 'This is how "tell me if a brand is under goal 3 days running" reaches Slack.',
    where: ['automations.js:sendWays'],
    example: () => hm({ title: `${B1} is under goal 3 days running`, summary: 'Day 1 of 4 reminders, then quiet.', buttons: [OPEN()] }) }),

  /* ---------------- Creator program ---------------- */
  E('trybe_post', CREATORS, 'Creator videos to review or load', {
    channel: 'internal channel', who: 'The buyer and the reviewer', kind: 'team_notice', status: 'move', audit: 'a45', onRenderer: false,
    when: 'Each morning per brand while creator videos wait.',
    why: 'Becomes two Locus lines: approved videos to load, videos to review.',
    where: ['trybe.js:trybeTick'],
    example: () => hm({ title: `${B1} · 4 approved creator videos to load`, tag: U1, summary: 'Load them into Meta. The oldest has waited 3 days.',
      numbers: [{ label: 'To load', value: '4' }, { label: 'Oldest', value: '3 days' }], lines: ['Creator A, black driver', 'Creator B, putting drill', 'and 2 more'], source: 'Trybe', buttons: [OPEN('Open Creators')] }) }),
  E('trybe_recut', CREATORS, 'Creator recut cards made', {
    channel: 'internal channel', who: 'The editor', kind: 'team_notice', status: 'off after Dec 2', audit: 'a46', onRenderer: true,
    when: 'When recut cards are made from creator videos.',
    why: 'The cards are already in the editor\'s My day.',
    where: ['trybe.js:trybeRecutAnnounce'],
    example: () => lane({ lane: 'CREATORS', brand: B1, who: U2, ask: 'Recut 3 creator videos', why: 'cards made today' }) }),
  E('discord_welcome', CREATORS, 'Creator Discord welcome', {
    channel: 'Discord', who: 'New creators in the brand\'s Discord', kind: 'creator_discord', status: 'keep', audit: 'a48', onRenderer: false,
    when: 'One post a day from 5pm Central, for everyone who joined that day.',
    why: 'New creators know where to start.',
    where: ['trybe.js:welcomeAll'],
    example: () => hm({ title: 'Welcome to the club', summary: 'Say hi in #intros, then read #start-here.' }) }),
  E('discord_daily', CREATORS, 'Creator Discord daily question', {
    channel: 'Discord', who: 'Creators in the brand\'s Discord', kind: 'creator_discord', status: 'keep', audit: 'a48', onRenderer: false,
    when: 'On request (no longer on a timer), one question or poll from a rotating bank.',
    why: 'Keeps creators talking and filming.',
    where: ['trybe.js:discordDaily'],
    example: () => hm({ title: 'Question of the day', summary: 'What is the one shot you always film first?' }) }),
  E('discord_weekly', CREATORS, 'Creator Discord weekly winners', {
    channel: 'Discord', who: 'Creators in the brand\'s Discord', kind: 'creator_discord', status: 'keep', audit: 'a48', onRenderer: false,
    when: 'Weekly, naming the top videos (never sales counts).',
    why: 'Shows creators what works so they make more of it.',
    where: ['trybe.js:postWinnersV2', 'trybe.js:discordWeekly'],
    example: () => hm({ title: 'This week\'s top videos', lines: ['Creator A: the 3 second hook', 'Creator B: the unboxing'] }) }),
  E('discord_this_week', CREATORS, 'Creator Discord Monday "this week" post', {
    channel: 'Discord', who: 'Creators in the brand\'s Discord', kind: 'creator_discord', status: 'keep', audit: 'a48', onRenderer: false,
    when: 'Mondays in #this-week, what to film this week, with the creators it names tagged. Fridays the same job posts the winners.',
    why: 'Creators start the week knowing what to make.',
    where: ['trybe.js:discordWeekly'],
    example: () => hm({ title: 'This week', lines: ['Film the gift set unboxing', 'Show the putter on a real green'] }) }),
  E('discord_call_ask', CREATORS, 'Creator Discord "From today\'s call" post', {
    channel: 'Discord', who: 'Creators in the brand\'s Discord', kind: 'creator_discord', status: 'keep', onRenderer: false,
    when: 'After a creator call, only when the person ticks "Post it".',
    why: 'The one ask from the call reaches the creators who missed it.',
    where: ['trybe.js:postCallAsk'],
    example: () => hm({ title: 'From today\'s call', summary: 'Send one video this week that opens on the product in your hand.' }) }),
  E('discord_idle_dm', CREATORS, 'Creator Discord "keep your spot" DM', {
    channel: 'Discord', who: 'One creator with no new video in a while', kind: 'creator_discord', status: 'keep', onRenderer: false,
    when: 'Once per quiet spell, when the creator Discord sync runs (on the creator tick when auto is on, or on request) and a creator has sent no video for the warning number of days.',
    why: 'The creator knows to send a video before they lose their place in the Discord.',
    where: ['trybe.js:trybeDiscordSync'],
    example: () => hm({ title: 'Keep your spot', summary: 'Hey Alex, we have not seen a new video from you in 21 days. Submit one on Trybe in the next week to keep your spot.' }) }),
  E('discord_team_post', CREATORS, 'Creator Discord post by the team', {
    channel: 'Discord', who: 'Creators in the brand\'s Discord', kind: 'creator_discord', status: 'keep', onRenderer: false,
    when: 'Only when someone on the team writes it in Locus (or an agent asks): a post as the mascot, an edit of one, or taking one down.',
    why: 'The team talks to creators in the brand\'s voice without opening Discord.',
    where: ['trybe.js:handleTrybe@/api/trybe/discord-say', 'profit/discord.js:handleDiscord@/api/amb/discord/post', 'profit/discord.js:handleDiscord@/api/amb/discord/edit', 'profit/discord.js:handleDiscord@/api/amb/discord/delete'],
    example: () => hm({ title: 'New this week', summary: 'The holiday gift box is in. Film it on a table, not in your hand.' }) }),
  E('discord_first_posts', CREATORS, 'Creator Discord first posts', {
    channel: 'Discord', who: 'Creators in the brand\'s Discord', kind: 'creator_discord', status: 'keep', onRenderer: false,
    when: 'Once, when the team builds a brand\'s Discord (and again when its look changes): the start here and how it works posts.',
    why: 'A new server reads as ready from the first visit.',
    where: ['profit/discord.js:build'],
    example: () => hm({ title: 'Start here', summary: 'Upload on Trybe, talk here. This week\'s ideas are in #this-week.' }) }),

  /* ---------------- Social posting and site reviews ---------------- */
  E('social_by_hand', SOCIAL, 'Social post must be done by hand', {
    channel: 'internal channel', who: 'The post owner', kind: 'team_notice', status: 'parked', audit: 'a50', onRenderer: true,
    when: 'When a planned social post could not go out by itself.',
    why: 'Goes off with the rest of social; the code stays, hidden.',
    where: ['socialpost.js:notifyHandoff'],
    example: () => hm({ title: `Post this by hand: Instagram, ${B1}`, summary: 'The platform refused the automatic post.', buttons: [OPEN('Open post'), { label: 'Done', action_id: 'sample_done', value: 'sample' }] }) }),
  E('social_nudge', SOCIAL, 'Social Monday "N of T posts planned"', {
    channel: 'internal channel', who: 'The brand team', kind: 'team_notice', status: 'off after Dec 2', audit: 'a49', onRenderer: true,
    when: 'Mondays, when the week has fewer posts planned than the target.',
    why: 'Social is gone, so this goes too.',
    where: ['socialpost.js:socialNudgeTick'],
    example: () => lane({ lane: 'CREATIVE', brand: B1, who: U2, ask: "Fill this week's social plan", why: '2 of 5 posts planned' }) }),
  E('site_review', SOCIAL, 'Site review sent', {
    channel: 'internal channel', who: 'Cole', kind: 'team_notice', status: 'off after Dec 2', audit: 'a58', onRenderer: true,
    when: 'When a client sends back a site review.',
    why: 'Site reviews leave the app once no client link is still open.',
    where: ['sitereview.js:send'],
    example: () => hm({ title: `${B1} reviewed the gift guide page`, numbers: [{ label: 'Approved', value: '4' }, { label: 'Changes', value: '2' }, { label: 'Not reviewed', value: '1' }], buttons: [OPEN()] }) }),

  /* ---------------- Old features ---------------- */
  E('scheduled_question', OLD, 'Scheduled Strategist question', {
    channel: 'internal channel', who: 'A chosen channel', kind: 'strategist_reply', status: 'off after Dec 2', audit: 'a43', onRenderer: false,
    when: 'On its schedule (none were ever set up).',
    why: 'Never used.',
    where: ['askschedule.js:runSchedule', 'askschedule.js:runReader'],
    example: () => hm({ title: 'Weekly question: which ads to cut?', lines: [`${B1}: 2 ads under goal`] }) }),
  E('dashboard_post', OLD, 'Saved dashboard on a Slack schedule', {
    channel: 'internal channel', who: 'A chosen channel', kind: 'team_notice', status: 'off after Dec 2', audit: 'a44', onRenderer: false,
    when: 'On the dashboard\'s schedule, if one is set.',
    why: 'No sign anyone uses the Slack copy; the dashboards stay.',
    where: ['worker.js:postDashboard'],
    example: () => hm({ title: 'Holiday dashboard: last 7 days', numbers: [{ label: 'Sales', value: '$41,000' }, { label: 'MER', value: '2.60x' }], buttons: [OPEN()] }) }),
  E('setup_line', OLD, '"Account Health is wired up" setup line', {
    channel: 'internal channel', who: 'The alert channel', kind: 'team_notice', status: 'off after Dec 2', audit: 'a65', onRenderer: false,
    when: 'Once, on the setup test tap.',
    why: 'Leftover from setup.',
    where: ['worker.js:handle@/api/slack-test'],
    example: () => hm({ title: 'Account Health is wired up', summary: 'Budget pace alerts will post here.' }) }),

  /* ---------------- Answers and tools on request ---------------- */
  E('strategist_answer', ASKED, 'Strategist answer in a thread', {
    channel: 'internal channel or Slack DM', who: 'The person who asked', kind: 'strategist_reply', status: 'keep', onRenderer: false,
    when: 'When someone tags Locus or asks it something in Slack, including files it makes.',
    why: 'Answers land where the question was asked.',
    where: ['ideas.js:say', 'lookups.js:lookupSlack', 'stratmake.js:slackUpload', 'strattools.js:uploadToSlack'],
    example: () => hm({ title: `${B1} last 7 days`, summary: '$21,400 sales on $8,100 of ads, 2.64x MER, up from 2.31x.', source: 'Triple Whale' }) }),
  E('idea_draft', ASKED, 'Draft thread started from Locus', {
    channel: 'internal channel', who: 'The brand team', kind: 'strategist_reply', status: 'keep', onRenderer: false,
    when: 'When someone asks Locus to draft our version of a post or an idea and to work in Slack.',
    why: 'The draft and its back and forth live in one thread.',
    where: ['ideas.js:ideaFromLocus', 'ideas.js:appRow', 'ideas.js:runIdeaJob', 'ideas.js:adminIdea', 'ideas.js:handleIdeaAction', 'ideas.js:redrawCard'],
    example: () => hm({ title: 'Check the draft Locus writes in this thread', summary: `Alex asked from Locus: our version of this post for ${B1}.` }) }),
  E('studio_batch', ASKED, 'Studio batch of made ads', {
    channel: 'internal channel', who: 'The person who asked', kind: 'strategist_reply', status: 'keep', onRenderer: false,
    when: 'When a Studio batch someone started finishes (or fails).',
    why: 'The made ads come back to the thread they were asked in.',
    where: ['studiomake.js:postBatch', 'studiomake.js:runStudioMake', 'worker.js:queue'],
    example: () => hm({ title: `6 ads made for ${B1}`, summary: 'Gift set, three sizes each.' }) }),
  E('access_refused', ASKED, 'Not allowed to use Locus', {
    channel: 'Slack DM', who: 'Someone not on the access list', kind: 'strategist_reply', status: 'keep', onRenderer: false,
    when: 'When a person who may not use Locus messages it.',
    why: 'Says plainly why there is no answer.',
    where: ['worker.js:handleSlackEvent'],
    example: () => hm({ title: 'Locus is for the team only', summary: 'Ask the owner to add you to the access list.' }) }),
  E('agent_post', ASKED, 'Post from Claude Code (the agent tool)', {
    channel: 'internal channel or client channel', who: 'Any channel the agent names', kind: null, fromNote: 'Locus, or Cole when the call sets as_cole', status: 'keep', onRenderer: false,
    when: 'Only when an agent session calls slack_post; a client channel needs as_cole and the owner asking.',
    why: 'Lets an agent post the drafts the owner approved.',
    where: ['mcp.js:tools'],
    example: () => hm({ title: `${B2} · Update`, summary: 'Drafted in Claude Code and approved by the owner.' }) }),
  E('share_picture', ASKED, 'Shared picture of a Locus page', {
    channel: 'internal channel or client channel', who: 'The channel the person picked', kind: null, fixedFrom: 'locus', fromNote: 'Always Locus (the app uploads the picture)', status: 'keep', onRenderer: false,
    when: 'When someone taps Share to Slack on a page.',
    why: 'A chart goes to the conversation without a screenshot.',
    where: ['worker.js:handle@/api/share/slack'],
    example: () => hm({ title: `Pace · ${B1}`, summary: 'Nov 1 to 25. Shared by Alex.', image: { url: 'https://example.test/picture.png', alt: 'Pace chart' } }) }),
  E('tap_reply', ASKED, 'Reply to a button tap', {
    channel: 'internal channel or Slack DM', who: 'Only the person who tapped', kind: null, fixedFrom: 'locus', fromNote: 'Always Locus (the reply to the tap)', status: 'keep', onRenderer: false,
    when: 'Right after someone taps a button or tags Locus: the tapped message redrawn as done, or a note only they see (not allowed, already sent, too old).',
    why: 'The person knows what their tap did without a new post in the channel.',
    where: ['actions.js:handleActionButton', 'asana-brand.js:runMondayPlan', 'checkin.js:reviewAction', 'ideas.js:whisper', 'lookups.js:lookupWhyTap', 'minoff.js:handleMinOffButton',
      'newclient.js:handleNewClientAction', 'socialpost.js:handleSocialButton', 'worker.js:slackWhisper', 'worker.js:handleSlackInteract', 'worker.js:askTapSay'],
    example: () => hm({ title: 'Already sent', summary: 'Already sent at 2:10pm. Nothing sent twice.' }) }),
  E('strategist_schedule', ASKED, 'Strategist scheduled post', {
    channel: 'internal channel or Slack DM', who: 'A team channel or a teammate', kind: null, fixedFrom: 'locus', fromNote: 'Always Locus', status: 'keep', onRenderer: false,
    when: 'At the time a person picked, after they tapped Apply on the Strategist\'s card. Never a client channel.',
    why: 'A reminder or note lands when it is useful, not when it was written.',
    where: ['slackwrite.js:scheduleAction'],
    example: () => hm({ title: 'Reminder: gift guide photos', summary: `${B1} photos are due to the client today.` }) }),
  E('strategist_edit', ASKED, 'Strategist edit of a Locus message', {
    channel: 'internal channel', who: 'The channel where the message is', kind: null, fixedFrom: 'locus', fromNote: 'Always Locus', status: 'keep', onRenderer: false,
    when: 'After a person taps Apply on the Strategist\'s edit card, or undoes one. Locus\'s own plain messages only.',
    why: 'A wrong line is fixed in place instead of a second post.',
    where: ['slackwrite.js:editAction', 'slackwrite.js:channelAction'],
    example: () => hm({ title: 'Edited', summary: 'Gift guide photos are due Friday, not Thursday.' }) }),
  E('owner_edit', ASKED, 'Owner edit of a Locus message', {
    channel: 'internal channel or client channel', who: 'The channel where the message is', kind: null, fixedFrom: 'locus', fromNote: 'Always Locus', status: 'keep', onRenderer: false,
    when: 'Only when the owner edits or deletes one of Locus\'s own messages from Locus.',
    why: 'A wrong message is fixed or taken down without opening Slack.',
    where: ['worker.js:handle@/api/ask/own-message'],
    example: () => hm({ title: 'Edited by the owner', summary: 'The shipping cutoff is Dec 17.' }) }),
  E('example_dm', ASKED, 'Example message to the owner', {
    channel: 'Slack DM', who: 'The owner only', kind: null, fixedFrom: 'locus', fromNote: 'Always Locus', status: 'keep', onRenderer: false,
    when: 'Only on request, to see a new message design in Slack before any real path sends it.',
    why: 'A design is checked in real Slack first.',
    where: ['exampledm.js:handleExampleDm'],
    example: () => hm({ title: 'Example, not real', summary: 'A new message design, sent to your own DM only.' }) }),
];

/* Every send call site in both workers, by file:function (profit worker files as profit/file.js:function) (route-scoped as file:function@/api/... inside a request handler),
   mapped to the catalog ids it can send. Built from CATALOG[].where so the two cannot drift. */
export const SITES = (() => {
  const m = {};
  for (const e of CATALOG) for (const w of e.where || []) (m[w] ||= []).push(e.id);
  return m;
})();

/* Pipes: they send whatever their callers hand them. Their own call sites are not messages; their callers are scanned
   (each name below is in the scanner's pattern list, so every caller is found and must be mapped). */
export const TRANSPORTS = [
  'worker.js:slackPost', 'worker.js:strategistSay', 'worker.js:actionDeps', 'worker.js:minOffDeps',
  'sender.js:postAs', 'sender.js:slackPostWith', 'sender.js:buyerSlackPost',
  'lane.js:lanePost', 'morningcard.js:teamPost', 'morning.js:dmPerson',
  'mail.js:sendMail', 'mail.js:sendProductMail', 'clients.js:sendMail', 'contract.js:sendMail', 'newclient.js:sendMail', 'onboard.js:sendMail',
  'alerts.js:postTo', 'requests.js:tellTeam', 'automations.js:slackDm', 'trybe.js:dcHookSay', 'trybe.js:dcHookPost',
  'worker.js:slackUpdate', 'profit/discord.js:hookPost',
];
/* The function names the scanner treats as a send (besides the raw sends below). */
export const SEND_CALLS = ['slackPost', 'sendMail', 'sendMailAs', 'sendProductMail', 'postAs', 'lanePost', 'dmPerson', 'teamPost', 'postTo', 'tellTeam', 'slackDm', 'strategistSay', 'dcHookSay', 'dcHookPost', 'hookPost', 'slackUpdate'];
/* The raw sends the scanner looks for on a line, whatever helper wraps them. Edits count: changing a message someone
   already has is a send too, so it must sit in a function that is mapped to the message it edits. */
export const RAW_SENDS = [
  /chat\.(?:postMessage|scheduleMessage|postEphemeral|update)\b/,      // Slack: post, scheduled post, private note, edit
  /files\.completeUploadExternal/,                                     // Slack: a file shared into a channel
  /response_url,\s*\{/,                                                // Slack: the reply to a button tap
  /\/channels\/\$\{[^}]+\}\/messages`/,                                // Discord: a post in a channel or a DM
  /\/webhooks\/\$\{[^}]+\}\/\$\{[^}]+\}(?:\?wait|\/messages\/)/,       // Discord: a webhook post or an edit of one
  /api\.resend\.com\/emails|gmail\/v1\/users\/me\/messages\/send/,     // email
];

/** The entries with their example drawn, for GET /api/messages/catalog. `stored` = settings.senders (raw or object),
 *  `person` = the name behind the user token. Each entry gets from: 'locus' | 'cole' | null and fromLabel. */
export function catalogPayload({ stored = null, env = {}, person = null } = {}) {
  const resolved = resolveSenders(stored, env).resolved;
  const owner = person || 'Cole';
  const entries = CATALOG.map(e => {
    let from = null;
    if (e.fixedFrom) from = e.fixedFrom;
    else if (e.kind && resolved[e.kind]) from = resolved[e.kind].who;
    let msg = null, err = null;
    try { msg = e.example(); } catch (x) { err = String(x && x.message || x); }
    const { example, ...rest } = e;
    return { ...rest, from, fromLabel: from === 'cole' ? owner : from === 'locus' ? 'Locus' : (e.fromNote || 'Set per message'),
      kindLabel: e.kind && SENDER_KINDS[e.kind] ? SENDER_KINDS[e.kind].label : null, example: msg, ...(err ? { example_error: err } : {}) };
  });
  const counts = { total: entries.length, notOnRenderer: entries.filter(e => !e.onRenderer).length };
  for (const s of STATUS) counts[s] = entries.filter(e => e.status === s).length;
  return { groups: GROUPS, statuses: STATUS, counts, person: owner, entries };
}
