import { ContextManager, MemoryObservationStore, TokenMeter } from '@fruitfly/context';
import { EgressGuard } from '@fruitfly/egress';
import { CircuitBreakers, ModelRouter, RateLimiter, createScriptedProvider, openaiProvider, scriptedRoute, type ScriptedBrain } from '@fruitfly/gateway';
import type { AgentEvent } from '@fruitfly/core';
import { MemoryTaskStore, MockBrowser, newTask, runTask, PromiseApprovalGate, type AgentDeps, type MockSite, type RunOptions } from '../src';

export const shop: MockSite = {
  host: 'shop.test',
  render(url, state) {
    if (url.pathname === '/buy') return { url: url.href, title: 'Buy', nodes: [{ t: 'h', level: 1, text: 'Checkout' }, { t: 'input', name: 'card', label: 'Card number', type: 'text', form: 'f' }, { t: 'input', name: 'pw', label: 'Password', type: 'password', form: 'f' }, { t: 'button', label: 'Place order', form: 'f', do: { fn: (s) => { s.ordered = true; } } }] };
    return { url: url.href, title: 'Shop', nodes: [{ t: 'h', level: 1, text: 'Shop' }, { t: 'p', text: 'Widget ₹1,299' }, { t: 'link', label: 'Checkout', to: 'https://shop.test/buy' }, { t: 'button', label: 'Delete account', do: { fn: (s) => { s.deleted = true; } } }, { t: 'button', label: 'Details', do: { fn: (s) => { s.details = ((s.details as number) ?? 0) + 1; } } }, ...(state.deleted ? [{ t: 'p', text: 'deleted' } as const] : [])] };
  },
};

export function rig(brain: ScriptedBrain, o: { sites?: MockSite[]; pantry?: AgentDeps['pantry']; settings?: AgentDeps['settings']; decide?: (a: { level: string }) => 'approve' | 'cancel' | 'takeover'; onStep?: AgentDeps['onStepPersisted'] } = {}) {
  const browser = new MockBrowser(o.sites ?? [shop], 'https://shop.test/');
  const provider = createScriptedProvider(brain);
  const route = scriptedRoute();
  const router = new ModelRouter({ profiles: (() => ({ fast: { name: 'fast', chain: [route] }, smart: { name: 'smart', chain: [route] }, vision: { name: 'vision', chain: [] }, embed: { name: 'embed', chain: [] }, local: { name: 'local', chain: [route] } })) as never, providers: { scripted: provider, 'openai-compat': openaiProvider }, guard: new EgressGuard(), breakers: new CircuitBreakers(), limiter: new RateLimiter(), sleep: async () => {} });
  const events: AgentEvent[] = [];
  const gate = new PromiseApprovalGate();
  const approvals = { request: async (a: Parameters<PromiseApprovalGate['request']>[0]) => o.decide ? o.decide(a) : 'approve' as const };
  const store = new MemoryTaskStore();
  const deps = (signal = new AbortController().signal): AgentDeps => ({
    model: { complete: (p, r, c) => router.complete(p, r, c), modelInfo: () => ({ id: 'm', maxContext: 32_000, maxOutput: 2000, supportsTools: true, supportsVision: false, supportsStreaming: false }), allowance: () => 'local-only' },
    browser, context: new ContextManager(), meter: new TokenMeter(), observations: new MemoryObservationStore(), store, approvals, emit: (e) => events.push(e), signal, pantry: o.pantry, settings: o.settings, onStepPersisted: o.onStep,
  });
  const run = (goal: string, opts: RunOptions = {}, d = deps()) => runTask(newTask(goal, { mode: 'demo', stepsCap: o.settings?.stepsCap }), d, opts);
  return { browser, events, run, deps, store, provider, gate };
}

export const call = (name: string, args: Record<string, unknown> = {}, text = '') => ({ kind: 'reply' as const, text, toolCalls: [{ name, args }] });
export const script = (steps: ReturnType<typeof call>[]): ScriptedBrain => (req) => {
  const n = req.messages.filter((m) => m.role === 'assistant').length;
  return steps[n] ?? call('finish', { title: 'Done', summary: 'Done.' });
};
