/* THE MORNING LINE AS A SLACK DM (2026-10-11, docs/two-products.md section 5, session D).
 * "Every morning, 7:02, before coffee, you know exactly where you stand." One sentence per brand, the SAME sentence
 * Home shows until noon (profit worker hub.js keptMany, GET /api/hub/kept: "Grunk kept $1,240 yesterday on $4,100 of
 * sales; ads at 31%. Nothing to change."), sent as a Slack DM to each person who switched it on in Settings > Your
 * profile (prefs.js, `morning_dm`). It goes through the Slack bot this worker already has (slackApi, SLACK_BOT_TOKEN):
 * users.lookupByEmail finds the person, chat.postMessage to their user id opens the DM. No new app, no new secret.
 *   morningTick(env, deps): inside the hourly cron. From `settings.morningHour` (Central, default 7) until noon, once
 *   per person per Central day (`settings.morningDone` = {date, emails: {email: status}}); a person Slack cannot find
 *   is recorded and tried again tomorrow. Switch: `settings.morningDm` = 'off' stops every send.
 *   The numbers are read ONCE as the owner (a minted session over the PROFIT binding) and filtered per person with
 *   brandsFor, so a client or a limited teammate only ever gets their own brands' lines. */
const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const nice = s => s ? new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';

/** Reads /api/hub/kept?act=all as the owner. deps.profit(path, token) may replace the binding (tests). */
export async function readKept(env, deps) {
  const owner = env.OWNER_EMAIL || 'cole@go-mobius-digital.com';
  const { token } = await deps.mintSession(env, owner);
  const call = deps.profit || (async (path, tok) => {
    if (!env.PROFIT) throw new Error('The PROFIT service binding is missing on account-health.');
    const res = await env.PROFIT.fetch(new Request(PROFIT_ORIGIN + path, { headers: { Authorization: `Bearer ${tok}` } }));
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    return j;
  });
  return call('/api/hub/kept?act=all', token);
}
/** The lines for one person: their brands only (brandsFor: null = every brand). */
export function linesFor(kept, only) {
  const bs = (kept && kept.brands) || [];
  return bs.filter(b => b.has && b.line && (!only || only.has(b.act_id))).sort((p, q) => p.name.localeCompare(q.name)).map(b => b.line);
}
export function messageFor(kept, lines) {
  if (!lines.length) return null;
  const head = `Good morning. Yesterday, ${nice(kept.date)}:`;
  return { text: `${head}\n${lines.join('\n')}\n<${LOCUS}?open=overview|Open Locus>`,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `*${head}*\n${lines.join('\n')}` } }, { type: 'context', elements: [{ type: 'mrkdwn', text: `<${LOCUS}?open=overview|Open Locus> · switch this off in Settings > Your profile` }] }] };
}
/** DM one person: lookup by email, then post to the user id (Slack opens the DM). */
export async function dmPerson(env, deps, email, msg) {
  const u = await deps.slackApi(env, 'users.lookupByEmail', { email });
  if (!u || !u.ok || !u.user || !u.user.id) return { ok: false, error: (u && u.error) || 'no slack user' };
  if (u.user.is_bot || u.user.deleted) return { ok: false, error: 'not a person' };
  const r = await deps.slackApi(env, 'chat.postMessage', { channel: u.user.id, text: msg.text, blocks: msg.blocks, unfurl_links: false, username: 'Locus', icon_url: 'https://tools.go-mobius-digital.com/favicon.png' });
  if (r && r.ok === false && /missing_scope|invalid_arg|not_allowed/.test(String(r.error || ''))) {
    const r2 = await deps.slackApi(env, 'chat.postMessage', { channel: u.user.id, text: msg.text, blocks: msg.blocks, unfurl_links: false });
    return r2 && r2.ok ? { ok: true, ts: r2.ts } : { ok: false, error: (r2 && r2.error) || 'slack' };
  }
  return r && r.ok ? { ok: true, ts: r.ts } : { ok: false, error: (r && r.error) || 'slack' };
}
/** The message one person would get right now (the "Send me today's line" button and the preview). */
export async function morningFor(env, deps, email) {
  const kept = await readKept(env, deps);
  const only = await deps.brandsFor(env, email).catch(() => null);
  const lines = linesFor(kept, only);
  return { date: kept.date, lines, message: messageFor(kept, lines) };
}

