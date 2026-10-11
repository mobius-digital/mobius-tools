// SVG files are React components here (see remotion.config.ts, SVGR).
declare module '*.svg' {
  import type { FC, SVGProps } from 'react';
  const Component: FC<SVGProps<SVGSVGElement>>;
  export default Component;
}
