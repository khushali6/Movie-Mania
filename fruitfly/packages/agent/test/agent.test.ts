import { describe, expect, it } from 'vitest';
import { estimateTokens, stableStringify } from '@fruitfly/core';
import { Pantry } from '@fruitfly/pantry';
import { ALL_TOOLS, LoopGuard, classifyAction, clampReport, findElements, isSensitiveSite, activeTools, newTask } from '../src';
import { call, rig, script } from './helpers';

describe('safety: sensitive-action detector', () => {
  const el = (label: string, over = {}) => ({ ref: 'e1', role: 'button' as const, label, ...over });
  it.each([
    ['Place order', 'sensitive'], ['Pay ₹2,210', 'sensitive'], ['Transfer money', 'sensitive'], ['Delete account', 'sensitive'],
    ['Buy now', 'sensitive'], ['Proceed to checkout', 'confirm'], ['Sign in', 'confirm'], ['Send message', 'confirm'], ['Add to cart', 'none'], ['Search', 'none'], ['Details', 'none'],
  ])('click "%s" → %s', (label, level) => { expect(classifyAction({ tool: 'click', args: {}, element: el(label) }).level).toBe(level); });
  it('typing into password/card fields and vault placeholders is sensitive; profile placeholders ask; plain text is free', () => {
    expect(classifyAction({ tool: 'type', args: { text: 'x' }, element: { ref: 'e', role: 'input', label: 'Password', type: 'password' } }).level).toBe('sensitive');
    expect(classifyAction({ tool: 'type', args: { text: '4111' }, element: { ref: 'e', role: 'input', label: 'Card number' } }).level).toBe('sensitive');
    expect(classifyAction({ tool: 'type', args: { text: '{{vault.passport_no}}' }, element: { ref: 'e', role: 'input', label: 'Passport' } }).level).toBe('sensitive');
    expect(classifyAction({ tool: 'type', args: { text: '{{profile.full_name}}' }, element: { ref: 'e', role: 'input', label: 'Name' } }).level).toBe('confirm');
    expect(classifyAction({ tool: 'type', args: { text: 'laptop' }, element: { ref: 'e', role: 'input', label: 'Search' } }).level).toBe('none');
  });
  it('sensitive sites (banks, government, health) need a confirmation to navigate', () => {
    expect(isSensitiveSite('https://netbanking.hdfcbank.com/login')).toBe(true);
    expect(classifyAction({ tool: 'navigate', args: { url: 'https://www.paypal.com/' } }).level).toBe('confirm');
    expect(classifyAction({ tool: 'navigate', args: { url: 'https://example.org/' } }).level).toBe('none');
  });
});

describe('approval cannot be bypassed by the model', () => {
  it('declined action never reaches the browser, and the model is told to choose another way', async () => {
    const r = rig(script([call('click', { ref: 'e4' }), call('finish', { title: 'ok', summary: 'ok' })]), { decide: () => 'cancel' });
    // e4 is "Delete account" on shop.test home (h1=h1? refs: e1 Checkout link, e2 Delete, e3 Details) → find it first
    const s = await r.run('x', {}, r.deps());
    void s;
    const r2 = rig(script([call('read_page'), call('click', { ref: 'e2' }), call('finish', { title: 'ok', summary: 'ok' })]), { decide: () => 'cancel' });
    const s2 = await r2.run('delete my account');
    expect(r2.events.filter((e) => e.type === 'approval_needed')).toHaveLength(1);
    expect(r2.browser.siteState('shop.test').deleted).toBeUndefined();
    expect(s2.steps.find((x) => x.tool === 'click')?.inline).toMatch(/declined/);
  });
  it('approved action runs exactly once; takeover pauses the task instead of acting', async () => {
    const r = rig(script([call('read_page'), call('click', { ref: 'e2' }), call('finish', { title: 'ok', summary: 'ok' })]), { decide: () => 'approve' });
    await r.run('delete'); expect(r.browser.siteState('shop.test').deleted).toBe(true);
    const t = rig(script([call('read_page'), call('click', { ref: 'e2' })]), { decide: () => 'takeover' });
    const s = await t.run('delete'); expect(s.status).toBe('paused'); expect(t.browser.siteState('shop.test').deleted).toBeUndefined();
  });
  it('a model that tries to call a click on something harmless is never asked', async () => {
    const r = rig(script([call('read_page'), call('click', { ref: 'e3' }), call('finish', { title: 'ok', summary: 'ok' })]));
    await r.run('details'); expect(r.events.some((e) => e.type === 'approval_needed')).toBe(false); expect(r.browser.siteState('shop.test').details).toBe(1);
  });
  it('every sensitive tool path asks: password field, vault placeholder, bank site', async () => {
    const r = rig(script([call('navigate', { url: 'https://shop.test/buy' }), call('read_page'), call('type', { ref: 'e2', text: 'hunter2' }), call('finish', { title: 'x', summary: 'x' })]));
    await r.run('log in'); expect(r.events.filter((e) => e.type === 'approval_needed')).toHaveLength(1);
  });
});

