import { estimateTokens, truncateToTokens, type ToolResult } from '@fruitfly/core';
import type { ObservationStore } from './observations';

export const DEFAULT_RESULT_BUDGET = 1500;

/** Split text into pages of ≤ budget tokens at paragraph/line boundaries. Cursor = char offset (opaque to the model). */
export function pageText(text: string, budgetTokens = DEFAULT_RESULT_BUDGET, cursor?: string): { page: string; nextCursor?: string; total: number; part: number; parts: number } {
  const start = cursor ? Math.max(0, Math.min(text.length, Number.parseInt(cursor, 10) || 0)) : 0;
  const rest = text.slice(start);
  if (estimateTokens(rest) <= budgetTokens) return { page: rest, total: text.length, part: pagesBefore(text, start, budgetTokens) + 1, parts: pagesBefore(text, start, budgetTokens) + 1 };
  const cut = truncateToTokens(rest, budgetTokens);
  let end = cut.text.length;
  const lastBreak = Math.max(cut.text.lastIndexOf('\n\n'), cut.text.lastIndexOf('\n'));
  if (lastBreak > end * 0.5) end = lastBreak + 1;
  const page = rest.slice(0, end);
  const parts = Math.ceil(estimateTokens(text) / budgetTokens);
  return { page, nextCursor: String(start + end), total: text.length, part: pagesBefore(text, start, budgetTokens) + 1, parts };
}
function pagesBefore(text: string, start: number, budget: number): number { return start === 0 ? 0 : Math.max(1, Math.round(estimateTokens(text.slice(0, start)) / budget)); }

export function pageList<T>(items: readonly T[], cursor?: string, size = 10): { page: T[]; nextCursor?: string; total: number; from: number } {
  const from = Math.max(0, Number.parseInt(cursor ?? '0', 10) || 0);
  const page = items.slice(from, from + size);
  return { page, nextCursor: from + size < items.length ? String(from + size) : undefined, total: items.length, from };
}

export function digest(text: string, max = 140): string {
  const first = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  const clean = first.replace(/^#+\s*/, '').replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface BudgetOpts { budget?: number; cursor?: string; hintTool?: string; taskId: string; step: number; store?: ObservationStore; label?: string; sensitivity?: 'public' | 'personal' | 'local-only' }

/**
 * Enforce a tool's result budget. Over budget → first page + truncated/next_cursor/hint, and the full blob goes
 * to the ObservationStore so `recall(handle, query)` can pull specific parts back on demand.
 */
export async function budgetResult(text: string, o: BudgetOpts): Promise<ToolResult<string>> {
  const budget = o.budget ?? DEFAULT_RESULT_BUDGET;
  const full = estimateTokens(text);
  let handle: string | undefined;
  if (o.store) handle = await o.store.put(o.taskId, o.step, text, { label: o.label ?? digest(text), sensitivity: o.sensitivity });
  if (full <= budget) return { data: text, tokens: full, truncated: false, handle };
  const p = pageText(text, budget, o.cursor);
  const hint = `Showing part ${p.part} of ${p.parts}. ${p.nextCursor ? `Call ${o.hintTool ?? 'read_page'}(cursor="${p.nextCursor}") for more, or ` : ''}recall("${handle ?? 'obs'}", "<what you need>") to pull specific parts, or find_element(query).`;
  return { data: p.page, tokens: estimateTokens(p.page), truncated: !!p.nextCursor, nextCursor: p.nextCursor, hint, handle };
}
