import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EgressGuard } from '@fruitfly/egress';
import { BudgetTracker, CircuitBreakers, COOLDOWNS_MS, MockGateway, RateLimiter, TokenBucket, detectGateway, listGatewayModels, parseActionText, anthropicProvider, geminiProvider, toAnthropic, toGemini, anthropicRoute, geminiRoute, buildProfiles, inferCaps, createScriptedProvider, scriptedRoute, ModelRouter, openaiProvider, parseRetryAfter, classifyHttp } from '../src';
import { msg } from './harness';

describe('CircuitBreakers', () => {
  it('opens after 3 failures in 60s, probes after 30s → 2min → 10min, persists', () => {
    const c = { t: 0 }; let saved: unknown;
    const store = { load: () => saved as never, save: (s: unknown) => { saved = JSON.parse(JSON.stringify(s)); } };
    const b = new CircuitBreakers(store, () => c.t);
    b.failure('r', 'server_error'); c.t += 1000; b.failure('r', 'server_error');
    expect(b.allow('r')).toBe(true);
    c.t += 1000; b.failure('r', 'server_error');
    expect(b.allow('r')).toBe(false); expect(b.health('r').state).toBe('cooling');
    c.t += COOLDOWNS_MS[0]! - 10; expect(b.allow('r')).toBe(false);
    c.t += 20; expect(b.allow('r')).toBe(true); // half-open probe
    b.failure('r', 'server_error'); // probe fails → re-open with the longer cooldown
    c.t += COOLDOWNS_MS[0]! + 10; expect(b.allow('r')).toBe(false);
    c.t += COOLDOWNS_MS[1]!; expect(b.allow('r')).toBe(true);
    b.failure('r', 'server_error'); c.t += COOLDOWNS_MS[1]! + 10; expect(b.allow('r')).toBe(false);
    c.t += COOLDOWNS_MS[2]!; expect(b.allow('r')).toBe(true);
    const restored = new CircuitBreakers(store, () => c.t);
    expect(restored.health('r').state).not.toBe('healthy');
    b.success('r'); expect(b.health('r').state).toBe('healthy');
  });
  it('failures outside the 60s window do not accumulate; auth never auto-recovers', () => {
    const c = { t: 0 }; const b = new CircuitBreakers(undefined, () => c.t);
    b.failure('r', 'timeout'); c.t += 61_000; b.failure('r', 'timeout'); c.t += 61_000; b.failure('r', 'timeout');
    expect(b.allow('r')).toBe(true);
    b.failure('k', 'auth'); c.t += 3_600_000; expect(b.allow('k')).toBe(false); expect(b.health('k').state).toBe('auth');
    b.reset('k'); expect(b.allow('k')).toBe(true);
  });
  it('429 cooldown honours the wait without counting as an open breaker', () => {
    const c = { t: 0 }; const b = new CircuitBreakers(undefined, () => c.t);
    b.cool('r', 5000); expect(b.allow('r')).toBe(false); expect(b.health('r').state).toBe('limited'); c.t += 5001; expect(b.allow('r')).toBe(true);
  });
});

