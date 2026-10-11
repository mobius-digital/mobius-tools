// The Kept spot, beat by beat from docs/two-products.md section 6.
//
//  1. A bank app. "$18,400 in the bank." The owner smiles.
//  2. "That is not what you made." Rent, the factory, ads and the tax each
//     take a bite. The balance melts.
//  3. "What you actually kept: $3,120." The character sighs.
//  4. "And you found out in April. From your CPA." A calendar flips.
//  5. Cashew. "Every account. Every sale. Every bill. One real number, every
//     night." The number is circled.
//  6. "The bill that did not come. The payment that landed twice." A nudge
//     card. "Cashew taps you on the shoulder." One tap: "Booked."
//  7. "Monday, 7:02. Here is your week." The phone.
//  8. "Close the month in one sitting. Hand your CPA a pack." A folder closes.
//  9. "Cashew. Know what you kept."
//  Then the two characters and the two logos: Locus knows where you are.
//  Cashew knows what you have. (The name and the files come from brand.ts.)
import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { colours, keptNumbers, money as moneyApp } from '../../brand';
import { Column, Figure, Fit, Line, Stage, useStage } from '../lib/stage';
import { feel, money, rise, useBump, useExit, useSpring } from '../lib/motion';
import { Character, CharacterBlend, LogoLockup } from '../marks/Mark';
import { Bite } from '../bites/Bite';
import { Button, Card, Circled, Crumbs, Phone, Tap } from '../shared/pieces';
import { Ending } from '../shared/Ending';
import { Tagline } from '../shared/Tagline';
import { balances } from './numbers';

// The beats, in frames at 30 fps.
const beats = {
  bank: [0, 120],
  bites: [120, 555],
  april: [555, 675],
  product: [675, 855],
  nudge: [855, 1020],
  monday: [1020, 1110],
  folder: [1110, 1200],
  tagline: [1200, 1290],
  ending: [1290, 1395],
} as const;
export const keptDuration = beats.ending[1];

const G = colours.kept;
const W = colours.onField;
const W2 = colours.onField2;

const accentLast = (line: string) => {
  const words = line.split(' ');
  const last = words.pop();
  return `${words.join(' ')} *${last}*`;
};

// ---- 1. The bank app ---------------------------------------------------------
const Owner: React.FC<{ smile: number; size: number; style?: React.CSSProperties }> = ({ smile, size, style }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" style={style}>
    <circle cx="32" cy="32" r="21" />
    <circle cx="25" cy="28" r="2.4" fill="currentColor" stroke="none" />
    <circle cx="39" cy="28" r="2.4" fill="currentColor" stroke="none" />
    <path d={`M25 39 Q32 ${39 + smile * 9} 39 39`} strokeWidth={4} />
  </svg>
);

const BankApp: React.FC<{ len: number }> = ({ len }) => {
  const s = useSpring();
  const out = useExit(len, 8);
  const phone = s(0, feel.pop);
  const count = s(10, feel.settle, 60);
  const caption = s(18, feel.settle);
  const owner = s(50, feel.pop);
  const smile = s(66, feel.pop);
  return (
    <Column gap={0} style={{ opacity: out, flexDirection: 'row', gap: 56 }}>
      <Phone style={{ transform: `scale(${0.6 + 0.4 * phone})`, opacity: phone }}>
        <Figure text={money(keptNumbers.inBank * count)} size={92} />
        <div style={{ ...rise(caption, 20), fontSize: 36, color: colours.muted, fontWeight: 500, marginTop: 18 }}>in the bank.</div>
      </Phone>
      <Owner smile={smile} size={220} style={{ transform: `scale(${owner}) rotate(${(1 - owner) * -20}deg)`, opacity: owner, color: colours.ink }} />
    </Column>
  );
};

// ---- 2 and 3. The bites, the melt, what you actually kept -------------------
const biteAt = [30, 95, 160, 225]; // the frame each character arrives
const CHOMP = 22; // frames after arrival when the bite lands
const MELT = 284;
const REFORM = 334;

