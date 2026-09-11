"use client";

import { useBrand } from "./BrandProvider";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { filterByChannel, isChannelFilter, type ChannelFilter } from "@/lib/channels";
import {
  DEFAULT_CHANNELS,
  DEFAULT_EVENT_TYPES,
  DEFAULT_STAGES,
  type ChannelOption,
  type EventStatus,
  type IsoDate,
  type LaunchEvent,
  type StageOption,
} from "@/lib/types";
import type { EventTypeOption } from "@/lib/eventTypes";
import { BOARD_CONFIG_CHANGED, NEW_EVENT_REQUESTED } from "@/lib/boardConfigEvents";
import { stageClass, stageOf } from "@/lib/board";
import { formatShort } from "@/lib/dates";
import { EventEditor } from "./EventEditor";
import { useDisplayName } from "./DisplayName";
import { CloseIcon } from "./Icons";

const CHANNEL_STORAGE_KEY = "lc_channel_filter";

/**
 * How often the board re-checks the server for other people's edits.
 *
 * D1 cannot push changes the way a hosted Postgres can, so this polls instead.
 * Ten seconds is fast enough that a date moved during a call lands before
 * anyone has finished talking about it, and light enough to be free.
 */
const POLL_MS = 10_000;

/** How long a confirmation stays up. Long enough to read and hit Undo. */
const TOAST_MS = 6_000;

export type ConnectionState = "connecting" | "live" | "offline";

type Toast = {
  id: number;
  text: string;
  tone?: "default" | "danger";
  action?: { label: string; run: () => void };
};

