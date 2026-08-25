/**
 * Mobius Console — one link for the agency: every client board as a card,
 * and an Add-client button that provisions a brand-new board end to end.
 *
 * Add client stores the full spec here, then starts the GitHub Actions
 * pipeline (.github/workflows/provision-client.yml). The pipeline fetches the
 * spec back from /api/spec/:id, runs launch-calendar/scripts/provision-client.mjs
 * — new database, brand baked in, icons, deploy, password, switcher links —
 * and reports the finished board to /api/complete/:id. The UI polls until the
 * card flips to live and shows the generated password once.
 *
 * Boards stay fully separate deployments; this console is a registry and a
 * remote control, never a shared database.
 */

const SESSION_COOKIE = "mc_session";

/* ----------------------------------------------------------------------- *
 * Small helpers
 * ----------------------------------------------------------------------- */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sessionToken(env) {
  return hmac(env.CONSOLE_PASSWORD ?? "unset", "console-session-v1");
}

async function isSignedIn(request, env) {
  if (!env.CONSOLE_PASSWORD) return false;
  const cookies = request.headers.get("Cookie") ?? "";
  const presented = cookies.match(new RegExp(`${SESSION_COOKIE}=([a-f0-9]+)`))?.[1];
  return Boolean(presented) && timingSafeEqual(presented, await sessionToken(env));
}

function bearerOk(request, env) {
  const header = request.headers.get("Authorization") ?? "";
  return (
    Boolean(env.PROVISION_SECRET) &&
    timingSafeEqual(header, `Bearer ${env.PROVISION_SECRET}`)
  );
}

/* ----------------------------------------------------------------------- *
 * Palette: three colours in, the calendar's full nine out
 * ----------------------------------------------------------------------- */

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}
function mix(hexA, hexB, amountOfB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * amountOfB));
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function derivePalette({ accent, background, text }) {
  const lightPage = luminance(background) > 0.4;
  return {
    background,
    surface: lightPage ? "#FFFFFF" : mix(background, "#FFFFFF", 0.07),
    primary: accent,
    // White on a dark accent, the text colour on a light one.
    primaryText: luminance(accent) > 0.45 ? text : "#FFFFFF",
    text,
    textMuted: mix(text, background, 0.42),
    danger: "#B3352F",
    tentative: mix(text, background, 0.55),
    scrim: text,
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
const FONTS = ["Inter", "DM Sans", "Manrope", "Space Grotesk", "Barlow", "Sora", "Outfit", "Work Sans"];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/* ----------------------------------------------------------------------- *
 * Data access
 * ----------------------------------------------------------------------- */

async function listClients(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, slug, url, db_name, status, spec, password, error, created_at
     FROM clients ORDER BY created_at ASC`,
  ).all();
  return results ?? [];
}

function agencyEmails(env) {
  return (env.AGENCY_EMAILS ?? "")
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function dispatchPipeline(env, clientId) {
  const response = await fetch(
    `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/${env.GH_WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "mobius-console",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { client_id: clientId } }),
    },
  );
  if (response.status !== 204) {
    const detail = await response.text().catch(() => "");
    throw new Error(`GitHub said ${response.status}: ${detail.slice(0, 300)}`);
  }
}

/* ----------------------------------------------------------------------- *
 * API
 * ----------------------------------------------------------------------- */

