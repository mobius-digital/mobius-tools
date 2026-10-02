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

let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }

const TEMPLATE = '1218874412343799';            // MD - Template 2026 v2
const DRIVE_TEMPLATE = '1rPYv4HRCpDEny66Ux-gIFmkOqSuurgYF';   // "# Client Template Folder": new folders go beside it
const OWNER = 'cole@go-mobius-digital.com';
const ONBOARD_FORM = 'https://tools.go-mobius-digital.com/onboard/?t=';
const CALENDLY = 'https://calendly.com/mobius-digital/strategy-session';
const STEPS = ['asana', 'onboard', 'drive', 'slack', 'stripe', 'email', 'summary'];

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
async function teamList(env) {
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
  const members = [...new Set([me.gid, gidOf(team.strategist), gidOf(team.buyer), gidOf(team.editor)].filter(Boolean))];
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
    if (research && gidOf(team.strategist)) await asana(env, `/tasks/${research.gid}`, { method: 'PUT', body: { assignee: gidOf(team.strategist), notes: 'Locus > Brand > Research > "Research this brand", once the client has sent the onboarding form. Then read the drafts and approve them before the strategy call.' } }).catch(() => {});
    const ob = tasks.find(t => /^onboarding$/i.test(t.name || '') && t.num_subtasks > 0);
    if (ob) {
      const subs = await asanaAll(env, `/tasks/${ob.gid}/subtasks?opt_fields=name`);
      for (const s of subs) await asana(env, `/tasks/${s.gid}`, { method: 'DELETE' }).catch(() => {});
      const todo = [
        ['Send the invoice and the contract', me.gid],
        ['Create the Frame project and add the team', me.gid],
        ['Send the Shopify collaborator request (their store address is in the onboarding answers)', me.gid],
        ['Once the client shares Meta: add the brand in Locus (Settings > Add a brand) and add the media buyer to the ad account and page', me.gid],
        ['Before the strategy call: review the onboarding answers and the research in Locus (Brand > Brand info, Brand > Research)', gidOf(team.strategist) || me.gid],
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

async function stepDrive(env, r) {
  const team = safeJson(r.team_json, {});
  let url = r.drive_url;
  const out = { notes: [] };
  if (!url) {
    let parent;
    try { parent = (await gapi(env, DRIVE, `drive/v3/files/${DRIVE_TEMPLATE}?fields=parents&supportsAllDrives=true`)).parents?.[0]; }
    catch (e) { throw new Error(/sign-in failed|unauthorized_client|access_denied/i.test(e.message) ? NEEDS_DRIVE : `Google Drive: ${e.message}`); }
    const mk = (name, p) => gapi(env, DRIVE, 'drive/v3/files?supportsAllDrives=true&fields=id', { method: 'POST', body: { name, mimeType: 'application/vnd.google-apps.folder', ...(p ? { parents: [p] } : {}) } });
    const root = await mk(r.name, parent);
    url = `https://drive.google.com/drive/folders/${root.id}`;
    await patchRun(env, r.id, { drive_url: url }); r.drive_url = url;
    await mk('Branding', root.id);
    const assets = await mk('Assets', root.id);
    await mk('Ad Concepts', assets.id);
    await mk('Client Content', assets.id);
    const share = (email, notify) => gapi(env, DRIVE, `drive/v3/files/${root.id}/permissions?supportsAllDrives=true&sendNotificationEmail=${notify}`, { method: 'POST', body: { type: 'user', role: 'writer', emailAddress: email } });
    for (const e of [...new Set([team.strategist, team.buyer, team.editor].filter(x => emailOk(x) && x.toLowerCase() !== OWNER))]) await share(e, false).catch(err => out.notes.push(`Not shared with ${e}: ${err.message}`));
    if (emailOk(r.contact_email)) await share(r.contact_email, false).then(() => { out.client_shared = true; }).catch(err => out.notes.push(`Not shared with the client: ${err.message}`));
  }
  /* The link lives in Asana (Client Resources > Google Drive) and on the brand in Locus. */
  if (r.asana_project) {
    const tasks = await asanaAll(env, `/projects/${r.asana_project}/tasks?opt_fields=name`);
    const t = tasks.find(x => /^google drive/i.test(x.name || ''));
    if (t) await asana(env, `/tasks/${t.gid}`, { method: 'PUT', body: { notes: url } }).catch(() => {});
  }
  if (r.pending_act) await setDrive(env, r.act_id || r.pending_act, url);
  return { ...out, url, text: 'Folder made and shared.' };
}

/* ---------------- Slack ---------------- */
async function slack(token, method, body, get) {
  const res = get
    ? await F(`https://slack.com/api/${method}?${new URLSearchParams(body)}`, { headers: { Authorization: `Bearer ${token}` } })
    : await F(`https://slack.com/api/${method}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ ok: false, error: 'bad_response' }));
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
  const ids = [];
  const people = await roster(env);
  let members = null;
  for (const e of [...new Set([OWNER, team.strategist, team.buyer, team.editor].filter(emailOk))]) {
    const j = await slack(bot, 'users.lookupByEmail', { email: e }, true);
    if (j.ok) { ids.push(j.user.id); continue; }
    /* A teammate on a different email in Slack than in Asana: find them by first name. */
    const who = people.find(t => t.email.toLowerCase() === e.toLowerCase());
    if (who?.slack) { ids.push(who.slack); continue; }
    members ||= ((await slack(bot, 'users.list', { limit: 500 }, true)).members || []).filter(m => !m.deleted && !m.is_bot);
    const first = (who?.name || '').toLowerCase();
    const hits = first ? members.filter(m => `${m.real_name || ''} ${m.profile?.display_name || ''}`.toLowerCase().split(/\s+/).includes(first)) : [];
    if (hits.length === 1) ids.push(hits[0].id);
    else out.notes.push(`${who?.name || e} not found in Slack. Add them to both channels by hand.`);
  }
  for (const ch of [internal, client]) {
    if (!ids.length) break;
    let j = await slack(ch.by, 'conversations.invite', { channel: ch.id, users: ids.join(',') });
    if (!j.ok && j.error !== 'already_in_channel') {
      /* One bad id fails the whole call: go one by one. */
      for (const id of ids) { j = await slack(ch.by, 'conversations.invite', { channel: ch.id, users: id }); if (!j.ok && !/already_in_channel|cant_invite_self/.test(j.error)) out.notes.push(`Could not add a teammate to a channel (${j.error}).`); }
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
  const key = (env.STRIPE_SECRET_KEY || '').trim();
  if (!key) throw new Error(NEEDS_STRIPE);
  const res = await F(`https://api.stripe.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' }, body: body ? form(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe: ${j.error?.message || res.status}`);
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
    items: [{ price_data: { currency: 'usd', unit_amount: Math.round(r.retainer * 100), recurring: { interval: 'month' }, product_data: { name: `Mobius Digital retainer: ${r.name}` } } }],
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

/* ---------------- summary ---------------- */
async function stepSummary(env, r) {
  if (!r.slack_internal) throw new Error('No internal channel yet. Make the Slack channels first.');
  const team = safeJson(r.team_json, {});
  const lines = [
    `*${r.name} is set up.* Here is everything in one place:`,
    r.asana_url ? `• Asana project: ${r.asana_url}` : null,
    r.drive_url ? `• Google Drive folder: ${r.drive_url}` : null,
    r.slack_client ? `• Client channel: <#${r.slack_client}>` : null,
    r.token ? `• Their onboarding link: ${ONBOARD_FORM}${r.token}` : null,
    r.website ? `• Website: ${r.website}` : null,
    safeJson(r.steps_json, {}).stripe?.url ? `• First invoice: ${safeJson(r.steps_json, {}).stripe.url}` : null,
    `• Team: strategist ${team.strategist || 'not picked'}, media buyer ${team.buyer || 'not picked'}, editor ${team.editor || 'not picked'}`,
    `Locus posts here when they send the onboarding form.`,
  ].filter(Boolean);
  const j = await slack(env.SLACK_BOT_TOKEN, 'chat.postMessage', { channel: r.slack_internal, text: lines.join('\n'), unfurl_links: false });
  if (!j.ok) throw new Error(`Slack: ${j.error}`);
  return { text: 'Posted in the internal channel.' };
}

const RUN = { asana: stepAsana, onboard: stepOnboard, drive: stepDrive, slack: stepSlack, stripe: stepStripe, email: stepEmail, summary: stepSummary };

/* ---------------- routes (admin) ---------------- */
export async function handleNewClient(request, env, path, json, isAdmin, who) {
  if (!path.startsWith('/api/new-client')) return null;
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  await ensureTable(env);
  const url = new URL(request.url);
  const b = request.method === 'GET' ? Object.fromEntries(url.searchParams) : await request.json().catch(() => ({}));
  try {
    if (path === '/api/new-client/options') {
      const runs = (await env.DB.prepare(`SELECT * FROM p_newclient ORDER BY created_at DESC LIMIT 30`).all()).results || [];
      let team = [], err = null;
      try { team = await teamList(env); } catch (e) { err = e.message; }
      return json({ team, team_error: err, owner: OWNER, runs: runs.map(view), steps: STEPS, stripe: !!(env.STRIPE_SECRET_KEY || '').trim() });
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
      const team = { strategist: String(t.strategist || '').toLowerCase(), buyer: String(t.buyer || '').toLowerCase(), editor: String(t.editor || '').toLowerCase() };
      await env.DB.prepare(`INSERT INTO p_newclient (id, name, website, contact_name, contact_email, retainer, start_date, team_json, slug, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
        .bind(id, name, website || null, String(b.contact_name || '').trim().slice(0, 120) || null, email || null, Number(b.retainer) || null, /^\d{4}-\d{2}-\d{2}$/.test(b.start_date || '') ? b.start_date : null, JSON.stringify(team), slugOf(b.slug || name), (who && await who(request, env).catch(() => null)) || null).run();
      return json({ ok: true, run: view(await getRun(env, id)) });
    }
    const r = b.id ? await getRun(env, String(b.id)) : null;
    if (!r) return json({ error: 'unknown client' }, 404);
    if (path === '/api/new-client/run') return json({ ok: true, run: view(r), welcome: welcomeDraft(r) });
    /* The browser reports the two steps it runs itself (Ledger, the website pre-fill). */
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
      try { res = { status: 'done', ...(await fn(env, r, b)) }; }
      catch (e) { res = { status: 'failed', text: e.message }; }
      const fresh = await getRun(env, r.id);
      const steps = safeJson(fresh.steps_json, {});
      steps[b.step] = { ...res, at: new Date().toISOString() };
      await patchRun(env, r.id, { steps_json: JSON.stringify(steps) });
      const now = await getRun(env, r.id);
      return json({ ok: res.status !== 'failed', step: steps[b.step], run: view(now), welcome: welcomeDraft(now) });
    }
    if (path === '/api/new-client/remove' && request.method === 'POST') {
      /* Forgets the row only. Nothing made in Asana, Drive or Slack is deleted. */
      await env.DB.prepare(`DELETE FROM p_newclient WHERE id = ?1`).bind(r.id).run();
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status && e.status !== 401 ? e.status : 500); }
}

/** On the hourly tick: tell the team the moment a new client sends the onboarding form. */
export async function newClientTick(env) {
  await ensureTable(env);
  const rows = (await env.DB.prepare(`SELECT n.*, o.status AS ob_status FROM p_newclient n JOIN p_br_onboard o ON o.token = n.token WHERE o.status = 'submitted' AND n.slack_internal IS NOT NULL`).all().catch(() => ({ results: [] }))).results || [];
  let told = 0;
  for (const r of rows) {
    const steps = safeJson(r.steps_json, {});
    if (steps.form_ping) continue;
    const team = safeJson(r.team_json, {});
    const j = await slack(env.SLACK_BOT_TOKEN, 'chat.postMessage', { channel: r.slack_internal, unfurl_links: false,
      text: `*${r.name} sent their onboarding form.* Next: open Locus > Brand > ${r.name} > Research and press "Research this brand", then review the answers and the drafts before the strategy call${team.strategist ? ` (${team.strategist})` : ''}.` });
    if (j.ok) { steps.form_ping = { status: 'done', at: new Date().toISOString() }; await patchRun(env, r.id, { steps_json: JSON.stringify(steps) }); told++; }
  }
  return { told };
}
