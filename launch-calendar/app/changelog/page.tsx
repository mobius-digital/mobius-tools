import { listChangelog } from "@/lib/events";
import { LoadError } from "@/components/LoadError";
import { ChangelogFeed } from "@/components/ChangelogFeed";

export const dynamic = "force-dynamic";

export default async function ChangelogPage() {
  try {
    const entries = await listChangelog(200);
    return <ChangelogFeed entries={entries} />;
  } catch (error) {
    return <LoadError error={error} />;
  }
}
