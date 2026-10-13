import { describe, expect, it } from 'vitest';
import { makeHtmlPreview } from './security';

describe('HTML preview isolation', () => {
  it('places a restrictive policy before untrusted document content', () => {
    const preview = makeHtmlPreview('<h1>Bonjour</h1><script>alert(1)</script>');
    expect(preview.indexOf('Content-Security-Policy')).toBeLessThan(preview.indexOf('<h1>'));
    expect(preview).toContain("script-src 'none'");
    expect(preview).toContain("connect-src 'none'");
    expect(preview).toContain('<script>alert(1)</script>');
  });
});
