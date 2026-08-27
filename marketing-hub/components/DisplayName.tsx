"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

const STORAGE_KEY = "lc_display_name";

type DisplayNameContextValue = {
  /** null until the browser has read localStorage, then "" or a real name. */
  name: string | null;
  /**
   * Resolves with the editor's display name, prompting for it the first time.
   * Resolves null if the prompt is dismissed, in which case the caller should
   * abandon whatever edit it was about to make.
   */
  ensureName: () => Promise<string | null>;
  /** Opens the prompt to change an already-stored name. */
  promptForName: () => Promise<string | null>;
  /** True when the name came from a verified login rather than being typed. */
  verified: boolean;
  /**
   * True while a signed-in person still has to say what they want to be
   * called. The tour waits for this, so the two do not stack up on a first
   * visit.
   */
  settlingName: boolean;
};

const DisplayNameContext = createContext<DisplayNameContextValue | null>(null);

export function useDisplayName(): DisplayNameContextValue {
  const context = useContext(DisplayNameContext);
  if (!context) {
    throw new Error("useDisplayName must be used inside <DisplayNameProvider>");
  }
  return context;
}

export function DisplayNameProvider({
  identity = null,
  needsName = false,
  children,
}: {
  /** The name a signed-in person goes by — theirs if chosen, Google's if not. */
  identity?: string | null;
  /** Signed in, but has never been asked what to call them. */
  needsName?: boolean;
  children: ReactNode;
}) {
  const [name, setName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  /** The one-time "what should we call you?" on a first sign-in. */
  const [introducing, setIntroducing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  useEffect(() => {
    if (identity) {
      setName(identity);
      // Asked once, on the first visit after signing in. Google's name is a
      // good guess and is already in the box; this is the chance to correct
      // it, which used to be impossible for a signed-in person.
      if (needsName) {
        setDraft(identity);
        setError(null);
        setIntroducing(true);
      }
      return;
    }
    setName(window.localStorage.getItem(STORAGE_KEY) ?? "");
  }, [identity, needsName]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const openPrompt = useCallback((initial: string) => {
    setDraft(initial);
    setError(null);
    setOpen(true);

    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const ensureName = useCallback(async () => {
    if (identity) return identity;

    const stored = window.localStorage.getItem(STORAGE_KEY) ?? "";
    if (stored.trim()) {
      // Keep React state in step if another tab set it.
      setName(stored);
      return stored;
    }
    return openPrompt("");
  }, [identity, openPrompt]);

  const promptForName = useCallback(async () => {
    // Signed in or not, a person may correct what they are called. For a
    // signed-in person it is saved against their account and follows them to
    // every device; for a shared-password session there is no account to save
    // it against, so it stays on the device.
    if (identity) return openPrompt(name ?? identity);

    const stored = window.localStorage.getItem(STORAGE_KEY) ?? "";
    return openPrompt(stored);
  }, [identity, name, openPrompt]);

  /** Saves a signed-in person's chosen name against their account. */
  const saveToAccount = useCallback(async (chosen: string): Promise<string | null> => {
    setSaving(true);
    try {
      const response = await fetch("/api/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: chosen }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        name?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "That name could not be saved.");
        return null;
      }
      return body.name ?? chosen;
    } catch {
      setError("No connection — your name was not saved.");
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  function settle(value: string | null) {
    setOpen(false);
    resolverRef.current?.(value);
    resolverRef.current = null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();

    if (!trimmed) {
      setError("Enter a name so your edits are attributable.");
      return;
    }

    if (identity) {
      const saved = await saveToAccount(trimmed);
      if (!saved) return;
      setName(saved);
      setIntroducing(false);
      settle(saved);
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, trimmed);
    setName(trimmed);
    settle(trimmed);
  }

  return (
    <DisplayNameContext.Provider
      value={{
        name,
        ensureName,
        promptForName,
        verified: Boolean(identity),
        settlingName: introducing,
      }}
    >
      {children}

      {/*
       * The first-run introduction. Deliberately not dismissible by clicking
       * away or pressing Escape: it is one field, it is asked once, and every
       * edit from here on is signed with the answer.
       */}
      {introducing && (
        <div className="scrim" role="presentation">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intro-name-title"
          >
            <h2 className="dialog__title" id="intro-name-title">
              What should we call you?
            </h2>
            <p className="dialog__body">
              This is the name on your edits, and the name others pick from
              when they say who owns a launch. <strong>First and last</strong>
              — two people called Nick are one name in a list, and nobody can
              tell whose launch is whose. We have started with the name on
              your Google account.
            </p>

            <form className="dialog__form" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                className={`input${error ? " input--invalid" : ""}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="First and last name"
                maxLength={40}
                autoFocus
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "intro-name-error" : undefined}
              />
              {error && (
                <p className="field__error" id="intro-name-error" role="alert">
                  {error}
                </p>
              )}
              <p className="field__hint">
                You can change this later in Settings → Your account.
              </p>

              <div className="dialog__actions">
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={saving || !draft.trim()}
                >
                  {saving ? "Saving…" : "That's me"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {open && (
        <div
          className="scrim"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) settle(null);
          }}
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="display-name-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") settle(null);
            }}
          >
            <h2 className="dialog__title" id="display-name-title">
              Who&apos;s editing?
            </h2>
            <p className="dialog__body">
              Your name is stamped on every change you make, and is what others
              pick from when they say who owns a launch. First and last, so two
              people who share a first name do not become one entry.
            </p>

            <form className="dialog__form" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                className={`input${error ? " input--invalid" : ""}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="First and last name"
                maxLength={40}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "display-name-error" : undefined}
              />
              {error && (
                <p className="field__error" id="display-name-error" role="alert">
                  {error}
                </p>
              )}

              <div className="dialog__actions">
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => settle(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="button button--primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DisplayNameContext.Provider>
  );
}

/** The "editing as …" affordance in the nav, which doubles as the way to change it. */
export function DisplayNameBadge() {
  const { name, promptForName, verified } = useDisplayName();

  // Rendered empty until localStorage has been read, to avoid a hydration flash.
  if (name === null) return <span className="identity" aria-hidden />;

  // Under Google sign-in the name is not editable, so it should not look like a
  // button that does nothing when pressed.
  if (verified) {
    return (
      <span className="identity identity--static" title="Signed in with Google">
        <span className="identity__label">Signed in as</span>
        <span className="identity__name">{name}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="identity"
      onClick={() => void promptForName()}
      title={name ? "Change the name your edits are stamped with" : undefined}
    >
      {name ? (
        <>
          <span className="identity__label">Editing as</span>
          <span className="identity__name">{name}</span>
        </>
      ) : (
        <span className="identity__label">Set your name</span>
      )}
    </button>
  );
}
