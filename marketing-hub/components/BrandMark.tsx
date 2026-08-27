import { DEFAULT_MARK_SVG } from "@/lib/defaultMark";

/**
 * A brand's mark on its own accent tile, for the hub's own screens.
 *
 * The board paints its logo through a CSS mask so one file works on any
 * theme; here we are showing several brands side by side, so each gets its
 * color as a solid tile with the mark knocked out. That is what makes a set
 * of clients scannable — you find one by color before you read the name.
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
  /*
   * A raster cannot be knocked out of the tile, so it sits on one — but not on
   * the accent. Most logo files are drawn for a white page and carry a white
   * background with them, and a white rectangle floating inside a gold square
   * looks like a mistake. A plain surface tile with a hairline lets those files
   * sit flush, and the accent still leads the card everywhere else.
   */
  if (logoSvg?.startsWith("data:image/")) {
    return (
      <span
        className="brandmark brandmark--raster"
        style={{ width: size, height: size }}
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
