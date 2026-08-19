"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js once the page has loaded.
 *
 * Renders nothing. Registration is skipped in development — a worker that
 * outlives `next dev` serves yesterday's build assets and is maddening to
 * debug — and in any browser that has no service workers.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Not fatal: the board works exactly as before, just without the
        // instant-open and offline screen.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