export async function morningTick(env, deps) {
  if ((await deps.getSetting(env, 'morningDm')) === 'off') return { skipped: 'off' };
  const hour = deps.centralHour(), at = +(await deps.getSetting(env, 'morningHour')) || 7;
  if (hour < at || hour >= 12) return { skipped: hour < at ? `before ${at}am Central` : 'after noon' };
  const people = await deps.morningPeople(env);
  if (!people.length) return { skipped: 'nobody opted in' };
  const today = deps.centralDate();
  let done = {}; try { done = JSON.parse((await deps.getSetting(env, 'morningDone')) || '{}') || {}; } catch {}
  if (done.date !== today) done = { date: today, emails: {} };
  const todo = people.filter(p => !(done.emails || {})[p.email]);
  if (!todo.length) return { skipped: 'all sent today', sent: Object.keys(done.emails || {}).length };
  if (deps.subCanAfford && !deps.subCanAfford(30)) return { deferred: 'budget' };
  let kept; try { kept = await readKept(env, deps); } catch (e) { return { error: `could not read the numbers: ${e.message}` }; }
  if (!kept || !kept.date) return { error: 'no numbers yet' };
  const out = { date: today, sent: [], skipped: [], failed: [] };
  for (const p of todo) {
    if (deps.subCanAfford && !deps.subCanAfford(8)) { out.deferred = 'budget'; break; }
    /* Fail closed (2026-10-14 audit): "no limit" from brandsFor means every brand, which is right only for the team.
       A removed client keeps its morning switch in userPrefs and would otherwise get every brand's line. */
    let only;
    try { only = await deps.brandsFor(env, p.email); } catch { only = new Set(); }
    if (only == null && !(deps.emailAllowed && await deps.emailAllowed(env, p.email).catch(() => false))) only = new Set();
    const lines = linesFor(kept, only), msg = messageFor(kept, lines);
    let st;
    if (!msg) st = 'no brands with numbers';
    else { const r = await dmPerson(env, deps, p.email, msg).catch(e => ({ ok: false, error: e.message })); st = r.ok ? 'sent' : `failed: ${r.error}`; }
    (st === 'sent' ? out.sent : /^failed/.test(st) ? out.failed : out.skipped).push(st === 'sent' ? p.email : `${p.email} (${st})`);
    /* A failed lookup is kept for the day too: Slack will not know the person better in an hour, and a retry every
       hour would spend budget on nothing. Tomorrow tries again. */
    done.emails[p.email] = { status: st, at: new Date().toISOString() };
  }
  await deps.putSetting(env, 'morningDone', JSON.stringify(done));
  return out;
}
/** Routes: the signed-in person's own line now (POST sends it to them as a DM), the owner's preview for anyone. */
export async function handleMorning(request, env, path, url, who, deps, json) {
  if (path === '/api/me/morning') {
    if (!who) return json({ error: 'sign in first' }, 401);
    let m; try { m = await morningFor(env, deps, who); } catch (e) { return json({ error: e.message }, 502); }
    if (request.method === 'GET') return json({ email: who, date: m.date, lines: m.lines });
    if (request.method === 'POST') {
      if (!m.message) return json({ error: 'No brand has yesterday\'s numbers yet, so there is nothing to send.' }, 409);
      const r = await dmPerson(env, deps, who, m.message);
      if (!r.ok) return json({ error: r.error === 'users_not_found' || r.error === 'no slack user' ? `Slack has no member with the email ${who}. The DM goes to the Slack account with that email.` : `Slack said: ${r.error}` }, 502);
      return json({ ok: true, sent_to: who, lines: m.lines });
    }
    return json({ error: 'method' }, 405);
  }
  return null;
}
