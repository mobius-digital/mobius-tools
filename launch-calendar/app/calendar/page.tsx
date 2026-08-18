import { listEvents } from "@/lib/events";
import { todayIso } from "@/lib/dates";
import { Workspace } from "@/components/Workspace";
import { listEventTypes } from "@/lib/eventTypes";
import { Calendar } from "@/components/Calendar";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  try {
    const [events, eventTypes] = await Promise.all([
      listEvents(),
      listEventTypes(),
    ]);

    return (
      <Workspace initialEvents={events} eventTypes={eventTypes}>
        <Calendar serverToday={todayIso()} />
      </Workspace>
    );
  } catch (error) {
    return <LoadError error={error} />;
  }
}
