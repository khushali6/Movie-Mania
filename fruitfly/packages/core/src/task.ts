import type { Sensitivity } from './sensitivity';
import type { CompactionReport, Scratchpad, Source, TaskResult, Approval } from './events';

export interface StepRecord {
  id: string;
  index: number;
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  /** the model's own words before the call, if any (short) */
  thought?: string;
  ok: boolean;
  digest: string;
  /** full result lives in the ObservationStore; the handle is how to get it back */
  handle?: string;
  tokens: number;
  truncated?: boolean;
  /** present while the observation is still shown to the model verbatim; removed by masking */
  inline?: string;
  masked?: boolean;
  sensitivity: Sensitivity;
  route?: string;
  startedAt: number;
  endedAt?: number;
}

export interface TaskSummary { text: string; upToStep: number; sensitivity: Sensitivity; tokens: number }

export type TaskStatus = 'idle' | 'running' | 'paused' | 'waiting_approval' | 'done' | 'failed' | 'stopped';

export interface TaskState {
  id: string;
  goal: string;
  mode: 'demo' | 'live';
  status: TaskStatus;
  scratchpad: Scratchpad;
  steps: StepRecord[];
  summary?: TaskSummary;
  routeProfile: 'fast' | 'smart' | 'local';
  budgets: { tokensUsed: number; tokensCap: number; stepsUsed: number; stepsCap: number };
  compactions: CompactionReport[];
  sources: Source[];
  result?: TaskResult;
  pendingApproval?: Approval;
  createdAt: number;
  updatedAt: number;
  /** tab the task is acting on */
  tabId?: string;
  /** counters for loop detection etc. */
  meta: Record<string, unknown>;
}

export function newScratchpad(goal: string): Scratchpad {
  return { goal, constraints: [], findings: [], rejected: [], openQuestions: [] };
}
