// The app's (not the invitations') color palette, in one place so screens
// can't drift apart. Mirrors the @theme colors in src/index.css.
//
// Every text color here is at least 4.5:1 on white and on cream (WCAG AA
// for small text) — the old green #4CAF7D (2.7:1), red #E55757 (3.6:1)
// and gold #C9A66B (2.3:1) weren't.
export const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  cream: "#FAF8F5",
  border: "#E7E1D8",
  muted: "#78716C",
  surface: "#F5F0E8",
  white: "#FFFFFF",
  rose: "#E8C5C1",
  // Status colors — distinct from the navy used for buttons and links, so a
  // status reads as a status.
  green: "#1F7A4D",
  amber: "#A15C07",
  red: "#B42318",
  error: "#B42318",
  // Paid plans and upgrade prompts: gold text on a light gold tint.
  gold: "#8A6A33",
  goldTint: "rgba(201,166,107,0.18)",
} as const;