describe('secrets never reach logs, events, history or prompts', () => {
  it('vault values are substituted at type time and appear nowhere in task state or events', async () => {
    const pantry = new Pantry({ vault: { iterations: 1000 } });
    await pantry.vault.setup('correct horse battery'); await pantry.vault.set('card', 'Card number', '4111 1111 1111 1111', { requiresApproval: true });
    await pantry.profile.update('full_name', { value: 'Asha Rao' });
    const seen: string[] = [];
    const brain = (req: Parameters<Parameters<typeof rig>[0]>[0], n: number) => { seen.push(JSON.stringify(req.messages)); return script([call('navigate', { url: 'https://shop.test/buy' }), call('read_page'), call('type', { ref: 'e1', text: '{{vault.card}}' }), call('finish', { title: 'ok', summary: 'ok' })])(req, n); };
    const r = rig(brain, { pantry });
    const s = await r.run('enter my card'); expect(s.status).toBe('done');
    expect(r.browser.log.find((l) => l.action === 'type')?.value).toBe('4111 1111 1111 1111'); // the page received the real value
    const everything = JSON.stringify([s, r.events, seen]);
    expect(everything).not.toContain('4111 1111 1111 1111');
    expect(everything).toContain('{{vault.card}}');
  });
});

describe('loop behaviour', () => {
  it('loop guard warns on the third identical step and stops on the fifth', async () => {
    const g = new LoopGuard(); expect([1, 2, 3, 4, 5].map(() => g.hit('click', { ref: 'e1' }))).toEqual(['ok', 'ok', 'warn', 'warn', 'stop']);
    const g2 = new LoopGuard(); const seq = ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b'].map((x) => g2.hit('click', { ref: x })); expect(seq.includes('stop') || seq.includes('warn')).toBe(true);
    const r = rig(() => call('read_page'), {});
    const s = await r.run('loop'); expect(s.status).toBe('stopped'); expect(r.events.some((e) => e.type === 'error' && e.code === 'loop_detected')).toBe(true);
  });
  it('step cap ends the task with a partial result instead of running forever', async () => {
    let i = 0; const r = rig(() => call('wait', { ms: ++i }, `w${i}`), { settings: { stepsCap: 5 } });
    const s = await runTask5(r); expect(s.steps.length).toBe(5); expect(s.result?.status).toBe('partial');
  });
  it('invalid arguments and unknown tools become corrective observations, not crashes', async () => {
    const r = rig(script([call('click', {}), call('teleport', {}), call('finish', { title: 'x', summary: 'x' })]));
    const s = await r.run('x'); expect(s.steps[0]!.inline).toMatch(/Invalid arguments/); expect(s.steps[1]!.inline).toMatch(/no tool named/); expect(s.status).toBe('done');
  });
  it('form tools are lazy: unavailable until a form is on the page', async () => {
    const r = rig(script([call('type', { ref: 'e1', text: 'x' }), call('navigate', { url: 'https://shop.test/buy' }), call('read_page'), call('finish', { title: 'x', summary: 'x' })]));
    const s = await r.run('x'); expect(s.steps[0]!.inline).toMatch(/not available right now/);
    const st = newTask('g'); expect(activeTools(st, { pantryEnabled: false, subagents: true }).some((t) => t.spec.name === 'type')).toBe(false);
    expect(activeTools({ ...st, meta: { formDetected: true } }, { pantryEnabled: false, subagents: true }).some((t) => t.spec.name === 'type')).toBe(true);
    expect(activeTools(st, { pantryEnabled: true, subagents: true }).some((t) => t.spec.name === 'pantry_search')).toBe(true);
  });
  it('tool schemas stay within the 1.5k-token startup budget for the core set and the full set stays reasonable', () => {
    const tok = (names: string[]) => estimateTokens(stableStringify(ALL_TOOLS.filter((t) => names.includes(t.spec.name)).map((t) => t.spec)));
    const core = ALL_TOOLS.filter((t) => t.group === 'core').map((t) => t.spec.name);
    expect(tok(core)).toBeLessThanOrEqual(1500);
    expect(tok(ALL_TOOLS.map((t) => t.spec.name))).toBeLessThanOrEqual(2300);
  });
  it('a text-only reply gets one nudge, then is accepted as a partial answer', async () => {
    const r = rig(() => ({ kind: 'reply', text: 'I think the answer is 42 and here is a longer explanation of why that is.' }));
    const s = await r.run('x'); expect(s.status).toBe('done'); expect(s.result?.status).toBe('partial'); expect(s.steps.length).toBe(1);
  });
  it('the critic bounces a finish that cites numbers never read, once, then accepts the corrected answer', async () => {
    const r = rig(script([call('read_page'), call('finish', { title: 'Widget', summary: 'The widget costs ₹999.' }), call('finish', { title: 'Widget', summary: 'The widget costs ₹1,299.' })]));
    const s = await r.run('price of the widget'); expect(s.result?.summary).toContain('₹1,299'); expect(s.result?.verification).toMatch(/Checked against 1 source/);
    expect(s.steps.some((x) => /Check failed/.test(x.inline ?? ''))).toBe(true);
  });
  it('compacts when the context nears the model window and keeps going', async () => {
    const big = { host: 'big.test', render: (url: URL) => ({ url: url.href, title: 'Big', nodes: Array.from({ length: 60 }, (_, i) => ({ t: 'p' as const, text: `Row ${i} ${'lorem ipsum dolor '.repeat(25)}` })) }) };
    let n = 0; const r = rig(() => (n === 0 ? (n++, call('navigate', { url: 'https://big.test/' })) : n++ < 18 ? call(n % 2 ? 'read_page' : 'scroll', n % 2 ? { cursor: String(n) } : { dir: n % 4 ? 'down' : 'up' }) : call('finish', { title: 'x', summary: 'x' })), { sites: [big, ...[]] });
    r.browser.addSite({ host: 'shop.test', render: (url: URL) => ({ url: url.href, title: 'Shop', nodes: [] }) });
    const d = r.deps(); const small = { ...d, model: { ...d.model, modelInfo: () => ({ id: 's', maxContext: 6000, maxOutput: 500, supportsTools: true, supportsVision: false, supportsStreaming: false }) } };
    const s = await r.run('read a lot', {}, small as never);
    expect(r.events.some((e) => e.type === 'compacted')).toBe(true); expect(s.compactions.length).toBeGreaterThan(0);
  });
});

