import type { Sensitivity } from '@fruitfly/core';

export type LedgerCategory = 'model-remote' | 'model-local' | 'embedding-download' | 'gateway-probe' | 'browsing';

export interface LedgerEntry {
  t: number;
  route: string;
  host: string;
  category: LedgerCategory;
  bytesOut: number;
  bytesIn: number;
  segmentKinds: string[];
  sensitivities: Sensitivity[];
  ok: boolean;
}
/** Metadata only. Never content. */
export interface LedgerStore { append(e: LedgerEntry): void | Promise<void>; all(): LedgerEntry[] | Promise<LedgerEntry[]>; clear(): void | Promise<void> }

export class MemoryLedger implements LedgerStore {
  private items: LedgerEntry[] = [];
  constructor(private max = 2000) {}
  append(e: LedgerEntry): void { this.items.push(e); if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max); }
  all(): LedgerEntry[] { return [...this.items]; }
  clear(): void { this.items = []; }
}

export interface LedgerSummary { category: LedgerCategory; host: string; requests: number; bytesOut: number; bytesIn: number; sensitivities: Sensitivity[] }

export function summarizeLedger(entries: LedgerEntry[], since = 0): LedgerSummary[] {
  const map = new Map<string, LedgerSummary>();
  for (const e of entries) {
    if (e.t < since) continue;
    const key = `${e.category}|${e.host}`;
    const s = map.get(key) ?? { category: e.category, host: e.host, requests: 0, bytesOut: 0, bytesIn: 0, sensitivities: [] };
    s.requests++; s.bytesOut += e.bytesOut; s.bytesIn += e.bytesIn;
    for (const x of e.sensitivities) if (!s.sensitivities.includes(x)) s.sensitivities.push(x);
    map.set(key, s);
  }
  return [...map.values()].sort((a, b) => b.bytesOut - a.bytesOut);
}
