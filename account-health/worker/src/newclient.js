/**
 * New client (2026-10-02). Cole: "all I need to do in Locus is create a new client
 * and it does all of my tedious steps for me."
 *
 * One row per new client in p_newclient. The screen in Locus (profit/newclient.js)
 * creates the row, then asks for each step in turn, so every step shows its own
 * result and can be retried on its own:
 *   asana    project from "MD - Template 2026 v2", the picked team added, the client
 *            invited by their main email, the old 18-step checklist replaced by the
 *            few things a person still does
 *   onboard  the onboarding link (under the pending id asana_<project> until the
 *            brand's Meta account exists), website + contact saved as pre-fill
 *   drive    a client folder (Branding, Assets > Ad Concepts + Client Content),
 *            shared with the team and the client, linked in Asana and Locus
 *   slack    two PRIVATE channels (<brand> and <brand>-internal), only the picked
 *            team added, the client invited to the client channel by Slack Connect
 *   email    the welcome email, sent from Cole's Gmail ONLY with the text he approved
 *   summary  one post in the internal channel with every link
 * Ledger and the website pre-fill are run by the browser (the Ledger worker and the
 * research stream), and show in the same list.
 *
 * A step that needs a permission we do not have yet FAILS WITH THE REASON and says
 * what to do by hand. It never pretends. Stripe, DocuSign and Frame are not wired
 * yet; they show as "by hand for now".
 *
 * Nothing here reaches a client except: the Asana invite, the Drive share, the Slack
 * Connect invite and the welcome email. All four happen only after Cole presses Go
 * (the email only after he presses Send on its text).
 */
import { asana, asanaAll, googleToken, setDrive, PENDING, onboardAsanaTick } from './asana-brand.js';
import { sendContract, contractDefaults, contractHtml, ensureContractTable, aiEdit, aiAmend, sendAmendment } from './contract.js';
import { frameProject, frameStatus } from './frame.js';

let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }

const TEMPLATE = '1218874412343799';            // MD - Template 2026 v2
const DRIVE_TEMPLATE = '1rPYv4HRCpDEny66Ux-gIFmkOqSuurgYF';   // "# Client Template Folder": new folders go beside it
const OWNER = 'cole@go-mobius-digital.com';
const ONBOARD_FORM = 'https://tools.go-mobius-digital.com/onboard/?t=';
const CALENDLY = 'https://calendly.com/mobius-digital/strategy-session';
const STEPS = ['asana', 'onboard', 'drive', 'slack', 'frame', 'stripe', 'contract', 'email', 'summary'];
const NEWBIZ = 'C0BV9L8NV33';   // #mobius-newbiz (private), 2026-09-05
const ROLE_LABEL = { strategist: 'creative strategist', buyer: 'media buyer', editor: 'video editor', designer: 'graphic designer' };
/* A role can hold several people: "a@x, b@y". */
const roleList = v => String(v || '').split(/[,\s]+/).map(x => x.trim().toLowerCase()).filter(emailOk);
const teamList = team => [...new Set(['strategist', 'buyer', 'editor', 'designer'].flatMap(k => roleList(team[k])))];

const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const slugOf = name => String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const emailOk = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
const firstName = s => String(s || '').trim().split(/\s+/)[0] || 'there';

