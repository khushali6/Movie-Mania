import { FruitflyError, estimateTokens, maxSensitivity, newId, newScratchpad, type AgentEvent, type Sensitivity, type StepRecord, type TaskState, type ToolSpec, type ChatMessage } from '@fruitfly/core';
import type { ContextInputs, Passage } from '@fruitfly/context';
import { compileDigest } from '@fruitfly/pantry';
import { classifyAction, hostOf } from './safety';
import { LoopGuard } from './guards';
import { ALL_TOOLS, TOOL_BY_NAME, activeTools } from './tools';
import { DEFAULT_SETTINGS, type AgentDeps, type AgentSettings, type StepKind, type ToolContext, type ToolDef, type ToolOutput } from './types';

export interface RunOptions {
  /** explicit toolset (sub-agents); skips lazy groups */
  toolset?: ToolDef<never>[];
  maxSteps?: number;
  sub?: { id: string; kind: string };
  system?: string;
  /** don't persist (sub-agents) */
  ephemeral?: boolean;
  /** called when the model finishes with the tool named here (sub-agents use `report`) */
  finishName?: string;
  /** user-facing controls */
  control?: RunControl;
}

export interface RunControl { paused(): boolean; whenResumed(): Promise<void> }

const ORDER = { public: 0, personal: 1, 'local-only': 2 } as const;
const stepKind = (t: ToolDef<never> | undefined): StepKind => t?.kind ?? 'other';

export function newTask(goal: string, o: { mode?: 'demo' | 'live'; profile?: TaskState['routeProfile']; stepsCap?: number; tokensCap?: number; id?: string; now?: number } = {}): TaskState {
  const now = o.now ?? Date.now();
  return {
    id: o.id ?? newId('task'), goal, mode: o.mode ?? 'live', status: 'idle', scratchpad: newScratchpad(goal), steps: [], routeProfile: o.profile ?? 'smart',
    budgets: { tokensUsed: 0, tokensCap: o.tokensCap ?? DEFAULT_SETTINGS.tokensCap, stepsUsed: 0, stepsCap: o.stepsCap ?? DEFAULT_SETTINGS.stepsCap },
    compactions: [], sources: [], createdAt: now, updatedAt: now, meta: {},
  };
}

function title(tool: string, args: Record<string, unknown>, target?: { label: string }): string {
  switch (tool) {
    case 'read_page': return 'Reading the page';
    case 'find_element': return `Looking for "${String(args.query ?? '')}"`;
    case 'click': return target ? `Clicking "${target.label}"` : 'Clicking';
    case 'type': return target ? `Typing into "${target.label}"` : 'Typing';
    case 'select_option': return target ? `Choosing in "${target.label}"` : 'Choosing an option';
    case 'scroll': return `Scrolling ${String(args.dir ?? '')}`.trim();
    case 'navigate': return `Opening ${hostOf(String(args.url ?? '')) || 'a page'}`;
    case 'open_tab': return `Opening ${hostOf(String(args.url ?? '')) || 'a tab'}`;
    case 'back': return 'Going back';
    case 'wait': return 'Waiting for the page';
    case 'recall': return 'Recalling an earlier page';
    case 'delegate': return 'Asking helpers';
    case 'pantry_search': return 'Checking your Pantry';
    case 'pantry_get': return 'Reading a document';
    case 'profile_get': return 'Checking your profile';
    case 'scratchpad_update': return 'Noting findings';
    case 'ask_user': return 'Asking you';
    case 'finish': return 'Wrapping up';
    default: return tool.replace(/_/g, ' ');
  }
}

export interface RunResult { state: TaskState }

/**
 * The agent loop. Every iteration: build context → ask the model for one tool call → validate → safety/approval →
 * run → record → persist. State is saved after each step, so a service-worker restart resumes where it left off.
 */
