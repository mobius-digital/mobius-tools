import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { brandsFor, isAdmin } from "@/lib/brandContext";
import { googleClientId } from "@/lib/signin";
import { safeEqual, sessionTokenForBrand } from "@/lib/auth";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { BrandMark } from "@/components/BrandMark";
import { GateScene } from "@/components/GateScene";
import { DEFAULT_CHANNELS, DEFAULT_EVENT_TYPES } from "@/lib/types";
import { hub } from "@/hub.config";

export const dynamic = "force-dynamic";

/**
 * The hub's front door — one link for everybody.
 *
 * Signed in with Google and on one brand: straight to that board, no
 * stopping. On several: a picker. An agency admin also gets the Clients
 * screen. Not signed in: the Google button — and a note for people whose
 * team uses a shared password, whose way in is their brand's own link.
 */
export default async function FrontDoor() {
  const jar = await cookies();
  const identity = await readIdentityToken(jar.get(IDENTITY_COOKIE)?.value);

  if (identity) {
    const [brands, admin] = await Promise.all([
      brandsFor(identity.email),
      isAdmin(identity.email),
    ]);

    if (brands.length === 1 && !admin) redirect(`/b/${brands[0].slug}/`);

    return (
      <div className="door">
        <main className="door__panel door__panel--wide">
          <h1 className="door__title">Where to?</h1>
          <p className="door__sub">Signed in as {identity.name}</p>
          <div className="door__grid">
            {brands.map((brand) => (
              <a key={brand.slug} className="door__card" href={`/b/${brand.slug}/`}>
                <BrandMark accent={brand.accent} logoSvg={brand.logoSvg} size={36} />
                <span className="door__name">{brand.name}</span>
              </a>
            ))}
            {admin && (
              <a className="door__card door__card--admin" href="/admin">
                <span className="door__swatch door__swatch--admin" aria-hidden />
                <span className="door__name">All clients</span>
              </a>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Nobody signed in with Google. One redirect is still right: somebody with
  // a brand's team-password session already open is plainly working on that
  // brand, so send them back to it.
  //
  // Deliberately NOT redirecting when the hub happens to hold a single brand.
  // This address is the product's, not any client's — a stranger opening it
  // should meet the sign-in screen, and the behaviour must not change under
  // everybody the day a second client is added.
  for (const cookie of jar.getAll()) {
    if (!cookie.name.startsWith("lc_s_")) continue;
    const slug = cookie.name.slice("lc_s_".length);
    const expected = await sessionTokenForBrand(slug);
    if (expected && safeEqual(cookie.value, expected)) redirect(`/b/${slug}/`);
  }

  const clientId = await googleClientId();

  // The same split as a brand's own sign-in screen — the product in miniature
  // on the left, the door on the right. This one wears the hub's name and the
  // built-in channels and types, because no brand has been chosen yet.
  return (
    <div className="gate">
      <GateScene
        channels={DEFAULT_CHANNELS}
        eventTypes={DEFAULT_EVENT_TYPES}
        productName={hub.name}
      />

      <section className="gate__panel">
        <div className="gate__card">
          <div className="gate__brand">
            <span className="gate__logo gate__logo--hub" aria-hidden />
            <span className="gate__brandname">{hub.name}</span>
          </div>
          {/* A brand's card reads "<their name> / Lineup". Here the name
              above is already Lineup, so this says what Lineup is. */}
          <h1 className="gate__title">Marketing calendars</h1>

          {clientId ? (
            <>
              <p className="gate__subtitle">
                Sign in with the Google account you were invited with.
              </p>
              <GoogleSignIn clientId={clientId} from="/" />
            </>
          ) : (
            <p className="gate__subtitle">Sign-in is not configured yet.</p>
          )}
        </div>

        <p className="gate__fine">
          Signs you in to every brand you work on. If your team uses a shared
          password, open your own board&apos;s link instead.
        </p>
      </section>
    </div>
  );
}
