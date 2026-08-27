"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ColorField } from "@/components/ColorField";
import { BrandMark } from "@/components/BrandMark";
import { LogoCropper } from "@/components/LogoCropper";
import { ConnectionSettings } from "@/components/ConnectionSettings";
import { CloseButton, useCloseGuard } from "@/components/UnsavedGuard";

/**
 * The Clients screen — agency admins only (the gate enforces it).
 *
 * Add a client and their board exists immediately at /b/<slug>/: the brand is
 * database rows, not a deployment. The home-screen icons are rasterized here
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
  archived: number;
  logoSvg: string | null;
  seeds: { accent: string; background: string; text: string };
};

/** One logo size rule, for SVG and raster alike. D1 holds ~2 MB per row and
 *  a 1 MB image is ~1.4 MB once base64-encoded, so this is the safe ceiling. */
const MAX_LOGO_BYTES = 1_000_000;

const ACCENTS = ["#2563eb", "#7c3aed", "#c9a227", "#059669", "#dc2626", "#ea580c", "#0891b2", "#111827"];
const BACKGROUNDS = ["#f7f7f8", "#ffffff", "#f4f4f0", "#f8f7fc", "#f1f5f9", "#141414"];
const TEXTS = ["#18181b", "#1a1a18", "#0f172a", "#1b1726", "#f5f5f5"];

/**
 * What to say about a board's contents. The board hides completed and
 * cancelled work, so a bare row count would claim seven events for a board
 * that reads empty — which is exactly the confusion this avoids.
 */
function describeEvents(client: Client): string {
  const live = `${client.events} ${client.events === 1 ? "event" : "events"}`;
  if (client.events > 0) {
    return client.archived > 0 ? `${live} · ${client.archived} archived` : live;
  }
  if (client.archived > 0) {
    return `nothing live · ${client.archived} archived`;
  }
  return "no events yet";
}

