/** Sync, non-cryptographic content hash (cache keys, dedupe). 53-bit cyrb53. */
export function contentHash(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

let counter = 0;
export function newId(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

/** Deterministic JSON: sorted keys, so prompt prefixes stay byte-stable. */
export function stableStringify(value: unknown, space?: number): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v && typeof v === 'object') {
      if (seen.has(v as object)) return '[circular]';
      seen.add(v as object);
      if (Array.isArray(v)) return v.map(walk);
      const o = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().map((k) => [k, walk(o[k])]));
    }
    return v;
  };
  return JSON.stringify(walk(value), null, space);
}
