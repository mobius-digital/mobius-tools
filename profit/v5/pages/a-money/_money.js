/* Shared by Money > Billing and Money > Margin. One read: account-health GET /api/agency/economics (owner only):
   Ledger money received per client this month, payments not matched to a client, estimated team time and AI cost. */
import { world } from '../a-today/_ag.js';

export async function loadMoney(ctx) {
  try { return await ctx.api('/api/agency/economics', { worker: 'ah', signal: ctx.signal }); }
  catch (e) { if (e && e.status === 403) return { owner_only: true }; throw e; }
}
export async function sampleMoney() { const w = await world(); return w.billing; }
