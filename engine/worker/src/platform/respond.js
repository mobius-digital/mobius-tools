/* Answers. The headers are the ones the old workers send, so the screens need no change. */
// from account-health/worker/src/worker.js (CORS, json)

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

/* The screens and the tests read this to see who answered:
   new       the engine's own code
   forward   the old engine, because the row or the handler says so
   fallback  the old engine, because the engine's own handler broke on a read
   pipe      the old engine, untouched (mode old, a route switched back, a path with no row) */
export const ENGINE_HEADER = 'X-Engine';

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, 'Access-Control-Expose-Headers': ENGINE_HEADER, ...extra },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } });
}

/** An old worker's answer, passed on as it is, with one header saying it was passed on. */
export function passOn(res, how) {
  const h = new Headers(res.headers);
  h.set(ENGINE_HEADER, how);
  h.set('Access-Control-Expose-Headers', ENGINE_HEADER);
  for (const [k, v] of Object.entries(CORS)) if (!h.has(k)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
