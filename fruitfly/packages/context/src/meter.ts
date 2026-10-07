import { estimateTokens, type ChatMessage, type Usage } from '@fruitfly/core';

export interface MeterReport { estimatedIn: number; reportedIn: number; reportedOut: number; cacheRead: number; cacheWrite: number; calls: number; hitRatio: number }

/** Fast local estimate ("≈" in the UI), replaced by provider-reported usage after each call. */
export class TokenMeter {
  private perTask = new Map<string, MeterReport>();
  /** optional exact pre-flight counter (e.g. Anthropic's token-counting endpoint) */
  exact?: (messages: ChatMessage[]) => Promise<number>;

  estimate(text: string): number { return estimateTokens(text); }
  estimateMessages(ms: readonly ChatMessage[]): number { return ms.reduce((a, m) => a + estimateTokens(m.content) + 4 + (m.toolCalls ? estimateTokens(JSON.stringify(m.toolCalls)) : 0), 0); }

  async count(messages: ChatMessage[]): Promise<{ tokens: number; exact: boolean }> {
    if (this.exact) { try { return { tokens: await this.exact(messages), exact: true }; } catch { /* fall back to the estimate */ } }
    return { tokens: this.estimateMessages(messages), exact: false };
  }

  private rec(taskId: string): MeterReport { let r = this.perTask.get(taskId); if (!r) { r = { estimatedIn: 0, reportedIn: 0, reportedOut: 0, cacheRead: 0, cacheWrite: 0, calls: 0, hitRatio: 0 }; this.perTask.set(taskId, r); } return r; }

  recordEstimate(taskId: string, tokens: number): void { this.rec(taskId).estimatedIn += tokens; }
  recordUsage(taskId: string, u: Usage): void {
    const r = this.rec(taskId);
    r.calls++; r.reportedIn += u.inputTokens; r.reportedOut += u.outputTokens; r.cacheRead += u.cacheReadTokens ?? 0; r.cacheWrite += u.cacheWriteTokens ?? 0;
    r.hitRatio = r.reportedIn ? Math.min(1, r.cacheRead / r.reportedIn) : 0;
  }
  report(taskId: string): MeterReport { return { ...this.rec(taskId) }; }
  forget(taskId: string): void { this.perTask.delete(taskId); }
}
