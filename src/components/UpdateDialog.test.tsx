// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Update } from '@tauri-apps/plugin-updater';
import { UpdateDialog, formatUpdateBytes } from './UpdateDialog';

const update = {
  currentVersion: '1.1.0',
  version: '1.2.0',
  body: 'Mises à jour intégrées et vérifiées.\n\n• Téléchargement après accord.',
} as Update;

afterEach(() => cleanup());

const defaults = {
  update,
  language: 'fr' as const,
  phase: 'available' as const,
  downloadedBytes: 0,
  contentLength: null,
  error: '',
  onInstall: vi.fn(),
  onDismiss: vi.fn(),
};

describe('UpdateDialog', () => {
  it('présente la nouvelle version et demande un accord explicite avant le téléchargement', () => {
    const onInstall = vi.fn();
    render(<UpdateDialog {...defaults} onInstall={onInstall} />);

    expect(screen.getByRole('dialog', { name: 'Une version plus récente est prête' })).toBeTruthy();
    expect(screen.getByText('v1.1.0')).toBeTruthy();
    expect(screen.getByText('v1.2.0')).toBeTruthy();
    expect(screen.getByText(/Mises à jour intégrées et vérifiées/)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Télécharger et installer' }));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it('n’affiche une barre déterminée qu’avec la taille réelle et les octets reçus', () => {
    const { rerender } = render(<UpdateDialog {...defaults} phase="downloading" downloadedBytes={1_024} contentLength={4_096} />);
    const progress = screen.getByRole('progressbar', { name: 'Progression réelle du téléchargement' });
    expect(progress.getAttribute('aria-valuenow')).toBe('1024');
    expect(progress.getAttribute('aria-valuemax')).toBe('4096');
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('1.0 KB sur 4.0 KB')).toBeTruthy();

    rerender(<UpdateDialog {...defaults} phase="downloading" downloadedBytes={2_048} contentLength={null} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('2.0 KB reçus · taille totale inconnue')).toBeTruthy();
  });

  it('montre une étape de vérification/installation sans inventer de pourcentage', () => {
    render(<UpdateDialog {...defaults} phase="installing" downloadedBytes={4_096} contentLength={4_096} />);
    expect(screen.getByText('Vérification cryptographique en cours')).toBeTruthy();
    expect(screen.getByText(/l’installeur NSIS officiel affiche sa progression réelle/i)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('préserve l’installation actuelle et permet une nouvelle tentative après un échec', () => {
    const onInstall = vi.fn();
    const onDismiss = vi.fn();
    render(<UpdateDialog {...defaults} phase="error" error="Signature invalide" onInstall={onInstall} onDismiss={onDismiss} />);
    expect(screen.getByRole('alert').textContent).toContain('Signature invalide');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fermer' })[1]);
    expect(onInstall).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('formate les octets reçus de façon stable', () => {
    expect(formatUpdateBytes(0)).toBe('0 B');
    expect(formatUpdateBytes(1_024)).toBe('1.0 KB');
    expect(formatUpdateBytes(1_048_576)).toBe('1.0 MB');
  });
});
