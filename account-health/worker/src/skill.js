/**
 * A brand's COPY SKILL inside Locus (2026-09-25).
 *
 * Cole: Lucky Golf's Claude skill (lucky-golf-copy: SKILL.md + six reference files)
 * must work the same inside Locus, stay in step when the skill changes, and every
 * other brand should end up with a skill just as complete.
 *
 *   p_br_doc key 'voice_skill' = { name, description, instructions, files: [{ path,
 *     role, md }], source: 'repo' | 'built', commit, synced_at, gaps: [question] }
 *
 * - SYNCED (Lucky): the Lucky repo's post-commit hook posts every file of the skill to
 *   POST /api/voice/skill-sync (Bearer SKILL_SYNC_TOKEN) whenever a commit touches it.
 *   Locus never edits a synced skill; the repo is the source of truth.
 * - BUILT (every other brand): "Build the full skill" drafts each file from what Locus
 *   knows (voice interview, bank, onboarding answers, research, the website), using
 *   Lucky's matching file as the model of shape and depth, never of content. Anything
 *   the data cannot answer becomes a question; "Ask the client" puts those questions at
 *   the front of the brand's voice interview.
 * - The copy desk hands the model the whole skill, the way Claude loads it: the
 *   instructions, then every reference file. That is why Locus and Claude agree.
 */
import { claude, jsonOf, VOICE, clip, safeJson } from './research.js';

const S = { type: 'string' };
const arr = items => ({ type: 'array', items });
const obj = props => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
const WEB_FETCH = { type: 'web_fetch_20250910', name: 'web_fetch' };
const WEB_SEARCH = { type: 'web_search_20250305', name: 'web_search' };

/* The seven parts of a copy skill, in Lucky's layout. The role is how Locus knows a
   file; the path is where it sits in the skill folder. */
export const ROLES = [
  ['instructions', 'SKILL.md', 'How to use the skill: what to read, when, and the rules'],
  ['speaker', 'references/the-speaker.md', 'The one person the brand sounds like, in their own words'],
  ['guide', 'references/how-we-write.md', 'How the brand sounds'],
  ['facts', 'references/product-reference-guide.md', 'Every product fact: specs, materials, prices, sizes, CTAs'],
  ['benefits', 'references/spec-to-benefit.md', 'How each spec becomes a reason to buy'],
  ['culture', 'references/customer-culture.md', 'How the customers actually talk'],
  ['formats', 'references/prompt-patterns.md', 'What each format is for (ad, email, description...)'],
  ['intake', 'references/new-product-intake.md', 'What to ask when a new product arrives'],
];
export function roleOf(path) {
  const p = String(path || '').toLowerCase();
  if (/(^|\/)skill\.md$/.test(p)) return 'instructions';
  if (/speaker|persona|character/.test(p)) return 'speaker';
  if (/how-we-write|voice|tone/.test(p)) return 'guide';
  if (/product-reference|products?\.md|facts/.test(p)) return 'facts';
  if (/spec-to-benefit|benefit/.test(p)) return 'benefits';
  if (/culture|vernacular|lingo/.test(p)) return 'culture';
  if (/prompt-patterns|formats?/.test(p)) return 'formats';
  if (/intake/.test(p)) return 'intake';
  return 'other';
}
/* SKILL.md frontmatter: name + description; the rest is the instructions. */
function splitSkillMd(md) {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(md || '');
  if (!m) return { name: '', description: '', body: md || '' };
  const get = k => (new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(m[1]) || [])[1]?.trim() || '';
  return { name: get('name'), description: get('description'), body: m[2] };
}

