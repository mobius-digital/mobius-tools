/* Your profile > Connect your AI. A person links their own Claude or ChatGPT to their numbers:
   make a key (shown once), copy the address and the key, follow three steps, and see or turn off their keys.
   Real mode: account-health GET /api/connect-ai (is it on, the address, limits), GET /api/connect-ai/keys,
   GET /api/connect-ai/calls; POST /api/connect-ai/keys makes a key, POST /api/connect-ai/keys/revoke turns one off,
   PUT /api/connect-ai/switch is the owner's on and off.
   The AI can read and suggest. It cannot change anything: a suggestion is a card that waits for a tap (ai-cards.js,
   the next tab). Off by default: with the workspace switch off the page says so in one line, the owner gets the
   switch, and everyone else is told who turns it on. */

import { h, put, card, button, field, toggle, tabs, table, empty, statusDot, pill, toast, sheet, relativeTime, addStyles, em } from '../../kit.js';
import { APP_NAME } from '../../config.js';
import { seenAsClient, clientsOwn, staleHold, ownGet, noEmail } from './_own.js';
import { pageHelp } from '../../defs.js';
import { fold, css as setCss } from '../brand-settings/_set.js';

const CSS = `
.lx-cai{display:grid;gap:var(--sp-8)}
.lx-cai-lede{font-size:15px;line-height:1.55;color:var(--ink-2);max-width:66ch;margin:0}
.lx-cai-make{display:flex;gap:var(--sp-4);align-items:flex-end;flex-wrap:wrap}
.lx-cai-make .lx-field{flex:1 1 220px;margin:0}
.lx-cai-make .life{flex:0 0 170px}
.lx-cai-steps{display:grid;gap:var(--sp-4);margin:var(--sp-5) 0 0;padding:0;list-style:none;counter-reset:cai}
.lx-cai-steps li{display:grid;grid-template-columns:28px 1fr;gap:var(--sp-4);align-items:start;line-height:1.5;color:var(--ink-2);counter-increment:cai}
.lx-cai-steps li::before{content:counter(cai);display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--band);font-weight:600;font-size:13px;color:var(--ink)}
.lx-cai-copy{display:grid;gap:6px;margin-bottom:var(--sp-5)}
.lx-cai-copy .row{display:flex;gap:var(--sp-3);align-items:center}
.lx-cai-copy code{flex:1;min-width:0;padding:10px 12px;border-radius:var(--r-md,10px);background:var(--band);font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;user-select:all}
.lx-cai-once{padding:10px 12px;border-radius:var(--r-md,10px);background:rgba(255,166,43,.14);color:var(--ink);font-size:13.5px;line-height:1.45;margin:0 0 var(--sp-5)}
.lx-cai-can{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:var(--sp-3) var(--sp-6);margin:0;padding:0;list-style:none;color:var(--ink-2);font-size:13.5px;line-height:1.45}
.lx-cai-can b{color:var(--ink);font-weight:600}
.lx-cai-full{font-size:13px;color:var(--warn);margin:var(--sp-4) 0 0}
.lx-cai-canwrap{padding:16px 28px 20px}
.lx-cai-lede b{font-weight:600;color:var(--ink)}
.lx-cai-foot{font-size:12.5px;color:var(--muted);line-height:1.5;margin:var(--sp-4) 0 0;max-width:70ch}
@media (max-width:640px){.lx-cai-make .life{flex:1 1 100%}}
`;

