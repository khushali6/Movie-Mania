/// <reference lib="webworker" />
// Heavy parsing (PDF, DOCX, HTML…) runs here so the UI never drops frames. The result is plain data.
import { parseFile } from '@fruitfly/pantry';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

interface Req { id: number; name: string; type: string; buffer: ArrayBuffer }
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<Req>) => {
  const { id, name, type, buffer } = e.data;
  try {
    const out = await parseFile({ name, type, size: buffer.byteLength, arrayBuffer: async () => buffer }, {
      pdf: { loader: async () => { const m = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as { GlobalWorkerOptions: { workerSrc: string } } & Record<string, unknown>; m.GlobalWorkerOptions.workerSrc = new URL(workerUrl, self.location.href).href; return m as never; } },
      onPage: (d, t) => ctx.postMessage({ id, progress: d / t }),
    });
    ctx.postMessage({ id, parsed: out.parsed, mime: out.mime, bytes: buffer.byteLength });
  } catch (err) { ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) }); }
};
