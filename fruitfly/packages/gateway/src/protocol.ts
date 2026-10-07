import type { ChatMessage, ToolCall, ToolSpec } from '@fruitfly/core';
import { stableStringify } from '@fruitfly/core';

/**
 * JSON-action text protocol for models without native tool calling.
 * The model is asked to reply with a single JSON object: {"action": "<tool>", "args": {...}, "thought": "..."}.
 */
export function encodeToolPrompt(tools: readonly ToolSpec[]): string {
  const lines = tools.map((t) => `- ${t.name}: ${t.description}\n  args schema: ${stableStringify(t.parameters)}`);
  return [
    'You can act only by calling one tool per reply. Reply with ONLY a JSON object, no prose, no code fences:',
    '{"action":"<tool name>","args":{...}}',
    'Tools:',
    ...lines,
  ].join('\n');
}

export function withToolPrompt(messages: ChatMessage[], tools: readonly ToolSpec[]): ChatMessage[] {
  const sys: ChatMessage = { role: 'system', content: encodeToolPrompt(tools), sensitivity: 'public', segmentId: 'tool-protocol', segmentKind: 'tools' };
  const first = messages.findIndex((m) => m.role !== 'system');
  const idx = first === -1 ? messages.length : first;
  // tool/assistant tool-call messages become plain text so the model sees its own history in the same format
  const flat = messages.map((m): ChatMessage => {
    if (m.role === 'assistant' && m.toolCalls?.length) return { ...m, toolCalls: undefined, content: JSON.stringify({ action: m.toolCalls[0]!.name, args: m.toolCalls[0]!.args }) };
    if (m.role === 'tool') return { ...m, role: 'user', toolCallId: undefined, content: `Tool result (${m.name ?? 'tool'}): ${m.content}` };
    return m;
  });
  return [...flat.slice(0, idx), sys, ...flat.slice(idx)];
}

function extractJson(text: string): unknown {
  const t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const candidates = [fence?.[1], t];
  const first = t.indexOf('{'); const last = t.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(t.slice(first, last + 1));
  for (const c of candidates) {
    if (!c) continue;
    try { return JSON.parse(c); } catch { /* try next */ }
  }
  return undefined;
}

export function parseActionText(text: string, tools: readonly ToolSpec[]): { toolCalls: ToolCall[] } | null {
  const obj = extractJson(text) as { action?: unknown; tool?: unknown; name?: unknown; args?: unknown; arguments?: unknown; parameters?: unknown } | undefined;
  if (!obj || typeof obj !== 'object') return null;
  const name = String(obj.action ?? obj.tool ?? obj.name ?? '');
  const spec = tools.find((t) => t.name === name);
  if (!spec) return null;
  const rawArgs = obj.args ?? obj.arguments ?? obj.parameters ?? {};
  const args = (typeof rawArgs === 'string' ? (extractJson(rawArgs) ?? {}) : rawArgs) as Record<string, unknown>;
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return null;
  for (const req of spec.parameters.required ?? []) if (!(req in args)) return null;
  return { toolCalls: [{ id: `call_${Math.random().toString(36).slice(2, 9)}`, name, args }] };
}

export const REPAIR_PROMPT = 'That was not a valid action. Reply with ONLY one JSON object: {"action":"<tool name>","args":{...}} using an exact tool name and all required args.';
