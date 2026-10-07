import { describe, expect, it } from 'vitest';
import { createDemoRig, SCENARIOS, type ScenarioId } from '../src';
import type { AgentEvent } from '@fruitfly/core';

const goal = (id: ScenarioId) => SCENARIOS.find((s) => s.id === id)!.goal;
const types = (ev: AgentEvent[]) => ev.map((e) => e.type);

describe('laptop scenario (the hero demo)', () => {
  it('completes end to end, deterministically, through the real loop', async () => {
    const rig = await createDemoRig({ scenario: 'laptop' });
    const state = await rig.controller.start(goal('laptop'), { mode: 'demo' });
    if (state.status !== 'done') console.log(rig.events.filter((e) => e.type === 'error' || e.type === 'step_finished').map((e) => JSON.stringify(e).slice(0, 220)).join('\n'));
    expect(state.status).toBe('done');
    expect(state.result?.status).toBe('success');
    expect(state.result?.table?.rows.length).toBe(3);
    expect(state.result?.title).toContain('Redmi Book 15');
    expect(state.result?.summary).toContain('₹42,990');
    expect(state.result?.verification).toMatch(/Checked against \d+ sources?/);
    expect(state.steps.length).toBeLessThan(25);
  });

  it('stumbles on the cookie dialog, shows confusion, recovers by dismissing it', async () => {
    const rig = await createDemoRig({ scenario: 'laptop' });
    await rig.controller.start(goal('laptop'));
    expect(rig.events.some((e) => e.type === 'unexpected')).toBe(true);
    const clicks = rig.browser.log.filter((l) => l.action === 'click').map((l) => l.label);
    expect(clicks).toContain('Necessary only');
    const idxUnexpected = rig.events.findIndex((e) => e.type === 'unexpected');
    const idxResult = rig.events.findIndex((e) => e.type === 'result');
    expect(idxUnexpected).toBeGreaterThan(-1); expect(idxResult).toBeGreaterThan(idxUnexpected);
  });

  it('fans out to two helpers in parallel, each returning ≤ 400 tokens of validated JSON', async () => {
    const rig = await createDemoRig({ scenario: 'laptop' });
    const state = await rig.controller.start(goal('laptop'));
    const subs = rig.events.filter((e) => e.type === 'subagent');
    expect(subs.filter((e) => e.type === 'subagent' && e.phase === 'start')).toHaveLength(2);
    expect(subs.filter((e) => e.type === 'subagent' && e.phase === 'done')).toHaveLength(2);
    const starts = rig.events.map((e, i) => [e, i] as const).filter(([e]) => e.type === 'subagent' && e.phase === 'start').map(([, i]) => i);
    const firstDone = rig.events.findIndex((e) => e.type === 'subagent' && e.phase === 'done');
    expect(Math.max(...starts)).toBeLessThan(firstDone); // both started before either finished
    const del = state.steps.find((s) => s.tool === 'delegate')!;
    const { estimateTokens } = await import('@fruitfly/core');
    for (const m of (del.inline ?? '').matchAll(/\{"facts".*\}/g)) { expect(estimateTokens(m[0])).toBeLessThanOrEqual(400); expect(() => JSON.parse(m[0])).not.toThrow(); }
  });

  it('is deterministic: same script, same actions', async () => {
    const a = await createDemoRig({ scenario: 'laptop' }); const b = await createDemoRig({ scenario: 'laptop' });
    await a.controller.start(goal('laptop')); await b.controller.start(goal('laptop'));
    const strip = (r: typeof a) => r.events.filter((e) => e.type !== 'usage').map((e) => e.type === 'step_started' ? `${e.step.tool}:${e.step.targetLabel ?? ''}` : e.type);
    expect(strip(a)).toEqual(strip(b));
  });

  it('keeps the prompt prefix byte-identical across steps (cache-friendly) and tracks usage', async () => {
    const rig = await createDemoRig({ scenario: 'laptop' });
    const seen: string[] = [];
    const orig = rig.router.complete.bind(rig.router);
    rig.router.complete = async (p, req, o) => { if (req.purpose === 'plan') seen.push(JSON.stringify(req.messages.slice(0, 1))); return orig(p, req, o); };
    await rig.controller.start(goal('laptop'));
    expect(new Set(seen).size).toBe(1); expect(seen.length).toBeGreaterThan(8);
    expect(rig.events.some((e) => e.type === 'usage')).toBe(true);
  });
});

