/* The switch. Two rows in the old settings table:
   engineMode     'new' (the engine answers) or 'old' (every request is piped to the old workers untouched).
                  No row, or anything but 'new', is 'old': the engine answers only once the owner turns it on.
   engineForward  a JSON list of route keys ('GET /pw/api/costs') that are piped even in mode 'new'
   Read at most every 30 seconds, so switching back needs no deploy. */
import { systemJson, putSetting } from './settings.js';
import { door, SYSTEM, SYSTEM_SCOPE } from './db.js';
import { fail } from './errors.js';
import { swallowed } from './log.js';

const KEEP_MS = 30e3;
let kept = null;                  // { flags, until }

export const routeKey = (method, path) => `${String(method).toUpperCase()} ${path}`;

async function load(env) {
  const row = await door(env, SYSTEM_SCOPE, {}, 'DB', SYSTEM).one('platform.settingGet', { key: 'engineMode' });
  const list = await systemJson(env, 'engineForward', []);
  return { mode: row && String(row.value).trim() === 'new' ? 'new' : 'old',
    forward: new Set(Array.isArray(list) ? list.map(String) : []) };
}

export async function read(env) {
  if (kept && kept.until > Date.now()) return kept.flags;
  let flags;
  try {
    flags = await load(env);
  } catch (e) {
    /* The flag cannot be read. Keep the last known answer, or pipe to the old workers, the default. */
    swallowed('the engine flag could not be read, the last known mode is used', e);
    flags = kept ? kept.flags : { mode: 'old', forward: new Set() };
  }
  kept = { flags, until: Date.now() + KEEP_MS };
  return flags;
}

/** Owner only (the row says so, and this checks again). Through the data door. */
export async function write(ctx, { mode, forward } = {}) {
  if (ctx.caller.kind !== 'owner') fail(403, 'Only the owner can do that.');
  if (mode !== undefined) {
    if (mode !== 'new' && mode !== 'old') fail(400, 'mode is new or old', 'input');
    await putSetting(ctx, 'engineMode', mode);
  }
  if (forward !== undefined) {
    if (!Array.isArray(forward) || forward.some(k => typeof k !== 'string' || !/^[A-Z]+ \/\S+$/.test(k))) fail(400, 'forward is a list of route keys', 'input');
    await putSetting(ctx, 'engineForward', JSON.stringify([...new Set(forward)]));
  }
  kept = null;
}

/** Tests only: forget what was kept. */
export function forget() { kept = null; }
