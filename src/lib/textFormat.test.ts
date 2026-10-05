import { describe, expect, it } from 'vitest';
import { formatJsonForDisplay } from './textFormat';

describe('JSON display formatting', () => {
  it('pretty prints valid compact JSON without changing the source', () => {
    expect(formatJsonForDisplay('{"name":"Noto","active":true}')).toBe(`{
  "name": "Noto",
  "active": true
}`);
  });

  it('keeps invalid and very large JSON untouched', () => {
    expect(formatJsonForDisplay('{broken')).toBe('{broken');
    const large = `"${'x'.repeat(2 * 1024 * 1024)}"`;
    expect(formatJsonForDisplay(large)).toBe(large);
  });
});
