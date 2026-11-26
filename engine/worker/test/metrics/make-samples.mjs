/* Writes src/metrics/samples/*.json: one made up answer in the old shape for each ported read.
   The answers come from the made up brands in fixture.mjs, with long lists cut to two entries.
   Run: node engine/worker/test/metrics/make-samples.mjs   (only when an answer shape changes) */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeEnv, asCaller, call, NORTH } from '../../src/platform/testkit/index.mjs';
import { forgetStale } from '../../src/metrics/service.js';
import { storeData, setGoals } from './fixture.mjs';

const OUT = fileURLToPath(new URL('../../src/metrics/samples/', import.meta.url));
const PATHS = {
  overview: '/pw/api/overview?days=30',
  client: `/pw/api/client?act=${NORTH}&days=30`,
  forecast: `/pw/api/forecast?act=${NORTH}`,
  plan: `/pw/api/plan?act=${NORTH}`,
  series: `/ah/api/series?act=${NORTH}&days=30`,
};

/* Dates and times follow the day the file was made, so they are set to fixed made up ones. */
function steady(v, key = '') {
  if (Array.isArray(v)) return v.slice(0, 2).map(x => steady(x));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, steady(x, k)]));
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) return '2026-01-15 12:00:00';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return '2026-01-15';
  if (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) return '2026-01';
  if (typeof v === 'string' && /^\d{4}-\d{2} /.test(v)) return `2026-01 ${v.slice(8)}`;
  if (typeof v === 'number' && !Number.isInteger(v)) return Math.round(v * 100) / 100;
  return key === 'reason' && typeof v === 'string' ? 'made up reason' : v;
}

mkdirSync(OUT, { recursive: true });
for (const [name, path] of Object.entries(PATHS)) {
  const env = makeEnv({ groups: ['metrics'], rows: storeData() });
  setGoals(env);
  forgetStale();
  const r = await call(env, 'GET', path, { token: asCaller('owner') });
  if (r.status !== 200 || r.engine !== 'new') throw new Error(`${name}: status ${r.status}, engine ${r.engine}`);
  const { meta, ...answer } = r.json;
  writeFileSync(`${OUT}${name}.json`, `${JSON.stringify(steady(answer), null, 1)}\n`);
  console.log(`${name}: db ${env.logs.at(-1).db}, ${JSON.stringify(answer).length} bytes`);
}