let tabled = false;
async function ensureTable(env) {
  if (tabled) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_newclient (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, website TEXT, contact_name TEXT, contact_email TEXT,
    retainer REAL, start_date TEXT, team_json TEXT NOT NULL DEFAULT '{}', steps_json TEXT NOT NULL DEFAULT '{}',
    pending_act TEXT, act_id TEXT, asana_project TEXT, asana_url TEXT, token TEXT, drive_url TEXT,
    slack_internal TEXT, slack_client TEXT, slug TEXT,
    created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  tabled = true;
}
const getRun = (env, id) => env.DB.prepare(`SELECT * FROM p_newclient WHERE id = ?1`).bind(id).first();
async function patchRun(env, id, cols) {
  const keys = Object.keys(cols);
  if (!keys.length) return;
  await env.DB.prepare(`UPDATE p_newclient SET ${keys.map((k, i) => `${k} = ?${i + 2}`).join(', ')}, updated_at = datetime('now') WHERE id = ?1`).bind(id, ...keys.map(k => cols[k])).run();
}
const view = r => r && ({
  id: r.id, name: r.name, website: r.website, contact_name: r.contact_name, contact_email: r.contact_email,
  retainer: r.retainer, start_date: r.start_date, team: safeJson(r.team_json, {}), steps: safeJson(r.steps_json, {}),
  pending_act: r.pending_act, act_id: r.act_id, asana_url: r.asana_url, drive_url: r.drive_url,
  onboard_url: r.token ? ONBOARD_FORM + r.token : null, slug: r.slug, created_at: r.created_at,
});

/* ---------------- Asana ---------------- */
async function workspace(env) {
  const me = await asana(env, '/users/me?opt_fields=name,email,workspaces.name');
  const ws = me.workspaces?.find(w => /mobius/i.test(w.name)) || me.workspaces?.[0];
  if (!ws) throw new Error('The Asana token has no workspace.');
  return { ws, me };
}
/* Who can be put on a client. Asana emails (Noma and Ravo are on personal addresses).
   Override with the setting `newClientTeam` = [{name, email, slack}] when the team changes. */
const ROSTER = [
  { name: 'Ahsan', email: 'ahsan@go-mobius-digital.com' },
  { name: 'Noma', email: 'molifenomaqhawe36@gmail.com' },
  { name: 'Ravo', email: 'schubertchannel123@gmail.com' },
  { name: 'William', email: 'william@go-mobius-digital.com' },
  { name: 'Cole', email: OWNER },
];
async function roster(env) {
  const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'newClientTeam'`).first().catch(() => null);
  const list = safeJson(r?.value, null);
  return Array.isArray(list) && list.length ? list : ROSTER;
}
async function teamList_(env) {
  const { ws } = await workspace(env);
  const users = await asanaAll(env, `/users?workspace=${ws.gid}&opt_fields=name,email`);
  return (await roster(env)).map(t => ({ name: t.name, email: t.email.toLowerCase(), gid: users.find(u => (u.email || '').toLowerCase() === t.email.toLowerCase())?.gid || null }));
}

async function stepAsana(env, r) {
  const out = { notes: [] };
  const team = safeJson(r.team_json, {});
  const { ws, me } = await workspace(env);
  let gid = r.asana_project;
  if (!gid) {
    const tpl = await asana(env, `/project_templates/${TEMPLATE}?opt_fields=name,team.gid,requested_dates.gid,requested_dates.name`);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(r.start_date || '') ? r.start_date : new Date().toISOString().slice(0, 10);
    const job = await asana(env, `/project_templates/${TEMPLATE}/instantiateProject`, { method: 'POST', body: {
      name: r.name, team: tpl.team?.gid, public: false,
      ...(tpl.requested_dates?.length ? { requested_dates: tpl.requested_dates.map(d => ({ gid: d.gid, value: day })) } : {}),
    } });
    gid = job.new_project?.gid;
    for (let i = 0; i < 20; i++) {
      const j = await asana(env, `/jobs/${job.gid}?opt_fields=status,new_project.gid`);
      if (j.status === 'succeeded') { gid = j.new_project?.gid || gid; break; }
      if (j.status === 'failed') throw new Error('Asana could not make the project from the template.');
      await sleep(1500);
    }
    if (!gid) throw new Error('Asana is still making the project. Press Retry in a minute.');
    const p = await asana(env, `/projects/${gid}?opt_fields=permalink_url`);
    await patchRun(env, r.id, { asana_project: gid, asana_url: p.permalink_url, pending_act: PENDING(gid) });
    r.asana_project = gid; r.asana_url = p.permalink_url; r.pending_act = PENDING(gid);
  }

  /* The team Cole picked, and nobody else. */
  const people = await asanaAll(env, `/users?workspace=${ws.gid}&opt_fields=name,email`);
  const gidOf = email => people.find(u => (u.email || '').toLowerCase() === String(email || '').toLowerCase())?.gid;
  const members = [...new Set([me.gid, ...teamList(team).map(gidOf)].filter(Boolean))];
  if (members.length) await asana(env, `/projects/${gid}/addMembers`, { method: 'POST', body: { members: members.join(',') } }).catch(e => out.notes.push(`Team not added: ${e.message}`));

  /* The client, by their main email. They add their own teammates later. */
  if (emailOk(r.contact_email)) {
    try {
      await asana(env, `/workspaces/${ws.gid}/addUser`, { method: 'POST', body: { user: r.contact_email } }).catch(() => null);
      await asana(env, `/projects/${gid}/addMembers`, { method: 'POST', body: { members: r.contact_email } });
      out.client_invited = true;
    } catch (e) { out.notes.push(`Client not invited to Asana (${e.message}). Invite ${r.contact_email} from the project's Share button.`); }
  }

  /* Tidy the project: website in, Marketing Plan out, and the old checklist swapped
     for the few things a person still does. Done once. */
  const flags = safeJson(r.steps_json, {}).asana?.tidy;
  if (!flags) {
    const tasks = await asanaAll(env, `/projects/${gid}/tasks?opt_fields=name,notes,num_subtasks,memberships.section.name`);
    const find = re => tasks.find(t => re.test(t.name || ''));
    const web = find(/^website/i);
    if (web && r.website) await asana(env, `/tasks/${web.gid}`, { method: 'PUT', body: { notes: r.website } }).catch(() => {});
    const plan = find(/^marketing plan/i);
    if (plan) await asana(env, `/tasks/${plan.gid}`, { method: 'DELETE' }).catch(() => {});
    const research = find(/^research$/i);
    const lead = roleList(team.strategist)[0];
    if (research && gidOf(lead)) await asana(env, `/tasks/${research.gid}`, { method: 'PUT', body: { assignee: gidOf(lead), notes: 'Locus > Brand > Research > "Research this brand", once the client has sent the onboarding form. Then read the drafts and approve them before the strategy call.' } }).catch(() => {});
    const ob = tasks.find(t => /^onboarding$/i.test(t.name || '') && t.num_subtasks > 0);
    if (ob) {
      const subs = await asanaAll(env, `/tasks/${ob.gid}/subtasks?opt_fields=name`);
      for (const s of subs) await asana(env, `/tasks/${s.gid}`, { method: 'DELETE' }).catch(() => {});
      const todo = [
        ['Send the invoice and the contract', me.gid],
        ['Create the Frame project and add the team', me.gid],
        ['Send the Shopify collaborator request (their store address is in the onboarding answers)', me.gid],
        ['Once the client shares Meta: add the brand in Locus (Settings > Add a brand) and add the media buyer to the ad account and page', me.gid],
        ['Before the strategy call: review the onboarding answers and the research in Locus (Brand > Brand info, Brand > Research)', gidOf(lead) || me.gid],
        ['After the voice interview: read the How we write draft in Locus and approve it', me.gid],
        ['Set the first month in Plan and turn the daily brief on (Locus)', me.gid],
      ];
      for (const [name, assignee] of todo) await asana(env, `/tasks/${ob.gid}/subtasks`, { method: 'POST', body: { name, assignee } }).catch(e => out.notes.push(`Checklist item not added: ${e.message}`));
      await asana(env, `/tasks/${ob.gid}`, { method: 'PUT', body: { assignee: me.gid } }).catch(() => {});
    }
    out.tidy = true;
  } else out.tidy = true;
  out.url = r.asana_url;
  out.text = `Project made${out.client_invited ? `, ${r.contact_email} invited` : ''}.`;
  return out;
}

/* ---------------- onboarding link ---------------- */
async function stepOnboard(env, r) {
  if (!r.asana_project) throw new Error('Make the Asana project first.');
  /* The hourly pass does exactly this for any new template project: makes the link
     under the pending id, writes it on "Start here", posts it as a comment. Run it now. */
  await onboardAsanaTick(env);
  const o = await env.DB.prepare(`SELECT act_id, token, prefill_json FROM p_br_onboard WHERE asana_project = ?1`).bind(r.asana_project).first();
  if (!o) throw new Error('The project has no "Start here" task, so no onboarding link was made. Was it made from MD - Template 2026 v2?');
  const pre = { ...safeJson(o.prefill_json, {}), company: r.name, ...(r.website ? { website: r.website } : {}), ...(r.contact_name ? { contact_name: r.contact_name } : {}), ...(r.contact_email ? { contact_email: r.contact_email } : {}) };
  await env.DB.prepare(`UPDATE p_br_onboard SET prefill_json = ?2, updated_at = datetime('now') WHERE act_id = ?1`).bind(o.act_id, JSON.stringify(pre)).run();
  if (r.website) await env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', 'profile', json_object('website', ?2), 'approved', 'newclient', datetime('now'))
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = json_set(p_br_doc.data_json, '$.website', ?2), updated_at = datetime('now')`).bind(o.act_id, r.website).run();
  await patchRun(env, r.id, { token: o.token, pending_act: o.act_id });
  return { url: ONBOARD_FORM + o.token, text: 'Onboarding link made and posted on their "Start here" task.' };
}

/* ---------------- Google Drive ---------------- */
async function gapi(env, scope, path, init = {}) {
  const tok = await googleToken(env, OWNER, scope);
  const res = await F(`https://www.googleapis.com/${path}`, { method: init.method || 'GET', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: init.body ? JSON.stringify(init.body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `Google ${res.status}`);
  return j;
}
const DRIVE = 'https://www.googleapis.com/auth/drive';
const NEEDS_DRIVE = 'Locus may only READ Google Drive today. In Google Admin (Security > API controls > Domain-wide delegation) add the scope https://www.googleapis.com/auth/drive to the Locus service account, then press Retry. Until then: copy the template folder by hand and paste its link into the "Google Drive" task in Asana.';

/* The client's Drive folder has three jobs and nothing else (Cole, 2026-10-03: Frame is for review,
   Locus for research, Asana for production; Drive keeps what none of those should hold):
     Agreements      the signed agreement and every signed amendment, saved by Locus as Google Docs
                     the moment they are signed. Team only: the client gets their copy by email.
     From the client the files they send us that are not in their own library (raw footage, a product
                     shoot, a big brand pack). The client can add; this is the folder their form links.
     Final ads       approved, finished ads for the client to download and use anywhere (organic,
                     email, site). The client can view and download. The team drops finals here after launch.
   Runs again safely: missing subfolders are made, existing ones are kept. */
