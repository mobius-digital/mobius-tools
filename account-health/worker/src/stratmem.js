/**
 * The Strategist's memory, skills and usage log (2026-10-09, the Viktor-grade plan, docs/strategist-viktor-grade-plan.md).
 *
 * MEMORY = short facts, never transcripts. Threads stay in the Slack index and are FOUND when needed; only
 * what will still be true next week is kept here. Cole's worry was "a huge database that confuses it": so
 *   - a fact has a TOPIC; saying something new on the same topic REPLACES the old fact (the old one moves to
 *     history, status 'replaced', and is never shown to the model again);
 *   - facts with a date carry `until` and stop being shown after it;
 *   - each scope (one brand, or the agency) shows at most CAP facts in a prompt; older ones are archived, not lost;
 *   - a nightly pass reads the day's brand channels and proposes facts worth keeping, through the same upsert;
 *   - everything is visible and editable in Locus (Agency settings > The Strategist > Memory).
 *
 * SKILLS = how-tos the team teaches it ("how we write a launch brief"), Viktor's skill model: one job each, the
 * prompt carries only name + description, the body is read when a task matches.
 *
 * RUNS = one row per answer (who, brand, model, tokens, dollars, steps, seconds) for the Usage screen.
 */

export const CAP = 40;

export async function ensureStratTables(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS strat_fact (
      id TEXT PRIMARY KEY, scope TEXT NOT NULL, topic TEXT NOT NULL, topic_key TEXT NOT NULL, text TEXT NOT NULL,
      source TEXT, by_name TEXT, at TEXT NOT NULL, until TEXT, status TEXT NOT NULL DEFAULT 'active', replaced_by TEXT, changed_at TEXT)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS strat_fact_scope ON strat_fact (scope, status)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS strat_skill (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL, body TEXT NOT NULL,
      by_name TEXT, at TEXT NOT NULL, updated_at TEXT, active INTEGER NOT NULL DEFAULT 1)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS strat_run (
      id TEXT PRIMARY KEY, at TEXT NOT NULL, surface TEXT, who TEXT, brand TEXT, question TEXT, model TEXT, effort TEXT,
      in_tok INTEGER, cache_read INTEGER, cache_write INTEGER, out_tok INTEGER, cost REAL, steps INTEGER, ms INTEGER, stopped INTEGER, error TEXT)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS strat_run_at ON strat_run (at)`),
  ]);
}

const id = p => p + Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
export const topicKey = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|a|an|of|for|our|their)\b/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/* ---------------- facts ---------------- */

/** Upsert by topic. Returns what happened in words the model can repeat. */
export async function remember(env, { scope = 'agency', topic, text, until = null, source = 'chat', by = null }) {
  await ensureStratTables(env);
  text = String(text || '').trim().replace(/\s*—\s*/g, ', ').slice(0, 500);
  topic = String(topic || '').trim().slice(0, 80) || text.split(/[.:]/)[0].slice(0, 60);
  if (!text) return { error: 'Nothing to remember.' };
  const key = topicKey(topic);
  const old = await env.DB.prepare(`SELECT id, text FROM strat_fact WHERE scope = ?1 AND topic_key = ?2 AND status = 'active'`).bind(scope, key).first();
  if (old && old.text.trim() === text) return { same: true, note: 'Already known, word for word.' };
  const nid = id('f_'), now = new Date().toISOString();
  until = /^\d{4}-\d{2}-\d{2}$/.test(String(until || '')) ? until : null;
  await env.DB.prepare(`INSERT INTO strat_fact (id, scope, topic, topic_key, text, source, by_name, at, until) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(nid, scope, topic, key, text, source, by, now, until).run();
  if (old) await env.DB.prepare(`UPDATE strat_fact SET status = 'replaced', replaced_by = ?2, changed_at = ?3 WHERE id = ?1`).bind(old.id, nid, now).run();
  /* Over the cap: the oldest facts in this scope step out of the prompt (archived, still listed in Locus). */
  const { results } = await env.DB.prepare(`SELECT id FROM strat_fact WHERE scope = ?1 AND status = 'active' ORDER BY at DESC`).bind(scope).all();
  for (const r of (results || []).slice(CAP)) await env.DB.prepare(`UPDATE strat_fact SET status = 'archived', changed_at = ?2 WHERE id = ?1`).bind(r.id, now).run();
  return { id: nid, replaced: old ? old.text : null };
}

