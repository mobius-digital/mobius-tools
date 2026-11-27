/* Entry. Reads the stored session, paints the shell from the last saved copy, then starts routing.
   No session: the sign in page. Sample mode (?sample=1): fixtures only, no API call. */

import { token, SAMPLE, LS, LS5, APP_NAME, QS } from './config.js';
import { api, cached, fixture, setUser, wipeSaved, storedClient, onAnnounce } from './data.js';
import * as shell from './shell.js';
import * as router from './router.js';
import { heldHere } from './gate.js';
import { setFeatures } from './menu.js';

const app = document.getElementById('app');
const hideLoader = () => { const l = document.getElementById('lx-load'); if (l) l.remove(); };
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
document.title = APP_NAME;

/* me + the brand list, in one saved copy, so the menu and the brand switcher draw before any network */
async function fetchBoot() {
  if (SAMPLE) {
    /* ?sample=1&as=client&onboarding=1 is a new client held on Get started; &welcome=1 (without onboarding) one who just finished */
    if (QS.get('as') === 'client' && (QS.get('onboarding') === '1' || QS.get('welcome') === '1')) {
      const c = await fixture('get-started/_sample/me-client.json');
      if (QS.get('onboarding') !== '1') c.onboarding = { ...c.onboarding, gated: false, left: [] };
      if (QS.get('welcome') === '1') c.welcome_seen = false;
      return { me: { email: c.email, name: c.name, role: 'client', client: c }, brands: c.brands.map(x => ({ id: x.id, name: x.name, status: 'active' })) };
    }
    const [me, b] = await Promise.all([fixture('_sample/me.json'), fixture('_sample/brands.json')]);
    /* sample mode is the owner (the workshop shows); ?as=team previews the team's view */
    return { me: { ...me, role: QS.get('as') === 'team' ? 'team' : 'owner' }, brands: b.brands };
  }
  const [me, b] = await Promise.all([
    api('/api/me', { worker: 'ah' }),
    storedClient() ? null : api('/api/brands', { worker: 'ah' }).catch(() => null),
  ]);
  if (me.role === 'client') {
    return { me: { ...me, name: me.client && me.client.name }, brands: ((me.client && me.client.brands) || []).map(x => ({ id: x.id, name: x.name, status: 'active' })) };
  }
  const list = b ? b.brands : (await api('/api/brands', { worker: 'ah' })).brands;
  return { me, brands: (list || []).filter(x => !x.status || x.status === 'active').map(x => ({ id: x.id, name: x.name, status: x.status || 'active', color: x.color || null,
    /* where client updates go: To send names the channel and spots a brand with none */
    ...('client_channel' in x ? { client_channel: x.client_channel || null } : {}) })) };
}

/* Sign in happens on this app's own page (pages/_signin.js). Once the session is stored the app loads
   at the address the person first asked for: the same address, less any one time token and the sign in route. */
let signinUp = false;
async function showSignin(message, more) {
  signinUp = true;
  const si = await import('./pages/_signin.js');
  document.title = 'Sign in · ' + APP_NAME;
  si.default.render(app, null, { message, sample: SAMPLE, ...(more || {}), onDone: () => { history.replaceState(null, '', si.backAddress()); location.reload(); } });
  hideLoader();
}

/* A link in the address: ?signin=<token> is an emailed one time link and signs straight in;
   ?invite=<token> is a client invite and opens the sign in page with whose invite it is, even over an
   older session on this browser. True when this took over the screen. */
