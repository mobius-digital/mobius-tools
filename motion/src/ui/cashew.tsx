// Cashew, rebuilt as React: the ledger's hero tile, the tiles, the kept hero
// with the bites bar, the cash forecast, the finding card with one button,
// the close checklist and the CPA pack header. Sizes and colours are the
// app's own (ledger/ledger.css, lg-core.js tile and card), in app px.
import React from 'react';
import { interpolate } from 'remotion';
import { cashew as cashewApp, cashewNumbers } from '../../brand';
import { BarChart, LineChart, Spark } from './charts';
import { cashewExtra, cashewLight, sans, tnum, type Theme } from './tokens';
import { Accent, CardHead, Pill, Zoom, card } from './locus';
import { Character, Logo } from '../marks/Mark';
import { Circled, Tap } from '../shared/pieces';

const T0 = cashewLight;
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
export { money as cwMoney, Zoom };

// The ledger .btn: 32px, radius 8; primary on the Ledger green with the dark ink.
export const Btn: React.FC<{ T?: Theme; kind?: 'primary' | 'ghost' | 'plain'; small?: boolean; pressed?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ T = T0, kind = 'plain', small, pressed = 0, children, style }) => {
  const look: React.CSSProperties =
    kind === 'primary' ? { background: T.brand, border: `1px solid ${T.brand}`, color: T.onBrand, filter: `brightness(${1 - pressed * 0.1})` }
      : kind === 'ghost' ? { background: 'transparent', border: '1px solid transparent', color: T.ink2 }
        : { background: T.surface, border: `1px solid ${T.lineStrong}`, color: T.ink };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: small ? 28 : 32, padding: small ? '0 10px' : '0 12px', borderRadius: 8, fontSize: small ? 12.5 : 13, fontWeight: 550, whiteSpace: 'nowrap', fontFamily: sans, transform: `scale(${1 - pressed * 0.06})`, ...look, ...style }}>{children}</span>
  );
};

// The hero tile (.tile.hero): dark, the cash, the accounts, the forecast line, the lowest point.
export const CwHeroTile: React.FC<{ T?: Theme; t?: number; count?: number; width?: number }> = ({ T = T0, t = 1, count = 1, width = 520 }) => {
  const n = cashewNumbers;
  return (
    <div style={{ ...card(T), background: T.hd, color: '#fff', borderColor: 'transparent', padding: '18px 20px 16px', width, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 116 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,.65)' }}>
        <span>Cash in the bank</span>
        <em style={{ fontStyle: 'normal', fontSize: 11, color: 'rgba(255,255,255,.45)' }}>as of 7:02</em>
      </div>
      <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{money(n.cash * count)}</div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.7)', lineHeight: 1.45 }}>
        {n.cashAccounts.map((a, i) => (
          <span key={a.name}>{i ? ' · ' : ''}{a.name} <b style={{ color: '#fff', fontWeight: 600 }}>{money(a.amount)}</b></span>
        ))}
      </div>
      <Spark values={n.forecast} color={T.brand} t={t} h={64} zeroFloor={false} style={{ marginTop: 4 }} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12.5, color: 'rgba(255,255,255,.7)', marginTop: 4 }}>
        <span>Lowest point, next 6 months</span>
        <b style={{ color: cashewExtra.heroWarn, fontSize: 15, fontWeight: 650 }}>{money(n.lowestPoint.amount)}</b>
        <span>end of {n.lowestPoint.month}</span>
        <a style={{ marginLeft: 'auto', color: cashewExtra.heroLink, fontWeight: 600 }}>Forecast ›</a>
      </div>
    </div>
  );
};

