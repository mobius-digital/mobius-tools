"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * "You have unsaved changes" — one implementation, for every dialog in the app.
 *
 * Closing a dialog is offered in four ways (the ✕, Cancel, Escape, a click on
 * the backdrop) and a click on the backdrop is the easy accident: it is what
 * you do to dismiss something you have finished with, and it used to throw
 * away a half-written form without a word. All four now go through the same
 * `requestClose`, which only interrupts when there is something to lose.
 *
 * The prompt is deliberately not a browser `confirm()`: those cannot be styled,
 * read as a page error on a phone, and this app does not use them anywhere.
 */

/** Reports whether one dialog — or one panel inside one — has unsaved input. */
type Report = (id: string, dirty: boolean) => void;

const DirtyContext = createContext<Report | null>(null);

/**
 * For a container of several editable panels, where the container owns the
 * close button but each panel knows whether it is dirty. The settings window
 * is the case this exists for.
 */
export function useDirtyTracker() {
  const [ids, setIds] = useState<string[]>([]);

  const report = useCallback<Report>((id, dirty) => {
    setIds((current) => {
      const has = current.includes(id);
      if (dirty === has) return current;
      return dirty ? [...current, id] : current.filter((value) => value !== id);
    });
  }, []);

  return { dirty: ids.length > 0, report };
}

export function DirtyProvider({
  report,
  children,
}: {
  report: Report;
  children: ReactNode;
}) {
  return <DirtyContext.Provider value={report}>{children}</DirtyContext.Provider>;
}

/**
 * Called by a panel to say whether it currently holds unsaved input. Safe to
 * call outside a DirtyProvider, so a panel can be used on its own.
 */
export function useReportDirty(id: string, dirty: boolean) {
  const report = useContext(DirtyContext);

  useEffect(() => {
    report?.(id, dirty);
    // Unmounting means the panel is gone and so is whatever was typed in it —
    // it must not keep the window hostage from a section nobody is looking at.
    return () => report?.(id, false);
  }, [id, dirty, report]);
}

/**
 * Wraps a dialog's close. Returns the close to wire to every exit, and the
 * confirmation to render inside the dialog.
 */
export function useCloseGuard(dirty: boolean, onClose: () => void) {
  const [asking, setAsking] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty) setAsking(true);
    else onClose();
  }, [dirty, onClose]);

  const prompt = asking ? (
    <UnsavedPrompt
      onStay={() => setAsking(false)}
      onDiscard={() => {
        setAsking(false);
        onClose();
      }}
    />
  ) : null;

  return { requestClose, prompt };
}

function UnsavedPrompt({
  onStay,
  onDiscard,
}: {
  onStay: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      className="scrim scrim--confirm"
      role="presentation"
      // No backdrop-to-dismiss here: this dialog exists *because* a stray
      // backdrop click was about to lose something.
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onStay();
          }
        }}
      >
        <h2 className="dialog__title" id="unsaved-title">
          You have unsaved changes
        </h2>
        <p className="dialog__body">
          Close now and what you have typed is lost. Going back leaves it
          exactly as it is, so you can save it.
        </p>

        <div className="dialog__actions">
          <button type="button" className="button button--danger" onClick={onDiscard}>
            Discard changes
          </button>
          {/* The safe option is the default one, and it takes the focus. */}
          <button
            type="button"
            className="button button--primary"
            onClick={onStay}
            autoFocus
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}

/** The ✕ in a dialog's top corner. */
export function CloseButton({
  onClose,
  label = "Close",
}: {
  onClose: () => void;
  label?: string;
}) {
  return (
    <button type="button" className="dialog__close" onClick={onClose} aria-label={label}>
      <span aria-hidden>✕</span>
    </button>
  );
}
