import { metaOf, resolveBrandId, addConnection, connSet } from './brands.js';
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
/* Bump when fields or options change: every connected project is brought up to date. */
const FIELDS_VERSION = 2;
const FIELD_NAMES = { angle: 'Angle', testing: 'Testing', result: 'Result', learning: 'Learning', keep_reason: 'Keep running because', check_again: 'Check again' };
/* The Mobius framework's three words: Angle, Concept, What We're Testing. "Variation"
   is retired; the internal level 'variation' means testing inside a proven concept. */
const TESTING_OPTS = [['angle', 'New angle', 'blue'], ['concept', 'New concept', 'aqua'], ['variation', 'Inside a concept', 'yellow-green']];
const RESULT_OPTS = [['winner', 'Winner', 'green'], ['keep', 'Keep running', 'blue'], ['loser', 'Loser', 'red']];
const KEEP_OPTS = [['tof', 'Top of funnel doing its job', 'purple'], ['data', 'Not enough data yet', 'cool-gray'], ['scaling', 'Scaling', 'green'], ['waiting', 'Waiting on offer or landing page', 'orange'], ['other', 'Other', 'none']];
/* Old option names are renamed in place, so tasks keep their values. */
const RENAMES = { Variation: 'Inside a concept', Moderate: 'Keep running' };
const RETIRED = ['Offer'];

/* Outbound HTTP goes through the worker's metered fetch (xfetch) so the hourly
   tick's subrequest budget sees these calls. worker.js hands it in. */
let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }

/* Brand-first (phase 3, 2026-10-08): `act` everywhere in this file is the BRAND id (brand_x).
   Meta's own tables and the Graph API use the brand's Meta ad account ids (connections kind
   'meta'); a brand can have several, or none. */
const metaActsOf = async (env, brandId) => ((await env.DB.prepare(`SELECT external_id FROM connections WHERE brand_id = ?1 AND kind = 'meta' ORDER BY is_primary DESC, added_at`).bind(brandId).all().catch(() => ({ results: [] }))).results || []).map(r => r.external_id);
const amId = metaAct => String(metaAct || '').replace(/^act_/, '');   // Ads Manager wants the bare number

const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
/* Cuts at n characters without splitting an emoji: a lone surrogate half makes the
   whole request body invalid JSON to the Claude API (a Grunk brief did exactly that). */
