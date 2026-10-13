// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OpenDocument } from '../types';
import { readDesktopTextChunk } from '../lib/files';
import { ProgressiveTextViewer } from './ProgressiveTextViewer';

vi.mock('../lib/files', () => ({
  formatBytes: (bytes: number) => `${bytes} B`,
  readDesktopTextChunk: vi.fn(async () => ({ content: '\ncontinued', nextOffset: 16 })),
  readBrowserTextChunk: vi.fn(),
}));

afterEach(() => cleanup());

describe('ProgressiveTextViewer', () => {
  it('loads the next local block and reports the new content without marking it edited', async () => {
    const user = userEvent.setup();
    const onContentLoaded = vi.fn();
    const document: OpenDocument = {
      id: 'large-text', name: 'large.txt', path: '/docs/large.txt', extension: 'txt', kind: 'text',
      content: 'first block', savedContent: 'first block', loadedBytes: 8, textEncoding: 'utf-8',
      mimeType: 'text/plain', size: 16, truncated: true, source: 'desktop',
    };
    const { container } = render(<ProgressiveTextViewer document={document} lineNumbers fontSize={14} wordWrap={false} onContentLoaded={onContentLoaded} />);
    await user.click(screen.getByRole('button', { name: 'Charger la suite' }));

    await waitFor(() => expect(onContentLoaded).toHaveBeenCalledWith('large-text', 'first block\ncontinued', 16));
    expect(readDesktopTextChunk).toHaveBeenCalledWith('/docs/large.txt', 8, 'utf-8');
    expect(container.querySelector('.code-content code')?.textContent).toBe('first block\ncontinued');
    expect(screen.queryByRole('button', { name: 'Charger la suite' })).toBeNull();
  });
});