/* ---------------- storage (the same p_br_doc row shape as voice.js) ---------------- */
async function getDoc(env, act, key) {
  const r = await env.DB.prepare(`SELECT data_json, status FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = ?2`).bind(act, key).first().catch(() => null);
  return r ? { data: safeJson(r.data_json, {}), status: r.status } : { data: {}, status: null };
}
async function setDoc(env, act, key, data, status, source) {
  const s = JSON.stringify(data);
  if (s.length > 480000) throw Object.assign(new Error('The skill is too big to store (over 480KB).'), { status: 413 });
  await env.DB.prepare(
    `INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', ?2, ?3, ?4, ?5, datetime('now'))
     ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, status = excluded.status, source = excluded.source, updated_at = excluded.updated_at`,
  ).bind(act, key, s, status, source).run();
}
export const getSkill = async (env, act) => (await getDoc(env, act, 'voice_skill')).data;

/* ---------------- 1. sync from the brand's repo ---------------- */
export async function syncSkill(env, b) {
  const files = (Array.isArray(b.files) ? b.files : []).filter(f => f && /\.md$/i.test(f.path || '') && typeof f.content === 'string').slice(0, 30);
  const skillMd = files.find(f => roleOf(f.path) === 'instructions');
  if (!skillMd) throw Object.assign(new Error('No SKILL.md in the upload'), { status: 400 });
  const acct = b.act
    ? await env.DB.prepare(`SELECT act_id, name FROM accounts WHERE act_id = ?1`).bind(b.act).first()
    : await env.DB.prepare(`SELECT act_id, name FROM accounts WHERE lower(name) = lower(?1) AND active = 1`).bind(String(b.brand || '')).first();
  if (!acct) throw Object.assign(new Error(`No brand called "${b.brand}" in Locus`), { status: 404 });
  const head = splitSkillMd(skillMd.content);
  const doc = {
    name: head.name, description: head.description, instructions: head.body,
    files: files.filter(f => f !== skillMd).map(f => ({ path: String(f.path).replace(/^\.?\/+/, ''), role: roleOf(f.path), md: f.content })),
    source: 'repo', repo: clip(b.repo, 200) || null, commit: clip(b.commit, 60) || null, synced_at: new Date().toISOString(), gaps: [],
  };
  await setDoc(env, acct.act_id, 'voice_skill', doc, 'approved', 'repo');
  /* The brand's "How we write" card shows the skill's own guide, so the two never differ. */
  const guide = doc.files.find(f => f.role === 'guide');
  if (guide) {
    const { data: old } = await getDoc(env, acct.act_id, 'voice_guide');
    await setDoc(env, acct.act_id, 'voice_guide', { md: guide.md, version: (old.version || 0) + (old.md === guide.md ? 0 : 1), from: `repo ${doc.commit || ''}`.trim(), written_at: doc.synced_at }, 'approved', 'repo');
  }
  return { brand: acct.name, files: doc.files.length + 1, commit: doc.commit };
}

/* ---------------- 2. the whole skill, as the model reads it ---------------- */
export function skillSystem(name, skill, speakerMd = '') {
  const own = (skill.files || []).some(f => f.role === 'speaker');
  const all = [...(skill.files || []), ...(!own && speakerMd ? [{ path: 'references/the-speaker.md', md: speakerMd }] : [])];
  const files = all.map(f => `<file path="${f.path}">\n${f.md}\n</file>`).join('\n\n');
  return `You are writing copy for ${name} with its copy skill loaded, exactly as Claude would run it. Follow the skill's instructions below to the letter: read the files it says to read, in the order it says, and apply every rule. The reference files it names are all included after the instructions, each inside a <file> tag with its path.

<skill name="${skill.name || name}">
${skill.instructions || ''}
</skill>

${files}

${!own && speakerMd ? 'references/the-speaker.md is the person this brand sounds like, with samples of them talking. Use it to hear the voice; the other files still decide what the copy says and how long it runs.' : ''}`;
}

/* ---------------- 3. build a skill for a brand that has none ---------------- */
const BUILD = obj({ md: S, gaps: arr(S) });
const GAP_RULE = `Where the brand's data does not cover something this file needs, do NOT invent it: write a short line in the file saying what is missing (for example "Price: ask the brand"), and add a plain question to "gaps" that the brand owner could answer by talking, one question per missing thing. Never ask for anything the data already answers.`;

