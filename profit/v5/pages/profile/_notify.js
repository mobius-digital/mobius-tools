/* How things reach me: the pure rules, the same three as the account-health worker (src/notify.js), so a tap fills
   the page at once and the server answer only confirms it. No imports, no DOM: test-notify.mjs runs it in node.

   notify = {
     preset:   'only_urgent' | 'urgent_brief' | 'everything' | 'custom',
     channels: { slack_dm, email, push },                     "Also send to". In Locus is always on and never stored.
     types:    { [typeId]: { slack_dm, email, push } }        one cell per type and channel
   }
   catalog = the server's list of types: [{ id, presets: [preset ids it is on in], ... }] (or { types: [...] }).

   - Picking a preset (not custom): every cell is refilled from the preset and the channels that are on.
   - Changing the channels while the preset is not custom: refill. While custom: the cells stay as stored (a channel
     switched off reads as off for every type, and switching it back brings the cells back).
   - Editing one cell: the preset becomes custom. It is never matched back to a preset by itself. */

export const CHANNELS = ['slack_dm', 'email', 'push'];
export const PRESETS = ['only_urgent', 'urgent_brief', 'everything', 'custom'];

const listOf = catalog => (Array.isArray(catalog) ? catalog : (catalog && Array.isArray(catalog.types)) ? catalog.types : []);
const cleanChannels = ch => Object.fromEntries(CHANNELS.map(c => [c, !!(ch && ch[c])]));

/** For each type: a cell is on when the type is in the preset AND that channel is on. */
export function fillPreset(catalog, presetId, channels) {
  const on = cleanChannels(channels), out = {};
  for (const t of listOf(catalog)) {
    if (!t || !t.id) continue;
    const inPreset = Array.isArray(t.presets) && t.presets.includes(presetId);
    out[t.id] = Object.fromEntries(CHANNELS.map(c => [c, inPreset && on[c]]));
  }
  return out;
}

/** The state for a person with nothing saved: Only urgent + morning brief, every channel off, so every cell is off. */
export function defaultNotify(catalog) {
  const channels = cleanChannels(null);
  return { preset: 'urgent_brief', channels, types: fillPreset(catalog, 'urgent_brief', channels) };
}

/** Any saved or answered notify, made complete for this catalog (unknown types and channels dropped). */
export function normalNotify(raw, catalog) {
  const base = defaultNotify(catalog);
  if (!raw || typeof raw !== 'object') return base;
  const preset = PRESETS.includes(raw.preset) ? raw.preset : base.preset;
  const channels = cleanChannels(raw.channels);
  if (preset !== 'custom') return { preset, channels, types: fillPreset(catalog, preset, channels) };
  const types = {};
  for (const t of listOf(catalog)) {
    if (!t || !t.id) continue;
    types[t.id] = cleanChannels(raw.types && raw.types[t.id]);
  }
  return { preset, channels, types };
}

/** Pick a preset. 'custom' is a state, not a choice: picking it changes nothing. */
export function applyPreset(notify, catalog, presetId) {
  const cur = normalNotify(notify, catalog);
  if (presetId === 'custom' || !PRESETS.includes(presetId)) return cur;
  return { preset: presetId, channels: cur.channels, types: fillPreset(catalog, presetId, cur.channels) };
}

/** Change "Also send to" (a partial set of channels). Refills unless the preset is custom. */
export function applyChannels(notify, catalog, channels) {
  const cur = normalNotify(notify, catalog);
  const next = cleanChannels({ ...cur.channels, ...(channels || {}) });
  if (cur.preset === 'custom') return { preset: 'custom', channels: next, types: cur.types };
  return { preset: cur.preset, channels: next, types: fillPreset(catalog, cur.preset, next) };
}

/** Change one cell. The preset becomes custom. */
export function applyCell(notify, catalog, typeId, channel, value) {
  const cur = normalNotify(notify, catalog);
  if (!CHANNELS.includes(channel) || !cur.types[typeId]) return cur;
  return { preset: 'custom', channels: cur.channels, types: { ...cur.types, [typeId]: { ...cur.types[typeId], [channel]: !!value } } };
}

export const isCustom = notify => !!notify && notify.preset === 'custom';

/** What a cell reads as: in_app is always on; any other channel only while it is on in "Also send to". */
export function cellOn(notify, typeId, channel) {
  if (channel === 'in_app') return true;
  return !!(notify && notify.channels && notify.channels[channel] && notify.types && notify.types[typeId] && notify.types[typeId][channel]);
}

/* ---- the client page (2026-11-26): pure helpers, so test-notify.mjs checks them in node ---- */

/** Is this answer the client list? Only then does "See as client" draw it (never the team's list by mistake). */
export const isClientCatalog = d => !!(d && d.catalog && d.catalog.audience === 'client' && Array.isArray(d.catalog.types));

/** The read only "See as client" address: the client page for this brand. */
export const previewPath = brandId => '/api/me/delivery?as=client' + (brandId ? '&act=' + encodeURIComponent(brandId) : '');

const TEAM_GROUPS = { urgent: 'Urgent', needs_me: 'Needs you', brief: 'Morning' };
const CLIENT_GROUPS = { urgent: 'Due soon', needs_me: 'Waiting on you', brief: 'Updates and reports' };
/** A group's heading, in the reader's words. */
export const groupTitle = (group, client = false) => (client ? CLIENT_GROUPS : TEAM_GROUPS)[group] || group;

/** "About Northlake Golf." for a client: its own brands, as the server named them. Empty when there are none. */
export function brandLine(brands) {
  const names = (Array.isArray(brands) ? brands : []).map(b => b && String(b.name || '').trim()).filter(Boolean);
  if (!names.length) return '';
  const list = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  return 'About ' + list + ' only.';
}

/** The small line under a group: when copies outside Locus start. */
export function copyNotes(list, { client = false, copiesOn = false } = {}) {
  const out = [];
  if ((list || []).some(t => t.copy === 'dec5') && !copiesOn) out.push('Slack and email copies start Dec 5. Until then they show here in Locus.');
  if ((list || []).some(t => t.copy === 'soon')) out.push(client ? 'Copies outside Locus are coming soon. Until then they show here in Locus.' : 'Slack copies are coming soon.');
  return out;
}
