import { isTauri } from '@tauri-apps/api/core';
import type { OperationOutput } from '../operations/types';
import type { OutputLocation, OutputWriter } from './runner';
import { sanitizeFileName, uniqueFileName } from './naming';

/**
 * Écriture des fichiers produits.
 *
 * Trois destinations : un dossier choisi par l’utilisateur (application de
 * bureau), les téléchargements du navigateur, ou la mémoire (tests et aperçus).
 * Dans tous les cas, un nom déjà utilisé n’est jamais écrasé : le suffixe
 * « (2) », « (3) »… est ajouté avant écriture.
 */

export class MemoryOutputWriter implements OutputWriter {
  readonly files: { name: string; bytes: Uint8Array }[] = [];
  private taken = new Set<string>();

  async write(output: OperationOutput): Promise<OutputLocation> {
    const name = uniqueFileName(output.name, this.taken);
    this.taken.add(name.toLowerCase());
    this.files.push({ name, bytes: output.bytes });
    return { name, location: `mémoire/${name}`, size: output.bytes.length };
  }

  describe(): string {
    return 'mémoire de test';
  }
}

export class DesktopDirectoryWriter implements OutputWriter {
  private taken = new Set<string>();
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  static async create(directory: string): Promise<DesktopDirectoryWriter> {
    const writer = new DesktopDirectoryWriter(directory);
    await writer.primeNames();
    return writer;
  }

  private join(name: string): string {
    const separator = this.directory.includes('\\') && !this.directory.includes('/') ? '\\' : '/';
    const base = this.directory.replace(/[\\/]+$/u, '');
    return `${base}${separator}${name}`;
  }

  private async primeNames(): Promise<void> {
    try {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const entries = await readDir(this.directory);
      for (const entry of entries) if (entry.name) this.taken.add(entry.name.toLowerCase());
    } catch {
      // Le dossier peut ne pas encore être lisible ; les collisions restent
      // détectées juste avant chaque écriture.
    }
  }

  async write(output: OperationOutput): Promise<OutputLocation> {
    const { exists, writeFile } = await import('@tauri-apps/plugin-fs');
    const requested = sanitizeFileName(output.name);
    let name = '';
    for (let attempt = 0; attempt < 10_000 && !name; attempt += 1) {
      const candidate = uniqueFileName(requested, this.taken);
      if (!(await exists(this.join(candidate)))) name = candidate;
      else this.taken.add(candidate.toLowerCase());
    }
    if (!name) throw new Error(`Impossible de trouver un nom libre pour « ${requested} » dans ${this.directory}.`);
    const path = this.join(name);
    await writeFile(path, output.bytes);
    // Vérification réelle : la taille écrite doit correspondre aux octets fournis.
    const { stat } = await import('@tauri-apps/plugin-fs');
    const written = await stat(path);
    if (written.size !== output.bytes.length) {
      throw new Error(`Le fichier « ${name} » a été écrit avec ${written.size} octets au lieu de ${output.bytes.length}.`);
    }
    this.taken.add(name.toLowerCase());
    return { name, location: path, size: output.bytes.length };
  }

  describe(): string {
    return this.directory;
  }
}

export class BrowserDownloadWriter implements OutputWriter {
  private taken = new Set<string>();
  readonly written: { name: string; size: number }[] = [];

  async write(output: OperationOutput): Promise<OutputLocation> {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
      throw new Error('L’enregistrement de fichiers n’est pas disponible dans cet environnement.');
    }
    const name = uniqueFileName(output.name, this.taken);
    this.taken.add(name.toLowerCase());
    const blob = new Blob([toBlobPart(output.bytes)]);
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    this.written.push({ name, size: output.bytes.length });
    return { name, location: 'Téléchargements du navigateur', size: output.bytes.length };
  }

  describe(): string {
    return 'Téléchargements du navigateur';
  }
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export interface OutputDestinationChoice {
  /** Dossier choisi par l’utilisateur, disponible uniquement en application de bureau. */
  directory?: string;
  /** Force l’écriture dans les téléchargements du navigateur. */
  preferBrowser?: boolean;
}

export async function createOutputWriter(choice: OutputDestinationChoice): Promise<OutputWriter> {
  if (!choice.preferBrowser && choice.directory && isTauri()) {
    return DesktopDirectoryWriter.create(choice.directory);
  }
  if (isTauri()) {
    throw new Error('Choisissez un dossier de destination pour enregistrer les fichiers produits.');
  }
  return new BrowserDownloadWriter();
}

/** Demande un dossier de destination à l’utilisateur (application de bureau). */
export async function pickOutputDirectory(title = 'Choisir le dossier de destination'): Promise<string | undefined> {
  if (!isTauri()) return undefined;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ directory: true, multiple: false, title });
  return typeof selected === 'string' ? selected : undefined;
}

/** Ouvre l’emplacement d’un fichier produit dans l’Explorateur Windows. */
export async function revealOutput(location: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('reveal_path', { path: location });
}

export function formatSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1_000;
  let unit = 0;
  while (value >= 1_000 && unit < units.length - 1) {
    value /= 1_000;
    unit += 1;
  }
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[unit]}`;
}
