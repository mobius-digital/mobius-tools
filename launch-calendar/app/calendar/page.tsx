import { listEvents } from "@/lib/events";
import { todayIso } from "@/lib/dates";
import { Workspace } from "@/components/Workspace";
import { Calendar } from "@/components/Calendar";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  try {
    const events = await listEvents();

    return (
      <Workspace initialEvents={events}>
        <Calendar serverToday={todayIso()} />
      </Workspace>
    );
  } catch (error) {
    return <LoadError error={error} />;
  }
}
