import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { FruitflyError, type ToolSpec } from '@fruitfly/core';
import { gatewayRoute, ollamaRoute, type Route } from '../src';
import { makeRig, msg } from './harness';

const tools: ToolSpec[] = [{ name: 'read_page', description: 'read', parameters: { type: 'object', properties: { cursor: { type: 'string' } }, required: [] } }];
const req = (extra = {}) => ({ messages: [msg('hello'), msg('plan')], purpose: 'plan' as const, ...extra });

describe('ModelRouter error handling', () => {
  it('429 with Retry-After: honours it and retries once on the same route', async () => {
    const r = makeRig(); r.gw.inject({ kind: '429', retryAfterSec: 2 });
    const res = await r.router.complete('smart', req());
    expect(res.routeId).toBe('A');
    expect(r.sleeps).toEqual([2000]);
    expect(r.gw.requests.filter((x) => x.path.endsWith('/chat/completions'))).toHaveLength(2);
    expect(r.events.some((e) => e.type === 'throttled')).toBe(true);
  });

  it('429 twice: backoff with jitter, then fail over to the next route', async () => {
    const r = makeRig(); r.gw.inject({ kind: '429' }, { kind: '429' });
    const res = await r.router.complete('smart', req());
    expect(res.routeId).toBe('B');
    expect(r.sleeps).toHaveLength(1);
    expect(r.sleeps[0]).toBeLessThanOrEqual(2050);
    expect(r.router['d'].breakers.health('A').state).toBe('limited');
    expect(r.events.some((e) => e.type === 'route_switch' && e.to === 'B')).toBe(true);
  });

  it('a huge Retry-After fails over immediately instead of stalling', async () => {
    const r = makeRig(); r.gw.inject({ kind: '429', retryAfterSec: 120 });
    const res = await r.router.complete('smart', req());
    expect(res.routeId).toBe('B'); expect(r.sleeps).toEqual([]);
  });

  it('5xx: one quick retry, then fail over', async () => {
    const r = makeRig(); r.gw.inject({ kind: '503' }, { kind: '500' });
    const res = await r.router.complete('smart', req());
    expect(res.routeId).toBe('B');
    expect(r.sleeps).toHaveLength(1); expect(r.sleeps[0]).toBeLessThan(500);
  });

  it('context length: compacts via the hook and retries once', async () => {
    const r = makeRig(); r.gw.inject({ kind: 'context' });
    const compact = vi.fn(async () => [msg('short summary')]);
    const res = await r.router.complete('smart', req(), { compact });
    expect(compact).toHaveBeenCalledTimes(1);
    expect(res.routeId).toBe('A');
    expect(JSON.parse(r.gw.requests.at(-1)!.body).messages[0].content).toBe('short summary');
  });

  it('context length without a hook fails over to another route', async () => {
    const r = makeRig(); r.gw.inject({ kind: 'context' });
    expect((await r.router.complete('smart', req())).routeId).toBe('B');
  });

  it('malformed tool JSON: one repair prompt on the same route, then fail over', async () => {
    const r = makeRig(); r.gw.inject({ kind: 'malformed_tool' });
    const res = await r.router.complete('smart', req({ tools }));
    expect(res.routeId).toBe('A');
    const second = JSON.parse(r.gw.requests.filter((x) => x.path.endsWith('/chat/completions')).at(-1)!.body);
    expect(second.messages.at(-1).content).toMatch(/not a valid action/);
    const r2 = makeRig(); r2.gw.inject({ kind: 'malformed_tool' }, { kind: 'malformed_tool' });
    expect((await r2.router.complete('smart', req({ tools }))).routeId).toBe('B');
  });

  it('auth: no retry, route marked auth, falls over; single route surfaces the auth error', async () => {
    const r = makeRig(); r.gw.inject({ kind: '401' });
    expect((await r.router.complete('smart', req())).routeId).toBe('B');
    expect(r.gw.requests.filter((x) => x.path.endsWith('/chat/completions'))).toHaveLength(2);
    expect(r.breakers.health('A').state).toBe('auth');
    const solo = makeRig({ smart: [gatewayRoute('auto', 'http://localhost:3001/v1', { id: 'A' })] }); solo.gw.inject({ kind: '401' });
    await expect(solo.router.complete('smart', req())).rejects.toMatchObject({ code: 'auth' });
  });

  it('content filter: rephrase once, then fail over, never loop', async () => {
    const r = makeRig(); r.gw.inject({ kind: 'filter' }, { kind: 'filter' });
    const rephrase = vi.fn((m) => m);
    const res = await r.router.complete('smart', req(), { rephrase });
    expect(rephrase).toHaveBeenCalledTimes(1);
    expect(res.routeId).toBe('B');
  });

  it('gateway unreachable: falls to the local route', async () => {
    const r = makeRig();
    r.router['d'].guard['fetchImpl'] = (async (u: RequestInfo | URL, i?: RequestInit) => { const url = String(u); if (url.includes(':3001')) throw new TypeError('fetch failed'); return r.ol.fetch(u, i); }) as typeof fetch;
    const res = await r.router.complete('smart', req());
    expect(res.routeId).toBe('L');
  });

  it('no native tool calling → JSON action protocol', async () => {
    const A = gatewayRoute('auto', 'http://localhost:3001/v1', { id: 'A', allowsPersonal: true, caps: { tools: false, vision: false, streaming: true, json: true, maxContext: 8000, maxOutput: 1000 } });
    const r = makeRig({ smart: [A] });
    r.gw.reply = () => ({ text: '```json\n{"action":"read_page","args":{"cursor":"2"}}\n```' });
    const res = await r.router.complete('smart', req({ tools }));
    expect(res.toolCalls).toMatchObject([{ name: 'read_page', args: { cursor: '2' } }]);
    const sent = JSON.parse(r.gw.requests.at(-1)!.body);
    expect(sent.tools).toBeUndefined();
    expect(JSON.stringify(sent.messages)).toContain('Reply with ONLY a JSON object');
  });

  it('skips routes without needed capabilities', async () => {
    const small = gatewayRoute('auto', 'http://localhost:3001/v1', { id: 'small', caps: { tools: true, vision: false, streaming: true, json: true, maxContext: 4000, maxOutput: 500 } });
    const big = gatewayRoute('auto:smart', 'http://localhost:3001/v1', { id: 'big', caps: { tools: true, vision: true, streaming: true, json: true, maxContext: 100000, maxOutput: 4000 } });
    const r = makeRig({ smart: [small, big] });
    r.limiter.register('small', small.limits); r.limiter.register('big', big.limits);
    expect((await r.router.complete('smart', req({ needsContext: 20000 }))).routeId).toBe('big');
    expect((await r.router.complete('smart', req({ needsVision: true }))).routeId).toBe('big');
  });

  it('reports remote usage and honours the response cache for helper calls', async () => {
    const r = makeRig();
    const q = { messages: [msg('summarise this')], purpose: 'summarize' as const };
    const a = await r.router.complete('fast', q); const b = await r.router.complete('fast', q);
    expect(b.cached).toBe(true); expect(a.text).toBe(b.text);
    expect(r.gw.requests.filter((x) => x.path.endsWith('/chat/completions'))).toHaveLength(1);
  });
});

