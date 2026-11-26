/* The automations screens: the list, saving and deleting one, and who does what. Team only.
   Running an automation, the workspace switch and a test run stay on the old worker (its timers run them). */
// from account-health/worker/src/automations.js (handleAutomations: /api/automations, /api/automations/people)
import { fail } from '../platform/errors.js';
import { lower, isPlainObject } from '../platform/text.js';
import { ORG, MODES, OPTIONS, ROLES, rid, clip, isEmail } from './words.js';
import { cleanAutomation, sentence } from './sentence.js';
import { TEMPLATES, gallery } from './templates.js';
import { namesOf, rowToAuto, viewOf } from './views.js';
import { meOf, tablesReady, settingsOf, rolesFrom, teamFacts, teamList, onTeam, emailsIn } from './people.js';

const NO_TABLES = 'the automations tables are made by the old worker on first use';
const NO_FACTS = 'the team list needs the agency domain, which only the old worker knows';
const NO_SUCH = 'No automation with that id.';

/* What every handler here starts from: the caller, the settings rows, every brand, the roles. */
async function base(ctx) {
  const me = meOf(ctx);
  if (!(await tablesReady(ctx, me))) return { me, forward: ctx.forward(NO_TABLES) };
  const s = await settingsOf(ctx);
  const accts = await ctx.db.all('automations.allBrands');
  return { me, s, accts, names: namesOf(accts), roles: rolesFrom(s.saved) };
}

async function getRow(ctx, me, id) {
  const r = await ctx.db.one('automations.autoById', { id: String(id || ''), email: me.email });
  return r ? rowToAuto(r) : null;
}

/** GET /api/automations: the list, the template gallery, the last runs and the pick lists. */
export async function listAutomations(ctx) {
  const b = await base(ctx);
  if (b.forward) return b.forward;
  const { me, s, accts, names, roles } = b;
  const facts = await teamFacts(ctx);
  if (!facts) return ctx.forward(NO_FACTS);
  const rows = (await ctx.db.all('automations.autosSeen', { email: me.email })).map(rowToAuto);
  const ids = new Set(rows.map(a => a.id));
  const runs = (await ctx.db.all('automations.runsRecent')).filter(r => ids.has(r.automation_id));
  const used = new Set(rows.filter(a => a.state === 'on').map(a => a.template).filter(Boolean));
  const team = await teamList(ctx, s, facts);
  return { power: s.power, can_power: me.owner, can_edit: !me.viewer, can_clients: me.owner,
    automations: rows.map(a => viewOf(a, names, roles, accts)),
    templates: gallery().map(t => ({ ...t, on: used.has(t.key) })),
    runs: runs.map(r => ({ ...r, brand: names[r.brand_id] || null })),
    brands: accts.filter(a => me.sees(a.act_id)).map(a => ({ id: a.act_id, name: a.name })),
    options: OPTIONS, modes: MODES, team_size: team.length,
    note: s.power ? null : 'Automations are switched off for this workspace. You can set them up and try them. Nothing runs until the owner switches them on.' };
}

/** GET /api/automations/test: the old worker has no GET here (a test run is a POST) and says not found. */
export async function noGetTest() {
  fail(404, 'not found');
}

async function brandIdOf(ctx, accts, brand) {
  if (accts.some(x => x.act_id === brand)) return brand;
  const row = (await ctx.db.one('platform.brandByAnyId', { id: brand })) || (await ctx.db.one('platform.brandByAlias', { id: brand }));
  return row && row.id ? row.id : brand;
}

/* What a save holds, cleaned and checked. Returns { automation }, { error, status } or { forward: why }.
   A save that switches an automation on, or that names a client, is the old worker's: its timers run it,
   and only it can tell a client login from a team one. */
async function fromBody(ctx, b, src) {
  let given = src;
  if (given && given.template && !given.when) {
    const t = TEMPLATES.find(x => x.key === given.template);
    if (!t) return { error: 'No template with that name.' };
    if (!t.ready) return { error: `That one is not ready yet. It waits for ${t.waits}.` };
    given = { ...t.automation, ...given };
  }
  const c = cleanAutomation(given, { owner: b.me.owner });
  if (c.error) return c;
  const a = c.automation;
  if (a.brand !== 'all') {
    const id = await brandIdOf(ctx, b.accts, a.brand);
    if (!b.accts.some(x => x.act_id === id)) return { error: 'No brand with that id.' };
    a.brand = id;
  }
  if (!b.me.sees(a.brand)) return { error: 'You can set automations for your own brands only. Pick one.', status: 403 };
  if (a.tell.who.some(p => p.kind === 'clients' || (p.kind === 'person' && b.s.clients[p.email]))) return { forward: 'this automation names a client, the old worker decides who may save it' };
  if (a.state === 'on') return { forward: 'switching an automation on stays on the old worker, its timers run it' };
  if (!(src && src.custom_name === true && a.name)) a.name = clip(sentence(a, { brandName: b.names[a.brand] }).text, 200);
  return c;
}

const kindOf = a => (a.do.some(x => x.type === 'draft_report') ? 'report' : a.do.some(x => x.type === 'ai_check') ? 'check' : 'rule');

