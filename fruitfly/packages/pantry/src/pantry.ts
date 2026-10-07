import { FruitflyError, contentHash, estimateTokens, newId, type Sensitivity } from '@fruitfly/core';
import { chunkDocument } from './chunker';
import { type Embedder, dequantize, l2normalize, quantize } from './embed/embedder';
import { HashingEmbedder } from './embed/hashing';
import { HybridIndex } from './index-hybrid';
import { type FileLike, parseFile } from './parsers';
import type { PdfOptions } from './parsers/binary';
import { parseHtml } from './parsers/html';
import { parseCsv, parseMarkdown, parsePlain } from './parsers/text';
import { RetrievalPlanner, type PlanInput, type RetrievalResult } from './retrieval';
import { MemoryPantryStore, type PantryStore } from './store';
import type { Chunk, PantryDoc, ParsedDoc, ProgressFn } from './types';
import { NotesManager, ProfileManager } from './profile';
import { Vault, type VaultOptions } from './vault';
import { exportBackup, importBackup } from './backup';

/** Result of the heavy part of ingestion (parse + chunk + embed). Plain data, so it can cross a Worker boundary. */
export interface PreparedDoc {
  title: string; mime: string; bytes: number; contentHash: string; embedModelId: string;
  status: 'ready' | 'needs_ocr';
  chunks: { ord: number; headingPath: string[]; page?: number; text: string; tokens: number; vec: Int8Array; scale: number }[];
  source?: PantryDoc['source'];
}

/** Parse → chunk → embed without touching storage. Runs in a Web Worker in the extension. */
export async function prepareFile(file: FileLike, embedder: Embedder, o: { pdf?: PdfOptions; onProgress?: (stage: 'parse' | 'chunk' | 'embed', fraction: number) => void; signal?: AbortSignal } = {}): Promise<PreparedDoc> {
  const { parsed, mime } = await parseFile(file, { pdf: o.pdf, onPage: (d, t) => o.onProgress?.('parse', d / t) });
  return prepareParsed(parsed, mime, file.size, embedder, o);
}

export async function prepareParsed(parsed: ParsedDoc, mime: string, bytes: number, embedder: Embedder, o: { onProgress?: (stage: 'parse' | 'chunk' | 'embed', fraction: number) => void; signal?: AbortSignal; source?: PantryDoc['source'] } = {}): Promise<PreparedDoc> {
  const hash = contentHash(parsed.blocks.map((b) => b.text).join('\n'));
  if (parsed.thin && !parsed.blocks.length) return { title: parsed.title, mime, bytes, contentHash: hash, embedModelId: embedder.id, status: 'needs_ocr', chunks: [], source: o.source };
  o.onProgress?.('chunk', 0.5);
  const drafts = chunkDocument(parsed);
  const vectors = await embedder.embed(drafts.map((c) => c.indexText), { signal: o.signal, onProgress: (d, t) => o.onProgress?.('embed', d / t) });
  const chunks = drafts.map((c, i) => { const q = quantize(vectors[i]!); return { ord: c.ord, headingPath: c.headingPath, page: c.page, text: c.text, tokens: c.tokens, vec: q.vec, scale: q.scale }; });
  return { title: parsed.title, mime, bytes, contentHash: hash, embedModelId: embedder.id, status: parsed.thin && chunks.length < 2 ? 'needs_ocr' : 'ready', chunks, source: o.source };
}

export interface PantryOptions { store?: PantryStore; embedder?: Embedder; vault?: VaultOptions; onProgress?: ProgressFn; pdf?: Parameters<typeof parseFile>[1] extends infer O ? (O extends { pdf?: infer P } ? P : never) : never; now?: () => number }

/** The whole Pantry, on-device: documents, chunks, vectors, profile, notes, vault. */
export class Pantry {
  readonly store: PantryStore;
  readonly index: HybridIndex;
  readonly planner: RetrievalPlanner;
  readonly profile: ProfileManager;
  readonly notes: NotesManager;
  readonly vault: Vault;
  private embedder: Embedder;
  private opts: PantryOptions;
  private loaded = false;

  constructor(opts: PantryOptions = {}) {
    this.opts = opts;
    this.store = opts.store ?? new MemoryPantryStore();
    this.embedder = opts.embedder ?? new HashingEmbedder();
    this.index = new HybridIndex(this.embedder);
    this.planner = new RetrievalPlanner(this.index);
    this.profile = new ProfileManager(this.store);
    this.notes = new NotesManager(this.store, opts.now);
    this.vault = new Vault(this.store, opts.vault);
  }

