import MiniSearch from 'minisearch';
import type { Sensitivity } from '@fruitfly/core';
import { type Embedder, dequantize, dotQ, cosine } from './embed/embedder';
import type { Chunk, PantryDoc, Passage } from './types';
import { expandQuery } from './synonyms';

export interface SearchOpts { k?: number; docIds?: string[]; allowed?: (s: Sensitivity) => boolean; mmr?: boolean; pool?: number }
export interface SearchResult { passages: Passage[]; withheld: number; ms: number }

const RRF_K = 60;
const STOP = new Set('the a an and or of to in on for with is are was were be been being at by from as it its this that these those i you he she we they my our your their me us him her them not no do does did has have had will would can could should may might what which who whom how many much when where why there here any all some about into than then so if also just very give gave get got need needs per'.split(' '));
/** lexical evidence is trusted more than the weak on-device vectors; smarter embedders can raise this */
export const FUSION_WEIGHTS = { lexical: 1, vector: 0.55 };

/** BM25 (MiniSearch) ∪ brute-force int8 cosine → reciprocal-rank fusion → MMR for diversity. */
export class HybridIndex {
  private bm25 = this.makeBm25();
  private chunks = new Map<string, Chunk>();
  private byDoc = new Map<string, string[]>();
  private docs = new Map<string, PantryDoc>();
  constructor(private embedder: Embedder) {}

  private makeBm25(): MiniSearch<{ id: string; text: string; heading: string; title: string }> {
    return new MiniSearch({ fields: ['text', 'heading', 'title'], storeFields: [], idField: 'id', searchOptions: { boost: { heading: 1.6, title: 1.3 }, prefix: true, fuzzy: 0.15, combineWith: 'OR' }, tokenize: (s) => s.toLowerCase().match(/[\p{L}\p{N}]+(?:[.,'][\p{N}]+)*/gu) ?? [], processTerm: (t) => { const x = t.replace(/[.,']/g, ''); return STOP.has(x) ? null : x; } });
  }

  get size(): number { return this.chunks.size; }
  setEmbedder(e: Embedder): void { this.embedder = e; }

  clear(): void { this.bm25 = this.makeBm25(); this.chunks.clear(); this.byDoc.clear(); this.docs.clear(); }

  upsertDoc(doc: PantryDoc): void { this.docs.set(doc.id, doc); }

  add(doc: PantryDoc, chunks: Chunk[]): void {
    this.docs.set(doc.id, doc);
    this.removeChunks(doc.id);
    const ids: string[] = [];
    this.bm25.addAll(chunks.map((c) => ({ id: c.id, text: c.text, heading: c.headingPath.join(' '), title: doc.title })));
    for (const c of chunks) { this.chunks.set(c.id, c); ids.push(c.id); }
    this.byDoc.set(doc.id, ids);
  }

  private removeChunks(docId: string): void {
    for (const id of this.byDoc.get(docId) ?? []) { try { this.bm25.discard(id); } catch { /* already gone */ } this.chunks.delete(id); }
    this.byDoc.delete(docId);
  }
  remove(docId: string): void { this.removeChunks(docId); this.docs.delete(docId); }

  async search(query: string, o: SearchOpts = {}): Promise<SearchResult> {
    const t0 = performance.now();
    const original = query; query = expandQuery(query);
    const k = o.k ?? 6; const pool = o.pool ?? 40;
    const eligible = (c: Chunk): boolean => {
      const d = this.docs.get(c.docId);
      if (!d || d.deleted || d.status !== 'ready') return false;
      if (o.docIds && !o.docIds.includes(c.docId)) return false;
      return true;
    };
    const allowedDoc = (c: Chunk): boolean => !o.allowed || o.allowed(this.docs.get(c.docId)!.sensitivity);

    // lexical
    const filter = (r: { id: unknown }) => { const c = this.chunks.get(r.id as string); return !!c && eligible(c); };
    // exact BM25 first (fast); prefix + fuzzy matching only when exact search finds too little (typos, partial words)
    let hits = this.bm25.search(query, { filter, prefix: false, fuzzy: false });
    if (hits.length < 3) hits = this.bm25.search(query, { filter, prefix: true, fuzzy: 0.15, maxFuzzy: 1 });
    const lex = hits.slice(0, pool).map((r) => r.id as string);
    // vector
    const [qv] = await this.embedder.embed([original + ' ' + query]);
    const scored: { id: string; s: number }[] = [];
    if (qv) for (const c of this.chunks.values()) { if (!eligible(c)) continue; scored.push({ id: c.id, s: dotQ(qv, c.vec, c.scale) }); }
    scored.sort((a, b) => b.s - a.s);
    const vec = scored.slice(0, pool).filter((x) => x.s > 0.02).map((x) => x.id);

    const fused = new Map<string, number>();
    lex.forEach((id, r) => fused.set(id, (fused.get(id) ?? 0) + FUSION_WEIGHTS.lexical / (RRF_K + r + 1)));
    vec.forEach((id, r) => fused.set(id, (fused.get(id) ?? 0) + FUSION_WEIGHTS.vector / (RRF_K + r + 1)));
    let ranked = [...fused.entries()].sort((a, b) => b[1] - a[1]).map(([id, s]) => ({ id, s }));

    // sensitivity gate: count what we had to withhold so the agent can say so
    const gated = ranked.filter((r) => allowedDoc(this.chunks.get(r.id)!));
    const withheldDocs = new Set(ranked.filter((r) => !allowedDoc(this.chunks.get(r.id)!)).slice(0, 20).map((r) => this.chunks.get(r.id)!.docId));
    ranked = gated;

    let chosen = ranked.slice(0, k);
    if (o.mmr !== false && ranked.length > k) chosen = this.mmr(ranked.slice(0, Math.max(k * 4, 24)), k, qv);
    const maxS = chosen[0]?.s ?? 1;
    const passages: Passage[] = chosen.map((r) => {
      const c = this.chunks.get(r.id)!; const d = this.docs.get(c.docId)!;
      return { id: c.id, docId: c.docId, doc: d.title, page: c.page, headingPath: c.headingPath, text: c.text, sensitivity: d.sensitivity, score: r.s / (maxS || 1) };
    });
    return { passages, withheld: withheldDocs.size, ms: performance.now() - t0 };
  }

  private mmr(cands: { id: string; s: number }[], k: number, _q?: Float32Array, lambda = 0.72): { id: string; s: number }[] {
    const vecs = new Map(cands.map((c) => { const ch = this.chunks.get(c.id)!; return [c.id, dequantize(ch.vec, ch.scale)] as const; }));
    const picked: { id: string; s: number }[] = []; const rest = [...cands];
    const top = cands[0]?.s ?? 1;
    while (picked.length < k && rest.length) {
      let best = -1; let bestVal = -Infinity;
      rest.forEach((c, i) => {
        const rel = c.s / top;
        const red = picked.length ? Math.max(...picked.map((p) => cosine(vecs.get(c.id)!, vecs.get(p.id)!))) : 0;
        const val = lambda * rel - (1 - lambda) * red;
        if (val > bestVal) { bestVal = val; best = i; }
      });
      picked.push(rest.splice(best, 1)[0]!);
    }
    return picked;
  }

  chunksOf(docId: string): Chunk[] { return (this.byDoc.get(docId) ?? []).map((id) => this.chunks.get(id)!).filter(Boolean).sort((a, b) => a.ord - b.ord); }
}
