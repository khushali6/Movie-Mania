import type { ProfileName } from '@fruitfly/core';
import type { Caps, Route, RouteProfile } from './types';

export const DEFAULT_GATEWAY_URL = 'http://localhost:3001/v1';
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

const baseCaps: Caps = { tools: true, vision: false, streaming: true, json: true, maxContext: 32_000, maxOutput: 4096 };

/** FreeLLMAPI virtual models (current docs): `auto`, `auto:smart`, `auto:fast`, `auto:balanced`. */
export function gatewayRoute(model: 'auto' | 'auto:smart' | 'auto:fast' | 'auto:balanced', baseUrl = DEFAULT_GATEWAY_URL, over: Partial<Route> = {}): Route {
  return {
    id: `gateway:${model}`, label: `Free pool · ${model === 'auto' ? 'auto' : model.slice(5)}`, provider: 'freellmapi', model, kind: 'remote',
    allowsPersonal: false, baseUrl, keyRef: 'gateway', caps: { ...baseCaps, maxContext: 32_000 }, limits: { rpm: 30, tpm: 120_000 }, ...over,
  };
}

export function ollamaRoute(model = 'llama3.1:8b', baseUrl = DEFAULT_OLLAMA_URL, over: Partial<Route> = {}): Route {
  return { id: `ollama:${model}`, label: `On this device · ${model}`, provider: 'ollama', model, kind: 'local', allowsPersonal: true, baseUrl, caps: { tools: true, vision: false, streaming: true, json: true, maxContext: 16_000, maxOutput: 2048 }, limits: { rpm: 600, tpm: 10_000_000 }, ...over };
}

export function anthropicRoute(model: string, keyRef = 'anthropic', over: Partial<Route> = {}): Route {
  return { id: `anthropic:${model}`, label: `Anthropic · ${model}`, provider: 'anthropic', model, kind: 'remote', allowsPersonal: false, baseUrl: 'https://api.anthropic.com', keyRef, caps: { tools: true, vision: true, streaming: true, json: true, maxContext: 200_000, maxOutput: 8192 }, limits: { rpm: 50, tpm: 400_000 }, ...over };
}

export function geminiRoute(model = 'gemini-2.5-flash', keyRef = 'gemini', over: Partial<Route> = {}): Route {
  return { id: `gemini:${model}`, label: `Gemini · ${model}`, provider: 'gemini', model, kind: 'remote', allowsPersonal: false, baseUrl: 'https://generativelanguage.googleapis.com', keyRef, caps: { tools: true, vision: true, streaming: true, json: true, maxContext: 1_000_000, maxOutput: 8192 }, limits: { rpm: 15, tpm: 250_000 }, ...over };
}

export function scriptedRoute(over: Partial<Route> = {}): Route {
  return { id: 'demo:scripted', label: 'Demo mode', provider: 'scripted', model: 'demo', kind: 'local', allowsPersonal: true, baseUrl: 'scripted://', caps: { tools: true, vision: false, streaming: false, json: true, maxContext: 64_000, maxOutput: 4096 }, limits: { rpm: 6000, tpm: 100_000_000 }, ...over };
}

export type ChainTemplate = 'balanced' | 'fast' | 'max-quality' | 'private-only';

export function buildProfiles(template: ChainTemplate, o: { gatewayUrl?: string; ollamaModel?: string; ollamaUrl?: string; byo?: Route[]; embedRoutes?: Route[] } = {}): Record<ProfileName, RouteProfile> {
  const gw = (m: 'auto' | 'auto:smart' | 'auto:fast' | 'auto:balanced') => gatewayRoute(m, o.gatewayUrl);
  const ol = ollamaRoute(o.ollamaModel, o.ollamaUrl);
  const byo = o.byo ?? [];
  const local: RouteProfile = { name: 'local', chain: [ol] };
  const embed: RouteProfile = { name: 'embed', chain: o.embedRoutes ?? [ol] };
  if (template === 'private-only') return { fast: { name: 'fast', chain: [ol] }, smart: { name: 'smart', chain: [ol] }, vision: { name: 'vision', chain: [] }, embed, local };
  const fast = template === 'max-quality' ? [gw('auto:smart'), ol, ...byo] : [gw('auto:fast'), ol, ...byo];
  const smart = template === 'fast' ? [gw('auto:fast'), gw('auto'), ol, ...byo] : [gw('auto:smart'), gw('auto'), ol, ...byo];
  return { fast: { name: 'fast', chain: fast }, smart: { name: 'smart', chain: smart }, vision: { name: 'vision', chain: byo.filter((r) => r.caps.vision) }, embed, local };
}
