import type { ParsedBlock, ParsedDoc } from '../types';

const HEADING = /^(#{1,6})\s+(.*\S)\s*$/;

/** Markdown / plain text → blocks with heading paths. Setext headings and ALL-CAPS short lines count as headings in plain text. */
export function parseMarkdown(text: string, title: string): ParsedDoc {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const stack: { level: number; text: string }[] = [];
  const blocks: ParsedBlock[] = [];
  let buf: string[] = [];
  const flush = () => { const t = buf.join('\n').trim(); if (t) blocks.push({ headingPath: stack.map((s) => s.text), text: t }); buf = []; };
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^```/.test(line)) { inFence = !inFence; buf.push(line); continue; }
    if (!inFence) {
      const m = HEADING.exec(line);
      if (m) { flush(); const level = m[1]!.length; while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop(); stack.push({ level, text: m[2]!.replace(/[#*_`]/g, '').trim() }); continue; }
      const next = lines[i + 1];
      if (line.trim() && next && /^(=+|-+)\s*$/.test(next) && next.length >= 3) { flush(); const level = next.startsWith('=') ? 1 : 2; while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop(); stack.push({ level, text: line.trim() }); i++; continue; }
    }
    if (!line.trim()) { if (buf.length && buf[buf.length - 1] !== '') buf.push(''); continue; }
    buf.push(line);
  }
  flush();
  return { title, blocks };
}

export function parsePlain(text: string, title: string): ParsedDoc {
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n'); const stack: string[] = []; const blocks: ParsedBlock[] = []; let buf: string[] = [];
  const flush = () => { const t = buf.join('\n').trim(); if (t) blocks.push({ headingPath: [...stack], text: t }); buf = []; };
  for (const line of lines) {
    const t = line.trim();
    const isHeading = t.length > 2 && t.length < 70 && /^(\d+(\.\d+)*[.)]?\s+)?[A-Z][A-Z0-9 &/,'-]{3,}$/.test(t) && !/[.!?]$/.test(t);
    if (isHeading) { flush(); stack.length = 0; stack.push(t.replace(/^\d+(\.\d+)*[.)]?\s+/, '')); continue; }
    if (!t) { if (buf.length) buf.push(''); continue; }
    buf.push(line);
  }
  flush();
  return { title, blocks: blocks.length ? blocks : [{ headingPath: [], text: normalized.trim() }].filter((b) => b.text) };
}

export function parseCsv(text: string, title: string): ParsedDoc {
  const rows = parseCsvRows(text);
  if (!rows.length) return { title, blocks: [] };
  const header = rows[0]!;
  const blocks: ParsedBlock[] = [];
  let group: string[] = []; let start = 1;
  const flush = (end: number) => { if (group.length) blocks.push({ headingPath: [`Rows ${start}–${end}`], text: group.join('\n') }); group = []; };
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    group.push(header.map((h, j) => `${h}: ${r[j] ?? ''}`).join('; '));
    if (group.length >= 8) { flush(i); start = i + 1; }
  }
  flush(rows.length - 1);
  return { title, blocks: [{ headingPath: ['Columns'], text: header.join(', ') }, ...blocks] };
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; } else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
