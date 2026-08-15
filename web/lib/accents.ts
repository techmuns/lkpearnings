/**
 * Per-row / per-card accent cycle. Inline hex (not Tailwind class names) so the
 * colors survive without depending on the JIT scanner picking up dynamic classes.
 */
export interface Accent {
  bar: string; // strong color for the left accent bar / dot
  soft: string; // very light tint background
  text: string; // readable strong text color on white
  ring: string; // border/ring tint
}

export const ACCENTS: Accent[] = [
  { bar: "#2563eb", soft: "#eff6ff", text: "#1d4ed8", ring: "#bfdbfe" }, // blue
  { bar: "#0ea5e9", soft: "#f0f9ff", text: "#0369a1", ring: "#bae6fd" }, // sky
  { bar: "#8b5cf6", soft: "#f5f3ff", text: "#6d28d9", ring: "#ddd6fe" }, // violet
  { bar: "#14b8a6", soft: "#f0fdfa", text: "#0f766e", ring: "#99f6e4" }, // teal
  { bar: "#f59e0b", soft: "#fffbeb", text: "#b45309", ring: "#fde68a" }, // amber
  { bar: "#ec4899", soft: "#fdf2f8", text: "#be185d", ring: "#fbcfe8" }, // pink
  { bar: "#6366f1", soft: "#eef2ff", text: "#4338ca", ring: "#c7d2fe" }, // indigo
];

export function accentFor(index: number): Accent {
  const len = ACCENTS.length;
  return ACCENTS[((index % len) + len) % len];
}
