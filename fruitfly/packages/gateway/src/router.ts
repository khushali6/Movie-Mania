import { FruitflyError, type ChatMessage, type ErrorCode, type ProfileName } from '@fruitfly/core';
import { RedactionMap } from '@fruitfly/egress';
import type { EgressGuard } from '@fruitfly/egress';
import type { BudgetTracker } from './budget';
import type { CircuitBreakers } from './breaker';
import { ResponseCache } from './cache';
import { providerError } from './errors';
import type { RateLimiter } from './limiter';
import { REPAIR_PROMPT, parseActionText, withToolPrompt } from './protocol';
import type { CompletionRequest, CompletionResponse, Provider, ProviderId, Route, RouteProfile, RouterEvent } from './types';

export interface RouterDeps {
  profiles: () => Record<ProfileName, RouteProfile>;
  providers: Partial<Record<ProviderId, Provider>>;
  guard: EgressGuard;
  breakers: CircuitBreakers;
  limiter: RateLimiter;
  budget?: BudgetTracker;
  cache?: ResponseCache;
  keys?: (ref?: string) => string | undefined;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  onEvent?: (e: RouterEvent) => void;
}

export interface CallOptions {
  taskId?: string;
  signal?: AbortSignal;
  /** Compact the context and return the new messages (ContextManager). Called at most once per route. */
  compact?: () => Promise<ChatMessage[] | undefined>;
  /** Rephrase after a content filter. Called at most once per route. */
  rephrase?: (m: ChatMessage[]) => ChatMessage[];
}

const MAX_HONOUR_MS = 8_000;

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(providerError('aborted', 'Stopped.'));
  const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(t); reject(providerError('aborted', 'Stopped.')); };
  signal?.addEventListener('abort', onAbort, { once: true });
});

export const hasLocalOnly = (m: readonly ChatMessage[]): boolean => m.some((x) => x.sensitivity === 'local-only');

export class ModelRouter {
  private maps = new Map<string, RedactionMap>();
  private lastRoute = new Map<string, string>();
  private sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private random: () => number;

  constructor(private d: RouterDeps) {
    this.sleep = d.sleep ?? defaultSleep;
    this.random = d.random ?? Math.random;
  }

  private emit(e: RouterEvent): void { this.d.onEvent?.(e); }
  redactionFor(taskId: string): RedactionMap { let m = this.maps.get(taskId); if (!m) { m = new RedactionMap(); this.maps.set(taskId, m); } return m; }
  forget(taskId: string): void { this.maps.delete(taskId); this.lastRoute.delete(taskId); }

  /** Which routes could serve this request, in order, and why the others cannot. Pure: used by tests and the UI. */
  plan(profile: ProfileName, req: CompletionRequest): { candidates: Route[]; skipped: { route: string; why: string }[]; profile: ProfileName } {
    const effective: ProfileName = hasLocalOnly(req.messages) ? 'local' : profile;
    const chain = this.d.profiles()[effective]?.chain ?? [];
    const candidates: Route[] = []; const skipped: { route: string; why: string }[] = [];
    for (const r of chain) {
      if (req.needsVision && !r.caps.vision) { skipped.push({ route: r.id, why: 'no_vision' }); continue; }
      if (req.needsContext && r.caps.maxContext < req.needsContext) { skipped.push({ route: r.id, why: 'small_context' }); continue; }
      const v = this.d.guard.check(req.messages, r);
      if (!v.ok) { skipped.push({ route: r.id, why: v.reason }); continue; }
      if (!this.d.breakers.allow(r.id)) { skipped.push({ route: r.id, why: 'cooling' }); continue; }
      candidates.push(r);
    }
    return { candidates, skipped, profile: effective };
  }

