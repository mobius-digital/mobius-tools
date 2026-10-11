// The Locus spot, beat by beat from docs/two-products.md section 6.
//
//  1. "Meta says 4.1." "Shopify says 2.3." Two numbers argue.
//  2. "14 tabs open. Nobody knows what to change." Tabs fly.
//  3. Locus. The dot wakes before you do. "Every store. Every ad account.
//     Every email. Read by 7."
//  4. "The morning brief." One sentence per brand.
//  5. "Today's calls." Scale this. Cut that. Refresh this. Ranked by money
//     at stake. One tap. "Paused."
//  6. "What to make next." The creative engine: the winning angle, the
//     brief, the library.
//  7. "Agency edition: every brand, one morning." Lanes of brands.
//  8. "Locus. Know what to change."
//  Then the two characters and the two logos: Locus knows where you are.
//  Cashew knows what you have.
import React from 'react';
import { AbsoluteFill, Sequence, interpolate, random, useCurrentFrame } from 'remotion';
import { colours, locus as locusApp, locusNumbers } from '../../brand';
import { Column, Figure, Fit, Line, Stage, useStage } from '../lib/stage';
import { feel, money, rise, useBump, useExit, useSpring } from '../lib/motion';
import { Character, CharacterBlend, LogoLockup } from '../marks/Mark';
import { Card, Tap } from '../shared/pieces';
import { Ending } from '../shared/Ending';
import { Tagline } from '../shared/Tagline';

const beats = {
  argue: [0, 150],
  tabs: [150, 570], // the tabs, then the collapse into the dot and the wake
  brief: [570, 720],
  calls: [720, 930],
  creative: [930, 1080],
  agency: [1080, 1200],
  tagline: [1200, 1290],
  ending: [1290, 1395],
} as const;
export const locusDuration = beats.ending[1];
const FLOOD_AT = 350; // the field floods in during the collapse

const B = colours.locus;
const W = colours.onField;
const W2 = colours.onField2;

const accentLast = (line: string) => {
  const words = line.split(' ');
  const last = words.pop();
  return `${words.join(' ')} *${last}*`;
};

// ---- 1. Two numbers argue ---------------------------------------------------------
const Argue: React.FC<{ len: number }> = ({ len }) => {
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 8);
  const { portrait } = useStage();
  const left = s(0, feel.pop);
  const right = s(10, feel.pop);
  // Each shoves in turn; the other flinches.
  const shoveL = bump(36, 5, feel.wobble) + bump(84, 5, feel.wobble) + bump(126, 5, feel.wobble);
  const shoveR = bump(60, 5, feel.wobble) + bump(106, 5, feel.wobble);
  const side = (label: string, value: string, p: number, shove: number, flinch: number, dir: number) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        transform: `translateX(${dir * (shove * 70 - flinch * 50)}px) rotate(${dir * (shove * 6 - flinch * 8)}deg) scale(${p + shove * 0.08})`,
        opacity: p,
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 500, color: colours.muted }}>{label}</div>
      <Figure text={value} size={portrait ? 250 : 320} />
    </div>
  );
  return (
    <Column style={{ opacity: out, flexDirection: 'row', gap: portrait ? 130 : 220 }}>
      {side('Meta says', locusNumbers.metaRoas, left, shoveL, shoveR, 1)}
      {side('Shopify says', locusNumbers.shopifyRoas, right, shoveR, shoveL, -1)}
    </Column>
  );
};