async function brandData(env, act) {
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).all().then(r => r.results || []).catch(() => []);
  const [ob, docs, voc, personas, comps, lines] = await Promise.all([
    env.DB.prepare(`SELECT answers_json, prefill_json FROM p_br_onboard WHERE act_id = ?1`).bind(act).first().catch(() => null),
    q(`SELECT key, data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key IN ('profile', 'voice', 'voice_guide', 'voice_bank', 'voice_interview', 'brand')`, act),
    q(`SELECT kind, quote, theme FROM p_br_voc WHERE act_id = ?1 ORDER BY nugget DESC, created_at DESC LIMIT 80`, act),
    q(`SELECT name, data_json FROM p_br_persona WHERE act_id = ?1 LIMIT 8`, act),
    q(`SELECT name, data_json FROM p_br_comp WHERE act_id = ?1 LIMIT 10`, act),
    q(`SELECT name, about, products FROM p_br_line WHERE act_id = ?1`, act),
  ]);
  const d = Object.fromEntries(docs.map(x => [x.key, safeJson(x.data_json, {})]));
  const answers = safeJson(ob?.answers_json, {}), prefill = safeJson(ob?.prefill_json, {});
  const said = Object.entries({ ...prefill, ...answers }).filter(([, v]) => v && v !== '__unsure').map(([k, v]) => `${k}: ${clip(typeof v === 'string' ? v : JSON.stringify(v), 1500)}`);
  const iv = d.voice_interview || {};
  const bank = d.voice_bank?.items || [];
  return {
    website: d.profile?.website || answers.website || prefill.website || '',
    guide: d.voice_guide?.md || '',
    text: [
      said.length ? `ONBOARDING FORM ANSWERS (the brand's own words; "prefill" ones were read from their website):\n${said.join('\n')}` : 'ONBOARDING FORM: not filled in yet.',
      lines.length ? `PRODUCT LINES:\n${lines.map(l => `- ${l.name}: ${clip(l.about, 400)} (${clip(l.products, 400)})`).join('\n')}` : '',
      (iv.turns || []).length ? `VOICE INTERVIEW WITH THE OWNER:\n${iv.turns.map(t => `Q: ${t.q}\nA: ${t.a || '(skipped)'}`).join('\n\n')}` : 'VOICE INTERVIEW: not done yet.',
      bank.length ? `LINES THE BRAND KEPT OR REJECTED:\n${bank.map(x => `- ${x.verdict === 'yes' ? 'KEPT' : 'REJECTED'} [${x.format}] ${x.text}${x.why ? ` (why: ${x.why})` : ''}`).join('\n')}` : '',
      voc.length ? `CUSTOMERS IN THEIR OWN WORDS (reviews, forums):\n${voc.map(v => `- [${v.kind}${v.theme ? `, ${v.theme}` : ''}] "${clip(v.quote, 400)}"`).join('\n')}` : '',
      personas.length ? `PERSONAS:\n${personas.map(p => `- ${p.name}: ${clip(JSON.stringify(safeJson(p.data_json, {})), 900)}`).join('\n')}` : '',
      comps.length ? `COMPETITORS:\n${comps.map(c => `- ${c.name}: ${clip(JSON.stringify(safeJson(c.data_json, {})), 500)}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n'),
  };
}

/* Lucky's skill is the model of what "complete" looks like. */
async function exemplar(env, exceptAct) {
  const row = await env.DB.prepare(`SELECT d.act_id, d.data_json FROM p_br_doc d JOIN accounts a ON a.act_id = d.act_id WHERE d.key = 'voice_skill' AND d.line_id = '' AND d.source = 'repo' AND d.act_id != ?1 ORDER BY lower(a.name) = 'lucky golf' DESC LIMIT 1`).bind(exceptAct).first().catch(() => null);
  return row ? safeJson(row.data_json, null) : null;
}

