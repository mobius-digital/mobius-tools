/**
 * CHANGING KLAVIYO FROM LOCUS AND THE STRATEGIST (2026-10-09). Cole: "Should I be able to edit email stuff the same
 * way I can edit ads, with the AI strategist and from within Locus?" Yes, with the same rules as Meta (metawrite.js):
 *
 *   flow_status          a flow live / manual / draft
 *   campaign_draft       a NEW draft campaign: name, audiences (lists and segments by name or id), subject, preview
 *                        text, sender, content from an existing template
 *   campaign_schedule    a draft gets a fixed send time, at least 15 minutes ahead (NEVER "now")
 *   campaign_unschedule  a scheduled campaign goes back to draft (Klaviyo "revert")
 *   campaign_cancel      a scheduled campaign is cancelled for good (Klaviyo "cancel")
 *   campaign_duplicate   a copy of any campaign, as a draft (Locus only)
 *
 * Rules every write keeps:
 *   - the brand's own private key (klaviyo.js keyFor); an Attentive brand is refused;
 *   - look the object up first and show the exact before -> after; apply RE-READS it and refuses if it moved;
 *   - NOTHING IS EVER SENT: no op sends a campaign immediately. Schedule sets a static send time first, reads it back,
 *     and only then creates the send job; a time under 15 minutes ahead is refused;
 *   - a key without the write scope gets the exact fix (which scope, where in Klaviyo); `klaviyoCan` probes it with a
 *     PATCH on an id that cannot exist (403 = scope missing, 404 = scope present), cached an hour (yes) / 5 min (no);
 *   - one manual `activities` row (the Change Log, filed under the brand's Meta account like every manual entry):
 *     event_type `klaviyo_write`, category `email`, actor "<who> in Locus" or "the Strategist, approved by <who>";
 *   - the cached Klaviyo reads for the brand are dropped so the screen shows the new state.
 * Locus calls these through POST /api/klaviyo/write (worker.js); the Strategist through the Apply cards below.
 */
import { klaviyo, keyFor, klaviyoView, bust } from './klaviyo.js';
import { resolveBrandId } from './brands.js';

const SCOPE_FIX = {
  flows: 'flows:write (Flows: Full access)',
  campaigns: 'campaigns:write (Campaigns: Full access)',
  templates: 'templates:read (Templates: Read access)',
};
const MIN_AHEAD_MIN = 15;
const clip = (s, n) => String(s ?? '').slice(0, n);
const parse = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };
const nice = s => String(s || '').replace(/_/g, ' ').toLowerCase();
export const fixFor = (brand, need) => `The ${brand || 'brand'} Klaviyo key cannot do this: it lacks ${SCOPE_FIX[need]}. In Klaviyo > Settings > API keys, create a private key with ${SCOPE_FIX[need]} (keep the read scopes it has), then paste it in Locus > Brand settings > Integrations > Klaviyo. It replaces the old key.`;

