import { describe, expect, it } from 'vitest';
import { immersiveOpenNotice, opensInImmersive, type OpenGesture } from './launchMode';

describe('mode immersion à l’ouverture', () => {
  it('active l’immersion pour un fichier transmis par Windows', () => {
    expect(opensInImmersive('launch', true)).toBe(true);
    expect(opensInImmersive('handoff', true)).toBe(true);
  });

  it('ne touche pas à l’affichage pour un fichier choisi dans Noto', () => {
    expect(opensInImmersive('dialog', true)).toBe(false);
    expect(opensInImmersive('drop', true)).toBe(false);
  });

  it('respecte le réglage désactivé, quel que soit le geste', () => {
    const gestures: OpenGesture[] = ['launch', 'handoff', 'dialog', 'drop'];
    expect(gestures.map((gesture) => opensInImmersive(gesture, false))).toEqual([false, false, false, false]);
  });

  it('annonce ce qui a réellement lieu, au singulier comme au pluriel', () => {
    expect(immersiveOpenNotice(1)).toContain('Fichier ouvert depuis Windows');
    expect(immersiveOpenNotice(3)).toContain('3 fichiers ouverts depuis Windows');
    expect(immersiveOpenNotice(2)).toContain('Échap');
  });
});
