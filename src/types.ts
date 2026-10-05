import type { FileKind } from './lib/fileTypes';

export interface BrowserFileHandle {
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
  mimeType: string;
  size: number;
  truncated: boolean;
  source: 'browser' | 'desktop';
  handle?: BrowserFileHandle;
}
