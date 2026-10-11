// Remotion settings for this machine and this repo.
// Docs: https://www.remotion.dev/docs/config
import { Config } from '@remotion/cli/config';

// The cloud machine has Chromium at /opt/pw-browsers (Playwright's copy).
// Point Remotion at it so it never downloads a second browser. On another
// machine, set REMOTION_BROWSER to your Chrome, or delete this line and let
// Remotion fetch its own.
Config.setBrowserExecutable(process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell');

// Small files: CRF 28 keeps a 46 second 1080x1920 spot under 10 MB.
Config.setCrf(28);
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// Headless Linux with no GPU: the software ANGLE renderer is the one that works.
Config.setChromiumOpenGlRenderer('angle');

// The marks and the bite characters are SVG files loaded as React components
// (currentColor carries the brand colour). Remotion's default rule copies .svg
// as a file URL, so take svg out of that rule and hand it to SVGR.
Config.overrideWebpackConfig((current) => {
  const rules = (current.module?.rules ?? []).map((rule) => {
    if (rule && typeof rule === 'object' && 'test' in rule && rule.test instanceof RegExp && rule.test.test('.svg')) {
      return { ...rule, exclude: /\.svg$/ };
    }
    return rule;
  });
  return {
    ...current,
    module: {
      ...current.module,
      rules: [
        ...rules,
        {
          test: /\.svg$/,
          use: [{ loader: '@svgr/webpack', options: { titleProp: false, svgo: false } }],
        },
      ],
    },
  };
});