/* ---------------- the key, the brand, the scopes ---------------- */
async function emailToolOf(env, act) {
  const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(`emailTool:${act}`).first().catch(() => null);
  return r?.value || 'klaviyo';
}
async function brandRow(env, act) {
  return env.DB.prepare(`SELECT act_id, name, tz, currency, meta_act FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
}
async function keyOf(env, act) {
  if ((await emailToolOf(env, act)) === 'attentive') return { error: 'This brand sends email and SMS with Attentive, which is not connected directly. Nothing can be changed from Locus.' };
  const doc = await keyFor(env, act);
  if (!doc?.key) return { error: 'Klaviyo is not connected for this brand. Brand settings > Integrations > Klaviyo: paste the brand\'s private API key.' };
  return { key: doc.key, doc };
}
/** Which writes the stored key may do: {flows, campaigns, templates} true/false, cached in settings `klvCan:<act>`. */
export async function klaviyoCan(env, act, fresh) {
  const sk = `klvCan:${act}`;
  const hit = parse((await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(sk).first().catch(() => null))?.value, null);
  if (!fresh && hit && Date.now() - Date.parse(hit.at) < (hit.flows && hit.campaigns && hit.templates ? 3600e3 : 300e3)) return hit;
  const k = await keyOf(env, act); if (k.error) return { error: k.error };
  const raw = {};
  const probe = async (path, body, method = 'PATCH') => {
    try { await klaviyo(k.key, path, { method, body }); raw[path] = 200; return true; }
    catch (e) { raw[path] = `${e.status} ${clip(e.said, 80)}`; if (e.status === 403) return false; if (e.status === 401) throw e; return true; }   // 404 / 400 = the scope let us in
  };
  try {
    const out = { probe: raw,
      flows: await probe('/api/flows/LOCUS0/', { data: { type: 'flow', id: 'LOCUS0', attributes: { status: 'draft' } } }),
      campaigns: await probe('/api/campaigns/LOCUSPROBE0/', { data: { type: 'campaign', id: 'LOCUSPROBE0', attributes: { name: 'probe' } } }),
      templates: await probe('/api/templates/?page[size]=1', null, 'GET'),
      at: new Date().toISOString(),
    };
    out.fix = !out.flows ? fixFor(null, 'flows') : !out.campaigns ? fixFor(null, 'campaigns') : !out.templates ? fixFor(null, 'templates') : null;
    out.missing = ['flows', 'campaigns', 'templates'].filter(x => !out[x]).map(x => SCOPE_FIX[x].split(' ')[0]);
    await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(sk, JSON.stringify(out)).run().catch(() => {});
    return out;
  } catch (e) { return { error: e.message }; }
}
/** A 403 on a write is a scope; say which. Anything else passes through as Klaviyo said it. */
const writeErr = (e, brand, need) => e?.status === 403 ? fixFor(brand, need) : `Klaviyo said: ${e?.said || e?.message || 'no answer'}`;

/* ---------------- lookups ---------------- */
async function findFlow(k, want) {
  const w = String(want || '').trim(); if (!w) return { error: 'Which flow? Give its name or id.' };
  if (/^[A-Za-z0-9]{6}$/.test(w)) { try { const r = await klaviyo(k, `/api/flows/${w}/?fields[flow]=name,status,archived,trigger_type`); if (r.data) return { flow: r.data }; } catch {} }
  const rows = []; let next = '/api/flows/?fields[flow]=name,status,archived,trigger_type';
  for (let i = 0; i < 4 && next; i++) { const r = await klaviyo(k, next.replace('https://a.klaviyo.com', '')); rows.push(...(r.data || [])); next = r.links?.next || null; }
  const live = rows.filter(f => !f.attributes?.archived), lw = w.toLowerCase();
  const exact = live.filter(f => String(f.attributes?.name || '').toLowerCase() === lw);
  const hits = exact.length ? exact : live.filter(f => String(f.attributes?.name || '').toLowerCase().includes(lw));
  if (hits.length === 1) return { flow: hits[0] };
  if (!hits.length) return { error: `No flow called "${w}". Flows: ${live.slice(0, 25).map(f => f.attributes?.name).join('; ')}` };
  return { error: `"${w}" matches ${hits.length} flows: ${hits.slice(0, 10).map(f => `${f.attributes?.name} (${f.id})`).join('; ')}. Name one exactly or give its id.` };
}
async function getCampaign(k, id) {
  const r = await klaviyo(k, `/api/campaigns/${encodeURIComponent(id)}/?fields[campaign]=name,status,send_time,scheduled_at,audiences,send_strategy&include=campaign-messages`);
  if (!r.data) return null;
  const m = (r.included || []).find(x => x.type === 'campaign-message');
  return { ...r.data, message: m || null };
}
async function findCampaign(k, want) {
  const w = String(want || '').trim(); if (!w) return { error: 'Which campaign? Give its name or id.' };
  if (/^[A-Z0-9]{20,32}$/i.test(w)) { try { const c = await getCampaign(k, w); if (c) return { campaign: c }; } catch {} }
  const rows = [];
  for (const ch of ['email', 'sms']) {
    let next = `/api/campaigns/?filter=${encodeURIComponent(`equals(messages.channel,'${ch}')`)}&fields[campaign]=name,status,send_time,scheduled_at&sort=-updated_at`;
    for (let i = 0; i < (ch === 'email' ? 3 : 1) && next; i++) { try { const r = await klaviyo(k, next.replace('https://a.klaviyo.com', '')); rows.push(...(r.data || [])); next = r.links?.next || null; } catch { next = null; } }
  }
  const lw = w.toLowerCase();
  const exact = rows.filter(c => String(c.attributes?.name || '').toLowerCase() === lw);
  const hits = exact.length ? exact : rows.filter(c => String(c.attributes?.name || '').toLowerCase().includes(lw));
  if (hits.length === 1) return { campaign: await getCampaign(k, hits[0].id) };
  if (!hits.length) return { error: `No campaign called "${w}" in the latest campaigns.` };
  return { error: `"${w}" matches ${hits.length} campaigns: ${hits.slice(0, 10).map(c => `${c.attributes?.name} (${c.attributes?.status}, ${c.id})`).join('; ')}. Name one exactly or give its id.` };
}
async function audienceIndex(env, act) {
  const v = await klaviyoView(env, act, 'audiences');
  if (v.error) throw new Error(v.error);
  return v;
}
function resolveAudiences(ix, wants) {
  const all = [...(ix.lists || []).map(x => ({ ...x, kind: 'list' })), ...(ix.segments || []).map(x => ({ ...x, kind: 'segment' }))];
  const out = [], bad = [];
  for (const w0 of [].concat(wants || [])) {
    const w = String(w0 || '').trim(); if (!w) continue;
    const lw = w.toLowerCase();
    const byId = all.find(x => x.id === w);
    const exact = all.filter(x => String(x.name || '').toLowerCase() === lw);
    const part = all.filter(x => String(x.name || '').toLowerCase().includes(lw));
    const hit = byId || (exact.length === 1 ? exact[0] : !exact.length && part.length === 1 ? part[0] : null);
    if (hit) out.push(hit); else bad.push(exact.length + part.length > 1 ? `"${w}" matches several (${(exact.length ? exact : part).slice(0, 6).map(x => x.name).join('; ')})` : `no list or segment called "${w}"`);
  }
  return { out, bad };
}
const audNames = (ix, ids) => (ids || []).map(id => { const x = [...(ix?.lists || []), ...(ix?.segments || [])].find(a => a.id === id); return x ? x.name : id; });
function tzOffset(ts, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ts;
}
/** "2026-10-13T09:00" in the brand's zone, or a full ISO time with an offset. */
export function sendAt(s, tz) {
  const v = String(s || '').trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v)) { const t = Date.parse(v); return isNaN(t) ? null : new Date(t); }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/); if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let t = wall; for (let i = 0; i < 2; i++) t = wall - tzOffset(t, tz || 'America/Chicago');
  return new Date(t);
}
const whenText = (d, tz) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d); } catch { return d.toISOString(); } };

/* ---------------- the record ---------------- */
async function logChange(env, act, { summary, reason, by, via, object, objectType, name }) {
  const b = await brandRow(env, act);
  const file = b?.meta_act || act;   // the Change Log is filed by Meta account; a brand with none keeps the row under its own id
  await env.DB.prepare(`INSERT INTO activities (id, act_id, event_time, event_type, category, summary, reason, note, confirmed, manual, actor, object_type, object_id, object_name)
    VALUES (?1, ?2, ?3, 'klaviyo_write', 'email', ?4, ?5, ?6, 1, 1, ?7, ?8, ?9, ?10)`)
    .bind(`manual:${crypto.randomUUID()}`, file, new Date().toISOString(), summary, reason || null, 'Changed in Klaviyo from Locus.',
      via === 'strategist' ? `the Strategist, approved by ${by || 'someone'}` : `${by || 'someone'} in Locus`, objectType, object, name || null).run().catch(() => {});
}

/* ---------------- the operations: propose (no write) and apply ---------------- */
/* propose(env, act, input) -> {summary, detail, before, after, patch} | {error}
   apply(env, patch, ctx {who, via}) -> {ok, note, link?} | {error} */
export const OPS = {
  flow_status: {
    need: 'flows',
    async propose(env, act, input) {
      const k = await keyOf(env, act); if (k.error) return k;
      const to = String(input.status || '').toLowerCase();
      if (!['live', 'manual', 'draft'].includes(to)) return { error: 'Status is live (sending), manual (built but off) or draft.' };
      const f = await findFlow(k.key, input.flow); if (f.error) return f;
      const from = f.flow.attributes?.status, name = f.flow.attributes?.name;
      if (from === to) return { error: `"${name}" is already ${to}.` };
      const what = { live: 'Everyone who triggers it from now gets its messages.', manual: 'Nobody new enters it; people already inside finish where they are.', draft: 'It is taken off and marked unfinished; nobody new enters.' }[to];
      return { summary: `Flow "${name}": ${from} → ${to}`, detail: `${what} Each message inside keeps its own on or off setting in Klaviyo.${input.reason ? `\nWhy: ${clip(input.reason, 300)}` : ''}`,
        before: { status: from }, after: { status: to }, patch: { op: 'flow_status', act, id: f.flow.id, name, from, to, reason: clip(input.reason, 300) || null } };
    },
    async apply(env, p, ctx) {
      const k = await keyOf(env, p.act); if (k.error) return k;
      const now = await klaviyo(k.key, `/api/flows/${p.id}/?fields[flow]=status`).catch(e => ({ e }));
      if (now.e) return { error: writeErr(now.e, null, 'flows') };
      if (now.data?.attributes?.status !== p.from) return { error: `"${p.name}" changed since this was shown (it is ${now.data?.attributes?.status} now). Nothing was written.` };
      try { await klaviyo(k.key, `/api/flows/${p.id}/`, { method: 'PATCH', body: { data: { type: 'flow', id: p.id, attributes: { status: p.to } } } }); }
      catch (e) { return { error: writeErr(e, (await brandRow(env, p.act))?.name, 'flows') }; }
      await logChange(env, p.act, { summary: `Klaviyo flow "${p.name}": ${p.from} → ${p.to}`, reason: p.reason, by: ctx?.who, via: ctx?.via, object: p.id, objectType: 'KLAVIYO_FLOW', name: p.name });
      await bust(env, p.act, ['flows_report', 'overview']);
      return { ok: true, note: `Flow "${p.name}" is ${p.to} now. Logged in the Change Log.` };
    },
  },
  campaign_draft: {
    need: 'campaigns',
    async propose(env, act, input) {
      const k = await keyOf(env, act); if (k.error) return k;
      const name = clip(String(input.name || '').trim(), 120), subject = clip(String(input.subject || '').trim(), 200);
      if (!name) return { error: 'Give the campaign a name.' };
      if (!subject) return { error: 'Give it a subject line.' };
      let ix; try { ix = await audienceIndex(env, act); } catch (e) { return { error: e.message }; }
      const inc = resolveAudiences(ix, input.audiences), exc = resolveAudiences(ix, input.exclude);
      if (inc.bad.length || exc.bad.length) return { error: `Audience: ${[...inc.bad, ...exc.bad].join('; ')}.` };
      if (!inc.out.length) return { error: 'Pick at least one list or segment to send to.' };
      const from_email = String(input.from_email || ix.from_email || '').trim(), from_label = String(input.from_label || ix.from_label || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from_email)) return { error: 'The sender email is missing. Give from_email (the account has no default sender).' };
      let tpl = null;
      if (input.template) {
        const t = String(input.template).trim();
        const tv = await klaviyoView(env, act, 'templates').catch(e => ({ error: e.message }));
        if (tv.error) return { error: /refused/i.test(tv.error) ? fixFor(null, 'templates') : tv.error };
        const lt = t.toLowerCase();
        const hits = (tv.templates || []).filter(x => x.id === t || String(x.name || '').toLowerCase() === lt);
        const part = hits.length ? hits : (tv.templates || []).filter(x => String(x.name || '').toLowerCase().includes(lt));
        if (part.length !== 1) return { error: part.length ? `"${t}" matches ${part.length} templates: ${part.slice(0, 8).map(x => x.name).join('; ')}` : `No template called "${t}".` };
        tpl = { id: part[0].id, name: part[0].name };
      }
      const after = { name, to: inc.out.map(x => `${x.name} (${x.kind})`), ...(exc.out.length ? { not_to: exc.out.map(x => x.name) } : {}), subject, preview: clip(input.preview || '', 200) || null, from: `${from_label || '(no name)'} <${from_email}>`, template: tpl?.name || 'none (add content in Klaviyo)' };
      return { summary: `New draft campaign "${name}" to ${inc.out.map(x => x.name).join(', ')}`,
        detail: `Subject: ${subject}${after.preview ? `\nPreview: ${after.preview}` : ''}\nFrom: ${after.from}\nContent: ${tpl ? `template "${tpl.name}"` : 'none yet'}${exc.out.length ? `\nNot to: ${after.not_to.join(', ')}` : ''}\nIt is created as a DRAFT. Nothing sends until someone schedules it.${input.reason ? `\nWhy: ${clip(input.reason, 300)}` : ''}`,
        before: null, after,
        patch: { op: 'campaign_draft', act, name, subject, preview: after.preview, from_email, from_label, include: inc.out.map(x => x.id), exclude: exc.out.map(x => x.id), include_names: inc.out.map(x => x.name), template: tpl, reason: clip(input.reason, 300) || null } };
    },
    async apply(env, p, ctx) {
      const k = await keyOf(env, p.act); if (k.error) return k;
      const brand = (await brandRow(env, p.act))?.name;
      let r;
      try {
        r = await klaviyo(k.key, '/api/campaigns/', { method: 'POST', body: { data: { type: 'campaign', attributes: {
          name: p.name, audiences: { included: p.include, ...(p.exclude?.length ? { excluded: p.exclude } : {}) },
          'campaign-messages': { data: [{ type: 'campaign-message', attributes: { definition: { channel: 'email', label: p.name, content: { subject: p.subject, preview_text: p.preview || '', from_email: p.from_email, from_label: p.from_label || '' } } } }] } } } } });
      } catch (e) { return { error: writeErr(e, brand, 'campaigns') }; }
      const id = r.data?.id; const mid = r.data?.relationships?.['campaign-messages']?.data?.[0]?.id || (r.included || []).find(x => x.type === 'campaign-message')?.id;
      let tplNote = '';
      if (p.template && mid) {
        try { await klaviyo(k.key, '/api/campaign-message-assign-template/', { method: 'POST', body: { data: { type: 'campaign-message', id: mid, relationships: { template: { data: { type: 'template', id: p.template.id } } } } } }); tplNote = ` Content from "${p.template.name}".`; }
        catch (e) { tplNote = ` The template could not be attached (${writeErr(e, brand, 'templates')}); the draft has no content yet.`; }
      }
      await logChange(env, p.act, { summary: `Klaviyo draft campaign "${p.name}" created (to ${p.include_names.join(', ')}; subject "${p.subject}")`, reason: p.reason, by: ctx?.who, via: ctx?.via, object: id, objectType: 'KLAVIYO_CAMPAIGN', name: p.name });
      await bust(env, p.act, ['campaigns']);
      return { ok: true, id, link: `https://www.klaviyo.com/campaign/${id}/wizard`, note: `Draft "${p.name}" is in Klaviyo.${tplNote} Nothing was sent. Logged in the Change Log.` };
    },
  },
  campaign_schedule: {
    need: 'campaigns',
    async propose(env, act, input) {
      const k = await keyOf(env, act); if (k.error) return k;
      const b = await brandRow(env, act); const tz = b?.tz || 'America/Chicago';
      const at = sendAt(input.at || input.when, tz);
      if (!at) return { error: 'Give the send time, for example 2026-10-14T09:00 (the brand\'s time zone) or a full ISO time.' };
      if (at.getTime() < Date.now() + MIN_AHEAD_MIN * 60e3) return { error: `That is less than ${MIN_AHEAD_MIN} minutes from now. Locus only schedules ahead; it never sends straight away.` };
      if (at.getTime() > Date.now() + 120 * 864e5) return { error: 'That is more than 120 days out.' };
      const f = await findCampaign(k.key, input.campaign); if (f.error) return f;
      const c = f.campaign; const st = c.attributes?.status || '';
      if (!/^draft$/i.test(st)) return { error: `"${c.attributes?.name}" is ${st}, not a draft. Only a draft can be scheduled${/schedul/i.test(st) ? ' (unschedule it first to move it)' : ''}.` };
      let ix = null; try { ix = await audienceIndex(env, act); } catch {}
      const to = audNames(ix, c.attributes?.audiences?.included);
      if (!to.length) return { error: `"${c.attributes?.name}" has no audience yet. Add a list or segment in Klaviyo first.` };
      const subj = c.message?.attributes?.definition?.content?.subject || c.message?.attributes?.content?.subject || null;
      return { summary: `Schedule "${c.attributes?.name}" for ${whenText(at, tz)}`, detail: `Status: draft → scheduled.\nTo: ${to.join(', ')}${subj ? `\nSubject: ${subj}` : ''}\nIt sends at that time unless someone unschedules it before.${input.reason ? `\nWhy: ${clip(input.reason, 300)}` : ''}`,
        before: { status: st }, after: { status: 'Scheduled', send_time: at.toISOString() }, patch: { op: 'campaign_schedule', act, id: c.id, name: c.attributes?.name, at: at.toISOString(), when: whenText(at, tz), reason: clip(input.reason, 300) || null } };
    },
    async apply(env, p, ctx) {
      const k = await keyOf(env, p.act); if (k.error) return k;
      const brand = (await brandRow(env, p.act))?.name;
      if (Date.parse(p.at) < Date.now() + 5 * 60e3) return { error: 'The send time is now less than 5 minutes away. Pick a later time; Locus never sends straight away.' };
      let c; try { c = await getCampaign(k.key, p.id); } catch (e) { return { error: writeErr(e, brand, 'campaigns') }; }
      if (!/^draft$/i.test(c?.attributes?.status || '')) return { error: `"${p.name}" is ${c?.attributes?.status} now, not a draft. Nothing was written.` };
      try { await klaviyo(k.key, `/api/campaigns/${p.id}/`, { method: 'PATCH', body: { data: { type: 'campaign', id: p.id, attributes: { send_strategy: { method: 'static', datetime: p.at, options: { is_local: false } } } } } }); }
      catch (e) { return { error: writeErr(e, brand, 'campaigns') }; }
      /* Read it back: the send job sends by the stored strategy, so it must be the fixed time, never "immediate". */
      const back = await getCampaign(k.key, p.id).catch(() => null);
      const ss = back?.attributes?.send_strategy || {};
      const dt = Date.parse(ss.datetime || ss.options_static?.datetime || '');
      if (ss.method !== 'static' || !(dt > Date.now() + 5 * 60e3)) return { error: `Klaviyo did not keep the send time (it reads ${ss.method || 'nothing'}), so the campaign was NOT scheduled. It is still a draft.` };
      try { await klaviyo(k.key, '/api/campaign-send-jobs/', { method: 'POST', body: { data: { type: 'campaign-send-job', id: p.id } } }); }
      catch (e) { return { error: writeErr(e, brand, 'campaigns') }; }
      await logChange(env, p.act, { summary: `Klaviyo campaign "${p.name}" scheduled for ${p.when}`, reason: p.reason, by: ctx?.who, via: ctx?.via, object: p.id, objectType: 'KLAVIYO_CAMPAIGN', name: p.name });
      await bust(env, p.act, ['campaigns']);
      return { ok: true, note: `"${p.name}" is scheduled for ${p.when}. Unschedule it from Locus or Klaviyo any time before. Logged in the Change Log.` };
    },
  },
  campaign_unschedule: { need: 'campaigns', propose: (env, act, input) => stopPropose(env, act, input, 'revert'), apply: (env, p, ctx) => stopApply(env, p, ctx) },
  campaign_cancel: { need: 'campaigns', propose: (env, act, input) => stopPropose(env, act, input, input.mode === 'unschedule' ? 'revert' : 'cancel'), apply: (env, p, ctx) => stopApply(env, p, ctx) },
  campaign_duplicate: {
    need: 'campaigns',
    async propose(env, act, input) {
      const k = await keyOf(env, act); if (k.error) return k;
      const f = await findCampaign(k.key, input.campaign); if (f.error) return f;
      const c = f.campaign; const name = clip(String(input.name || `${c.attributes?.name} (copy)`).trim(), 120);
      return { summary: `Duplicate "${c.attributes?.name}" as "${name}"`, detail: 'The copy is a draft with the same audience, content and sender. Nothing sends until someone schedules it.',
        before: null, after: { name, status: 'Draft' }, patch: { op: 'campaign_duplicate', act, id: c.id, from: c.attributes?.name, name, reason: clip(input.reason, 300) || null } };
    },
    async apply(env, p, ctx) {
      const k = await keyOf(env, p.act); if (k.error) return k;
      let r; try { r = await klaviyo(k.key, '/api/campaign-clone/', { method: 'POST', body: { data: { type: 'campaign', id: p.id, attributes: { new_name: p.name } } } }); }
      catch (e) { return { error: writeErr(e, (await brandRow(env, p.act))?.name, 'campaigns') }; }
      const id = r.data?.id;
      await logChange(env, p.act, { summary: `Klaviyo campaign "${p.from}" duplicated as draft "${p.name}"`, reason: p.reason, by: ctx?.who, via: ctx?.via, object: id, objectType: 'KLAVIYO_CAMPAIGN', name: p.name });
      await bust(env, p.act, ['campaigns']);
      return { ok: true, id, link: id ? `https://www.klaviyo.com/campaign/${id}/wizard` : null, note: `Draft "${p.name}" is in Klaviyo. Nothing was sent. Logged in the Change Log.` };
    },
  },
};
async function stopPropose(env, act, input, action) {
  const k = await keyOf(env, act); if (k.error) return k;
  const f = await findCampaign(k.key, input.campaign); if (f.error) return f;
  const c = f.campaign; const st = c.attributes?.status || '';
  if (!/schedul|queued|adding recipients|preparing|sending/i.test(st)) return { error: `"${c.attributes?.name}" is ${st}; only a scheduled campaign can be ${action === 'revert' ? 'unscheduled' : 'cancelled'}.` };
  if (action === 'revert' && /sending/i.test(st)) return { error: `"${c.attributes?.name}" is already sending; it can only be cancelled.` };
  const to = action === 'revert' ? 'Draft' : 'Cancelled';
  const tz = (await brandRow(env, act))?.tz;
  const when = c.attributes?.send_strategy?.datetime || c.attributes?.send_time;
  return { summary: `${action === 'revert' ? 'Unschedule' : 'Cancel'} "${c.attributes?.name}"`, detail: `${st} → ${to}.${when ? ` It was set for ${whenText(new Date(when), tz)}.` : ''} ${action === 'revert' ? 'It goes back to a draft that can be edited and scheduled again.' : 'Cancelled for good: Klaviyo cannot send it again (duplicate it to reuse it).'}${input.reason ? `\nWhy: ${clip(input.reason, 300)}` : ''}`,
    before: { status: st }, after: { status: to }, patch: { op: action === 'revert' ? 'campaign_unschedule' : 'campaign_cancel', act, id: c.id, name: c.attributes?.name, from: st, action, reason: clip(input.reason, 300) || null } };
}
async function stopApply(env, p, ctx) {
  const k = await keyOf(env, p.act); if (k.error) return k;
  const brand = (await brandRow(env, p.act))?.name;
  const c = await getCampaign(k.key, p.id).catch(() => null);
  if (!c || c.attributes?.status !== p.from) return { error: `"${p.name}" changed since this was shown (it is ${c?.attributes?.status || 'gone'} now). Nothing was written.` };
  try { await klaviyo(k.key, `/api/campaign-send-jobs/${p.id}/`, { method: 'PATCH', body: { data: { type: 'campaign-send-job', id: p.id, attributes: { action: p.action } } } }); }
  catch (e) { return { error: writeErr(e, brand, 'campaigns') }; }
  const word = p.action === 'revert' ? 'unscheduled (back to draft)' : 'cancelled';
  await logChange(env, p.act, { summary: `Klaviyo campaign "${p.name}" ${word}`, reason: p.reason, by: ctx?.who, via: ctx?.via, object: p.id, objectType: 'KLAVIYO_CAMPAIGN', name: p.name });
  await bust(env, p.act, ['campaigns']);
  return { ok: true, note: `"${p.name}" is ${word}. Logged in the Change Log.` };
}

