// "Kept. Know what you kept." and "Locus. Know what to change." The name
// first with its mark, then the tagline with the accent word.
import React from 'react';
import { colours } from '../../brand';
import { Column, Line } from '../lib/stage';
import { feel, rise, useSpring } from '../lib/motion';
import { Mark } from '../marks/Mark';

export const Tagline: React.FC<{ product: 'locus' | 'money'; name: string; tagline: string }> = ({
  product,
  name,
  tagline,
}) => {
  const s = useSpring();
  const m = s(0, feel.pop);
  const n = s(6, feel.settle);
  const t = s(30, feel.settle);
  return (
    <Column gap={44}>
      <Mark product={product} state="clear" size={300} color={colours.onField} style={{ transform: `scale(${m})`, opacity: m }} />
      <Line text={`${name}.`} size={150} weight={700} color={colours.onField} style={rise(n, 40)} />
      <Line text={tagline} size={68} weight={500} color={colours.onField} style={rise(t, 30)} />
    </Column>
  );
};
