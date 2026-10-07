import { estimateTokens, maxSensitivity, type CompactionReport, type ContextSegment, type ModelInfo, type Sensitivity, type StepRecord, type TaskState, type ToolSpec, type ChatMessage } from '@fruitfly/core';
import { COMPACT_AT, HARD_STOP_AT, budgetsFor, type Budgets } from './budgets';
import { PromptBuilder, stepMessages, type BuiltPrompt, type Passage } from './prompt';
import type { MeterReport } from './meter';

export interface ContextInputs { tools: ToolSpec[]; profileDigest?: string; profileSensitivity?: Sensitivity; standingInstructions?: string; passages?: Passage[] }

export interface BuiltContext extends BuiltPrompt {
  budgets: Budgets;
  totalTokens: number;
  usedFraction: number;
  needsCompaction: boolean;
  overflow: boolean;
  /** highest sensitivity present: tells the router which profile it may use */
  sensitivity: Sensitivity;
}

export interface BreakdownSegment { kind: ContextSegment['kind'] | 'reserve'; tokens: number; fraction: number; cacheable: boolean; sensitivity: Sensitivity; trimmable: boolean; description: string }
export interface ContextBreakdown { window: number; used: number; reserve: number; compactAt: number; cachedPrefixTokens: number; segments: BreakdownSegment[]; cacheHitRatio?: number }

export type Summarizer = (input: { previous?: string; turns: { index: number; tool: string; args: Record<string, unknown>; digest: string; ok: boolean }[]; maxTokens: number }) => Promise<string>;

/** Deterministic, no-model fallback: a compact action log. Used by tests, demo mode and when no model is reachable. */
export const extractiveSummarizer: Summarizer = async ({ previous, turns, maxTokens }) => {
  const lines = turns.map((t) => `${t.index}. ${t.ok ? '' : '(failed) '}${t.tool}(${Object.values(t.args).map((v) => JSON.stringify(v)).join(', ').slice(0, 60)}) → ${t.digest}`);
  let text = [previous, ...lines].filter(Boolean).join('\n');
  while (estimateTokens(text) > maxTokens && text.includes('\n')) text = text.slice(text.indexOf('\n') + 1);
  return text;
};

const DESCRIPTIONS: Record<string, string> = {
  system: 'Rules, safety and style. Fixed.', tools: 'Tool schemas for the active groups. Fixed.', profile: 'About you digest and standing instructions.',
  scratchpad: 'Goal, findings, rejected options. Never summarised.', docs: 'Passages retrieved from Pantry.', history: 'Earlier steps, masked or summarised when long.',
  observation: 'The newest page or tool result.', reserve: 'Room kept free for the answer.',
};

export class ContextManager {
  private builder = new PromptBuilder();
  /** keep this many most-recent steps verbatim */
  keepRaw = 2;
  keepTurns = 6;
  constructor(private summarize: Summarizer = extractiveSummarizer) {}

  build(task: TaskState, model: ModelInfo | undefined, inp: ContextInputs): BuiltContext {
    const budgets = budgetsFor(model);
    const built = this.builder.build({ task, budgets, ...inp });
    const total = built.segments.reduce((a, s) => a + s.tokens, 0);
    const sensitivity = built.messages.reduce<Sensitivity>((a, m) => maxSensitivity(a, m.sensitivity ?? 'personal'), 'public');
    return { ...built, budgets, totalTokens: total, usedFraction: total / budgets.window, needsCompaction: total >= budgets.compactAt, overflow: total >= budgets.hardStop, sensitivity };
  }

  /** Batch-mask old observations once history is more than half its budget, to keep the prefix cache warm between maskings. */
  maybeMask(task: TaskState, model: ModelInfo | undefined): TaskState {
    const b = budgetsFor(model);
    const hist = this.historyTokens(task);
    if (hist < b.history * 0.5) return task;
    return this.mask(task).task;
  }

