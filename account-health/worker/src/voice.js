/**
 * The brand voice interview and the copy desk (2026-09-25).
 *
 * Why it exists: Lucky Golf's copy got good because the AI kept asking Cole
 * questions, he talked the answers through (voice to text), it wrote sample
 * lines, he said "that's us" or "that's not us, because...", and every call went
 * back into the guide. This is that loop, for every brand:
 *
 *   1. Interview   onboard/voice.html?t=<onboarding token>. One question at a
 *                  time, the client talks (the browser's speech-to-text), the AI
 *                  follows up when an answer is thin. Twelve topics.
 *   2. Samples     the AI writes lines in eight formats; the client rates each one
 *                  (Sounds like us / Close / Not us, and why). Another round uses
 *                  the ratings.
 *   3. Guide       "How we write", in the shape of Lucky's how-we-write.md. Lands
 *                  as a DRAFT on Locus > Brand > Brand info; a person approves it.
 *   4. Copy desk   staff write lines against the guide in Locus; every keep or
 *                  reject (with the reason) goes into the example bank, and the
 *                  next draft reads the bank. That is the learning.
 *
 * Storage: p_br_doc rows (line_id '') on Locus's shared D1:
 *   voice_interview  { turns, next, covered, stage, round, samples }
 *   voice_guide      { md, version, from }            status draft | approved
 *   voice_bank       { items: [{ id, format, text, verdict yes|no, why, by, at }] }
 *   voice            the short card (summary, traits, say, avoid, examples)
 * Every bank write happens HERE (read, change, write) so the client's ratings and
 * the staff's never overwrite each other.
 */
import { claude, textOf, jsonOf, VOICE, clip, safeJson } from './research.js';
import { skillSystem, syncSkill, buildSkill, getSkill, buildSpeaker, METHOD, tellsIn } from './skill.js';

const S = { type: 'string' };
const arr = items => ({ type: 'array', items });
const obj = props => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });

export const TOPICS = [
  ['story', 'Where it started', 'Tell us how the brand started. Why does it exist, in your own words?'],
  ['customer', 'Who buys', 'Picture your favourite customer. Who are they, and what do they say when they tell a friend about you?'],
  ['pov', 'What you stand against', 'What bugs you about your industry or the big names in it? Say it the way you would if nobody was going to quote you.'],
  ['person', 'The brand as a person', 'If the brand were a person, who would it be? How do they talk with friends, in a group chat, at a dinner?'],
  ['humor', 'How funny', 'How funny is the brand allowed to be? What kind of joke would you make, and what joke would make you cringe?'],
  ['product', 'Your best seller', 'Describe your best seller like you are telling a buddy about it. Do not worry about sounding polished.'],
  ['proof', 'What is real', 'What can you back up? Numbers, reviews, materials, awards, anything real we can point to.'],
  ['words', 'Your words', 'Which words or phrases feel like you? And which ones would you never use?'],
  ['mechanics', 'Style', 'Emojis, exclamation marks, all caps, slang, swearing: yes, no, or sometimes?'],
  ['admire', 'Who you sound like', 'Which brands sound the way you wish you sounded, and which ones would you hate to sound like? Why?'],
  ['examples', 'Lines you loved', 'Any ad, email, caption or line of yours that sounded exactly like you? Any that felt wrong? Paste or describe them.'],
  ['specs', 'Your product, in detail', 'Walk us through your best seller like you are showing it to a friend: what is it made of, what makes it different, and what does each of those things actually do for the person using it?'],
  ['culture', 'How your customers talk', 'How do your customers talk about the thing your product is for? The slang, the in-jokes, the moments they would reach for it.'],
  ['scene_friend', 'Say it: to a friend', 'Let us try something. I am your buddy and I just noticed your gear and asked what it is. Answer me out loud, exactly how you would, like I am standing right there.'],
  ['scene_skeptic', 'Say it: to a skeptic', 'Someone comments on your ad: "looks cheap" or "just buy a real brand". What do you actually say back? Talk it, do not write it.'],
  ['scene_drop', 'Say it: a new drop', 'You just got something new in and you are texting your group chat about it. Say the text out loud.'],
  ['limits', 'Off limits', 'Anything off limits? Topics, claims you legally cannot make, competitors we should never name.'],
];
const TOPIC_IDS = TOPICS.map(t => t[0]);
const FORMATS = ['Ad headline', 'Ad primary text', 'Email subject line', 'Email opener', 'Product description', 'Social caption', 'Video hook (first 3 seconds)', 'Homepage headline'];
const MAX_TURNS = 70, MAX_ROUNDS = 6, MIN_TOPICS_FOR_SAMPLES = 6;

