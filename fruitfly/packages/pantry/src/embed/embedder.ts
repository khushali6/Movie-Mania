export interface Embedder {
  /** stored with every vector; changing it triggers a re-embed */
  id: string;
  dim: number;
  /** 'local' embedders never send text anywhere */
  locality: 'device' | 'local-server' | 'remote';
  embed(texts: string[], opts?: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void }): Promise<Float32Array[]>;
}

export function l2normalize(v: Float32Array): Float32Array {
  let n = 0; for (let i = 0; i < v.length; i++) n += v[i]! * v[i]!;
  n = Math.sqrt(n) || 1; for (let i = 0; i < v.length; i++) v[i]! /= n;
  return v;
}

export function quantize(v: Float32Array): { vec: Int8Array; scale: number } {
  let max = 0; for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i]!));
  const scale = max / 127 || 1;
  const q = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) q[i] = Math.round(v[i]! / scale);
  return { vec: q, scale };
}
export function dequantize(vec: Int8Array, scale: number): Float32Array {
  const out = new Float32Array(vec.length); for (let i = 0; i < vec.length; i++) out[i] = vec[i]! * scale; return out;
}
export function dotQ(q: Float32Array, vec: Int8Array, scale: number): number {
  let s = 0; for (let i = 0; i < q.length; i++) s += q[i]! * vec[i]!; return s * scale;
}
export function cosine(a: Float32Array, b: Float32Array): number { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!; return s; }

/** Wrap any async vector source (Ollama /api/embed through the router, a gateway, a model pack). */
export class FunctionEmbedder implements Embedder {
  constructor(public id: string, public dim: number, public locality: Embedder['locality'], private fn: (texts: string[], signal?: AbortSignal) => Promise<number[][]>, private batch = 16) {}
  async embed(texts: string[], opts: { signal?: AbortSignal; onProgress?: (d: number, t: number) => void } = {}): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += this.batch) {
      const vs = await this.fn(texts.slice(i, i + this.batch), opts.signal);
      for (const v of vs) out.push(l2normalize(Float32Array.from(v)));
      opts.onProgress?.(Math.min(texts.length, i + this.batch), texts.length);
    }
    return out;
  }
}
