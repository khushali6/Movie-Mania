import { IdbPantryStore, Pantry, prepareParsed, standingInstructions, type ParsedDoc } from '@fruitfly/pantry';
import type { DocView, PantryApi, PassageView } from '@fruitfly/ui';
import { onSettings, loadSettings, type Settings } from '../shared/settings';
import { makeEmbedder, makeGuard } from '../shared/guard';

const CHANNEL = 'ff-pantry';

/** Pantry for extension pages: reads and writes the shared IndexedDB directly, parses big files in a Worker. */
export class LocalPantry {
  pantry!: Pantry; settings!: Settings;
  private listeners = new Set<() => void>(); private chan = new BroadcastChannel(CHANNEL);
  private pending = new Map<string, DocView>(); private worker: Worker | null = null; private seq = 0; private jobs = new Map<number, { resolve: (v: { parsed: ParsedDoc; mime: string; bytes: number }) => void; reject: (e: Error) => void; onProgress: (f: number) => void }>();
  ready: Promise<void>;
  constructor() { this.ready = this.init(); }

  private async init(): Promise<void> {
    this.settings = await loadSettings();
    const guard = makeGuard({ settings: () => this.settings });
    this.pantry = new Pantry({ store: await IdbPantryStore.open(), embedder: makeEmbedder(this.settings, guard), vault: { iterations: 600_000, autoLockMs: 15 * 60_000 } });
    await this.pantry.load();
    onSettings((s) => { this.settings = s; });
    this.chan.onmessage = () => { void this.pantry.reload().then(() => this.emit()); };
    const raw = (await chrome.storage.session.get('ff:vaultkey'))['ff:vaultkey'] as number[] | undefined;
    if (raw) await this.pantry.vault.importSessionKey(new Uint8Array(raw).buffer).catch(() => undefined);
  }
  private emit() { this.listeners.forEach((l) => l()); }
  private changed() { this.chan.postMessage('changed'); void chrome.runtime.sendMessage({ ff: 'pantry_changed' }).catch(() => undefined); this.emit(); }

  private parseInWorker(file: File, onProgress: (f: number) => void) {
    if (!this.worker) {
      this.worker = new Worker(new URL('./ingest.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; progress?: number; parsed?: ParsedDoc; mime?: string; bytes?: number; error?: string }>) => {
        const j = this.jobs.get(e.data.id); if (!j) return;
        if (e.data.progress !== undefined) j.onProgress(e.data.progress);
        else { this.jobs.delete(e.data.id); if (e.data.error) j.reject(new Error(e.data.error)); else j.resolve({ parsed: e.data.parsed!, mime: e.data.mime!, bytes: e.data.bytes! }); }
      };
    }
    return new Promise<{ parsed: ParsedDoc; mime: string; bytes: number }>(async (resolve, reject) => {
      const id = ++this.seq; this.jobs.set(id, { resolve, reject, onProgress });
      const buffer = await file.arrayBuffer(); this.worker!.postMessage({ id, name: file.name, type: file.type, buffer }, [buffer]);
    });
  }

  api: PantryApi = {
    subscribe: (cb) => { this.listeners.add(cb); return () => this.listeners.delete(cb); },
    docs: async () => { await this.ready; const docs = (await this.pantry.list()).map((d): DocView => ({ id: d.id, title: d.title, mime: d.mime, bytes: d.bytes, sensitivity: d.sensitivity, status: d.status, lastUsedAt: d.lastUsedAt, chunkCount: d.chunkCount, error: d.error })); return [...this.pending.values(), ...docs]; },
    addFiles: async (files) => {
      await this.ready;
      for (const f of files) {
        const tmp = `tmp_${++this.seq}`; const row: DocView = { id: tmp, title: f.name.replace(/\.[^.]+$/, ''), mime: f.type || 'text/plain', bytes: f.size, sensitivity: 'personal', status: 'parsing', progress: 0.05, chunkCount: 0 };
        this.pending.set(tmp, row); this.emit();
        try {
          const { parsed, mime, bytes } = await this.parseInWorker(f, (p) => { row.progress = 0.05 + p * 0.5; this.emit(); });
          row.status = 'embedding'; row.progress = 0.6; this.emit();
          const prepared = await prepareParsed(parsed, mime, bytes, (this.pantry as unknown as { embedder: Parameters<typeof prepareParsed>[3] }).embedder, { onProgress: (_s, fr) => { row.progress = 0.6 + fr * 0.4; this.emit(); } });
          await this.pantry.commit(prepared, { sensitivity: 'personal', source: { kind: 'file' } });
        } catch (e) { row.status = 'error'; row.error = e instanceof Error ? e.message : 'Could not read'; this.emit(); await new Promise((r) => setTimeout(r, 2500)); }
        this.pending.delete(tmp); this.changed();
      }
    },
    addText: async (t, x, s) => { await this.ready; await this.pantry.addText(t, x, { sensitivity: s }); this.changed(); },
    remove: async (id) => { await this.ready; await this.pantry.remove(id); this.changed(); },
    setSensitivity: async (id, s) => { await this.ready; await this.pantry.setSensitivity(id, s); this.changed(); },
    search: async (q) => { await this.ready; return (await this.pantry.search(q, { maxAllowed: 'local-only', force: true, k: 5 })).passages.map((p): PassageView => ({ id: p.id, doc: p.doc, page: p.page, text: p.text, sensitivity: p.sensitivity, headingPath: p.headingPath })); },
    profile: async () => { await this.ready; const fields = await this.pantry.profile.get(); const d = await this.pantry.profile.digest(); return { fields, digestTokens: d.tokens, standing: standingInstructions(fields) }; },
    setProfile: async (k, patch) => { await this.ready; await this.pantry.profile.update(k, patch); this.changed(); },
    notes: async () => { await this.ready; return (await this.pantry.notes.list()).map((n) => ({ id: n.id, text: n.text, status: n.status })); },
    keepNote: async (id) => { await this.ready; await this.pantry.notes.keep(id); this.changed(); },
    deleteNote: async (id) => { await this.ready; await this.pantry.notes.dismiss(id); this.changed(); },
    editNote: async (id, t) => { await this.ready; await this.pantry.notes.edit(id, t); this.changed(); },
    vault: {
      state: async () => { await this.ready; return !(await this.pantry.vault.isSetUp()) ? 'unset' : this.pantry.vault.isUnlocked() ? 'unlocked' : 'locked'; },
      fields: async () => { await this.ready; return this.pantry.vault.isUnlocked() ? this.pantry.vault.list() : []; },
      setup: async (p) => { await this.ready; await this.pantry.vault.setup(p); await this.storeKey(); this.changed(); },
      unlock: async (p) => { await this.ready; await this.pantry.vault.unlock(p); await this.storeKey(); this.changed(); },
      lock: async () => { await this.ready; this.pantry.vault.lock(); await chrome.storage.session.remove('ff:vaultkey'); this.changed(); },
      add: async (k, l, v) => { await this.ready; await this.pantry.vault.set(k, l, v, { requiresApproval: true }); this.changed(); },
      remove: async (k) => { await this.ready; await this.pantry.vault.remove(k); this.changed(); },
    },
    usage: async () => { await this.ready; const u = await this.pantry.usage(); return { bytes: u.bytes, quota: u.quota, nearlyFull: u.nearlyFull }; },
  };
  /** the derived key lives only in chrome.storage.session: wiped on browser close or manual lock */
  private async storeKey() { const raw = await this.pantry.vault.exportSessionKey(); await chrome.storage.session.set({ 'ff:vaultkey': [...new Uint8Array(raw)] }); }
}
