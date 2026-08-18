import { brand } from "@/brand.config";
import { isPasswordConfigured } from "@/lib/auth";
import { signInConfig } from "@/lib/signin";
import { PasswordForm } from "@/components/PasswordForm";
import { GoogleSignIn } from "@/components/GoogleSignIn";

export const dynamic = "force-dynamic";

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  const [configured, config] = await Promise.all([
    isPasswordConfigured(),
    signInConfig(),
  ]);

  // Only ever redirect back to a path on this site.
  const from =
    params.from && params.from.startsWith("/") &&
    !params.from.startsWith("//")
      ? params.from
      : "/";

  const googleMode = config.mode === "google" && Boolean(config.googleClientId);
  // In Google mode the password is a deliberate way back in, not the main road,
  // so it sits underneath rather than competing with the button.
  const passwordAvailable = configured && (!googleMode || config.passwordFallback);

  return (
    <div className="gate">
      <div className="gate__card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoUrl} alt="" className="gate__logo" aria-hidden />
        <h1 className="gate__title">{brand.name} Launch Calendar</h1>

        {googleMode ? (
          <>
            <p className="gate__subtitle">
              Sign in with the Google account you were invited with.
            </p>
            <GoogleSignIn clientId={config.googleClientId} from={from} />

            {passwordAvailable && (
              <details className="gate__alt">
                <summary>Use the team password instead</summary>
                <PasswordForm from={from} />
              </details>
            )}
          </>
        ) : passwordAvailable ? (
          <>
            <p className="gate__subtitle">
              Enter the shared team password to continue.
            </p>
            <PasswordForm from={from} />
          </>
        ) : (
          <p className="gate__subtitle">
            This deployment has no way to sign in configured, so nobody can get
            in. Set <code>APP_PASSWORD</code> in the environment and redeploy.
          </p>
        )}
      </div>
    </div>
  );
}
