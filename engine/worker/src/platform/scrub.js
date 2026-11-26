/* The last pass over an answer: rows of other brands are dropped, and a client never gets team only keys. */
// from account-health/worker/src/brandguard.js (filterActs, scrub, ALWAYS_OUT)

const ALWAYS_OUT = new Set(['by', 'created_by', 'agreed_by', 'slack_channel', 'brief_channel', 'client_channel',
  'internal_channel', 'report_config', 'report_config_json', 'review_first', 'brief_enabled', 'slack_ts', 'sent_channel',
  'steer', 'lastRun', 'team', 'storage_prefix', 'tw_shop_token', 'shopify_token', 'access_token', 'notes_internal',
  'internal_notes', 'team_notes']);
/* A chat channel id under any key that names a channel, wherever it sits. */
const CHANNEL_ID = /^[CGD][A-Z0-9]{8,12}$/;
const ROW_ID = /^(act_|asana_|brand_)/;
const KEY_ID = /^(act_\d+|brand_[a-z0-9_]+)$/;

/** Drop every object that carries an act_id outside `only`, and every key that is such an id. */
export function filterBrands(v, only) {
  if (Array.isArray(v)) {
    return v.filter(x => !(x && typeof x === 'object' && typeof x.act_id === 'string' && ROW_ID.test(x.act_id) && !only.has(x.act_id)))
      .map(x => filterBrands(x, only));
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (KEY_ID.test(k) && !only.has(k)) continue;
      o[k] = filterBrands(x, only);
    }
    return o;
  }
  return v;
}

/** Remove the keys a client never sees. */
export function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (!v || typeof v !== 'object') return v;
  const o = {};
  for (const [k, x] of Object.entries(v)) {
    if (ALWAYS_OUT.has(k)) continue;
    if (typeof x === 'string' && CHANNEL_ID.test(x) && /channel|post|slack/i.test(k)) continue;
    o[k] = scrub(x);
  }
  return o;
}