  async complete(profile: ProfileName, req: CompletionRequest, opts: CallOptions = {}): Promise<CompletionResponse> {
    const signal = opts.signal;
    if (signal?.aborted) throw providerError('aborted', 'Stopped.');
    const cache = this.d.cache;
    const ck = cache && ResponseCache.cacheable(req) ? cache.key(req, profile) : undefined;
    if (ck && cache) { const hit = cache.get(ck); if (hit) return { ...hit, cached: true }; }

    const { candidates, skipped, profile: eff } = this.plan(profile, req);
    if (!candidates.length) this.throwNoRoute(eff, skipped);
    const taskId = opts.taskId ?? 'adhoc';
    let lastError: FruitflyError | undefined;
    for (let i = 0; i < candidates.length; i++) {
      const route = candidates[i]!;
      const prev = this.lastRoute.get(taskId);
      if (prev !== route.id) this.emit({ type: 'route_switch', from: prev, to: route.id, reason: prev ? (lastError?.code ?? 'preferred') : 'first' });
      this.lastRoute.set(taskId, route.id);
      try {
        const res = await this.runOnRoute(route, req, opts, taskId, i === candidates.length - 1);
        if (ck && cache) cache.set(ck, res);
        return res;
      } catch (e) {
        const err = e as FruitflyError;
        if (!(err instanceof FruitflyError)) throw err;
        if (['aborted', 'budget_reached', 'egress_blocked', 'local_model_missing'].includes(err.code)) throw err;
        lastError = err;
        this.emit({ type: 'breaker', route: route.id, state: this.d.breakers.health(route.id).state });
      }
    }
    throw lastError ?? providerError('no_route', 'No route could answer.');
  }

  private throwNoRoute(profile: ProfileName, skipped: { route: string; why: string }[]): never {
    if (skipped.some((s) => s.why === 'local_only') || profile === 'local') {
      if (skipped.some((s) => s.why === 'local_only') || !skipped.length) throw new FruitflyError('local_model_missing', 'That one stays on this device, and I need a local model to read it.', { skipped });
    }
    if (skipped.some((s) => s.why === 'cooling')) {
      const waits = skipped.filter((s) => s.why === 'cooling').map((s) => this.d.breakers.health(s.route).nextProbeAt ?? 0).filter(Boolean);
      throw new FruitflyError('gateway_down', "I can't reach your gateway.", { skipped, nextProbeAt: waits.length ? Math.min(...waits) : undefined });
    }
    throw new FruitflyError('no_route', 'No route can answer this.', { skipped });
  }

