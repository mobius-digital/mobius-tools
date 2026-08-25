/**
 * The Worker entry point.
 *
 * Next-on-Cloudflare generates `.open-next/worker.js` fresh on every build, so
 * a `scheduled` handler cannot be added to it — the next build would wipe it.
 * This wraps it instead: `fetch` is handed straight through, and `scheduled` is
 * bolted on beside it. `wrangler.jsonc` points `main` here rather than at the
 * generated file.
 *
 * One deployment serves every brand, so one cron serves every brand: the tick
 * reads the brand list straight from D1 and calls the app once per brand
 * through a synthetic request, carrying that brand on the same header the
 * middleware would have stamped. The per-tick nonce is what tells /api/cron
 * this call came from in here and not off the internet.
 */
import openNextWorker from "./.open-next/worker.js";

export {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from "./.open-next/worker.js";

export default {
  fetch: openNextWorker.fetch,

  async scheduled(controller, env, ctx) {
    let brands = [];
    try {
      const { results } = await env.DB.prepare(`SELECT id FROM brands`).all();
      brands = (results ?? []).map((row) => row.id);
    } catch (error) {
      console.error("Cron could not list brands:", error);
      return;
    }

    for (const brandId of brands) {
      const nonce = crypto.randomUUID();
      globalThis.__lcCronNonce = nonce;

      try {
        const response = await openNextWorker.fetch(
          new Request("https://cron.internal/api/cron", {
            method: "POST",
            headers: { "x-lc-cron": nonce, "x-brand-id": brandId },
          }),
          env,
          ctx,
        );

        if (!response.ok) {
          console.error(
            `Cron tick for ${brandId} returned ${response.status}: ${await response.text()}`,
          );
        }
      } catch (error) {
        console.error(`Cron tick for ${brandId} threw:`, error);
      } finally {
        // Single use. A value left lying around would be a standing password.
        delete globalThis.__lcCronNonce;
      }
    }
  },
};
