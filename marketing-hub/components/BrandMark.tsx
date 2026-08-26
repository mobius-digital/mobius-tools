import { DEFAULT_MARK_SVG } from "@/lib/defaultMark";

/**
 * A brand's mark on its own accent tile, for the hub's own screens.
 *
 * The board paints its logo through a CSS mask so one file works on any
 * theme; here we are showing several brands side by side, so each gets its
 * colour as a solid tile with the mark knocked out. That is what makes a set
 * of clients scannable — you find one by colour before you read the name.
 */
export function BrandMark({
  accent,
  logoSvg,
  size = 40,
}: {
  accent: string;
  logoSvg?: string | null;
  size?: number;
}) {
  // A raster logo cannot be knocked out of the tile, so it sits on it instead.
  if (logoSvg?.startsWith("data:image/")) {
    return (
      <span
        className="brandmark brandmark--raster"
        style={{ background: accent, width: size, height: size }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSvg} alt="" />
      </span>
    );
  }

  const svg = (logoSvg ?? DEFAULT_MARK_SVG).replace(/currentColor/g, "#fff");

  return (
    <span
      className="brandmark"
      style={{ background: accent, width: size, height: size }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
