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
};

const DisplayNameContext = createContext<DisplayNameContextValue | null>(null);

export function useDisplayName(): DisplayNameContextValue {
  const context = useContext(DisplayNameContext);
  if (!context) {
    throw new Error("useDisplayName must be used inside <DisplayNameProvider>");
  }
  return context;
}

export function DisplayNameProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  useEffect(() => {
    setName(window.localStorage.getItem(STORAGE_KEY) ?? "");
  }, []);

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
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? "";
    if (stored.trim()) {
      // Keep React state in step if another tab set it.
      setName(stored);
      return stored;
    }
    return openPrompt("");
  }, [openPrompt]);

  const promptForName = useCallback(async () => {
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? "";
    return openPrompt(stored);
  }, [openPrompt]);

  function settle(value: string | null) {
    setOpen(false);
    resolverRef.current?.(value);
    resolverRef.current = null;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();

    if (!trimmed) {
      setError("Enter a name so your edits are attributable.");
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, trimmed);
    setName(trimmed);
    settle(trimmed);
  }

  return (
    <DisplayNameContext.Provider value={{ name, ensureName, promptForName }}>
      {children}

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
              Your name is stamped on every change you make, so the team can see
              who moved a date. Stored on this device only.
            </p>

            <form className="dialog__form" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                className={`input${error ? " input--invalid" : ""}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="e.g. Cole"
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
  const { name, promptForName } = useDisplayName();

  // Rendered empty until localStorage has been read, to avoid a hydration flash.
  if (name === null) return <span className="identity" aria-hidden />;

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
