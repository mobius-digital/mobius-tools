// The apps' own colour tokens, copied from profit/v2.css (Locus, light and
// dark) and ledger/ledger.css (Cashew). The replica screens read these so a
// card in the spot is the card in the app.
export type Theme = {
  bg: string; surface: string; surface2: string; ink: string; ink2: string; muted: string; faint: string;
  line: string; lineStrong: string; brand: string; brandInk: string; brandSoft: string; brandTint: string; brandLine: string;
  good: string; goodBg: string; warn: string; warnBg: string; bad: string; badBg: string; unkBg: string;
  grid: string; cmp: string; railBg: string; railInk: string; railMuted: string; railOn: string; hd: string;
  onBrand: string;
};

export const locusLight: Theme = {
  bg: '#F6F6F7', surface: '#FFFFFF', surface2: '#F3F3F5', ink: '#151518', ink2: '#45454F', muted: '#6B6B78', faint: '#9A9AA6',
  line: '#E6E6EB', lineStrong: '#D5D5DC', brand: '#2F62D9', brandInk: '#2552BF', brandSoft: '#EAF0FD', brandTint: '#EEF3FD', brandLine: '#B9CBF5',
  good: '#1C7A46', goodBg: '#E4F2E9', warn: '#8F6412', warnBg: '#F8EED6', bad: '#9C3A2E', badBg: '#F7E7E4', unkBg: '#ECECEF',
  grid: '#ECECF0', cmp: '#A3A3AE', railBg: '#EDEDF0', railInk: '#2C2C33', railMuted: '#8A8A96', railOn: '#DCE6FB', hd: '#EDEDF0',
  onBrand: '#FFFFFF',
};

export const locusDark: Theme = {
  bg: '#131316', surface: '#1A1A1E', surface2: '#212126', ink: '#F2F2F4', ink2: '#B4B4BE', muted: '#8E8E9A', faint: '#5E5E6A',
  line: '#2A2A31', lineStrong: '#3A3A43', brand: '#8FB3FF', brandInk: '#A9C4FF', brandSoft: 'rgba(143,179,255,.14)', brandTint: '#1C2333', brandLine: '#3D5584',
  good: '#5FD292', goodBg: 'rgba(95,210,146,.14)', warn: '#EBBF63', warnBg: 'rgba(235,191,99,.14)', bad: '#F09182', badBg: 'rgba(240,145,130,.14)', unkBg: '#26262C',
  grid: '#26262D', cmp: '#6A6A76', railBg: '#0F0F12', railInk: '#C9C9D2', railMuted: '#6E6E7A', railOn: 'rgba(143,179,255,.14)', hd: '#0F0F12',
  onBrand: '#0E1420',
};

// The validated channel palette (v2.css, light set).
export const channel = { meta: '#3B6FD9', google: '#B87A14', tiktok: '#1E9C8C', email: '#7C5CE6', amazon: '#D95A33', else: '#2A86B3' };
// The bites bar colours in the Locus hero (v2.css .b-kept .b-ads .b-cogs .b-ship .b-fees).
export const biteColour = { kept: '#2F62D9', ads: '#B87A14', cogs: '#D95A33', ship: '#1E9C8C', fees: '#7C5CE6' };

export const cashewLight: Theme = {
  bg: '#F6F7F6', surface: '#FFFFFF', surface2: '#F1F3F2', ink: '#121614', ink2: '#3F4744', muted: '#6F7A75', faint: '#A2ABA7',
  line: '#E5E9E7', lineStrong: '#D2D9D5', brand: '#5CC395', brandInk: '#1F6B50', brandSoft: '#E6F4EC', brandTint: '#EAF6EF', brandLine: '#9ED9BC',
  good: '#1C7A46', goodBg: '#E4F2E9', warn: '#8F6412', warnBg: '#F8EED6', bad: '#9C3A2E', badBg: '#F7E7E4', unkBg: '#ECEFED',
  grid: '#ECEFED', cmp: '#A3ABA7', railBg: '#FFFFFF', railInk: '#2E3633', railMuted: '#8A938F', railOn: '#E6F4EC', hd: '#121614',
  onBrand: '#06281A',
};
export const cashewExtra = { gold: '#C9971F', heroLink: '#8FDDB6', heroBad: '#F09182', heroWarn: '#EBBF63', field: '#1E7A52', fieldDeep: '#176443' };

export const sans = `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`;
export const serif = `'Instrument Serif', Georgia, 'Times New Roman', serif`;
export const tnum: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum" 1, "lnum" 1, "cv11" 1' };
