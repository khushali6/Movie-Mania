import { estimateTokens, sensitivityRank, type Sensitivity } from '@fruitfly/core';
import type { HybridIndex } from './index-hybrid';
import type { PantryDoc, Passage } from './types';

export type RetrievalMode = 'none' | 'stuff' | 'retrieve';
export interface RetrievalPlan { mode: RetrievalMode; reason: string; docIds: string[] }
export interface RetrievalResult { plan: RetrievalPlan; passages: Passage[]; withheld: number; tokens: number; ms: number }

const PERSONAL_CUES = /\b(my|mine|our|ours|i|we)\b|according to|in (the|my) (doc|document|file|pdf|lease|invoice|contract|notes?)|\b(lease|invoice|receipt|policy|agreement|statement|itinerary|booking|resume|cv|passport)\b/i;
const WEB_CUES = /\b(cheapest|price|buy|flight|hotel|search|compare|reviews?|news|weather|near me|open now)\b/i;

/** Cheap intent gate: never retrieve if the question does not need personal data. */
export function needsPersonalData(question: string, docs: PantryDoc[]): { needed: boolean; reason: string } {
  if (!docs.length) return { needed: false, reason: 'Pantry is empty' };
  const q = question.toLowerCase();
  const titleHit = docs.find((d) => d.title.length > 3 && q.includes(d.title.toLowerCase().replace(/\.[a-z0-9]+$/, '')));
  if (titleHit) return { needed: true, reason: `mentions ${titleHit.title}` };
  if (PERSONAL_CUES.test(question)) return { needed: true, reason: 'refers to your own material' };
  if (WEB_CUES.test(question) && !/\b(my|our)\b/i.test(question)) return { needed: false, reason: 'a web question' };
  return { needed: false, reason: 'no sign it needs your documents' };
}

export interface PlanInput {
  question: string;
  docs: PantryDoc[];
  /** model context window in tokens; unknown → conservative 16k */
  window?: number;
  /** docs the user pinned/selected for this task */
  selected?: string[];
  /** highest sensitivity the active route may see */
  maxAllowed: Sensitivity;
  force?: boolean;
}

export class RetrievalPlanner {
  constructor(private index: HybridIndex) {}

  plan(inp: PlanInput): RetrievalPlan {
    const window = inp.window && inp.window > 0 ? inp.window : 16_000;
    const ready = inp.docs.filter((d) => d.status === 'ready' && !d.deleted);
    const pool = inp.selected?.length ? ready.filter((d) => inp.selected!.includes(d.id)) : ready;
    const gate = inp.force || inp.selected?.length ? { needed: true, reason: 'selected by you' } : needsPersonalData(inp.question, ready);
    if (!gate.needed) return { mode: 'none', reason: gate.reason, docIds: [] };
    const allowed = pool.filter((d) => sensitivityRank(d.sensitivity) <= sensitivityRank(inp.maxAllowed));
    const total = allowed.reduce((a, d) => a + d.tokens, 0);
    // Stuff when the selected docs fit in ≤ 20% of the window, otherwise retrieve.
    if (inp.selected?.length && total > 0 && total <= window * 0.2) return { mode: 'stuff', reason: `selected docs fit in ${Math.round((total / window) * 100)}% of the window`, docIds: allowed.map((d) => d.id) };
    return { mode: 'retrieve', reason: gate.reason, docIds: (inp.selected?.length ? allowed : pool).map((d) => d.id) };
  }

  async run(inp: PlanInput & { k?: number; budgetTokens?: number }): Promise<RetrievalResult> {
    const t0 = performance.now();
    const plan = this.plan(inp);
    const allowedFn = (s: Sensitivity) => sensitivityRank(s) <= sensitivityRank(inp.maxAllowed);
    if (plan.mode === 'none') return { plan, passages: [], withheld: 0, tokens: 0, ms: performance.now() - t0 };
    const budget = inp.budgetTokens ?? Math.floor((inp.window ?? 16_000) * 0.2);
    let passages: Passage[] = []; let withheld = 0;
    if (plan.mode === 'stuff') {
      for (const id of plan.docIds) for (const c of this.index.chunksOf(id)) {
        const d = inp.docs.find((x) => x.id === id)!;
        passages.push({ id: c.id, docId: id, doc: d.title, page: c.page, headingPath: c.headingPath, text: c.text, sensitivity: d.sensitivity, score: 1 });
      }
    } else {
      const r = await this.index.search(inp.question, { k: inp.k ?? 6, docIds: plan.docIds.length ? plan.docIds : undefined, allowed: allowedFn });
      passages = r.passages; withheld = r.withheld;
      // docs that exist but are above the route's allowance: tell the agent so it can say "that one stays on this device"
      if (!withheld) {
        const blocked = inp.docs.filter((d) => d.status === 'ready' && !allowedFn(d.sensitivity));
        withheld = blocked.length && /\b(my|our)\b/i.test(inp.question) ? blocked.length : 0;
      }
    }
    let used = 0; const kept: Passage[] = [];
    for (const p of passages) { const t = estimateTokens(p.text) + 14; if (used + t > budget) break; kept.push(p); used += t; }
    return { plan, passages: kept, withheld, tokens: used, ms: performance.now() - t0 };
  }
}
