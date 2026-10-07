import type { ParsedDoc } from '../types';
import { parseHtml } from './html';
import { parseCsv, parseMarkdown, parsePlain } from './text';
import { parseDocx, parsePdf, type PdfOptions } from './binary';

export * from './html';
export * from './text';
export * from './binary';

export interface FileLike { name: string; type?: string; arrayBuffer(): Promise<ArrayBuffer>; size: number }

export function mimeFromName(name: string, type?: string): string {
  if (type && type !== 'application/octet-stream') return type;
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return ({ pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain', csv: 'text/csv', html: 'text/html', htm: 'text/html', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' } as Record<string, string>)[ext] ?? 'text/plain';
}
export const SUPPORTED_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/markdown', 'text/plain', 'text/csv', 'text/html'] as const;

export async function parseFile(file: FileLike, opts: { pdf?: PdfOptions; onPage?: (d: number, t: number) => void } = {}): Promise<{ parsed: ParsedDoc; mime: string }> {
  const mime = mimeFromName(file.name, file.type);
  const title = file.name.replace(/\.[^.]+$/, '');
  const buf = await file.arrayBuffer();
  const text = () => new TextDecoder('utf-8').decode(buf);
  switch (mime) {
    case 'application/pdf': return { parsed: await parsePdf(buf, title, opts.pdf, opts.onPage), mime };
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return { parsed: await parseDocx(buf, title), mime };
    case 'text/markdown': return { parsed: parseMarkdown(text(), title), mime };
    case 'text/csv': return { parsed: parseCsv(text(), title), mime };
    case 'text/html': return { parsed: parseHtml(text(), title), mime };
    case 'image/png': case 'image/jpeg': return { parsed: { title, blocks: [], thin: true }, mime };
    default: return { parsed: parsePlain(text(), title), mime };
  }
}
