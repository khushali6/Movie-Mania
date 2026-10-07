import { contentHash, stableStringify } from '@fruitfly/core';
import type { CompletionRequest, CompletionResponse } from './types';

/** Exact-match response cache for deterministic helper calls. Memory only; anything touching local-only is never cached. */
export class ResponseCache {
  private map = new Map<string, CompletionResponse>();
  constructor(private max = 200) {}
  static cacheable(req: CompletionRequest): boolean {
    if (!(req.purpose === 'summarize' || req.purpose === 'intent' || req.purpose === 'enrich')) return false;
    if (req.tools?.length) return false;
    return !req.messages.some((m) => m.sensitivity === 'local-only');
  }
  key(req: CompletionRequest, profile: string): string {
    return contentHash(stableStringify({ p: profile, m: req.messages.map((m) => [m.role, m.content]), j: req.json, t: req.temperature ?? 0 }));
  }
  get(k: string): CompletionResponse | undefined { return this.map.get(k); }
  set(k: string, r: CompletionResponse): void { this.map.set(k, r); if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string); }
  purge(): void { this.map.clear(); }
  get size(): number { return this.map.size; }
}