// A plain tile (.tile): label, value, delta, a sparkline.
export const CwTile: React.FC<{ T?: Theme; label: string; value: string; tone?: 'good' | 'bad'; delta?: { amount: string; pct: string; up: boolean; vs: string }; sub?: React.ReactNode; series?: number[]; t?: number; width?: number }> = ({
  T = T0, label, value, tone, delta, sub, series, t = 1, width = 250,
}) => (
  <div style={{ ...card(T), padding: '14px 16px 13px', width, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 116 }}>
    <div style={{ fontSize: 12.5, fontWeight: 500, color: T.muted }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 650, letterSpacing: '-0.025em', lineHeight: 1.1, color: tone === 'good' ? T.good : tone === 'bad' ? T.bad : T.ink }}>{value}</div>
    {delta && (
      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.45 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: delta.up ? T.goodBg : T.badBg, color: delta.up ? T.good : T.bad }}>{delta.up ? '▲' : '▼'} {delta.amount} ({delta.pct})</span> {delta.vs}
      </div>
    )}
    {sub && <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.45 }}>{sub}</div>}
    {series && <div style={{ marginTop: 'auto' }}><Spark values={series} color={T.brand} t={t} h={36} /></div>}
  </div>
);

// The kept hero: "What you actually kept in September", the number, the bites bar.
const biteColours: Record<string, string> = { kept: '#5CC395', rent: '#C9971F', factory: '#D95A33', ads: '#B87A14', tax: '#9C3A2E' };
export const CwKeptHero: React.FC<{ T?: Theme; t?: number; count?: number; width?: number; circle?: number }> = ({ T = T0, t = 1, count = 1, width = 520, circle = 0 }) => {
  const n = cashewNumbers;
  const parts = [{ k: 'kept', label: 'Kept', v: n.kept }, ...n.bites.map((b) => ({ k: b.who, label: b.label, v: b.amount }))];
  const total = parts.reduce((s, p) => s + p.v, 0);
  const text = money(n.kept * count);
  return (
    <div style={{ ...card(T), padding: '22px 24px 20px', width }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.muted, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', fontSize: 11 }}>{n.month}, from the bank</span>
        <span>Net, after every bill and the tax set aside</span>
      </div>
      <h2 style={{ margin: '0 0 2px', fontSize: 30, fontWeight: 650, letterSpacing: '-0.028em', lineHeight: 1.15, color: T.ink }}>
        What you <Accent color={T.brandInk}>actually</Accent> kept
      </h2>
      <div style={{ margin: '0 0 14px', lineHeight: 1 }}>
        <span style={{ position: 'relative', display: 'inline-block', fontSize: 60, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.1, color: T.ink, padding: '4px 6px' }}>
          {text}
          {circle > 0 && <Circled t={circle} width={text.length * 36} height={66} color={cashewExtra.field} stroke={5} />}
        </span>
      </div>
      <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', background: T.surface2, gap: 2 }}>
        {parts.map((p, i) => {
          const grow = interpolate(t, [i / (parts.length + 1), (i + 2) / (parts.length + 1)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return <i key={p.k} style={{ display: 'block', flex: `${(p.v / total) * grow} 0 0`, background: biteColours[p.k] }} />;
        })}
      </div>
      <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', margin: '8px 0 0', fontSize: 12.5, color: T.ink2 }}>
        {parts.map((p, i) => {
          const show = interpolate(t, [i / (parts.length + 1) + 0.1, (i + 1.5) / (parts.length + 1)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <span key={p.k} style={{ opacity: show, whiteSpace: 'nowrap' }}>
              <i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, margin: '0 6px 0 0', verticalAlign: -1, background: biteColours[p.k] }} />
              {p.label} <b style={{ fontWeight: 600, color: T.ink }}>{money(p.v)}</b>
            </span>
          );
        })}
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.5, color: T.ink2 }}>
        {money(n.inBank)} came in. Rent, the factory, ads and the tax you owe took {money(n.inBank - n.kept)}. The bank balance was never the number.
      </p>
    </div>
  );
};

