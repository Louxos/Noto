import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownViewer } from './MarkdownViewer';

describe('Markdown viewer', () => {
  it('renders headings, GFM tables, tasks and fenced code', () => {
    const html = renderToStaticMarkup(createElement(MarkdownViewer, {
      source: '# Notes\n\n- [x] Fait\n- [ ] À faire\n\n| Nom | Valeur |\n| --- | --- |\n| Noto | 1 |\n\n```js\nconst answer = 42;\n```',
    }));
    expect(html).toContain('<h1 id="notes">Notes</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('hljs');
  });

  it('does not render raw HTML and does not fetch remote Markdown images', () => {
    const html = renderToStaticMarkup(createElement(MarkdownViewer, {
      source: '<script>window.__unsafe = true</script>\n\n![photo](https://example.invalid/image.png)',
    }));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('Image non chargée automatiquement');
  });
});
