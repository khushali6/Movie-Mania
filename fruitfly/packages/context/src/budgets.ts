import type { ModelInfo, SegmentKind } from '@fruitfly/core';

/** Context budget as fractions of the active model's window (Build Plan v2 §3.2). */
export const BUDGET_FRACTIONS = {
  systemAndTools: 0.12,
  profile: 0.04,
  docs: 0.2,
  scratchpadAndHistory: 0.25,
  observation: 0.25,
  outputReserve: 0.14,
} as const;

export const COMPACT_AT = 0.7;
export const HARD_STOP_AT = 0.9;
export const DEFAULT_WINDOW = 16_000;

/** Absolute startup limits (§3.1 #7). */
export const STARTUP_LIMITS = { system: 1500, tools: 1500, profileDigest: 300, standingInstructionsTokens: 2000, standingInstructionsLines: 200 } as const;

export interface Budgets { window: number; systemAndTools: number; profile: number; docs: number; history: number; observation: number; reserve: number; compactAt: number; hardStop: number }

export function budgetsFor(model: Pick<ModelInfo, 'maxContext'> | undefined): Budgets {
  const window = model?.maxContext && model.maxContext > 0 ? model.maxContext : DEFAULT_WINDOW;
  const f = BUDGET_FRACTIONS;
  return {
    window,
    systemAndTools: Math.floor(window * f.systemAndTools), profile: Math.floor(window * f.profile), docs: Math.floor(window * f.docs),
    history: Math.floor(window * f.scratchpadAndHistory), observation: Math.floor(window * f.observation), reserve: Math.ceil(window * f.outputReserve),
    compactAt: Math.floor(window * COMPACT_AT), hardStop: Math.floor(window * HARD_STOP_AT),
  };
}

export const SEGMENT_ORDER: SegmentKind[] = ['system', 'tools', 'profile', 'scratchpad', 'docs', 'history', 'observation'];
