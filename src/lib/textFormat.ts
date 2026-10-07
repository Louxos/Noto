const MAX_JSON_FORMAT_BYTES = 2 * 1024 * 1024;

export interface JsonValidationError {
  message: string;
  line: number;
  column: number;
}

/** Return an indented, display-only JSON copy when parsing is inexpensive and valid. */
export function formatJsonForDisplay(source: string): string {
  if (!source.trim() || new TextEncoder().encode(source).length > MAX_JSON_FORMAT_BYTES) return source;
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return source;
  }
}

export function validateJson(source: string): JsonValidationError | null {
  if (!source.trim() || new TextEncoder().encode(source).length > MAX_JSON_FORMAT_BYTES) return null;
  try {
    JSON.parse(source);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Syntaxe JSON invalide';
    const location = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (location) return { message, line: Number(location[1]), column: Number(location[2]) };
    const explicitPosition = message.match(/position\s+(\d+)/i)?.[1];
    const unexpectedToken = message.match(/Unexpected token ['\"](.+?)['\"]/i)?.[1];
    const fallbackPosition = unexpectedToken ? source.lastIndexOf(unexpectedToken) : Math.max(0, source.length - 1);
    const position = explicitPosition ? Number(explicitPosition) : Math.max(0, fallbackPosition);
    const safePosition = Math.max(0, Math.min(source.length, position));
    const before = source.slice(0, safePosition);
    const line = before.split('\n').length;
    const lastLineBreak = before.lastIndexOf('\n');
    return { message, line, column: safePosition - lastLineBreak };
  }
}