// The cash forecast card: the line, the lowest point marked.
export const CwForecast: React.FC<{ T?: Theme; t?: number; width?: number }> = ({ T = T0, t = 1, width = 520 }) => {
  const n = cashewNumbers;
  const rows = n.forecast.map((v, i) => ({ x: n.forecastMonths[i], v }));
  return (
    <div style={{ ...card(T), width, padding: '18px 20px' }}>
      <CardHead T={T} title="Cash forecast" find="The next six months at the current pace, after tax is set aside. The low point is the one to watch." />
      <LineChart rows={rows} w={width - 40} h={200} color={T.brand} grid={T.grid} faint={T.faint} muted={T.muted} surface={T.surface} t={t} zeroFloor={false} mark={4} />
    </div>
  );
};

// Net by month: twelve bars, red where the month lost.
export const CwNetByMonth: React.FC<{ T?: Theme; t?: number; width?: number }> = ({ T = T0, t = 1, width = 520 }) => {
  const rows = cashewNumbers.netByMonth.map(([x, v], i, a) => ({ x, v, faded: i === a.length - 1 }));
  return (
    <div style={{ ...card(T), width, padding: '18px 20px' }}>
      <CardHead T={T} title="Net by month" find="Revenue minus every expense and fee, each of the last twelve months. Red is a loss." />
      <BarChart rows={rows} w={width - 40} h={190} color={T.brand} bad={T.bad} grid={T.grid} faint={T.faint} muted={T.muted} t={t} />
    </div>
  );
};

// Where the money went: the ranked bars (lg-core.js rankList).
export const CwWhereItWent: React.FC<{ T?: Theme; t?: number; width?: number }> = ({ T = T0, t = 1, width = 520 }) => {
  const rows = cashewNumbers.whereItWent;
  const mx = rows[0][1];
  const total = rows.reduce((s, r) => s + r[1], 0);
  return (
    <div style={{ ...card(T), width, padding: '18px 20px' }}>
      <CardHead T={T} title={`Where ${cashewNumbers.monthShort}'s money went`} find={`${money(total)} so far, biggest first. The top line is the first thing to question.`} />
      {rows.map(([name, v], i) => {
        const p = interpolate(t, [i / (rows.length + 1), (i + 2) / (rows.length + 1)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div key={name} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 44px 70px', gap: 12, alignItems: 'center', padding: '7px 0', borderBottom: i < rows.length - 1 ? `1px solid ${T.line}` : 'none', fontSize: 13, opacity: Math.min(1, p * 1.5) }}>
            <span style={{ color: T.ink }}>{name}</span>
            <span style={{ height: 6, borderRadius: 3, background: T.surface2, overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${(v / mx) * 100 * p}%`, background: T.cmp, borderRadius: 3 }} /></span>
            <span style={{ fontSize: 12, color: T.muted, textAlign: 'right' }}>{Math.round((v / total) * 100)}%</span>
            <span style={{ fontWeight: 600, textAlign: 'right' }}>{money(v)}</span>
          </div>
        );
      })}
    </div>
  );
};

// The finding card (ask.css .askcard .find): a dot, a sentence, one button.
export const CwFinding: React.FC<{ T?: Theme; width?: number; index?: number; pressed?: number; booked?: number; show?: number[]; tap?: number }> = ({ T = T0, width = 520, index = 0, pressed = 0, booked = 0, show, tap = 0 }) => {
  const list = cashewNumbers.findings;
  return (
    <div style={{ ...card(T), width, padding: '16px 20px 6px', borderColor: `rgba(92,195,149,.35)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Character app={cashewApp} state="found" size={28} />
        <b style={{ fontSize: 14, fontWeight: 600 }}>Two things worth a look</b>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.muted }}>Checked at 11:40 pm</span>
      </div>
      {list.map((f, i) => {
        const p = show?.[i] ?? 1;
        const isBooked = i === index && booked > 0;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 12, alignItems: 'start', padding: '11px 0', borderTop: `1px solid ${T.line}`, opacity: p, transform: `translateY(${(1 - p) * 12}px)` }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', marginTop: 6, background: f.level === 'high' ? T.bad : T.warn }} />
            <span>
              <b style={{ display: 'block', fontSize: 14, fontWeight: 600, color: T.ink }}>{f.title}</b>
              <small style={{ display: 'block', fontSize: 13, color: T.ink2, lineHeight: 1.5, marginTop: 2 }}>{f.small}</small>
            </span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {isBooked ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 8, background: T.goodBg, color: T.good, fontSize: 12.5, fontWeight: 600 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - booked} /></svg>
                  Booked
                </span>
              ) : (
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <Btn T={T} kind="primary" small pressed={i === index ? pressed : 0}>{f.button}</Btn>
                  {i === index && <Tap t={tap} size={110} color={T.ink} style={{ left: '50%', top: '50%', marginLeft: -55, marginTop: -55 }} />}
                </span>
              )}
              <Btn T={T} kind="ghost" small>Not now</Btn>
            </span>
          </div>
        );
      })}
    </div>
  );
};

// The close checklist: each line ticks, the last one closes the month.
export const CwClose: React.FC<{ T?: Theme; width?: number; ticks?: number[] }> = ({ T = T0, width = 520, ticks }) => {
  const items = cashewNumbers.closeItems;
  return (
    <div style={{ ...card(T), width, padding: '18px 20px 8px' }}>
      <CardHead T={T} title={`Close ${cashewNumbers.month}`} find="One sitting. Every line checked against the bank, then the month locks." cap={ticks && ticks[items.length - 1] >= 1 ? 'Closed' : 'Open'} />
      {items.map((it, i) => {
        const p = ticks?.[i] ?? 1;
        const last = i === items.length - 1;
        return (
          <div key={it} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: `1px solid ${T.line}`, fontSize: 13.5, fontWeight: last ? 650 : 400, color: p > 0.5 ? T.ink : T.ink2 }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', border: `1.6px solid ${p > 0 ? T.good : T.lineStrong}`, background: p > 0 ? T.good : 'transparent', display: 'grid', placeItems: 'center', flex: 'none', transform: `scale(${1 + Math.sin(Math.min(1, p) * Math.PI) * 0.18})` }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, p)} /></svg>
            </span>
            {it}
            {last && p >= 1 && <Pill T={T} tone="good" style={{ marginLeft: 'auto' }}>closed</Pill>}
          </div>
        );
      })}
    </div>
  );
};

