/**
 * Brand research engine (2026-09-24). Serves the "Research this brand" button on
 * Locus's Brand tab, the AI duplicate check on the angle library, and the help
 * box + website pre-fill on the client's onboarding link.
 *
 * It lives HERE because this worker holds ANTHROPIC_API_KEY; the tables it writes
 * (p_br_*) are Locus's, in the same shared D1. The browser calls this worker
 * directly (like the Meta tab), so a step can stream its progress for minutes
 * without a proxy buffering it.
 *
 * One run = four steps, each its own request so a closed tab loses at most one:
 *   brand        read the website: products, claims, offers, voice, product lines
 *   competitors  per line: who else sells this, what they promise, market stage
 *   voc          per line: verbatim customer quotes with links
 *   synthesis    per line: personas, awareness, mechanism, angle ideas
 * Everything lands as a DRAFT. Nothing reaches the angle library as "active"
 * until a person approves it. A re-run replaces only the AI's own drafts.
 *
 * Method: Schwartz (mass desire, awareness, sophistication), Georgi's RMBC
 * (research, then the mechanism), Moesta's four forces, and Wiebe-style VOC mining.
 */

const MODEL = 'claude-opus-5';
const API = 'https://api.anthropic.com/v1/messages';
/* The BASIC search and fetch, on purpose. The _20260209 variants add dynamic
   filtering, which runs code between every search: the first real run made 40+
   code calls and took over 25 minutes for one step. */
const WEB_SEARCH = { type: 'web_search_20250305', name: 'web_search' };
const WEB_FETCH = { type: 'web_fetch_20250910', name: 'web_fetch' };

const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const clip = (s, n) => (s == null ? '' : String(s).slice(0, n));

/* Keep in step with PERSONA_Q in onboard/questions.js. */
const PERSONA_KEYS = ['summary', 'demo', 'buys', 'desire', 'struggle', 'identity', 'status', 'how_helps', 'beliefs', 'objections', 'tried_failed', 'not_tried', 'trigger', 'push', 'pull', 'anxiety', 'habit', 'interests', 'online', 'offline', 'follows', 'words'];

const VOICE = `Write in plain English, like a sharp strategist talking to a colleague. Short sentences. No jargon, no hype, no em dashes (use commas or full stops). Quote customers word for word; never tidy up their language. Never invent a fact, a price, a quote or a URL. If you could not find something, say so plainly.`;

/* ---------------- JSON schema helpers (structured outputs) ---------------- */
const S = { type: 'string' };
const N = { type: 'number' };
const B = { type: 'boolean' };
const arr = items => ({ type: 'array', items });
const obj = props => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });

const SCHEMAS = {
  brand: obj({
    website: S, uvp: S,
    products: arr(obj({ name: S, price: S, what: S })),
    lines: arr(obj({ name: S, about: S, products: S, why_separate: S })),
    voice: obj({ summary: S, traits: arr(S), say: arr(S), avoid: arr(S), examples: arr(S) }),
    claims: arr(obj({ claim: S, proof: S })),
    offers: arr(S),
    notes: S,
  }),
  competitors: obj({
    competitors: arr(obj({ name: S, url: S, price: S, promise: S, mechanism: S, offer: S, ad_themes: arr(S), complaints: arr(S), strengths: S, weaknesses: S })),
    market: obj({ stage: S, stage_why: S, claims_made: arr(S), open_ground: arr(S) }),
  }),
  voc: obj({
    quotes: arr(obj({ kind: { type: 'string', enum: ['pain', 'desire', 'objection', 'transformation', 'trigger', 'failed'] }, quote: S, source: S, url: S, theme: S, nugget: B })),
  }),
  synthesis: obj({
    mass_desire: S,
    awareness: { type: 'string', enum: ['most', 'product', 'solution', 'problem', 'unaware'] },
    awareness_why: S,
    stage: { type: 'string', enum: ['1', '2', '3', '4', '5'] },
    stage_why: S,
    mechanism: obj({ problem: S, solution: S }),
    personas: arr(obj({ name: S, awareness: { type: 'string', enum: ['most', 'product', 'solution', 'problem', 'unaware'] }, ...Object.fromEntries(PERSONA_KEYS.map(k => [k, S])) })),
    angles: arr(obj({ name: S, argument: S, persona: S, awareness: { type: 'string', enum: ['most', 'product', 'solution', 'problem', 'unaware'] }, lead: S, why: S, duplicate_of: S })),
  }),
  dedupe: obj({ matches: arr(obj({ id: S, why: S })) }),
  prefill: obj({
    company: S, website: S, product_count: S, variants: S, features: S, solves: S, free_ship: S, offers: S, uvp: S, why_you: S, faqs: S, reviews_tool: S,
    socials: arr(obj({ network: S, handle: S })),
    best_sellers: arr(obj({ name: S, price: S })),
  }),
};

