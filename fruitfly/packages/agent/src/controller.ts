import type { AgentEvent, Approval, TaskState } from '@fruitfly/core';
import { newTask, runTask, type RunControl } from './loop';
import type { AgentDeps, AgentSettings } from './types';
import type { ApprovalDecision, ApprovalGate, TaskStore } from './store';

/** Bridges UI buttons to the loop: approvals as promises, pause/resume, stop. */
export class PromiseApprovalGate implements ApprovalGate {
  private pending = new Map<string, (d: ApprovalDecision) => void>();
  request(a: Approval, signal?: AbortSignal): Promise<ApprovalDecision> {
    return new Promise((resolve) => {
      this.pending.set(a.id, resolve);
      signal?.addEventListener('abort', () => { this.pending.delete(a.id); resolve('cancel'); }, { once: true });
    });
  }
  resolve(id: string, d: ApprovalDecision): boolean { const r = this.pending.get(id); if (!r) return false; this.pending.delete(id); r(d); return true; }
  get waiting(): string[] { return [...this.pending.keys()]; }
}

export type ControllerDeps = Omit<AgentDeps, 'signal' | 'emit' | 'approvals'> & { store: TaskStore };

export class AgentController {
  readonly gate = new PromiseApprovalGate();
  private ac: AbortController | null = null;
  private listeners = new Set<(e: AgentEvent) => void>();
  private pausedFlag = false;
  private resumeWaiters: (() => void)[] = [];
  task: TaskState | undefined;
  running: Promise<TaskState> | null = null;

  constructor(private mk: () => ControllerDeps) {}

  on(fn: (e: AgentEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit = (e: AgentEvent): void => { this.listeners.forEach((l) => l(e)); };

  private control: RunControl = { paused: () => this.pausedFlag, whenResumed: () => new Promise((r) => this.resumeWaiters.push(r)) };

  private launch(state: TaskState): Promise<TaskState> {
    this.ac?.abort(); this.ac = new AbortController();
    const deps: AgentDeps = { ...this.mk(), signal: this.ac.signal, emit: (e) => { this.emit(e); }, approvals: this.gate };
    const p = runTask(state, deps, { control: this.control }).then((s) => { this.task = s; return s; });
    this.running = p; return p;
  }

  start(goal: string, o: { mode?: 'demo' | 'live'; profile?: AgentSettings['profile']; stepsCap?: number; tokensCap?: number } = {}): Promise<TaskState> {
    this.task = newTask(goal, { mode: o.mode, profile: o.profile, stepsCap: o.stepsCap, tokensCap: o.tokensCap });
    return this.launch(this.task);
  }

  /** After a service-worker restart, or after the user hands control back from "Take over". */
  async resume(taskId?: string): Promise<TaskState | undefined> {
    const d = this.mk();
    const t = taskId ? await d.store.load(taskId) : await d.store.latest();
    if (!t || t.status === 'done' || t.status === 'failed' || t.status === 'stopped') return t;
    this.task = { ...t, status: 'running' };
    return this.launch(this.task);
  }

  /** Answer an ask_user question and continue. */
  async answer(text: string): Promise<TaskState | undefined> {
    const t = this.task; if (!t || !t.meta.pendingQuestion) return t;
    const steps = [...t.steps]; const last = steps[steps.length - 1];
    if (last && last.tool === 'ask_user') steps[steps.length - 1] = { ...last, ok: true, inline: `The user answered: ${text}`, digest: `You said: ${text.slice(0, 60)}`, masked: false };
    this.task = { ...t, steps, status: 'running', meta: { ...t.meta, pendingQuestion: undefined } };
    return this.launch(this.task);
  }

  approve(id: string): boolean { return this.gate.resolve(id, 'approve'); }
  cancelApproval(id: string): boolean { return this.gate.resolve(id, 'cancel'); }
  takeover(id?: string): boolean { const w = id ?? this.gate.waiting[0]; return w ? this.gate.resolve(w, 'takeover') : false; }
  pause(): void { this.pausedFlag = true; }
  resumePaused(): void { this.pausedFlag = false; const w = this.resumeWaiters.splice(0); w.forEach((r) => r()); }
  stop(): void { this.ac?.abort(); this.resumePaused(); }
  get isPaused(): boolean { return this.pausedFlag; }
}