const BitesAndMelt: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 10);
  const { portrait } = useStage();

  // Which balance is on screen: the last bite that has landed.
  const landed = biteAt.filter((t) => f >= t + CHOMP).length;
  const value = balances[landed];
  const text = money(value);
  const size = 190;
  const width = text.length * 0.56 * size;

  const head = s(0, feel.settle);
  const heroIn = s(4, feel.pop);

  // The squash at each chomp, and the crumbs.
  let squash = 0;
  for (const t of biteAt) squash += bump(t + CHOMP, 4, feel.wobble);

  // The melt: the number sinks into a puddle; then the puddle lifts into the coin.
  const melt = s(MELT, feel.heavy, 70);
  const reform = s(REFORM, feel.pop);
  const lineIn = s(REFORM + 24, feel.settle);
  const figIn = s(REFORM + 34, feel.pop);
  const sigh = bump(REFORM + 62, 10, feel.soft);
  const parkedOut = 1 - s(MELT + 4, feel.soft);
  const headOut = 1 - s(MELT, feel.soft);

  const heroY = melt * 300;
  const heroScaleY = Math.max(0.02, 1 - melt * 0.98);
  const heroScaleX = 1 + melt * 0.7;
  const heroFade = interpolate(melt, [0.45, 0.85], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const puddleW = interpolate(melt, [0, 1], [0, width * 1.25]) * (1 - reform);
  const puddleH = 70 * melt * (1 - reform);

  const slotGap = portrait ? 240 : 300;
  const parkY = 430; // below the number

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: out }}>
      {/* "That is not what you made." */}
      <Column style={{ justifyContent: 'flex-start', paddingTop: portrait ? 300 : 150 }}>
        <Line text="That is not what you made." size={66} style={{ ...rise(head, 30), opacity: Math.min(head, headOut) }} />
      </Column>

      {/* The hero number and its puddle. */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
        <div
          style={{
            position: 'absolute',
            left: -puddleW / 2,
            top: 160 + heroY * 0.55,
            width: puddleW,
            height: puddleH,
            borderRadius: '50%',
            background: colours.ink,
            opacity: melt > 0.02 ? 1 : 0,
          }}
        />
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translateY(${heroY}px) scale(${heroScaleX * (1 - squash * 0.06) * heroIn}, ${
              heroScaleY * (1 + squash * 0.1) * heroIn
            })`,
            transformOrigin: '50% 100%',
            opacity: heroFade,
            whiteSpace: 'nowrap',
          }}
        >
          <Figure text={text} size={size} />
        </div>
        {biteAt.map((t, i) => (
          <Crumbs
            key={i}
            t={interpolate(f, [t + CHOMP, t + CHOMP + 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
            color={colours.ink}
            seed={i + 1}
          />
        ))}

        {/* The character rises out of the puddle, eyes shut, and sighs. */}
        {reform > 0.001 && (
          <div
            style={{
              position: 'absolute',
              left: -130,
              top: 160 - reform * 480 + sigh * 14,
              transform: `scale(${reform})`,
              transformOrigin: '50% 100%',
            }}
          >
            <CharacterBlend app={moneyApp} from="asleep" to="rest" t={figIn} size={260} />
          </div>
        )}
      </div>

      {/* The bites: each arrives from the side, lunges, chomps, parks below. */}
      {keptNumbers.bites.map((b, i) => {
        const t0 = biteAt[i];
        const side = i % 2 === 0 ? -1 : 1;
        const arrive = s(t0, feel.pop);
        const lunge = bump(t0 + 10, 6, feel.snap);
        const park = s(t0 + CHOMP + 12, feel.settle);
        const squint = bump(t0 + CHOMP - 2, 6, feel.snap);
        const startX = side * (width / 2 + 220);
        const lungeX = side * (width / 2 + 60);
        const slotX = (i - (keptNumbers.bites.length - 1) / 2) * slotGap;
        const x = interpolate(park, [0, 1], [startX + (lungeX - startX) * lunge, slotX]);
        const y = interpolate(park, [0, 1], [-10, parkY]);
        const amount = s(t0 + CHOMP + 20, feel.settle);
        return (
          <div
            key={b.who}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${arrive})`,
              opacity: Math.min(arrive, parkedOut),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Bite who={b.who} size={170} squint={squint} style={{ transform: `rotate(${side * lunge * -8}deg)` }} />
            <div style={{ ...rise(amount, 16), fontSize: 40, fontWeight: 650, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {money(b.amount)}
            </div>
          </div>
        );
      })}

      {/* The caption under the number: the plan's line for each bite. */}
      {keptNumbers.bites.map((b, i) => {
        const t0 = biteAt[i] + CHOMP;
        const inP = s(t0, feel.settle);
        const outP = i < biteAt.length - 1 ? s(biteAt[i + 1] + CHOMP, feel.snap) : s(MELT, feel.soft);
        return (
          <Column key={b.who} style={{ justifyContent: 'flex-start', paddingTop: portrait ? 1155 : 915 }}>
            <Line text={b.line} size={44} weight={500} color={colours.muted} style={{ ...rise(inP, 20), opacity: Math.min(inP, 1 - outP) }} />
          </Column>
        );
      })}

      {/* 3. What you actually kept. */}
      <Column style={{ justifyContent: 'flex-start', paddingTop: portrait ? 330 : 140 }}>
        <Line text="What you *actually* kept:" size={66} accentColor={colours.keptInk} style={rise(lineIn, 30)} />
      </Column>
      <Column style={{ justifyContent: 'flex-start', paddingTop: portrait ? 1130 : 900 }}>
        <Figure text={money(keptNumbers.kept)} size={190} color={colours.keptInk} style={{ transform: `scale(${figIn})`, opacity: figIn }} />
      </Column>
    </div>
  );
};

