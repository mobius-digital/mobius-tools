/**
 * What the product calls *itself* — as opposed to what any one client's board
 * is called.
 *
 * There is exactly one product name, and this is it. A client's board wears
 * their brand in the way that matters — their colours, their logo, their name
 * beside it — but the thing itself is called Lineup on their tab, their
 * sign-in card, their Slack posts and their home-screen icon, the same as on
 * the front door. Two names for one product only ever confused people.
 *
 * A board's own name comes from its row in `brands`; nothing here is per
 * client.
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
