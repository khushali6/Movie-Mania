/**
 * Fast local token estimate. Deliberately approximate (labelled "≈" in the UI) and replaced by
 * provider-reported usage after each call. Calibrated against common BPE tokenizers within ~15%.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  const words = text.match(/[\p{L}\p{N}_']+/gu) ?? [];
  for (const w of words) {
    // CJK and other scripts without spaces tokenise roughly one token per char.
    if (/[぀-ヿ㐀-鿿가-힯]/u.test(w)) tokens += w.length;
    else tokens += Math.max(1, Math.ceil(w.length / 4.2));
  }
  const punct = text.match(/[^\p{L}\p{N}_'\s]/gu)?.length ?? 0;
  const newlines = text.match(/\n/g)?.length ?? 0;
  return tokens + Math.ceil(punct * 0.6) + Math.ceil(newlines * 0.5);
}

/** Trim text so it fits a token budget, cutting at a sentence/line boundary when possible. */
export function truncateToTokens(text: string, budget: number): { text: string; truncated: boolean; tokens: number } {
  const total = estimateTokens(text);
  if (total <= budget) return { text, truncated: false, tokens: total };
  const ratio = budget / total;
  let cut = Math.max(0, Math.floor(text.length * ratio * 0.98));
  const window = text.slice(0, cut);
  const boundary = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. '));
  if (boundary > cut * 0.6) cut = boundary + 1;
  const out = text.slice(0, cut);
  return { text: out, truncated: true, tokens: estimateTokens(out) };
}
