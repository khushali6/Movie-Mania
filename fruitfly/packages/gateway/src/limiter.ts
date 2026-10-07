import { FruitflyError } from '@fruitfly/core';
import { PRIORITY_RANK, type Limits, type Priority } from './types';

export class TokenBucket {
  tokens: number; updated: number;
  constructor(public capacity: number, public refillPerSec: number, now: number, start?: number) { this.tokens = start ?? capacity; this.updated = now; }
  refill(now: number): void { const dt = Math.max(0, (now - this.updated) / 1000); this.tokens = Math.min(this.capacity, this.tokens + dt * this.refillPerSec); this.updated = now; }
  canTake(n: number, now: number): boolean { this.refill(now); return this.tokens >= Math.min(n, this.capacity); }
  take(n: number, now: number): void { this.refill(now); this.tokens -= Math.min(n, this.capacity); }
  /** ms until n tokens are available */
  waitMs(n: number, now: number): number { this.refill(now); const need = Math.min(n, this.capacity) - this.tokens; return need <= 0 ? 0 : Math.ceil((need / this.refillPerSec) * 1000); }
}

export interface LimiterStore { load(): Record<string, { rpm: number; tpm: number; t: number }> | undefined; save(s: Record<string, { rpm: number; tpm: number; t: number }>): void }

interface Waiter { id: number; route: string; tokens: number; priority: number; owner: string; resolve: () => void; reject: (e: unknown) => void; signal?: AbortSignal; enqueued: number; onAbort?: () => void }

export interface LimiterEvents { onWait?(route: string, untilMs: number, position: number): void; onRelease?(route: string): void }

/** Per-route RPM/TPM buckets, persisted; a priority queue with fair-share between owners of equal priority. */
export class RateLimiter {
  private buckets = new Map<string, { rpm: TokenBucket; tpm: TokenBucket; limits: Limits }>();
  private queue: Waiter[] = [];
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastGrant = new Map<string, number>();
  private granted = 0;

  constructor(private now: () => number = Date.now, private store?: LimiterStore, private events: LimiterEvents = {}) {}

  register(routeId: string, limits: Limits): void {
    const t = this.now();
    const saved = this.store?.load()?.[routeId];
    const rpm = new TokenBucket(limits.rpm, limits.rpm / 60, t, saved ? Math.min(limits.rpm, saved.rpm + ((t - saved.t) / 1000) * (limits.rpm / 60)) : undefined);
    const tpm = new TokenBucket(limits.tpm, limits.tpm / 60, t, saved ? Math.min(limits.tpm, saved.tpm + ((t - saved.t) / 1000) * (limits.tpm / 60)) : undefined);
    this.buckets.set(routeId, { rpm, tpm, limits });
  }
  private persist(): void {
    if (!this.store) return;
    const t = this.now(); const out: Record<string, { rpm: number; tpm: number; t: number }> = {};
    for (const [id, b] of this.buckets) { b.rpm.refill(t); b.tpm.refill(t); out[id] = { rpm: b.rpm.tokens, tpm: b.tpm.tokens, t }; }
    this.store.save(out);
  }

  /** Correct the TPM bucket once real usage is known (positive = used more than estimated). */
  adjust(routeId: string, deltaTokens: number): void { const b = this.buckets.get(routeId); if (b) { b.tpm.tokens = Math.min(b.tpm.capacity, b.tpm.tokens - deltaTokens); this.persist(); } }

  /** How many parallel subagents this route can sustain: f(available RPM). */
  concurrency(routeId: string): number { const b = this.buckets.get(routeId); if (!b) return 1; b.rpm.refill(this.now()); return Math.max(1, Math.min(4, Math.floor(b.rpm.tokens / 6) || 1)); }
  get queueDepth(): number { return this.queue.length; }

  acquire(routeId: string, tokens: number, priority: Priority = 'planner', owner = 'main', signal?: AbortSignal): Promise<void> {
    if (!this.buckets.has(routeId)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new FruitflyError('aborted', 'Stopped.'));
      const w: Waiter = { id: ++this.seq, route: routeId, tokens, priority: PRIORITY_RANK[priority], owner, resolve, reject, signal, enqueued: this.now() };
      if (signal) { w.onAbort = () => { this.queue = this.queue.filter((q) => q !== w); reject(new FruitflyError('aborted', 'Stopped.')); this.schedule(); }; signal.addEventListener('abort', w.onAbort, { once: true }); }
      this.queue.push(w);
      this.pump();
    });
  }

  private order(): Waiter[] {
    return [...this.queue].sort((a, b) => a.priority - b.priority || (this.lastGrant.get(a.owner) ?? -1) - (this.lastGrant.get(b.owner) ?? -1) || a.id - b.id);
  }

  private pump(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const t = this.now();
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const w of this.order()) {
        const b = this.buckets.get(w.route)!;
        if (b.rpm.canTake(1, t) && b.tpm.canTake(w.tokens, t)) {
          b.rpm.take(1, t); b.tpm.take(w.tokens, t);
          this.queue = this.queue.filter((q) => q !== w);
          if (w.signal && w.onAbort) w.signal.removeEventListener('abort', w.onAbort);
          this.lastGrant.set(w.owner, ++this.granted);
          this.events.onRelease?.(w.route);
          w.resolve(); progressed = true; break;
        }
        // strict priority within a route: lower-priority waiters on the *same* route must not leapfrog
      }
    }
    this.persist();
    this.schedule();
  }

  private schedule(): void {
    if (!this.queue.length) return;
    const t = this.now(); let soonest = Infinity;
    this.order().forEach((w, i) => {
      const b = this.buckets.get(w.route)!;
      const wait = Math.max(b.rpm.waitMs(1, t), b.tpm.waitMs(w.tokens, t));
      soonest = Math.min(soonest, wait);
      this.events.onWait?.(w.route, wait, i + 1);
    });
    this.timer = setTimeout(() => this.pump(), Math.max(10, Math.min(soonest, 60_000)));
  }

  dispose(): void { if (this.timer) clearTimeout(this.timer); this.queue.forEach((w) => w.reject(new FruitflyError('aborted', 'Stopped.'))); this.queue = []; }
}