const DRIVE_FOLDERS = [['agreements', 'Agreements'], ['inbox', 'From the client']];   // 'Final ads' dropped 2026-10-03: finished ads live in Frame and on the Your ads page
async function stepDrive(env, r) {
  const team = safeJson(r.team_json, {});
  let url = r.drive_url;
  const out = { notes: [] };
  const mk = (name, parent) => gapi(env, DRIVE, 'drive/v3/files?supportsAllDrives=true&fields=id', { method: 'POST', body: { name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) } });
  if (!url) {
    let parent;
    try { parent = (await gapi(env, DRIVE, `drive/v3/files/${DRIVE_TEMPLATE}?fields=parents&supportsAllDrives=true`)).parents?.[0]; }
    catch (e) { throw new Error(/sign-in failed|unauthorized_client|access_denied/i.test(e.message) ? NEEDS_DRIVE : `Google Drive: ${e.message}`); }
    const root = await mk(r.name, parent);
    url = `https://drive.google.com/drive/folders/${root.id}`;
    await patchRun(env, r.id, { drive_url: url }); r.drive_url = url;
  }
  const rootId = (/folders\/([A-Za-z0-9_-]+)/.exec(url) || [])[1];
  /* The three folders, found by name or made. */
  const kids = (await gapi(env, DRIVE, `drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)&q=${encodeURIComponent(`'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)}`)).files || [];
  const ids = {};
  for (const [k, name] of DRIVE_FOLDERS) ids[k] = kids.find(f => f.name === name)?.id || (await mk(name, rootId)).id;
  const link = id => `https://drive.google.com/drive/folders/${id}`;
  /* Sharing runs on every pass (a Retry after a failed share must share), and is harmless to repeat.
     The team edits everything. The client can add to From the client and view Final ads; they never
     get the root or Agreements. Google only lets a non-Google address in with the invite email. */
  const share = (id, email, role, notify) => gapi(env, DRIVE, `drive/v3/files/${id}/permissions?supportsAllDrives=true&sendNotificationEmail=${notify}`, { method: 'POST', body: { type: 'user', role, emailAddress: email } });
  /* Drive permissions inherit downward, so nobody but Cole is on the root: each folder is shared on
     its own. Agreements = Cole + the client (view). The team works in the other two. */
  const rootPerms = (await gapi(env, DRIVE, `drive/v3/files/${rootId}/permissions?supportsAllDrives=true&fields=permissions(id,emailAddress,role)`).catch(() => ({}))).permissions || [];
  for (const pm of rootPerms.filter(x => x.role !== 'owner' && x.emailAddress && x.emailAddress.toLowerCase() !== OWNER)) await gapi(env, DRIVE, `drive/v3/files/${rootId}/permissions/${pm.id}?supportsAllDrives=true`, { method: 'DELETE' }).catch(() => {});
  for (const e of teamList(team).filter(x => x !== OWNER)) for (const id of [ids.inbox]) await share(id, e, 'writer', false).catch(err => { if (!/already/i.test(err.message)) out.notes.push(`Not shared with ${e}: ${err.message}`); });
  if (emailOk(r.contact_email)) {
    /* A folder made before 2026-10-03 shared its root with the client: take that back. */
    const perms = (await gapi(env, DRIVE, `drive/v3/files/${rootId}/permissions?supportsAllDrives=true&fields=permissions(id,emailAddress)`).catch(() => ({}))).permissions || [];
    for (const pm of perms.filter(x => (x.emailAddress || '').toLowerCase() === r.contact_email.toLowerCase())) await gapi(env, DRIVE, `drive/v3/files/${rootId}/permissions/${pm.id}?supportsAllDrives=true`, { method: 'DELETE' }).catch(() => {});
    for (const [id, role] of [[ids.inbox, 'writer'], [ids.agreements, 'reader']]) {
      await share(id, r.contact_email, role, false).catch(() => share(id, r.contact_email, role, true)).then(() => { out.client_shared = true; }).catch(err => out.notes.push(`Not shared with the client: ${err.message}`));
    }
  }
  /* Asana Client Resources > Google Drive carries the two client folders; the form links From the client. */
  if (r.asana_project) await upsertResource(env, r.asana_project, 'Google Drive', `Send us files: ${link(ids.inbox)}\nYour signed agreements: ${link(ids.agreements)}`).catch(() => {});
  if (r.pending_act) await setDrive(env, r.act_id || r.pending_act, link(ids.inbox));
  return { ...out, url, folders: ids, text: 'Folder made: Agreements (you and the client only) and From the client.' };
}

/* ---------------- Slack ---------------- */
async function slack(token, method, body, get) {
  const res = get
    ? await F(`https://slack.com/api/${method}?${new URLSearchParams(body)}`, { headers: { Authorization: `Bearer ${token}` } })
    : await F(`https://slack.com/api/${method}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ ok: false, error: 'bad_response' }));
}
/** Slack user ids for a list of emails (lookup by email, then first name via the roster). */
async function slackIds(env, emails) {
  const bot = env.SLACK_BOT_TOKEN; const out = {};
  if (!bot) return out;
  const people = await roster(env);
  let members = null;
  for (const e of emails) {
    const j = await slack(bot, 'users.lookupByEmail', { email: e }, true);
    if (j.ok) { out[e] = j.user.id; continue; }
    const who = people.find(t => t.email.toLowerCase() === e.toLowerCase());
    if (who?.slack) { out[e] = who.slack; continue; }
    members ||= ((await slack(bot, 'users.list', { limit: 500 }, true)).members || []).filter(m => !m.deleted && !m.is_bot);
    const first = (who?.name || '').toLowerCase();
    const hits = first ? members.filter(m => `${m.real_name || ''} ${m.profile?.display_name || ''}`.toLowerCase().split(/\s+/).includes(first)) : [];
    if (hits.length === 1) out[e] = hits[0].id;
  }
  return out;
}
const SLACK_HELP = 'The Slack app may not create channels yet. At api.slack.com/apps > Mobius Digital > OAuth & Permissions, add the bot scopes groups:write and conversations.connect:write (users:read.email too if it is missing), reinstall, then press Retry.';

async function stepSlack(env, r) {
  const bot = env.SLACK_BOT_TOKEN, user = env.SLACK_USER_TOKEN;
  if (!bot) throw new Error('No SLACK_BOT_TOKEN on the worker.');
  const team = safeJson(r.team_json, {});
  const slug = r.slug || slugOf(r.name);
  const out = { notes: [] };
  const botId = (await slack(bot, 'auth.test', {})).user_id;

  /* A private channel. The bot makes it when it may; otherwise Cole's own token does,
     and the bot is invited so briefs can post there. */
  const make = async name => {
    let j = await slack(bot, 'conversations.create', { name, is_private: true });
    if (j.ok) return { id: j.channel.id, by: bot };
    if (j.error === 'name_taken') throw new Error(`A Slack channel called #${name} already exists. Rename or archive it, or change the brand's short name, then Retry.`);
    if (j.error === 'missing_scope' && user) {
      j = await slack(user, 'conversations.create', { name, is_private: true });
      if (j.ok) { if (botId) await slack(user, 'conversations.invite', { channel: j.channel.id, users: botId }); return { id: j.channel.id, by: user }; }
      if (j.error === 'name_taken') throw new Error(`A Slack channel called #${name} already exists.`);
    }
    throw new Error(j.error === 'missing_scope' ? SLACK_HELP : `Slack: ${j.error}`);
  };
  let internal = r.slack_internal ? { id: r.slack_internal, by: bot } : null;
  let client = r.slack_client ? { id: r.slack_client, by: bot } : null;
  if (!internal) { internal = await make(`${slug}-internal`); await patchRun(env, r.id, { slack_internal: internal.id, slug }); r.slack_internal = internal.id; }
  if (!client) { client = await make(slug); await patchRun(env, r.id, { slack_client: client.id, slug }); r.slack_client = client.id; }

  /* Only the people Cole picked. */
  const found = await slackIds(env, [...new Set([OWNER, ...teamList(team)])]);
  const ids = Object.values(found);
  for (const e of teamList(team)) if (!found[e]) out.notes.push(`${e} not found in Slack. Add them to both channels by hand.`);
  /* The bot may lack groups:write (then Cole's own token made the channels); invites follow the same rule. */
  const invite = async (ch, users) => {
    let j = await slack(bot, 'conversations.invite', { channel: ch.id, users });
    if (!j.ok && j.error === 'missing_scope' && user) j = await slack(user, 'conversations.invite', { channel: ch.id, users });
    return j;
  };
  for (const ch of [internal, client]) {
    if (!ids.length) break;
    let j = await invite(ch, ids.join(','));
    if (!j.ok && j.error !== 'already_in_channel') {
      /* One bad id fails the whole call: go one by one. */
      for (const id of ids) { j = await invite(ch, id); if (!j.ok && !/already_in_channel|cant_invite_self/.test(j.error)) out.notes.push(`Could not add a teammate to a channel (${j.error}).`); }
    }
  }

  /* The client, by Slack Connect, to the client channel only. */
  if (emailOk(r.contact_email)) {
    let j = await slack(bot, 'conversations.inviteShared', { channel: client.id, emails: [r.contact_email], external_limited: false });
    if (!j.ok && user && /missing_scope|not_allowed_token_type|invalid_auth/.test(j.error)) j = await slack(user, 'conversations.inviteShared', { channel: client.id, emails: [r.contact_email], external_limited: false });
    if (j.ok) out.client_invited = true;
    else out.notes.push(`Slack would not send the Slack Connect invite (${j.error}). In #${slug}: Add people > invite ${r.contact_email}.`);
  }
  await slack(bot, 'conversations.setPurpose', { channel: client.id, purpose: `${r.name} and Mobius Digital` }).catch(() => {});
  await slack(bot, 'conversations.setPurpose', { channel: internal.id, purpose: `${r.name}: Mobius team only. Drafts, alerts and ideas.` }).catch(() => {});
  /* If the brand is already in Locus, point it at the channels now; otherwise they
     land on it when its Meta account arrives (adoptNewClient in asana-brand.js). */
  if (r.act_id) await env.DB.prepare(`UPDATE accounts SET slack_channel = COALESCE(NULLIF(slack_channel, ''), ?2), brief_channel = COALESCE(NULLIF(brief_channel, ''), ?3) WHERE act_id = ?1`).bind(r.act_id, internal.id, client.id).run();
  return { ...out, text: `#${slug} and #${slug}-internal made, both private${out.client_invited ? `, ${r.contact_email} invited by Slack Connect` : ''}.` };
}

/* ---------------- welcome email ---------------- */
function welcomeDraft(r) {
  const link = r.token ? ONBOARD_FORM + r.token : '(the onboarding link appears here once it is made)';
  return {
    subject: `Welcome to Mobius Digital, ${firstName(r.contact_name)}`,
    body: `Hi ${firstName(r.contact_name)},

Welcome aboard. We are excited to get started on ${r.name}.

Everything we need from you is in one link:
${link}

It walks you through the quick admin, giving us access to each platform (click by click, with a short video for each), and a few questions about your products and customers. We filled in what we could from your website, so most of it is checking rather than typing. It saves as you go.

Three other things are on their way to this email address:
- An invite to your project in Asana, where you will see every ad we are working on.
- An invite to our shared Slack channel. That is the fastest way to reach us, and you can add anyone on your team once you are in.
- Access to your Google Drive folder with us.

When you are ready, book your strategy call here:
${CALENDLY}

Talk soon,
Cole`,
  };
}
const b64url = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const NEEDS_GMAIL = 'Locus may not send from your Gmail yet. In Google Admin (Security > API controls > Domain-wide delegation) add the scope https://www.googleapis.com/auth/gmail.send to the Locus service account, then press Send again. Until then: Copy the email and send it yourself.';

async function stepEmail(env, r, b) {
  if (!emailOk(r.contact_email)) throw new Error('No client email on this client.');
  const subject = String(b.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const body = String(b.body || '').trim();
  if (!subject || !body) throw new Error('The email needs a subject and a message.');
  if (!b.approved) throw new Error('The welcome email is only sent when you press Send on it.');
  const mime = [`From: Cole Wetzler <${OWNER}>`, `To: ${r.contact_email}`, `Subject: =?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(subject)))}?=`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', body].join('\r\n');
  try { await gapi(env, 'https://www.googleapis.com/auth/gmail.send', 'gmail/v1/users/me/messages/send', { method: 'POST', body: { raw: b64url(mime) } }); }
  catch (e) { throw new Error(/sign-in failed|unauthorized_client|access_denied|insufficient/i.test(e.message) ? NEEDS_GMAIL : `Gmail: ${e.message}`); }
  return { text: `Sent to ${r.contact_email} from your Gmail.` };
}

/* ---------------- Stripe: invoice first, then autopay ----------------
   Cole's way: the first invoice goes out and work starts when it is paid; from then
   on the retainer is on autopay. One Stripe subscription does both: it is made with
   collection_method send_invoice (Stripe emails the invoice, the client pays by card
   on Stripe's page, the card is saved on the subscription), and when invoice.paid
   arrives on /stripe/webhook the subscription flips to charge_automatically. The
   webhook endpoint is made through the API the first time, so there is no dashboard
   step. Secret: STRIPE_SECRET_KEY on this worker (a restricted key with write access
   to Customers, Products, Prices, Subscriptions, Invoices and Webhook Endpoints is
   enough). Nothing is charged here; the client pays the invoice themselves. */
const STRIPE_WEBHOOK = 'https://mobius-account-health.mobius-digital.workers.dev/stripe/webhook';
const NEEDS_STRIPE = 'Stripe is not connected to Locus. Paste a key with: cd account-health/worker then npx.cmd wrangler secret put STRIPE_SECRET_KEY. Until then, send the invoice from Stripe by hand.';

function form(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => out.push(typeof x === 'object' ? form(x, `${key}[${i}]`) : `${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(x)}`));
    else if (typeof v === 'object') out.push(form(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.filter(Boolean).join('&');
}
async function stripe(env, method, path, body) {
  /* PowerShell can prepend a BOM when a secret is pasted in; strip anything that is not a key character. */
  const key = String(env.STRIPE_SECRET_KEY || '').replace(/[^!-~]/g, '');
  if (!key) throw new Error(NEEDS_STRIPE);
  const res = await F(`https://api.stripe.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' }, body: body ? form(body) : undefined });
  const text = await res.text();
  const j = safeJson(text, {});
  if (!res.ok) throw new Error(`Stripe (${method} ${path.split('?')[0]}): ${j.error?.message || j.error?.type || `${res.status} ${text.slice(0, 300)}`}`);
  return j;
}
/** The webhook that flips a paid subscription to autopay. Made once; the signing
 *  secret lives in settings.stripeWebhook. */
async function ensureStripeWebhook(env) {
  const have = safeJson((await env.DB.prepare(`SELECT value FROM settings WHERE key = 'stripeWebhook'`).first().catch(() => null))?.value, null);
  if (have?.secret) return have;
  const w = await stripe(env, 'POST', 'webhook_endpoints', { url: STRIPE_WEBHOOK, enabled_events: ['invoice.paid'], description: 'Locus: first retainer invoice paid, switch the subscription to autopay' });
  const row = { id: w.id, secret: w.secret, made: new Date().toISOString() };
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('stripeWebhook', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(row)).run();
  return row;
}

/** One Stripe product, "Mobius Digital retainer", made once; each client gets its own price on it. */
async function stripeProduct(env) {
  const have = safeJson((await env.DB.prepare(`SELECT value FROM settings WHERE key = 'stripeProduct'`).first().catch(() => null))?.value, null);
  if (have?.id) return have.id;
  const p = await stripe(env, 'POST', 'products', { name: 'Mobius Digital retainer', description: 'Monthly marketing retainer' });
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('stripeProduct', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify({ id: p.id })).run();
  return p.id;
}
async function stepStripe(env, r, b) {
  if (!(r.retainer > 0)) return { status: 'skipped', text: 'Skipped: no retainer was entered.' };
  if (!emailOk(r.contact_email)) throw new Error('No client email, so there is nobody to invoice.');
  const prev = safeJson(r.steps_json, {}).stripe || {};
  if (prev.subscription) {
    /* Already made: just refresh what the invoice says. */
    const inv = prev.invoice ? await stripe(env, 'GET', `invoices/${prev.invoice}`) : null;
    const paid = inv?.status === 'paid';
    return { ...prev, status: 'done', paid, text: `${paid ? 'First invoice PAID, retainer on autopay.' : `Invoice sent, ${inv?.status || 'open'}.`} $${Math.round(r.retainer).toLocaleString('en-US')} a month.` };
  }
  if (!b.approved) throw new Error('The invoice is only sent when you press Send on it.');
  await ensureStripeWebhook(env);
  const found = await stripe(env, 'GET', `customers/search?${form({ query: `email:'${r.contact_email.replace(/'/g, '')}'`, limit: 1 })}`);
  const customer = found.data?.[0] || await stripe(env, 'POST', 'customers', { email: r.contact_email, name: r.contact_name || r.name, description: r.name, metadata: { brand: r.name, locus: r.id } });
  const sub = await stripe(env, 'POST', 'subscriptions', {
    customer: customer.id,
    items: [{ price_data: { currency: 'usd', unit_amount: Math.round(r.retainer * 100), recurring: { interval: 'month' }, product: await stripeProduct(env) } }],
    collection_method: 'send_invoice', days_until_due: 7,
    payment_settings: { save_default_payment_method: 'on_subscription' },
    description: `${r.name} monthly retainer`,
    metadata: { brand: r.name, locus: r.id, autopay: 'after first payment' },
  });
  /* A subscription's first invoice is a draft; Stripe only sends a finalized one. */
  await stripe(env, 'POST', `invoices/${sub.latest_invoice}/finalize`, { auto_advance: false }).catch(e => { if (!/already|finalized/i.test(e.message)) throw e; });
  const inv = await stripe(env, 'POST', `invoices/${sub.latest_invoice}/send`);
  return { status: 'done', customer: customer.id, subscription: sub.id, invoice: inv.id, url: inv.hosted_invoice_url, paid: false,
    text: `Invoice for $${Math.round(r.retainer).toLocaleString('en-US')} sent to ${r.contact_email}. When they pay, the card is saved and the retainer bills itself every month.` };
}

/* Stripe calls this (public, signed). invoice.paid on a Locus subscription -> autopay. */
async function stripeSig(secret, body, header) {
  const parts = Object.fromEntries((header || '').split(',').map(p => p.split('=')));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - +parts.t) > 300) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hex = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${parts.t}.${body}`)))].map(x => x.toString(16).padStart(2, '0')).join('');
  if (hex.length !== parts.v1.length) return false;
  let d = 0; for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return d === 0;
}
export async function handleStripeWebhook(request, env) {
  const body = await request.text();
  const cfg = safeJson((await env.DB.prepare(`SELECT value FROM settings WHERE key = 'stripeWebhook'`).first().catch(() => null))?.value, null);
  if (!cfg?.secret || !(await stripeSig(cfg.secret, body, request.headers.get('Stripe-Signature')))) return new Response('bad signature', { status: 400 });
  const ev = safeJson(body, {});
  if (ev.type !== 'invoice.paid') return new Response('ignored', { status: 200 });
  const inv = ev.data?.object || {};
  const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id;
  if (!subId) return new Response('no subscription', { status: 200 });
  await ensureTable(env);
  const rows = (await env.DB.prepare(`SELECT * FROM p_newclient WHERE json_extract(steps_json, '$.stripe.subscription') = ?1`).bind(subId).all()).results || [];
  for (const r of rows) {
    const steps = safeJson(r.steps_json, {});
    if (steps.stripe?.paid) continue;
    try {
      const sub = await stripe(env, 'GET', `subscriptions/${subId}`);
      const pm = sub.default_payment_method || inv.payment_intent?.payment_method || null;
      if (sub.collection_method !== 'charge_automatically') await stripe(env, 'POST', `subscriptions/${subId}`, { collection_method: 'charge_automatically', ...(typeof pm === 'string' ? { default_payment_method: pm } : {}) });
      steps.stripe = { ...steps.stripe, paid: true, paid_at: new Date().toISOString(), text: `First invoice PAID on ${new Date().toISOString().slice(0, 10)}. Retainer is on autopay.` };
    } catch (e) { steps.stripe = { ...steps.stripe, paid: true, paid_at: new Date().toISOString(), text: `First invoice paid, but autopay was not switched on: ${e.message}. Do it in Stripe.` }; }
    await patchRun(env, r.id, { steps_json: JSON.stringify(steps) });
    if (r.slack_internal && env.SLACK_BOT_TOKEN) await slack(env.SLACK_BOT_TOKEN, 'chat.postMessage', { channel: r.slack_internal, text: `*${r.name} paid their first invoice.* The retainer is on autopay from here. Work can start.` }).catch(() => {});
  }
  return new Response('ok', { status: 200 });
}

/** What the setup screen shows for the agreement: the blanks to edit, or where it stands. */
async function contractState(env, r) {
  await ensureContractTable(env);
  const row = r.token ? await env.DB.prepare(`SELECT status, sent_at, signed_at, client_name, vars_json FROM p_contract WHERE token = ?1`).bind(r.token).first().catch(() => null) : null;
  const amendments = r.token ? ((await env.DB.prepare(`SELECT token, status, sent_at, signed_at, client_name, vars_json FROM p_contract WHERE token LIKE ?1 ORDER BY sent_at`).bind(`${r.token}a%`).all().catch(() => ({ results: [] }))).results || []).map(a => ({ n: safeJson(a.vars_json, {}).amendment, status: a.status, sent_at: a.sent_at, signed_at: a.signed_at, signed_by: a.client_name, url: `https://tools.go-mobius-digital.com/onboard/sign.html?t=${a.token}` })) : [];
  return { amendments, defaults: contractDefaults(r), status: row?.status || null, sent_at: row?.sent_at || null, signed_at: row?.signed_at || null, signed_by: row?.client_name || null, vars: safeJson(row?.vars_json, null), url: r.token ? `https://tools.go-mobius-digital.com/onboard/sign.html?t=${r.token}` : null };
}

/* ---------------- summary ---------------- */
async function stepSummary(env, r) {
  if (!r.slack_internal) throw new Error('No internal channel yet. Make the Slack channels first.');
  const team = safeJson(r.team_json, {});
  const lines = [
    `*${r.name} is set up.* Here is everything in one place:`,
    r.asana_url ? `• Asana project: ${r.asana_url}` : null,
    r.drive_url ? `• Google Drive folder: ${r.drive_url}` : null,
    r.slack_client ? `• Client channel: <#${r.slack_client}>` : null,
    r.website ? `• Website: ${r.website}` : null,
    safeJson(r.steps_json, {}).frame?.url ? `• Frame project: ${safeJson(r.steps_json, {}).frame.url}` : null,
    safeJson(r.steps_json, {}).stripe?.url ? `• First invoice: ${safeJson(r.steps_json, {}).stripe.url}` : null,
    `• Team: strategist ${team.strategist || 'not picked'}, media buyer ${team.buyer || 'not picked'}, editor ${team.editor || 'not picked'}, designer ${team.designer || 'not picked'}`,
    `Their onboarding answers show up in Locus > Brand > ${r.name} > Brand info as they fill the form in. Locus posts here when they send it.`,
  ].filter(Boolean);
  const j = await slack(env.SLACK_BOT_TOKEN, 'chat.postMessage', { channel: r.slack_internal, text: lines.join('\n'), unfurl_links: false });
  if (!j.ok) throw new Error(`Slack: ${j.error}`);
  /* New Biz (#mobius-newbiz, made in the 2026-09-05 Slack restructure): the news, the people, never money. */
  const ids = await slackIds(env, teamList(team));
  const who = ['strategist', 'buyer', 'editor', 'designer'].map(k => { const ps = roleList(team[k]); return ps.length ? `${ROLE_LABEL[k]}: ${ps.map(e => ids[e] ? `<@${ids[e]}>` : e).join(', ')}` : null; }).filter(Boolean).join(' · ');
  const cvars = safeJson((await env.DB.prepare(`SELECT vars_json FROM p_contract WHERE token = ?1`).bind(r.token || '').first().catch(() => null))?.vars_json, null);
  const nb = await slack(env.SLACK_BOT_TOKEN, 'chat.postMessage', { channel: NEWBIZ, unfurl_links: false, text: [`*New client: ${r.name}*${r.website ? ` (${r.website.replace(/^https?:\/\//, '')})` : ''}${r.start_date ? `, starting ${r.start_date}` : ''}.`, who ? `Team: ${who}.` : null, cvars?.term ? `Agreement: ${cvars.custom ? 'custom terms' : 'standard services'}, ${cvars.term}.` : null, `Set up in Asana, Drive, Slack (<#${r.slack_client}>) and Frame by Locus.`].filter(Boolean).join('\n') });
  return { text: `Posted in the internal channel${nb.ok ? ' and #mobius-newbiz' : ''}.` };
}

/* The agreement: Cole's edits to the blanks come in b.vars; approved is the Send press. */
async function stepContract(env, r, b) {
  if (!emailOk(r.contact_email)) throw new Error('No client email, so there is nobody to send the agreement to.');
  if (!b.approved) throw new Error('The agreement is only sent when you press Send for signature.');
  const s = await sendContract(env, r, b.vars, b.ip);
  return { url: s.url, hash: s.hash, signed: false, text: `Sent to ${r.contact_email} for signature. You signed it on sending.` };
}
/** A link task under Client Resources in the client's Asana project: found by name, made if missing. */
async function upsertResource(env, projectGid, name, notes) {
  const tasks = await asanaAll(env, `/projects/${projectGid}/tasks?opt_fields=name,memberships.section.name,memberships.section.gid`);
  const re = new RegExp(`^${name}`, 'i');
  const t = tasks.find(x => re.test(x.name || ''));
  if (t) return asana(env, `/tasks/${t.gid}`, { method: 'PUT', body: { notes } });
  const sec = tasks.flatMap(x => x.memberships || []).map(m => m.section).find(s => /client resources/i.test(s?.name || ''));
  return asana(env, '/tasks', { method: 'POST', body: { name, notes, projects: [projectGid], ...(sec ? { memberships: [{ project: projectGid, section: sec.gid }] } : {}) } });
}
/* ---------------- Frame.io (V4, frame.js) ----------------
   One project per client in the Mobius workspace, the picked team as collaborators. */
async function stepFrame(env, r) {
  const team = safeJson(r.team_json, {});
  const prev = safeJson(r.steps_json, {}).frame || {};
  const emails = teamList(team).filter(x => x !== OWNER);
  const out = await frameProject(env, r.name, emails, prev);
  if (out.url && r.asana_project) await upsertResource(env, r.asana_project, 'Frame', out.url).catch(e => out.notes.push(`Asana link not written: ${e.message}`));
  return { ...out, text: 'Frame project made.' };
}
const RUN = { asana: stepAsana, onboard: stepOnboard, drive: stepDrive, slack: stepSlack, frame: stepFrame, stripe: stepStripe, contract: stepContract, email: stepEmail, summary: stepSummary };

/* ---------------- routes (admin) ---------------- */
export async function handleNewClient(request, env, path, json, isAdmin, who) {
  if (!path.startsWith('/api/new-client')) return null;
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  await ensureTable(env);
  const url = new URL(request.url);
  const b = request.method === 'GET' ? Object.fromEntries(url.searchParams) : await request.json().catch(() => ({}));
  try {
    if (path === '/api/new-client/team' && request.method === 'POST') {
      const list = (Array.isArray(b.team) ? b.team : []).map(t => ({ name: String(t.name || '').trim().slice(0, 60), email: String(t.email || '').trim().toLowerCase(), slack: String(t.slack || '').trim() || undefined })).filter(t => t.name && emailOk(t.email));
      if (!list.length) return json({ error: 'The team needs at least one person.' }, 400);
      await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('newClientTeam', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(list)).run();
      return json({ ok: true, team: await teamList_(env) });
    }
    if (path === '/api/new-client/options') {
      const runs = (await env.DB.prepare(`SELECT * FROM p_newclient ORDER BY created_at DESC LIMIT 30`).all()).results || [];
      let team = [], err = null;
      try { team = await teamList_(env); } catch (e) { err = e.message; }
      return json({ team, team_error: err, owner: OWNER, runs: runs.map(view), steps: STEPS, frame: (await frameStatus(env)).connected, stripe: !!(env.STRIPE_SECRET_KEY || '').trim(), stripe_key: String(env.STRIPE_SECRET_KEY || '').replace(/[^!-~]/g, '').replace(/^(.{7}).*(.{4})$/, '$1...$2') });
    }
    if (path === '/api/new-client' && request.method === 'POST') {
      const name = String(b.name || '').trim().slice(0, 80);
      if (!name) return json({ error: 'Give the brand a name.' }, 400);
      let website = String(b.website || '').trim();
      if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
      const email = String(b.contact_email || '').trim().toLowerCase();
      if (email && !emailOk(email)) return json({ error: 'That client email does not look right.' }, 400);
      const dupe = await env.DB.prepare(`SELECT id FROM p_newclient WHERE lower(name) = lower(?1)`).bind(name).first();
      if (dupe) return json({ error: `${name} was already started. Open it from the list instead.`, id: dupe.id }, 409);
      const id = rid();
      const t = b.team || {};
      const team = Object.fromEntries(['strategist', 'buyer', 'editor', 'designer'].map(k => [k, roleList(Array.isArray(t[k]) ? t[k].join(',') : t[k]).join(',')]));
      await env.DB.prepare(`INSERT INTO p_newclient (id, name, website, contact_name, contact_email, retainer, start_date, team_json, slug, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
        .bind(id, name, website || null, String(b.contact_name || '').trim().slice(0, 120) || null, email || null, Number(b.retainer) || null, /^\d{4}-\d{2}-\d{2}$/.test(b.start_date || '') ? b.start_date : null, JSON.stringify(team), slugOf(b.slug || name), (who && await who(request, env).catch(() => null)) || null).run();
      return json({ ok: true, run: view(await getRun(env, id)) });
    }
    const r = b.id ? await getRun(env, String(b.id)) : null;
    if (!r) return json({ error: 'unknown client' }, 404);
    if (path === '/api/new-client/run') return json({ ok: true, run: view(r), welcome: welcomeDraft(r), contract: await contractState(env, r) });
    /* The browser reports the two steps it runs itself (Ledger, the website pre-fill). */
    if (path === '/api/new-client/contract-preview' && request.method === 'POST') {
      const v = { ...contractDefaults(r), ...Object.fromEntries(Object.entries(b.vars || {}).filter(([, x]) => String(x || '').trim())) };
      const custom = /^<article[\s\S]*<\/article>$/.test(String(b.vars?.html || '').trim()) ? String(b.vars.html).trim() : null;
      return json({ ok: true, html: custom || contractHtml(v) });
    }
    if (path === '/api/new-client/contract-preview' && request.method === 'POST') {
      const v = { ...contractDefaults(r), ...Object.fromEntries(Object.entries(b.vars || {}).filter(([, x]) => String(x || '').trim())) };
      return json({ ok: true, html: contractHtml(v) });
    }
    if (path === '/api/new-client/contract-ai' && request.method === 'POST') {
      const v = { ...contractDefaults(r), ...Object.fromEntries(Object.entries(b.vars || {}).filter(([, x]) => String(x || '').trim())) };
      const base = /^<article[\s\S]*<\/article>$/.test(String(b.vars?.html || '').trim()) ? String(b.vars.html).trim() : contractHtml(v);
      try { return json({ ok: true, ...(await aiEdit(env, base, b.instruction)) }); } catch (e) { return json({ error: e.message }, 502); }
    }
    if (path === '/api/new-client/amend-draft' && request.method === 'POST') {
      const signed = await env.DB.prepare(`SELECT * FROM p_contract WHERE token = ?1`).bind(r.token || '').first();
      if (signed?.status !== 'signed') return json({ error: 'Amendments are for a signed agreement.' }, 400);
      const n = ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM p_contract WHERE token LIKE ?1`).bind(`${r.token}a%`).first())?.n || 0) + 1;
      try { return json({ ok: true, n, ...(await aiAmend(env, signed, b.instruction, n, /^<article/.test(String(b.html || '')) ? b.html : null)) }); } catch (e) { return json({ error: e.message }, 502); }
    }
    if (path === '/api/new-client/amend-send' && request.method === 'POST') {
      try { const a = await sendAmendment(env, r, b.html, request.headers.get('CF-Connecting-IP') || ''); return json({ ok: true, ...a, contract: await contractState(env, r) }); }
      catch (e) { return json({ error: e.message }, 400); }
    }
    if (path === '/api/new-client/mark' && request.method === 'POST') {
      if (!['ledger', 'prefill'].includes(b.step)) return json({ error: 'unknown step' }, 400);
      const steps = safeJson(r.steps_json, {});
      steps[b.step] = { status: b.ok ? 'done' : 'failed', text: String(b.text || '').slice(0, 400), at: new Date().toISOString() };
      await patchRun(env, r.id, { steps_json: JSON.stringify(steps) });
      return json({ ok: true, run: view(await getRun(env, r.id)) });
    }
    if (path === '/api/new-client/step' && request.method === 'POST') {
      const fn = RUN[b.step];
      if (!fn) return json({ error: 'unknown step' }, 400);
      let res;
      b.ip = request.headers.get('CF-Connecting-IP') || '';
      try { res = { status: 'done', ...(await fn(env, r, b)) }; }
      catch (e) { res = { status: 'failed', text: e.message }; }
      const fresh = await getRun(env, r.id);
      const steps = safeJson(fresh.steps_json, {});
      steps[b.step] = { ...res, at: new Date().toISOString() };
      await patchRun(env, r.id, { steps_json: JSON.stringify(steps) });
      const now = await getRun(env, r.id);
      return json({ ok: res.status !== 'failed', step: steps[b.step], run: view(now), welcome: welcomeDraft(now), contract: await contractState(env, now) });
    }
    /* Take back a welcome post (the bot's or Cole's) so the on-join one can go out fresh. */
    if (path === '/api/new-client/unwelcome' && request.method === 'POST') {
      const steps = safeJson(r.steps_json, {});
      const ts = typeof steps.slack_welcome === 'string' ? steps.slack_welcome : steps.slack_welcome?.ts;
      if (ts && r.slack_client) for (const tok of [env.SLACK_BOT_TOKEN, env.SLACK_USER_TOKEN].filter(Boolean)) {
        await slack(tok, 'pins.remove', { channel: r.slack_client, timestamp: ts }).catch(() => {});
        const d = await slack(tok, 'chat.delete', { channel: r.slack_client, ts });
        if (d.ok) break;
      }
      delete steps.slack_welcome;
      await patchRun(env, r.id, { steps_json: JSON.stringify(steps) });
      return json({ ok: true });
    }
    if (path === '/api/new-client/remove' && request.method === 'POST') {
      /* Forgets the row. Nothing made in Asana, Drive or Slack is deleted; an UNPAID Stripe
         subscription is cancelled so a removed client is never invoiced again. */
      const st = safeJson(r.steps_json, {}).stripe;
      if (st?.subscription && !st.paid) {
        await stripe(env, 'DELETE', `subscriptions/${st.subscription}`).catch(() => {});
        if (st.invoice) await stripe(env, 'POST', `invoices/${st.invoice}/void`).catch(() => {});
      }
      await env.DB.prepare(`DELETE FROM p_newclient WHERE id = ?1`).bind(r.id).run();
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status && e.status !== 401 ? e.status : 500); }
}

/** The client's Your ads page: the same stable token as their report archive (worker.js reportToken). */
async function yourAdsUrl(env, act) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'reportTokens'`).first().catch(() => null);
  const tokens = safeJson(row?.value, {});
  let tok = Object.keys(tokens).find(k => tokens[k].act_id === act);
  if (!tok) {
    tok = crypto.randomUUID().replace(/-/g, '');
    tokens[tok] = { act_id: act, created: new Date().toISOString() };
    await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('reportTokens', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(tokens)).run();
  }
  return `https://tools.go-mobius-digital.com/yourads/?t=${tok}`;
}

/* ---------------- the client's welcome, the moment they join their channel ----------------
   Posted as Cole (SLACK_USER_TOKEN), pinned, with every link they need. Not before they are in:
   the hourly tick looks for a member of the client channel from outside the Mobius workspace. */
async function welcomeOnJoin(env, r) {
  const bot = env.SLACK_BOT_TOKEN, user = env.SLACK_USER_TOKEN;
  if (!bot || !user || !r.slack_client) return false;
  const ours = (await slack(bot, 'auth.test', {})).team_id;
  const mem = await slack(bot, 'conversations.members', { channel: r.slack_client, limit: 200 }, true);
  if (!mem.ok) return false;
  /* "The client joined" = a person from outside our Slack workspace who is not one of the team
     (some teammates are Slack Connect guests themselves). */
  const teamIds = new Set(Object.values(await slackIds(env, [...new Set([OWNER, ...(await roster(env)).map(t => t.email.toLowerCase())])])));
  let joined = false;
  for (const id of mem.members || []) {
    if (teamIds.has(id)) continue;
    const u = await slack(bot, 'users.info', { user: id }, true);
    if (u.ok && !u.user.is_bot && (u.user.is_stranger || (u.user.team_id && u.user.team_id !== ours))) { joined = true; break; }
  }
  if (!joined) return false;
  const team = safeJson(r.team_json, {});
  const ids = await slackIds(env, teamList(team));
  const who = await roster(env);
  const nameOf = e => who.find(t => t.email.toLowerCase() === e)?.name || e;
  const people = ['strategist', 'buyer', 'editor', 'designer'].flatMap(k => roleList(team[k]).map(e => `• ${ids[e] ? `<@${ids[e]}>` : `*${nameOf(e)}*`}, ${ROLE_LABEL[k]}`));
  const st = safeJson(r.steps_json, {});
  const links = [
    r.token ? `• Your onboarding link: ${ONBOARD_FORM}${r.token}` : null,
    r.asana_url ? `• Your Asana project (every ad, before it runs): ${r.asana_url}` : null,
    r.drive_url ? `• Your Google Drive folder with us: ${r.drive_url}` : null,
    `• Book the strategy call: ${CALENDLY}`,
    r.act_id ? `• Every ad we run for you, newest first: ${await yourAdsUrl(env, r.act_id)}` : null,
  ].filter(Boolean);
  const text = [`*Welcome, ${r.name}!* This channel is where we talk day to day. Say hi, ask anything, drop files, tag any of us.`, '',
    '*Your team at Mobius*', '• Cole Wetzler, founder, your main contact', ...people, '',
    '*Your links*', ...links, '',
    '*What happens next*', '1. Finish the onboarding link. Giving us access to Meta, Google and Shopify is the part that unlocks everything else.', '2. Book the strategy call if you have not yet. We go through your answers together.', '3. Pay the first invoice and sign the agreement (both came by email).', '4. Then we start: research, first briefs, first ads.', '',
    'Add anyone from your side to this channel any time.'].join('\n');
  const m = await slack(user, 'chat.postMessage', { channel: r.slack_client, text, unfurl_links: false });
  if (!m.ok) return false;
  await slack(user, 'pins.add', { channel: r.slack_client, timestamp: m.ts }).catch(() => {});
  await patchRun(env, r.id, { steps_json: JSON.stringify({ ...st, slack_welcome: { ts: m.ts, at: new Date().toISOString() } }) });
  return true;
}

/* Shopify has no API for a collaborator request: it is made from the Partner dashboard. So the moment
   the client types their store address (the form saves as they go), Cole gets it in the internal channel
   with the request code and the clicks, once. */
async function shopifyHeadsUp(env) {
  const rows = (await env.DB.prepare(`SELECT n.*, o.answers_json FROM p_newclient n JOIN p_br_onboard o ON o.token = n.token WHERE n.slack_internal IS NOT NULL AND json_extract(n.steps_json, '$.shopify_ping') IS NULL`).all().catch(() => ({ results: [] }))).results || [];
  let told = 0;
  for (const r of rows) {
    const ans = safeJson(r.answers_json, {});
    const m = /([a-z0-9][a-z0-9-]*)\.myshopify\.com/i.exec(String(ans.shopify_url || ''));
    if (!m) continue;
    const store = `${m[1].toLowerCase()}.myshopify.com`;
    const code = String(ans.shopify_code || '').trim();
    const j = await slack(env.SLACK_BOT_TOKEN, 'chat.postMessage', { channel: r.slack_internal, unfurl_links: false,
      text: `<@U06C37MDWD7> *${r.name}* gave their Shopify store: *${store}*${code ? `, request code *${code}*` : ''}. Send the collaborator request: partners.shopify.com > Stores > Add store > Request access to a store > paste the address${code ? ' and the code' : ''}. They approve it from their email.` });
    if (j.ok) { const steps = safeJson(r.steps_json, {}); steps.shopify_ping = { store, at: new Date().toISOString() }; await patchRun(env, r.id, { steps_json: JSON.stringify(steps) }); told++; }
  }
  return told;
}

/** Slack's member_joined_channel event: the welcome goes out seconds after the client joins. */
export async function welcomeOnJoinByChannel(env, channel) {
  await ensureTable(env);
  const r = await env.DB.prepare(`SELECT * FROM p_newclient WHERE slack_client = ?1 AND json_extract(steps_json, '$.slack_welcome') IS NULL`).bind(channel || '').first();
  return r ? welcomeOnJoin(env, r) : false;
}

/** On the hourly tick: welcome the client when they join Slack; tell the team when the form is sent. */
export async function newClientTick(env) {
  await ensureTable(env);
  let welcomed = 0;
  for (const r of (await env.DB.prepare(`SELECT * FROM p_newclient WHERE slack_client IS NOT NULL AND json_extract(steps_json, '$.slack_welcome') IS NULL`).all().catch(() => ({ results: [] }))).results || []) {
    if (await welcomeOnJoin(env, r).catch(() => false)) welcomed++;
  }
  const rows = (await env.DB.prepare(`SELECT n.*, o.status AS ob_status FROM p_newclient n JOIN p_br_onboard o ON o.token = n.token WHERE o.status = 'submitted' AND n.slack_internal IS NOT NULL`).all().catch(() => ({ results: [] }))).results || [];
  let told = 0;
  for (const r of rows) {
    const steps = safeJson(r.steps_json, {});
    if (steps.form_ping) continue;
    const team = safeJson(r.team_json, {});
    const j = await slack(env.SLACK_BOT_TOKEN, 'chat.postMessage', { channel: r.slack_internal, unfurl_links: false,
      text: `*${r.name} sent their onboarding form.* Next: open Locus > Brand > ${r.name} > Research and press "Research this brand", then review the answers and the drafts before the strategy call${team.strategist ? ` (${team.strategist})` : ''}.` });
    if (j.ok) { steps.form_ping = { status: 'done', at: new Date().toISOString() }; await patchRun(env, r.id, { steps_json: JSON.stringify(steps) }); told++; }
    /* Their content library link goes under Client Resources > Assets in Asana. */
    const ans = safeJson((await env.DB.prepare(`SELECT answers_json FROM p_br_onboard WHERE token = ?1`).bind(r.token).first().catch(() => null))?.answers_json, {});
    if (r.asana_project && /^https?:\/\//.test(ans.content_link || '')) await upsertResource(env, r.asana_project, 'Assets', ans.content_link).catch(() => {});
  }
  const shopify = await shopifyHeadsUp(env).catch(() => 0);
  return { told, welcomed, shopify };
}
