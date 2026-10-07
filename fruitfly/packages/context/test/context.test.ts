import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { estimateTokens, newScratchpad, stableStringify, type StepRecord, type TaskState, type ToolSpec, type ModelInfo } from '@fruitfly/core';
import { BUDGET_FRACTIONS, ContextManager, MemoryObservationStore, PromptBuilder, STARTUP_LIMITS, SYSTEM_RULES, TokenMeter, budgetResult, budgetsFor, clampStanding, extractiveSummarizer, pageList, pageText, recall, sortTools } from '../src';

const tools: ToolSpec[] = [
  { name: 'read_page', description: 'Read the page in pages.', parameters: { type: 'object', properties: { cursor: { type: 'string' } } } },
  { name: 'click', description: 'Click an element by ref.', parameters: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] } },
  { name: 'finish', description: 'Finish.', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } },
];
const model = (maxContext: number): ModelInfo => ({ id: 'm', maxContext, maxOutput: 2000, supportsTools: true, supportsVision: false, supportsStreaming: true });
const step = (i: number, o: Partial<StepRecord> = {}): StepRecord => ({ id: `s${i}`, index: i, callId: `c${i}`, tool: 'read_page', args: { cursor: String(i) }, ok: true, digest: `Page ${i} digest`, handle: `obs://t/${i}`, tokens: 300, inline: `observation text for step ${i} `.repeat(40), sensitivity: 'public', startedAt: i, ...o });
const task = (n: number, o: Partial<TaskState> = {}): TaskState => ({
  id: 't', goal: 'Find the cheapest laptop under 60000', mode: 'demo', status: 'running', scratchpad: { ...newScratchpad('Find the cheapest laptop under 60000'), findings: ['Acer 47990', 'HP 52990'], rejected: ['Dell too pricey'] }, steps: Array.from({ length: n }, (_, i) => step(i + 1)),
  routeProfile: 'smart', budgets: { tokensUsed: 0, tokensCap: 1e5, stepsUsed: n, stepsCap: 40 }, compactions: [], sources: [], createdAt: 0, updatedAt: 0, meta: {}, ...o,
});
const inputs = { tools, profileDigest: 'Name: Asha. Currency: INR. City: Pune.', standingInstructions: 'Prefer free delivery.' };

describe('PromptBuilder: prefix stability (prompt caching)', () => {
  const cm = new ContextManager();
  it('the stable prefix is byte-identical across consecutive steps', () => {
    const prefixes = [3, 4, 5, 6].map((n) => {
      const b = cm.build(task(n), model(32000), inputs);
      const upTo = b.messages.findIndex((m) => m.segmentKind === 'scratchpad');
      return stableStringify({ msgs: b.messages.slice(0, upTo), tools: b.tools });
    });
    expect(new Set(prefixes).size).toBe(1);
  });
  it('history is append-only between maskings, so earlier messages never change', () => {
    const a = cm.build(task(4), model(32000), inputs).messages; const b = cm.build(task(5), model(32000), inputs).messages;
    const hist = (ms: typeof a) => ms.filter((m) => m.segmentId?.startsWith('step-') && !m.segmentId.startsWith('step-4-obs') && !m.segmentId.startsWith('step-5')).map((m) => m.content);
    expect(hist(b).slice(0, hist(a).length - 0)).toEqual(expect.arrayContaining(hist(a).slice(0, 6)));
  });
  it('places cache breakpoints after the system rules and after the profile digest only', () => {
    const b = cm.build(task(2), model(32000), inputs);
    expect(b.messages.filter((m) => m.cacheBreakpoint).map((m) => m.segmentKind)).toEqual(['system', 'profile']);
    expect(b.messages[0]!.content).toBe(SYSTEM_RULES);
  });
  it('tools are sorted deterministically regardless of input order', () => {
    expect(stableStringify(sortTools([...tools].reverse()))).toBe(stableStringify(sortTools(tools)));
  });
  it('contains no timestamps or per-run values in the stable prefix', () => {
    expect(SYSTEM_RULES).not.toMatch(/\b20\d\d-\d\d-\d\d\b|\bnow\b.*\d{2}:\d{2}/);
  });
});

describe('startup context budget', () => {
  it('system prompt ≤ 1.5k tokens and tool schemas ≤ 1.5k tokens', () => {
    expect(estimateTokens(SYSTEM_RULES)).toBeLessThanOrEqual(STARTUP_LIMITS.system);
    expect(estimateTokens(stableStringify(sortTools(tools)))).toBeLessThanOrEqual(STARTUP_LIMITS.tools);
  });
  it('standing instructions are clamped to 200 lines / 2k tokens', () => {
    const long = Array.from({ length: 400 }, (_, i) => `rule ${i}: be careful with ${i}`).join('\n');
    const c = clampStanding(long);
    expect(c.lines).toBeLessThanOrEqual(200); expect(c.tokens).toBeLessThanOrEqual(2000); expect(c.truncated).toBe(true);
  });
  it('profile digest is clamped to 300 tokens', () => {
    const b = new PromptBuilder().build({ task: task(1), tools, profileDigest: 'word '.repeat(2000), budgets: budgetsFor(model(32000)) });
    const prof = b.segments.find((s) => s.kind === 'profile')!;
    expect(prof.tokens).toBeLessThan(330);
  });
});

