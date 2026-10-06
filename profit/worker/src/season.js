/* Locus - the Season tab's API (2026-10-05).
 *
 * The BFCM plan, per brand: phases (what runs when, for whom, the deal), the call
 * sheet (goal, last year, cutoffs, gift cards), and what is due each week. The
 * dates of every deliverable are DERIVED from the phase dates, so changing a
 * launch date moves its briefs, build and load dates with it; a p_season_task row
 * only exists once someone ticks, renames or re-dates a task, or adds a custom one.
 *
 * Why here and not the Q4 Playbook: that app was a sixth place to look and died
 * (last edit Aug 25, nothing launched). Locus is open all day. See CLAUDE.md.
 */

export const SEASON = '2026';
export const BF = '2026-11-27';

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' },
});

/* The season shape every brand follows. `early` depends on the brand's shape
   (standard sale, Black November, or Early Access list building). */
const EARLY = {
  standard: { name: 'Early Black Friday', start: '2026-11-01', end: '2026-11-25', who: 'Everyone', hint: 'A warm-up offer weaker than the weekend. The weekend must beat it.' },
  blacknov: { name: 'Black November', start: '2026-11-01', end: '2026-11-25', who: 'Everyone', hint: 'Four weekly offers, each stronger than the last. Lock all four before Nov 1.' },
  access:   { name: 'List building', start: '2026-10-26', end: '2026-11-25', who: 'Anyone', hint: 'Giveaway or waitlist. No sale in November; the list is what pays on Thursday.' },
};
const TPL = [
  { key: 'early', grp: 'nov' },
  { key: 'access', name: 'Early access (Thursday)', start: '2026-11-26', end: '2026-11-26', grp: 'bf', who: 'List or members only', hint: 'Store locked to everyone else, or a 24-hour list-only deal.', optional: 1 },
  { key: 'bf', name: 'Black Friday weekend', start: '2026-11-27', end: '2026-11-30', grp: 'bf', who: 'Everyone', hint: 'The biggest offer of the year. Two sticker versions: Fri to Sun, and Monday last day.' },
  { key: 'planb', name: 'Plan B', start: '2026-11-27', end: '2026-11-30', grp: 'bf', who: 'Everyone', hint: 'Only if Friday 2pm is under target. Built ahead and paused.', optional: 1, status: 'skip' },
  { key: 'drop', name: 'Post-BFCM drop', start: '2026-12-04', end: '2026-12-06', grp: 'dec', who: 'BFCM buyers get the discount', hint: 'New product on the Friday after. Full price to cold traffic.' },
  { key: 'xmas', name: 'Order by Christmas', start: '2026-12-07', end: '2026-12-16', grp: 'dec', who: 'Everyone', hint: 'The date is the offer. The end date is the standard shipping cutoff.' },
  { key: 'gift', name: 'Gift cards', start: '2026-12-17', end: '2026-12-24', grp: 'dec', who: 'Everyone', hint: 'The only thing that arrives in time after the cutoff.' },
  { key: 'boxing', name: 'Boxing Day + run-back', start: '2026-12-26', end: '2026-12-31', grp: 'late', who: 'Non-buyers first', hint: 'One-day hit, then the best BFCM offer again through New Year\'s Eve.' },
  { key: 'ny', name: 'New Year\'s drop', start: '2026-12-29', end: '2027-01-05', grp: 'late', who: 'Everyone', hint: 'New product, resolution angles.' },
  { key: 'vday', name: 'Valentine\'s', start: '2027-01-14', end: '2027-02-07', grp: 'vday', who: 'Everyone', hint: 'Gifting angles return. Winning offer rebranded.' },
];
export function templatePhases(shape) {
  const e = EARLY[shape] || EARLY.standard;
  return TPL.map((p, i) => ({ ...(p.key === 'early' ? { ...e } : {}), ...p, status: p.status || 'missing', sort: i * 10, tpl: 1 }))
    .map(p => ({ key: p.key, name: p.name, start: p.start, end: p.end, grp: p.grp, who: p.who, offer: '', detail: '', hint: p.hint || '', status: p.status, optional: p.optional || 0, sort: p.sort, tpl: 1 }));
}

/* What has to happen before a phase goes live, as days before its start date.
   Owner is a ROLE here; names come from the brand's answers (strategist, buyer, email). */