describe('other scenarios', () => {
  it('flight: fills the form and finds the cheapest fare', async () => {
    const rig = await createDemoRig({ scenario: 'flight' });
    const s = await rig.controller.start(goal('flight'));
    expect(s.status).toBe('done'); expect(s.result?.title).toContain('₹54,780'); expect(s.result?.table?.rows[0]?.[0]).toMatch(/IndiGo/);
    expect(rig.browser.log.filter((l) => l.action === 'type').map((l) => l.value)).toEqual(['Mumbai', 'Paris']);
  });

  it('approval: blocks the payment until approved; declining means the bank never gets the click', async () => {
    const rig = await createDemoRig({ scenario: 'approval' });
    rig.controller.on((e) => { if (e.type === 'approval_needed') setTimeout(() => rig.controller.cancelApproval(e.approval.id), 5); });
    const s = await rig.controller.start(goal('approval'));
    expect(rig.events.filter((e) => e.type === 'approval_needed')).toHaveLength(1);
    expect(rig.browser.log.some((l) => l.label?.startsWith('Pay ₹'))).toBe(false);
    expect(s.result?.status).toBe('partial'); expect(rig.browser.siteState('northbank.example').paid).toBeUndefined();

    const rig2 = await createDemoRig({ scenario: 'approval' });
    let asked: Parameters<typeof rig2.controller.approve>[0] | undefined;
    rig2.controller.on((e) => { if (e.type === 'approval_needed') { asked = e.approval.id; expect(e.approval.level).toBe('sensitive'); setTimeout(() => rig2.controller.approve(e.approval.id), 5); } });
    const s2 = await rig2.controller.start(goal('approval'));
    expect(asked).toBeTruthy(); expect(rig2.browser.siteState('northbank.example').paid).toBe(2210); expect(s2.result?.status).toBe('success');
  });

  it('injection: flags the page, never follows it, never buys', async () => {
    const rig = await createDemoRig({ scenario: 'injection' });
    const s = await rig.controller.start(goal('injection'));
    expect(rig.events.some((e) => e.type === 'injection_flag')).toBe(true);
    expect(rig.browser.log.some((l) => l.action === 'click')).toBe(false);
    expect(s.result?.summary).toMatch(/did not buy/);
    const page = s.steps.find((st) => st.tool === 'read_page')!;
    expect(page.inline).toContain('untrusted="true"');
  });

  it('pantry: answers from local-only docs, with source chips, only on a local route', async () => {
    const rig = await createDemoRig({ scenario: 'pantry' });
    const s = await rig.controller.start(goal('pantry'));
    expect(s.status).toBe('done'); expect(s.result?.summary).toContain('two months');
    expect(s.result?.sources.some((x) => x.kind === 'pantry' && /Lease/.test(x.title))).toBe(true);
    expect(rig.events.some((e) => e.type === 'source_added' && e.source.kind === 'pantry')).toBe(true);
    expect(s.scratchpad.findings.length).toBeGreaterThan(0);
    // the whole context became local-only, so only the on-device route could ever see it
    expect(s.meta.scratchpadSensitivity).toBe('local-only');
  });
});

describe('gateway behaviours in demo mode', () => {
  it('a scripted 429 fails over to the next route and the task still completes', async () => {
    const rig = await createDemoRig({ scenario: 'flight', failoverDemo: true, rateLimitAtCall: 2, sleep: async () => {} });
    const s = await rig.controller.start(goal('flight'));
    expect(s.status).toBe('done');
    expect(rig.routerEvents.some((e) => e.type === 'route_switch' && e.to === 'demo:backup')).toBe(true);
    expect(rig.routerEvents.some((e) => e.type === 'retry' || e.type === 'throttled')).toBe(true);
  });
});

describe('Stop, pause and resume', () => {
  it('Stop aborts mid-task and leaves a persisted, resumable state', async () => {
    const rig = await createDemoRig({ scenario: 'laptop', thinkMs: 20 });
    const p = rig.controller.start(goal('laptop'));
    setTimeout(() => rig.controller.stop(), 60);
    const s = await p;
    expect(s.status).toBe('stopped');
    expect(types(rig.events)).toContain('stopped');
    expect((await rig.store.load(s.id))?.status).toBe('stopped');
  });

  it('survives a killed service worker: resume continues from the persisted step without redoing actions', async () => {
    const rig = await createDemoRig({ scenario: 'flight' });
    let killAt = 0;
    const ctl = rig.controller as unknown as { mk: () => Record<string, unknown> };
    const orig = ctl.mk.bind(ctl);
    let first = true;
    ctl.mk = () => ({ ...orig(), onStepPersisted: (st: { steps: unknown[] }) => { if (first && st.steps.length === 6) { killAt = st.steps.length; throw new Error('service worker killed'); } } });
    await expect(rig.controller.start(goal('flight'))).rejects.toThrow('killed');
    first = false;
    const typedBefore = rig.browser.log.filter((l) => l.action === 'type').length;
    const resumed = await rig.controller.resume();
    expect(killAt).toBe(6);
    expect(resumed?.status).toBe('done'); expect(resumed?.result?.title).toContain('₹54,780');
    expect(rig.browser.log.filter((l) => l.action === 'type').length).toBe(2); // typed exactly twice in total
    expect(typedBefore).toBeLessThanOrEqual(2);
  });
});