async function fromLink() {
  const once = QS.get('signin'), invite = QS.get('invite');
  /* sample: ?sample=1&invite=1 shows the new client sign up page. Nothing is sent. */
  if (SAMPLE && invite) { await showSignin('', { invite: { ok: true, name: 'Pat Doyle', email: 'p***@example.com', brands: ['Northlake Golf'], token: 'sample' } }); return true; }
  if (SAMPLE || (!once && !invite)) return false;
  const si = await import('./pages/_signin.js');
  if (once) {
    history.replaceState(null, '', si.backAddress());     // the token leaves the address bar before anything else
    try { await si.redeemLink(once); } catch (e) { await showSignin(e.message); return true; }
    location.reload();
    return true;
  }
  const inv = await si.readInvite(invite);
  if (inv.ok) { await showSignin('', { invite: inv }); return true; }
  /* Could not ask (no connection, a server error): the invite may be fine. Keep it in the address,
     say so with a way to try again, and do not open the app under an older login. */
  if (inv.retry) { showInviteRetry(inv.error); return true; }
  history.replaceState(null, '', si.backAddress());         // the worker said this invite is dead: drop it
  if (!token()) { await showSignin(inv.error); return true; }
  return false;                                           // a dead invite, but already signed in: carry on
}

/* The app's own key can hold an older session than the shared one (a sign in made on another tool).
   When the server refuses it, drop it once and let the shared one through. */
function dropStale() {
  const own = get(LS.tok), shared = get(LS.shared);
  if (!own || !shared || own === shared) return false;
  try { localStorage.removeItem(LS.tok); } catch { return false; }
  return true;
}

async function signOut() {
  await wipeSaved();                                   // one login never sees another's numbers
  try { [LS.tok, LS.shared, LS.sharedExp, LS.email, LS.role].forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem(LS5.asClient); } catch {}
  history.replaceState(null, '', location.pathname + location.search);
  showSignin();
}

function showInviteRetry(message) {
  signinUp = true;
  hideLoader();
  document.title = 'Sign in · ' + APP_NAME;
  app.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;padding:24px"><div class="lx-empty" style="width:100%;max-width:460px;min-width:0;overflow-wrap:anywhere"><h3>Could not open your invite</h3><p role="alert"></p><button class="lx-btn primary lg" type="button">Try again</button></div></div>';
  app.querySelector('p').textContent = (message || 'Check the connection and try again.') + ' Your invite link still works.';
  app.querySelector('button').onclick = () => location.reload();
}

function showDown(e) {
  hideLoader();
  app.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;padding:24px"><div class="lx-empty" style="width:100%;max-width:460px;min-width:0;overflow-wrap:anywhere"><h3></h3><p></p><button class="lx-btn primary lg" type="button">Try again</button><a class="lx-btn ghost" href="../">Open old ' + APP_NAME + '</a></div></div>';
  app.querySelector('h3').textContent = 'Could not reach ' + APP_NAME;
  app.querySelector('p').textContent = (e && e.message) || 'Check the connection and try again.';
  app.querySelector('button').onclick = () => location.reload();
}

async function boot() {
  if (await fromLink()) return;
  if (router.parse(location.hash).signin || (!token() && !SAMPLE)) return showSignin();
  setUser(get(LS.email) || 't:' + token().slice(-16));
  let rec;
  /* The welcome cards are decided on a FRESH /api/me: a saved boot copy can still say welcome_seen false after the
     cards were closed. A copy under a minute old is not refreshed (cached maxAge), so it counts as fresh. */
  let decided = false, started = false, freshSeen = false;
  const decide = () => { if (decided || !started) return; decided = true; welcomeCards().then(firstPreset); };
  const onFresh = fresh => { shell.update(fresh.data); freshSeen = true; decide(); };
  onFresh.touch = () => { freshSeen = true; decide(); };
  try {
    rec = await cached('boot', fetchBoot, onFresh, { maxAge: 60e3 });
  } catch (e) {
    if (e && e.status === 401) return dropStale() ? boot() : showSignin('Your sign in ran out. Sign in again to carry on.');
    return showDown(e);
  }
  savedFeatures();
  shell.setData(rec.data);
  shell.mount(app, { onSignOut: signOut });
  hideLoader();
  /* a link a connected AI hands back (?open=aiproposal&id=<card id>&act=<brand id>) opens the cards page; the page marks the card */
  if (QS.get('open') === 'aiproposal' && (!location.hash || location.hash === '#' || location.hash === '#/')) {
    const b = shell.state().brands.find(x => x.id === QS.get('act'));
    /* the card id is handed to the page once, then open, id and act leave the address so a later visit marks nothing */
    try { sessionStorage.setItem(LS5.aiCard, QS.get('id') || ''); } catch {}
    const q = new URLSearchParams(location.search); ['open', 'id', 'act'].forEach(k => q.delete(k));
    const rest = q.toString();
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + (b && b.slug ? '#/brand/' + encodeURIComponent(b.slug) : '#/agency/all') + '/profile/ai-cards');
  }
  router.start({ state: shell.state, frame: shell.frame, brandBySlug: shell.brandBySlug, signin: () => location.reload() });
  bellCount();
  freshFeatures();
  started = true;
  if (rec.fresh || SAMPLE || freshSeen || Date.now() - rec.asOf <= 60e3) decide();
  /* a link from a Slack or email reminder can open the bell: add ?bell=1 to any address */
  if (QS.get('bell')) setTimeout(() => { const b = document.querySelector('.lx-bell'); if (b) b.click(); }, 300);
}

