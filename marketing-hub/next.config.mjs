import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/**
 * `next dev` has no Worker around it, so the D1 binding the app reads through
 * getCloudflareContext() would be missing. This wires wrangler's local
 * bindings (the same .wrangler/state D1 that `npm run preview` uses) into the
 * dev server. It is a no-op in a real build.
 */
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
