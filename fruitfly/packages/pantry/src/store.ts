import type { Chunk, Note, PantryDoc, ProfileField, VaultField } from './types';
import { SCHEMA_VERSION } from './types';

export interface VaultMeta { salt: Uint8Array; iterations: number; verifierIv: Uint8Array; verifier: ArrayBuffer }

export interface PantryStore {
  putDoc(d: PantryDoc): Promise<void>;
  getDoc(id: string): Promise<PantryDoc | undefined>;
  listDocs(): Promise<PantryDoc[]>;
  deleteDoc(id: string): Promise<void>;
  putChunks(c: Chunk[]): Promise<void>;
  chunksFor(docId: string): Promise<Chunk[]>;
  allChunks(): Promise<Chunk[]>;
  deleteChunks(docId: string): Promise<void>;
  putProfile(f: ProfileField[]): Promise<void>;
  getProfile(): Promise<ProfileField[]>;
  putVaultField(f: VaultField): Promise<void>;
  listVault(): Promise<VaultField[]>;
  deleteVaultField(key: string): Promise<void>;
  getVaultMeta(): Promise<VaultMeta | undefined>;
  putVaultMeta(m: VaultMeta): Promise<void>;
  putNote(n: Note): Promise<void>;
  listNotes(): Promise<Note[]>;
  deleteNote(id: string): Promise<void>;
  getMeta<T = unknown>(k: string): Promise<T | undefined>;
  setMeta(k: string, v: unknown): Promise<void>;
  /** approximate bytes held */
  usage(): Promise<number>;
  wipe(): Promise<void>;
}

export class MemoryPantryStore implements PantryStore {
  private docs = new Map<string, PantryDoc>(); private chunks = new Map<string, Chunk>(); private profile: ProfileField[] = [];
  private vault = new Map<string, VaultField>(); private vmeta?: VaultMeta; private notes = new Map<string, Note>(); private meta = new Map<string, unknown>();
  async putDoc(d: PantryDoc) { this.docs.set(d.id, { ...d }); }
  async getDoc(id: string) { const d = this.docs.get(id); return d ? { ...d } : undefined; }
  async listDocs() { return [...this.docs.values()].map((d) => ({ ...d })); }
  async deleteDoc(id: string) { this.docs.delete(id); }
  async putChunks(c: Chunk[]) { for (const x of c) this.chunks.set(x.id, x); }
  async chunksFor(docId: string) { return [...this.chunks.values()].filter((c) => c.docId === docId).sort((a, b) => a.ord - b.ord); }
  async allChunks() { return [...this.chunks.values()]; }
  async deleteChunks(docId: string) { for (const [k, c] of this.chunks) if (c.docId === docId) this.chunks.delete(k); }
  async putProfile(f: ProfileField[]) { this.profile = f.map((x) => ({ ...x })); }
  async getProfile() { return this.profile.map((x) => ({ ...x })); }
  async putVaultField(f: VaultField) { this.vault.set(f.key, f); }
  async listVault() { return [...this.vault.values()]; }
  async deleteVaultField(k: string) { this.vault.delete(k); }
  async getVaultMeta() { return this.vmeta; }
  async putVaultMeta(m: VaultMeta) { this.vmeta = m; }
  async putNote(n: Note) { this.notes.set(n.id, { ...n }); }
  async listNotes() { return [...this.notes.values()].sort((a, b) => b.createdAt - a.createdAt); }
  async deleteNote(id: string) { this.notes.delete(id); }
  async getMeta<T>(k: string) { return this.meta.get(k) as T | undefined; }
  async setMeta(k: string, v: unknown) { this.meta.set(k, v); }
  async usage() { let b = 0; for (const c of this.chunks.values()) b += c.vec.byteLength + c.text.length * 2; for (const d of this.docs.values()) b += d.bytes; return b; }
  async wipe() { this.docs.clear(); this.chunks.clear(); this.profile = []; this.vault.clear(); this.vmeta = undefined; this.notes.clear(); this.meta.clear(); }
}

// ───────────────────────── IndexedDB with versioned migrations ─────────────────────────

const req = <T>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (t: IDBTransaction): Promise<void> => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

