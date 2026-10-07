import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import {
  Bold, Check, Code2, FilePlus2, Heading1, Heading2, ImagePlus, Italic, Link2, List, ListOrdered,
  Paperclip, Quote, Redo2, TextCursorInput, Undo2, Eye,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

export interface NotebookAttachment {
  name: string;
  relativePath: string;
  url?: string;
}

export interface NotebookFileReference {
  name: string;
  path: string;
}

interface NotebookEditorProps {
  pageId: string;
  value: string;
  assetUrls: Record<string, string>;
  saveState: 'saved' | 'saving' | 'error';
  onChange: (markdown: string) => void;
  onAttachFile: () => Promise<NotebookAttachment | null>;
  onChooseFile: () => Promise<NotebookFileReference | null>;
  onOpenFile: (path: string) => void;
  onOpenAttachment: (relativePath: string) => void;
}

type EditorMode = 'rich' | 'markdown' | 'preview';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markdownForEditor(markdown: string, assetUrls: Record<string, string>): string {
  let result = markdown;
  for (const [relativePath, url] of Object.entries(assetUrls)) {
    const escaped = escapeRegExp(relativePath.replaceAll('\\', '/'));
    result = result.replace(new RegExp(`(?<=\\()\\.\\/${escaped}(?=[)#?])`, 'g'), url)
      .replace(new RegExp(`(?<=\\()${escaped}(?=[)#?])`, 'g'), url);
  }
  return result;
}

function markdownForDisk(markdown: string, assetUrls: Record<string, string>): string {
  let result = markdown;
  for (const [relativePath, url] of Object.entries(assetUrls)) {
    result = result.replaceAll(url, `./${relativePath.replaceAll('\\', '/')}`);
  }
  return result;
}

export function NotebookMarkdownPreview({
  markdown, assetUrls, onOpenFile, onOpenAttachment,
}: {
  markdown: string;
  assetUrls: Record<string, string>;
  onOpenFile: (path: string) => void;
  onOpenAttachment: (relativePath: string) => void;
}) {
  return <article className="markdown-document notebook-markdown-preview">
    {markdown.trim() ? <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        a: ({ href, children, node: _node, ...props }) => {
          if (href?.startsWith('noto-file:')) {
            let path = '';
            try { path = decodeURIComponent(href.slice('noto-file:'.length)); } catch { /* Invalid reference stays inert. */ }
            return <button className="notebook-file-reference" type="button" onClick={() => { if (path) onOpenFile(path); }}><FilePlus2 size={15} /><span>{children}</span><small>Ouvrir dans le visualiseur</small></button>;
          }
          if (href?.startsWith('./attachments/')) {
            const relativePath = href.slice(2);
            return <button className="notebook-file-reference" type="button" onClick={() => onOpenAttachment(relativePath)}><Paperclip size={15} /><span>{children}</span><small>Pièce jointe du carnet</small></button>;
          }
          const external = href?.startsWith('https://') || href?.startsWith('http://');
          return <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} {...props}>{children}</a>;
        },
        img: ({ src, alt }) => {
          const key = src?.replace(/^\.\//, '').replaceAll('\\', '/') ?? '';
          const url = assetUrls[key];
          return url ? <img src={url} alt={alt ?? ''} loading="lazy" /> : <span className="markdown-image-blocked">Pièce jointe indisponible · {alt || key}</span>;
        },
      }}
    >{markdown}</ReactMarkdown> : <div className="notebook-page-empty"><span>Cette page est vide.</span><small>Écrivez une note ou choisissez un mode d’édition.</small></div>}
  </article>;
}