describe('privacy routing', () => {
  it('local-only content is forced onto the local profile', async () => {
    const r = makeRig();
    const res = await r.router.complete('smart', { messages: [msg('lease number 77', 'local-only')], purpose: 'plan' });
    expect(res.routeId).toBe('L');
    expect(r.gw.requests.filter((x) => x.path.includes('chat'))).toHaveLength(0);
  });
  it('local-only with no local route says so plainly', async () => {
    const r = makeRig({ local: [] });
    await expect(r.router.complete('smart', { messages: [msg('x', 'local-only')], purpose: 'plan' })).rejects.toMatchObject({ code: 'local_model_missing' });
  });
  it('property: the router never selects a remote route for a local-only request', () => {
    const route = (id: string, kind: 'local' | 'remote', p: boolean): Route => ({ ...gatewayRoute('auto', 'http://localhost:3001/v1', { id, kind, allowsPersonal: p }) });
    fc.assert(fc.property(fc.array(fc.tuple(fc.constantFrom<'local' | 'remote'>('local', 'remote'), fc.boolean()), { minLength: 1, maxLength: 6 }), fc.constantFrom('public' as const, 'personal' as const, 'local-only' as const), (spec, sens) => {
      const chain = spec.map(([k, p], i) => route(`r${i}`, k, p));
      const r = makeRig({ smart: chain, local: chain.filter((c) => c.kind === 'local') });
      const plan = r.router.plan('smart', { messages: [msg('payload', sens)], purpose: 'plan' });
      if (sens === 'local-only') return plan.candidates.every((c) => c.kind === 'local');
      if (sens === 'personal') return plan.candidates.every((c) => c.kind === 'local' || c.allowsPersonal);
      return true;
    }), { numRuns: 200 });
  });
});

