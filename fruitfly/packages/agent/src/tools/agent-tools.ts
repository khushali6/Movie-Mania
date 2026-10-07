import { z } from 'zod';
import { estimateTokens, ResultSchema, type Scratchpad, type TaskResult, type Sensitivity, maxSensitivity } from '@fruitfly/core';
import { recall as recallObs } from '@fruitfly/context';
import type { ToolContext, ToolDef } from '../types';
import { paged } from './helpers';

const arr = z.array(z.string().max(300)).max(12).optional();

function dedupeAppend(base: string[], add?: string[]): string[] { const out = [...base]; for (const x of add ?? []) if (x.trim() && !out.some((y) => y.toLowerCase() === x.toLowerCase())) out.push(x.trim()); return out.slice(-24); }

export const scratchpadUpdate: ToolDef<{ goal?: string; constraints?: string[]; findings?: string[]; rejected?: string[]; openQuestions?: string[]; resolved?: string[] }> = {
  spec: { name: 'scratchpad_update', description: 'Record durable facts (appends). `resolved` removes open questions.', parameters: { type: 'object', properties: { goal: { type: 'string' }, constraints: { type: 'array', items: { type: 'string' } }, findings: { type: 'array', items: { type: 'string' } }, rejected: { type: 'array', items: { type: 'string' } }, openQuestions: { type: 'array', items: { type: 'string' } }, resolved: { type: 'array', items: { type: 'string' } } } } },
  group: 'core', kind: 'other', readOnly: true,
  schema: z.object({ goal: z.string().max(400).optional(), constraints: arr, findings: arr, rejected: arr, openQuestions: arr, resolved: arr }),
  async run(ctx, a) {
    ctx.update((s) => {
      const sp: Scratchpad = { goal: a.goal ?? s.scratchpad.goal, constraints: dedupeAppend(s.scratchpad.constraints, a.constraints), findings: dedupeAppend(s.scratchpad.findings, a.findings), rejected: dedupeAppend(s.scratchpad.rejected, a.rejected), openQuestions: dedupeAppend(s.scratchpad.openQuestions, a.openQuestions).filter((q) => !(a.resolved ?? []).some((r) => q.toLowerCase().includes(r.toLowerCase()))) };
      // private findings must keep the scratchpad's label high enough
      const sens = (s.meta.stepSensitivity as Sensitivity | undefined) ?? 'public';
      return { ...s, scratchpad: sp, meta: { ...s.meta, scratchpadSensitivity: maxSensitivity((s.meta.scratchpadSensitivity as Sensitivity | undefined) ?? 'public', sens) } };
    });
    return { text: 'Scratchpad updated.', digest: `Noted ${((a.findings?.length ?? 0) + (a.rejected?.length ?? 0) + (a.constraints?.length ?? 0)) || 'an update'}` };
  },
};

export const recall: ToolDef<{ handle: string; query: string }> = {
  spec: { name: 'recall', description: 'Pull parts of an earlier masked observation back, by handle.', parameters: { type: 'object', properties: { handle: { type: 'string' }, query: { type: 'string' } }, required: ['handle', 'query'] } },
  group: 'core', kind: 'search', readOnly: true, schema: z.object({ handle: z.string().startsWith('obs://'), query: z.string().min(1) }),
  async run(ctx, a) {
    const r = await recallObs(ctx.deps.observations, a.handle, a.query, 600);
    return { text: r.text, ok: r.found, digest: r.found ? `Recalled "${a.query}"` : `Nothing for "${a.query}"`, sensitivity: r.sensitivity };
  },
};

export const askUser: ToolDef<{ question: string }> = {
  spec: { name: 'ask_user', description: 'Ask the user one short question, then wait.', parameters: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] } },
  group: 'core', kind: 'other', readOnly: true, schema: z.object({ question: z.string().min(3).max(300) }),
  async run(_ctx, a) { return { text: 'Waiting for the user.', digest: `Asked: ${a.question}`, pause: { reason: 'ask_user', question: a.question } }; },
};

