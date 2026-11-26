/* Shared parts for the new client setup: Get started (client and team view), the New client screen, My day and the
   Client list. The layout rules live here (app.css is near its size cap), added once with addStyles.

   The team's onboarding lines (My day, the bell, the team view of Get started) carry an action from the server:
     { kind: 'remind', step }                   POST /api/onboard/remind { act, step }                (account-health)
     { kind: 'tick', platform, layer }          PUT  /api/onboard/connect { act, platform, layer, ticked: true }
     { kind: 'signer' }                         POST /api/onboard/approve-signer { act, yes }         (owner)
     { kind: 'release', invoice }               POST /api/onboard/billing { act, release }            (owner)
     null                                       only Open (the line's link)
   Sample mode sends nothing and says so. */

import { h, button, toast, addStyles } from '../../kit.js';

export const slugOf = id => String(id || '').replace(/^brand_/, '').replace(/_/g, '-');
export const setupHref = slug => '#/brand/' + encodeURIComponent(slug) + '/get-started/index';
export const days = n => (n == null ? '' : n === 0 ? 'today' : n === 1 ? '1 day' : n + ' days');
export const SAMPLE_SAID = 'Sample numbers: nothing was sent.';

/** One write to the account-health worker, or a plain refusal in sample mode (the caller handles sample itself). */
export function ah(ctx, path, method, body) {
  return ctx.api(path, { worker: 'ah', method, body, signal: undefined });
}

/** The buttons for one onboarding line. onDone(line, what) runs after a write went through. */
export function lineButtons(ctx, line, { onDone, openLabel = 'Open', primary = false } = {}) {
  /* My day items carry the action under onboard; the team block of GET /api/onboard carries kind, step and action flat */
  const o = line.onboard || { act: line.act_id, step: line.step, kind: line.kind, action: line.action || null }, a = o.action || null, act = o.act || line.act_id;
  const out = [];
  const run = (label, fn, opts = {}) => {
    const b = button(label, { primary: !!opts.primary, onclick: async () => {
      if (ctx.sample) { toast(SAMPLE_SAID); onDone && onDone(line, opts.what || label); return; }
      b.disabled = true;
      try { const r = await fn(); toast(opts.ok ? opts.ok(r) : 'Done.'); onDone && onDone(line, opts.what || label, r); }
      catch (e) { b.disabled = false; toast(e.message || 'That did not go through.', { tone: 'bad', ms: 5000 }); }
    } });
    out.push(b);
  };
  if (a && a.kind === 'remind') run('Remind them', () => ah(ctx, '/api/onboard/remind', 'POST', { act, step: a.step || o.step }),
    { primary, what: 'remind', ok: r => (r && r.text) || ('Reminder sent' + (r && r.to ? ' to ' + r.to : '') + '.') });
  else if (a && a.kind === 'tick') run('Done', () => ah(ctx, '/api/onboard/connect', 'PUT', { act, platform: a.platform, layer: a.layer || 'team', ticked: true }),
    { primary, what: 'tick', ok: () => 'Ticked.' });
  else if (a && a.kind === 'signer') {
    run('Yes', () => ah(ctx, '/api/onboard/approve-signer', 'POST', { act, yes: true }), { primary, what: 'yes', ok: r => 'Sent' + (r && r.sent_to ? ' to ' + r.sent_to : '') + '.' });
    run('No', () => ah(ctx, '/api/onboard/approve-signer', 'POST', { act, yes: false }), { what: 'no', ok: () => 'Kept with the main contact.' });
  } else if (a && a.kind === 'release') run('Send it anyway', () => ah(ctx, '/api/onboard/billing', 'POST', { act, release: a.invoice }),
    { primary, what: 'release', ok: r => (r && r.text) || 'Invoice sent.' });
  const link = o.kind === 'goal' && line.slug ? '#/brand/' + encodeURIComponent(line.slug) + '/brand-settings/goals'
    : line.slug ? setupHref(line.slug) : line.link || null;
  if (link) out.push(button(o.kind === 'goal' ? 'Open goals' : openLabel, { href: link, ghost: out.length > 0 }));
  return out;
}

/** A label and a value with a Copy button (our Business ID, our email). */
export function copyRow(label, value) {
  return h('div', { class: 'gs-copy' }, h('span', { class: 'k' }, label), h('code', null, value),
    button('Copy', { onclick: async () => {
      try { await navigator.clipboard.writeText(String(value)); toast('Copied.'); } catch { toast('Could not copy. It is ' + value, { ms: 6000 }); }
    } }));
}