// ---- 2 and 3. Tabs fly, then collapse into the dot, which wakes --------------------
const TabCard: React.FC<{ i: number }> = ({ i }) => (
  <div style={{ width: 300, height: 200, borderRadius: 18, background: '#FFFFFF', boxShadow: '0 18px 40px rgba(0,0,0,.16)', overflow: 'hidden' }}>
    <div style={{ height: 48, background: colours.ink, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
      <div style={{ width: 18, height: 18, borderRadius: 9, border: '3px solid #fff', boxSizing: 'border-box' }} />
      <div style={{ height: 9, width: 70 + ((i * 37) % 110), borderRadius: 5, background: 'rgba(255,255,255,.65)' }} />
    </div>
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[0, 1, 2, 3].map((k) => (
        <div key={k} style={{ height: 14, borderRadius: 7, width: `${35 + ((i * 29 + k * 53) % 60)}%`, background: k === 0 ? 'rgba(15,15,20,.5)' : 'rgba(15,15,20,.12)' }} />
      ))}
    </div>
  </div>
);

const COLLAPSE = 180;
const WAKE = 240;

const TabsAndWake: React.FC<{ len: number }> = ({ len }) => {
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 8);
  const { dw, dh, portrait } = useStage();
  const n = locusNumbers.tabs;

  const tabs = Array.from({ length: n }, (_, i) => {
    const arrive = s(i * 4, feel.pop);
    const go = s(COLLAPSE + i * 2, { damping: 18, stiffness: 140, mass: 0.9 });
    const rx = (random(`tx${i}`) - 0.5) * (dw - 420);
    const ry = (random(`ty${i}`) - 0.5) * (dh - 560);
    const rot = (random(`tr${i}`) - 0.5) * 28;
    const ang = (i / n) * Math.PI * 2 + 0.7;
    const fromX = Math.cos(ang) * 1600;
    const fromY = Math.sin(ang) * 1600;
    const x = interpolate(go, [0, 1], [fromX + (rx - fromX) * arrive, 0]);
    const y = interpolate(go, [0, 1], [fromY + (ry - fromY) * arrive, 0]);
    const sc = (1 - go) * (0.7 + 0.3 * arrive);
    return { i, x, y, rot: rot * (1 - go) + go * 180 * (random(`ts${i}`) - 0.5), sc, arrive };
  });
  const counted = tabs.filter((t) => t.arrive > 0.5).length;
  const countIn = s(12, feel.settle);
  const nobody = s(96, feel.settle);
  const linesOut = 1 - s(COLLAPSE - 6, feel.soft);

  // The dot: a point grows where the tabs went, then the bead wakes.
  const dot = s(COLLAPSE + 20, feel.pop);
  const bead = s(WAKE - 20, feel.pop);
  const wake = s(WAKE, feel.settle);
  const blink = bump(WAKE + 30, 3, feel.snap);
  const name = s(WAKE + 22, feel.settle);
  const wakesLine = s(WAKE + 40, feel.settle);
  const up = s(WAKE + 76, feel.settle);
  const l1 = s(WAKE + 80, feel.settle);
  const l2 = s(WAKE + 94, feel.settle);
  const l3 = s(WAKE + 108, feel.settle);
  const l4 = s(WAKE + 130, feel.pop);

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: out }}>
      {tabs.map((t) => (
        <div
          key={t.i}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(${t.x}px, ${t.y}px) translate(-50%, -50%) rotate(${t.rot}deg) scale(${t.sc})`,
            opacity: t.arrive,
          }}
        >
          <TabCard i={t.i} />
        </div>
      ))}

      <Column gap={16} style={{ opacity: linesOut }}>
        <div style={{ background: colours.paper, padding: '18px 40px', borderRadius: 28, ...rise(countIn, 20) }}>
          <Line text={`${counted} tabs open.`} size={76} />
        </div>
        <div style={{ background: colours.paper, padding: '14px 40px', borderRadius: 28, ...rise(nobody, 20) }}>
          <Line text="Nobody knows what to change." size={56} weight={600} />
        </div>
      </Column>

      {/* The point every tab went into. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 44,
          height: 44,
          marginLeft: -22,
          marginTop: -22,
          borderRadius: 22,
          background: B,
          transform: `scale(${dot * (1 - bead)})`,
        }}
      />

      {/* The character wakes: asleep to found, with a blink, then the logo. */}
      <div style={{ position: 'absolute', inset: 0, color: W, transform: `translateY(${-up * (portrait ? 420 : 300)}px)` }}>
        <Column gap={30}>
          <CharacterBlend
            app={locusApp}
            from="asleep"
            to="found"
            t={Math.min(1, wake + blink * 0.3)}
            size={360}
            style={{ transform: `scale(${bead * (1 - up * 0.4)}) translateY(${-wake * 20}px)`, opacity: bead }}
          />
          <LogoLockup app={locusApp} height={110} color={W} style={rise(name, 30)} />
          <Line text="The dot *wakes* before you do." size={60} weight={600} color={W} style={{ ...rise(wakesLine, 24), opacity: Math.min(wakesLine, 1 - up) }} />
        </Column>
      </div>

      <div style={{ position: 'absolute', inset: 0, color: W, transform: `translateY(${portrait ? 180 : 150}px)` }}>
        <Column gap={14}>
          <Line text="Every store." size={64} weight={600} color={W} style={rise(l1, 24)} />
          <Line text="Every ad account." size={64} weight={600} color={W} style={rise(l2, 24)} />
          <Line text="Every email." size={64} weight={600} color={W} style={rise(l3, 24)} />
          <Line text={`Read by ${locusNumbers.readBy}.`} size={110} weight={700} color={W} style={{ ...rise(l4, 40), marginTop: 20 }} />
        </Column>
      </div>
    </div>
  );
};

// The field floods in from the dot and stays.
const Flood: React.FC<{ color: string }> = ({ color }) => {
  const s = useSpring();
  const p = s(0, { damping: 22, stiffness: 110, mass: 1.1 });
  return <AbsoluteFill style={{ background: color, clipPath: `circle(${p * 1500}px at 50% 50%)` }} />;
};

// ---- 4. The morning brief ------------------------------------------------------------
const Ring: React.FC<{ size?: number; color?: string }> = ({ size = 44, color = B }) => (
  <div style={{ width: size, height: size, borderRadius: size / 2, border: `${Math.max(4, size / 9)}px solid ${color}`, boxSizing: 'border-box', flex: 'none' }} />
);

const Brief: React.FC<{ len: number }> = ({ len }) => {
  const s = useSpring();
  const out = useExit(len, 8);
  const head = s(0, feel.settle);
  const sub = s(14, feel.settle);
  const rows = [0, 1, 2].map((i) => ({ card: s(30 + i * 10, feel.pop), bar: s(44 + i * 10, feel.settle, 40) }));
  return (
    <Column gap={28} style={{ opacity: out, color: W }}>
      <Line text="The morning brief." size={84} weight={700} color={W} style={rise(head, 30)} />
      <Line text="One sentence per brand." size={44} weight={500} color={W2} style={{ ...rise(sub, 20), marginBottom: 24 }} />
      {rows.map((r, i) => (
        <Card key={i} width={900} style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '30px 36px', transform: `translateY(${(1 - r.card) * 60}px)`, opacity: r.card }}>
          <Ring />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ height: 18, borderRadius: 9, background: colours.ink, width: `${r.bar * (78 + ((i * 13) % 20))}%` }} />
            <div style={{ height: 18, borderRadius: 9, background: 'rgba(15,15,20,.18)', width: `${r.bar * (40 + ((i * 31) % 35))}%` }} />
          </div>
        </Card>
      ))}
    </Column>
  );
};

// ---- 5. Today's calls -----------------------------------------------------------------
const Calls: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 8);
  const head = s(0, feel.settle);
  const cards = locusNumbers.calls.map((_, i) => s(16 + i * 9, feel.pop));
  const ranked = s(50, feel.settle);
  const oneTap = s(84, feel.settle);
  const tapT = interpolate(f, [104, 128], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const press = bump(106, 4, feel.snap);
  const paused = s(112, feel.pop);
  const headOut = 1 - s(112, feel.soft);
  const k = locusNumbers.tappedCall;
  const look = s(6, feel.pop);
  const perk = s(106, feel.snap);
  return (
    <Column gap={22} style={{ opacity: out, color: W }}>
      <div style={{ position: 'relative', height: 120, width: 900, marginBottom: 10 }}>
        <CharacterBlend app={locusApp} from="thinking" to="found" t={perk} size={190} style={{ position: 'absolute', left: -40, top: -60, transform: `scale(${look})`, opacity: look }} />
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: headOut }}>
          <Line text="Today's calls." size={84} weight={700} color={W} style={rise(head, 30)} />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: paused, transform: `scale(${paused})` }}>
          <Line text="*Paused.*" size={140} color={W} />
        </div>
      </div>
      {locusNumbers.calls.map((c, i) => {
        const tapped = i === k;
        const done = tapped ? paused : 0;
        return (
          <div key={c.label} style={{ position: 'relative', transform: `translateY(${(1 - cards[i]) * 60}px) scale(${1 - press * (tapped ? 0.04 : 0)})`, opacity: cards[i] }}>
            <Card width={900} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '34px 40px', opacity: 1 - done * 0.45 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                <Ring />
                <div style={{ fontSize: 46, fontWeight: 650, letterSpacing: '-0.02em' }}>{c.label}</div>
              </div>
              <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: done > 0.5 ? colours.muted : colours.ink, textDecoration: done > 0.5 ? 'line-through' : 'none' }}>
                {money(c.stake)}
              </div>
            </Card>
            {tapped && <Tap t={tapT} color={colours.ink} size={240} style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />}
          </div>
        );
      })}
      <Line text="Ranked by money at stake." size={44} weight={500} color={W2} style={{ ...rise(ranked, 20), marginTop: 12, opacity: Math.min(ranked, 1 - oneTap) }} />
      <Line text="One tap." size={44} weight={500} color={W2} style={{ ...rise(oneTap, 20), marginTop: -66, opacity: oneTap }} />
    </Column>
  );
};

// ---- 6. What to make next -----------------------------------------------------------------
const Glyph: React.FC<{ kind: 'angle' | 'brief' | 'library'; p: number }> = ({ kind, p }) => {
  const common = { fill: 'none', stroke: B, strokeWidth: 6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'angle') {
    const len = 190;
    return (
      <svg viewBox="0 0 120 80" width={150} height={100} {...common}>
        <path d="M10 66 L40 46 L62 54 L110 14" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
        <circle cx="110" cy="14" r="6" fill={B} stroke="none" opacity={p > 0.95 ? 1 : 0} />
      </svg>
    );
  }
  if (kind === 'brief') {
    return (
      <svg viewBox="0 0 120 80" width={150} height={100} {...common}>
        <path d="M14 18h92" strokeDasharray={92} strokeDashoffset={92 * (1 - p)} />
        <path d="M14 40h70" strokeDasharray={70} strokeDashoffset={70 * (1 - Math.max(0, p * 1.3 - 0.3))} />
        <path d="M14 62h50" strokeDasharray={50} strokeDashoffset={50 * (1 - Math.max(0, p * 1.6 - 0.6))} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 80" width={150} height={100} {...common}>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = 12 + (i % 3) * 36;
        const y = 8 + Math.floor(i / 3) * 36;
        const q = Math.max(0, Math.min(1, p * 2.2 - i * 0.22));
        return <rect key={i} x={x + 14 * (1 - q)} y={y + 14 * (1 - q)} width={28 * q} height={28 * q} rx="6" />;
      })}
    </svg>
  );
};

const Creative: React.FC<{ len: number }> = ({ len }) => {
  const s = useSpring();
  const out = useExit(len, 8);
  const head = s(0, feel.settle);
  const items: { kind: 'angle' | 'brief' | 'library'; label: string }[] = [
    { kind: 'angle', label: 'The winning angle' },
    { kind: 'brief', label: 'The brief' },
    { kind: 'library', label: 'The library' },
  ];
  return (
    <Column gap={24} style={{ opacity: out, color: W }}>
      <Line text="What to make next." size={84} weight={700} color={W} style={{ ...rise(head, 30), marginBottom: 20 }} />
      {items.map((it, i) => {
        const card = s(18 + i * 12, feel.pop);
        const draw = s(34 + i * 12, feel.settle, 40);
        return (
          <Card key={it.kind} width={900} style={{ display: 'flex', alignItems: 'center', gap: 34, padding: '26px 40px', transform: `translateY(${(1 - card) * 60}px)`, opacity: card }}>
            <Glyph kind={it.kind} p={draw} />
            <div style={{ fontSize: 48, fontWeight: 650, letterSpacing: '-0.02em' }}>{it.label}</div>
          </Card>
        );
      })}
    </Column>
  );
};

// ---- 7. Agency edition --------------------------------------------------------------------
const Agency: React.FC<{ len: number }> = ({ len }) => {
  const s = useSpring();
  const out = useExit(len, 8);
  const head = s(0, feel.settle);
  const lanes = Array.from({ length: locusNumbers.brands }, (_, i) => s(16 + i * 7, feel.pop));
  return (
    <Column gap={18} style={{ opacity: out, color: W }}>
      <Line text="Agency edition: every brand, one morning." size={64} weight={700} color={W} style={{ ...rise(head, 30), marginBottom: 26, maxWidth: 900 }} />
      {lanes.map((p, i) => (
        <div
          key={i}
          style={{
            width: 900,
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            padding: '20px 28px',
            borderRadius: 24,
            background: colours.onFieldWell,
            border: `2px solid ${colours.onFieldLine}`,
            boxSizing: 'border-box',
            transform: `translateX(${(1 - p) * -500}px)`,
            opacity: p,
          }}
        >
          <Ring color={W} size={40} />
          <div style={{ height: 16, borderRadius: 8, background: W, width: `${48 + ((i * 17) % 30)}%` }} />
          <div style={{ height: 16, borderRadius: 8, background: colours.onFieldLine, flex: 1 }} />
        </div>
      ))}
    </Column>
  );
};

// ---- The spot --------------------------------------------------------------------------------
const Beat: React.FC<{ at: readonly [number, number]; children: (len: number) => React.ReactNode }> = ({ at, children }) => (
  <Sequence from={at[0]} durationInFrames={at[1] - at[0]}>
    <Fit>{children(at[1] - at[0])}</Fit>
  </Sequence>
);

export const LocusSpot: React.FC = () => (
  <Stage bg={colours.paper} ink={colours.ink}>
    <Sequence from={FLOOD_AT}>
      <Fit>
        <Flood color={B} />
      </Fit>
    </Sequence>
    <Beat at={beats.argue}>{(len) => <Argue len={len} />}</Beat>
    <Beat at={beats.tabs}>{(len) => <TabsAndWake len={len} />}</Beat>
    <Beat at={beats.brief}>{(len) => <Brief len={len} />}</Beat>
    <Beat at={beats.calls}>{(len) => <Calls len={len} />}</Beat>
    <Beat at={beats.creative}>{(len) => <Creative len={len} />}</Beat>
    <Beat at={beats.agency}>{(len) => <Agency len={len} />}</Beat>
    <Beat at={beats.tagline}>{() => <Tagline app={locusApp} tagline={accentLast(locusApp.tagline)} />}</Beat>
    <Beat at={beats.ending}>{() => <Ending />}</Beat>
  </Stage>
);