describe('token buckets & limiter', () => {
  it('refills at the configured rate and reports wait time', () => {
    const b = new TokenBucket(60, 1, 0); b.take(60, 0);
    expect(b.canTake(1, 0)).toBe(false); expect(b.waitMs(10, 0)).toBe(10_000);
    expect(b.canTake(10, 10_000)).toBe(true);
  });
  beforeEach(() => { vi.useFakeTimers(); }); afterEach(() => { vi.useRealTimers(); });
  it('serves foreground before background and shares fairly between subagents', async () => {
    const l = new RateLimiter(() => Date.now());
    l.register('r', { rpm: 60, tpm: 1e9 });
    for (let i = 0; i < 60; i++) await l.acquire('r', 1); // drain
    const order: string[] = [];
    const add = (name: string, pr: 'foreground' | 'planner' | 'subagent' | 'background', owner: string) => l.acquire('r', 1, pr, owner).then(() => order.push(name));
    const ps = [add('bg', 'background', 'idx'), add('subA1', 'subagent', 'A'), add('subA2', 'subagent', 'A'), add('subB1', 'subagent', 'B'), add('fg', 'foreground', 'user')];
    await vi.advanceTimersByTimeAsync(10_000); await Promise.all(ps);
    expect(order[0]).toBe('fg');
    expect(order.at(-1)).toBe('bg');
    expect(order.indexOf('subB1')).toBeLessThan(order.indexOf('subA2')); // fair share: B is not starved by A's second request
  });
  it('persists bucket levels across restarts', () => {
    let saved: Record<string, { rpm: number; tpm: number; t: number }> | undefined;
    const store = { load: () => saved, save: (s: typeof saved) => { saved = s; } };
    const l1 = new RateLimiter(() => Date.now(), store as never); l1.register('r', { rpm: 10, tpm: 1000 });
    for (let i = 0; i < 10; i++) void l1.acquire('r', 100);
    const l2 = new RateLimiter(() => Date.now(), store as never); l2.register('r', { rpm: 10, tpm: 1000 });
    let granted = false; void l2.acquire('r', 100).then(() => (granted = true));
    expect(granted).toBe(false);
  });
});

describe('budget (nectar)', () => {
  it('warns at 80%, hard-stops at the cap and rolls over by day', () => {
    let now = Date.parse('2026-10-07T10:00:00Z'); const warns: string[] = [];
    const b = new BudgetTracker({ perTask: 1000, daySoft: 800, dayHard: 1000, monthSoft: 1e6, monthHard: 1e7 }, undefined, () => now, (k) => warns.push(k));
    b.record('t', 500); expect(b.nectar()).toBeCloseTo(0.5); b.record('t', 400); expect(warns).toEqual(['day']);
    expect(() => b.check('t', 200)).toThrowError(/limit/);
    now += 86_400_000; expect(b.nectar()).toBe(1); expect(() => b.check('t2', 100)).not.toThrow();
  });
});

describe('wire formats', () => {
  it('Anthropic: cache breakpoints after stable segments, tool_result mapping, alternation merge', () => {
    const { system, messages } = toAnthropic([
      { role: 'system', content: 'rules', cacheBreakpoint: true }, { role: 'system', content: 'profile', cacheBreakpoint: true }, { role: 'system', content: 'volatile' },
      { role: 'user', content: 'go' }, { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'read_page', args: {} }] }, { role: 'tool', content: 'page text', toolCallId: 't1' }, { role: 'user', content: 'next' },
    ]);
    expect((system as { cache_control?: unknown }[]).map((s) => !!s.cache_control)).toEqual([true, true, false]);
    expect((messages as { role: string }[]).map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });
  it('Anthropic provider parses tool_use and cache usage', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: 'x', name: 'click', input: { ref: 'e1' } }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7 } }))) as typeof fetch;
    const guard = new EgressGuard({ fetchImpl }); const route = anthropicRoute('claude-sonnet-5-5', 'k', { allowsPersonal: true });
    const prepared = await guard.prepare([msg('x')], route);
    const res = await anthropicProvider.complete({ messages: [msg('x')], purpose: 'plan', tools: [{ name: 'click', description: '', parameters: {} }] }, { route, guard, prepared, signal: new AbortController().signal, key: 'sk' });
    expect(res.toolCalls[0]).toMatchObject({ name: 'click', args: { ref: 'e1' } }); expect(res.usage.cacheReadTokens).toBe(7);
  });
  it('Gemini maps roles and parses functionCall', async () => {
    expect((toGemini([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }]).contents as { role: string }[]).map((c) => c.role)).toEqual(['user', 'model']);
    const fetchImpl = (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'scroll', args: { dir: 'down' } } }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } }))) as typeof fetch;
    const guard = new EgressGuard({ fetchImpl }); const route = geminiRoute('gemini-2.5-flash', 'k', { allowsPersonal: true });
    const prepared = await guard.prepare([msg('x')], route);
    const res = await geminiProvider.complete({ messages: [msg('x')], purpose: 'plan' }, { route, guard, prepared, signal: new AbortController().signal, key: 'k' });
    expect(res.toolCalls[0]).toMatchObject({ name: 'scroll', args: { dir: 'down' } });
  });
  it('classifies HTTP errors', () => {
    expect(classifyHttp(429, '', new Headers({ 'retry-after': '3' }))).toMatchObject({ code: 'rate_limited', retryAfterMs: 3000 });
    expect(classifyHttp(400, 'context_length_exceeded', new Headers())).toMatchObject({ code: 'context_length' });
    expect(parseRetryAfter('abc')).toBeUndefined();
  });
});

