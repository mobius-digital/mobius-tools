import { listChangelog, listEvents } from "@/lib/events";
import { todayIso } from "@/lib/dates";
import { Workspace } from "@/components/Workspace";
import { listEventTypes } from "@/lib/eventTypes";
import { Pipeline } from "@/components/Pipeline";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  try {
    const [events, changelog, eventTypes] = await Promise.all([
      listEvents(),
      listChangelog(20),
      listEventTypes(),
    ]);

    return (
      <Workspace
        initialEvents={events}
        initialChangelog={changelog}
        eventTypes={eventTypes}
      >
        <Pipeline serverToday={todayIso()} />
      </Workspace>
    );
  } catch (error) {
    return <LoadError error={error} />;
  }
}
