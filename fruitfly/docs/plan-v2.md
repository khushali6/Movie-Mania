# FruitFly build plan v2: status

The plan is implemented in the phases below. Each row names where it lives and how it is checked.

| Phase | Scope | Code | Checked by |
| --- | --- | --- | --- |
| 0 | Monorepo, strict TS, tokens, lint, CI scripts | root, `packages/core` | `pnpm lint`, `pnpm typecheck` |
| 1 | The fly: engine, moods, renderer, ticker, provider, anchors | `packages/ui/src/fly` | `packages/ui/test/engine.test.ts`, Fly Lab, `bench:fly` |
| 2 | Egress guard, redaction, injection scan, ledger | `packages/egress` | `packages/egress/test` (incl. property test) |
| 3 | Model gateway: providers, router, breakers, limiter, budgets, mock gateway | `packages/gateway` | `packages/gateway/test` |
| 4 | Context engineering: prompt builder, masking, compaction, paging | `packages/context` | `packages/context/test` |
| 5 | Agent loop, tools, safety, approvals, sub-agents, critic | `packages/agent` | `packages/agent/test`, `packages/demo/test` |
| 6 | Pantry: parsers, index, retrieval, profile, vault, backup | `packages/pantry` | `packages/pantry/test`, `pnpm eval:pantry` |
| 7 | Side panel and design system | `packages/ui` | Fly Lab, `e2e/extension.spec.ts` |
| 8 | MV3 extension: host, page bridge, overlay, options, onboarding | `apps/extension` | `e2e/extension.spec.ts`, `safety.spec.ts`, `page.spec.ts`, `permission.spec.ts` |
| 9 | Demo mode and scripted rig | `packages/demo` | `packages/demo/test` |
| 10 | Landing site with live demos | `apps/landing` | `e2e/landing.spec.ts` (incl. axe AA) |
| 11 | Failure handling and plain-language errors | `packages/ui/src/panel/copy.ts`, router | `packages/gateway/test`, `e2e/safety.spec.ts` |
| 12 | Privacy posture: CSP, permissions, no telemetry | `apps/extension/build.mjs` | `e2e/permission.spec.ts` |
| 13 | Docs and release | `README.md`, this file | n/a |

## Pantry golden set

`packages/pantry/src/golden-corpus.ts` holds three documents and a question set with expected evidence. `pnpm eval:pantry` reports recall and p95 latency. Current numbers: recall 100% on the set, retrieval p95 about 93 ms over 20,000 chunks.

## Open items

Visual regression baselines, OCR, and multiple profiles are not part of this build.