function NotebookToolbar({ editor, onAttach, onLinkFile }: {
  editor: Editor | null;
  onAttach: () => void;
  onLinkFile: () => void;
}) {
  if (!editor) return null;
  const button = (label: string, icon: ReactNode, action: () => void, active = false, disabled = false) => (
    <button className={`notebook-format-button ${active ? 'active' : ''}`} type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={action}>{icon}</button>
  );
  return <div className="notebook-format-toolbar" role="toolbar" aria-label="Mise en forme de la page">
    {button('Gras', <Bold size={15} />, () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
    {button('Italique', <Italic size={15} />, () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
    <span className="notebook-toolbar-divider" />
    {button('Titre 1', <Heading1 size={16} />, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
    {button('Titre 2', <Heading2 size={16} />, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
    {button('Liste à puces', <List size={15} />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
    {button('Liste numérotée', <ListOrdered size={15} />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
    {button('Citation', <Quote size={15} />, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}
    {button('Bloc de code', <Code2 size={15} />, () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
    <span className="notebook-toolbar-divider" />
    {button('Insérer une image ou une pièce jointe', <ImagePlus size={15} />, onAttach)}
    {button('Référencer un fichier Noto', <Link2 size={15} />, onLinkFile)}
    <span className="notebook-toolbar-spacer" />
    {button('Annuler', <Undo2 size={15} />, () => editor.chain().focus().undo().run(), false, !editor.can().undo())}
    {button('Rétablir', <Redo2 size={15} />, () => editor.chain().focus().redo().run(), false, !editor.can().redo())}
  </div>;
}

export function NotebookEditor({
  pageId, value, assetUrls, saveState, onChange, onAttachFile, onChooseFile, onOpenFile, onOpenAttachment,
}: NotebookEditorProps) {
  const [mode, setMode] = useState<EditorMode>('rich');
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const externalValue = useRef(value);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          markdownLinks: true,
          protocols: ['noto-file'],
          isAllowedUri: (uri, context) => uri.startsWith('noto-file:') || uri.startsWith('./attachments/') || uri.startsWith('attachments/') || context.defaultValidate(uri),
        },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Markdown,
    ],
    content: markdownForEditor(value, assetUrls),
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: { attributes: { class: 'notebook-rich-editor', 'aria-label': 'Contenu de la page du carnet' } },
    onUpdate: ({ editor: current }) => {
      const markdown = markdownForDisk(current.getMarkdown(), assetUrls);
      externalValue.current = markdown;
      onChange(markdown);
    },
  }, [pageId]);

  const pageKey = useRef(pageId);
  const assetKey = Object.entries(assetUrls).map(([path, url]) => `${path}:${url}`).join('|');
  const syncedAssets = useRef('');
  useEffect(() => {
    if (!editor) return;
    const pageChanged = pageKey.current !== pageId;
    const contentChangedOutsideRichEditor = value !== externalValue.current;
    const assetsChanged = syncedAssets.current !== assetKey;
    if (pageChanged || contentChangedOutsideRichEditor || assetsChanged) {
      editor.commands.setContent(markdownForEditor(value, assetUrls), { contentType: 'markdown', emitUpdate: false });
      pageKey.current = pageId;
      externalValue.current = value;
      syncedAssets.current = assetKey;
    }
  }, [assetKey, assetUrls, editor, mode, pageId, value]);

  const insertMarkdownAtCaret = useCallback((markdown: string) => {
    const input = sourceRef.current;
    if (!input) { onChange(`${value}${value ? '\n\n' : ''}${markdown}`); return; }
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    const next = `${value.slice(0, start)}${markdown}${value.slice(end)}`;
    onChange(next);
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + markdown.length, start + markdown.length);
    });
  }, [onChange, value]);

  const insertAttachment = useCallback(async () => {
    try {
      const attachment = await onAttachFile();
      if (!attachment) return;
      const relative = `./${attachment.relativePath}`;
      const markdown = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(attachment.name)
        ? `![${attachment.name.replace(/[\[\]]/g, '')}](${relative})`
        : `[${attachment.name.replace(/[\[\]]/g, '')}](${relative})`;
      if (mode === 'rich' && editor) {
        if (markdown.startsWith('![')) {
          editor.chain().focus().setImage({ src: attachment.url ?? assetUrls[attachment.relativePath] ?? relative, alt: attachment.name }).run();
        } else {
          editor.chain().focus().insertContent({ type: 'text', text: attachment.name, marks: [{ type: 'link', attrs: { href: relative } }] }).run();
        }
      } else insertMarkdownAtCaret(markdown);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Impossible d’ajouter cette pièce jointe.');
    }
  }, [assetUrls, editor, insertMarkdownAtCaret, mode, onAttachFile]);

  const insertFileReference = useCallback(async () => {
    try {
      const file = await onChooseFile();
      if (!file) return;
      const href = `noto-file:${encodeURIComponent(file.path)}`;
      if (mode === 'rich' && editor) {
        editor.chain().focus().insertContent({ type: 'text', text: file.name, marks: [{ type: 'link', attrs: { href } }] }).run();
      } else insertMarkdownAtCaret(`[${file.name.replace(/[\[\]]/g, '')}](${href})`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Impossible de créer le lien vers ce fichier.');
    }
  }, [editor, insertMarkdownAtCaret, mode, onChooseFile]);

  const onEditorClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const anchor = event.target instanceof Element ? event.target.closest('a') : null;
    const href = anchor?.getAttribute('href');
    if (!href) return;
    if (href.startsWith('noto-file:')) {
      event.preventDefault();
      try { onOpenFile(decodeURIComponent(href.slice('noto-file:'.length))); } catch { /* Invalid links remain inert. */ }
    }
  }, [onOpenFile]);

  return <div className="notebook-editor-shell">
    <div className="notebook-editor-topline">
      <div className="segmented-control notebook-mode-toggle" role="tablist" aria-label="Mode de la page">
        <button className={mode === 'rich' ? 'selected' : ''} type="button" role="tab" aria-selected={mode === 'rich'} onClick={() => setMode('rich')}><Check size={13} />Riche</button>
        <button className={mode === 'markdown' ? 'selected' : ''} type="button" role="tab" aria-selected={mode === 'markdown'} onClick={() => setMode('markdown')}><TextCursorInput size={13} />Markdown</button>
        <button className={mode === 'preview' ? 'selected' : ''} type="button" role="tab" aria-selected={mode === 'preview'} onClick={() => setMode('preview')}><Eye size={13} />Aperçu</button>
      </div>
      <span className={`notebook-save-indicator state-${saveState}`} role="status">
        {saveState === 'saving' ? 'Enregistrement…' : saveState === 'error' ? 'Enregistrement impossible' : 'Enregistré sur cet appareil'}
      </span>
    </div>

    {mode === 'rich' && <>
      <NotebookToolbar editor={editor} onAttach={() => void insertAttachment()} onLinkFile={() => void insertFileReference()} />
      <div className="notebook-rich-scroll" onClick={onEditorClick}>
        <EditorContent editor={editor} />
      </div>
    </>}
    {mode === 'markdown' && <div className="notebook-source-wrap">
      <div className="notebook-source-toolbar">
        <span><TextCursorInput size={14} />Fichier Markdown local</span>
        <button className="subtle-button" type="button" onClick={() => void insertAttachment()}><ImagePlus size={13} />Pièce jointe</button>
        <button className="subtle-button" type="button" onClick={() => void insertFileReference()}><Link2 size={13} />Lien vers un fichier</button>
      </div>
      <textarea ref={sourceRef} className="notebook-markdown-source" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Source Markdown de la page" spellCheck />
    </div>}
    {mode === 'preview' && <div className="notebook-preview-scroll">
      <NotebookMarkdownPreview markdown={value} assetUrls={assetUrls} onOpenFile={onOpenFile} onOpenAttachment={onOpenAttachment} />
    </div>}
  </div>;
}