// ---- 4. April -------------------------------------------------------------------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const April: React.FC<{ len: number }> = ({ len }) => {
  const s = useSpring();
  const out = useExit(len, 8);
  const target = MONTHS.indexOf(keptNumbers.monthFoundOut);
  const months = [3, 2, 1, 0].map((back) => MONTHS[(target - back + 12) % 12]);
  const head = s(0, feel.settle);
  const cardIn = s(6, feel.pop);
  const flips = months.map((_, i) => (i === 0 ? 1 : s(22 + i * 20, feel.snap)));
  const cpa = s(92, feel.settle);
  return (
    <Column gap={56} style={{ opacity: out }}>
      <Line text={`And you found out in ${keptNumbers.monthFoundOut}.`} size={66} style={rise(head, 30)} />
      <div style={{ width: 520, height: 400, position: 'relative', perspective: 1600, transform: `scale(${cardIn})`, opacity: cardIn }}>
        {months.map((m, j) => {
          const incoming = j > 0 ? 90 * (1 - flips[j]) : 0;
          const outgoing = j < months.length - 1 ? 90 * flips[j + 1] : 0;
          const rot = incoming - outgoing;
          if (Math.abs(rot) >= 89) return null;
          return (
            <div
              key={m}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 36,
                background: '#FFFFFF',
                boxShadow: '0 24px 60px rgba(0,0,0,.12)',
                transform: `rotateX(${rot}deg)`,
                transformOrigin: '50% 0%',
                backfaceVisibility: 'hidden',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ height: 92, background: colours.ink }} />
              <div style={{ flex: 1, display: 'grid', placeItems: 'center', fontSize: 72, fontWeight: 650, letterSpacing: '-0.03em' }}>{m}</div>
            </div>
          );
        })}
      </div>
      <Line text="From your CPA." size={66} style={rise(cpa, 30)} />
    </Column>
  );
};

// ---- 5. The product --------------------------------------------------------------
// The field floods in from the centre and stays until the end.
const Flood: React.FC<{ color: string }> = ({ color }) => {
  const s = useSpring();
  const p = s(0, { damping: 22, stiffness: 110, mass: 1.1 });
  return <AbsoluteFill style={{ background: color, clipPath: `circle(${p * 1500}px at 50% 50%)` }} />;
};

