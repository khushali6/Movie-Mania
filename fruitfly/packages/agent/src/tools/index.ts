import type { TaskState } from '@fruitfly/core';
import type { ToolDef, ToolGroup } from '../types';
import { back, click, closeTab, findElement, navigate, openTab, readPage, scroll, selectOption, switchTab, typeText, wait } from './browser-tools';
import { askUser, delegate, finishTool, noteProposeTool, pantryGet, pantrySearch, profileGet, recall, scratchpadUpdate } from './agent-tools';

export const ALL_TOOLS: ToolDef<never>[] = [
  readPage, findElement, click, scroll, navigate, back, wait, openTab, switchTab, closeTab, scratchpadUpdate, recall, delegate, askUser, finishTool,
  typeText, selectOption, pantrySearch, pantryGet, profileGet, noteProposeTool,
] as unknown as ToolDef<never>[];

export const TOOL_BY_NAME = new Map<string, ToolDef<never>>(ALL_TOOLS.map((t) => [t.spec.name, t]));

/** Lazy tool groups: form tools only when a form is on the page, doc tools only when Pantry is on and non-empty. */
export function activeGroups(state: TaskState, o: { pantryEnabled: boolean; subagents: boolean }): Set<ToolGroup> {
  const g = new Set<ToolGroup>(['core']);
  if (state.meta.formDetected === true) g.add('form');
  if (o.pantryEnabled) g.add('doc');
  return g;
}

export function activeTools(state: TaskState, o: { pantryEnabled: boolean; subagents: boolean; only?: string[] }): ToolDef<never>[] {
  const groups = activeGroups(state, o);
  return ALL_TOOLS.filter((t) => groups.has(t.group) && (o.subagents || t.spec.name !== 'delegate') && (!o.only || o.only.includes(t.spec.name)));
}
