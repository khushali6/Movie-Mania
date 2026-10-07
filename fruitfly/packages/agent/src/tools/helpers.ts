import { estimateTokens } from '@fruitfly/core';
import { budgetResult, digest as mkDigest } from '@fruitfly/context';
import { wrapUntrusted } from '@fruitfly/egress';
import type { ToolContext, ToolOutput } from '../types';

export async function paged(ctx: ToolContext, text: string, o: { tool: string; cursor?: string; label?: string; budget?: number; sensitivity?: 'public' | 'personal' | 'local-only' }): Promise<ToolOutput> {
  const r = await budgetResult(text, { taskId: ctx.state.id, step: ctx.stepIndex, store: ctx.deps.observations, hintTool: o.tool, cursor: o.cursor, label: o.label, budget: o.budget, sensitivity: o.sensitivity });
  const body = r.hint ? `${r.data}\n\n[${r.hint}]` : r.data;
  return { text: body, truncated: r.truncated, handle: r.handle, digest: o.label ?? mkDigest(text), sensitivity: o.sensitivity };
}

export const untrustedPage = (url: string, title: string, body: string): string => wrapUntrusted('page', { url, title }, body);
export { estimateTokens };
