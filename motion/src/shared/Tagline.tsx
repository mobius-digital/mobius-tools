// "Cashew. Know what you kept." and "Locus. Know what to change." The
// character nods (all clear) above the logo, then the tagline with its accent.
import React from 'react';
import type { App } from '../../brand';
import { colours } from '../../brand';
import { Column, Line } from '../lib/stage';
import { feel, rise, useBump, useSpring } from '../lib/motion';
import { Character, LogoLockup } from '../marks/Mark';

export const Tagline: React.FC<{ app: App; tagline: string }> = ({ app, tagline }) => {
  const s = useSpring();
  const bump = useBump();
  const c = s(0, feel.pop);
  const nod = bump(20, 6, feel.settle);
  const n = s(8, feel.settle);
  const t = s(32, feel.settle);
  return (
    <Column gap={44}>
      <Character app={app} state="clear" size={340} style={{ transform: `scale(${c}) translateY(${nod * 18}px)`, opacity: c }} />
      <LogoLockup app={app} height={app.logo.kind === 'wordmark' ? 150 : 120} color={colours.onField} style={rise(n, 40)} />
      <Line text={tagline} size={68} weight={500} color={colours.onField} style={rise(t, 30)} />
    </Column>
  );
};
