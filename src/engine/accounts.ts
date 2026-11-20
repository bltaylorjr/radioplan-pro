// User accounts on this device: sign-in with a password or PIN, fingerprint / face, and a recovery
// code for "Forgot password". Sign-in is off until someone turns it on (Projects & settings → Users &
// Sign-in), so a single-user install keeps working exactly as before.
//
// Privacy: each user's projects, history and library live in their own database, sealed with their own
// key. The key is only stored locked (see vault.ts), so another user of this device cannot open them,
// and the device owner cannot reset someone else's password; they can only remove that user.
import { cipherFor, newDataKey, newRecoveryCode, newShareKeys, normalizeRecovery, unwrapWithKey, unwrapWithSecret, wrapWithKey, wrapWithSecret, importAes, sealFor, openShare, type Cipher, type SecretWrap, type Wrapped, type SealedShare } from './vault';
import { enrollBio, unlockBio, forgetBio, type BioWrap } from './biometric';
import { accountsDb } from './accountsStore';
import { DEVICE_DB, useUserStorage, resealAll, stopSealing, deleteUserDatabase, kvGet, kvSet, kvKeys } from './projectdb';

export type SecretKind = 'pin' | 'password';
export interface Account {
  id: string; name: string; color: string; created: number;
  /** The first user: can add and remove users and turn sign-in off. */
  owner?: boolean;
  /** This user's database (the first user keeps the device's original one, so nothing moves). */
  db: string;
  kind: SecretKind; pw: SecretWrap; recovery: SecretWrap; bio?: BioWrap;
  /** For sharing projects with this user: others lock packages with the public half. */
  sharePub: JsonWebKey; sharePriv: Wrapped;
  fails?: number; lockedUntil?: number; lastSignIn?: number; hint?: string;
}
export interface Registry { v: 1; rev: number; accounts: Account[]; lastUser?: string }
export interface Session { account: Account; cipher: Cipher; dataKey: Uint8Array; sharePriv: JsonWebKey }

const LS = 'lvplan.accounts.v1';
const COLORS = ['#2563eb', '#16a34a', '#d97706', '#db2777', '#7c3aed', '#0891b2', '#dc2626', '#4b5563'];
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const te = new TextEncoder(), td = new TextDecoder();

// ---------- registry ----------
const empty = (): Registry => ({ v: 1, rev: 0, accounts: [] });
export async function loadRegistry(): Promise<Registry> {
  let a: Registry | null = null, b: Registry | null = null;
  try { const s = localStorage.getItem(LS); if (s) a = JSON.parse(s); } catch { /* storage off */ }
  try { b = (await (await accountsDb()).get<Registry>('kv', 'registry')) ?? null; } catch { /* no db */ }
  const best = [a, b].filter((x): x is Registry => !!x && Array.isArray(x.accounts)).sort((x, y) => y.rev - x.rev)[0];
  // Two copies: if one is lost (browser data cleared, damaged), the other puts it back.
  if (best && (!a || a.rev !== best.rev || !b || b.rev !== best.rev)) await writeRegistry(best);
  return best ?? empty();
}
async function writeRegistry(r: Registry) {
  try { localStorage.setItem(LS, JSON.stringify(r)); } catch { /* the database copy still has it */ }
  try { await (await accountsDb()).put('kv', 'registry', r); } catch { /* the quick copy still has it */ }
}
async function saveRegistry(fn: (r: Registry) => void): Promise<Registry> {
  const r = await loadRegistry(); fn(r); r.rev++; await writeRegistry(r); return r;
}
/** Is sign-in turned on? (Quick check from the quick copy, used before the app draws.) */
export function signInOnQuick(): boolean { try { const s = localStorage.getItem(LS); return !!s && JSON.parse(s).accounts?.length > 0; } catch { return false; } }
export async function signInOn(): Promise<boolean> { return (await loadRegistry()).accounts.length > 0; }

// ---------- session ----------
let session: Session | null = null;
const listeners = new Set<() => void>();
export const currentSession = () => session;
export const currentUser = () => session?.account ?? null;
export function onSessionChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
/** Per-user name for small browser settings (the first user keeps the original names). */
export const userKey = (k: string) => (session && !session.account.owner ? `${k}.${session.account.id}` : k);