describe('budget math per model window', () => {
  it.each([4096, 8192, 32000, 128000, 1_000_000])('fractions add up for a %i window', (w) => {
    const b = budgetsFor(model(w));
    expect(b.systemAndTools).toBe(Math.floor(w * BUDGET_FRACTIONS.systemAndTools));
    expect(b.compactAt).toBe(Math.floor(w * 0.7)); expect(b.hardStop).toBe(Math.floor(w * 0.9));
    const sum = b.systemAndTools + b.profile + b.docs + b.history + b.observation + b.reserve;
    expect(sum).toBeGreaterThan(w * 0.99); expect(sum).toBeLessThan(w * 1.06);
    expect(b.reserve).toBeGreaterThanOrEqual(w * 0.14 - 1);
  });
  it('falls back to a conservative 16k when the window is unknown', () => { expect(budgetsFor(undefined).window).toBe(16000); });
  it('budgets are recomputed when the model changes', () => { expect(budgetsFor(model(8000)).history).toBeLessThan(budgetsFor(model(128000)).history); });
  it('flags compaction at 70% and overflow at 90%', () => {
    const cm = new ContextManager();
    const small = model(6000);
    const t = task(8);
    const b = cm.build(t, small, inputs);
    expect(b.needsCompaction).toBe(b.totalTokens >= small.maxContext * 0.7);
    expect(cm.build(task(40), small, inputs).overflow).toBe(true);
    expect(cm.build(task(1), model(200000), inputs).needsCompaction).toBe(false);
  });
  it('trims retrieved docs to the docs budget, dropping the lowest-ranked first', () => {
    const cm = new ContextManager();
    const passages = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, doc: 'Lease.pdf', page: i, text: 'clause '.repeat(120), sensitivity: 'personal' as const }));
    const b = cm.build(task(1), model(8000), { ...inputs, passages });
    const docs = b.segments.find((s) => s.kind === 'docs')!;
    expect(docs.tokens).toBeLessThanOrEqual(budgetsFor(model(8000)).docs + 80);
    expect(docs.content).toContain('p0'); expect(docs.content).not.toContain('p29');
    expect(docs.content).toContain('untrusted="true"');
  });
});

describe('masking and compaction', () => {
  const cm = new ContextManager();
  it('observation masking keeps the action record and swaps results for digest + handle', () => {
    const { task: t, masked } = cm.mask(task(8));
    expect(masked).toBe(6);
    const b = cm.build(t, model(32000), inputs);
    const calls = b.messages.filter((m) => m.role === 'assistant').map((m) => m.toolCalls![0]!.args);
    expect(calls).toHaveLength(8); expect(calls[0]).toEqual({ cursor: '1' });
    const firstTool = b.messages.find((m) => m.segmentId === 'step-1-obs')!;
    expect(firstTool.content).toContain('masked'); expect(firstTool.content).toContain('obs://t/1');
    expect(b.messages.find((m) => m.segmentId === 'step-8-obs')!.content).toContain('observation text');
  });
  it('the scratchpad survives compaction byte-for-byte', async () => {
    const t = task(14); const before = stableStringify(t.scratchpad);
    const { task: next, report } = await cm.compact(t, 'user', model(8000), inputs);
    expect(stableStringify(next.scratchpad)).toBe(before);
    const sp = (x: TaskState) => cm.build(x, model(8000), inputs).messages.find((m) => m.segmentKind === 'scratchpad')!.content;
    expect(sp(next)).toBe(sp(t));
    expect(report.turnsSummarized).toBeGreaterThan(0); expect(report.tokensAfter).toBeLessThan(report.tokensBefore);
    expect(next.compactions).toHaveLength(1);
  });
  it('keeps the last 6 turns verbatim and summarises the rest', async () => {
    const { task: next } = await cm.compact(task(14), 'overflow', model(8000), inputs);
    expect(next.summary?.upToStep).toBe(8);
    const msgs = cm.build(next, model(8000), inputs).messages;
    expect(msgs.filter((m) => m.role === 'assistant')).toHaveLength(6);
    expect(msgs.some((m) => m.content.includes('<earlier_progress>'))).toBe(true);
  });
  it('a summary of local-only steps is itself local-only (labels propagate, never dropped)', async () => {
    const t = task(14); t.steps = t.steps.map((s) => (s.index === 2 ? { ...s, sensitivity: 'local-only' as const } : s));
    const { task: next } = await cm.compact(t, 'user', model(8000), inputs);
    expect(next.summary?.sensitivity).toBe('local-only');
    const built = cm.build(next, model(8000), inputs);
    expect(built.sensitivity).toBe('local-only');
    expect(built.messages.find((m) => m.content.includes('<earlier_progress>'))!.sensitivity).toBe('local-only');
  });
  it('maybeMask only fires once history is over half its budget', () => {
    expect(cm.maybeMask(task(3), model(128000)).steps.some((s) => s.masked)).toBe(false);
    expect(cm.maybeMask(task(12), model(8000)).steps.some((s) => s.masked)).toBe(true);
  });
  it('fresh context per task carries only the result card + scratchpad', () => {
    const t = task(5, { result: { title: 'Acer Aspire 5', summary: '₹47,990', sources: [], status: 'success' } });
    const c = cm.carryOver(t);
    expect(c.priorResult).toContain('Acer'); expect(JSON.stringify(c)).not.toContain('observation text');
  });
  it('inspect() powers the Inspector: segments, reserve, 70% marker, cached prefix', () => {
    const i = cm.inspect(task(6), model(32000), inputs, { estimatedIn: 0, reportedIn: 100, reportedOut: 10, cacheRead: 60, cacheWrite: 0, calls: 1, hitRatio: 0.6 });
    expect(i.compactAt).toBe(22400); expect(i.segments.some((s) => s.kind === 'reserve')).toBe(true); expect(i.cachedPrefixTokens).toBeGreaterThan(300); expect(i.cacheHitRatio).toBe(0.6);
  });
  it('extractive summarizer respects its token cap', async () => {
    const s = await extractiveSummarizer({ turns: Array.from({ length: 80 }, (_, i) => ({ index: i, tool: 'click', args: { ref: `e${i}` }, digest: 'clicked something with a long description', ok: true })), maxTokens: 100 });
    expect(estimateTokens(s)).toBeLessThanOrEqual(110);
  });
});

