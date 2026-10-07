import { estimateTokens, maxSensitivity, truncateToTokens, type Sensitivity } from '@fruitfly/core';
import type { PantryStore } from './store';
import type { Note, ProfileField } from './types';
import type { Vault } from './vault';

export const DEFAULT_PROFILE: ProfileField[] = [
  { key: 'full_name', label: 'Name', value: '', sensitivity: 'personal', includeInDigest: true, group: 'Basics' },
  { key: 'city', label: 'City', value: '', sensitivity: 'personal', includeInDigest: true, group: 'Basics' },
  { key: 'currency', label: 'Preferred currency', value: 'INR', sensitivity: 'public', includeInDigest: true, group: 'Basics' },
  { key: 'language', label: 'Language', value: 'English', sensitivity: 'public', includeInDigest: true, group: 'Basics' },
  { key: 'budget_habits', label: 'Budget habits', value: '', sensitivity: 'personal', includeInDigest: true, group: 'Shopping' },
  { key: 'sizes', label: 'Sizes', value: '', sensitivity: 'personal', includeInDigest: false, group: 'Shopping' },
  { key: 'travel_prefs', label: 'Travel preferences', value: '', sensitivity: 'personal', includeInDigest: true, group: 'Travel' },
  { key: 'dietary_prefs', label: 'Dietary preferences', value: '', sensitivity: 'personal', includeInDigest: false, group: 'Food' },
  { key: 'email', label: 'Email', value: '', sensitivity: 'personal', includeInDigest: false, group: 'Contact' },
  { key: 'phone', label: 'Phone', value: '', sensitivity: 'personal', includeInDigest: false, group: 'Contact' },
  { key: 'standing_instructions', label: 'Standing instructions', value: '', sensitivity: 'personal', includeInDigest: false, group: 'Instructions' },
];

export interface Digest { text: string; tokens: number; sensitivity: Sensitivity; fields: string[] }

/** Compile the "About you" digest (≤ 300 tokens). Local-only fields are only included when the active route is local. */
export function compileDigest(fields: ProfileField[], o: { includeLocalOnly?: boolean; maxTokens?: number } = {}): Digest {
  const used = fields.filter((f) => f.includeInDigest && f.value.trim() && (o.includeLocalOnly || f.sensitivity !== 'local-only') && f.key !== 'standing_instructions');
  const lines = used.map((f) => `${f.label}: ${f.value.trim().replace(/\s+/g, ' ')}`);
  const cap = o.maxTokens ?? 300;
  let t = truncateToTokens(lines.join('\n'), cap);
  while (t.tokens > cap) t = truncateToTokens(t.text.slice(0, Math.floor(t.text.length * 0.95)), cap);
  return { text: t.text, tokens: t.tokens, sensitivity: used.length ? maxSensitivity(...used.map((f) => f.sensitivity)) : 'public', fields: used.map((f) => f.key) };
}

export function standingInstructions(fields: ProfileField[]): { text: string; lines: number; tokens: number; overLimit: boolean } {
  const text = fields.find((f) => f.key === 'standing_instructions')?.value ?? '';
  const lines = text ? text.split('\n').length : 0; const tokens = estimateTokens(text);
  return { text, lines, tokens, overLimit: lines > 200 || tokens > 2000 };
}

