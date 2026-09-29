/**
 * The BRAND BRAIN (2026-09-29).
 *
 * Cole: the AI across Locus (Studio's brief reader and art director, the copy desk,
 * the Strategist's angle writer) kept coming back vague and generic. The model was
 * fine; the CONTEXT was thin. The brief reader got the brand's name and nothing else,
 * and for a brand with no copy skill the art director was told little more than
 * "you write copy for X". Meanwhile Locus already holds personas, customer quotes,
 * market stage, competitors, every test with its result and learning, the staff's
 * rules and the creator link.
 *
 * brandBrain(env, act_id) assembles ALL of it into ONE markdown block per brand:
 *   1. Brand, products, offers, facts       6. Competitors
 *   2. Staff rules (outrank everything)     7. Angle library + test results
 *   3. Product lines + market                8. Earlier research notes (docs/)
 *   4. Personas                              9. Creator link
 *   5. Voice of customer                    10. How the brand sounds (no full skill)
 *                                           11. GAPS: what is missing, said plainly
 * The order is fixed and there is no timestamp in it, so the prompt cache hits: the
 * brain goes in a cached system block (cache_control) wherever it is used. AI drafts
 * are included but labelled draft. Size: about 60k characters, per-section caps,
 * clip() never splits an emoji.
 *
 * SPECIFICITY is the rule block every creative prompt carries with the brain.
 */
import { clip, safeJson } from './research.js';
import { numOf } from './asana-brand.js';

export const BRAIN_MAX = 60000;

export const SPECIFICITY = `SPECIFICITY RULES (these decide whether the work is any good):
- Tie every angle, line and claim to something in the BRAND BRAIN: a named persona, a customer quote word for word, a past test result, or a product fact. If you cannot tie it to one, do not write it. Where the output has a field for notes, why or reasoning, name what it is tied to there (for example "Weekend Warrior persona" or "test 339 won on this"); never put that reasoning into the ad's own words.
- The swap test: if you could swap in another brand's name and the line still works, it is too vague. Rewrite it until only this brand could say it (its product, its customer's words, its moment).
- Never fill a gap with generic marketing language. If the brain is missing what you need (no persona, no quotes, no proof for a claim), say so plainly in the notes and write with what IS there.
- Staff rules and claim rules outrank everything, including the brief. Never make a claim the rules forbid, and never invent a fact, price, number, review or quote.
- Past tests are evidence: build on what won, and do not repeat what lost unless the brief says why this time is different.
- Awareness and market sophistication decide the opening. Unaware or problem aware: open on the problem or the moment, in the customer's words. Solution aware: open on why what they tried failed. Product or most aware: open on the product, the proof or the offer. A crowded market (stage 3 and up) needs a new mechanism or an identity, not a bigger claim.
- Plain English, like a person talking. No jargon, no hype words, no em dashes anywhere.`;

const AWARE = { most: 'most aware (knows the product, needs a reason to buy now)', product: 'product aware', solution: 'solution aware', problem: 'problem aware', unaware: 'unaware' };
const STAGE = { 1: '1 (first to make the claim)', 2: '2 (others make it, claims get bigger)', 3: '3 (claims worn out, needs a new mechanism)', 4: '4 (mechanisms copied)', 5: '5 (heard it all, sell identity)' };
const PERSONA_FIELDS = [['summary', 'Who'], ['demo', 'Demographics'], ['buys', 'Buys'], ['desire', 'Wants'], ['struggle', 'Struggle'], ['identity', 'Identity'], ['status', 'Status'], ['how_helps', 'How the product helps'], ['beliefs', 'Beliefs'], ['objections', 'Objections'], ['tried_failed', 'Tried and failed'], ['not_tried', 'Not tried yet'], ['trigger', 'Trigger to buy'], ['push', 'Push'], ['pull', 'Pull'], ['anxiety', 'Anxiety'], ['habit', 'Habit'], ['interests', 'Interests'], ['online', 'Online'], ['offline', 'Offline'], ['follows', 'Follows'], ['words', 'Their words']];
const VOC_ORDER = ['pain', 'failed', 'objection', 'desire', 'transformation', 'trigger'];
const VOC_LABEL = { pain: 'Pains', failed: 'Tried and failed', objection: 'Objections', desire: 'Desires', transformation: 'Transformations', trigger: 'Triggers' };
const CAP = { brand: 7000, rules: 4000, lines: 6000, personas: 9000, voc: 8000, comps: 3500, angles: 16000, research: 14500, creator: 6000, voice: 7000 };
/* What gets shortened first when the whole brain runs over the cap. Staff rules never are. */
const TRIM = ['research', 'creator', 'comps', 'voice', 'brand', 'angles', 'voc', 'personas', 'lines'];