const help = (st, ctx) => pageHelp({ body: [
  { title: 'What it is for', text: 'Use your own Claude or ChatGPT with your numbers. It can read and suggest. It cannot change an ad, a budget, a setting or anything else, and it cannot send, post or invite. When it suggests a change you get a card under AI suggestions, and nothing happens until you tap there.' },
  { title: 'The workspace switch', text: 'Off: the address does not answer and no key works. On: each person makes their own key, sees only their own brands, and nothing changes without a tap in ' + APP_NAME + '.' },
  { title: 'Keys', text: 'A key is yours. It sees the same brands you see here, and it stops on its end date or when you turn it off.' + (st && st.limits ? ` A key can ask ${st.limits.perMin} times a minute and ${st.limits.perDay.toLocaleString('en-US')} times a day.` : '') },
  { title: 'What you need', text: 'A paid plan with that AI app. Your numbers go to that AI company under your own plan with them. Menu names in those apps can change; the address and the key do not.' },
] });
const LIVES = [{ days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 180, label: '6 months' }, { days: 365, label: '1 year' }];
/* What the AI can do, in plain words. The names match the tools the server lists. */
const CAN = [
  ['See your brands', 'with each goal'], ['Read the numbers', 'revenue, ad spend, MER, new customers, for any dates'], ['Compare ad platforms', 'spend, sales and ROAS side by side'],
  ['Find the top ads', 'by spend, ROAS or sales'], ['See what is waiting', 'suggestions that need a yes or no'], ['Read the production board', 'what is being made and who has it'],
  ['Read the calendar', 'sales, launches and emails'], ['Open reports', 'the weekly and monthly ones'], ['Read the costs', 'product, postage, fees, fixed costs'], ['Suggest a change', 'as a card that waits for your tap'],
];
/* Written from each app's own help pages on 2026-11-25. Menu names change; the three things that matter do not:
   the address, the key, and (for Claude) a request header named Authorization. */
const STEPS = {
  claude: a => [
    ['In Claude, open ', h('b', null, 'Customize'), ', then ', h('b', null, 'Connectors'), '. Press ', h('b', null, 'Add'), ', then ', h('b', null, 'Add custom connector'), '. On a team plan the owner adds it once in Organization settings, Connectors.'],
    ['Name it ', h('b', null, APP_NAME), ' and paste the address. For sign in, choose ', h('b', null, 'No sign in'), '.'],
    ['Under ', h('b', null, 'Request headers'), ' add one named ', h('b', null, 'Authorization'), ' with the value ', h('b', null, 'Bearer'), ', a space, then your key. Press ', h('b', null, 'Add'), '.'],
  ],
  chatgpt: a => [
    ['In ChatGPT, open ', h('b', null, 'chatgpt.com/plugins'), '. Press the plus, then ', h('b', null, 'Add custom MCP server'), '.'],
    ['Name it ', h('b', null, APP_NAME), '. For the server address paste your ', h('b', null, 'personal address'), ' (the one that ends in your key). For sign in, choose ', h('b', null, 'No authentication'), '.'],
    ['Agree to the notice, press ', h('b', null, 'Create as a plugin'), ', then install it. Ask it: "What brands can you see in ' + APP_NAME + '?"'],
  ],
};

const day = iso => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const TOOL_WORDS = { list_brands: 'Listed brands', get_numbers: 'Read the numbers', platform_overview: 'Compared platforms', top_ads: 'Read top ads', suggestions_waiting: 'Read suggestions', production_board: 'Read production',
  calendar: 'Read the calendar', list_reports: 'Listed reports', get_report: 'Opened a report', costs_summary: 'Read costs', propose_change: 'Suggested a change' };

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast(what + ' copied'); }
  catch { toast('Could not copy. Select it and copy by hand.', { tone: 'bad' }); }
}
const copyRow = (label, value, what, hint) => h('div', { class: 'lx-cai-copy' }, h('span', { class: 'lx-cap' }, label),
  h('div', { class: 'row' }, h('code', null, value), button('Copy', { onclick: () => copy(value, what), aria: 'Copy ' + what.toLowerCase() })), hint && h('span', { class: 'lx-foot' }, hint));

/** The one time a key is on screen. */
function showKey(k) {
  sheet({ title: 'Your new key', side: 'center', body: h('div', null,
    h('p', { class: 'lx-cai-once' }, 'This is the only time the key is shown. Copy it now. If you lose it, turn it off and make another.'),
    copyRow('Address', k.address, 'Address'),
    copyRow('Key', k.key, 'Key', 'For Claude: it goes in a request header named Authorization, as Bearer then the key.'),
    copyRow('Personal address', k.personal_address, 'Personal address', 'For ChatGPT, which has no place for a key. Treat this address like a password.'),
    h('p', { class: 'lx-cai-foot' }, 'It works until ' + day(k.expires_at) + '. You can turn it off any time from this page.')) });
}