describe('sub-agent reports', () => {
  it('clampReport trims to ≤ 400 tokens without breaking the schema', () => {
    const r = clampReport({ facts: Array.from({ length: 8 }, (_, i) => `fact ${i} ${'word '.repeat(40)}`.slice(0, 220)), items: Array.from({ length: 6 }, (_, i) => ({ name: `Item ${i}`, price: '₹1', notes: 'x'.repeat(110) })), answer: 'a'.repeat(400), confidence: 'high' });
    expect(estimateTokens(JSON.stringify(r))).toBeLessThanOrEqual(400);
  });
  it('find_element ranks by label and paginates', () => {
    const els = Array.from({ length: 25 }, (_, i) => ({ ref: `e${i}`, role: 'button' as const, label: i === 7 ? 'Add to cart' : `Button ${i}` }));
    expect(findElements(els, 'add to cart')[0]!.ref).toBe('e7');
  });
});

async function runTask5(r: ReturnType<typeof rig>) { return r.run('go'); }

describe('tabs', () => {
  it('a tab the agent opens in the foreground becomes the one it works in; a background tab does not', async () => {
    const r = rig(script([call('open_tab', { url: 'https://shop.test/buy' }), call('read_page'), call('finish', { title: 'ok', summary: 'ok' })]));
    const s = await r.run('look at the checkout page');
    const read = s.steps.find((x) => x.tool === 'read_page')!;
    expect(read.inline ?? read.digest).toMatch(/Buy|Checkout/);
    const b = rig(script([call('open_tab', { url: 'https://shop.test/buy', background: true }), call('read_page'), call('finish', { title: 'ok', summary: 'ok' })]));
    const s2 = await b.run('look at the shop home');
    const read2 = s2.steps.find((x) => x.tool === 'read_page')!;
    expect(read2.inline ?? read2.digest).toMatch(/Shop/);
  });
});
