import { listChangelog, listEvents } from "@/lib/events";
import { todayIso } from "@/lib/dates";
import { Workspace } from "@/components/Workspace";
import { Pipeline } from "@/components/Pipeline";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  try {
    const [events, changelog] = await Promise.all([
      listEvents(),
      listChangelog(20),
    ]);

    return (
      <Workspace initialEvents={events} initialChangelog={changelog}>
        <Pipeline serverToday={todayIso()} />
      </Workspace>
    );
  } catch (error) {
    return <LoadError error={error} />;
  }
}
