/**
 * Cashew, one link (2026-10-14). The hub.
 *
 * One address, one place to sign in, a switcher at the top of the rail; every
 * set of books stays its own worker and its own database on its own
 * Cloudflare account, and the books never mix. The hub only decides WHICH
 * books the page is, from one cookie, and proxies the whole app and its
 * /api/* to that books' own origin. Switching books sets the cookie and
 * reloads; nothing on screen carries over, on purpose.
 *
 *   /switch?to=mobius|lucky|home   set the cookie, go to that books' home page
 *   everything else                proxied to the chosen books
 *
 * Sessions stay per books: each app keeps its own token (localStorage) or
 * cookie, exactly as it does on its own address, so a person sees only the
 * books whose sign-in list has them. Google sign-in needs this hub's origin
 * on each Google client's authorized JavaScript origins (Cole does that once).
 */

const BOOKS = {
  mobius: { app: 'https://tools.go-mobius-digital.com', api: 'https://mobius-ledger.mobius-digital.workers.dev', home: '/ledger/' },
  lucky: { app: 'https://lucky-ledger.lucky-golf-showroom.workers.dev', api: 'https://lucky-ledger.lucky-golf-showroom.workers.dev', home: '/' },
  home: { app: 'https://tally.scwetzler.workers.dev', api: 'https://tally.scwetzler.workers.dev', home: '/' },
};
const COOKIE = 'cashew_books';
const DEFAULT = 'mobius';

/* Headers that belong to the hop, not to the request or the answer. */
const DROP_REQ = new Set(['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-proto', 'x-real-ip', 'content-length']);
const DROP_RES = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'alt-svc']);

/* A same-site path only: no scheme, no protocol-relative //host, nothing that could leave a script. */
function safePath(p) {
  return p && /^\/(?!\/)[\w\-./?=&%]*$/.test(p) ? p : null;
}

/* Stores the session HQ passed in the fragment the same way HQ does, then opens the books. */
const SIGNIN_PAGE = `<!doctype html><meta charset="utf-8"><title>Signing in</title>
<script>
var f = new URLSearchParams(location.hash.slice(1)), then = __THEN__;
history.replaceState(null, '', location.pathname);
if (f.get('t')) {
  localStorage.setItem('mobius_session', f.get('t'));
  localStorage.setItem('mobius_session_email', f.get('e') || '');
  localStorage.setItem('mobius_session_exp', f.get('x') || '0');
  if (f.get('r') === 'client') localStorage.setItem('mobius_session_role', 'client'); else localStorage.removeItem('mobius_session_role');
}
location.replace(then);
</script>`;

function pickBooks(request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-z]+)'));
  return m && BOOKS[m[1]] ? m[1] : DEFAULT;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/switch') {
      const to = url.searchParams.get('to');
      if (!BOOKS[to]) return new Response('Unknown books. One of: ' + Object.keys(BOOKS).join(', '), { status: 400 });
      return new Response(null, { status: 302, headers: {
        Location: BOOKS[to].home,
        'Set-Cookie': `${COOKIE}=${to}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`,
        'Cache-Control': 'no-store',
      } });
    }
    if (url.pathname === '/__cashew') {
      return Response.json({ books: pickBooks(request), hub: url.origin, list: Object.keys(BOOKS) }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const id = pickBooks(request), b = BOOKS[id];

    /* Mobius sign-in: Google only allows the client's own origins, so HQ signs in on
       tools.go-mobius-digital.com and hands the session back to /__cashew/signin. */
    if (id === 'mobius' && url.pathname.startsWith('/hq/')) {
      const then = safePath(url.searchParams.get('next')) || b.home;
      const back = url.origin + '/__cashew/signin?then=' + encodeURIComponent(then);
      return Response.redirect(b.app + '/hq/?next=' + encodeURIComponent(back), 302);
    }
    if (url.pathname === '/__cashew/signin') {
      const then = safePath(url.searchParams.get('then')) || b.home;
      return new Response(SIGNIN_PAGE.replace('__THEN__', JSON.stringify(then)), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
      });
    }
    /* The Mobius app lives under /ledger/ on its site; the root of the hub is that page. */
    if (url.pathname === '/' && b.home !== '/') return Response.redirect(url.origin + b.home, 302);

    const origin = url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') ? b.api : b.app;
    const target = origin + url.pathname + url.search;
    const headers = new Headers();
    for (const [k, v] of request.headers) if (!DROP_REQ.has(k.toLowerCase())) headers.set(k, v);
    headers.set('X-Cashew-Hub', url.origin);
    const init = { method: request.method, headers, redirect: 'manual' };
    if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
    let r;
    try { r = await fetch(target, init); }
    catch (e) { return new Response('The ' + id + ' books did not answer: ' + (e.message || e), { status: 502 }); }

    const out = new Headers();
    for (const [k, v] of r.headers) if (!DROP_RES.has(k.toLowerCase())) out.append(k, v);
    /* A redirect from the books' own address comes back as the hub's. */
    const loc = r.headers.get('Location');
    if (loc) out.set('Location', loc.replace(b.app, url.origin).replace(b.api, url.origin));
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: out });
  },
};
