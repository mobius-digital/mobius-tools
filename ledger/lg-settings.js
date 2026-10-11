/* Mobius Ledger v6: Settings (a left sub-nav, the sections the edition lists),
   the edition switch, the Controller wiring and the boot. The engine's own
   settings pieces are reused by name: setGeneral (the money rules), setClients,
   vendorCards, notifyCard, setAccess, renderGmail, renderDrive, the Plaid and
   Stripe buttons. Every engine function that re-renders calls renderSettings(),
   so the section you were on is kept in the engine's SET.sec. */
'use strict';

function setSecV6(s) { SET.sec = s; lsSet('ledger_set', s); renderSettings(); }
const srow = (label, help, control, col) => `<div class="srow ${col ? 'col' : ''}"><div class="sl"><b>${label}</b>${help ? `<span>${help}</span>` : ''}</div><div class="sc">${control}</div></div>`;
const SEC_BODY = {
  business: secBusiness, money: secMoney, clients: secClientsV6, categories: secCategories, vendors: () => `<h2>Vendors</h2><p class="hint">Recurring charges support the forecast and the renewal reminders. Remembered vendors fill themselves the first time a charge is categorized and only save you doing it again.</p>${vendorCards(S.boot.vendors || [])}`,
  banks: secBanks, slack: secSlack, access: secAccessV6, data: secData,
};

renderSettings = function () {
  const m = $('#main');
  if (S.view !== 'settings') return;
  const secs = ED.settings;
  if (!secs.some(s => s[0] === SET.sec)) SET.sec = 'business';
  const [, title] = secs.find(s => s[0] === SET.sec);
  const body = SEC_BODY[SET.sec] || (() => `<h2>${esc(title)}</h2>${notConnectedCard(SET.sec, title)}`);
  m.innerHTML = pageHead('Settings', 'The rules the app runs on. Each section saves on its own.') + `<div class="set">
    <nav class="set-nav"><span class="lb">Settings</span>${secs.map(([id, l, ic]) => `<button class="${SET.sec === id ? 'on' : ''}" onclick="setSecV6('${id}')">${icon(ic, 15)}<span>${l}</span></button>`).join('')}</nav>
    <div class="set-body">${body()}</div></div>`;
  if (SET.sec === 'slack') AskUI.afterSettings();
  if (SET.sec === 'data') { renderGmail(); renderDrive(); }
};
SCREENS.settings = renderSettings;

/* ---- Business: the edition, and who the books belong to ---- */
function secBusiness() {
  const name = ED.id === 'household' ? 'Household' : 'Business';
  return `<h2>${name}</h2><p class="hint">Who the books belong to, and which kind of books they are. The edition picks the rail, the words and these sections; it never hides a number.</p>
    ${card('What are you keeping books for?', 'Pick the one that fits. Everything re-draws at once and the choice is kept with the other settings.', `<div class="edpick">${EDITION_ORDER.map(id => { const e = EDITIONS[id]; return `<button class="${ED.id === id ? 'on' : ''}" onclick="setEdition('${id}')"><b>${esc(e.label)}</b><span>${esc(e.hint)}</span>${ED.id === id ? '<span class="pill good">current</span>' : ''}</button>`; }).join('')}</div>
      <p class="note">The Mobius books are a service business. Product brand draws the Lucky map (Store, Debts, Shopify); the pages whose data lives in the Lucky engine say so until Step B joins the two. Household uses everyday words; its own pages arrive in Step C.</p>`)}
    ${card('', '', srow(name, 'Set on the worker. The name on every statement and the CPA pack.', `<b>${esc(S.boot.business || 'Mobius Digital')}</b>`)
      + srow('The helper', `Answers in the ask bar and in Slack, runs the nightly checks, writes the Monday briefing. Its playbook is under ${esc(ED.settings.find(s => s[0] === 'slack')?.[1] || 'Slack')}.`, `<b>The ${esc(ED.assistant)}</b>`)
      + (ED.id === 'household' ? '' : srow('Income tax set-aside', `The share of ${word('netLow')} kept back for income tax. It drives the reserve on Money › Taxes and Home.`, `<div class="unit-in" style="max-width:110px"><input id="sTaxQuick" type="number" value="${S.boot.money.taxPct ?? 30}"><span>%</span></div><button class="btn" onclick="saveTaxQuick(this)">Save</button>`)))}`;
}
async function setEdition(id) {
  if (!EDITIONS[id] || id === ED.id) return;
  pickEdition(id); rebuildNav(); AskUI.state.name = ED.assistant;
  try { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ edition: id }) }); if (S.boot) S.boot.edition = id; flash(`Now keeping books as a ${ED.label.toLowerCase()}`); }
  catch (e) { flash('Kept on this device only: ' + e.message); }
  SET.sec = 'business'; show('settings');
}
async function saveTaxQuick(btn) { btn.disabled = true; try { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ money: { ...S.boot.money, taxPct: +$('#sTaxQuick').value } }) }); S.boot = await api('/api/boot'); flash('Saved'); } catch (e) { flash(e.message); } btn.disabled = false; }

