import type { ReactElement } from "react";

// Minimal line-icon set, same visual language as the dashboard's existing
// icon system (18x18 viewBox, 1.6 stroke) — used where a plain emoji
// previously stood in for an icon (invitation builder sections, check-in).
const PATHS: Record<string, ReactElement> = {
  photo: <><rect x="2" y="3" width="14" height="12" rx="2" /><circle cx="6.5" cy="7.5" r="1.5" /><path d="M16 12l-4.5-4.5L6 13" /></>,
  video: <><rect x="1.5" y="4" width="11" height="10" rx="2" /><path d="M12.5 8l4-2.5v7l-4-2.5" /></>,
  music: <><path d="M6.5 13.5V3.5l9-1.5v10" /><circle cx="4.5" cy="13.5" r="2" /><circle cx="13.5" cy="12" r="2" /></>,
  clock: <><circle cx="9" cy="9" r="7" /><path d="M9 5v4l3 2" /></>,
  list: <><path d="M6 5h9M6 9h9M6 13h9" /><path d="M3 5h.01M3 9h.01M3 13h.01" /></>,
  message: <><path d="M2 4h14v9H7l-3 3v-3H2z" /></>,
  calendar: <><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3 7h14M7 3v2M13 3v2" /></>,
  pin: <><path d="M9 16s6-5.5 6-9.5A6 6 0 0 0 3 6.5C3 10.5 9 16 9 16z" /><circle cx="9" cy="6.5" r="2" /></>,
  images: <><rect x="2" y="5" width="11" height="10" rx="2" /><path d="M5 15V4a2 2 0 0 1 2-2h9v11" /></>,
  tag: <><path d="M9 3h5a1 1 0 0 1 1 1v5l-7 7-6-6z" /><circle cx="12" cy="6" r="1" /></>,
  users: <><circle cx="7" cy="7" r="3" /><path d="M2 17c0-3 2-5 5-5" /><circle cx="13" cy="7" r="3" /><path d="M20 17c0-3-2-5-5-5" /><path d="M10 12c-3 0-6 2-6 5h12c0-3-3-5-6-5z" /></>,
  gift: <><rect x="3" y="8" width="12" height="8" rx="1" /><path d="M3 8h12M9 8v8" /><path d="M9 8C7 8 6 6.5 6 5.5A1.5 1.5 0 0 1 9 5c0 1.5-1 3-3 3zM9 8c2 0 3-1.5 3-2.5A1.5 1.5 0 0 0 9 5" /></>,
  help: <><circle cx="9" cy="9" r="7" /><path d="M7 7a2 2 0 0 1 3.5-1.3c.5.6.5 1.6 0 2.1L9 9.3V11" /><path d="M9 13.2h.01" /></>,
  checkCircle: <><circle cx="9" cy="9" r="7" /><path d="M6 9l2 2 4-4" /></>,
  camera: <><rect x="2" y="6" width="14" height="9" rx="2" /><path d="M6 6l1.5-2h3L12 6" /><circle cx="9" cy="10.5" r="2.5" /></>,
  inbox: <><path d="M2 10h4l1.5 2.5h3L12 10h4" /><rect x="2" y="4" width="14" height="11" rx="2" /></>,
  sparkle: <path d="M9 2l1.4 5.6L16 9l-5.6 1.4L9 16l-1.4-5.6L2 9l5.6-1.4z" />,
  edit: <><path d="M11 3l4 4-8.5 8.5-4.5 1 1-4.5z" /><path d="M9.5 4.5l4 4" /></>,
  send: <><path d="M16 2L7 11" /><path d="M16 2l-5.5 14-3-6-6-3z" /></>,
  chart: <><path d="M3 15V9M8 15V5M13 15v-7" /><path d="M2 15h14" /></>,
  qr: <><rect x="2" y="2" width="5" height="5" rx="0.5" /><rect x="11" y="2" width="5" height="5" rx="0.5" /><rect x="2" y="11" width="5" height="5" rx="0.5" /><path d="M11 11h2v2h-2zM15 11h1M11 15h1M14 14h2v2h-2z" /></>,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, color = "currentColor" }: { name: IconName; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}
