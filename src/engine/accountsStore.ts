// Small database for the list of users on this device (names and their locked keys) and the
// device-held fingerprint keys. Kept apart from project storage so it can be read before sign-in.
const NAME = 'lvplan-accounts';
let dbp: Promise<IDBDatabase> | null = null;
export interface AccountsDb {
  get<T>(store: 'kv' | 'devkeys', k: string): Promise<T | undefined>;
  put(store: 'kv' | 'devkeys', k: string, v: unknown): Promise<void>;
  del(store: 'kv' | 'devkeys', k: string): Promise<void>;
}
function open(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('No storage')); return; }
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('devkeys'); };
    r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
const tx = <T,>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void) => open().then((d) => new Promise<T>((res, rej) => {
  const t = d.transaction(store, mode); const q = fn(t.objectStore(store));
  t.oncomplete = () => res((q ? q.result : undefined) as T); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
}));
const api: AccountsDb = {
  get: (store, k) => tx(store, 'readonly', (s) => s.get(k)),
  put: (store, k, v) => tx(store, 'readwrite', (s) => { s.put(v, k); }),
  del: (store, k) => tx(store, 'readwrite', (s) => { s.delete(k); }),
};
export const accountsDb = async (): Promise<AccountsDb> => api;
