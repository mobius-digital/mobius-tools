import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { brandsFor, isAdmin } from "@/lib/brandContext";
import { googleClientId } from "@/lib/signin";
import { safeEqual, sessionTokenForBrand } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatLong, todayIso } from "@/lib/dates";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { BrandMark } from "@/components/BrandMark";

export const dynamic = "force-dynamic";

/**
 * The hub's front door — one link for everybody.
 *
 * Signed in with access to exactly one brand: straight through, no stopping.
 * With several: this picker. It deliberately shows each brand's *next* launch
 * rather than a bare list of doors, so somebody who runs four brands can see
 * where the pressure is before choosing one. Not signed in: the Google button.
 */

/** "Thu Aug 27", or "today"/"tomorrow" where that reads better. */
function whenLabel(date: string): string {
  const today = todayIso();
  if (date === today) return "today";

  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  if (date === tomorrow) return "tomorrow";

  return formatLong(date);
}

export default async function FrontDoor() {
  const jar = await cookies();
  const identity = await readIdentityToken(jar.get(IDENTITY_COOKIE)?.value);

  if (identity) {
    const [brands, admin] = await Promise.all([
      brandsFor(identity.email),
      isAdmin(identity.email),
    ]);

    if (brands.length === 1 && !admin) redirect(`/b/${brands[0].slug}/`);

    const firstName = identity.name.trim().split(/\s+/)[0];

    return (
      <div className="picker">
        <main className="picker__inner">
          <header className="picker__head">
            <h1 className="picker__title">Which brand, {firstName}?</h1>
            <p className="picker__sub">
              {brands.length} {brands.length === 1 ? "calendar" : "calendars"} you can
              open.
            </p>
          </header>

          <ul className="picker__list">
            {brands.map((brand, index) => (
              <li key={brand.slug} style={{ ["--i" as string]: index }}>
                <a className="picker__brand" href={`/b/${brand.slug}/`}>
                  <BrandMark accent={brand.accent} logoSvg={brand.logoSvg} size={44} />
                  <span className="picker__text">
                    <span className="picker__name">{brand.name}</span>
                    <span className="picker__next">
                      {brand.next ? (
                        <>
                          Next: {brand.next.name}{" "}
                          <span className="picker__when">{whenLabel(brand.next.date)}</span>
                        </>
                      ) : (
                        "Nothing scheduled"
                      )}
                    </span>
                  </span>
                  <span className="picker__go" aria-hidden>
                    →
                  </span>
                </a>
              </li>
            ))}
          </ul>

          {admin && (
            <a className="picker__admin" href="/admin">
              Manage clients
              <span aria-hidden> →</span>
            </a>
          )}
        </main>
      </div>
    );
  }

  // Nobody signed in with Google. Two ways to still land somewhere useful
  // rather than on a picker: a team-password session already open for a
  // brand, or a hub that only has one brand to go to.
  for (const cookie of jar.getAll()) {
    if (!cookie.name.startsWith("lc_s_")) continue;
    const slug = cookie.name.slice("lc_s_".length);
    const expected = await sessionTokenForBrand(slug);
    if (expected && safeEqual(cookie.value, expected)) redirect(`/b/${slug}/`);
  }

  const { results: all } = await getDb()
    .prepare(`SELECT id FROM brands ORDER BY created_at ASC LIMIT 2`)
    .all<{ id: string }>();
  if ((all ?? []).length === 1) redirect(`/b/${all![0].id}/`);

  const clientId = await googleClientId();

  return (
    <div className="picker">
      <main className="picker__inner picker__inner--narrow">
        <header className="picker__head">
          <h1 className="picker__title">Marketing Calendar</h1>
          <p className="picker__sub">
            What&apos;s going live, when — and which channels need to care.
          </p>
        </header>

        {clientId ? (
          <GoogleSignIn clientId={clientId} from="/" />
        ) : (
          <p className="picker__note">Sign-in is not configured yet.</p>
        )}

        <p className="picker__note">
          If your team signs in with a shared password, open your own board&apos;s
          link — the one you were sent.
        </p>
      </main>
    </div>
  );
}
