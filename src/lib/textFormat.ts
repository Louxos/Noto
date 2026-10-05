const MAX_JSON_FORMAT_BYTES = 2 * 1024 * 1024;

/** Return an indented, display-only JSON copy when parsing is inexpensive and valid. */
export function formatJsonForDisplay(source: string): string {
  if (!source.trim() || new TextEncoder().encode(source).length > MAX_JSON_FORMAT_BYTES) return source;
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return source;
  }
}
