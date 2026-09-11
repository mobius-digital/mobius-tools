/**
 * The icon set: 16-unit, 1.6 stroke, round caps, one weight everywhere.
 * Drawn here rather than pulled from a library so the bar, the tab bar and
 * the menus read as one hand.
 */

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
      <path d="M2.5 6.75h11M5.5 2v2.5M10.5 2v2.5" />
    </Svg>
  );
}

export function BoardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="2.5" width="3.4" height="11" rx="1" />
      <rect x="6.3" y="2.5" width="3.4" height="7.5" rx="1" />
      <rect x="10.6" y="2.5" width="3.4" height="9.5" rx="1" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 5.2V8l2.1 1.5" />
    </Svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6.5 8 10.5l4-4" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.8 3.5 5.3 8l4.5 4.5" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.2 3.5 10.7 8l-4.5 4.5" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5 6.5 11.5 12.5 5" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2.6 14 13H2L8 2.6Z" />
      <path d="M8 6.5v3M8 11.4v.1" />
    </Svg>
  );
}

/** Assets due. */
export function BellIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 11V7.5a4 4 0 0 1 8 0V11l1 1.5H3L4 11Z" />
      <path d="M6.6 14a1.6 1.6 0 0 0 2.8 0" />
    </Svg>
  );
}

/** Teasers start. */
export function MegaphoneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 6.5v3h2l5 3V3.5l-5 3h-2Z" />
      <path d="M12 6a2.6 2.6 0 0 1 0 4" />
    </Svg>
  );
}

/** Inventory lands. */
export function BoxIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 5.5 8 2.5l5.5 3v5L8 13.5l-5.5-3v-5Z" />
      <path d="M2.5 5.5 8 8.5l5.5-3M8 8.5v5" />
    </Svg>
  );
}

/** Launch day. */
export function FlagIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 14V2.5h8l-2 3 2 3h-8" />
    </Svg>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4.5h.01M10 4.5h.01M6 8h.01M10 8h.01M6 11.5h.01M10 11.5h.01" strokeWidth="2.2" />
    </Svg>
  );
}