export const finishTool: ToolDef<Record<string, unknown>> = {
  spec: { name: 'finish', description: 'Finish with the answer (table when comparing). status: success|partial|failed.', parameters: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, table: { type: 'object', properties: { title: { type: 'string' }, columns: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } }, bullets: { type: 'array', items: { type: 'string' } }, status: { type: 'string', enum: ['success', 'partial', 'failed'] } }, required: ['title', 'summary'] } },
  group: 'core', kind: 'other', readOnly: true,
  schema: ResultSchema.omit({ sources: true, verification: true }).extend({ status: z.enum(['success', 'partial', 'failed']).optional() }),
  async run(ctx, a) {
    const r = a as { title: string; summary: string; table?: TaskResult['table']; bullets?: string[]; status?: TaskResult['status'] };
    const result: TaskResult = { title: r.title, summary: r.summary, table: r.table, bullets: r.bullets, status: r.status ?? 'success', sources: ctx.state.sources };
    return { text: 'Finishing.', digest: r.title, finish: { result } };
  },
};

export const pantrySearch: ToolDef<{ query: string; k?: number }> = {
  spec: { name: 'pantry_search', description: "Search the user's Pantry (their own documents). Returns passages with ids; cite them.", parameters: { type: 'object', properties: { query: { type: 'string' }, k: { type: 'number' } }, required: ['query'] } },
  group: 'doc', kind: 'search', readOnly: true, schema: z.object({ query: z.string().min(2), k: z.number().int().min(1).max(10).optional() }),
  async run(ctx, a) {
    const pantry = ctx.deps.pantry; if (!pantry) return { ok: false, text: 'Pantry is off.', digest: 'Pantry is off' };
    const maxAllowed = ctx.deps.model.allowance(ctx.state.routeProfile);
    const r = await pantry.search(a.query, { maxAllowed, force: true, k: a.k ?? 6, window: ctx.deps.model.modelInfo(ctx.state.routeProfile).maxContext });
    if (!r.passages.length) return { text: r.withheld ? `Found ${r.withheld} matching document(s) that stay on this device. A local model is needed to read them.` : 'Nothing in the Pantry matches.', digest: r.withheld ? 'Private docs need a local model' : 'Nothing in Pantry', sensitivity: 'public' };
    const sens = r.passages.reduce<Sensitivity>((acc, p) => maxSensitivity(acc, p.sensitivity), 'public');
    for (const p of r.passages) ctx.addSource({ kind: 'pantry', title: p.doc, docId: p.docId, page: p.page, passageId: p.id });
    ctx.update((s) => ({ ...s, meta: { ...s.meta, stepSensitivity: sens, scratchpadSensitivity: maxSensitivity((s.meta.scratchpadSensitivity as Sensitivity | undefined) ?? 'public', sens) } }));
    const text = r.passages.map((p) => `<passage id="${p.id}" doc="${p.doc}"${p.page ? ` page="${p.page}"` : ''}>\n${p.text}\n</passage>`).join('\n');
    const o = await paged(ctx, `<pantry_passages untrusted="true">\n${text}\n</pantry_passages>`, { tool: 'pantry_search', label: `Pantry: ${r.passages.length} passages`, sensitivity: sens });
    return { ...o, digest: `Used ${r.passages.length} passage${r.passages.length === 1 ? '' : 's'} from Pantry`, sensitivity: sens };
  },
};

