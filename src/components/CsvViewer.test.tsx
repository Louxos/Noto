// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CsvViewer } from './CsvViewer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CsvViewer interaction', () => {
  it('exports only selected rows, with the header and original delimiter', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:noto-test');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<CsvViewer fileName="contacts.csv" content={'name;note\nAda;"hello; world"\nLinus;ok'} />);

    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner la ligne 2' }));
    await user.click(screen.getByRole('button', { name: 'Exporter la sélection (1)' }));

    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0];
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blob.arrayBuffer())).toBe('\uFEFFname;note\r\nAda;"hello; world"');
  });

  it('supports keyboard resizing of columns', async () => {
    const user = userEvent.setup();
    render(<CsvViewer content="name,value\nAda,1" />);
    const resizer = screen.getByRole('separator', { name: 'Redimensionner name' });

    resizer.focus();
    await user.keyboard('{ArrowRight}');
    expect(resizer.getAttribute('aria-valuenow')).toBe('200');

    await user.keyboard('{ArrowLeft}');
    expect(resizer.getAttribute('aria-valuenow')).toBe('190');
  });
});
