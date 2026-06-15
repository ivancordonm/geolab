/**
 * Default geometry colors live in styles.css as theme-aware CSS custom
 * properties (`--geo-*`), applied through the `.geometry-*` classes so they
 * flip between light and dark automatically.
 *
 * These `var()` references are exported for code that needs an explicit color
 * value outside of a styled class (e.g. legend swatches). View components only
 * set an inline color when a per-object custom `style.color` is provided.
 */
export const geometryColors = {
  point: "var(--geo-point)",
  segment: "var(--geo-segment)",
  circle: "var(--geo-circle)",
  line: "var(--geo-line)",
  label: "var(--geo-label)",
  accent: "var(--geo-accent)",
} as const;
