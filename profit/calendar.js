/* THE CALENDAR (2026-10-09: Lineup moved into Locus). Mock Cole approved: docs/locus-hub/mocks-calendar.html
 * (https://claude.ai/artifact/Umoq9q2cYe1n889Sdo7RLV); audit and goal: docs/handoffs/lineup-audit.md.
 * The dates customers see drive the work that must be ready for them. One page, rail item "Calendar":
 *   All clients   the lanes (one row per brand, 13 weeks; a brand's Black Friday week is ONE bar), tiles, and
 *                 "Work due this week" worked out from every date's countdown (grouped, late first)
 *   One brand     the month (multi-day dates span the week), warnings, Coming up with each countdown
 *   Any date      the side panel: what the customer sees, dates, the countdown (ticks itself from Asana,
 *                 Klaviyo and Meta), Make the Asana tasks, Move, Edit, It ended today, history, remove
 *   Add a date    an in-app modal that shows the countdown it will create
 * Data: account-health GET /api/calendar (calendar.js there). Writes go to the same worker. Season phases and
 * Drops are read-only here (edited on their own pages); typed dates are the old Lineup rows.
 * Also exported: homeCard(el, host) for Home (Live now + Coming up) and bandsFor(act, from, to) for charts. */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const U = () => window.V2UI;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const D = s => new Date(s + 'T12:00:00Z');
  const add = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const days = (a, b) => Math.round((D(b) - D(a)) / 864e5);
  const md = s => D(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const wd = s => D(s).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const monday = s => add(s, -((D(s).getUTCDay() + 6) % 7));
  const sunday = s => add(s, -D(s).getUTCDay());   // month and week grids start on Sunday (2026-11-21, Airtable look)
  const tip = h => (U() ? U().tipAttr(h) : '');
  const KL = { drop: 'Drop or launch', sale: 'Sale or offer', adpush: 'Ad push', site: 'Site change', other: 'Teaser, list, other' };
  const CLS = k => (k === 'drop' ? 'drop' : k === 'sale' ? 'sale' : 'other');
  /* Social posts (2026-10-19): the Week screen's posts ride on /api/calendar as `social`; a click opens them there. */
  const PLN = { ig: 'Instagram', fb: 'Facebook', tt: 'TikTok', yt: 'YouTube' };
  const postName = p => (p.caption || '').split('\n')[0].slice(0, 60) || (p.media && p.media.title) || 'no caption yet';
  const postLine = p => esc(`${{ posted: 'Posted', scheduled: 'Scheduled', handoff: 'By hand, in Slack', failed: 'Failed', partly: 'Partly posted', posting: 'Posting' }[p.status] || 'Draft'} ${p.hm || ''}`) + ' &middot; ' + esc((p.plats || []).map(x => PLN[x] || x).join(', ') || 'no account picked');
  function openPost(id, act) {
    if (act && H.S.act !== act) { H.S.act = act; try { localStorage.setItem('pf_act', act); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = act; }
    window.SOCIAL_POST = id; H.show('socialweek');
  }
  /* The countdown offsets, a copy of account-health calendar.js STEPS (for the Add preview only). */
  const STEPS = {
    drop: [['assets', 'Photos in', -14], ['briefs', 'Ads briefed', -12], ['built', 'Ads built', -5], ['email', 'Email and text scheduled', -3], ['loaded', 'Ads loaded', -2]],
    sale: [['offer', 'Offer written', -21], ['briefs', 'Ads briefed', -14], ['built', 'Ads built', -5], ['email', 'Email and text scheduled', -3], ['loaded', 'Ads loaded', -2]],
    adpush: [['briefs', 'Ads briefed', -14], ['built', 'Ads built', -5], ['loaded', 'Ads loaded', -2]],
    other: [['briefs', 'Ads briefed', -14], ['built', 'Ads built', -5], ['loaded', 'Ads loaded', -2]], site: [] };
  const ST = { off: 0, mon: null, wk: null, data: new Map() };
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} };
  /* ONE CALENDAR (2026-10-15, Cole approved): Work's calendar view moved in here. view = lanes (all clients only) /
     month / week; filter = all / mkt (what customers see) / tasks (what the team owes, /api/actions with a due date).
     Tasks are the team's page (AGENCY_TABS), so a client login never loads them and never sees the chips. */
  const VIEW = { v: store('cal_view') || '', f: store('cal_f') || 'all' };
  const CLI = () => !!(H && H.S && (H.S.role === 'client' || H.S.client)) || document.body.classList.contains('is-client');
  const FLT = () => (CLI() ? 'mkt' : VIEW.f);
  const PHONE = () => { try { return window.matchMedia('(max-width: 600px)').matches; } catch { return false; } };
  const viewOf = act => (!VIEW.v && PHONE() ? 'list' : ['week', 'day', 'list'].includes(VIEW.v) ? VIEW.v : VIEW.v === 'month' || (act && act !== 'all') ? 'month' : 'lanes');
  /* CHANNELS (2026-11-21, Cole yes on the send calendar plan, Well Copy's Airtable view): every chip belongs to one
     channel and the pills above the calendar switch each on or off (saved per viewer in cal_ch). Ads = ad pushes plus
     each date's "Ads loaded" step on its due day; Organic = social posts; Tasks = the team's (never for a client). */
  const CHS = [['dates', 'Sales and drops', '#5b7c99'], ['email', 'Email', '#2f9e44'], ['sms', 'SMS', '#c7b0f2'], ['ads', 'Ads', '#2d7ff9'], ['organic', 'Organic', '#9fe0f3'], ['tasks', 'Tasks', 'var(--muted)']];
  const CHOFF = (() => { try { return JSON.parse(store('cal_ch') || '{}') || {}; } catch { return {}; } })();
  const chOn = k => (k === 'tasks' && CLI() ? false : CHOFF[k] !== true);
  const chOf = x => (x.kind === 'mail' ? (x.mail.channel === 'sms' ? 'sms' : 'email') : x.kind === 'post' ? 'organic' : x.kind === 'task' ? 'tasks' : x.kind === 'ad' || x.kind === 'adpush' ? 'ads' : 'dates');
  const dotOf = x => (x.kind === 'mail' ? (x.mail.channel === 'sms' ? 'sms' : 'mail') : x.kind === 'mail' || x.kind === 'task' || x.kind === 'post' || x.kind === 'ad' ? x.kind : CLS(x.kind));

  function css() {
    if (document.getElementById('calcss')) return;
    const st = document.createElement('style'); st.id = 'calcss';
    st.textContent = `
      .cal .cal-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 14px}
      @media (max-width:1000px){.cal .cal-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .cal .cal-tile{border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:12px 14px;display:grid;gap:3px;cursor:pointer;text-align:left;color:var(--ink);font:inherit}
      .cal .cal-tile:hover{border-color:var(--line-strong)} .cal .cal-tile .l{font-size:12px;color:var(--muted)} .cal .cal-tile .v{font-size:24px;font-weight:650;line-height:1.15}
      .cal .cal-tile .s{font-size:12px;color:var(--muted)} .cal .cal-tile.warn .v{color:var(--warn)}
      .cal .cal-card{border:1px solid var(--line);border-radius:var(--r-lg,12px);background:var(--surface);padding:20px;margin:0 0 16px;min-width:0}
      .cal .cal-ch{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px} .cal .cal-ch h3{margin:0;font-size:13.5px;font-weight:650}
      .cal .cal-ch .cap{font-size:12px;color:var(--muted)} .cal .cal-ch .r{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .cal .cal-layer{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border:1px solid var(--line-strong);border-radius:99px;font-size:12px;font-weight:600;color:var(--ink-2);cursor:pointer;background:none;font-family:inherit}
      .cal .cal-layer i{width:9px;height:9px;border-radius:3px} .cal .cal-layer.off{opacity:.4}
      .cal .cal-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);font-weight:600;font-size:12px;cursor:pointer;color:var(--ink);font-family:inherit}
      .cal .cal-btn.pri,.cal-m .cal-btn.pri,.cal-pn .cal-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--on-brand,#fff)}
      .cal-m .cal-btn,.cal-pn .cal-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);font-weight:600;font-size:12.5px;cursor:pointer;color:var(--ink);font-family:inherit}
      .cal .cal-ln{position:relative;overflow:hidden}
      .cal .cal-hdr,.cal .cal-row{display:grid;grid-template-columns:150px minmax(0,1fr)}
      .cal .cal-hdr{border-bottom:1px solid var(--line)} .cal .cal-wk{position:relative;height:42px}
      .cal .cal-wk span{position:absolute;bottom:5px;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);transform:translateX(3px);white-space:nowrap}
      .cal .cal-wk .mk{top:1px;bottom:auto;font-size:10px;font-weight:700;letter-spacing:.02em;text-transform:none;padding:1px 6px;border-radius:4px;transform:translateX(-50%);z-index:4}
      .cal .cal-wk .mk.t{background:var(--brand);color:var(--on-brand,#fff)} .cal .cal-wk .mk.b{background:var(--c-email,#9b7bd8);color:#fff}
      .cal .cal-row{border-bottom:1px solid var(--line);min-height:42px} .cal .cal-row:last-child{border-bottom:0}
      .cal .cal-nm{padding:8px 10px 8px 0;font-weight:600;display:flex;flex-direction:column;justify-content:center;gap:1px;cursor:pointer;background:none;border:0;text-align:left;color:var(--ink);font-family:inherit;font-size:13px}
      .cal .cal-nm:hover{color:var(--brand)} .cal .cal-nm span{font-size:11px;font-weight:500;color:var(--muted)}
      .cal .cal-tr{position:relative;overflow:hidden}
      .cal .cal-tr .g{position:absolute;top:0;bottom:0;border-left:1px dashed var(--line)}
      .cal .cal-tr .td{position:absolute;top:0;bottom:0;width:2px;background:var(--brand);z-index:3;opacity:.85}
      .cal .cal-tr .bf{position:absolute;top:0;bottom:0;border-left:1.5px dashed var(--c-email,#9b7bd8);z-index:2;opacity:.8}
      .cal-bar{position:absolute;height:20px;border-radius:5px;font-size:11px;font-weight:600;line-height:18px;padding:0 6px;white-space:nowrap;cursor:pointer;z-index:1;border:1px solid var(--c);background:color-mix(in srgb,var(--c) 22%,var(--surface));color:var(--ink);font-family:inherit;text-align:left}
      .cal-bar .in{display:block;overflow:hidden;text-overflow:ellipsis} .cal-bar .af{position:absolute;left:100%;top:-1px;padding-left:7px;color:var(--ink-2);font-weight:500}
      .cal-bar .af.l{left:auto;right:100%;padding:0 7px 0 0}
      .cal-bar:hover{box-shadow:0 4px 12px -6px rgba(0,0,0,.5);z-index:6}
      .cal-bar.pen{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--c) 28%,var(--surface)) 0 6px,color-mix(in srgb,var(--c) 8%,var(--surface)) 6px 12px)}
      .cal-bar.miss{background:transparent;border-style:dashed;border-color:var(--warn);color:var(--warn)} .cal-bar.miss .af{color:var(--warn)}
      .cal-bar.open{border-right-style:dashed;-webkit-mask-image:linear-gradient(90deg,#000 75%,rgba(0,0,0,.25));mask-image:linear-gradient(90deg,#000 75%,rgba(0,0,0,.25))}
      .cal-bar.drop,.cal-chip.drop,.cal-pin.drop{--c:var(--c-meta,#5b8def)} .cal-bar.sale,.cal-chip.sale,.cal-pin.sale{--c:var(--c-email,#9b7bd8)} .cal-bar.other,.cal-chip.other,.cal-pin.other{--c:var(--muted)}
      .cal-chip.mail{--c:var(--good);background:transparent;border-color:transparent;color:var(--muted);font-weight:500;padding-left:12px}
      .cal-chip.mail::before{content:"";position:absolute;left:3px;top:6px;width:6px;height:6px;border-radius:50%;background:var(--good)} .cal-chip.mail.pen::before{background:transparent;border:1.5px solid var(--good);width:4px;height:4px}
      .cal-chip.mail.pen{background:transparent}
      .cal-pin{position:absolute;height:20px;display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;white-space:nowrap;transform:translateX(-5px);cursor:pointer;z-index:2;color:var(--ink);background:none;border:0;padding:0;font-family:inherit}
      .cal-pin i{width:10px;height:10px;transform:rotate(45deg);border-radius:2px;background:var(--c);flex:none} .cal-pin:hover span{text-decoration:underline}
      .cal-mail{position:absolute;width:12px;height:12px;transform:translateX(-6px);z-index:2;display:grid;place-items:center}
      .cal-mail::after{content:"";width:7px;height:7px;border-radius:50%;background:var(--good)} .cal-mail.sch::after{background:transparent;border:1.5px solid var(--good)}
      .cal .cal-empty{font-size:12px;color:var(--muted);padding-top:12px} .cal .cal-empty b{color:var(--warn);font-weight:600}
      .cal .cal-lg{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);margin-top:10px;align-items:center}
      .cal .cal-lg span{display:inline-flex;gap:6px;align-items:center} .cal .cal-lg i{display:inline-block;width:20px;height:11px;border-radius:3px}
      .cal .cal-wh{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint,var(--muted));padding:10px 6px 4px}
      .cal .cal-wi{display:grid;grid-template-columns:62px minmax(0,1fr) auto;gap:12px;align-items:center;padding:9px 6px;border-top:1px solid var(--line);border-radius:6px}
      .cal .cal-wi .d{font-weight:650;font-size:12.5px} .cal .cal-wi .d span{display:block;font-size:11px;color:var(--muted);font-weight:500}
      .cal .cal-wi .t{font-weight:600} .cal .cal-wi .t em{font-style:normal;color:var(--muted);font-weight:500} .cal .cal-wi .s{font-size:12px;color:var(--muted);margin-top:1px}
      .cal-lnk{color:var(--ink-2);cursor:pointer;border:0;border-bottom:1px dotted var(--line-strong);background:none;padding:0;font:inherit;font-size:12px} .cal-lnk:hover{color:var(--brand);border-color:var(--brand)}
      .cal-src{display:inline-flex;font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;white-space:nowrap;background:var(--surface-2);color:var(--ink-2)}
      .cal-src.good{background:var(--good-bg);color:var(--good)} .cal-src.warn{background:var(--warn-bg);color:var(--warn)}
      .cal .cal-tw{container:caltw/inline-size}
      .cal .cal-two{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
      .cal .cal-cu{display:grid;gap:9px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
      @container caltw (min-width:1180px){.cal .cal-cu{grid-template-columns:repeat(3,minmax(0,1fr))}}
      .cal .cal-mw{container:calmo/inline-size}
      .cal .cal-mo{border-top:1px solid var(--line);border-left:1px solid var(--line)}
      .cal .cal-mo .dhr,.cal .cal-mo .wr{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0;position:relative}
      .cal .cal-mo .dh{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:6px 8px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
      .cal .cal-mo .c{min-height:var(--rh,104px);border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:5px 7px;min-width:0;cursor:copy}
      .cal .cal-mo .c.hov{background:var(--surface-2)} .cal .cal-mo .c.x{background:var(--bg)} .cal .cal-mo .c.x .n{opacity:.45}
      .cal .cal-mo .c .n{font-size:11.5px;color:var(--muted);font-weight:600} .cal .cal-mo .c.td{box-shadow:inset 0 0 0 2px var(--brand)} .cal .cal-mo .c.td .n{color:var(--brand)}
      .cal .cal-mo .c.drop-on{background:var(--brand-soft,var(--surface-2))}
      .cal .cal-mo .bars{position:absolute;left:0;right:0;top:25px;pointer-events:none}
      .cal-chip{position:absolute;pointer-events:auto;margin:0 3px;font-size:11px;font-weight:600;padding:0 6px;height:19px;line-height:17px;border-radius:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;border:1px solid var(--c);background:color-mix(in srgb,var(--c) 22%,var(--surface));color:var(--ink);font-family:inherit;text-align:left}
      .cal-chip.pen{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--c) 28%,var(--surface)) 0 6px,color-mix(in srgb,var(--c) 8%,var(--surface)) 6px 12px)}
      .cal-chip.miss{background:transparent;border-style:dashed;border-color:var(--warn);color:var(--warn)} .cal-chip.cont{border-left-style:dashed}
      .cal-chip.more{border:0;background:transparent;color:var(--ink-2);font-weight:600} .cal-chip.more:hover{color:var(--brand);text-decoration:underline}
      .cal .cal-mo .dots{display:none;gap:3px;flex-wrap:wrap;margin-top:6px} .cal .cal-mo .dots i{width:7px;height:7px;border-radius:50%;background:var(--c)}
      .cal .cal-mo .dots i.mail{--c:var(--good)} .cal .cal-mo .dots i.drop{--c:var(--c-meta,#5b8def)} .cal .cal-mo .dots i.sale{--c:var(--c-email,#9b7bd8)} .cal .cal-mo .dots i.other{--c:var(--muted)}
      @container calmo (max-width:560px){.cal .cal-mw .cal-ch .r{width:100%;margin-left:0}.cal .cal-mw .cal-seg{flex:1 1 100%}.cal .cal-mw .cal-seg button{flex:1;min-height:36px}.cal .cal-mw [data-add]{margin-left:auto}.cal .cal-mo .bars{display:none}.cal .cal-mo .dots{display:flex;justify-content:center}.cal .cal-mo .c{min-height:58px;padding:5px 2px;cursor:pointer}.cal .cal-mo .dh{padding:6px 2px;text-align:center}.cal .cal-mo .c .n{display:block;text-align:center}}
      .cal-pn.cal-day{display:grid;gap:8px} .cal-day .cal-ev{border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:11px 12px;display:grid;gap:4px;cursor:pointer;text-align:left;width:100%;color:var(--ink);font:inherit}
      .cal-day .cal-ev:hover{border-color:var(--line-strong);background:var(--surface-2)} .cal-day .cal-ev b{font-size:13.5px} .cal-day .ty{font-size:11.5px;color:var(--muted);display:flex;gap:6px;align-items:center} .cal-day .ty i{width:8px;height:8px;border-radius:2px;background:var(--c)}
      .cal-day .cal-ev.mail{cursor:default}
      .cal-chip.task{--c:var(--line-strong);background:var(--surface);color:var(--ink-2);font-weight:500;padding-left:17px}
      .cal-chip.task::before{content:"";position:absolute;left:5px;top:5px;width:6px;height:6px;border-radius:2px;border:1.5px solid var(--muted)}
      .cal-chip.task.late{border-color:var(--warn);color:var(--warn)} .cal-chip.task.late::before{border-color:var(--warn)}
      .cal-chip.post{--c:var(--c-tiktok,#ff3b5c);background:transparent;border-color:transparent;color:var(--ink-2);font-weight:500;padding-left:14px}
      .cal-chip.post::before{content:"";position:absolute;left:4px;top:5px;width:7px;height:7px;border-radius:2px;background:var(--c)} .cal-chip.post.pen::before{background:transparent;border:1.5px solid var(--c)}
      .cal .cal-mo .dots i.post{--c:var(--c-tiktok,#ff3b5c);border-radius:2px}
      .cal-post{position:absolute;width:14px;height:14px;transform:translateX(-7px);z-index:2;display:grid;place-items:center;border:0;background:none;padding:0;cursor:pointer}
      .cal-post::after{content:"";width:8px;height:8px;border-radius:2px;background:var(--c-tiktok,#ff3b5c)} .cal-post.pen::after{background:transparent;border:1.5px solid var(--c-tiktok,#ff3b5c)}
      .cal .cal-mo .dots i.task{--c:var(--ink-2);border-radius:2px}
      .cal .cal-seg{display:inline-flex;border:1px solid var(--line-strong);border-radius:8px;padding:2px;gap:2px}
      .cal .cal-seg button{border:0;background:none;padding:4px 10px;border-radius:6px;font:inherit;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer}
      .cal .cal-seg button.on{background:var(--surface-2);color:var(--ink)}
      .cal .cal-fl{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 10px} .cal .cal-fl .cap{font-size:12px;color:var(--muted);flex:1 1 280px;min-width:0}
      .cal .cal-fl .cal-layer.on{border-color:var(--brand);color:var(--ink);background:var(--brand-soft,var(--surface-2))} .cal-chip[draggable="true"]{cursor:grab}
      .cal .cal-warn{padding:10px 12px;border-radius:8px;background:var(--warn-bg);font-size:12.5px;display:grid;gap:3px;margin:0 0 10px}
      .cal .cal-warn b{color:var(--warn)} .cal .cal-warn .a{display:flex;gap:6px;margin-top:5px;flex-wrap:wrap}
      .cal .cal-ev{border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:11px 12px;display:grid;gap:6px;cursor:pointer;text-align:left;width:100%;color:var(--ink);font:inherit}
      .cal .cal-ev:hover{border-color:var(--line-strong);background:var(--surface-2)}
      .cal .cal-ev .t1{display:flex;gap:8px;align-items:baseline} .cal .cal-ev .t1 b{font-size:13.5px} .cal .cal-ev .t1 span{margin-left:auto;font-size:12px;color:var(--muted);white-space:nowrap}
      .cal .cal-ev .ty{font-size:11.5px;color:var(--muted);display:flex;gap:6px;align-items:center} .cal .cal-ev .ty i{width:8px;height:8px;border-radius:2px;background:var(--c)}
      .cal-steps{display:flex;gap:3px} .cal-steps i{flex:1;height:5px;border-radius:3px;background:var(--surface-2);border:1px solid var(--line)}
      .cal-steps i.done{background:var(--good);border-color:var(--good)} .cal-steps i.late{background:var(--warn);border-color:var(--warn)}
      .cal .cal-ev .nx{font-size:12px;color:var(--ink-2)}
      .cal-pn{display:grid;gap:14px}
      .cal-pn .cvd{padding:12px 14px;border-radius:10px;display:grid;gap:3px} .cal-pn .cvd b{font-size:14px;text-transform:none;letter-spacing:0} .cal-pn .cvd span{font-size:12.5px;color:var(--ink-2);text-transform:none;letter-spacing:0;font-weight:400}
      .cal-pn .cvd.good{background:var(--good-bg)} .cal-pn .cvd.good b{color:var(--good)} .cal-pn .cvd.warn{background:var(--warn-bg)} .cal-pn .cvd.warn b{color:var(--warn)} .cal-pn .cvd.info{background:var(--surface-2)}
      .cal-pn h4{margin:0 0 7px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint,var(--muted))} .cal-pn p{margin:0;color:var(--ink-2)}
      .cal-pn .tags{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12.5px;color:var(--muted)}
      .cal-pn .tag{display:inline-flex;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:6px;background:var(--surface-2);color:var(--ink-2)} .cal-pn .tag.warn{background:var(--warn-bg);color:var(--warn)}
      .cal-pn .kv{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .cal-pn .kv div{border:1px solid var(--line);border-radius:8px;padding:8px 10px} .cal-pn .kv span{display:block;font-size:11px;color:var(--muted)} .cal-pn .kv b{font-size:13px}
      .cal-pn .cd{border:1px solid var(--line);border-radius:10px}
      .cal-pn .st{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 12px;border-top:1px solid var(--line)} .cal-pn .st:first-child{border-top:0}
      .cal-pn .ok{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;border:1.5px solid var(--line-strong);background:none;cursor:pointer;color:var(--bg);padding:0}
      .cal-pn .ok.y{background:var(--good);border-color:var(--good)} .cal-pn .ok.w{border-color:var(--warn);background:var(--warn-bg)} .cal-pn .ok[disabled]{cursor:default}
      .cal-pn .st b{font-weight:600} .cal-pn .st .s{display:block;font-size:11.5px;color:var(--muted)} .cal-pn .st .r{font-size:12px;color:var(--muted);text-align:right;white-space:nowrap} .cal-pn .st .r b{display:block;color:var(--ink-2)}
      .cal-pn .st.lt .r b{color:var(--warn)} .cal-pn .acts{display:flex;gap:8px;flex-wrap:wrap}
      .cal-pn .wb{padding:10px 12px;border-radius:8px;background:var(--warn-bg);font-size:12.5px;display:grid;gap:4px} .cal-pn .wb b{color:var(--warn)}
      .cal-pn .hist{display:grid;gap:5px;font-size:12.5px;color:var(--ink-2)} .cal-pn .hist span{color:var(--muted)}
      .cal-m .modal{max-width:820px;width:min(820px,94vw);padding:0;display:grid;grid-template-columns:minmax(0,1fr) 270px;overflow:hidden}
      @media (max-width:760px){.cal-m .modal{grid-template-columns:1fr}}
      .cal-m .fl{padding:18px 20px;display:grid;gap:12px;align-content:start} .cal-m .fr{padding:18px;border-left:1px solid var(--line);background:var(--surface-2);display:grid;gap:8px;align-content:start}
      .cal-m h3{margin:0;font-size:17px} .cal-m label.f{display:grid;gap:5px;font-size:11.5px;color:var(--muted);font-weight:500} .cal-m label.f em{font-style:normal;opacity:.75}
      .cal-m input[type=text],.cal-m input[type=date],.cal-m input[type=url],.cal-m textarea,.cal-m select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px}
      .cal-m textarea{min-height:60px;resize:vertical} .cal-m .row3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .cal-m .pills{display:flex;gap:6px;flex-wrap:wrap} .cal-m .pills button{padding:5px 11px;border:1px solid var(--line-strong);border-radius:99px;font-weight:600;font-size:12px;cursor:pointer;color:var(--ink-2);background:var(--surface);font-family:inherit}
      .cal-m .pills button.on{background:var(--brand-soft,var(--surface-2));border-color:var(--brand);color:var(--ink)}
      .cal-m .mini>div{display:flex;justify-content:space-between;gap:8px;padding:6px 2px;border-bottom:1px solid var(--line);font-size:12.5px} .cal-m .mini span{color:var(--muted)} .cal-m .mini .late{color:var(--warn);font-weight:600}
      .cal-m .err{color:var(--bad);font-size:12.5px;min-height:1em} .cal-m .foot{display:flex;gap:8px;justify-content:flex-end}
      .calh .cal-mini>div{display:flex;justify-content:space-between;gap:10px;padding:7px 4px;border-top:1px solid var(--line);font-size:12.5px;cursor:pointer;border-radius:6px} .calh .cal-mini>div:hover{background:var(--surface-2)}
      .cal-chip.mail.em,.cal-chip.mail.sms{background:color-mix(in srgb,var(--c) 16%,var(--surface));border-color:var(--c);color:var(--ink);font-weight:600;padding-left:6px}
      .cal-chip.mail.em::before,.cal-chip.mail.sms::before{display:none} .cal-chip.mail.sms{--c:var(--c-sms,#d99a2b)}
      .cal-chip.mail.em.pen,.cal-chip.mail.sms.pen{background:transparent;border-style:dashed}
      .cal-chip.ad{--c:var(--c-meta,#5b8def);background:transparent;border-style:dashed;color:var(--ink-2);font-weight:500} .cal-chip.ad.done{border-style:solid;background:color-mix(in srgb,var(--c) 12%,var(--surface))}
      .cal .cal-mo .dots i.sms{--c:var(--c-sms,#d99a2b)} .cal .cal-mo .dots i.ad{--c:var(--c-meta,#5b8def);border-radius:2px}
      .cal .cal-ch2 .cal-layer.off{opacity:.45;border-style:dashed}
      .cal .cal-ag{display:grid;gap:0} .cal .cal-agd{display:grid;grid-template-columns:86px minmax(0,1fr);gap:12px;padding:10px 4px;border-top:1px solid var(--line)}
      .cal .cal-agd:first-child{border-top:0} .cal .cal-agd .d{font-weight:650;font-size:13px} .cal .cal-agd .d span{display:block;font-size:11.5px;color:var(--muted);font-weight:500}
      .cal .cal-agd.td .d{color:var(--brand)} .cal .cal-agd .l{display:grid;gap:6px;min-width:0}
      .cal .cal-agd .cal-ev{padding:8px 11px;gap:2px} .cal .cal-agd .cal-ev b{font-size:13px;font-weight:600;overflow-wrap:anywhere}
      .cal .cal-ag .ty i,.cal-day .ty i{width:8px;height:8px;border-radius:2px;background:var(--c)}
      @media (max-width:560px){.cal .cal-agd{grid-template-columns:1fr;gap:6px}}
      .cal .cal-mo:has(.cal-ag){border:0}
      .calh .cal-mini span{color:var(--muted);white-space:nowrap}
      /* ---- Airtable look ---- */
      .cal-at{--at-line:color-mix(in srgb,var(--ink) 11%,var(--surface));--at-green:#2d9d4b;--at-sms:#8f5fd6;--at-orange:#f29b1d;--at-teal:#1d9a8c;--at-blue:#3b6fe0;--at-pink:#e0629b;--at-grey:#7b8794;padding:16px 18px}
      .cal-at .at-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px} .cal-at .at-top h3{margin:0;font-size:14px;font-weight:650}
      .cal-at .at-new{background:var(--at-green);color:#fff;border:0;border-radius:6px;padding:6px 12px;font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
      
      
      .cal-at .at-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin:0 0 10px}
      .cal-at .at-btn{border:1px solid var(--at-line);background:var(--surface);color:var(--ink);border-radius:6px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer}
      .cal-at .at-mid{display:flex;align-items:center;gap:10px} .cal-at .at-mid h4{margin:0;font-size:17px;font-weight:650;min-width:120px;text-align:center}
      .cal-at .at-ar{border:0;background:none;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;padding:0 4px}
      .cal-at .at-seg{justify-self:end;border:1px solid var(--at-line);border-radius:6px;padding:0;gap:0;overflow:hidden} .cal-at .at-seg button{border-radius:0;padding:4px 11px;border-left:1px solid var(--at-line);font-weight:500}
      .cal-at .at-seg button:first-child{border-left:0} .cal-at .at-seg button.on{background:var(--surface-2);color:var(--ink);font-weight:650}
      .cal-at .at-how{margin:0 0 8px;font-size:11.5px;color:var(--muted)}
      @media (max-width:640px){.cal-at .at-nav{grid-template-columns:1fr auto}.cal-at .at-seg{grid-column:1/-1;justify-self:stretch;display:flex}.cal-at .at-seg button{flex:1}}
      .cal-at .cal-mo{border:1px solid var(--at-line);border-radius:6px;overflow:hidden}
      .cal-at .cal-mo .dh{text-align:center;font-size:11.5px;font-weight:500;letter-spacing:0;text-transform:none;color:var(--muted);border-color:var(--at-line);background:var(--surface-2);padding:7px 4px}
      .cal-at .cal-mo .c{border-color:var(--at-line);background:var(--surface)} .cal-at .cal-mo .c.x{background:var(--surface)} .cal-at .cal-mo .c.x .n{opacity:.4}
      .cal-at .cal-mo .c .n{display:block;text-align:right;font-size:11.5px;font-weight:600;color:var(--ink-2);position:relative}
      .cal-at .cal-mo .c.td{box-shadow:none} .cal-at .cal-mo .c.td .n{color:transparent}
      .cal-at .cal-mo .c.td .n::after{content:attr(data-n);position:absolute;right:-4px;top:-3px;width:20px;height:20px;border-radius:50%;background:var(--at-green);color:#fff;display:grid;place-items:center;font-size:11px}
      .cal-at .cal-chip{border:0;border-radius:5px;height:18px;line-height:18px;font-size:11px;font-weight:600;color:#fff;background:var(--c);padding:0 7px;margin:0 4px}
      .cal-at .cal-chip::before{display:none!important}
      .cal-at .cal-chip.sale{--c:var(--at-orange)} .cal-at .cal-chip.drop{--c:var(--at-teal)} .cal-at .cal-chip.other{--c:var(--at-grey)}
      .cal-at .cal-chip.mail.em{--c:var(--at-green)} .cal-at .cal-chip.mail.sms{--c:var(--at-sms)} .cal-at .cal-chip.ad{--c:var(--at-blue)} .cal-at .cal-chip.mail.em,.cal-at .cal-chip.mail.sms{background:var(--c);color:#fff;font-weight:600}
      .cal-at .cal-chip.post{--c:var(--at-pink);padding-left:7px} .cal-at .cal-chip.task{--c:color-mix(in srgb,var(--ink) 14%,var(--surface));color:var(--ink);padding-left:7px}
      .cal-at .cal-chip.pen,.cal-at .cal-chip.mail.em.pen,.cal-at .cal-chip.mail.sms.pen,.cal-at .cal-chip.ad,.cal-at .cal-chip.post.pen{background:color-mix(in srgb,var(--c) 16%,var(--surface));color:color-mix(in srgb,var(--c) 62%,var(--ink));border:0}
      .cal-at .cal-chip.ad.done{background:var(--c);color:#fff}
      .cal-at .cal-chip.miss{background:transparent;border:1.5px dashed var(--warn);color:var(--warn)}
      .cal-at .cal-chip.more{background:transparent;color:var(--ink-2)}
      .cal-at .cal-mo .dots i.mail{--c:var(--at-green)} .cal-at .cal-mo .dots i.sms{--c:var(--at-sms)} .cal-at .cal-mo .dots i.sale{--c:var(--at-orange)} .cal-at .cal-mo .dots i.drop{--c:var(--at-teal)} .cal-at .cal-mo .dots i.ad{--c:var(--at-blue)} .cal-at .cal-mo .dots i.post{--c:var(--at-pink)}
      .cal-at .cal-lg{display:none}
      @container calmo (max-width:560px){.cal-at .cal-mo .dots{gap:2px;justify-content:center;padding:0 2px}.cal-at .cal-mo .dots i{width:100%;max-width:26px;height:5px;border-radius:3px}.cal-at .cal-mo .c .n{text-align:center}}
      .cal-at .cal-mo .dots i.task{--c:var(--at-grey)} .cal-at .cal-mo .dots i.other{--c:var(--at-grey)}
      .cal-at .cal-ag{border:1px solid var(--at-line);border-radius:6px;overflow:hidden}
      .cal-at .cal-agd{grid-template-columns:96px minmax(0,1fr);gap:0;padding:0;border-top:1px solid var(--at-line)}
      .cal-at .cal-agd .d{padding:9px 12px;font-size:12px;background:var(--surface-2);border-right:1px solid var(--at-line)} .cal-at .cal-agd.td .d{color:var(--at-green)}
      .cal-at .cal-agd .l{gap:0}
      .cal-at .cal-agd .cal-ev{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto);align-items:center;gap:12px;border:0;border-top:1px solid var(--at-line);border-radius:0;padding:7px 12px;background:var(--surface)}
      .cal-at .cal-agd .cal-ev:first-child{border-top:0} .cal-at .cal-agd .cal-ev:hover{background:var(--surface-2)}
      .cal-at .cal-agd .cal-ev b{font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cal-at .cal-agd .cal-ev .ty{font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;justify-content:flex-end}
      .cal-at .cal-agd .cal-ev .ty i{width:10px;height:10px;border-radius:3px;flex:none}
      @media (max-width:640px){.cal-at .cal-agd{grid-template-columns:1fr}.cal-at .cal-agd .d{border-right:0}.cal-at .cal-agd .cal-ev{grid-template-columns:1fr;gap:2px}.cal-at .cal-agd .cal-ev .ty{justify-content:flex-start}}
      .cal-at{--at-green:#2f9e44;--at-red:#f4a9c6;--at-char:#5b7c99;--at-content:#f5a524;--at-sms:#c7b0f2;--at-teal:#20a39e;--at-blue:#2d7ff9;--at-pink:#9fe0f3;--at-grey:#c9ced6}
      .cal-at .cal-chip{font-size:10.5px;font-weight:500;letter-spacing:-.005em;padding:0 6px;margin:0 3px;height:18px;line-height:18px}
      .cal-at .cal-chip.mail.em.p-last,.cal-at .cal-chip.mail.sms,.cal-at .cal-chip.post,.cal-at .cal-chip.other{color:#1f2329}
      .cal-at .cal-chip.pen,.cal-at .cal-chip.mail.em.pen,.cal-at .cal-chip.mail.sms.pen,.cal-at .cal-chip.post.pen,.cal-at .cal-chip.ad:not(.done){background:var(--surface)!important;color:var(--ink)!important;box-shadow:inset 0 0 0 1.5px var(--c)}
      .cal-at .at-tools{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:0 0 12px;padding:0 0 10px;border-bottom:1px solid var(--at-line)}
      .cal-at .at-tb{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:6px;font-size:12px;color:var(--ink-2);cursor:pointer;list-style:none;user-select:none}
      .cal-at .at-tb:hover{background:var(--surface-2)} .cal-at .at-tb.by{background:color-mix(in srgb,var(--at-green) 12%,var(--surface));color:var(--ink);cursor:default}
      .cal-at .at-tb summary::-webkit-details-marker,.cal-at summary.at-tb::-webkit-details-marker{display:none}
      .cal-at .at-n{background:var(--at-green);color:#fff;border-radius:99px;font-size:10px;padding:0 6px;line-height:15px}
      .cal-at .at-dd{position:relative} .cal-at .at-menu{position:absolute;left:0;top:calc(100% + 6px);z-index:30;min-width:220px;background:var(--surface);border:1px solid var(--at-line);border-radius:8px;padding:10px;box-shadow:0 14px 30px -14px rgba(0,0,0,.35)}
      .cal-at .at-menu p{margin:0 0 6px;font-size:11px;color:var(--muted)} .cal-at .at-menu .cal-layer{display:flex;width:100%;border:0;background:none;padding:5px 4px;border-radius:5px}
      .cal-at .at-menu .cal-layer.off{opacity:.45;text-decoration:none} .cal-at .at-menu .cal-layer:hover{background:var(--surface-2)}
      .cal-at .at-key.at-menu{width:min(440px,86vw)}
      .cal-at .at-find input{border:0;background:none;outline:none;font:inherit;font-size:12px;color:var(--ink);width:110px}
      .cal-at .at-find:focus-within{box-shadow:inset 0 0 0 1px var(--at-line)}
      .cal-at .cal-chip.mail.em.p-sale{--c:var(--at-green)} .cal-at .cal-chip.mail.em.p-last{--c:var(--at-red)} .cal-at .cal-chip.mail.em.p-content{--c:var(--at-content)}
      .cal-at .cal-chip.sale{--c:var(--at-char)} .cal-at .cal-chip.drop{--c:var(--at-teal)} .cal-at .cal-chip.other{--c:var(--at-grey)}
      .cal-at .cal-chip.task{background:var(--surface);color:var(--ink-2);box-shadow:inset 0 0 0 1px var(--at-line)}
      .cal-at .at-left{justify-self:start;display:flex;gap:6px;align-items:center;position:relative}
      .cal-at .at-colors summary{list-style:none} .cal-at .at-colors summary::-webkit-details-marker{display:none}
      .cal-at .at-colors[open] .at-key{position:absolute;left:0;top:calc(100% + 6px);z-index:20;width:min(460px,86vw);background:var(--surface);border:1px solid var(--at-line);border-radius:8px;padding:12px;box-shadow:0 12px 30px -14px rgba(0,0,0,.35)}
      .cal-at .at-key{display:flex;flex-wrap:wrap;gap:8px 14px;font-size:12px;color:var(--ink-2);margin:0}
      .cal-at .at-key span{display:inline-flex;align-items:center;gap:5px} .cal-at .at-key .sep{margin-left:6px;padding-left:12px;border-left:1px solid var(--at-line)}
      .cal-at .at-key i{width:16px;height:10px;border-radius:3px;display:inline-block}
      .cal-at .k-sale{background:var(--at-green)} .cal-at .k-last{background:var(--at-red)} .cal-at .k-content{background:var(--at-content)} .cal-at .k-sms{background:var(--at-sms)}
      .cal-at .k-date{background:var(--at-char)} .cal-at .k-drop{background:var(--at-teal)} .cal-at .k-ad{background:var(--at-blue)} .cal-at .k-post{background:var(--at-pink)}
      .cal-at .k-task{background:var(--surface);box-shadow:inset 0 0 0 1px var(--at-line)} .cal-at .k-solid{background:var(--at-green)} .cal-at .k-pale{background:var(--surface);box-shadow:inset 0 0 0 1.5px var(--at-green)}
      .cal-at .k-miss{border:1.5px dashed var(--warn)}
      .cal-at .cal-mo .dots i.mail{--c:var(--at-green)} .calh .cal-mini .late{color:var(--warn);font-weight:600} .calh h4{margin:12px 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}`;
    document.head.appendChild(st);
  }

  /* ---------- data ---------- */
  async function load(act, force) {
    const k = act || 'all', hit = ST.data.get(k);
    if (!force && hit && Date.now() - hit.at < 120e3) return hit.p;
    const p = H.apiAH(`/api/calendar?act=${encodeURIComponent(k)}`);
    ST.data.set(k, { at: Date.now(), p }); p.catch(() => ST.data.delete(k));
    return p;
  }
  const drop = () => ST.data.clear();
  async function loadTasks(force) {
    if (CLI()) return null;
    const hit = ST.data.get('tasks');
    if (!force && hit && Date.now() - hit.at < 120e3) return hit.p;
    const p = H.apiAH('/api/actions?act=all&status=open').then(r => { if (r && r.error) throw new Error(r.error); return (r.items || []).filter(i => i.kind !== 'brief' && /^\d{4}-\d{2}-\d{2}/.test(String(i.due || ''))); });
    ST.data.set('tasks', { at: Date.now(), p }); p.catch(() => ST.data.delete('tasks'));
    return p;
  }
  const bfOf = today => { const y = +today.slice(0, 4); const nov1 = new Date(Date.UTC(y, 10, 1)); const thu = (4 - nov1.getUTCDay() + 7) % 7; return add(new Date(Date.UTC(y, 10, 1 + thu + 21)).toISOString().slice(0, 10), 1); };
  const brandName = (d, id) => (d.brands.find(b => b.id === id) || (H.S.accounts || []).find(a => a.act_id === id) || {}).name || id;
  const isOpen = e => e.kind === 'sale' && !e.end;
  /* Klaviyo names carry the team's filing prefix ("REM - Email - FRI 10/09/2026 - Fall Lies"): show the part a person wrote. */
  const mailName = n => { const parts = String(n || '').split(/\s+-\s+/); const i = parts.map(p => /\d{1,2}\/\d{1,2}(\/\d{2,4})?/.test(p)).lastIndexOf(true); return (i >= 0 && i < parts.length - 1 ? parts.slice(i + 1).join(' - ') : parts[parts.length - 1]).trim() || n; };
  /* A date with a teaser shows the teaser as its own striped lead-in, opening the same date. */
  const withTeasers = list => list.concat(list.filter(e => e.teaser && e.teaser < e.start).map(e => ({ ...e, name: `${e.name}: teaser`, kind: 'other', start: e.teaser, end: add(e.start, -1), status: 'pen', steps: [], teaserOf: true })));
  const endOf = e => e.end || add(e.start, 27);
  function merged(items, bf) {
    const inBF = x => x.src === 'season' && x.start >= add(bf, -3) && x.end && x.end <= add(bf, 3);
    const w = items.filter(inBF), rest = items.filter(x => !inBF(x));
    if (w.length < 2) return items;
    const st = w.some(x => x.status === 'miss') ? 'miss' : w.some(x => x.status === 'pen') ? 'pen' : 'conf';
    return rest.concat([{ id: `bfw:${w[0].act}`, src: 'season', act: w[0].act, name: 'Black Friday week', kind: 'sale', start: w.map(x => x.start).sort()[0], end: w.map(x => x.end).sort().pop(), status: st, parts: w, steps: [] }]);
  }
  const tipOf = (d, x) => `<b>${esc(brandName(d, x.act))}: ${esc(x.name)}</b><br>${md(x.start)}${isOpen(x) ? ', no end date' : x.end && x.end !== x.start ? ` to ${md(x.end)}` : ''} &middot; ${x.status === 'conf' ? 'confirmed' : x.status === 'miss' ? 'no offer yet' : 'pencilled or proposed'}${x.parts ? '<br>' + x.parts.map(p => esc(`${p.name} (${md(p.start)})`)).join(', ') : x.offer ? '<br>' + esc(x.offer.slice(0, 160)) : ''}<br><span class="faint">${x.src === 'season' ? 'From the Black Friday plan' : x.src === 'drop' ? 'From Products > Drops' : `Added by ${esc(x.by || 'the team')}`}. Click to open.</span>`;

  /* ---------- work due: every countdown step due this week or late, grouped ---------- */
  function workRows(d) {
    const today = d.today, end = add(today, 6), out = [];
    for (const e of d.items) {
      if (e.end && e.end < today) continue;
      for (const s of e.steps || []) {
        if (s.state === 'done') continue;
        const late = s.state === 'late' && e.start <= add(today, 42);
        if (late || (s.due >= today && s.due <= end)) out.push({ day: late ? 'late' : s.due, s, e });
      }
    }
    const g = {}; for (const r of out) (g[`${r.day}|${r.s.label}`] = g[`${r.day}|${r.s.label}`] || []).push(r);
    return Object.values(g).sort((a, b) => (a[0].day === 'late' ? '0' : a[0].day).localeCompare(b[0].day === 'late' ? '0' : b[0].day) || a[0].s.label.localeCompare(b[0].s.label));
  }
  function workHtml(d) {
    const G = workRows(d); if (!G.length) return '<p class="v2hint" style="margin:0">Nothing due this week and nothing late.</p>';
    let h = '', last = '';
    for (const rs of G) {
      const r0 = rs[0], day = r0.day;
      if (day !== last) { h += `<div class="cal-wh">${day === 'late' ? 'Late' : (day === d.today ? 'Today, ' : '') + wd(day) + ' ' + md(day)}</div>`; last = day; }
      const dues = rs.map(r => r.s.due).sort(), dd = day === 'late' ? dues[0] : day;
      const who = [...new Set(rs.map(r => r.s.who))].join(', ');
      const names = rs.map(r => `<button type="button" class="cal-lnk" data-ev="${esc(r.e.id)}">${esc(brandName(d, r.e.act))}${rs.length === 1 ? `, ${esc(r.e.name)}` : ''}</button>`).join(' &middot; ');
      const noAsana = rs.some(r => /No Asana task yet/.test(r.s.note) && r.e.src === 'cal' && ['briefs', 'built'].includes(r.s.key));
      const src = day === 'late' ? ['warn', r0.s.key === 'offer' ? 'Still a proposal or blank' : 'Not done'] : noAsana ? ['warn', 'No Asana task yet'] : ['', { offer: 'Offer', assets: 'Photos link', briefs: 'Asana', built: 'Asana', email: 'Klaviyo', loaded: 'Meta' }[r0.s.key] || ''];
      h += `<div class="cal-wi"><div class="d">${day === 'late' && dues[0] !== dues[dues.length - 1] ? md(dues[0]) + '+' : md(dd)}<span>${day === 'late' ? 'was due' : wd(dd)}</span></div><div><div class="t">${esc(r0.s.label)}${rs.length > 1 ? ` <em>&middot; ${rs.length} dates</em>` : ''}</div><div class="s">${names} &middot; ${esc(who)}</div></div><div style="display:flex;gap:6px;align-items:center">${noAsana && rs.length === 1 ? `<button type="button" class="cal-btn pri" data-asana="${esc(r0.e.id)}">Make the Asana tasks</button>` : ''}<span class="cal-src ${src[0]}">${esc(src[1])}</span></div></div>`;
    }
    return h;
  }

  /* ---------- All clients: lanes ---------- */
  const LAY = (() => { try { return JSON.parse(store('cal_lay') || '{}') || {}; } catch { return {}; } })();
  const on = k => LAY[k] !== false;
  function lanes(el, d) {
    const START = add(monday(d.today), ST.off * 7), DAYS = 91, END = add(START, DAYS - 1), bf = bfOf(d.today);
    const pct = s => Math.max(0, Math.min(100, days(START, s) / DAYS * 100));
    const tw = Math.max(400, (el.clientWidth || 1000) - 150), pxd = tw / DAYS;
    const wk = Array.from({ length: 13 }, (_, i) => `<span style="left:${i / 13 * 100}%">${md(add(START, i * 7))}</span>`).join('');
    const grid = Array.from({ length: 13 }, (_, i) => `<i class="g" style="left:${i / 13 * 100}%"></i>`).join('');
    const mk = (d.today >= START && d.today <= END ? `<span class="mk t" style="left:${pct(d.today)}%">Today</span>` : '') + (bf >= START && bf <= END ? `<span class="mk b" style="left:${pct(bf)}%">Black Friday</span>` : '');
    let h = `<div class="cal-hdr"><div></div><div class="cal-wk">${wk}${mk}</div></div>`;
    for (const b of d.brands) {
      const items = merged(withTeasers(d.items.filter(x => x.act === b.id && endOf(x) >= START && x.start <= END)), bf).filter(x => on(CLS(x.kind))).sort((x, y) => x.start.localeCompare(y.start));
      const rows = [];
      let inner = grid + (d.today >= START && d.today <= END ? `<i class="td" style="left:${pct(d.today)}%"></i>` : '') + (bf >= START && bf <= END ? `<i class="bf" style="left:${pct(bf)}%"></i>` : '');
      for (const x of items) {
        const e = endOf(x), s0 = days(START, x.start), one = x.start === x.end;
        const nm = isOpen(x) ? `${x.name} (no end date)` : x.name;
        const wpx = one ? 0 : (days(x.start, e) + 1) * pxd, lab = nm.length * 6.3 + 16, fits = one || wpx >= lab, nearEnd = pct(x.start) > 84;
        const ext = one ? s0 + Math.ceil((lab + 8) / pxd) : fits || nearEnd ? days(START, e) + 1 : days(START, e) + 1 + Math.ceil(lab / pxd);
        const from = !fits && nearEnd ? s0 - Math.ceil(lab / pxd) : s0;
        let r = rows.findIndex(z => z <= from); if (r < 0) { r = rows.length; rows.push(0); } rows[r] = ext + 1;
        const top = 7 + r * 25, tt = tip(tipOf(d, x));
        if (one) { inner += `<button type="button" class="cal-pin ${CLS(x.kind)}" style="left:${pct(x.start) + 50 / DAYS}%;top:${top}px" data-ev="${esc(x.id)}"${tt}><i></i><span>${esc(nm)}</span></button>`; continue; }
        const l = pct(x.start), w = Math.max(0.9, pct(e) - l + 100 / DAYS);
        inner += `<button type="button" class="cal-bar ${CLS(x.kind)} ${x.status === 'pen' ? 'pen' : ''} ${x.status === 'miss' ? 'miss' : ''} ${isOpen(x) ? 'open' : ''}" style="left:${l}%;width:${w}%;top:${top}px" data-ev="${esc(x.id)}"${tt}>${fits ? `<span class="in">${esc(nm)}</span>` : `<span class="af${nearEnd ? ' l' : ''}">${esc(nm)}</span>`}</button>`;
      }
      const mails = on('mail') ? d.emails.filter(m => m.act === b.id && m.date >= START && m.date <= END) : [];
      const posts = on('post') ? (d.social || []).filter(p => p.act === b.id && p.day >= START && p.day <= END) : [];
      const has = d.items.some(x => x.act === b.id && endOf(x) >= START && x.start <= END);
      const hgt = Math.max(1, rows.length) * 25 + 10 + (mails.length || posts.length ? 14 : 0);
      for (const p of posts) inner += `<button type="button" class="cal-post ${p.status === 'scheduled' || p.status === 'posted' ? '' : 'pen'}" style="left:${pct(p.day) + 50 / DAYS}%;top:${hgt - 17}px" data-post="${esc(p.id)}" data-pact="${esc(p.act)}"${tip(`<b>${esc(b.name)}: post, ${md(p.day)} ${esc(p.hm)}</b><br>${esc(postName(p))}<br>${postLine(p)}`)}></button>`;
      for (const m of mails) inner += `<i class="cal-mail ${m.status === 'scheduled' ? 'sch' : ''}" style="left:${pct(m.date) + 50 / DAYS}%;top:${hgt - 17}px"${tip(`<b>${esc(b.name)}: ${m.channel === 'sms' ? 'text' : 'email'}, ${md(m.date)}</b><br>${esc(mailName(m.name))}<br>${m.status} &middot; from Klaviyo`)}></i>`;
      if (!has) inner += `<div class="cal-empty"><b>Nothing planned in these 13 weeks.</b> Ask ${esc(b.name)} what is coming, or add what you know.</div>`;
      h += `<div class="cal-row"><button type="button" class="cal-nm" data-brand="${esc(b.id)}">${esc(b.name)}<span>${esc((b.team || {}).strat || '')}</span></button><div class="cal-tr" style="height:${has ? hgt : 42}px">${inner}</div></div>`;
    }
    el.innerHTML = h;
    return { START, END };
  }

  /* ---------- One brand: the month ---------- */
  const LANES = 4;
  const RANK = x => (x.kind === 'task' ? 2 : x.kind === 'mail' ? 1 : 0);
  function monthItems(d, act) {
    const all = !act || act === 'all', items = [], pre = id => (all && id ? `${brandName(d, id)}: ` : '');
    const mine = withTeasers(d.items.filter(x => all || x.act === act));
    for (const x of mine) items.push({ ...x, label: pre(x.act) + x.name });
    /* the day the ads for a date go in (its "Ads loaded" step), so Ads has something on the calendar */
    for (const x of mine) for (const s of x.steps || []) if (s.key === 'loaded' && s.due) items.push({ id: `ad:${x.id}`, of: x.id, kind: 'ad', name: `Ads in: ${x.name}`, label: pre(x.act) + `Ads in: ${x.name}`, start: s.due, end: s.due, status: s.state === 'done' ? 'conf' : 'pen', step: s, act: x.act });
    MAILS.clear();
    for (const e of d.emails.filter(e => all || e.act === act)) { const name = `${e.channel === 'sms' ? 'Text' : 'Email'}: ${mailName(e.name)}`, id = `mail:${e.act}:${e.date}:${e.name}`; MAILS.set(id, e); items.push({ id, src: 'email', name, label: pre(e.act) + name, kind: 'mail', start: e.date, end: e.date, status: e.status === 'scheduled' ? 'pen' : 'conf', mail: e }); }
    /* planned sends (step 3): outlined until Klaviyo has them; one already in Klaviyo that day on that channel wins */
    for (const e of d.planned || []) {
      if (!all && e.act !== act) continue;
      if (d.emails.some(m => m.act === e.act && m.date === e.date && m.channel === e.channel && mailName(m.name).toLowerCase() === String(e.name).toLowerCase())) continue;
      const name = `${e.channel === 'sms' ? 'Text' : 'Email'}: ${e.name}`, id = `plan:${e.act}:${e.date}:${e.time}:${e.audience}:${e.name}`;
      MAILS.set(id, { ...e, plan: true }); items.push({ id, src: 'plan', name, label: pre(e.act) + name, kind: 'mail', start: e.date, end: e.date, status: 'pen', mail: { ...e, plan: true } });
    }
    for (const p of d.social || []) {
      if (!all && p.act !== act) continue;
      const name = `Post: ${postName(p)}`;
      items.push({ id: `post:${p.id}`, kind: 'post', name, label: pre(p.act) + name, start: p.day, end: p.day, status: p.status === 'scheduled' || p.status === 'posted' ? 'conf' : 'pen', post: p });
    }
    for (const t of d.tasks || []) {
      if (!all && t.act_id !== act) continue;
      const due = String(t.due).slice(0, 10);
      items.push({ id: `task:${t.id}`, kind: 'task', name: t.text, label: pre(t.act_id) + t.text, start: due, end: due, status: 'conf', task: t });
    }
    const q = (ST.q || '').trim().toLowerCase();
    return items.filter(x => chOn(chOf(x)) && (!q || String(x.label || x.name || '').toLowerCase().includes(q))).sort((a, b) => a.start.localeCompare(b.start) || RANK(a) - RANK(b));
  }
  const MAILS = new Map();
  const chipTxt = x => String(x.label || x.name || '').replace(/(^|: )(Email|Text|Post|Ads in): /, '$1');
  /* COLOR SYSTEM (2026-11-21, Cole: "like Well Copy, different colors for what is happening"). Color = what it is,
     shade = where it stands (solid = sent / live / done, pale = planned or scheduled, dashed red = missing).
     An email's color is its PURPOSE: sale push (green), last chance (red), content with no hard sell (orange). A planned
     send carries its purpose; a Klaviyo send is read from its name. */
  const PURP = new Set(['sale', 'last', 'content']);
  const purposeOf = m => (PURP.has(m.purpose) ? m.purpose
    : /\b(last (call|chance|day)|ends? (tonight|today|tomorrow|at midnight)|final|hours left|days? left|still thinking|a few hours|ends in|ending)\b/i.test(m.name || '') ? 'last'
    : /\b(note|letter|voice|guide|why|how|story|tier list|breakup|phone note|plain[- ]text)\b/i.test(m.name || '') ? 'content' : 'sale');
  const PLAN_ST = { approved: ['good', 'Approved, waiting to load'], needs: ['warn', 'Needs your OK'], change: ['warn', 'Change asked'], build: ['info', 'Not made yet'], wrote: ['info', 'Written, not approved'], partner: ['info', 'The email team sends it'] };
  const CHC = { email: '--at-green, var(--good)', sms: '--at-sms, var(--c-sms)', ads: '--at-blue, var(--c-meta)', organic: '--at-pink, var(--c-tiktok)' };
  const PCC = { sale: '--at-green, var(--good)', last: '--at-red, var(--warn)', content: '--at-content, var(--warn)' };
  /* One row for a thing on a day: the day panel, the Day view and the List view all use it. */
  function rowHtml(d, x) {
    return x.kind === 'mail'
      ? `<button type="button" class="cal-ev" data-mail="${esc(x.id)}"><b>${esc(x.label)}</b><span class="ty" style="--c:var(${x.mail.channel === 'sms' ? CHC.sms : PCC[purposeOf(x.mail)]})"><i></i>${x.mail.channel === 'sms' ? 'Text' : 'Email'} &middot; ${x.mail.plan ? `planned${x.mail.time ? ' ' + esc(x.mail.time) : ''}${x.mail.audience ? ', ' + esc(x.mail.audience) : ''} &middot; ${esc((PLAN_ST[x.mail.status] || ['', 'Planned'])[1])}` : `${esc(x.mail.status)}, from Klaviyo`}</span></button>`
      : x.kind === 'ad'
      ? `<button type="button" class="cal-ev" data-ev="${esc(x.of)}"><b>${esc(x.label)}</b><span class="ty" style="--c:var(--at-blue, var(--c-meta))"><i></i>Ads &middot; ${esc(x.step.who || '')} &middot; ${esc(x.step.note || (x.status === 'conf' ? 'done' : 'not yet'))}</span></button>`
      : x.kind === 'post'
      ? `<button type="button" class="cal-ev" data-post="${esc(x.post.id)}" data-pact="${esc(x.post.act)}"><b>${esc(x.label)}</b><span class="ty" style="--c:var(--at-pink, var(--c-tiktok))"><i></i>${postLine(x.post)}</span></button>`
      : x.kind === 'task'
      ? `<button type="button" class="cal-ev" data-task="${esc(x.task.id)}"><b>${esc(x.label)}</b><span class="ty" style="--c:var(${x.start < d.today ? '--warn' : '--ink-2'})"><i></i>Task &middot; ${esc(x.task.owner || 'nobody yet')}${x.start < d.today ? ' &middot; late' : ''}</span></button>`
      : `<button type="button" class="cal-ev" data-ev="${esc(x.id)}"><b>${esc(x.label)}</b><span class="ty" style="--c:var(${x.kind === 'drop' ? '--at-teal, var(--c-meta)' : x.kind === 'sale' ? '--at-char, var(--c-email)' : '--at-grey, var(--muted)'})"><i></i>${esc(KL[x.kind] || '')} &middot; ${md(x.start)}${x.end && x.end !== x.start ? ` to ${md(x.end)}` : isOpen(x) ? ', no end date' : ''}</span></button>`;
  }
  /* An email or text: what it is, when, its state. Klaviyo's own page has the preview and the results. */
  function mailPanel(d, id) {
    const e = MAILS.get(id); if (!e) return;
    const sms = e.channel === 'sms';
    if (e.plan) {
      const ps = PLAN_ST[e.status] || ['info', 'Planned'];
      U().panel(sms ? 'Planned text' : 'Planned email', `<div class="cal-pn">
      <div class="cvd ${ps[0]}"><b>${esc(e.name)}</b><span>${esc(ps[1])} &middot; ${wd(e.date)} ${md(e.date)}${e.time ? ' ' + esc(e.time) : ''} &middot; ${esc(brandName(d, e.act))}</span></div>
      <div class="kv"><div><span>Channel</span><b>${sms ? 'SMS' : 'Email'}</b></div><div><span>Time</span><b>${esc(e.time || 'Not set')}</b></div><div><span>Who gets it</span><b>${esc(e.audience || 'Everyone')}</b></div></div>
      <p class="v2hint" style="margin:0">Planned, not in Klaviyo yet. It turns solid once Klaviyo has it scheduled.${e.source ? ` <a href="${esc(e.source)}" target="_blank" rel="noopener">Open the plan</a>` : ''}</p></div>`);
      return;
    }
    const st = e.status === 'sent' ? ['good', 'Sent'] : e.status === 'scheduled' ? ['info', 'Scheduled'] : ['info', e.status || 'Draft'];
    U().panel(sms ? 'Text' : 'Email', `<div class="cal-pn">
      <div class="cvd ${st[0]}"><b>${esc(mailName(e.name))}</b><span>${esc(st[1])} &middot; ${wd(e.date)} ${md(e.date)} &middot; ${esc(brandName(d, e.act))}</span></div>
      <div class="kv"><div><span>Channel</span><b>${sms ? 'SMS' : 'Email'}</b></div><div><span>Date</span><b>${md(e.date)}</b></div><div><span>State</span><b>${esc(st[1])}</b></div></div>
      <div><h4>Name in Klaviyo</h4><p style="overflow-wrap:anywhere">${esc(e.name)}</p></div>
      <p class="v2hint" style="margin:0">From Klaviyo. The preview, segment and results are on the campaign in Klaviyo.</p></div>`);
  }
  /* Everything on one day in the side panel (a sheet from the bottom on a phone): "+N more", or any tap on a phone. */
  function dayPanel(d, act, day) {
    const list = monthItems(d, act).filter(x => x.start <= day && (x.end || '2099-12-31') >= day);
    const body = U().panel(`${wd(day)} ${md(day)}`, `<div class="cal-pn cal-day">${list.length ? list.map(x => rowHtml(d, x)).join('') : '<p class="v2hint" style="margin:0">Nothing on this day.</p>'}${day >= d.today ? '<div style="margin-top:6px"><button type="button" class="cal-btn pri" data-addday="1">+ Add a date on this day</button></div>' : ''}</div>`);
    body.querySelectorAll('[data-mail]').forEach(b => b.onclick = () => mailPanel(d, b.dataset.mail));
    body.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => openEv(d, b.dataset.ev));
    body.querySelectorAll('[data-task]').forEach(b => b.onclick = () => taskPanel(d, b.dataset.task));
    body.querySelectorAll('[data-post]').forEach(b => b.onclick = () => { document.querySelector('#v2panel .pclose')?.click(); openPost(b.dataset.post, b.dataset.pact); });
    body.querySelectorAll('[data-addday]').forEach(b => b.onclick = () => { document.querySelector('#v2panel .pclose')?.click(); addModal(d, act, { start: day }); });
  }
  function month(el, d, act) {
    const week = viewOf(act) === 'week', mon = ST.mon || d.today.slice(0, 7), cap = week ? 99 : LANES;
    const [y, m] = mon.split('-').map(Number);
    const first = `${mon}-01`, dow = D(first).getUTCDay();
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const start = week ? sunday(ST.wk || d.today) : add(first, -dow), weeks = week ? 1 : Math.ceil((dow + n) / 7);
    const items = monthItems(d, act);
    let h = '<div class="dhr">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => `<div class="dh">${x}</div>`).join('') + '</div>';
    for (let w = 0; w < weeks; w++) {
      const ds = Array.from({ length: 7 }, (_, i) => add(start, w * 7 + i)), a = ds[0], z = ds[6];
      const used = [], cover = {}; let bars = '', hidden = {};
      for (const x of items) {
        const e0 = x.end || '2099-12-31';
        if (e0 < start || x.start > add(start, weeks * 7 - 1)) continue;
        const on1 = x.start < start ? start : x.start;   // AIRTABLE: one pill, on its first day on screen
        if (on1 < a || on1 > z) continue;
        const e = on1, c0 = days(a, on1), c1 = c0;
        for (let c = c0; c <= c1; c++) (cover[c] = cover[c] || []).push(dotOf(x));
        let r = used.findIndex(q => q < c0); if (r < 0) { r = used.length; used.push(-1); }
        if (r >= cap) { for (let c = c0; c <= c1; c++) hidden[c] = (hidden[c] || 0) + 1; continue; }
        used[r] = c1;
        if (x.kind === 'post') {
          bars += `<button type="button" class="cal-chip post${x.status === 'pen' ? ' pen' : ''}" style="left:${c0 / 7 * 100}%;width:calc(${100 / 7}% - 6px);top:${r * 22}px" data-post="${esc(x.post.id)}" data-pact="${esc(x.post.act)}"${tip(`<b>${esc(x.name)}</b><br>${postLine(x.post)}`)}>${esc(chipTxt(x))}</button>`;
          continue;
        }
        if (x.kind === 'task') {
          const t = x.task, late = x.start < d.today;
          bars += `<button type="button" class="cal-chip task${late ? ' late' : ''}" style="left:${c0 / 7 * 100}%;width:calc(${100 / 7}% - 6px);top:${r * 22}px" data-task="${esc(t.id)}" draggable="true" data-drag="task:${esc(t.id)}"${tip(`<b>Task: ${esc(t.text)}</b><br>${esc(t.act_id ? brandName(d, t.act_id) : 'Agency-wide')} &middot; ${esc(t.owner || 'nobody yet')} &middot; due ${md(x.start)}${late ? ', late' : ''}`)}>${esc(chipTxt(x))}</button>`;
          continue;
        }
        if (x.kind === 'ad') {
          bars += `<button type="button" class="cal-chip ad${x.status === 'conf' ? ' done' : ''}" style="left:${c0 / 7 * 100}%;width:calc(${100 / 7}% - 6px);top:${r * 22}px" data-ev="${esc(x.of)}"${tip(`<b>${esc(x.name)}</b><br>${esc(x.step.who || '')} &middot; ${esc(x.step.note || '')}`)}>${esc(chipTxt(x))}</button>`;
          continue;
        }
        if (x.kind === 'mail') {
          const sms = x.mail.channel === 'sms';
          bars += `<button type="button" class="cal-chip mail ${sms ? 'sms' : `em p-${purposeOf(x.mail)}`}${x.status === 'pen' ? ' pen' : ''}" style="left:${c0 / 7 * 100}%;width:calc(${100 / 7}% - 6px);top:${r * 22}px" data-mail="${esc(x.id)}"${tip(`<b>${esc(x.name)}</b><br>${md(x.start)}, ${x.mail.plan ? 'planned: ' + esc((PLAN_ST[x.mail.status] || ['', ''])[1]) : esc(x.mail.status) + ', from Klaviyo'}. Click for details.`)}>${esc(chipTxt(x))}</button>`;
          continue;
        }
        const cls = `cal-chip ${CLS(x.kind)} ${x.status === 'pen' ? 'pen' : ''} ${x.status === 'miss' ? 'miss' : ''} ${x.start < a ? 'cont' : ''}`;
        const tt = x.kind === 'mail' ? tip(`<b>${esc(x.name)}</b><br>${md(x.start)}, ${x.mail.status}, from Klaviyo`) : tip(tipOf(d, x));
        bars += `<button type="button" class="${cls}" style="left:${c0 / 7 * 100}%;width:calc(${(c1 - c0 + 1) / 7 * 100}% - 6px);top:${r * 22}px" ${x.kind === 'mail' ? '' : `data-ev="${esc(x.id)}"`}${x.editable && !x.teaserOf ? ` draggable="true" data-drag="${esc(x.id)}"` : ''}${tt}>${x.start < on1 ? '&#8592; ' : ''}${esc(x.label || x.name)}${x.end && x.end !== x.start ? ` (to ${md(x.end)})` : isOpen(x) ? ' (no end date)' : ''}</button>`;
      }
      /* Busy days (2026-10-15, Cole: "squished"): the row grows to the lanes it uses (up to LANES), and anything past
         that is "+N more" on its own line, a button that opens the whole day. */
      const lanes = Math.min(used.length, cap), more = Object.keys(hidden).length > 0;
      for (const [c, k] of Object.entries(hidden)) bars += `<button type="button" class="cal-chip more" data-dayall="${ds[c]}" style="left:${c / 7 * 100}%;width:calc(${100 / 7}% - 6px);top:${lanes * 22}px">+${k} more</button>`;
      const rh = week ? Math.max(220, 25 + lanes * 22 + (more ? 22 : 0) + 8) : 25 + LANES * 22 + 22 + 6;   // Month: every day the same height
      h += `<div class="wr" style="--rh:${rh}px">${ds.map((x, i) => `<div class="c ${week || x.slice(0, 7) === mon ? '' : 'x'} ${x === d.today ? 'td' : ''}" data-day="${x}"><span class="n" data-n="${+x.slice(8)}">${+x.slice(8)}</span>${cover[i] ? `<span class="dots">${cover[i].slice(0, 6).map(k => `<i class="${k}"></i>`).join('')}</span>` : ''}</div>`).join('')}<div class="bars">${bars}</div></div>`;
    }
    el.innerHTML = h;
    if (week) return `${md(start)} to ${md(add(start, 6))}`;
    return D(first).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  /* Day = one day in full; List = 4 weeks from the anchor, one row per day that has something (Airtable's list). */
  function agenda(el, d, act) {
    const dayV = viewOf(act) === 'day', a = dayV ? (ST.day || d.today) : (ST.lst || d.today), z = dayV ? a : add(a, 27);
    const items = monthItems(d, act).filter(x => x.start <= z && (x.end || '2099-12-31') >= a);
    const by = {};
    for (const x of items) { const s = x.start < a ? a : x.start; (by[s] = by[s] || []).push(x); }
    const ks = dayV ? [a] : Object.keys(by).sort();
    el.innerHTML = `<div class="cal-ag">${ks.length ? ks.map(k => `<div class="cal-agd ${k === d.today ? 'td' : ''}"><div class="d">${k === d.today ? 'Today' : wd(k)}<span>${md(k)}</span></div><div class="l">${(by[k] || []).map(x => rowHtml(d, x)).join('') || '<p class="v2hint" style="margin:0">Nothing on this day.</p>'}</div></div>`).join('') : '<p class="v2hint" style="margin:0;padding:10px 4px">Nothing in these 4 weeks with the channels picked.</p>'}</div>`;
    return dayV ? `${wd(a)} ${md(a)}` : `${md(a)} to ${md(z)}`;
  }
  const drawCal = (el, d, act) => (['day', 'list'].includes(viewOf(act)) ? agenda(el, d, act) : month(el, d, act));

  /* The month / week card, the same on both pages. */
  function monthCard(act) {
    const all = !act || act === 'all', v = viewOf(act), f = FLT(), cli = CLI();
    const seg = [...(all ? [['lanes', '13 weeks']] : []), ['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['list', 'List']].map(([k, l]) => `<button type="button" class="${v === k ? 'on' : ''}" data-view="${k}">${l}</button>`).join('');
    const fl = CHS.filter(([k]) => !(cli && k === 'tasks')).map(([k, l, c]) => `<button type="button" class="cal-layer ${chOn(k) ? 'on' : 'off'}" data-ch="${k}" aria-pressed="${chOn(k)}"><i style="background:${c}"></i>${l}</button>`).join('');
    const how = cli ? 'Tap a channel to show or hide it. Tap anything to see the details.'
      : 'Tap a channel to show or hide it. Tap anything for details; click an empty day to add a date; drag a date to move it.';
    const lg = `<div class="cal-lg"><span>Solid = sent, live or done</span><span>Dashed or striped = planned, scheduled, pencilled or not done yet</span><span>Ads = the day a date's ads go in</span></div>`;
    /* AIRTABLE LOOK (2026-11-21, Cole: match Well Copy's Airtable calendar view): name + green "+ New date" on top,
       the channel chips as the toolbar, then Today on the left, "< Month >" in the middle, the view switch on the right. */
    return `<div class="cal-card cal-mw cal-at"><div class="at-top"><h3>${all ? 'Every client' : 'Marketing calendar'}</h3><button type="button" class="at-new" data-add="1">+ New date</button></div>
      <div class="at-tools"><span class="at-tb by"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>By: Date</span>
        <details class="at-dd"><summary class="at-tb"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2 3h12l-4.6 5.4V13l-2.8-1.4V8.4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>Filter${CHS.filter(([k]) => !chOn(k) && !(cli && k === 'tasks')).length ? `<b class="at-n">${CHS.filter(([k]) => !chOn(k) && !(cli && k === 'tasks')).length}</b>` : ''}</summary><div class="at-menu cal-ch2"><p>Show on the calendar</p>${fl}</div></details>
        <details class="at-dd at-colors"><summary class="at-tb"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="5" cy="6" r="2.2" fill="#2f9e44"/><circle cx="10.5" cy="5" r="2.2" fill="#f5a524"/><circle cx="8" cy="10.5" r="2.2" fill="#b38ae8"/></svg>Colors</summary><div class="at-key at-menu"><span><i class="k-sale"></i>Email: sale</span><span><i class="k-last"></i>Email: last chance</span><span><i class="k-content"></i>Email: content, no hard sell</span><span><i class="k-sms"></i>Text</span><span><i class="k-date"></i>Sale or offer on the site</span><span><i class="k-drop"></i>Drop or launch</span><span><i class="k-ad"></i>Ads go in</span><span><i class="k-post"></i>Social post</span>${cli ? '' : '<span><i class="k-task"></i>Team task</span>'}<span class="sep"><i class="k-solid"></i>Solid = sent, live or done</span><span><i class="k-pale"></i>Outlined = planned, not out yet</span><span><i class="k-miss"></i>Dashed = missing something</span></div></details>
        <label class="at-tb at-find"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="7" cy="7" r="4.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.2 10.2L14 14" stroke="currentColor" stroke-width="1.4"/></svg><input type="search" id="calFind" placeholder="Find" value="${esc(ST.q || '')}" autocomplete="off"></label></div>
      <div class="at-nav"><div class="at-left"><button type="button" class="at-btn" data-m="0">Today</button></div><div class="at-mid"><button type="button" class="at-ar" data-m="-1" aria-label="Back">&#8249;</button><h4 id="calMonT"></h4><button type="button" class="at-ar" data-m="1" aria-label="Forward">&#8250;</button></div><span class="cal-seg at-seg" role="tablist">${seg}</span></div>
${!cli && chOn('tasks') && !d0tasks ? '<p class="v2hint" style="margin:0 0 8px;color:var(--warn)">The tasks did not load; showing marketing only.</p>' : ''}
      <div class="cal-mo" id="calMonth"></div>${lg}</div>`;
  }
  let d0tasks = true;

  /* ---------- the page ---------- */
  async function render(first) {
    css();
    const act = H.S.act || 'all', one = act !== 'all', t = H.RUN();
    const title = one ? `Calendar: ${esc(brandName({ brands: [] }, act))}` : 'Calendar';
    if (first) $('#main').innerHTML = `<div class="v2 cal">${H.pageHead('calendar', title)}<div class="v2card"><p class="v2hint">Loading the calendar…</p></div></div>`;
    let d; try { const [x, tk] = await Promise.all([load(act), loadTasks().catch(() => null)]); d = { ...x, tasks: tk }; d0tasks = CLI() || !!tk; } catch (e) { if (t === H.RUN()) $('#main').innerHTML = `<div class="v2 cal">${H.pageHead('calendar', title)}<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div></div>`; return; }
    if (t !== H.RUN()) return;
    return one ? brandPage(d, act) : allPage(d);
  }
  function headLine(d, list) {
    const today = d.today, wk = add(today, 6);
    const next = list.filter(e => e.start >= today && e.status !== 'miss').sort((a, b) => a.start.localeCompare(b.start))[0];
    const G = workRows(d).filter(g => g.every(r => list.includes(r.e)));
    const late = G.filter(g => g[0].day === 'late').reduce((s, g) => s + g.length, 0), due = G.filter(g => g[0].day !== 'late').reduce((s, g) => s + g.length, 0);
    const parts = [];
    if (next) { const ready = !(next.steps || []).some(s => s.state !== 'done'); parts.push(`${next.name}${d.brands.length > 1 ? ` (${brandName(d, next.act)})` : ''} goes live ${next.start === today ? 'today' : next.start <= wk ? wd(next.start) : `${wd(next.start)} ${md(next.start)}`}${ready && (next.steps || []).length ? ' and everything for it is done' : ''}.`); }
    const CLH = document.body.classList.contains('is-client');   // a client login: no internal steps or owners
    if (late && !CLH) parts.push(`${late} step${late === 1 ? ' is' : 's are'} late.`);
    if (due && !CLH) parts.push(`${due} more ${due === 1 ? 'is' : 'are'} due this week.`);
    if (!parts.length) parts.push('Nothing on the calendar in the next six weeks.');
    return parts.join(' ');
  }
  function allPage(d) {
    const today = d.today, wk = add(today, 6), six = add(today, 42);
    const live = d.items.filter(e => e.start >= today && e.start <= wk);
    const G = workRows(d), late = G.filter(g => g[0].day === 'late').reduce((s, g) => s + g.length, 0), due = G.filter(g => g[0].day !== 'late').reduce((s, g) => s + g.length, 0);
    const noAsana = G.filter(g => g.some(r => /No Asana task yet/.test(r.s.note) && r.e.src === 'cal')).length;
    const miss = d.items.filter(e => e.status === 'miss' && e.start <= six && (e.end || e.start) >= today);
    const quiet = d.brands.filter(b => !d.items.some(e => e.act === b.id && e.start <= six && endOf(e) >= today));
    const tile = (l, v, s, go, warn) => `<button type="button" class="cal-tile ${warn ? 'warn' : ''}" data-tile="${go}"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></button>`;
    const tiles = `<div class="cal-tiles">${tile('Goes live this week', live.length, live.slice(0, 2).map(e => `<b>${esc(e.name)}</b> ${wd(e.start)}`).join(', ') || 'Nothing this week', live[0] ? `ev:${live[0].id}` : 'work')}
      ${tile('Work due this week', due, `${late ? `<b>${late} late</b>` : 'Nothing late'}${noAsana ? ` &middot; ${noAsana} not in Asana` : ''}`, 'work', late || noAsana)}
      ${tile('Needs an offer', miss.length, miss.slice(0, 3).map(e => esc(brandName(d, e.act))).filter((v, i, a) => a.indexOf(v) === i).join(', ') || 'Every offer is written', miss[0] ? `ev:${miss[0].id}` : 'work', miss.length)}
      ${tile('Nothing planned, 6 weeks', quiet.length, quiet.map(b => esc(b.name)).join(', ') || 'Every client has something', quiet[0] ? `brand:${quiet[0].id}` : 'work')}</div>`;
    const lay = (k, c, l) => `<button type="button" class="cal-layer ${on(k) ? '' : 'off'}" data-lay="${k}"><i style="background:${c}"></i>${l}</button>`;
    $('#main').innerHTML = `<div class="v2 cal">${H.pageHead('calendar', 'Calendar')}
      <p class="cal-lead" style="margin:-4px 0 14px;font-size:15px;font-weight:600;max-width:80ch">${esc(headLine(d, d.items))}</p>
      ${tiles}
      ${viewOf('all') !== 'lanes' ? monthCard('all') : `<div class="cal-card"><div class="cal-ch"><h3>What customers see, every client</h3><span class="cal-seg" role="tablist"><button type="button" class="on" data-view="lanes">13 weeks</button><button type="button" data-view="day">Day</button><button type="button" data-view="week">Week</button><button type="button" data-view="month">Month</button><button type="button" data-view="list">List</button></span><span class="cap">13 weeks. Click anything to open it; click a client to see their month.</span>
        <div class="r">${lay('drop', 'var(--c-meta,#5b8def)', 'Drops')}${lay('sale', 'var(--c-email,#9b7bd8)', 'Sales and offers')}${lay('other', 'var(--muted)', 'Other')}${lay('mail', 'var(--good)', 'Emails')}${lay('post', 'var(--c-tiktok,#ff3b5c)', 'Posts')}
          <button type="button" class="cal-btn" data-nav="-4">&#8249;</button><button type="button" class="cal-btn" data-nav="0">Today</button><button type="button" class="cal-btn" data-nav="4">&#8250;</button>
          <button type="button" class="cal-btn pri" data-add="1">+ Add a date</button></div></div>
        <div class="cal-ln" id="calLanes"></div>
        <div class="cal-lg"><span><i style="border:1px solid var(--c-email,#9b7bd8);background:color-mix(in srgb,var(--c-email,#9b7bd8) 22%,var(--surface))"></i>Confirmed</span><span><i style="border:1px solid var(--muted);background:repeating-linear-gradient(135deg,var(--surface-2) 0 4px,transparent 4px 8px)"></i>Pencilled or proposed</span><span><i style="border:1.5px dashed var(--warn)"></i>No offer yet</span><span><i style="width:10px;height:10px;transform:rotate(45deg);background:var(--c-meta,#5b8def);border-radius:2px"></i>&nbsp;One-day drop</span><span><i style="width:8px;height:8px;border-radius:50%;background:var(--good)"></i>Email sent</span><span><i style="width:8px;height:8px;border-radius:50%;border:1.5px solid var(--good)"></i>Email scheduled</span><span>A client's Black Friday week is one bar; open it for the parts.</span></div>
      </div>`}
      <div class="cal-card" id="calWork"><div class="cal-ch"><h3>Work due this week</h3><span class="cap">Every date's countdown, ${md(today)} to ${md(wk)}, plus anything late. Ticks come from Asana, Klaviyo and Meta.</span></div>${workHtml(d)}</div>
    </div>`;
    if (viewOf('all') !== 'lanes') { document.getElementById('calMonT').textContent = drawCal(document.getElementById('calMonth'), d, 'all'); wire($('#main'), d); return; }
    const draw = () => { const el = document.getElementById('calLanes'); if (el) lanes(el, d); };
    requestAnimationFrame(draw);
    wire($('#main'), d);
  }
  function brandWarnings(d, act) {
    const today = d.today, bf = bfOf(today), out = [];
    const mine = d.items.filter(e => e.act === act && (e.end || '9999') >= today);
    for (const e of mine) {
      if (isOpen(e) && e.src === 'cal') out.push([`${e.name} has no end date.`, `It has been running since ${md(e.start)}${e.start < add(bf, -3) ? ' and would run into Black Friday' : ''}. Set the end, or tap "It ended today" when it stops.`, `<button type="button" class="cal-btn" data-ev="${esc(e.id)}">Open it</button>`]);
      if (e.status === 'miss') out.push([`${e.name}: no offer yet.`, 'It is on the Black Friday plan with nothing written.', `<button type="button" class="cal-btn" data-ev="${esc(e.id)}">Open it</button>`]);
      if (e.kind === 'drop' && e.src === 'cal' && e.start >= add(bf, -7) && e.start < add(bf, -1)) out.push([`${e.name} (${md(e.start)}) lands days before Black Friday.`, 'Is the new collection in the Black Friday offer? Decide it 30 days out so the briefs say it.', `<button type="button" class="cal-btn" data-ev="${esc(e.id)}">Open it</button>`]);
    }
    const sales = mine.filter(e => e.kind === 'sale' && e.status !== 'miss');
    for (let i = 0; i < sales.length; i++) for (let j = i + 1; j < sales.length; j++) {
      const a = sales[i], b = sales[j]; if (a.src === 'season' && b.src === 'season') continue;
      if (a.start <= endOf(b) && b.start <= endOf(a)) { out.push([`Two offers at once: ${a.name} and ${b.name}.`, `They overlap from ${md(a.start > b.start ? a.start : b.start)}. Fine if one is a contest, not a discount.`, '']); }
    }
    return out.slice(0, 5);
  }
  function brandPage(d, act) {
    const today = d.today, b = d.brands.find(x => x.id === act) || { name: brandName(d, act), team: {} };
    const mine = d.items.filter(e => e.act === act);
    const ahead = mine.filter(e => (e.end || '9999') >= today && e.start <= add(today, 42)).sort((x, y) => x.start.localeCompare(y.start));
    const warns = brandWarnings(d, act);
    const T = b.team || {};
    const cu = ahead.length ? ahead.slice(0, 8).map(e => {
      const st = e.steps || [], nx = st.find(s => s.state !== 'done'), late = st.find(s => s.state === 'late');
      const line = !st.length ? (e.src === 'drop' ? 'From Products > Drops.' : isOpen(e) ? '<b style="color:var(--warn)">No end date.</b>' : e.offer ? esc(e.offer.slice(0, 80)) : '') : late ? `<b style="color:var(--warn)">Late:</b> ${esc(late.label.toLowerCase())} (was due ${md(late.due)}, ${esc(late.who)})` : nx ? `<b>Next:</b> ${esc(nx.label.toLowerCase())} by ${md(nx.due)} (${esc(nx.who)})` : '<b>All set.</b>';
      return `<button type="button" class="cal-ev" data-ev="${esc(e.id)}"><span class="t1"><b>${esc(e.name)}</b><span>${wd(e.start)} ${md(e.start)}${e.end && e.end !== e.start ? ` to ${md(e.end)}` : ''}</span></span><span class="ty ${CLS(e.kind)}" style="--c:var(${e.kind === 'drop' ? '--c-meta' : e.kind === 'sale' ? '--c-email' : '--muted'})"><i></i>${esc(KL[e.kind] || '')}${e.src === 'season' ? ' &middot; Black Friday plan' : e.src === 'drop' ? ' &middot; Products' : ''}</span>${st.length ? `<span class="cal-steps">${st.map(s => `<i class="${s.state}"></i>`).join('')}</span>` : ''}<span class="nx">${line}</span></button>`;
    }).join('') : '<p class="v2hint" style="margin:0">Nothing in the next six weeks.</p>';
    $('#main').innerHTML = `<div class="v2 cal">${H.pageHead('calendar', `Calendar: ${esc(b.name)}`)}
      <p style="margin:-4px 0 4px;font-size:15px;font-weight:600;max-width:80ch">${esc(headLine(d, mine))}</p>
      <p class="v2hint cal-team" style="margin:0 0 14px">Locus <b>${esc(T.strat || 'Ahsan')}</b>, buyer <b>${esc(T.buyer || 'Ahsan')}</b>, email <b>${esc(T.email || '?')}</b> (from the Black Friday plan's call sheet). ${b.channel ? 'Pings go to the brand’s internal Slack channel.' : 'No internal Slack channel is set, so nothing pings.'}</p>
      <div class="cal-tw"><div class="cal-two">${monthCard(act)}
        <div>${warns.map(([h1, s, a]) => `<div class="cal-warn" style="margin-bottom:10px"><b>${esc(h1)}</b><span>${esc(s)}</span>${a ? `<div class="a">${a}</div>` : ''}</div>`).join('')}
          <div class="cal-card"><div class="cal-ch"><h3>Coming up</h3><span class="cap">6 weeks</span></div><div class="cal-cu">${cu}</div></div></div></div></div></div>`;
    const t = drawCal(document.getElementById('calMonth'), d, act); document.getElementById('calMonT').textContent = t;
    wire($('#main'), d, act);
  }

  /* ---------- clicks ---------- */
  function wire(root, d, act) {
    root.querySelectorAll('[data-ev]').forEach(b => b.onclick = e => { e.stopPropagation(); openEv(d, b.dataset.ev); });
    root.querySelectorAll('[data-post]').forEach(b => b.onclick = e => { e.stopPropagation(); openPost(b.dataset.post, b.dataset.pact); });
    root.querySelectorAll('[data-brand]').forEach(b => b.onclick = () => pickAct(b.dataset.brand));
    root.querySelectorAll('[data-asana]').forEach(b => b.onclick = e => { e.stopPropagation(); makeAsana(b.dataset.asana, b); });
    root.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addModal(d, act || null));
    root.querySelectorAll('[data-lay]').forEach(b => b.onclick = () => { LAY[b.dataset.lay] = !on(b.dataset.lay); store('cal_lay', JSON.stringify(LAY)); b.classList.toggle('off', !on(b.dataset.lay)); const el = document.getElementById('calLanes'); if (el) { lanes(el, d); wire(el, d); } });
    root.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { const n = +b.dataset.nav; ST.off = n ? ST.off + n : 0; const el = document.getElementById('calLanes'); if (el) { lanes(el, d); wire(el, d); } });
    const again = () => (act ? brandPage(d, act) : allPage(d));
    root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      const n = +b.dataset.m;
      const vv = viewOf(act);
      if (vv === 'day') ST.day = n ? add(ST.day || d.today, n) : null;
      else if (vv === 'list') ST.lst = n ? add(ST.lst || d.today, n * 28) : null;
      else if (vv === 'week') ST.wk = n ? add(sunday(ST.wk || d.today), n * 7) : null;
      else { const cur = ST.mon || d.today.slice(0, 7); const [y, m] = cur.split('-').map(Number); ST.mon = n ? new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7) : null; }
      again();
    });
    root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { VIEW.v = b.dataset.view; store('cal_view', VIEW.v); if (VIEW.v === 'week' && ST.mon) ST.wk = ST.mon === d.today.slice(0, 7) ? null : `${ST.mon}-01`; again(); });
    const fd = root.querySelector('#calFind');
    if (fd) fd.oninput = () => { ST.q = fd.value; const el = document.getElementById('calMonth'); if (el) { drawCal(el, d, act); wire(el, d, act); } };
    root.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { const k = b.dataset.ch; if (chOn(k)) CHOFF[k] = true; else delete CHOFF[k]; store('cal_ch', JSON.stringify(CHOFF)); again(); });
    root.querySelectorAll('[data-mail]').forEach(b => b.onclick = e => { e.stopPropagation(); mailPanel(d, b.dataset.mail); });
    root.querySelectorAll('[data-flt]').forEach(b => b.onclick = () => { VIEW.f = b.dataset.flt; store('cal_f', VIEW.f); again(); });
    root.querySelectorAll('.cal-mo [data-task]').forEach(b => b.onclick = e => { e.stopPropagation(); taskPanel(d, b.dataset.task); });
    root.querySelectorAll('[data-tile]').forEach(b => b.onclick = () => { const v = b.dataset.tile; if (v === 'work') document.getElementById('calWork')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); else if (v.startsWith('ev:')) openEv(d, v.slice(3)); else if (v.startsWith('brand:')) pickAct(v.slice(6)); });
    /* Hover lights the WHOLE day (2026-10-15): the chips sit on a layer above the cells, so CSS :hover only lit part
       of it, and v2.css's global .wr{gap:14px} had opened gaps between the days (gap:0 above). Each week row tracks the column under the pointer instead, chips included. */
    root.querySelectorAll('.cal-mo .wr').forEach(w => {
      const cs = [...w.querySelectorAll('.c')]; let at = -1;
      const set = i => { if (i === at) return; if (cs[at]) cs[at].classList.remove('hov'); at = i; if (cs[at]) cs[at].classList.add('hov'); };
      w.onmousemove = e => { const r = w.getBoundingClientRect(); set(Math.max(0, Math.min(6, Math.floor((e.clientX - r.left) / r.width * 7)))); };
      w.onmouseleave = () => set(-1);
    });
    root.querySelectorAll('[data-dayall]').forEach(b => b.onclick = e => { e.stopPropagation(); dayPanel(d, act, b.dataset.dayall); });
    root.querySelectorAll('.cal-mo .c[data-day]').forEach(c => {
      c.onclick = () => { if (c.closest('.cal-mo').clientWidth <= 560) return dayPanel(d, act, c.dataset.day); if (c.dataset.day < d.today) return toast('That day has passed.'); addModal(d, act, { start: c.dataset.day }); };
      c.ondragover = e => { e.preventDefault(); c.classList.add('drop-on'); };
      c.ondragleave = () => c.classList.remove('drop-on');
      c.ondrop = async e => { e.preventDefault(); c.classList.remove('drop-on'); const id = e.dataTransfer.getData('text/cal'); if (id && id.startsWith('task:')) moveTask(id.slice(5), c.dataset.day, d); else if (id) moveTo(id, c.dataset.day, d); };
    });
    root.querySelectorAll('[data-drag]').forEach(x => { x.ondragstart = e => { e.dataTransfer.setData('text/cal', x.dataset.drag); e.dataTransfer.effectAllowed = 'move'; }; });
  }
  const pickAct = id => { H.S.act = id; try { localStorage.setItem('pf_act', id); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = id; ST.mon = null; H.show('calendar'); };
  function toast(msg, undo) {
    let el = document.getElementById('calToast');
    if (!el) { el = document.createElement('div'); el.id = 'calToast'; el.className = 'lx-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
    el.hidden = true; void el.offsetWidth; el.hidden = false;
    if (undo) el.querySelector('button').onclick = () => { el.hidden = true; undo(); };
    clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, undo ? 6000 : 2600);
  }
  async function call(path, body, method = 'POST') {
    const r = await H.apiAH(path, { method, body: body ? JSON.stringify(body) : undefined });
    drop(); return r;
  }
  async function refresh() { drop(); await render(false); }
  async function moveTo(id, day, d) {
    const e = d.items.find(x => x.id === id); if (!e || e.start === day) return;
    try { await call('/api/calendar/move', { id, start: day }); toast(`Moved ${e.name} to ${md(day)}.`, async () => { await call('/api/calendar/move', { id, start: e.start }); refresh(); }); refresh(); }
    catch (er) { toast(er.message); }
  }
  async function moveTask(id, day, d) {
    const t = (d.tasks || []).find(x => x.id === id); if (!t || String(t.due).slice(0, 10) === day) return;
    try { await call('/api/actions/edit', { id, due: day }); toast(`Task due ${md(day)}.`, async () => { await call('/api/actions/edit', { id, due: String(t.due).slice(0, 10) }); refresh(); }); refresh(); }
    catch (er) { toast(er.message); }
  }
  /* A task in the side panel: who, when, Mark done, Move, or open it on Work > Tasks (the full edit window). */
  function taskPanel(d, id) {
    const t = (d.tasks || []).find(x => x.id === id); if (!t) return;
    const due = String(t.due).slice(0, 10), late = due < d.today;
    const body = U().panel(t.text, `<div class="cal-pn"><div class="tags"><span class="tag">Task</span>${late ? '<span class="tag warn">Late</span>' : ''}<span>${esc(t.act_id ? brandName(d, t.act_id) : 'Agency-wide')}</span></div>
      <div class="kv"><div><span>Due</span><b${late ? ' style="color:var(--warn)"' : ''}>${wd(due)} ${md(due)}</b></div><div><span>Who</span><b>${esc(t.owner || 'Nobody yet')}</b></div><div><span>Area</span><b>${esc(t.area ? t.area[0].toUpperCase() + t.area.slice(1) : 'None')}</b></div></div>
      <div class="acts"><button type="button" class="cal-btn pri" data-tdone="1">Mark done</button><button type="button" class="cal-btn" data-tmove="1">Move the due date</button><button type="button" class="cal-btn" data-topen="1">Open in Tasks</button></div></div>`);
    const close = () => document.querySelector('#v2panel .pclose')?.click();
    body.querySelector('[data-tdone]').onclick = async e => { e.target.disabled = true; try { await call('/api/actions/done', { id, done: true }); close(); toast('Done.', async () => { await call('/api/actions/done', { id, done: false }); refresh(); }); refresh(); } catch (er) { toast(er.message); e.target.disabled = false; } };
    body.querySelector('[data-tmove]').onclick = () => dateModal('Move the due date', t.text, due, async v => { await call('/api/actions/edit', { id, due: v }); toast(`Task due ${md(v)}.`); close(); refresh(); });
    body.querySelector('[data-topen]').onclick = () => { close(); window.ACT_OPEN = id; H.show('tasks'); };
  }
  async function makeAsana(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Making…'; }
    try { const r = await call('/api/calendar/asana', { id }); toast(r.made ? `Made ${r.made} Asana task${r.made === 1 ? '' : 's'}.` : 'The Asana tasks already exist.'); refresh(); }
    catch (e) { toast(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Make the Asana tasks'; } }
  }

  /* ---------- the side panel ---------- */
  async function openEv(d, id) {
    const bf = bfOf(d.today);
    let x = d.items.find(e => e.id === id);
    if (!x && id.startsWith('bfw:')) x = merged(d.items.filter(e => e.act === id.slice(4)), bf).find(e => e.id === id);
    if (!x) return;
    const name = brandName(d, x.act), today = d.today;
    const past = x.end && x.end < today, live = x.start <= today && (!x.end || x.end >= today);
    const st = x.steps || [], late = st.filter(s => s.state === 'late'), nx = st.find(s => s.state !== 'done');
    let h = `<div class="cal-pn"><div class="tags"><span class="tag">${esc(KL[x.kind] || 'Date')}</span><span class="tag ${x.status === 'miss' ? 'warn' : ''}">${past ? 'Done' : x.status === 'conf' ? 'Confirmed' : x.status === 'miss' ? 'No offer yet' : 'Pencilled'}</span><span>${esc(name)} &middot; ${x.src === 'season' ? 'from the Black Friday plan' : x.src === 'drop' ? 'from Products > Drops' : `added by ${esc(x.by || 'the team')}`}</span></div>`;
    if (x.parts) {
      h += `<div class="cvd info"><b>Black Friday week for ${esc(name)}, ${md(x.start)} to ${md(x.end)}.</b><span>One bar on the calendar so the busiest week stays readable. The parts:</span></div><div class="cd">${x.parts.map(p => `<div class="st"><span></span><div><b>${esc(p.name)}</b><span class="s">${esc(p.offer || 'No offer written yet.')}</span></div><div class="r"><b>${md(p.start)}${p.end !== p.start ? ` to ${md(p.end)}` : ''}</b></div></div>`).join('')}</div><div class="acts"><button type="button" class="cal-btn pri" data-go="season">Open the Black Friday plan</button></div></div>`;
      return show(x.name, h, d, x);
    }
    if (past) h += `<div class="cvd info"><b>Done ${md(x.end)}.</b><span>How it went is on the charts: open Home or Sales for ${esc(name)} and the shaded band is this date.</span></div>`;
    else if (x.status === 'miss') h += `<div class="cvd warn"><b>No offer written yet.</b><span>It is on the Black Friday plan with a date and nothing in it.</span></div>`;
    else if (live) h += `<div class="cvd good"><b>Live now${x.end ? `, until ${md(x.end)}` : ', no end date'}.</b><span>${x.end ? 'Ended early? Tap below so the calendar and the charts show the real dates.' : 'Nothing says when this ends. Set the end, or tap "It ended today" when it stops.'}</span></div>`;
    else if (late.length) h += `<div class="cvd warn"><b>${late.length} step${late.length > 1 ? 's' : ''} late for ${wd(x.start)} ${md(x.start)}.</b><span>${late.map(s => `${esc(s.label)} (was due ${md(s.due)}, ${esc(s.who)})`).join('; ')}.</span></div>`;
    else h += `<div class="cvd good"><b>On track for ${wd(x.start)} ${md(x.start)}.</b><span>${nx ? `Next: ${esc(nx.label.toLowerCase())} by ${md(nx.due)} (${esc(nx.who)}).` : st.length ? 'Everything is done.' : 'Nothing to prepare on our side.'}</span></div>`;
    h += `<div><h4>What the customer sees</h4><p>${x.offer ? esc(x.offer) : `<span style="color:var(--warn)">Nothing written yet.${x.src === 'cal' ? ' Edit to add it.' : ''}</span>`}</p></div>`;
    h += `<div class="kv"><div><span>Goes live</span><b>${wd(x.start)} ${md(x.start)}</b></div><div><span>Ends</span><b${isOpen(x) ? ' style="color:var(--warn)"' : ''}>${isOpen(x) ? 'No end date' : !x.end || x.end === x.start ? 'Same day' : md(x.end)}</b></div><div><span>${x.teaser ? 'Teaser from' : 'Photos'}</span><b>${x.teaser ? md(x.teaser) : x.assets ? `<a href="${esc(x.assets)}" target="_blank" rel="noopener" style="color:var(--brand)">Open &#8599;</a>` : '<span style="color:var(--muted);font-weight:500">No link</span>'}</b></div></div>`;
    if (x.src === 'cal' && !past && (isOpen(x) || (live && x.kind !== 'drop'))) h += `<div class="wb"><b>${isOpen(x) ? 'When does it end?' : 'Ending early?'}</b><span>${isOpen(x) ? 'Until it has an end, the Monday Slack post asks "still running?".' : 'Tap when it stops.'}</span><div class="acts"><button type="button" class="cal-btn" data-end="${today}">It ended today</button>${isOpen(x) ? '<button type="button" class="cal-btn" data-endpick="1">Set an end date</button>' : ''}</div></div>`;
    if (st.length && !past) h += `<div><h4>Countdown (ticks itself)</h4><div class="cd">${st.map(s => `<div class="st ${s.state === 'late' ? 'lt' : ''}"><button type="button" class="ok ${s.state === 'done' ? 'y' : s.state === 'late' ? 'w' : ''}" ${x.src === 'cal' ? `data-tick="${s.key}" data-done="${s.state === 'done' ? 0 : 1}"` : 'disabled'}${tip(esc(s.state === 'done' ? (x.ticks && x.ticks[s.key] ? 'Ticked by hand. Click to untick.' : 'Done. ' + s.how + '.') : `${s.how}. ${x.src === 'cal' ? 'Or click to tick it by hand.' : ''}`))}>${s.state === 'done' ? '&#10003;' : ''}</button><div><b>${esc(s.label)}</b><span class="s">${esc(s.note)}</span></div><div class="r"><b>${wd(s.due)} ${md(s.due)}</b>${esc(s.who)}</div></div>`).join('')}</div></div>`;
    const acts = [];
    /* A client login (the brand edition, 2026-10-10) edits, moves, removes and notes its own dates and opens the season
       and drop pages; ticking the team's work steps and making Asana tasks (Mobius's Asana) stay the team's. */
    const CL = H.S && H.S.role === 'client';
    if (!CL && x.src === 'cal' && !past && st.some(s => ['briefs', 'built'].includes(s.key) && !s.asana && s.state !== 'done')) acts.push('<button type="button" class="cal-btn pri" data-asana-p="1">Make the Asana tasks</button>');
    if (x.src === 'cal' && st.some(s => s.asana)) acts.push(`<span class="v2hint" style="margin:0;align-self:center">${st.filter(s => s.asana).length} Asana tasks made</span>`);
    if (x.src === 'cal') acts.push('<button type="button" class="cal-btn" data-edit="1">Edit</button><button type="button" class="cal-btn" data-movep="1">Move the date</button><button type="button" class="cal-btn" data-del="1" style="color:var(--bad)">Remove</button>');
    if (x.src === 'season') acts.push('<button type="button" class="cal-btn pri" data-go="season">Edit on the Black Friday plan</button>');
    if (x.src === 'drop') acts.push('<button type="button" class="cal-btn pri" data-go="drops">Open Drops</button>');
    h += `<div class="acts">${acts.join('')}</div>`;
    if (x.src === 'cal') h += `<div class="cal-note"><h4>Leave a note</h4><textarea id="calNote" rows="2" maxlength="600" placeholder="${CL ? 'A question or a detail for the Mobius team' : 'A note on this date, kept in its history'}"></textarea><div class="acts"><button type="button" class="cal-btn" data-note="1">Add the note</button></div></div><div><h4>History</h4><div class="hist" id="calHist"><span>Loading…</span></div></div>`;
    h += '</div>';
    const body = show(x.name, h, d, x);
    if (x.src === 'cal') H.apiAH(`/api/calendar/history?id=${encodeURIComponent(x.id)}`).then(r => { const el = body.querySelector('#calHist'); if (el) el.innerHTML = (r.history || []).length ? r.history.map(l => `<div><span>${md(l.t.slice(0, 10))}</span> ${esc(l.s)} &middot; ${esc(l.b)}</div>`).join('') : '<span>No changes recorded.</span>'; }).catch(() => {});
  }
  function show(title, html, d, x) {
    const body = U().panel(title, html);
    const close = () => document.querySelector('#v2panel .ph button')?.click();
    body.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { close(); H.show(b.dataset.go); });
    body.querySelectorAll('[data-note]').forEach(b => b.onclick = async () => {
      const ta = body.querySelector('#calNote'); const text = (ta && ta.value || '').trim(); if (!text) return toast('Write the note first.');
      b.disabled = true;
      try { await call('/api/calendar/comment', { id: x.id, text }); ta.value = ''; toast('Note added. The team sees it in Slack.');
        const r = await H.apiAH(`/api/calendar/history?id=${encodeURIComponent(x.id)}`, { fresh: true }); const el = body.querySelector('#calHist'); if (el) el.innerHTML = (r.history || []).map(l => `<div><span>${md(l.t.slice(0, 10))}</span> ${esc(l.s)} &middot; ${esc(l.b)}</div>`).join(''); }
      catch (e) { toast(e.message); } finally { b.disabled = false; }
    });
    if (H.S && H.S.role === 'client') body.querySelectorAll('[data-tick]').forEach(b => { b.removeAttribute('data-tick'); b.disabled = true; });
    body.querySelectorAll('[data-tick]').forEach(b => b.onclick = async () => { try { await call('/api/calendar/tick', { id: x.id, key: b.dataset.tick, done: b.dataset.done === '1' }); const nd = await load(H.S.act || 'all', true); refresh(); openEv(nd, x.id); } catch (e) { toast(e.message); } });
    body.querySelectorAll('[data-end]').forEach(b => b.onclick = async () => { try { await call('/api/calendar/end', { id: x.id, date: b.dataset.end }); toast(`${x.name} ends ${md(b.dataset.end)}.`); close(); refresh(); } catch (e) { toast(e.message); } });
    body.querySelectorAll('[data-endpick]').forEach(b => b.onclick = () => dateModal('When does it end?', `${x.name} went live ${md(x.start)}.`, x.start, async v => { await call('/api/calendar/end', { id: x.id, date: v }); toast(`${x.name} ends ${md(v)}.`); close(); refresh(); }));
    body.querySelectorAll('[data-movep]').forEach(b => b.onclick = () => dateModal('Move the date', 'Every date on it moves by the same number of days, and so does its countdown.', x.start, async v => { await call('/api/calendar/move', { id: x.id, start: v }); toast(`Moved ${x.name} to ${md(v)}.`, async () => { await call('/api/calendar/move', { id: x.id, start: x.start }); refresh(); }); close(); refresh(); }));
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { close(); addModal(d, x.act, x); });
    body.querySelectorAll('[data-asana-p]').forEach(b => b.onclick = () => makeAsana(x.id, b).then(() => close()));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!(await H.confirmModal(`Remove ${x.name}?`, 'It comes off the calendar here and in the old Lineup. Its Asana tasks are not touched.', 'Remove'))) return;
      try { await call(`/api/calendar/event?id=${encodeURIComponent(x.id)}`, null, 'DELETE'); close(); toast(`Removed ${x.name}.`, async () => { await call('/api/calendar/restore', { id: x.id }); refresh(); }); refresh(); } catch (e) { toast(e.message); }
    });
    return body;
  }

  /* ---------- modals (in-app, never prompt()) ---------- */
  function modal(html, wide) {
    const w = document.createElement('div'); w.className = 'modal-wrap cal-m';
    w.innerHTML = wide ? `<div class="modal">${html}</div>` : `<div class="modal" style="max-width:420px;display:block;padding:18px 20px">${html}</div>`;
    document.body.appendChild(w);
    const done = () => { w.remove(); document.removeEventListener('keydown', k); };
    const k = e => { if (e.key === 'Escape') done(); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) done(); });
    w.querySelectorAll('[data-x]').forEach(b => b.onclick = done);
    return { w, done };
  }
  function dateModal(title, hint, value, save) {
    const { w, done } = modal(`<h3 style="margin:0 0 6px;font-size:16px">${esc(title)}</h3><p class="v2hint" style="margin:0 0 12px">${esc(hint)}</p><input type="date" id="calDm" value="${esc(value)}" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit"><div class="err" id="calDmE" style="margin:8px 0"></div><div class="foot"><button type="button" class="cal-btn" data-x="1">Cancel</button><button type="button" class="cal-btn pri" id="calDmS">Save</button></div>`);
    w.querySelector('#calDmS').onclick = async () => { const v = w.querySelector('#calDm').value; if (!v) return; try { await save(v); done(); } catch (e) { w.querySelector('#calDmE').textContent = e.message; } };
  }
  function addModal(d, act, ev) {
    ev = ev && ev.id ? ev : { start: (ev && ev.start) || '', kind: 'drop', status: 'pen', channels: ['paid', 'email'] };
    const editing = !!ev.id;
    const brands = d.brands.length ? d.brands : (H.S.accounts || []).filter(a => a.act_id !== 'all').map(a => ({ id: a.act_id, name: a.name }));
    const S2 = { kind: ev.kind || 'drop', status: ev.status === 'conf' ? 'conf' : 'pen', channels: new Set(ev.channels && ev.channels.length ? ev.channels : ['paid', 'email']) };
    const pill = (grp, v, l, onv) => `<button type="button" data-p="${grp}" data-v="${v}" class="${onv ? 'on' : ''}">${l}</button>`;
    const { w, done } = modal(`<div class="fl"><h3>${editing ? `Edit ${esc(ev.name)}` : 'Add a date'}</h3>
      ${!editing && !act ? `<label class="f">Brand<select id="cmB">${brands.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></label>` : ''}
      <label class="f">What is it?<span class="pills">${Object.entries(KL).map(([k, l]) => pill('kind', k, l === 'Teaser, list, other' ? 'Other' : l, S2.kind === k)).join('')}</span></label>
      <label class="f">Name<input type="text" id="cmN" value="${esc(ev.name || '')}" maxlength="120" placeholder="Burgundy Drinko drop"></label>
      <div class="row3"><label class="f">Goes live<input type="date" id="cmS" value="${esc(ev.start || '')}"></label><label class="f">Ends <em>(optional)</em><input type="date" id="cmE" value="${esc(ev.end && ev.end !== ev.start ? ev.end : '')}"></label><label class="f">Teaser starts <em>(optional)</em><input type="date" id="cmT" value="${esc(ev.teaser || '')}"></label></div>
      <label class="f">What the customer sees <em>(the offer, in their words)</em><textarea id="cmO" placeholder="Full price launch week, then 2 save 15%">${esc(ev.offer || '')}</textarea></label>
      <div class="row3"><label class="f">Channels<span class="pills">${[['paid', 'Ads'], ['email', 'Email'], ['sms', 'SMS'], ['organic', 'Organic']].map(([k, l]) => pill('ch', k, l, S2.channels.has(k))).join('')}</span></label>
        <label class="f">Is the date real?<span class="pills">${pill('status', 'pen', 'Pencilled', S2.status === 'pen')}${pill('status', 'conf', 'Confirmed', S2.status === 'conf')}</span></label>
        <label class="f">Photos link <em>(optional)</em><input type="url" id="cmA" value="${esc(ev.assets || '')}" placeholder="Drive, Air or Dropbox"></label></div>
      <div class="err" id="cmErr"></div>
      <div class="foot"><button type="button" class="cal-btn" data-x="1">Cancel</button><button type="button" class="cal-btn pri" id="cmSave">${editing ? 'Save' : 'Add the date'}</button></div></div>
      <div class="fr"><h4 style="margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">This creates</h4><div class="mini" id="cmPrev"></div><p class="v2hint" style="margin:0;font-size:12px" id="cmNote"></p></div>`, true);
    const val = id => w.querySelector(id)?.value || '';
    const preview = () => {
      const s = val('#cmS'), steps = STEPS[S2.kind] || [];
      const el = w.querySelector('#cmPrev');
      if (!s) { el.innerHTML = '<div><span>Pick the day it goes live.</span></div>'; w.querySelector('#cmNote').textContent = ''; return; }
      el.innerHTML = steps.map(([, l, o]) => { const due = add(s, o); return `<div><b>${esc(l)}</b><span class="${due < d.today ? 'late' : ''}">${md(due)}${due < d.today ? ', passed' : ''}</span></div>`; }).join('') + `<div><b>Live</b><span>${md(s)}</span></div>`;
      const passed = steps.filter(([, , o]) => add(s, o) < d.today).length;
      w.querySelector('#cmNote').textContent = (S2.kind === 'sale' && !val('#cmE') ? 'A sale with no end date is flagged until it gets one. ' : '') + (passed ? `Short notice: ${passed} step${passed > 1 ? 's are' : ' is'} already late, so ${passed > 1 ? 'they land' : 'it lands'} on this week's list. ` : '') + 'Ticks come from Asana, Klaviyo and Meta; "Make the Asana tasks" is on the date once it is added. Pings go to the brand’s internal channel.';
    };
    w.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      const g = b.dataset.p, v = b.dataset.v;
      if (g === 'ch') { S2.channels.has(v) ? S2.channels.delete(v) : S2.channels.add(v); b.classList.toggle('on'); return; }
      S2[g] = v; w.querySelectorAll(`[data-p="${g}"]`).forEach(x => x.classList.toggle('on', x === b)); preview();
    });
    ['#cmS', '#cmE'].forEach(id => w.querySelector(id).addEventListener('input', preview));
    preview();
    w.querySelector('#cmN').focus();
    w.querySelector('#cmSave').onclick = async () => {
      const b = { id: ev.id || undefined, act: act || ev.act || val('#cmB'), name: val('#cmN'), kind: S2.kind, start: val('#cmS'), end: val('#cmE') || (S2.kind === 'sale' ? null : val('#cmS')), teaser: val('#cmT') || null, offer: val('#cmO'), channels: [...S2.channels], status: S2.status, assets: val('#cmA') || null };
      const btn = w.querySelector('#cmSave'); btn.disabled = true;
      try { const r = await call('/api/calendar/event', b); done(); toast(editing ? 'Saved.' : `Added ${b.name}.`); await refresh(); if (!editing && r.id) { const nd = await load(H.S.act || 'all'); openEv(nd, r.id); } }
      catch (e) { w.querySelector('#cmErr').textContent = e.message; btn.disabled = false; }
    };
  }

  /* ---------- Home: Live now + Coming up ---------- */
  async function homeCard(el) {
    if (!el) return; css();
    const act = H.S.act || 'all', t = H.RUN();
    let d; try { d = await load(act); } catch { return; }
    if (t !== H.RUN() || !el.isConnected) return;
    const today = d.today, soon = add(today, 14);
    const live = d.items.filter(e => e.start <= today && (!e.end || e.end >= today) && e.src !== 'drop');
    const next = d.items.filter(e => e.start > today && e.start <= soon).sort((a, b) => a.start.localeCompare(b.start));
    if (!live.length && !next.length) { el.innerHTML = ''; return; }
    const one = act !== 'all';
    /* the strip caps at five dates; the rest are one "+N more" that opens the Calendar (review 2026-10-21) */
    const more = n => n > 5 ? `<button type="button" class="cal-more" data-open="1">+${n - 5} more</button>` : '';
    const stat = e => { const st = e.steps || [], late = st.find(s => s.state === 'late'), nx = st.find(s => s.state !== 'done'); if (late) return `<span class="late">${esc(late.label.toLowerCase())} late</span>`; if (isOpen(e)) return '<span class="late">no end date</span>'; if (!st.length) return '<span></span>'; if (!nx) return '<span>ready</span>'; return `<span>${esc(nx.label.toLowerCase())} ${wd(nx.due)}</span>`; };
    const row = e => `<div data-ev="${esc(e.id)}"><b>${e.start === today ? 'Today' : `${wd(e.start)} ${md(e.start)}`} &middot; ${one ? '' : esc(brandName(d, e.act)) + ' '}${esc(e.name)}</b>${stat(e)}</div>`;
    el.innerHTML = `<div class="v2card calh"><div class="v2ch" style="display:flex;align-items:center;gap:10px"><h3 style="margin:0;font-size:13.5px">On the calendar</h3><span class="v2hint" style="margin:0">what customers see</span><button type="button" class="cal-btn" style="margin-left:auto;padding:4px 10px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);font-weight:600;font-size:12px;cursor:pointer;color:var(--ink)" data-open="1">Calendar</button></div>
      ${live.length ? `<h4>Live now</h4><div class="cal-mini">${live.slice(0, 5).map(e => `<div data-ev="${esc(e.id)}"><b>${one ? '' : esc(brandName(d, e.act)) + ' &middot; '}${esc(e.name)}</b><span>${e.end ? `to ${md(e.end)}` : 'no end date'}</span></div>`).join('')}${more(live.length)}</div>` : ''}
      ${next.length ? `<h4>Coming up, 14 days</h4><div class="cal-mini">${next.slice(0, 5).map(row).join('')}${more(next.length)}</div>` : ''}</div>`;
    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => H.show('calendar'));
    el.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => openEv(d, b.dataset.ev));
  }

  /** Date ranges for chart bands: [{from, to, label, kind}] for one brand (or all), from the calendar. */
  async function bandsFor(act, from, to) {
    try {
      const d = await H.apiAH(`/api/calendar?act=${encodeURIComponent(act || 'all')}&from=${from}&to=${to}&lite=1`);
      return d.items.filter(e => e.src !== 'drop' && e.start <= to && endOf(e) >= from && (act === 'all' || e.act === act) && ['drop', 'sale'].includes(e.kind))
        .map(e => ({ from: e.start, to: e.end || (e.start <= d.today ? d.today : e.start), label: (act === 'all' ? `${brandName(d, e.act)}: ` : '') + e.name, kind: e.kind }));
    } catch { return []; }
  }

  window.CalendarTab = {
    /** Work > Tasks "Calendar": open this page on the month with only the tasks showing. */
    focus(f, v) {
      VIEW.f = f || 'all'; VIEW.v = v || 'month'; store('cal_f', VIEW.f); store('cal_view', VIEW.v);
      for (const [k] of CHS) { if (f === 'tasks' && k !== 'tasks') CHOFF[k] = true; else delete CHOFF[k]; }
      store('cal_ch', JSON.stringify(CHOFF));
    },
    render(tab, host, first) { H = host; return render(first); },
    homeCard(el, host) { H = host; return homeCard(el); },
    bandsFor(act, from, to, host) { if (host) H = host; return bandsFor(act, from, to); },
    open(id, host) { if (host) H = host; return load(H.S.act || 'all').then(d => openEv(d, id)); },
  };
})();