const SCHEMAS = {
  turn: obj({ ack: S, topic: { type: 'string', enum: [...TOPIC_IDS, 'done'] }, question: S, covered: arr({ type: 'string', enum: TOPIC_IDS }) }),
  samples: obj({ samples: arr(obj({ format: S, text: S })) }),
  guide: obj({ md: S, summary: S, traits: arr(S), say: arr(S), avoid: arr(S) }),
  desk: obj({ lines: arr(obj({ text: S, note: S })) }),
  spoken: obj({ spoken: S, lines: arr(obj({ text: S, note: S })) }),
  readback: obj({ lines: arr(obj({ text: S, changed: { type: 'boolean' }, why: S })) }),
};

/* American English for American brands; and a model glitch once dropped a stray
   CJK character into a sample line, so strip those from anything a person reads. */
const US = 'Use American English (buddy, not mate).';
const tidy = t => String(t || '').replace(/[぀-ヿ㐀-鿿가-힯]/g, '').replace(/ {2,}/g, ' ');
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/* ---------------- storage ---------------- */
async function getDoc(env, act, key) {
  const r = await env.DB.prepare(`SELECT data_json, status FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = ?2`).bind(act, key).first().catch(() => null);
  return r ? { data: safeJson(r.data_json, {}), status: r.status } : { data: {}, status: null };
}
async function setDoc(env, act, key, data, status = 'approved', source = 'voice') {
  const s = JSON.stringify(data);
  if (s.length > 190000) throw Object.assign(new Error('The interview is too long to save. Finish it and start the samples.'), { status: 413 });
  await env.DB.prepare(
    `INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', ?2, ?3, ?4, ?5, datetime('now'))
     ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, status = excluded.status, source = excluded.source, updated_at = excluded.updated_at`,
  ).bind(act, key, s, status, source).run();
}
async function brandByToken(env, token) {
  if (!/^[a-f0-9]{24,40}$/.test(token || '')) return null;
  return env.DB.prepare(`SELECT o.act_id, o.answers_json, COALESCE(a.name, o.name) AS name FROM p_br_onboard o LEFT JOIN accounts a ON a.act_id = o.act_id WHERE o.token = ?1`).bind(token).first().catch(() => null);
}
async function bankAdd(env, act, items) {
  const { data } = await getDoc(env, act, 'voice_bank');
  const list = Array.isArray(data.items) ? data.items : [];
  for (const it of items) {
    const i = list.findIndex(x => x.id === it.id);
    if (i >= 0) list[i] = { ...list[i], ...it }; else list.push(it);
  }
  await setDoc(env, act, 'voice_bank', { items: list.slice(-400) });
  return list;
}

