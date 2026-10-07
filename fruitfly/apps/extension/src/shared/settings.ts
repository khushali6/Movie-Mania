import { z } from 'zod';
import type { ProfileName } from '@fruitfly/core';

export const SettingsSchema = z.object({
  mode: z.enum(['demo', 'live']).default('demo'),
  onboarded: z.boolean().default(false),
  gateway: z.object({ enabled: z.boolean().default(false), url: z.string().default('http://localhost:3001/v1'), template: z.enum(['balanced', 'fast', 'max-quality', 'private-only']).default('balanced') }).default({}),
  ollama: z.object({ enabled: z.boolean().default(false), url: z.string().default('http://localhost:11434'), model: z.string().default('llama3.1:8b'), embedModel: z.string().default('nomic-embed-text') }).default({}),
  byo: z.object({ anthropic: z.object({ enabled: z.boolean().default(false), model: z.string().default('claude-haiku-4-5-20251001') }).default({}), gemini: z.object({ enabled: z.boolean().default(false), model: z.string().default('gemini-2.5-flash') }).default({}) }).default({}),
  /** per-route "allow personal info" toggles (default off for remote) */
  allowPersonal: z.record(z.boolean()).default({}),
  routeOrder: z.record(z.array(z.string())).default({}),
  pantry: z.object({ enabled: z.boolean().default(true), embedder: z.enum(['basic', 'ollama']).default('basic') }).default({}),
  askBeforePersonal: z.boolean().default(true),
  firstUseAt: z.number().default(0),
  budget: z.object({ perTask: z.number().default(250_000), dayHard: z.number().default(1_000_000), monthHard: z.number().default(20_000_000) }).default({}),
  stepsCap: z.number().default(40),
  ui: z.object({ energy: z.enum(['calm', 'normal', 'lively']).default('normal'), theme: z.enum(['auto', 'light', 'dark']).default('auto'), sleepAfter: z.number().default(45), reducedMotion: z.enum(['auto', 'on', 'off']).default('auto'), sounds: z.boolean().default(false) }).default({}),
  flags: z.record(z.boolean()).default({}),
  savedTasks: z.array(z.object({ id: z.string(), name: z.string(), goal: z.string(), description: z.string().default('') })).default([]),
  telemetry: z.boolean().default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const defaultSettings = (): Settings => SettingsSchema.parse({});

const KEY = 'ff:settings';
export async function loadSettings(): Promise<Settings> {
  const raw = (await chrome.storage.local.get(KEY))[KEY];
  const r = SettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : defaultSettings();
}
export async function saveSettings(s: Settings): Promise<void> { await chrome.storage.local.set({ [KEY]: s }); }
export async function updateSettings(fn: (s: Settings) => Settings): Promise<Settings> { const n = fn(await loadSettings()); await saveSettings(n); return n; }
export function onSettings(cb: (s: Settings) => void): () => void {
  const l = (c: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && c[KEY]) { const r = SettingsSchema.safeParse(c[KEY].newValue ?? {}); if (r.success) cb(r.data); } };
  chrome.storage.onChanged.addListener(l); return () => chrome.storage.onChanged.removeListener(l);
}

/** API keys live here and nowhere else. They are never sent to content scripts, logs, history or prompts. */
export type KeyName = 'gateway' | 'anthropic' | 'gemini';
const KEYS = 'ff:keys';
export async function loadKeys(): Promise<Partial<Record<KeyName, string>>> { return ((await chrome.storage.local.get(KEYS))[KEYS] as Partial<Record<KeyName, string>> | undefined) ?? {}; }
export async function setKey(name: KeyName, value: string | undefined): Promise<void> { const k = await loadKeys(); if (value) k[name] = value; else delete k[name]; await chrome.storage.local.set({ [KEYS]: k }); }
export async function hasKey(name: KeyName): Promise<boolean> { return !!(await loadKeys())[name]; }
export type { ProfileName };
