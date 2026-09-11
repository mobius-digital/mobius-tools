import { listEvents } from "@/lib/events";
import { todayIso } from "@/lib/dates";
import { Workspace } from "@/components/Workspace";
import { listEventTypes } from "@/lib/eventTypes";
import { listChannels } from "@/lib/channelOptions";
import { listStages } from "@/lib/stages";
import { Board } from "@/components/Board";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  try {
    const [events, eventTypes, channelOptions, stages] = await Promise.all([
      listEvents(),
      listEventTypes(),
      listChannels(),
      listStages(),
    ]);

    return (
      <Workspace
        initialEvents={events}
        eventTypes={eventTypes}
        channelOptions={channelOptions}
        stages={stages}
      >
        <Board serverToday={todayIso()} />
      </Workspace>
    );
  } catch (error) {
    return <LoadError error={error} />;
  }
}
