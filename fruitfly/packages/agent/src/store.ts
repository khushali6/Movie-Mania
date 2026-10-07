import type { TaskState } from '@fruitfly/core';

/** Persisted after every step so the loop is resumable after a service-worker restart. */
export interface TaskStore {
  save(t: TaskState): Promise<void>;
  load(id: string): Promise<TaskState | undefined>;
  latest(): Promise<TaskState | undefined>;
  list(limit?: number): Promise<TaskState[]>;
  delete(id: string): Promise<void>;
}

export class MemoryTaskStore implements TaskStore {
  private m = new Map<string, string>();
  async save(t: TaskState) { this.m.set(t.id, JSON.stringify(t)); }
  async load(id: string) { const s = this.m.get(id); return s ? (JSON.parse(s) as TaskState) : undefined; }
  async latest() { const all = await this.list(1); return all[0]; }
  async list(limit = 50) { return [...this.m.values()].map((s) => JSON.parse(s) as TaskState).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit); }
  async delete(id: string) { this.m.delete(id); }
}

export type ApprovalDecision = 'approve' | 'cancel' | 'takeover';
export interface ApprovalGate { request(a: import('@fruitfly/core').Approval, signal?: AbortSignal): Promise<ApprovalDecision> }
