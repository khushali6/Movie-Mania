import type { ChatMessage, ToolCall } from '@fruitfly/core';
import { providerError } from '../errors';
import type { CompletionRequest, CompletionResponse, Provider, ProviderContext } from '../types';
import { readJson, send } from './http';
import { restoreArgs } from './openai';

interface GPart { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }
interface GResp { candidates?: { content?: { parts?: GPart[] }; finishReason?: string }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number }; promptFeedback?: { blockReason?: string } }

export function toGemini(messages: ChatMessage[]): { systemInstruction?: unknown; contents: unknown[] } {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents: unknown[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') { contents.push({ role: 'user', parts: [{ functionResponse: { name: m.name ?? 'tool', response: { result: m.content } } }] }); continue; }
    if (m.role === 'assistant') { contents.push({ role: 'model', parts: [...(m.content ? [{ text: m.content }] : []), ...(m.toolCalls ?? []).map((c) => ({ functionCall: { name: c.name, args: c.args } }))] }); continue; }
    contents.push({ role: 'user', parts: [{ text: m.content }] });
  }
  return { systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, contents };
}

export const geminiProvider: Provider = {
  id: 'gemini',
  async complete(req: CompletionRequest, ctx: ProviderContext): Promise<CompletionResponse> {
    const { route, prepared } = ctx;
    if (!ctx.key) throw providerError('auth', 'That key didn\'t work.');
    const { systemInstruction, contents } = toGemini(prepared.messages);
    const body: Record<string, unknown> = { contents, generationConfig: { maxOutputTokens: req.maxOutputTokens ?? Math.min(2048, route.caps.maxOutput), temperature: req.temperature ?? 0.2, ...(req.json ? { responseMimeType: 'application/json' } : {}) } };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    if (req.tools?.length && route.caps.tools) body.tools = [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
    const res = await send(ctx, `${route.baseUrl.replace(/\/$/, '')}/v1beta/models/${route.model}:generateContent`, body, { headers: { 'x-goog-api-key': ctx.key } });
    const json = await readJson<GResp>(res);
    if (json.promptFeedback?.blockReason) throw providerError('content_filtered', 'Blocked by a content filter.');
    const cand = json.candidates?.[0];
    if (!cand) throw providerError('malformed_output', 'Empty response.');
    if (cand.finishReason === 'SAFETY') throw providerError('content_filtered', 'Blocked by a content filter.');
    const parts = cand.content?.parts ?? [];
    const toolCalls: ToolCall[] = parts.filter((p) => p.functionCall).map((p, i) => ({ id: `call_${i}`, name: p.functionCall!.name, args: restoreArgs(p.functionCall!.args ?? {}, prepared.restore) }));
    return {
      text: prepared.restore(parts.map((p) => p.text ?? '').join('')), toolCalls,
      usage: { inputTokens: json.usageMetadata?.promptTokenCount ?? 0, outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0, cacheReadTokens: json.usageMetadata?.cachedContentTokenCount },
      routeId: route.id, model: route.model, finish: toolCalls.length ? 'tool_calls' : cand.finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
    };
  },
};
