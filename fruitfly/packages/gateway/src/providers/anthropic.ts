import type { ChatMessage, ToolCall } from '@fruitfly/core';
import { providerError } from '../errors';
import type { CompletionRequest, CompletionResponse, Provider, ProviderContext } from '../types';
import { readJson, send } from './http';
import { restoreArgs } from './openai';

interface Block { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }
interface AResp { content?: Block[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }; model?: string }

/** Convert to the Anthropic wire format. Cache breakpoints are placed after the stable segments (system rules, profile digest). */
export function toAnthropic(messages: ChatMessage[]): { system: unknown[]; messages: unknown[] } {
  const system: unknown[] = []; const out: unknown[] = [];
  for (const m of messages) {
    if (m.role === 'system') { const b: Record<string, unknown> = { type: 'text', text: m.content }; if (m.cacheBreakpoint) b.cache_control = { type: 'ephemeral' }; system.push(b); continue; }
    if (m.role === 'tool') { out.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId ?? 'call', content: m.content }] }); continue; }
    if (m.role === 'assistant' && m.toolCalls?.length) { out.push({ role: 'assistant', content: [...(m.content ? [{ type: 'text', text: m.content }] : []), ...m.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args }))] }); continue; }
    out.push({ role: m.role, content: m.content });
  }
  // merge consecutive same-role turns (the API requires alternation)
  const merged: { role: string; content: unknown }[] = [];
  for (const m of out as { role: string; content: unknown }[]) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      const a = Array.isArray(last.content) ? last.content : [{ type: 'text', text: String(last.content) }];
      const b = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content) }];
      last.content = [...a, ...b];
    } else merged.push({ ...m });
  }
  return { system, messages: merged };
}

export const anthropicProvider: Provider = {
  id: 'anthropic',
  async complete(req: CompletionRequest, ctx: ProviderContext): Promise<CompletionResponse> {
    const { route, prepared } = ctx;
    if (!ctx.key) throw providerError('auth', 'That key didn\'t work.');
    const { system, messages } = toAnthropic(prepared.messages);
    const body: Record<string, unknown> = { model: route.model, max_tokens: req.maxOutputTokens ?? Math.min(2048, route.caps.maxOutput), system, messages, temperature: req.temperature ?? 0.2 };
    if (req.tools?.length && route.caps.tools) body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    const res = await send(ctx, `${route.baseUrl.replace(/\/$/, '')}/v1/messages`, body, { headers: { 'x-api-key': ctx.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    const json = await readJson<AResp>(res);
    const text = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    const toolCalls: ToolCall[] = (json.content ?? []).filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id ?? 'call', name: b.name ?? '', args: restoreArgs(b.input ?? {}, prepared.restore) }));
    if (json.stop_reason === 'refusal') throw providerError('content_filtered', 'Blocked by a content filter.');
    return {
      text: prepared.restore(text), toolCalls,
      usage: { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0, cacheReadTokens: json.usage?.cache_read_input_tokens, cacheWriteTokens: json.usage?.cache_creation_input_tokens },
      routeId: route.id, model: json.model ?? route.model, finish: toolCalls.length ? 'tool_calls' : json.stop_reason === 'max_tokens' ? 'length' : 'stop',
    };
  },
};

/** Exact pre-flight token count via Anthropic's token-counting endpoint (optional). */
export async function anthropicCountTokens(ctx: Omit<ProviderContext, 'prepared'>, messages: ChatMessage[]): Promise<number> {
  if (!ctx.key) throw providerError('auth', 'That key didn\'t work.');
  const { system, messages: msgs } = toAnthropic(messages);
  const res = await send(ctx, `${ctx.route.baseUrl.replace(/\/$/, '')}/v1/messages/count_tokens`, { model: ctx.route.model, system, messages: msgs }, { headers: { 'x-api-key': ctx.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
  const j = await readJson<{ input_tokens?: number }>(res);
  return j.input_tokens ?? 0;
}
