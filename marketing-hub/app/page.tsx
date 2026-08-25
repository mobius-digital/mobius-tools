import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { brandsFor, isAdmin } from "@/lib/brandContext";
import { googleClientId } from "@/lib/signin";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";
import { GoogleSignIn } from "@/components/GoogleSignIn";

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
  const identity = await readIdentityToken(
    (await cookies()).get(IDENTITY_COOKIE)?.value,
  );

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
                <span className="door__swatch" style={{ background: brand.accent }} />
                <span className="door__name">{brand.name}</span>
              </a>
            ))}
            {admin && (
              <a className="door__card door__card--admin" href="/admin">
                <span className="door__swatch door__swatch--admin" />
                <span className="door__name">All clients</span>
              </a>
            )}
          </div>
        </main>
      </div>
    );
  }

  const clientId = await googleClientId();

  return (
    <div className="door">
      <main className="door__panel">
        <h1 className="door__title">Marketing Calendar</h1>
        <p className="door__sub">
          What&apos;s going live, when — and which channels need to care.
        </p>
        {clientId ? (
          <GoogleSignIn clientId={clientId} from="/" />
        ) : (
          <p className="door__note">Sign-in is not configured yet.</p>
        )}
        <p className="door__note">
          Does your team use a shared password? Open your board&apos;s own link
          — the one you were sent — and sign in there.
        </p>
      </main>
    </div>
  );
}
