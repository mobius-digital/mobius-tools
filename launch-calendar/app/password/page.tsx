import { brand } from "@/brand.config";
import { isPasswordConfigured } from "@/lib/auth";
import { PasswordForm } from "@/components/PasswordForm";

export const dynamic = "force-dynamic";

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  const configured = isPasswordConfigured();

  // Only ever redirect back to a path on this site.
  const from =
    params.from && params.from.startsWith("/") &&
    !params.from.startsWith("//")
      ? params.from
      : "/";

  return (
    <div className="gate">
      <div className="gate__card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoUrl} alt="" className="gate__logo" aria-hidden />
        <h1 className="gate__title">{brand.name} Launch Calendar</h1>

        {configured ? (
          <>
            <p className="gate__subtitle">
              Enter the shared team password to continue.
            </p>
            <PasswordForm from={from} />
          </>
        ) : (
          <p className="gate__subtitle">
            This deployment has no <code>APP_PASSWORD</code> set, so nobody can
            sign in. Set it in the environment and redeploy.
          </p>
        )}
      </div>
    </div>
  );
}