  get embedderId(): string { return this.embedder.id; }
  get embedderInfo(): { id: string; locality: Embedder['locality'] } { return { id: this.embedder.id, locality: this.embedder.locality }; }

  /** Load persisted chunks into the in-memory index. Cheap enough to call lazily. */
  async load(): Promise<void> {
    if (this.loaded) return;
    const [docs, chunks] = await Promise.all([this.store.listDocs(), this.store.allChunks()]);
    this.index.clear();
    const by = new Map<string, Chunk[]>(); for (const c of chunks) (by.get(c.docId) ?? by.set(c.docId, []).get(c.docId)!).push(c);
    for (const d of docs) { if (d.deleted) continue; this.index.add(d, (by.get(d.id) ?? []).filter((c) => c.vec.length === this.embedder.dim)); }
    this.loaded = true;
  }

  async list(): Promise<PantryDoc[]> { return (await this.store.listDocs()).filter((d) => !d.deleted).sort((a, b) => b.addedAt - a.addedAt); }

  async addFile(file: FileLike, o: { sensitivity?: Sensitivity; source?: PantryDoc['source']; signal?: AbortSignal } = {}): Promise<PantryDoc> {
    await this.load();
    const id = newId('doc');
    const draft: PantryDoc = { id, title: file.name.replace(/\.[^.]+$/, ''), mime: 'application/octet-stream', bytes: file.size, sensitivity: o.sensitivity ?? 'personal', status: 'parsing', embedModelId: this.embedder.id, addedAt: (this.opts.now ?? Date.now)(), contentHash: '', chunkCount: 0, tokens: 0, source: o.source ?? { kind: 'file' } };
    await this.store.putDoc(draft);
    this.opts.onProgress?.({ docId: id, stage: 'parse', fraction: 0 });
    try {
      const prepared = await prepareFile(file, this.embedder, { pdf: this.opts.pdf, signal: o.signal, onProgress: (stage, fraction) => this.opts.onProgress?.({ docId: id, stage, fraction }) });
      return await this.commit(prepared, { ...o, id });
    } catch (e) {
      const failed = { ...draft, status: 'error' as const, error: e instanceof Error ? e.message : String(e) };
      await this.store.putDoc(failed); return failed;
    }
  }

  async addText(title: string, text: string, o: { sensitivity?: Sensitivity; kind?: 'markdown' | 'plain' | 'html' | 'csv'; source?: PantryDoc['source']; signal?: AbortSignal } = {}): Promise<PantryDoc> {
    await this.load();
    const parsed: ParsedDoc = o.kind === 'csv' ? parseCsv(text, title) : o.kind === 'html' ? parseHtml(text, title) : o.kind === 'plain' ? parsePlain(text, title) : parseMarkdown(text, title);
    const mime = o.kind === 'html' ? 'text/html' : o.kind === 'csv' ? 'text/csv' : 'text/markdown';
    const prepared = await prepareParsed({ ...parsed, title }, mime, new TextEncoder().encode(text).length, this.embedder, { signal: o.signal, source: o.source ?? { kind: 'paste' } });
    return this.commit(prepared, o);
  }

  /** Store a prepared document (from a worker or from addFile/addText). Dedupes by content hash. */
  async commit(p: PreparedDoc, o: { sensitivity?: Sensitivity; id?: string; source?: PantryDoc['source'] } = {}): Promise<PantryDoc> {
    await this.load();
    const existing = (await this.store.listDocs()).find((d) => d.contentHash === p.contentHash && !d.deleted && d.id !== o.id && d.status === 'ready');
    if (existing) { if (o.id) await this.store.deleteDoc(o.id); return existing; }
    const id = o.id ?? newId('doc');
    const base: PantryDoc = { id, title: p.title, mime: p.mime, bytes: p.bytes, sensitivity: o.sensitivity ?? 'personal', status: p.status, embedModelId: p.embedModelId, addedAt: (this.opts.now ?? Date.now)(), contentHash: p.contentHash, chunkCount: p.chunks.length, tokens: p.chunks.reduce((a, c) => a + c.tokens, 0), source: p.source ?? o.source };
    if (p.status === 'needs_ocr' && !p.chunks.length) { await this.store.putDoc(base); return base; }
    const chunks: Chunk[] = p.chunks.map((c) => ({ id: `${id}:${c.ord}`, docId: id, ord: c.ord, headingPath: c.headingPath, page: c.page, text: c.text, tokens: c.tokens, vec: c.vec, scale: c.scale }));
    await this.store.putChunks(chunks); await this.store.putDoc(base);
    this.index.add(base, chunks);
    this.opts.onProgress?.({ docId: id, stage: 'done', fraction: 1 });
    return base;
  }

