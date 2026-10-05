import { useEffect, useState, isValidElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import type { OpenDocument } from '../types';

function flattenText(value: ReactNode): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join('');
  if (isValidElement<{ children?: ReactNode }>(value)) return flattenText(value.props.children);
  return '';
}

function plainText(children: ReactNode): string {
  return flattenText(children)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function findLocalImage(source: string, current: OpenDocument | undefined, documents: OpenDocument[]): OpenDocument | undefined {
  if (!source || /^(?:[a-z]+:|\/\/|\/)/i.test(source)) return undefined;
  let relativePath: string;
  try { relativePath = decodeURIComponent(source.split(/[?#]/, 1)[0] ?? ''); }
  catch { return undefined; }
  relativePath = relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!relativePath || relativePath.split('/').includes('..')) return undefined;
  const normalizedCurrentPath = current?.path.replaceAll('\\', '/') ?? '';
  const directory = normalizedCurrentPath.split('/').slice(0, -1).join('/');
  const expected = directory ? `${directory}/${relativePath}` : relativePath;
  return documents.find((item) => item.kind === 'image' && item.path.replaceAll('\\', '/') === expected)
    ?? (!directory ? documents.find((item) => item.kind === 'image' && item.name === relativePath.split('/').pop()) : undefined);
}

function MarkdownImage({ source, alt, current, documents }: { source: string; alt: string; current?: OpenDocument; documents: OpenDocument[] }) {
  const inlineSafe = /^(data:image\/(png|jpeg|gif|webp);base64,|blob:)/i.test(source);
  const localDocument = inlineSafe ? undefined : findLocalImage(source, current, documents);
  const canInline = localDocument && !['tif', 'tiff'].includes(localDocument.extension) && Boolean(localDocument.bytes);
  const key = `${source}:${localDocument?.id ?? ''}`;
  const [objectUrl, setObjectUrl] = useState<{ key: string; url: string }>();

  useEffect(() => {
    if (!canInline || !localDocument?.bytes) return;
    const buffer = localDocument.bytes.buffer.slice(localDocument.bytes.byteOffset, localDocument.bytes.byteOffset + localDocument.bytes.byteLength) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([buffer], { type: localDocument.mimeType }));
    setObjectUrl({ key, url });
    return () => URL.revokeObjectURL(url);
  }, [canInline, key, localDocument]);

  if (inlineSafe) return <img src={source} alt={alt} loading="lazy" />;
  if (!canInline) {
    const reason = /^(?:https?:|\/\/)/i.test(source) ? 'image distante bloquée' : 'image locale non ouverte';
    return <span className="markdown-image-blocked">Image non chargée automatiquement · {alt || reason}</span>;
  }
  if (!objectUrl || objectUrl.key !== key) return <span className="markdown-image-blocked">Chargement de l’image locale…</span>;
  return <img src={objectUrl.url} alt={alt} loading="lazy" />;
}

export function MarkdownViewer({ source, document, documents = [] }: { source: string; document?: OpenDocument; documents?: OpenDocument[] }) {
  return (
    <article className="markdown-document">
      {source.trim() ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            h1: ({ children, node: _node, ...props }) => <h1 id={plainText(children)} {...props}>{children}</h1>,
            h2: ({ children, node: _node, ...props }) => <h2 id={plainText(children)} {...props}>{children}</h2>,
            h3: ({ children, node: _node, ...props }) => <h3 id={plainText(children)} {...props}>{children}</h3>,
            h4: ({ children, node: _node, ...props }) => <h4 id={plainText(children)} {...props}>{children}</h4>,
            h5: ({ children, node: _node, ...props }) => <h5 id={plainText(children)} {...props}>{children}</h5>,
            h6: ({ children, node: _node, ...props }) => <h6 id={plainText(children)} {...props}>{children}</h6>,
            a: ({ href, children, node: _node, ...props }) => {
              const external = href?.startsWith('https://') || href?.startsWith('http://');
              return <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} {...props}>{children}</a>;
            },
            img: ({ alt, src, node: _node }) => <MarkdownImage source={src ?? ''} alt={alt ?? ''} current={document} documents={documents} />,
          }}
        >
          {source}
        </ReactMarkdown>
      ) : (
        <div className="empty-document"><span>Ce document est vide.</span></div>
      )}
    </article>
  );
}
