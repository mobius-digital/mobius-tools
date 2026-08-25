"use client";

import { useBrand } from "./BrandProvider";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function PasswordForm({ from }: { from: string }) {
  const { path } = useBrand();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(path("/api/auth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Could not sign in.");
        setPassword("");
        return;
      }

      router.replace(from);
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="gate__form" onSubmit={handleSubmit}>
      <label className="visually-hidden" htmlFor="app-password">
        Team password
      </label>
      <input
        id="app-password"
        className={`input${error ? " input--invalid" : ""}`}
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Team password"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "password-error" : undefined}
      />

      {error && (
        <p className="field__error" id="password-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="button button--primary"
        disabled={submitting || password.length === 0}
      >
        {submitting ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}
