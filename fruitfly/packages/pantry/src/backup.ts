import { FruitflyError } from '@fruitfly/core';
import { deriveKey, decryptBytes, encryptBytes } from './vault';
import type { PantryStore } from './store';
import type { Chunk } from './types';

const b64 = (u: Uint8Array): string => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const enc = new TextEncoder(); const dec = new TextDecoder();

/** Encrypted backup: one AES-GCM envelope over everything (docs, chunk vectors, profile, notes, vault ciphertexts). */
export async function exportBackup(store: PantryStore, passphrase: string, iterations = 600_000): Promise<Uint8Array> {
  const [docs, chunks, profile, notes, vault, vmeta] = await Promise.all([store.listDocs(), store.allChunks(), store.getProfile(), store.listNotes(), store.listVault(), store.getVaultMeta()]);
  const payload = {
    v: 1,
    docs, profile, notes,
    chunks: chunks.map((c) => ({ ...c, vec: b64(new Uint8Array(c.vec.buffer, c.vec.byteOffset, c.vec.byteLength)) })),
    vault: vault.map((f) => ({ ...f, ciphertext: b64(new Uint8Array(f.ciphertext)), iv: b64(f.iv) })),
    vmeta: vmeta ? { ...vmeta, salt: b64(vmeta.salt), verifierIv: b64(vmeta.verifierIv), verifier: b64(new Uint8Array(vmeta.verifier)) } : null,
  };
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt, iterations);
  const { iv, ciphertext } = await encryptBytes(key, enc.encode(JSON.stringify(payload)));
  return enc.encode(JSON.stringify({ format: 'fruitfly-backup', v: 1, kdf: { salt: b64(salt), iterations }, iv: b64(iv), data: b64(new Uint8Array(ciphertext)) }));
}

export async function importBackup(store: PantryStore, data: Uint8Array, passphrase: string): Promise<void> {
  let env: { format: string; kdf: { salt: string; iterations: number }; iv: string; data: string };
  try { env = JSON.parse(dec.decode(data)); } catch { throw new FruitflyError('unknown', "That isn't a FruitFly backup."); }
  if (env.format !== 'fruitfly-backup') throw new FruitflyError('unknown', "That isn't a FruitFly backup.");
  const key = await deriveKey(passphrase, unb64(env.kdf.salt), env.kdf.iterations);
  let plain: Uint8Array;
  try { const ct = unb64(env.data); plain = await decryptBytes(key, unb64(env.iv), ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer); } catch { throw new FruitflyError('auth', "That passphrase didn't work."); }
  const p = JSON.parse(dec.decode(plain));
  await store.wipe();
  for (const d of p.docs) await store.putDoc(d);
  await store.putChunks(p.chunks.map((c: Chunk & { vec: string }) => { const u = unb64(c.vec); return { ...c, vec: new Int8Array(u.buffer, u.byteOffset, u.byteLength) }; }));
  await store.putProfile(p.profile);
  for (const n of p.notes) await store.putNote(n);
  for (const f of p.vault) { const ct = unb64(f.ciphertext); await store.putVaultField({ ...f, ciphertext: ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer, iv: unb64(f.iv) }); }
  if (p.vmeta) { const v = unb64(p.vmeta.verifier); await store.putVaultMeta({ ...p.vmeta, salt: unb64(p.vmeta.salt), verifierIv: unb64(p.vmeta.verifierIv), verifier: v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer }); }
}