const STD = [['offer', 'Offer locked', -30, 'cole'], ['briefs', 'Briefs due', -23, 'strat'], ['built', 'Ads built', -9, 'strat'], ['loaded', 'Ads loaded', -4, 'buyer'], ['live', 'Live', 0, 'buyer']];
const KINDS = {
  planb: [['offer', 'Plan B decided', -30, 'cole'], ['briefs', 'Briefs due', -23, 'strat'], ['built', 'Built and paused', -14, 'strat'], ['go', 'Friday 2pm call: on or off', 0, 'cole']],
};
const EXTRA = {
  early: [['page', 'Signup or sale page live', 0, 'cole']],
  access: [['lock', 'Password page or list-only link tested', -3, 'cole']],
  bf: [['ops', 'Inventory vs goal, 3PL told the forecast, support covered', -17, 'cole'], ['limit', 'Meta spend limit raised, backup card on', -14, 'buyer'], ['ladder', 'Ladder numbers set in Settings > Goals', -10, 'buyer'], ['emails', 'Every email and text scheduled', -7, 'email'], ['site', 'Gift cards live, cutoffs on the site, sale page tested', -7, 'cole']],
  drop: [['segment', 'BFCM buyer segment built', -7, 'email']],
  xmas: [['bar', 'Countdown bar on', -1, 'cole']],
};
const DEFAULT_OWNER = { cole: 'Cole', buyer: 'Ahsan', strat: 'Ahsan', email: 'Nick' };
function ownerName(role, answers) {
  if (role === 'strat') return answers.strategist || DEFAULT_OWNER.strat;
  if (role === 'buyer') return answers.buyer || DEFAULT_OWNER.buyer;
  if (role === 'email') return answers.email_owner || DEFAULT_OWNER.email;
  return DEFAULT_OWNER[role] || role;
}

/** Derived tasks + stored overrides + custom tasks, for one brand. */
export function tasksFor(phases, answers, stored, today) {
  const byId = Object.fromEntries((stored || []).map(r => [r.id, r]));
  const out = [];
  for (const p of phases) {
    if (p.status === 'skip' || !p.start) continue;
    const kinds = (KINDS[p.key] || STD).concat(EXTRA[p.key] || []);
    for (const [kind, label, off, role] of kinds) {
      const id = `${p.key}:${kind}`;
      const s = byId[id];
      const due = s?.due || addDays(p.start, off);
      let done = !!s?.done, auto = 0;
      if (kind === 'offer') { done = p.status === 'locked'; auto = 1; }
      // A launch three days gone is not "overdue", it happened. Only the live row
      // auto-closes; everything else waits for a tick, because "built" that nobody
      // confirmed is exactly the thing this screen exists to catch.
      if (kind === 'live' && !s && today > addDays(due, 3)) { done = true; auto = 1; }
      out.push({ id, phase_key: p.key, phase: p.name, kind, name: s?.name || label, due, owner: s?.owner || ownerName(role, answers), done, done_by: s?.done_by || null, done_at: s?.done_at || null, note: s?.note || null, custom: 0, auto });
    }
  }
  for (const s of stored || []) {
    if (!s.custom) continue;
    const p = phases.find(x => x.key === s.phase_key);
    out.push({ id: s.id, phase_key: s.phase_key || null, phase: p?.name || null, kind: 'custom', name: s.name || 'Task', due: s.due || null, owner: s.owner || 'Cole', done: !!s.done, done_by: s.done_by, done_at: s.done_at, note: s.note || null, custom: 1, auto: 0 });
  }
  out.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.phase_key?.localeCompare(b.phase_key || '') || 0);
  return out;
}

