/**
 * How the chrome talks to the board.
 *
 * Settings and the top bar sit in the layout, outside the board's React
 * state. Rather than lift that state up, they fire one DOM event each and the
 * board answers: the settings dialogs after every successful save, so a
 * channel added in Settings is on the New event form the moment the dialog
 * closes; the New event button and the floating add button on a phone, so
 * one editor serves every view.
 */

export const BOARD_CONFIG_CHANGED = "lc:board-config-changed";
export const NEW_EVENT_REQUESTED = "lc:new-event";

export function announceBoardConfigChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BOARD_CONFIG_CHANGED));
  }
}

export function requestNewEvent(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NEW_EVENT_REQUESTED));
  }
}
