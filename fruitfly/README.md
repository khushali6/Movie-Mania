# FruitFly

A small, quiet browser agent for Chrome. It browses for you, asks before anything risky, and knows your documents without sending them anywhere. Local-first: your notes, profile and keys stay in your browser.

The character is a procedural SVG fly driven by a physics and mood engine. It lands beside the element it is about to touch, so you can always see what the agent is doing.

```
pnpm install
pnpm fly-lab        # every mood and component, http://127.0.0.1:5190
pnpm dev:landing    # marketing site with live demos, http://127.0.0.1:5191
pnpm build:ext      # apps/extension/dist  → chrome://extensions → Load unpacked
pnpm test           # unit + property tests (vitest)
pnpm test:e2e       # real Chromium with the built extension (playwright)
pnpm lint && pnpm typecheck
```

Open the side panel with **Alt+Shift+F**. With no key configured it starts in demo mode: a scripted guide runs the real agent loop against sample sites, so everything can be seen before connecting a model.

## How it fits together

| Package | What it does |
| --- | --- |
| `packages/core` | Shared types, zod schemas for every message and event, sensitivity labels, mood mapping |
| `packages/egress` | `EgressGuard`: the only code allowed to send anything off the device. Redaction, injection scan, ledger, `local-only` enforcement |
| `packages/gateway` | Model router: FreeLLMAPI/OpenAI-compatible, Anthropic, Gemini, Ollama; fallback chains, circuit breakers, rate limiting, nectar (token) budgets, response cache |
| `packages/context` | Prompt builder (stable → volatile, cache breakpoints), observation masking, compaction, paging, token meter |
| `packages/pantry` | On-device documents: parsers, chunker, hybrid BM25 + vector index, retrieval planner, profile digest, encrypted vault, backups |
| `packages/agent` | The resumable loop, tools (lazy groups), safety classifier, approvals, loop guard, sub-agents, critic, controller |
| `packages/ui` | Design system, the fly (engine, renderer, provider), side panel and all components |
| `packages/demo` | Mock sites, scripted brains, the demo rig and panel controller, onboarding |
| `apps/extension` | MV3 extension: service worker host, side panel, popup, options, onboarding, page bridge and overlay |
| `apps/landing` | Marketing site; its demos run the real stack |
| `apps/lab` | Fly Lab: every mood, state and component |

## Guarantees, and where they are tested

- **Nothing leaves except through the guard.** ESLint forbids `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` outside `packages/egress`. The extension CSP only allows `localhost`, `api.anthropic.com` and `generativelanguage.googleapis.com` (`e2e/permission.spec.ts`).
- **`local-only` content never appears in a remote request body.** Property test with fast-check (`packages/egress/test`); retrieval withholds passages above the asker's clearance (`packages/pantry/test`, `e2e/landing.spec.ts`).
- **Page text and documents are data, never instructions.** Wrapped as untrusted, injection attempts are flagged and shown (`e2e/safety.spec.ts`).
- **Secrets stay in the service worker.** API keys never reach request bodies, the page, history or replays (`e2e/safety.spec.ts`).
- **Risky actions need you.** Paying, sending, deleting and signing in stop for approval; sensitive ones need a second press. The model cannot bypass this (`packages/agent/test`, `e2e/landing.spec.ts`).
- **The service worker may die at any time.** State is persisted after each step; a killed worker resumes the task (`e2e/safety.spec.ts`).
- **No site access up front.** `host_permissions` is empty; each site is allowed when needed.
- **Motion is cheap and optional.** Only `transform` and `opacity` animate; one shared `requestAnimationFrame`; `prefers-reduced-motion` is honoured.

## Models

FruitFly works with any combination of: a FreeLLMAPI-style gateway on `localhost` (virtual models `auto`, `auto:smart`, `auto:fast`), Ollama on your own computer, or your own Anthropic or Gemini key. Routes form fallback chains per profile; a rate-limited or failing route cools down behind a circuit breaker and the task carries on with the next. Personal content only goes to routes you mark as allowed to see it.

## Pantry

Drop in PDFs, DOCX, Markdown, CSV, HTML or plain text. Everything is parsed, chunked and indexed in the browser (a Web Worker keeps the UI smooth). The default "Basic" embedder is a hashing embedder that needs no download; "Smart" uses an Ollama embedding model when one is connected. `pnpm eval:pantry` runs the golden-set recall and latency check.

## Deviations from the build plan

- No Tailwind: the design system is plain CSS on shared tokens, which keeps the extension pages and the landing site identical.
- FreeLLMAPI has no documented `/api/ping`; detection tries it, then falls back to `/v1/models`.
- The on-device embedder is hashing-based ("Basic") with Ollama as the "Smart" option, instead of a bundled transformers.js model, to keep the extension small and offline.
- OCR for scanned PDFs is not included; thin PDFs are flagged to the user.
- Multiple profiles are not implemented.
