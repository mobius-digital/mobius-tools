// The last beat of both spots: the two marks side by side on the field,
// then the line. The field colour is the spot's own.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { closingLine, colours, money } from '../../brand';
import { Line, Column } from '../lib/stage';
import { feel, rise, useSpring } from '../lib/motion';
import { Mark } from '../marks/Mark';

export const Ending: React.FC = () => {
  const s = useSpring();
  useCurrentFrame();
  const a = s(0, feel.pop);
  const b = s(8, feel.pop);
  const l = s(26, feel.settle);
  return (
    <Column gap={64}>
      <div style={{ display: 'flex', gap: 110, alignItems: 'center' }}>
        <Mark product="locus" size={300} color={colours.onField} style={{ transform: `scale(${a})`, opacity: a }} />
        <Mark product="money" size={300} color={colours.onField} style={{ transform: `scale(${b})`, opacity: b }} />
      </div>
      <Line
        text={closingLine.replace('{money}', money.name)}
        size={56}
        weight={600}
        color={colours.onField}
        style={{ ...rise(l, 30), maxWidth: 900 }}
      />
    </Column>
  );
};
