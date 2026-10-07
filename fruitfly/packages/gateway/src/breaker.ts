import type { ErrorCode } from '@fruitfly/core';

export type HealthState = 'healthy' | 'cooling' | 'limited' | 'down' | 'auth';
export interface RouteHealth { routeId: string; state: HealthState; openedAt?: number; nextProbeAt?: number; p50ms: number; lastError?: string }

interface Rec { failures: number[]; state: 'closed' | 'open' | 'half'; openedAt: number; nextProbeAt: number; cooldownIdx: number; reason?: ErrorCode; coolUntil: number; lat: number[]; lastError?: string; authBroken?: boolean }

export interface BreakerStore { load(): Record<string, Rec> | undefined; save(s: Record<string, Rec>): void }

export const COOLDOWNS_MS = [30_000, 120_000, 600_000];

/** Per-route circuit breaker: open after 3 failures in 60s; half-open probe after 30s → 2min → 10min. State is persisted. */
export class CircuitBreakers {
  private recs: Record<string, Rec>;
  constructor(private store?: BreakerStore, private now: () => number = Date.now, private opts = { threshold: 3, windowMs: 60_000 }) {
    this.recs = store?.load() ?? {};
  }
  private rec(id: string): Rec { return (this.recs[id] ??= { failures: [], state: 'closed', openedAt: 0, nextProbeAt: 0, cooldownIdx: 0, coolUntil: 0, lat: [] }); }
  private persist(): void { this.store?.save(this.recs); }

  allow(id: string): boolean {
    const r = this.rec(id); const t = this.now();
    if (r.authBroken) return false;
    if (t < r.coolUntil) return false;
    if (r.state === 'closed') return true;
    if (r.state === 'open') { if (t >= r.nextProbeAt) { r.state = 'half'; this.persist(); return true; } return false; }
    return true; // half-open: one probe in flight is allowed; the router serialises per route
  }

  /** A short cooldown after a 429: honours Retry-After, does not count towards opening yet. */
  cool(id: string, ms: number): void { const r = this.rec(id); r.coolUntil = this.now() + ms; r.reason = 'rate_limited'; this.persist(); }

  success(id: string, latencyMs = 0): void {
    const r = this.rec(id);
    r.failures = []; r.state = 'closed'; r.cooldownIdx = 0; r.coolUntil = 0; r.reason = undefined; r.lastError = undefined;
    if (latencyMs) { r.lat.push(latencyMs); if (r.lat.length > 25) r.lat.shift(); }
    this.persist();
  }

  failure(id: string, code: ErrorCode, message?: string): void {
    const r = this.rec(id); const t = this.now();
    r.lastError = message ?? code; r.reason = code;
    if (code === 'auth') { r.authBroken = true; r.state = 'open'; r.openedAt = t; this.persist(); return; }
    r.failures = r.failures.filter((x) => t - x <= this.opts.windowMs); r.failures.push(t);
    if (r.state === 'half' || r.failures.length >= this.opts.threshold) {
      r.state = 'open'; r.openedAt = t;
      const cd = COOLDOWNS_MS[Math.min(r.cooldownIdx, COOLDOWNS_MS.length - 1)] as number;
      r.nextProbeAt = t + cd; r.cooldownIdx = Math.min(r.cooldownIdx + 1, COOLDOWNS_MS.length - 1);
      r.failures = [];
    }
    this.persist();
  }

  /** The user fixed the key / reconnected. */
  reset(id: string): void { delete this.recs[id]; this.persist(); }

  health(id: string): RouteHealth {
    const r = this.rec(id); const t = this.now();
    let state: HealthState = 'healthy';
    if (r.authBroken) state = 'auth';
    else if (t < r.coolUntil) state = 'limited';
    else if (r.state === 'open' || r.state === 'half') state = r.reason === 'rate_limited' ? 'limited' : r.reason === 'network' || r.reason === 'gateway_down' ? 'down' : 'cooling';
    const sorted = [...r.lat].sort((a, b) => a - b);
    return { routeId: id, state, openedAt: r.openedAt || undefined, nextProbeAt: r.state === 'open' ? r.nextProbeAt : t < r.coolUntil ? r.coolUntil : undefined, p50ms: sorted.length ? (sorted[Math.floor(sorted.length / 2)] as number) : 0, lastError: r.lastError };
  }
  snapshot(): Record<string, Rec> { return JSON.parse(JSON.stringify(this.recs)); }
}
