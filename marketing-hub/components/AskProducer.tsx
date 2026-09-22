"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useBrand } from "./BrandProvider";

/**
 * The Producer, in the app: a button, and the shared Ask panel
 * (public/ask/ask-ui.js, the same panel every Mobius app uses) talking to
 * /b/<brand>/api/ask. Ctrl+K opens it too. What is on screen (which view,
 * which date range) travels with every question.
 */

type AskUI = {
  init: (config: Record<string, unknown>) => void;
  open: (prefill?: string) => void;
  state?: { base?: string };
};
declare global {
  interface Window { AskUI?: AskUI; __askProducer?: string }
}

export function AskProducer() {
  const brand = useBrand();
  const pathname = usePathname();

  useEffect(() => {
    const base = `/b/${brand.slug}/api/ask`;
    const init = () => {
      if (!window.AskUI || window.__askProducer === brand.slug) return;
      window.__askProducer = brand.slug;
      window.AskUI.init({
        name: "Producer",
        base,
        api: async (path: string, opts: { method?: string; body?: string } = {}) => {
          const r = await fetch(path, {
            method: opts.method || "GET",
            headers: opts.body ? { "Content-Type": "application/json" } : {},
            body: opts.body,
            credentials: "same-origin",
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`);
          return j;
        },
        intro:
          'Ask me about the calendar. Try: "what goes live in the next two weeks?", "what is stuck in assets?", "who moved the October drop?", "add a Black Friday email on Nov 28, owner Noma, email primary", "move the holiday launch to Dec 5".',
        screen: () => ({
          screen: window.location.pathname.replace(`/b/${brand.slug}`, "") || "/calendar",
          query: window.location.search || null,
          brand: brand.name,
        }),
        onApplied: () => window.location.reload(),
      });
    };
    if (!document.getElementById("ask-css")) {
      const link = document.createElement("link");
      link.id = "ask-css";
      link.rel = "stylesheet";
      link.href = "/ask/ask.css?v=1";
      document.head.appendChild(link);
    }
    if (window.AskUI) init();
    else if (!document.getElementById("ask-js")) {
      const script = document.createElement("script");
      script.id = "ask-js";
      script.src = "/ask/ask-ui.js?v=1";
      script.onload = init;
      document.body.appendChild(script);
    }
  }, [brand.slug, brand.name, pathname]);

  return (
    <button
      type="button"
      className="ask-producer-fab"
      onClick={() => window.AskUI?.open()}
      title="Ask the Producer (Ctrl+K)"
      aria-label="Ask the Producer"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 4.5 16.8L21 21l-1.2-4.5A9 9 0 0 0 12 3Z" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.45V13" />
        <path d="M12.5 16h.01" />
      </svg>
      <span>Ask the Producer</span>
    </button>
  );
}
