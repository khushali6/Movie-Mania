import type { ParsedBlock, ParsedDoc } from '../types';
import { parseMarkdown } from './text';

type PdfJs = { getDocument: (src: unknown) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string; hasEOL?: boolean; transform?: number[]; height?: number }[] }> }>; getMetadata?: () => Promise<{ info?: { Title?: string } }> }> }; GlobalWorkerOptions?: { workerSrc: string } };

export interface PdfOptions { loader?: () => Promise<PdfJs> }

/** PDF via pdf.js, lazy-loaded (it's big). Text only; image-only PDFs are flagged `thin` → "Needs OCR". */
export async function parsePdf(data: ArrayBuffer | Uint8Array, title: string, opts: PdfOptions = {}, onPage?: (done: number, total: number) => void): Promise<ParsedDoc> {
  const pdfjs = await (opts.loader ?? (async () => (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJs))();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true, disableFontFace: true, verbosity: 0 }).promise;
  const blocks: ParsedBlock[] = []; let chars = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p); const tc = await page.getTextContent();
    let out = ''; let lastY: number | undefined;
    for (const it of tc.items) {
      const y = it.transform?.[5];
      if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > (it.height ?? 10) * 0.6) out += '\n';
      out += it.str ?? ''; if (it.hasEOL) out += '\n';
      if (y !== undefined) lastY = y;
    }
    const text = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    chars += text.length;
    if (text) {
      // headings: short lines in title case or caps at the start of a page block
      const sub = parseMarkdown(text.split('\n').map((l) => (/^[A-Z][A-Z0-9 .,&/'-]{4,60}$/.test(l.trim()) && !/[.]$/.test(l.trim()) ? `## ${l.trim()}` : l)).join('\n'), title);
      for (const b of sub.blocks) blocks.push({ headingPath: b.headingPath, page: p, text: b.text });
    }
    onPage?.(p, doc.numPages);
  }
  const meta = await doc.getMetadata?.().catch(() => undefined);
  return { title: meta?.info?.Title?.trim() || title, blocks, thin: chars < Math.max(40, doc.numPages * 25) };
}

/** DOCX via mammoth (lazy). Headings become heading paths. */
export async function parseDocx(data: ArrayBuffer, title: string): Promise<ParsedDoc> {
  const mammoth = (await import('mammoth')) as unknown as { convertToHtml: (i: { arrayBuffer: ArrayBuffer } | { buffer: unknown }) => Promise<{ value: string }> };
  // the Node build wants `buffer`, the browser build wants `arrayBuffer`
  const nodeBuf = (globalThis as { Buffer?: { from(b: ArrayBuffer): unknown } }).Buffer;
  const { value } = await mammoth.convertToHtml(typeof window === 'undefined' && nodeBuf ? { buffer: nodeBuf.from(data) } : { arrayBuffer: data });
  const { parseHtml } = await import('./html');
  const doc = parseHtml(value, title);
  return { title, blocks: doc.blocks };
}