/* ---- Money rules: the engine's set-aside, distributions and the account split ---- */
function secMoney() {
  return `<h2>Money rules</h2><p class="hint">Percentages of ${word('netLow')}, used by every statement: the tax set-aside, distributions, and where net income moves when a month closes.</p>${setGeneral()}`;
}
function secClientsV6() {
  return `<h2>Clients</h2><p class="hint">The retainer book the forecast runs on. Base retainer plus an optional share of ad spend; pausing keeps history and stops the app expecting money.</p>${setClients()}`;
}
function secCategories() {
  return `<h2>Categories</h2><p class="hint">The CPA layer every expense maps to. Add one if something does not fit; removing one keeps it on the rows that already use it.</p>
    ${card('', '', `<div class="chips">${(S.boot.taxCats || []).map(c => `<span class="chip">${esc(c)} <button class="del-x" title="Remove ${esc(c)}" data-ledger-event="click" data-ledger-action="delTaxCat" data-name="${esc(c)}">${icon('x', 11)}</button></span>`).join('')}</div>
      <div class="row" style="margin-top:14px"><input id="newCat" placeholder="e.g. Education and courses" style="max-width:260px"><button class="btn" onclick="addTaxCat()">${icon('plus', 14)} Add</button><span class="msg" id="catMsg"></span></div>`)}`;
}
/* ---- Banks and cards: the Plaid feeds, and Stripe ---- */
function secBanks() {
  const b = S.boot, items = b.plaidItems || [];
  return `<h2>Banks and cards</h2><p class="hint">Bank and card lines flow in nightly. A new line first tries to confirm an expected row, then to adopt a matching typed row, and only then creates something new, so nothing double-counts. Card payments, Stripe payouts and account moves are tagged as transfers.</p>
    ${card(`Bank feeds ${b.plaidEnv === 'sandbox' && b.plaidConfigured ? '<span class="pill warn">sandbox</span>' : ''}`, items.length ? `${plural(items.length, 'connection')}, synced every night.` : 'No bank connected yet.',
      (items.length ? items.map(i => srow(esc(i.name), i.accounts.map(esc).join(', '), `<button class="btn sm ghost danger" data-ledger-event="click" data-ledger-action="plaidRemove" data-name="${esc(i.item_id)}">Disconnect</button>`)).join('') : '')
      + (b.plaidConfigured ? `<div class="row" style="margin-top:14px"><button class="btn primary" onclick="plaidConnect(this)">${icon('plus', 14)} Connect a bank or card</button>${items.length ? `<button class="btn" onclick="plaidSyncNow(this)">${icon('refresh', 14)} Sync now</button>` : ''}<span class="msg" id="plMsg"></span></div>` : '<p class="hint" style="margin-top:12px">Not set up: the Plaid keys go on the worker.</p>'))}
    ${card('How far back a bank remembers', '', `<p class="hint">A bank hands over a fixed window of history the moment you connect it and never widens it. Connecting the same bank again starts a fresh window of up to two years and replaces the old connection, so nothing arrives twice.</p>`)}
    ${ED.id === 'household' ? '' : card('Stripe', b.stripeConfigured ? 'Connected. Charges, refunds and exact fees sync every night, re-pulling the last 10 days so late data corrects itself.' : 'Not connected: paste a restricted key on the worker and push it.', b.stripeConfigured ? `<div class="row"><button class="btn" onclick="stripeSyncNow(this)">${icon('refresh', 14)} Sync the last 60 days</button><span class="msg" id="ssMsg"></span></div>` : '')}`;
}
/* ---- Slack and the Controller: notifications, the receipt channel, the helper ---- */
function secSlack() {
  const b = S.boot, name = ED.assistant;
  return `<h2>Slack and the ${esc(name)}</h2><p class="hint">The ${esc(name)} reads receipts dropped in the finance channel, answers when asked, posts the briefing on Mondays and says when something is wrong with the books.</p>
    ${card('Slack', '', srow('The finance channel', b.slackConfigured ? `Connected. ${b.slackInstant ? 'Receipts are handled the moment they land, with a 10-minute sweep as backup.' : 'Checked every 10 minutes.'}` : 'Not connected: the bot token is not on the worker yet.', b.slackConfigured ? `<button class="btn sm" onclick="slackPollNow(this)">Check the channel now</button><span class="msg" id="spMsg"></span>` : ''))}
    ${b.slackConfigured ? notifyCard() : ''}
    ${AskUI.settingsCard()}`;
}
function secAccessV6() {
  return `<h2>Access</h2><p class="hint">Who can sign in, how the app looks on this device, and where it reads the books from.</p>${setAccess()}`;
}
/* ---- Data: the tools for when something looks thin or wrong ---- */
function secData() {
  const b = S.boot, items = b.plaidItems || [];
  return `<h2>Data</h2><p class="hint">For when something looks thin or wrong. None of these double-count; closed months are reopened only when it says so.</p>
    ${card('Check against the bank', '', items.length ? srow(`Re-check ${moName(S.month)}`, 'Reads every transaction that month straight from the bank and adds anything the feed dropped.', `<button class="btn" onclick="plaidBackfill(this)">Re-check</button>`) + srow(`Rebuild ${new Date().getFullYear()} from the bank`, 'Reads the whole year and makes every month agree with it. Closed months are reopened so you read the new numbers first.', `<button class="btn" onclick="plaidYear(this)">Rebuild</button>`) + `<div class="msg" id="plMsg"></div>` : '<p class="hint">Connect a bank first, under Banks and cards.</p>')}
    ${card('Receipts from Gmail', 'For every charge missing a receipt, Ledger searches your email for that exact amount around that date, reads the email or its PDF, and attaches it when the total matches to the cent. Read-only: it can never send, delete or change mail.', `<div id="gmailBody" class="hint">Loading...</div>`)}
    ${card('Import receipts from Google Drive', 'For years already filed away in Drive. Reads each PDF, works out the amount and attaches it to the matching row. Never creates a transaction, never changes Drive.', `<div id="driveBody" class="hint">Loading...</div>`)}`;
}