  private async runOnRoute(route: Route, req: CompletionRequest, opts: CallOptions, taskId: string, isLast: boolean): Promise<CompletionResponse> {
    const provider = this.d.providers[route.provider === 'freellmapi' ? 'openai-compat' : route.provider];
    if (!provider) throw providerError('no_route', `No provider for ${route.provider}.`);
    const signal = opts.signal ?? new AbortController().signal;
    const protocol = !!req.tools?.length && !route.caps.tools;
    let messages = req.messages;
    let retried = { rate: false, quick: false, ctx: false, repair: false, filter: false };

    for (;;) {
      const t0 = Date.now();
      try {
        const effMessages = protocol ? withToolPrompt(messages, req.tools!) : messages;
        const prepared = await this.d.guard.prepare(effMessages, route, this.redactionFor(taskId));
        const est = prepared.preview.segments.reduce((a, s) => a + s.tokens, 0) + (req.maxOutputTokens ?? 512);
        this.d.budget?.check(taskId, est);
        await this.acquire(route, est, req, signal);
        const res = await provider.complete({ ...req, messages: effMessages, tools: protocol ? undefined : req.tools }, { route, guard: this.d.guard, prepared, signal, key: this.d.keys?.(route.keyRef) });
        let out = res;
        if (protocol) {
          const parsed = parseActionText(res.text, req.tools!);
          if (!parsed) throw providerError('malformed_output', 'The model did not return a valid action.');
          out = { ...res, toolCalls: parsed.toolCalls, text: '', finish: 'tool_calls' };
        }
        this.d.breakers.success(route.id, Date.now() - t0);
        const used = res.usage.inputTokens + res.usage.outputTokens;
        if (used) this.d.limiter.adjust(route.id, used - est);
        this.d.budget?.record(taskId, used || est);
        this.emit({ type: 'usage', route: route.id, usage: res.usage });
        return { ...out, routeId: route.id };
      } catch (e) {
        if (!(e instanceof FruitflyError)) throw e;
        const code: ErrorCode = e.code;
        const retryAfterMs = (e as { retryAfterMs?: number }).retryAfterMs;
        if (code === 'aborted' || code === 'budget_reached' || code === 'egress_blocked' || code === 'local_model_missing') throw e;
        if (code === 'rate_limited') {
          this.d.breakers.failure(route.id, code, e.message);
          this.d.breakers.cool(route.id, Math.min(retryAfterMs ?? 5000, 60_000));
          const wait = retryAfterMs ?? this.fullJitter(1000);
          if (!retried.rate && (wait <= MAX_HONOUR_MS || isLast)) {
            retried.rate = true;
            this.emit({ type: 'retry', route: route.id, reason: 'rate_limited', waitMs: wait });
            this.emit({ type: 'throttled', route: route.id, untilMs: Date.now() + wait, queuePosition: 0 });
            await this.sleep(Math.min(wait, 60_000), signal);
            this.emit({ type: 'unthrottled', route: route.id });
            // the cooldown we just set expires with the wait; clear so the retry is allowed
            continue;
          }
          throw e;
        }
        if (code === 'server_error' || code === 'timeout' || code === 'network') {
          if (!retried.quick) { retried.quick = true; const w = 120 + Math.floor(this.random() * 280); this.emit({ type: 'retry', route: route.id, reason: code, waitMs: w }); await this.sleep(w, signal); continue; }
          this.d.breakers.failure(route.id, code === 'network' ? 'network' : code, e.message);
          throw e;
        }
        if (code === 'context_length') {
          if (!retried.ctx && opts.compact) { retried.ctx = true; const next = await opts.compact(); if (next) { messages = next; continue; } }
          throw e;
        }
        if (code === 'malformed_output') {
          if (!retried.repair) { retried.repair = true; messages = [...messages, { role: 'user', content: REPAIR_PROMPT, sensitivity: 'public', segmentKind: 'history', segmentId: 'repair' }]; continue; }
          this.d.breakers.failure(route.id, code, e.message);
          throw e;
        }
        if (code === 'content_filtered') {
          if (!retried.filter && opts.rephrase) { retried.filter = true; messages = opts.rephrase(messages); continue; }
          throw e;
        }
        if (code === 'auth') { this.d.breakers.failure(route.id, 'auth', e.message); throw e; }
        this.d.breakers.failure(route.id, code, e.message);
        throw e;
      }
    }
  }

  private async acquire(route: Route, est: number, req: CompletionRequest, signal: AbortSignal): Promise<void> {
    let waited = false;
    const t = setTimeout(() => { waited = true; this.emit({ type: 'throttled', route: route.id, untilMs: Date.now() + 1000, queuePosition: this.d.limiter.queueDepth }); }, 40);
    try { await this.d.limiter.acquire(route.id, est, req.priority ?? 'planner', req.owner ?? 'main', signal); } finally { clearTimeout(t); if (waited) this.emit({ type: 'unthrottled', route: route.id }); }
  }

  private fullJitter(base: number): number { return Math.floor(this.random() * base * 2) + 50; }

  /** Embeddings for queries (not bulk indexing) through the `embed` profile. */
  async embed(texts: string[], opts: CallOptions = {}): Promise<{ vectors: number[][]; routeId: string }> {
    const chain = this.d.profiles().embed?.chain ?? [];
    let last: FruitflyError | undefined;
    for (const route of chain) {
      const provider = this.d.providers[route.provider === 'freellmapi' ? 'openai-compat' : route.provider];
      if (!provider?.embed || !this.d.breakers.allow(route.id)) continue;
      try {
        const vectors = await provider.embed(texts, { route, guard: this.d.guard, signal: opts.signal ?? new AbortController().signal, key: this.d.keys?.(route.keyRef) });
        this.d.breakers.success(route.id);
        return { vectors, routeId: route.id };
      } catch (e) { if (e instanceof FruitflyError) { last = e; if (e.code === 'aborted') throw e; this.d.breakers.failure(route.id, e.code); } else throw e; }
    }
    throw last ?? new FruitflyError('no_route', 'No embedding route.');
  }
}

