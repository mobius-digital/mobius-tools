/* One log line per request, and one per error that was caught and not thrown again. */

let sink = text => console.log(text);

/** Tests swap the sink to read what was logged. Returns the old one. */
export function setSink(fn) {
  const old = sink;
  sink = fn || (text => console.log(text));
  return old;
}

export function line(fields) {
  try { sink(JSON.stringify({ t: new Date().toISOString(), ...fields })); } catch { sink('{"log":"unprintable"}'); }
}

/** A caught error that is not thrown again must come here with the reason it is safe to go on. */
export function swallowed(reason, err) {
  line({ level: 'warn', swallowed: reason, error: err && err.message ? String(err.message).slice(0, 300) : String(err || '') });
}
