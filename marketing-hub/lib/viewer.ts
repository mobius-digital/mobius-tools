import { cookies } from "next/headers";
import { isAdmin } from "./brandContext";
import { IDENTITY_COOKIE, readIdentityToken } from "./session";

/**
 * Is the person making this request an agency admin?
 *
 * The middleware decides whether you may open a board at all. This is the
 * finer question a few routes need afterwards: whether you are Mobius or a
 * client, once you are already inside.
 *
 * A team-password session has no identity cookie and so is never an admin,
 * which is the right answer — a shared password says somebody has the link,
 * not who they are.
 *
 * Kept out of brandContext.ts on purpose: that module is imported by the
 * middleware, which runs in a context where `cookies()` is not available.
 */
export async function viewerIsAdmin(): Promise<boolean> {
  const identity = await readIdentityToken(
    (await cookies()).get(IDENTITY_COOKIE)?.value,
  );
  if (!identity) return false;
  return isAdmin(identity.email);
}