export default function AdminPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  /** Null while adding; the client being changed while editing. */
  const [editing, setEditing] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const [deleteDraft, setDeleteDraft] = useState("");
  const [showConnections, setShowConnections] = useState(false);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [memberDrafts, setMemberDrafts] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [accent, setAccent] = useState("#2563eb");
  const [background, setBackground] = useState("#f7f7f8");
  const [text, setText] = useState("#18181b");
  const [logoSvg, setLogoSvg] = useState("");
  const [logoName, setLogoName] = useState("");
  /** Kept apart from the page error, which renders behind this dialog. */
  const [logoError, setLogoError] = useState<string | null>(null);
  /** The logo already on the row, for the preview. Never sent back. */
  const [existingLogo, setExistingLogo] = useState<string | null>(null);
  /** A raster waiting to be squared up before it is accepted. */
  const [cropping, setCropping] = useState<File | null>(null);
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

  function openEdit(client: Client) {
    setName(client.name);
    setAccent(client.seeds.accent);
    setBackground(client.seeds.background);
    setText(client.seeds.text);
    setLogoSvg("");
    setLogoName("");
    setExistingLogo(client.logoSvg);
    setLogoError(null);
    setError(null);
    setEditing(client);
    setAdding(true);
  }

  function resetForm() {
    setCropping(null);
    setName("");
    setLogoSvg("");
    setLogoName("");
    setLogoError(null);
    setExistingLogo(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  /**
   * SVG, PNG or JPEG. An SVG is kept as markup so it can be painted in the
   * brand's accent and suit any background; a raster is read to a data URI
   * and shown exactly as drawn, since it cannot be tinted.
   */
  async function readLogoFile(file: File | undefined) {
    if (!file) return;

    const isSvg = /\.svg$/i.test(file.name) || file.type === "image/svg+xml";
    const isRaster =
      /\.(png|jpe?g)$/i.test(file.name) || /^image\/(png|jpeg)$/.test(file.type);

    if (!isSvg && !isRaster) {
      setLogoError("The logo needs to be an SVG, PNG or JPEG.");
      return;
    }

    // One size rule for both shapes, and a generous one. There used to be two
    // — 50 KB for an SVG, 250 KB for a raster — which meant an ordinary export
    // was refused twice over for reasons that read like a lecture. Size is the
    // database's business, not a judgment about how the file was drawn.
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("That file is over 1 MB. Export the mark a little smaller and try again.");
      return;
    }

    if (isSvg) {
      const content = await file.text();
      // Not a size rule: a .svg that is not SVG inside cannot be painted in
      // the brand color, so it would land on the board as a blank square.
      if (!/^\s*<svg[\s>]/i.test(content)) {
        setLogoError("That file is named .svg but is not an SVG inside.");
        return;
      }
      setLogoError(null);
      setLogoSvg(content.trim());
      setLogoName(file.name);
      return;
    }

    /*
     * Straight into the cropper rather than into the form. Every place a mark
     * is shown is a square, so a wide file had to be squeezed into one and came
     * out crushed; this makes it square first, with the person who can see it
     * deciding how. The cropper hands back a 512px PNG, which settles the file
     * size too.
     */
    setLogoError(null);
    setCropping(file);
  }

  function closeForm() {
    setAdding(false);
    setEditing(null);
    resetForm();
  }

  /**
   * What "unsaved" means here. On a new client it is anything typed at all; on
   * an edit it is anything that differs from the row as it stands, so opening
   * Edit and closing it again never argues with you. The three colors seed
   * from the stored palette, so they compare cleanly.
   */
  const formDirty = adding
    ? editing
      ? name !== editing.name ||
        accent !== editing.seeds.accent ||
        background !== editing.seeds.background ||
        text !== editing.seeds.text ||
        Boolean(logoSvg)
      : Boolean(name.trim() || logoSvg)
    : false;

  const form = useCloseGuard(formDirty, closeForm);

  async function save(event: FormEvent) {
    event.preventDefault();
    setLogoError(null);

    const result = await call({
      action: editing ? "update-client" : undefined,
      slug: editing?.slug,
      name,
      colors: { accent, background, text },
      logoSvg: logoSvg.trim() || undefined,
    });

    if (result?.created) {
      setPasswords((current) => ({
        ...current,
        [String(result.created)]: String(result.password ?? ""),
      }));
    }

    if (result?.created || result?.updated) {
      setAdding(false);
      setEditing(null);
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

  const previewName = name.trim() || "Brand name";

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
          {/* Mobius's own Google and Slack apps, shared by every board — kept
              here rather than in any client's own settings. */}
          <button
            type="button"
            className="button"
            onClick={() => setShowConnections(true)}
          >
            Connections
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              setEditing(null);
              resetForm();
              setAccent("#2563eb");
              setBackground("#f7f7f8");
              setText("#18181b");
              setAdding(true);
            }}
          >
            ＋ Add client
          </button>
        </div>
      </header>

      {/* Only when nothing is covering it — an alert behind a modal is an
          alert nobody reads. While the form is open it renders in there. */}
      {error && !adding && !deleting && (
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
                  <div className="client-card__id">
                    <BrandMark accent={client.accent} logoSvg={client.logoSvg} size={38} />
                    <div>
                    <h2 className="client-card__name">{client.name}</h2>
                    <p className="client-card__url">
                      /b/{client.slug}/ · {describeEvents(client)}
                    </p>
                    </div>
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

                {/* Small: at the width a card actually gets in the grid,
                    full-size buttons wrapped and left Delete stranded alone on
                    a second row. These fit on one line and keep the 40px
                    target height from .button. */}
                <div className="client-card__foot">
                  <button
                    type="button"
                    className="button button--small"
                    disabled={busy}
                    onClick={() => openEdit(client)}
                  >
                    Edit brand
                  </button>
                  <button
                    type="button"
                    className="button button--small"
                    disabled={busy}
                    onClick={() => void resetPassword(client.slug)}
                  >
                    {client.passwordSet ? "Reset team password" : "Set a team password"}
                  </button>
                  {/* Pushed away from the other two: the one irreversible
                      action on this card should not sit a thumb's width from
                      the one you press to change a color. */}
                  <button
                    type="button"
                    className="button button--small button--danger client-card__delete"
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
            if (event.target === event.currentTarget) form.requestClose();
          }}
        >
          {/* Framed rather than one long scroll: the form is tall enough that
              Save used to sit below the fold, which is why it read as though
              there was no way to save at all. */}
          <form
            className="dialog dialog--framed"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-client-title"
            onSubmit={save}
            onKeyDown={(event) => {
              if (event.key === "Escape") form.requestClose();
            }}
          >
            <header className="dialog__head">
              <h2 className="dialog__title" id="add-client-title">
                {editing ? `Edit ${editing.name}` : "Add a client"}
              </h2>
              <CloseButton onClose={form.requestClose} />
            </header>

            <div className="dialog__scroll">
            {(error || logoError) && (
              <p className="field__error field__error--banner" role="alert">
                {logoError ?? error}
              </p>
            )}
            <p className="dialog__body">
              {editing
                ? "Changes show on their board straight away. Their address, events and who can sign in are untouched."
                : "Their board exists the moment you save — its own look, its own address and its own team password, ready to send."}
            </p>

            <label className="field">
              <span className="field__label">Client name</span>
              <input
                className="input"
                value={name}
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
                placeholder="Brand name"
              />
            </label>

            <fieldset className="field-group">
              <legend className="field__label">Brand colors</legend>
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

            <div className="field">
              <span className="field__label">Logo (optional)</span>
              {/* Shown, not just named. A file's own background comes with it
                  — a logo drawn for a white page arrives with the white — and
                  the only way to know that before it is on every client's
                  sign-in screen is to look at it. */}
              <div className="filepick">
                <BrandMark
                  accent={accent}
                  logoSvg={logoSvg || existingLogo}
                  size={56}
                />
                <div className="filepick__main">
                  <button
                    type="button"
                    className="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                  >
                    Choose a file
                  </button>
                  <span className="filepick__name">
                    {logoName ||
                      (existingLogo
                        ? "Keeping the current logo"
                        : "No file chosen — the calendar mark is used")}
                  </span>
                </div>
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
                    Undo
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg"
                className="filepick__input"
                onChange={(event) => void readLogoFile(event.target.files?.[0])}
              />
              <span className="field__hint">
                Their mark — it leads their sign-in screen and sits beside the
                name on their board. Drop the file in as it comes: you get to
                position it in a square, and a white background is taken off for
                you. <strong>SVG</strong> is the one upgrade worth having,
                because it stays sharp at any size and gets painted in their
                accent color. Up to 1 MB. Leave it empty for the calendar mark.
              </span>
            </div>
            </div>

            <footer className="dialog__foot">
              <button type="button" className="button" onClick={form.requestClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={busy || !name.trim()}
              >
                {editing ? "Save changes" : "Create the board"}
              </button>
            </footer>

            {form.prompt}

            {cropping && (
              <LogoCropper
                file={cropping}
                onCancel={() => {
                  setCropping(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                onDone={(dataUri) => {
                  setLogoSvg(dataUri);
                  setLogoName(cropping.name);
                  setCropping(null);
                }}
              />
            )}
          </form>
        </div>
      )}

      {showConnections && <ConnectionSettings onClose={() => setShowConnections(false)} />}

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
              This removes their board, all{" "}
              {deleting.events + deleting.archived}{" "}
              {deleting.events + deleting.archived === 1 ? "event" : "events"},
              the full change history, everyone&apos;s access and their Slack
              settings.{" "}
              <strong>It cannot be undone.</strong>
            </p>
            {/* Not inside a .field__label: that is uppercased by the
                stylesheet, so the name it asked for came out as TEST while the
                row was Test — an instruction you could follow exactly and still
                be refused. The comparison ignores case for the same reason. */}
            <div className="field">
              <label className="confirm-name" htmlFor="delete-confirm">
                Type <strong>{deleting.name}</strong> to confirm
              </label>
              <input
                id="delete-confirm"
                className="input"
                value={deleteDraft}
                onChange={(event) => setDeleteDraft(event.target.value)}
                autoFocus
              />
            </div>
            <div className="dialog__actions">
              <button type="button" className="button" onClick={() => setDeleting(null)}>
                Keep it
              </button>
              <button
                type="button"
                className="button button--destructive"
                disabled={
                  busy ||
                  deleteDraft.trim().toLowerCase() !== deleting.name.toLowerCase()
                }
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
