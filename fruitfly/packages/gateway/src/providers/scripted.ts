import type { ToolCall } from '@fruitfly/core';
import { providerError } from '../errors';
import type { CompletionRequest, CompletionResponse, Provider, ProviderContext } from '../types';

export type ScriptedReply = { kind: 'reply'; text?: string; toolCalls?: { name: string; args: Record<string, unknown> }[]; delayMs?: number };
export type ScriptedFault = { kind: 'fault'; code: 'rate_limited' | 'server_error' | 'timeout' | 'context_length' | 'malformed_output' | 'auth' | 'content_filtered' | 'network'; retryAfterMs?: number };
export type ScriptedStep = ScriptedReply | ScriptedFault;
/** A brain decides the next step from the request. Deterministic demos and tests supply one. */
export type ScriptedBrain = (req: CompletionRequest, call: number) => ScriptedStep | Promise<ScriptedStep>;

/** Scripted "model" for demo mode. Runs entirely in-process: no network, no key. */
export function createScriptedProvider(brain: ScriptedBrain, opts: { sleep?: (ms: number, s: AbortSignal) => Promise<void> } = {}): Provider & { calls: number } {
  const sleep = opts.sleep ?? ((ms, s) => new Promise<void>((res, rej) => { const t = setTimeout(res, ms); s.addEventListener('abort', () => { clearTimeout(t); rej(providerError('aborted', 'Stopped.')); }, { once: true }); }));
  const p = {
    id: 'scripted' as const,
    calls: 0,
    async complete(req: CompletionRequest, ctx: ProviderContext): Promise<CompletionResponse> {
      const n = p.calls++;
      const step = await brain({ ...req, messages: ctx.prepared.messages }, n);
      if (step.kind === 'fault') throw providerError(step.code, `Scripted ${step.code}.`, { retryAfterMs: step.retryAfterMs, status: step.code === 'rate_limited' ? 429 : undefined });
      if (step.delayMs) await sleep(step.delayMs, ctx.signal);
      if (ctx.signal.aborted) throw providerError('aborted', 'Stopped.');
      const toolCalls: ToolCall[] = (step.toolCalls ?? []).map((c, i) => ({ id: `scripted_${n}_${i}`, name: c.name, args: c.args }));
      const text = step.text ?? '';
      const inTok = ctx.prepared.preview.segments.reduce((a, s) => a + s.tokens, 0);
      return { text, toolCalls, usage: { inputTokens: inTok, outputTokens: Math.ceil(text.length / 4) + toolCalls.length * 20, cacheReadTokens: Math.floor(inTok * 0.6) }, routeId: ctx.route.id, model: ctx.route.model, finish: toolCalls.length ? 'tool_calls' : 'stop' };
    },
  };
  return p;
}
