// Locus, rebuilt as React: the Home tiles, the hero with the bites bar, the
// day check squares, the morning line, Today's calls, the spend bars, the
// agency lanes, and the window they sit in. Sizes and colours are the app's
// own (profit/v2.css), in app px; wrap a screen in <Zoom> to fill the frame.
import React from 'react';
import { Img, interpolate } from 'remotion';
import { locusNumbers } from '../../brand';
import { Spark } from './charts';
import { biteColour, channel, locusLight, sans, serif, tnum, type Theme } from './tokens';
import { Character } from '../marks/Mark';
import { locus as locusApp } from '../../brand';
import { Drips, GooDefs, Puddle } from '../fx/Goo';
import { Tap } from '../shared/pieces';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

// Scale an app-px layout up to the frame. `w` is the app width in px.
export const Zoom: React.FC<{ k: number; w: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ k, w, children, style }) => (
  <div style={{ width: w * k, position: 'relative', ...style }}>
    <div style={{ width: w, transform: `scale(${k})`, transformOrigin: '0 0' }}>{children}</div>
  </div>
);

export const card = (T: Theme, extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: T.surface,
  border: `1px solid ${T.line}`,
  borderRadius: 14,
  padding: '16px 18px',
  boxSizing: 'border-box',
  fontFamily: sans,
  color: T.ink,
  fontSize: 13.5,
  lineHeight: 1.5,
  ...tnum,
  ...extra,
});

export const CardHead: React.FC<{ T: Theme; title: string; find?: string; cap?: string }> = ({ T, title, find, cap }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
    <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 650, color: T.ink }}>{title}</h3>
    {find && <span style={{ fontSize: 13, color: T.ink2, flex: 1, minWidth: 120 }}>{find}</span>}
    {cap && <span style={{ fontSize: 12, color: T.muted, marginLeft: 'auto' }}>{cap}</span>}
  </div>
);

export const Pill: React.FC<{ T: Theme; tone?: 'good' | 'warn' | 'bad' | 'unk' | 'brand'; children: React.ReactNode; style?: React.CSSProperties }> = ({ T, tone = 'unk', children, style }) => {
  const map = {
    good: [T.goodBg, T.good], warn: [T.warnBg, T.warn], bad: [T.badBg, T.bad], unk: [T.unkBg, T.ink2], brand: [T.brandSoft, T.brandInk],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: bg, color: fg, whiteSpace: 'nowrap', lineHeight: 1.5, ...style }}>{children}</span>
  );
};

export const Delta: React.FC<{ T: Theme; text: string; up: boolean | null }> = ({ T, text, up }) => {
  const [bg, fg] = up === null ? [T.unkBg, T.muted] : up ? [T.goodBg, T.good] : [T.badBg, T.bad];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: bg, color: fg, marginLeft: 6, verticalAlign: 'middle' }}>
      {up === null ? '' : up ? '▲ ' : '▼ '}{text}
    </span>
  );
};