const Product: React.FC<{ len: number }> = ({ len }) => {
  const s = useSpring();
  const out = useExit(len, 8);
  const mark = s(10, feel.pop);
  const name = s(16, feel.settle);
  const l1 = s(44, feel.settle);
  const l2 = s(58, feel.settle);
  const l3 = s(72, feel.settle);
  const swap = s(104, feel.settle);
  const fig = s(110, feel.pop);
  const circle = s(126, feel.settle, 40);
  const figText = money(keptNumbers.kept);
  const figSize = 200;
  const figW = figText.length * 0.56 * figSize;
  return (
    <Column gap={48} style={{ opacity: out, color: W }}>
      <LogoLockup app={moneyApp} height={moneyApp.logo.kind === 'wordmark' ? 150 : 120} color={W} style={{ ...rise(name, 30), transform: `scale(${0.9 + 0.1 * mark}) translateY(${(1 - name) * 30}px)` }} />
      <div style={{ position: 'relative', width: 900, height: 420 }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, opacity: 1 - swap, transform: `translateY(${-swap * 60}px)` }}>
          <Line text="Every account." size={64} weight={600} color={W} style={rise(l1, 24)} />
          <Line text="Every sale." size={64} weight={600} color={W} style={rise(l2, 24)} />
          <Line text="Every bill." size={64} weight={600} color={W} style={rise(l3, 24)} />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 56, opacity: swap }}>
          <Line text="One *real* number, every night." size={60} weight={600} color={W} style={rise(swap, 24)} />
          <div style={{ position: 'relative', transform: `scale(${fig})` }}>
            <Figure text={figText} size={figSize} color={W} />
            <Circled t={circle} width={figW} height={figSize} color={W} />
          </div>
        </div>
      </div>
    </Column>
  );
};

// ---- 6. The nudge ------------------------------------------------------------------
const Nudge: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 8);
  const l1 = s(0, feel.settle);
  const l2 = s(18, feel.settle);
  const card = s(48, feel.pop);
  const caption = s(64, feel.settle);
  const tapT = interpolate(f, [92, 116], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const press = bump(94, 4, feel.snap);
  const booked = s(100, feel.pop);
  const linesOut = 1 - s(100, feel.soft);
  const perk = s(92, feel.snap);
  return (
    <Column gap={48} style={{ opacity: out, color: W }}>
      <div style={{ position: 'relative', width: 900, height: 230 }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', opacity: linesOut }}>
          <Line text="The bill that did not come." size={60} weight={600} color={W} style={rise(l1, 24)} />
          <Line text="The payment that landed twice." size={60} weight={600} color={W} style={rise(l2, 24)} />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: booked, transform: `scale(${booked})` }}>
          <Line text="*Booked.*" size={150} color={W} />
        </div>
      </div>
      <div style={{ position: 'relative', transform: `translateY(${(1 - card) * 120}px) scale(${0.9 + 0.1 * card})`, opacity: card }}>
        <Card width={900} style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <CharacterBlend app={moneyApp} from="thinking" to="found" t={perk} size={120} />
          <div style={{ flex: 1, fontSize: 36, fontWeight: 500, lineHeight: 1.25, letterSpacing: '-0.01em' }}>The payment that landed twice.</div>
          <div style={{ position: 'relative' }}>
            <Button label={booked > 0.5 ? 'Booked.' : 'Book it'} fill={G} pressed={press} />
            <Tap t={tapT} color={colours.ink} size={220} style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
          </div>
        </Card>
      </div>
      <Line text={`${moneyApp.name} taps you on the shoulder.`} size={44} weight={500} color={W2} style={rise(caption, 20)} />
    </Column>
  );
};

