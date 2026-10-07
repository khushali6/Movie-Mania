import { estimateTokens } from '@fruitfly/core';
import type { ParsedDoc } from './types';

export interface ChunkDraft { ord: number; headingPath: string[]; page?: number; text: string; /** text with title + heading prefix, used for embedding and BM25 */ indexText: string; tokens: number }
export interface ChunkOpts { target?: number; max?: number; overlap?: number }

/** Sentence-ish split that keeps list items and table rows intact. */
function units(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    const lines = para.split('\n');
    if (lines.length > 1 && lines.every((l) => /^\s*([-*•]|\d+[.)]|[A-Za-z][\w ]{0,30}:)/.test(l) || l.length < 160)) { for (const l of lines) if (l.trim()) out.push(l.trim()); continue; }
    const sentences = para.replace(/\s+/g, ' ').match(/[^.!?।]+[.!?।]+["')\]]*\s*|[^.!?।]+$/g) ?? [para];
    for (const s of sentences) if (s.trim()) out.push(s.trim());
  }
  return out;
}

/** Structure-aware chunking: ~300–500 tokens with ~50 overlap, each prefixed with document title + heading path. */
export function chunkDocument(doc: ParsedDoc, opts: ChunkOpts = {}): ChunkDraft[] {
  const target = opts.target ?? 380, max = opts.max ?? 500, overlap = opts.overlap ?? 50;
  const drafts: ChunkDraft[] = []; let ord = 0;
  for (const block of doc.blocks) {
    const prefix = [doc.title, ...block.headingPath].filter(Boolean).join(' › ');
    const us = units(block.text);
    let cur: string[] = []; let curTok = 0;
    const emit = () => {
      if (!cur.length) return;
      const text = cur.join(' ').replace(/ \n /g, '\n');
      drafts.push({ ord: ord++, headingPath: block.headingPath, page: block.page, text, indexText: `${prefix}\n${text}`, tokens: estimateTokens(text) });
      // overlap: carry trailing units worth ~overlap tokens
      const keep: string[] = []; let t = 0;
      for (let i = cur.length - 1; i >= 0 && t < overlap; i--) { keep.unshift(cur[i]!); t += estimateTokens(cur[i]!); }
      cur = t < target * 0.6 ? keep : []; curTok = cur.reduce((a, u) => a + estimateTokens(u), 0);
    };
    for (const u of us) {
      let ut = estimateTokens(u);
      if (ut > max) { // very long unit: hard split on words
        const words = u.split(' '); let part: string[] = []; let pt = 0;
        for (const w of words) { const wt = estimateTokens(w); if (pt + wt > target && part.length) { cur.push(part.join(' ')); curTok += pt; emit(); part = []; pt = 0; } part.push(w); pt += wt; }
        if (part.length) { cur.push(part.join(' ')); curTok += pt; }
        continue;
      }
      if (curTok + ut > max || (curTok >= target && ut > 0)) emit();
      cur.push(u); curTok += ut; ut = 0;
    }
    if (cur.length) { const lastEmitted = drafts[drafts.length - 1]; const joined = cur.join(' '); if (!lastEmitted || !lastEmitted.text.endsWith(joined)) emit(); cur = []; }
  }
  return drafts;
}
