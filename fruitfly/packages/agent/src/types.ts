import type { AgentEvent, CallPurpose, ChatMessage, ModelInfo, ProfileName, Sensitivity, TaskState, ToolSpec, StepRecord, Source, Approval } from '@fruitfly/core';
import type { ContextManager, ObservationStore, TokenMeter } from '@fruitfly/context';
import type { CompletionRequest, CompletionResponse, CallOptions } from '@fruitfly/gateway';
import type { Pantry } from '@fruitfly/pantry';
import type { ZodTypeAny } from 'zod';
import type { BrowserAdapter, Rect } from './browser';
import type { ApprovalGate, TaskStore } from './store';
import type { SitePolicy } from './safety';

/** What the loop needs from the model layer (ModelRouter in production, scripted in tests). */
export interface ModelClient {
  complete(profile: ProfileName, req: CompletionRequest, opts?: CallOptions): Promise<CompletionResponse>;
  modelInfo(profile: ProfileName): ModelInfo;
  /** highest sensitivity any usable route for this profile may receive */
  allowance(profile: ProfileName): Sensitivity;
}

export interface AgentSettings {
  stepsCap: number;
  tokensCap: number;
  profile: 'fast' | 'smart' | 'local';
  /** "Ask me before sending personal info" is handled by the egress guard; this toggles delegating to helpers */
  subagents: boolean;
  maxParallelSubagents: number;
  /** standing instructions (≤200 lines) */
  standingInstructions?: string;
}
export const DEFAULT_SETTINGS: AgentSettings = { stepsCap: 40, tokensCap: 250_000, profile: 'smart', subagents: true, maxParallelSubagents: 3 };

export interface AgentDeps {
  model: ModelClient;
  browser: BrowserAdapter;
  context: ContextManager;
  meter: TokenMeter;
  observations: ObservationStore;
  store: TaskStore;
  approvals: ApprovalGate;
  emit: (e: AgentEvent) => void;
  signal: AbortSignal;
  pantry?: Pantry;
  sitePolicy?: SitePolicy;
  settings?: Partial<AgentSettings>;
  /** UI beat hooks so the fly arrives before the action runs (demo + extension) */
  beforeAction?: (info: { kind: 'read' | 'search' | 'click' | 'type' | 'navigate' | 'wait' | 'other'; tabId?: string; ref?: string; label?: string }) => Promise<void>;
  afterAction?: (info: { ok: boolean; kind: string }) => Promise<void>;
  /** inject deterministic time/ids in tests */
  now?: () => number;
  /** test seam: called after each persisted step (simulate a service-worker kill by throwing) */
  onStepPersisted?: (s: TaskState) => void | Promise<void>;
  /** gateway concurrency hint for subagents */
  concurrency?: () => number;
}

export interface ToolOutput {
  text: string;
  ok?: boolean;
  digest?: string;
  truncated?: boolean;
  handle?: string;
  sensitivity?: Sensitivity;
  /** unexpected page state: the fly gets confused, the loop continues */
  unexpected?: string;
  /** the tool changed the page location */
  navigated?: boolean;
  finish?: { result: import('@fruitfly/core').TaskResult };
  pause?: { reason: 'ask_user'; question: string };
}

export type StepKind = 'read' | 'search' | 'click' | 'type' | 'navigate' | 'wait' | 'other';
export type ToolGroup = 'core' | 'form' | 'doc';

export interface ToolContext {
  deps: AgentDeps;
  state: TaskState;
  tabId: string;
  stepIndex: number;
  /** only the loop mutates state; tools ask via these */
  update(fn: (s: TaskState) => TaskState): void;
  addSource(s: Source): void;
  emit(e: AgentEvent): void;
  signal: AbortSignal;
  /** the loop runs in sub-agent mode: no events on the main timeline */
  sub: boolean;
  nowMs(): number;
}

export interface ToolDef<A = Record<string, unknown>> {
  spec: ToolSpec;
  group: ToolGroup;
  kind: StepKind;
  readOnly: boolean;
  schema: ZodTypeAny;
  /** resolve the element a tool targets, so safety and the fly can see it */
  target?(ctx: ToolContext, args: A): Promise<{ ref: string; label: string; element: import('./browser').ElementRef; url: string } | undefined>;
  run(ctx: ToolContext, args: A): Promise<ToolOutput>;
}

export type { CallPurpose, ChatMessage, StepRecord, Approval, Rect };