/** PUT /api/automations: save one automation (new, changed, or switched off). */
export async function saveAutomation(ctx, input) {
  const body = isPlainObject(input.body) ? input.body : {};
  const b = await base(ctx);
  if (b.forward) return b.forward;
  const { me } = b;
  const have = body.id ? await getRow(ctx, me, body.id) : null;
  if (body.id && !have) fail(404, NO_SUCH);
  const c = await fromBody(ctx, b, have ? { ...have, ...body } : body);
  if (c.error) fail(c.status || 400, c.error);
  if (c.forward) return ctx.forward(c.forward);
  const a = c.automation;
  const now = ctx.now.toISOString();
  const id = have ? have.id : rid('au_');
  const cols = { id, brand: a.brand, name: a.name, when: JSON.stringify(a.when), if: JSON.stringify(a.if), do: JSON.stringify(a.do),
    tell: JSON.stringify(a.tell), state: a.state, alone: a.may_act_alone ? 1 : 0, now };
  if (have) await ctx.db.run('automations.autoUpdate', { ...cols, email: me.email });
  else {
    await ctx.db.run('automations.autoInsert', { ...cols, org: ORG, scope: a.brand === 'all' ? 'org' : 'brand',
      owner: me.named ? me.email : null, template: a.template, kind: kindOf(a), by: me.email });
  }
  const saved = await getRow(ctx, me, id);
  return { ok: true, power: b.s.power, automation: viewOf(saved, b.names, b.roles, b.accts) };
}

/** DELETE /api/automations?id=: delete one automation and the choices people saved for it. */
export async function deleteAutomation(ctx, input) {
  const me = meOf(ctx);
  if (!(await tablesReady(ctx, me))) return ctx.forward(NO_TABLES);
  const have = await getRow(ctx, me, input.query.id);
  if (!have) fail(404, NO_SUCH);
  await ctx.db.run('automations.autoDelete', { id: have.id, email: me.email });
  await ctx.db.run('automations.autoSubsDelete', { id: have.id });
  return { ok: true };
}

function peopleAnswer(b, s, team) {
  const { me, accts } = b;
  const now = rolesFrom(s.saved);
  const byHand = emailsIn(s.saved.team);
  const mine = accts.filter(a => a.active !== 0 && me.sees(a.act_id));
  return { ok: true, can_edit: !me.viewer, can_all: !me.viewer && !me.only, can_team: me.owner, role_words: ROLES,
    roles: Object.fromEntries(Object.entries(now).filter(([k]) => (k === 'all' ? true : me.sees(k)))),
    brands: mine.map(a => ({ id: a.act_id, name: a.name })),
    team: team.map(e => ({ email: e, by_hand: byHand.includes(e) })),
    note: 'A role nobody holds falls back to the person who made the automation, and the run log says so. "The whole team" is everyone on the team list.' };
}

/** GET /api/automations/people: the person behind each role, per brand, and the team list. */
export async function getPeople(ctx) {
  const b = await base(ctx);
  if (b.forward) return b.forward;
  const facts = await teamFacts(ctx);
  if (!facts) return ctx.forward(NO_FACTS);
  return peopleAnswer(b, b.s, await teamList(ctx, b.s, facts));
}

/* The roles a save asks for, laid over the saved ones. Stops with the old words when one is not allowed. */
function nextRoles(b, facts, asked) {
  const { me, accts, s } = b;
  const next = { ...b.roles };
  for (const [brand, set] of Object.entries(isPlainObject(asked) ? asked : {})) {
    if (brand === 'all' ? !!me.only : !(accts.some(x => x.act_id === brand) && me.sees(brand))) {
      fail(403, brand === 'all' ? 'Only someone who sees every brand can set a role for every brand.' : 'You can set who does what for your own brands only.');
    }
    const one = { ...(next[brand] || {}) };
    for (const [role, v] of Object.entries(set && typeof set === 'object' ? set : {})) {
      if (!ROLES[role]) continue;
      const e = lower(v);
      if (!e) { delete one[role]; continue; }
      if (!isEmail(e)) fail(400, `"${clip(v, 60)}" is not an email.`);
      if (!onTeam(facts, s, e)) fail(400, `${e} is not on the team, so they cannot be ${ROLES[role]}. Add them to the team first.`);
      one[role] = e;
    }
    if (Object.keys(one).length) next[brand] = one; else delete next[brand];
  }
  return next;
}

/* The names added to the team list by hand, after this save. Only the owner changes it. */
function nextTeam(b, facts, body) {
  const added = new Set(emailsIn(b.s.saved.team));
  if (!(body.team_add || body.team_remove)) return added;
  if (!b.me.owner) fail(403, 'Only the owner changes the team list.');
  for (const v of Array.isArray(body.team_add) ? body.team_add.slice(0, 50) : []) {
    const e = lower(v);
    if (!isEmail(e)) fail(400, `"${clip(v, 60)}" is not an email.`);
    if (!onTeam(facts, b.s, e)) fail(400, `${e} cannot sign in as team yet. Invite them in Team first.`);
    added.add(e);
  }
  for (const v of Array.isArray(body.team_remove) ? body.team_remove : []) added.delete(lower(v));
  return added;
}

/** PUT /api/automations/people: save who does what. One settings row. */
export async function putPeople(ctx, input) {
  const body = isPlainObject(input.body) ? input.body : {};
  const b = await base(ctx);
  if (b.forward) return b.forward;
  const facts = await teamFacts(ctx);
  if (!facts) return ctx.forward(NO_FACTS);
  const next = nextRoles(b, facts, body.roles);
  const added = nextTeam(b, facts, body);
  const saved = { ...next, team: [...added].sort() };
  await ctx.settings.put('automationRoles', JSON.stringify(saved));
  const s = { ...b.s, saved };
  return peopleAnswer(b, s, await teamList(ctx, s, facts));
}
