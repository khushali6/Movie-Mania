/**
 * A fault-injecting mock of an OpenAI-compatible gateway (FreeLLMAPI-style) and Ollama, usable in-process
 * (`mock.fetch`) or as a real localhost HTTP server (`mock.listen()`) for extension→localhost e2e tests.
 */
export type Fault =
  | { kind: '429'; retryAfterSec?: number }
  | { kind: '500' } | { kind: '503' }
  | { kind: 'timeout' }
  | { kind: 'disconnect' }
  | { kind: 'context' }
  | { kind: 'malformed_tool' }
  | { kind: 'filter' }
  | { kind: '401' }
  | { kind: 'slow'; ms: number };

export interface MockReply { text?: string; toolCalls?: { name: string; args: Record<string, unknown> }[] }
export interface RecordedRequest { method: string; path: string; headers: Record<string, string>; body: string }

export class MockGateway {
  queue: Fault[] = [];
  requests: RecordedRequest[] = [];
  reply: (body: Record<string, unknown>, n: number) => MockReply = (b) => ({ text: `ok:${String((b.model as string) ?? '')}` });
  models: { id: string; context_length?: number; execution_status?: string }[] = [{ id: 'auto' }, { id: 'auto:smart' }, { id: 'auto:fast' }];
  requireKey: string | undefined;
  hasPing = false;
  private n = 0;

  inject(...f: Fault[]): this { this.queue.push(...f); return this; }
  reset(): void { this.queue = []; this.requests = []; this.n = 0; }

  readonly fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    return this.handle(init?.method ?? 'GET', url.pathname, headers, typeof init?.body === 'string' ? init.body : '', init?.signal ?? undefined);
  }) as typeof fetch;

  private json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...headers } });
  }

  async handle(method: string, path: string, headers: Record<string, string>, body: string, signal?: AbortSignal): Promise<Response> {
    this.requests.push({ method, path, headers, body });
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-allow-private-network': 'true' } });
    if (path === '/api/ping') return this.hasPing ? this.json(200, { ok: true }) : this.json(404, { error: 'not found' });
    if (this.requireKey && headers.authorization !== `Bearer ${this.requireKey}`) return this.json(401, { error: { message: 'bad key' } });
    if (path === '/v1/models' && method === 'GET') return this.json(200, { data: this.models });
    if (path === '/api/tags') return this.json(200, { models: [{ name: 'llama3.1:8b' }] });
    if (path === '/v1/embeddings' || path === '/api/embed') {
      const b = JSON.parse(body || '{}') as { input?: string | string[] };
      const inputs = Array.isArray(b.input) ? b.input : [b.input ?? ''];
      const vecs = inputs.map((t) => fakeEmbed(t));
      return path === '/api/embed' ? this.json(200, { embeddings: vecs }) : this.json(200, { data: vecs.map((embedding) => ({ embedding })) });
    }
    if (path === '/v1/chat/completions' || path === '/api/chat') {
      const fault = this.queue.shift();
      const req = JSON.parse(body || '{}') as Record<string, unknown>;
      if (fault) {
        switch (fault.kind) {
          case '429': return this.json(429, { error: { message: 'rate limit' } }, fault.retryAfterSec !== undefined ? { 'retry-after': String(fault.retryAfterSec) } : {});
          case '500': return this.json(500, { error: { message: 'boom' } });
          case '503': return this.json(503, { error: { message: 'busy' } });
          case '401': return this.json(401, { error: { message: 'invalid api key' } });
          case 'context': return this.json(400, { error: { message: "This model's maximum context length is 8192 tokens", code: 'context_length_exceeded' } });
          case 'filter': return this.json(400, { error: { message: 'blocked by content_policy' } });
          case 'timeout': await new Promise<void>((_, rej) => signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })); break;
          case 'slow': await new Promise<void>((res, rej) => { const t = setTimeout(res, fault.ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true }); }); break;
          case 'malformed_tool': return this.respond(path, req, { toolCalls: [] }, '{not json');
          case 'disconnect': return this.stream(req, 'disconnect');
        }
      }
      const r = this.reply(req, this.n++);
      if (req.stream === true) return this.stream(req, 'ok', r);
      return this.respond(path, req, r);
    }
    return this.json(404, { error: 'not found' });
  }

  private respond(path: string, req: Record<string, unknown>, r: MockReply, rawArgs?: string): Response {
    const tcs = (r.toolCalls ?? []).map((c, i) => ({ id: `call_${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }));
    if (rawArgs !== undefined) tcs.push({ id: 'call_bad', type: 'function', function: { name: 'read_page', arguments: rawArgs } });
    if (path === '/api/chat') return this.json(200, { message: { role: 'assistant', content: r.text ?? '', tool_calls: (r.toolCalls ?? []).map((c) => ({ function: { name: c.name, arguments: c.args } })) }, prompt_eval_count: 12, eval_count: 6, done: true });
    return this.json(200, { id: 'x', model: req.model, choices: [{ index: 0, message: { role: 'assistant', content: r.text ?? null, tool_calls: tcs.length ? tcs : undefined }, finish_reason: tcs.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 6 } }, { 'x-routed-via': 'mock/upstream-1' });
  }

  private stream(req: Record<string, unknown>, mode: 'ok' | 'disconnect', r: MockReply = { text: 'streamed reply' }): Response {
    const enc = new TextEncoder();
    const words = (r.text ?? '').split(/(?<= )/);
    const rs = new ReadableStream<Uint8Array>({
      async start(c) {
        for (let i = 0; i < words.length; i++) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: words[i] } }] })}\n\n`));
          await new Promise((res) => setTimeout(res, 2));
          if (mode === 'disconnect' && i === 0) { c.error(new TypeError('network error: stream disconnected')); return; }
        }
        c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`));
        c.close();
      },
    });
    void req;
    return new Response(rs, { status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' } });
  }

  /** Real localhost server (Node only). */
  async listen(port = 0): Promise<{ port: number; url: string; close: () => Promise<void> }> {
    const http = await import('node:http');
    const { Readable } = await import('node:stream');
    const server = http.createServer(async (rq, rs) => {
      const chunks: Buffer[] = []; for await (const ch of rq) chunks.push(ch as Buffer);
      const ac = new AbortController(); rq.on('close', () => ac.abort());
      const headers: Record<string, string> = {}; for (const [k, v] of Object.entries(rq.headers)) if (typeof v === 'string') headers[k] = v;
      try {
        const res = await this.handle(rq.method ?? 'GET', (rq.url ?? '/').split('?')[0]!, headers, Buffer.concat(chunks).toString('utf8'), ac.signal);
        const h: Record<string, string> = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-private-network': 'true' };
        res.headers.forEach((v, k) => (h[k] = v));
        rs.writeHead(res.status, h);
        if (res.body) Readable.fromWeb(res.body as never).pipe(rs); else rs.end();
      } catch { rs.destroy(); }
    });
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
    const p = (server.address() as { port: number }).port;
    return { port: p, url: `http://127.0.0.1:${p}`, close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }) };
  }
}

/** Deterministic 32-dim fake embedding (hashing trick) so tests and demos never need a model. */
export function fakeEmbed(text: string, dim = 32): number[] {
  const v = new Array<number>(dim).fill(0);
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) { let h = 2166136261; for (let i = 0; i < w.length; i++) { h ^= w.charCodeAt(i); h = Math.imul(h, 16777619); } v[Math.abs(h) % dim]! += 1; }
  const n = Math.hypot(...v) || 1; return v.map((x) => x / n);
}
