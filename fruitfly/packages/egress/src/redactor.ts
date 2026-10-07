/** Regex + checksum detectors for personal identifiers. Stable placeholders, restorable in responses. */

export type PiiKind = 'EMAIL' | 'PHONE' | 'CARD' | 'AADHAAR' | 'PAN' | 'SSN' | 'IBAN' | 'SECRET';

export function luhn(digits: string): boolean {
  let sum = 0; let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}

/** Verhoeff checksum for Aadhaar numbers. */
function verhoeff(num: string): boolean {
  const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  const p = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  let c = 0;
  const rev = num.split('').reverse();
  for (let i = 0; i < rev.length; i++) c = (d[c] as number[])[(p[i % 8] as number[])[Number(rev[i])] as number] as number;
  return c === 0;
}

interface Detector { kind: PiiKind; re: RegExp; validate?: (m: string) => boolean }

const DETECTORS: Detector[] = [
  { kind: 'EMAIL', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: 'CARD', re: /\b(?:\d[ -]?){13,19}\b/g, validate: (m) => luhn(m.replace(/[ -]/g, '')) },
  { kind: 'AADHAAR', re: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, validate: (m) => { const d = m.replace(/[ -]/g, ''); return d.length === 12 && !/^[01]/.test(d) && verhoeff(d); } },
  { kind: 'PAN', re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { kind: 'SSN', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: 'IBAN', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
  { kind: 'PHONE', re: /(?<![\w.])(?:\+\d{1,3}[ -]?)?(?:\(?\d{2,5}\)?[ -]?)?\d{3,5}[ -]?\d{4,5}(?!\w)/g, validate: (m) => { const d = m.replace(/\D/g, ''); return d.length >= 10 && d.length <= 14 && (m.includes('+') || /[ -()]/.test(m) || d.length === 10); } },
];

export class RedactionMap {
  private forward = new Map<string, string>();
  private reverse = new Map<string, string>();
  private counters = new Map<PiiKind, number>();

  placeholder(kind: PiiKind, value: string): string {
    const key = `${kind}:${value}`;
    const hit = this.forward.get(key);
    if (hit) return hit;
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    const ph = `[[${kind}_${n}]]`;
    this.forward.set(key, ph); this.reverse.set(ph, value);
    return ph;
  }
  restore(text: string): string {
    if (!this.reverse.size) return text;
    return text.replace(/\[\[[A-Z]+_\d+\]\]/g, (ph) => this.reverse.get(ph) ?? ph);
  }
  get size(): number { return this.reverse.size; }
  toJSON(): Record<string, string> { return Object.fromEntries(this.reverse); }
}

export interface RedactionResult { text: string; count: number; kinds: PiiKind[] }

export function redact(text: string, map: RedactionMap, opts: { secrets?: readonly string[]; pii?: boolean } = {}): RedactionResult {
  let out = text; let count = 0; const kinds = new Set<PiiKind>();
  for (const s of opts.secrets ?? []) {
    if (s.length < 6 || !out.includes(s)) continue;
    out = out.split(s).join(map.placeholder('SECRET', s)); count++; kinds.add('SECRET');
  }
  if (opts.pii === false) return { text: out, count, kinds: [...kinds] };
  for (const det of DETECTORS) {
    out = out.replace(det.re, (m) => {
      if (m.startsWith('[[')) return m;
      if (det.validate && !det.validate(m)) return m;
      count++; kinds.add(det.kind);
      return map.placeholder(det.kind, m);
    });
  }
  return { text: out, count, kinds: [...kinds] };
}