/* ---------------- the Claude call, streamed ----------------
   Streams so a long research turn never hits a timeout, and so the page can
   show each search as it happens. Returns the final message. `pause_turn`
   (the server-side tool loop hit its limit) is resumed by sending the partial
   turn back, up to four times. */
async function readStream(res, onEvent) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const blocks = [];
  const msg = { stop_reason: null, usage: {} };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = chunk.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      const ev = safeJson(line.slice(5).trim(), null);
      if (!ev) continue;
      if (ev.type === 'message_start') Object.assign(msg.usage, ev.message?.usage || {});
      else if (ev.type === 'content_block_start') {
        const cb = { ...ev.content_block };
        if (cb.type === 'text') cb.text = cb.text || '';
        if (cb.type === 'thinking') { cb.thinking = cb.thinking || ''; cb.signature = cb.signature || ''; }
        if (cb.type === 'server_tool_use' || cb.type === 'tool_use') cb._json = '';
        blocks[ev.index] = cb;
        if (/_tool_result$/.test(cb.type)) onEvent?.({ type: 'result', block: cb });
      } else if (ev.type === 'content_block_delta') {
        const cb = blocks[ev.index]; const d = ev.delta || {};
        if (!cb) continue;
        if (d.type === 'text_delta') cb.text += d.text;
        else if (d.type === 'thinking_delta') cb.thinking += d.thinking;
        else if (d.type === 'signature_delta') cb.signature += d.signature;
        else if (d.type === 'input_json_delta') cb._json += d.partial_json;
        else if (d.type === 'citations_delta') (cb.citations ||= []).push(d.citation);
      } else if (ev.type === 'content_block_stop') {
        const cb = blocks[ev.index];
        if (cb && '_json' in cb) {
          cb.input = cb._json ? safeJson(cb._json, {}) : (cb.input || {});
          delete cb._json;
          if (cb.type === 'server_tool_use') onEvent?.({ type: 'tool', name: cb.name, input: cb.input });
        }
      } else if (ev.type === 'message_delta') {
        if (ev.delta?.stop_reason) msg.stop_reason = ev.delta.stop_reason;
        Object.assign(msg.usage, ev.usage || {});
      } else if (ev.type === 'error') {
        throw new Error(ev.error?.message || 'Claude stream error');
      }
    }
  }
  msg.content = blocks.filter(Boolean);
  return msg;
}

async function claude(env, { system, user, tools, schema, effort = 'high', maxTokens = 32000 }, onEvent, meter) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set on the account-health worker');
  const messages = [{ role: 'user', content: user }];
  let last = null;
  for (let turn = 0; turn < 5; turn++) {
    const body = {
      model: MODEL, max_tokens: maxTokens, stream: true, system,
      thinking: { type: 'adaptive' },
      output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
      messages,
      ...(tools ? { tools } : {}),
    };
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error?.message || `Claude API HTTP ${res.status}`);
    }
    last = await readStream(res, onEvent);
    if (meter) {
      meter.in += (last.usage.input_tokens || 0) + (last.usage.cache_read_input_tokens || 0) + (last.usage.cache_creation_input_tokens || 0);
      meter.out += last.usage.output_tokens || 0;
      meter.searches += last.usage.server_tool_use?.web_search_requests || 0;
    }
    if (last.stop_reason === 'refusal') throw new Error('Claude declined this research step');
    if (last.stop_reason !== 'pause_turn') break;
    onEvent?.({ type: 'note', text: 'Still researching...' });
    if (turn === 0) messages.push({ role: 'assistant', content: last.content });
    else messages[messages.length - 1] = { role: 'assistant', content: last.content };
  }
  return last;
}
const textOf = m => (m?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
function jsonOf(m) {
  const t = textOf(m);
  const j = safeJson(t, null);
  if (j) return j;
  const a = t.indexOf('{'), z = t.lastIndexOf('}');
  const k = a >= 0 ? safeJson(t.slice(a, z + 1), null) : null;
  if (!k) throw new Error('The research came back in a shape Locus could not read. Run the step again.');
  return k;
}
/* Sources the model actually opened, so the notes carry real URLs. */
function sourcesOf(m) {
  const out = [];
  for (const b of m?.content || []) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url) out.push(`${r.title || ''} ${r.url}`.trim());
    if (b.type === 'web_fetch_tool_result' && b.content?.url) out.push(b.content.url);
  }
  return [...new Set(out)].slice(0, 80);
}