// A Home tile (.v2tile): label, value with its delta, a sparkline with the day line.
export const LxTile: React.FC<{
  T?: Theme; label: string; value: string; delta?: string; up?: boolean | null; series?: number[]; hero?: boolean; t?: number; sub?: string; width?: number; src?: string;
}> = ({ T = locusLight, label, value, delta, up = null, series, hero, t = 1, sub, width, src }) => (
  <div style={{ ...card(T), padding: '16px 18px 14px', display: 'flex', flexDirection: 'column', gap: 7, minHeight: 116, width, position: 'relative' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 500, color: T.muted, lineHeight: 1.35 }}>
      <span>{label}</span>
      {src && <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.06em', border: `1px solid ${T.lineStrong}`, borderRadius: 4, padding: '0 4px', color: T.muted, alignSelf: 'flex-start' }}>{src}</span>}
    </div>
    <div style={{ fontSize: hero ? 34 : 26, fontWeight: hero ? 700 : 650, letterSpacing: '-0.025em', lineHeight: 1.1, color: T.ink, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 6px' }}>
      {value}
      {delta && <Delta T={T} text={delta} up={up} />}
    </div>
    {sub && <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.45 }}>{sub}</div>}
    {series && <div style={{ marginTop: 'auto' }}><Spark values={series} color={T.brand} t={t} h={36} /></div>}
  </div>
);

// The bites bar from hero.js: kept first, then every bite, each labelled.
export const BitesBar: React.FC<{ T?: Theme; kept: number; bites: { k: string; label: string; v: number }[]; t?: number; colours?: Record<string, string> }> = ({
  T = locusLight, kept, bites, t = 1, colours = biteColour as Record<string, string>,
}) => {
  const parts = [{ k: 'kept', label: 'Kept', v: kept }, ...bites];
  const total = parts.reduce((s, p) => s + p.v, 0);
  return (
    <div>
      <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', background: T.surface2, gap: 2 }}>
        {parts.map((p, i) => {
          const grow = interpolate(t, [i / (parts.length + 1), (i + 2) / (parts.length + 1)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return <i key={p.k} style={{ display: 'block', flex: `${(p.v / total) * grow} 0 0`, background: colours[p.k] ?? colours.cogs, minWidth: 0 }} />;
        })}
      </div>
      <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', margin: '8px 0 0', fontSize: 12.5, color: T.ink2 }}>
        {parts.map((p, i) => {
          const show = interpolate(t, [i / (parts.length + 1) + 0.1, (i + 1.5) / (parts.length + 1)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <span key={p.k} style={{ opacity: show, whiteSpace: 'nowrap' }}>
              <i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, margin: '0 6px 0 0', verticalAlign: -1, background: colours[p.k] ?? colours.cogs }} />
              {p.label} <b style={{ fontWeight: 600, color: T.ink }}>{money(p.v)}</b>
            </span>
          );
        })}
      </div>
    </div>
  );
};

// The accent word: Instrument Serif italic, 8% larger, the product's colour on a surface.
export const Accent: React.FC<{ children: React.ReactNode; color: string }> = ({ children, color }) => (
  <em style={{ fontFamily: serif, fontStyle: 'italic', fontWeight: 400, letterSpacing: 0, fontSize: '1.08em', lineHeight: 1, color }}>{children}</em>
);

// The hero (.lx-hero): "Yesterday you actually kept $X" with the bites bar and the sentence.
export const LxHero: React.FC<{ T?: Theme; t?: number; count?: number; width?: number }> = ({ T = locusLight, t = 1, count = 1, width = 560 }) => {
  const n = locusNumbers;
  const shown = Math.round(n.kept * (0.4 + 0.6 * count)); // never a zero on screen: the count starts from a number
  const bitesList = n.bites.map((b) => `${money(b.v)} of ${b.label.toLowerCase()}`);
  const minus = `${bitesList.slice(0, -1).join(', ')} and ${bitesList[bitesList.length - 1]}`;
  return (
    <div style={{ ...card(T), padding: '22px 24px 20px', width }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.muted, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', fontSize: 11 }}>Yesterday, {n.yesterday}</span>
        <span>Contribution, the P&amp;L line</span>
      </div>
      <h2 style={{ margin: '0 0 14px', fontSize: 44, fontWeight: 650, letterSpacing: '-0.028em', lineHeight: 1.1, color: T.ink }}>
        You <Accent color={T.brandInk}>actually</Accent> kept <b style={{ fontWeight: 700 }}>{money(shown)}</b>
      </h2>
      <BitesBar T={T} kept={n.kept} bites={n.bites} t={t} />
      <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.5, color: T.ink2, maxWidth: '72ch' }}>
        Sales of {money(n.sales)} minus {minus}, against a normal day of about {money(n.normal)}.
      </p>
    </div>
  );
};

// The day check: fourteen squares, one per day, and the verdict.
export const LxDayCheck: React.FC<{ T?: Theme; t?: number; width?: number }> = ({ T = locusLight, t = 1, width = 560 }) => {
  const days = locusNumbers.dayCheck;
  return (
    <div style={{ ...card(T), width }}>
      <CardHead T={T} title="Day check" find="Was yesterday a bad day on Meta?" cap="Last 14 days" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Pill T={T} tone="good">Normal</Pill>
        <span style={{ fontSize: 13, color: T.ink2 }}>Cost per sale sat inside its usual range. Change nothing.</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {days.map((d, i) => {
          const show = interpolate(t, [i / days.length, (i + 1.5) / days.length], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const bg = d > 0 ? T.good : d < 0 ? T.bad : T.lineStrong;
          const last = i === days.length - 1;
          return (
            <div key={i} style={{ width: 28, height: 28, borderRadius: 7, background: bg, opacity: 0.25 + 0.75 * show, transform: `scale(${0.6 + 0.4 * show})`, boxShadow: last ? `0 0 0 2px ${T.surface}, 0 0 0 4px ${T.ink}` : 'none' }} />
          );
        })}
      </div>
    </div>
  );
};

// The morning line: the helper's face, one sentence per brand, the label.
export const LxMorning: React.FC<{ T?: Theme; lines: string[]; shown?: number[]; width?: number; faceState?: 'found' | 'clear' | 'thinking' }> = ({ T = locusLight, lines, shown, width = 560, faceState = 'found' }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', border: `1px solid ${T.brandLine}`, background: T.brandTint, borderRadius: 14, width, boxSizing: 'border-box', fontFamily: sans, ...tnum }}>
    <Character app={locusApp} state={faceState} size={28} />
    <div style={{ flex: 1, minWidth: 0 }}>
      {lines.map((l, i) => {
        const p = shown?.[i] ?? 1;
        const chars = Math.round(l.length * p);
        return (
          <p key={i} style={{ margin: i ? '2px 0 0' : 0, fontSize: 14, lineHeight: 1.5, color: T.ink, minHeight: 21 }}>
            {l.slice(0, chars)}
            {p > 0 && p < 1 && <span style={{ display: 'inline-block', width: 2, height: 14, background: T.brand, verticalAlign: -2, marginLeft: 1 }} />}
          </p>
        );
      })}
    </div>
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: T.muted, whiteSpace: 'nowrap' }}>This morning</span>
  </div>
);

