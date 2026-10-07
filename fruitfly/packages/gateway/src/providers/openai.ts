import type { ChatMessage, ToolCall } from '@fruitfly/core';
import { providerError } from '../errors';
import type { CompletionRequest, CompletionResponse, Provider, ProviderContext } from '../types';
import { readJson, send, sseData } from './http';

interface OAIChoice { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }
interface OAIResponse { choices?: OAIChoice[]; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }; model?: string; error?: { message?: string } }

export function toOpenAIMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId ?? 'call', content: m.content };
    if (m.role === 'assistant' && m.toolCalls?.length) return { role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) };
    return { role: m.role, content: m.content };
  });
}

export function parseToolArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try { const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { throw providerError('malformed_output', 'The model sent malformed tool arguments.'); }
}

/** OpenAI-compatible: FreeLLMAPI, OpenRouter-style gateways, LM Studio, Ollama's /v1. */
export const openaiProvider: Provider = {
  id: 'openai-compat',
  async complete(req: CompletionRequest, ctx: ProviderContext): Promise<CompletionResponse> {
    const { route, prepared } = ctx;
    const body: Record<string, unknown> = {
      model: route.model,
      messages: toOpenAIMessages(prepared.messages),
      max_tokens: req.maxOutputTokens ?? Math.min(2048, route.caps.maxOutput),
      temperature: req.temperature ?? 0.2,
    };
    if (req.tools?.length && route.caps.tools) { body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })); body.tool_choice = 'auto'; }
    if (req.json && route.caps.json) body.response_format = { type: 'json_object' };
    const headers: Record<string, string> = ctx.key ? { authorization: `Bearer ${ctx.key}` } : {};
    const url = `${route.baseUrl.replace(/\/$/, '')}/chat/completions`;

    if (req.onDelta && route.caps.streaming) {
      body.stream = true;
      const res = await send(ctx, url, body, { headers });
      let text = ''; let finish: CompletionResponse['finish'] = 'stop'; const tcs = new Map<number, { id: string; name: string; args: string }>();
      for await (const d of sseData(res, ctx.signal)) {
        if (d === '[DONE]') break;
        let j: { choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[] };
        try { j = JSON.parse(d); } catch { continue; }
        const c = j.choices?.[0]; if (!c) continue;
        if (c.delta?.content) { text += c.delta.content; req.onDelta(c.delta.content); }
        for (const t of c.delta?.tool_calls ?? []) { const e = tcs.get(t.index) ?? { id: t.id ?? `call_${t.index}`, name: '', args: '' }; if (t.function?.name) e.name += t.function.name; if (t.function?.arguments) e.args += t.function.arguments; tcs.set(t.index, e); }
        if (c.finish_reason) finish = c.finish_reason === 'tool_calls' ? 'tool_calls' : c.finish_reason === 'length' ? 'length' : c.finish_reason === 'content_filter' ? 'filtered' : 'stop';
      }
      const toolCalls: ToolCall[] = [...tcs.values()].map((t) => ({ id: t.id, name: t.name, args: parseToolArgs(t.args) }));
      return { text: prepared.restore(text), toolCalls, usage: { inputTokens: 0, outputTokens: 0 }, routeId: route.id, model: route.model, finish: toolCalls.length ? 'tool_calls' : finish, routedVia: res.headers.get('x-routed-via') ?? undefined };
    }

    const res = await send(ctx, url, body, { headers });
    const json = await readJson<OAIResponse>(res);
    const choice = json.choices?.[0];
    if (!choice?.message) throw providerError('malformed_output', json.error?.message ?? 'Empty response.');
    if (choice.finish_reason === 'content_filter') throw providerError('content_filtered', 'Blocked by a content filter.');
    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((c, i) => ({ id: c.id ?? `call_${i}`, name: c.function?.name ?? '', args: parseToolArgs(c.function?.arguments) }));
    return {
      text: prepared.restore(choice.message.content ?? ''),
      toolCalls: toolCalls.map((c) => ({ ...c, args: restoreArgs(c.args, prepared.restore) })),
      usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0, cacheReadTokens: json.usage?.prompt_tokens_details?.cached_tokens },
      routeId: route.id, model: json.model ?? route.model,
      finish: toolCalls.length ? 'tool_calls' : choice.finish_reason === 'length' ? 'length' : 'stop',
      routedVia: res.headers.get('x-routed-via') ?? undefined,
    };
  },
  async embed(texts, ctx) {
    const url = `${ctx.route.baseUrl.replace(/\/$/, '')}/embeddings`;
    const res = await send(ctx, url, { model: ctx.route.model, input: texts }, { headers: ctx.key ? { authorization: `Bearer ${ctx.key}` } : {} });
    const json = await readJson<{ data?: { embedding: number[] }[] }>(res);
    if (!json.data?.length) throw providerError('malformed_output', 'No embeddings returned.');
    return json.data.map((d) => d.embedding);
  },
};

export function restoreArgs(args: Record<string, unknown>, restore: (s: string) => string): Record<string, unknown> {
  const walk = (v: unknown): unknown => typeof v === 'string' ? restore(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
  return walk(args) as Record<string, unknown>;
}
