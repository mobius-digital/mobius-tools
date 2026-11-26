/* The old settings table: one row per key, the value is text (often JSON).
   A client caller is refused here by the data door (a setting has no brand). A group that needs a
   per person setting for a client writes its own statement that binds :email. */
import './kernelq.js';
import { door, SYSTEM, SYSTEM_SCOPE } from './db.js';
import { safeJson } from './text.js';

export async function getSetting(ctx, key, fallback = null) {
  const row = await ctx.db.one('platform.settingGet', { key });
  return row && row.value != null ? row.value : fallback;
}

export async function getJson(ctx, key, fallback) {
  return safeJson(await getSetting(ctx, key, null), fallback);
}

export async function putSetting(ctx, key, value) {
  await ctx.db.run('platform.settingPut', { key, value: typeof value === 'string' ? value : JSON.stringify(value) });
}

/** Kernel only: read a setting before a caller is known (sign in, the flag). */
export async function systemJson(env, key, fallback, counters = {}) {
  const row = await door(env, SYSTEM_SCOPE, counters, 'DB', SYSTEM).one('platform.settingGet', { key });
  return safeJson(row && row.value, fallback);
}

/** The bound form a handler gets as ctx.settings. */
export function settingsFor(ctx) {
  return {
    get: (key, fallback = null) => getSetting(ctx, key, fallback),
    getJson: (key, fallback) => getJson(ctx, key, fallback),
    put: (key, value) => putSetting(ctx, key, value),
  };
}
