// Everything in the two spots that may change, in one file.
//
// Edit here, then `npm run render`. Nothing in src/ holds a name, a colour,
// a mark choice or a number that appears on screen; it all reads from here.
// Words that are not names or numbers stay in the scenes (src/kept, src/locus)
// because they are the script, written in docs/two-products.md section 6.

// ---- 1. The two apps: name, tagline, logo, character ----------------------------
// Cole's call (2026-10-11): the money app is Cashew. Its logo is the wordmark
// (logo/cashew/wordmark.svg), its app icon the C, and its helper is the rendered
// character in logo/cashew/character/ (five PNG states: rest, thinking, found,
// asleep, clear). Locus keeps the vector bead as its logo and gets a rendered
// character in the same style. Kept stays below as the one-line swap.
//
// A logo is an SVG in logo/ loaded as a React component, drawn in currentColor
// so it takes white on the field. `kind` says whether it is a wordmark (the name
// is in the drawing) or a mark (the name is set in type beside it).
// A character is either a folder of PNG states or a vector mark with its four
// drawn states (direction-N.svg plus -asleep, -thinking, -found, -clear).
export type CharacterState = 'rest' | 'thinking' | 'found' | 'asleep' | 'clear';
export type Logo = { file: string; kind: 'wordmark' | 'mark' };
export type Character = { kind: 'image'; dir: string } | { kind: 'vector'; base: string };
export type App = { name: string; tagline: string; logo: Logo; character: Character };

export const apps = {
  cashew: {
    name: 'Cashew',
    tagline: 'Know what you kept.',
    logo: { file: 'cashew/wordmark.svg', kind: 'wordmark' },
    character: { kind: 'image', dir: 'cashew/character' },
  },
  kept: {
    name: 'Kept',
    tagline: 'Know what you kept.',
    logo: { file: 'kept/direction-1.svg', kind: 'mark' }, // 1 the coin, 2 the stack, 3 the jar
    character: { kind: 'vector', base: 'kept/direction-1' },
  },
} satisfies Record<string, App>;

// The one edit that renames the money app: apps.cashew or apps.kept.
export const money: App = apps.cashew;

export const locus: App = {
  name: 'Locus',
  tagline: 'Know what to change.',
  logo: { file: 'locus/direction-2.svg', kind: 'mark' }, // 1 the trail, 2 the bead, 3 the heading
  character: { kind: 'image', dir: 'locus/character' },
};

// The last line of both spots. {money} is replaced with money.name.
export const closingLine = 'Locus knows where you are. {money} knows what you have.';

// ---- 2. The colours, from logo/kit.css --------------------------------------
export const colours = {
  locus: '#2F62D9', // --locus, the field
  locusInk: '#2552BF', // --locus-ink, Locus blue as text on a light surface
  kept: '#1E7A52', // --kept, the field (the money app's green, whatever its name)
  keptInk: '#1B6B48', // --kept-ink
  onField: '#FFFFFF', // --on-field
  onField2: 'rgba(255,255,255,.74)', // --on-field-2, the second line
  onFieldLine: 'rgba(255,255,255,.26)', // --on-field-line
  onFieldWell: 'rgba(255,255,255,.14)', // --on-field-well
  paper: '#F6F5F0', // the light surface the pain plays on
  ink: '#111114', // ink on paper
  muted: '#71717A', // the quiet label on paper
  line: 'rgba(15,15,20,.10)', // a hairline on paper
  // The bites. Fees are "a small purple blob" in the brief; the rest are ink.
  blob: '#7B5CD6',
};

// ---- 4. The numbers on screen -----------------------------------------------
// Kept. The hero number and the four bites. The bites must add up to
// inBank minus kept; a check in src/kept/numbers.ts fails the render if not.
export const keptNumbers = {
  inBank: 18400,
  kept: 3120,
  // `who` picks the character (src/bites/Bite.tsx: rent, factory, ads, fees,
  // tax); `line` is the caption at the bite, from the plan's beat 2.
  bites: [
    { who: 'rent', line: 'Rent takes a bite.', amount: 4200 },
    { who: 'factory', line: 'The factory takes a bite.', amount: 6900 },
    { who: 'ads', line: 'Ads burn.', amount: 2500 },
    { who: 'tax', line: 'The tax you owe but have not paid.', amount: 1680 },
  ] as { who: 'rent' | 'factory' | 'ads' | 'fees' | 'tax'; line: string; amount: number }[],
  monthFoundOut: 'April', // the calendar flips to this month
  mondayTime: '7:02', // "Monday, 7:02. Here is your week."
};

// Locus. The two numbers that argue, the tab count, the hour, the calls.
export const locusNumbers = {
  metaRoas: '4.1',
  shopifyRoas: '2.3',
  tabs: 14,
  readBy: '7', // "Read by 7."
  // Today's calls, ranked by money at stake. The amounts are the stake.
  calls: [
    { label: 'Scale this.', stake: 2400 },
    { label: 'Cut that.', stake: 1150 },
    { label: 'Refresh this.', stake: 620 },
  ],
  tappedCall: 1, // index into calls: the one that gets the tap ("Paused.")
  brands: 5, // lanes in the agency edition beat
};

// ---- 5. Timing ---------------------------------------------------------------
export const fps = 30;
export const formats = {
  vertical: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
};