  /** Another page/worker wrote to the shared store: pick up the changes. */
  async reload(): Promise<void> { this.loaded = false; await this.load(); }

  async remove(docId: string): Promise<void> {
    // soft-delete, then purge immediately: the user asked for it gone
    const d = await this.store.getDoc(docId); if (!d) return;
    await this.store.putDoc({ ...d, deleted: true });
    this.index.remove(docId);
    await this.store.deleteChunks(docId); await this.store.deleteDoc(docId);
  }

  async setSensitivity(docId: string, s: Sensitivity): Promise<void> {
    const d = await this.store.getDoc(docId); if (!d) return;
    const next = { ...d, sensitivity: s }; await this.store.putDoc(next); this.index.upsertDoc(next);
  }

  /** Changing the embedder invalidates every vector: re-embed in the background with progress. */
  async setEmbedder(e: Embedder, onProgress?: (done: number, total: number) => void): Promise<void> {
    this.embedder = e; this.index.setEmbedder(e);
    const all = (await this.store.listDocs()).filter((d) => !d.deleted);
    const stale = all.filter((d) => d.embedModelId !== e.id && d.status === 'ready');
    let done = 0; const total = stale.length;
    this.index.clear();
    for (const d of all) {
      if (!stale.includes(d)) { this.index.add(d, (await this.store.chunksFor(d.id)).filter((c) => c.vec.length === e.dim)); continue; }
      const old = await this.store.chunksFor(d.id);
      const texts = old.map((c) => `${[d.title, ...c.headingPath].join(' › ')}\n${c.text}`);
      const vs = await e.embed(texts);
      const chunks = old.map((c, i) => { const q = quantize(l2normalize(vs[i]!)); return { ...c, vec: q.vec, scale: q.scale }; });
      const nd = { ...d, embedModelId: e.id };
      await this.store.putChunks(chunks); await this.store.putDoc(nd); this.index.add(nd, chunks);
      onProgress?.(++done, total);
    }
    this.loaded = true;
  }

  async search(question: string, o: Omit<PlanInput, 'question' | 'docs'> & { k?: number; budgetTokens?: number }): Promise<RetrievalResult> {
    await this.load();
    const docs = await this.list();
    const r = await this.planner.run({ ...o, question, docs });
    const now = (this.opts.now ?? Date.now)();
    for (const id of new Set(r.passages.map((p) => p.docId))) { const d = await this.store.getDoc(id); if (d) await this.store.putDoc({ ...d, lastUsedAt: now }); }
    return r;
  }

  /** Raw range read for `pantry_get`. */
  async getRange(docId: string, from = 0, count = 3): Promise<{ title: string; text: string; sensitivity: Sensitivity; next?: number } | undefined> {
    await this.load();
    const d = await this.store.getDoc(docId); if (!d) return undefined;
    const cs = this.index.chunksOf(docId).slice(from, from + count);
    return { title: d.title, text: cs.map((c) => c.text).join('\n\n'), sensitivity: d.sensitivity, next: from + count < d.chunkCount ? from + count : undefined };
  }

  async usage(): Promise<{ bytes: number; quota?: number; docs: number; chunks: number; nearlyFull: boolean }> {
    const [bytes, docs] = await Promise.all([this.store.usage(), this.list()]);
    let quota: number | undefined; let used = bytes;
    try { const est = await navigator.storage?.estimate?.(); quota = est?.quota; used = est?.usage ?? bytes; } catch { /* not available */ }
    return { bytes, quota, docs: docs.length, chunks: docs.reduce((a, d) => a + d.chunkCount, 0), nearlyFull: !!quota && used / quota > 0.85 };
  }

  exportBackup(passphrase: string, iterations?: number): Promise<Uint8Array> { return exportBackup(this.store, passphrase, iterations); }
  async importBackup(data: Uint8Array, passphrase: string): Promise<void> { await importBackup(this.store, data, passphrase); this.loaded = false; await this.load(); }

  /** "Delete everything" (typed confirmation is enforced by the UI). */
  async wipe(): Promise<void> { this.index.clear(); this.vault.lock(); await this.store.wipe(); this.loaded = true; try { await globalThis.caches?.delete('fruitfly-models'); } catch { /* ignore */ } }

  assertDim(vec: Float32Array): void { if (vec.length !== this.embedder.dim) throw new FruitflyError('unknown', 'Embedding dimension mismatch.'); }
}

export { estimateTokens, dequantize };
