import { listChangelog, listEvents } from "@/lib/events";
import { todayIso } from "@/lib/dates";
import { Workspace } from "@/components/Workspace";
import { listEventTypes } from "@/lib/eventTypes";
import { listChannels } from "@/lib/channelOptions";
import { Pipeline } from "@/components/Pipeline";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  try {
    const [events, changelog, eventTypes, channelOptions] = await Promise.all([
      listEvents(),
      listChangelog(20),
      listEventTypes(),
      listChannels(),
    ]);

    return (
      <Workspace
        initialEvents={events}
        initialChangelog={changelog}
        eventTypes={eventTypes}
        channelOptions={channelOptions}
      >
        <Pipeline serverToday={todayIso()} />
      </Workspace>
    );
  } catch (error) {
    return <LoadError error={error} />;
  }
}
