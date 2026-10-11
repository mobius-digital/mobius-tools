// The browser everyone recognises: a tab strip that fills up one tab at a
// time with the real things people have open. The platform marks come from
// profit/logos/ (the same files Locus shows on its Connections page); the ones
// that folder does not have are drawn here in the same flat style.
import React from 'react';
import { Img } from 'remotion';
import { sans } from './tokens';

type SvgModule = { default: React.FC<React.SVGProps<SVGSVGElement>> };
const svgs = require.context('../../../profit/logos', false, /\.svg$/);
const pngs = require.context('../../../profit/logos', false, /\.png$/);
const svg = (name: string) => (svgs(`./${name}.svg`) as SvgModule).default;
const png = (name: string) => {
  const m = pngs(`./${name}.png`) as string | { default: string };
  return typeof m === 'string' ? m : m.default;
};

// A flat mark for a brand the folder lacks: a coloured rounded square with a glyph.
const Glyph: React.FC<{ bg: string; children: React.ReactNode; fg?: string }> = ({ bg, children, fg = '#fff' }) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%">
    <rect x="1" y="1" width="22" height="22" rx="5" fill={bg} />
    <text x="12" y="16.6" fontSize="12" fontWeight="800" textAnchor="middle" fill={fg} fontFamily="Inter, system-ui, sans-serif" letterSpacing="-0.5">{children}</text>
  </svg>
);
const drawn: Record<string, React.FC> = {
  bank: () => (
    <svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="1" y="1" width="22" height="22" rx="5" fill="#1B3A6B" /><path d="M6 10.5l6-4 6 4M7.5 10.5v6M16.5 10.5v6M10.5 10.5v6M13.5 10.5v6M6 17h12" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  paypal: () => (
    <svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="1" y="1" width="22" height="22" rx="5" fill="#fff" /><path d="M7.5 18.5l1.9-12h4.4c2.6 0 4 1.3 3.6 3.6-.4 2.6-2.3 3.9-5 3.9h-1.8l-.7 4.5z" fill="#003087" /><path d="M9.6 19.8l1.9-12h4.4c2.6 0 4 1.3 3.6 3.6-.4 2.6-2.3 3.9-5 3.9h-1.8l-.7 4.5z" fill="#009CDE" opacity=".9" /></svg>
  ),
  amex: () => <Glyph bg="#006FCF">AX</Glyph>,
  quickbooks: () => (
    <svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="12" r="11" fill="#2CA01C" /><path d="M9 7.5a4.5 4.5 0 1 0 0 9h1.3v-2.2H9a2.3 2.3 0 1 1 0-4.6h2v8.6h2.2V7.5zM15 7.5v2.2h.8a2.3 2.3 0 1 1 0 4.6h-2v-8.6h-2.2v10.8H15a4.5 4.5 0 1 0 0-9z" fill="#fff" /></svg>
  ),
  gusto: () => <Glyph bg="#F45D48">g</Glyph>,
  kickfurther: () => <Glyph bg="#2D6CDF">K</Glyph>,
  brex: () => <Glyph bg="#111111">B</Glyph>,
  amazon: () => <Glyph bg="#FF9900" fg="#111">a</Glyph>,
  looker: () => (
    <svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="1" y="1" width="22" height="22" rx="5" fill="#4285F4" /><rect x="5" y="12" width="3" height="7" rx="1" fill="#fff" /><rect x="10.5" y="8" width="3" height="11" rx="1" fill="#fff" /><rect x="16" y="5" width="3" height="14" rx="1" fill="#fff" /></svg>
  ),
  outlook: () => <Glyph bg="#0F6CBD">O</Glyph>,
};

export const Favicon: React.FC<{ name: string; size?: number }> = ({ name, size = 16 }) => {
  const box: React.CSSProperties = { width: size, height: size, flex: 'none', display: 'block' };
  if (drawn[name]) {
    const D = drawn[name];
    return <div style={box}><D /></div>;
  }
  if (name === 'triplewhale') return <Img src={png('triplewhale')} style={{ ...box, borderRadius: size * 0.22 }} />;
  const S = svg(name);
  // The folder's marks are flat glyphs in the brand colour; TikTok's and Klaviyo's are black, so every mark sits on a white chip, the way a favicon does.
  return (
    <div style={{ ...box, background: '#fff', borderRadius: size * 0.22, padding: size * 0.14, boxSizing: 'border-box' }}>
      <S width="100%" height="100%" style={{ display: 'block' }} />
    </div>
  );
};

export type TabSpec = { logo: string; title: string };

// The window: a dark browser with its tab strip, `shown` tabs visible, the
// newest one active. Tabs shrink as they pile up, the way a real strip does.
export const BrowserWindow: React.FC<{ tabs: TabSpec[]; shown: number; width: number; height: number; pop?: number[]; children?: React.ReactNode }> = ({
  tabs, shown, width, height, pop, children,
}) => {
  const n = Math.max(1, Math.min(tabs.length, shown));
  const stripW = width - 170;
  const tabW = Math.min(300, Math.floor(stripW / n));
  const fav = 28;
  const host: Record<string, string> = { 'google-sheets': 'docs.google.com', 'google-ads': 'ads.google.com', 'google-analytics': 'analytics.google.com', gmail: 'mail.google.com', meta: 'business.facebook.com', looker: 'lookerstudio.google.com', bank: 'pacificbusiness.com', triplewhale: 'app.triplewhale.com', amex: 'americanexpress.com' };
  const url = host[tabs[n - 1].logo] ?? `${tabs[n - 1].logo}.com`;
  return (
    <div style={{ width, height, borderRadius: 18, background: '#1E1F24', boxShadow: '0 40px 100px rgba(0,0,0,.55)', overflow: 'hidden', fontFamily: sans, position: 'relative', border: '1px solid #35363D' }}>
      <div style={{ height: 74, background: '#2B2C32', display: 'flex', alignItems: 'flex-end', padding: '0 14px 0 16px', gap: 0, position: 'relative' }}>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', height: 74, paddingRight: 18 }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <span key={c} style={{ width: 15, height: 15, borderRadius: '50%', background: c }} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', height: 74, width: stripW, overflow: 'visible' }}>
          {tabs.slice(0, n).map((t, i) => {
            const active = i === n - 1;
            const p = pop?.[i] ?? 1;
            return (
              <div key={i} style={{ width: tabW, height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderRadius: '12px 12px 0 0', background: active ? '#1E1F24' : 'transparent', color: active ? '#F2F2F4' : '#A7A8B2', fontSize: 21, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', boxSizing: 'border-box', borderRight: active ? 'none' : '1px solid #3A3B43', transform: `translateY(${(1 - p) * -40}px) scale(${0.8 + 0.2 * p})`, opacity: p, transformOrigin: '50% 100%' }}>
                <Favicon name={t.logo} size={fav} />
                {tabW > 90 && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{t.title}</span>}
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', right: 18, bottom: 12, width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', color: '#A7A8B2', fontSize: 28, lineHeight: 1 }}>+</div>
      </div>
      <div style={{ height: 60, background: '#1E1F24', borderBottom: '1px solid #35363D', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px' }}>
        <span style={{ color: '#6E6F7A', fontSize: 24 }}>‹ ›</span>
        <span style={{ flex: 1, height: 40, borderRadius: 20, background: '#2B2C32', display: 'flex', alignItems: 'center', padding: '0 16px', color: '#8E8F9A', fontSize: 19, gap: 10 }}>
          <Favicon name={tabs[n - 1].logo} size={18} />
          {url}
        </span>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 134, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
};