export async function forget(env, { scope = 'agency', topic = '', id: fid = '' }) {
  await ensureStratTables(env);
  const now = new Date().toISOString();
  if (fid) { const r = await env.DB.prepare(`UPDATE strat_fact SET status = 'deleted', changed_at = ?2 WHERE id = ?1 AND status = 'active'`).bind(fid, now).run(); return { changed: r.meta?.changes || 0 }; }
  const key = topicKey(topic);
  if (!key) return { changed: 0 };
  const r = await env.DB.prepare(`UPDATE strat_fact SET status = 'deleted', changed_at = ?3 WHERE scope = ?1 AND status = 'active' AND (topic_key = ?2 OR topic_key LIKE ?4 OR lower(text) LIKE ?4)`)
    .bind(scope, key, now, `%${key}%`).run();
  return { changed: r.meta?.changes || 0 };
}

/** Active facts for the prompt: the agency's and one brand's. Dated facts past their day are retired here. */
export async function factsFor(env, scopes) {
  await ensureStratTables(env);
  const t = today();
  await env.DB.prepare(`UPDATE strat_fact SET status = 'expired', changed_at = ?2 WHERE status = 'active' AND until IS NOT NULL AND until < ?1`).bind(t, new Date().toISOString()).run();
  const list = scopes.filter(Boolean);
  if (!list.length) return [];
  const { results } = await env.DB.prepare(`SELECT id, scope, topic, text, at, until, source, by_name FROM strat_fact WHERE status = 'active' AND scope IN (${list.map((_, i) => `?${i + 1}`).join(',')}) ORDER BY scope, topic`).bind(...list).all();
  return results || [];
}

export function factsBlock(facts, brandName) {
  if (!facts.length) return '';
  const fmt = f => `- ${f.topic}: ${f.text} (${String(f.at).slice(0, 10)}${f.until ? `, until ${f.until}` : ''}${f.source && f.source !== 'chat' ? `, from ${f.source}` : ''})`;
  const ag = facts.filter(f => f.scope === 'agency'), br = facts.filter(f => f.scope !== 'agency');
  return ['## What you remember (your memory; newer than the brand brain when they disagree)',
    ag.length ? '### The agency\n' + ag.map(fmt).join('\n') : '',
    br.length ? `### ${brandName || 'This brand'}\n` + br.map(fmt).join('\n') : ''].filter(Boolean).join('\n');
}

/** Everything, for the Memory screen and the memory view: active first, then the history. */
export async function factsList(env, scope = null, { history = true } = {}) {
  await ensureStratTables(env);
  const { results } = await env.DB.prepare(`SELECT * FROM strat_fact ${scope ? 'WHERE scope = ?1' : ''} ORDER BY status = 'active' DESC, at DESC LIMIT 500`).bind(...(scope ? [scope] : [])).all();
  return (results || []).filter(f => history || f.status === 'active');
}

export async function editFact(env, fid, { text, topic, until }) {
  await ensureStratTables(env);
  const f = await env.DB.prepare(`SELECT * FROM strat_fact WHERE id = ?1`).bind(fid).first();
  if (!f) return { error: 'No such fact.' };
  return remember(env, { scope: f.scope, topic: topic ?? f.topic, text: text ?? f.text, until: until === undefined ? f.until : until, source: 'edited in Locus', by: 'Locus' });
}

/* ---------------- skills ---------------- */

