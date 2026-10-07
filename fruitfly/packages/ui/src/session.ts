import { useSyncExternalStore } from 'react';
import type { AgentEvent, Approval, CompactionReport, Source, TaskResult } from '@fruitfly/core';

export type SessionStatus = 'idle' | 'working' | 'paused' | 'needs_you' | 'throttled' | 'done' | 'failed' | 'stopped';
export type StepState = 'active' | 'done' | 'failed';

export interface TimelineStepModel {
  id: string; index: number; title: string; kind: string; tool?: string; state: StepState; digest?: string;
  tokens?: number; ms?: number; targetLabel?: string; args?: Record<string, unknown>; route?: string; truncated?: boolean; handle?: string;
  unexpected?: string; startedAt: number;
}
export interface SubagentModel { id: string; kind: 'reader' | 'researcher' | 'doc' | 'critic'; label: string; phase: 'start' | 'done' | 'failed'; summary?: string }
export interface NoteModel { id: string; text: string; state: 'proposed' | 'kept' | 'dismissed' }

export interface SessionState {
  taskId?: string; goal?: string; mode?: 'demo' | 'live';
  status: SessionStatus;
  steps: TimelineStepModel[];
  thinking: boolean; thinkNote?: string;
  approval?: Approval;
  result?: TaskResult;
  /** the result card is shown only after the fly has delivered it */
  resultRevealed: boolean;
  subagents: SubagentModel[];
  sources: Source[];
  usage: { tokensUsed: number; tokensCap: number; stepsUsed: number; stepsCap: number; cacheRead: number };
  compactions: (CompactionReport & { atStep: number })[];
  route?: string; routeSwitches: { to: string; reason: string; at: number }[];
  throttle?: { until: number; route: string };
  notes: NoteModel[];
  injections: { where: string; excerpt: string }[];
  error?: { code: string; message: string; recoverable: boolean };
  /** monotonically increasing: lets the UI know when events arrived */
  tick: number;
}

export const initialSession = (): SessionState => ({
  status: 'idle', steps: [], thinking: false, resultRevealed: false, subagents: [], sources: [], usage: { tokensUsed: 0, tokensCap: 250_000, stepsUsed: 0, stepsCap: 40, cacheRead: 0 },
  compactions: [], routeSwitches: [], notes: [], injections: [], tick: 0,
});

/** Pure: AgentEvent → next state. Used by the extension panel, landing demo, onboarding and Fly Lab. */
export function reduceEvent(s: SessionState, e: AgentEvent): SessionState {
  const n = { ...s, tick: s.tick + 1 };
  switch (e.type) {
    case 'task_started': return { ...initialSession(), tick: n.tick, taskId: e.taskId, goal: e.goal, mode: e.mode, status: 'working', thinking: true, usage: { ...s.usage, tokensUsed: 0, stepsUsed: 0, cacheRead: 0 } };
    case 'thinking': return { ...n, thinking: true, thinkNote: e.note ?? n.thinkNote, status: n.status === 'throttled' ? 'working' : n.status === 'idle' ? 'working' : n.status };
    case 'step_started': return { ...n, thinking: false, status: 'working', steps: [...n.steps.map((x) => (x.state === 'active' ? { ...x, state: 'done' as const } : x)), { id: e.step.id, index: e.step.index, title: e.step.title, kind: e.kind, tool: e.step.tool, state: 'active', targetLabel: e.step.targetLabel, args: e.step.args, startedAt: e.at }] };
    case 'step_finished': return { ...n, steps: n.steps.map((x) => (x.id === e.stepId ? { ...x, state: e.ok ? 'done' : 'failed', digest: e.digest, tokens: e.tokens, ms: e.ms, truncated: e.truncated, handle: e.handle } : x)) };
    case 'unexpected': return { ...n, steps: n.steps.map((x) => (x.id === e.stepId ? { ...x, unexpected: e.note } : x)) };
    case 'approval_needed': return { ...n, status: 'needs_you', approval: e.approval, thinking: false };
    case 'approval_resolved': return { ...n, approval: undefined, status: 'working' };
    case 'route_switch': return { ...n, route: e.to, routeSwitches: [...n.routeSwitches, { to: e.to, reason: e.reason, at: e.at }].slice(-6) };
    case 'throttled': return { ...n, status: 'throttled', throttle: { until: e.untilMs, route: e.routeId } };
    case 'unthrottled': return { ...n, status: n.status === 'throttled' ? 'working' : n.status, throttle: undefined };
    case 'compacted': return { ...n, compactions: [...n.compactions, { ...e.report, atStep: n.steps.length }] };
    case 'source_added': return n.sources.some((x) => (x.url && x.url === e.source.url) || (x.passageId && x.passageId === e.source.passageId)) ? n : { ...n, sources: [...n.sources, e.source] };
    case 'subagent': {
      const rest = n.subagents.filter((x) => x.id !== e.id);
      return { ...n, subagents: [...rest, { id: e.id, kind: e.kind, label: e.label, phase: e.phase, summary: e.summary }] };
    }
    case 'note_proposed': return { ...n, notes: [...n.notes, { id: e.noteId, text: e.text, state: 'proposed' }] };
    case 'injection_flag': return { ...n, injections: [...n.injections, { where: e.where, excerpt: e.excerpt }].slice(-3) };
    case 'usage': return { ...n, usage: { tokensUsed: e.tokensUsed, tokensCap: e.tokensCap, stepsUsed: e.stepsUsed, stepsCap: e.stepsCap, cacheRead: e.cacheRead ?? n.usage.cacheRead } };
    case 'result': return { ...n, thinking: false, result: e.result, resultRevealed: false, status: e.result.status === 'failed' ? 'failed' : 'done', steps: n.steps.map((x) => (x.state === 'active' ? { ...x, state: 'done' } : x)), subagents: n.subagents.map((x) => (x.phase === 'start' ? { ...x, phase: 'done' } : x)) };
    case 'error': return { ...n, error: { code: e.code, message: e.message, recoverable: e.recoverable }, thinking: false, status: e.recoverable ? n.status : 'failed' };
    case 'paused': return { ...n, status: n.approval ? 'needs_you' : 'paused' };
    case 'resumed': return { ...n, status: 'working', error: undefined };
    case 'stopped': return { ...n, status: 'stopped', thinking: false, approval: undefined, steps: n.steps.map((x) => (x.state === 'active' ? { ...x, state: 'failed' } : x)) };
    default: return n;
  }
}

type Listener = () => void;
/** Tiny external store so React re-renders only on real changes. */
export class SessionStore {
  private s: SessionState = initialSession();
  private ls = new Set<Listener>();
  get state(): SessionState { return this.s; }
  dispatch = (e: AgentEvent): void => { this.s = reduceEvent(this.s, e); this.emit(); };
  patch(p: Partial<SessionState>): void { this.s = { ...this.s, ...p, tick: this.s.tick + 1 }; this.emit(); }
  reset(): void { this.s = { ...initialSession(), usage: this.s.usage, tick: this.s.tick + 1 }; this.emit(); }
  subscribe = (l: Listener): (() => void) => { this.ls.add(l); return () => this.ls.delete(l); };
  private emit(): void { this.ls.forEach((l) => l()); }
}

export function useSession(store: SessionStore): SessionState { return useSyncExternalStore(store.subscribe, () => store.state, () => store.state); }
export function useSessionSelector<T>(store: SessionStore, pick: (s: SessionState) => T): T { return pick(useSession(store)); }
