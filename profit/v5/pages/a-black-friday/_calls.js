/* War Room: the ad call rows for one brand, by object. Pure (no DOM), so node tests can load it.
   Quiet rows (done, skipped, watched) still show their call; a hands-off row never does: that brand gets no call
   pill and no write sheet (handsoff.js on the server marks them hidden.why = 'hands_off'). */
export const isHandsOffRow = r => !!(r && r.hidden && r.hidden.why === 'hands_off');

/** The ad call rows for one brand: { ad: {id: row}, adset: {id: row} }. */
export function callsBy(D) {
  const rows = D && D.calls ? [...(D.calls.rows || []), ...(D.calls.quiet || [])] : [];
  const out = { ad: {}, adset: {} };
  for (const r of rows) {
    if (!r || isHandsOffRow(r)) continue;
    if (r.level === 'ad') { const id = String(r.ad_id || r.object_id || ''); if (id && !out.ad[id]) out.ad[id] = r; }
    else if (r.level === 'adset') { const id = String(r.adset_id || r.object_id || ''); if (id && !out.adset[id]) out.adset[id] = r; }
  }
  return out;
}