const clip = (s, n) => (s == null ? '' : String(s).slice(0, n).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, ''));
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
async function googleToken(env, sub, scope = 'https://www.googleapis.com/auth/drive.readonly') {
  const gk = sub + '|' + scope;
  const hit = G_TOKENS.get(gk);
  if (hit && hit.exp > Date.now() + 60000) return hit.token;
  const key = safeJson(env.GOOGLE_SA_KEY, null);
  if (!key?.private_key || !key?.client_email) throw new Error('GOOGLE_SA_KEY is missing or is not the service-account JSON.');
  const der = Uint8Array.from(atob(key.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  const pk = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: key.client_email, sub, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pk, new TextEncoder().encode(`${head}.${claim}`)));
  const res = await F('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${claim}.${sig}`,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google sign-in failed: ${j.error_description || j.error || res.status}. Check the domain-wide delegation client ID and scope.`);
  G_TOKENS.set(gk, { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
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
/* The system prompt is the part that repeats (the same brief/report prompt
 * for every brand in a cron run, the same skill model file for every file in a
 * build), so it is marked for caching. Under the model's minimum it just
 * does not cache; no error. An array system is passed through as given. */
const cachedSystem = s => typeof s === 'string' && s ? [{ type: 'text', text: s, cache_control: { type: 'ephemeral' } }] : s;

async function claudeJson(env, { system, user, schema, effort = 'medium', maxTokens = 16000 }) {
  const res = await F('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: cachedSystem(system), thinking: { type: 'adaptive' }, output_config: { effort, format: { type: 'json_schema', schema } }, messages: [{ role: 'user', content: user }] }),
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
  variable: { type: 'string', enum: ['', 'headline', 'hook', 'person', 'edit', 'redesign', 'review', 'offer', 'copy', 'visual', 'format'] },
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
  /* The project link itself is the brand's `asana` connection (brands.js phase 5); this doc keeps the
     integration's working state (webhook ids, last sync, paused). Written together so they never drift. */
  if (key === 'asana') await connSet(env, act, 'asana', data?.project_gid || '', { label: data?.project_name || null, config: data?.url ? { url: data.url } : {} }).catch(e => console.log('asana connection: ' + e.message));
}
async function getSetting(env, key) { const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first(); return safeJson(r?.value, null); }
async function putSetting(env, key, v) { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify(v)).run(); }

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The Locus fields, created once in the workspace and reused by every brand. */
async function ensureFields(env, workspace) {
  const have = await getSetting(env, 'brandAsanaFields');
  if (have?.workspace === workspace && have.version === FIELDS_VERSION) return have;
  const existing = await asanaAll(env, `/workspaces/${workspace}/custom_fields?opt_fields=name,resource_subtype,enum_options.name,enum_options.enabled`);
  const out = { workspace, version: FIELDS_VERSION };
  const ENUMS = { testing: TESTING_OPTS, result: RESULT_OPTS, keep_reason: KEEP_OPTS };
  for (const [k, name] of Object.entries(FIELD_NAMES)) {
    let f = existing.find(x => x.name === name);
    const opts = ENUMS[k];
    if (!f) {
      f = await asana(env, '/custom_fields', { method: 'POST', body: { workspace, name, description: 'Filled by Locus.',
        resource_subtype: opts ? 'enum' : k === 'check_again' ? 'date' : 'text',
        ...(opts ? { enum_options: opts.map(([, l, color]) => ({ name: l, color })) } : {}) } });
    }
    out[k] = f.gid;
    if (opts) {
      const list = f.enum_options || (await asana(env, `/custom_fields/${f.gid}?opt_fields=enum_options.name,enum_options.enabled`)).enum_options || [];
      for (const o of list) {
        if (RENAMES[o.name] && !list.some(x => x.name === RENAMES[o.name])) { await asana(env, `/enum_options/${o.gid}`, { method: 'PUT', body: { name: RENAMES[o.name] } }); o.name = RENAMES[o.name]; }
        if (RETIRED.includes(o.name) && o.enabled !== false) await asana(env, `/enum_options/${o.gid}`, { method: 'PUT', body: { enabled: false } }).catch(() => {});
      }
      for (const [, l, color] of opts) if (!list.some(o => o.name === l)) list.push(await asana(env, `/custom_fields/${f.gid}/enum_options`, { method: 'POST', body: { name: l, color } }));
      out[k + '_opts'] = Object.fromEntries(opts.map(([key, l]) => [key, (list.find(o => o.name === l) || {}).gid]).filter(([, g]) => g));
    }
  }
  await putSetting(env, 'brandAsanaFields', out);
  return out;
}
/** A connected project carries every Locus field; new fields arrive with FIELDS_VERSION. */
async function ensureProjectFields(env, doc) {
  const fields = await ensureFields(env, doc.workspace);
  if (doc.fields_version === FIELDS_VERSION) return fields;
  const settings = await asana(env, `/projects/${doc.project_gid}/custom_field_settings?opt_fields=custom_field.gid`);
  const on = new Set((settings || []).map(x => x.custom_field?.gid));
  for (const k of Object.keys(FIELD_NAMES)) {
    if (fields[k] && !on.has(fields[k])) await asana(env, `/projects/${doc.project_gid}/addCustomFieldSetting`, { method: 'POST', body: { custom_field: fields[k], is_important: !['keep_reason', 'check_again'].includes(k) } });
  }
  doc.fields_version = FIELDS_VERSION;
  return fields;
}

/** Find the brand's Asana project by name and add the four fields to it. */
async function connect(env, act, projectGid) {
  act = await resolveBrandId(env, act);
  const acct = await env.DB.prepare(`SELECT act_id, name FROM brand_accounts WHERE act_id = ?1`).bind(act).first();
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
  const prev = (await getDoc(env, act, 'asana')) || {};
  const doc = { ...prev, project_gid: project.gid, project_name: project.name, url: project.permalink_url, workspace: ws.gid, connected_at: prev.connected_at || new Date().toISOString(), as: me.name, fields_version: prev.project_gid === project.gid ? prev.fields_version : null, hook_gid: prev.project_gid === project.gid ? prev.hook_gid : null };
  await ensureProjectFields(env, doc);
  await putDoc(env, act, 'asana', doc);
  /* The registry mirror is retired: the brand's asana connection is written here. */
  await addConnection(env, act, { kind: 'asana', external_id: project.gid, label: project.name, is_primary: 1, config: project.permalink_url ? { url: project.permalink_url } : {} }).catch(() => {});
  return doc;
}

/* ---------------- 1. SYNC ---------------- */
const TASK_FIELDS = 'name,notes,completed,completed_at,created_at,modified_at,permalink_url,assignee.gid,assignee.name,memberships.project.gid,memberships.section.name,custom_fields.gid,custom_fields.name,custom_fields.display_value,custom_fields.text_value,custom_fields.enum_value.gid,custom_fields.date_value';
/* The brief, in the framework's shape. Dropped into a brand-new task in Creative Brief
   that has nothing written yet, so nobody has to find the template. The same layout
   lives in each project's Asana task templates ("Static Ad Template", "UGC/Video
   Template"); Asana's API cannot write those, so they are set by hand. Keep the two in step.
   Cole, 2026-09-30: as simple as possible. Testing and concept are ONE line ("3 headlines
   on 412-3" names the winner), the numbered lines under it are the ads. The only grey
   text is the examples line, alone on its line so one triple-click deletes it. No Frame.io,
   no crop line, no subtasks. Ideas bot's briefHtml (ideas.js) uses the same layout. */
const BRIEF_TEST = eg => `<h2>The test</h2><strong>Angle:</strong>
<strong>Why:</strong>
<strong>What we're testing:</strong>
<em>What changes, and on which ad. Like: ${eg}</em>
<strong>1.</strong>
<strong>2.</strong>
<strong>3.</strong>`;
const BRIEF_COPY = `<h2>Copy</h2><strong>Headline:</strong>
<strong>Primary text:</strong>
<strong>Offer:</strong>
<strong>Landing page:</strong>
<strong>Inspo:</strong> `;
const BRIEF_STATIC = `<body>${BRIEF_TEST('3 new concepts · 3 headlines on 412-3 · 2 redesigns of 412-3 · 3 reviews on 388-1')}
${BRIEF_COPY}</body>`;
const BRIEF_VIDEO = `<body>${BRIEF_TEST('3 new concepts · 3 hooks on 290-1 · 2 creators on 290-1 · 2 edits of 290-1')}
<h2>Video</h2><strong>Creator:</strong>
<strong>Script:</strong>
${BRIEF_COPY}</body>`;
const briefFor = name => /\b(ugc|video|vid|reel|creator)\b/i.test(name || '') ? BRIEF_VIDEO : BRIEF_STATIC;
const sectionOf = (t, doc) => t.memberships?.find(m => m.project?.gid === doc.project_gid)?.section?.name || '';

async function syncTasks(env, act, doc, { full = false } = {}) {
  const since = !full && doc.last_sync ? `&modified_since=${encodeURIComponent(doc.last_sync)}` : '';
  const started = new Date().toISOString();
  const tasks = await asanaAll(env, `/tasks?project=${doc.project_gid}&opt_fields=${TASK_FIELDS}${since}`);
  const fields = (await ensureProjectFields(env, doc).catch(() => null)) || (await getSetting(env, 'brandAsanaFields')) || {};
  const existing = (await env.DB.prepare(`SELECT id, num, verdict, stage, asana_gid, asana_angle FROM p_br_batch WHERE act_id = ?1`).bind(act).all()).results || [];
  let nextFree = Math.max(0, ...existing.map(b => parseInt(b.num, 10) || 0), ...tasks.map(t => +numOf(t.name) || 0)) + 1;

  /* AUTO-NUMBER: a task in a creative section with no number gets the next one. */
  const numbered = [];
  for (const t of tasks) {
    if (t.completed || numOf(t.name) || !stageOf(sectionOf(t, doc))) continue;
    const base = String(t.name || '').trim();
    if (!base || /^\u{1F4CC}/u.test(base)) continue;
    const name = `${nextFree} - ${base}`;
    try { await asana(env, `/tasks/${t.gid}`, { method: 'PUT', body: { name } }); t.name = name; numbered.push(nextFree); nextFree++; } catch { /* next hour */ }
  }
  /* A brand-new brief with nothing written gets the template. Once per task. */
  const templated = new Set(doc.templated || []);
  for (const t of tasks) {
    if (t.completed || templated.has(t.gid) || stageOf(sectionOf(t, doc)) !== 'idea') continue;
    if (String(t.notes || '').trim().length > 3 || Date.now() - Date.parse(t.created_at || 0) > 3 * 864e5) continue;
    try { await asana(env, `/tasks/${t.gid}`, { method: 'PUT', body: { html_notes: briefFor(t.name) } }); templated.add(t.gid); } catch { /* next hour */ }
  }
  doc.templated = [...templated].slice(-300);

  /* One test per number. When a number has two tasks, the open one wins, then the newest. */
  const byNum = new Map();
  const allByNum = new Map();
  for (const t of tasks) {
    const n = numOf(t.name);
    if (!n) continue;
    (allByNum.get(n) || allByNum.set(n, []).get(n)).push(t);
    const cur = byNum.get(n);
    if (!cur || (cur.completed && !t.completed) || (cur.completed === t.completed && t.modified_at > cur.modified_at)) byNum.set(n, t);
  }
  /* SAFETY: two open tasks with one number would merge two tests. Tell the newer one, once. */
  const warnedDup = new Set(doc.dup_warned || []);
  for (const [n, list] of allByNum) {
    const open = list.filter(t => !t.completed).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (open.length < 2) continue;
    for (const t of open.slice(1)) {
      if (warnedDup.has(t.gid)) continue;
      await asana(env, `/tasks/${t.gid}/stories`, { method: 'POST', body: { text: `Locus: another open task already uses the number ${n} ("${clip(open[0].name, 80)}"). Two tasks with one number get merged into one test. Rename this one to start with ${nextFree}, and name its ads ${nextFree}-1, ${nextFree}-2...` } }).catch(() => {});
      warnedDup.add(t.gid); nextFree++;
    }
  }
  doc.dup_warned = [...warnedDup].slice(-300);

  /* A person can correct the Angle field in Asana. Asana wins: Locus follows it. */
  const angleRows = (await env.DB.prepare(`SELECT id, name FROM p_br_angle WHERE act_id = ?1`).bind(act).all()).results || [];
  const angleByName = new Map(angleRows.map(a => [a.name.trim().toLowerCase(), a.id]));
  let angleFixes = 0;
  const have = new Map(existing.map(b => [String(parseInt(b.num, 10)), b]));
  const st = [];
  let created = 0, updated = 0, closed = 0;
  for (const [n, t] of byNum) {
    const section = sectionOf(t, doc);
    let stage = t.completed ? 'done' : stageOf(section);
    if (!stage) continue;
    const cf = Object.fromEntries((t.custom_fields || []).map(f => [f.gid, f]));
    const status = (t.custom_fields || []).find(f => /concept status/i.test(f.name || ''))?.display_value;
    if (/results recorded/i.test(status || '') || /cancel/i.test(status || '')) stage = 'done';
    const brief = (/https?:\/\/docs\.google\.com\/document\/[^\s)]+/.exec(t.notes || '') || [])[0] || null;
    const asset = (/https?:\/\/(?:next\.)?(?:frame\.io|f\.io)\/[^\s)]+/.exec(t.notes || '') || [])[0] || null;
    /* What the media buyer set in Asana: Winner / Keep running / Loser. Only a win or a loss is a verdict. */
    const resOpt = cf[fields.result]?.enum_value?.gid;
    const resKey = resOpt ? Object.entries(fields.result_opts || {}).find(([, g]) => g === resOpt)?.[0] || null : null;
    const verdict = resKey === 'winner' || resKey === 'loser' ? resKey : null;
    let checkAgain = cf[fields.check_again]?.date_value?.date || null;
    const keepReason = cf[fields.keep_reason]?.display_value || null;
    /* Keep running with no date: Locus sets one, 7 days out, so it cannot be forgotten. */
    if (resKey === 'keep' && !checkAgain && stage === 'live' && fields.check_again) {
      const d = addDays(today(), 7);
      await asana(env, `/tasks/${t.gid}`, { method: 'PUT', body: { custom_fields: { [fields.check_again]: { date: d } } } }).then(() => { checkAgain = d; }).catch(() => {});
    }
    const learning = cf[fields.learning]?.text_value || null;
    const cancelled = /cancel/i.test(status || '');
    const notes = clip(t.notes, 8000) || null;
    const row = have.get(n);
    const angleText = (cf[fields.angle]?.text_value || '').trim();
    if (row && angleText && angleText !== (row.asana_angle || '') && !/^no angle/i.test(angleText)) {
      let aid = angleByName.get(angleText.toLowerCase());
      if (!aid) {
        aid = rid();
        st.push(env.DB.prepare(`INSERT INTO p_br_angle (id, act_id, name, status, source, note) VALUES (?1, ?2, ?3, 'active', 'asana', 'Typed into the Angle field in Asana.')`).bind(aid, act, clip(angleText, 200)));
        angleByName.set(angleText.toLowerCase(), aid);
      }
      st.push(env.DB.prepare(`UPDATE p_br_batch SET angle_id = ?2, asana_angle = ?3, tagged_at = COALESCE(tagged_at, datetime('now')) WHERE id = ?1`).bind(row.id, aid, clip(angleText, 200)));
      angleFixes++;
    }
    const v = cancelled ? 'cancelled' : verdict;
    if (row) {
      if (stage === 'done' && v && !row.verdict) closed++;
      st.push(env.DB.prepare(`UPDATE p_br_batch SET title = ?3, stage = ?4, asana_gid = ?5, asana_url = ?6, asana_section = ?7,
          brief_url = COALESCE(?8, brief_url), asset_url = COALESCE(?9, asset_url), assignee_gid = ?10,
          verdict = CASE WHEN ?11 IS NOT NULL AND (?4 = 'done') THEN ?11 ELSE verdict END,
          verdict_by = CASE WHEN ?11 IS NOT NULL AND (?4 = 'done') THEN 'Asana' ELSE verdict_by END,
          verdict_at = CASE WHEN ?11 IS NOT NULL AND (?4 = 'done') AND verdict_at IS NULL THEN datetime('now') ELSE verdict_at END,
          learning = COALESCE(?12, learning), asana_result = ?13, check_again = ?14, keep_reason = ?15, brief_text = COALESCE(?16, brief_text),
          updated_at = datetime('now') WHERE id = ?1 AND act_id = ?2`)
        .bind(row.id, act, clip(titleOf(t.name), 300), stage, t.gid, t.permalink_url, clip(section, 80), brief, asset, t.assignee?.gid || null,
          v, learning, resKey, checkAgain, keepReason, notes));
      updated++;
    } else {
      st.push(env.DB.prepare(`INSERT INTO p_br_batch (id, act_id, num, title, stage, asana_gid, asana_url, asana_section, brief_url, asset_url, assignee_gid, verdict, verdict_by, learning, asana_result, check_again, keep_reason, brief_text, source, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, 'asana', ?19)`)
        .bind(rid(), act, n, clip(titleOf(t.name), 300), stage, t.gid, t.permalink_url, clip(section, 80), brief, asset, t.assignee?.gid || null,
          stage === 'done' ? v : null, stage === 'done' && v ? 'Asana' : null, learning, resKey, checkAgain, keepReason, notes,
          (t.created_at || '').replace('T', ' ').slice(0, 19) || null));
      created++;
    }
  }
  for (let i = 0; i < st.length; i += 80) await env.DB.batch(st.slice(i, i + 80));
  await putDoc(env, act, 'asana', { ...doc, last_sync: started });
  return { tasks: tasks.length, numbered: byNum.size, created, updated, closed, angle_fixes: angleFixes, auto_numbered: numbered };
}

/* ---------------- 2. TAG (+ 3. WARN) ---------------- */
async function adCopyFor(env, act, nums) {
  if (!nums.length) return {};
  const ads = (await env.DB.prepare(`SELECT a.ad_id, a.name, c.json FROM ads a LEFT JOIN ad_creative c ON c.ad_id = a.ad_id WHERE a.act_id IN ${metaOf(1)}`).bind(act).all().catch(() => ({ results: [] }))).results || [];
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
  const rows = (await env.DB.prepare(`SELECT id, num, title, offer, hypothesis, why, level, brief_url, brief_text, legacy_json, asana_gid, stage, created_at, source FROM p_br_batch
      WHERE act_id = ?1 AND angle_id IS NULL AND tagged_at IS NULL ORDER BY CAST(num AS INTEGER) ASC LIMIT ?2`).bind(act, limit).all()).results || [];
  if (!rows.length) return { tagged: 0, left: 0 };
  const angles = (await env.DB.prepare(`SELECT id, name, argument FROM p_br_angle WHERE act_id = ?1 AND status != 'proposed'`).bind(act).all()).results || [];
  /* 2026-10-04: the prompt never saw the existing concepts, so almost every test got a
     concept of its own (239 concepts for 279 Party Patch tests) and nothing grouped. */
  const concepts = (await env.DB.prepare(`SELECT c.angle_id, c.name, COUNT(b.id) n FROM p_br_concept c LEFT JOIN p_br_batch b ON b.concept_id = c.id
      WHERE c.act_id = ?1 GROUP BY c.id ORDER BY n DESC LIMIT 250`).bind(act).all().catch(() => ({ results: [] }))).results || [];
  const copy = await adCopyFor(env, act, rows.map(r => String(parseInt(r.num, 10))));
  const briefs = {};
  let briefErr = null;
  for (const r of rows) {
    /* The brief now lives in the task itself. Older tasks point at a Google Doc. */
    const own = String(r.brief_text || '').replace(/https?:\/\/\S+/g, '').trim();
    if (own.length > 80) { briefs[r.id] = r.brief_text; continue; }
    const id = docIdOf(r.brief_url);
    if (!id) continue;
    try { briefs[r.id] = await readDoc(env, id); } catch (e) { briefErr = e.message; }
  }
  const acct = await env.DB.prepare(`SELECT name FROM brand_accounts WHERE act_id = ?1`).bind(act).first();
  const items = rows.map(r => {
    const lg = safeJson(r.legacy_json, {});
    return `### TEST ${parseInt(r.num, 10)}: ${r.title}\n${r.offer ? `Offer: ${r.offer}\n` : ''}${r.hypothesis ? `What we tested: ${r.hypothesis}\n` : ''}${r.why ? `Why: ${r.why}\n` : ''}${Object.keys(lg).length ? `Old sheet notes: ${clip(JSON.stringify(lg), 600)}\n` : ''}${briefs[r.id] ? `BRIEF:\n${clip(briefs[r.id], 2500)}\n` : ''}${copy[String(parseInt(r.num, 10))] ? `ADS THAT RAN:\n${copy[String(parseInt(r.num, 10))].slice(0, 6).join('\n')}\n` : ''}`;
  }).join('\n');
  const { out, usage } = await claudeJson(env, {
    system: `You file ${acct?.name || 'a brand'}'s ad tests into its angle library, using the Mobius framework. Three words only:
- ANGLE = the argument: the reason to buy, said in one sentence to a specific person (the wife's reaction, bad golfer relief, fits a dad bod). Never a format, an offer, a persona or a product feature.
- CONCEPT = the idea we build to deliver the angle (a fake 1-star review, a post-it note, a lineup video). Specific enough to build.
- WHAT WE'RE TESTING = the one piece that changes.
Label each test with the 3-question test: did the reason to buy change (level "angle")? Same reason, different idea (level "concept")? Same idea, one piece changed (level "variation", which means testing inside a proven concept; put the piece in variable: headline, hook, person, edit, redesign, review, offer, copy, visual or format)?
Rules:
- Reuse an existing angle whenever the reason to buy is the same, even in different words: put its id in angle_id and leave new_angle_name empty.
- Only when no existing angle fits, leave angle_id empty and name a new angle in 2-5 plain words with a one-sentence argument. If several tests below share a new angle, give them the EXACT same new_angle_name.
- A pure discount or bundle test with no reason to buy beyond the deal: level "offer", and pick the angle only if the ad clearly argues one.
- concept: a short name for the idea. When the test is the same idea as an EXISTING CONCEPT under the same angle (a new hook, headline, person, edit or format of it), copy that concept's name EXACTLY. Only name a new concept when the idea itself is new.
- offer: the deal named in the ad or brief, empty if none. hypothesis: one line, what this test tries to learn.
Return one entry per test, keyed by its number. ${VOICE}`,
    user: `EXISTING ANGLES (id | name | argument):\n${angles.map(a => `${a.id} | ${a.name} | ${clip(a.argument, 200)}`).join('\n') || 'none yet'}\n\nEXISTING CONCEPTS (angle id | concept name | tests):\n${concepts.map(c => `${c.angle_id} | ${c.name} | ${c.n}`).join('\n') || 'none yet'}\n\nTESTS:\n${items}`,
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
      const lv = t.level === 'offer' ? 'concept' : t.level;
      if (fields.testing_opts?.[lv]) cf[fields.testing] = fields.testing_opts[lv];
      await asana(env, `/tasks/${r.asana_gid}`, { method: 'PUT', body: { custom_fields: cf } })
        .then(() => env.DB.prepare(`UPDATE p_br_batch SET asana_angle = ?2 WHERE id = ?1`).bind(r.id, cf[fields.angle]).run()).catch(() => {});
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

/* ---------------- 4. RESULTS ----------------
   CPA first, like the team judges. Then the soft metrics, against THIS account's own
   recent ads (never fixed benchmarks): CTR, hook rate, cost per add to cart, CPM.
   Locus only suggests. The media buyer sets Result in Asana. */
async function batchStats(env, act, rows) {
  const ads = (await env.DB.prepare(`SELECT ad_id, name FROM ads WHERE act_id IN ${metaOf(1)}`).bind(act).all()).results || [];
  const tags = Object.fromEntries(((await env.DB.prepare(`SELECT ad_id, batch_id FROM p_br_adtag WHERE act_id = ?1`).bind(act).all()).results || []).map(t => [t.ad_id, t.batch_id]));
  const want = new Map(rows.map(x => [String(parseInt(x.num, 10)), x.id]));
  const ids = new Set(rows.map(x => x.id));
  const byBatch = {};
  for (const a of ads) {
    const n = numOf(a.name);
    const bid = tags[a.ad_id] || (n && want.get(n));
    if (bid && ids.has(bid)) (byBatch[bid] ||= []).push(a.ad_id);
  }
  const out = {};
  for (const [bid, list] of Object.entries(byBatch)) {
    const q = list.map((_, i) => `?${i + 2}`).join(',');
    const s = await env.DB.prepare(`SELECT SUM(spend) spend, SUM(impressions) impr, SUM(link_clicks) clicks, SUM(video_3s) v3, SUM(video_thruplay) thru,
        SUM(add_to_cart) atc, MIN(CASE WHEN spend > 0 THEN date END) first FROM ad_daily WHERE act_id IN ${metaOf(1)} AND ad_id IN (${q})`).bind(act, ...list).first();
    const t = await env.DB.prepare(`SELECT SUM(revenue) rev, SUM(orders) orders FROM tw_ad_attr WHERE act_id = ?1 AND model = 'lastPlatformClick' AND ad_id IN (${q})`).bind(act, ...list).first();
    out[bid] = { ads: list.length, ad_ids: list, spend: s?.spend || 0, impr: s?.impr || 0, clicks: s?.clicks || 0, v3: s?.v3 || 0, thru: s?.thru || 0, atc: s?.atc || 0, first: s?.first, rev: t?.rev || 0, orders: t?.orders || 0 };
  }
  return out;
}
/** This account's recent ads, as the yardstick for the soft metrics. */
async function benchmarks(env, act) {
  const since = addDays(today(), -90);
  const r = (await env.DB.prepare(`SELECT SUM(spend) spend, SUM(impressions) impr, SUM(link_clicks) clicks, SUM(video_3s) v3, SUM(add_to_cart) atc
      FROM ad_daily WHERE act_id IN ${metaOf(1)} AND date >= ?2 GROUP BY ad_id HAVING SUM(spend) >= 30`).bind(act, since).all()).results || [];
  const col = f => r.map(f).filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
  return {
    ctr: col(x => x.impr > 0 ? x.clicks / x.impr : null),
    hook: col(x => x.impr > 0 && x.v3 > 0 ? x.v3 / x.impr : null),
    cpm: col(x => x.impr > 0 ? (x.spend / x.impr) * 1000 : null),
    cpatc: col(x => x.atc > 0 ? x.spend / x.atc : null),
  };
}
/* Where a value sits among the account's own ads: 'top' third, 'mid' or 'low'. For costs, cheaper is better. */
function third(list, v, lowerBetter = false) {
  if (v == null || !isFinite(v) || list.length < 6) return null;
  const pct = list.filter(x => x <= v).length / list.length;
  const good = lowerBetter ? 1 - pct : pct;
  return good >= 0.67 ? 'top' : good <= 0.33 ? 'low' : 'mid';
}
/* ONE PLACE FOR GOALS (Cole, 2026-10-04: "I don't want the same KPI stuff in
   different places"). Goal CPA and ROAS live on the account row and are edited only
   in Settings -> brand -> Goals. The `rules` doc holds the test settings (judge
   after, yellow zone, test minimums) and nothing else. A doc that still carries a
   target_cpa is the old Brand info copy: it wins until unifyGoals moves it onto the
   account, because it is the number Cole set by hand on 2026-09-24.
   Same rule as rulesFor in profit/worker/src/brand.js; change both together. */
function rulesOf(acct, doc) {
  const r = { target_cpa: null, judge_spend: 150, judge_days: 7, win_roas: 2, lose_roas: 1.2, yellow_pct: 30, min_spend: 20, min_days: 7, min_cap_pct: 25, min_track: 0, monday_post: 0 };
  if (doc && +doc.target_cpa > 0) r.target_cpa = +doc.target_cpa;
  else if (acct?.target_cpa > 0) r.target_cpa = +acct.target_cpa;
  if (acct?.target_roas > 0) { r.win_roas = acct.target_roas; r.lose_roas = Math.round(acct.target_roas * 0.6 * 100) / 100; }
  for (const k of ['judge_spend', 'judge_days', 'yellow_pct', 'min_spend', 'min_days', 'min_cap_pct', 'min_track', 'monday_post']) if (doc && +doc[k] > 0) r[k] = +doc[k];
  /* TWO LINES (Cole, 2026-10-04): Winner <= goal, Keep <= the account's own average.
     The average is trailing-30-day Meta spend / Triple Whale orders, refreshed on the
     1st of each month by refreshAccountAvg, so the keep line tightens as the account improves. */
  r.acct_avg = doc && +doc.acct_avg_cpa > 0 ? +doc.acct_avg_cpa : null;
  r.acct_avg_month = doc?.acct_avg_month || null;
  if (!(doc && +doc.judge_spend > 0) && r.target_cpa) r.judge_spend = Math.round(r.target_cpa * 3);
  return r;
}
/** Moves any old Brand info target CPA onto the account (the one place), once. */
export async function unifyGoals(env) {
  const rows = (await env.DB.prepare(`SELECT d.act_id, d.data_json, a.target_cpa FROM p_br_doc d JOIN brand_accounts a ON a.act_id = d.act_id
      WHERE d.line_id = '' AND d.key = 'rules'`).all().catch(() => ({ results: [] }))).results || [];
  const moved = [];
  for (const r of rows) {
    const doc = safeJson(r.data_json, {});
    if (!('target_cpa' in doc) && !('win_roas' in doc) && !('lose_roas' in doc)) continue;
    const cpa = +doc.target_cpa > 0 ? +doc.target_cpa : null;
    delete doc.target_cpa; delete doc.win_roas; delete doc.lose_roas;
    const st = [env.DB.prepare(`UPDATE p_br_doc SET data_json = ?2, updated_at = datetime('now') WHERE act_id = ?1 AND line_id = '' AND key = 'rules'`).bind(r.act_id, JSON.stringify(doc))];
    if (cpa) st.push(env.DB.prepare(`UPDATE brands SET target_cpa = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(r.act_id, cpa));
    await env.DB.batch(st);
    moved.push({ act: r.act_id, was: r.target_cpa ?? null, now: cpa ?? r.target_cpa ?? null, at: new Date().toISOString() });
  }
  if (moved.length) await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('goalUnify', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(moved)).run().catch(() => {});
  return { moved: moved.length };
}

/* Live ad set minimums for the Brand tab's test list (2026-10-04). Read straight
   from Meta when the page opens: which test ad sets still carry a minimum spend,
   and how the total compares with each campaign's budget. Read-only. */
async function graphAll(env, path, params) {
  const url = new URL(`https://graph.facebook.com/v23.0/${path}`);
  for (const [k, v] of Object.entries({ limit: '200', ...params })) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  url.searchParams.set('access_token', env.META_TOKEN);
  const out = [];
  let next = url.toString();
  for (let i = 0; next && i < 10; i++) {
    const j = await (await F(next)).json();
    if (j.error) throw new Error(j.error.message);
    out.push(...(j.data || []));
    next = j.paging?.next;
  }
  return out;
}
async function testMinimums(env, act) {
  if (!env.META_TOKEN) return { error: 'META_TOKEN is not set' };
  act = await resolveBrandId(env, act);
  const metas = await metaActsOf(env, act);
  if (!metas.length) return { campaigns: [], adsets: [], error: 'No Meta ad account connected.' };
  const live = [{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }];
  const out = { campaigns: [], adsets: [] };
  for (const m of metas) {
    const [sets, camps] = await Promise.all([
      graphAll(env, `${m}/adsets`, { fields: 'name,campaign_id,daily_min_spend_target,created_time', filtering: live }),
      graphAll(env, `${m}/campaigns`, { fields: 'name,daily_budget', filtering: live }),
    ]);
    out.campaigns.push(...camps.filter(c => +c.daily_budget > 0).map(c => ({ id: c.id, name: c.name, budget: +c.daily_budget / 100, act: m })));
    out.adsets.push(...sets.map(a => ({ id: a.id, name: a.name, campaign_id: a.campaign_id, num: numOf(a.name), min: +(a.daily_min_spend_target || 0) / 100, created: a.created_time, act: m })));
  }
  return out;
}

/* MONDAY TEST CALLS (Cole, 2026-10-04: "this needs to be stupid simple for the media
   buyer"). One Slack message per brand, Monday 8am Central, in the brand's internal
   channel: every live test sorted into Pause / Keep / Another week / Not ready, with
   "take the minimum off" on the lines whose minimum days are up, and ONE Ads Manager
   link that opens exactly those ad sets. The buyer reads it, clicks, acts. Nothing
   else to open. Switched on per brand in Settings -> Goals (rules.monday_post). */
const centralParts = (d = new Date()) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(d).map(p => [p.type, p.value]));
export async function mondayCalls(env, act) {
  act = await resolveBrandId(env, act);
  const acct = await env.DB.prepare(`SELECT act_id, name, target_cpa, target_roas, slack_channel, meta_act FROM brand_accounts WHERE act_id = ?1`).bind(act).first();
  if (!acct) return { error: 'unknown account' };
  const rules = rulesOf(acct, await getDoc(env, act, 'rules'));
  if (!rules.target_cpa) return { error: 'Set a goal cost per sale in Settings → Goals first.' };
  const rows = (await env.DB.prepare(`SELECT id, num, title FROM p_br_batch WHERE act_id = ?1 AND stage = 'live' AND verdict IS NULL`).bind(act).all()).results || [];
  const stats = rows.length ? await batchStats(env, act, rows) : {};
  const bm = await benchmarks(env, act);
  let meta = { adsets: [], campaigns: [] };
  try { meta = await testMinimums(env, act); } catch (e) { meta.error = e.message; }
  const td = today();
  const groups = { loser: [], winner: [], avg: [], keep: [], early: [] };
  const open = new Set(), openAds = new Set();
  const plan = { pause: [], pauseAds: [], clear: [] };
  let old = 0;
  for (const r of rows) {
    const st = stats[r.id];
    if (!st || !(st.spend > 0)) continue;                            // not spending: not live in Meta
    /* Only this cycle's tests: first spend within judge_days + 14 days. Older ones are
       past tests nobody closed in Asana; judging their lifetime numbers here would
       pause ad sets that are still selling (seen on Lucky, 2026-10-04). */
    if (st.first && Math.round((Date.parse(`${td}T12:00:00Z`) - Date.parse(`${st.first}T12:00:00Z`)) / 864e5) + 1 > rules.judge_days + 14) { old++; continue; }
    const n = String(parseInt(r.num, 10));
    const sets = (meta.adsets || []).filter(a => a.num === n);
    const day = st.first ? Math.round((Date.parse(`${td}T12:00:00Z`) - Date.parse(`${st.first}T12:00:00Z`)) / 864e5) + 1 : null;
    const min = sets.reduce((t, a) => t + (a.min || 0), 0);
    const sc = scorecard(st, rules, bm);
    const j = judge(st, rules, sc);
    /* Past its days and still too little spend to judge: Meta would not spend on it.
       Theriot's rule: after 7 days without spending, it's dead. */
    const starved = !j && day && day > rules.judge_days;
    const call = j ? (j.call === 'keep' && j.reason === 'avg' ? 'avg' : j.call) : starved ? 'loser' : 'early';
    const minOff = min > 0 && call !== 'loser' && (call !== 'early' || (day && day > rules.min_days));   // a paused test needs no minimum change
    const name = sets[0]?.name || `${n} | ${r.title}`;
    const nums = `${money(st.spend)} spent, ${st.orders || 0} sale${st.orders === 1 ? '' : 's'}${st.orders ? ` (${money(st.spend / st.orders)} each)` : ''}`;
    const line = call === 'early' ? `• ${name}: day ${day || '?'} of ${rules.judge_days}, ${money(st.spend)} spent`
      : starved ? `• ${name}: Meta wouldn't spend on it (${money(st.spend)} in ${day} days)` : `• ${name}: ${nums}`;
    groups[call].push(line + (minOff ? ` · *take the ${money(min)} minimum off*` : ''));
    if (call === 'loser' || minOff) { sets.forEach(a => open.add(`${a.act}|${a.id}`)); if (!sets.length) (st.ad_ids || []).forEach(id => openAds.add(id)); }
    if (call === 'loser') { if (sets.length) plan.pause.push(...sets.map(a => a.id)); else plan.pauseAds.push(...(st.ad_ids || [])); }
    else if (minOff) plan.clear.push(...sets.filter(a => a.min > 0).map(a => a.id));
  }
  const L = [];
  const keepLine = rules.acct_avg ? `${money(rules.acct_avg)} account average${rules.acct_avg_month ? ` (${rules.acct_avg_month})` : ''}` : `${money(rules.target_cpa * (1 + rules.yellow_pct / 100))}`;
  const head = `*${acct.name} · this week's test calls*\nWinner: ${money(rules.target_cpa)} or less per sale · Keep: up to ${keepLine} · both need 2+ sales`;
  if (groups.loser.length) L.push(':red_circle: *Pause*', ...groups.loser);
  if (groups.winner.length) L.push(':trophy: *Winner: keep it and make variations*', ...groups.winner);
  if (groups.avg.length) L.push(':large_green_circle: *Keep*', ...groups.avg);
  if (groups.keep.length) L.push(':large_yellow_circle: *Another week* (strong clicks and add to carts)', ...groups.keep);
  if (groups.early.length) L.push(':white_circle: *Not ready yet*', ...groups.early);
  if (!L.length) L.push('No tests from the last 3 weeks are running.');
  if (old) L.push(`_${old} older test${old === 1 ? ' is' : 's are'} still open in Asana. Mark ${old === 1 ? 'it' : 'them'} done there to tidy up; this list leaves ${old === 1 ? 'it' : 'them'} alone._`);
  if (rules.min_track) for (const c of meta.campaigns || []) {
    const total = (meta.adsets || []).filter(a => a.campaign_id === c.id).reduce((t, a) => t + (a.min || 0), 0);
    const cap = c.budget * rules.min_cap_pct / 100;
    if (total > cap) L.push(`:warning: ${c.name}: minimums are ${money(total)}/day, over the ${money(cap)} cap (${rules.min_cap_pct}% of ${money(c.budget)}). Take minimums off, or raise the budget to ${money(Math.ceil(total / (rules.min_cap_pct / 100) / 10) * 10)}/day.`);
  }
  if (meta.error) L.push(`_(Couldn't read minimums from Meta: ${meta.error})_`);
  /* Ads Manager opens one ad account per link: one link per Meta account that has something to change. */
  const byAct = new Map();
  for (const k of open) { const [m, id] = k.split('|'); (byAct.get(m) || byAct.set(m, []).get(m)).push(id); }
  const linkWord = n => n > 1 ? ' (one link per ad account)' : '';
  if (byAct.size) for (const [m, ids] of byAct) L.push(`<https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${amId(m)}&selected_adset_ids=${ids.slice(0, 50).join(',')}|Open the ones to change in Ads Manager${linkWord(byAct.size)}>`);
  else if (openAds.size) {
    const list = [...openAds].slice(0, 50);
    const where = ((await env.DB.prepare(`SELECT ad_id, act_id FROM ads WHERE ad_id IN (${list.map((_, i) => `?${i + 1}`).join(',')})`).bind(...list).all().catch(() => ({ results: [] }))).results || []);
    const adAct = new Map();
    for (const id of list) { const m = where.find(w => w.ad_id === id)?.act_id || acct.meta_act; if (m) (adAct.get(m) || adAct.set(m, []).get(m)).push(id); }
    for (const [m, ids] of adAct) L.push(`<https://adsmanager.facebook.com/adsmanager/manage/ads?act=${amId(m)}&selected_ad_ids=${ids.join(',')}|Open the ones to change in Ads Manager${linkWord(adAct.size)}>`);
  }
  /* Can Locus change this brand's ad accounts? The token's own tasks on each (MANAGE / ADVERTISE). */
  let canEdit = false, scopes = null;
  try {
    const metas = await metaActsOf(env, act);
    canEdit = metas.length > 0;
    for (const m of metas) {
      const u = await (await F(`https://graph.facebook.com/v23.0/${m}?fields=user_tasks&access_token=${encodeURIComponent(env.META_TOKEN)}`)).json();
      canEdit = canEdit && (u.user_tasks || []).some(t => t === 'MANAGE' || t === 'ADVERTISE');
    }
    /* The role is not enough: the token itself must carry ads_management. */
    const perms = await (await F(`https://graph.facebook.com/v23.0/me/permissions?access_token=${encodeURIComponent(env.META_TOKEN)}`)).json();
    if (Array.isArray(perms.data)) { scopes = perms.data.filter(x => x.status === 'granted').map(x => x.permission); canEdit = canEdit && scopes.includes('ads_management'); }
  } catch {}
  const todo = plan.pause.length + plan.pauseAds.length + plan.clear.length;
  if (todo && !canEdit) L.push('_Locus can only read this ad account, so the changes are yours to make. For a Do it button the Mobius Tools system user needs "Manage campaigns" on it, with a token that includes ads_management._');
  return { text: [head, ...L].join('\n'), channel: acct.slack_channel, counts: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), on: !!rules.monday_post, plan, canEdit, todo, scopes };
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function doLabel(plan) {
  const p = plan.pause.length + plan.pauseAds.length, c = plan.clear.length;
  return ['Do it:', p ? `pause ${plural(p, plan.pause.length ? 'ad set' : 'ad')}` : '', p && c ? '+' : '', c ? `take ${plural(c, 'minimum')} off` : ''].filter(Boolean).join(' ');
}
/* Slack section text tops out at 3000 characters: split on lines. */
function sections(text) {
  const out = []; let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > 2900) { out.push(cur); cur = line; } else cur = cur ? cur + '\n' + line : line;
  }
  if (cur) out.push(cur);
  return out.map(t => ({ type: 'section', text: { type: 'mrkdwn', text: t } }));
}
/** The Do it button: makes exactly the changes the message listed, nothing re-judged. */
export async function runMondayPlan(env, payload) {
  const tap = (payload.actions || []).find(a => a.action_id === 'tests_do');
  const v = safeJson(tap?.value, {});
  v.a = await resolveBrandId(env, v.a);   // a button posted before the switch carries the old act_ id
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(`mondayPlan:${v.a}:${v.w}`).first().catch(() => null);
  const plan = safeJson(row?.value, null);
  const say = body => payload.response_url ? F(payload.response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {}) : null;
  if (!plan) return say({ response_type: 'ephemeral', replace_original: false, text: 'That list is out of date. Next Monday brings a fresh one.' });
  if (plan.done) return say({ response_type: 'ephemeral', replace_original: false, text: `Already done by ${plan.done}.` });
  const post = async (id, params) => {
    const body = new URLSearchParams({ ...params, access_token: env.META_TOKEN });
    const j = await (await F(`https://graph.facebook.com/v23.0/${id}`, { method: 'POST', body })).json();
    if (j.error) throw new Error(j.error.error_user_msg || j.error.message);
  };
  const ok = { paused: 0, cleared: 0 }, bad = [];
  for (const id of [...plan.pause, ...plan.pauseAds]) { try { await post(id, { status: 'PAUSED' }); ok.paused++; } catch (e) { bad.push(`pause ${id}: ${e.message}`); } }
  for (const id of plan.clear) { try { await post(id, { daily_min_spend_target: '0' }); ok.cleared++; } catch (e) { bad.push(`minimum ${id}: ${e.message}`); } }
  const who = payload.user?.id ? `<@${payload.user.id}>` : 'someone';
  plan.done = who;
  await env.DB.prepare(`UPDATE settings SET value = ?2 WHERE key = ?1`).bind(`mondayPlan:${v.a}:${v.w}`, JSON.stringify(plan)).run().catch(() => {});
  const result = `${bad.length ? ':warning:' : ':white_check_mark:'} Done by ${who}: ${plural(ok.paused, 'pause')}, ${plural(ok.cleared, 'minimum')} taken off.${bad.length ? `\nDidn't work:\n• ${bad.join('\n• ')}` : ''}`;
  return say({ replace_original: true, text: `${plan.text}\n${result}`, blocks: [...sections(plan.text), { type: 'context', elements: [{ type: 'mrkdwn', text: result }] }] });
}
export async function postMonday(env, act) {
  const m = await mondayCalls(env, act);
  if (m.error) return m;
  if (!m.channel || !env.SLACK_BOT_TOKEN) return { ...m, error: 'This brand has no internal Slack channel (Settings).' };
  const p = centralParts();
  const w = `${p.year}-${p.month}-${p.day}`;
  const blocks = sections(m.text);
  if (m.todo && m.canEdit) {
    await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .bind(`mondayPlan:${act}:${w}`, JSON.stringify({ ...m.plan, text: m.text })).run();
    blocks.push({ type: 'actions', elements: [{ type: 'button', action_id: 'tests_do', style: 'primary', text: { type: 'plain_text', text: doLabel(m.plan) },
      value: JSON.stringify({ a: act, w }),
      confirm: { title: { type: 'plain_text', text: 'Make these changes?' }, text: { type: 'mrkdwn', text: `${doLabel(m.plan).replace('Do it: ', '')} in Meta, exactly as listed. Keep and not-ready tests are not touched.` },
        confirm: { type: 'plain_text', text: 'Do it' }, deny: { type: 'plain_text', text: 'Cancel' } } }] });
  }
  const r = await (await F('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: m.channel, text: m.text, blocks, unfurl_links: false, unfurl_media: false }) })).json();
  return { ...m, posted: !!r.ok, error: r.ok ? undefined : r.error };
}
/** The account's own cost per sale: last 30 days of Meta spend / Triple Whale
 *  orders (last platform click). Stored in the brand's rules doc once a month. */
export async function accountAvg(env, act) {
  const since = addDays(today(), -30);
  const s = await env.DB.prepare(`SELECT SUM(spend) spend FROM ad_daily WHERE act_id IN ${metaOf(1)} AND date >= ?2`).bind(act, since).first();
  const o = await env.DB.prepare(`SELECT SUM(orders) orders FROM tw_ad_attr WHERE act_id = ?1 AND model = 'lastPlatformClick' AND date >= ?2`).bind(act, since).first();
  return s?.spend > 0 && o?.orders > 0 ? Math.round((s.spend / o.orders) * 100) / 100 : null;
}
/** Hourly: on the 1st of the month (or when a brand has none yet), set each brand's account average. */
export async function refreshAccountAvg(env, { force = false } = {}) {
  const p = centralParts();
  const month = `${p.year}-${p.month}`;
  const rows = (await env.DB.prepare(`SELECT a.act_id, d.data_json FROM brand_accounts a LEFT JOIN p_br_doc d ON d.act_id = a.act_id AND d.line_id = '' AND d.key = 'rules'
      WHERE a.active = 1 AND a.target_cpa > 0`).all().catch(() => ({ results: [] }))).results || [];
  const out = {};
  for (const r of rows) {
    const doc = safeJson(r.data_json, {});
    if (!force && doc.acct_avg_month === month) continue;
    const avg = await accountAvg(env, r.act_id);
    if (!avg) continue;
    await putDoc(env, r.act_id, 'rules', { ...doc, acct_avg_cpa: avg, acct_avg_month: month });
    out[r.act_id] = avg;
  }
  return out;
}

/** Hourly: Mondays at 8am Central, once per brand per week. */
export async function mondayTick(env) {
  const p = centralParts();
  if (p.weekday !== 'Mon' || +p.hour !== 8) return { skipped: 'not Monday 8am' };
  const week = `${p.year}-${p.month}-${p.day}`;
  const docs = (await env.DB.prepare(`SELECT act_id, data_json FROM p_br_doc WHERE line_id = '' AND key = 'rules'`).all().catch(() => ({ results: [] }))).results || [];
  const out = {};
  for (const d of docs) {
    if (!(+safeJson(d.data_json, {}).monday_post > 0)) continue;
    const key = `mondayCalls:${d.act_id}`;
    const last = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
    if (last?.value === week) continue;
    const r = await postMonday(env, d.act_id).catch(e => ({ error: e.message }));
    if (r.posted) await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, week).run();
    out[d.act_id] = r.posted ? 'posted' : (r.error || 'not posted');
  }
  return out;
}

function scorecard(st, rules, bm) {
  const cpa = st.orders > 0 ? st.spend / st.orders : null;
  return {
    cpa, roas: st.spend > 0 ? st.rev / st.spend : 0,
    ctr: st.impr > 0 ? st.clicks / st.impr : null, hook: st.impr > 0 && st.v3 > 0 ? st.v3 / st.impr : null,
    cpm: st.impr > 0 ? (st.spend / st.impr) * 1000 : null, cpatc: st.atc > 0 ? st.spend / st.atc : null,
    r_ctr: third(bm.ctr, st.impr > 0 ? st.clicks / st.impr : null), r_hook: third(bm.hook, st.impr > 0 && st.v3 > 0 ? st.v3 / st.impr : null),
    r_cpm: third(bm.cpm, st.impr > 0 ? (st.spend / st.impr) * 1000 : null, true), r_cpatc: third(bm.cpatc, st.atc > 0 ? st.spend / st.atc : null, true),
  };
}
/** The suggested call and the reason, or null while the test has not spent enough. */
function judge(st, r, sc) {
  if (!st || !(st.spend > 0)) return null;
  const age = st.first ? Math.round((Date.parse(`${today()}T12:00:00Z`) - Date.parse(`${st.first}T12:00:00Z`)) / 864e5) : 0;
  if (!(st.spend >= r.judge_spend || (age >= r.judge_days && st.spend >= r.judge_spend / 3))) return null;
  const strong = [sc.r_ctr, sc.r_hook, sc.r_cpatc].filter(x => x === 'top').length;
  if (r.target_cpa) {
    const T = r.target_cpa;
    const two = (st.orders || 0) >= 2;
    const K = r.acct_avg || T * (1 + r.yellow_pct / 100);                // keep line; old yellow zone only until the first average exists
    if (two && sc.cpa != null && sc.cpa <= T) return { call: 'winner', read: `CPA ${money(sc.cpa)} on ${st.orders} sales is at or under the ${money(T)} goal. Make variations of it.` };
    if (strong >= 2 && (sc.cpa == null || sc.cpa <= T * 2)) return { call: 'keep', reason: 'tof', read: `CPA is ${sc.cpa ? money(sc.cpa) : 'not there yet'} against a ${money(T)} target, but people are clicking, watching and adding to cart. Looks like a top of funnel ad doing its job.` };
    if (two && sc.cpa != null && sc.cpa <= K) return { call: 'keep', reason: 'avg', read: `CPA ${money(sc.cpa)} on ${st.orders} sales is at or under the account average (${money(K)}). It doesn't make the account worse; leave it running.` };
    return { call: 'loser', read: sc.cpa == null ? `No sales on ${money(st.spend)}, and the clicks and add to carts are not strong enough to carry it.` : `CPA ${money(sc.cpa)} is well above the ${money(T)} target.` };
  }
  if (sc.roas >= r.win_roas) return { call: 'winner', read: `ROAS ${sc.roas.toFixed(2)} is at or above the ${r.win_roas} target.` };
  if (strong >= 2) return { call: 'keep', reason: 'tof', read: 'ROAS is under target, but the soft metrics are strong. Looks like a top of funnel ad doing its job.' };
  if (sc.roas >= r.lose_roas) return { call: 'keep', reason: 'data', read: `ROAS ${sc.roas.toFixed(2)} is between the loss line and the target. Worth more spend.` };
  return { call: 'loser', read: `ROAS ${sc.roas.toFixed(2)} is under the ${r.lose_roas} loss line.` };
}
const pct = x => x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`;
const esc = x => String(x ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/* A brand needs a target CPA before Locus suggests calls: the whole judgement starts
   from it. `quiet` posts without @mentioning anyone (a new brand's backlog catch-up,
   so nobody gets twenty notifications at once). */
/* `rejudge` (2026-10-04): re-posts ONLY tests whose earlier call no longer matches the
   numbers (the goal CPA changed after the call, e.g. Lucky $30 -> $52, so a $44 test
   sat as "Loser" with a learning saying it did not sell). It overwrites the learning. */
async function resultsPass(env, act, { limit = 8, quiet = false, rejudge = false } = {}) {
  const acct = await env.DB.prepare(`SELECT act_id, name, target_cpa, target_roas, meta_act FROM brand_accounts WHERE act_id = ?1`).bind(act).first();
  const rules = rulesOf(acct, await getDoc(env, act, 'rules'));
  if (!rules.target_cpa) return { posted: 0, skipped: 'Set a goal cost per sale in Settings → this brand → Goals to switch on result calls.' };
  const rows = (await env.DB.prepare(`SELECT b.id, b.num, b.title, b.asana_gid, b.assignee_gid, b.result_posted, b.asana_result, b.check_again, b.hypothesis, b.offer, a.name AS angle
      FROM p_br_batch b LEFT JOIN p_br_angle a ON a.id = b.angle_id
      WHERE b.act_id = ?1 AND b.asana_gid IS NOT NULL AND b.stage = 'live' AND b.verdict IS NULL`).bind(act).all()).results || [];
  if (!rows.length) return { posted: 0 };
  const stats = await batchStats(env, act, rows);
  const bm = await benchmarks(env, act);
  const fields = await getSetting(env, 'brandAsanaFields') || {};
  const L = { winner: 'Winner', keep: 'Keep running', loser: 'Loser' };
  const KR = Object.fromEntries(KEEP_OPTS.map(([k, l]) => [k, l]));
  const td = today();
  let posted = 0;
  for (const r of rows) {
    if (posted >= limit) break;
    const recheck = r.asana_result === 'keep' && r.check_again && r.check_again <= td;
    if (rejudge) {
      if (recheck || !r.result_posted || !['winner', 'loser'].includes(r.asana_result)) continue;
    } else {
      if (r.asana_result === 'keep' && !recheck) continue;           // waiting for its check-again date
      if (r.result_posted && !recheck) continue;                      // already suggested; the buyer has it
    }
    if (recheck && r.result_posted === `recheck:${r.check_again}`) continue;
    const st = stats[r.id];
    const sc = st ? scorecard(st, rules, bm) : null;
    let j = sc ? judge(st, rules, sc) : null;
    if (!j && !recheck) continue;                                   // not enough spend yet
    if (rejudge && j.call === r.asana_result) continue;             // the earlier call still stands
    if (!j) j = { call: 'keep', reason: 'data', read: `Still only ${money(st?.spend || 0)} spent. Not enough to judge.` };
    let learning = '';
    if (j.call !== 'keep' || rejudge) {
      const { out } = await claudeJson(env, {
        system: `Write ONE line (under 25 words) a media buyer would log as the learning from this ad test: what it tells the next strategist. Base it only on the numbers and the test description. ${VOICE}`,
        user: `Test ${parseInt(r.num, 10)}: ${r.title}\nAngle: ${r.angle || 'none'}\nWhat it tested: ${r.hypothesis || 'not written'}\nOffer: ${r.offer || 'none'}\nResult: ${money(st.spend)} spent, ${st.orders} orders${sc.cpa ? `, CPA ${money(sc.cpa)}` : ''}, ROAS ${sc.roas.toFixed(2)}, CTR ${pct(sc.ctr)}, hook ${pct(sc.hook)}, ${st.atc} add to carts. ${j.read} Call: ${L[j.call]}.`,
        schema: LEARN_SCHEMA, effort: 'low', maxTokens: 3000,
      }).catch(() => ({ out: null }));
      learning = clip(out?.learning, 300);
    }
    const nextCheck = addDays(td, 7);
    const cf = {};
    if (fields.result_opts?.[j.call]) cf[fields.result] = fields.result_opts[j.call];
    if (learning && fields.learning) cf[fields.learning] = learning;
    if (j.call === 'keep') {
      if (fields.keep_reason_opts?.[j.reason]) cf[fields.keep_reason] = fields.keep_reason_opts[j.reason];
      if (fields.check_again) cf[fields.check_again] = { date: nextCheck };
    }
    const amAct = (st?.ad_ids?.length && (await env.DB.prepare(`SELECT act_id FROM ads WHERE ad_id = ?1`).bind(st.ad_ids[0]).first().catch(() => null))?.act_id) || acct.meta_act;
    const am = `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${amId(amAct)}&selected_ad_ids=${(st?.ad_ids || []).slice(0, 30).join(',')}`;
    /* A list, not a paragraph: the call on top, one metric per line with a mark the
       eye can scan (✅ good, ➖ average, ⚠️ weak, ❌ over target), then what to do. */
    const MARK = { top: '✅', mid: '➖', low: '⚠️' };
    const WORD = { top: 'top third for this brand', mid: 'average for this brand', low: 'bottom third for this brand' };
    const li = (mark, label, v, note) => `<li>${mark} <strong>${label}:</strong> ${v}${note ? ` · ${note}` : ''}</li>`;
    const T = rules.target_cpa;
    const cpaMark = !sc?.cpa ? '❌' : sc.cpa <= T ? '✅' : sc.cpa <= (rules.acct_avg || T * (1 + rules.yellow_pct / 100)) ? '⚠️' : '❌';
    const CALL = { winner: '✅ Suggested: Winner', keep: '⏳ Suggested: Keep running', loser: '❌ Suggested: Loser' };
    try {
      if (Object.keys(cf).length) await asana(env, `/tasks/${r.asana_gid}`, { method: 'PUT', body: { custom_fields: cf } });
      const who = r.assignee_gid && !quiet ? `<a data-asana-gid="${r.assignee_gid}"/> ` : '';
      const rows = [
        li(cpaMark, 'Cost per sale', sc?.cpa ? money(sc.cpa) : 'no sales yet', T ? `target ${money(T)}` : ''),
        li('💵', 'Spent', `${money(st?.spend || 0)} · ${st?.orders || 0} order${st?.orders === 1 ? '' : 's'} · ROAS ${sc ? sc.roas.toFixed(2) : '0.00'}`, `${st?.ads || 0} ad${st?.ads === 1 ? '' : 's'}`),
        sc ? li(MARK[sc.r_ctr] || '➖', 'Click rate', pct(sc.ctr), WORD[sc.r_ctr]) : '',
        sc && sc.hook != null ? li(MARK[sc.r_hook] || '➖', 'Hook rate', pct(sc.hook), WORD[sc.r_hook]) : '',
        sc ? li(MARK[sc.r_cpatc] || (st.atc ? '➖' : '⚠️'), 'Add to carts', `${st.atc}${sc.cpatc ? ` at ${money(sc.cpatc)} each` : ''}`, WORD[sc.r_cpatc]) : '',
        sc ? li(MARK[sc.r_cpm] || '➖', 'CPM', sc.cpm ? money(sc.cpm) : 'n/a', WORD[sc.r_cpm]) : '',
      ].filter(Boolean).join('');
      const next = j.call === 'keep'
        ? `Agree? Leave it, Locus checks back on ${nextCheck}. Disagree? Change Result above.`
        : 'Agree? Move this task to Completed. Disagree? Change Result or Learning above first.';
      const html = `<body>${who}<strong>Test ${parseInt(r.num, 10)} ${rejudge ? `updated call (was ${L[r.asana_result]}; the goal or the numbers changed since)` : recheck ? 'check-in' : 'scorecard'}</strong>
<strong>${CALL[j.call]}</strong>${j.call === 'keep' ? ` (${KR[j.reason]})` : ''}
<ul>${rows}</ul><strong>Why:</strong> ${esc(j.read)}${learning ? `
<strong>Learning:</strong> ${esc(learning)}` : ''}
<a href="${am}">Open these ads in Ads Manager</a>
<strong>Your move:</strong> ${next}
<em>Sales: Triple Whale. Delivery: Meta.</em></body>`;
      await asana(env, `/tasks/${r.asana_gid}/stories`, { method: 'POST', body: { html_text: html } });
      await env.DB.prepare(`UPDATE p_br_batch SET result_posted = ?2, asana_result = ?3, check_again = ?4, learning = CASE WHEN ?6 = 1 AND ?5 != '' THEN ?5 ELSE COALESCE(learning, NULLIF(?5, '')) END, updated_at = datetime('now') WHERE id = ?1`)
        .bind(r.id, recheck ? `recheck:${r.check_again}` : j.call, j.call, j.call === 'keep' ? nextCheck : r.check_again, learning, rejudge ? 1 : 0).run();
      posted++;
    } catch (e) { /* one bad task must not stop the rest */ }
  }
  return { posted, waiting: rows.length };
}

/* ---------------- angle tidy-up ----------------
   Filing tests one batch at a time grows near-duplicates: "Gift for golf dad" and
   "Gift for your golfer man" are one reason to buy. This merges them, keeping the
   angle with the most tests, and renames the Angle field on open Asana tasks. */
async function refreshAngleNames(env, act) {
  const fields = await getSetting(env, 'brandAsanaFields') || {};
  if (!fields.angle) return 0;
  const rows = (await env.DB.prepare(`SELECT b.id, b.asana_gid, a.name FROM p_br_batch b JOIN p_br_angle a ON a.id = b.angle_id
      WHERE b.act_id = ?1 AND b.asana_gid IS NOT NULL AND b.stage != 'done' AND (b.asana_angle IS NULL OR b.asana_angle != a.name)`).bind(act).all()).results || [];
  let n = 0;
  for (const r of rows.slice(0, 80)) {
    try {
      await asana(env, `/tasks/${r.asana_gid}`, { method: 'PUT', body: { custom_fields: { [fields.angle]: r.name } } });
      await env.DB.prepare(`UPDATE p_br_batch SET asana_angle = ?2 WHERE id = ?1`).bind(r.id, r.name).run(); n++;
    } catch { /* next time */ }
  }
  return n;
}
const TIDY_SCHEMA = obj({ groups: { type: 'array', items: obj({ keep_id: S, merge_ids: { type: 'array', items: S }, name: S, argument: S }) } });
async function tidyAngles(env, act) {
  const acct = await env.DB.prepare(`SELECT name FROM brand_accounts WHERE act_id = ?1`).bind(act).first();
  const angles = (await env.DB.prepare(`SELECT a.id, a.name, a.argument, COUNT(b.id) n, GROUP_CONCAT(b.title, ' / ') titles
      FROM p_br_angle a LEFT JOIN p_br_batch b ON b.angle_id = a.id WHERE a.act_id = ?1 AND a.status != 'proposed' GROUP BY a.id ORDER BY n DESC`).bind(act).all()).results || [];
  if (angles.length < 10) return { merged: 0, angles: angles.length };
  const { out } = await claudeJson(env, {
    system: `You tidy ${acct?.name || 'a brand'}'s angle library. An angle is the REASON TO BUY, said in one sentence. Two angles are the same when they give the buyer the same reason in different words, or when one is just a narrower version of the other. Rules:
- Group only true duplicates. Different reasons to buy stay separate, even if they sound alike.
- Angles about different products that people buy for different reasons stay separate.
- In each group, keep_id is the angle with the most tests. merge_ids are the others.
- Give the kept angle a clear name in 2-5 plain words, and a one-sentence argument that covers the whole group.
- Aim for a library of roughly 10 to 18 angles. Do not force merges to hit the number.
- Only return groups that merge 2 or more angles. ${VOICE}`,
    user: `ANGLES (id | tests | name | argument | example test titles):\n${angles.map(a => `${a.id} | ${a.n} | ${a.name} | ${clip(a.argument, 200)} | ${clip(a.titles, 200)}`).join('\n')}`,
    schema: TIDY_SCHEMA, effort: 'medium',
  });
  const ids = new Set(angles.map(a => a.id));
  const used = new Set();
  let merged = 0;
  const log = [];
  for (const g of out?.groups || []) {
    if (!ids.has(g.keep_id) || used.has(g.keep_id)) continue;
    const from = (g.merge_ids || []).filter(x => ids.has(x) && x !== g.keep_id && !used.has(x));
    if (!from.length) continue;
    used.add(g.keep_id); from.forEach(x => used.add(x));
    const st = [];
    for (const f of from) {
      st.push(env.DB.prepare(`UPDATE p_br_batch SET angle_id = ?3, updated_at = datetime('now') WHERE act_id = ?1 AND angle_id = ?2`).bind(act, f, g.keep_id));
      st.push(env.DB.prepare(`UPDATE p_br_concept SET angle_id = ?3 WHERE act_id = ?1 AND angle_id = ?2`).bind(act, f, g.keep_id));
      st.push(env.DB.prepare(`DELETE FROM p_br_angle WHERE act_id = ?1 AND id = ?2`).bind(act, f));
    }
    if (g.name) st.push(env.DB.prepare(`UPDATE p_br_angle SET name = ?3, argument = COALESCE(NULLIF(?4, ''), argument), updated_at = datetime('now') WHERE act_id = ?1 AND id = ?2`).bind(act, g.keep_id, clip(g.name, 200), clip(g.argument, 3000)));
    await env.DB.batch(st);
    merged += from.length;
    log.push(`${from.map(x => angles.find(a => a.id === x)?.name).join(', ')} -> ${g.name}`);
  }
  const renamed = merged ? await refreshAngleNames(env, act) : 0;
  return { merged, before: angles.length, after: angles.length - merged, asana_updated: renamed, log };
}

/* Group concepts that are the same idea (2026-10-04). Same shape as tidyAngles: one call
   per brand, merges only inside one angle, the kept concept is the one with most tests.
   Tests move with their concept; nothing is written to Asana (it has no concept field). */
const CTIDY_SCHEMA = obj({ groups: { type: 'array', items: obj({ keep_id: S, merge_ids: { type: 'array', items: S }, name: S }) } });
async function tidyConcepts(env, act) {
  const acct = await env.DB.prepare(`SELECT name FROM brand_accounts WHERE act_id = ?1`).bind(act).first();
  const rows = (await env.DB.prepare(`SELECT c.id, c.angle_id, c.name, a.name angle, COUNT(b.id) n, GROUP_CONCAT(b.title, ' / ') titles
      FROM p_br_concept c JOIN p_br_angle a ON a.id = c.angle_id LEFT JOIN p_br_batch b ON b.concept_id = c.id
      WHERE c.act_id = ?1 GROUP BY c.id HAVING n > 0 ORDER BY a.name, n DESC`).bind(act).all()).results || [];
  if (rows.length < 4) return { merged: 0, concepts: rows.length };
  const { out } = await claudeJson(env, {
    system: `You tidy ${acct?.name || 'a brand'}'s ad concepts (Mobius framework). ANGLE = the reason to buy. CONCEPT = the idea built to deliver it (a fake 1-star review, a post-it note, a lineup video, a founder story). A VARIATION changes one piece of a concept (hook, headline, person, edit, format, offer) and belongs UNDER that concept. Rules:
- Group concepts that are the same idea under the same angle, including ones that are only a variation of another (new hooks, a static version, new headlines, a different creator saying it).
- Never group across angles. Different ideas stay separate even if they share a product.
- keep_id is the concept with the most tests. Name the kept concept in 2-6 plain words that describe the idea, not the variation.
- Only return groups that merge 2 or more concepts. ${VOICE}`,
    user: `CONCEPTS (id | angle | tests | name | test titles):\n${rows.map(c => `${c.id} | ${c.angle} | ${c.n} | ${c.name} | ${clip(c.titles, 160)}`).join('\n')}`,
    schema: CTIDY_SCHEMA, effort: 'medium', maxTokens: 24000,
  });
  const by = Object.fromEntries(rows.map(c => [c.id, c]));
  const used = new Set();
  let merged = 0;
  for (const g of out?.groups || []) {
    const keep = by[g.keep_id];
    if (!keep || used.has(keep.id)) continue;
    const from = (g.merge_ids || []).filter(x => by[x] && x !== keep.id && !used.has(x) && by[x].angle_id === keep.angle_id);
    if (!from.length) continue;
    used.add(keep.id); from.forEach(x => used.add(x));
    const st = [];
    for (const f of from) {
      st.push(env.DB.prepare(`UPDATE p_br_batch SET concept_id = ?3 WHERE act_id = ?1 AND concept_id = ?2`).bind(act, f, keep.id));
      st.push(env.DB.prepare(`DELETE FROM p_br_concept WHERE act_id = ?1 AND id = ?2`).bind(act, f));
    }
    if (g.name) st.push(env.DB.prepare(`UPDATE p_br_concept SET name = ?3 WHERE act_id = ?1 AND id = ?2`).bind(act, keep.id, clip(g.name, 200)));
    await env.DB.batch(st);
    merged += from.length;
  }
  /* Concepts left with no test are noise in the library. */
  await env.DB.prepare(`DELETE FROM p_br_concept WHERE act_id = ?1 AND id NOT IN (SELECT concept_id FROM p_br_batch WHERE act_id = ?1 AND concept_id IS NOT NULL)`).bind(act).run();
  return { merged, before: rows.length, after: rows.length - merged };
}

/* "Have we tested this?" (Angles screen, 2026-10-04). The strategist types an idea in any
   words; the model checks it against every angle AND every past test, because the same
   reason to buy often ran under different wording. Numbers are added by the screen. */
const TESTED_SCHEMA = obj({ verdict: { type: 'string', enum: ['tested', 'close', 'new'] }, angle_id: S, test_nums: { type: 'array', items: S }, reason: S, already_ran: { type: 'array', items: S } });
async function testedCheck(env, act, idea) {
  idea = clip(String(idea || '').trim(), 600);
  if (!idea) throw Object.assign(new Error('Type the idea first.'), { status: 400 });
  const acct = await env.DB.prepare(`SELECT name FROM brand_accounts WHERE act_id = ?1`).bind(act).first();
  const angles = (await env.DB.prepare(`SELECT id, name, argument FROM p_br_angle WHERE act_id = ?1 AND status != 'proposed'`).bind(act).all()).results || [];
  const tests = (await env.DB.prepare(`SELECT num, title, hypothesis, angle_id FROM p_br_batch WHERE act_id = ?1 AND angle_id IS NOT NULL ORDER BY CAST(num AS INTEGER) DESC LIMIT 400`).bind(act).all()).results || [];
  const { out } = await claudeJson(env, {
    system: `You tell ${acct?.name || 'a brand'}'s creative strategist whether an ad idea has already been tested. An ANGLE is the reason to buy; the same reason in different words IS the same angle ("1 star review from his wife" and "wife hates his old polos" are the same: the wife's reaction). Check the idea against the angles and the past tests.
- verdict "tested": the same reason to buy already ran. angle_id = that angle. test_nums = up to 6 test numbers that are closest to the idea.
- verdict "close": a related angle exists but this idea gives a genuinely different reason or a clearly new concept. angle_id = the related angle.
- verdict "new": nothing like it. angle_id empty, test_nums empty.
- reason: one plain sentence saying why.
- already_ran: up to 4 short phrasings from past test titles that say the same thing, empty if none. ${VOICE}`,
    user: `ANGLES (id | name | argument):\n${angles.map(a => `${a.id} | ${a.name} | ${clip(a.argument, 200)}`).join('\n')}\n\nPAST TESTS (number | angle id | title | what it tested):\n${tests.map(t => `${parseInt(t.num, 10)} | ${t.angle_id} | ${clip(t.title, 90)} | ${clip(t.hypothesis, 120)}`).join('\n')}\n\nTHE IDEA: ${idea}`,
    schema: TESTED_SCHEMA, effort: 'low', maxTokens: 6000,
  });
  const ok = new Set(angles.map(a => a.id));
  return { verdict: out?.verdict || 'new', angle_id: ok.has(out?.angle_id) ? out.angle_id : null, test_nums: (out?.test_nums || []).map(n => String(parseInt(n, 10))).filter(n => n !== 'NaN').slice(0, 6), reason: out?.reason || '', already_ran: (out?.already_ran || []).slice(0, 4) };
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
      const hooked = await ensureHook(env, d.act_id, doc).catch(e => `hook: ${e.message}`);
      const s = await syncTasks(env, d.act_id, doc);
      if (hooked) s.hook = hooked;
      const t = await tagPass(env, d.act_id, { limit: 8 });
      const r = await resultsPass(env, d.act_id, { limit: 4 });
      out[d.act_id] = { sync: s, tagged: t.tagged, results: r.posted };
    } catch (e) { out[d.act_id] = { error: e.message }; }
  }
  /* New client projects: onboarding links posted, tasks ticked (section 6). */
  out.onboarding = await onboardAsanaTick(env, canAfford).catch(e => ({ error: e.message }));
  return out;
}

/* ---------------- 6. ONBOARDING (2026-09-25) ----------------
   Cole: the onboarding link is the ONE place a new client does their setup, so
   the client project template ("MD - Template 2026 v2") has just two client tasks:
   "Start here: your onboarding link" and "Help us find your voice". This pass makes
   them run themselves:
     - a new project from the template (it has a "Start here" task) gets an
       onboarding link, even before Locus knows the brand: a client has not shared
       Meta yet, which is what the form teaches them to do. Until then the link
       lives under a pending id, 'asana_<project gid>', named after the project.
     - the link is posted as a comment on "Start here" (the client gets the Asana
       notification), the voice interview link on "Help us find your voice" once
       the form is sent, and each task is ticked when the client finishes.
     - the brand's Drive folder is read from the "Google Drive" task in Client
       Resources, so the form can show it.
     - once the brand's Meta account appears in Locus, it is connected to the project
       and everything under the pending id moves onto the real brand.
   Idempotent: each post happens once (p_br_onboard.flags_json). */
const ONBOARD_FORM = 'https://tools.go-mobius-digital.com/onboard/?t=';
const VOICE_FORM = 'https://tools.go-mobius-digital.com/onboard/voice.html?t=';
const START_RE = /^\s*start here/i;
const VOICE_RE = /find your voice/i;
const PENDING = gid => `asana_${gid}`;
let onboardCols = false;

async function ensureOnboardColumns(env) {
  if (onboardCols) return;
  for (const c of ['name TEXT', 'asana_project TEXT', 'asana_task TEXT', 'voice_task TEXT', "flags_json TEXT NOT NULL DEFAULT '{}'"]) {
    await env.DB.prepare(`ALTER TABLE p_br_onboard ADD COLUMN ${c}`).run().catch(() => {});
  }
  onboardCols = true;
}
const newToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
const driveIn = s => (/https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/[A-Za-z0-9_-]+/.exec(s || '') || [])[0]?.replace(/\/u\/\d+\//, '/') || null;

/* Everything filed under the pending id moves to the real brand. What the real brand
   already has wins, except an empty onboarding row, which the pending one replaces. */
async function adoptPending(env, from, to) {
  const [p, r] = await Promise.all([
    env.DB.prepare(`SELECT * FROM p_br_onboard WHERE act_id = ?1`).bind(from).first(),
    env.DB.prepare(`SELECT * FROM p_br_onboard WHERE act_id = ?1`).bind(to).first(),
  ]);
  if (p) {
    const empty = r && r.status === 'sent' && (r.answers_json || '{}') === '{}';
    if (!r || empty) {
      if (r) await env.DB.prepare(`DELETE FROM p_br_onboard WHERE act_id = ?1`).bind(to).run();
      await env.DB.prepare(`UPDATE p_br_onboard SET act_id = ?2 WHERE act_id = ?1`).bind(from, to).run();
    } else {
      await env.DB.prepare(`UPDATE p_br_onboard SET asana_project = ?2, asana_task = ?3, voice_task = ?4, flags_json = ?5 WHERE act_id = ?1`)
        .bind(to, p.asana_project, p.asana_task, p.voice_task, p.flags_json || '{}').run();
      await env.DB.prepare(`DELETE FROM p_br_onboard WHERE act_id = ?1`).bind(from).run();
    }
  }
  const have = new Set(((await env.DB.prepare(`SELECT line_id, key FROM p_br_doc WHERE act_id = ?1`).bind(to).all()).results || []).map(d => `${d.line_id}|${d.key}`));
  const docs = (await env.DB.prepare(`SELECT line_id, key, data_json FROM p_br_doc WHERE act_id = ?1`).bind(from).all()).results || [];
  for (const d of docs) {
    if (!have.has(`${d.line_id}|${d.key}`)) await env.DB.prepare(`UPDATE p_br_doc SET act_id = ?2 WHERE act_id = ?1 AND line_id = ?3 AND key = ?4`).bind(from, to, d.line_id, d.key).run();
    else if (d.key === 'profile') {
      const drive = safeJson(d.data_json, {}).drive;
      if (drive) await env.DB.prepare(`UPDATE p_br_doc SET data_json = json_set(data_json, '$.drive', ?2) WHERE act_id = ?1 AND line_id = '' AND key = 'profile' AND json_extract(data_json, '$.drive') IS NULL`).bind(to, drive).run();
    }
  }
  await env.DB.prepare(`DELETE FROM p_br_doc WHERE act_id = ?1`).bind(from).run();
}

/* A client made with Locus's "New client" button (newclient.js) already has its Slack
   channels. When the brand's Meta account arrives, they land on the real brand, never
   over a channel someone already chose. */
async function adoptNewClient(env, from, to) {
  /* The old pending id keeps resolving to the brand (old links, Slack buttons). */
  await env.DB.prepare(`INSERT OR IGNORE INTO brand_alias (alias, brand_id, kind) VALUES (?1, ?2, 'asana_pending')`).bind(from, to).run().catch(() => {});
  const n = await env.DB.prepare(`SELECT id, slack_internal, slack_client FROM p_newclient WHERE pending_act = ?1`).bind(from).first();
  if (!n) return;
  await env.DB.prepare(`UPDATE brands SET internal_channel = COALESCE(NULLIF(internal_channel, ''), ?2), client_channel = COALESCE(NULLIF(client_channel, ''), ?3), updated_at = datetime('now') WHERE id = ?1`).bind(to, n.slack_internal || null, n.slack_client || null).run();
  await env.DB.prepare(`UPDATE p_newclient SET act_id = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(n.id, to).run();
}

async function setDrive(env, act, url) {
  await env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', 'profile', json_object('drive', ?2), 'approved', 'asana', datetime('now'))
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = json_set(p_br_doc.data_json, '$.drive', ?2), updated_at = datetime('now')`).bind(act, url).run();
}

export async function onboardAsanaTick(env, canAfford = () => true) {
  if (!env.ASANA_TOKEN) return { skipped: 'no ASANA_TOKEN' };
  await ensureOnboardColumns(env);
  const out = { found: 0, posted: 0, ticked: 0, adopted: 0 };
  const rows = (await env.DB.prepare(`SELECT * FROM p_br_onboard`).all()).results || [];
  const known = new Set(rows.map(r => r.asana_project).filter(Boolean));

  /* 1. New projects from the template. Only projects made in the last 120 days, and a
     project without a "Start here" task is remembered so it is never read again. */
  const skip = new Set(safeJson((await env.DB.prepare(`SELECT value FROM settings WHERE key = 'onboardAsanaSkip'`).first().catch(() => null))?.value, []));
  if (canAfford(4)) {
    const me = await asana(env, '/users/me?opt_fields=workspaces.name');
    const ws = me.workspaces?.find(w => /mobius/i.test(w.name)) || me.workspaces?.[0];
    const since = new Date(Date.now() - 120 * 864e5).toISOString();
    const projects = ws ? await asanaAll(env, `/projects?workspace=${ws.gid}&archived=false&opt_fields=name,created_at`) : [];
    const fresh = projects.filter(p => p.created_at >= since && !known.has(p.gid) && !skip.has(p.gid)).slice(0, 5);
    const links = (await env.DB.prepare(`SELECT act_id, data_json FROM p_br_doc WHERE line_id = '' AND key = 'asana'`).all()).results || [];
    for (const p of fresh) {
      if (!canAfford(4)) break;
      const tasks = await asanaAll(env, `/projects/${p.gid}/tasks?opt_fields=name,notes,completed,memberships.section.name`);
      const start = tasks.find(t => START_RE.test(t.name || ''));
      if (!start) { skip.add(p.gid); continue; }
      const voice = tasks.find(t => VOICE_RE.test(t.name || ''));
      const linked = links.find(l => safeJson(l.data_json, {}).project_gid === p.gid)?.act_id
        || (await env.DB.prepare(`SELECT brand_id FROM connections WHERE kind = 'asana' AND external_id = ?1`).bind(p.gid).first().catch(() => null))?.brand_id;
      const act = linked || PENDING(p.gid);
      /* A New client brand (phase 3) is linked by its asana connection only: give it the Brand tab's
         Asana link now, which adoption used to do when the Meta account arrived. */
      if (linked && !links.some(l => l.act_id === linked)) await connect(env, linked, p.gid).catch(() => null);
      const have = await env.DB.prepare(`SELECT act_id FROM p_br_onboard WHERE act_id = ?1`).bind(act).first();
      if (have) await env.DB.prepare(`UPDATE p_br_onboard SET asana_project = ?2, asana_task = ?3, voice_task = ?4, name = COALESCE(name, ?5) WHERE act_id = ?1`).bind(act, p.gid, start.gid, voice?.gid || null, p.name).run();
      else await env.DB.prepare(`INSERT INTO p_br_onboard (act_id, token, name, asana_project, asana_task, voice_task) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(act, newToken(), p.name, p.gid, start.gid, voice?.gid || null).run();
      const drive = driveIn(tasks.find(t => /google drive/i.test(t.name || '') && driveIn(t.notes))?.notes);
      if (drive) await setDrive(env, act, drive);
      out.found++;
    }
    await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('onboardAsanaSkip', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify([...skip].slice(-500))).run().catch(() => {});
  }

  /* 2. Every onboarding tied to a project: adopt, post, tick. */
  const live = (await env.DB.prepare(`SELECT o.*, a.name AS acct_name FROM p_br_onboard o LEFT JOIN brand_accounts a ON a.act_id = o.act_id WHERE o.asana_project IS NOT NULL`).all()).results || [];
  let accts = null;
  for (let o of live) {
    if (!canAfford(4)) break;
    let flags = safeJson(o.flags_json, {});
    const save = () => env.DB.prepare(`UPDATE p_br_onboard SET flags_json = ?2 WHERE act_id = ?1`).bind(o.act_id, JSON.stringify(flags)).run();

    /* Pending: has the brand's Meta account arrived in Locus? */
    if (o.act_id.startsWith('asana_')) {
      /* After phase 3 a client made with New client has its brand from the start; a pending row
         is an older one, or a project made from the template by hand. It joins the brand that
         is linked to the project, or the one brand with the project's name. */
      const link = (await env.DB.prepare(`SELECT act_id FROM p_br_doc WHERE line_id = '' AND key = 'asana' AND json_extract(data_json, '$.project_gid') = ?1`).bind(o.asana_project).first())?.act_id
        || (await env.DB.prepare(`SELECT brand_id FROM connections WHERE kind = 'asana' AND external_id = ?1`).bind(o.asana_project).first().catch(() => null))?.brand_id
        || (await env.DB.prepare(`SELECT act_id FROM p_newclient WHERE pending_act = ?1 AND substr(act_id, 1, 6) = 'brand_'`).bind(o.act_id).first().catch(() => null))?.act_id;
      let real = link;
      if (!real) {
        accts ||= (await env.DB.prepare(`SELECT act_id, name FROM brand_accounts WHERE active = 1`).all()).results || [];
        const hits = accts.filter(a => norm(a.name) && norm(a.name) === norm(o.name));
        if (hits.length === 1) { await connect(env, hits[0].act_id, o.asana_project).catch(() => null); real = hits[0].act_id; }
      }
      if (real) {
        await adoptPending(env, o.act_id, real);
        await adoptNewClient(env, o.act_id, real).catch(() => {});
        out.adopted++;
        o = await env.DB.prepare(`SELECT * FROM p_br_onboard WHERE act_id = ?1`).bind(real).first();
        if (!o) continue;
        flags = safeJson(o.flags_json, {});
      }
    }

    if (!flags.link_posted && o.asana_task) {
      /* In the description too: a comment only notifies followers, and the client is
         usually not one, so the link has to be the first thing they see on the task. */
      await asana(env, `/tasks/${o.asana_task}`, { method: 'PUT', body: { html_notes: `<body><strong>Your onboarding link: <a href="${ONBOARD_FORM}${o.token}">open it here</a></strong>\n\nEverything we need to get started is in that one link: the quick admin (invoice, agreement, Slack, booking the strategy call), giving us access to Meta, Google, Shopify, Klaviyo and Triple Whale click by click with a short video for each, a link to wherever your photos and videos already live, and your products and numbers.\n\nIt saves as you go, so stop and come back to the same link any time. <strong>This task ticks itself when you press Send.</strong></body>` } });
      await asana(env, `/tasks/${o.asana_task}/stories`, { method: 'POST', body: { html_text: `<body>Here is your onboarding link: <a href="${ONBOARD_FORM}${o.token}">${ONBOARD_FORM}${o.token}</a>\n\nIt is the one place for everything we need to get started: the quick admin, your products and numbers, and giving us access to each platform, click by click. It saves as you go. This task ticks itself when you press Send.</body>` } });
      flags.link_posted = new Date().toISOString(); await save(); out.posted++;
    }
    if (!flags.drive) {
      const prof = await getDoc(env, o.act_id, 'profile');
      if (prof?.drive) flags.drive = true;
      else if (o.status !== 'submitted' && canAfford(3)) {
        const tasks = await asanaAll(env, `/projects/${o.asana_project}/tasks?opt_fields=name,notes`);
        const drive = driveIn(tasks.find(t => /google drive/i.test(t.name || '') && driveIn(t.notes))?.notes);
        if (drive) { await setDrive(env, o.act_id, drive); flags.drive = true; }
      }
      if (flags.drive) await save();
    }
    if (o.status === 'submitted' && !flags.done_ticked && o.asana_task) {
      await asana(env, `/tasks/${o.asana_task}`, { method: 'PUT', body: { completed: true } });
      flags.done_ticked = new Date().toISOString(); await save(); out.ticked++;
    }
    if (o.status === 'submitted' && o.voice_task && !flags.voice_posted) {
      await asana(env, `/tasks/${o.voice_task}`, { method: 'PUT', body: { html_notes: `<body><strong>Your voice interview: <a href="${VOICE_FORM}${o.token}">open it here</a></strong>\n\nAbout 20 minutes, and you talk instead of type. We ask how your brand sounds, one question at a time, then write a few sample lines (an ad, an email subject, a caption) and you tell us which ones sound like you and what is off about the rest. It becomes the writing guide every ad and email we make is checked against. After our strategy call is the perfect time. <strong>This task ticks itself when you press Finish.</strong></body>` } });
      await asana(env, `/tasks/${o.voice_task}/stories`, { method: 'POST', body: { html_text: `<body>Thanks for sending the onboarding form. When you have 20 minutes (after our strategy call is perfect), here is your voice interview: <a href="${VOICE_FORM}${o.token}">${VOICE_FORM}${o.token}</a>\n\nYou talk, we ask. Then you rate a few sample lines. This task ticks itself when you press Finish.</body>` } });
      flags.voice_posted = new Date().toISOString(); await save(); out.posted++;
    }
    if (o.voice_task && flags.voice_posted && !flags.voice_ticked) {
      const iv = await getDoc(env, o.act_id, 'voice_interview');
      if (iv?.stage === 'done') {
        await asana(env, `/tasks/${o.voice_task}`, { method: 'PUT', body: { completed: true } });
        flags.voice_ticked = new Date().toISOString(); await save(); out.ticked++;
      }
    }
  }
  return out;
}

/* ---------------- 7. INSTANT (Asana webhooks, 2026-09-27) ----------------
   Cole: "is it possible to make it instant when things are done in Asana?" Each
   connected project has one webhook pointing here. Any task event runs the same
   syncTasks the hourly tick runs (numbering, the brief layout, the library), so a
   new task is numbered and briefed within seconds. The hourly tick stays as the
   net for anything a webhook drops. No AI runs on this path: tagging and results
   stay on the hourly tick, which only spends when there is new work. */
const HOOK_URL = 'https://mobius-account-health.mobius-digital.workers.dev/asana/hook';

async function hmacHex(secret, body) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
function sameHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** One webhook per connected project; re-made if Asana dropped it. */
async function ensureHook(env, act, doc) {
  if (doc.hook_gid) {
    const w = await asana(env, `/webhooks/${doc.hook_gid}?opt_fields=active`).catch(e => (e.status === 404 ? null : { active: true }));
    if (w?.active) return false;
    if (w) await asana(env, `/webhooks/${doc.hook_gid}`, { method: 'DELETE' }).catch(() => {});
  }
  /* The handshake is only accepted while we are asking for it, so nobody else can
     swap the secret. */
  await putSetting(env, `asanaHookOpen_${act}`, Date.now());
  const w = await asana(env, '/webhooks', { method: 'POST', body: { resource: doc.project_gid, target: `${HOOK_URL}?act=${act}`, filters: [{ resource_type: 'task', action: 'added' }, { resource_type: 'task', action: 'changed' }] } });
  doc.hook_gid = w.gid;
  await putDoc(env, act, 'asana', { ...(await getDoc(env, act, 'asana')), hook_gid: w.gid });
  return true;
}

/* One run per brand at a time. Events that land mid-run ask for one more pass. */
async function hookRun(env, act) {
  const key = `asanaHookRun_${act}`;
  const st = (await getSetting(env, key)) || {};
  if (st.running && Date.now() - st.running < 90e3) { await putSetting(env, key, { ...st, again: true }); return; }
  for (let i = 0; i < 3; i++) {
    await putSetting(env, key, { running: Date.now() });
    const doc = await getDoc(env, act, 'asana');
    if (!doc?.project_gid || doc.paused) break;
    await syncTasks(env, act, doc);
    if (!((await getSetting(env, key)) || {}).again) break;
  }
  await putSetting(env, key, {});
}

/* A webhook made before the switch was registered with ?act=<old act_ id> and its secret is filed
   under that id; new ones use the brand id. Look under the brand id first, then every old id. */
async function hookSecret(env, act, raw) {
  for (const k of [act, raw]) { const s = k && await getSetting(env, `asanaHook_${k}`); if (s) return s; }
  const olds = ((await env.DB.prepare(`SELECT alias FROM brand_alias WHERE brand_id = ?1`).bind(act).all().catch(() => ({ results: [] }))).results || []).map(x => x.alias);
  for (const k of olds) { const s = await getSetting(env, `asanaHook_${k}`); if (s) return s; }
  return null;
}

export async function handleAsanaHook(request, env, ctx) {
  const raw = new URL(request.url).searchParams.get('act') || '';
  if (!/^(act_\d+|asana_\d+|brand_[a-z0-9_]+)$/.test(raw)) return new Response('bad act', { status: 400 });
  const act = await resolveBrandId(env, raw);
  const hs = request.headers.get('X-Hook-Secret');
  if (hs) {
    const open = await getSetting(env, `asanaHookOpen_${act}`);
    if (!open || Date.now() - open > 120e3) return new Response('not expecting a handshake', { status: 403 });
    await putSetting(env, `asanaHook_${act}`, hs);
    await putSetting(env, `asanaHookOpen_${act}`, 0);
    return new Response('', { status: 200, headers: { 'X-Hook-Secret': hs } });
  }
  const body = await request.text();
  const secret = await hookSecret(env, act, raw);
  if (!secret || !sameHex(await hmacHex(secret, body), request.headers.get('X-Hook-Signature') || '')) return new Response('bad signature', { status: 401 });
  const events = safeJson(body, {}).events || [];
  if (events.some(e => e.resource?.resource_type === 'task')) ctx.waitUntil(hookRun(env, act).catch(() => {}));
  return new Response('', { status: 200 });
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
    if (path === '/api/brand-asana/onboard') return json({ ok: true, ...(await onboardAsanaTick(env)) });
    /* Asana cannot edit a project template. To change one: make a project from it, edit
       the tasks, then save that project back as a new template here (2026-09-25). */
    if (path === '/api/brand-asana/save-template') {
      if (!/^\d+$/.test(b.project_gid || '') || !String(b.name || '').trim()) return json({ error: 'project_gid and name are required' }, 400);
      const p = await asana(env, `/projects/${b.project_gid}?opt_fields=team.gid`);
      return json({ ok: true, job: await asana(env, `/projects/${b.project_gid}/saveAsTemplate`, { method: 'POST', body: { name: String(b.name).trim(), team: p.team?.gid, public: false } }) });
    }
    if (path === '/api/brand-asana/job') return json({ ok: true, job: await asana(env, `/jobs/${String(b.gid || '').replace(/\D/g, '')}`) });
    if (!b.act) return json({ error: 'act is required' }, 400);
    b.act = await resolveBrandId(env, b.act);   // an old act_ / asana_ id from an old screen
    if (path === '/api/brand-asana/mins') return json({ ok: true, ...(await testMinimums(env, b.act)) });
    if (path === '/api/brand-asana/tested') return json({ ok: true, ...(await testedCheck(env, b.act, b.idea)) });
    if (path === '/api/brand-asana/tidy-concepts') return json({ ok: true, ...(await tidyConcepts(env, b.act)) });
    /* Preview by default; { post: true } sends it to the brand's internal channel now. */
    if (path === '/api/brand-asana/monday') return json({ ok: true, ...(b.post ? await postMonday(env, b.act) : await mondayCalls(env, b.act)) });
    if (path === '/api/brand-asana/connect') {
      try { return json({ ok: true, asana: await connect(env, b.act, b.project_gid) }); }
      catch (e) { return json({ error: e.message, projects: e.projects || null }, e.status || 500); }
    }
    const doc = await getDoc(env, b.act, 'asana');
    if (!doc?.project_gid) return json({ error: 'Connect the brand to its Asana project first.' }, 400);
    if (path === '/api/brand-asana/hook') return json({ ok: true, made: await ensureHook(env, b.act, doc), hook_gid: doc.hook_gid });
    if (path === '/api/brand-asana/sync') return json({ ok: true, ...(await syncTasks(env, b.act, doc, { full: !!b.full })) });
    if (path === '/api/brand-asana/tag') return json({ ok: true, ...(await tagPass(env, b.act, { limit: Math.min(15, +b.limit || 12), warn: b.warn !== false && b.warn !== 'false' })) });
    if (path === '/api/brand-asana/results') return json({ ok: true, ...(await resultsPass(env, b.act, { limit: Math.min(30, +b.limit || 10), quiet: !!b.quiet, rejudge: !!b.rejudge })) });
    /* After an angle is renamed or merged in Locus, open tasks show the current name. */
    if (path === '/api/brand-asana/refresh-angles') return json({ ok: true, updated: await refreshAngleNames(env, b.act) });
    if (path === '/api/brand-asana/tidy-angles') return json({ ok: true, ...(await tidyAngles(env, b.act)) });
    if (path === '/api/brand-asana/pause') { await putDoc(env, b.act, 'asana', { ...doc, paused: !!b.paused }); return json({ ok: true }); }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e.message }, e.status && e.status < 600 ? e.status : 500);
  }
}
export { readDoc, asana };

/* Shared with newclient.js (Locus's New client button). */
export { asanaAll, googleToken, setDrive, PENDING, BRIEF_READERS };