async function start(acc: Account, dataKey: Uint8Array): Promise<Session> {
  const cipher = await cipherFor(dataKey);
  const sharePriv = JSON.parse(td.decode(await unwrapWithKey(await importAes(dataKey), acc.sharePriv))) as JsonWebKey;
  useUserStorage(acc.db, cipher);
  session = { account: acc, cipher, dataKey, sharePriv };
  await saveRegistry((r) => { const a = r.accounts.find((x) => x.id === acc.id); if (a) { a.fails = 0; a.lockedUntil = 0; a.lastSignIn = Date.now(); } r.lastUser = acc.id; });
  listeners.forEach((f) => f());
  return session;
}
/** Sign out: the key is forgotten and the app starts again at the sign-in screen. */
export function signOut() { session = null; location.reload(); }

async function makeAccount(name: string, secret: string, kind: SecretKind, owner: boolean, colorIndex: number, hint?: string): Promise<{ account: Account; dataKey: Uint8Array; recoveryCode: string }> {
  const n = name.trim(); if (!n) throw new Error('Type a name for this user');
  checkSecret(secret, kind);
  const id = rid(), dataKey = await newDataKey(), recoveryCode = newRecoveryCode();
  const sk = await newShareKeys();
  const account: Account = {
    id, name: n, color: COLORS[colorIndex % COLORS.length], created: Date.now(), owner: owner || undefined,
    db: owner ? DEVICE_DB : `${DEVICE_DB}.u.${id}`, kind,
    pw: await wrapWithSecret(secret, dataKey), recovery: await wrapWithSecret(normalizeRecovery(recoveryCode), dataKey),
    sharePub: sk.pub, sharePriv: await wrapWithKey(await importAes(dataKey), te.encode(JSON.stringify(sk.priv))),
    ...(hint?.trim() ? { hint: hint.trim().slice(0, 60) } : {}),
  };
  return { account, dataKey, recoveryCode };
}
/** Plain-language rules: PIN = 4 to 12 numbers; password = at least 6 characters. */
export function checkSecret(secret: string, kind: SecretKind) {
  if (kind === 'pin' && !/^\d{4,12}$/.test(secret)) throw new Error('A PIN is 4 to 12 numbers');
  if (kind === 'password' && secret.length < 6) throw new Error('A password needs at least 6 characters');
}

/** Turn sign-in on: makes the first user (the owner), who keeps all the projects already on this device,
 *  and locks them with the new key. */
export async function enableSignIn(name: string, secret: string, kind: SecretKind, hint?: string, onProgress?: (m: string) => void): Promise<{ session: Session; recoveryCode: string }> {
  const reg = await loadRegistry();
  if (reg.accounts.length) throw new Error('Sign-in is already on');
  const { account, dataKey, recoveryCode } = await makeAccount(name, secret, kind, true, 0, hint);
  await saveRegistry((r) => { r.accounts.push(account); r.lastUser = account.id; });
  const s = await start(account, dataKey);
  onProgress?.('Locking your projects with your new key…');
  await resealAll(onProgress);
  try { localStorage.removeItem('radioplan.project.v1'); } catch { /* ignore */ } // the unlocked quick copy
  return { session: s, recoveryCode };
}
/** The owner adds another user (that person types their own password or PIN). */
export async function addUser(name: string, secret: string, kind: SecretKind, hint?: string): Promise<{ account: Account; recoveryCode: string }> {
  if (!session?.account.owner) throw new Error('Only the first user (the owner) can add users');
  const reg = await loadRegistry();
  if (reg.accounts.some((a) => a.name.toLowerCase() === name.trim().toLowerCase())) throw new Error('There is already a user with that name');
  const { account, recoveryCode } = await makeAccount(name, secret, kind, false, reg.accounts.length, hint);
  await saveRegistry((r) => { r.accounts.push(account); });
  return { account, recoveryCode };
}

