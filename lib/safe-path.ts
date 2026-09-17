/**
 * A same-site path to send the reader to, or `fallback`. Browsers read a backslash as a
 * slash, so "/\evil.com" is as off-site as "//evil.com"; both are refused.
 */
export function safePath(value: unknown, fallback: string): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
}