/* The welcome cards: once per person, the first time a real client opens the app past the setup gate.
   Only when the server says welcome_seen is false (an older server that does not know it shows nothing).
   Sample: ?sample=1&as=client&welcome=1.
   Resolves once the cards are up (or not shown), so the first preset sheet that follows always sees them. */
function welcomeCards() {
  const st = shell.state(), c = st.me && st.me.client;
  const r = router.currentRoute();
  if (st.realRole !== 'client' || st.asClient || !c || c.welcome_seen !== false || heldHere(st, r)) return Promise.resolve();
  const brand = (r && shell.brandBySlug(r.brand)) || st.brands[0] || null;
  return import('./pages/get-started/_welcome.js').then(m => m.showWelcome({ brand, me: st.me })).catch(() => {});
}

/* How things reach me: asked once per person (teammate or client login) who never saved a preset (pages/profile/_first-preset.js). Called
   after welcomeCards() has put its cards up, and the sheet waits for them to close. Sample: ?sample=1&firstpreset=1. */
function firstPreset() {
  const st = shell.state();
  import('./pages/profile/_first-preset.js').then(m => m.askOnce({ st, held: heldHere(st, router.currentRoute()) })).catch(() => {});
}

/* The agency feature switches (Creator program, Social posting): a line whose switch is off leaves the menus.
   The last ones this browser saw draw the first menu; GET /api/notices (read once by bell.js, so the bell count
   costs no second call) answers the real ones, and the menu is drawn again only when they changed. Sample mode
   reads them from pages/_sample/notices.json. An older worker answers none and the menu stays as it is. */
const featureKey = () => LS5.features + (SAMPLE ? '|sample' : '');
function savedFeatures() {
  try { const f = JSON.parse(localStorage.getItem(featureKey()) || 'null'); if (f) setFeatures(f); } catch { /* no storage: everything stays on */ }
}
function freshFeatures() {
  import('./bell.js').then(async m => {
    const f = m.featuresFrom(await m.readNotices());
    if (!f) return;
    try { localStorage.setItem(featureKey(), JSON.stringify(f)); } catch { /* memory only */ }
    if (setFeatures(f)) shell.redrawMenu();
  }).catch(() => {});
}

/* The count on the bell: read once the first page is up, from the same rows the panel shows. */
function bellCount() {
  const st = shell.state();
  if (st.asClient) return;
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 400));
  idle(() => import('./bell.js')
    .then(m => m.loadBell({ me: st.me, role: st.role, brand: st.brands[0] || null, brands: st.brands }))
    .then(d => shell.setCounts({ bell: d.needs.length }))
    .catch(() => {}));
}

window.addEventListener('lx:unauthorized', () => { if (!signinUp) showSignin('Your sign in ran out. Sign in again to carry on.'); });
window.addEventListener('hashchange', () => { if (signinUp && !router.parse(location.hash).signin) location.reload(); });
/* another tab signed in or out: follow it */
window.addEventListener('storage', e => { if ((e.key === LS.tok || e.key === LS.shared) && !SAMPLE) location.reload(); });
onAnnounce(msg => { if (msg && msg.what === 'refresh') router.refresh(); });

boot();
