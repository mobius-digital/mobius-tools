/* clientchan.js (2026-11-25): what Locus may do where a client reads along, and the three switches that go with it.
 *
 * A channel is CLIENT-SIDE when the Slack index marks it side 'client' (a brand's client channel) or Slack says it is
 * shared with another workspace (Slack Connect). A brand's internal channel, the agency channel and DMs never are.
 *
 * One rule has no switch: where someone outside the team reads along, nothing is applied straight from the words. Every
 * change becomes a card someone taps (worker.js passes no direct-apply caller there), and Locus says why in one line
 * (TAP_ONLY_NOTE). For THIS rule a Slack Connect share wins over everything, a brand's internal channel included: an
 * internal channel another workspace was added to is tap-only too. The two channel switches below still treat an
 * internal channel as the team's own, so Locus is never silenced in it and its messages are still stored.
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

/** Is every change a tapped card here? A client channel, or any channel Slack shares with another workspace, whatever
 *  the index calls it. Wider than clientSide on purpose: a shared internal channel keeps answering, but taps. */
export const tapOnlyThere = ({ side = null, shared = false } = {}) => side === 'client' || !!shared;

/** May a change be applied straight from the words here? Never, anywhere (2026-11-25, always a tap: ask/engine.js
 *  has no apply-from-a-message path and allwrite.js TAP_TOOLS is the one place for the rule). Kept only so an old
 *  import does not break; it cannot be switched back on from here. */
export const directApplyThere = () => false;

/** Added to what the assistant is told in a tap-only channel, so the person who asked hears why nothing was applied. */
export const TAP_ONLY_NOTE = ' TAP ONLY: people outside the team can read this channel, so nothing is changed straight from a message here, even when the person tells you to do it. Every change is a card with an Apply button that someone on the team taps. When someone tells you to make a change, put up the card and say in one short line that it needs a tap because people outside the team read this channel. Never say the change is done before the tap.';

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
