import type { ChannelOption } from "@/lib/types";
import type { EventTypeOption } from "@/lib/eventTypes";
import { TodayLabel } from "./TodayLabel";

/**
 * The decorative half of the sign-in screen: the product in miniature.
 *
 * Rather than a stock illustration, this is an abstract Pipeline — four week
 * rows, spans that run from teaser to promo end, status dots, a today marker —
 * drawn entirely with CSS from the brand tokens, so it re-skins itself with the
 * rest of the app. The chips underneath are this board's *real* channels and
 * event types, so a Lucky Golf board greets you with "Tour Drop" and an
 * affiliate-heavy one with "Affiliate": the gate speaks the team's language
 * before they are even in.
 *
 * Everything is aria-hidden; it says nothing a screen reader needs. The form
 * on the other side is the page.
 */

type Span = {
  week: 0 | 1 | 2 | 3;
  /** Columns on a 7-wide grid, 1-based start and end (inclusive). */
  start: number;
  end: number;
  tone: "confirmed" | "tentative" | "risk";
  weight: "primary" | "supporting";
  label?: string;
};

/**
 * A believable month, not a random one: a launch this week with its run-up
 * already in motion, a promo next week, a content moment wobbling in week
 * three, a tentative launch in week four — the shape of a real board.
 */
const SPANS: Span[] = [
  { week: 0, start: 2, end: 5, tone: "confirmed", weight: "primary" },
  { week: 0, start: 5, end: 7, tone: "confirmed", weight: "supporting" },
  { week: 1, start: 1, end: 4, tone: "confirmed", weight: "primary" },
  { week: 1, start: 3, end: 6, tone: "tentative", weight: "supporting" },
  { week: 2, start: 2, end: 3, tone: "risk", weight: "primary" },
  { week: 2, start: 5, end: 7, tone: "confirmed", weight: "supporting" },
  { week: 3, start: 1, end: 2, tone: "tentative", weight: "supporting" },
  { week: 3, start: 4, end: 7, tone: "tentative", weight: "primary" },
];

/** Which day of the top row is "today"; the strip highlights it. */
const TODAY_COLUMN = 3;

/** Small marks under the day strip — assets due, teasers, inventory. */
const MILESTONES = [1, 2, 4, 6];

const WEEK_LABELS = ["This week", "Week 2", "Week 3", "Week 4"];

export function GateScene({
  channels,
  eventTypes,
  productName,
}: {
  channels: ChannelOption[];
  eventTypes: EventTypeOption[];
  productName: string;
}) {
  return (
    <aside className="gate__scene" aria-hidden>
      <div className="scene">
        <div className="scene__top">
          <TodayLabel className="scene__today" />
          <p className="scene__headline">
            What&rsquo;s going live, when &mdash; and which channels need to care.
          </p>
        </div>

        <div className="scene__board">
          {/* The day strip: a week across the top, today lit. */}
          <div className="scene__strip">
            {Array.from({ length: 7 }, (_, index) => {
              const column = index + 1;
              const today = column === TODAY_COLUMN;
              const mark = MILESTONES.includes(column);
              return (
                <span
                  key={column}
                  className={`scene__day${today ? " scene__day--today" : ""}`}
                >
                  {mark && <i className="scene__mark" />}
                  {today && <i className="scene__dot" />}
                </span>
              );
            })}
          </div>

          {/* Four week rows with their spans. */}
          {WEEK_LABELS.map((label, week) => (
            <div key={label} className="scene__week" style={{ ["--row" as string]: week }}>
              <span className="scene__weeklabel">{label}</span>
              <div className="scene__lane">
                {SPANS.filter((span) => span.week === week).map((span, index) => (
                  <i
                    key={index}
                    className={`scene__span scene__span--${span.tone} scene__span--${span.weight}`}
                    style={{
                      ["--start" as string]: span.start,
                      ["--end" as string]: span.end + 1,
                      ["--delay" as string]: week * 4 + index,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="scene__chips">
          {channels.map((channel) => (
            <span key={channel.key} className="scene__chip scene__chip--channel">
              {channel.label}
            </span>
          ))}
          {eventTypes.slice(0, 4).map((type) => (
            <span key={type.key} className="scene__chip">
              {type.label}
            </span>
          ))}
        </div>

        <p className="scene__foot">
          {productName} &middot; Pipeline &middot; Calendar &middot; Changelog &middot; Slack
        </p>
      </div>
    </aside>
  );
}