// ---------- signing in ----------
export const MAX_TRIES = 5;
/** Wait after too many wrong tries: 30 s, then doubling, up to 15 minutes. */
export const lockoutMs = (fails: number) => (fails < MAX_TRIES ? 0 : Math.min(15 * 60_000, 30_000 * 2 ** (fails - MAX_TRIES)));
export function lockedFor(acc: Account, now = Date.now()): number { return Math.max(0, (acc.lockedUntil ?? 0) - now); }
async function wrong(acc: Account) {
  const r = await saveRegistry((x) => { const a = x.accounts.find((y) => y.id === acc.id); if (a) { a.fails = (a.fails ?? 0) + 1; const ms = lockoutMs(a.fails); a.lockedUntil = ms ? Date.now() + ms : 0; } });
  const a = r.accounts.find((y) => y.id === acc.id)!;
  const left = MAX_TRIES - (a.fails ?? 0);
  return new Error(left > 0 ? `That ${acc.kind === 'pin' ? 'PIN' : 'password'} is not right. ${left} ${left === 1 ? 'try' : 'tries'} left before a short wait.` : `Too many wrong tries. Wait ${Math.ceil(lockoutMs(a.fails ?? 0) / 1000)} seconds, or use Forgot ${acc.kind === 'pin' ? 'PIN' : 'password'}.`);
}
const fresh = async (id: string) => { const a = (await loadRegistry()).accounts.find((x) => x.id === id); if (!a) throw new Error('That user was removed'); return a; };
export async function signInWithSecret(accId: string, secret: string): Promise<Session> {
  const acc = await fresh(accId);
  const wait = lockedFor(acc); if (wait) throw new Error(`Too many wrong tries. Wait ${Math.ceil(wait / 1000)} seconds.`);
  const key = await unwrapWithSecret(secret, acc.pw);
  if (!key) throw await wrong(acc);
  return start(acc, key);
}
export async function signInWithBio(accId: string): Promise<Session> {
  const acc = await fresh(accId);
  if (!acc.bio) throw new Error('Fingerprint sign-in is not set up for this user');
  return start(acc, await unlockBio(acc.bio));
}

// ---------- forgot password / PIN ----------
/** Check a recovery code; returns the key needed to set a new password (does not sign in yet). */
export async function checkRecovery(accId: string, code: string): Promise<Uint8Array> {
  const acc = await fresh(accId);
  const wait = lockedFor(acc); if (wait) throw new Error(`Too many wrong tries. Wait ${Math.ceil(wait / 1000)} seconds.`);
  const key = await unwrapWithSecret(normalizeRecovery(code), acc.recovery);
  if (!key) { await wrong(acc); throw new Error('That recovery code is not right. Check each letter and number on the sheet you wrote it on.'); }
  return key;
}
/** Use the fingerprint to prove who you are, then set a new password. */
export async function checkBioForReset(accId: string): Promise<Uint8Array> {
  const acc = await fresh(accId);
  if (!acc.bio) throw new Error('Fingerprint sign-in is not set up for this user');
  return unlockBio(acc.bio);
}
/** Set a new password / PIN with the key from the recovery code or fingerprint, then sign in. */
export async function resetPassword(accId: string, key: Uint8Array, secret: string, kind: SecretKind, hint?: string): Promise<Session> {
  checkSecret(secret, kind);
  const pw = await wrapWithSecret(secret, key);
  const r = await saveRegistry((x) => { const a = x.accounts.find((y) => y.id === accId); if (a) { a.pw = pw; a.kind = kind; a.hint = hint?.trim() ? hint.trim().slice(0, 60) : undefined; a.fails = 0; a.lockedUntil = 0; } });
  return start(r.accounts.find((a) => a.id === accId)!, key);
}

// ---------- changes while signed in ----------
const mine = () => { if (!session) throw new Error('Sign in first'); return session; };
async function updateMe(fn: (a: Account) => void) {
  const s = mine();
  const r = await saveRegistry((x) => { const a = x.accounts.find((y) => y.id === s.account.id); if (a) fn(a); });
  s.account = r.accounts.find((a) => a.id === s.account.id)!; listeners.forEach((f) => f());
}
export async function changePassword(secret: string, kind: SecretKind, hint?: string) { checkSecret(secret, kind); const pw = await wrapWithSecret(secret, mine().dataKey); await updateMe((a) => { a.pw = pw; a.kind = kind; a.hint = hint?.trim() ? hint.trim().slice(0, 60) : undefined; }); }
/** A new recovery code; the old one stops working. */
export async function makeNewRecoveryCode(): Promise<string> { const code = newRecoveryCode(); const w = await wrapWithSecret(normalizeRecovery(code), mine().dataKey); await updateMe((a) => { a.recovery = w; }); return code; }
export async function setUpBio(): Promise<string> { const s = mine(); const w = await enrollBio(s.account, s.dataKey); await forgetBio(s.account.bio); await updateMe((a) => { a.bio = w; }); return w.label; }
export async function removeBio() { const s = mine(); await forgetBio(s.account.bio); await updateMe((a) => { delete a.bio; }); }
export async function rename(name: string) { if (!name.trim()) throw new Error('Type a name'); await updateMe((a) => { a.name = name.trim(); }); }

