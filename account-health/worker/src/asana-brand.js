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
  const prev = (await getDoc(env, act, 'asana')) || {};
  const doc = { ...prev, project_gid: project.gid, project_name: project.name, url: project.permalink_url, workspace: ws.gid, connected_at: prev.connected_at || new Date().toISOString(), as: me.name, fields_version: prev.project_gid === project.gid ? prev.fields_version : null };
  await ensureProjectFields(env, doc);
  await putDoc(env, act, 'asana', doc);
  return doc;
}

/* ---------------- 1. SYNC ---------------- */
const TASK_FIELDS = 'name,notes,completed,completed_at,created_at,modified_at,permalink_url,assignee.gid,assignee.name,memberships.project.gid,memberships.section.name,custom_fields.gid,custom_fields.name,custom_fields.display_value,custom_fields.text_value,custom_fields.enum_value.gid,custom_fields.date_value';
/* The brief, in the framework's shape. Dropped into a brand-new task in Creative Brief
   that has nothing written yet, so nobody has to find the template. */
const BRIEF_TEMPLATE = `<body><h2>The test</h2><strong>Angle:</strong> one sentence, the reason to buy. Pick one from the Locus library, or leave it and Locus fills it.
<strong>Why:</strong> what we believe about the customer that makes this work.
<strong>Testing:</strong> new angle (3 concepts, 1 ad each), new concepts on a proven angle, or inside a proven concept (name the ONE piece that changes: headline, hook, person on screen, edit style, redesign or review).
<strong>Concept:</strong> only when testing inside a proven concept: which concept, and the test it came from.
<h2>The ads</h2><ol><li>Ad 1: one line the designer or editor can build from.</li><li>Ad 2:</li><li>Ad 3:</li></ol>Files and ads are named with the test number first: 348-1, 348-2, 348-3.
<h2>Format</h2>Static 4:5, or video 9:16 and length. For video: hooks, script, b-roll and editor notes.
<h2>Ad copy</h2><strong>Primary text:</strong>
<strong>Headline:</strong>
<strong>Offer:</strong> none
<strong>Landing page:</strong>
<h2>Inspo</h2>Attach images or paste links.
<h2>Assets</h2>Frame.io link:</body>`;
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
    try { await asana(env, `/tasks/${t.gid}`, { method: 'PUT', body: { html_notes: BRIEF_TEMPLATE } }); templated.add(t.gid); } catch { /* next hour */ }
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
  const rows = (await env.DB.prepare(`SELECT id, num, title, offer, hypothesis, why, level, brief_url, brief_text, legacy_json, asana_gid, stage, created_at, source FROM p_br_batch
      WHERE act_id = ?1 AND angle_id IS NULL AND tagged_at IS NULL ORDER BY CAST(num AS INTEGER) ASC LIMIT ?2`).bind(act, limit).all()).results || [];
  if (!rows.length) return { tagged: 0, left: 0 };
  const angles = (await env.DB.prepare(`SELECT id, name, argument FROM p_br_angle WHERE act_id = ?1 AND status != 'proposed'`).bind(act).all()).results || [];
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
  const acct = await env.DB.prepare(`SELECT name FROM accounts WHERE act_id = ?1`).bind(act).first();
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
- concept: a short name for the idea, reused exactly when the same idea comes back.
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
  const ads = (await env.DB.prepare(`SELECT ad_id, name FROM ads WHERE act_id = ?1`).bind(act).all()).results || [];
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
        SUM(add_to_cart) atc, MIN(CASE WHEN spend > 0 THEN date END) first FROM ad_daily WHERE act_id = ?1 AND ad_id IN (${q})`).bind(act, ...list).first();
    const t = await env.DB.prepare(`SELECT SUM(revenue) rev, SUM(orders) orders FROM tw_ad_attr WHERE act_id = ?1 AND model = 'lastPlatformClick' AND ad_id IN (${q})`).bind(act, ...list).first();
    out[bid] = { ads: list.length, ad_ids: list, spend: s?.spend || 0, impr: s?.impr || 0, clicks: s?.clicks || 0, v3: s?.v3 || 0, thru: s?.thru || 0, atc: s?.atc || 0, first: s?.first, rev: t?.rev || 0, orders: t?.orders || 0 };
  }
  return out;
}
/** This account's recent ads, as the yardstick for the soft metrics. */
async function benchmarks(env, act) {
  const since = addDays(today(), -90);
  const r = (await env.DB.prepare(`SELECT SUM(spend) spend, SUM(impressions) impr, SUM(link_clicks) clicks, SUM(video_3s) v3, SUM(add_to_cart) atc
      FROM ad_daily WHERE act_id = ?1 AND date >= ?2 GROUP BY ad_id HAVING SUM(spend) >= 30`).bind(act, since).all()).results || [];
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
function rulesOf(acct, doc) {
  const r = { target_cpa: null, judge_spend: 150, judge_days: 7, win_roas: 2, lose_roas: 1.2 };
  if (acct?.target_cpa > 0) r.target_cpa = +acct.target_cpa;
  if (acct?.target_roas > 0) { r.win_roas = acct.target_roas; r.lose_roas = Math.round(acct.target_roas * 0.6 * 100) / 100; }
  for (const k of Object.keys(r)) if (doc && +doc[k] > 0) r[k] = +doc[k];
  if (!(doc && +doc.judge_spend > 0) && r.target_cpa) r.judge_spend = Math.round(r.target_cpa * 3);
  return r;
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
    if (sc.cpa != null && sc.cpa <= T) return { call: 'winner', read: `CPA ${money(sc.cpa)} is at or under the ${money(T)} target.` };
    if (strong >= 2 && (sc.cpa == null || sc.cpa <= T * 2)) return { call: 'keep', reason: 'tof', read: `CPA is ${sc.cpa ? money(sc.cpa) : 'not there yet'} against a ${money(T)} target, but people are clicking, watching and adding to cart. Looks like a top of funnel ad doing its job.` };
    if (sc.cpa != null && sc.cpa <= T * 1.3) return { call: 'keep', reason: 'data', read: `CPA ${money(sc.cpa)} is close to the ${money(T)} target. Worth more spend before calling it.` };
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
async function resultsPass(env, act, { limit = 8, quiet = false } = {}) {
  const acct = await env.DB.prepare(`SELECT act_id, name, target_cpa, target_roas FROM accounts WHERE act_id = ?1`).bind(act).first();
  const rules = rulesOf(acct, await getDoc(env, act, 'rules'));
  if (!rules.target_cpa) return { posted: 0, skipped: 'Set a target CPA in Brand info to switch on result calls.' };
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
    if (r.asana_result === 'keep' && !recheck) continue;           // waiting for its check-again date
    if (r.result_posted && !recheck) continue;                      // already suggested; the buyer has it
    if (recheck && r.result_posted === `recheck:${r.check_again}`) continue;
    const st = stats[r.id];
    const sc = st ? scorecard(st, rules, bm) : null;
    let j = sc ? judge(st, rules, sc) : null;
    if (!j && !recheck) continue;                                   // not enough spend yet
    if (!j) j = { call: 'keep', reason: 'data', read: `Still only ${money(st?.spend || 0)} spent. Not enough to judge.` };
    let learning = '';
    if (j.call !== 'keep') {
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
    const am = `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${act.replace(/^act_/, '')}&selected_ad_ids=${(st?.ad_ids || []).slice(0, 30).join(',')}`;
    /* A list, not a paragraph: the call on top, one metric per line with a mark the
       eye can scan (✅ good, ➖ average, ⚠️ weak, ❌ over target), then what to do. */
    const MARK = { top: '✅', mid: '➖', low: '⚠️' };
    const WORD = { top: 'top third for this brand', mid: 'average for this brand', low: 'bottom third for this brand' };
    const li = (mark, label, v, note) => `<li>${mark} <strong>${label}:</strong> ${v}${note ? ` · ${note}` : ''}</li>`;
    const T = rules.target_cpa;
    const cpaMark = !sc?.cpa ? '❌' : sc.cpa <= T ? '✅' : sc.cpa <= T * 1.3 ? '⚠️' : '❌';
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
      const html = `<body>${who}<strong>Test ${parseInt(r.num, 10)} ${recheck ? 'check-in' : 'scorecard'}</strong>
