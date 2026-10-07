import { describe, expect, it } from 'vitest';
import { formatJsonForDisplay, validateJson } from './textFormat';

describe('JSON display formatting', () => {
  it('pretty prints valid compact JSON without changing the source', () => {
    expect(formatJsonForDisplay('{"name":"Noto","active":true}')).toBe(`{
  "name": "Noto",
  "active": true
}`);
  });

  it('reports syntax errors with a line and column', () => {
    const error = validateJson('{\n  "name": }');
    expect(error?.line).toBe(2);
    expect(error?.column).toBeGreaterThan(1);
  });

  it('keeps invalid and very large JSON untouched', () => {
    expect(validateJson('{"valid":true}')).toBeNull();
    expect(formatJsonForDisplay('{broken')).toBe('{broken');
    const large = `"${'x'.repeat(2 * 1024 * 1024)}"`;
    expect(formatJsonForDisplay(large)).toBe(large);
  });
});
