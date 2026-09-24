/**
 * Asana <-> Locus for the Brand tab (2026-09-24).
 *
 * Cole's rule: ASANA IS THE ONLY PLACE ANYONE TYPES. Strategists create the task
 * ("339 - 1 Star review from his wife") with the brief Google Doc linked, and move
 * it through the sections as they always have. Locus is the memory, and it fills
 * itself:
 *   1. SYNC     every task with a number becomes a test in p_br_batch (stage from
 *               the section; brief and Frame links from the notes).
 *   2. TAG      the AI reads the brief (Google Docs, via a service account with
 *               domain-wide delegation) plus the live ad copy, and files the test
 *               under an angle in the library, creating the angle if it is new.
 *               It writes Angle and Testing back into Asana's custom fields.
 *   3. WARN     a brand-new task on an angle that has been tried before gets one
 *               comment naming the past tests and how they did.
 *   4. RESULTS  once a test in "Analyze Results" has spent past the brand's test
 *               rules, Locus sets Result (its suggestion) and Learning (a draft),
 *               and comments the Triple Whale numbers, mentioning the assignee.
 *               Ahsan checks, fixes if needed, and moves it to Completed.
 *   5. CLOSE    a completed task's Result + Learning become the library's verdict.
 * Everything written into Asana is visible to the client (Cole: "visibility for all").
 *
 * Secrets: ASANA_TOKEN (Cole's personal access token, so posts show as Cole) and
 * GOOGLE_SA_KEY (service-account JSON, drive.readonly, domain-wide delegation).
 */

const ASANA_API = 'https://app.asana.com/api/1.0';
const MODEL = 'claude-opus-5';
/* Whose Drive the service account reads as. Briefs are owned by whoever wrote
   them; Cole and Ahsan between them can open every brief folder. */
const BRIEF_READERS = ['cole@go-mobius-digital.com', 'ahsan@go-mobius-digital.com'];
const FIELD_NAMES = { angle: 'Angle', testing: 'Testing', result: 'Result', learning: 'Learning' };
const TESTING_OPTS = [['angle', 'New angle', 'blue'], ['concept', 'New concept', 'aqua'], ['variation', 'Variation', 'yellow-green'], ['offer', 'Offer', 'orange']];
const RESULT_OPTS = [['winner', 'Winner', 'green'], ['moderate', 'Moderate', 'yellow'], ['loser', 'Loser', 'red']];

/* Outbound HTTP goes through the worker's metered fetch (xfetch) so the hourly
   tick's subrequest budget sees these calls. worker.js hands it in. */
let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }

const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const clip = (s, n) => (s == null ? '' : String(s).slice(0, n));
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const money = n => '$' + Math.round(n || 0).toLocaleString('en-US');
const VOICE = 'Plain English, short sentences, like a sharp media buyer talking to a colleague. No em dashes, no hype, no jargon.';