describe('paging & recall', () => {
  it('pages round-trip: concatenating pages reproduces the original text', () => {
    fc.assert(fc.property(fc.array(fc.lorem({ maxCount: 40 }), { minLength: 1, maxLength: 30 }), fc.integer({ min: 20, max: 300 }), (paras, budget) => {
      const text = paras.join('\n\n'); let cursor: string | undefined; let out = ''; let guard = 0;
      do { const p = pageText(text, budget, cursor); out += p.page; cursor = p.nextCursor; if (++guard > 500) throw new Error('loop'); } while (cursor);
      return out === text;
    }), { numRuns: 120 });
  });
  it('list paging in pages of 10 round-trips', () => {
    const items = Array.from({ length: 37 }, (_, i) => i); let cursor: string | undefined; const seen: number[] = [];
    do { const p = pageList(items, cursor, 10); seen.push(...p.page); cursor = p.nextCursor; } while (cursor);
    expect(seen).toEqual(items);
  });
  it('over-budget results return page 1 + truncated + cursor + hint, and the blob goes to the store', async () => {
    const store = new MemoryObservationStore(); const big = Array.from({ length: 200 }, (_, i) => `Product ${i}: price ${1000 + i}`).join('\n');
    const r = await budgetResult(big, { taskId: 't', step: 3, store, budget: 400 });
    expect(r.truncated).toBe(true); expect(r.nextCursor).toBeTruthy(); expect(r.hint).toContain('recall'); expect(r.tokens).toBeLessThanOrEqual(420);
    expect((await store.get(r.handle!))!.text).toBe(big);
    const second = await budgetResult(big, { taskId: 't', step: 3, store, budget: 400, cursor: r.nextCursor });
    expect(second.data).not.toBe(r.data);
  });
  it('recall pulls specific parts back on demand', async () => {
    const store = new MemoryObservationStore();
    const text = Array.from({ length: 60 }, (_, i) => `Item ${i}: generic accessory number ${i}`).join('\n\n') + '\n\nAcer Aspire 5 laptop: ₹47,990, 16GB RAM, free delivery';
    const h = await store.put('t', 1, text, { label: 'shop' });
    const r = await recall(store, h, 'acer laptop price', 200);
    expect(r.found).toBe(true); expect(r.text).toContain('47,990'); expect(r.tokens).toBeLessThanOrEqual(220);
    expect((await recall(store, 'obs://nope/1', 'x')).found).toBe(false);
  });
});

describe('TokenMeter', () => {
  it('replaces estimates with provider-reported usage and tracks cache hit ratio', async () => {
    const m = new TokenMeter(); m.recordEstimate('t', 100); m.recordUsage('t', { inputTokens: 1000, outputTokens: 50, cacheReadTokens: 700 }); m.recordUsage('t', { inputTokens: 1000, outputTokens: 50, cacheReadTokens: 900 });
    const r = m.report('t'); expect(r.reportedIn).toBe(2000); expect(r.hitRatio).toBeCloseTo(0.8); expect(r.calls).toBe(2);
    expect((await m.count([{ role: 'user', content: 'hello world' }])).exact).toBe(false);
    m.exact = async () => 42; expect(await m.count([{ role: 'user', content: 'x' }])).toEqual({ tokens: 42, exact: true });
  });
});
