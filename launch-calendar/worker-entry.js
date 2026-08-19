/**
 * The Worker entry point.
 *
 * Next-on-Cloudflare generates `.open-next/worker.js` fresh on every build, so
 * a `scheduled` handler cannot be added to it — the next build would wipe it.
 * This wraps it instead: `fetch` is handed straight through, and `scheduled` is
 * bolted on beside it. `wrangler.jsonc` points `main` here rather than at the
 * generated file.
 *
 * The Durable Object classes have to be re-exported by name. OpenNext's build
 * registers them in the deployed script, and a migration would fail to find
 * them if this module quietly swallowed them.
 *
 * Cron work reaches the app through a synthetic request rather than by talking
 * to D1 here, because `getCloudflareContext()` — which every lib in `lib/` uses
 * to reach the database — is only populated inside OpenNext's request wrapper.
 * The nonce is how `/api/cron` tells this request apart from one off the
 * internet: it is random per tick, never leaves the isolate, and is cleared as
 * soon as the tick is done.
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
    const nonce = crypto.randomUUID();
    globalThis.__lcCronNonce = nonce;

    try {
      const response = await openNextWorker.fetch(
        new Request("https://cron.internal/api/cron", {
          method: "POST",
          headers: { "x-lc-cron": nonce },
        }),
        env,
        ctx,
      );

      if (!response.ok) {
        console.error(`Cron tick returned ${response.status}: ${await response.text()}`);
      }
    } catch (error) {
      console.error("Cron tick threw:", error);
    } finally {
      // Single use. A value left lying around would be a standing password,
      // even one nobody outside this isolate has ever seen.
      delete globalThis.__lcCronNonce;
    }
  },
};
