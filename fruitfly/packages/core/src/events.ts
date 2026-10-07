import { z } from 'zod';
import { FLY_MOODS } from './mood';
import type { FlyMood } from './mood';

export const SensitivitySchema = z.enum(['public', 'personal', 'local-only']);

export const SourceSchema = z.object({
  kind: z.enum(['page', 'pantry']),
  title: z.string(),
  url: z.string().optional(),
  docId: z.string().optional(),
  page: z.number().optional(),
  passageId: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const ScratchpadSchema = z.object({
  goal: z.string(),
  constraints: z.array(z.string()),
  findings: z.array(z.string()),
  rejected: z.array(z.string()),
  openQuestions: z.array(z.string()),
});
export type Scratchpad = z.infer<typeof ScratchpadSchema>;

export const TableSchema = z.object({
  title: z.string().optional(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export const ResultSchema = z.object({
  title: z.string(),
  summary: z.string(),
  table: TableSchema.optional(),
  bullets: z.array(z.string()).optional(),
  sources: z.array(SourceSchema),
  verification: z.string().optional(),
  status: z.enum(['success', 'partial', 'failed']).default('success'),
});
export type TaskResult = z.infer<typeof ResultSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  action: z.string(),
  reason: z.string(),
  level: z.enum(['confirm', 'sensitive']),
  site: z.string().optional(),
  /** Masked preview: vault/profile values are never included, only placeholders. */
  preview: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const CompactionSchema = z.object({
  why: z.enum(['threshold', 'user', 'overflow']),
  stepsMasked: z.number(),
  turnsSummarized: z.number(),
  tokensBefore: z.number(),
  tokensAfter: z.number(),
});
export type CompactionReport = z.infer<typeof CompactionSchema>;

export const StepInfoSchema = z.object({
  id: z.string(),
  index: z.number(),
  title: z.string(),
  tool: z.string().optional(),
  args: z.record(z.unknown()).optional(),
  tabId: z.string().optional(),
  targetLabel: z.string().optional(),
});
export type StepInfo = z.infer<typeof StepInfoSchema>;

const base = { taskId: z.string(), at: z.number() };

export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('task_started'), goal: z.string(), mode: z.enum(['demo', 'live']) }),
  z.object({ ...base, type: z.literal('thinking'), note: z.string().optional() }),
  z.object({ ...base, type: z.literal('step_started'), step: StepInfoSchema, kind: z.enum(['read', 'search', 'click', 'type', 'navigate', 'wait', 'other']) }),
  z.object({ ...base, type: z.literal('step_finished'), stepId: z.string(), ok: z.boolean(), digest: z.string(), tokens: z.number(), ms: z.number(), route: z.string().optional(), truncated: z.boolean().optional(), handle: z.string().optional() }),
  z.object({ ...base, type: z.literal('unexpected'), stepId: z.string().optional(), note: z.string() }),
  z.object({ ...base, type: z.literal('approval_needed'), approval: ApprovalSchema }),
  z.object({ ...base, type: z.literal('approval_resolved'), approvalId: z.string(), decision: z.enum(['approve', 'cancel', 'takeover']) }),
  z.object({ ...base, type: z.literal('route_switch'), from: z.string().optional(), to: z.string(), reason: z.string() }),
  z.object({ ...base, type: z.literal('throttled'), untilMs: z.number(), routeId: z.string(), queuePosition: z.number().optional() }),
  z.object({ ...base, type: z.literal('unthrottled') }),
  z.object({ ...base, type: z.literal('compacted'), report: CompactionSchema }),
  z.object({ ...base, type: z.literal('source_added'), source: SourceSchema }),
  z.object({ ...base, type: z.literal('subagent'), id: z.string(), kind: z.enum(['reader', 'researcher', 'doc', 'critic']), label: z.string(), phase: z.enum(['start', 'done', 'failed']), summary: z.string().optional() }),
  z.object({ ...base, type: z.literal('note_proposed'), noteId: z.string(), text: z.string() }),
  z.object({ ...base, type: z.literal('injection_flag'), where: z.string(), excerpt: z.string() }),
  z.object({ ...base, type: z.literal('usage'), tokensUsed: z.number(), tokensCap: z.number(), stepsUsed: z.number(), stepsCap: z.number(), cacheRead: z.number().optional(), cacheWrite: z.number().optional() }),
  z.object({ ...base, type: z.literal('result'), result: ResultSchema }),
  z.object({ ...base, type: z.literal('error'), code: z.string(), message: z.string(), recoverable: z.boolean() }),
  z.object({ ...base, type: z.literal('paused') }),
  z.object({ ...base, type: z.literal('resumed') }),
  z.object({ ...base, type: z.literal('stopped'), by: z.enum(['user', 'guard', 'budget']) }),
  z.object({ ...base, type: z.literal('fly_hint'), mood: z.enum(FLY_MOODS), anchor: z.string().optional() }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventType = AgentEvent['type'];

/** Which mood the fly should take for a given event. null = leave the mood alone. */
export function moodForEvent(e: AgentEvent): { mood: FlyMood; anchor?: string } | null {
  switch (e.type) {
    case 'task_started': return { mood: 'thinking', anchor: 'timeline-active-step' };
    case 'thinking': return { mood: 'thinking' };
    case 'step_started':
      switch (e.kind) {
        case 'read': return { mood: 'reading', anchor: 'page-preview' };
        case 'search': return { mood: 'searching', anchor: 'page-preview' };
        case 'click': return { mood: 'acting', anchor: 'page-preview' };
        case 'type': return { mood: 'typing', anchor: 'page-preview' };
        case 'navigate': return { mood: 'acting', anchor: 'page-preview' };
        case 'wait': return { mood: 'waiting' };
        default: return { mood: 'thinking', anchor: 'timeline-active-step' };
      }
    case 'unexpected': return { mood: 'confused' };
    case 'approval_needed': return { mood: 'asking', anchor: 'approval-card' };
    case 'approval_resolved': return e.decision === 'approve' ? { mood: 'acting' } : { mood: 'idle', anchor: 'perch-default' };
    case 'throttled': return { mood: 'waiting', anchor: 'nectar-meter' };
    case 'unthrottled': return { mood: 'thinking' };
    case 'compacted': return { mood: 'thinking', anchor: 'context-meter' };
    case 'result': return e.result.status === 'failed' ? { mood: 'error' } : { mood: 'success', anchor: 'result-card' };
    case 'error': return { mood: 'error' };
    case 'stopped': return { mood: 'idle', anchor: 'perch-default' };
    case 'paused': return { mood: 'waiting' };
    case 'resumed': return { mood: 'thinking' };
    case 'fly_hint': return { mood: e.mood, anchor: e.anchor };
    default: return null;
  }
}
