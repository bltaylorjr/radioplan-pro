// Fingerprint / face / Windows Hello sign-in.
//  • Android app: the phone's fingerprint sensor through the app (Android Keystore key that only opens
//    after a fingerprint; the user's data key is wrapped by it).
//  • Windows app and browsers: Windows Hello or the phone's screen lock through WebAuthn (passkeys).
//    Where the device supports the passkey "PRF" secret, the data key is wrapped by that secret.
//    Otherwise it is wrapped by a key kept on this device that the app only uses after the fingerprint
//    check signs a fresh challenge (checked here against the key saved when it was set up).
// Nothing leaves the device and no server is used.
import { b64, b64url, kekFromBytes, randomBytes, unb64, unb64url, unwrapWithKey, wrapWithKey, type Wrapped } from './vault';
import { accountsDb } from './accountsStore';

export type BioWrap =
  | { kind: 'prf'; credId: string; prfSalt: string; wrap: Wrapped; label: string }
  | { kind: 'device'; credId: string; spki: string; alg: number; wrap: Wrapped; label: string }
  | { kind: 'android'; alias: string; iv: string; ct: string; label: string };

interface AndroidBio {
  bioAvailable?(): string;
  bioEnroll?(req: string, alias: string, dataKeyB64: string): void;
  bioUnlock?(req: string, alias: string, ivB64: string, ctB64: string): void;
  bioCancel?(): void;
  bioRemove?(alias: string): void;
}
const android = (): AndroidBio | null => (typeof window !== 'undefined' && (window as unknown as { RadioPlanAndroid?: AndroidBio }).RadioPlanAndroid) || null;

export type BioSupport = { kind: 'android' | 'webauthn'; label: string } | { kind: null; why: string };

/** What this device offers. */
export async function bioSupport(): Promise<BioSupport> {
  const a = android();
  if (a?.bioAvailable) {
    const s = a.bioAvailable();
    if (s === 'yes') return { kind: 'android', label: 'Fingerprint' };
    if (s === 'not-enrolled') return { kind: null, why: 'Add a fingerprint in the phone\'s Settings → Security first, then come back here.' };
    return { kind: null, why: 'This phone has no fingerprint sensor the app can use. Use your password or PIN.' };
  }
  const PKC = typeof window !== 'undefined' ? (window as unknown as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } }).PublicKeyCredential : undefined;
  if (!PKC || !globalThis.isSecureContext || location.protocol === 'file:') return { kind: null, why: 'Fingerprint sign-in needs the installed Windows or Android app, or the online version. On a flash drive copy use your password or PIN.' };
  const ok = await PKC.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false);
  if (!ok) return { kind: null, why: 'Windows Hello (fingerprint, face or PIN) is not set up on this computer. Set it up in Windows Settings → Accounts → Sign-in options, then come back here.' };
  const ua = navigator.userAgent;
  return { kind: 'webauthn', label: /Windows/i.test(ua) ? 'Windows Hello' : /Android/i.test(ua) ? 'Fingerprint or face' : /Mac|iPhone|iPad/i.test(ua) ? 'Touch ID or Face ID' : 'Fingerprint or face' };
}

// ---------- Android bridge ----------
type Pending = { res: (v: string) => void; rej: (e: Error) => void };
const pending = new Map<string, Pending>();
if (typeof window !== 'undefined') {
  (window as unknown as { __lvBio?: (id: string, ok: boolean, payload: string) => void }).__lvBio = (id, ok, payload) => {
    const p = pending.get(id); if (!p) return; pending.delete(id);
    if (ok) p.res(payload); else p.rej(new Error(payload || 'Fingerprint not recognized'));
  };
}
function androidCall(start: (req: string) => void): Promise<string> {
  const req = b64url(randomBytes(9));
  return new Promise((res, rej) => { pending.set(req, { res, rej }); start(req); });
}
export function cancelBio() { android()?.bioCancel?.(); for (const [k, p] of pending) { p.rej(new Error('Cancelled')); pending.delete(k); } }

// ---------- WebAuthn helpers ----------
interface PrfOut { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }
const prfInput = (salt: string) => ({ prf: { eval: { first: unb64(salt) } } });
async function sha256(u: Uint8Array | ArrayBuffer) { return new Uint8Array(await crypto.subtle.digest('SHA-256', u as BufferSource)); }
/** DER ECDSA signature → raw r||s (what Web Crypto expects). */
export function derToRaw(der: Uint8Array, size = 32): Uint8Array {
  let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f;
  const read = () => { if (der[i++] !== 0x02) throw new Error('bad signature'); const len = der[i++]; let v = der.subarray(i, i + len); i += len; while (v.length > size && v[0] === 0) v = v.subarray(1); const out = new Uint8Array(size); out.set(v, size - v.length); return out; };
  const r = read(), s = read(); const raw = new Uint8Array(size * 2); raw.set(r, 0); raw.set(s, size); return raw;
}
/** Check a WebAuthn sign-in answer against the public key saved at setup. */
export async function verifyAssertion(spki: string, alg: number, challenge: Uint8Array, authData: Uint8Array, clientDataJSON: Uint8Array, sig: Uint8Array): Promise<boolean> {
  const cd = JSON.parse(new TextDecoder().decode(clientDataJSON)) as { type: string; challenge: string };
  if (cd.type !== 'webauthn.get' || cd.challenge !== b64url(challenge)) return false;
  if (!(authData[32] & 0x01) || !(authData[32] & 0x04)) return false; // user present + verified (fingerprint / face / PIN)
  const signed = new Uint8Array(authData.length + 32); signed.set(authData, 0); signed.set(await sha256(clientDataJSON), authData.length);
  if (alg === -7) {
    const k = await crypto.subtle.importKey('spki', unb64(spki) as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, derToRaw(sig) as BufferSource, signed as BufferSource);
  }
  if (alg === -257) {
    const k = await crypto.subtle.importKey('spki', unb64(spki) as BufferSource, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, sig as BufferSource, signed as BufferSource);
  }
  return false;
}
/** Device-held wrapping keys (non-extractable, so they cannot be copied out of the browser). */
async function deviceKey(credId: string, create: boolean): Promise<CryptoKey | null> {
  const d = await accountsDb();
  const got = await d.get<CryptoKey>('devkeys', credId);
  if (got || !create) return got ?? null;
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await d.put('devkeys', credId, k); return k;
}
export async function forgetBio(w: BioWrap | undefined) {
  if (!w) return;
  if (w.kind === 'android') android()?.bioRemove?.(w.alias);
  else if (w.kind === 'device') await (await accountsDb()).del('devkeys', w.credId).catch(() => undefined);
}

