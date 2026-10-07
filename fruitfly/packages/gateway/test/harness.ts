import type { ChatMessage, ProfileName } from '@fruitfly/core';
import { EgressGuard } from '@fruitfly/egress';
import { CircuitBreakers, ModelRouter, RateLimiter, BudgetTracker, ResponseCache, gatewayRoute, ollamaRoute, openaiProvider, ollamaProvider, type Route, type RouteProfile, type RouterEvent} from '../src';
import { MockGateway, type Fault } from '../src/mock-gateway';

export const msg = (content: string, sensitivity: ChatMessage['sensitivity'] = 'public', role: ChatMessage['role'] = 'user'): ChatMessage => ({ role, content, sensitivity, segmentId: `s-${content.slice(0, 6)}`, segmentKind: 'history' });

export function makeRig(chains: Partial<Record<ProfileName, Route[]>> = {}, o: { clock?: { t: number }; hosts?: Record<string, MockGateway> } = {}) {
  const gw = new MockGateway();
  const ol = new MockGateway();
  const clock = o.clock ?? { t: 1_000_000 };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (u.port === '11434') return ol.fetch(input, init);
    return gw.fetch(input, init);
  }) as typeof fetch;
  const guard = new EgressGuard({ fetchImpl });
  const events: RouterEvent[] = [];
  const sleeps: number[] = [];
  const breakers = new CircuitBreakers(undefined, () => clock.t);
  const limiter = new RateLimiter(() => clock.t);
  const A = gatewayRoute('auto', 'http://localhost:3001/v1', { id: 'A', allowsPersonal: true });
  const B = gatewayRoute('auto:smart', 'http://localhost:3001/v1', { id: 'B', allowsPersonal: true });
  const L = ollamaRoute('llama3.1:8b', 'http://localhost:11434', { id: 'L' });
  const chain = (x: Route[]): RouteProfile => ({ name: 'smart', chain: x });
  const profiles = () => ({
    fast: chain(chains.fast ?? [A, L]) as RouteProfile, smart: chain(chains.smart ?? [A, B, L]), vision: chain(chains.vision ?? []), embed: chain(chains.embed ?? [L]), local: chain(chains.local ?? [L]),
  });
  const budget = new BudgetTracker(undefined, undefined, () => clock.t);
  const router = new ModelRouter({
    profiles: profiles as never, providers: { 'openai-compat': openaiProvider, ollama: ollamaProvider }, guard, breakers, limiter, budget, cache: new ResponseCache(),
    sleep: async (ms, signal) => { if (signal?.aborted) throw Object.assign(new Error('x'), { code: 'aborted', name: 'FruitflyError' }); sleeps.push(ms); clock.t += ms; },
    random: () => 0.5, onEvent: (e) => events.push(e),
  });
  [A, B, L].forEach((r) => limiter.register(r.id, r.limits));
  return { gw, ol, guard, router, events, sleeps, breakers, limiter, budget, clock, A, B, L };
}
export type { Fault };
