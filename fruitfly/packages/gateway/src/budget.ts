import { FruitflyError } from '@fruitfly/core';

export interface BudgetConfig { perTask: number; dayHard: number; daySoft: number; monthHard: number; monthSoft: number }
export const DEFAULT_BUDGET: BudgetConfig = { perTask: 250_000, daySoft: 800_000, dayHard: 1_000_000, monthSoft: 16_000_000, monthHard: 20_000_000 };

export interface BudgetStore { load(): { day: string; month: string; dayUsed: number; monthUsed: number } | undefined; save(s: { day: string; month: string; dayUsed: number; monthUsed: number }): void }

/** Token budgets per task / day / month. "Nectar" is the UI name for the remaining fraction. */
export class BudgetTracker {
  private state: { day: string; month: string; dayUsed: number; monthUsed: number };
  private taskUsed = new Map<string, number>();
  private warned = new Set<string>();
  constructor(public config: BudgetConfig = DEFAULT_BUDGET, private store?: BudgetStore, private now: () => number = Date.now, private onWarn?: (kind: 'day' | 'month' | 'task', fraction: number) => void) {
    this.state = store?.load() ?? { day: this.dayKey(), month: this.monthKey(), dayUsed: 0, monthUsed: 0 };
    this.roll();
  }
  private dayKey(): string { return new Date(this.now()).toISOString().slice(0, 10); }
  private monthKey(): string { return new Date(this.now()).toISOString().slice(0, 7); }
  private roll(): void {
    if (this.state.day !== this.dayKey()) { this.state.day = this.dayKey(); this.state.dayUsed = 0; this.warned.delete('day'); }
    if (this.state.month !== this.monthKey()) { this.state.month = this.monthKey(); this.state.monthUsed = 0; this.warned.delete('month'); }
  }
  record(taskId: string, tokens: number): void {
    this.roll();
    this.taskUsed.set(taskId, (this.taskUsed.get(taskId) ?? 0) + tokens);
    this.state.dayUsed += tokens; this.state.monthUsed += tokens;
    this.store?.save(this.state);
    const f = this.state.dayUsed / this.config.dayHard;
    if (f >= 0.8 && !this.warned.has('day')) { this.warned.add('day'); this.onWarn?.('day', f); }
    const m = this.state.monthUsed / this.config.monthHard;
    if (m >= 0.8 && !this.warned.has('month')) { this.warned.add('month'); this.onWarn?.('month', m); }
  }
  taskTokens(taskId: string): number { return this.taskUsed.get(taskId) ?? 0; }
  /** Throws budget_reached when a hard cap is hit. */
  check(taskId: string, upcoming = 0): void {
    this.roll();
    const t = this.taskTokens(taskId) + upcoming;
    if (t > this.config.perTask) throw new FruitflyError('budget_reached', "That's my limit for this task.", { scope: 'task', used: t, cap: this.config.perTask });
    if (this.state.dayUsed + upcoming > this.config.dayHard) throw new FruitflyError('budget_reached', "That's my limit for today.", { scope: 'day', used: this.state.dayUsed, cap: this.config.dayHard });
    if (this.state.monthUsed + upcoming > this.config.monthHard) throw new FruitflyError('budget_reached', "That's my limit for this month.", { scope: 'month', used: this.state.monthUsed, cap: this.config.monthHard });
  }
  /** Fraction of today's nectar left, 0..1 */
  nectar(): number { this.roll(); return Math.max(0, 1 - this.state.dayUsed / this.config.dayHard); }
  usage(): { dayUsed: number; monthUsed: number; dayHard: number; monthHard: number } { this.roll(); return { dayUsed: this.state.dayUsed, monthUsed: this.state.monthUsed, dayHard: this.config.dayHard, monthHard: this.config.monthHard }; }
}
