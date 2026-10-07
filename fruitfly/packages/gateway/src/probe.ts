import { FruitflyError } from '@fruitfly/core';
import type { EgressGuard, EgressRoute } from '@fruitfly/egress';
import { DEFAULT_GATEWAY_URL } from './catalog';
import type { Caps } from './types';

export interface GatewayDetection { reachable: boolean; authRequired: boolean; via: 'ping' | 'models' | 'none' }

/** Detect a running FreeLLMAPI-style gateway. Tries /api/ping (if present) then /v1/models (401 still means "it's there"). */
export async function detectGateway(guard: EgressGuard, baseUrl = DEFAULT_GATEWAY_URL, signal?: AbortSignal): Promise<GatewayDetection> {
  const route: EgressRoute = { id: 'probe', kind: 'local', allowsPersonal: false };
  const origin = new URL(baseUrl).origin;
  const get = async (url: string, headers: Record<string, string> = {}) => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 2500);
    signal?.addEventListener('abort', () => ac.abort(), { once: true });
    try { return await guard.fetch(route, url, { method: 'GET', headers, signal: ac.signal }, { category: 'gateway-probe' }); } finally { clearTimeout(t); }
  };
  try { const r = await get(`${origin}/api/ping`); if (r.ok) return { reachable: true, authRequired: false, via: 'ping' }; } catch { /* fall through */ }
  try { const r = await get(`${baseUrl.replace(/\/$/, '')}/models`); if (r.ok) return { reachable: true, authRequired: false, via: 'models' }; if (r.status === 401 || r.status === 403) return { reachable: true, authRequired: true, via: 'models' }; } catch { /* not reachable */ }
  return { reachable: false, authRequired: false, via: 'none' };
}

export interface ModelListing { id: string; context?: number; ready?: boolean }

export async function listGatewayModels(guard: EgressGuard, baseUrl: string, key: string | undefined, signal?: AbortSignal): Promise<ModelListing[]> {
  const route: EgressRoute = { id: 'probe', kind: 'local', allowsPersonal: false };
  const res = await guard.fetch(route, `${baseUrl.replace(/\/$/, '')}/models`, { method: 'GET', headers: key ? { authorization: `Bearer ${key}` } : {}, signal }, { category: 'gateway-probe' });
  if (res.status === 401 || res.status === 403) throw new FruitflyError('auth', "That key didn't work.");
  if (!res.ok) throw new FruitflyError('gateway_down', "I can't reach your gateway.");
  const j = (await res.json()) as { data?: { id: string; context_length?: number; context_window?: number; execution_status?: string }[] };
  return (j.data ?? []).map((m) => ({ id: m.id, context: m.context_length ?? m.context_window, ready: m.execution_status ? m.execution_status === 'ready' : undefined }));
}

/** Infer capabilities from a model id when the gateway doesn't say. Conservative. */
export function inferCaps(id: string, listed?: ModelListing): Caps {
  const n = id.toLowerCase();
  const vision = /vision|gpt-4o|gemini|claude|llava|pixtral|qwen.*vl/.test(n);
  const tools = !/(embed|whisper|tts|instruct-v0\.1|base)/.test(n);
  const ctx = listed?.context ?? (/gemini/.test(n) ? 1_000_000 : /claude/.test(n) ? 200_000 : /llama-?3|qwen|mistral|deepseek|gpt/.test(n) ? 32_000 : 16_000);
  return { tools, vision, streaming: true, json: true, maxContext: ctx, maxOutput: 4096 };
}