/* ---------------- what Locus already knows ---------------- */
async function context(env, act, lineId) {
  const acct = await env.DB.prepare(`SELECT act_id, name, tw_shop FROM accounts WHERE act_id = ?1`).bind(act).first();
  if (!acct) throw Object.assign(new Error('unknown account'), { status: 404 });
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then(r => r.results || []).catch(() => []);
  const [lines, docs, onboard, angles, batches, personas] = await Promise.all([
    q(`SELECT * FROM p_br_line WHERE act_id = ?1 ORDER BY sort, created_at`, act),
    q(`SELECT * FROM p_br_doc WHERE act_id = ?1`, act),
    env.DB.prepare(`SELECT answers_json, prefill_json FROM p_br_onboard WHERE act_id = ?1`).bind(act).first().catch(() => null),
    q(`SELECT id, name, argument, status, line_id FROM p_br_angle WHERE act_id = ?1`, act),
    q(`SELECT num, title, angle_id, level, offer, verdict, learning FROM p_br_batch WHERE act_id = ?1 ORDER BY CAST(num AS INTEGER) DESC LIMIT 120`, act),
    q(`SELECT name, line_id, status FROM p_br_persona WHERE act_id = ?1`, act),
  ]);
  const doc = (line, key) => safeJson(docs.find(d => (d.line_id || '') === (line || '') && d.key === key)?.data_json, null);
  const answers = safeJson(onboard?.answers_json, {});
  const prefill = safeJson(onboard?.prefill_json, {});
  const profile = doc('', 'profile') || {};
  let website = profile.website || answers.website || prefill.website || '';
  if (!website && acct.tw_shop) website = `https://${acct.tw_shop}`;
  if (website && !/^https?:\/\//.test(website)) website = 'https://' + website;
  const line = lineId ? lines.find(l => l.id === lineId) : null;
  /* The ads that actually sold, by Triple Whale attribution, last 180 days. */
  const since = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
  const top = await q(`SELECT a.name, ROUND(SUM(d.spend)) spend, ROUND(SUM(t.revenue) / NULLIF(SUM(d.spend), 0), 2) roas
      FROM ad_daily d JOIN ads a ON a.act_id = d.act_id AND a.ad_id = d.ad_id
      LEFT JOIN tw_ad_attr t ON t.act_id = d.act_id AND t.ad_id = d.ad_id AND t.date = d.date AND t.model = 'lastPlatformClick'
      WHERE d.act_id = ?1 AND d.date >= ?2 GROUP BY d.ad_id HAVING SUM(d.spend) > 50 ORDER BY SUM(d.spend) DESC LIMIT 25`, act, since);
  return { acct, lines, line, docs, doc, answers, prefill, website, angles, batches, personas, top };
}

function brief(c, { withLibrary = true } = {}) {
  const parts = [`BRAND: ${c.acct.name}`, `WEBSITE: ${c.website || 'unknown'}`];
  if (c.line) parts.push(`PRODUCT LINE BEING RESEARCHED: ${c.line.name}. ${c.line.about || ''} Products: ${c.line.products || 'not listed'}`);
  if (c.lines.length) parts.push(`ALL PRODUCT LINES: ${c.lines.map(l => l.name).join(', ')}`);
  const a = c.answers;
  const pick = ['company', 'solves', 'features', 'why_you', 'uvp', 'offers', 'free_ship', 'dos_donts', 'faqs', 'target_cpa', 'aov'];
  const said = pick.filter(k => a[k]).map(k => `${k}: ${clip(typeof a[k] === 'string' ? a[k] : JSON.stringify(a[k]), 800)}`);
  if (a.personas?.length) said.push(`their customer types: ${clip(JSON.stringify(a.personas), 1500)}`);
  if (a.competitors?.length) said.push(`competitors they named: ${clip(JSON.stringify(a.competitors), 1500)}`);
  if (said.length) parts.push(`WHAT THE CLIENT TOLD US AT ONBOARDING:\n${said.join('\n')}`);
  const voice = c.doc('', 'voice'); if (voice) parts.push(`BRAND VOICE (ours): ${clip(JSON.stringify(voice), 1500)}`);
  const facts = c.doc('', 'brand_facts'); if (facts) parts.push(`BRAND FACTS (from the website): ${clip(JSON.stringify(facts), 3000)}`);
  if (c.top.length) parts.push(`OUR ADS THAT SPENT MOST IN 180 DAYS (name, spend, Triple Whale ROAS):\n${c.top.map(t => `${t.name} | $${t.spend} | ${t.roas ?? '-'}`).join('\n')}`);
  if (withLibrary && c.angles.length) parts.push(`ANGLES ALREADY IN THE LIBRARY (id | name | argument | status):\n${c.angles.map(x => `${x.id} | ${x.name} | ${clip(x.argument, 200)} | ${x.status}`).join('\n')}`);
  const judged = c.batches.filter(b => b.verdict || b.learning);
  if (judged.length) parts.push(`PAST TESTS WITH A RESULT (batch, title, level, offer, verdict, learning):\n${judged.slice(0, 60).map(b => `${b.num} | ${b.title} | ${b.level || ''} | ${b.offer || ''} | ${b.verdict || ''} | ${clip(b.learning, 200)}`).join('\n')}`);
  return parts.join('\n\n');
}

/* ---------------- steps ---------------- */
async function stepBrand(env, c, emit, meter) {
  if (!c.website) throw Object.assign(new Error('Add the brand website first (Profile, or the onboarding answers).'), { status: 400 });
  emit({ type: 'note', text: `Reading ${c.website}` });
  const research = await claude(env, {
    system: `You are the lead researcher at Mobius Digital, a paid social agency. ${VOICE}`,
    user: `${brief(c, { withLibrary: false })}\n\nRead this brand's website properly: the home page, every collection, the best-selling product pages, the about page, FAQ, shipping and returns, and any reviews page. Search for the brand name too, to find its socials and press.\n\nReport, with the URL each fact came from:\n1. Every product and its price.\n2. What they claim about the products, and what proof they give.\n3. Offers, bundles, free shipping thresholds, guarantees.\n4. The brand's voice: how they talk, words they use, with verbatim examples.\n5. Their unique value proposition in one line.\n6. PRODUCT LINES. Group products by the reason someone buys them. Test: does a buyer choose between these products for DIFFERENT jobs? If yes they are separate lines (energy strips vs sleep strips); if no they are one line (polos in different prints). Most brands have one to three lines.`,
    tools: [{ ...WEB_FETCH, max_uses: 12 }, { ...WEB_SEARCH, max_uses: 5 }], effort: 'medium',
  }, emit, meter);
  emit({ type: 'note', text: 'Organising what it found' });
  const out = jsonOf(await claude(env, {
    system: `You turn research notes into structured data for Locus. Use only what the notes say. ${VOICE}`,
    user: `NOTES:\n${textOf(research)}\n\nSOURCES OPENED:\n${sourcesOf(research).join('\n')}`,
    schema: SCHEMAS.brand, effort: 'medium', maxTokens: 16000,
  }, emit, meter));
  const A = c.acct.act_id;
  const st = [
    upsertDoc(env, A, '', 'voice', out.voice, 'draft'),
    upsertDoc(env, A, '', 'brand_facts', { website: out.website || c.website, uvp: out.uvp, products: out.products, claims: out.claims, offers: out.offers, notes: out.notes, sources: sourcesOf(research) }, 'draft'),
  ];
  if (!c.lines.length && out.lines?.length) {
    out.lines.slice(0, 6).forEach((l, i) => st.push(env.DB.prepare(`INSERT INTO p_br_line (id, act_id, name, about, products, sort) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(rid(), A, clip(l.name, 120), clip(l.about, 2000), clip(l.products, 2000), i)));
  } else if (out.lines?.length) {
    st.push(upsertDoc(env, A, '', 'line_proposal', { lines: out.lines }, 'draft'));
  }
  await env.DB.batch(st);
  const made = !c.lines.length && out.lines?.length;
  return { summary: `Found ${out.products?.length || 0} products${made ? ` and set up ${out.lines.length} product line${out.lines.length === 1 ? '' : 's'}: ${out.lines.map(l => l.name).join(', ')}` : ''}. Voice and brand facts saved as drafts.` };
}

async function stepCompetitors(env, c, emit, meter) {
  const research = await claude(env, {
    system: `You are the lead researcher at Mobius Digital, a paid social agency. You think like Eugene Schwartz. ${VOICE}`,
    user: `${brief(c, { withLibrary: false })}\n\nFind the 5 to 8 REAL competitors for this product line: brands a buyer would compare it with. Use Google, Amazon, "best X" lists, review sites and the brands' own sites. For each one record: name, URL, price point, their main promise, the mechanism they claim (why it works), their current offer, what their ads and landing pages keep saying, and what their 1 to 3 star reviewers complain about (quote them, with the URL). Then judge the market:\n- Sophistication stage 1 to 5 (1 = first to make the claim, 2 = others say it so claims get bigger, 3 = claims are worn out so a new mechanism is needed, 4 = mechanisms are copied, 5 = buyers have heard it all, sell identity).\n- The claims the market has already made.\n- Open ground: what nobody is saying that buyers clearly care about.`,
    tools: [{ ...WEB_SEARCH, max_uses: 14 }, { ...WEB_FETCH, max_uses: 10 }], effort: 'medium',
  }, emit, meter);
  emit({ type: 'note', text: 'Organising the competitors' });
  const out = jsonOf(await claude(env, {
    system: `You turn research notes into structured data for Locus. Use only what the notes say. The stage is a single digit 1-5. ${VOICE}`,
    user: `NOTES:\n${textOf(research)}\n\nSOURCES OPENED:\n${sourcesOf(research).join('\n')}`,
    schema: SCHEMAS.competitors, effort: 'medium', maxTokens: 16000,
  }, emit, meter));
  const A = c.acct.act_id, L = c.line.id;
  const market = { ...(c.doc(L, 'market') || {}), stage: (out.market?.stage || '').replace(/\D/g, '').slice(0, 1), stage_why: out.market?.stage_why, claims_made: out.market?.claims_made, open_ground: out.market?.open_ground };
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM p_br_comp WHERE act_id = ?1 AND line_id = ?2 AND status = 'draft'`).bind(A, L),
    ...(out.competitors || []).slice(0, 10).map((x, i) => env.DB.prepare(`INSERT INTO p_br_comp (id, act_id, line_id, name, url, data_json, status, sort) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', ?7)`)
      .bind(rid(), A, L, clip(x.name, 120), clip(x.url, 500), JSON.stringify({ price: x.price, promise: x.promise, mechanism: x.mechanism, offer: x.offer, ad_themes: x.ad_themes, complaints: x.complaints, strengths: x.strengths, weaknesses: x.weaknesses, source: 'ai' }), i)),
    upsertDoc(env, A, L, 'market', market, 'draft'),
  ]);
  return { summary: `${out.competitors?.length || 0} competitors mapped. Market judged at stage ${market.stage || '?'}.` };
}