export const pantryGet: ToolDef<{ doc: string; from?: number }> = {
  spec: { name: 'pantry_get', description: 'Read a Pantry document by id, a few chunks at a time.', parameters: { type: 'object', properties: { doc: { type: 'string' }, from: { type: 'number' } }, required: ['doc'] } },
  group: 'doc', kind: 'read', readOnly: true, schema: z.object({ doc: z.string(), from: z.number().int().min(0).optional() }),
  async run(ctx, a) {
    const r = await ctx.deps.pantry?.getRange(a.doc, a.from ?? 0, 3);
    if (!r) return { ok: false, text: 'No such document.', digest: 'No such doc' };
    const allowed = ctx.deps.model.allowance(ctx.state.routeProfile);
    const order = { public: 0, personal: 1, 'local-only': 2 } as const;
    if (order[r.sensitivity] > order[allowed]) return { ok: false, text: 'That document stays on this device and needs a local model.', digest: 'Private doc withheld' };
    ctx.addSource({ kind: 'pantry', title: r.title, docId: a.doc });
    return { text: `<pantry_passages untrusted="true">\n${r.text}\n</pantry_passages>${r.next !== undefined ? `\n[next: pantry_get(doc, from=${r.next})]` : ''}`, digest: `Read ${r.title}`, sensitivity: r.sensitivity };
  },
};

export const profileGet: ToolDef<{ fields?: string[] }> = {
  spec: { name: 'profile_get', description: 'Read non-secret profile fields (names only; values you may see are shown).', parameters: { type: 'object', properties: { fields: { type: 'array', items: { type: 'string' } } } } },
  group: 'doc', kind: 'other', readOnly: true, schema: z.object({ fields: z.array(z.string()).max(12).optional() }),
  async run(ctx, a) {
    const pantry = ctx.deps.pantry; if (!pantry) return { ok: false, text: 'Pantry is off.', digest: 'Pantry is off' };
    const allowed = ctx.deps.model.allowance(ctx.state.routeProfile);
    const order = { public: 0, personal: 1, 'local-only': 2 } as const;
    const fields = (await pantry.profile.get()).filter((f) => f.value && (!a.fields?.length || a.fields.includes(f.key)) && order[f.sensitivity] <= order[allowed] && f.key !== 'standing_instructions');
    return { text: fields.length ? fields.map((f) => `${f.key}: ${f.value}`).join('\n') : 'No matching profile fields that this route may see.', digest: `Read ${fields.length} profile field${fields.length === 1 ? '' : 's'}`, sensitivity: fields.reduce<Sensitivity>((acc, f) => maxSensitivity(acc, f.sensitivity), 'public') };
  },
};

export const noteProposeTool: ToolDef<{ text: string }> = {
  spec: { name: 'note_propose', description: 'Propose a durable note about the user ("prefers aisle seats"). The user decides whether to keep it.', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  group: 'doc', kind: 'other', readOnly: true, schema: z.object({ text: z.string().min(3).max(300) }),
  async run(ctx, a) {
    const n = await ctx.deps.pantry?.notes.propose(a.text, ctx.state.id);
    if (!n) return { ok: false, text: 'Pantry is off.', digest: 'Pantry is off' };
    ctx.emit({ type: 'note_proposed', taskId: ctx.state.id, at: ctx.nowMs(), noteId: n.id, text: n.text });
    return { text: 'Proposed. The user will choose whether to keep it.', digest: 'Proposed a note' };
  },
};

export const delegate: ToolDef<{ jobs: { agent: 'reader' | 'researcher' | 'doc'; task: string; url?: string; tab?: string }[] }> = {
  spec: { name: 'delegate', description: 'Give 1–4 jobs to helpers with their own small context. reader: deep-read a page. researcher: look up on one site. doc: answer from Pantry.', parameters: { type: 'object', properties: { jobs: { type: 'array', items: { type: 'object', properties: { agent: { type: 'string', enum: ['reader', 'researcher', 'doc'] }, task: { type: 'string' }, url: { type: 'string' }, tab: { type: 'string' } }, required: ['agent', 'task'] } } }, required: ['jobs'] } },
  group: 'core', kind: 'search', readOnly: false,
  schema: z.object({ jobs: z.array(z.object({ agent: z.enum(['reader', 'researcher', 'doc']), task: z.string().min(3).max(500), url: z.string().optional(), tab: z.string().optional() })).min(1).max(4) }),
  async run(ctx: ToolContext, a) { const { runDelegation } = await import('../subagents'); return runDelegation(ctx, a.jobs); },
};

export { estimateTokens };
