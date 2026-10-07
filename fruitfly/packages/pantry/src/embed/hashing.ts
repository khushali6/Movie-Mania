import { type Embedder, l2normalize } from './embedder';

const STOP = new Set('the a an and or of to in on for with is are was were be been at by from as it its this that these those i you he she we they my our your their me us him her them not no but if then than so do does did has have had will would can could should may might just also very'.split(' '));

function fnv(s: string, seed = 2166136261): number { let h = seed >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/**
 * "Basic" on-device embedder: signed feature hashing over stemmed unigrams, bigrams and character trigrams.
 * No download, no network, deterministic, multilingual-tolerant. Lexical rather than truly semantic, which is why
 * retrieval always fuses it with BM25; the "Smart" path is an Ollama / model-pack embedder behind the same interface.
 */
export class HashingEmbedder implements Embedder {
  readonly id: string;
  readonly locality = 'device' as const;
  constructor(readonly dim = 256) { this.id = `local-hash-v1-${dim}`; }

  private features(text: string): Map<string, number> {
    const f = new Map<string, number>();
    const add = (k: string, w: number) => f.set(k, (f.get(k) ?? 0) + w);
    const words = (text.toLowerCase().match(/[\p{L}\p{N}]+(?:[.'][\p{L}\p{N}]+)*/gu) ?? []).map((w) => w.replace(/[.']/g, ''));
    let prev: string | undefined;
    for (const raw of words) {
      const w = stem(raw);
      const stop = STOP.has(raw);
      add(`u:${w}`, stop ? 0.15 : 1);
      if (prev && !stop) add(`b:${prev}_${w}`, 0.6);
      if (w.length >= 4 && !stop) { const p = `^${w}$`; for (let i = 0; i + 3 <= p.length; i++) add(`c:${p.slice(i, i + 3)}`, 0.12); }
      prev = stop ? undefined : w;
    }
    return f;
  }

  embedOne(text: string): Float32Array {
    const v = new Float32Array(this.dim);
    for (const [k, tf] of this.features(text)) {
      const h = fnv(k); const idx = h % this.dim; const sign = (fnv(k, 977) & 1) ? 1 : -1;
      v[idx]! += sign * (1 + Math.log(tf));
    }
    return l2normalize(v);
  }

  async embed(texts: string[], opts: { onProgress?: (d: number, t: number) => void } = {}): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i++) {
      out.push(this.embedOne(texts[i]!));
      // yield to the UI every few chunks so indexing never drops frames
      if (i % 24 === 23) { opts.onProgress?.(i + 1, texts.length); await new Promise((r) => setTimeout(r, 0)); }
    }
    opts.onProgress?.(texts.length, texts.length);
    return out;
  }
}
