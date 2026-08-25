/**
 * How the settings dialogs tell the board its lists changed.
 *
 * Event types and channels are edited from the Settings menu, which sits in
 * the nav — outside the board's React state. Rather than lift the board's
 * state up into the layout, the dialogs fire one DOM event and the board
 * refetches both lists. It fires after every successful save, so a channel
 * added in Settings is on the New event form the moment the dialog closes.
 */

export const BOARD_CONFIG_CHANGED = "lc:board-config-changed";

export function announceBoardConfigChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BOARD_CONFIG_CHANGED));
  }
}