function todayCentral() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Everything the tab needs for a set of accounts. */
export async function seasonData(env, accounts) {
  const ids = accounts.map(a => a.act_id);
  if (!ids.length) return { season: SEASON, bf: BF, today: todayCentral(), accounts: [] };
  const q = ids.map(() => '?').join(',');
  const [ph, an, tk] = await Promise.all([
    env.DB.prepare(`SELECT * FROM p_season_phase WHERE season = ?1 AND act_id IN (${q}) ORDER BY sort, key`).bind(SEASON, ...ids).all(),
    env.DB.prepare(`SELECT * FROM p_season_answer WHERE season = ?1 AND act_id IN (${q})`).bind(SEASON, ...ids).all(),
    env.DB.prepare(`SELECT * FROM p_season_task WHERE season = ?1 AND act_id IN (${q})`).bind(SEASON, ...ids).all(),
  ]);
  const today = todayCentral();
  const out = [];
  for (const a of accounts) {
    const answers = Object.fromEntries(an.results.filter(r => r.act_id === a.act_id).map(r => [r.key, r.value]));
    const shape = ['standard', 'blacknov', 'access'].includes(answers.shape) ? answers.shape : 'standard';
    const stored = ph.results.filter(r => r.act_id === a.act_id);
    const tpl = templatePhases(shape);
    const phases = tpl.map(t => {
      const s = stored.find(r => r.key === t.key);
      return s ? { ...t, name: s.name, start: s.start, end: s.end, grp: s.grp || t.grp, who: s.who, offer: s.offer || '', detail: s.detail || '', status: s.status, sort: s.sort ?? t.sort, tpl: 0 } : t;
    }).concat(stored.filter(r => !tpl.some(t => t.key === r.key)).map(s => ({ key: s.key, name: s.name, start: s.start, end: s.end, grp: s.grp || 'bf', who: s.who, offer: s.offer || '', detail: s.detail || '', hint: '', status: s.status, optional: 1, sort: s.sort ?? 999, tpl: 0 })));
    phases.sort((x, y) => (x.start || '9999').localeCompare(y.start || '9999') || x.sort - y.sort);
    const tasks = tasksFor(phases, answers, tk.results.filter(r => r.act_id === a.act_id), today);
    out.push({ act_id: a.act_id, name: a.name, in_season: answers.in_season !== 'no', shape, answers, phases, tasks });
  }
  return { season: SEASON, bf: BF, today, accounts: out };
}

/* ---------- Routes ---------- */
const clean = (v, n = 4000) => v == null ? null : String(v).slice(0, n);
const isoOk = v => v == null || v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Authenticated routes. Returns null when the path is not ours. */
export async function handleSeason({ path, request, env, accountsFor, email }) {
  if (!path.startsWith('/api/season')) return null;
  const m = request.method;
  const b = m === 'GET' ? {} : await request.json().catch(() => ({}));
  const url = new URL(request.url);
  const actOf = async (act) => (await accountsFor()).find(a => a.act_id === act) || null;

  if (path === '/api/season' && m === 'GET') {
    const act = url.searchParams.get('act') || 'all';
    const accounts = (await accountsFor()).filter(a => act === 'all' || a.act_id === act);
    return json(await seasonData(env, accounts));
  }
  if (path === '/api/season/phase' && m === 'PUT') {
    if (!b.act || !b.key || !(await actOf(b.act))) return json({ error: 'unknown account' }, 404);
    if (!isoOk(b.start) || !isoOk(b.end)) return json({ error: 'dates must be YYYY-MM-DD' }, 400);
    const status = ['missing', 'draft', 'locked', 'skip'].includes(b.status) ? b.status : 'missing';
    const key = String(b.key).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || ('p' + Date.now().toString(36));
    await env.DB.prepare(
      `INSERT INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,datetime('now'))
       ON CONFLICT(act_id, season, key) DO UPDATE SET name=excluded.name, start=excluded.start, end=excluded.end, grp=excluded.grp,
         who=excluded.who, offer=excluded.offer, detail=excluded.detail, status=excluded.status, sort=excluded.sort, updated_at=datetime('now')`,
    ).bind(b.act, SEASON, key, clean(b.name, 120) || key, b.start || null, b.end || null, ['nov', 'bf', 'dec', 'late', 'vday'].includes(b.grp) ? b.grp : 'bf',
      clean(b.who, 200), clean(b.offer, 600), clean(b.detail), status, Number.isFinite(+b.sort) ? +b.sort : 500).run();
    return json({ ok: true, key });
  }
  if (path === '/api/season/phase' && m === 'DELETE') {
    if (!b.act || !b.key) return json({ error: 'missing' }, 400);
    // Only custom phases can be deleted; a template phase is skipped instead.
    if (TPL.some(t => t.key === b.key)) return json({ error: 'Template phases cannot be deleted. Set its status to Skip instead.' }, 400);
    await env.DB.prepare(`DELETE FROM p_season_phase WHERE act_id = ?1 AND season = ?2 AND key = ?3`).bind(b.act, SEASON, b.key).run();
    return json({ ok: true });
  }
  if (path === '/api/season/answer' && m === 'PUT') {
    if (!b.act || !b.key || !(await actOf(b.act))) return json({ error: 'unknown account' }, 404);
    const key = String(b.key).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);
    await env.DB.prepare(
      `INSERT INTO p_season_answer (act_id, season, key, value, updated_at) VALUES (?1,?2,?3,?4,datetime('now'))
       ON CONFLICT(act_id, season, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).bind(b.act, SEASON, key, clean(b.value)).run();
    return json({ ok: true });
  }
  if (path === '/api/season/task' && m === 'PUT') {
    if (!b.act || !b.id || !(await actOf(b.act))) return json({ error: 'unknown account' }, 404);
    if (!isoOk(b.due)) return json({ error: 'date must be YYYY-MM-DD' }, 400);
    const who = (email || '').split('@')[0] || 'Mobius';
    const name = who ? who.charAt(0).toUpperCase() + who.slice(1) : 'Mobius';
    const row = await env.DB.prepare(`SELECT * FROM p_season_task WHERE act_id = ?1 AND season = ?2 AND id = ?3`).bind(b.act, SEASON, b.id).first();
    const done = b.done == null ? !!row?.done : !!b.done;
    const custom = b.custom != null ? (b.custom ? 1 : 0) : (row?.custom || (String(b.id).startsWith('c:') ? 1 : 0));
    await env.DB.prepare(
      `INSERT INTO p_season_task (act_id, season, id, phase_key, kind, name, due, owner, done, done_by, done_at, custom, note, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,datetime('now'))
       ON CONFLICT(act_id, season, id) DO UPDATE SET phase_key=excluded.phase_key, kind=excluded.kind, name=excluded.name, due=excluded.due,
         owner=excluded.owner, done=excluded.done, done_by=excluded.done_by, done_at=excluded.done_at, custom=excluded.custom, note=excluded.note, updated_at=datetime('now')`,
    ).bind(b.act, SEASON, String(b.id).slice(0, 80), clean(b.phase_key ?? row?.phase_key, 40), clean(b.kind ?? row?.kind, 20), clean(b.name ?? row?.name, 200),
      (b.due === undefined ? row?.due : b.due) || null, clean(b.owner ?? row?.owner, 60), done ? 1 : 0,
      done ? (row?.done && b.done == null ? row.done_by : name) : null, done ? (row?.done && b.done == null ? row.done_at : new Date().toISOString()) : null,
      custom, clean(b.note ?? row?.note, 600)).run();
    return json({ ok: true, done, done_by: done ? name : null });
  }
  if (path === '/api/season/task' && m === 'DELETE') {
    if (!b.act || !b.id) return json({ error: 'missing' }, 400);
    await env.DB.prepare(`DELETE FROM p_season_task WHERE act_id = ?1 AND season = ?2 AND id = ?3 AND custom = 1`).bind(b.act, SEASON, b.id).run();
    return json({ ok: true });
  }
  if (path === '/api/season-share' && m === 'POST') {
    const acct = await actOf(b.act);
    if (!acct) return json({ error: 'unknown account' }, 404);
    let row = await env.DB.prepare(`SELECT token FROM p_season_share WHERE act_id = ?1 AND season = ?2`).bind(b.act, SEASON).first();
    let token = row?.token;
    if (!token || b.regenerate) {
      token = crypto.randomUUID().replace(/-/g, '');
      await env.DB.prepare(
        `INSERT INTO p_season_share (act_id, season, token, created_at) VALUES (?1,?2,?3,datetime('now'))
         ON CONFLICT(act_id, season) DO UPDATE SET token = excluded.token, created_at = datetime('now')`,
      ).bind(b.act, SEASON, token).run();
    }
    return json({ ok: true, token, url: `https://tools.go-mobius-digital.com/profit/?season=${token}` });
  }
  return json({ error: 'not found' }, 404);
}

