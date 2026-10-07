import type { Sensitivity } from '@fruitfly/core';

export type DocStatus = 'queued' | 'parsing' | 'embedding' | 'ready' | 'error' | 'needs_ocr';

export interface PantryDoc {
  id: string;
  title: string;
  mime: string;
  bytes: number;
  sensitivity: Sensitivity;
  status: DocStatus;
  embedModelId: string;
  addedAt: number;
  lastUsedAt?: number;
  contentHash: string;
  chunkCount: number;
  tokens: number;
  source?: { kind: 'file' | 'paste' | 'page'; url?: string };
  error?: string;
  deleted?: boolean;
}

export interface Chunk {
  id: string;
  docId: string;
  ord: number;
  headingPath: string[];
  page?: number;
  text: string;
  tokens: number;
  /** int8-quantised unit vector; dequantise with `scale` */
  vec: Int8Array;
  scale: number;
}

export interface ProfileField { key: string; label: string; value: string; sensitivity: Sensitivity; includeInDigest: boolean; group?: string }
export interface VaultField { key: string; label: string; ciphertext: ArrayBuffer; iv: Uint8Array; requiresApproval: boolean }
export interface Note { id: string; text: string; sourceTaskId?: string; status: 'proposed' | 'kept'; sensitivity: Sensitivity; createdAt: number }

export interface Passage { id: string; docId: string; doc: string; page?: number; headingPath: string[]; text: string; sensitivity: Sensitivity; score: number }

export interface ParsedBlock { headingPath: string[]; page?: number; text: string }
export interface ParsedDoc { title: string; blocks: ParsedBlock[]; /** true when extracted text is suspiciously thin (scanned) */ thin?: boolean }

export type ProgressFn = (p: { docId: string; stage: 'parse' | 'chunk' | 'embed' | 'done'; fraction: number }) => void;

export const SCHEMA_VERSION = 3;
