/**
 * Nettoyage de scans et de photos de documents.
 *
 * Le cœur de ce module est calculé sur des tableaux de luminance : les
 * algorithmes (estimation d’inclinaison, détection des marges, étirement du
 * contraste, débruitage) sont donc testables sans interface graphique, puis
 * appliqués au canevas pour produire un résultat visible.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function luminanceFromRgba(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const luminance = new Uint8Array(width * height);
  for (let index = 0, pixel = 0; pixel < width * height; pixel += 1, index += 4) {
    luminance[pixel] = Math.round(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]);
  }
  return luminance;
}

/**
 * Estime l’inclinaison d’un document en cherchant l’angle qui rend les lignes
 * de texte les plus nettes (variance maximale du profil de projection).
 * C’est une estimation : elle est affichée à l’utilisateur avant application,
 * et une image sans texte structuré renvoie 0.
 */
export function estimateSkewAngle(
  luminance: Uint8Array,
  width: number,
  height: number,
  options: { maxAngle?: number; step?: number } = {},
): number {
  const maxAngle = options.maxAngle ?? 4;
  const step = options.step ?? 0.25;
  if (width < 16 || height < 16 || luminance.length < width * height) return 0;

  // Réduction pour rester rapide : largeur maximale de 500 pixels.
  const scale = Math.min(1, 500 / width);
  const smallWidth = Math.max(16, Math.round(width * scale));
  const smallHeight = Math.max(16, Math.round(height * scale));
  const small = new Uint8Array(smallWidth * smallHeight);
  for (let y = 0; y < smallHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.round(y / scale));
    for (let x = 0; x < smallWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.round(x / scale));
      small[y * smallWidth + x] = luminance[sourceY * width + sourceX];
    }
  }

  // Seuil adaptatif : tout ce qui est nettement plus sombre que le fond compte
  // comme encre.
  let sum = 0;
  for (const value of small) sum += value;
  const mean = sum / small.length;
  let variance = 0;
  for (const value of small) variance += (value - mean) ** 2;
  const deviation = Math.sqrt(variance / small.length);
  const threshold = Math.max(24, mean - deviation * 0.6);

  const BIN_COUNT = 1024;
  let bestAngle = 0;
  let bestScore = -1;
  for (let angle = -maxAngle; angle <= maxAngle + 1e-9; angle += step) {
    const radians = (angle * Math.PI) / 180;
    const sin = Math.sin(radians);
    const cos = Math.cos(radians);
    // Projection de l’encre sur un axe fixe (nombre de cases constant, sinon
    // la comparaison entre angles serait faussée).
    const raw = (y: number, x: number) => y * cos + x * sin;
    const minRaw = Math.min(raw(0, 0), raw(smallHeight - 1, 0), raw(0, smallWidth - 1), raw(smallHeight - 1, smallWidth - 1));
    const maxRaw = Math.max(raw(0, 0), raw(smallHeight - 1, 0), raw(0, smallWidth - 1), raw(smallHeight - 1, smallWidth - 1));
    const span = Math.max(1e-6, maxRaw - minRaw);
    const bins = new Float64Array(BIN_COUNT);
    let ink = 0;
    for (let y = 0; y < smallHeight; y += 1) {
      for (let x = 0; x < smallWidth; x += 1) {
        if (small[y * smallWidth + x] > threshold) continue;
        const position = Math.round(((raw(y, x) - minRaw) / span) * (BIN_COUNT - 1));
        if (position < 0 || position >= BIN_COUNT) continue;
        bins[position] += 1;
        ink += 1;
      }
    }
    if (ink < 10) continue;
    // Énergie : maximale quand les lignes de texte se concentrent dans peu de
    // cases, c’est-à-dire quand l’axe est parallèle aux lignes.
    let energy = 0;
    for (const value of bins) energy += value * value;
    // Léger avantage aux petits angles en cas d’égalité.
    const score = energy / (1 + Math.abs(angle) * 0.001);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  // Convention : l’angle renvoyé est la correction à appliquer au canevas
  // (rotation positive = sens horaire), directement utilisable sans signe
  // supplémentaire.
  const rounded = Math.round(bestAngle * 100) / 100;
  return Math.abs(rounded) < 0.25 ? 0 : rounded;
}