/* "339 - ..." -> "339", "GD_272 - ..." -> "272", "#214 - ..." -> "214". Same rule as the ad names. */
export function numOf(name) {
  const m = /^\s*(?:[A-Za-z]{2,4}_)?#?(\d{1,4})(?=$|[^\d])/.exec(name || '');
  return m ? String(parseInt(m[1], 10)) : null;
}
const titleOf = name => String(name || '').replace(/^\s*(?:[A-Za-z]{2,4}_)?#?\d{1,4}\s*[-:|.]?\s*/, '').trim() || String(name || '').trim();
const stageOf = section => {
  const s = String(section || '').toLowerCase();
  if (s.includes('brief')) return 'idea';
  if (s.includes('studio') || s.includes('ready')) return 'production';
  if (s.includes('analy')) return 'live';
  if (s.includes('complete')) return 'done';
  return null;
};

/* ---------------- Asana ---------------- */
async function asana(env, path, init = {}) {
  const token = (env.ASANA_TOKEN || '').trim();
  if (!token) throw Object.assign(new Error('Asana is not connected: put ASANA_TOKEN on the account-health worker.'), { status: 400 });
  const res = await F(`${ASANA_API}${path}`, {
    method: init.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: init.body ? JSON.stringify({ data: init.body }) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const said = data.errors?.[0]?.message || '';
    /* Never pass a 401 through: Locus reads 401 as "your session died". */
    throw Object.assign(new Error(res.status === 401 ? 'Asana rejected the token. Put a fresh personal access token on the worker.' : `Asana ${res.status}${said ? `: ${said}` : ''}`), { status: res.status === 401 ? 502 : res.status });
  }
  return init.raw ? data : data.data;
}
async function asanaAll(env, path) {
  const out = [];
  let offset = null;
  for (let i = 0; i < 30; i++) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await asana(env, `${path}${sep}limit=100${offset ? `&offset=${offset}` : ''}`, { raw: true });
    out.push(...(r.data || []));
    offset = r.next_page?.offset;
    if (!offset) break;
  }
  return out;
}

/* ---------------- Google (service account, domain-wide delegation) ---------------- */
const G_TOKENS = new Map();
const b64u = buf => btoa(typeof buf === 'string' ? buf : String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function googleToken(env, sub) {
  const hit = G_TOKENS.get(sub);
  if (hit && hit.exp > Date.now() + 60000) return hit.token;
  const key = safeJson(env.GOOGLE_SA_KEY, null);
  if (!key?.private_key || !key?.client_email) throw new Error('GOOGLE_SA_KEY is missing or is not the service-account JSON.');
  const der = Uint8Array.from(atob(key.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  const pk = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: key.client_email, sub, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pk, new TextEncoder().encode(`${head}.${claim}`)));
  const res = await F('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${claim}.${sig}`,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google sign-in failed: ${j.error_description || j.error || res.status}. Check the domain-wide delegation client ID and scope.`);
  G_TOKENS.set(sub, { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token;
}
const docIdOf = text => (/docs\.google\.com\/document\/d\/([\w-]{20,})/.exec(text || '') || [])[1] || null;
/** The brief as plain text, or null if nobody we can read as has access. */
async function readDoc(env, id) {
  if (!id || !env.GOOGLE_SA_KEY) return null;
  for (const sub of BRIEF_READERS) {
    try {
      const tok = await googleToken(env, sub);
      const res = await F(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`, { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) return (await res.text()).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
      if (res.status !== 403 && res.status !== 404) return null;
    } catch (e) { if (/Google sign-in failed/.test(e.message)) throw e; }
  }
  return null;
}

/* ---------------- Claude (small structured calls) ---------------- */
async function claudeJson(env, { system, user, schema, effort = 'medium', maxTokens = 16000 }) {
  const res = await F('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, thinking: { type: 'adaptive' }, output_config: { effort, format: { type: 'json_schema', schema } }, messages: [{ role: 'user', content: user }] }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `Claude API HTTP ${res.status}`);
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return { out: safeJson(text, null), usage: j.usage || {} };
}
const S = { type: 'string' };
const obj = p => ({ type: 'object', properties: p, required: Object.keys(p), additionalProperties: false });
const TAG_SCHEMA = obj({ tags: { type: 'array', items: obj({
  num: S, angle_id: S, new_angle_name: S, new_angle_argument: S, concept: S,
  level: { type: 'string', enum: ['angle', 'concept', 'variation', 'offer'] },
  variable: { type: 'string', enum: ['', 'hook', 'visual', 'copy', 'creator', 'format', 'length', 'product'] },
  offer: S, hypothesis: S,
}) } });
const LEARN_SCHEMA = obj({ learning: S });

/* ---------------- brand settings ---------------- */
async function getDoc(env, act, key) {
  const r = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = ?2`).bind(act, key).first();
  return safeJson(r?.data_json, null);
}
async function putDoc(env, act, key, data) {
  await env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', ?2, ?3, 'approved', 'asana', datetime('now'))
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).bind(act, key, JSON.stringify(data)).run();
}
async function getSetting(env, key) { const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first(); return safeJson(r?.value, null); }
async function putSetting(env, key, v) { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify(v)).run(); }

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The four Locus fields, created once in the workspace and reused by every brand. */
async function ensureFields(env, workspace) {
  const have = await getSetting(env, 'brandAsanaFields');
  if (have?.workspace === workspace && have.angle && have.testing && have.result && have.learning) return have;
  const existing = await asanaAll(env, `/workspaces/${workspace}/custom_fields?opt_fields=name,resource_subtype,enum_options.name`);
  const find = name => existing.find(f => f.name === name);
  const out = { workspace };
  for (const [k, name] of Object.entries(FIELD_NAMES)) {
    let f = find(name);
    const enumOpts = k === 'testing' ? TESTING_OPTS : k === 'result' ? RESULT_OPTS : null;
    if (!f) {
      f = await asana(env, '/custom_fields', { method: 'POST', body: enumOpts
        ? { workspace, name, resource_subtype: 'enum', enum_options: enumOpts.map(([, l, color]) => ({ name: l, color })), description: 'Filled by Locus.' }
        : { workspace, name, resource_subtype: 'text', description: 'Filled by Locus.' } });
    }
    out[k] = f.gid;
    if (enumOpts) {
      let opts = f.enum_options;
      if (!opts) opts = (await asana(env, `/custom_fields/${f.gid}?opt_fields=enum_options.name`)).enum_options || [];
      out[k + '_opts'] = Object.fromEntries(enumOpts.map(([key, l]) => [key, (opts.find(o => o.name === l) || {}).gid]).filter(([, g]) => g));
    }
  }
  await putSetting(env, 'brandAsanaFields', out);
  return out;
}

/** Find the brand's Asana project by name and add the four fields to it. */
async function connect(env, act, projectGid) {
  const acct = await env.DB.prepare(`SELECT act_id, name FROM accounts WHERE act_id = ?1`).bind(act).first();
  if (!acct) throw Object.assign(new Error('unknown account'), { status: 404 });
  const me = await asana(env, '/users/me?opt_fields=name,workspaces.name');
  const ws = me.workspaces?.find(w => /mobius/i.test(w.name)) || me.workspaces?.[0];
  if (!ws) throw new Error('The Asana token has no workspace.');
  let project = null;
  if (projectGid) project = await asana(env, `/projects/${projectGid}?opt_fields=name,permalink_url`);
  else {
    const all = await asanaAll(env, `/projects?workspace=${ws.gid}&archived=false&opt_fields=name,permalink_url`);
    project = all.find(p => norm(p.name) === norm(acct.name)) || all.find(p => norm(p.name).includes(norm(acct.name)) || norm(acct.name).includes(norm(p.name)));
    if (!project) throw Object.assign(new Error(`No Asana project called "${acct.name}". Pick it by hand.`), { status: 404, projects: all.map(p => ({ gid: p.gid, name: p.name })) });
  }
  const fields = await ensureFields(env, ws.gid);
  const settings = await asana(env, `/projects/${project.gid}/custom_field_settings?opt_fields=custom_field.gid`);
  const onProject = new Set((settings || []).map(s => s.custom_field?.gid));
  for (const k of Object.keys(FIELD_NAMES)) {
    if (!onProject.has(fields[k])) await asana(env, `/projects/${project.gid}/addCustomFieldSetting`, { method: 'POST', body: { custom_field: fields[k], is_important: true } });
  }
  const prev = (await getDoc(env, act, 'asana')) || {};
  const doc = { ...prev, project_gid: project.gid, project_name: project.name, url: project.permalink_url, workspace: ws.gid, connected_at: prev.connected_at || new Date().toISOString(), as: me.name };
  await putDoc(env, act, 'asana', doc);
  return doc;
}

/* ---------------- 1. SYNC ---------------- */
const TASK_FIELDS = 'name,notes,completed,completed_at,created_at,modified_at,permalink_url,assignee.gid,assignee.name,memberships.project.gid,memberships.section.name,custom_fields.gid,custom_fields.name,custom_fields.display_value,custom_fields.text_value,custom_fields.enum_value.gid';
async function syncTasks(env, act, doc, { full = false } = {}) {
  const since = !full && doc.last_sync ? `&modified_since=${encodeURIComponent(doc.last_sync)}` : '';
  const started = new Date().toISOString();
  const tasks = await asanaAll(env, `/tasks?project=${doc.project_gid}&opt_fields=${TASK_FIELDS}${since}`);
  const fields = await getSetting(env, 'brandAsanaFields') || {};
  /* One test per number. When a number has two tasks (338 does), the open one wins, then the newest. */
  const byNum = new Map();
  for (const t of tasks) {
    const n = numOf(t.name);
    if (!n) continue;
    const cur = byNum.get(n);
    if (!cur || (cur.completed && !t.completed) || (cur.completed === t.completed && t.modified_at > cur.modified_at)) byNum.set(n, t);
  }
  const existing = (await env.DB.prepare(`SELECT id, num, verdict, stage, asana_gid FROM p_br_batch WHERE act_id = ?1`).bind(act).all()).results || [];
  const have = new Map(existing.map(b => [String(parseInt(b.num, 10)), b]));
  const st = [];
  let created = 0, updated = 0, closed = 0;
  for (const [n, t] of byNum) {
    const section = t.memberships?.find(m => m.project?.gid === doc.project_gid)?.section?.name || '';
    let stage = t.completed ? 'done' : stageOf(section);
    if (!stage) continue;
    const cf = Object.fromEntries((t.custom_fields || []).map(f => [f.gid, f]));
    const status = (t.custom_fields || []).find(f => /concept status/i.test(f.name || ''))?.display_value;
    if (/results recorded/i.test(status || '')) stage = 'done';
    if (/cancel/i.test(status || '')) stage = 'done';
    const brief = (/https?:\/\/docs\.google\.com\/document\/[^\s)]+/.exec(t.notes || '') || [])[0] || null;
    const asset = (/https?:\/\/(?:next\.)?(?:frame\.io|f\.io)\/[^\s)]+/.exec(t.notes || '') || [])[0] || null;
    /* The call Ahsan left in Asana, once the task is finished. */
    const resOpt = cf[fields.result]?.enum_value?.gid;
    const verdict = resOpt ? Object.entries(fields.result_opts || {}).find(([, g]) => g === resOpt)?.[0] : null;
    const learning = cf[fields.learning]?.text_value || null;
    const cancelled = /cancel/i.test(status || '');
    const row = have.get(n);
    if (row) {
      const closeNow = stage === 'done' && (verdict || cancelled) && !row.verdict;
      if (closeNow) closed++;
      st.push(env.DB.prepare(`UPDATE p_br_batch SET title = ?3, stage = ?4, asana_gid = ?5, asana_url = ?6, asana_section = ?7,
          brief_url = COALESCE(?8, brief_url), asset_url = COALESCE(?9, asset_url), assignee_gid = ?10,
          verdict = CASE WHEN ?11 IS NOT NULL AND (?4 = 'done') THEN ?11 ELSE verdict END,
          verdict_by = CASE WHEN ?11 IS NOT NULL AND (?4 = 'done') THEN 'Asana' ELSE verdict_by END,
          verdict_at = CASE WHEN ?11 IS NOT NULL AND (?4 = 'done') AND verdict_at IS NULL THEN datetime('now') ELSE verdict_at END,
          learning = COALESCE(?12, learning), updated_at = datetime('now') WHERE id = ?1 AND act_id = ?2`)
        .bind(row.id, act, clip(titleOf(t.name), 300), stage, t.gid, t.permalink_url, clip(section, 80), brief, asset, t.assignee?.gid || null,
          cancelled ? 'cancelled' : verdict, learning));
      updated++;
    } else {
      st.push(env.DB.prepare(`INSERT INTO p_br_batch (id, act_id, num, title, stage, asana_gid, asana_url, asana_section, brief_url, asset_url, assignee_gid, verdict, verdict_by, learning, source, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'asana', ?15)`)
        .bind(rid(), act, n, clip(titleOf(t.name), 300), stage, t.gid, t.permalink_url, clip(section, 80), brief, asset, t.assignee?.gid || null,
          stage === 'done' ? (cancelled ? 'cancelled' : verdict) : null, stage === 'done' && (verdict || cancelled) ? 'Asana' : null, learning,
          (t.created_at || '').replace('T', ' ').slice(0, 19) || null));
      created++;
    }
  }
  for (let i = 0; i < st.length; i += 80) await env.DB.batch(st.slice(i, i + 80));
  await putDoc(env, act, 'asana', { ...doc, last_sync: started });
  return { tasks: tasks.length, numbered: byNum.size, created, updated, closed };
}

/* ---------------- 2. TAG (+ 3. WARN) ---------------- */
async function adCopyFor(env, act, nums) {
  if (!nums.length) return {};
  const ads = (await env.DB.prepare(`SELECT a.ad_id, a.name, c.json FROM ads a LEFT JOIN ad_creative c ON c.ad_id = a.ad_id WHERE a.act_id = ?1`).bind(act).all().catch(() => ({ results: [] }))).results || [];
  const want = new Set(nums);
  const out = {};
  for (const a of ads) {
    const n = numOf(a.name);
    if (!n || !want.has(n)) continue;
    const j = safeJson(a.json, {});
    const copy = [j.headline, j.body, j.title].filter(Boolean).join(' / ');
    (out[n] ||= []).push(`${a.name}${copy ? `: ${clip(copy, 300)}` : ''}`);
  }
  return out;
}

async function tagPass(env, act, { limit = 12, warn = true } = {}) {
  const rows = (await env.DB.prepare(`SELECT id, num, title, offer, hypothesis, why, level, brief_url, legacy_json, asana_gid, stage, created_at, source FROM p_br_batch
      WHERE act_id = ?1 AND angle_id IS NULL AND tagged_at IS NULL ORDER BY CAST(num AS INTEGER) ASC LIMIT ?2`).bind(act, limit).all()).results || [];
  if (!rows.length) return { tagged: 0, left: 0 };
  const angles = (await env.DB.prepare(`SELECT id, name, argument FROM p_br_angle WHERE act_id = ?1 AND status != 'proposed'`).bind(act).all()).results || [];
  const copy = await adCopyFor(env, act, rows.map(r => String(parseInt(r.num, 10))));
  const briefs = {};
  let briefErr = null;
  for (const r of rows) {
    const id = docIdOf(r.brief_url);
    if (!id) continue;
    try { briefs[r.id] = await readDoc(env, id); } catch (e) { briefErr = e.message; }
  }
  const acct = await env.DB.prepare(`SELECT name FROM accounts WHERE act_id = ?1`).bind(act).first();
  const items = rows.map(r => {
    const lg = safeJson(r.legacy_json, {});
    return `### TEST ${parseInt(r.num, 10)}: ${r.title}\n${r.offer ? `Offer: ${r.offer}\n` : ''}${r.hypothesis ? `What we tested: ${r.hypothesis}\n` : ''}${r.why ? `Why: ${r.why}\n` : ''}${Object.keys(lg).length ? `Old sheet notes: ${clip(JSON.stringify(lg), 600)}\n` : ''}${briefs[r.id] ? `BRIEF:\n${clip(briefs[r.id], 2500)}\n` : ''}${copy[String(parseInt(r.num, 10))] ? `ADS THAT RAN:\n${copy[String(parseInt(r.num, 10))].slice(0, 6).join('\n')}\n` : ''}`;
  }).join('\n');
  const { out, usage } = await claudeJson(env, {
    system: `You file ${acct?.name || 'a brand'}'s ad tests into its angle library. An ANGLE is the reason to buy (the wife's reaction, bad golfer relief, fits a dad bod). It is never the format, the offer or the wording. A CONCEPT is how one ad shows the angle (a fake 1-star review, a post-it note). Rules:
- Reuse an existing angle whenever the reason to buy is the same, even in different words: put its id in angle_id and leave new_angle_name empty.
- Only when no existing angle fits, leave angle_id empty and name a new angle in 2-5 plain words with a one-sentence argument. If several tests below share a new angle, give them the EXACT same new_angle_name.
- A pure discount or bundle test with no reason-to-buy beyond the deal: level "offer", and still pick the angle if the ad clearly argues one, otherwise angle_id and new_angle_name both empty.
- level: "angle" if this is the first test of that angle, "concept" for a new way to show a known angle, "variation" when one element of an earlier test changed (say which in variable), "offer" as above.
- offer: the deal named in the ad or brief, empty if none. hypothesis: one line, what this test tries to learn.
Return one entry per test, keyed by its number. ${VOICE}`,
    user: `EXISTING ANGLES (id | name | argument):\n${angles.map(a => `${a.id} | ${a.name} | ${clip(a.argument, 200)}`).join('\n') || 'none yet'}\n\nTESTS:\n${items}`,
    schema: TAG_SCHEMA, effort: 'medium',
  });
  const tags = out?.tags || [];
  const known = new Set(angles.map(a => a.id));
  const newIds = new Map();
  const fields = await getSetting(env, 'brandAsanaFields') || {};
  const doc = await getDoc(env, act, 'asana');
  const names = Object.fromEntries(angles.map(a => [a.id, a.name]));
  let tagged = 0;
  const warned = [];
  for (const r of rows) {
    const t = tags.find(x => String(parseInt(x.num, 10)) === String(parseInt(r.num, 10)));
    if (!t) { await env.DB.prepare(`UPDATE p_br_batch SET tagged_at = datetime('now') WHERE id = ?1`).bind(r.id).run(); continue; }
    let angleId = known.has(t.angle_id) ? t.angle_id : null;
    const wasKnown = !!angleId;
    if (!angleId && t.new_angle_name) {
      const k = t.new_angle_name.trim().toLowerCase();
      angleId = newIds.get(k);
      if (!angleId) {
        angleId = rid();
        newIds.set(k, angleId);
        names[angleId] = t.new_angle_name.trim();
        await env.DB.prepare(`INSERT INTO p_br_angle (id, act_id, name, argument, status, source, note) VALUES (?1, ?2, ?3, ?4, 'active', 'ai', 'Filed by Locus from the tests. Rename or merge freely.')`)
          .bind(angleId, act, clip(t.new_angle_name.trim(), 200), clip(t.new_angle_argument, 3000)).run();
      }
    }
    let conceptId = null;
    if (angleId && t.concept) {
      const c = await env.DB.prepare(`SELECT id FROM p_br_concept WHERE act_id = ?1 AND angle_id = ?2 AND lower(name) = lower(?3)`).bind(act, angleId, t.concept.trim()).first();
      conceptId = c?.id || rid();
      if (!c) await env.DB.prepare(`INSERT INTO p_br_concept (id, act_id, angle_id, name) VALUES (?1, ?2, ?3, ?4)`).bind(conceptId, act, angleId, clip(t.concept.trim(), 200)).run();
    }
    await env.DB.prepare(`UPDATE p_br_batch SET angle_id = ?2, concept_id = ?3, level = COALESCE(level, ?4), variable = COALESCE(variable, NULLIF(?5, '')),
        offer = COALESCE(offer, NULLIF(?6, '')), hypothesis = COALESCE(hypothesis, NULLIF(?7, '')), tagged_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1`)
      .bind(r.id, angleId, conceptId, t.level, t.variable, clip(t.offer, 300), clip(t.hypothesis, 3000)).run();
    tagged++;
    /* Write Angle + Testing onto OPEN tasks only; finished ones would just notify people about history. */
    if (r.asana_gid && r.stage !== 'done' && fields.angle) {
      const cf = { [fields.angle]: angleId ? names[angleId] : 'No angle, offer only' };
      if (fields.testing_opts?.[t.level]) cf[fields.testing] = fields.testing_opts[t.level];
      await asana(env, `/tasks/${r.asana_gid}`, { method: 'PUT', body: { custom_fields: cf } }).catch(() => {});
      /* 3. WARN: a new task (still being briefed or built) on an angle with history. */
      if (warn && wasKnown && ['idea', 'production'].includes(r.stage)) {
        const past = (await env.DB.prepare(`SELECT num, title, verdict FROM p_br_batch WHERE act_id = ?1 AND angle_id = ?2 AND id != ?3 AND verdict IS NOT NULL ORDER BY CAST(num AS INTEGER) DESC LIMIT 6`).bind(act, angleId, r.id).all()).results || [];
        if (past.length) {
          const w = past.filter(p => p.verdict === 'winner').length, l = past.filter(p => p.verdict === 'loser').length;
          const text = `Locus: this test is on the angle "${names[angleId]}", which has been tested ${past.length} time${past.length === 1 ? '' : 's'} before (${w} winner${w === 1 ? '' : 's'}, ${l} loser${l === 1 ? '' : 's'}):\n${past.map(p => `- ${parseInt(p.num, 10)} ${p.title}: ${p.verdict}`).join('\n')}\nWorth making sure this one tries something those did not.`;
          await asana(env, `/tasks/${r.asana_gid}/stories`, { method: 'POST', body: { text } }).then(() => warned.push(r.num)).catch(() => {});
        }
      }
    }
  }
  const left = (await env.DB.prepare(`SELECT COUNT(*) n FROM p_br_batch WHERE act_id = ?1 AND angle_id IS NULL AND tagged_at IS NULL`).bind(act).first())?.n || 0;
  return { tagged, left, new_angles: newIds.size, warned, briefs_read: Object.values(briefs).filter(Boolean).length, brief_error: briefErr, tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0) };
}

/* ---------------- 4. RESULTS ---------------- */
async function batchStats(env, act, nums) {
  const ads = (await env.DB.prepare(`SELECT ad_id, name FROM ads WHERE act_id = ?1`).bind(act).all()).results || [];
  const tags = Object.fromEntries(((await env.DB.prepare(`SELECT ad_id, batch_id FROM p_br_adtag WHERE act_id = ?1`).bind(act).all()).results || []).map(t => [t.ad_id, t.batch_id]));
  const want = new Map(nums.map(x => [x.num, x.id]));
  const byBatch = {};
  for (const a of ads) {
    const n = numOf(a.name);
    const bid = tags[a.ad_id] || (n && want.get(n));
    if (bid && [...want.values()].includes(bid)) (byBatch[bid] ||= []).push(a.ad_id);
  }
  const out = {};
  for (const [bid, ids] of Object.entries(byBatch)) {
    const q = ids.map((_, i) => `?${i + 2}`).join(',');
    const s = await env.DB.prepare(`SELECT SUM(spend) spend, MIN(CASE WHEN spend > 0 THEN date END) first FROM ad_daily WHERE act_id = ?1 AND ad_id IN (${q})`).bind(act, ...ids).first();
    const t = await env.DB.prepare(`SELECT SUM(revenue) rev, SUM(orders) orders FROM tw_ad_attr WHERE act_id = ?1 AND model = 'lastPlatformClick' AND ad_id IN (${q})`).bind(act, ...ids).first();
    out[bid] = { ads: ids.length, spend: s?.spend || 0, first: s?.first, rev: t?.rev || 0, orders: t?.orders || 0 };
  }
  return out;
}
function rulesOf(acct, doc) {
  const r = { judge_spend: 150, judge_days: 7, win_roas: 2, lose_roas: 1.2 };
  if (acct?.target_cpa > 0) r.judge_spend = Math.round(acct.target_cpa * 3);
  if (acct?.target_roas > 0) { r.win_roas = acct.target_roas; r.lose_roas = Math.round(acct.target_roas * 0.6 * 100) / 100; }
  for (const k of Object.keys(r)) if (doc && +doc[k] > 0) r[k] = +doc[k];
  return r;
}
function suggest(st, r) {
  if (!st || !(st.spend > 0)) return null;
  const age = st.first ? Math.round((Date.parse(`${today()}T12:00:00Z`) - Date.parse(`${st.first}T12:00:00Z`)) / 864e5) : 0;
  if (!(st.spend >= r.judge_spend || (age >= r.judge_days && st.spend >= r.judge_spend / 3))) return null;
  const roas = st.rev / st.spend;
  return roas >= r.win_roas ? 'winner' : roas < r.lose_roas ? 'loser' : 'moderate';
}

async function resultsPass(env, act, { limit = 8 } = {}) {
  const acct = await env.DB.prepare(`SELECT act_id, name, target_cpa, target_roas FROM accounts WHERE act_id = ?1`).bind(act).first();
  const rules = rulesOf(acct, await getDoc(env, act, 'rules'));
  const rows = (await env.DB.prepare(`SELECT b.id, b.num, b.title, b.asana_gid, b.assignee_gid, b.result_posted, b.hypothesis, b.offer, a.name AS angle FROM p_br_batch b LEFT JOIN p_br_angle a ON a.id = b.angle_id
      WHERE b.act_id = ?1 AND b.asana_gid IS NOT NULL AND b.stage = 'live' AND b.verdict IS NULL`).bind(act).all()).results || [];
  if (!rows.length) return { posted: 0 };
  const stats = await batchStats(env, act, rows.map(r => ({ num: String(parseInt(r.num, 10)), id: r.id })));
  const fields = await getSetting(env, 'brandAsanaFields') || {};
  const L = { winner: 'Winner', moderate: 'Moderate', loser: 'Loser' };
  let posted = 0;
  for (const r of rows) {
    if (posted >= limit) break;
    const st = stats[r.id];
    const sug = suggest(st, rules);
    if (!sug || r.result_posted === sug) continue;
    const roas = st.spend > 0 ? st.rev / st.spend : 0;
    const cpa = st.orders > 0 ? st.spend / st.orders : null;
    const { out } = await claudeJson(env, {
      system: `Write ONE line (under 25 words) a media buyer would log as the learning from this ad test: what it tells the next strategist. Base it only on the numbers and the test description. ${VOICE}`,
      user: `Test ${parseInt(r.num, 10)}: ${r.title}\nAngle: ${r.angle || 'none'}\nWhat it tested: ${r.hypothesis || 'not written'}\nOffer: ${r.offer || 'none'}\nResult: ${money(st.spend)} spent, ${roas.toFixed(2)} Triple Whale ROAS, ${st.orders} orders, across ${st.ads} ads. The brand counts ${rules.win_roas}+ as a winner and under ${rules.lose_roas} as a loser. Call: ${L[sug]}.`,
      schema: LEARN_SCHEMA, effort: 'low', maxTokens: 3000,
    }).catch(() => ({ out: null }));
    const learning = clip(out?.learning, 300);
    const cf = {};
    if (fields.result_opts?.[sug]) cf[fields.result] = fields.result_opts[sug];
    if (learning && fields.learning) cf[fields.learning] = learning;
    try {
      if (Object.keys(cf).length) await asana(env, `/tasks/${r.asana_gid}`, { method: 'PUT', body: { custom_fields: cf } });
      const who = r.assignee_gid ? `<a data-asana-gid="${r.assignee_gid}"/> ` : '';
      const html = `<body>${who}Locus: this test has spent enough to judge.\n<strong>${money(st.spend)} spent, ${roas.toFixed(2)} ROAS, ${st.orders} order${st.orders === 1 ? '' : 's'}${cpa ? ` (${money(cpa)} each)` : ''}</strong> across ${st.ads} ad${st.ads === 1 ? '' : 's'}, Triple Whale attribution.\nSuggested call: <strong>${L[sug]}</strong> (winner at ${rules.win_roas}+, loser under ${rules.lose_roas}).${learning ? `\nDraft learning: ${learning.replace(/[<>&]/g, '')}` : ''}\nCheck Result and Learning above, change them if you disagree, then move this to Completed.</body>`;
      await asana(env, `/tasks/${r.asana_gid}/stories`, { method: 'POST', body: { html_text: html } });
      await env.DB.prepare(`UPDATE p_br_batch SET result_posted = ?2, learning = COALESCE(learning, NULLIF(?3, '')), updated_at = datetime('now') WHERE id = ?1`).bind(r.id, sug, learning).run();
      posted++;
    } catch (e) { /* one bad task must not stop the rest */ }
  }
  return { posted, waiting: rows.length };
}

/* ---------------- the hourly tick ---------------- */
export async function brandAsanaTick(env, canAfford = () => true) {
  if (!env.ASANA_TOKEN) return { skipped: 'no ASANA_TOKEN' };
  const docs = (await env.DB.prepare(`SELECT act_id, data_json FROM p_br_doc WHERE line_id = '' AND key = 'asana'`).all().catch(() => ({ results: [] }))).results || [];
  const out = {};
  for (const d of docs) {
    const doc = safeJson(d.data_json, {});
    if (!doc.project_gid || doc.paused) continue;
    if (!canAfford(30)) { out[d.act_id] = 'deferred'; continue; }
    try {
      const s = await syncTasks(env, d.act_id, doc);
      const t = await tagPass(env, d.act_id, { limit: 8 });
      const r = await resultsPass(env, d.act_id, { limit: 4 });
      out[d.act_id] = { sync: s, tagged: t.tagged, results: r.posted };
    } catch (e) { out[d.act_id] = { error: e.message }; }
  }
  return out;
}

/* ---------------- routes (admin) ---------------- */
export async function handleBrandAsana(request, env, path, json, isAdmin) {
  if (!path.startsWith('/api/brand-asana')) return null;
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const url = new URL(request.url);
  const b = request.method === 'GET' ? Object.fromEntries(url.searchParams) : await request.json().catch(() => ({}));
  try {
    if (path === '/api/brand-asana/check') {
      const out = { asana: null, google: null };
      try { const me = await asana(env, '/users/me?opt_fields=name,email'); out.asana = { ok: true, as: me.name }; } catch (e) { out.asana = { ok: false, error: e.message }; }
      if (b.doc) { try { const t = await readDoc(env, b.doc); out.google = t ? { ok: true, chars: t.length, start: clip(t, 200) } : { ok: false, error: 'Could not open that doc as Cole or Ahsan.' }; } catch (e) { out.google = { ok: false, error: e.message }; } }
      return json(out);
    }
    if (!b.act) return json({ error: 'act is required' }, 400);
    if (path === '/api/brand-asana/connect') {
      try { return json({ ok: true, asana: await connect(env, b.act, b.project_gid) }); }
      catch (e) { return json({ error: e.message, projects: e.projects || null }, e.status || 500); }
    }
    const doc = await getDoc(env, b.act, 'asana');
    if (!doc?.project_gid) return json({ error: 'Connect the brand to its Asana project first.' }, 400);
    if (path === '/api/brand-asana/sync') return json({ ok: true, ...(await syncTasks(env, b.act, doc, { full: !!b.full })) });
    if (path === '/api/brand-asana/tag') return json({ ok: true, ...(await tagPass(env, b.act, { limit: Math.min(15, +b.limit || 12), warn: b.warn !== false && b.warn !== 'false' })) });
    if (path === '/api/brand-asana/results') return json({ ok: true, ...(await resultsPass(env, b.act, { limit: Math.min(30, +b.limit || 10) })) });
    if (path === '/api/brand-asana/pause') { await putDoc(env, b.act, 'asana', { ...doc, paused: !!b.paused }); return json({ ok: true }); }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e.message }, e.status && e.status < 600 ? e.status : 500);
  }
}