/** POST /api/klaviyo/write {act, op, input, confirm, expect}: without confirm = the before -> after only; with confirm =
 *  propose again (the server never trusts a patch from the browser), check it still says what was shown, then apply. */
export async function klaviyoWriteRoute(env, body, who) {
  const act = String(body?.act || ''); if (!/^[\w-]{3,80}$/.test(act)) return { status: 400, body: { error: 'Pick a brand first.' } };
  if (body.op === 'can') return { status: 200, body: await klaviyoCan(env, act, !!body.fresh) };
  const op = OPS[body.op]; if (!op) return { status: 400, body: { error: `op is one of can, ${Object.keys(OPS).join(', ')}` } };
  /* The same scope check the Strategist's cards make: a key without the write scope gets the fix before anything else. */
  const can = await klaviyoCan(env, act);
  if (!can.error && can[op.need] === false) return { status: 403, body: { error: fixFor((await brandRow(env, act))?.name, op.need), scope: SCOPE_FIX[op.need] } };
  const p = await op.propose(env, act, body.input || {});
  if (p.error) return { status: 400, body: { error: p.error } };
  if (!body.confirm) { const { patch, ...show } = p; return { status: 200, body: show }; }
  if (body.expect && body.expect !== p.summary) return { status: 409, body: { error: `It changed since you looked: now "${p.summary}". Nothing was written; look again.` } };
  const r = await op.apply(env, p.patch, { who, via: 'locus' });
  return { status: r.error ? 400 : 200, body: r };
}