  mask(task: TaskState): { task: TaskState; masked: number } {
    const visible = task.steps.filter((s) => !task.summary || s.index > task.summary.upToStep);
    const cutoff = visible.length - this.keepRaw;
    let masked = 0;
    const steps = task.steps.map((s) => {
      const idx = visible.indexOf(s);
      if (idx !== -1 && idx < cutoff && !s.masked && s.inline !== undefined) { masked++; return { ...s, masked: true, inline: undefined }; }
      return s;
    });
    return { task: { ...task, steps }, masked };
  }

  private historyTokens(task: TaskState): number {
    return task.steps.filter((s) => !task.summary || s.index > task.summary.upToStep).flatMap(stepMessages).reduce((a, m) => a + estimateTokens(m.content) + 4, 0) + (task.summary?.tokens ?? 0);
  }

  async compact(task: TaskState, why: CompactionReport['why'], model: ModelInfo | undefined, inp: ContextInputs): Promise<{ task: TaskState; report: CompactionReport }> {
    const before = this.build(task, model, inp).totalTokens;
    const b = budgetsFor(model);
    // 1. observation masking: replace old results with a digest + handle, keep the action record
    const m1 = this.mask(task);
    let next = m1.task;
    // 2. rolling summary of the oldest turns when still heavy (or when the user/overflow asks)
    let summarized = 0;
    const visible = next.steps.filter((s) => !next.summary || s.index > next.summary.upToStep);
    const stillHeavy = this.build(next, model, inp).totalTokens > b.window * 0.5 || why !== 'threshold';
    if (stillHeavy && visible.length > this.keepTurns) {
      const old = visible.slice(0, visible.length - this.keepTurns);
      const text = await this.summarize({ previous: next.summary?.text, turns: old.map((s) => ({ index: s.index, tool: s.tool, args: s.args, digest: s.digest, ok: s.ok })), maxTokens: 320 });
      const sens = old.reduce<Sensitivity>((a, s) => maxSensitivity(a, s.sensitivity), next.summary?.sensitivity ?? 'public');
      const upTo = old[old.length - 1]!.index;
      next = { ...next, summary: { text, upToStep: upTo, sensitivity: sens, tokens: estimateTokens(text) } };
      summarized = old.length;
    }
    const after = this.build(next, model, inp).totalTokens;
    const report: CompactionReport = { why, stepsMasked: m1.masked, turnsSummarized: summarized, tokensBefore: before, tokensAfter: after };
    return { task: { ...next, compactions: [...next.compactions, report] }, report };
  }

  inspect(task: TaskState, model: ModelInfo | undefined, inp: ContextInputs, meter?: MeterReport): ContextBreakdown {
    const built = this.build(task, model, inp);
    const w = built.budgets.window;
    const segments: BreakdownSegment[] = built.segments.map((s) => ({
      kind: s.kind, tokens: s.tokens, fraction: s.tokens / w, cacheable: s.cacheable, sensitivity: s.sensitivity,
      trimmable: s.kind === 'docs' || s.kind === 'history' || s.kind === 'observation', description: DESCRIPTIONS[s.kind] ?? '',
    }));
    segments.push({ kind: 'reserve', tokens: built.budgets.reserve, fraction: built.budgets.reserve / w, cacheable: false, sensitivity: 'public', trimmable: false, description: DESCRIPTIONS.reserve! });
    return { window: w, used: built.totalTokens, reserve: built.budgets.reserve, compactAt: built.budgets.compactAt, cachedPrefixTokens: built.cachedPrefixTokens, segments, cacheHitRatio: meter?.hitRatio };
  }

  /** Fresh context per task: carry only the result card + scratchpad, never the transcript. */
  carryOver(prev: TaskState): { priorResult?: string; scratchpad: TaskState['scratchpad'] } {
    const r = prev.result;
    return { priorResult: r ? `${r.title}: ${r.summary}` : undefined, scratchpad: prev.scratchpad };
  }
}

export { COMPACT_AT, HARD_STOP_AT };
export type { StepRecord, ChatMessage };