export class ProfileManager {
  constructor(private store: PantryStore) {}
  async get(): Promise<ProfileField[]> {
    const saved = await this.store.getProfile();
    const byKey = new Map(saved.map((f) => [f.key, f]));
    const merged = DEFAULT_PROFILE.map((d) => ({ ...d, ...byKey.get(d.key) }));
    for (const f of saved) if (!DEFAULT_PROFILE.some((d) => d.key === f.key)) merged.push(f);
    return merged;
  }
  async update(key: string, patch: Partial<Pick<ProfileField, 'value' | 'sensitivity' | 'includeInDigest' | 'label'>>): Promise<ProfileField[]> {
    const all = await this.get();
    const next = all.map((f) => (f.key === key ? { ...f, ...patch } : f));
    if (!next.some((f) => f.key === key)) next.push({ key, label: patch.label ?? key, value: patch.value ?? '', sensitivity: patch.sensitivity ?? 'personal', includeInDigest: patch.includeInDigest ?? false, group: 'Custom' });
    await this.store.putProfile(next);
    return next;
  }
  async digest(o?: Parameters<typeof compileDigest>[1]): Promise<Digest> { return compileDigest(await this.get(), o); }
  /** Values keyed for placeholder substitution. Tool layer only. */
  async values(): Promise<Record<string, string>> { return Object.fromEntries((await this.get()).map((f) => [f.key, f.value])); }
}

const PLACEHOLDER = /\{\{\s*(profile|vault)\.([a-z0-9_]+)\s*\}\}/gi;
export const hasPlaceholders = (s: string): boolean => /\{\{\s*(profile|vault)\.[a-z0-9_]+\s*\}\}/i.test(s);

/**
 * The model sees `{{profile.full_name}}` / `{{vault.passport_no}}`; the tool layer substitutes the real value at type time.
 * Returns which keys were used, never the values, so logs and replay stay clean.
 */
export async function fillPlaceholders(template: string, src: { profile: Record<string, string>; vault?: Vault; approved?: boolean }): Promise<{ text: string; used: string[]; sensitive: boolean }> {
  const used: string[] = []; let sensitive = false;
  const parts: (string | Promise<string>)[] = []; let last = 0; let m: RegExpExecArray | null; PLACEHOLDER.lastIndex = 0;
  while ((m = PLACEHOLDER.exec(template))) {
    parts.push(template.slice(last, m.index)); last = m.index + m[0].length;
    const scope = m[1]!.toLowerCase(); const key = m[2]!.toLowerCase(); used.push(`${scope}.${key}`);
    if (scope === 'vault') { sensitive = true; parts.push(src.vault ? src.vault.resolve(key, { approved: src.approved }) : Promise.reject(new Error('Vault unavailable'))); }
    else parts.push(Promise.resolve(src.profile[key] ?? ''));
  }
  parts.push(template.slice(last));
  return { text: (await Promise.all(parts)).join(''), used, sensitive };
}

export class NotesManager {
  constructor(private store: PantryStore, private now: () => number = Date.now) {}
  /** No silent memory writes: the agent proposes, the user taps Keep. */
  async propose(text: string, sourceTaskId?: string, sensitivity: Sensitivity = 'personal'): Promise<Note> {
    const n: Note = { id: `note_${this.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: text.trim().slice(0, 400), sourceTaskId, status: 'proposed', sensitivity, createdAt: this.now() };
    await this.store.putNote(n); return n;
  }
  async keep(id: string): Promise<void> { const n = (await this.store.listNotes()).find((x) => x.id === id); if (n) await this.store.putNote({ ...n, status: 'kept' }); }
  async dismiss(id: string): Promise<void> { await this.store.deleteNote(id); }
  async edit(id: string, text: string): Promise<void> { const n = (await this.store.listNotes()).find((x) => x.id === id); if (n) await this.store.putNote({ ...n, text }); }
  async list(status?: Note['status']): Promise<Note[]> { const all = await this.store.listNotes(); return status ? all.filter((n) => n.status === status) : all; }
  async search(q: string): Promise<Note[]> { const t = q.toLowerCase().split(/\s+/).filter(Boolean); return (await this.list('kept')).filter((n) => t.every((w) => n.text.toLowerCase().includes(w))); }
  /** Kept notes as a short block for the profile digest. */
  async digest(maxTokens = 120): Promise<string> { return truncateToTokens((await this.list('kept')).map((n) => `- ${n.text}`).join('\n'), maxTokens).text; }
}
