/**
 * HTML is rendered in an opaque-origin, scriptless iframe. The early CSP also
 * prevents network requests, forms, plugins and navigation from the preview.
 */
export function makeHtmlPreview(source: string): string {
  const policy = [
    "default-src 'none'",
    'img-src data: blob:',
    "style-src 'unsafe-inline' data:",
    'font-src data:',
    'media-src data: blob:',
    "connect-src 'none'",
    "script-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return `<meta http-equiv="Content-Security-Policy" content="${policy}">\n${source}`;
}