/** Set up fingerprint / face sign-in for a user; returns what to save on the account. */
export async function enrollBio(user: { id: string; name: string }, dataKey: Uint8Array): Promise<BioWrap> {
  const sup = await bioSupport();
  if (!sup.kind) throw new Error(sup.why);
  if (sup.kind === 'android') {
    const alias = `lvplan.user.${user.id}`;
    const out = JSON.parse(await androidCall((req) => android()!.bioEnroll!(req, alias, b64(dataKey)))) as { iv: string; ct: string };
    return { kind: 'android', alias, iv: out.iv, ct: out.ct, label: sup.label };
  }
  const prfSalt = b64(randomBytes(32));
  const cred = await navigator.credentials.create({ publicKey: {
    rp: { name: 'LvPlan Pro' },
    user: { id: randomBytes(16) as BufferSource, name: user.name, displayName: user.name },
    challenge: randomBytes(32) as BufferSource,
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 120000, attestation: 'none',
    extensions: prfInput(prfSalt) as AuthenticationExtensionsClientInputs,
  } }) as PublicKeyCredential | null;
  if (!cred) throw new Error('Fingerprint set-up was cancelled');
  const credId = b64url(cred.rawId);
  const ext = cred.getClientExtensionResults() as PrfOut;
  let secret = ext.prf?.results?.first;
  if (!secret && ext.prf?.enabled) {
    // Some devices only give the secret at sign-in: ask once more now.
    const a = await navigator.credentials.get({ publicKey: { challenge: randomBytes(32) as BufferSource, allowCredentials: [{ type: 'public-key', id: cred.rawId }], userVerification: 'required', timeout: 120000, extensions: prfInput(prfSalt) as AuthenticationExtensionsClientInputs } }) as PublicKeyCredential | null;
    secret = (a?.getClientExtensionResults() as PrfOut | undefined)?.prf?.results?.first;
  }
  if (secret) return { kind: 'prf', credId, prfSalt, wrap: await wrapWithKey(await kekFromBytes(new Uint8Array(secret)), dataKey), label: sup.label };
  const resp = cred.response as AuthenticatorAttestationResponse;
  const spki = resp.getPublicKey?.(); const alg = resp.getPublicKeyAlgorithm?.();
  if (!spki || (alg !== -7 && alg !== -257)) throw new Error('This device\'s fingerprint sign-in is not supported. Use your password or PIN.');
  const key = (await deviceKey(credId, true))!;
  return { kind: 'device', credId, spki: b64(spki), alg, wrap: await wrapWithKey(key, dataKey), label: sup.label };
}

/** Sign in with the fingerprint / face; returns the user's data key. */
export async function unlockBio(w: BioWrap): Promise<Uint8Array> {
  if (w.kind === 'android') {
    const a = android(); if (!a?.bioUnlock) throw new Error('Fingerprint sign-in works in the Android app only.');
    return unb64(await androidCall((req) => a.bioUnlock!(req, w.alias, w.iv, w.ct)));
  }
  const challenge = randomBytes(32);
  const got = await navigator.credentials.get({ publicKey: {
    challenge: challenge as BufferSource, allowCredentials: [{ type: 'public-key', id: unb64url(w.credId) as BufferSource }],
    userVerification: 'required', timeout: 120000,
    ...(w.kind === 'prf' ? { extensions: prfInput(w.prfSalt) as AuthenticationExtensionsClientInputs } : {}),
  } }) as PublicKeyCredential | null;
  if (!got) throw new Error('Cancelled');
  if (w.kind === 'prf') {
    const secret = (got.getClientExtensionResults() as PrfOut).prf?.results?.first;
    if (!secret) throw new Error('The fingerprint check did not give its key. Use your password or PIN.');
    return unwrapWithKey(await kekFromBytes(new Uint8Array(secret)), w.wrap);
  }
  const r = got.response as AuthenticatorAssertionResponse;
  const ok = await verifyAssertion(w.spki, w.alg, challenge, new Uint8Array(r.authenticatorData), new Uint8Array(r.clientDataJSON), new Uint8Array(r.signature));
  if (!ok) throw new Error('The fingerprint check could not be confirmed. Use your password or PIN.');
  const key = await deviceKey(w.credId, false);
  if (!key) throw new Error('Fingerprint sign-in was set up on another copy of the app. Use your password or PIN, then set it up again here.');
  return unwrapWithKey(key, w.wrap);
}
