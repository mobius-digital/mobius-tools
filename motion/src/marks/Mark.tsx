// The logos and the characters, loaded from the brand kit in logo/.
//
// A logo is an SVG loaded as a React component (SVGR, see remotion.config.ts),
// drawn in currentColor. A character is a folder of rendered PNG states, or a
// vector mark with its four drawn states; which one each app uses is in
// brand.ts, so a swap there needs no change here.
import React from 'react';
import { Img, useCurrentFrame } from 'remotion';
import type { App, CharacterState } from '../../brand';
import { Toon, type ToonProps } from './Toon';

type SvgModule = { default: React.FC<React.SVGProps<SVGSVGElement>> };

// Every top-level SVG in logo/locus, logo/kept and logo/cashew (not the icons
// or the round folders), and every character PNG.
const svgs = require.context('../../../logo', true, /^\.\/(locus|kept|cashew)\/[^/]+\.svg$/);
const pngs = require.context('../../../logo', true, /\/character\/(rest|thinking|found|asleep|clear)\.png$/);

export const svg = (file: string) => (svgs(`./${file}`) as SvgModule).default;
const png = (file: string) => {
  const m = pngs(`./${file}`) as string | { default: string };
  return typeof m === 'string' ? m : m.default;
};

// The logo, sized by height so a wordmark keeps its width.
export const Logo: React.FC<{ app: App; height: number; color?: string; style?: React.CSSProperties }> = ({
  app,
  height,
  color = 'currentColor',
  style,
}) => {
  const Svg = svg(app.logo.file);
  return (
    <div style={{ height, color, flex: 'none', display: 'flex', alignItems: 'center', ...style }}>
      <Svg style={{ height: '100%', width: 'auto', display: 'block' }} />
    </div>
  );
};

// The logo with the name: a wordmark alone, or a mark with the name in type.
export const LogoLockup: React.FC<{ app: App; height: number; color?: string; style?: React.CSSProperties }> = ({
  app,
  height,
  color = 'currentColor',
  style,
}) => {
  if (app.logo.kind === 'wordmark') return <Logo app={app} height={height} color={color} style={style} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: height * 0.25, color, ...style }}>
      <Logo app={app} height={height * 1.3} color={color} />
      <div style={{ fontSize: height, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>{app.name}.</div>
    </div>
  );
};

const vectorFile = (base: string, state: CharacterState) => (state === 'rest' ? `${base}.svg` : `${base}-${state}.svg`);

// One state of the character, in a square box.
export const Character: React.FC<{
  app: App;
  state?: CharacterState;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ app, state = 'rest', size = 300, color = 'currentColor', style }) => {
  const box: React.CSSProperties = { width: size, height: size, flex: 'none', color, ...style };
  if (app.character.kind === 'toon') return <Toon kind={app.character.toon} from={state} size={size} style={style} />;
  if (app.character.kind === 'image') {
    return (
      <div style={box}>
        <Img src={png(`${app.character.dir}/${state}.png`)} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }} />
      </div>
    );
  }
  const Svg = svg(vectorFile(app.character.base, state));
  return (
    <div style={box}>
      <Svg width="100%" height="100%" style={{ display: 'block' }} />
    </div>
  );
};

// Two states layered, `t` 0 shows `from`, 1 shows `to`, so the character can
// wake, perk up or sigh without a cut.
export const CharacterBlend: React.FC<{
  app: App;
  from: CharacterState;
  to: CharacterState;
  t: number;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ app, from, to, t, size = 300, color = 'currentColor', style }) => app.character.kind === 'toon' ? (
  <Toon kind={app.character.toon} from={from} to={to} t={t} size={size} style={style} />
) : (
  <div style={{ width: size, height: size, position: 'relative', flex: 'none', ...style }}>
    <Character app={app} state={from} size={size} color={color} style={{ position: 'absolute', inset: 0, opacity: 1 - t }} />
    <Character app={app} state={to} size={size} color={color} style={{ position: 'absolute', inset: 0, opacity: t }} />
  </div>
);

// The character acting: the SVG toon with its face, squash, tilt and lift; or,
// with the PNG fallback, the two states blended with the body squashed and a
// soft drop shadow so a large PNG reads as depth.
// Unless `idle` is false it is never a sticker: it breathes and blinks on its own.
export const Act: React.FC<{ app: App; idle?: boolean; seed?: number } & Omit<ToonProps, 'kind'>> = ({ app, idle = true, seed = 0, ...q }) => {
  const frame = useCurrentFrame();
  const breathe = idle ? Math.sin(((frame + seed * 17) / 30) * Math.PI * 2 * 0.5) * 0.045 : 0;
  const ph = (frame + seed * 31) % 83;
  const blinkIdle = idle && ph < 7 ? Math.sin((ph / 7) * Math.PI) : 0;
  const p = { ...q, squash: (q.squash ?? 0) + breathe, blink: Math.max(q.blink ?? 0, blinkIdle) };
  if (app.character.kind === 'toon') return <Toon kind={app.character.toon} {...p} />;
  const size = p.size ?? 300;
  const sq = p.squash ?? 0;
  return (
    <div style={{ width: size, height: size, transform: `translateY(${-(p.lift ?? 0) * (size / 200)}px) rotate(${p.tilt ?? 0}deg) scale(${1 + sq * 0.16}, ${1 - sq * 0.22})`, transformOrigin: '50% 86%', filter: 'drop-shadow(0 18px 22px rgba(0,0,0,.22))', ...p.style }}>
      <CharacterBlend app={app} from={p.from ?? 'rest'} to={p.to ?? p.from ?? 'rest'} t={p.t ?? 0} size={size} />
    </div>
  );
};