/** A thin progress bar. */
export function bar(done, total) {
  const p = total ? Math.round(100 * done / total) : 0;
  return h('div', { class: 'gs-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) }, h('i', { style: { width: p + '%' } }));
}

let done = false;
export function css() {
  if (done) return;
  done = true;
  addStyles('lx-gs-css', CSS);
}
const CSS = `
.gs{display:grid;gap:var(--sp-6);min-width:0}
.gs-sent{margin:12px 0 0;font-size:13px;color:var(--muted)}
.gs-budget{display:flex;align-items:flex-end;gap:12px 20px;flex-wrap:wrap}
.gs-money{display:grid;gap:6px}
.gs-money .l{font-size:13px;font-weight:600}
.gs-box{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 12px;border-radius:10px;background:var(--surface);box-shadow:0 0 0 1px var(--line-strong);font-variant-numeric:tabular-nums}
.gs-box:focus-within{box-shadow:0 0 0 1.5px var(--e2),0 0 0 5px rgba(255,122,26,.16)}
.gs-box i{font-style:normal;font-size:13.5px;color:var(--muted)}
.gs-num{width:110px;border:0;outline:0;background:transparent;font:600 16px var(--sans);color:var(--ink);text-align:right;padding:0}
.gs-num:disabled{color:var(--faint)}
.gs-budget .lx-toggle{height:40px}
.gs-lede{font-size:15px;line-height:1.5;color:var(--ink-2);margin:0}
.gs-hint{font-size:13px;line-height:1.45;color:var(--muted);margin:0}
.gs-bar{height:8px;border-radius:999px;background:var(--bg-sunk);overflow:hidden}
.gs-bar i{display:block;height:100%;border-radius:999px;background:var(--good);transition:width var(--t) var(--ease)}
.gs-prog{display:grid;gap:10px}
.gs-prog .n{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.gs-prog .n b{font-size:var(--num-m);font-weight:600;letter-spacing:-.02em}
.gs-step{border-radius:16px;background:var(--surface);box-shadow:0 0 0 1px var(--line);min-width:0}
.gs-step>summary{list-style:none;display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:14px;align-items:center;padding:18px 22px;cursor:pointer}
.gs-step>summary::-webkit-details-marker{display:none}
.gs-step .dot{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:600;font-size:14px;background:var(--bg-sunk);color:var(--ink-2)}
.gs-step.done .dot{background:var(--good-bg);color:var(--good)}
.gs-step .dot svg{width:18px;height:18px}
.gs-step .t b{display:block;font-size:16px;font-weight:600}
.gs-step .t span{display:block;font-size:13px;color:var(--muted);line-height:1.4;margin-top:2px}
.gs-step .side{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.gs-body{display:grid;gap:var(--sp-5);padding:0 22px 22px 70px;min-width:0}
.gs-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding-top:var(--sp-4);border-top:1px solid var(--line)}
.gs-foot .who{font-size:13px;color:var(--muted)}
.gs-acts{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.gs-part{display:grid;gap:8px}
.gs-part h4{margin:0;font-size:14px;font-weight:600}
.gs-plat{display:grid;gap:10px;padding:16px 0;border-top:1px solid var(--line);min-width:0}
.gs-plat:first-of-type{border-top:0;padding-top:0}
.gs-plat .hd{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.gs-plat .hd b{font-size:15px;font-weight:600}
.gs-plat .why{font-size:13px;color:var(--muted);margin:0}
.gs-ticks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.gs-tick{display:grid;grid-template-columns:22px minmax(0,1fr);gap:4px 10px;align-items:start;padding:10px 12px;border-radius:12px;background:var(--bg-sunk);min-width:0}
.gs-tick .ic{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#fff;box-shadow:inset 0 0 0 1.5px var(--line-strong);color:transparent}
.gs-tick .ic svg{width:14px;height:14px}
.gs-tick.done .ic{background:var(--good);box-shadow:none;color:#fff}
.gs-tick.waiting .ic{background:var(--warn-bg);box-shadow:inset 0 0 0 1.5px var(--watch);color:var(--warn)}
.gs-tick.na{opacity:.6}
.gs-tick b{font-size:13.5px;font-weight:600}
.gs-tick small{grid-column:2;font-size:12px;color:var(--muted);line-height:1.35}
.gs-how{display:grid;gap:10px;font-size:13.5px;line-height:1.5}
.gs-how>summary{cursor:pointer;font-weight:600;font-size:13.5px;color:var(--ink-2);width:max-content}
.gs-how ol{margin:0;padding-left:20px;display:grid;gap:4px}
.gs-how .note{font-size:12.5px;color:var(--muted);margin:0}
.gs-copy{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}
.gs-copy .k{font-size:12.5px;color:var(--muted)}
.gs-copy code{font:600 13px var(--mono,ui-monospace,monospace);background:var(--bg-sunk);padding:4px 8px;border-radius:8px;overflow-wrap:anywhere;min-width:0}
.gs-copy .lx-btn{height:30px;padding:0 10px;font-size:12.5px}
.gs-inputs{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;align-items:end}
.gs-q{display:grid;gap:8px;padding:16px 0;border-top:1px solid var(--line);min-width:0}
.gs-q:first-of-type{border-top:0;padding-top:0}
.gs-q .qt{display:flex;gap:10px;align-items:baseline}
.gs-q .qt i{font-style:normal;font-size:12px;font-weight:600;color:var(--faint);min-width:18px}
.gs-q .qt b{font-size:14.5px;font-weight:600;line-height:1.4}
.gs-q textarea{min-height:76px}
.gs-draft{display:grid;gap:6px;padding:10px 12px;border-radius:12px;background:var(--bg-sunk);color:var(--muted);font-size:13.5px;line-height:1.45}
.gs-draft .lx-btn{justify-self:start;height:30px;padding:0 10px;font-size:12.5px}
.gs-q .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.gs-q .row .lx-btn{height:30px;padding:0 10px;font-size:12.5px}
.gs-q .row .lx-btn.on{background:var(--ink);color:#fff}
.gs-q .saved{font-size:12px;color:var(--muted)}
.gs-ans{font-size:14px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
.gs-ans.none{color:var(--faint)}
.gs-done{display:grid;gap:12px;justify-items:start;padding:22px;border-radius:16px;background:var(--good-bg)}
.gs-done b{font-size:18px;font-weight:600}
.gs-lines{display:grid}
.gs-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.gs-line:first-child{border-top:0}
.gs-line b{font-size:14px;font-weight:600;line-height:1.4}
.gs-line small{display:block;font-size:12.5px;color:var(--muted);line-height:1.4}
.gs-form{display:grid;gap:14px;min-width:0}
.gs-form .two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.gs-chips{display:flex;gap:8px;flex-wrap:wrap}
.gs-chips button{height:34px;padding:0 14px;border-radius:999px;border:0;background:#fff;box-shadow:inset 0 0 0 1px var(--line-strong);font:500 13.5px var(--sans);color:var(--ink-2);cursor:pointer}
.gs-chips button.on{background:var(--ink);color:#fff;box-shadow:none}
.gs-err{color:var(--bad);font-size:13px;font-weight:600;margin:0}
.gs-mail{white-space:pre-wrap;font:14px/1.55 var(--sans);min-height:260px}
.gs-agree{max-height:420px;overflow:auto;padding:16px 18px;border-radius:12px;background:var(--bg-sunk);font-size:13.5px;line-height:1.55;overflow-wrap:anywhere}
.gs-agree .blank{background:var(--warn-bg);color:var(--warn);padding:0 4px;border-radius:4px;font-weight:600}
.gs-res{display:grid;gap:8px}
.gs-res div{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;font-size:14px}
@media (max-width:759px){
  .gs-step>summary{grid-template-columns:30px minmax(0,1fr);padding:16px}
  .gs-step .side{grid-column:1/-1;justify-content:flex-start}
  .gs-body{padding:0 16px 18px}
  .gs-ticks{grid-template-columns:minmax(0,1fr)}
  .gs-form .two{grid-template-columns:minmax(0,1fr)}
  .gs-line{grid-template-columns:minmax(0,1fr)}
}
/* a phone: a choice of four (the goal measure) wraps onto two rows, every choice shows, nothing scrolls sideways */
@media (max-width:479px){
  .gs .lx-seg{display:flex;flex-wrap:wrap;overflow:visible}
  .gs .lx-seg button{flex:1 1 auto}
}
`;
