import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '@fruitfly/core';
import { SessionStore, initialSession, reduceEvent } from '../src/session';

const at = 1; const taskId = 't';
const ev = (e: Record<string, unknown>): AgentEvent => ({ taskId, at, ...e } as AgentEvent);

describe('session reducer', () => {
  it('builds the timeline: active step becomes done when the next starts; failures stay failed', () => {
    const s = new SessionStore();
    [ev({ type: 'task_started', goal: 'g', mode: 'demo' }), ev({ type: 'step_started', step: { id: 's1', index: 1, title: 'Reading the page' }, kind: 'read' }), ev({ type: 'step_finished', stepId: 's1', ok: false, digest: 'x', tokens: 5, ms: 3 }), ev({ type: 'step_started', step: { id: 's2', index: 2, title: 'Clicking' }, kind: 'click' })].forEach(s.dispatch);
    expect(s.state.steps.map((x) => x.state)).toEqual(['failed', 'active']);
    expect(s.state.status).toBe('working');
  });
  it('approval needs you, then resolves back to working; result unrevealed until the fly delivers it', () => {
    let s = initialSession();
    s = reduceEvent(s, ev({ type: 'task_started', goal: 'g', mode: 'demo' }));
    s = reduceEvent(s, ev({ type: 'approval_needed', approval: { id: 'a', taskId, action: 'Pay', reason: 'r', level: 'sensitive' } }));
    expect(s.status).toBe('needs_you'); expect(s.approval?.id).toBe('a');
    s = reduceEvent(s, ev({ type: 'approval_resolved', approvalId: 'a', decision: 'approve' })); expect(s.status).toBe('working'); expect(s.approval).toBeUndefined();
    s = reduceEvent(s, ev({ type: 'result', result: { title: 'T', summary: 'S', sources: [], status: 'success' } }));
    expect(s.status).toBe('done'); expect(s.resultRevealed).toBe(false);
  });
  it('throttle shows and clears; sources dedupe; subagents track phases; compaction recorded', () => {
    let s = initialSession();
    s = reduceEvent(s, ev({ type: 'task_started', goal: 'g', mode: 'live' }));
    s = reduceEvent(s, ev({ type: 'throttled', untilMs: 5, routeId: 'r' })); expect(s.status).toBe('throttled');
    s = reduceEvent(s, ev({ type: 'unthrottled' })); expect(s.status).toBe('working');
    const src = { kind: 'page' as const, title: 'A', url: 'https://a' };
    s = reduceEvent(s, ev({ type: 'source_added', source: src })); s = reduceEvent(s, ev({ type: 'source_added', source: src })); expect(s.sources).toHaveLength(1);
    s = reduceEvent(s, ev({ type: 'subagent', id: 'x', kind: 'reader', label: 'Reading', phase: 'start' })); s = reduceEvent(s, ev({ type: 'subagent', id: 'x', kind: 'reader', label: 'Reading', phase: 'done', summary: 'ok' }));
    expect(s.subagents).toEqual([{ id: 'x', kind: 'reader', label: 'Reading', phase: 'done', summary: 'ok' }]);
    s = reduceEvent(s, ev({ type: 'compacted', report: { why: 'threshold', stepsMasked: 3, turnsSummarized: 0, tokensBefore: 10, tokensAfter: 5 } })); expect(s.compactions).toHaveLength(1);
  });
  it('stopped marks the active step failed and clears approval', () => {
    let s = initialSession(); s = reduceEvent(s, ev({ type: 'step_started', step: { id: 's1', index: 1, title: 't' }, kind: 'read' })); s = reduceEvent(s, ev({ type: 'stopped', by: 'user' }));
    expect(s.status).toBe('stopped'); expect(s.steps[0]!.state).toBe('failed');
  });
  it('store notifies subscribers only on dispatch', () => { const st = new SessionStore(); let n = 0; st.subscribe(() => n++); st.dispatch(ev({ type: 'thinking' })); expect(n).toBe(1); });
});