async function stepVoc(env, c, emit, meter) {
  const comps = (await env.DB.prepare(`SELECT name, url FROM p_br_comp WHERE act_id = ?1 AND line_id = ?2`).bind(c.acct.act_id, c.line.id).all()).results || [];
  const research = await claude(env, {
    system: `You are a voice-of-customer researcher at Mobius Digital. You collect what real buyers say, word for word. ${VOICE}`,
    user: `${brief(c, { withLibrary: false })}\n\nCOMPETITORS WE ALREADY FOUND: ${comps.map(x => `${x.name} ${x.url || ''}`).join('; ') || 'none yet'}\n\nMine the voice of the customer for this product line. Go wide: the brand's own reviews, competitor reviews (1 to 3 star ones are gold), Amazon reviews for the category, Reddit threads, YouTube video comments, Quora answers, Google "People also ask", TikTok and Instagram comments where you can reach them. Some sites block reading; if one does, move on and say so.\n\nCollect 40 to 80 VERBATIM quotes. For each: the exact words, what kind it is (pain, desire, objection, transformation, trigger = what made them start looking, failed = something they tried that did not work), where it came from and the URL, a short theme, and whether it is a golden nugget (a line so good it could be ad copy almost as is). Balance the kinds; pains, failed solutions and objections matter most.`,
    tools: [{ ...WEB_SEARCH, max_uses: 18 }, { ...WEB_FETCH, max_uses: 14 }], effort: 'medium',
  }, emit, meter);
  emit({ type: 'note', text: 'Sorting the quotes' });
  const out = jsonOf(await claude(env, {
    system: `You turn research notes into structured data for Locus. Keep every quote exactly as written. Never invent a quote or URL; drop any quote without a source. ${VOICE}`,
    user: `NOTES:\n${textOf(research)}\n\nSOURCES OPENED:\n${sourcesOf(research).join('\n')}`,
    schema: SCHEMAS.voc, effort: 'medium', maxTokens: 24000,
  }, emit, meter));
  const A = c.acct.act_id, L = c.line.id;
  const quotes = (out.quotes || []).filter(x => x.quote && x.quote.length > 8).slice(0, 120);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM p_br_voc WHERE act_id = ?1 AND line_id = ?2 AND status = 'draft'`).bind(A, L),
    ...quotes.map(x => env.DB.prepare(`INSERT INTO p_br_voc (id, act_id, line_id, kind, quote, source, url, theme, nugget, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'draft')`)
      .bind(rid(), A, L, x.kind, clip(x.quote, 3000), clip(x.source, 200), clip(x.url, 1000), clip(x.theme, 300), x.nugget ? 1 : 0)),
  ]);
  const by = quotes.reduce((t, x) => ({ ...t, [x.kind]: (t[x.kind] || 0) + 1 }), {});
  return { summary: `${quotes.length} quotes: ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ')}.` };
}

