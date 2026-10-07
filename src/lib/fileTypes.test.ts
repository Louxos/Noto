import { describe, expect, it } from 'vitest';
import { decodeText, getExtension, getFileKind, isProbablyText } from './fileTypes';

describe('file type helpers', () => {
  it('recognizes supported viewer families', () => {
    expect(getFileKind('README.md')).toBe('markdown');
    expect(getFileKind('config.json')).toBe('code');
    expect(getFileKind('data.csv')).toBe('csv');
    expect(getFileKind('photo.tiff')).toBe('image');
    expect(getFileKind('report.pdf')).toBe('pdf');
    expect(getFileKind('page.html')).toBe('html');
    expect(getFileKind('archive.unknown')).toBe('unknown');
    expect(getFileKind('deck.pptx')).toBe('presentation');
    expect(getFileKind('slides.odp')).toBe('presentation');
    expect(getFileKind('report.docx')).toBe('document');
    expect(getFileKind('notes.rtf')).toBe('document');
    expect(getFileKind('book.epub')).toBe('ebook');
    expect(getFileKind('sheet.tsv')).toBe('csv');
    expect(getFileKind('photo.avif')).toBe('image');
  });

  it('handles dotfiles and Windows paths', () => {
    expect(getExtension('C:\\work\\.gitignore')).toBe('gitignore');
    expect(getFileKind('.env')).toBe('code');
  });

  it('sniffs plain text without classifying binary null bytes as text', () => {
    expect(isProbablyText(new TextEncoder().encode('notes\nbonjour'))).toBe(true);
    expect(isProbablyText(new Uint8Array([0, 4, 0, 9]))).toBe(false);
    expect(isProbablyText(new Uint8Array([0xff, 0xfe, 0x62, 0, 0x6f, 0]))).toBe(true);
    expect(decodeText(new TextEncoder().encode('\uFEFFbonjour'))).toBe('bonjour');
    expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe('café');
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x62, 0, 0x6f, 0]))).toBe('bo');
  });
});