/** Migrations are additive and tested against fixtures from every previous version. */
export function openPantryDb(name = 'fruitfly-pantry', version = SCHEMA_VERSION): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, version);
    open.onupgradeneeded = (ev) => {
      const db = open.result; const tx = open.transaction!; const old = ev.oldVersion;
      if (old < 1) {
        db.createObjectStore('docs', { keyPath: 'id' });
        const ch = db.createObjectStore('chunks', { keyPath: 'id' }); ch.createIndex('byDoc', 'docId');
      }
      if (old < 2) { db.createObjectStore('profile', { keyPath: 'key' }); db.createObjectStore('notes', { keyPath: 'id' }); }
      if (old < 3) {
        db.createObjectStore('vault', { keyPath: 'key' }); db.createObjectStore('meta', { keyPath: 'k' });
        // v3 added chunkCount / tokens / sensitivity defaults to docs written by v1–v2
        const docs = tx.objectStore('docs');
        docs.openCursor().onsuccess = (e) => {
          const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result; if (!cur) return;
          const d = cur.value as Partial<PantryDoc>;
          cur.update({ sensitivity: 'personal', chunkCount: 0, tokens: 0, status: 'ready', embedModelId: 'unknown', ...d });
          cur.continue();
        };
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Pantry database is blocked by another tab.'));
  });
}

export class IdbPantryStore implements PantryStore {
  constructor(private db: IDBDatabase) {}
  static async open(name?: string): Promise<IdbPantryStore> { return new IdbPantryStore(await openPantryDb(name)); }
  private async all<T>(store: string): Promise<T[]> { return req(this.db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>); }
  private async put(store: string, v: unknown): Promise<void> { const t = this.db.transaction(store, 'readwrite'); t.objectStore(store).put(v); await done(t); }
  private async del(store: string, k: IDBValidKey): Promise<void> { const t = this.db.transaction(store, 'readwrite'); t.objectStore(store).delete(k); await done(t); }
  async putDoc(d: PantryDoc) { await this.put('docs', d); }
  async getDoc(id: string) { return req(this.db.transaction('docs').objectStore('docs').get(id) as IDBRequest<PantryDoc | undefined>); }
  async listDocs() { return this.all<PantryDoc>('docs'); }
  async deleteDoc(id: string) { await this.del('docs', id); }
  async putChunks(c: Chunk[]) { const t = this.db.transaction('chunks', 'readwrite'); const s = t.objectStore('chunks'); for (const x of c) s.put(x); await done(t); }
  async chunksFor(docId: string) { const r = await req(this.db.transaction('chunks').objectStore('chunks').index('byDoc').getAll(docId) as IDBRequest<Chunk[]>); return r.sort((a, b) => a.ord - b.ord); }
  async allChunks() { return this.all<Chunk>('chunks'); }
  async deleteChunks(docId: string) { const t = this.db.transaction('chunks', 'readwrite'); const idx = t.objectStore('chunks').index('byDoc'); idx.openKeyCursor(IDBKeyRange.only(docId)).onsuccess = (e) => { const c = (e.target as IDBRequest<IDBCursor | null>).result; if (c) { t.objectStore('chunks').delete(c.primaryKey); c.continue(); } }; await done(t); }
  async putProfile(f: ProfileField[]) { const t = this.db.transaction('profile', 'readwrite'); const s = t.objectStore('profile'); s.clear(); for (const x of f) s.put(x); await done(t); }
  async getProfile() { return this.all<ProfileField>('profile'); }
  async putVaultField(f: VaultField) { await this.put('vault', f); }
  async listVault() { return this.all<VaultField>('vault'); }
  async deleteVaultField(k: string) { await this.del('vault', k); }
  async getVaultMeta() { return (await this.getMeta<VaultMeta>('vault-meta')); }
  async putVaultMeta(m: VaultMeta) { await this.setMeta('vault-meta', m); }
  async putNote(n: Note) { await this.put('notes', n); }
  async listNotes() { return (await this.all<Note>('notes')).sort((a, b) => b.createdAt - a.createdAt); }
  async deleteNote(id: string) { await this.del('notes', id); }
  async getMeta<T>(k: string) { return (await req(this.db.transaction('meta').objectStore('meta').get(k) as IDBRequest<{ k: string; v: T } | undefined>))?.v; }
  async setMeta(k: string, v: unknown) { await this.put('meta', { k, v }); }
  async usage() { const [chunks, docs] = await Promise.all([this.allChunks(), this.listDocs()]); return chunks.reduce((a, c) => a + c.vec.byteLength + c.text.length * 2, 0) + docs.reduce((a, d) => a + d.bytes, 0); }
  async wipe() { const names = ['docs', 'chunks', 'profile', 'notes', 'vault', 'meta']; const t = this.db.transaction(names, 'readwrite'); for (const n of names) t.objectStore(n).clear(); await done(t); }
}
