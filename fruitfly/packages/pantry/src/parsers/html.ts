import type { ParsedBlock, ParsedDoc } from '../types';

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rupee: '₹', euro: '€', pound: '£', mdash: '—', ndash: '–', hellip: '…' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}

/** Framework-free HTML → structured blocks (works in a service worker or Node). Scripts, styles and hidden content are dropped. */
export function parseHtml(html: string, fallbackTitle = 'Saved page'): ParsedDoc {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '') || fallbackTitle;
  let body = html.replace(/<(script|style|noscript|template|svg|head)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+(?:hidden|display:\s*none|aria-hidden="true")[^>]*>[\s\S]*?<\/[a-z0-9]+>/gi, ' ');
  body = body.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|section|article|li|tr|table|ul|ol|blockquote|pre)>/gi, '\n').replace(/<(p|div|section|article|li|tr|ul|ol|blockquote|pre)[^>]*>/gi, '\n');
  const stack: { level: number; text: string }[] = []; const blocks: ParsedBlock[] = []; let buf = '';
  const flush = () => { const t = decodeEntities(buf.replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim(); if (t) blocks.push({ headingPath: stack.map((s) => s.text), text: t }); buf = ''; };
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi; let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    buf += body.slice(last, m.index); flush();
    const level = Number(m[1]); const text = decodeEntities(m[2]!.replace(/<[^>]+>/g, '')).trim();
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    if (text) stack.push({ level, text });
    last = m.index + m[0].length;
  }
  buf += body.slice(last); flush();
  return { title, blocks };
}
