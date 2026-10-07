import type { LedgerEntry, LedgerStore } from '@fruitfly/egress';
import type { BreakerStore, BudgetStore, LimiterStore } from '@fruitfly/gateway';
import type { TaskStore } from '@fruitfly/agent';
import type { AgentEvent, TaskState } from '@fruitfly/core';

/** Sync-looking store backed by chrome.storage.local: hydrate once at startup, write through. Survives service-worker restarts. */
export class PersistentValue<T> {
  private v: T | undefined;
  constructor(private key: string) {}
  async init(): Promise<this> { this.v = (await chrome.storage.local.get(this.key))[this.key] as T | undefined; return this; }
  get(): T | undefined { return this.v; }
  set(v: T): void { this.v = v; void chrome.storage.local.set({ [this.key]: v }); }
}
export const breakerStore = (p: PersistentValue<never>): BreakerStore => ({ load: () => p.get() as never, save: (s) => p.set(s as never) });
export const limiterStore = (p: PersistentValue<never>): LimiterStore => ({ load: () => p.get() as never, save: (s) => p.set(s as never) });
export const budgetStore = (p: PersistentValue<never>): BudgetStore => ({ load: () => p.get() as never, save: (s) => p.set(s as never) });

/** Ledger: metadata only (time, route, host, bytes, kinds). Never content. */
export class ChromeLedger implements LedgerStore {
  private key = 'ff:ledger'; private buf: LedgerEntry[] | null = null; private timer: ReturnType<typeof setTimeout> | null = null;
  private async ensure(): Promise<LedgerEntry[]> { if (!this.buf) this.buf = ((await chrome.storage.local.get(this.key))[this.key] as LedgerEntry[] | undefined) ?? []; return this.buf; }
  async append(e: LedgerEntry): Promise<void> { const b = await this.ensure(); b.push(e); if (b.length > 1500) b.splice(0, b.length - 1500); if (!this.timer) this.timer = setTimeout(() => { this.timer = null; void chrome.storage.local.set({ [this.key]: b }); }, 400); }
  async all(): Promise<LedgerEntry[]> { this.buf = null; return [...(await this.ensure())]; }
  async clear(): Promise<void> { this.buf = []; await chrome.storage.local.remove(this.key); }
}

// ───────── IndexedDB: tasks + replays (history) ─────────
const DB = 'fruitfly-history';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const o = indexedDB.open(DB, 1); o.onupgradeneeded = () => { o.result.createObjectStore('tasks', { keyPath: 'id' }); o.result.createObjectStore('replays', { keyPath: 'taskId' }); }; o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); });
}
const rq = <T>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = (t: IDBTransaction): Promise<void> => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); });

export class IdbTaskStore implements TaskStore {
  private dbp: Promise<IDBDatabase> | null = null;
  private db() { return (this.dbp ??= open()); }
  async save(t: TaskState) { const d = await this.db(); const x = d.transaction('tasks', 'readwrite'); x.objectStore('tasks').put(JSON.parse(JSON.stringify(t))); await tx(x); }
  async load(id: string) { const d = await this.db(); return (await rq(d.transaction('tasks').objectStore('tasks').get(id) as IDBRequest<TaskState | undefined>)); }
  async list(limit = 50) { const d = await this.db(); const all = await rq(d.transaction('tasks').objectStore('tasks').getAll() as IDBRequest<TaskState[]>); return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit); }
  async latest() { return (await this.list(1))[0]; }
  async delete(id: string) { const d = await this.db(); const x = d.transaction(['tasks', 'replays'], 'readwrite'); x.objectStore('tasks').delete(id); x.objectStore('replays').delete(id); await tx(x); }
  async wipe() { const d = await this.db(); const x = d.transaction(['tasks', 'replays'], 'readwrite'); x.objectStore('tasks').clear(); x.objectStore('replays').clear(); await tx(x); }
  async saveReplay(r: ReplayRecord) { const d = await this.db(); const x = d.transaction('replays', 'readwrite'); x.objectStore('replays').put(r); await tx(x); const all = await rq(d.transaction('replays').objectStore('replays').getAll() as IDBRequest<ReplayRecord[]>); for (const old of all.sort((a, b) => b.at - a.at).slice(30)) { const y = d.transaction('replays', 'readwrite'); y.objectStore('replays').delete(old.taskId); await tx(y); } }
  async loadReplay(id: string) { const d = await this.db(); return rq(d.transaction('replays').objectStore('replays').get(id) as IDBRequest<ReplayRecord | undefined>); }
}

export interface ReplayRecord { taskId: string; goal: string; at: number; events: AgentEvent[]; path: [number, number, number][]; sites: string[]; route?: string; tokens: number }

/** No vault values, API keys or raw Pantry text in a stored replay. Throws if a known secret slipped in. */
export function sanitizeReplay(r: ReplayRecord, secrets: readonly string[]): ReplayRecord {
  const text = JSON.stringify(r);
  for (const s of secrets) if (s.length >= 4 && text.includes(s)) throw new Error('A secret reached a replay record');
  return { ...r, events: r.events.filter((e) => e.type !== 'usage').map((e) => (e.type === 'step_started' ? { ...e, step: { ...e.step, args: redactArgs(e.step.args) } } : e)) };
}
function redactArgs(a?: Record<string, unknown>): Record<string, unknown> | undefined { if (!a) return a; return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === 'string' && v.length > 80 ? `${v.slice(0, 77)}…` : v])); }

// ───────── observation store (big blobs the model only sees as digest + handle) ─────────
import type { ObservationMeta, ObservationStore, StoredObservation } from '@fruitfly/context';
import { handleFor } from '@fruitfly/context';
function openObs(): Promise<IDBDatabase> { return new Promise((res, rej) => { const o = indexedDB.open('fruitfly-obs', 1); o.onupgradeneeded = () => { const s = o.result.createObjectStore('obs', { keyPath: 'handle' }); s.createIndex('task', 'taskId'); }; o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); }); }
export class IdbObservationStore implements ObservationStore {
  private dbp: Promise<IDBDatabase> | null = null; private db() { return (this.dbp ??= openObs()); }
  async put(taskId: string, step: number, text: string, meta: ObservationMeta): Promise<string> {
    const handle = handleFor(taskId, step); const d = await this.db(); const x = d.transaction('obs', 'readwrite');
    x.objectStore('obs').put({ handle, taskId, step, text, label: meta.label, sensitivity: meta.sensitivity ?? 'public', at: Date.now() } satisfies StoredObservation); await tx(x); return handle;
  }
  async get(handle: string) { const d = await this.db(); return rq(d.transaction('obs').objectStore('obs').get(handle) as IDBRequest<StoredObservation | undefined>); }
  async list(taskId: string) { const d = await this.db(); return rq(d.transaction('obs').objectStore('obs').index('task').getAll(taskId) as IDBRequest<StoredObservation[]>); }
  async purge(taskId?: string) {
    const d = await this.db(); const x = d.transaction('obs', 'readwrite');
    if (!taskId) x.objectStore('obs').clear(); else { const idx = x.objectStore('obs').index('task'); idx.openKeyCursor(IDBKeyRange.only(taskId)).onsuccess = (e) => { const c = (e.target as IDBRequest<IDBCursor | null>).result; if (c) { x.objectStore('obs').delete(c.primaryKey); c.continue(); } }; }
    await tx(x);
  }
}
