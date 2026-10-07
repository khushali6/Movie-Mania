import { FruitflyError, SENSITIVITIES, estimateTokens, type ChatMessage, type RouteKind, type Sensitivity, sensitivityRank } from '@fruitfly/core';
import { RedactionMap, redact } from './redactor';
import { MemoryLedger, type LedgerCategory, type LedgerStore } from './ledger';

export interface EgressRoute { id: string; kind: RouteKind; allowsPersonal: boolean; host?: string }

export interface PreviewSegment { id: string; kind: string; sensitivity: Sensitivity; bytes: number; tokens: number; redactions: number; excerpt: string }
export interface SendPreview { route: string; kind: RouteKind; segments: PreviewSegment[]; totalBytes: number; includesPersonal: boolean; redactions: number }

export interface PreparedRequest {
  messages: ChatMessage[];
  preview: SendPreview;
  redactions: RedactionMap;
  /** restore redaction placeholders in model output */
  restore(text: string): string;
  segmentKinds: string[];
  sensitivities: Sensitivity[];
}

export interface GuardOptions {
  fetchImpl?: typeof fetch;
  ledger?: LedgerStore;
  /** ask the user before personal data reaches a remote route (default on) */
  askBeforePersonal?: () => boolean;
  confirm?: (preview: SendPreview) => Promise<boolean> | boolean;
  /** values that must never leave: API keys, vault values. Replaced with placeholders in anything remote. */
  secrets?: () => readonly string[];
  now?: () => number;
}

const LOCAL_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1|0\.0\.0\.0|[^.]+\.local)$/i;
export function isLocalHost(host: string): boolean { return LOCAL_HOSTS.test(host.replace(/:\d+$/, '')); }

/**
 * The single choke point for model traffic. Everything that talks to a provider goes through
 * `prepare` (policy + redaction) and `fetch` (transport + ledger). Nothing else in the codebase may call fetch
 * on a provider host (enforced by a lint rule).
 */
export class EgressGuard {
  readonly ledger: LedgerStore;
  private fetchImpl: typeof fetch;
  constructor(private opts: GuardOptions = {}) {
    this.ledger = opts.ledger ?? new MemoryLedger();
    this.fetchImpl = opts.fetchImpl ?? ((...a) => globalThis.fetch(...a));
  }

  private labelOf(m: ChatMessage): Sensitivity {
    // Missing label → treat as personal (conservative). An unrecognised label → fail closed.
    const s = m.sensitivity ?? 'personal';
    if (!(SENSITIVITIES as readonly string[]).includes(s)) throw new FruitflyError('egress_blocked', `Unknown sensitivity label "${String(s)}".`, { label: s });
    return s;
  }

  /** Can this request be served by that route at all? Used by the router to choose routes. */
  check(messages: readonly ChatMessage[], route: EgressRoute): { ok: true } | { ok: false; reason: 'local_only' | 'personal_not_allowed' | 'unknown_label'; segmentId?: string } {
    for (const m of messages) {
      let s: Sensitivity;
      try { s = this.labelOf(m); } catch { return { ok: false, reason: 'unknown_label', segmentId: m.segmentId }; }
      if (route.kind === 'remote') {
        if (s === 'local-only') return { ok: false, reason: 'local_only', segmentId: m.segmentId };
        if (s === 'personal' && !route.allowsPersonal) return { ok: false, reason: 'personal_not_allowed', segmentId: m.segmentId };
      }
    }
    return { ok: true };
  }

  async prepare(messages: readonly ChatMessage[], route: EgressRoute, redactions = new RedactionMap()): Promise<PreparedRequest> {
    const verdict = this.check(messages, route);
    if (!verdict.ok) {
      const code = verdict.reason === 'local_only' ? 'local_model_missing' : 'egress_blocked';
      throw new FruitflyError(code, verdict.reason === 'local_only' ? 'That one stays on this device, and I need a local model to read it.' : `Route "${route.id}" may not receive this content (${verdict.reason}).`, { reason: verdict.reason, segmentId: verdict.segmentId, route: route.id });
    }
    const remote = route.kind === 'remote';
    const secrets = this.opts.secrets?.() ?? [];
    const out: ChatMessage[] = [];
    const segments: PreviewSegment[] = [];
    let total = 0; let redTotal = 0; let includesPersonal = false;
    for (const m of messages) {
      const s = this.labelOf(m);
      let content = m.content;
      let red = 0;
      if (remote) {
        // secrets are scrubbed from every remote segment; PII only from personal ones (a public page's own emails are not ours to hide)
        const r = redact(content, redactions, { secrets, pii: s === 'personal' });
        content = r.text; red = r.count;
      }
      if (s === 'personal') includesPersonal = true;
      const bytes = new TextEncoder().encode(content).length;
      total += bytes; redTotal += red;
      segments.push({ id: m.segmentId ?? `${m.role}-${segments.length}`, kind: m.segmentKind ?? m.role, sensitivity: s, bytes, tokens: estimateTokens(content), redactions: red, excerpt: content.slice(0, 160) });
      out.push({ ...m, content, sensitivity: s });
    }
    const preview: SendPreview = { route: route.id, kind: route.kind, segments, totalBytes: total, includesPersonal, redactions: redTotal };
    if (remote && includesPersonal && this.opts.askBeforePersonal?.() && this.opts.confirm) {
      const ok = await this.opts.confirm(preview);
      if (!ok) throw new FruitflyError('egress_blocked', 'You chose not to send personal info.', { reason: 'user_declined' });
    }
    return { messages: out, preview, redactions, restore: (t) => redactions.restore(t), segmentKinds: [...new Set(segments.map((x) => x.kind))], sensitivities: [...new Set(segments.map((x) => x.sensitivity))].sort((a, b) => sensitivityRank(a) - sensitivityRank(b)) };
  }

  /** The only place a provider request is actually sent. Records metadata (never content) in the ledger. */
  async fetch(route: EgressRoute, url: string, init: RequestInit, meta: { prepared?: PreparedRequest; category?: LedgerCategory } = {}): Promise<Response> {
    const host = new URL(url).host;
    const local = isLocalHost(host);
    if (route.kind === 'local' && !local) throw new FruitflyError('egress_blocked', `Local route "${route.id}" may only talk to this device.`, { host });
    const now = this.opts.now ?? Date.now;
    const bodyBytes = typeof init.body === 'string' ? new TextEncoder().encode(init.body).length : init.body instanceof ArrayBuffer ? init.body.byteLength : 0;
    const category: LedgerCategory = meta.category ?? (local ? 'model-local' : 'model-remote');
    let ok = false; let bytesIn = 0;
    try {
      const res = await this.fetchImpl(url, init);
      ok = res.ok;
      bytesIn = Number(res.headers.get('content-length') ?? 0) || 0;
      return res;
    } finally {
      await this.ledger.append({ t: now(), route: route.id, host, category, bytesOut: bodyBytes, bytesIn, segmentKinds: meta.prepared?.segmentKinds ?? [], sensitivities: meta.prepared?.sensitivities ?? [], ok });
    }
  }
}