// A button the way v2.css draws .ds-btn: primary on the brand, ghost on nothing.
export const DsBtn: React.FC<{ T?: Theme; kind?: 'primary' | 'ghost' | 'plain'; pressed?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ T = locusLight, kind = 'plain', pressed = 0, children, style }) => {
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 30, padding: '0 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', transform: `scale(${1 - pressed * 0.06})`, fontFamily: sans };
  const look: React.CSSProperties =
    kind === 'primary' ? { background: T.brand, color: T.onBrand, filter: `brightness(${1 - pressed * 0.12})` }
      : kind === 'ghost' ? { background: 'transparent', color: T.ink2 }
        : { background: T.surface, color: T.ink, border: `1px solid ${T.lineStrong}` };
  return <span style={{ ...base, ...look, ...style }}>{children}</span>;
};

// Today's calls: one row per call, the kind chip, the sentence, the one button.
export const LxCalls: React.FC<{
  T?: Theme; rows?: typeof locusNumbers.calls; shown?: number[]; pressed?: number; pressedIndex?: number; done?: number; width?: number; tap?: number;
}> = ({ T = locusLight, rows = locusNumbers.calls, shown, pressed = 0, pressedIndex = -1, done = 0, width = 560, tap = 0 }) => {
  const kindTone = { cut: 'bad', scale: 'good', refresh: 'brand' } as const;
  return (
    <div style={{ ...card(T), width, padding: '16px 18px 6px' }}>
      <CardHead T={T} title="Today's calls" find="Ad set first, ranked by the money at stake." cap={`${rows.length} to do`} />
      {rows.map((r, i) => {
        const p = shown?.[i] ?? 1;
        const isDone = i === pressedIndex && done > 0;
        return (
          <div key={i} style={{ padding: '12px 0', borderTop: `1px solid ${T.line}`, opacity: p, transform: `translateY(${(1 - p) * 14}px)`, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 5, background: ({ bad: T.badBg, good: T.goodBg, brand: T.brandSoft } as const)[kindTone[r.kind as keyof typeof kindTone]], color: ({ bad: T.bad, good: T.good, brand: T.brand } as const)[kindTone[r.kind as keyof typeof kindTone]] }}>{r.verb}</span>
              <b style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</b>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>{money(r.stake)} at stake</span>
            </div>
            <p style={{ margin: '6px 0 10px', fontSize: 13.5, lineHeight: 1.5, color: T.ink }}>{r.why}</p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {isDone ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 8, background: T.goodBg, color: T.good, fontSize: 12.5, fontWeight: 600, opacity: done }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - done} /></svg>
                  Paused and logged
                </span>
              ) : (
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <DsBtn T={T} kind="primary" pressed={i === pressedIndex ? pressed : 0}>{r.button}</DsBtn>
                  {i === pressedIndex && <Tap t={tap} size={110} color={T.ink} style={{ left: '50%', top: '50%', marginLeft: -55, marginTop: -55 }} />}
                </span>
              )}
              <DsBtn T={T} kind="ghost">Not now</DsBtn>
              <DsBtn T={T} kind="ghost">Done</DsBtn>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Spend by day: the app's bars, and the bleed. `t` draws the bars; `bleed`
// 0 to 1 turns the last bars red and runs them down into a pool.
export const LxSpendBars: React.FC<{ T?: Theme; t?: number; bleed?: number; width?: number; red?: string }> = ({ T = locusLight, t = 1, bleed = 0, width = 560, red = '#E0394F' }) => {
  const rows = locusNumbers.spendByDay;
  const W = width - 36;
  const H = 230;
  const top = 40;
  const base = 172;
  const floor = H - 6;
  const max = Math.max(...rows.map((r) => r[1]));
  const n = rows.length;
  const slot = W / n;
  const bw = Math.min(56, slot * 0.62);
  const from = locusNumbers.bleedFrom;
  const mixHex = (a: string, b: string, p: number) => {
    const ah = a.replace('#', ''), bh = b.replace('#', '');
    const c = (i: number) => Math.round(parseInt(ah.slice(i, i + 2), 16) * (1 - p) + parseInt(bh.slice(i, i + 2), 16) * p);
    return `rgb(${c(0)},${c(2)},${c(4)})`;
  };
  return (
    <div style={{ ...card(T), width }}>
      <CardHead T={T} title="Spend by day" find="Meta, the last seven days, with what each day returned." cap="Returned per $1" />
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block', overflow: 'visible', fontFamily: sans }}>
        <GooDefs id="bleedgoo" blur={5} />
        <line x1={0} x2={W} y1={base} y2={base} stroke={T.line} />
        {rows.map(([day, v, roas], i) => {
          const local = interpolate(t, [i / (n + 2), (i + 3) / (n + 2)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const h = ((v / max) * (base - top)) * local;
          const x = i * slot + (slot - bw) / 2;
          const bl = i >= from ? interpolate(bleed, [(i - from) * 0.18, (i - from) * 0.18 + 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
          const fill = mixHex(channel.meta, red, bl);
          return <rect key={i} x={x} y={base - h} width={bw} height={h} rx={4} fill={fill} />;
        })}
        <g filter="url(#bleedgoo)">
          {rows.map(([, v], i) => {
            if (i < from) return null;
            const bl = interpolate(bleed, [(i - from) * 0.18 + 0.15, (i - from) * 0.18 + 0.9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            if (bl <= 0) return null;
            const h = (v / max) * (base - top);
            const x = i * slot + (slot - bw) / 2;
            return (
              <g key={i}>
                <rect x={x} y={base - h} width={bw} height={h} rx={4} fill={red} opacity={interpolate(bleed, [(i - from) * 0.18, (i - from) * 0.18 + 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
                <Drips x={x} y={base - 2} width={bw} t={bl} color={red} count={3} maxLen={floor - base} floorY={floor} seed={i + 1} thin={0.55} />
              </g>
            );
          })}
          <Puddle cx={(from + (n - from) / 2) * slot} cy={floor} t={interpolate(bleed, [0.45, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} color={red} rx={slot * (n - from) * 0.55} ry={0.1} seed={9} />
        </g>
        {rows.map(([day, v, roas], i) => {
          const local = interpolate(t, [i / (n + 2), (i + 3) / (n + 2)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const h = ((v / max) * (base - top)) * local;
          const x = i * slot + (slot - bw) / 2;
          const bl = i >= from ? interpolate(bleed, [(i - from) * 0.18, (i - from) * 0.18 + 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
          const onRed = bl > 0.5;
          return (
            <g key={i}>
              <text x={x + bw / 2} y={base - h - 7} fontSize={12} fontWeight={600} textAnchor="middle" fill={onRed ? red : T.ink} style={{ opacity: local }}>{money(v)}</text>
              <text x={x + bw / 2} y={base + 16} fontSize={11} textAnchor="middle" fill={onRed ? '#fff' : T.muted}>{day}</text>
              <text x={x + bw / 2} y={base + 31} fontSize={10.5} fontWeight={600} textAnchor="middle" fill={onRed ? '#fff' : roas < 2 ? T.bad : T.faint}>{roas.toFixed(1)}x</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// The agency lanes (.lx-hero-rows): a brand, its bar, what it kept, on what.
export const LxLanes: React.FC<{ T?: Theme; t?: number; width?: number; count?: number }> = ({ T = locusLight, t = 1, width = 560, count = 1 }) => {
  const rows = locusNumbers.lanes;
  const mx = Math.max(...rows.map((r) => r.kept));
  const sum = rows.reduce((s, r) => s + r.kept, 0);
  return (
    <div style={{ ...card(T), padding: '22px 24px 16px', width }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.muted, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', fontSize: 11 }}>Yesterday, {locusNumbers.yesterday}</span>
        <span>Contribution, every brand</span>
      </div>
      <h2 style={{ margin: '0 0 10px', fontSize: 34, fontWeight: 650, letterSpacing: '-0.028em', lineHeight: 1.1, color: T.ink }}>
        The book <Accent color={T.brandInk}>actually</Accent> kept <b style={{ fontWeight: 700 }}>{money(sum * (0.4 + 0.6 * count))}</b>
      </h2>
      <div style={{ display: 'grid', gap: 2, margin: '0 -8px' }}>
        {rows.map((r, i) => {
          const p = interpolate(t, [i / (rows.length + 1), (i + 2) / (rows.length + 1)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div key={r.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,1.2fr) minmax(0,2fr) auto minmax(0,1.6fr)', gap: 12, alignItems: 'center', padding: '7px 8px', borderRadius: 8, opacity: Math.min(1, p * 1.6), transform: `translateX(${(1 - p) * -24}px)` }}>
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ height: 8, borderRadius: 999, background: T.surface2, overflow: 'hidden', display: 'block' }}>
                <i style={{ display: 'block', height: '100%', width: `${(r.kept / mx) * 100 * p}%`, background: T.brand, borderRadius: 999 }} />
              </span>
              <span style={{ fontWeight: 650, textAlign: 'right', minWidth: 72 }}>{money(r.kept * p)}</span>
              <span style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>on {money(r.sales)} · ads {r.ads}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// What to make next: the proven angle and the three iterations.
export const LxAngle: React.FC<{ T?: Theme; width?: number; pressed?: number; lines?: number[]; tap?: number }> = ({ T = locusLight, width = 560, pressed = 0, lines, tap = 0 }) => {
  const a = locusNumbers.angle;
  return (
    <div style={{ ...card(T), width }}>
      <CardHead T={T} title="Angles" find="What to make next, from what already won." cap="Marlow Golf" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${T.line}` }}>
        <Pill T={T} tone="good">{a.verdict}</Pill>
        <b style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</b>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: T.muted }}>{a.won} of {a.of} won · best {a.bestCpa} a sale · last tested {a.last}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 10px' }}>
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <DsBtn T={T} kind="primary" pressed={pressed}>Make three iterations</DsBtn>
          <Tap t={tap} size={110} color={T.ink} style={{ left: '50%', top: '50%', marginLeft: -55, marginTop: -55 }} />
        </span>
        <DsBtn T={T} kind="ghost">Brief it in Asana</DsBtn>
      </div>
      {lines && (
        <div style={{ borderTop: `1px solid ${T.line}` }}>
          {locusNumbers.iterations.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.line}`, opacity: lines[i], transform: `translateX(${(1 - lines[i]) * 18}px)` }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: T.brandSoft, color: T.brandInk, fontSize: 11.5, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{i + 1}</span>
              <span style={{ fontSize: 13.5 }}>{l}</span>
              <Pill T={T} tone="brand" style={{ marginLeft: 'auto' }}>Studio</Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// The app's window: the top bar (page, the ask bar with the helper, the nudge badge) and the page tabs.
export const LxWindow: React.FC<{
  T?: Theme; width: number; crumb: [string, string]; tabs: string[]; active: number; badge?: string; children: React.ReactNode; faceState?: 'rest' | 'thinking' | 'found' | 'clear' | 'asleep'; style?: React.CSSProperties;
}> = ({ T = locusLight, width, crumb, tabs, active, badge = 'Locus', children, faceState = 'clear', style }) => (
  <div style={{ width, background: T.bg, borderRadius: 16, overflow: 'hidden', fontFamily: sans, color: T.ink, border: `1px solid ${T.line}`, boxShadow: '0 30px 80px rgba(0,0,0,.28)', ...tnum, ...style }}>
    <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: `1px solid ${T.line}`, background: T.bg }}>
      <span style={{ fontSize: 13, color: T.muted, whiteSpace: 'nowrap' }}>{crumb[0]}<i style={{ fontStyle: 'normal', color: T.faint, margin: '0 6px' }}>›</i><b style={{ color: T.ink, fontWeight: 600 }}>{crumb[1]}</b></span>
      <span style={{ flex: 1, maxWidth: 300, height: 32, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', border: `1px solid ${T.lineStrong}`, borderRadius: 9, background: T.surface, marginLeft: 8 }}>
        <Character app={locusApp} state={faceState} size={18} />
        <span style={{ fontSize: 12.5, color: T.faint, flex: 1 }}>Ask Locus, or jump to a page</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: T.faint, border: `1px solid ${T.line}`, borderRadius: 5, padding: '0 5px' }}>⌘K</span>
      </span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, padding: '0 12px 0 8px', border: `1px solid ${badge === 'Locus' ? T.lineStrong : T.brandLine}`, borderRadius: 999, background: badge === 'Locus' ? T.surface : T.brandTint, fontSize: 12.5, fontWeight: 550 }}>
        <Character app={locusApp} state={faceState} size={16} />
        {badge}
      </span>
    </div>
    <div style={{ display: 'flex', gap: 2, padding: '0 16px', borderBottom: `1px solid ${T.line}` }}>
      {tabs.map((tb, i) => (
        <span key={tb} style={{ fontSize: 13, fontWeight: 550, padding: '9px 12px 10px', color: i === active ? T.ink : T.muted, borderBottom: `2px solid ${i === active ? T.brand : 'transparent'}`, marginBottom: -1 }}>{tb}</span>
      ))}
    </div>
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
  </div>
);

// The two numbers that argue: a card the way each platform draws its own.
export const PlatformCard: React.FC<{ name: string; colour: string; metric: string; value: string; note: string; up: boolean; series: number[]; width?: number; t?: number; mark: React.ReactNode }> = ({
  name, colour, metric, value, note, up, series, width = 300, t = 1, mark,
}) => (
  <div style={{ width, background: '#FFFFFF', borderRadius: 14, padding: '16px 18px 14px', boxSizing: 'border-box', fontFamily: sans, color: '#151518', boxShadow: '0 24px 60px rgba(0,0,0,.22)', ...tnum }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#45454F' }}>
      <span style={{ width: 22, height: 22, borderRadius: 6, background: colour, display: 'grid', placeItems: 'center', color: '#fff' }}>{mark}</span>
      {name}
    </div>
    <div style={{ fontSize: 12.5, color: '#6B6B78', marginTop: 12 }}>{metric}</div>
    <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
      {value}
      <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: up ? '#E4F2E9' : '#F7E7E4', color: up ? '#1C7A46' : '#9C3A2E' }}>{up ? '▲' : '▼'} {note}</span>
    </div>
    <div style={{ marginTop: 10 }}><Spark values={series} color={colour} t={t} h={34} /></div>
  </div>
);

// A browser tab, for the 14 of them.
export const Tab: React.FC<{ name: string; colour: string; style?: React.CSSProperties }> = ({ name, colour, style }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 44, padding: '0 18px 0 14px', borderRadius: 10, background: '#26262C', color: '#E7E7EC', fontFamily: sans, fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap', boxShadow: '0 10px 30px rgba(0,0,0,.4)', border: '1px solid #35353D', ...style }}>
    <span style={{ width: 12, height: 12, borderRadius: 3, background: colour }} />
    {name}
    <span style={{ color: '#7C7C88', fontSize: 14, marginLeft: 4 }}>×</span>
  </div>
);

export { money as lxMoney };
export const lxTheme = locusLight;
export const ImgSafe = Img;