async function fetchAll(ctx, signal) {
  if (seenAsClient(ctx)) return { preview: true };       // the team looking as a client: no call is made
  const get = p => ctx.api(p, { worker: 'ah', signal });
  const status = await ownGet(ctx, '/api/connect-ai', signal);
  if (status.no_email) return status;
  if (!status.on) return { status, keys: [], calls: [] };
  const [k, c] = await Promise.all([get('/api/connect-ai/keys'), get('/api/connect-ai/calls').catch(e => { if (e && e.name === 'AbortError') throw e; return { calls: [] }; })]);
  return { status, keys: k.keys || [], calls: c.calls || [] };
}

function draw(el, data, ctx) {
  addStyles('lx-cai-css', CSS);
  data = data || {};
  if (seenAsClient(ctx)) return clientsOwn(el);
  if (staleHold(el, data, ctx, c => fetchAll(c), draw)) return;
  if (data.no_email) return noEmail(el);
  const st = data.status || {}, keys = data.keys || [], calls = data.calls || [];
  const brandName = id => (ctx.brands || []).find(b => b.id === id)?.name || id || '';
  /* after a change: read again and draw again, in place (the key itself is never part of this data) */
  const reload = async () => { try { draw(el, await fetchAll(ctx), ctx); } catch {} };
  const sampleStop = () => { if (ctx.sample) { toast('Sample numbers: nothing is saved.'); return true; } return false; };
  let which = 'claude';

  /* ---- the owner's switch, or "not on yet" ---- */
  const switchCard = st.can_switch ? card({ title: 'For your whole workspace', note: 'Only you see this' },
    toggle({ label: 'Let people connect their own AI', checked: !!st.on, onchange: async on => {
      if (sampleStop()) return;
      try { await ctx.api('/api/connect-ai/switch', { worker: 'ah', method: 'PUT', body: { on } }); toast(on ? 'Switched on. Each person makes their own key.' : 'Switched off. Every key stopped working.'); reload(); }
      catch (e) { toast(e.message || 'That did not save.', { tone: 'bad' }); }
    } })) : null;

  if (!st.on) {
    return put(el, h('div', { class: 'lx-cai' },
      h('div', null, help(st, ctx)),
      h('p', { class: 'lx-cai-lede' }, 'Connect your AI is switched off for this workspace.' + (st.can_switch ? ' Switch it on below.' : '')),
      switchCard,
      st.can_switch ? null : empty({ title: 'Not switched on yet', text: 'Your workspace owner turns this on. Then you can link your own Claude or ChatGPT to your numbers.' })));
  }

  /* ---- make a key ---- */
  const name = field({ label: 'What is this key for?', placeholder: 'Claude on my laptop', maxlength: 60 });
  const life = h('select', { class: 'lx-input', 'aria-label': 'How long it works' }, LIVES.map(l => h('option', { value: l.days, selected: l.days === (st.default_days || 90) || null }, l.label)));
  const live = keys.filter(k => k.state === 'live').length;
  const full = live >= (st.max_keys || 5);
  const makeBtn = button('Make a key', { primary: true, disabled: full, onclick: async () => {
    if (sampleStop()) return;
    makeBtn.disabled = true;
    try { const k = await ctx.api('/api/connect-ai/keys', { worker: 'ah', method: 'POST', body: { label: name.input.value.trim(), days: +life.value } }); showKey(k); reload(); }
    catch (e) { toast(e.message || 'Could not make a key.', { tone: 'bad' }); makeBtn.disabled = false; }
  } });
  const make = card({ title: 'Make a key', note: 'One per AI app' },
    h('div', { class: 'lx-cai-make' }, name, h('div', { class: 'lx-field life' }, h('label', null, 'Works for'), life), makeBtn),
    full ? h('p', { class: 'lx-cai-full', role: 'status' }, `You have ${live} working keys, which is the most allowed. Turn one off to make another.`) : null);

  /* ---- the three steps ---- */
  const stepsHost = h('ol', { class: 'lx-cai-steps' });
  const paintSteps = () => put(stepsHost, STEPS[which](st.address).map(parts => h('li', null, h('span', null, parts))));
  const stepTabs = tabs([{ id: 'claude', label: 'Claude' }, { id: 'chatgpt', label: 'ChatGPT' }], which, id => { which = id; stepTabs.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.tab === id)); paintSteps(); });
  paintSteps();
  const steps = card({ title: 'Connect it in three steps' },
    copyRow('Address', st.address, 'Address'), stepTabs, stepsHost);

  /* ---- my keys ---- */
  const off = k => sheet({ title: 'Turn this key off?', side: 'center', body: h('div', null,
    h('p', { style: { color: 'var(--ink-2)', lineHeight: 1.5, marginTop: 0 } }, `"${k.label}" stops working right away, in every app that uses it. This cannot be undone. You can make a new key any time.`),
    h('div', { style: { display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' } },
      button('Turn it off', { primary: true, onclick: async e => {
        if (sampleStop()) return;
        try { await ctx.api('/api/connect-ai/keys/revoke', { worker: 'ah', method: 'POST', body: { id: k.id } }); toast('Key turned off'); e.target.closest('.lx-overlay')?.remove(); reload(); }
        catch (err) { toast(err.message || 'That did not work.', { tone: 'bad' }); }
      } }))) });
  const state = k => k.state === 'live' ? statusDot('good', 'Working') : k.state === 'expired' ? statusDot('off', 'Ended') : statusDot('off', 'Turned off');
  const keyList = card({ title: 'Your keys', note: keys.length ? live + ' working' : null, flush: !!keys.length },
    keys.length ? table({ roomy: true, rows: keys, cols: [
      { key: 'label', label: 'Key', render: k => h('span', null, h('b', null, k.label), h('br'), h('span', { class: 'lx-foot' }, 'starts ' + k.starts_with)) },
      { key: 'state', label: 'Status', render: state },
      { key: 'last_used_at', label: 'Last used', render: k => (k.last_used_at ? relativeTime(k.last_used_at) : 'Never') },
      { key: 'expires_at', label: 'Works until', render: k => day(k.expires_at) },
      { key: 'brands', label: 'Sees', render: k => (k.brands === 'all' ? 'All your brands' : (k.brands || []).map(brandName).join(', ')) },
      { key: 'x', label: '', render: k => (k.state === 'live' ? button('Turn off', { ghost: true, onclick: () => off(k), aria: 'Turn off ' + k.label }) : '') },
    ] }) : empty({ title: 'No keys yet', text: 'Make one above, then follow the three steps.' }));

  /* ---- what it did ---- */
  const callList = calls.length ? card({ title: 'What your AI asked for', note: 'Last ' + Math.min(10, calls.length), flush: true },
    table({ rows: calls.slice(0, 10), cols: [
      { key: 'at', label: 'When', render: c => relativeTime(c.at) },
      { key: 'tool', label: 'What', render: c => TOOL_WORDS[c.tool] || 'Asked for something it cannot do' },
      { key: 'brand_id', label: 'Brand', render: c => (c.brand_id ? brandName(c.brand_id) : 'All brands') },
      { key: 'ok', label: 'Result', render: c => (c.ok ? statusDot('good', 'Allowed') : pill('warn', 'Refused')) },
    ] })) : null;

  setCss();
  const can = fold('What your AI can do', CAN.length + ' things it can read', h('div', { class: 'lx-cai-canwrap' }, h('ul', { class: 'lx-cai-can' }, CAN.map(([a, b]) => h('li', null, h('b', null, a), ', ' + b)))));

  put(el, h('div', { class: 'lx-cai' },
    h('div', null, help(st, ctx)),
    h('p', { class: 'lx-cai-lede' }, 'Use your own Claude or ChatGPT with your numbers. ', h('b', null, 'It can read and suggest. It cannot change anything: '), 'every change waits for your tap under ',
      h('a', { href: ctx.href('profile', 'ai-cards') }, 'AI suggestions'), '. There is no fee per question from us.'),
    switchCard, make, steps, keyList, callList, can));
}

export default {
  title: ['Connect ', em('your AI')],
  eyebrow: 'Your profile',
  ranges: false,
  load: ctx => fetchAll(ctx, ctx.signal),
  render: draw,
};
