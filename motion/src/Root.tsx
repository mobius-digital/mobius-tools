// Four compositions: each spot in both formats. Durations live with the spots.
import React from 'react';
import { Composition } from 'remotion';
import { formats, fps } from '../brand';
import { KeptSpot, keptDuration } from './kept/KeptSpot';
import { LocusSpot, locusDuration } from './locus/LocusSpot';

export const Root: React.FC = () => (
  <>
    <Composition id="KeptVertical" component={KeptSpot} durationInFrames={keptDuration} fps={fps} {...formats.vertical} />
    <Composition id="KeptLandscape" component={KeptSpot} durationInFrames={keptDuration} fps={fps} {...formats.landscape} />
    <Composition id="LocusVertical" component={LocusSpot} durationInFrames={locusDuration} fps={fps} {...formats.vertical} />
    <Composition id="LocusLandscape" component={LocusSpot} durationInFrames={locusDuration} fps={fps} {...formats.landscape} />
  </>
);
