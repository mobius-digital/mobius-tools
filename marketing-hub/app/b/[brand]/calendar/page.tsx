import { listEvents } from "@/lib/events";
import { todayIso } from "@/lib/dates";
import { Workspace } from "@/components/Workspace";
import { listEventTypes } from "@/lib/eventTypes";
import { listChannels } from "@/lib/channelOptions";
import { Calendar } from "@/components/Calendar";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  try {
    const [events, eventTypes, channelOptions] = await Promise.all([
      listEvents(),
      listEventTypes(),
      listChannels(),
    ]);

    return (
      <Workspace initialEvents={events} eventTypes={eventTypes} channelOptions={channelOptions}>
        <Calendar serverToday={todayIso()} />
      </Workspace>
    );
  } catch (error) {
    return <LoadError error={error} />;
  }
}