export async function buildSkill(env, act, name, emit = () => {}) {
  const current = await getSkill(env, act);
  if (current.source === 'repo') throw Object.assign(new Error(`${name}'s skill is synced from its repo. Change it there.`), { status: 400 });
  const ex = await exemplar(env, act);
  const data = await brandData(env, act);
  const exFile = role => ex?.files?.find(f => f.role === role)?.md || '';
  const files = [], gaps = [];
  const write = async (role, path, what, extra = {}) => {
    emit({ type: 'note', text: `Writing ${what.toLowerCase()}…` });
    const model = exFile(role);
    const m = await claude(env, {
      system: `You write one file of ${name}'s copy skill: the file "${path}", whose job is: ${what}. A copywriter, or an AI, reads it before writing anything for ${name}.
${model ? `Here is the same file from another brand's finished skill (Lucky Golf). Match its SHAPE, DEPTH and level of detail. NEVER carry over its content: no Lucky products, specs, phrases, golf references or examples unless they are genuinely true of ${name}.\n<model_file>\n${clip(model, 30000)}\n</model_file>` : ''}
Write ${name}'s version from ONLY the brand data given, in markdown. Be specific to this brand; a line that could sit in any brand's file is a wasted line. ${GAP_RULE} ${VOICE} Use American English.`,
      user: `${data.text}${extra.user ? `\n\n${extra.user}` : ''}`,
      tools: extra.tools, schema: BUILD, effort: 'medium', maxTokens: 32000,
    }, o => { if (o.type === 'tool') emit({ type: 'note', text: `Reading ${o.input?.url || o.input?.query || ''}` }); });
    const j = jsonOf(m);
    files.push({ path, role, md: String(j.md || '').replace(/\s*\u2014\s*/g, ', ') });
    gaps.push(...(j.gaps || []).map(g => clip(g, 400)));
  };

  await write('facts', 'references/product-reference-guide.md', 'Every product fact: what each product is, specs, materials, sizes, variants, prices, what is included, shipping and guarantee, and the calls to action that fit each product',
    data.website ? { tools: [{ ...WEB_FETCH, max_uses: 12 }, { ...WEB_SEARCH, max_uses: 3 }], user: `Read the website (${data.website}): the home page, every best seller's product page, the collections, FAQ and shipping pages. Every fact in the file must come from the website or the brand's own answers. Note which products' details you could not find.` } : {});
  const facts = files[0].md;
  await write('benefits', 'references/spec-to-benefit.md', 'How each spec or feature becomes a reason to buy: what it physically does, what the customer notices, and the everyday moment where it matters', { user: `THE PRODUCT FACTS FILE YOU JUST WROTE:\n${clip(facts, 20000)}` });
  await write('culture', 'references/customer-culture.md', "How this brand's customers actually talk: the words, slang and in-jokes, the moments and places they use the product, what they complain about, and which words would sound fake");
  await write('formats', 'references/prompt-patterns.md', 'What each kind of copy is for and what the reader should feel or do: ad parts (headline, primary text, callouts, offer badge, button), email subject, opener, body and CTA, product descriptions short and long, landing page hero and sections, product tiles, social captions, video hooks and scripts. Describe purpose, not a fill-in structure', { user: `THE PRODUCT FACTS FILE:\n${clip(facts, 12000)}` });
  await write('intake', 'references/new-product-intake.md', 'The intake to run when the brand brings a product the skill has never covered: what to pull from what they gave, the short batch of questions to ask for what is missing, and which files to add to before writing any copy');
  const speaker = (await buildSpeaker(env, act, name, { emit })).md;
  files.unshift({ path: 'references/the-speaker.md', role: 'speaker', md: speaker });
  const guideMd = data.guide || `# How ${name} writes\n\n(Not written yet. Send ${name} the voice interview, or press "Write the guide" once the copy desk has examples.)`;
  if (!data.guide) gaps.unshift(`Run the voice interview with ${name}: without it the skill has no voice.`);
  files.splice(2, 0, { path: 'references/how-we-write.md', role: 'guide', md: guideMd });

  emit({ type: 'note', text: 'Writing the instructions (SKILL.md)…' });
  const m = await claude(env, {
    system: `You write the SKILL.md instructions for ${name}'s copy skill: the file Claude reads first, which says what the skill is for, which reference files to read every time and which only when a task needs them, the hierarchy when files disagree (facts win on what is TRUE, the guide wins on how it SOUNDS), what to do with a new product (run the intake), and the core rules. The reference files are: ${files.map(f => f.path).join(', ')}.
references/the-speaker.md is the person the brand sounds like, with samples of them talking: tell the writer to read it to hear the voice. Copy stays short and plain like the best DTC brands (Takomo runs 35 to 70 words a description): one big idea said once, specs said not explained, and it stops early.
${ex?.instructions ? `Here is Lucky Golf's SKILL.md body, the model of shape. Adapt it; never copy Lucky specifics.\n<model_file>\n${clip(ex.instructions, 14000)}\n</model_file>` : ''}
"md" is the body only (no frontmatter). "gaps" stays empty unless something is truly missing. ${VOICE}`,
    user: `THE PRODUCT FACTS FILE:\n${clip(facts, 8000)}\n\nTHE GUIDE:\n${clip(guideMd, 6000)}`,
    schema: BUILD, effort: 'medium', maxTokens: 16000,
  });
  const instr = jsonOf(m);
  const products = (/^#+\s*(.+)$/gm.exec(facts) || [])[1] || '';
  const doc = {
    name: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-copy`,
    description: `Write copy in the ${name} brand voice for any format: ads, emails, product descriptions, landing pages, captions, video scripts. Trigger whenever the user asks for copy, writing or drafts for ${name}${products ? ` or its products` : ''}, or to rewrite or improve existing ${name} copy.`,
    instructions: String(instr.md || '').replace(/\s*\u2014\s*/g, ', '), files, source: 'built', built_at: new Date().toISOString(),
    gaps: [...new Set(gaps.map(g => g.trim()).filter(Boolean))].slice(0, 30),
  };
  await setDoc(env, act, 'voice_skill', doc, 'draft', 'built');
  return { files: files.length + 1, gaps: doc.gaps.length };
}

/* ---------------- 4. THE SPEAKER (2026-09-25) ----------------
   Cole: good copy is a person talking. Not rules followed, a human who IS the brand,
   speaking, and the words written down. Every AI failure on Lucky came from writing
   copy-shaped text against a checklist. So each brand gets a SPEAKER: a first-person
   portrait of the one human the brand sounds like, built from the owner's own spoken
   words (the voice interview, transcripts), with verbatim samples of them talking.
   The copy desk then works the way a great copywriter does:
     1. BECOME the speaker (read the portrait and the samples),
     2. SAY IT to one real person in one real moment, out loud, unedited,
     3. WRITE DOWN what was said, cut to the format, keeping the speaker's words,
     4. READ IT BACK as the speaker; anything that reads like writing is said again.
   The rules (bans, checks) only ever run at step 4, never as the way to write. */
export const METHOD = `HOW TO WRITE (this outranks every checklist, which only applies when you read back):
1. Become the speaker. Read the-speaker.md and the samples of them talking until you can hear them. You are not writing for the brand; you are this person.
2. Say it. Picture one real person and one real moment (who they are, where they are, what just happened). Talk to them, out loud, the way you would if they were standing there. Ramble. Do not write copy.
3. Write it down. Take what you said and cut it to the format. Keep your own words and rhythm; cutting is allowed, rewriting into "copy" is not. A headline is the best few words you actually said.
4. Read it back as the speaker. Would you say it to that person without flinching? Anything that sounds announced, written, or like any other brand gets said again, not polished.`;

/* The tells that mark text as AI-written copy. Deterministic, so the read-back can
   point at the exact line. The model's read-back decides what to do about them. */
export const TELLS = [
  [/—/, 'em dash'],
  [/!/, 'exclamation mark'],
  [/\b(?:it'?s|this is|that'?s) not (?:just |only )?(?:a |an |about )?[^.?!]{1,40}[,;.] ?(?:it'?s|this is|that'?s)\b/i, '"not X, it\'s Y"'],
  [/\bnot just\b[^.?!]{1,60}\bbut\b/i, '"not just X but Y"'],
  [/\b(?:elevate|unleash|unlock|game[- ]?changer|next[- ]level|level up|seamless(?:ly)?|effortless(?:ly)?|revolutioni[sz]e|transform(?:ative)?|designed to|crafted (?:for|to)|whether you'?re|say goodbye to|meet the|look no further|take your .{1,20} to the next|the perfect|ultimate|must-have|curated|elevated|iconic|timeless)\b/i, 'stock copy word'],
  [/\b(?:ready to|looking for|tired of)\b[^?]{0,60}\?/i, 'rhetorical question opener'],
  [/(?:^|[.!?]\s)(?:[A-Z][a-z]+\.\s){3,}/, 'three one-word sentences'],
  [/\b(\w+), (\w+),? and (\w+)\b/, 'list of three'],
];
export function tellsIn(text) {
  const t = String(text || '');
  return TELLS.filter(([re]) => re.test(t)).map(([, why]) => why);
}

const SPEAKER = obj({ md: S });
/* The owner's own spoken words: the voice interview verbatim, plus any extra corpus
   (e.g. Cole's messages from the Lucky voice sessions). */
export async function buildSpeaker(env, act, name, { corpus = '', emit = () => {} } = {}) {
  emit({ type: 'note', text: 'Listening to how they talk…' });
  const data = await brandData(env, act);
  const skill = await getSkill(env, act);
  const guide = skill.files?.find(f => f.role === 'guide')?.md || data.guide;
  const m = await claude(env, {
    system: `You write "the-speaker.md" for ${name}'s copy skill: the portrait of the ONE human being this brand sounds like, so that a writer (or an AI) can become that person and simply talk. It is not a style guide and it has no rules. It is a person.

Write it in the FIRST PERSON, as the speaker ("I'm the guy in your group who..."). Cover, in whatever order reads naturally:
- who I am, where I am in life, and my relationship to the thing ${name} sells
- who I'm usually talking to, and where (the range, the group chat, the first tee, the kitchen)
- what I believe, what gets on my nerves, what I love, in my words
- how I talk: my rhythm, how long I go before I get to the point, the words and phrases I actually use, how I tease people, how I get excited, what I do when I'm not sure
- how I'd tell a friend about the products (the order I say things in, not a spec sheet)
- the stories I tell
- what I would never say, because I'm not that person (never phrased as a rule)
Then a section "## How I actually sound": 8 to 20 VERBATIM excerpts of the real owner talking, picked from the transcripts below. Keep their words exactly (fix only obvious speech-to-text errors, like "Tacoma" for "Takomo", and cut filler). These samples matter more than anything else in the file.
Then "## Say it like me": 5 to 8 short scenes (a buddy asks about the product on the range; someone says it looks like a knockoff; a new drop lands; a first-timer asks where to start; a skeptic in the comments) with what I'd actually say, in my voice, built from how they really talk.

The speaker's own spoken words are the evidence. Where the guide and the transcripts disagree on how they sound, the transcripts win. Never invent product facts. No em dashes. American English.`,
    user: `${guide ? `THE BRAND'S WRITING GUIDE (for what they want to sound like):\n${clip(guide, 14000)}\n\n` : ''}${corpus ? `THE OWNER TALKING (verbatim transcripts of them answering questions about the brand by voice; the most important input):\n${clip(corpus, 90000)}\n\n` : ''}${data.text}`,
    schema: SPEAKER, effort: 'high', maxTokens: 24000,
  });
  const md = String(jsonOf(m).md || '').replace(/\s*—\s*/g, ', ');
  await setDoc(env, act, 'voice_speaker', { md, built_at: new Date().toISOString(), from: corpus ? 'transcripts + interview' : 'interview' }, 'draft', 'built');
  return { md };
}
