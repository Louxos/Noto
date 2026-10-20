import { describe, expect, it } from 'vitest';
import { ALL_OPERATIONS, OPERATION_CATEGORIES, findOperation, operationsForFormat, validateOperationRegistry } from './index';

describe('registre des opérations', () => {
  it('ne contient aucune incohérence déclarative', () => {
    expect(validateOperationRegistry()).toEqual([]);
  });

  it('déclare des identifiants uniques et préfixés par domaine', () => {
    const ids = ALL_OPERATIONS.map((operation) => operation.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(\.[a-z0-9-]+)+$/u);
    }
  });

  it('couvre les ateliers attendus', () => {
    const ids = new Set(ALL_OPERATIONS.map((operation) => operation.id));
    for (const required of [
      'pdf.merge', 'pdf.split', 'pdf.extract', 'pdf.remove-pages', 'pdf.rotate', 'pdf.reorder', 'pdf.duplicate', 'pdf.insert',
      'pdf.compress', 'pdf.to-images', 'pdf.to-text', 'pdf.to-markdown', 'pdf.to-docx', 'pdf.extract-images',
      'pdf.watermark', 'pdf.header-footer', 'pdf.page-numbers', 'pdf.sign-image', 'pdf.metadata-read', 'pdf.metadata-write', 'pdf.metadata-strip',
      'pdf.form-list', 'pdf.form-fill', 'pdf.redact', 'pdf.analyze', 'pdf.compare', 'images.to-pdf',
      'image.convert', 'image.optimize', 'image.edit', 'image.contact-sheet', 'image.collage', 'image.tile', 'image.variants', 'image.metadata', 'image.strip-metadata', 'image.compare',
      'ocr.image', 'ocr.pdf', 'ocr.searchable-pdf', 'scan.cleanup', 'scan.to-pdf',
      'text.to-pdf', 'text.to-docx', 'text.to-html', 'table.to-pdf', 'table.to-xlsx', 'xlsx.to-csv', 'table.to-markdown',
      'office.to-pdf', 'office.to-text', 'archive.create',
    ]) {
      expect(ids.has(required), `opération manquante : ${required}`).toBe(true);
    }
  });

  it('associe chaque catégorie de la documentation à des opérations réelles', () => {
    for (const category of OPERATION_CATEGORIES) {
      const operations = ALL_OPERATIONS.filter((operation) => operation.category === category.id);
      expect(operations.length, `catégorie sans opération : ${category.id}`).toBeGreaterThan(0);
      expect(category.label.trim().length).toBeGreaterThan(0);
      expect(category.description.trim().length).toBeGreaterThan(0);
    }
    const used = new Set(ALL_OPERATIONS.map((operation) => operation.category));
    for (const category of used) {
      expect(OPERATION_CATEGORIES.some((entry) => entry.id === category)).toBe(true);
    }
  });

  it('retrouve une opération par identifiant', () => {
    expect(findOperation('pdf.merge')?.category).toBe('pdf-pages');
    expect(findOperation('inexistant')).toBeUndefined();
  });

  it('ne propose que des outils réellement applicables au format détecté', () => {
    const pdfTools = operationsForFormat('pdf').map((operation) => operation.id);
    expect(pdfTools).toContain('pdf.merge');
    expect(pdfTools).toContain('ocr.pdf');
    expect(pdfTools).not.toContain('image.convert');

    const pngTools = operationsForFormat('png').map((operation) => operation.id);
    expect(pngTools).toContain('image.convert');
    expect(pngTools).toContain('ocr.image');
    expect(pngTools).not.toContain('pdf.merge');

    const csvTools = operationsForFormat('csv').map((operation) => operation.id);
    expect(csvTools).toContain('table.to-xlsx');
    expect(csvTools).not.toContain('image.edit');

    const docxTools = operationsForFormat('docx').map((operation) => operation.id);
    expect(docxTools).toContain('office.to-pdf');
    expect(docxTools).toContain('office.to-text');
  });

  it('annonce toujours la nature du travail effectué', () => {
    for (const operation of ALL_OPERATIONS) {
      expect(['native', 'overlay', 'rebuild', 'measure']).toContain(operation.nature);
    }
    // Le retrait de contenu (redaction) ne peut pas être présenté comme une
    // simple mesure : il reconstruit réellement les pages concernées.
    expect(findOperation('pdf.redact')?.nature).toBe('rebuild');
    // Une extraction de texte ne modifie rien : elle mesure.
    expect(findOperation('pdf.to-text')?.nature).toBe('measure');
  });
});
