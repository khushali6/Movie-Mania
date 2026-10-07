import { ContextManager, MemoryObservationStore, TokenMeter } from '@fruitfly/context';
import { AgentController, MemoryTaskStore, MockBrowser, RouterModelClient, PromiseApprovalGate, type AgentDeps } from '@fruitfly/agent';
import { CircuitBreakers, ModelRouter, RateLimiter, ResponseCache, createScriptedProvider, openaiProvider, scriptedRoute, type RouteProfile, type RouterEvent, type Route, buildProfiles } from '@fruitfly/gateway';
import { EgressGuard } from '@fruitfly/egress';
import { Pantry } from '@fruitfly/pantry';
import type { AgentEvent, ProfileName } from '@fruitfly/core';
import { createDemoBrain, type BrainOptions, type ScenarioId } from './brains';
import { demoSites } from './sites';
import { seedDemoPantry } from './seed';

export interface DemoRig {
  controller: AgentController;
  browser: MockBrowser;
  pantry: Pantry;
  router: ModelRouter;
  routerEvents: RouterEvent[];
  events: AgentEvent[];
  breakers: CircuitBreakers;
  routes: Route[];
  guard: EgressGuard;
  store: MemoryTaskStore;
  observations: MemoryObservationStore;
  scenario: ScenarioId;
}

export interface RigOptions extends Partial<BrainOptions> {
  scenario?: ScenarioId;
  /** tab latency so the animation has time to play (ms), 0 in tests */
  latency?: number;
  /** pacing hook so the UI fly arrives before each action */
  beforeAction?: AgentDeps['beforeAction'];
  afterAction?: AgentDeps['afterAction'];
  withPantry?: boolean;
  /** use this Pantry instead of a fresh one (the panel owns the user's Pantry) */
  pantry?: Pantry;
  /** two scripted routes so a scripted 429 visibly fails over */
  failoverDemo?: boolean;
  stepsCap?: number;
  sleep?: (ms: number, s?: AbortSignal) => Promise<void>;
  onRouterEvent?: (e: RouterEvent) => void;
}

/** Everything wired together with no network and no key: the exact stack the real extension runs, with a scripted model. */
export async function createDemoRig(o: RigOptions = {}): Promise<DemoRig> {
  const scenario = o.scenario ?? 'laptop';
  const browser = new MockBrowser(demoSites(), 'https://start.fruitfly.local/'); browser.latency = o.latency ?? 0;
  const pantry = o.pantry ?? new Pantry();
  const usePantry = !!(o.withPantry || scenario === 'pantry' || o.pantry);
  if (usePantry && !o.pantry) await seedDemoPantry(pantry);
  const brain = createDemoBrain({ scenario, rateLimitAtCall: o.rateLimitAtCall, thinkMs: o.thinkMs });
  const provider = createScriptedProvider(brain);
  const primary = scriptedRoute({ id: 'demo:free-pool', label: 'Free pool · auto', kind: o.failoverDemo ? 'remote' : 'local', allowsPersonal: true });
  const backup = scriptedRoute({ id: 'demo:backup', label: 'Free pool · smart', kind: o.failoverDemo ? 'remote' : 'local', allowsPersonal: true });
  const local = scriptedRoute({ id: 'demo:on-device', label: 'On this device', kind: 'local' });
  const routes = o.failoverDemo ? [primary, backup, local] : [primary];
  const chain = (n: ProfileName): RouteProfile => ({ name: n, chain: n === 'local' ? [local] : routes });
  const profiles = (): Record<ProfileName, RouteProfile> => ({ fast: chain('fast'), smart: chain('smart'), vision: { name: 'vision', chain: [] }, embed: { name: 'embed', chain: [] }, local: chain('local') });
  const routerEvents: RouterEvent[] = [];
  const guard = new EgressGuard();
  const breakers = new CircuitBreakers();
  const limiter = new RateLimiter();
  for (const r of [primary, backup, local]) limiter.register(r.id, r.limits);
  const router = new ModelRouter({ profiles, providers: { scripted: provider, 'openai-compat': openaiProvider }, guard, breakers, limiter, cache: new ResponseCache(), sleep: o.sleep, onEvent: (e) => { routerEvents.push(e); o.onRouterEvent?.(e); } });
  const model = new RouterModelClient(router, () => buildProfiles('balanced'));
  // the scripted routes are the chain here; model info comes from them
  const client = { complete: model.complete.bind(model), modelInfo: () => ({ id: 'demo', label: 'Demo mode', maxContext: 64_000, maxOutput: 4096, supportsTools: true, supportsVision: false, supportsStreaming: false }), allowance: () => 'local-only' as const };
  const store = new MemoryTaskStore(); const observations = new MemoryObservationStore(); const events: AgentEvent[] = [];
  const context = new ContextManager(); const meter = new TokenMeter();
  const controller = new AgentController(() => ({ model: client, browser, context, meter, observations, store, pantry: usePantry ? pantry : undefined, settings: { stepsCap: o.stepsCap ?? 40 }, beforeAction: o.beforeAction, afterAction: o.afterAction }));
  controller.on((e) => events.push(e));
  return { controller, browser, pantry, router, routerEvents, events, breakers, routes, guard, store, observations, scenario };
}

export { PromiseApprovalGate };
