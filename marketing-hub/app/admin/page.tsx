"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ColorField } from "@/components/ColorField";

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
  events: number;
};

const DEFAULT_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="24" height="21" rx="3"/><path d="M4 14h24"/><path d="M11 4v5M21 4v5"/><circle cx="16" cy="21" r="2.5" fill="currentColor" stroke="none"/></svg>`;

const FONTS = ["Inter", "DM Sans", "Manrope", "Space Grotesk", "Barlow", "Sora", "Outfit", "Work Sans"];

const ACCENTS = ["#2563eb", "#7c3aed", "#c9a227", "#059669", "#dc2626", "#ea580c", "#0891b2", "#111827"];
const BACKGROUNDS = ["#f7f7f8", "#ffffff", "#f4f4f0", "#f8f7fc", "#f1f5f9", "#141414"];
const TEXTS = ["#18181b", "#1a1a18", "#0f172a", "#1b1726", "#f5f5f5"];

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
  const [deleting, setDeleting] = useState<Client | null>(null);
  const [deleteDraft, setDeleteDraft] = useState("");
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [memberDrafts, setMemberDrafts] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [accent, setAccent] = useState("#2563eb");
  const [background, setBackground] = useState("#f7f7f8");
  const [text, setText] = useState("#18181b");
  const [font, setFont] = useState("Inter");
  const [shortName, setShortName] = useState("");
  const [shortTouched, setShortTouched] = useState(false);
  const [logoSvg, setLogoSvg] = useState("");
  const [logoName, setLogoName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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

  function resetForm() {
    setName("");
    setLogoSvg("");
    setLogoName("");
    setShortName("");
    setShortTouched(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function readLogoFile(file: File | undefined) {
    if (!file) return;
    if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") {
      setError("The logo needs to be an .svg file — that is the only kind that stays sharp at every size.");
      return;
    }
    if (file.size > 50_000) {
      setError("That SVG is over 50 KB. It is probably a traced image rather than a simple mark.");
      return;
    }
    const content = await file.text();
    if (!/^\s*<svg[\s>]/i.test(content)) {
      setError("That file does not look like an SVG inside.");
      return;
    }
    setError(null);
    setLogoSvg(content.trim());
    setLogoName(file.name);
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
      resetForm();
    }
  }

  async function resetPassword(slug: string) {
    const result = await call({ action: "reset-password", slug });
    if (result?.password) {
      setPasswords((current) => ({ ...current, [slug]: String(result.password) }));
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const done = await call({ action: "delete-client", slug: deleting.slug });
    if (done) {
      setDeleting(null);
      setDeleteDraft("");
    }
  }

  const previewName = name.trim() || "Client name";

  return (
    <div className="admin">
      <header className="admin__top">
        <div>
          <h1 className="admin__title">Clients</h1>
          <p className="admin__sub">
            Every brand you run a calendar for. Adding one creates their board
            straight away.
          </p>
        </div>
        <div className="admin__top-actions">
          <a className="button" href="/">
            ← Back to calendars
          </a>
          <button type="button" className="button button--primary" onClick={() => setAdding(true)}>
            ＋ Add client
          </button>
        </div>
      </header>

      {error && (
        <p className="field__error field__error--banner" role="alert">
          {error}
        </p>
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
                  <div>
                    <h2 className="client-card__name">{client.name}</h2>
                    <p className="client-card__url">
                      /b/{client.slug}/ · {client.events}{" "}
                      {client.events === 1 ? "event" : "events"}
                    </p>
                  </div>
                  <a className="button button--outline" href={`/b/${client.slug}/`}>
                    Open board ↗
                  </a>
                </div>

                {passwords[client.slug] && (
                  <div className="client-card__pw">
                    <span>Team password — copy it now, it is not shown again:</span>
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

                <div className="client-card__section">
                  <span className="client-card__label">Who can sign in with Google</span>
                  {client.members.length === 0 ? (
                    <p className="client-card__none">
                      Nobody yet — this board opens with its team password only.
                    </p>
                  ) : (
                    <div className="member-list">
                      {client.members.map((email) => (
                        <span key={email} className="member-chip">
                          {email}
                          <button
                            type="button"
                            aria-label={`Remove ${email}`}
                            disabled={busy}
                            onClick={() =>
                              void call({ action: "remove-member", slug: client.slug, email })
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
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
                    <button className="button" disabled={busy}>
                      Invite
                    </button>
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
                  <button
                    type="button"
                    className="button button--quiet button--danger"
                    disabled={busy}
                    onClick={() => {
                      setDeleting(client);
                      setDeleteDraft("");
                    }}
                  >
                    Delete client
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
            className="dialog dialog--wide sheet-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-client-title"
            onSubmit={create}
            onKeyDown={(event) => {
              if (event.key === "Escape") setAdding(false);
            }}
          >
            <h2 className="dialog__title" id="add-client-title">
              Add a client
            </h2>
            <p className="dialog__body">
              Their board exists the moment you save — its own look, its own
              address and its own team password, ready to send.
            </p>

            <label className="field">
              <span className="field__label">Client name</span>
              <input
                className="input"
                value={name}
                maxLength={40}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!shortTouched) {
                    setShortName(event.target.value.trim().split(/\s+/)[0].slice(0, 14));
                  }
                }}
                placeholder="Dartee Golf"
              />
            </label>

            <fieldset className="field-group">
              <legend className="field__label">Brand colours</legend>
              <div className="colorfield__grid">
                <ColorField label="Accent" value={accent} onChange={setAccent} presets={ACCENTS} />
                <ColorField
                  label="Page background"
                  value={background}
                  onChange={setBackground}
                  presets={BACKGROUNDS}
                />
                <ColorField label="Text" value={text} onChange={setText} presets={TEXTS} />
              </div>
              <p className="field__hint">
                Just these three — everything else in the calendar is worked out
                to match.
              </p>
            </fieldset>

            <div className="brand-preview" style={{ background, color: text }}>
              <span className="brand-preview__label">Preview</span>
              <div className="brand-preview__nav">
                <span className="brand-preview__mark" style={{ background: accent }} />
                <strong>{previewName}</strong>
              </div>
              <div className="brand-preview__row">
                <span
                  className="brand-preview__chip"
                  style={{ borderColor: accent, color: text }}
                >
                  Confirmed
                </span>
                <span
                  className="brand-preview__chip brand-preview__chip--solid"
                  style={{ background: accent, color: "#fff" }}
                >
                  New event
                </span>
              </div>
            </div>

            <label className="field">
              <span className="field__label">Font</span>
              <select
                className="select"
                value={font}
                onChange={(event) => setFont(event.target.value)}
              >
                {FONTS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Short name for phone home screens</span>
              <input
                className="input"
                value={shortName}
                maxLength={14}
                onChange={(event) => {
                  setShortName(event.target.value);
                  setShortTouched(true);
                }}
                placeholder="Dartee"
              />
              <span className="field__hint">
                When somebody adds this board to their phone, this is the label
                under the icon. About 11 characters fit before it is trimmed.
              </span>
            </label>

            <div className="field">
              <span className="field__label">Logo (optional)</span>
              <div className="filepick">
                <button
                  type="button"
                  className="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  Choose an SVG file
                </button>
                <span className="filepick__name">
                  {logoName || "No file chosen — the calendar mark is used"}
                </span>
                {logoSvg && (
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() => {
                      setLogoSvg("");
                      setLogoName("");
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="filepick__input"
                onChange={(event) => void readLogoFile(event.target.files?.[0])}
              />
              <span className="field__hint">
                A single-colour <strong>.svg</strong> mark — the small square
                icon, not a wide wordmark. It is painted in the accent colour,
                so one file works on any background.
              </span>
            </div>

            <div className="dialog__actions">
              <button type="button" className="button" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={busy || !name.trim()}
              >
                Create the board
              </button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div
          className="scrim"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDeleting(null);
          }}
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setDeleting(null);
            }}
          >
            <h2 className="dialog__title" id="delete-title">
              Delete {deleting.name}?
            </h2>
            <p className="dialog__body">
              This removes their board, all {deleting.events}{" "}
              {deleting.events === 1 ? "event" : "events"}, the full change
              history, everyone&apos;s access and their Slack settings.{" "}
              <strong>It cannot be undone.</strong>
            </p>
            <label className="field">
              <span className="field__label">
                Type <strong>{deleting.name}</strong> to confirm
              </span>
              <input
                className="input"
                value={deleteDraft}
                onChange={(event) => setDeleteDraft(event.target.value)}
                autoFocus
              />
            </label>
            <div className="dialog__actions">
              <button type="button" className="button" onClick={() => setDeleting(null)}>
                Keep it
              </button>
              <button
                type="button"
                className="button button--destructive"
                disabled={busy || deleteDraft.trim() !== deleting.name}
                onClick={() => void confirmDelete()}
              >
                Delete for good
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
