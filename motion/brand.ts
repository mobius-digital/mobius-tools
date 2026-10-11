// Everything in the two spots that may change, in one file.
//
// Edit here, then `npm run render`. Nothing in src/ holds a name, a colour,
// a mark choice or a number that appears on screen; it all reads from here.
// The spoken words are in vo.json (one line per picture event) and the words
// on screen sit in the two spot files beside the picture they belong to.

// ---- 1. The two apps: name, tagline, logo, character ----------------------------
// The money app is Cashew (Cole, 2026-10-11). Its logo is the wordmark
// (logo/cashew/wordmark.svg), its app icon the C, its helper the rendered
// character in logo/cashew/character/ (five PNG states: rest, thinking, found,
// asleep, clear). Locus keeps the vector bead as its logo and has a rendered
// character in the same style. Each spot sells one app and never names the other.
export type CharacterState = 'rest' | 'thinking' | 'found' | 'asleep' | 'clear';
export type Logo = { file: string; kind: 'wordmark' | 'mark' };
export type Character = { kind: 'image'; dir: string } | { kind: 'vector'; base: string };
export type App = { name: string; tagline: string; logo: Logo; character: Character };

export const cashew: App = {
  name: 'Cashew',
  tagline: 'Know what you kept.',
  logo: { file: 'cashew/wordmark.svg', kind: 'wordmark' },
  character: { kind: 'image', dir: 'cashew/character' },
};

export const locus: App = {
  name: 'Locus',
  tagline: 'Know what to change.',
  logo: { file: 'locus/direction-2.svg', kind: 'mark' }, // the bead
  character: { kind: 'image', dir: 'locus/character' },
};

// ---- 2. The colours, from logo/kit.css ------------------------------------------
export const colours = {
  locus: '#2F62D9', // --locus, the field
  locusInk: '#2552BF',
  cashew: '#1E7A52', // --kept, the field (the money app's green)
  cashewInk: '#1B6B48',
  cashewBright: '#5CC395', // the Ledger green, the app's accent on a surface
  onField: '#FFFFFF',
  onField2: 'rgba(255,255,255,.74)',
  onFieldLine: 'rgba(255,255,255,.26)',
  onFieldWell: 'rgba(255,255,255,.14)',
  paper: '#F6F5F0', // the light canvas the pain plays on
  ink: '#111114',
  muted: '#71717A',
  line: 'rgba(15,15,20,.10)',
  night: '#0B0C12', // the dark canvas: 11:47, and both endings
  blood: '#E0394F', // the red the spend bleeds in
  blob: '#7B5CD6', // fees, when a purple blob is needed
};