export async function skillsList(env, { all = false } = {}) {
  await ensureStratTables(env);
  const { results } = await env.DB.prepare(`SELECT id, name, description, body, by_name, at, updated_at, active FROM strat_skill ${all ? '' : 'WHERE active = 1'} ORDER BY name`).all();
  return results || [];
}
export function skillsBlock(skills) {
  if (!skills.length) return '';
  return '## Your skills (how this team does a job; when a task matches one, call read_skill FIRST and follow it)\n'
    + skills.slice(0, 40).map(s => `- ${s.name}: ${s.description}`).join('\n');
}
export async function saveSkill(env, { name, description, body, by = null }) {
  await ensureStratTables(env);
  name = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  if (!name || !String(body || '').trim()) return { error: 'A skill needs a name and its steps.' };
  const now = new Date().toISOString();
  const old = await env.DB.prepare(`SELECT id FROM strat_skill WHERE name = ?1`).bind(name).first();
  if (old) await env.DB.prepare(`UPDATE strat_skill SET description = ?2, body = ?3, updated_at = ?4, active = 1, by_name = COALESCE(?5, by_name) WHERE id = ?1`)
    .bind(old.id, String(description || '').slice(0, 300), String(body).slice(0, 12000), now, by).run();
  else await env.DB.prepare(`INSERT INTO strat_skill (id, name, description, body, by_name, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
    .bind(id('s_'), name, String(description || '').slice(0, 300), String(body).slice(0, 12000), by, now).run();
  return { name, updated: !!old };
}
export async function readSkill(env, name) {
  await ensureStratTables(env);
  const n = String(name || '').trim().toLowerCase();
  return env.DB.prepare(`SELECT name, description, body FROM strat_skill WHERE active = 1 AND (name = ?1 OR name LIKE ?2) ORDER BY name = ?1 DESC LIMIT 1`).bind(n, `%${n}%`).first();
}
export async function deleteSkill(env, sid) {
  await ensureStratTables(env);
  await env.DB.prepare(`UPDATE strat_skill SET active = 0, updated_at = ?2 WHERE id = ?1`).bind(sid, new Date().toISOString()).run();
  return { ok: true };
}

/* ---------------- runs (usage) ---------------- */

export async function logRun(env, r) {
  await ensureStratTables(env).catch(() => {});
  await env.DB.prepare(`INSERT INTO strat_run (id, at, surface, who, brand, question, model, effort, in_tok, cache_read, cache_write, out_tok, cost, steps, ms, stopped, error)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`)
    .bind(id('r_'), new Date().toISOString(), r.surface || null, r.who || null, r.brand || null, String(r.question || '').slice(0, 300), r.model || null, r.effort || null,
      r.inTok || 0, r.cacheRead || 0, r.cacheWrite || 0, r.outTok || 0, Math.round((r.cost || 0) * 10000) / 10000, r.steps || 0, r.ms || 0, r.stopped ? 1 : 0, r.error || null).run().catch(e => console.log('logRun: ' + e.message));
}
export async function usageSummary(env, days = 30) {
  await ensureStratTables(env);
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const q = (sql) => env.DB.prepare(sql).bind(since).all().then(r => r.results || []);
  const [tot] = await q(`SELECT COUNT(*) AS answers, ROUND(SUM(cost), 2) AS cost, SUM(in_tok) AS in_tok, SUM(out_tok) AS out_tok, ROUND(AVG(cost), 3) AS avg_cost, ROUND(AVG(ms) / 1000.0, 1) AS avg_seconds FROM strat_run WHERE at >= ?1`);
  return {
    days, ...tot,
    by_day: await q(`SELECT substr(at, 1, 10) AS day, COUNT(*) AS answers, ROUND(SUM(cost), 2) AS cost FROM strat_run WHERE at >= ?1 GROUP BY day ORDER BY day`),
    by_person: await q(`SELECT COALESCE(who, 'unknown') AS who, COUNT(*) AS answers, ROUND(SUM(cost), 2) AS cost FROM strat_run WHERE at >= ?1 GROUP BY who ORDER BY cost DESC`),
    by_model: await q(`SELECT model, effort, COUNT(*) AS answers, ROUND(SUM(cost), 2) AS cost FROM strat_run WHERE at >= ?1 GROUP BY model, effort ORDER BY cost DESC`),
    by_brand: await q(`SELECT COALESCE(brand, 'agency') AS brand, COUNT(*) AS answers, ROUND(SUM(cost), 2) AS cost FROM strat_run WHERE at >= ?1 GROUP BY brand ORDER BY cost DESC`),
    recent: await q(`SELECT at, surface, who, brand, question, model, effort, cost, steps, ms, stopped, error FROM strat_run WHERE at >= ?1 ORDER BY at DESC LIMIT 40`),
  };
}

/* ---------------- the nightly pass ---------------- */

const CONSOLIDATE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['upserts', 'forget'],
  properties: {
    upserts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['topic', 'text', 'until'],
      properties: { topic: { type: 'string' }, text: { type: 'string' }, until: { type: ['string', 'null'] } } } },
    forget: { type: 'array', items: { type: 'string' } },
  },
};

/**
 * Once a night per brand with new messages: read the day's internal + client channel and the brand's current
 * facts, keep what will still be true next week, fix facts the day contradicted, drop ones that ended.
 * Sonnet 5.5, low effort, about a cent a brand. deps: { xfetch, getSetting, putSetting }.
 */
export async function consolidate(env, deps, { maxBrands = 12 } = {}) {
  if (!env.ANTHROPIC_API_KEY) return { skipped: 'no key' };
  await ensureStratTables(env);
  const since = (await deps.getSetting(env, 'stratMemSince').catch(() => null)) || new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const { results: brands } = await env.DB.prepare(`SELECT m.brand, b.name, COUNT(*) AS n FROM slack_msg m JOIN brands b ON b.id = m.brand
    WHERE m.day >= ?1 AND m.brand IS NOT NULL GROUP BY m.brand ORDER BY n DESC LIMIT ?2`).bind(since, maxBrands).all().catch(() => ({ results: [] }));
  const out = [];
  for (const b of brands || []) {
    if (deps.canAfford && !deps.canAfford(20)) break;
    const { results: msgs } = await env.DB.prepare(`SELECT ts, name, side, text FROM slack_msg WHERE brand = ?1 AND day >= ?2 AND bot = 0 ORDER BY CAST(ts AS REAL) LIMIT 300`).bind(b.brand, since).all();
    if (!(msgs || []).length) continue;
    const facts = await factsFor(env, [b.brand]);
    const convo = msgs.map(m => `[${m.side === 'client' ? 'CLIENT' : 'team'} ${m.name}] ${String(m.text || '').replace(/\s+/g, ' ').slice(0, 400)}`).join('\n').slice(0, 30000);
    const sys = `You keep the long-term memory of Mobius Digital's Strategist for one client brand, ${b.name}. Memory is SHORT FACTS that will still be true next week: decisions, offers and prices, dates, preferences, rules the client set, who owns what, what was agreed. Never chit-chat, never one-off questions, never numbers that the data already holds (spend, ROAS). One fact per topic; a topic is 2 to 5 words ("free shipping threshold", "Black Friday offer", "creator link audience line"). If today's messages change an existing fact, give the same topic with the new text. If something ended or was cancelled, list its topic in forget. Dated facts (a sale, a launch) get until = the last day they matter (YYYY-MM-DD), else null. Plain English, no em dashes. Return nothing rather than something weak.`;
    const user = `Current facts:\n${facts.map(f => `- ${f.topic}: ${f.text}`).join('\n') || '(none)'}\n\nMessages since ${since} (team = Mobius, CLIENT = the client):\n${convo}`;
    try {
      const r = await deps.xfetch('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 6000, thinking: { type: 'adaptive' }, output_config: { effort: 'low', format: { type: 'json_schema', schema: CONSOLIDATE_SCHEMA } },
          system: sys, messages: [{ role: 'user', content: user }] }) });
      const j = await r.json();
      const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
      const d = JSON.parse(text || '{}');
      let up = 0, gone = 0;
      for (const u of (d.upserts || []).slice(0, 12)) { const x = await remember(env, { scope: b.brand, topic: u.topic, text: u.text, until: u.until, source: 'Slack, nightly' }); if (x.id) up++; }
      for (const t of (d.forget || []).slice(0, 12)) gone += (await forget(env, { scope: b.brand, topic: t })).changed;
      out.push({ brand: b.name, messages: msgs.length, saved: up, forgot: gone });
    } catch (e) { out.push({ brand: b.name, error: e.message }); }
  }
  await deps.putSetting(env, 'stratMemSince', until).catch(() => {});
  return { since, brands: out };
}