/* ---------------- what the model is told ---------------- */
function transcript(iv) {
  return (iv.turns || []).map(t => `[${t.topic}] Q: ${t.q}\nA: ${t.a || '(skipped)'}`).join('\n\n');
}
function bankText(items, limit = 60) {
  const yes = items.filter(x => x.verdict === 'yes').slice(-limit);
  const no = items.filter(x => x.verdict === 'no').slice(-limit);
  return [
    yes.length ? `LINES THE BRAND APPROVED (match the feel, never reuse the phrases):\n${yes.map(x => `- [${x.format}] ${x.text}${x.why ? ` (why: ${x.why})` : ''}`).join('\n')}` : '',
    no.length ? `LINES THE BRAND REJECTED, AND HOW THEY WOULD ACTUALLY SAY IT (the pairs teach the most; the second line is the real voice):\n${no.map(x => `- [${x.format}] WE WROTE: ${x.text}${x.said ? `\n  THEY'D SAY: ${x.said}` : ''}${x.why ? ` (why: ${x.why})` : ''}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}
async function brandFacts(env, act, answersJson) {
  const a = safeJson(answersJson, {});
  const { data: prof } = await getDoc(env, act, 'profile');
  const { data: web } = await getDoc(env, act, 'voice');
  const pick = ['company', 'website', 'uvp', 'why_you', 'solves', 'features', 'dos_donts', 'offers'].map(k => a[k] && a[k] !== '__unsure' ? `${k}: ${clip(typeof a[k] === 'string' ? a[k] : JSON.stringify(a[k]), 700)}` : '').filter(Boolean);
  const best = Array.isArray(a.best_sellers) ? a.best_sellers.map(r => [r.name, r.price].filter(Boolean).join(' ')).filter(Boolean).join('; ') : '';
  return [
    pick.length ? `FROM THEIR ONBOARDING FORM:\n${pick.join('\n')}` : '',
    best ? `BEST SELLERS: ${clip(best, 600)}` : '',
    prof.website ? `WEBSITE: ${prof.website}` : '',
    prof.dos || prof.donts ? `DO: ${clip(prof.dos, 500)}\nNEVER: ${clip(prof.donts, 500)}` : '',
    web.summary ? `VOICE AS READ FROM THEIR WEBSITE (a first guess, the interview wins): ${clip(web.summary, 500)}` : '',
  ].filter(Boolean).join('\n');
}

/* ---------------- the interview ---------------- */
function fresh() {
  const [id, , q] = TOPICS[0];
  return { stage: 'interview', turns: [], covered: [], next: { topic: id, q }, round: 0, samples: [], started_at: now() };
}
function publicState(name, iv) {
  return {
    brand: name, stage: iv.stage, next: iv.next, covered: iv.covered || [], round: iv.round || 0,
    turns: (iv.turns || []).map(t => ({ topic: t.topic, q: t.q, a: t.a })),
    samples: iv.samples || [], topics: TOPICS.map(([id, label]) => ({ id, label })),
    can_sample: (iv.covered || []).length >= MIN_TOPICS_FOR_SAMPLES || (iv.turns || []).length >= 14,
  };
}

async function nextQuestion(env, name, facts, iv) {
  const left = TOPICS.filter(([id]) => !(iv.covered || []).includes(id));
  const m = await claude(env, {
    system: `You interview the owner of ${name} to learn how their brand should SOUND in ads, emails and captions. You work for Mobius Digital, their ad agency. The owner is probably talking, not typing, so answers ramble; that is good.

What you are really collecting is how this person TALKS, because the brand's copy will be written by someone becoming them and speaking. Their own spoken words are worth more than their opinions about their voice. Ask ONE question at a time, short and conversational, the way a curious friend would. Rules:
- When they describe instead of talk ("we're fun and confident"), ask them to just say it: "Say it to me like I'm your buddy." The "Say it" topics are role-play; stay in the scene with them.
- If the last answer was vague, generic or polished ("we're premium and fun"), follow up on THAT answer: ask for a real example, the exact words they would use, or a story. At most two follow-ups on one topic, then move on.
- If the answer was rich, mark the topic covered and move to the most useful topic not covered yet. Use what they already said ("You said the big brands overcharge. How would you say that in an ad?").
- Never ask two things at once. Never lecture, never flatter ("great answer!"). No marketing jargon.
- "ack" is one short, human line that shows you listened (it can be empty). No praise.
- "covered" is every topic that now has enough to write from.
- When every topic is covered, set topic to "done" and question to a short thank-you.
${VOICE} ${US}`,
    user: `${facts}\n\nTOPICS (id: what it is for, starter question):\n${TOPICS.map(([id, l, q]) => `${id}: ${l}. ${q}`).join('\n')}\n\nCOVERED SO FAR: ${(iv.covered || []).join(', ') || 'none'}\nNOT COVERED: ${left.map(t => t[0]).join(', ') || 'none'}\n\nTHE INTERVIEW SO FAR:\n${transcript(iv)}`,
    schema: SCHEMAS.turn, effort: 'low', maxTokens: 3000,
  });
  const j = jsonOf(m);
  const covered = [...new Set([...(iv.covered || []), ...(j.covered || []).filter(x => TOPIC_IDS.includes(x))])];
  return { ack: clip(j.ack, 300), topic: j.topic, q: tidy(clip(j.question, 600)), covered };
}

async function writeSamples(env, name, facts, iv, bank) {
  const rated = (iv.samples || []).filter(s => s.rating);
  const m = await claude(env, {
    system: `You write sample copy for ${name} so the owner can tell you, line by line, whether it sounds like them. Write from the interview: their words, their point of view, their jokes, their limits. Never invent a product fact, a number or a claim they did not give you; keep claims to what they said is real. One line per format unless the format needs two or three sentences (primary text, email opener, product description). Make each line a real attempt at their voice, not a safe average. Vary the attempts so the ratings teach something. ${VOICE} ${US}`,
    user: `${facts}\n\nTHE INTERVIEW:\n${transcript(iv)}\n\n${rated.length ? `HOW THEY RATED THE LAST ROUND (yes = sounds like us, close, no = not us):\n${rated.map(s => `- ${s.rating.toUpperCase()} [${s.format}] ${s.text}${s.why ? ` (their note: ${s.why})` : ''}`).join('\n')}\n\n` : ''}${bankText(bank)}\n\nWrite one line for each format: ${FORMATS.join(', ')}.`,
    schema: SCHEMAS.samples, effort: 'medium', maxTokens: 8000,
  });
  return (jsonOf(m).samples || []).slice(0, 12).map(s => ({ id: rid(), format: clip(s.format, 60), text: tidy(clip(s.text, 1200)), rating: null, why: '' }));
}

/* The guide, in the shape of Lucky Golf's how-we-write.md (the one that worked). */
async function writeGuide(env, act, name, facts, iv, bank, prev) {
  const m = await claude(env, {
    system: `You write "${name}: how we write", a short TONE guide a copywriter (or an AI) reads before writing anything for the brand. It is not a rulebook and not a product sheet. Model it on this structure, in markdown with ## headings:

## Who ${name} is (what they make and the point of view, in a paragraph)
## Who's talking (the person the copy sounds like: how they talk, what they lead with, what they never do)
## Who we're talking to (the customer, in their words)
## Where the personality goes (how loud, where the one big moment lands, how the rest stays confident and plain)
## Words and style (words they use, words they never use; emojis, exclamation marks, caps, slang)
## Proof (what is real and can be claimed; every swagger line needs something real behind it)
## Never (the hard limits)
## Lines we approved (verbatim, each with the format; say "use these to calibrate, don't reuse the phrases")
## Lines that missed, and why (verbatim, with the reason)

Write it from the owner's own answers and ratings; quote their words where they say it best. Be specific to this brand: a line that could sit in any brand's guide is a wasted line. Keep it under about 900 words plus the example lists. "summary", "traits", "say" and "avoid" are the short version for the brand card. ${VOICE} ${US}`,
    user: `${facts}\n\nTHE INTERVIEW:\n${transcript(iv)}\n\n${bankText(bank, 80)}${prev ? `\n\nTHE CURRENT GUIDE (keep what still holds, fold in what the new examples teach):\n${clip(prev, 12000)}` : ''}`,
    schema: SCHEMAS.guide, effort: 'medium', maxTokens: 16000,
  });
  const j = jsonOf(m);
  /* A brand whose skill is synced from its repo (Lucky) keeps the repo's guide; the
     interview's version is kept beside it as a suggestion to fold in by hand. */
  if ((await getSkill(env, act)).source === 'repo') {
    await setDoc(env, act, 'voice_guide_suggested', { md: tidy(clip(j.md, 60000)), written_at: now() }, 'draft');
    return j.md;
  }
  const { data: old } = await getDoc(env, act, 'voice_guide');
  await setDoc(env, act, 'voice_guide', { md: tidy(clip(j.md, 60000)), version: (old.version || 0) + 1, from: 'interview', written_at: now() }, 'draft');
  const yes = bank.filter(x => x.verdict === 'yes').slice(-8).map(x => x.text);
  const { data: card } = await getDoc(env, act, 'voice');
  await setDoc(env, act, 'voice', { ...card, summary: clip(j.summary, 800), traits: (j.traits || []).slice(0, 10), say: (j.say || []).slice(0, 20), avoid: (j.avoid || []).slice(0, 20), examples: yes.length ? yes : (card.examples || []) }, 'draft');
  return j.md;
}

/* A slow write (the guide, a round of samples) streams NDJSON with a ping every
   10s, so Cloudflare's 100s wait for the first byte never cuts it off. The last
   line is { type: 'done', ...result } or { type: 'error', text }. */
function streamed(ctx, work) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter(); const enc = new TextEncoder();
  const put = o => w.write(enc.encode(JSON.stringify(o) + '\n')).catch(() => {});
  const run = (async () => {
    const ping = setInterval(() => put({ type: 'ping' }), 10000);
    try { put({ type: 'done', ...(await work(o => put(o))) }); }
    catch (e) { put({ type: 'error', text: e.status ? e.message : 'The writer is busy. Wait a moment and try again.', detail: e.message }); }
    finally { clearInterval(ping); await w.close().catch(() => {}); }
  })();
  ctx?.waitUntil?.(run);
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}

