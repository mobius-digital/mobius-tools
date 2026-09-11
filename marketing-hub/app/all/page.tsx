import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { brandsFor, isAdmin } from "@/lib/brandContext";
import { IDENTITY_COOKIE, readIdentityToken } from "@/lib/session";
import { listEventsAcross } from "@/lib/allBrands";
import { todayIso } from "@/lib/dates";
import { hub } from "@/hub.config";
import { AllCalendar } from "@/components/AllCalendar";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${hub.name} · All brands`,
};

/**
 * The agency view: every board this person can open, on one calendar.
 *
 * Read-only on purpose. Editing happens on the brand's own board, where its
 * stages, channels and Slack mapping live; a chip here opens the launch
 * there. Chips are colored by brand rather than by stage, because across
 * boards the question is "whose is that", not "what is it waiting on".
 */
export default async function AllBrandsPage() {
  const identity = await readIdentityToken((await cookies()).get(IDENTITY_COOKIE)?.value);
  if (!identity) redirect("/");

  const [brands, admin] = await Promise.all([brandsFor(identity.email), isAdmin(identity.email)]);
  if (brands.length === 0) redirect("/");

  const events = await listEventsAcross(brands);

  const initials = identity.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__left">
          <a className="brand" href="/">
            <span className="brand__logo brand__logo--hub" aria-hidden />
            <span className="brand__name">All brands</span>
          </a>
          <span className="topbar__product" aria-hidden>
            {hub.name}
          </span>
        </div>
        <div />
        <div className="topbar__right">
          <span className="who" title={`Signed in as ${identity.name}`}>
            <span className="who__avatar" aria-hidden>
              {initials}
            </span>
            <span className="who__name">{identity.name}</span>
          </span>
          {admin && (
            <a className="button" href="/admin">
              Clients
            </a>
          )}
        </div>
      </header>

      <main className="main">
        <AllCalendar brands={brands} events={events} serverToday={todayIso()} />
      </main>
    </div>
  );
}
