// Four compositions: each spot in both formats. Durations come from the
// voiced lines (src/lib/timeline.ts), so they live with the spots.
import React from 'react';
import { Composition } from 'remotion';
import { formats, fps } from '../brand';
import { CashewSpot, cashewDuration } from './cashew/CashewSpot';
import { LocusSpot, locusDuration } from './locus/LocusSpot';

export const Root: React.FC = () => (
  <>
    <Composition id="CashewVertical" component={CashewSpot} durationInFrames={cashewDuration} fps={fps} {...formats.vertical} />
    <Composition id="CashewLandscape" component={CashewSpot} durationInFrames={cashewDuration} fps={fps} {...formats.landscape} />
    <Composition id="LocusVertical" component={LocusSpot} durationInFrames={locusDuration} fps={fps} {...formats.vertical} />
    <Composition id="LocusLandscape" component={LocusSpot} durationInFrames={locusDuration} fps={fps} {...formats.landscape} />
  </>
);