async function stepSynthesis(env, c, emit, meter) {
  const A = c.acct.act_id, L = c.line.id;
  const [voc, comps] = await Promise.all([
    env.DB.prepare(`SELECT kind, quote, source, theme, nugget FROM p_br_voc WHERE act_id = ?1 AND line_id = ?2`).bind(A, L).all().then(r => r.results || []),
    env.DB.prepare(`SELECT name, data_json FROM p_br_comp WHERE act_id = ?1 AND line_id = ?2`).bind(A, L).all().then(r => r.results || []),
  ]);
  const market = c.doc(L, 'market') || {};
  emit({ type: 'note', text: `Building personas from ${voc.length} quotes and ${comps.length} competitors` });
  const out = jsonOf(await claude(env, {
    system: `You are Mobius Digital's head of creative strategy. You think like Eugene Schwartz (channel an existing mass desire; awareness decides the opening; sophistication decides what is left to say), Stefan Georgi (the mechanism: why what they tried failed, why this works), Bob Moesta (push, pull, anxiety, habit) and Joanna Wiebe (use the customer's own words). ${VOICE}`,
    user: `${brief(c)}\n\nMARKET SO FAR: ${JSON.stringify(market)}\n\nCOMPETITORS:\n${comps.map(x => `${x.name}: ${clip(x.data_json, 900)}`).join('\n')}\n\nVOICE OF CUSTOMER (${voc.length} quotes):\n${voc.map(v => `[${v.kind}${v.nugget ? ', nugget' : ''}] "${clip(v.quote, 400)}" (${v.source || ''})`).join('\n')}\n\nFor THIS product line only:\n1. The mass desire, in the customer's words.\n2. The market's typical awareness level and sophistication stage, with one line each on why.\n3. The mechanism: the real reason what they tried before failed, and why this product solves it.\n4. Two to four PERSONAS. Each must be a genuinely different buying pattern (different job, trigger or objection), not the same person at another age. Answer every field, using the customers' own words where you can. demo = age, gender, location. words = phrases they actually use.\n5. Six to twelve ANGLE ideas. An angle is the reason to buy, aimed at one persona, never an execution or a format. Say which persona, the awareness level it speaks to, the lead (how the ad opens), and why it should work, citing a quote or a past test. Check each against ANGLES ALREADY IN THE LIBRARY: if it is the same reason to buy in new words, put that angle's id in duplicate_of, otherwise leave duplicate_of empty. Favour open ground and angles the past tests have not tried.`,
    schema: SCHEMAS.synthesis, effort: 'high', maxTokens: 48000,
  }, emit, meter));
  const personaRows = (out.personas || []).slice(0, 5).map((p, i) => ({ id: rid(), name: clip(p.name, 120), data: { ...Object.fromEntries(PERSONA_KEYS.map(k => [k, p[k] || ''])), awareness: p.awareness }, i }));
  const pid = Object.fromEntries(personaRows.map(p => [p.name.toLowerCase(), p.id]));
  const libIds = new Set(c.angles.map(a => a.id));
  const libName = Object.fromEntries(c.angles.map(a => [a.id, a.name]));
  await env.DB.batch([
    upsertDoc(env, A, L, 'market', { ...market, mass_desire: out.mass_desire, awareness: out.awareness, awareness_why: out.awareness_why, stage: out.stage || market.stage, stage_why: out.stage_why || market.stage_why }, 'draft'),
    upsertDoc(env, A, L, 'mechanism', out.mechanism || {}, 'draft'),
    env.DB.prepare(`DELETE FROM p_br_persona WHERE act_id = ?1 AND line_id = ?2 AND status = 'draft' AND source = 'ai'`).bind(A, L),
    ...personaRows.map(p => env.DB.prepare(`INSERT INTO p_br_persona (id, act_id, line_id, name, data_json, status, source, sort) VALUES (?1, ?2, ?3, ?4, ?5, 'draft', 'ai', ?6)`)
      .bind(p.id, A, L, p.name, JSON.stringify(p.data), 100 + p.i)),
    env.DB.prepare(`DELETE FROM p_br_angle WHERE act_id = ?1 AND line_id = ?2 AND status = 'proposed' AND source = 'ai'`).bind(A, L),
    ...(out.angles || []).slice(0, 14).map(x => {
      const dup = libIds.has(x.duplicate_of) ? x.duplicate_of : '';
      const note = [x.why, dup ? `Looks like the existing angle "${libName[dup]}".` : ''].filter(Boolean).join(' ');
      return env.DB.prepare(`INSERT INTO p_br_angle (id, act_id, line_id, persona_id, name, argument, awareness, stage, lead, status, source, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'proposed', 'ai', ?10)`)
        .bind(rid(), A, L, pid[(x.persona || '').toLowerCase()] || null, clip(x.name, 200), clip(x.argument, 3000), x.awareness || null, out.stage || null, clip(x.lead, 200), clip(note, 3000));
    }),
  ]);
  return { summary: `${personaRows.length} personas and ${(out.angles || []).length} angle ideas drafted. Awareness: ${out.awareness}, stage ${out.stage}.` };
}