/** Détecte la zone utile du document en ignorant les marges claires. */
export function detectContentBox(
  luminance: Uint8Array,
  width: number,
  height: number,
  options: { threshold?: number; margin?: number } = {},
): BoundingBox | null {
  if (width < 4 || height < 4) return null;
  let sum = 0;
  for (const value of luminance) sum += value;
  const mean = sum / luminance.length;
  const threshold = options.threshold ?? Math.min(245, Math.max(mean - 12, 200));
  const margin = options.margin ?? 4;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (luminance[y * width + x] >= threshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  if (boxWidth * boxHeight < width * height * 0.01) return null;
  const paddedX = Math.max(0, minX - margin);
  const paddedY = Math.max(0, minY - margin);
  return {
    x: paddedX,
    y: paddedY,
    width: Math.min(width - paddedX, boxWidth + margin * 2),
    height: Math.min(height - paddedY, boxHeight + margin * 2),
  };
}

/** Étire le contraste entre deux centiles pour blanchir le fond du papier. */
export function contrastStretch(data: Uint8ClampedArray, lowPercentile = 0.05, highPercentile = 0.95): void {
  const histogram = new Uint32Array(256);
  for (let index = 0; index < data.length; index += 4) {
    const value = Math.round(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]);
    histogram[value] += 1;
  }
  const total = data.length / 4;
  let low = 0;
  let high = 255;
  let cumulative = 0;
  for (let value = 0; value < 256; value += 1) {
    cumulative += histogram[value];
    if (cumulative / total >= lowPercentile) {
      low = value;
      break;
    }
  }
  cumulative = 0;
  for (let value = 255; value >= 0; value -= 1) {
    cumulative += histogram[value];
    if (cumulative / total >= 1 - highPercentile) {
      high = value;
      break;
    }
  }
  if (high - low < 12) return;
  const scale = 255 / (high - low);
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      data[index + channel] = Math.max(0, Math.min(255, Math.round((data[index + channel] - low) * scale)));
    }
  }
}

/** Débruitage médian 3 × 3 sur les canaux de couleur. */
export function medianDenoise(data: Uint8ClampedArray, width: number, height: number): void {
  const copy = new Uint8ClampedArray(data);
  const window: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        window.length = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            window.push(copy[((y + dy) * width + (x + dx)) * 4 + channel]);
          }
        }
        window.sort((left, right) => left - right);
        data[target + channel] = window[4];
      }
    }
  }
}

export interface ScanCleanupOptions {
  deskew: boolean;
  trimMargins: boolean;
  contrast: boolean;
  denoise: boolean;
  grayscale: boolean;
  maxAngle: number;
}

export interface ScanCleanupInfo {
  angle: number;
  trimmed: boolean;
  applied: string[];
  width: number;
  height: number;
}

/** Applique le nettoyage au canevas et renvoie un nouveau canevas plus les mesures réelles. */
export async function cleanScanCanvas(source: HTMLCanvasElement, options: ScanCleanupOptions): Promise<{ canvas: HTMLCanvasElement; info: ScanCleanupInfo }> {
  const { createCanvas, context2d } = await import('./imageEngine');
  const context = context2d(source, true);
  const imageData = context.getImageData(0, 0, source.width, source.height);
  const applied: string[] = [];
  let angle = 0;

  if (options.denoise) {
    medianDenoise(imageData.data, source.width, source.height);
    applied.push('débruitage médian');
  }
  if (options.contrast) {
    contrastStretch(imageData.data);
    applied.push('étirement du contraste');
  }
  if (options.grayscale) {
    for (let index = 0; index < imageData.data.length; index += 4) {
      const value = Math.round(0.299 * imageData.data[index] + 0.587 * imageData.data[index + 1] + 0.114 * imageData.data[index + 2]);
      imageData.data[index] = value;
      imageData.data[index + 1] = value;
      imageData.data[index + 2] = value;
    }
    applied.push('niveaux de gris');
  }

  if (options.deskew) {
    const luminance = luminanceFromRgba(imageData.data, source.width, source.height);
    angle = estimateSkewAngle(luminance, source.width, source.height, { maxAngle: options.maxAngle, step: 0.25 });
    if (angle !== 0) applied.push(`redressement estimé de ${angle}°`);
  }

  let box: BoundingBox | null = null;
  if (options.trimMargins) {
    const luminance = luminanceFromRgba(imageData.data, source.width, source.height);
    box = detectContentBox(luminance, source.width, source.height);
    if (box && (box.width < source.width || box.height < source.height)) applied.push('suppression des marges');
  }

  const output = createCanvas(source.width, source.height);
  const outputContext = context2d(output);
  outputContext.fillStyle = '#ffffff';
  outputContext.fillRect(0, 0, output.width, output.height);
  outputContext.save();
  if (angle !== 0) {
    // `angle` est déjà la correction à appliquer (convention du canevas).
    outputContext.translate(output.width / 2, output.height / 2);
    outputContext.rotate((angle * Math.PI) / 180);
    outputContext.translate(-output.width / 2, -output.height / 2);
  }
  const scratch = createCanvas(source.width, source.height);
  context2d(scratch).putImageData(imageData, 0, 0);
  outputContext.drawImage(scratch, 0, 0);
  outputContext.restore();
  scratch.width = 0;
  scratch.height = 0;

  if (box) {
    const cropped = createCanvas(box.width, box.height);
    context2d(cropped).drawImage(output, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    output.width = 0;
    output.height = 0;
    return {
      canvas: cropped,
      info: { angle, trimmed: true, applied, width: cropped.width, height: cropped.height },
    };
  }

  return { canvas: output, info: { angle, trimmed: false, applied, width: output.width, height: output.height } };
}
