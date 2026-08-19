import { brand } from "@/brand.config";
import { RetryButton } from "@/components/RetryButton";

/**
 * Shown by the service worker when the home-screen app is opened with no
 * connection. Cached at install time, so it has to stand on its own: no data,
 * no client state, just the way back in.
 */
export default function OfflinePage() {
  return (
    <section className="offline">
      <h1 className="offline__title">You&apos;re offline</h1>
      <p className="offline__body">
        The {brand.productName} needs a connection to show the board — it is
        live for everyone, so nothing is kept on this device that could be out
        of date. Reconnect and try again.
      </p>
      <RetryButton />
    </section>
  );
}
