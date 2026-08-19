"use client";

import { useEffect, useRef, useState } from "react";
import { brand } from "@/brand.config";

type Device = "iphone" | "android" | "desktop";

/** True when the page is running as an installed home-screen app. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Older iOS exposes it here instead.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Best guess at which set of steps to open on. */
function guessDevice(): Device {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch points tell it apart.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return "iphone";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/**
 * How to put the board on a phone or tablet home screen.
 *
 * There is no install button the app can offer — on iPhone and iPad it is
 * Safari's own Share menu, and nothing else — so the most useful thing to
 * show is the exact taps, opened on the steps for the device in hand.
 */
export function InstallGuide({ onClose }: { onClose: () => void }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [installed, setInstalled] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDevice(guessDevice());
    setInstalled(isInstalled());
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="scrim"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2 className="dialog__title" id="install-title">
          Add to your phone
        </h2>

        {installed ? (
          <>
            <p className="install__done">
              <span aria-hidden>✅</span>
              <span>
                You&apos;re already running the {brand.productName} from your
                home screen.
              </span>
            </p>
            <p className="dialog__body">
              To put it on another device, open this same address there and
              follow the steps under Settings → Add to your phone.
            </p>
          </>
        ) : (
          <>
            <p className="dialog__body">
              Opens full-screen from its own icon, like any other app — no App
              Store, and it updates itself.
            </p>

            <div className="segmented install__tab" role="group" aria-label="Device">
              {(
                [
                  ["iphone", "iPhone / iPad"],
                  ["android", "Android"],
                  ["desktop", "Computer"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`segmented__option${device === key ? " segmented__option--active" : ""}`}
                  onClick={() => setDevice(key)}
                  aria-pressed={device === key}
                >
                  {label}
                </button>
              ))}
            </div>

            {device === "iphone" && (
              <>
                <p className="install__note">
                  This only works from <strong>Safari</strong>. If you are in
                  Chrome or another browser on an iPhone or iPad, open this
                  page in Safari first.
                </p>
                <ol className="install__steps">
                  <li>
                    Tap the <strong>Share</strong> button — the square with an
                    arrow, at the bottom of the screen on an iPhone and top
                    right on an iPad.
                  </li>
                  <li>
                    Scroll the list and tap <strong>Add to Home Screen</strong>.
                  </li>
                  <li>
                    Tap <strong>Add</strong>. The icon appears as
                    &ldquo;{brand.shortName}&rdquo;.
                  </li>
                </ol>
              </>
            )}

            {device === "android" && (
              <ol className="install__steps">
                <li>
                  In Chrome, tap the <strong>⋮</strong> menu at the top right.
                </li>
                <li>
                  Tap <strong>Add to Home screen</strong> (it may say{" "}
                  <strong>Install app</strong>).
                </li>
                <li>
                  Tap <strong>Add</strong>. The icon appears as
                  &ldquo;{brand.shortName}&rdquo;.
                </li>
              </ol>
            )}

            {device === "desktop" && (
              <ol className="install__steps">
                <li>
                  In Chrome or Edge, look for the <strong>install</strong> icon
                  at the right end of the address bar (a screen with a down
                  arrow), or open the <strong>⋮</strong> menu and choose{" "}
                  <strong>Install {brand.shortName}</strong>.
                </li>
                <li>
                  It opens in its own window and shows up in your dock or
                  taskbar like any other app.
                </li>
              </ol>
            )}

            <p className="dialog__body dialog__body--muted">
              You stay signed in, and it picks up every update automatically.
            </p>
          </>
        )}

        <div className="dialog__actions">
          <button
            ref={closeRef}
            type="button"
            className="button button--primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
