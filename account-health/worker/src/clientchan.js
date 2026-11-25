/* clientchan.js (2026-11-25): what Locus may do where a client reads along, and the three switches that go with it.
 *
 * A channel is CLIENT-SIDE when the Slack index marks it side 'client' (a brand's client channel) or Slack says it is
 * shared with another workspace (Slack Connect). A brand's internal channel, the agency channel and DMs never are.
 *
 * One rule has no switch: in a client-side channel nothing is applied straight from the words. Every change becomes a
 * card someone taps (worker.js passes no direct-apply caller there).
 *
 * The switches live in settings. Each one is ON until its value is '0', so a workspace that never touched them behaves
 * as it always did:
 *   checkinAutoApprove   '0' = a review card nobody answered is never approved by the 24 hour timer (checkin.js).
 *   askInClientChannels  '0' = Locus does not answer in a client-side channel, and says nothing there.
 *   slackIndexClient     '0' = messages from client channels are no longer stored (slackindex.js); what is already
 *                              stored stays.
 * GET /api/settings returns each as true/false; PUT /api/settings takes true/false. */

export const AUTO_APPROVE_KEY = 'checkinAutoApprove';
export const ASK_CLIENT_KEY = 'askInClientChannels';
export const INDEX_CLIENT_KEY = 'slackIndexClient';
export const SWITCHES = [AUTO_APPROVE_KEY, ASK_CLIENT_KEY, INDEX_CLIENT_KEY];

/** Does someone outside the team read this channel? */
export const clientSide = ({ side = null, shared = false } = {}) => side === 'client' || (!!shared && side !== 'internal');

/** May a change be applied straight from the words here? Never in a client-side channel; elsewhere as before. */
export const directApplyThere = ch => !clientSide(ch);

/** Does Locus stay silent here? Only in a client-side channel, and only when the switch is '0'. */
export const silentThere = (ch, setting) => setting === '0' && clientSide(ch);

/** The switches as the settings screen reads them: true until turned off. */
export async function readSwitches(env, getSetting) {
  const out = {};
  for (const k of SWITCHES) out[k] = (await Promise.resolve(getSetting(env, k)).catch(() => null)) !== '0';
  return out;
}
/** Saves the switches that are in the body (true/false, or '1'/'0'); anything else in the body is not touched. */
export async function writeSwitches(env, putSetting, body) {
  const saved = {};
  for (const k of SWITCHES) {
    if (!body || !(k in body)) continue;
    const off = body[k] === false || body[k] === '0' || body[k] === 0 || body[k] === 'off';
    await putSetting(env, k, off ? '0' : '1');
    saved[k] = !off;
  }
  return saved;
}