describe('protocol parsing', () => {
  const tools = [{ name: 'click', description: '', parameters: { type: 'object', required: ['ref'] } }];
  it('accepts fenced / prose-wrapped JSON and rejects bad names or missing args', () => {
    expect(parseActionText('Sure!\n```json\n{"action":"click","args":{"ref":"e2"}}\n```', tools)?.toolCalls[0]?.args).toEqual({ ref: 'e2' });
    expect(parseActionText('{"tool":"click","arguments":"{\\"ref\\":\\"e3\\"}"}', tools)?.toolCalls[0]?.args).toEqual({ ref: 'e3' });
    expect(parseActionText('{"action":"explode","args":{}}', tools)).toBeNull();
    expect(parseActionText('{"action":"click","args":{}}', tools)).toBeNull();
  });
});

describe('gateway detection & catalog', () => {
  it('detects via /api/ping or falls back to /v1/models (401 counts as present)', async () => {
    const mock = new MockGateway(); const guard = new EgressGuard({ fetchImpl: mock.fetch });
    expect(await detectGateway(guard)).toMatchObject({ reachable: true, via: 'models' });
    mock.hasPing = true; expect(await detectGateway(guard)).toMatchObject({ via: 'ping' });
    mock.hasPing = false; mock.requireKey = 'k'; expect(await detectGateway(guard)).toMatchObject({ reachable: true, authRequired: true });
    expect((await listGatewayModels(guard, 'http://localhost:3001/v1', 'k')).map((m) => m.id)).toContain('auto:smart');
    await expect(listGatewayModels(guard, 'http://localhost:3001/v1', 'bad')).rejects.toMatchObject({ code: 'auth' });
    const down = new EgressGuard({ fetchImpl: (async () => { throw new TypeError('refused'); }) as typeof fetch });
    expect(await detectGateway(down)).toMatchObject({ reachable: false });
  });
  it('builds default chains per template and infers caps', () => {
    const p = buildProfiles('balanced'); expect(p.smart.chain[0]?.model).toBe('auto:smart'); expect(p.fast.chain[0]?.model).toBe('auto:fast'); expect(p.local.chain[0]?.kind).toBe('local');
    const priv = buildProfiles('private-only'); expect(priv.smart.chain.every((r) => r.kind === 'local')).toBe(true);
    expect(inferCaps('gemini-2.5-flash').vision).toBe(true); expect(inferCaps('text-embedding-3').tools).toBe(false);
  });
});

describe('scripted provider', () => {
  it('plays a brain, including a scripted 429 → fallback', async () => {
    const brainA = createScriptedProvider((_r, n) => (n === 0 ? { kind: 'fault', code: 'rate_limited', retryAfterMs: 10 } : { kind: 'reply', text: 'ok' }));
    const guard = new EgressGuard();
    const route = scriptedRoute({ id: 's1' }); const route2 = scriptedRoute({ id: 's2' });
    const { CircuitBreakers: CB, RateLimiter: RL } = await import('../src');
    const router = new ModelRouter({ profiles: (() => ({ smart: { name: 'smart', chain: [route, route2] }, fast: { name: 'fast', chain: [route] }, vision: { name: 'vision', chain: [] }, embed: { name: 'embed', chain: [] }, local: { name: 'local', chain: [route] } })) as never, providers: { scripted: brainA, 'openai-compat': openaiProvider }, guard, breakers: new CB(), limiter: new RL(), sleep: async () => {}, random: () => 0.5 });
    const res = await router.complete('smart', { messages: [msg('hi', 'personal')], purpose: 'plan' });
    expect(res.text).toBe('ok');
  });
});
