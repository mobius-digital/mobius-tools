// The last beat of both spots: the two characters side by side above the two
// logos on the field, then the line. The field colour is the spot's own.
import React from 'react';
import { closingLine, colours, locus, money } from '../../brand';
import { Line, Column } from '../lib/stage';
import { feel, rise, useSpring } from '../lib/motion';
import { Character, LogoLockup } from '../marks/Mark';

export const Ending: React.FC = () => {
  const s = useSpring();
  const a = s(0, feel.pop);
  const b = s(8, feel.pop);
  const la = s(18, feel.settle);
  const lb = s(24, feel.settle);
  const l = s(36, feel.settle);
  return (
    <Column gap={56}>
      <div style={{ display: 'flex', gap: 90, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
          <Character app={locus} state="clear" size={300} style={{ transform: `scale(${a})`, opacity: a }} />
          <LogoLockup app={locus} height={64} color={colours.onField} style={rise(la, 20)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
          <Character app={money} state="clear" size={300} style={{ transform: `scale(${b})`, opacity: b }} />
          <LogoLockup app={money} height={64} color={colours.onField} style={rise(lb, 20)} />
        </div>
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