// ---- 7. Monday ----------------------------------------------------------------------
const Monday: React.FC<{ len: number }> = ({ len }) => {
  const s = useSpring();
  const out = useExit(len, 8);
  const phone = s(0, feel.pop);
  const clock = s(8, feel.settle);
  const card = s(26, feel.pop);
  return (
    <Column style={{ opacity: out }}>
      <Phone screen={colours.ink} frame="#2A2A2E" style={{ transform: `scale(${0.7 + 0.3 * phone})`, opacity: phone }}>
        <div style={{ position: 'absolute', top: 130, left: 0, right: 0, textAlign: 'center', color: W, ...rise(clock, 20) }}>
          <div style={{ fontSize: 150, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1 }}>{keptNumbers.mondayTime}</div>
          <div style={{ fontSize: 36, fontWeight: 500, marginTop: 16, color: W2 }}>Monday</div>
        </div>
        <div style={{ position: 'absolute', left: 24, right: 24, top: 420, transform: `translateY(${(1 - card) * -80}px)`, opacity: card }}>
          <Card width={360} style={{ padding: '24px 26px', display: 'flex', alignItems: 'center', gap: 20, boxShadow: 'none' }}>
            <Character app={moneyApp} state="rest" size={72} />
            <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.2 }}>Here is your week.</div>
          </Card>
        </div>
      </Phone>
    </Column>
  );
};

// ---- 8. The folder -----------------------------------------------------------------------
const Folder: React.FC<{ len: number }> = ({ len }) => {
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 8);
  const head = s(0, feel.settle);
  const folder = s(8, feel.pop);
  const close = s(34, { damping: 18, stiffness: 120, mass: 1.2 });
  const pack = s(58, feel.settle);
  const flap = -75 + 75 * close;
  const nodIn = s(44, feel.pop);
  const nod = bump(62, 6, feel.settle);
  return (
    <Column gap={56} style={{ opacity: out, color: W }}>
      <Line text="Close the month in one sitting." size={64} weight={600} color={W} style={rise(head, 24)} />
      <div style={{ width: 560, height: 420, position: 'relative', perspective: 1400, transform: `scale(${folder})`, opacity: folder }}>
        <Character app={moneyApp} state="clear" size={220} style={{ position: 'absolute', right: -200, bottom: 20, transform: `scale(${nodIn}) translateY(${nod * 16}px)`, opacity: nodIn }} />
        {/* back panel with its tab */}
        <svg viewBox="0 0 560 420" width="560" height="420" style={{ position: 'absolute', inset: 0 }} fill="none" stroke={W} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round">
          <path d="M40 80h150l40 40h290v260H40z" />
          <path d="M120 120v-30M170 120v-30M220 160v-50" strokeWidth={8} opacity={0.6} />
        </svg>
        {/* the front flap, closing */}
        <div
          style={{
            position: 'absolute',
            left: 40,
            top: 160,
            width: 480,
            height: 220,
            transformOrigin: '50% 100%',
            transform: `rotateX(${flap}deg)`,
            borderRadius: 18,
            background: G,
            border: `10px solid ${W}`,
            boxSizing: 'border-box',
          }}
        />
      </div>
      <Line text="Hand your CPA a pack." size={64} weight={600} color={W} style={rise(pack, 24)} />
    </Column>
  );
};

// ---- The spot -------------------------------------------------------------------------------
const Beat: React.FC<{ at: readonly [number, number]; children: (len: number) => React.ReactNode }> = ({ at, children }) => (
  <Sequence from={at[0]} durationInFrames={at[1] - at[0]}>
    <Fit>{children(at[1] - at[0])}</Fit>
  </Sequence>
);

export const KeptSpot: React.FC = () => (
  <Stage bg={colours.paper} ink={colours.ink}>
    <Sequence from={beats.product[0]}>
      <Fit>
        <Flood color={G} />
      </Fit>
    </Sequence>
    <Beat at={beats.bank}>{(len) => <BankApp len={len} />}</Beat>
    <Beat at={beats.bites}>{(len) => <BitesAndMelt len={len} />}</Beat>
    <Beat at={beats.april}>{(len) => <April len={len} />}</Beat>
    <Beat at={beats.product}>{(len) => <Product len={len} />}</Beat>
    <Beat at={beats.nudge}>{(len) => <Nudge len={len} />}</Beat>
    <Beat at={beats.monday}>{(len) => <Monday len={len} />}</Beat>
    <Beat at={beats.folder}>{(len) => <Folder len={len} />}</Beat>
    <Beat at={beats.tagline}>{() => <Tagline app={moneyApp} tagline={accentLast(moneyApp.tagline)} />}</Beat>
    <Beat at={beats.ending}>{() => <Ending />}</Beat>
  </Stage>
);
