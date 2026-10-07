import { estimateTokens, truncateToTokens, type Sensitivity } from '@fruitfly/core';

export interface ObservationMeta { label: string; sensitivity?: Sensitivity }
export interface StoredObservation { handle: string; taskId: string; step: number; text: string; label: string; sensitivity: Sensitivity; at: number }

/** Big blobs live here (IndexedDB in the extension); the model only sees a digest + handle. */
export interface ObservationStore {
  put(taskId: string, step: number, text: string, meta: ObservationMeta): Promise<string>;
  get(handle: string): Promise<StoredObservation | undefined>;
  list(taskId: string): Promise<StoredObservation[]>;
  purge(taskId?: string): Promise<void>;
}

export const handleFor = (taskId: string, step: number): string => `obs://${taskId}/${step}`;

export class MemoryObservationStore implements ObservationStore {
  private m = new Map<string, StoredObservation>();
  async put(taskId: string, step: number, text: string, meta: ObservationMeta): Promise<string> {
    const handle = handleFor(taskId, step);
    this.m.set(handle, { handle, taskId, step, text, label: meta.label, sensitivity: meta.sensitivity ?? 'public', at: Date.now() });
    return handle;
  }
  async get(handle: string) { return this.m.get(handle); }
  async list(taskId: string) { return [...this.m.values()].filter((o) => o.taskId === taskId); }
  async purge(taskId?: string) { if (!taskId) this.m.clear(); else for (const [k, v] of this.m) if (v.taskId === taskId) this.m.delete(k); }
}

const STOP = new Set('the a an and or of to in on for with is are was were be at by from as it this that these those what which who how'.split(' '));
const terms = (q: string): string[] => (q.toLowerCase().match(/[\p{L}\p{N}₹$€£.]+/gu) ?? []).filter((t) => t.length > 1 && !STOP.has(t));

/** `recall(handle, query)`: return the best-matching passages of a stored observation within a token budget. */
export async function recall(store: ObservationStore, handle: string, query: string, budgetTokens = 600): Promise<{ text: string; found: boolean; tokens: number; sensitivity: Sensitivity }> {
  const obs = await store.get(handle);
  if (!obs) return { text: `Nothing stored under ${handle}.`, found: false, tokens: 8, sensitivity: 'public' };
  const q = terms(query);
  const paras = obs.text.split(/\n{2,}|\n(?=[-*#\d])/).map((p) => p.trim()).filter(Boolean);
  const scored = paras.map((p, i) => {
    const lower = p.toLowerCase(); let s = 0;
    for (const t of q) { const idx = lower.indexOf(t); if (idx >= 0) s += 1 + Math.min(3, (lower.split(t).length - 1) * 0.5); }
    return { p, i, s };
  }).filter((x) => x.s > 0 || !q.length).sort((a, b) => b.s - a.s || a.i - b.i);
  const chosen: typeof scored = []; let used = 0;
  for (const x of scored) { const t = estimateTokens(x.p); if (used + t > budgetTokens) { if (!chosen.length) { chosen.push({ ...x, p: truncateToTokens(x.p, budgetTokens).text }); used = budgetTokens; } continue; } chosen.push(x); used += t; }
  chosen.sort((a, b) => a.i - b.i);
  const text = chosen.length ? chosen.map((c) => c.p).join('\n…\n') : `No part of ${handle} matches "${query}".`;
  return { text, found: chosen.length > 0, tokens: estimateTokens(text), sensitivity: obs.sensitivity };
}
