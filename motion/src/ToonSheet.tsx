// A check, not a spot: each character state as the rendered PNG beside the
// SVG rebuild, at the PNG's own size and at 2x. Render a still of
// ToonSheet to compare after changing src/marks/Toon.tsx.
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import type { CharacterState } from '../brand';
import { Toon, type ToonKind } from './marks/Toon';

const pngs = require.context('../../logo', true, /\/character\/(rest|thinking|found|asleep|clear)\.png$/);
const png = (f: string) => {
  const m = pngs(`./${f}`) as string | { default: string };
  return typeof m === 'string' ? m : m.default;
};
const states: CharacterState[] = ['rest', 'thinking', 'found', 'asleep', 'clear'];

export const ToonSheet: React.FC = () => (
  <AbsoluteFill style={{ background: '#E9E8E3', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
    {(['cashew', 'locus'] as ToonKind[]).map((k) => (
      <React.Fragment key={k}>
        <div style={{ display: 'flex', gap: 10 }}>
          {states.map((s) => <Img key={s} src={png(`${k}/character/${s}.png`)} style={{ width: 200, height: 200 }} />)}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {states.map((s) => <Toon key={s} kind={k} from={s} size={200} shadow={false} />)}
        </div>
      </React.Fragment>
    ))}
    <div style={{ display: 'flex', gap: 30, alignItems: 'flex-end' }}>
      <Toon kind="cashew" size={420} />
      <Toon kind="locus" size={420} from="found" spin={0.2} />
      <Toon kind="cashew" size={300} from="rest" squash={0.6} />
    </div>
  </AbsoluteFill>
);
