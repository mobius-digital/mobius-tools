"use client";

import { useEffect, useState } from "react";
import { MILESTONE_ICONS, MILESTONE_LABELS, MILESTONE_KINDS } from "@/lib/pipeline";

const STORAGE_KEY = "lc_legend_dismissed";

/**
 * "How to read this board", shown until someone dismisses it.
 *
 * Every symbol on the Pipeline is learnable in one sentence, and before this
 * the app never said any of those sentences — a new person met TENTATIVE,
 * "clash" and three emoji with no way to find out what they meant.
 */
export function BoardLegend() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  function hide() {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  }

  if (dismissed) {
    return (
      <button
        type="button"
        className="legend__reopen"
        onClick={() => {
          window.localStorage.removeItem(STORAGE_KEY);
          setDismissed(false);
        }}
      >
        How to read this board
      </button>
    );
  }

  return (
    <aside className="legend">
      <div className="legend__head">
        <h2 className="legend__title">How to read this board</h2>
        <button type="button" className="button button--quiet" onClick={hide}>
          Got it
        </button>
      </div>

      <div className="legend__grid">
        <div className="legend__group">
          <h3 className="legend__label">Is the date real?</h3>
          <ul className="legend__list">
            <li>
              <span className="status-dot status-dot--confirmed" aria-hidden />
              <strong>Confirmed</strong> — locked, build against it
            </li>
            <li>
              <span className="status-dot status-dot--tentative" aria-hidden />
              <strong>Tentative</strong> — may move, do not prep hard
            </li>
            <li>
              <span className="status-dot status-dot--at_risk" aria-hidden />
              <strong>At risk</strong> — was locked, now slipping
            </li>
          </ul>
        </div>

        <div className="legend__group">
          <h3 className="legend__label">Run-up work</h3>
          <ul className="legend__list">
            {MILESTONE_KINDS.map((kind) => (
              <li key={kind}>
                <span aria-hidden>{MILESTONE_ICONS[kind]}</span>
                <strong>{MILESTONE_LABELS[kind]}</strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="legend__group">
          <h3 className="legend__label">Warnings</h3>
          <ul className="legend__list">
            <li>
              <span className="clash-flag" aria-hidden>
                clash
              </span>
              Two big launches within 7 days of each other
            </li>
            <li>
              <span className="stale-flag" aria-hidden>
                needs review
              </span>
              Untouched for 3+ weeks with launch coming up — confirm it is current
            </li>
          </ul>
        </div>

        <div className="legend__group">
          <h3 className="legend__label">Channel priority</h3>
          <ul className="legend__list">
            <li>
              <strong>Primary</strong> — this channel builds something
            </li>
            <li>
              <strong>Supporting</strong> — helps, but is not the lead
            </li>
            <li>
              <strong>FYI</strong> — just needs to know it is happening
            </li>
          </ul>
        </div>
      </div>
    </aside>
  );
}