/* ---------------- routes ---------------- */
export async function handleVoice(request, env, ctx, path, json, isAdmin) {
  if (!path.startsWith('/api/voice')) return null;
  const b = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
  try {
    /* ---- staff: the copy desk, the bank, a guide rewrite ---- */
    if (path.startsWith('/api/voice/staff')) {
      if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
      const acct = b.act && await env.DB.prepare(`SELECT a.act_id, a.name, o.answers_json FROM accounts a LEFT JOIN p_br_onboard o ON o.act_id = a.act_id WHERE a.act_id = ?1`).bind(b.act).first();
      if (!acct) return json({ error: 'pick a brand first' }, 400);
      const A = acct.act_id;
      const bank = (await getDoc(env, A, 'voice_bank')).data.items || [];
      if (path === '/api/voice/staff/desk') return streamed(ctx, async () => {
        const guide = (await getDoc(env, A, 'voice_guide')).data.md || '';
        const card = (await getDoc(env, A, 'voice')).data;
        const facts = await brandFacts(env, A, acct.answers_json);
        const n = Math.max(1, Math.min(10, +b.n || 5));
        const skill = await getSkill(env, A);
        const ask = `FORMAT: ${clip(b.format, 80) || 'Ad headline'}\nBRIEF: ${clip(b.brief, 3000) || '(none: write for the best seller)'}${b.revise?.note ? `\n\nYOUR LAST ROUND:\n${(b.revise.lines || []).slice(0, 10).map((l, i) => `${i + 1}. ${clip(l, 1500)}`).join('\n')}\n\nTHE TEAM'S NOTE ON IT (do what it says; it outranks everything except the facts):\n${clip(b.revise.note, 2000)}` : ''}`;
        const deskRule = `Write ${n} different attempts, each a real take, not ${n} versions of the same sentence. Each attempt is ONE complete, standalone piece of the whole format (a full ad primary text, a full email, a full description), never one piece of a longer piece; each can come from its own take on what you said. "note" is one short line for the team: what the attempt is going for, or a fact you needed and did not have. ${VOICE} ${US}`;
        /* The whole skill, cached: the instructions and every reference file, exactly as
           Claude loads it. The bank rides on top: the lines this brand kept or rejected. */
        const speakerMd = (await getDoc(env, A, 'voice_speaker')).data.md || '';
        const who = clip(b.audience, 400);
        /* 1-3: become the speaker, say it to one person, write it down. */
        const base = skill.instructions
          ? skillSystem(acct.name, skill, speakerMd)
          : `You write copy for ${acct.name}.\n\n${speakerMd ? `<file path="references/the-speaker.md">\n${speakerMd}\n</file>\n\n` : ''}${guide ? `<file path="references/how-we-write.md">\n${clip(guide, 14000)}\n</file>\n\n` : `The short voice card: ${JSON.stringify(card).slice(0, 2000)}\n\n`}${METHOD}`;
        const said = await claude(env, {
          system: [{ type: 'text', text: base, cache_control: { type: 'ephemeral' } }, { type: 'text', text: `${bankText(bank) || ''}\n\n${deskRule}\n\n"spoken" is step 2: you, as the speaker, talking out loud to the person in the scene, unedited, 80 to 250 words. "lines" is step 3: what you said, written down and cut to the format, in your own words.` }],
          user: `${facts}\n\n${ask}\n\nWHO YOU'RE TALKING TO, AND WHERE: ${who || 'pick the most likely customer for this and a real moment in their day'}`,
          schema: SCHEMAS.spoken, effort: 'medium', maxTokens: 14000,
        });
        const first = jsonOf(said);
        let lines = (first.lines || []).slice(0, n).map(l => ({ text: tidy(clip(l.text, 3000)), note: clip(l.note, 300) }));
        /* 4: read it back as the speaker. The tells point at lines that read as writing. */
        try {
          const back = await claude(env, {
            system: [{ type: 'text', text: base, cache_control: { type: 'ephemeral' } }, { type: 'text', text: `Step 4, reading back. You are the speaker. Read each line out loud to the person you were talking to. If it sounds like something you would actually say, keep it exactly. If it sounds written, announced, like an ad, or like any other brand, say it again the way you would really say it, then write that down. Now, and only now, check the skill's rules and bans. Never change a fact. ${VOICE} ${US}` }],
            user: `WHAT YOU SAID OUT LOUD:\n${first.spoken || ''}\n\nTHE LINES:\n${lines.map((l, i) => `${i + 1}. ${l.text}${tellsIn(l.text).length ? `\n   (reads like writing: ${tellsIn(l.text).join(', ')})` : ''}`).join('\n')}`,
            schema: SCHEMAS.readback, effort: 'low', maxTokens: 8000,
          });
          const rb = jsonOf(back).lines || [];
          lines = lines.map((l, i) => rb[i]?.text ? { ...l, text: tidy(clip(rb[i].text, 3000)), redone: !!rb[i].changed, why: clip(rb[i].why, 300) } : l);
        } catch { /* the read-back is a polish; the written-down lines stand without it */ }
        return { spoken: tidy(clip(first.spoken, 4000)), lines: lines.map(l => ({ id: rid(), ...l, tells: tellsIn(l.text) })), used: skill.instructions ? 'skill' : 'guide' };
      });
      if (path === '/api/voice/staff/bank') {
        if (b.remove) {
          const { data } = await getDoc(env, A, 'voice_bank');
          await setDoc(env, A, 'voice_bank', { items: (data.items || []).filter(x => x.id !== b.remove) });
          return json({ ok: true });
        }
        const it = b.item || {};
        if (!String(it.text || '').trim() || !['yes', 'no'].includes(it.verdict)) return json({ error: 'A line and a verdict are needed' }, 400);
        await bankAdd(env, A, [{ id: it.id || rid(), format: clip(it.format, 60) || 'Other', text: clip(it.text, 1500), verdict: it.verdict, why: clip(it.why, 600), said: clip(it.said, 1500) || undefined, by: clip(it.by, 80) || 'team', at: now() }]);
        return json({ ok: true });
      }
      if (path === '/api/voice/staff/build-speaker') return streamed(ctx, async put => ({ ...(await buildSpeaker(env, A, acct.name, { corpus: clip(b.corpus, 120000), emit: put })) }));
      if (path === '/api/voice/staff/speaker' && b.md != null) { await setDoc(env, A, 'voice_speaker', { md: clip(b.md, 60000), from: 'staff', built_at: now() }, b.approve ? 'approved' : 'draft', 'staff'); return json({ ok: true }); }
      if (path === '/api/voice/staff/build-skill') return streamed(ctx, async put => ({ ...(await buildSkill(env, A, acct.name, put)) }));
      /* Edit one file of a BUILT skill (a synced one is edited in its repo). */
      if (path === '/api/voice/staff/skill-file') {
        const sk = await getSkill(env, A);
        if (sk.source === 'repo') return json({ error: 'This skill is synced from its repo. Edit it there.' }, 400);
        if (b.path === 'SKILL.md') sk.instructions = clip(b.md, 60000);
        else if (b.path) {
          const f = (sk.files || []).find(x => x.path === b.path);
          if (!f) return json({ error: 'unknown file' }, 404);
          f.md = clip(b.md, 120000);
          if (f.role === 'guide') await setDoc(env, A, 'voice_guide', { md: f.md, version: ((await getDoc(env, A, 'voice_guide')).data.version || 0) + 1, from: 'staff' }, 'approved');
        }
        if (Array.isArray(b.gaps)) sk.gaps = b.gaps.map(g => clip(g, 400)).filter(Boolean).slice(0, 30);
        await setDoc(env, A, 'voice_skill', sk, b.approve ? 'approved' : ((await getDoc(env, A, 'voice_skill')).status || 'draft'), 'built');
        return json({ ok: true });
      }
      /* The skill's open questions go to the front of the client's voice interview. */
      if (path === '/api/voice/staff/ask-gaps') {
        const sk = await getSkill(env, A);
        const gaps = (sk.gaps || []).filter(Boolean);
        if (!gaps.length) return json({ error: 'No open questions.' }, 400);
        const { data: iv0 } = await getDoc(env, A, 'voice_interview');
        const iv = iv0.stage ? iv0 : fresh();
        iv.gaps = gaps; iv.gap_i = 0; iv.stage = 'interview';
        iv.next = { topic: 'gaps', q: gaps[0], ack: 'A few more questions so we get your products exactly right.' };
        await setDoc(env, A, 'voice_interview', iv);
        return json({ ok: true, asked: gaps.length });
      }
      if (path === '/api/voice/staff/guide') {
        if ((await getSkill(env, A)).source === 'repo') return json({ error: `${acct.name}'s guide comes from its synced skill. Change it in the repo.` }, 400);
        const iv = (await getDoc(env, A, 'voice_interview')).data;
        const prev = (await getDoc(env, A, 'voice_guide')).data.md || '';
        if (!(iv.turns || []).length && !bank.length) return json({ error: 'Nothing to write from yet: the interview is empty and the example bank is empty.' }, 400);
        return streamed(ctx, async () => ({ md: await writeGuide(env, A, acct.name, await brandFacts(env, A, acct.answers_json), iv, bank, prev) }));
      }
      return json({ error: 'not found' }, 404);
    }

    /* ---- a brand repo's post-commit hook: the whole skill, every time it changes ---- */
    if (path === '/api/voice/skill-sync' && request.method === 'POST') {
      const auth = request.headers.get('Authorization') || '';
      if (!env.SKILL_SYNC_TOKEN || auth !== `Bearer ${env.SKILL_SYNC_TOKEN}`) return json({ error: 'unauthorized' }, 401);
      return json({ ok: true, ...(await syncSkill(env, b)) });
    }

    /* ---- public: the client's interview, by onboarding token ---- */
    const token = request.method === 'GET' ? new URL(request.url).searchParams.get('t') : b.token;
    const row = await brandByToken(env, token);
    if (!row) return json({ error: 'This link is not valid. Ask your Mobius contact for a new one.' }, 404);
    const A = row.act_id;
    let iv = (await getDoc(env, A, 'voice_interview')).data;
    if (!iv.stage) iv = fresh();
    const save = () => setDoc(env, A, 'voice_interview', iv);

    if (path === '/api/voice/state' && request.method === 'GET') return json(publicState(row.name, iv));

    if (path === '/api/voice/answer' && request.method === 'POST') {
      if (iv.stage !== 'interview') return json(publicState(row.name, iv));
      if ((iv.turns || []).length >= MAX_TURNS) { iv.next = { topic: 'done', q: 'That is plenty. Let us write some sample lines.' }; await save(); return json(publicState(row.name, iv)); }
      const a = clip(b.answer, 6000).trim();
      if (!a && !b.skip) return json({ error: 'Say or type an answer first, or skip this one.' }, 400);
      iv.turns.push({ topic: iv.next.topic, q: iv.next.q, a: b.skip ? '' : a, at: now() });
      if (b.skip && !iv.covered.includes(iv.next.topic)) {
        /* A skipped topic counts as covered, so it is not asked again. */
        const skips = iv.turns.filter(t => t.topic === iv.next.topic && !t.a).length;
        if (skips >= 1) iv.covered.push(iv.next.topic);
      }
      await save();
      /* The skill's open questions, asked in order before the normal topics resume. */
      if (iv.turns[iv.turns.length - 1].topic === 'gaps') {
        iv.gap_i = (iv.gap_i || 0) + 1;
        if (iv.gap_i < (iv.gaps || []).length) { iv.next = { topic: 'gaps', q: iv.gaps[iv.gap_i] }; await save(); return json(publicState(row.name, iv)); }
        iv.gaps = []; iv.gap_i = 0;
      }
      const facts = await brandFacts(env, A, row.answers_json);
      try {
        const n = await nextQuestion(env, row.name, facts, iv);
        iv.covered = n.covered;
        iv.next = { topic: n.topic, q: n.q, ack: n.ack };
      } catch {
        /* The AI is down: fall back to the next starter question so the client is never stuck. */
        const t = TOPICS.find(([id]) => !iv.covered.includes(id) && !iv.turns.some(x => x.topic === id));
        iv.next = t ? { topic: t[0], q: t[2] } : { topic: 'done', q: 'Thank you. That is everything we need.' };
      }
      await save();
      return json(publicState(row.name, iv));
    }

    if (path === '/api/voice/samples' && request.method === 'POST') {
      if ((iv.round || 0) >= MAX_ROUNDS) return json({ error: 'That is enough rounds. Press Finish and we take it from here.' }, 400);
      return streamed(ctx, async () => {
        const bank = (await getDoc(env, A, 'voice_bank')).data.items || [];
        iv.samples = await writeSamples(env, row.name, await brandFacts(env, A, row.answers_json), iv, bank);
        iv.stage = 'samples'; iv.round = (iv.round || 0) + 1;
        await save();
        return publicState(row.name, iv);
      });
    }

    if (path === '/api/voice/rate' && request.method === 'POST') {
      const s = (iv.samples || []).find(x => x.id === b.id);
      if (!s) return json({ error: 'unknown line' }, 404);
      if (!['yes', 'close', 'no', null].includes(b.rating ?? null)) return json({ error: 'bad rating' }, 400);
      s.rating = b.rating ?? null; s.why = clip(b.why, 600);
      await save();
      /* Yes teaches the bank as a kept line; Close and No teach it as a PAIR: our line,
         and how the client says it instead (their "why" box is "how would you say it?"). */
      if (s.rating === 'yes') await bankAdd(env, A, [{ id: 'c_' + s.id, format: s.format, text: s.text, verdict: 'yes', why: '', by: 'client', at: now() }]);
      else if (s.rating === 'no' || (s.rating === 'close' && s.why)) await bankAdd(env, A, [{ id: 'c_' + s.id, format: s.format, text: s.text, verdict: 'no', why: s.rating === 'close' ? 'close' : '', said: s.why, by: 'client', at: now() }]);
      else {
        const { data } = await getDoc(env, A, 'voice_bank');
        if ((data.items || []).some(x => x.id === 'c_' + s.id)) await setDoc(env, A, 'voice_bank', { items: data.items.filter(x => x.id !== 'c_' + s.id) });
      }
      return json(publicState(row.name, iv));
    }

    if (path === '/api/voice/back' && request.method === 'POST') {
      /* Back to talking from the samples screen. */
      iv.stage = 'interview';
      if (iv.next?.topic === 'done') iv.next = { topic: 'examples', q: 'Anything else about how you sound that we have not asked? Say it the way it comes out.' };
      await save();
      return json(publicState(row.name, iv));
    }

    if (path === '/api/voice/finish' && request.method === 'POST') {
      const bank = (await getDoc(env, A, 'voice_bank')).data.items || [];
      const prev = (await getDoc(env, A, 'voice_guide')).data.md || '';
      iv.stage = 'done'; iv.finished_at = now();
      await save();
      return streamed(ctx, async () => {
        await writeGuide(env, A, row.name, await brandFacts(env, A, row.answers_json), iv, bank, prev);
        return publicState(row.name, iv);
      });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e.status ? e.message : 'The writer is busy. Wait a moment and try again.', detail: e.message }, e.status || 502);
  }
}
