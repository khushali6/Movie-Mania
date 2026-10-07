import type { ToolCall } from '@fruitfly/core';
import { providerError } from '../errors';
import type { CompletionRequest, CompletionResponse, Provider, ProviderContext } from '../types';
import { readJson, send } from './http';
import { restoreArgs } from './openai';

interface OResp { message?: { content?: string; tool_calls?: { function?: { name?: string; arguments?: Record<string, unknown> | string } }[] }; prompt_eval_count?: number; eval_count?: number; done_reason?: string }

/** Native Ollama API: fully local chat + embeddings. */
export const ollamaProvider: Provider = {
  id: 'ollama',
  async complete(req: CompletionRequest, ctx: ProviderContext): Promise<CompletionResponse> {
    const { route, prepared } = ctx;
    const body: Record<string, unknown> = {
      model: route.model, stream: false,
      messages: prepared.messages.map((m) => m.role === 'assistant' && m.toolCalls?.length ? { role: 'assistant', content: m.content, tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.args } })) } : { role: m.role === 'tool' ? 'tool' : m.role, content: m.content }),
      options: { num_predict: req.maxOutputTokens ?? Math.min(2048, route.caps.maxOutput), temperature: req.temperature ?? 0.2, num_ctx: Math.min(route.caps.maxContext, 32768) },
    };
    if (req.tools?.length && route.caps.tools) body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    if (req.json) body.format = 'json';
    const res = await send(ctx, `${route.baseUrl.replace(/\/$/, '')}/api/chat`, body);
    const j = await readJson<OResp>(res);
    if (!j.message) throw providerError('malformed_output', 'Empty response.');
    const toolCalls: ToolCall[] = (j.message.tool_calls ?? []).map((c, i) => {
      const a = c.function?.arguments;
      const args = typeof a === 'string' ? (() => { try { return JSON.parse(a) as Record<string, unknown>; } catch { throw providerError('malformed_output', 'Malformed tool arguments.'); } })() : (a ?? {});
      return { id: `call_${i}`, name: c.function?.name ?? '', args: restoreArgs(args, prepared.restore) };
    });
    return { text: prepared.restore(j.message.content ?? ''), toolCalls, usage: { inputTokens: j.prompt_eval_count ?? 0, outputTokens: j.eval_count ?? 0 }, routeId: route.id, model: route.model, finish: toolCalls.length ? 'tool_calls' : j.done_reason === 'length' ? 'length' : 'stop' };
  },
  async embed(texts, ctx) {
    const res = await send(ctx, `${ctx.route.baseUrl.replace(/\/$/, '')}/api/embed`, { model: ctx.route.model, input: texts });
    const j = await readJson<{ embeddings?: number[][] }>(res);
    if (!j.embeddings?.length) throw providerError('malformed_output', 'No embeddings returned.');
    return j.embeddings;
  },
};
