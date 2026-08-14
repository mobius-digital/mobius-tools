"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { filterByChannel, isChannelFilter, type ChannelFilter } from "@/lib/channels";
import type { ChangelogEntry, EventStatus, IsoDate, LaunchEvent } from "@/lib/types";
import { EventEditor } from "./EventEditor";
import { useDisplayName } from "./DisplayName";

const CHANNEL_STORAGE_KEY = "lc_channel_filter";

/** Given up on after this many consecutive realtime failures. */
const MAX_REALTIME_RETRIES = 3;

/**
 * A single shared empty array for callers that pass no history.
 *
 * A `= []` default in the parameter list allocates a fresh array on every
 * render, so the effect that syncs it into state sees a "new" value each time
 * and loops forever. That froze the Calendar route, which is the one page that
 * does not pass its own changelog.
 */
const NO_CHANGES: ChangelogEntry[] = [];

export type ConnectionState = "connecting" | "live" | "offline";

type WorkspaceContextValue = {
  /** Every visible event, regardless of the channel lens. */
  events: LaunchEvent[];
  /** Events under the current lens — what the views should render. */
  filteredEvents: LaunchEvent[];
  channel: ChannelFilter;
  setChannel: (channel: ChannelFilter) => void;
  connection: ConnectionState;
  recentChanges: ChangelogEntry[];
  /** Pass an event to edit it, or nothing to create a new one. */
  openEditor: (event?: LaunchEvent) => void;
  /** Opens a blank editor with the launch date already set. */
  createEventOn: (launchDate: IsoDate) => void;
  /** One-click status change from a card or row. */
  setStatus: (event: LaunchEvent, status: EventStatus) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside <Workspace>");
  return context;
}

function sortEvents(events: LaunchEvent[]): LaunchEvent[] {
  return [...events].sort(
    (a, b) => a.launch_date.localeCompare(b.launch_date) || a.name.localeCompare(b.name),
  );
}

export function Workspace({
  initialEvents,
  initialChangelog = NO_CHANGES,
  children,
}: {
  initialEvents: LaunchEvent[];
  initialChangelog?: ChangelogEntry[];
  children: ReactNode;
}) {
  const { ensureName } = useDisplayName();

  const [events, setEvents] = useState<LaunchEvent[]>(() => sortEvents(initialEvents));
  const [recentChanges, setRecentChanges] = useState<ChangelogEntry[]>(initialChangelog);
  const [editing, setEditing] = useState<LaunchEvent | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftLaunchDate, setDraftLaunchDate] = useState<IsoDate | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [channel, setChannelState] = useState<ChannelFilter>("all");

  useEffect(() => {
    setEvents(sortEvents(initialEvents));
  }, [initialEvents]);

  useEffect(() => {
    setRecentChanges(initialChangelog);
  }, [initialChangelog]);

  /**
   * The lens comes from the URL first so a filtered view can be pasted into
   * Slack, and falls back to whatever this device chose last — a media buyer
   * should not have to re-pick "paid" every morning.
   */
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("channel");
    if (isChannelFilter(fromUrl)) {
      setChannelState(fromUrl);
      window.localStorage.setItem(CHANNEL_STORAGE_KEY, fromUrl);
      return;
    }

    const remembered = window.localStorage.getItem(CHANNEL_STORAGE_KEY);
    if (isChannelFilter(remembered)) setChannelState(remembered);
  }, []);

  const setChannel = useCallback((next: ChannelFilter) => {
    setChannelState(next);
    window.localStorage.setItem(CHANNEL_STORAGE_KEY, next);

    // replaceState rather than a router push: the lens is a view preference,
    // not a navigation step, and should not stack up in the back button.
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("channel");
    else url.searchParams.set("channel", next);
    window.history.replaceState(null, "", url);
  }, []);

  const applyChange = useCallback((next: LaunchEvent, deleted: boolean) => {
    setEvents((current) => {
      const without = current.filter((event) => event.id !== next.id);
      return deleted ? without : sortEvents([...without, next]);
    });
  }, []);

  /**
   * Re-reads the history after an edit made in this tab.
   *
   * Realtime would push the new rows, but it is a convenience that can be down
   * — and "Recent changes" going stale the moment you use it would undermine
   * the one panel people are meant to trust.
   */
  const refreshChangelog = useCallback(async () => {
    try {
      const response = await fetch("/api/changelog?limit=20");
      if (!response.ok) return;
      const body = (await response.json()) as { entries?: ChangelogEntry[] };
      if (body.entries) setRecentChanges(body.entries);
    } catch {
      // A stale panel is not worth surfacing an error over.
    }
  }, []);

  useEffect(() => {
    let channels: { unsubscribe: () => void }[] = [];
    let failures = 0;
    let abandoned = false;

    try {
      const supabase = getBrowserClient();

      const eventsChannel = supabase
        .channel("events-stream")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "events" },
          (payload) => {
            const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as
              | LaunchEvent
              | null;
            if (!row?.id) return;
            applyChange(row, payload.eventType === "DELETE");
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            failures = 0;
            setConnection("live");
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            failures += 1;
            if (failures >= MAX_REALTIME_RETRIES && !abandoned) {
              // Stop hammering a server that is not going to answer; the app
              // stays fully usable, it just will not update by itself.
              abandoned = true;
              setConnection("offline");
              for (const entry of channels) entry.unsubscribe();
            }
          }
        });

      const changelogChannel = supabase
        .channel("changelog-stream")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "changelog" },
          (payload) => {
            const row = payload.new as ChangelogEntry | null;
            if (!row?.id) return;
            setRecentChanges((current) => [row, ...current].slice(0, 100));
          },
        )
        .subscribe();

      channels = [eventsChannel, changelogChannel];
    } catch {
      setConnection("offline");
    }

    return () => {
      for (const entry of channels) entry.unsubscribe();
    };
  }, [applyChange]);

  const openEditor = useCallback((event?: LaunchEvent) => {
    setEditing(event ?? null);
    setDraftLaunchDate(null);
    setEditorOpen(true);
  }, []);

  const createEventOn = useCallback((launchDate: IsoDate) => {
    setEditing(null);
    setDraftLaunchDate(launchDate);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditing(null);
    setDraftLaunchDate(null);
  }, []);

  const handleSaved = useCallback(
    (event: LaunchEvent, deleted: boolean) => {
      applyChange(event, deleted);
      closeEditor();
      void refreshChangelog();
    },
    [applyChange, closeEditor, refreshChangelog],
  );

  const setStatus = useCallback(
    async (event: LaunchEvent, status: EventStatus) => {
      const editor = await ensureName();
      if (!editor) return;

      const response = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "status", status, editor }),
      });

      if (!response.ok) return;

      const body = (await response.json()) as { event?: LaunchEvent };
      if (body.event) applyChange(body.event, false);
      void refreshChangelog();
    },
    [applyChange, ensureName, refreshChangelog],
  );

  const filteredEvents = useMemo(
    () => filterByChannel(events, channel),
    [events, channel],
  );

  const value = useMemo(
    () => ({
      events,
      filteredEvents,
      channel,
      setChannel,
      connection,
      recentChanges,
      openEditor,
      createEventOn,
      setStatus,
    }),
    [
      events,
      filteredEvents,
      channel,
      setChannel,
      connection,
      recentChanges,
      openEditor,
      createEventOn,
      setStatus,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}

      {editorOpen && (
        <EventEditor
          event={editing}
          defaultLaunchDate={draftLaunchDate}
          onClose={closeEditor}
          onSaved={handleSaved}
        />
      )}
    </WorkspaceContext.Provider>
  );
}
