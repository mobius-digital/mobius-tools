// The product marks and the helper's four states, loaded from the brand kit's
// SVGs in logo/ as React components (SVGR, see remotion.config.ts). Which
// direction each product uses is one number in brand.ts.
import React from 'react';
import { marks, type MarkState } from '../../brand';

type Product = keyof typeof marks;
type SvgModule = { default: React.FC<React.SVGProps<SVGSVGElement>> };

// Every direction file in logo/locus and logo/kept, so a change of direction
// in brand.ts needs no change here.
const files = require.context('../../../logo', true, /\/direction-\d(-(asleep|thinking|found|clear))?\.svg$/);

export const markFile = (product: Product, state: MarkState = 'mark') => {
  const m = marks[product];
  const base = (m.paths as Record<number, string>)[m.direction];
  return `./${base}${state === 'mark' ? '' : `-${state}`}.svg`;
};

export const MarkSvg = (product: Product, state: MarkState = 'mark') =>
  (files(markFile(product, state)) as SvgModule).default;

export const Mark: React.FC<{
  product: Product;
  state?: MarkState;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ product, state = 'mark', size = 200, color = 'currentColor', style }) => {
  const Svg = MarkSvg(product, state);
  return (
    <div style={{ width: size, height: size, color, flex: 'none', ...style }}>
      <Svg width="100%" height="100%" style={{ display: 'block' }} />
    </div>
  );
};

// Two states layered, so the helper can wake or sigh: `t` 0 shows `from`,
// 1 shows `to`. The drawings are the same mark, so a crossfade reads as the
// face changing, not as a cut.
export const MarkBlend: React.FC<{
  product: Product;
  from: MarkState;
  to: MarkState;
  t: number;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ product, from, to, t, size = 200, color = 'currentColor', style }) => {
  const A = MarkSvg(product, from);
  const B = MarkSvg(product, to);
  return (
    <div style={{ width: size, height: size, color, position: 'relative', flex: 'none', ...style }}>
      <A width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 1 - t }} />
      <B width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: t }} />
    </div>
  );
};