describe('failover is step-granular and state-preserving', () => {
  it('both routes see identical messages; the caller state is never mutated', async () => {
    const r = makeRig(); r.gw.inject({ kind: '500' }, { kind: '500' });
    const messages = [msg('scratchpad: goal=find laptop'), msg('step 3 observation')];
    const snapshot = JSON.stringify(messages);
    await r.router.complete('smart', { messages, purpose: 'plan' });
    expect(JSON.stringify(messages)).toBe(snapshot);
    const bodies = r.gw.requests.filter((x) => x.path.endsWith('/chat/completions')).map((x) => JSON.parse(x.body));
    expect(bodies.length).toBe(3);
    expect(bodies[0].messages).toEqual(bodies[2].messages);
  });
});

describe('Stop', () => {
  it('cancels an in-flight (hanging) request within 250ms', async () => {
    const r = makeRig(); r.gw.inject({ kind: 'timeout' });
    const ac = new AbortController();
    const p = r.router.complete('smart', req(), { signal: ac.signal });
    await new Promise((x) => setTimeout(x, 30));
    const t0 = performance.now(); ac.abort();
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
    expect(performance.now() - t0).toBeLessThan(250);
  });
  it('cancels while waiting for the rate limiter', async () => {
    const clock = { t: 0 }; const r = makeRig({}, { clock });
    r.limiter.register('A', { rpm: 1, tpm: 100000 }); await r.limiter.acquire('A', 10);
    const ac = new AbortController(); const p = r.limiter.acquire('A', 10, 'planner', 'main', ac.signal);
    ac.abort(); await expect(p).rejects.toBeInstanceOf(FruitflyError);
  });
});

describe('streaming', () => {
  it('streams deltas and surfaces a mid-stream disconnect as a network error', async () => {
    const A = gatewayRoute('auto', 'http://localhost:3001/v1', { id: 'A', allowsPersonal: true });
    const r = makeRig({ smart: [A] }); r.gw.reply = () => ({ text: 'hello there friend' });
    const parts: string[] = [];
    const ok = await r.router.complete('smart', req({ onDelta: (d: string) => parts.push(d) }));
    expect(parts.join('')).toBe('hello there friend'); expect(ok.text).toBe('hello there friend');
    r.gw.inject({ kind: 'disconnect' }, { kind: 'disconnect' });
    await expect(r.router.complete('smart', req({ onDelta: () => {} }))).rejects.toMatchObject({ code: 'network' });
  });
});

describe('embeddings via the embed profile', () => {
  it('uses the local Ollama embedder', async () => {
    const r = makeRig();
    const { vectors, routeId } = await r.router.embed(['hello world']);
    expect(routeId).toBe('L'); expect(vectors[0]).toHaveLength(32);
    expect(ollamaRoute().kind).toBe('local');
  });
});