/** The client's read-only season page. The token is the auth: one brand, offers and
 *  dates only. No internal tasks, no goals, no other brand. */
export async function seasonPublic(env, token) {
  const row = await env.DB.prepare(`SELECT * FROM p_season_share WHERE token = ?1`).bind(token).first();
  if (!row) return json({ error: 'This link is no longer valid.' }, 404);
  const acct = await env.DB.prepare(`SELECT act_id, name FROM accounts WHERE act_id = ?1`).bind(row.act_id).first();
  if (!acct) return json({ error: 'unknown account' }, 404);
  const d = await seasonData(env, [acct]);
  const a = d.accounts[0];
  const pick = ['cutoffs', 'returns', 'gift_cards'];
  return json({
    share: true, bf: BF, today: d.today,
    account: { name: a.name },
    phases: a.phases.filter(p => p.status !== 'skip').map(p => ({ key: p.key, name: p.name, start: p.start, end: p.end, grp: p.grp, who: p.who, offer: p.offer, detail: p.detail, status: p.status })),
    dates: Object.fromEntries(pick.filter(k => a.answers[k]).map(k => [k, a.answers[k]])),
    asks: a.tasks.filter(t => /client|^you\b/i.test(t.owner || '') && !t.done).map(t => ({ name: t.name, due: t.due, phase: t.phase })),
  });
}
