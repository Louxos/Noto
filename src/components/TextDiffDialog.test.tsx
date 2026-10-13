// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OpenDocument } from '../types';
import { TextDiffDialog } from './TextDiffDialog';

afterEach(() => cleanup());

function textDocument(id: string, content: string): OpenDocument {
  return {
    id, name: `${id}.txt`, path: `/docs/${id}.txt`, extension: 'txt', kind: 'text', content, savedContent: content,
    mimeType: 'text/plain', size: content.length, truncated: false, source: 'desktop',
  };
}

describe('TextDiffDialog controls', () => {
  it('navigates between differences and wraps to the first', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { callback(0); return 1; } });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    render(<TextDiffDialog documents={[
      textDocument('a', 'same\nold\nkeep\nolder'),
      textDocument('b', 'same\nnew\nkeep\nnewer'),
    ]} initialLeftId="a" onOpenFile={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('1/2')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Différence suivante' }));
    expect(screen.getByText('2/2')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Différence suivante' }));
    expect(screen.getByText('1/2')).toBeTruthy();
  });

  it('ignores line endings by default and can include them in the diff', async () => {
    const user = userEvent.setup();
    render(<TextDiffDialog documents={[
      textDocument('windows', 'line\r\n'),
      textDocument('unix', 'line\n'),
    ]} initialLeftId="windows" onOpenFile={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText(/0 modifiées/)).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: 'Ignorer les fins de ligne' }));
    expect(screen.getByText(/1 modifiée/)).toBeTruthy();
  });
});
