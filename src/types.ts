import type { DocumentTextEncoding, FileKind } from './lib/fileTypes';

export interface BrowserFileHandle {
  readonly name?: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string | Uint8Array | Blob): Promise<void>; close(): Promise<void> }>;
}

export interface OpenDocument {
  id: string;
  name: string;
  path: string;
  extension: string;
  kind: FileKind;
  content: string;
  savedContent: string;
  bytes?: Uint8Array;
  loadedBytes?: number;
  textEncoding?: DocumentTextEncoding;
  mimeType: string;
  size: number;
  modifiedAt?: number;
  truncated: boolean;
  pinned?: boolean;
  source: 'browser' | 'desktop';
  handle?: BrowserFileHandle;
}
