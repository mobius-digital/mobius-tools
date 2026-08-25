"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The "Sign in with Google" button.
 *
 * Google's own script renders the button and hands back a signed ID token; the
 * Worker verifies it and checks the address against the invite list. Nothing is
 * trusted from the browser — this component only carries the token across.
 */

type GoogleIdConfig = {
  client_id: string;
  callback: (response: { credential?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: GoogleIdConfig) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

export function GoogleSignIn({ clientId, from }: { clientId: string; from: string }) {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);

  const handleCredential = useCallback(
    async (response: { credential?: string }) => {
      if (!response.credential) {
        setError("Google did not return a sign-in. Try again.");
        return;
      }

      setBusy(true);
      setError(null);

      try {
        const result = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
        });

        if (!result.ok) {
          const body = (await result.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? "Could not sign in.");
          return;
        }

        router.replace(from);
        router.refresh();
      } catch {
        setError("Network error — check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [from, router],
  );

  useEffect(() => {
    let cancelled = false;

    function render() {
      const id = window.google?.accounts?.id;
      if (!id || !buttonRef.current || cancelled) return;

      id.initialize({ client_id: clientId, callback: handleCredential });
      id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        width: 280,
      });
    }

    if (window.google?.accounts?.id) {
      render();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    const script = existing ?? document.createElement("script");

    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }

    script.addEventListener("load", render);
    script.addEventListener("error", () => {
      if (!cancelled) setScriptFailed(true);
    });

    return () => {
      cancelled = true;
      script.removeEventListener("load", render);
    };
  }, [clientId, handleCredential]);

  return (
    <div className="gate__google">
      <div ref={buttonRef} aria-busy={busy} />

      {scriptFailed && (
        <p className="field__error" role="alert">
          Google&apos;s sign-in script could not load. Check your connection, or
          use the shared password if the team has left it switched on.
        </p>
      )}

      {busy && <p className="gate__hint">Signing you in…</p>}

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
