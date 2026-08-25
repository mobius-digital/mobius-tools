"use client";

/** Reloads the page — the offline screen's only control. */
export function RetryButton() {
  return (
    <button
      type="button"
      className="button button--primary"
      onClick={() => window.location.replace("/")}
    >
      Try again
    </button>
  );
}