export async function runTask(initial: TaskState, deps: AgentDeps, opts: RunOptions = {}): Promise<TaskState> {
  const settings: AgentSettings = { ...DEFAULT_SETTINGS, ...deps.settings };
  const now = deps.now ?? Date.now;
  const sub = !!opts.sub;
  const emit = (e: AgentEvent) => { if (!sub || e.type === 'subagent') deps.emit(e); };
  let state: TaskState = initial;
  const guard = LoopGuard.from(state.meta.guard as ReturnType<LoopGuard['snapshot']> | undefined);
  const maxSteps = opts.maxSteps ?? state.budgets.stepsCap;
  const persist = async () => { state = { ...state, updatedAt: now(), meta: { ...state.meta, guard: guard.snapshot() } }; if (!opts.ephemeral) await deps.store.save(state); await deps.onStepPersisted?.(state); };
  const E = <T extends AgentEvent['type']>(type: T, rest: Omit<Extract<AgentEvent, { type: T }>, 'type' | 'taskId' | 'at'>) => emit({ type, taskId: state.id, at: now(), ...(rest as object) } as AgentEvent);
  const stop = async (by: 'user' | 'guard' | 'budget'): Promise<TaskState> => {
    state = { ...state, status: 'stopped' }; await persist();
    if (!sub) E('stopped', { by });
    return state;
  };

  // ── start / resume ──
  const resuming = state.steps.length > 0 || state.status === 'running' || state.status === 'waiting_approval' || state.status === 'paused';
  state = { ...state, status: 'running', tabId: state.tabId ?? (await deps.browser.activeTab()).id };
  if (!sub) { if (resuming) E('resumed', {}); else E('task_started', { goal: state.goal, mode: state.mode }); }
  if (!sub && !state.meta.retrievalDone) { state = await retrievalGate(state, deps, emit, now); await persist(); }

  // an action that was in flight when we died is never blindly repeated
  const pending = state.meta.pendingCall as { callId: string; name: string; args: Record<string, unknown>; phase: 'approval' | 'running'; thought?: string } | undefined;
  let forcedCall: { id: string; name: string; args: Record<string, unknown> } | undefined;
  if (pending) {
    const tool = TOOL_BY_NAME.get(pending.name);
    if (pending.phase === 'running' && tool && !tool.readOnly) {
      state = recordStep(state, { callId: pending.callId, tool: pending.name, args: pending.args, thought: pending.thought, ok: false, digest: 'Interrupted', inline: 'This action was interrupted before it finished (the browser restarted). Re-read the page to see whether it happened before trying again.', sensitivity: 'public', startedAt: now(), endedAt: now() });
      state = { ...state, meta: { ...state.meta, pendingCall: undefined } };
      await persist();
    } else { forcedCall = { id: pending.callId, name: pending.name, args: pending.args }; }
  }

  let textOnly = 0;
  for (;;) {
    if (deps.signal.aborted) return stop('user');
    if (opts.control?.paused()) { E('paused', {}); state = { ...state, status: 'paused' }; await persist(); await opts.control.whenResumed(); if (deps.signal.aborted) return stop('user'); state = { ...state, status: 'running' }; E('resumed', {}); }
    if (state.steps.length >= maxSteps) {
      if (sub) return { ...state, status: 'failed' };
      E('error', { code: 'budget_reached', message: "That's my step limit for this task.", recoverable: false });
      state = { ...state, status: 'stopped', result: partialResult(state, "I reached my step limit before finishing. Here is what I have so far.") }; await persist(); E('result', { result: state.result! }); return state;
    }
    if (state.budgets.tokensUsed >= state.budgets.tokensCap) { E('error', { code: 'budget_reached', message: "That's my limit for this task.", recoverable: false }); return stop('budget'); }

    // ── choose the next call ──
    const profile = state.routeProfile;
    const allowance = deps.model.allowance(profile);
    const toolset = opts.toolset ?? activeTools(state, { pantryEnabled: !!deps.pantry && !sub, subagents: settings.subagents && !sub });
    const specs: ToolSpec[] = toolset.map((t) => t.spec);
    let call: { id: string; name: string; args: Record<string, unknown> } | undefined = forcedCall; forcedCall = undefined;
    let thought: string | undefined = pending?.thought;
    if (!call) {
      const model = deps.model.modelInfo(profile);
      let inputs = await contextInputs(state, deps, specs, opts, allowance);
      let built = deps.context.build(state, model, inputs);
      if (built.needsCompaction && state.steps.length > 2) {
        const c = await deps.context.compact(state, built.overflow ? 'overflow' : 'threshold', model, inputs);
        state = c.task; E('compacted', { report: c.report }); await persist();
        inputs = await contextInputs(state, deps, specs, opts, allowance); built = deps.context.build(state, model, inputs);
      }
      deps.meter.recordEstimate(state.id, built.totalTokens);
      E('thinking', {});
      let resp;
      try {
        resp = await deps.model.complete(profile, { messages: built.messages, tools: specs, purpose: sub ? 'subagent' : 'plan', priority: sub ? 'subagent' : 'planner', owner: opts.sub?.id ?? 'main', needsContext: Math.min(built.totalTokens + 800, model.maxContext) }, {
          taskId: state.id, signal: deps.signal,
          compact: async () => { const c = await deps.context.compact(state, 'overflow', model, inputs); state = c.task; E('compacted', { report: c.report }); inputs = await contextInputs(state, deps, specs, opts, allowance); return deps.context.build(state, model, inputs).messages; },
          rephrase: (m: ChatMessage[]) => [...m, { role: 'user', content: 'Please continue with a different, neutral wording of the next step.', sensitivity: 'public' as const }],
        });
      } catch (e) {
        if (e instanceof FruitflyError) {
          if (e.code === 'aborted') return stop('user');
          if (e.code === 'budget_reached') { E('error', { code: e.code, message: e.message, recoverable: false }); return stop('budget'); }
          if (sub) throw e;
          E('error', { code: e.code, message: e.message, recoverable: false });
          state = { ...state, status: 'failed', result: partialResult(state, e.message, 'failed') }; await persist(); E('result', { result: state.result! }); return state;
        }
        throw e;
      }
      deps.meter.recordUsage(state.id, resp.usage);
      const used = resp.usage.inputTokens + resp.usage.outputTokens || built.totalTokens + estimateTokens(resp.text);
      state = { ...state, budgets: { ...state.budgets, tokensUsed: state.budgets.tokensUsed + used } };
      if (!sub) { const m = deps.meter.report(state.id); E('usage', { tokensUsed: state.budgets.tokensUsed, tokensCap: state.budgets.tokensCap, stepsUsed: state.steps.length, stepsCap: maxSteps, cacheRead: m.cacheRead, cacheWrite: m.cacheWrite }); }
      if (!resp.toolCalls.length) {
        textOnly++;
        if (textOnly >= 3 || (textOnly >= 2 && resp.text.trim().length > 40)) {
          if (sub) throw new FruitflyError('malformed_output', 'Helper did not call a tool.');
          const r = { title: resp.text.split('\n')[0]!.slice(0, 80) || 'Done', summary: resp.text.trim() || 'I could not finish.', sources: state.sources, status: 'partial' as const };
          return finalize(state, r, deps, persist, E, sub);
        }
        state = recordStep(state, { callId: newId('c'), tool: 'scratchpad_update', args: {}, thought: resp.text.slice(0, 400), ok: false, digest: 'Replied without calling a tool', inline: 'Call exactly one tool. If you are done, call finish.', sensitivity: 'public', startedAt: now(), endedAt: now() });
        await persist(); continue;
      }
      textOnly = 0;
      call = resp.toolCalls[0]!; thought = resp.text ? resp.text.slice(0, 400) : undefined;
      state = { ...state, meta: { ...state.meta, pendingCall: { callId: call.id, name: call.name, args: call.args, phase: 'approval', thought } } };
      await persist();
    }

    // ── validate ──
    const tool = (opts.toolset ?? ALL_TOOLS).find((t) => t.spec.name === call!.name) as ToolDef<never> | undefined;
    const startedAt = now();
    const finishStep = async (out: ToolOutput) => {
      const sens = (out.sensitivity ?? 'public') as Sensitivity;
      state = recordStep(state, { callId: call!.id, tool: call!.name, args: call!.args, thought, ok: out.ok !== false, digest: out.digest ?? out.text.slice(0, 100), inline: out.text, handle: out.handle, truncated: out.truncated, sensitivity: sens, startedAt, endedAt: now(), route: undefined });
      state = { ...state, meta: { ...state.meta, pendingCall: undefined, stepSensitivity: undefined } };
      await persist();
      const rec = state.steps[state.steps.length - 1]!;
      E('step_finished', { stepId: rec.id, ok: rec.ok, digest: rec.digest, tokens: rec.tokens, ms: (rec.endedAt ?? now()) - rec.startedAt, truncated: out.truncated, handle: out.handle });
      if (out.unexpected) E('unexpected', { stepId: rec.id, note: out.unexpected });
    };
    const index = state.steps.length + 1;
    if (!tool) { E('step_started', { step: { id: `s${index}`, index, title: 'Unknown tool', tool: call.name }, kind: 'other' }); await finishStep({ ok: false, text: `There is no tool named "${call.name}". Use one of: ${(opts.toolset ?? ALL_TOOLS).map((t) => t.spec.name).join(', ')}.`, digest: `Unknown tool ${call.name}` }); continue; }
    const parsed = tool.schema.safeParse(call.args);
    const kind = stepKind(tool);
    if (!parsed.success) { E('step_started', { step: { id: `s${index}`, index, title: title(tool.spec.name, call.args), tool: tool.spec.name }, kind }); await finishStep({ ok: false, text: `Invalid arguments for ${tool.spec.name}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'args'} ${i.message}`).join('; ')}.`, digest: `Bad arguments for ${tool.spec.name}` }); continue; }
    const args = parsed.data as Record<string, unknown>;
    const toolForActive = !opts.toolset && !activeTools(state, { pantryEnabled: !!deps.pantry && !sub, subagents: settings.subagents && !sub }).some((t) => t.spec.name === tool.spec.name);
    if (toolForActive) { E('step_started', { step: { id: `s${index}`, index, title: title(tool.spec.name, args), tool: tool.spec.name }, kind }); await finishStep({ ok: false, text: `${tool.spec.name} is not available right now${tool.group === 'form' ? ' (no form on this page; read the page first)' : ''}.`, digest: `${tool.spec.name} unavailable` }); continue; }

    const ctx: ToolContext = {
      deps, get state() { return state; }, tabId: (args.tab as string | undefined) ?? state.tabId!, stepIndex: index,
      update: (fn) => { state = fn(state); },
      addSource: (s) => { if (!state.sources.some((x) => (s.url && x.url === s.url) || (s.passageId && x.passageId === s.passageId) || (!s.url && !s.passageId && x.title === s.title && x.kind === s.kind))) { state = { ...state, sources: [...state.sources, s] }; E('source_added', { source: s }); } },
      emit, signal: deps.signal, sub, nowMs: now,
    } as ToolContext;

    // ── loop guard ──
    const g = guard.hit(tool.spec.name, args, state.meta.lastUrl as string | undefined);
    if (g === 'stop' && tool.spec.name !== 'finish') {
      E('error', { code: 'loop_detected', message: 'I keep repeating the same step. Stopping so you can take over.', recoverable: false });
      state = { ...state, status: 'stopped', meta: { ...state.meta, pendingCall: undefined }, result: partialResult(state, 'I got stuck repeating the same step, so I stopped.') }; await persist(); if (!sub) E('result', { result: state.result! }); return state;
    }

    // a pause pressed while the model was thinking takes effect before anything is touched
    if (!sub && opts.control?.paused()) { E('paused', {}); state = { ...state, status: 'paused' }; await persist(); await opts.control.whenResumed(); if (deps.signal.aborted) return stop('user'); state = { ...state, status: 'running' }; E('resumed', {}); }

    // ── target, fly, safety ──
    const target = await tool.target?.(ctx, args as never).catch(() => undefined);
    E('step_started', { step: { id: `s${index}`, index, title: title(tool.spec.name, args, target), tool: tool.spec.name, args: redactArgs(args), tabId: ctx.tabId, targetLabel: target?.label }, kind });
    await deps.beforeAction?.({ kind, tabId: ctx.tabId, ref: target?.ref, label: target?.label });
    if (target) await deps.browser.highlight(ctx.tabId, target.ref, target.label).catch(() => undefined);

    let declined = false;
    const verdict = classifyAction({ tool: tool.spec.name, args, element: target?.element, url: target?.url ?? (state.meta.lastUrl as string | undefined) });
    state = { ...state, meta: { ...state.meta, approvedVault: false } };
    if (verdict.level !== 'none') {
      const approval = { id: newId('appr'), taskId: state.id, action: title(tool.spec.name, args, target), reason: verdict.reason, level: verdict.level === 'sensitive' ? ('sensitive' as const) : ('confirm' as const), site: hostOf(target?.url ?? String(state.meta.lastUrl ?? '')), preview: previewFor(tool.spec.name, args, target?.label) };
      state = { ...state, status: 'waiting_approval', pendingApproval: approval }; await persist();
      E('approval_needed', { approval });
      const decision = await deps.approvals.request(approval, deps.signal).catch(() => 'cancel' as const);
      E('approval_resolved', { approvalId: approval.id, decision });
      state = { ...state, status: 'running', pendingApproval: undefined };
      if (deps.signal.aborted) { await deps.browser.highlight(ctx.tabId, null).catch(() => undefined); return stop('user'); }
      if (decision === 'takeover') {
        await deps.browser.highlight(ctx.tabId, null).catch(() => undefined);
        state = { ...state, status: 'paused', meta: { ...state.meta, pendingCall: undefined, tookOver: true } }; await persist(); E('paused', {}); return state;
      }
      if (decision === 'cancel') declined = true; else if (verdict.category === 'vault' || verdict.category === 'payment-field') state = { ...state, meta: { ...state.meta, approvedVault: true } };
    }

    // ── run ──
    let out: ToolOutput;
    if (declined) out = { ok: false, text: 'The user declined this action. Do not try it again. Choose another approach, or finish and explain what you could not do.', digest: 'Declined by you' };
    else {
      state = { ...state, meta: { ...state.meta, pendingCall: { callId: call.id, name: call.name, args, phase: 'running', thought } } }; if (!tool.readOnly) await persist();
      try { out = await tool.run(ctx, args as never); }
      catch (e) {
        if (deps.signal.aborted) { await deps.browser.highlight(ctx.tabId, null).catch(() => undefined); return stop('user'); }
        const msg = e instanceof FruitflyError ? e.message : e instanceof Error ? e.message : String(e);
        out = { ok: false, text: `${tool.spec.name} failed: ${msg}`, digest: `${tool.spec.name} failed`, unexpected: tool.kind === 'click' || tool.kind === 'type' ? 'That did not work as I expected.' : undefined };
      }
    }
    await deps.browser.highlight(ctx.tabId, null).catch(() => undefined);
    await deps.afterAction?.({ ok: out.ok !== false, kind });
    if (g === 'warn') out = { ...out, text: `${out.text}\n[You have done this same step several times. Try something different, or finish with what you have.]` };

    // ── finish / pause ──
    if (out.finish) {
      const fin = out.finish.result;
      if (opts.finishName === tool.spec.name || tool.spec.name === 'finish' || sub) {
        await finishStep(out);
        return finalize(state, fin, deps, persist, E, sub, true);
      }
    }
    await finishStep(out);
    if (opts.finishName && tool.spec.name === opts.finishName) return { ...state, status: 'done' };
    if (out.pause) { state = { ...state, status: 'paused', meta: { ...state.meta, pendingQuestion: out.pause.question } }; await persist(); E('paused', {}); return state; }
    state = deps.context.maybeMask(state, deps.model.modelInfo(profile));
  }
}

function recordStep(state: TaskState, s: Omit<StepRecord, 'id' | 'index' | 'tokens'> & { tokens?: number }): TaskState {
  const index = state.steps.length + 1;
  const rec: StepRecord = { id: `s${index}`, index, tokens: s.tokens ?? estimateTokens(s.inline ?? ''), ...s } as StepRecord;
  const sens = rec.sensitivity;
  return { ...state, steps: [...state.steps, rec], budgets: { ...state.budgets, stepsUsed: index }, meta: { ...state.meta, stepSensitivity: undefined, scratchpadSensitivity: maxSensitivity((state.meta.scratchpadSensitivity as Sensitivity | undefined) ?? 'public', sens) } };
}

function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  // placeholders stay as placeholders; real values never exist in args
  return Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v === 'string' && v.length > 120 ? `${v.slice(0, 117)}…` : v]));
}

function previewFor(tool: string, args: Record<string, unknown>, label?: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (label) out.push({ label: 'Target', value: label });
  if (tool === 'type') out.push({ label: 'Value', value: /\{\{/.test(String(args.text)) ? String(args.text) : '•'.repeat(Math.min(10, String(args.text ?? '').length)) });
  if (tool === 'navigate' || tool === 'open_tab') out.push({ label: 'Address', value: String(args.url ?? '') });
  return out;
}

async function contextInputs(state: TaskState, deps: AgentDeps, specs: ToolSpec[], opts: RunOptions, allowance: Sensitivity): Promise<ContextInputs> {
  const inputs: ContextInputs = { tools: specs, system: opts.system };
  if (opts.sub) return inputs;
  const passages = (state.meta.passages as Passage[] | undefined) ?? [];
  inputs.passages = passages;
  const pantry = deps.pantry;
  if (pantry) {
    const fields = (await pantry.profile.get()).filter((f) => ORDER[f.sensitivity] <= ORDER[allowance]);
    const d = compileDigest(fields, { includeLocalOnly: allowance === 'local-only' });
    const kept = (await pantry.notes.digest(120)).trim();
    const stand = fields.find((f) => f.key === 'standing_instructions')?.value ?? deps.settings?.standingInstructions;
    if (d.text || kept) inputs.profileDigest = [d.text, kept && `Notes the user kept:\n${kept}`].filter(Boolean).join('\n');
    inputs.profileSensitivity = d.text || kept ? maxSensitivity(d.sensitivity, kept ? 'personal' : 'public') : 'public';
    if (stand) inputs.standingInstructions = stand;
  } else if (deps.settings?.standingInstructions) { inputs.standingInstructions = deps.settings.standingInstructions; inputs.profileSensitivity = 'personal'; }
  if (ORDER[inputs.profileSensitivity ?? 'public'] > ORDER[allowance]) { inputs.profileDigest = undefined; inputs.standingInstructions = undefined; inputs.profileSensitivity = 'public'; }
  return inputs;
}

/** Retrieval gate: only when the question needs the user's own material. */
async function retrievalGate(state: TaskState, deps: AgentDeps, emit: (e: AgentEvent) => void, now: () => number): Promise<TaskState> {
  const mark = (s: TaskState): TaskState => ({ ...s, meta: { ...s.meta, retrievalDone: true } });
  const pantry = deps.pantry; if (!pantry) return mark(state);
  const docs = await pantry.list(); if (!docs.length) return mark(state);
  const allowance = deps.model.allowance(state.routeProfile);
  const r = await pantry.search(state.goal, { maxAllowed: allowance, window: deps.model.modelInfo(state.routeProfile).maxContext, k: 6 });
  if (r.plan.mode === 'none') return mark(state);
  let next = mark(state);
  if (r.passages.length) {
    const sens = r.passages.reduce<Sensitivity>((a, p) => maxSensitivity(a, p.sensitivity), 'public');
    next = { ...next, meta: { ...next.meta, passages: r.passages, scratchpadSensitivity: maxSensitivity((next.meta.scratchpadSensitivity as Sensitivity | undefined) ?? 'public', sens) } };
    for (const p of r.passages) { const s = { kind: 'pantry' as const, title: p.doc, docId: p.docId, page: p.page, passageId: p.id }; if (!next.sources.some((x) => x.passageId === p.id)) { next = { ...next, sources: [...next.sources, s] }; emit({ type: 'source_added', taskId: state.id, at: now(), source: s }); } }
  }
  if (r.withheld) emit({ type: 'thinking', taskId: state.id, at: now(), note: 'Some of your documents stay on this device, and I need a local model to read them.' });
  return next;
}

function partialResult(state: TaskState, summary: string, status: 'partial' | 'failed' = 'partial') {
  return { title: status === 'failed' ? 'I could not finish' : 'Partly done', summary: `${summary}${state.scratchpad.findings.length ? ` So far: ${state.scratchpad.findings.slice(-4).join('; ')}.` : ''}`, bullets: state.scratchpad.findings.slice(-6), sources: state.sources, status } as import('@fruitfly/core').TaskResult;
}

async function finalize(state: TaskState, result: import('@fruitfly/core').TaskResult, deps: AgentDeps, persist: () => Promise<void>, E: (type: never, rest: never) => void, sub: boolean, verify = false): Promise<TaskState> {
  const emitE = E as unknown as (type: string, rest: object) => void;
  let r = { ...result, sources: result.sources.length ? result.sources : state.sources };
  if (verify && !sub && r.status !== 'failed') {
    const { verifyResult } = await import('./subagents');
    const v = await verifyResult(state, r, deps).catch(() => undefined);
    if (v && v.unsupported.length && !state.meta.criticBounced) {
      // one chance to fix unsupported claims before the result card is shown
      state = { ...state, meta: { ...state.meta, criticBounced: true } };
      const last = state.steps[state.steps.length - 1];
      if (last) state = { ...state, steps: state.steps.slice(0, -1).concat({ ...last, ok: false, digest: 'Checked my answer', inline: `Check failed. These claims are not supported by the pages or documents you read: ${v.unsupported.join('; ')}. Fix or remove them, then call finish again.` }) };
      await persist();
      return runTask(state, deps);
    }
    if (v) r = { ...r, verification: v.line, status: v.unsupported.length && r.status === 'success' ? 'partial' : r.status };
  }
  state = { ...state, status: r.status === 'failed' ? 'failed' : 'done', result: r, meta: { ...state.meta, pendingCall: undefined } };
  await persist();
  if (!sub) emitE('result', { result: r });
  return state;
}