// ---- 3. Cashew: every number on screen ------------------------------------------
// The bites must add up to the balance minus the kept number; the Cashew spot
// checks this at load and refuses to render if they do not.
export const cashewNumbers = {
  bankName: 'Pacific Business Checking',
  inBank: 18400,
  kept: 3120,
  month: 'September',
  monthShort: 'Sep',
  bites: [
    { who: 'rent', label: 'Rent', amount: 4200 },
    { who: 'factory', label: 'The factory', amount: 6900 },
    { who: 'ads', label: 'Ads', amount: 2500 },
    { who: 'tax', label: 'Tax, not paid yet', amount: 1680 },
  ] as { who: 'rent' | 'factory' | 'ads' | 'fees' | 'tax'; label: string; amount: number }[],
  // The bank card's balance by day, the last 30 days, drawn as the bank app's line.
  bankLine: [15100, 15400, 14900, 16200, 16800, 16100, 17300, 17000, 17900, 18400],
  // The app's Home: cash tile, revenue tile, net tile, year to date.
  cash: 18400,
  cashAccounts: [
    { name: 'Checking', amount: 14230 },
    { name: 'Savings', amount: 6400 },
    { name: 'Card', amount: -2230 },
  ],
  lowestPoint: { amount: 6150, month: 'Dec' },
  revenue: 24600,
  revenuePrev: 22100,
  net: 3120,
  netPrev: 2740,
  ytdNet: 29800,
  ytdRevenue: 212400,
  netByMonth: [
    ['Oct', 2100], ['Nov', 3400], ['Dec', -1200], ['Jan', 1800], ['Feb', 2600], ['Mar', 900],
    ['Apr', 3100], ['May', 2400], ['Jun', -600], ['Jul', 2900], ['Aug', 2740], ['Sep', 3120],
  ] as [string, number][],
  forecast: [18400, 16900, 14200, 9800, 6150, 8300, 11200], // today, then the end of each of six months
  forecastMonths: ['Now', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
  whereItWent: [
    ['Payroll', 9200], ['Rent', 4200], ['Ads', 2500], ['Software', 1180], ['Stripe fees', 740], ['Travel', 520],
  ] as [string, number][],
  // The finding card: one sentence, one button.
  findings: [
    { level: 'high', title: 'Hoskins Supply did not bill you this month', small: 'They bill $1,840 on the 3rd. Nothing landed. The money looks like profit until the bill arrives.', button: 'Book it' },
    { level: 'med', title: 'Northline charged you twice', small: '$620 on the 9th and again on the 11th, same invoice number.', button: 'Flag it' },
  ],
  mondayLine: { time: '7:02', day: 'Monday', text: 'Here is your week. $4,180 due in from two clients, $2,900 going out, the Hoskins bill lands Thursday. You keep about $1,280.' },
  closeItems: ['Every transaction categorized', 'Receipts in for September', 'Stripe fees reconciled', 'Tax set aside: $2,140', 'September closed'],
  pack: { business: 'Mobius Digital', period: 'September 2026', pages: ['Profit and loss', 'Balance sheet', 'Receipts, 41 attached', 'Statement by category'] },
  cpaName: 'Dana at Fulcrum CPA',
};

// ---- 4. Locus: every number on screen -------------------------------------------
export const locusNumbers = {
  metaRoas: '4.1',
  shopifyRoas: '2.3',
  metaSpend: 9380,
  metaRevenue: 38458,
  shopifySales: 21574,
  // Spend by day, the last seven days; the last three bleed.
  spendByDay: [
    ['Mon', 1240, 3.4], ['Tue', 1310, 3.2], ['Wed', 1280, 3.1], ['Thu', 1420, 2.6], ['Fri', 1560, 1.9], ['Sat', 1610, 1.4], ['Sun', 1690, 1.1],
  ] as [string, number, number][],
  bleedFrom: 4, // index of the first bar that bleeds
  clock: '11:47',
  tabs: ['Ads Manager', 'Shopify', 'Klaviyo', 'Google Ads', 'Triple Whale', 'Sheets', 'TikTok Ads', 'Slack', 'Asana', 'Stripe', 'Looker', 'Gmail', 'Notion', 'Ads Manager'],
  readBy: '7',
  brand: 'Marlow Golf',
  yesterday: 'Friday, Oct 10',
  // The hero: contribution, the P&L line, and its bites. sales minus the bites = kept.
  sales: 12400,
  bites: [
    { k: 'ads', label: 'Ads', v: 3850 },
    { k: 'cogs', label: 'Product cost', v: 3100 },
    { k: 'ship', label: 'Shipping', v: 740 },
    { k: 'fees', label: 'Fees', v: 400 },
  ],
  kept: 4310,
  normal: 3900,
  // Home tiles, the window and the compare.
  tiles: [
    { label: 'Revenue', value: '$12,400', delta: '+9%', up: true, series: [9.1, 10.4, 9.8, 11.2, 10.9, 11.8, 12.4] },
    { label: 'Ad spend', value: '$3,850', delta: '+4%', up: null, series: [3.2, 3.4, 3.3, 3.6, 3.7, 3.7, 3.85] },
    { label: 'MER', value: '3.22x', delta: '+0.14', up: true, series: [2.8, 3.0, 2.9, 3.1, 2.9, 3.2, 3.22] },
    { label: 'Contribution', value: '$4,310', delta: '+11%', up: true, series: [3.1, 3.6, 3.3, 3.9, 3.7, 4.0, 4.31] },
  ],
  // The day check: 14 days, 1 good, 0 flat, -1 bad.
  dayCheck: [1, 1, 0, 1, 1, 1, -1, 1, 1, 0, 1, 1, 1, 1],
  // The morning line, one sentence per brand.
  morning: [
    'Marlow Golf: a normal day. You kept $4,310 on $12,400 of sales. Nothing to change.',
    'Oak and Ash: ads crossed the line. One ad set to pause, about $164 a day.',
    'Tidewater: your best day in three weeks, $2,640 kept. The new hook is working.',
  ],
  // Today's calls, ranked by the money at stake. The second one gets the tap.
  calls: [
    { kind: 'scale', verb: 'Scale', name: 'Retarget | 30 day', why: '14 sales at $31 against the $45 goal. Raise its budget 20% and watch three days.', stake: 2400, button: 'Scale' },
    { kind: 'cut', verb: 'Cut', name: 'Broad | Fall drop', why: 'Losing money: $1,150 for 2 sales in 7 days. Pausing it saves about $164 a day.', stake: 1150, button: 'Pause' },
    { kind: 'refresh', verb: 'Refresh', name: 'Prospecting | Dad set', why: 'The main ad is tiring, clicks down 31% on the week. Brief a new version; do not switch it off.', stake: 620, button: 'Brief it' },
  ],
  tappedCall: 1,
  // What to make next.
  angle: { name: 'The first set that fits', won: 4, of: 6, bestCpa: '$28', last: '3 days ago', verdict: 'Proven' },
  iterations: ['New hook: the kid picks the club', 'Same hook, UGC cut', 'Offer line in the first frame'],
  // Agency edition: every brand, one morning.
  lanes: [
    { name: 'Marlow Golf', kept: 4310, sales: 12400, ads: 31 },
    { name: 'Tidewater', kept: 2640, sales: 8900, ads: 27 },
    { name: 'Oak and Ash', kept: 1870, sales: 5200, ads: 38 },
    { name: 'Pinecone Kids', kept: 1420, sales: 3800, ads: 29 },
    { name: 'Birch Supply', kept: 980, sales: 4100, ads: 41 },
  ],
};

// ---- 5. Timing ---------------------------------------------------------------
export const fps = 30;
export const formats = {
  vertical: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
};