function upsertDoc(env, act, line, key, data, status) {
  return env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'ai', datetime('now'))
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, status = excluded.status, source = 'ai', updated_at = excluded.updated_at`)
    .bind(act, line || '', key, JSON.stringify(data || {}).slice(0, 200000), status);
}

const STEPS = { brand: stepBrand, competitors: stepCompetitors, voc: stepVoc, synthesis: stepSynthesis };

/* A streamed step: NDJSON lines, a ping every 10s so nothing idles out. */
function runStep(env, ctx, act, step, lineId) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const enc = new TextEncoder();
  const emit = o => {
    const out = o.type === 'tool' ? { type: 'tool', name: o.name, text: o.input?.query || o.input?.url || '' } : o.type === 'result' ? null : o;
    if (out) w.write(enc.encode(JSON.stringify(out) + '\n')).catch(() => {});
  };
  const work = (async () => {
    const ping = setInterval(() => w.write(enc.encode('{"type":"ping"}\n')).catch(() => {}), 10000);
    const meter = { in: 0, out: 0, searches: 0 };
    const runId = rid();
    try {
      if (!STEPS[step]) throw new Error('unknown step');
      const c = await context(env, act, lineId);
      if (step !== 'brand' && !c.line) throw new Error('Pick a product line first');
      await env.DB.prepare(`INSERT INTO p_br_run (id, act_id, line_id, step) VALUES (?1, ?2, ?3, ?4)`).bind(runId, act, lineId || null, step).run();
      const r = await STEPS[step](env, c, emit, meter);
      await env.DB.prepare(`UPDATE p_br_run SET status = 'done', searches = ?2, in_tokens = ?3, out_tokens = ?4, finished_at = datetime('now') WHERE id = ?1`).bind(runId, meter.searches, meter.in, meter.out).run();
      emit({ type: 'done', ...r, cost: cost(meter) });
    } catch (e) {
      await env.DB.prepare(`UPDATE p_br_run SET status = 'failed', error = ?2, searches = ?3, in_tokens = ?4, out_tokens = ?5, finished_at = datetime('now') WHERE id = ?1`).bind(runId, clip(e.message, 500), meter.searches, meter.in, meter.out).run().catch(() => {});
      emit({ type: 'error', text: e.message, cost: cost(meter) });
    } finally {
      clearInterval(ping);
      await w.close().catch(() => {});
    }
  })();
  ctx?.waitUntil?.(work);
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}
/* Claude Opus 5: $5 in / $25 out per million tokens; web search $10 per 1,000. */
const cost = m => Math.round(((m.in / 1e6) * 5 + (m.out / 1e6) * 25 + (m.searches / 1000) * 10) * 100) / 100;

/* ---------------- the duplicate check ---------------- */
async function dedupe(env, act, b) {
  const lib = (await env.DB.prepare(`SELECT id, name, argument FROM p_br_angle WHERE act_id = ?1 AND status != 'proposed'`).bind(act).all()).results || [];
  const pool = lib.filter(x => x.id !== b.exclude_id);
  if (!pool.length) return { matches: [] };
  const m = await claude(env, {
    system: `You check a new ad angle against a brand's angle library. An angle is the REASON TO BUY, not the wording or the format. Two angles match when they give the buyer the same reason, even in completely different words ("1 star review from his wife" and "wife hates his old polos" are the same angle: the wife's reaction). Different executions of the same reason still match. Be strict: only return real matches, at most three, with a one-line reason in plain English. ${VOICE}`,
    user: `LIBRARY (id | name | argument):\n${pool.map(x => `${x.id} | ${x.name} | ${clip(x.argument, 300)}`).join('\n')}\n\nNEW ANGLE:\nname: ${clip(b.name, 200)}\nargument: ${clip(b.argument, 1500)}`,
    schema: SCHEMAS.dedupe, effort: 'low', maxTokens: 4000,
  });
  const ids = new Set(pool.map(x => x.id));
  const names = Object.fromEntries(pool.map(x => [x.id, x.name]));
  return { matches: (jsonOf(m).matches || []).filter(x => ids.has(x.id)).slice(0, 3).map(x => ({ ...x, name: names[x.id] })) };
}

/* ---------------- onboarding: help box + website pre-fill ---------------- */
async function onboardHelp(env, b) {
  if (!/^[a-f0-9]{24,40}$/.test(b.token || '')) return { error: 'bad link', status: 404 };
  const row = await env.DB.prepare(`SELECT o.act_id, a.name FROM p_br_onboard o JOIN accounts a ON a.act_id = o.act_id WHERE o.token = ?1`).bind(b.token).first();
  if (!row) return { error: 'bad link', status: 404 };
  const q = clip(b.question, 800).trim();
  if (!q) return { answer: '' };
  const m = await claude(env, {
    system: `You help ${row.name}, a new client of Mobius Digital (a paid social ad agency), fill in their onboarding form. Answer in two to four short sentences, friendly and plain. Explain what a question means, why the agency asks it, and what a good answer looks like, with a quick example. Rough answers are fine and "I'm not sure" is always allowed; the agency researches the rest. Never ask for or accept passwords, card numbers or login details; access is granted by inviting the agency from inside each platform. If you do not know something specific to the agency, say their Mobius contact will answer it. ${VOICE}`,
    user: `The client is on the step "${clip(b.step, 80)}". The questions on this step are:\n${clip(b.fields, 3000)}\n\nTheir question: ${q}`,
    effort: 'low', maxTokens: 1500,
  });
  return { answer: textOf(m) };
}

function runPrefill(env, ctx, act) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const enc = new TextEncoder();
  const emit = o => { if (o.type !== 'result') w.write(enc.encode(JSON.stringify(o.type === 'tool' ? { type: 'tool', text: o.input?.query || o.input?.url || '' } : o) + '\n')).catch(() => {}); };
  const work = (async () => {
    const ping = setInterval(() => w.write(enc.encode('{"type":"ping"}\n')).catch(() => {}), 10000);
    const meter = { in: 0, out: 0, searches: 0 };
    try {
      const c = await context(env, act, null);
      if (!c.website) throw new Error('Add the brand website first.');
      const research = await claude(env, {
        system: `You pre-fill a new client's onboarding form from their public website so they only have to check it. ${VOICE}`,
        user: `Brand: ${c.acct.name}. Website: ${c.website}.\nRead the home page, collections, best sellers, FAQ, shipping page and footer. Note: company name, number of products, variants, main features, what the products solve, free shipping threshold, current offers, the value proposition, why someone would buy from them, the most common questions (from the FAQ), which review app they use (Judge.me, Okendo, Yotpo...), their social accounts, and best sellers with prices.`,
        tools: [{ ...WEB_FETCH, max_uses: 8 }, { ...WEB_SEARCH, max_uses: 3 }], effort: 'low',
      }, emit, meter);
      const out = jsonOf(await claude(env, {
        system: `You turn notes into answers for an onboarding form. Leave a field empty when the notes do not say. Money as a plain number. ${VOICE}`,
        user: textOf(research), schema: SCHEMAS.prefill, effort: 'low', maxTokens: 8000,
      }, emit, meter));
      const clean = {};
      for (const [k, v] of Object.entries(out)) if (Array.isArray(v) ? v.length : String(v || '').trim()) clean[k] = v;
      const row = await env.DB.prepare(`SELECT prefill_json FROM p_br_onboard WHERE act_id = ?1`).bind(act).first();
      if (!row) throw new Error('Create the onboarding link first.');
      await env.DB.prepare(`UPDATE p_br_onboard SET prefill_json = ?2, updated_at = datetime('now') WHERE act_id = ?1`).bind(act, JSON.stringify({ ...safeJson(row.prefill_json, {}), ...clean })).run();
      emit({ type: 'done', summary: `Pre-filled ${Object.keys(clean).length} answers from the website. The client sees them as suggestions to confirm.`, cost: cost(meter) });
    } catch (e) {
      emit({ type: 'error', text: e.message, cost: cost(meter) });
    } finally { clearInterval(ping); await w.close().catch(() => {}); }
  })();
  ctx?.waitUntil?.(work);
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}

/* ---------------- routes ---------------- */
export async function handleResearch(request, env, ctx, path, json, isAdmin) {
  if (path === '/api/onboard-help' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    try { const r = await onboardHelp(env, b); return json(r, r.status || 200); } catch (e) { return json({ error: 'The helper is busy. Try again in a minute, or ask your Mobius contact.' }, 502); }
  }
  if (!path.startsWith('/api/research')) return null;
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const b = await request.json().catch(() => ({}));
  if (!b.act) return json({ error: 'act is required' }, 400);
  if (path === '/api/research/step' && request.method === 'POST') return runStep(env, ctx, b.act, b.step, b.line_id || null);
  if (path === '/api/research/prefill' && request.method === 'POST') return runPrefill(env, ctx, b.act);
  if (path === '/api/research/dedupe' && request.method === 'POST') {
    try { return json(await dedupe(env, b.act, b)); } catch (e) { return json({ error: e.message }, 502); }
  }
  return json({ error: 'not found' }, 404);
}
