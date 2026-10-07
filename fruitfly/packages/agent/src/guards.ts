import { stableStringify, contentHash } from '@fruitfly/core';

/** Loop guard: identical actions repeated → warn, then stop. */
export class LoopGuard {
  private seen = new Map<string, number>();
  private order: string[] = [];
  constructor(private warnAt = 3, private stopAt = 5) {}
  key(tool: string, args: Record<string, unknown>, url?: string): string { return contentHash(`${tool}|${url ?? ''}|${stableStringify(args)}`); }
  hit(tool: string, args: Record<string, unknown>, url?: string): 'ok' | 'warn' | 'stop' {
    const k = this.key(tool, args, url);
    const n = (this.seen.get(k) ?? 0) + 1; this.seen.set(k, n); this.order.push(k);
    // an A-B-A-B ping-pong also counts as a loop
    const o = this.order; const L = o.length;
    const pingPong = L >= 6 && o[L - 1] === o[L - 3] && o[L - 3] === o[L - 5] && o[L - 2] === o[L - 4] && o[L - 4] === o[L - 6] && o[L - 1] !== o[L - 2];
    if (n >= this.stopAt || (pingPong && n >= this.warnAt + 1)) return 'stop';
    if (n >= this.warnAt || pingPong) return 'warn';
    return 'ok';
  }
  /** a read-only repeat after the page changed is fine; callers reset when the URL or content hash changes */
  reset(): void { this.seen.clear(); this.order = []; }
  snapshot(): { seen: [string, number][]; order: string[] } { return { seen: [...this.seen], order: this.order.slice(-12) }; }
  static from(s?: { seen: [string, number][]; order: string[] }): LoopGuard { const g = new LoopGuard(); if (s) { g.seen = new Map(s.seen); g.order = [...s.order]; } return g; }
}
