"use client";

import { useEffect, useState, type FormEvent } from "react";

/**
 * The Clients screen — agency admins only (the gate enforces it).
 *
 * Add a client and their board exists immediately at /b/<slug>/: the brand is
 * database rows, not a deployment. The home-screen icons are rasterised here
 * in the browser (a canvas can draw the SVG mark; the Worker cannot) and
 * stored with the brand.
 */

type Client = {
  slug: string;
  name: string;
  accent: string;
  members: string[];
  passwordSet: boolean;
};

const DEFAULT_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="24" height="21" rx="3"/><path d="M4 14h24"/><path d="M11 4v5M21 4v5"/><circle cx="16" cy="21" r="2.5" fill="currentColor" stroke="none"/></svg>`;

/** Rasterises the mark on an accent tile at the sizes phones want. */
async function renderIcons(
  logoSvg: string,
  accent: string,
  ink: string,
): Promise<Record<string, string>> {
  const svg = logoSvg.replace(/currentColor/g, ink);
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("That SVG could not be drawn."));
      image.src = url;
    });

    const out: Record<string, string> = {};
    for (const [key, size, inset] of [
      ["180", 180, 0.18],
      ["192", 192, 0.18],
      ["512", 512, 0.18],
      ["maskable", 512, 0.24],
    ] as const) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas.");
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, size, size);
      const mark = size * (1 - inset * 2);
      ctx.drawImage(image, (size - mark) / 2, (size - mark) / 2, mark, mark);
      out[key] = canvas.toDataURL("image/png").split(",")[1];
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AdminPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [memberDrafts, setMemberDrafts] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [accent, setAccent] = useState("#2563EB");
  const [background, setBackground] = useState("#F7F7F8");
  const [text, setText] = useState("#18181B");
  const [font, setFont] = useState("Inter");
  const [shortName, setShortName] = useState("");
  const [logoSvg, setLogoSvg] = useState("");

  useEffect(() => {
    fetch("/api/admin/clients")
      .then((r) => r.json() as Promise<{ clients: Client[] }>)
      .then((data) => setClients(data.clients))
      .catch(() => setError("Could not load the client list."));
  }, []);

  async function call(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as {
        clients?: Client[];
        error?: string;
      };
      if (!response.ok || !body.clients) {
        setError(body.error ?? "Could not save that.");
        return null;
      }
      setClients(body.clients);
      return body as Record<string, unknown>;
    } catch {
      setError("Network error — try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    let icons: Record<string, string> | undefined;
    try {
      icons = await renderIcons(logoSvg.trim() || DEFAULT_MARK, accent, "#FFFFFF");
    } catch {
      icons = undefined; // The board still works; the icon route falls back.
    }

    const result = await call({
      name,
      shortName: shortName || name.split(/\s+/)[0],
      font,
      colors: { accent, background, text },
      logoSvg: logoSvg.trim() || undefined,
      icons,
    });

    if (result?.created) {
      setPasswords((current) => ({
        ...current,
        [String(result.created)]: String(result.password ?? ""),
      }));
      setAdding(false);
      setName(""); setLogoSvg(""); setShortName("");
    }
  }

  async function resetPassword(slug: string) {
    const result = await call({ action: "reset-password", slug });
    if (result?.password) {
      setPasswords((current) => ({ ...current, [slug]: String(result.password) }));
    }
  }

  return (
    <div className="admin">
      <header className="admin__top">
        <h1 className="admin__title">Clients</h1>
        <div className="admin__top-actions">
          <a className="button" href="/">Front door</a>
          <button type="button" className="button button--primary" onClick={() => setAdding(true)}>
            ＋ Add client
          </button>
        </div>
      </header>

      {error && (
        <p className="field__error field__error--banner" role="alert">{error}</p>
      )}

      {clients === null ? (
        <p className="admin__empty">Loading…</p>
      ) : clients.length === 0 ? (
        <p className="admin__empty">
          No clients yet. Add one and their board exists immediately — its own
          look, its own sign-in, its own corner of this site.
        </p>
      ) : (
        <div className="admin__grid">
          {clients.map((client) => (
            <section key={client.slug} className="client-card">
              <div className="client-card__bar" style={{ background: client.accent }} />
              <div className="client-card__body">
                <div className="client-card__head">
                  <h2 className="client-card__name">{client.name}</h2>
                  <a className="button button--outline" href={`/b/${client.slug}/`}>
                    Open board ↗
                  </a>
                </div>
                <p className="client-card__url">/b/{client.slug}/</p>

                {passwords[client.slug] && (
                  <div className="client-card__pw">
                    <span>Team password (shown once):</span>
                    <code>{passwords[client.slug]}</code>
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={() => navigator.clipboard.writeText(passwords[client.slug])}
                    >
                      Copy
                    </button>
                  </div>
                )}

                <div className="client-card__members">
                  <span className="client-card__label">Google access</span>
                  {client.members.length === 0 && (
                    <span className="client-card__none">Nobody yet — password only</span>
                  )}
                  {client.members.map((email) => (
                    <span key={email} className="member-chip">
                      {email}
                      <button
                        type="button"
                        aria-label={`Remove ${email}`}
                        disabled={busy}
                        onClick={() => void call({ action: "remove-member", slug: client.slug, email })}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <form
                    className="member-add"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const email = memberDrafts[client.slug]?.trim();
                      if (!email) return;
                      void call({ action: "add-member", slug: client.slug, email }).then((ok) => {
                        if (ok) setMemberDrafts((d) => ({ ...d, [client.slug]: "" }));
                      });
                    }}
                  >
                    <input
                      className="input"
                      placeholder="name@company.com"
                      inputMode="email"
                      value={memberDrafts[client.slug] ?? ""}
                      onChange={(event) =>
                        setMemberDrafts((d) => ({ ...d, [client.slug]: event.target.value }))
                      }
                      disabled={busy}
                    />
                    <button className="button" disabled={busy}>Invite</button>
                  </form>
                </div>

                <div className="client-card__foot">
                  <button
                    type="button"
                    className="button button--quiet"
                    disabled={busy}
                    onClick={() => void resetPassword(client.slug)}
                  >
                    {client.passwordSet ? "Reset team password" : "Set a team password"}
                  </button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {adding && (
        <div
          className="scrim"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAdding(false);
          }}
        >
          <form
            className="dialog dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-client-title"
            onSubmit={create}
            onKeyDown={(event) => {
              if (event.key === "Escape") setAdding(false);
            }}
          >
            <h2 className="dialog__title" id="add-client-title">Add a client</h2>
            <p className="dialog__body">
              Their board exists the moment you save — its own look, address
              and team password, ready to send.
            </p>

            <label className="field">
              <span className="field__label">Client name</span>
              <input className="input" value={name} maxLength={40}
                onChange={(event) => setName(event.target.value)} placeholder="Dartee Golf" />
            </label>

            <div className="palette-row">
              {([["Accent", accent, setAccent], ["Background", background, setBackground], ["Text", text, setText]] as const).map(
                ([label, value, set]) => (
                  <label key={label} className="palette-pick">
                    <span className="field__label">{label}</span>
                    <input type="color" value={value} onChange={(event) => set(event.target.value)} />
                  </label>
                ),
              )}
            </div>

            <div
              className="palette-preview"
              style={{ background, color: text, borderColor: accent }}
            >
              <strong>{name.trim() || "Client name"}</strong>
              <span className="palette-preview__chip" style={{ background: accent, color: "#fff" }}>
                New event
              </span>
            </div>

            <label className="field">
              <span className="field__label">Font</span>
              <select className="select" value={font} onChange={(event) => setFont(event.target.value)}>
                {["Inter", "DM Sans", "Manrope", "Space Grotesk", "Barlow", "Sora", "Outfit", "Work Sans"].map(
                  (option) => <option key={option}>{option}</option>,
                )}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Name under the phone icon</span>
              <input className="input" value={shortName} maxLength={14}
                onChange={(event) => setShortName(event.target.value)}
                placeholder={name.trim().split(/\s+/)[0] || "Calendar"} />
            </label>

            <label className="field">
              <span className="field__label">Logo (optional)</span>
              <textarea className="textarea" rows={3} value={logoSvg}
                onChange={(event) => setLogoSvg(event.target.value)}
                placeholder="Paste a single-colour .svg — or leave empty for the calendar mark." />
            </label>

            <div className="dialog__actions">
              <button type="button" className="button" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button type="submit" className="button button--primary" disabled={busy || !name.trim()}>
                Create the board
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
