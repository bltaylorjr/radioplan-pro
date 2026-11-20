// Encryption for user accounts (1.5.x multi-user sign-in). Everything runs on this device with the
// browser's built-in Web Crypto; nothing is sent anywhere.
//
// Each user has one random 256-bit data key. Their projects, history and library are sealed with it
// (AES-GCM). The data key itself is only ever stored "wrapped" (encrypted) by:
//   • their password / PIN (PBKDF2-SHA-256, 310 000 rounds),
//   • their recovery code (same method; used for "Forgot password"),
//   • their fingerprint / face / Windows Hello (see biometric.ts),
// so another user of the same device cannot open it, and a forgotten password can be reset only by
// someone holding the recovery code or the enrolled fingerprint.

const te = new TextEncoder(), td = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export const PBKDF2_ROUNDS = 310_000;

export function randomBytes(n: number): Uint8Array { const u = new Uint8Array(n); globalThis.crypto.getRandomValues(u); return u; }
export function b64(u: Uint8Array | ArrayBuffer): string {
  const a = u instanceof Uint8Array ? u : new Uint8Array(u); let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
}
export const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (u: Uint8Array | ArrayBuffer) => b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

/** A wrapped (encrypted) data key. */
export interface Wrapped { iv: string; ct: string }
/** A key wrapped by something typed (password, PIN or recovery code). */
export interface SecretWrap extends Wrapped { salt: string; rounds: number }

export async function newDataKey(): Promise<Uint8Array> { return randomBytes(32); }
export const importAes = (raw: Uint8Array, usages: KeyUsage[] = ['encrypt', 'decrypt']) => subtle().importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, usages);

async function kekFromSecret(secret: string, salt: Uint8Array, rounds: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', te.encode(normalizeSecret(secret)) as BufferSource, 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: rounds }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
/** Recovery codes are typed by people: ignore case, spaces and dashes. Passwords are kept exactly. */
export const normalizeRecovery = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalizeSecret = (s: string) => s.normalize('NFC');

export async function wrapWithKey(kek: CryptoKey, dataKey: Uint8Array): Promise<Wrapped> {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, kek, dataKey as BufferSource);
  return { iv: b64(iv), ct: b64(ct) };
}
/** Throws when the key is wrong (AES-GCM checks it). */
export async function unwrapWithKey(kek: CryptoKey, w: Wrapped): Promise<Uint8Array> {
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: unb64(w.iv) as BufferSource }, kek, unb64(w.ct) as BufferSource));
}
export async function wrapWithSecret(secret: string, dataKey: Uint8Array, rounds = PBKDF2_ROUNDS): Promise<SecretWrap> {
  const salt = randomBytes(16);
  return { ...(await wrapWithKey(await kekFromSecret(secret, salt, rounds), dataKey)), salt: b64(salt), rounds };
}
/** Returns the data key, or null when the password / code is wrong. */
export async function unwrapWithSecret(secret: string, w: SecretWrap): Promise<Uint8Array | null> {
  try { return await unwrapWithKey(await kekFromSecret(secret, unb64(w.salt), w.rounds), w); } catch { return null; }
}
/** Key from a fingerprint / passkey secret (WebAuthn PRF output). */
export async function kekFromBytes(bytes: Uint8Array, info = 'lvplan-user-key'): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', bytes as BufferSource, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32) as BufferSource, info: te.encode(info) as BufferSource }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Recovery code: 20 letters/numbers in 5 groups (about 100 bits), no look-alike characters. */
export function newRecoveryCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = randomBytes(20);
  const s = Array.from(r, (x) => A[x % 32]).join('');
  return s.match(/.{4}/g)!.join('-');
}

// ---------- sealing stored values ----------
/** A value stored encrypted. Files (Blobs) inside it are sealed one by one so big PDFs never become text. */
export interface Sealed { __sealed: 1; iv: ArrayBuffer | Uint8Array; ct: ArrayBuffer; blobs?: { iv: ArrayBuffer | Uint8Array; ct: ArrayBuffer; type: string }[] }
export const isSealed = (v: unknown): v is Sealed => !!v && typeof v === 'object' && (v as Sealed).__sealed === 1;

export interface Cipher { key: CryptoKey }
export async function cipherFor(dataKey: Uint8Array): Promise<Cipher> { return { key: await importAes(dataKey) }; }

