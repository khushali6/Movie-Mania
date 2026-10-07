import { FruitflyError, type ErrorCode } from '@fruitfly/core';
import type { ProviderError } from './types';

export function providerError(code: ErrorCode, message: string, extra: { status?: number; retryAfterMs?: number; detail?: Record<string, unknown> } = {}): ProviderError {
  const e = new FruitflyError(code, message, extra.detail) as ProviderError;
  e.status = extra.status; e.retryAfterMs = extra.retryAfterMs;
  return e;
}

export function parseRetryAfter(h: string | null | undefined, now = Date.now()): number | undefined {
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(h);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

const CONTEXT_RE = /context[_ ]length|maximum context|context window|too many tokens|prompt is too long|exceeds the (model'?s )?(maximum|max)|reduce the length|token limit/i;
const FILTER_RE = /content[_ ]?(policy|filter)|safety|blocked by|moderation|responsible ai/i;

export function classifyHttp(status: number, body: string, headers: Headers): ProviderError {
  const snippet = body.slice(0, 300);
  const retryAfterMs = parseRetryAfter(headers.get('retry-after') ?? headers.get('x-ratelimit-reset-requests'));
  if (status === 429) return providerError('rate_limited', 'Rate limited.', { status, retryAfterMs, detail: { body: snippet } });
  if (status === 401 || status === 403) return providerError('auth', 'That key didn\'t work.', { status, detail: { body: snippet } });
  if (status === 413 || (status === 400 && CONTEXT_RE.test(body))) return providerError('context_length', 'Context too long.', { status, detail: { body: snippet } });
  if (status === 400 && FILTER_RE.test(body)) return providerError('content_filtered', 'Blocked by a content filter.', { status, detail: { body: snippet } });
  if (status === 408 || status === 504) return providerError('timeout', 'Timed out.', { status });
  if (status >= 500) return providerError('server_error', `Provider error ${status}.`, { status, retryAfterMs, detail: { body: snippet } });
  if (status === 404 || status === 422) return providerError('malformed_output', `Request rejected (${status}).`, { status, detail: { body: snippet } });
  return providerError('unknown', `Unexpected status ${status}.`, { status, detail: { body: snippet } });
}

export function classifyThrown(e: unknown, signal?: AbortSignal, timedOut?: () => boolean): ProviderError {
  if (e instanceof FruitflyError) return e as ProviderError;
  const name = (e as { name?: string })?.name;
  if (name === 'AbortError' || signal?.aborted) return timedOut?.() ? providerError('timeout', 'Timed out.') : providerError('aborted', 'Stopped.');
  return providerError('network', e instanceof Error ? e.message : 'Network error.');
}