async function handleApi(request, env, url) {
  const path = url.pathname;

  // The pipeline's two endpoints authenticate with the shared secret, not a
  // browser session — GitHub's runner has no cookie jar.
  const specMatch = path.match(/^\/api\/spec\/([a-z0-9-]+)$/);
  if (specMatch && request.method === "GET") {
    if (!bearerOk(request, env)) return json({ error: "Not allowed." }, 403);
    const row = await env.DB.prepare(`SELECT spec FROM clients WHERE id = ?`)
      .bind(specMatch[1])
      .first();
    if (!row) return json({ error: "No such client." }, 404);
    return new Response(row.spec, { headers: { "Content-Type": "application/json" } });
  }

  const completeMatch = path.match(/^\/api\/complete\/([a-z0-9-]+)$/);
  if (completeMatch && request.method === "POST") {
    if (!bearerOk(request, env)) return json({ error: "Not allowed." }, 403);
    const body = await request.json().catch(() => ({}));
    const now = new Date().toISOString();

    if (body.error) {
      await env.DB.prepare(
        `UPDATE clients SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(String(body.error).slice(0, 2000), now, completeMatch[1])
        .run();
      return json({ ok: true });
    }

    // A success report has to actually contain the board. Anything else is
    // recorded as a failure rather than a live card pointing nowhere.
    if (typeof body.url !== "string" || !body.url.startsWith("https://")) {
      await env.DB.prepare(
        `UPDATE clients SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`,
      )
        .bind("The pipeline reported success without a board address.", now, completeMatch[1])
        .run();
      return json({ ok: true });
    }

    await env.DB.prepare(
      `UPDATE clients SET status = 'live', url = ?, db_name = ?, password = ?, error = NULL,
       updated_at = ? WHERE id = ?`,
    )
      .bind(body.url ?? null, body.workerName ?? null, body.password ?? null, now, completeMatch[1])
      .run();
    return json({ ok: true });
  }

  // Everything below is the signed-in agency.
  if (!(await isSignedIn(request, env))) return json({ error: "Sign in first." }, 401);

  if (path === "/api/clients" && request.method === "GET") {
    const clients = await listClients(env);
    return json({
      clients: clients.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        url: row.url,
        status: row.status,
        password: row.password,
        error: row.error,
        accent: (() => {
          try {
            return JSON.parse(row.spec)?.colors?.primary ?? "#2563EB";
          } catch {
            return "#2563EB";
          }
        })(),
      })),
    });
  }

  if (path === "/api/clients" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: "Malformed request." }, 400);

    const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 40) {
      return json({ error: "Name the client in 2 to 40 characters." }, 422);
    }

    const slug = SLUG.test(body.slug ?? "") ? body.slug : slugify(name);
    if (!SLUG.test(slug)) return json({ error: "That name needs letters or numbers." }, 422);

    const taken = await env.DB.prepare(`SELECT id FROM clients WHERE slug = ?`).bind(slug).first();
    if (taken) return json({ error: `"${slug}" is already a client.` }, 422);

    const colors = body.colors ?? {};
    for (const key of ["accent", "background", "text"]) {
      if (!HEX.test(colors[key] ?? "")) {
        return json({ error: "Pick all three colours (6-digit hex)." }, 422);
      }
    }

    const font = FONTS.includes(body.font) ? body.font : "Inter";
    const shortName = String(body.shortName ?? "Calendar").trim().slice(0, 14) || "Calendar";

    let logoSvg;
    if (typeof body.logoSvg === "string" && body.logoSvg.trim()) {
      const trimmed = body.logoSvg.trim();
      if (!/^<svg[\s>]/i.test(trimmed) || trimmed.length > 50_000) {
        return json({ error: "The logo must be an SVG file under 50 KB." }, 422);
      }
      if (/<script|onload|onerror|javascript:/i.test(trimmed)) {
        return json({ error: "That SVG contains scripting, which is not allowed." }, 422);
      }
      logoSvg = trimmed;
    }

    // Boards the pipeline should cross-link: every board already live.
    const live = (await listClients(env)).filter((row) => row.status === "live" && row.url);
    const spec = {
      name,
      slug,
      shortName,
      productName: "Marketing Calendar",
      font,
      colors: derivePalette(colors),
      logoSvg,
      logoTint: body.logoTint !== false,
      agencyEmails: agencyEmails(env),
      // The shared key that lets the board with the scheduled trigger run its
      // siblings' Slack batching (free plan caps triggers per account).
      cronSecret: env.CRON_SECRET || undefined,
      boards: live.map((row) => ({ label: row.name, url: row.url, db: row.db_name })),
    };

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO clients (id, name, slug, status, spec, created_at, updated_at)
       VALUES (?, ?, ?, 'provisioning', ?, ?, ?)`,
    )
      .bind(id, name, slug, JSON.stringify(spec), now, now)
      .run();

    try {
      await dispatchPipeline(env, id);
    } catch (error) {
      await env.DB.prepare(
        `UPDATE clients SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(`Could not start the pipeline: ${error.message}`, new Date().toISOString(), id)
        .run();
      return json({ error: `Saved, but the pipeline did not start: ${error.message}` }, 502);
    }

    return json({ ok: true, id });
  }

  const retryMatch = path.match(/^\/api\/clients\/([a-z0-9-]+)\/retry$/);
  if (retryMatch && request.method === "POST") {
    const row = await env.DB.prepare(`SELECT id, status FROM clients WHERE id = ?`)
      .bind(retryMatch[1])
      .first();
    if (!row) return json({ error: "No such client." }, 404);
    await env.DB.prepare(
      `UPDATE clients SET status = 'provisioning', error = NULL, updated_at = ? WHERE id = ?`,
    )
      .bind(new Date().toISOString(), row.id)
      .run();
    try {
      await dispatchPipeline(env, row.id);
      return json({ ok: true });
    } catch (error) {
      return json({ error: error.message }, 502);
    }
  }

  const dismissMatch = path.match(/^\/api\/clients\/([a-z0-9-]+)\/dismiss-password$/);
  if (dismissMatch && request.method === "POST") {
    await env.DB.prepare(`UPDATE clients SET password = NULL, updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), dismissMatch[1])
      .run();
    return json({ ok: true });
  }

  return json({ error: "Not found." }, 404);
}

/* ----------------------------------------------------------------------- *
 * Pages
 * ----------------------------------------------------------------------- */

const STYLE = `
:root {
  --bg: #0E1116; --panel: #161B23; --panel-2: #1C2330; --line: #262E3D;
  --text: #E8ECF3; --muted: #8B95A7; --accent: #4E8CFF; --accent-ink: #7FAFFF;
  --good: #3ECF8E; --bad: #F0655A; --radius: 14px;
  font-family: Inter, system-ui, sans-serif;
}
* { box-sizing: border-box; margin: 0; }
body { background: var(--bg); color: var(--text); min-height: 100vh; }
a { color: var(--accent-ink); text-decoration: none; }
.wrap { max-width: 1060px; margin: 0 auto; padding: 40px 28px 80px; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 36px; }
.top h1 { font-size: 1.25rem; letter-spacing: -0.01em; }
.top h1 span { color: var(--muted); font-weight: 400; }
.btn {
  display: inline-flex; align-items: center; gap: 8px; border: 0; cursor: pointer;
  background: var(--accent); color: #fff; font: inherit; font-weight: 600;
  padding: 11px 18px; border-radius: 10px;
}
.btn:hover { filter: brightness(1.1); }
.btn--ghost { background: transparent; border: 1px solid var(--line); color: var(--text); font-weight: 500; }
.btn--ghost:hover { border-color: var(--muted); filter: none; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; }
.card {
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  overflow: hidden; display: flex; flex-direction: column; transition: border-color .15s;
}
.card:hover { border-color: #33405577; }
.card__bar { height: 6px; }
.card__body { padding: 20px 20px 18px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.card__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.card__name { font-size: 1.05rem; font-weight: 600; letter-spacing: -0.01em; }
.pill { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
  padding: 3px 9px; border-radius: 99px; white-space: nowrap; }
.pill--live { background: #12331F; color: var(--good); }
.pill--busy { background: #14243D; color: var(--accent-ink); }
.pill--bad  { background: #391A18; color: var(--bad); }
.card__url { font-size: 0.82rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card__actions { margin-top: auto; display: flex; gap: 8px; padding-top: 8px; }
.card__actions .btn { padding: 9px 14px; font-size: 0.88rem; }
.spin { width: 14px; height: 14px; border: 2px solid var(--accent-ink); border-top-color: transparent;
  border-radius: 50%; animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.note { font-size: 0.82rem; color: var(--muted); line-height: 1.5; }
.pw { background: var(--panel-2); border: 1px dashed var(--line); border-radius: 10px;
  padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pw code { font-size: 0.9rem; color: var(--good); }
.error-line { font-size: 0.8rem; color: var(--bad); line-height: 1.4; max-height: 4.2em; overflow: auto; }
.empty { border: 1px dashed var(--line); border-radius: var(--radius); padding: 60px 30px;
  text-align: center; color: var(--muted); }
.scrim { position: fixed; inset: 0; background: #000A; display: flex; align-items: center;
  justify-content: center; padding: 20px; z-index: 50; }
.modal { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  width: min(30rem, 100%); max-height: 92vh; overflow: auto; padding: 26px; }
.modal h2 { font-size: 1.1rem; margin-bottom: 6px; }
.modal .sub { color: var(--muted); font-size: 0.85rem; margin-bottom: 20px; line-height: 1.5; }
.f { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.f label { font-size: 0.78rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.f input[type=text], .f select, .f textarea {
  background: var(--panel-2); border: 1px solid var(--line); color: var(--text);
  border-radius: 10px; padding: 11px 12px; font: inherit; width: 100%;
}
.f input:focus, .f select:focus, .f textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.f .hint { font-size: 0.78rem; color: var(--muted); }
.colors { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.color { background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px;
  padding: 10px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.color span { font-size: 0.72rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.color input { width: 100%; height: 34px; border: 0; background: none; padding: 0; cursor: pointer; }
.preview { border-radius: 10px; border: 1px solid var(--line); padding: 14px; margin-bottom: 16px; }
.preview .p-nav { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 0.85rem; margin-bottom: 10px; }
.preview .p-dot { width: 18px; height: 18px; border-radius: 5px; }
.preview .p-chip { display: inline-block; font-size: 0.72rem; padding: 3px 10px; border-radius: 99px; margin-right: 6px; }
.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
.form-error { color: var(--bad); font-size: 0.85rem; margin-bottom: 12px; }
.gate { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.gate form { width: min(22rem, 100%); background: var(--panel); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 30px; }
.gate h1 { font-size: 1.15rem; margin-bottom: 4px; }
.gate p { color: var(--muted); font-size: 0.85rem; margin-bottom: 18px; }
`;

function loginPage(wrong = false) {
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mobius Console</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>${STYLE}</style></head><body>
<div class="gate"><form method="post" action="/auth">
  <h1>Mobius Console</h1>
  <p>Every client board, one place.</p>
  ${wrong ? '<p class="form-error">That is not the password.</p>' : ""}
  <div class="f"><label for="pw">Console password</label>
  <input id="pw" name="password" type="password" autofocus autocomplete="current-password" style="background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:11px 12px;font:inherit;width:100%"></div>
  <button class="btn" style="width:100%;justify-content:center">Open the console</button>
</form></div></body></html>`, wrong ? 401 : 200);
}

function appPage() {
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mobius Console</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>${STYLE}</style></head><body>
<div class="wrap">
  <div class="top">
    <h1>Mobius Console <span>· Marketing Calendars</span></h1>
    <button class="btn" id="add">＋ Add client</button>
  </div>
  <div id="list"></div>
</div>

<div class="scrim" id="modal" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <h2 id="m-title">Add a client</h2>
    <p class="sub">This creates their whole calendar: its own address, database,
    colours and password. Takes about four minutes — the card shows progress.</p>
    <p class="form-error" id="m-error" hidden></p>

    <div class="f"><label for="m-name">Client name</label>
      <input type="text" id="m-name" placeholder="Dartee Golf" maxlength="40">
    </div>

    <div class="f"><label>Brand colours</label>
      <div class="colors">
        <div class="color"><span>Accent</span><input type="color" id="c-accent" value="#2563EB"></div>
        <div class="color"><span>Background</span><input type="color" id="c-bg" value="#F7F7F8"></div>
        <div class="color"><span>Text</span><input type="color" id="c-text" value="#18181B"></div>
      </div>
      <span class="hint">Just these three — the rest of the palette is worked out to match.</span>
    </div>

    <div class="preview" id="preview">
      <div class="p-nav"><div class="p-dot" id="p-dot"></div><span id="p-name">Client name</span></div>
      <span class="p-chip" id="p-chip1">Confirmed</span>
      <span class="p-chip" id="p-chip2">New event</span>
    </div>

    <div class="f"><label for="m-font">Font</label>
      <select id="m-font">${FONTS.map((f) => `<option${f === "Inter" ? " selected" : ""}>${f}</option>`).join("")}</select>
    </div>

    <div class="f"><label for="m-short">Name under the phone icon</label>
      <input type="text" id="m-short" placeholder="Calendar" maxlength="14">
      <span class="hint">About 11 characters fit — "Dartee", "LG Calendar".</span>
    </div>

    <div class="f"><label for="m-logo">Logo (optional)</label>
      <textarea id="m-logo" rows="3" placeholder="Paste the contents of a single-colour .svg file — or leave empty for the calendar mark."></textarea>
    </div>

    <div class="actions">
      <button class="btn btn--ghost" id="m-cancel">Cancel</button>
      <button class="btn" id="m-create">Create the board</button>
    </div>
  </div>
</div>

<script>
const listEl = document.getElementById("list");
let timer = null;

function pill(status) {
  if (status === "live") return '<span class="pill pill--live">Live</span>';
  if (status === "failed") return '<span class="pill pill--bad">Failed</span>';
  return '<span class="pill pill--busy">Setting up</span>';
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

function render(clients) {
  if (!clients.length) {
    listEl.innerHTML = '<div class="empty">No clients yet. <br><br>“Add client” builds a complete branded calendar in about four minutes.</div>';
    return;
  }
  listEl.innerHTML = '<div class="grid">' + clients.map(c => {
    const actions = [];
    if (c.url) actions.push('<a class="btn btn--ghost" href="' + esc(c.url) + '" target="_blank" rel="noopener">Open board ↗</a>');
    if (c.status === "failed") actions.push('<button class="btn" data-retry="' + c.id + '">Try again</button>');
    const busy = c.status === "provisioning"
      ? '<div class="note" style="display:flex;align-items:center;gap:8px"><div class="spin"></div>Building the board — about four minutes…</div>' : "";
    const pw = c.password
      ? '<div class="pw"><span class="note">Team password (shown once):</span><code>' + esc(c.password) + '</code>' +
        '<button class="btn btn--ghost" style="padding:6px 10px;font-size:.78rem" data-copy="' + esc(c.password) + '">Copy</button>' +
        '<button class="btn btn--ghost" style="padding:6px 10px;font-size:.78rem" data-dismiss="' + c.id + '">Hide</button></div>' : "";
    const err = c.error ? '<div class="error-line">' + esc(c.error) + '</div>' : "";
    return '<div class="card"><div class="card__bar" style="background:' + esc(c.accent) + '"></div>' +
      '<div class="card__body"><div class="card__head"><span class="card__name">' + esc(c.name) + '</span>' + pill(c.status) + '</div>' +
      (c.url ? '<div class="card__url">' + esc(c.url.replace(/^https:\\/\\//, "")) + '</div>' : "") +
      busy + pw + err +
      '<div class="card__actions">' + actions.join("") + '</div></div></div>';
  }).join("") + '</div>';
}

async function refresh() {
  try {
    const r = await fetch("/api/clients");
    if (r.status === 401) { location.reload(); return; }
    const data = await r.json();
    render(data.clients);
    const busy = data.clients.some(c => c.status === "provisioning");
    clearTimeout(timer);
    timer = setTimeout(refresh, busy ? 5000 : 30000);
  } catch { timer = setTimeout(refresh, 10000); }
}

listEl.addEventListener("click", async (e) => {
  const copy = e.target.closest("[data-copy]");
  if (copy) { await navigator.clipboard.writeText(copy.dataset.copy); copy.textContent = "Copied"; return; }
  const dismiss = e.target.closest("[data-dismiss]");
  if (dismiss) { await fetch("/api/clients/" + dismiss.dataset.dismiss + "/dismiss-password", { method: "POST" }); refresh(); return; }
  const retry = e.target.closest("[data-retry]");
  if (retry) { retry.disabled = true; await fetch("/api/clients/" + retry.dataset.retry + "/retry", { method: "POST" }); refresh(); }
});

// --- Add-client modal ---
const modal = document.getElementById("modal");
const mError = document.getElementById("m-error");
const nameEl = document.getElementById("m-name");
const shortEl = document.getElementById("m-short");

function paintPreview() {
  const accent = document.getElementById("c-accent").value;
  const bg = document.getElementById("c-bg").value;
  const text = document.getElementById("c-text").value;
  const p = document.getElementById("preview");
  p.style.background = bg; p.style.color = text;
  document.getElementById("p-dot").style.background = accent;
  document.getElementById("p-name").textContent = nameEl.value.trim() || "Client name";
  const c1 = document.getElementById("p-chip1"); const c2 = document.getElementById("p-chip2");
  c1.style.border = "1px solid " + accent; c1.style.color = text;
  c2.style.background = accent; c2.style.color = "#fff";
}
["c-accent","c-bg","c-text"].forEach(id => document.getElementById(id).addEventListener("input", paintPreview));
nameEl.addEventListener("input", () => {
  paintPreview();
  if (!shortEl.dataset.touched) shortEl.value = nameEl.value.trim().split(/\\s+/)[0].slice(0, 14);
});
shortEl.addEventListener("input", () => { shortEl.dataset.touched = "1"; });

document.getElementById("add").addEventListener("click", () => { modal.hidden = false; paintPreview(); nameEl.focus(); });
document.getElementById("m-cancel").addEventListener("click", () => { modal.hidden = true; });
modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.hidden = true; });

document.getElementById("m-create").addEventListener("click", async () => {
  mError.hidden = true;
  const button = document.getElementById("m-create");
  button.disabled = true; button.textContent = "Creating…";
  try {
    const r = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nameEl.value,
        colors: {
          accent: document.getElementById("c-accent").value,
          background: document.getElementById("c-bg").value,
          text: document.getElementById("c-text").value,
        },
        font: document.getElementById("m-font").value,
        shortName: shortEl.value,
        logoSvg: document.getElementById("m-logo").value,
      }),
    });
    const body = await r.json();
    if (!r.ok) { mError.textContent = body.error || "Could not save that."; mError.hidden = false; return; }
    modal.hidden = true;
    nameEl.value = ""; document.getElementById("m-logo").value = ""; shortEl.value = ""; delete shortEl.dataset.touched;
    refresh();
  } finally {
    button.disabled = false; button.textContent = "Create the board";
  }
});

refresh();
</script></body></html>`);
}

/* ----------------------------------------------------------------------- *
 * Router
 * ----------------------------------------------------------------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/auth" && request.method === "POST") {
      const form = await request.formData().catch(() => null);
      const submitted = form?.get("password");
      if (
        typeof submitted === "string" &&
        env.CONSOLE_PASSWORD &&
        timingSafeEqual(submitted, env.CONSOLE_PASSWORD)
      ) {
        const token = await sessionToken(env);
        return new Response(null, {
          status: 303,
          headers: {
            Location: "/",
            "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}`,
          },
        });
      }
      return loginPage(true);
    }

    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);

    if (url.pathname !== "/") return Response.redirect(new URL("/", url).toString(), 302);

    return (await isSignedIn(request, env)) ? appPage() : loginPage();
  },
};