const BLOB_TAG = '__lvBlob';
/** Seal any stored value: plain data, typed arrays (as numbers lists) and Blobs. */
export async function seal(c: Cipher, value: unknown): Promise<Sealed> {
  const blobs: Blob[] = [];
  const walk = (v: unknown): unknown => {
    if (typeof Blob !== 'undefined' && v instanceof Blob) { blobs.push(v); return { [BLOB_TAG]: blobs.length - 1 }; }
    if (v instanceof Float32Array) return { __f32: b64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    if (v instanceof Uint8Array) return { __u8: b64(v) };
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { const o: Record<string, unknown> = {}; for (const [k, x] of Object.entries(v)) o[k] = walk(x); return o; }
    return v;
  };
  const text = JSON.stringify(walk(value) ?? null);
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, c.key, te.encode(text) as BufferSource);
  const out: Sealed = { __sealed: 1, iv, ct };
  if (blobs.length) {
    out.blobs = [];
    for (const b of blobs) { const biv = randomBytes(12); out.blobs.push({ iv: biv, type: b.type, ct: await subtle().encrypt({ name: 'AES-GCM', iv: biv as BufferSource }, c.key, await b.arrayBuffer()) }); }
  }
  return out;
}
export async function open<T = unknown>(c: Cipher, s: Sealed): Promise<T> {
  const text = td.decode(await subtle().decrypt({ name: 'AES-GCM', iv: s.iv as BufferSource }, c.key, s.ct));
  const blobs: Blob[] = [];
  for (const b of s.blobs ?? []) blobs.push(new Blob([await subtle().decrypt({ name: 'AES-GCM', iv: b.iv as BufferSource }, c.key, b.ct)], { type: b.type }));
  const back = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(back);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o[BLOB_TAG] === 'number' && Object.keys(o).length === 1) return blobs[o[BLOB_TAG] as number];
      if (typeof o.__f32 === 'string' && Object.keys(o).length === 1) { const u = unb64(o.__f32); return new Float32Array(u.buffer, u.byteOffset, u.byteLength / 4); }
      if (typeof o.__u8 === 'string' && Object.keys(o).length === 1) return unb64(o.__u8);
      const r: Record<string, unknown> = {}; for (const [k, x] of Object.entries(o)) r[k] = back(x); return r;
    }
    return v;
  };
  return back(JSON.parse(text)) as T;
}

// ---------- sharing between users (public-key, so the sender never needs the other user's password) ----------
export interface ShareKeys { pub: JsonWebKey; priv: JsonWebKey }
export async function newShareKeys(): Promise<ShareKeys> {
  const k = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']) as CryptoKeyPair;
  return { pub: await subtle().exportKey('jwk', k.publicKey), priv: await subtle().exportKey('jwk', k.privateKey) };
}
async function shareKek(priv: JsonWebKey, pub: JsonWebKey): Promise<CryptoKey> {
  const a = await subtle().importKey('jwk', priv, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const b = await subtle().importKey('jwk', pub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return subtle().deriveKey({ name: 'ECDH', public: b }, a, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
/** A package only the recipient can open. */
export interface SealedShare { epk: JsonWebKey; iv: string; ct: string }
export async function sealFor(recipientPub: JsonWebKey, value: unknown): Promise<SealedShare> {
  const eph = await newShareKeys();
  const kek = await shareKek(eph.priv, recipientPub);
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, kek, te.encode(JSON.stringify(value)) as BufferSource);
  return { epk: eph.pub, iv: b64(iv), ct: b64(ct) };
}
export async function openShare<T = unknown>(myPriv: JsonWebKey, s: SealedShare): Promise<T> {
  const kek = await shareKek(myPriv, s.epk);
  return JSON.parse(td.decode(await subtle().decrypt({ name: 'AES-GCM', iv: unb64(s.iv) as BufferSource }, kek, unb64(s.ct) as BufferSource))) as T;
}

// ---------- password-protected files (to send a shared project to someone on another device) ----------
export const PROTECTED_FORMAT = 'lvplan-protected/1';
export interface ProtectedFile { format: typeof PROTECTED_FORMAT; hint?: string; salt: string; rounds: number; iv: string; ct: string }
export async function protectText(password: string, text: string, hint?: string): Promise<ProtectedFile> {
  const salt = randomBytes(16), iv = randomBytes(12);
  const kek = await kekFromSecret(password, salt, PBKDF2_ROUNDS);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, kek, te.encode(text) as BufferSource);
  return { format: PROTECTED_FORMAT, ...(hint ? { hint } : {}), salt: b64(salt), rounds: PBKDF2_ROUNDS, iv: b64(iv), ct: b64(ct) };
}
/** Returns null when the password is wrong. */
export async function unprotectText(password: string, f: ProtectedFile): Promise<string | null> {
  try {
    const kek = await kekFromSecret(password, unb64(f.salt), f.rounds);
    return td.decode(await subtle().decrypt({ name: 'AES-GCM', iv: unb64(f.iv) as BufferSource }, kek, unb64(f.ct) as BufferSource));
  } catch { return null; }
}
export const isProtectedFile = (j: unknown): j is ProtectedFile => (j as ProtectedFile)?.format === PROTECTED_FORMAT;
