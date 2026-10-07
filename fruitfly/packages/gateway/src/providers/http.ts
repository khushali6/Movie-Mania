import { providerError, classifyHttp, classifyThrown } from '../errors';
import type { ProviderContext } from '../types';

export interface PostOpts { headers?: Record<string, string>; timeoutMs?: number; stream?: boolean; method?: 'POST' | 'GET'; category?: 'gateway-probe' | 'embedding-download' }

/** Every provider request funnels through here → EgressGuard.fetch (policy, ledger). Timeouts and Stop share one AbortSignal. */
export async function send(ctx: Omit<ProviderContext, 'prepared'> & { prepared?: ProviderContext['prepared'] }, url: string, body: unknown, opts: PostOpts = {}): Promise<Response> {
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ac.abort(); }, opts.timeoutMs ?? 60_000);
  const onAbort = () => ac.abort();
  if (ctx.signal.aborted) { clearTimeout(timer); throw providerError('aborted', 'Stopped.'); }
  ctx.signal.addEventListener('abort', onAbort, { once: true });
  try {
    const init: RequestInit = { method: opts.method ?? 'POST', headers: { 'content-type': 'application/json', ...opts.headers }, signal: ac.signal };
    if (body !== undefined && init.method !== 'GET') init.body = JSON.stringify(body);
    const res = await ctx.guard.fetch(ctx.route, url, init, { prepared: ctx.prepared, category: opts.category });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw classifyHttp(res.status, text, res.headers);
    }
    return res;
  } catch (e) {
    throw classifyThrown(e, ac.signal, () => timedOut);
  } finally {
    clearTimeout(timer);
    ctx.signal.removeEventListener('abort', onAbort);
  }
}

export async function readJson<T>(res: Response): Promise<T> {
  try { return (await res.json()) as T; } catch { throw providerError('malformed_output', 'The provider sent something unreadable.'); }
}

/** Minimal SSE reader: yields the data payloads. */
export async function* sseData(res: Response, signal: AbortSignal): AsyncGenerator<string> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const dec = new TextDecoder(); let buf = '';
  try {
    for (;;) {
      if (signal.aborted) throw providerError('aborted', 'Stopped.');
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try { chunk = await reader.read(); } catch (e) { throw providerError('network', e instanceof Error ? e.message : 'Stream disconnected.'); }
      const { done, value } = chunk;
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line.startsWith('data:')) { const d = line.slice(5).trim(); if (d) yield d; }
      }
    }
  } finally { reader.cancel().catch(() => {}); }
}
