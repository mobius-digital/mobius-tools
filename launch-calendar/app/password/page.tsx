import { brand } from "@/brand.config";
import { isPasswordConfigured } from "@/lib/auth";
import { signInConfig } from "@/lib/signin";
import { PasswordForm } from "@/components/PasswordForm";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { BrandLogo } from "@/components/BrandLogo";
import { GateScene } from "@/components/GateScene";
import { listChannels } from "@/lib/channelOptions";
import { listEventTypes } from "@/lib/eventTypes";
import { DEFAULT_CHANNELS, DEFAULT_EVENT_TYPES } from "@/lib/types";

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

  // The scene shows this board's own channels and types. They are decoration,
  // so a database hiccup here falls back to the defaults rather than taking the
  // sign-in page down with it.
  const [channels, eventTypes] = await Promise.all([
    listChannels().catch(() => DEFAULT_CHANNELS),
    listEventTypes().catch(() => DEFAULT_EVENT_TYPES),
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
      <GateScene channels={channels} eventTypes={eventTypes} />

      <section className="gate__panel">
        <div className="gate__card">
          <div className="gate__brand">
            <BrandLogo className="gate__logo" />
            <span className="gate__brandname">{brand.name}</span>
          </div>
          <h1 className="gate__title">{brand.productName}</h1>

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

        <p className="gate__fine">
          One shared board for the whole team. Every change is recorded with who
          made it.
        </p>
      </section>
    </div>
  );
}
