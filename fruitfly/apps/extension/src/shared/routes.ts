import type { ProfileName } from '@fruitfly/core';
import { anthropicRoute, geminiRoute, gatewayRoute, ollamaRoute, type Route, type RouteProfile } from '@fruitfly/gateway';
import type { Settings } from './settings';

export function profilesFrom(s: Settings): Record<ProfileName, RouteProfile> {
  const allow = (id: string, r: Route): Route => ({ ...r, allowsPersonal: r.kind === 'local' ? true : !!s.allowPersonal[id] });
  const gw = (m: 'auto' | 'auto:smart' | 'auto:fast') => (s.gateway.enabled ? allow(`gateway:${m}`, gatewayRoute(m, s.gateway.url)) : undefined);
  const ol = s.ollama.enabled ? ollamaRoute(s.ollama.model, s.ollama.url) : undefined;
  const an = s.byo.anthropic.enabled ? allow(`anthropic:${s.byo.anthropic.model}`, anthropicRoute(s.byo.anthropic.model)) : undefined;
  const ge = s.byo.gemini.enabled ? allow(`gemini:${s.byo.gemini.model}`, geminiRoute(s.byo.gemini.model)) : undefined;
  const t = s.gateway.template;
  const compact = (xs: (Route | undefined)[]): Route[] => xs.filter(Boolean) as Route[];
  const priv = t === 'private-only';
  const fast = priv ? compact([ol]) : compact([t === 'max-quality' ? gw('auto:smart') : gw('auto:fast'), ol, an, ge]);
  const smart = priv ? compact([ol]) : compact(t === 'fast' ? [gw('auto:fast'), gw('auto'), ol, an, ge] : [gw('auto:smart'), gw('auto'), ol, an, ge]);
  const order = (p: ProfileName, rs: Route[]): Route[] => { const o = s.routeOrder[p]; return o?.length ? [...rs].sort((a, b) => (o.indexOf(a.id) + 1 || 99) - (o.indexOf(b.id) + 1 || 99)) : rs; };
  return {
    fast: { name: 'fast', chain: order('fast', fast) }, smart: { name: 'smart', chain: order('smart', smart) },
    vision: { name: 'vision', chain: order('vision', compact([an, ge].filter((r) => !priv && r?.caps.vision))) },
    embed: { name: 'embed', chain: compact([ol]) }, local: { name: 'local', chain: compact([ol]) },
  };
}
export const routeLabel = (s: Settings): string => (s.mode === 'demo' ? 'Demo mode' : s.gateway.template === 'private-only' || (!s.gateway.enabled && s.ollama.enabled) ? 'On this device' : s.gateway.enabled ? 'Free pool · auto' : s.byo.anthropic.enabled ? 'Anthropic' : s.byo.gemini.enabled ? 'Gemini' : 'No model yet');
export const isLiveConfigured = (s: Settings): boolean => s.gateway.enabled || s.ollama.enabled || s.byo.anthropic.enabled || s.byo.gemini.enabled;
