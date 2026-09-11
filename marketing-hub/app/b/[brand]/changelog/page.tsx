import { listChangelog, listEvents } from "@/lib/events";
import { listEventTypes } from "@/lib/eventTypes";
import { listChannels } from "@/lib/channelOptions";
import { listStages } from "@/lib/stages";
import { Workspace } from "@/components/Workspace";
import { LoadError } from "@/components/LoadError";
import { ChangelogFeed } from "@/components/ChangelogFeed";

export const dynamic = "force-dynamic";

/**
 * Wrapped in the workspace like the other views, so the New event button in
 * the bar and a `?event=` link from Slack both work from here too.
 */
export default async function ChangelogPage() {
  try {
    const [entries, events, eventTypes, channelOptions, stages] = await Promise.all([
      listChangelog(200),
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
        <div className="toolbar">
          <div className="toolbar__lead">
            <h1 className="toolbar__title">Changelog</h1>
            <span className="toolbar__sub">Every edit, with a name against it</span>
          </div>
        </div>
        <ChangelogFeed entries={entries} />
      </Workspace>
    );
  } catch (error) {
    return <LoadError error={error} />;
  }
}