// The CPA pack header: a page, the wordmark, the business, the period, the contents.
export const CwPack: React.FC<{ T?: Theme; width?: number; t?: number }> = ({ T = T0, width = 460, t = 1 }) => {
  const p = cashewNumbers.pack;
  return (
    <div style={{ width, background: '#fff', borderRadius: 6, padding: '28px 30px 26px', boxSizing: 'border-box', fontFamily: sans, color: T.ink, boxShadow: '0 30px 60px rgba(0,0,0,.25), 0 2px 6px rgba(0,0,0,.08)', ...tnum }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: `1px solid ${T.lineStrong}` }}>
        <Logo app={cashewApp} height={22} color={T.ink} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: T.muted }}>Statement pack</span>
      </div>
      <div style={{ marginTop: 18, fontSize: 20, fontWeight: 650, letterSpacing: '-0.02em' }}>{p.business}</div>
      <div style={{ fontSize: 13.5, color: T.ink2, marginTop: 2 }}>{p.period} · prepared for {cashewNumbers.cpaName}</div>
      <div style={{ marginTop: 16 }}>
        {p.pages.map((pg, i) => {
          const s = interpolate(t, [i / (p.pages.length + 1), (i + 2) / (p.pages.length + 1)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div key={pg} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13.5, opacity: s }}>
              <span>{pg}</span>
              <span style={{ color: T.muted }}>p. {i + 2}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// The ledger's window: the top bar with the ask bar and the period, the page tabs.
export const CwWindow: React.FC<{ T?: Theme; width: number; crumb: [string, string]; tabs: string[]; active: number; period?: string; children: React.ReactNode; faceState?: 'rest' | 'thinking' | 'found' | 'clear' | 'asleep'; style?: React.CSSProperties }> = ({
  T = T0, width, crumb, tabs, active, period = 'September 2026', children, faceState = 'clear', style,
}) => (
  <div style={{ width, background: T.bg, borderRadius: 16, overflow: 'hidden', fontFamily: sans, color: T.ink, border: `1px solid ${T.line}`, boxShadow: '0 30px 80px rgba(0,0,0,.28)', ...tnum, ...style }}>
    <div style={{ height: 50, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', borderBottom: `1px solid ${T.line}` }}>
      <span style={{ fontSize: 13, color: T.muted, whiteSpace: 'nowrap' }}>{crumb[0]}<i style={{ fontStyle: 'normal', color: T.faint, margin: '0 6px' }}>›</i><b style={{ color: T.ink, fontWeight: 600 }}>{crumb[1]}</b></span>
      <span style={{ flex: 1, maxWidth: 320, height: 34, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px 0 12px', border: `1px solid ${T.lineStrong}`, borderRadius: 10, background: T.surface, marginLeft: 8 }}>
        <Character app={cashewApp} state={faceState} size={20} />
        <span style={{ fontSize: 13, color: T.faint, flex: 1 }}>Ask the Controller, or jump to a page</span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: T.faint, border: `1px solid ${T.line}`, borderRadius: 5, padding: '1px 6px' }}>⌘K</span>
      </span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 10px 0 12px', border: `1px solid ${T.lineStrong}`, borderRadius: 8, background: T.surface, fontSize: 12.5, fontWeight: 550 }}>
        {period}
        <svg viewBox="0 0 10 6" width="11" height="11"><path d="M1 1l4 4 4-4" stroke={T.muted} strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
      </span>
    </div>
    <div style={{ display: 'flex', gap: 2, margin: '0 18px', borderBottom: `1px solid ${T.line}` }}>
      {tabs.map((tb, i) => (
        <span key={tb} style={{ fontSize: 13.5, fontWeight: 550, padding: '10px 13px 11px', color: i === active ? T.ink : T.muted, borderBottom: `2px solid ${i === active ? T.brand : 'transparent'}`, marginBottom: -1 }}>{tb}</span>
      ))}
    </div>
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
  </div>
);

// A bank app's balance card: not Cashew, the thing people believe.
export const BankCard: React.FC<{ width?: number; count?: number; t?: number }> = ({ width = 420, count = 1, t = 1 }) => {
  const n = cashewNumbers;
  const ink = '#101418';
  return (
    <div style={{ width, background: '#fff', borderRadius: 22, padding: '22px 22px 18px', boxSizing: 'border-box', fontFamily: sans, color: ink, boxShadow: '0 30px 80px rgba(0,0,0,.28)', ...tnum }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#5B6470' }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: '#1B3A6B', display: 'grid', placeItems: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-6 9 6M5 10v9M19 10v9M9 10v9M15 10v9M3 19h18" /></svg>
        </span>
        {n.bankName}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: '#1C7A46', background: '#E4F2E9', padding: '2px 8px', borderRadius: 99 }}>Live</span>
      </div>
      <div style={{ fontSize: 13, color: '#6B7480', marginTop: 20 }}>Available balance</div>
      <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.05, marginTop: 2 }}>{money(n.inBank * count)}</div>
      <div style={{ fontSize: 12.5, color: '#1C7A46', fontWeight: 600, marginTop: 6 }}>▲ $3,300 this month</div>
      <div style={{ marginTop: 14 }}><Spark values={n.bankLine} color="#1C7A46" t={t} h={54} zeroFloor={false} thick={2.2} /></div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {['Transfer', 'Pay', 'Deposit', 'More'].map((b) => (
          <span key={b} style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, padding: '9px 0', borderRadius: 10, background: '#F1F3F6', color: ink }}>{b}</span>
        ))}
      </div>
    </div>
  );
};
