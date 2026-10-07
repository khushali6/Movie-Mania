import type { ModelInfo, ProfileName, Sensitivity } from '@fruitfly/core';
import { buildProfiles, type CallOptions, type CompletionRequest, type CompletionResponse, type ModelRouter, type Route } from '@fruitfly/gateway';
import type { ModelClient } from './types';

/** Adapts the ModelRouter to what the loop needs (completion + model info for context budgets + route allowance). */
export class RouterModelClient implements ModelClient {
  constructor(private router: ModelRouter, private chains: () => ReturnType<typeof buildProfiles>) {}
  complete(profile: ProfileName, req: CompletionRequest, opts?: CallOptions): Promise<CompletionResponse> { return this.router.complete(profile, req, opts); }
  private routes(profile: ProfileName): Route[] { return this.chains()[profile]?.chain ?? []; }
  modelInfo(profile: ProfileName): ModelInfo {
    // budgets follow the smallest window among the routes we may fall over to, so a failover never overflows
    const rs = this.routes(profile); const first = rs[0];
    if (!first) return { id: 'none', maxContext: 16_000, maxOutput: 2048, supportsTools: true, supportsVision: false, supportsStreaming: false };
    const min = Math.min(...rs.slice(0, 2).map((r) => r.caps.maxContext));
    return { id: first.model, label: first.label, maxContext: min, maxOutput: first.caps.maxOutput, supportsTools: first.caps.tools, supportsVision: first.caps.vision, supportsStreaming: first.caps.streaming };
  }
  allowance(profile: ProfileName): Sensitivity {
    const rs = this.routes(profile);
    if (rs.some((r) => r.kind === 'local')) return 'local-only';
    return rs.some((r) => r.allowsPersonal) ? 'personal' : 'public';
  }
}