type WorkspaceContextValue = {
  /** Every visible event, regardless of the channel lens. */
  events: LaunchEvent[];
  /** Events under the current lens: what the views should render. */
  filteredEvents: LaunchEvent[];
  channel: ChannelFilter;
  setChannel: (channel: ChannelFilter) => void;
  connection: ConnectionState;
  /** Pass an event to edit it, or nothing to create a new one. */
  openEditor: (event?: LaunchEvent) => void;
  /** Opens a blank editor with the launch date already set. */
  createEventOn: (launchDate: IsoDate) => void;
  /** One-click status change from a card or row. */
  setStatus: (event: LaunchEvent, status: EventStatus) => Promise<void>;
  /** Moves an event between Board columns; null clears the stage. */
  setStage: (event: LaunchEvent, stage: string | null) => Promise<void>;
  /** Shifts every date on an event by `days`. A drag on the calendar. */
  moveEvent: (event: LaunchEvent, days: number) => Promise<void>;
  /** The board's event types, in the order they should be offered. */
  eventTypes: EventTypeOption[];
  /** Label for a stored type key, falling back to the key if it was removed. */
  typeLabel: (key: string) => string;
  /** The board's marketing channels, in the order they should be shown. */
  channelOptions: ChannelOption[];
  /** Label for a channel key, falling back to the key if it was removed. */
  channelLabel: (key: string) => string;
  /** The board's stages, in Board-column order. */
  stages: StageOption[];
  /** The stage an event is in, or null. */
  stageFor: (event: Pick<LaunchEvent, "stage">) => StageOption | null;
  /** The CSS class that paints an element in the event's stage hue. */
  stageClassFor: (event: Pick<LaunchEvent, "stage">) => string;
  /** A one-line confirmation at the bottom of the screen. */
  notify: (text: string, options?: Omit<Toast, "id" | "text">) => void;
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
  eventTypes: initialEventTypes = DEFAULT_EVENT_TYPES,
  channelOptions: initialChannelOptions = DEFAULT_CHANNELS,
  stages: initialStages = DEFAULT_STAGES,
  children,
}: {
  initialEvents: LaunchEvent[];
  eventTypes?: EventTypeOption[];
  channelOptions?: ChannelOption[];
  stages?: StageOption[];
  children: ReactNode;
}) {
  const { path } = useBrand();
  const { ensureName } = useDisplayName();

  // The lists start from the server render and are then kept live: refreshed
  // the instant a Settings dialog saves, and on the same poll as events so a
  // stage a colleague adds shows up here too.
  const [eventTypes, setEventTypes] = useState<EventTypeOption[]>(initialEventTypes);
  const [channelOptions, setChannelOptions] = useState<ChannelOption[]>(initialChannelOptions);
  const [stages, setStages] = useState<StageOption[]>(initialStages);

  useEffect(() => setEventTypes(initialEventTypes), [initialEventTypes]);
  useEffect(() => setChannelOptions(initialChannelOptions), [initialChannelOptions]);
  useEffect(() => setStages(initialStages), [initialStages]);

  const refreshBoardConfig = useCallback(async () => {
    try {
      const [typesRes, channelsRes, stagesRes] = await Promise.all([
        fetch(path("/api/settings/types"), { cache: "no-store" }),
        fetch(path("/api/settings/channels"), { cache: "no-store" }),
        fetch(path("/api/settings/stages"), { cache: "no-store" }),
      ]);
      if (typesRes.ok) {
        const body = (await typesRes.json()) as { types?: EventTypeOption[] };
        if (body.types?.length) setEventTypes(body.types);
      }
      if (channelsRes.ok) {
        const body = (await channelsRes.json()) as { channels?: ChannelOption[] };
        if (body.channels?.length) setChannelOptions(body.channels);
      }
      if (stagesRes.ok) {
        const body = (await stagesRes.json()) as { stages?: StageOption[] };
        if (body.stages?.length) setStages(body.stages);
      }
    } catch {
      // The lists we already have are still right until proven otherwise.
    }
  }, [path]);

  useEffect(() => {
    const onChange = () => void refreshBoardConfig();
    window.addEventListener(BOARD_CONFIG_CHANGED, onChange);
    return () => window.removeEventListener(BOARD_CONFIG_CHANGED, onChange);
  }, [refreshBoardConfig]);

  const [events, setEvents] = useState<LaunchEvent[]>(() => sortEvents(initialEvents));
  const [editing, setEditing] = useState<LaunchEvent | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftLaunchDate, setDraftLaunchDate] = useState<IsoDate | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [channel, setChannelState] = useState<ChannelFilter>("all");
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    setEvents(sortEvents(initialEvents));
  }, [initialEvents]);

  /**
   * The lens comes from the URL first so a filtered view can be pasted into
   * Slack, and falls back to whatever this device chose last: a media buyer
   * should not have to re-pick "paid" every morning.
   */
  useEffect(() => {
    const keys = channelOptions.map((option) => option.key);

    const fromUrl = new URLSearchParams(window.location.search).get("channel");
    if (isChannelFilter(fromUrl, keys)) {
      setChannelState(fromUrl);
      window.localStorage.setItem(CHANNEL_STORAGE_KEY, fromUrl);
      return;
    }

    // A remembered channel that has since been removed from the board falls
    // back to "all" rather than filtering everything out.
    const remembered = window.localStorage.getItem(CHANNEL_STORAGE_KEY);
    if (isChannelFilter(remembered, keys)) setChannelState(remembered);
  }, [channelOptions]);

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

  const notify = useCallback((text: string, options: Omit<Toast, "id" | "text"> = {}) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    const id = Date.now();
    setToast({ id, text, ...options });
    toastTimer.current = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, TOAST_MS);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  // Poll for other people's edits, and pause while the tab is hidden so a
  // backgrounded board costs nothing.
  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (document.hidden) return;

      try {
        const eventsRes = await fetch(path("/api/events"), { cache: "no-store" });

        if (cancelled || !eventsRes.ok) {
          if (!cancelled) setConnection("offline");
          return;
        }

        const body = (await eventsRes.json()) as { events?: LaunchEvent[] };
        if (body.events) setEvents(sortEvents(body.events));

        void refreshBoardConfig();
        setConnection("live");
      } catch {
        if (!cancelled) setConnection("offline");
      }
    }

    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [path, refreshBoardConfig]);

  const openEditor = useCallback((event?: LaunchEvent) => {
    setEditing(event ?? null);
    setDraftLaunchDate(null);
    setEditorOpen(true);
  }, []);

  // The New event button and the phone's floating button live in the layout,
  // outside this provider; they ask for the editor through a DOM event.
  useEffect(() => {
    const onRequest = () => openEditor();
    window.addEventListener(NEW_EVENT_REQUESTED, onRequest);
    return () => window.removeEventListener(NEW_EVENT_REQUESTED, onRequest);
  }, [openEditor]);

  /**
   * `?event=<id>` opens that event straight away.
   *
   * This is what a Slack notification links to. Landing on the board and then
   * hunting for the launch the message was about would waste the notification.
   * The parameter is consumed on arrival so a refresh does not reopen the
   * editor somebody just closed.
   */
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("event");
    if (!requested) return;

    setPendingEventId(requested);

    const url = new URL(window.location.href);
    url.searchParams.delete("event");
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    if (!pendingEventId) return;

    // An event that has been deleted since the message went out simply leaves
    // the reader on the board, which is the right place to be told nothing is
    // there any more.
    const match = events.find((event) => event.id === pendingEventId);
    setPendingEventId(null);
    if (match) openEditor(match);
  }, [events, openEditor, pendingEventId]);

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
    },
    [applyChange, closeEditor],
  );

  /** One partial PATCH, shared by the quick actions. Null when it failed. */
  const patch = useCallback(
    async (event: LaunchEvent, body: Record<string, unknown>): Promise<LaunchEvent | null> => {
      const editor = await ensureName();
      if (!editor) return null;

      try {
        const response = await fetch(path(`/api/events/${event.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, editor }),
        });

        if (!response.ok) {
          const failure = (await response.json().catch(() => ({}))) as { error?: string };
          notify(failure.error ?? "That change could not be saved.", { tone: "danger" });
          return null;
        }

        const result = (await response.json()) as { event?: LaunchEvent };
        if (!result.event) return null;
        applyChange(result.event, false);
        return result.event;
      } catch {
        notify("No connection. Nothing was changed.", { tone: "danger" });
        return null;
      }
    },
    [applyChange, ensureName, notify, path],
  );

  const setStatus = useCallback(
    async (event: LaunchEvent, status: EventStatus) => {
      await patch(event, { intent: "status", status });
    },
    [patch],
  );

  const stageFor = useCallback(
    (event: Pick<LaunchEvent, "stage">) => stageOf(event, stages),
    [stages],
  );

  const stageClassFor = useCallback(
    (event: Pick<LaunchEvent, "stage">) => stageClass(event, stages),
    [stages],
  );

  const setStage = useCallback(
    async (event: LaunchEvent, stage: string | null) => {
      if ((event.stage ?? null) === stage) return;
      const before = event.stage ?? null;
      const saved = await patch(event, { intent: "stage", stage });
      if (!saved) return;

      const label = stage ? (stages.find((s) => s.key === stage)?.label ?? stage) : "no stage";
      notify(`${event.name}: ${label}`, {
        action: {
          label: "Undo",
          run: () => void patch(saved, { intent: "stage", stage: before }),
        },
      });
    },
    [notify, patch, stages],
  );

  const moveEvent = useCallback(
    async (event: LaunchEvent, days: number) => {
      if (days === 0) return;
      const saved = await patch(event, { intent: "shift", days });
      if (!saved) return;

      notify(`${event.name} moved to ${formatShort(saved.launch_date)}`, {
        action: {
          label: "Undo",
          run: () => void patch(saved, { intent: "shift", days: -days }),
        },
      });
    },
    [notify, patch],
  );

  const filteredEvents = useMemo(
    () => filterByChannel(events, channel),
    [events, channel],
  );

  /**
   * An event keeps its type key even if that type is later removed, so an
   * unknown key falls back to showing the key rather than rendering blank.
   */
  const typeLabel = useCallback(
    (key: string) =>
      eventTypes.find((option) => option.key === key)?.label ?? key,
    [eventTypes],
  );

  const channelLabel = useCallback(
    (key: string) =>
      channelOptions.find((option) => option.key === key)?.label ?? key,
    [channelOptions],
  );

  const value = useMemo(
    () => ({
      events,
      filteredEvents,
      channel,
      setChannel,
      connection,
      openEditor,
      createEventOn,
      setStatus,
      setStage,
      moveEvent,
      eventTypes,
      typeLabel,
      channelOptions,
      channelLabel,
      stages,
      stageFor,
      stageClassFor,
      notify,
    }),
    [
      events,
      filteredEvents,
      channel,
      setChannel,
      connection,
      openEditor,
      createEventOn,
      setStatus,
      setStage,
      moveEvent,
      eventTypes,
      typeLabel,
      channelOptions,
      channelLabel,
      stages,
      stageFor,
      stageClassFor,
      notify,
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

      {toast && (
        <div
          className={`toast${toast.tone === "danger" ? " toast--danger" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className="toast__text">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                toast.action?.run();
                dismissToast();
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            className="toast__close"
            onClick={dismissToast}
            aria-label="Dismiss"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </WorkspaceContext.Provider>
  );
}