/* ---- the Controller: what it is told about the screen ---- */
Object.assign(SCREEN_NAMES, {
  overview: 'Overview (the month at a glance, with the findings and briefing)', pnl: 'Profit and loss', balance: 'Balance sheet', costs: 'Costs (what repeats every month)', taxes: 'Taxes',
  forecast: 'Cash forecast', plan: 'Cash plan', txns: 'Transactions', receipts: 'Receipts', close: 'Close the month',
  retainers: 'Retainers (clients and concentration)', invoices: 'Invoices and Stripe', contractors: 'Contractors and 1099s',
  statements: 'Statements (the monthly report card)', pack: 'CPA pack', creports: 'Reports the helper built, and earlier chats', health: 'Business health', settings: 'Settings',
});
AskUI.state.name = ED.assistant;
AskUI.state.screen = () => {
  try {
    const view = S.view || 'overview';
    const ctx = { screen: SCREEN_NAMES[view] || view, screen_id: view, month_selected: S.month, edition: ED.id };
    if (PERIOD_PAGES.has(view)) ctx.period = rangeLabel(presetRange(RP.preset, RP));
    if (view === 'statements') ctx.report_month = S.reportMonth || S.month;
    if (view === 'txns' && S.filter && S.filter !== 'all') ctx.list_filtered_to = S.filter;
    if (view === 'txns' && (S.q || '').trim()) ctx.search_box = S.q.trim();
    if (view === 'settings') ctx.settings_section = SET.sec;
    return ctx;
  } catch (e) { return null; }
};

/* ---- go ---- */
applyTheme();
wireAskbar();
(() => { const u = new URL(location.href); const open = u.searchParams.get('open'); if (open) S.view = LEGACY[open] || open; else if (!PAGE_TITLE[S.view]) S.view = 'overview'; })();
/* The engine's boot may have finished before these files loaded (a fast API)
   and tried its own show(), which no longer fits the page. Take over here. */
if (!S.tok) renderGate();
else if (S.boot) { setChip('Live', 'live'); show(S.view); }
else paintNav();
