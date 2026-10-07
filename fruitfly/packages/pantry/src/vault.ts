import { FruitflyError } from '@fruitfly/core';
import type { PantryStore, VaultMeta } from './store';
import type { VaultField } from './types';

const VERIFIER = 'fruitfly-vault-v1';
const enc = new TextEncoder(); const dec = new TextDecoder();
const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

export async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
export async function encryptBytes(key: CryptoKey, data: Uint8Array): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  return { iv, ciphertext: await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource) };
}
export async function decryptBytes(key: CryptoKey, iv: Uint8Array, ciphertext: ArrayBuffer): Promise<Uint8Array> {
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext));
}

export interface VaultOptions { iterations?: number; autoLockMs?: number; now?: () => number }

/**
 * AES-GCM vault. The key is derived from a passphrase (PBKDF2-SHA256, high iterations; Argon2-WASM is a drop-in later) and
 * lives only in memory (and chrome.storage.session while unlocked). Values never reach models, logs, history or replay:
 * the tool layer calls `resolve()` at type time. Encryption protects a copied profile folder, not malware running as the user.
 */
export class Vault {
  private key: CryptoKey | null = null;
  private lastUse = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private iterations: number;
  constructor(private store: PantryStore, private opts: VaultOptions = {}) { this.iterations = opts.iterations ?? 600_000; }

  async isSetUp(): Promise<boolean> { return !!(await this.store.getVaultMeta()); }
  isUnlocked(): boolean { return this.key !== null; }

  async setup(passphrase: string): Promise<void> {
    if (passphrase.length < 8) throw new FruitflyError('vault_locked', 'Use at least 8 characters.');
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt, this.iterations);
    const { iv, ciphertext } = await encryptBytes(key, enc.encode(VERIFIER));
    const meta: VaultMeta = { salt, iterations: this.iterations, verifierIv: iv, verifier: ciphertext };
    await this.store.putVaultMeta(meta);
    this.key = key; this.touch();
  }

  async unlock(passphrase: string): Promise<void> {
    const meta = await this.store.getVaultMeta();
    if (!meta) throw new FruitflyError('vault_locked', 'Set up the vault first.');
    const key = await deriveKey(passphrase, meta.salt, meta.iterations);
    try { const v = dec.decode(await decryptBytes(key, meta.verifierIv, meta.verifier)); if (v !== VERIFIER) throw new Error('bad'); } catch { throw new FruitflyError('vault_locked', "That passphrase didn't work."); }
    this.key = key; this.touch();
  }

  lock(): void { this.key = null; if (this.timer) clearTimeout(this.timer); this.timer = null; }

  /** For chrome.storage.session: the raw key while unlocked, wiped on browser close or manual lock. */
  async exportSessionKey(): Promise<ArrayBuffer> { if (!this.key) throw new FruitflyError('vault_locked', 'The vault is locked.'); return subtle().exportKey('raw', this.key); }
  async importSessionKey(raw: ArrayBuffer): Promise<void> { this.key = await subtle().importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); this.touch(); }

  private touch(): void {
    this.lastUse = (this.opts.now ?? Date.now)();
    if (this.timer) clearTimeout(this.timer);
    if (this.opts.autoLockMs) this.timer = setTimeout(() => this.lock(), this.opts.autoLockMs);
  }
  private need(): CryptoKey { if (!this.key) throw new FruitflyError('vault_locked', 'The vault is locked.'); this.touch(); return this.key; }

  async set(key: string, label: string, value: string, o: { requiresApproval?: boolean } = {}): Promise<void> {
    const k = this.need();
    const { iv, ciphertext } = await encryptBytes(k, enc.encode(value));
    await this.store.putVaultField({ key, label, iv, ciphertext, requiresApproval: o.requiresApproval ?? true });
  }
  async list(): Promise<{ key: string; label: string; requiresApproval: boolean }[]> { return (await this.store.listVault()).map((f) => ({ key: f.key, label: f.label, requiresApproval: f.requiresApproval })); }
  async remove(key: string): Promise<void> { await this.store.deleteVaultField(key); }

  /** Called by the tool layer at type time. Sensitive fields need an explicit approval flag from the approval UI. */
  async resolve(key: string, o: { approved?: boolean } = {}): Promise<string> {
    const k = this.need();
    const f = (await this.store.listVault()).find((x: VaultField) => x.key === key);
    if (!f) throw new FruitflyError('unknown', `No vault field "${key}".`);
    if (f.requiresApproval && !o.approved) throw new FruitflyError('permission_needed', 'That field needs your approval first.', { field: key });
    return dec.decode(await decryptBytes(k, f.iv, f.ciphertext));
  }
  get lastUsedAt(): number { return this.lastUse; }
}
