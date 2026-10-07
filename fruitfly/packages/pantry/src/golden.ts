import { Pantry } from './pantry';
import { expandQuery } from './synonyms';
import { GOLDEN_DOCS, GOLDEN_QUESTIONS } from './golden-corpus';
import type { Passage } from './types';

export { GOLDEN_DOCS, GOLDEN_QUESTIONS };

const STOPWORDS = new Set('what is my the a an of to in on for with how much many do does did when where which who are was were i me we our your can be it at by from and or this that there any have has had'.split(' '));
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ');
const terms = (q: string): string[] => (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 2 && !STOPWORDS.has(t));

/** Does the retrieved evidence actually address the question? "Not in your documents" instead of inventing. */
export function hasEvidence(question: string, passages: Passage[], threshold = 0.75): boolean {
  const qt = terms(question); if (!qt.length || !passages.length) return false;
  const stem = (t: string) => t.replace(/(ing|ed|es|s)$/, '');
  const have = new Set((norm(passages.slice(0, 3).map((p) => `${p.doc} ${p.headingPath.join(' ')} ${p.text}`).join(' ')).match(/[\p{L}\p{N}]+/gu) ?? []).map(stem));
  const hit = qt.filter((t) => [t, ...expandQuery(t, 8).split(' ')].some((x) => have.has(stem(x)))).length;
  return hit / qt.length >= threshold;
}

/** The sentence from the retrieved passages that best matches the question (what a grounded answer would quote). */
export function bestSentence(question: string, passages: Passage[]): string {
  const qt = new Set(terms(question).map((t) => t.replace(/(ing|ed|es|s)$/, '')));
  let best = ''; let bestScore = -1;
  for (const p of passages) for (const s of p.text.split(/(?<=[.!?])\s+|\n/)) { const sc = terms(s).filter((t) => qt.has(t.replace(/(ing|ed|es|s)$/, ''))).length; if (sc > bestScore) { best = s; bestScore = sc; } }
  return best;
}

export interface GoldenReport { recallAt6: number; mrr: number; grounding: number; refusalWhenAbsent: number; questions: number; failures: { q: string; why: string }[]; p95Ms: number }

export async function loadGolden(p: Pantry): Promise<void> {
  const existing = new Set((await p.list()).map((d) => d.title));
  for (const d of GOLDEN_DOCS) if (!existing.has(d.title)) await p.addText(d.title, d.text, { sensitivity: 'personal', kind: d.kind });
}

export async function runGolden(p: Pantry, k = 6): Promise<GoldenReport> {
  await loadGolden(p);
  let hit = 0, rr = 0, grounded = 0, present = 0, absentOk = 0, absent = 0; const failures: { q: string; why: string }[] = []; const times: number[] = [];
  for (const g of GOLDEN_QUESTIONS) {
    const r = await p.search(g.q, { maxAllowed: 'local-only', force: true, k });
    times.push(r.ms);
    if (g.absent) { absent++; if (!hasEvidence(g.q, r.passages)) absentOk++; else failures.push({ q: g.q, why: 'answered although absent' }); continue; }
    present++;
    const idx = r.passages.findIndex((x) => norm(x.text).includes(norm(g.expect!)) );
    if (idx >= 0) { hit++; rr += 1 / (idx + 1); } else failures.push({ q: g.q, why: `missing "${g.expect}"` });
    if (norm(bestSentence(g.q, r.passages)).includes(norm(g.expect!)) || (idx >= 0 && hasEvidence(g.q, r.passages))) grounded++;
  }
  times.sort((a, b) => a - b);
  return { recallAt6: hit / present, mrr: rr / present, grounding: grounded / present, refusalWhenAbsent: absentOk / absent, questions: GOLDEN_QUESTIONS.length, failures, p95Ms: times[Math.floor(times.length * 0.95)] ?? 0 };
}