/* ---------------- the Strategist: one read tool and four Apply cards ---------------- */
async function brandOf(env, d, want, ctx) {
  const w = String(want || ctx?.screen?.act_id || ctx?.screen?.act || '').trim();
  if (!w) return null;
  const accts = await d.listAccounts(env, false);
  const id = await resolveBrandId(env, w).catch(() => w);
  const lw = w.toLowerCase();
  return accts.find(a => a.act_id === id || a.meta_act === w) || accts.find(a => String(a.name).toLowerCase() === lw) || accts.find(a => String(a.name).toLowerCase().includes(lw)) || null;
}
export function klaviyoTools(d) {
  return [{
    def: { name: 'klaviyo_read',
      description: 'Read a brand\'s Klaviyo LIVE through its own key (Klaviyo\'s own attribution, not Triple Whale). what: campaigns (last 60 sent with results + drafts and scheduled ones), flows (every flow with status, 90-day results and per-message results), flow (one flow\'s messages by name; give id), lists, segments, audiences (list and segment names + the default sender, for a draft), templates, daily (180 days by day: email vs SMS revenue, sends, opens, clicks, unsubscribes, spam, bounces, subscribers gained and lost), can (which writes the key allows). Read this before proposing any Klaviyo change, so the card names the right flow or campaign.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, what: { type: 'string', enum: ['campaigns', 'flows', 'flow', 'lists', 'segments', 'audiences', 'templates', 'daily', 'can'] }, id: { type: 'string', description: 'The flow id, for what=flow.' } }, required: ['what'] } },
    run: async (env, input, ctx) => {
      const b = await brandOf(env, d, input.brand, ctx); if (!b) return { is_error: true, text: 'Which brand?' };
      if ((await emailToolOf(env, b.act_id)) === 'attentive') return { is_error: true, text: `${b.name} sends with Attentive, which is not connected directly. Email numbers for it come only from Triple Whale.` };
      try {
        const what = input.what === 'flows' ? 'flows_report' : input.what;
        const r = what === 'can' ? await klaviyoCan(env, b.act_id) : await klaviyoView(env, b.act_id, what, null, { id: input.id, tz: b.tz });
        let out = r;
        if (what === 'daily' && r.days) out = { ...r, days: r.days.slice(-60), by_flow: undefined, by_message: undefined, note: 'Last 60 days shown; the screen holds 180.' };
        const s = JSON.stringify({ brand: b.name, ...out });
        return { text: s.length > 20000 ? s.slice(0, 20000) + '... (trimmed)' : s };
      } catch (e) { return { is_error: true, text: e.message }; }
    },
  }];
}
const REASON = { type: 'string', description: 'Why, in one line with the number behind it (shown on the card and written in the Change Log).' };
function card(d, name, opName, description, props, required) {
  return {
    name, description,
    input_schema: { type: 'object', properties: { brand: { type: 'string' }, ...props, reason: REASON }, required: ['brand', ...required, 'reason'] },
    propose: async (env, input, h, ctx) => {
      const b = await brandOf(env, d, input.brand, ctx); if (!b) return { error: `Which brand? No brand called "${input.brand || ''}".` };
      const can = await klaviyoCan(env, b.act_id); if (can.error) return { error: can.error };
      if (!can[OPS[opName].need]) return { error: fixFor(b.name, OPS[opName].need) };
      const op = opName === 'campaign_cancel' && input.mode === 'unschedule' ? 'campaign_unschedule' : opName;
      const p = await OPS[op].propose(env, b.act_id, input); if (p.error) return p;
      return { summary: `${b.name}: ${p.summary}`, detail: p.detail, patch: { ...p.patch, op } };
    },
    apply: (env, p, h, ctx) => OPS[p.op].apply(env, p, { who: ctx?.who, via: 'strategist' }),
  };
}
export function klaviyoActions(d) {
  return [
    card(d, 'klaviyo_flow_status', 'flow_status', 'Turn a Klaviyo flow live, manual (off, built) or draft. Read klaviyo_read what=flows first. Never switch off a flow that earns without saying what replaces it.',
      { flow: { type: 'string', description: 'The flow name or id.' }, status: { type: 'string', enum: ['live', 'manual', 'draft'] } }, ['flow', 'status']),
    card(d, 'klaviyo_campaign_draft', 'campaign_draft', 'Create a DRAFT email campaign in Klaviyo (nothing sends): name, audiences (list or segment names or ids from klaviyo_read what=audiences), subject, preview text, sender (defaults to the account\'s), content from an existing template (name or id from what=templates). Write the subject and preview in the brand\'s voice.',
      { name: { type: 'string' }, audiences: { type: 'array', items: { type: 'string' } }, exclude: { type: 'array', items: { type: 'string' } }, subject: { type: 'string' }, preview: { type: 'string' }, from_email: { type: 'string' }, from_label: { type: 'string' }, template: { type: 'string' } }, ['name', 'audiences', 'subject']),
    card(d, 'klaviyo_campaign_schedule', 'campaign_schedule', 'Schedule a DRAFT Klaviyo campaign for a fixed time at least 15 minutes ahead. Never immediate. at = "2026-10-14T09:00" in the brand\'s time zone, or a full ISO time.',
      { campaign: { type: 'string', description: 'The campaign name or id.' }, at: { type: 'string' } }, ['campaign', 'at']),
    card(d, 'klaviyo_campaign_cancel', 'campaign_cancel', 'Stop a scheduled Klaviyo campaign. mode unschedule = back to draft (can be fixed and rescheduled); cancel = cancelled for good.',
      { campaign: { type: 'string' }, mode: { type: 'string', enum: ['unschedule', 'cancel'] } }, ['campaign', 'mode']),
  ];
}
export const _test = { resolveAudiences, sendAt, findFlow, OPS };
