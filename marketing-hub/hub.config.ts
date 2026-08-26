/**
 * What the product calls *itself* — as opposed to what any one client's board
 * is called.
 *
 * Clients never see this. Their board wears their own brand: their colours,
 * their logo, and their own short name under the phone icon. This name is for
 * the people who work across several brands — the agency — and it is what
 * appears on the switcher app they install, the front door, and the browser
 * tab before a brand is chosen.
 *
 * CHANGING THE NAME IS THIS FILE AND NOTHING ELSE. Edit, `npm run deploy`,
 * and anyone with the app installed sees the new name after they re-add it to
 * their home screen (an installed icon keeps the name it was created with).
 */
export const hub = {
  /** Full name: browser tab, front door, install prompts. */
  name: "Lineup",

  /**
   * Under a phone or tablet home-screen icon. About 11 characters fit before
   * iOS trims, so keep this at or under that.
   */
  shortName: "Lineup",

  /** One line, under the name on the front door. */
  tagline: "What's going live, when — and which channels need to care.",
};

export type Hub = typeof hub;
