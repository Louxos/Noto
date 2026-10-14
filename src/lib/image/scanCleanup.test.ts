import { describe, expect, it } from 'vitest';
import { contrastStretch, detectContentBox, estimateSkewAngle } from './scanCleanup';

/** Construit une image de synthèse : lignes de « texte » inclinées de 0 à 5°. */
function syntheticLines(width: number, height: number, angleDegrees: number, lineSpacing = 24, thickness = 3): Uint8Array {
  const luminance = new Uint8Array(width * height).fill(255);
  const radians = (angleDegrees * Math.PI) / 180;
  for (let line = 0; line < height / lineSpacing; line += 1) {
    const baseY = line * lineSpacing + lineSpacing;
    for (let x = 20; x < width - 20; x += 1) {
      if (x % 11 === 0 && x % 23 !== 0) continue; // simule des mots séparés
      const y = Math.round(baseY + Math.tan(radians) * (x - width / 2));
      for (let offset = 0; offset < thickness; offset += 1) {
        const target = (y + offset) * width + x;
        if (target >= 0 && target < luminance.length) luminance[target] = 20;
      }
    }
  }
  return luminance;
}

describe('nettoyage de scans', () => {
  it('estime l’inclinaison d’un texte penché', () => {
    const width = 400;
    const height = 300;
    expect(Math.abs(estimateSkewAngle(syntheticLines(width, height, 0), width, height))).toBeLessThan(0.5);
    // Un texte descendant vers la droite demande une correction négative.
    const three = estimateSkewAngle(syntheticLines(width, height, 3), width, height);
    expect(three).toBeLessThan(-1.5);
    expect(three).toBeGreaterThan(-4.5);
    const minusTwo = estimateSkewAngle(syntheticLines(width, height, -2), width, height);
    expect(minusTwo).toBeGreaterThan(1);
  });

  it('ne signale aucune inclinaison sur une image vide', () => {
    const width = 200;
    const height = 200;
    expect(estimateSkewAngle(new Uint8Array(width * height).fill(255), width, height)).toBe(0);
  });

  it('détecte la zone utile en ignorant les marges blanches', () => {
    const width = 200;
    const height = 200;
    const luminance = new Uint8Array(width * height).fill(255);
    for (let y = 40; y < 120; y += 1) {
      for (let x = 30; x < 150; x += 1) luminance[y * width + x] = 30;
    }
    const box = detectContentBox(luminance, width, height, { margin: 0 });
    expect(box).not.toBeNull();
    expect(box?.x).toBe(30);
    expect(box?.y).toBe(40);
    expect(box?.width).toBe(120);
    expect(box?.height).toBe(80);
  });

  it('ne rogne rien quand la page est entièrement blanche', () => {
    const luminance = new Uint8Array(100 * 100).fill(250);
    expect(detectContentBox(luminance, 100, 100)).toBeNull();
  });

  it('étire le contraste d’une capture grise', () => {
    const data = new Uint8ClampedArray(4 * 100);
    for (let index = 0; index < data.length; index += 4) {
      const value = 180 + (index / 4) % 20;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
    contrastStretch(data);
    const values = new Set<number>();
    for (let index = 0; index < data.length; index += 4) values.add(data[index]);
    expect(Math.min(...values)).toBeLessThan(40);
    expect(Math.max(...values)).toBeGreaterThan(230);
  });
});
