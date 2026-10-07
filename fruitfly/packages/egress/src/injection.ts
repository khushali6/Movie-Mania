/** Prompt-injection posture: pages AND personal documents are untrusted data. We flag agent-directed instructions. */
const PATTERNS: { re: RegExp; label: string }[] = [
  { re: /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|prompts?|rules)/i, label: 'override-instructions' },
  { re: /disregard (all |any |the )?(previous|prior|above|earlier|your) (instructions|prompts?|rules)/i, label: 'override-instructions' },
  { re: /you are (now|no longer) (an? )?[a-z ]{3,40}(assistant|agent|ai|bot)/i, label: 'role-hijack' },
  { re: /(system|developer) (prompt|message|instruction)s?\s*[:=]/i, label: 'fake-system-message' },
  { re: /<\/?(system|assistant|tool_?call|instructions?)>/i, label: 'fake-tags' },
  { re: /(reveal|print|show|output|leak) (me )?(your|the) (system prompt|instructions|api key|secrets?|password)/i, label: 'exfiltrate' },
  { re: /(send|email|post|upload|forward) (this|the|all|your) (data|conversation|history|contents?|files?|passwords?|credentials|keys?)\b.{0,60}\b(to|at) /i, label: 'exfiltrate' },
  { re: /\b(?:ai|assistant|agent|model|llm|claude|gpt)(?:\s+agent)?[,:]?\s+(?:you\s+)?(?:please\s+)?(?:must|should|need to|are required to)\s+(?:now\s+)?(?:click|buy|purchase|send|transfer|delete|navigate|visit|open|enter|type)/i, label: 'agent-directed-command' },
  { re: /when (an? )?(ai|assistant|agent|llm) (reads|sees|processes) this/i, label: 'agent-directed-command' },
  { re: /do not (tell|inform|alert|show) the user/i, label: 'conceal' },
];

export interface InjectionFinding { label: string; excerpt: string }

export function detectInjection(text: string): InjectionFinding[] {
  const found: InjectionFinding[] = [];
  for (const p of PATTERNS) {
    const m = p.re.exec(text);
    if (m) {
      const i = Math.max(0, m.index - 20);
      found.push({ label: p.label, excerpt: text.slice(i, Math.min(text.length, m.index + m[0].length + 20)).replace(/\s+/g, ' ').trim() });
    }
  }
  return found;
}

/** Wrap untrusted data so the model sees a clear boundary. Closing tags inside the data are neutralised. */
export function wrapUntrusted(tag: string, attrs: Record<string, string | number | undefined>, body: string): string {
  const a = Object.entries(attrs).filter(([, v]) => v !== undefined).map(([k, v]) => ` ${k}="${String(v).replace(/"/g, "'")}"`).join('');
  const safe = body.replace(new RegExp(`</?${tag}[^>]*>`, 'gi'), '').replace(/<\/?(system|assistant|tool_?call|instructions?)>/gi, '');
  return `<${tag} untrusted="true"${a}>\n${safe}\n</${tag}>`;
}