/** Owner only: remove another user and everything they saved on this device. Cannot be undone. */
export async function removeUser(accId: string) {
  const s = mine(); if (!s.account.owner) throw new Error('Only the owner can remove users');
  const reg = await loadRegistry(); const acc = reg.accounts.find((a) => a.id === accId);
  if (!acc) return; if (acc.owner) throw new Error('The owner cannot be removed');
  await forgetBio(acc.bio);
  await deleteUserDatabase(acc.db);
  for (const k of await kvKeys(`share.inbox.${accId}.`)) await kvSet(k, undefined);
  await saveRegistry((r) => { r.accounts = r.accounts.filter((a) => a.id !== accId); if (r.lastUser === accId) r.lastUser = s.account.id; });
}
/** Owner only, when no other users are left: unlock the projects again and go back to no sign-in. */
export async function disableSignIn(onProgress?: (m: string) => void) {
  const s = mine(); if (!s.account.owner) throw new Error('Only the owner can turn sign-in off');
  const reg = await loadRegistry(); if (reg.accounts.length > 1) throw new Error('Remove the other users first');
  stopSealing();
  await resealAll(onProgress);
  await forgetBio(s.account.bio);
  try { localStorage.removeItem(LS); } catch { /* ignore */ }
  try { await (await accountsDb()).del('kv', 'registry'); } catch { /* ignore */ }
  session = null;
}

// ---------- sharing projects with other users on this device ----------
export interface InboxItem { key: string; kind: 'invite' | 'update'; from: { id: string; name: string }; at: number; teamId: string; projectName: string; project: unknown; members: TeamMember[] }
export interface TeamMember { id: string; name: string; device?: string }
interface InboxPayload { kind: 'invite' | 'update'; from: { id: string; name: string }; at: number; teamId: string; projectName: string; project: unknown; members: TeamMember[] }
const inboxKey = (to: string, teamId: string, kind: string) => `share.inbox.${to}.${kind}.${teamId}`;
/** Put a locked copy of a project in another user's "Shared with you" (only they can open it). */
export async function sendToUser(toId: string, kind: 'invite' | 'update', teamId: string, project: { meta?: { name?: string } }, members: TeamMember[]) {
  const s = mine();
  const to = (await loadRegistry()).accounts.find((a) => a.id === toId); if (!to) throw new Error('That user is not on this device');
  const payload: InboxPayload = { kind, from: { id: s.account.id, name: s.account.name }, at: Date.now(), teamId, projectName: project.meta?.name ?? 'Project', project, members };
  await kvSet(inboxKey(toId, teamId, kind), { to: toId, sealed: await sealFor(to.sharePub, payload) });
}
export async function readInbox(): Promise<InboxItem[]> {
  const s = mine(); const out: InboxItem[] = [];
  for (const key of await kvKeys(`share.inbox.${s.account.id}.`)) {
    const v = await kvGet<{ sealed: SealedShare }>(key); if (!v?.sealed) continue;
    try { out.push({ key, ...(await openShare<InboxPayload>(s.sharePriv, v.sealed)) }); } catch { /* not for this key */ }
  }
  return out.sort((a, b) => b.at - a.at);
}
export const dropInbox = (key: string) => kvSet(key, undefined);
export async function otherUsers(): Promise<Account[]> { const me = session?.account.id; return (await loadRegistry()).accounts.filter((a) => a.id !== me); }

/** Which of this user's projects belong to which shared team (team id → project id). */
const LINKS = 'team.links.v1';
export const teamLinks = async () => (await kvGet<Record<string, string>>(LINKS)) ?? {};
export const setTeamLinks = (l: Record<string, string>) => kvSet(LINKS, l);
export async function linkTeam(teamId: string, projectId: string) { const l = await teamLinks(); l[teamId] = projectId; await kvSet(LINKS, l); }
