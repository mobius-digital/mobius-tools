// The two characters rebuilt as SVG from the rendered PNGs in logo/*/character/,
// so they stay sharp at any size and their eyes and mouths can act.
//
// The outlines and colours are taken from the PNGs: the Cashew body is the
// rest.png alpha edge traced by scripts/trace-character.py, the colours are
// sampled from the renders (body, belly, gloss, the dark rim). Everything is
// drawn in the PNG's own 200 unit box, so a 200px PNG and a size 200 toon
// line up.
//
// A face is a handful of numbers, not a picture: how open the eyes are, which
// way they look, how far the mouth smiles and opens. Each state the PNGs show
// (rest, thinking, found, asleep, clear) is a preset of those numbers, and two
// presets blend, so the character can wake, perk up or sigh without a cut.
import React, { useId } from 'react';
import type { CharacterState } from '../../brand';

export type ToonKind = 'cashew' | 'locus';

export type Face = {
  open: number; // 1 eyes open, 0 closed to a line
  arc: number; // when closed: 1 a happy arch, -1 a sleepy curve
  wide: number; // 0 normal, 1 wide and bright (found it)
  lookX: number; // where the eyes look, in units of the 200 box
  lookY: number;
  smile: number; // -1 frown, 0 flat, 1 a full smile
  mouthOpen: number; // 0 closed line, 1 open
  round: number; // 0 a wide mouth, 1 a small round o
};

