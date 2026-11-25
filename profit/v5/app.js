/* Entry. Reads the stored session, paints the shell from the last saved copy, then starts routing.
   No session: the sign in page. Sample mode (?sample=1): fixtures only, no API call. */

import { token, SAMPLE, LS, LS5, APP_NAME, QS } from './config.js';
import { api, cached, fixture, setUser, wipeSaved, storedClient, onAnnounce } from './data.js';
import * as shell from './shell.js';
import * as router from './router.js';

const app = document.getElementById('app');
const hideLoader = () => { const l = document.getElementById('lx-load'); if (l) l.remove(); };
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
document.title = APP_NAME;

/* me + the brand list, in one saved copy, so the menu and the brand switcher draw before any network */
async function fetchBoot() {
  if (SAMPLE) {
    const [me, b] = await Promise.all([fixture('_sample/me.json'), fixture('_sample/brands.json')]);
    return { me, brands: b.brands };
  }
  const [me, b] = await Promise.all([
    api('/api/me', { worker: 'ah' }),
    storedClient() ? null : api('/api/brands', { worker: 'ah' }).catch(() => null),
  ]);
  if (me.role === 'client') {
    return { me: { ...me, name: me.client && me.client.name }, brands: ((me.client && me.client.brands) || []).map(x => ({ id: x.id, name: x.name, status: 'active' })) };
  }
  const list = b ? b.brands : (await api('/api/brands', { worker: 'ah' })).brands;
  return { me, brands: (list || []).filter(x => !x.status || x.status === 'active').map(x => ({ id: x.id, name: x.name, status: x.status || 'active', color: x.color || null })) };
}

let signinUp = false;
async function showSignin(message) {
  signinUp = true;
  const page = (await import('./pages/_signin.js')).default;
  document.title = 'Sign in · ' + APP_NAME;
  page.render(app, null, { message, sample: SAMPLE });
  hideLoader();
}

async function signOut() {
  await wipeSaved();                                   // one login never sees another's numbers
  try { [LS.tok, LS.shared, LS.sharedExp, LS.email, LS.role].forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem(LS5.asClient); } catch {}
  history.replaceState(null, '', location.pathname + location.search);
  showSignin();
}

function showDown(e) {
  hideLoader();
  app.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;padding:24px"><div class="lx-empty" style="width:100%;max-width:460px;min-width:0;overflow-wrap:anywhere"><h3></h3><p></p><button class="lx-btn primary lg" type="button">Try again</button><a class="lx-btn ghost" href="../">Open old ' + APP_NAME + '</a></div></div>';
  app.querySelector('h3').textContent = 'Could not reach ' + APP_NAME;
  app.querySelector('p').textContent = (e && e.message) || 'Check the connection and try again.';
  app.querySelector('button').onclick = () => location.reload();
}

async function boot() {
  if (router.parse(location.hash).signin || (!token() && !SAMPLE)) return showSignin();
  setUser(get(LS.email) || 't:' + token().slice(-16));
  let rec;
  try {
    rec = await cached('boot', fetchBoot, fresh => shell.update(fresh.data), { maxAge: 60e3 });
  } catch (e) {
    if (e && e.status === 401) return showSignin('Your sign in ran out. Sign in again to carry on.');
    return showDown(e);
  }
  shell.setData(rec.data);
  shell.mount(app, { onSignOut: signOut });
  hideLoader();
  router.start({ state: shell.state, frame: shell.frame, brandBySlug: shell.brandBySlug, signin: () => location.reload() });
  bellCount();
  /* a link from a Slack or email reminder can open the bell: add ?bell=1 to any address */
  if (QS.get('bell')) setTimeout(() => { const b = document.querySelector('.lx-bell'); if (b) b.click(); }, 300);
}

/* The count on the bell: read once the first page is up, from the same rows the panel shows. */
function bellCount() {
  const st = shell.state();
  if (st.asClient) return;
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 400));
  idle(() => import('./bell.js')
    .then(m => m.loadBell({ me: st.me, role: st.role, brand: st.brands[0] || null }))
    .then(d => shell.setCounts({ bell: d.needs.length }))
    .catch(() => {}));
}

window.addEventListener('lx:unauthorized', () => { if (!signinUp) showSignin('Your sign in ran out. Sign in again to carry on.'); });
window.addEventListener('hashchange', () => { if (signinUp && !router.parse(location.hash).signin) location.reload(); });
/* another tab signed in or out: follow it */
window.addEventListener('storage', e => { if ((e.key === LS.tok || e.key === LS.shared) && !SAMPLE) location.reload(); });
onAnnounce(msg => { if (msg && msg.what === 'refresh') router.refresh(); });

boot();
