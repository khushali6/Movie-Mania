export const SENSITIVITIES = ['public', 'personal', 'local-only'] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

const RANK: Record<Sensitivity, number> = { public: 0, personal: 1, 'local-only': 2 };

export function isSensitivity(x: unknown): x is Sensitivity {
  return typeof x === 'string' && (SENSITIVITIES as readonly string[]).includes(x);
}

/** Labels propagate upward: a summary of a local-only doc is local-only. */
export function maxSensitivity(...items: Sensitivity[]): Sensitivity {
  let best: Sensitivity = 'public';
  for (const s of items) if (RANK[s] > RANK[best]) best = s;
  return best;
}

export function sensitivityRank(s: Sensitivity): number {
  return RANK[s];
}