const str = v => v == null ? '' : typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.map(str).filter(Boolean).join('; ') : JSON.stringify(v);
const list = v => (Array.isArray(v) ? v : String(v || '').split('\n')).map(str).filter(Boolean);
const one = (s, n) => clip(String(s || '').replace(/\s+/g, ' ').trim(), n);
const draftTag = (status, src) => status && status !== 'approved' ? ` (${status}${src === 'ai' ? ', AI' : ''}, not approved)` : '';
const money = n => '$' + Math.round(n || 0).toLocaleString('en-US');
/* A section never runs past its cap; the cut lands on a line break when it can. */
function capped(text, n) {
  if (text.length <= n) return text;
  const cut = clip(text, n);
  const nl = cut.lastIndexOf('\n');
  return (nl > n * 0.7 ? cut.slice(0, nl) : cut) + '\n(cut for length)';
}

/**
 * @param opts.voice    false leaves out "How the brand sounds" (the caller already has it)
 * @param opts.creator  false leaves out the creator link (the caller already has it)
 * @param opts.max      total character cap (default BRAIN_MAX)
 * @returns { md, size, gaps, has_skill }
 */
export async function brandBrain(env, act, opts = {}) {
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then(r => r.results || []).catch(() => []);
  const first = (sql, ...b) => env.DB.prepare(sql).bind(...b).first().catch(() => null);
  const [acct, lines, docs, personas, voc, comps, angles, batches, onboard, amb] = await Promise.all([
    first(`SELECT act_id, name, currency, target_cpa, target_roas, tw_shop FROM accounts WHERE act_id = ?1`, act),
    q(`SELECT id, name, about, products FROM p_br_line WHERE act_id = ?1 ORDER BY sort, created_at, id`, act),
    q(`SELECT line_id, key, data_json, status, source FROM p_br_doc WHERE act_id = ?1 AND key IN ('profile', 'rules', 'brand_facts', 'market', 'mechanism', 'voice', 'voice_guide', 'voice_speaker', 'voice_skill', 'research_notes')`, act),
    q(`SELECT id, line_id, name, data_json, status, source FROM p_br_persona WHERE act_id = ?1 ORDER BY status = 'approved' DESC, sort, name, id`, act),
    q(`SELECT line_id, kind, quote, source, theme, nugget, status FROM p_br_voc WHERE act_id = ?1 ORDER BY nugget DESC, status = 'approved' DESC, created_at DESC, id LIMIT 200`, act),
    q(`SELECT line_id, name, url, data_json, status FROM p_br_comp WHERE act_id = ?1 ORDER BY status = 'approved' DESC, sort, name, id LIMIT 12`, act),
    q(`SELECT id, line_id, persona_id, name, argument, awareness, lead, status, source FROM p_br_angle WHERE act_id = ?1 ORDER BY name, id`, act),
    q(`SELECT id, num, title, angle_id, level, variable, offer, hypothesis, verdict, asana_result, keep_reason, learning FROM p_br_batch WHERE act_id = ?1
        AND ((verdict IS NOT NULL AND verdict != 'cancelled') OR asana_result IS NOT NULL OR (learning IS NOT NULL AND learning != ''))
        ORDER BY CAST(num AS INTEGER) DESC, id LIMIT 60`, act),
    first(`SELECT answers_json, prefill_json FROM p_br_onboard WHERE act_id = ?1`, act),
    first(`SELECT slug, live, intro, about, audience, avoid_json, rules_json, season_json FROM p_amb_brand WHERE act_id = ?1`, act),
  ]);
  if (!acct) return { md: '', size: 0, gaps: [], has_skill: false };
  const name = acct.name;
  const docOf = (line, key) => docs.find(d => (d.line_id || '') === (line || '') && d.key === key);
  const data = (line, key) => safeJson(docOf(line, key)?.data_json, null);
  const gaps = [];
  const out = [];
  const sec = (key, title, body) => { if (body && body.trim()) out.push({ key, text: capped(`## ${title}\n${body.trim()}`, CAP[key]) }); };

  /* ---- 1. brand, products, offers, facts ---- */
  const profile = data('', 'profile') || {};
  const facts = data('', 'brand_facts');
  const answers = safeJson(onboard?.answers_json, {});
  const said = ['company', 'uvp', 'why_you', 'solves', 'features', 'offers', 'free_ship', 'aov']
    .filter(k => answers[k] && answers[k] !== '__unsure').map(k => `- ${k.replace(/_/g, ' ')}: ${one(str(answers[k]), 500)}`);
  const best = Array.isArray(answers.best_sellers) ? answers.best_sellers.map(r => [r.name, r.price].filter(Boolean).join(' ')).filter(Boolean) : [];
  {
    const b = [];
    const website = profile.website || facts?.website || answers.website || (acct.tw_shop ? `https://${acct.tw_shop}` : '');
    if (website) b.push(`Website: ${website}`);
    if (profile.current_offer) b.push(`Current offer (staff): ${one(profile.current_offer, 400)}`);
    if (profile.free_ship) b.push(`Free shipping from: ${one(profile.free_ship, 60)}`);
    if (acct.target_cpa > 0 || acct.target_roas > 0) b.push(`Targets: ${acct.target_cpa > 0 ? `CPA ${money(acct.target_cpa)}` : ''}${acct.target_cpa > 0 && acct.target_roas > 0 ? ', ' : ''}${acct.target_roas > 0 ? `ROAS ${acct.target_roas}` : ''} (${acct.currency || 'USD'})`);
    if (profile.notes) b.push(`Staff notes: ${one(profile.notes, 1200)}`);
    if (facts) {
      const t = draftTag(docOf('', 'brand_facts')?.status, 'ai');
      b.push(`\n### Brand facts, read from the website${t}`);
      if (facts.uvp) b.push(`What it is, in one line: ${one(facts.uvp, 400)}`);
      if (facts.products?.length) b.push(`Products:\n${facts.products.slice(0, 20).map(p => `- ${one(p.name, 120)}${p.price ? ` | ${one(p.price, 160)}` : ''}${p.what ? ` | ${one(p.what, 260)}` : ''}`).join('\n')}`);
      if (facts.claims?.length) b.push(`Claims the brand makes, and the proof it gives:\n${facts.claims.slice(0, 12).map(c => `- ${one(c.claim, 260)}${c.proof ? ` (proof: ${one(c.proof, 220)})` : ''}`).join('\n')}`);
      if (list(facts.offers).length) b.push(`Offers seen on the site:\n${list(facts.offers).slice(0, 10).map(o => `- ${one(o, 240)}`).join('\n')}`);
      if (facts.notes) b.push(`Notes: ${one(facts.notes, 900)}`);
    }
    if (said.length || best.length) b.push(`\n### What the client told us at onboarding\n${said.join('\n')}${best.length ? `\n- best sellers: ${one(best.join('; '), 500)}` : ''}`);
    sec('brand', `Brand: ${name}`, b.join('\n'));
    if (!facts) gaps.push('No brand facts yet (run Research > Brand to read the website).');
    else if (docOf('', 'brand_facts')?.status !== 'approved') gaps.push('Brand facts are an unreviewed AI draft: check prices and claims before they go on an ad.');
  }

  /* ---- 2. staff rules: these outrank everything ---- */
  {
    const r = [];
    if (profile.dos) r.push(`Always: ${one(profile.dos, 900)}`);
    if (profile.donts) r.push(`Never: ${one(profile.donts, 900)}`);
    if (answers.dos_donts && answers.dos_donts !== '__unsure') r.push(`The client's own dos and don'ts: ${one(str(answers.dos_donts), 900)}`);
    const claimRules = list(safeJson(amb?.rules_json, []));
    if (claimRules.length) r.push(`Claim and filming rules (from the creator link, apply to every ad):\n${claimRules.map(x => `- ${one(x, 300)}`).join('\n')}`);
    const tr = data('', 'rules');
    if (tr && (tr.target_cpa > 0 || tr.judge_spend > 0)) r.push(`How tests are judged: ${tr.target_cpa > 0 ? `target CPA ${money(tr.target_cpa)}` : 'no target CPA'}${tr.judge_spend > 0 ? `, judged after ${money(tr.judge_spend)} spend` : ''}${tr.judge_days > 0 ? ` or ${tr.judge_days} days` : ''}.`);
    sec('rules', 'Staff rules (these outrank everything, including the brief)', r.join('\n'));
    if (!profile.dos && !profile.donts && !claimRules.length) gaps.push('No staff rules on claims (Brand info > Profile: always / never).');
    if (!(acct.target_cpa > 0) && !(tr?.target_cpa > 0)) gaps.push('No target CPA, so no test has a suggested call.');
  }

  /* ---- 3. product lines: market stage, claims made, open ground ---- */
  const lineName = Object.fromEntries(lines.map(l => [l.id, l.name]));
  {
    const r = [];
    for (const l of lines) {
      const m = data(l.id, 'market') || {}, mech = data(l.id, 'mechanism') || {};
      const mt = draftTag(docOf(l.id, 'market')?.status, 'ai'), kt = draftTag(docOf(l.id, 'mechanism')?.status, 'ai');
      const x = [`### ${l.name}`];
      if (l.about) x.push(one(l.about, 500));
      if (l.products) x.push(`Products: ${one(l.products, 400)}`);
      if (m.mass_desire) x.push(`What they want${mt}: ${one(m.mass_desire, 400)}`);
      if (m.awareness) x.push(`Awareness${mt}: ${AWARE[m.awareness] || m.awareness}${m.awareness_why ? `. ${one(m.awareness_why, 300)}` : ''}`);
      if (m.stage) x.push(`Market sophistication${mt}: stage ${STAGE[String(m.stage)] || m.stage}${m.stage_why ? `. ${one(m.stage_why, 300)}` : ''}`);
      if (list(m.claims_made).length) x.push(`Claims the market has already made${mt}:\n${list(m.claims_made).slice(0, 8).map(c => `- ${one(c, 200)}`).join('\n')}`);
      if (list(m.open_ground).length) x.push(`Open ground, nobody is saying this${mt}:\n${list(m.open_ground).slice(0, 8).map(c => `- ${one(c, 220)}`).join('\n')}`);
      if (mech.problem || mech.solution) x.push(`Mechanism${kt}: why what they tried failed: ${one(mech.problem, 350) || 'not known'}. Why this works: ${one(mech.solution, 350) || 'not known'}`);
      r.push(x.join('\n'));
      if (!m.stage && !m.awareness) gaps.push(`No market stage or awareness for the ${l.name} line (run Research > Competitors and Personas).`);
      if (!list(m.open_ground).length && m.stage) gaps.push(`No open ground mapped for the ${l.name} line.`);
    }
    sec('lines', 'Product lines', r.join('\n\n'));
    if (!lines.length) gaps.push('No product lines set up yet.');
  }

  /* ---- 4. personas, every field ---- */
  const personaName = Object.fromEntries(personas.map(p => [p.id, p.name]));
  {
    const r = personas.slice(0, 6).map(p => {
      const d = safeJson(p.data_json, {});
      const f = PERSONA_FIELDS.filter(([k]) => d[k]).map(([k, label]) => `- ${label}: ${one(str(d[k]), 420)}`);
      if (d.awareness) f.unshift(`- Awareness: ${AWARE[d.awareness] || d.awareness}`);
      return `### ${p.name}${p.line_id && lineName[p.line_id] ? ` [${lineName[p.line_id]}]` : ''}${draftTag(p.status, p.source)}\n${f.join('\n')}`;
    });
    sec('personas', 'Personas', r.join('\n\n'));
    if (!personas.length) gaps.push('No personas yet (run Research > Personas and angles).');
    else if (!personas.some(p => p.status === 'approved')) gaps.push('No approved personas yet; the ones here are AI drafts.');
  }

  /* ---- 5. voice of customer, verbatim: nuggets first, then pains, failed, objections ---- */
  {
    const rank = v => (v.nugget ? 0 : 1 + (VOC_ORDER.indexOf(v.kind) + 1 || 9));
    const pick = [...voc].sort((a, b) => rank(a) - rank(b)).slice(0, 40);
    const groups = [['nugget', 'Golden nuggets (could be ad copy almost as is)']].concat(VOC_ORDER.map(k => [k, VOC_LABEL[k]]));
    const r = [];
    for (const [k, label] of groups) {
      const rows = pick.filter(v => k === 'nugget' ? v.nugget : !v.nugget && v.kind === k);
      if (rows.length) r.push(`### ${label}\n${rows.map(v => `- "${one(v.quote, 360)}"${v.source ? ` (${one(v.source, 60)})` : ''}${v.theme ? ` [${one(v.theme, 60)}]` : ''}${v.status !== 'approved' ? ' (draft)' : ''}`).join('\n')}`);
    }
    if (r.length) r.unshift('Word for word. Quote them as written; never tidy their language.');
    sec('voc', `Voice of customer (${pick.length} of ${voc.length} quotes)`, r.join('\n'));
    if (!voc.length) gaps.push('No customer quotes yet (run Research > Voice of customer).');
  }

  /* ---- 6. competitors, short ---- */
  {
    const r = comps.map(c => {
      const d = safeJson(c.data_json, {});
      const bits = [d.price && `price ${one(d.price, 60)}`, d.promise && `promises ${one(d.promise, 160)}`, d.mechanism && `mechanism ${one(d.mechanism, 120)}`, d.weaknesses && `weak on ${one(d.weaknesses, 140)}`, list(d.complaints)[0] && `buyers complain "${one(list(d.complaints)[0], 140)}"`].filter(Boolean);
      return `- ${one(c.name, 80)}${c.line_id && lineName[c.line_id] ? ` [${lineName[c.line_id]}]` : ''}${c.status !== 'approved' ? ' (draft)' : ''}: ${bits.join('; ')}`;
    });
    sec('comps', 'Competitors', r.join('\n'));
    if (!comps.length) gaps.push('No competitors mapped yet (run Research > Competitors).');
  }

  /* ---- 7. angle library with test results (Triple Whale, lastPlatformClick) ---- */
  {
    const stats = await batchNumbers(env, act, batches).catch(() => ({}));
    const byAngle = {};
    for (const b of batches.slice(0, 40)) (byAngle[b.angle_id || ''] ||= []).push(b);
    const angleById = Object.fromEntries(angles.map(a => [a.id, a]));
    const resultOf = b => b.verdict && b.verdict !== 'cancelled' ? `${b.verdict.toUpperCase()} (called)`
      : b.asana_result === 'keep' ? `KEEP RUNNING${b.keep_reason ? ` (${b.keep_reason})` : ''}`
      : b.asana_result ? `${b.asana_result.toUpperCase()} (Asana call, test not closed)` : b.verdict === 'cancelled' ? 'CANCELLED' : 'no call yet';
    const testLine = b => {
      const s = stats[b.id];
      const nums = s && s.spend > 0 ? ` | ${money(s.spend)} spend, ${s.orders ? `${Math.round(s.orders)} order${Math.round(s.orders) === 1 ? '' : 's'}, CPA ${money(s.spend / s.orders)}` : 'no orders'}, ROAS ${(s.rev / s.spend).toFixed(2)}` : '';
      return `  - Test ${b.num} "${one(b.title, 90)}"${b.level ? ` (${b.level}${b.variable && b.variable !== b.level ? `: ${b.variable}` : ''})` : ''}${b.offer ? ` offer: ${one(b.offer, 80)}` : ''} -> ${resultOf(b)}${nums}${b.learning ? `\n    Learning: ${one(b.learning, 300)}` : b.hypothesis ? `\n    Tested: ${one(b.hypothesis, 200)}` : ''}`;
    };
    const order = Object.keys(byAngle); // already most recent first (batches are sorted by number, descending)
    const r = [];
    for (const id of order) {
      const a = angleById[id];
      const head = a ? `- ANGLE "${one(a.name, 90)}"${a.status === 'retired' ? ' (retired)' : a.status === 'proposed' ? ' (proposed by AI, not approved)' : ''}: ${one(a.argument, 260)}${a.persona_id && personaName[a.persona_id] ? ` [for ${personaName[a.persona_id]}]` : ''}${a.awareness ? ` [${a.awareness} aware]` : ''}`
        : '- NO ANGLE FILED';
      r.push(`${head}\n${byAngle[id].map(testLine).join('\n')}`);
    }
    const untested = angles.filter(a => !byAngle[a.id] && a.status !== 'retired');
    if (untested.length) r.push(`\nAngles with no judged test yet:\n${untested.slice(0, 30).map(a => `- "${one(a.name, 90)}"${a.status === 'proposed' ? ' (proposed by AI, not approved)' : ''}: ${one(a.argument, 200)}${a.persona_id && personaName[a.persona_id] ? ` [for ${personaName[a.persona_id]}]` : ''}`).join('\n')}`);
    const nWin = batches.filter(b => b.verdict === 'winner' || (!b.verdict && b.asana_result === 'winner')).length;
    const nLose = batches.filter(b => b.verdict === 'loser' || (!b.verdict && b.asana_result === 'loser')).length;
    if (r.length) r.unshift(`Most recent tests first. Numbers are Triple Whale attributed (last platform click), all time. ${nWin} winners and ${nLose} losers in the tests below.`);
    sec('angles', 'Angle library and past tests', r.join('\n'));
    if (!batches.length) gaps.push('No judged tests with results or learnings yet.');
    if (!angles.length) gaps.push('No angles in the library yet.');
  }

  /* ---- 8. earlier research notes (docs/angles-*.md, loaded 2026-09-29) ---- */
  {
    const rn = data('', 'research_notes');
    if (rn?.md) sec('research', `Earlier research notes (${rn.from || 'team doc'}; any performance numbers in them are older and Meta-reported, the tests above win)`, rn.md.replace(/^(#{1,4}) /gm, '$1## '));
  }

  /* ---- 9. the creator link ---- */
  if (opts.creator !== false && amb) {
    const [secs, ang] = await Promise.all([
      q(`SELECT id, name, line, enabled FROM p_amb_section WHERE act_id = ?1 ORDER BY pinned DESC, sort, created_at, id`, act),
      q(`SELECT section_id, title, argument, who, format, status FROM p_amb_angle WHERE act_id = ?1 ORDER BY sort, created_at, id`, act),
    ]);
    const r = [];
    if (amb.audience) r.push(`Who creators are told we talk to: ${one(amb.audience, 500)}`);
    const season = safeJson(amb.season_json, {});
    if (season.title) r.push(`Season now: ${one(season.title, 80)}${season.line ? `. ${one(season.line, 300)}` : ''}${season.next ? ` Next: ${one(season.next, 120)}` : ''}`);
    for (const s of secs) {
      const a = ang.filter(x => x.section_id === s.id);
      if (!a.length) continue;
      r.push(`### ${s.name}${s.enabled ? '' : ' (switched off)'}${s.line ? `: ${one(s.line, 160)}` : ''}\n${a.map(x => `- ${one(x.title, 90)}${x.status !== 'live' ? ' (draft)' : ''}: ${one(x.argument, 200)}${x.format ? ` [${one(x.format, 40)}]` : ''}`).join('\n')}`);
    }
    const avoid = safeJson(amb.avoid_json, []);
    if (avoid.length) r.push(`### Please stop filming these (what does NOT work)\n${avoid.map(x => `- ${one(x.title, 160)}${x.why ? `: ${one(x.why, 220)}` : ''}`).join('\n')}`);
    sec('creator', `Creator link (/angles/${amb.slug}${amb.live ? '' : ', switched off'})`, r.join('\n'));
  }

  /* ---- 10. how the brand sounds, when there is no full copy skill ---- */
  const skill = data('', 'voice_skill') || {};
  const hasSkill = !!skill.instructions;
  if (opts.voice !== false) {
    if (hasSkill) sec('voice', 'How the brand sounds', `The brand's full copy skill (${skill.source === 'repo' ? 'synced from its repo' : 'built in Locus'}) is loaded separately where copy is written; it wins on how the copy sounds.`);
    else {
      const r = [];
      const speaker = data('', 'voice_speaker')?.md, guide = data('', 'voice_guide')?.md, card = data('', 'voice');
      if (speaker) r.push(`### The speaker (the one person this brand sounds like)${draftTag(docOf('', 'voice_speaker')?.status)}\n${clip(speaker, 3500)}`);
      if (guide) r.push(`### How we write${draftTag(docOf('', 'voice_guide')?.status)}\n${clip(guide, 3500)}`);
      if (card && !guide) r.push(`### Voice card${draftTag(docOf('', 'voice')?.status, 'ai')}\n${card.summary ? one(card.summary, 900) : ''}${list(card.traits).length ? `\nTraits: ${list(card.traits).map(t => one(t, 140)).join('; ')}` : ''}${list(card.say).length ? `\nThey say: ${list(card.say).map(t => `"${one(t, 120).replace(/^"+|"+$/g, '')}"`).join(', ')}` : ''}${list(card.avoid).length ? `\nThey avoid: ${list(card.avoid).map(t => one(t, 120)).join('; ')}` : ''}${list(card.examples).length ? `\nExamples: ${list(card.examples).slice(0, 6).map(t => one(t, 200)).join(' / ')}` : ''}`);
      sec('voice', 'How the brand sounds', r.join('\n\n'));
    }
  }
  if (!hasSkill) gaps.push(data('', 'voice_guide')?.md ? 'No full copy skill (Brand info > Build the full skill).' : 'No copy skill and no voice interview yet: the voice here is a short AI read of the website.');
  else if (skill.source !== 'repo' && docOf('', 'voice_skill')?.status !== 'approved') gaps.push('The copy skill is a built draft, not approved yet.');

  /* ---- 11. GAPS, always last and never cut ---- */
  const head = `# BRAND BRAIN: ${name}\nEverything Locus knows about ${name}, in one place. Items marked draft are AI research nobody has approved yet: use them, but prefer approved items when they disagree. Staff rules outrank everything.`;
  const tail = `## GAPS (what Locus does not know yet; never fill these with generic language)\n${gaps.length ? gaps.map(g => `- ${g}`).join('\n') : '- None worth flagging.'}`;
  const max = opts.max || BRAIN_MAX;
  const room = max - head.length - tail.length - 4;
  /* Over the total: halve the least important sections first (older notes before fresh
     research; staff rules never), in a fixed order so the result stays deterministic. */
  const total = () => out.reduce((n, x) => n + x.text.length + 2, 0);
  for (let pass = 0; pass < 4 && total() > room; pass++) {
    for (const k of TRIM) {
      const x = out.find(o => o.key === k);
      if (x && total() > room) x.text = capped(x.text, Math.max(600, Math.floor(x.text.length / 2)));
    }
  }
  let body = out.map(x => x.text).join('\n\n');
  if (body.length > room) body = capped(body, room);
  /* No em dashes anywhere (Mobius house rule): the data carries some, and a prompt full of them invites more. */
  const md = `${head}\n\n${body}\n\n${tail}`.replace(/\s*—\s*/g, ', ');
  return { md, size: md.length, gaps, has_skill: hasSkill };
}

/* Spend and Triple Whale results per test, matched the way the Brand tab does it: the
   number that starts the ad name, or a manual tag. Four queries for the whole brand. */
async function batchNumbers(env, act, batches) {
  if (!batches.length) return {};
  const q = (sql) => env.DB.prepare(sql).bind(act).all().then(r => r.results || []);
  const [ads, tags, spend, tw] = await Promise.all([
    q(`SELECT ad_id, name FROM ads WHERE act_id = ?1`),
    q(`SELECT ad_id, batch_id FROM p_br_adtag WHERE act_id = ?1`),
    q(`SELECT ad_id, SUM(spend) spend FROM ad_daily WHERE act_id = ?1 GROUP BY ad_id`),
    q(`SELECT ad_id, SUM(revenue) rev, SUM(orders) orders FROM tw_ad_attr WHERE act_id = ?1 AND model = 'lastPlatformClick' GROUP BY ad_id`),
  ]);
  const want = new Map(batches.map(b => [String(parseInt(b.num, 10)), b.id]));
  const ids = new Set(batches.map(b => b.id));
  const tag = Object.fromEntries(tags.map(t => [t.ad_id, t.batch_id]));
  const sp = Object.fromEntries(spend.map(r => [r.ad_id, r.spend || 0]));
  const tv = Object.fromEntries(tw.map(r => [r.ad_id, r]));
  const out = {};
  for (const a of ads) {
    const bid = tag[a.ad_id] || want.get(numOf(a.name));
    if (!bid || !ids.has(bid)) continue;
    const o = (out[bid] ||= { spend: 0, rev: 0, orders: 0 });
    o.spend += sp[a.ad_id] || 0; o.rev += tv[a.ad_id]?.rev || 0; o.orders += tv[a.ad_id]?.orders || 0;
  }
  return out;
}

/* The brain as a cached system block. Anthropic allows four cache breakpoints per
   request; every caller here uses at most two. */
export const brainBlock = md => ({ type: 'text', text: md, cache_control: { type: 'ephemeral' } });
