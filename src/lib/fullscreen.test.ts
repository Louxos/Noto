// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectFullscreenKind,
  enterFullscreen,
  exitFullscreen,
  fullscreenSupport,
  onDocumentFullscreenChange,
} from './fullscreen';

/**
 * Ces tests couvrent le niveau « document » (navigateur). Le niveau
 * « fenêtre » (Tauri) n’est pas exerçable ici : il appelle la fenêtre native et
 * ne se vérifie donc que dans l’application de bureau.
 */
function stubFullscreenApi() {
  let element: Element | null = null;
  const requestFullscreen = vi.fn(() => {
    // L’API est appelée sur l’élément racine du document.
    element = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  const exitFullscreen = vi.fn(() => {
    element = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: requestFullscreen });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  return { requestFullscreen, exitFullscreen };
}

afterEach(() => {
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  Reflect.deleteProperty(document, 'exitFullscreen');
  Reflect.deleteProperty(document, 'fullscreenElement');
});

describe('plein écran', () => {
  it('déclare le plein écran indisponible quand le navigateur ne le propose pas', () => {
    expect(fullscreenSupport()).toEqual({ supported: false, kind: null });
  });

  it('refuse explicitement plutôt que de faire semblant', async () => {
    await expect(enterFullscreen()).rejects.toThrow('pas disponible');
  });

  it('utilise le document quand l’API existe, et suit son état réel', async () => {
    const api = stubFullscreenApi();
    expect(fullscreenSupport()).toEqual({ supported: true, kind: 'document' });
    expect(await detectFullscreenKind()).toBeNull();

    const changes: string[] = [];
    const unsubscribe = onDocumentFullscreenChange(() => changes.push('change'));

    expect(await enterFullscreen()).toBe('document');
    expect(api.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(await detectFullscreenKind()).toBe('document');
    expect(changes.length).toBeGreaterThan(0);

    await exitFullscreen('document');
    expect(api.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(await detectFullscreenKind()).toBeNull();

    unsubscribe();
    const before = changes.length;
    await enterFullscreen();
    expect(changes.length).toBe(before);
  });

  it('ne sort pas du plein écran document s’il n’est pas actif', async () => {
    const api = stubFullscreenApi();
    await exitFullscreen('document');
    expect(api.exitFullscreen).not.toHaveBeenCalled();
    await exitFullscreen(null);
    expect(api.exitFullscreen).not.toHaveBeenCalled();
  });
});
