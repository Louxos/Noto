import type { FormatId } from '../documents/formats';
import { familyOf } from '../documents/formats';
import { DOCUMENT_OPERATIONS } from './documentOperations';
import { IMAGE_OPERATIONS } from './imageOperations';
import { OCR_OPERATIONS } from './ocrOperations';
import { PDF_OPERATIONS } from './pdfOperations';
import type { Operation, OperationCategory } from './types';

/**
 * Registre unique des opérations Noto.
 *
 * L’atelier PDF, l’atelier images, l’OCR, les traitements par lots et les
 * workflows consomment tous cette même liste : une opération est déclarée une
 * seule fois et reste donc cohérente partout.
 */

export const ALL_OPERATIONS: Operation[] = [
  ...PDF_OPERATIONS,
  ...IMAGE_OPERATIONS,
  ...OCR_OPERATIONS,
  ...DOCUMENT_OPERATIONS,
].sort((left, right) => left.label.localeCompare(right.label, 'fr'));

export interface OperationCategoryDescriptor {
  id: OperationCategory;
  label: string;
  description: string;
}

export const OPERATION_CATEGORIES: OperationCategoryDescriptor[] = [
  { id: 'pdf-pages', label: 'Pages PDF', description: 'Fusionner, découper, extraire, réordonner, faire pivoter, insérer, dupliquer.' },
  { id: 'pdf-optimize', label: 'Optimiser un PDF', description: 'Réduire le poids avec des modes annoncés, en affichant les tailles réelles avant/après.' },
  { id: 'pdf-annotate', label: 'Marquer un PDF', description: 'Filigrane, en-tête et pied de page, numérotation, signature d’image, perte du contenu caché par un vrai retrait.' },
  { id: 'pdf-secure', label: 'Retirer ou protéger', description: 'Analyse, retrait réel des passages sensibles, inspection des formulaires.' },
  { id: 'pdf-convert', label: 'Convertir un PDF', description: 'Vers images, texte, Markdown, Word, HTML, extraction des images, images vers PDF.' },
  { id: 'image-convert', label: 'Convertir des images', description: 'Changer de format et optimiser le poids, avec les formats réellement disponibles.' },
  { id: 'image-edit', label: 'Modifier des images', description: 'Redimensionner, recadrer, faire pivoter, colorer, filigraner, planches-contacts, collages, tuiles.' },
  { id: 'image-analyze', label: 'Analyser des images', description: 'Lire et retirer les métadonnées, comparer deux images par ressemblance réelle.' },
  { id: 'ocr', label: 'OCR et scans', description: 'Reconnaître le texte, créer un PDF interrogeable, nettoyer un scan.' },
  { id: 'table-convert', label: 'Tableaux', description: 'CSV, TSV, XLSX et tableaux PDF ou Markdown.' },
  { id: 'text-convert', label: 'Texte', description: 'PDF, Word, HTML et texte brut à partir de fichiers texte ou Markdown.' },
  { id: 'office-convert', label: 'Documents bureautiques', description: 'DOCX, ODT, RTF, PPTX, ODP et EPUB vers PDF ou texte, sans exécuter de macros.' },
  { id: 'compare', label: 'Comparer', description: 'Différences entre documents, rapports et vérifications.' },
  { id: 'organize', label: 'Organiser', description: 'Archives ZIP, renommage en série, rangement.' },
];

const BY_ID = new Map(ALL_OPERATIONS.map((operation) => [operation.id, operation]));

export function findOperation(id: string): Operation | undefined {
  return BY_ID.get(id);
}

export function operationsInCategory(category: OperationCategory): Operation[] {
  return ALL_OPERATIONS.filter((operation) => operation.category === category);
}

/**
 * Opérations réellement applicables à un fichier donné. C’est la détection de
 * capacités utilisée par le gestionnaire de fichiers et les traitements par
 * lots : un outil n’est proposé que si son moteur sait traiter ce format.
 */
export function operationsForFormat(format: FormatId): Operation[] {
  const family = familyOf(format);
  return ALL_OPERATIONS.filter((operation) => {
    if (operation.inputs.formats === 'any') return operation.category === 'organize';
    if (operation.inputs.formats.includes(format)) return true;
    if (family === 'image' && operation.category === 'ocr' && operation.inputs.formats.includes('jpeg')) return true;
    return false;
  });
}

/**
 * Vérifie la cohérence du registre. Appelée par les tests et au démarrage de
 * l’atelier : une opération mal déclarée doit être détectée immédiatement plutôt
 * que de produire un bouton inopérant.
 */
export function validateOperationRegistry(operations: Operation[] = ALL_OPERATIONS): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const operation of operations) {
    if (seen.has(operation.id)) problems.push(`Identifiant d’opération dupliqué : ${operation.id}`);
    seen.add(operation.id);
    if (!operation.label.trim()) problems.push(`${operation.id} : libellé manquant`);
    if (!operation.description.trim()) problems.push(`${operation.id} : description manquante`);
    if (!operation.limits.length) problems.push(`${operation.id} : aucune limite annoncée`);
    if (operation.inputs.min < 1) problems.push(`${operation.id} : minimum d’entrées inférieur à 1`);
    if (operation.inputs.max !== undefined && operation.inputs.max < operation.inputs.min) {
      problems.push(`${operation.id} : maximum d’entrées inférieur au minimum`);
    }
    if (operation.inputs.formats !== 'any' && operation.inputs.formats.length === 0) {
      problems.push(`${operation.id} : aucun format d’entrée accepté`);
    }
    if (!OPERATION_CATEGORIES.some((category) => category.id === operation.category)) {
      problems.push(`${operation.id} : catégorie inconnue « ${operation.category} »`);
    }
    if (!operation.nature) problems.push(`${operation.id} : nature de l’opération non déclarée`);
    const paramIds = new Set<string>();
    for (const param of operation.params) {
      if (paramIds.has(param.id)) problems.push(`${operation.id} : paramètre dupliqué « ${param.id} »`);
      paramIds.add(param.id);
      if (param.kind === 'select') {
        if (!param.options.length) problems.push(`${operation.id}.${param.id} : liste de choix vide`);
        if (!param.options.some((option) => option.value === param.default)) {
          problems.push(`${operation.id}.${param.id} : valeur par défaut absente des choix`);
        }
      }
      if (param.kind === 'number' && (param.default < param.min || param.default > param.max)) {
        problems.push(`${operation.id}.${param.id} : valeur par défaut hors bornes`);
      }
    }
    if (typeof operation.run !== 'function') problems.push(`${operation.id} : traitement absent`);
  }
  return problems;
}
