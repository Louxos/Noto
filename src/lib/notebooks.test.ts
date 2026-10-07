import { describe, expect, it } from 'vitest';
import { joinNotebookPath, notebookFolderName, notebookPathName } from './notebooks';

describe('notebook paths', () => {
  it('joins relative paths using the selected folder separator', () => {
    expect(joinNotebookPath('C:\\Users\\Alice\\Notes', 'sections/section-1/page.md'))
      .toBe('C:\\Users\\Alice\\Notes\\sections\\section-1\\page.md');
    expect(joinNotebookPath('/home/alice/Notes', 'attachments/page-1/image.png'))
      .toBe('/home/alice/Notes/attachments/page-1/image.png');
  });

  it('rejects absolute paths and traversal segments', () => {
    expect(() => joinNotebookPath('/notes', '../secret.md')).toThrow(/sort du dossier/i);
    expect(() => joinNotebookPath('/notes', 'sections/../../secret.md')).toThrow(/sort du dossier/i);
    expect(() => joinNotebookPath('/notes', 'C:/secret.md')).toThrow(/sort du dossier/i);
    expect(() => joinNotebookPath('', 'page.md')).toThrow(/sort du dossier/i);
  });

  it('accepts portable folder names and rejects Windows-invalid names', () => {
    expect(notebookFolderName('  Cours  ')).toBe('Cours');
    expect(() => notebookFolderName('notes/privées')).toThrow(/nom de carnet valide/i);
    expect(() => notebookFolderName('notes.')).toThrow(/nom de carnet valide/i);
    expect(() => notebookFolderName('   ')).toThrow(/nom de carnet valide/i);
  });

  it('extracts the final folder name from Windows and Unix paths', () => {
    expect(notebookPathName('C:\\Users\\Alice\\Mes notes')).toBe('Mes notes');
    expect(notebookPathName('/home/alice/Mes notes/')).toBe('Mes notes');
  });
});