<strong>${CALL[j.call]}</strong>${j.call === 'keep' ? ` (${KR[j.reason]})` : ''}
<ul>${rows}</ul><strong>Why:</strong> ${esc(j.read)}${learning ? `
<strong>Learning:</strong> ${esc(learning)}` : ''}
<a href="${am}">Open these ads in Ads Manager</a>
<strong>Your move:</strong> ${next}
<em>Sales: Triple Whale. Delivery: Meta.</em></body>`;
      await asana(env, `/tasks/${r.asana_gid}/stories`, { method: 'POST', body: { html_text: html } });
      await env.DB.prepare(`UPDATE p_br_batch SET result_posted = ?2, asana_result = ?3, check_again = ?4, learning = COALESCE(learning, NULLIF(?5, '')), updated_at = datetime('now') WHERE id = ?1`)
        .bind(r.id, recheck ? `recheck:${r.check_again}` : j.call, j.call, j.call === 'keep' ? nextCheck : r.check_again, learning).run();
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
  const acct = await env.DB.prepare(`SELECT name FROM accounts WHERE act_id = ?1`).bind(act).first();
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
      const linked = links.find(l => safeJson(l.data_json, {}).project_gid === p.gid)?.act_id;
      const act = linked || PENDING(p.gid);
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
  const live = (await env.DB.prepare(`SELECT o.*, a.name AS acct_name FROM p_br_onboard o LEFT JOIN accounts a ON a.act_id = o.act_id WHERE o.asana_project IS NOT NULL`).all()).results || [];
  let accts = null;
  for (let o of live) {
    if (!canAfford(4)) break;
    let flags = safeJson(o.flags_json, {});
    const save = () => env.DB.prepare(`UPDATE p_br_onboard SET flags_json = ?2 WHERE act_id = ?1`).bind(o.act_id, JSON.stringify(flags)).run();

    /* Pending: has the brand's Meta account arrived in Locus? */
    if (o.act_id.startsWith('asana_')) {
      const link = (await env.DB.prepare(`SELECT act_id FROM p_br_doc WHERE line_id = '' AND key = 'asana' AND json_extract(data_json, '$.project_gid') = ?1`).bind(o.asana_project).first())?.act_id;
      let real = link;
      if (!real) {
        accts ||= (await env.DB.prepare(`SELECT act_id, name FROM accounts WHERE active = 1`).all()).results || [];
        const hits = accts.filter(a => norm(a.name) && norm(a.name) === norm(o.name));
        if (hits.length === 1) { await connect(env, hits[0].act_id, o.asana_project).catch(() => null); real = hits[0].act_id; }
      }
      if (real) {
        await adoptPending(env, o.act_id, real);
        out.adopted++;
        o = await env.DB.prepare(`SELECT * FROM p_br_onboard WHERE act_id = ?1`).bind(real).first();
        if (!o) continue;
        flags = safeJson(o.flags_json, {});
      }
    }

    if (!flags.link_posted && o.asana_task) {
      /* In the description too: a comment only notifies followers, and the client is
         usually not one, so the link has to be the first thing they see on the task. */
      await asana(env, `/tasks/${o.asana_task}`, { method: 'PUT', body: { html_notes: `<body><strong>Your onboarding link: <a href="${ONBOARD_FORM}${o.token}">open it here</a></strong>\n\nEverything we need to get started is in that one link: the quick admin (invoice, agreement, saying hi in Slack, booking the strategy call, dropping your content in Google Drive), your products and numbers, your team, and giving us access to Meta, Google, Shopify, Klaviyo and Triple Whale, click by click with a short video for each.\n\nIt saves as you go, so stop and come back to the same link any time. <strong>This task ticks itself when you press Send.</strong></body>` } });
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
    if (path === '/api/brand-asana/connect') {
      try { return json({ ok: true, asana: await connect(env, b.act, b.project_gid) }); }
      catch (e) { return json({ error: e.message, projects: e.projects || null }, e.status || 500); }
    }
    const doc = await getDoc(env, b.act, 'asana');
    if (!doc?.project_gid) return json({ error: 'Connect the brand to its Asana project first.' }, 400);
    if (path === '/api/brand-asana/sync') return json({ ok: true, ...(await syncTasks(env, b.act, doc, { full: !!b.full })) });
    if (path === '/api/brand-asana/tag') return json({ ok: true, ...(await tagPass(env, b.act, { limit: Math.min(15, +b.limit || 12), warn: b.warn !== false && b.warn !== 'false' })) });
    if (path === '/api/brand-asana/results') return json({ ok: true, ...(await resultsPass(env, b.act, { limit: Math.min(30, +b.limit || 10), quiet: !!b.quiet })) });
    /* After an angle is renamed or merged in Locus, open tasks show the current name. */
    if (path === '/api/brand-asana/refresh-angles') return json({ ok: true, updated: await refreshAngleNames(env, b.act) });
    if (path === '/api/brand-asana/tidy-angles') return json({ ok: true, ...(await tidyAngles(env, b.act)) });
    if (path === '/api/brand-asana/pause') { await putDoc(env, b.act, 'asana', { ...doc, paused: !!b.paused }); return json({ ok: true }); }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e.message }, e.status && e.status < 600 ? e.status : 500);
  }
}
