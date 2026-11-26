/* Imports every group folder, registers its statements, and nothing else. Kernel owned. */
import { register } from './platform/db.js';
import * as platform from './platform/routes.js';
import * as orgs from './orgs/routes.js';
import * as brands from './brands/routes.js';
import * as metrics from './metrics/routes.js';
import * as store from './store/routes.js';
import * as ads from './ads/routes.js';
import * as production from './production/routes.js';
import * as reports from './reports/routes.js';
import * as automations from './automations/routes.js';
import * as ai from './ai/routes.js';

const folders = { platform, orgs, brands, metrics, store, ads, production, reports, automations, ai };

export const domains = Object.entries(folders).map(([folder, g]) => {
  if (g.name !== folder) throw new Error(`group ${folder}: routes.js must export name = '${folder}'`);
  register(folder, g.queries || {});
  return { name: folder, routes: g.routes || [], queries: g.queries || {} };
});
