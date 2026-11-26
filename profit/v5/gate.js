/* The new client gate, per brand. Pure: no imports, so router.js, shell.js and app.js share it and a node test can
   import it. The server's answer rides on /api/me (me.client.onboarding, account-health onboard.js onboardGate):
     gated        some brand of this login still has setup steps open
     slug         the first held brand (where Get started opens)
     gated_slugs  every held brand
     all_gated    every brand of the login is held (pages with no brand go to Get started too)
     only         a colleague handed one setup step: held everywhere
   A client whose running brand has no checklist keeps that brand while a new one is set up.
   The team and "See as client" are never gated. */

/** The onboarding answer while a real client login still has setup steps open, else null. */
export function gateOf(st) {
  const o = st && st.role === 'client' && !st.asClient && st.me && st.me.client && st.me.client.onboarding;
  return o && o.gated ? o : null;
}

const slugOf = g => g.slug || String(g.brand || '').replace(/^brand_/, '').replace(/_/g, '-');

/** Is this brand (slug) held on Get started? An older server answer with no list holds every brand. */
export function heldBrand(gate, slug) {
  if (!gate) return false;
  if (gate.only && gate.only.length) return true;
  if (!Array.isArray(gate.gated_slugs)) return true;
  return gate.gated_slugs.includes(slug);
}

/** Is the page on screen held? (The menu and the phone tabs then show only Get started.) */
export function heldHere(st, route) {
  const g = gateOf(st);
  if (!g) return false;
  if (!route || !route.brand || route.brand === 'all' || route.brand === 'none') return !!g.all_gated || !Array.isArray(g.gated_slugs) || !!(g.only && g.only.length);
  return heldBrand(g, route.brand);
}

/** Where an address goes for a gated client: Get started of a held brand, or the address itself when its brand is
 *  not held. Their profile is always open. */
export function gateRoute(r, gate) {
  if (!gate || (r && r.line === 'profile')) return r;
  const brand = r && r.view === 'brand' && r.brand && r.brand !== 'all' ? r.brand : null;
  if (brand && !heldBrand(gate, brand)) return r;
  if (!brand && Array.isArray(gate.gated_slugs) && !gate.all_gated && !(gate.only && gate.only.length)) return r;
  return { view: 'brand', brand: brand || slugOf(gate), line: 'get-started', tab: 'index' };
}