const preset: Record<ToonKind, Record<CharacterState, Face>> = {
  cashew: {
    rest: { open: 1, arc: 1, wide: 0, lookX: 0, lookY: 0, smile: 0.9, mouthOpen: 0.45, round: 0 },
    thinking: { open: 1, arc: 1, wide: 0, lookX: -3.2, lookY: -3.4, smile: 0.05, mouthOpen: 0, round: 0.35 },
    found: { open: 1, arc: 1, wide: 1, lookX: 0, lookY: 0, smile: 0.2, mouthOpen: 0.7, round: 1 },
    asleep: { open: 0, arc: -1, wide: 0, lookX: 0, lookY: 1.5, smile: 0.5, mouthOpen: 0, round: 0.3 },
    clear: { open: 0, arc: 1, wide: 0, lookX: 0, lookY: 0, smile: 1, mouthOpen: 0.5, round: 0 },
  },
  locus: {
    rest: { open: 1, arc: 1, wide: 0, lookX: 0, lookY: 0, smile: 1.25, mouthOpen: 0, round: 0 },
    thinking: { open: 1, arc: 1, wide: 0, lookX: -2.8, lookY: -3, smile: 0, mouthOpen: 0, round: 0.45 },
    found: { open: 1, arc: 1, wide: 1, lookX: 0, lookY: 0, smile: 0.2, mouthOpen: 0.75, round: 1 },
    asleep: { open: 0, arc: -1, wide: 0, lookX: 0, lookY: 1.5, smile: 0, mouthOpen: 0, round: 0.6 },
    clear: { open: 0, arc: 1, wide: 0, lookX: 0, lookY: 0, smile: 1.15, mouthOpen: 0, round: 0 },
  },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const faceOf = (kind: ToonKind, from: CharacterState, to: CharacterState = from, t = 0): Face => {
  const a = preset[kind][from];
  const b = preset[kind][to];
  const out = {} as Face;
  (Object.keys(a) as (keyof Face)[]).forEach((k) => (out[k] = lerp(a[k], b[k], t)));
  return out;
};

// Where each character's face sits in the 200 box.
const geo = {
  cashew: { eyeL: [80, 137.5], eyeR: [118, 137.5], eyeR0: 5.1, mouth: [99.5, 145], mouthW: 13, face: [100, 141, 37.5, 33.5] },
  locus: { eyeL: [81, 97], eyeR: [120, 96], eyeR0: 5.2, mouth: [100.5, 106.5], mouthW: 17, face: [100.5, 101.5, 37, 37] },
} as const;

const CASHEW_BODY =
  'M94.2 25.1C97.9 24.9 101.4 25.5 104.2 26.1C107.1 26.7 109.2 27.5 111.5 28.8C113.8 30.1 116.3 31.7 118.2 33.8C120.2 35.8 121.9 38.7 122.9 41.0C124.0 43.3 124.3 45.2 124.5 47.5C124.7 49.8 124.6 52.6 123.6 55.6C122.4 59.6 117.6 70.4 116.3 75.4C115.4 79.0 115.6 80.4 116.2 82.2C116.8 84.0 117.7 85.6 119.0 87.0C120.6 88.8 122.6 90.6 126.0 91.6C129.8 92.7 137.2 92.4 141.2 93.2C145.3 94.1 147.5 95.1 150.0 96.9C152.5 98.7 154.6 100.9 156.1 104.0C157.7 107.1 158.8 111.8 159.3 115.2C159.8 118.7 159.5 121.5 159.1 124.8C158.6 128.0 157.8 131.5 156.6 134.8C155.5 138.0 153.6 141.6 152.0 144.5C150.3 147.4 148.7 149.6 146.6 152.0C144.6 154.4 142.4 156.5 139.8 158.7C137.1 160.8 133.7 163.1 130.8 164.8C127.8 166.4 125.0 167.6 122.0 168.6C119.0 169.6 116.6 170.3 112.8 170.8C108.9 171.4 103.6 171.9 99.0 171.8C94.4 171.6 89.4 170.9 85.2 169.8C81.1 168.6 77.5 167.0 74.0 165.1C70.5 163.2 67.3 161.1 64.2 158.4C61.2 155.7 58.2 152.5 55.6 149.0C53.1 145.5 50.8 141.5 48.9 137.2C47.0 133.0 45.3 127.9 44.2 123.8C43.1 119.6 42.6 117.3 42.2 112.5C41.8 107.7 41.4 100.6 41.8 94.8C42.1 88.9 42.9 82.8 44.1 77.5C45.2 72.2 46.9 67.4 48.6 63.0C50.3 58.6 52.1 55.1 54.5 51.2C56.9 47.4 60.4 42.8 63.2 39.8C66.1 36.7 68.3 34.9 71.5 32.9C74.7 30.8 78.7 28.7 82.5 27.4C86.3 26.1 90.6 25.3 94.2 25.1Z';

// The bottom of each body in the box: squash and stretch pivot here.
const FOOT = { cashew: 172, locus: 158 } as const;

const Eyes: React.FC<{ kind: ToonKind; f: Face; blink: number }> = ({ kind, f, blink }) => {
  const g = geo[kind];
  const open = Math.max(0, f.open * (1 - blink));
  const dotOp = Math.min(1, Math.max(0, (open - 0.12) / 0.2));
  const lineOp = 1 - dotOp;
  const r = g.eyeR0 * (1 + f.wide * 0.28);
  const ink = '#141516';
  return (
    <g>
      {[g.eyeL, g.eyeR].map(([x0, y0], i) => {
        const x = x0 + f.lookX;
        const y = y0 + f.lookY;
        const arc = f.arc * 3.6;
        return (
          <g key={i}>
            {dotOp > 0 && (
              <g opacity={dotOp}>
                {f.wide > 0.05 && <ellipse cx={x} cy={y} rx={r + 1.6} ry={(r + 1.6) * Math.max(open, 0.08)} fill="#fff" opacity={0.55 * f.wide} />}
                <ellipse cx={x} cy={y} rx={r} ry={r * Math.max(open, 0.08)} fill={ink} />
                <circle cx={x - r * 0.32 + f.lookX * 0.12} cy={y - r * 0.38 * open} r={r * (0.34 + f.wide * 0.08)} fill="#fff" opacity={0.95 * Math.min(1, open * 1.3)} />
                <circle cx={x + r * 0.35} cy={y + r * 0.3 * open} r={r * 0.13} fill="#fff" opacity={0.6 * open} />
              </g>
            )}
            {lineOp > 0 && (
              <path d={`M${x - 5.2} ${y + arc * 0.25}Q${x} ${y - arc} ${x + 5.2} ${y + arc * 0.25}`} fill="none" stroke={ink} strokeWidth={1.9} strokeLinecap="round" opacity={lineOp} />
            )}
          </g>
        );
      })}
    </g>
  );
};

const Mouth: React.FC<{ kind: ToonKind; f: Face; id: string }> = ({ kind, f, id }) => {
  const g = geo[kind];
  const cx = g.mouth[0] + f.lookX * 0.7;
  const cy = g.mouth[1] + f.lookY * 0.6;
  const w = lerp(g.mouthW, 9, f.round) / 2;
  const s = f.smile;
  const lift = s * 2.6 * (1 - f.round); // the corners rise with a smile
  const top = cy - lift * 0.15 - f.round * f.mouthOpen * 3.2;
  const bottom = cy + s * 3.2 * (1 - f.round * 0.6) + f.mouthOpen * (f.round ? 8 : 7.5) * (0.5 + 0.5 * Math.max(f.round, s));
  const L = [cx - w, cy - lift];
  const R = [cx + w, cy - lift];
  const k = 0.55 + f.round * 0.45; // how round the curves are
  const upper = `M${L[0]} ${L[1]}C${cx - w * (1 - k) * 0.9} ${top} ${cx + w * (1 - k) * 0.9} ${top} ${R[0]} ${R[1]}`;
  const shape = `${upper}C${cx + w * k} ${bottom} ${cx - w * k} ${bottom} ${L[0]} ${L[1]}Z`;
  const line = `M${L[0]} ${L[1]}C${cx - w * 0.35} ${cy + s * 3.4} ${cx + w * 0.35} ${cy + s * 3.4} ${R[0]} ${R[1]}`;
  const openOp = Math.min(1, f.mouthOpen * 3);
  return (
    <g>
      {openOp > 0 && (
        <g opacity={openOp}>
          <path d={shape} fill="#3B1416" stroke="#141516" strokeWidth={1.5} strokeLinejoin="round" />
          <clipPath id={`${id}m`}>
            <path d={shape} />
          </clipPath>
          <ellipse cx={cx} cy={bottom - 0.6} rx={w * 0.55} ry={2.6} fill="#E0566A" clipPath={`url(#${id}m)`} />
        </g>
      )}
      {openOp < 1 && <path d={line} fill="none" stroke="#141516" strokeWidth={1.9} strokeLinecap="round" opacity={1 - openOp} />}
    </g>
  );
};

// The glossy body and the face disc, per character.
const CashewBody: React.FC<{ id: string; f: Face; blink: number }> = ({ id, f, blink }) => {
  const [fx, fy, frx, fry] = geo.cashew.face;
  return (
    <>
      <defs>
        <radialGradient id={`${id}b`} cx="0.36" cy="0.3" r="0.82">
          <stop offset="0" stopColor="#52B47A" />
          <stop offset="0.32" stopColor="#2E9157" />
          <stop offset="0.7" stopColor="#1E7A45" />
          <stop offset="1" stopColor="#156637" />
        </radialGradient>
        <radialGradient id={`${id}s`} cx="0.78" cy="0.9" r="0.6">
          <stop offset="0" stopColor="#0B3F21" stopOpacity="0.3" />
          <stop offset="1" stopColor="#0B3F21" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}f`} cx="0.42" cy="0.22" r="0.85">
          <stop offset="0" stopColor="#CDEFCB" />
          <stop offset="0.45" stopColor="#A6D0A4" />
          <stop offset="1" stopColor="#7FAD83" />
        </radialGradient>
        <clipPath id={`${id}c`}>
          <path d={CASHEW_BODY} />
        </clipPath>
        <filter id={`${id}g`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <filter id={`${id}g2`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      <path d={CASHEW_BODY} fill={`url(#${id}b)`} />
      <g clipPath={`url(#${id}c)`}>
        <path d={CASHEW_BODY} fill={`url(#${id}s)`} />
        {/* the rim light along the left edge, the soft sheen on the top lobe */}
        <ellipse cx={56} cy={92} rx={5} ry={26} fill="#B9EBC9" opacity={0.42} filter={`url(#${id}g2)`} transform="rotate(12 56 92)" />
        <ellipse cx={82} cy={52} rx={22} ry={13} fill="#7FD3A0" opacity={0.28} filter={`url(#${id}g2)`} transform="rotate(-28 82 52)" />
        {/* the face, a pale disc set into the belly */}
        <ellipse cx={fx + f.lookX * 0.35} cy={fy + 1.6} rx={frx + 1} ry={fry + 1} fill="#0C4A27" opacity={0.35} filter={`url(#${id}g)`} />
        <ellipse cx={fx + f.lookX * 0.35} cy={fy + f.lookY * 0.2} rx={frx} ry={fry} fill={`url(#${id}f)`} />
        <ellipse cx={fx - 8 + f.lookX * 0.35} cy={fy - 17} rx={17} ry={8} fill="#E6FAE4" opacity={0.45} filter={`url(#${id}g2)`} />
      </g>
      {/* the hard specular highlights */}
      <ellipse cx={111} cy={36.5} rx={5.4} ry={3.2} fill="#fff" opacity={0.9} filter={`url(#${id}g)`} transform="rotate(32 111 36.5)" />
      <ellipse cx={103.5} cy={88} rx={4.6} ry={2.6} fill="#fff" opacity={0.75} filter={`url(#${id}g)`} transform="rotate(30 103.5 88)" />
      <ellipse cx={144} cy={105} rx={4} ry={2.6} fill="#fff" opacity={0.8} filter={`url(#${id}g)`} transform="rotate(38 144 105)" />
      <ellipse cx={53} cy={78} rx={2} ry={9} fill="#fff" opacity={0.45} filter={`url(#${id}g)`} transform="rotate(16 53 78)" />
      <Eyes kind="cashew" f={f} blink={blink} />
      <Mouth kind="cashew" f={f} id={id} />
    </>
  );
};

const LOCUS_RING = { cx: 100, cy: 106, rx: 77, ry: 16.5, rot: -8 };

const LocusBody: React.FC<{ id: string; f: Face; blink: number; spin: number }> = ({ id, f, blink, spin }) => {
  const [fx, fy, fr] = geo.locus.face;
  const R = LOCUS_RING;
  const ring = (front: boolean) => (
    <g transform={`translate(${R.cx} ${R.cy}) rotate(${R.rot})`}>
      <g clipPath={`url(#${id}${front ? 'rf' : 'rb'})`}>
        <ellipse cx={0} cy={0} rx={R.rx} ry={R.ry} fill="none" stroke="#9B9A95" strokeWidth={5.2} />
        <ellipse cx={0} cy={-0.8} rx={R.rx} ry={R.ry} fill="none" stroke={`url(#${id}r)`} strokeWidth={4} />
      </g>
      {/* a bead travelling the orbit */}
      {(() => {
        const a = spin * Math.PI * 2;
        const x = Math.cos(a) * R.rx;
        const y = Math.sin(a) * R.ry;
        const inFront = Math.sin(a) > 0;
        if (inFront !== front || spin < 0) return null;
        return <circle cx={x} cy={y} r={3.6} fill="#FFFFFF" stroke="#C9C7C0" strokeWidth={0.8} />;
      })()}
    </g>
  );
  return (
    <>
      <defs>
        <radialGradient id={`${id}b`} cx="0.36" cy="0.28" r="0.78">
          <stop offset="0" stopColor="#77A8F7" />
          <stop offset="0.35" stopColor="#3F7DE2" />
          <stop offset="0.75" stopColor="#2459C6" />
          <stop offset="1" stopColor="#173E9C" />
        </radialGradient>
        <radialGradient id={`${id}f`} cx="0.42" cy="0.26" r="0.8">
          <stop offset="0" stopColor="#C6DEFE" />
          <stop offset="0.5" stopColor="#9EC4FA" />
          <stop offset="1" stopColor="#7FA6E6" />
        </radialGradient>
        <linearGradient id={`${id}r`} x1="0" y1="-1" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E4E2DC" />
        </linearGradient>
        <clipPath id={`${id}rf`}>
          <rect x={-100} y={0} width={200} height={40} />
        </clipPath>
        <clipPath id={`${id}rb`}>
          <rect x={-100} y={-40} width={200} height={40} />
        </clipPath>
        <clipPath id={`${id}c`}>
          <circle cx={100} cy={97} r={61} />
        </clipPath>
        <filter id={`${id}g`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <filter id={`${id}g2`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {ring(false)}
      <circle cx={100} cy={97} r={61} fill={`url(#${id}b)`} />
      <g clipPath={`url(#${id}c)`}>
        <ellipse cx={58} cy={92} rx={5} ry={24} fill="#BFD6FF" opacity={0.4} filter={`url(#${id}g2)`} transform="rotate(10 58 92)" />
        {/* the face, set into a bezel */}
        <circle cx={fx + f.lookX * 0.4} cy={fy + 1} r={fr + 4} fill="#2A5FC8" />
        <circle cx={fx + f.lookX * 0.4} cy={fy + 2.4} r={fr + 0.6} fill="#163F93" opacity={0.45} filter={`url(#${id}g)`} />
        <circle cx={fx + f.lookX * 0.4} cy={fy + f.lookY * 0.2} r={fr} fill={`url(#${id}f)`} />
        <ellipse cx={fx - 7 + f.lookX * 0.4} cy={fy - 20} rx={17} ry={8} fill="#EEF5FF" opacity={0.5} filter={`url(#${id}g2)`} />
      </g>
      <ellipse cx={128} cy={55} rx={9} ry={4.5} fill="#fff" opacity={0.85} filter={`url(#${id}g)`} transform="rotate(38 128 55)" />
      <ellipse cx={54} cy={80} rx={2.2} ry={8} fill="#fff" opacity={0.5} filter={`url(#${id}g)`} transform="rotate(18 54 80)" />
      <Eyes kind="locus" f={f} blink={blink} />
      <Mouth kind="locus" f={f} id={id} />
      {ring(true)}
    </>
  );
};

export type ToonProps = {
  kind: ToonKind;
  size?: number;
  from?: CharacterState;
  to?: CharacterState;
  t?: number; // 0 shows `from`, 1 shows `to`
  face?: Partial<Face>; // overrides on top of the blend
  blink?: number; // 0 open, 1 shut
  squash?: number; // positive flattens (a landing, a sigh), negative stretches (a hop)
  tilt?: number; // degrees, about the feet
  lift?: number; // units off the ground; the shadow shrinks as it rises
  shadow?: boolean;
  spin?: number; // Locus: where the bead is on its orbit, 0 to 1; negative hides it
  style?: React.CSSProperties;
};

export const Toon: React.FC<ToonProps> = ({
  kind,
  size = 300,
  from = 'rest',
  to,
  t = 0,
  face,
  blink = 0,
  squash = 0,
  tilt = 0,
  lift = 0,
  shadow = true,
  spin = -1,
  style,
}) => {
  const raw = useId();
  const id = `t${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const f = { ...faceOf(kind, from, to ?? from, t), ...face };
  const foot = FOOT[kind];
  // Squash keeps the volume: flatter is wider.
  const sy = 1 - squash * 0.22;
  const sx = 1 + squash * 0.16;
  const shadowK = Math.max(0.35, 1 - lift / 90);
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} style={{ display: 'block', overflow: 'visible', flex: 'none', ...style }}>
      {shadow && (
        <>
          <defs>
            <filter id={`${id}sh`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          <ellipse cx={100} cy={foot + 4} rx={52 * sx * shadowK} ry={7.5 * shadowK} fill="#000" opacity={0.26 * shadowK} filter={`url(#${id}sh)`} />
        </>
      )}
      <g transform={`translate(100 ${foot - lift}) rotate(${tilt}) scale(${sx} ${sy}) translate(-100 ${-foot})`}>
        {kind === 'cashew' ? <CashewBody id={id} f={f} blink={blink} /> : <LocusBody id={id} f={f} blink={blink} spin={spin} />}
      </g>
    </svg>
  );
};
