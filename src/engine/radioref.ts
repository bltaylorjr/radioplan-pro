// RadioReference.com database (Premium web service API, SOAP).
// The user signs in with their own RadioReference Premium username/password; the app key identifies LvPlan Pro.
// When the device is online, a county's frequencies, trunked systems, sites and talkgroups are downloaded once and
// kept on this device (IndexedDB) so they can be used offline. Nothing is shared or synced to other devices.
import { kvGet as kvGetPlain, kvSet as kvSetPlain, kvKeys } from './projectdb';
import { tauri } from './update';
import { parseCsv } from './csv';

// ---------------------------------------------------------------- protected storage
// Frequencies, talkgroups and the sign-in are protected information. They are kept only on this device, encrypted
// (AES-256-GCM) with a device key that is created here and can't be read out (non-extractable Web Crypto key).
// They are never part of project files, backups, reports, Sync Devices, the online version's files or the repository.
const KEY_ID = 'radioref.devicekey.v1';
interface Sealed { sealed: 1; iv: Uint8Array; data: ArrayBuffer }
let devKey: Promise<CryptoKey> | null = null;
function deviceKey(): Promise<CryptoKey> {
  if (!devKey) devKey = (async () => {
    const have = await kvGetPlain<CryptoKey>(KEY_ID);
    if (have && typeof have === 'object' && 'algorithm' in have) return have;
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await kvSetPlain(KEY_ID, k);
    return k;
  })();
  devKey.catch(() => { devKey = null; });
  return devKey;
}
export async function seal(v: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deviceKey(), new TextEncoder().encode(JSON.stringify(v)));
  return { sealed: 1, iv, data };
}
export async function unseal<T>(s: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: s.iv }, await deviceKey(), s.data);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
async function kvGet<T>(k: string): Promise<T | undefined> {
  const v = await kvGetPlain<Sealed>(k);
  if (!v || (v as Sealed).sealed !== 1) return undefined;
  try { return await unseal<T>(v); } catch { return undefined; }
}
const kvSet = async (k: string, v: unknown) => kvSetPlain(k, v === undefined ? undefined : await seal(v));
/** Removes the sign-in, every download and the device key (the saved data can't be read again). */
export async function wipeAll() {
  for (const k of await kvKeys('radioref.')) await kvSetPlain(k, undefined);
  devKey = null;
}

export const RR_WSDL = 'https://api.radioreference.com/soap2/?wsdl&v=latest&s=rpc';
export const RR_DEFAULT_ENDPOINT = 'https://api.radioreference.com/soap2/index.php';
export const RR_DEFAULT_NS = 'http://api.radioreference.com/soap2';

export interface RrLogin { username: string; password: string; appKey: string }
export interface RrFreq { out: number | null; in: number | null; tone: string; mode: string; alpha: string; descr: string; callsign: string; tags: string; enc: number }
export interface RrSubcat { name: string; freqs: RrFreq[] }
export interface RrGroup { name: string; kind: 'county' | 'agency'; subcats: RrSubcat[] }
export interface RrSite { number: string; name: string; county: string; lat: number | null; lon: number | null; rangeMi: number | null; nac: string; freqs: { freq: number; use: string; lcn: string }[] }
export interface RrTalkgroup { dec: number; alpha: string; descr: string; mode: string; tag: string; cat: string; enc: number }
export interface RrSystem { sid: number; name: string; type: string; city: string; sysid: string; sites: RrSite[]; talkgroups: RrTalkgroup[] }
export interface RrDownload {
  key: string; state: string; county: string; ctid: number; fetchedAt: string;
  groups: RrGroup[]; systems: RrSystem[]; warnings: string[]; source: 'api' | 'csv';
}
export const LOGIN_KEY = 'radioref.login.v1';
const DL_PREFIX = 'radioref.dl.v1:';
export const dlKey = (state: string, county: string) => `${DL_PREFIX}${state}|${normCounty(county)}`;

/** "Buncombe County" / "Buncombe" / "Richmond (City)" / "Richmond city" → comparable key. */
export function normCounty(s: string): string {
  let t = (s || '').toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const city = /\bcity\b/.test(t) && !/city county/.test(t) && !/^james city/.test(t) && !/^charles city/.test(t);
  t = t.replace(/\b(county|parish|borough|city of|independent city)\b/g, ' ');
  if (city) t = t.replace(/\bcity\b/g, ' ') + ' city';
  return t.replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- transport
/** Posts to the RadioReference API through the app (Windows or Android), because browsers block it (no CORS). */
type AndroidHttp = { httpPost?: (id: string, url: string, body: string, soapAction: string) => void; httpGet?: (id: string, url: string) => void };
const android = (): AndroidHttp | null => (typeof window !== 'undefined' && (window as unknown as { RadioPlanAndroid?: AndroidHttp }).RadioPlanAndroid) || null;
let seq = 0;
const waiting = new Map<string, (ok: boolean, text: string) => void>();
if (typeof window !== 'undefined') (window as unknown as { __rrHttpDone: unknown }).__rrHttpDone = (id: string, ok: boolean, b64: string) => {
  const f = waiting.get(id); waiting.delete(id);
  let text = ''; try { text = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); } catch { text = ''; }
  f?.(ok, text);
};
export const canReachApi = () => !!tauri() || !!android()?.httpPost;

async function http(url: string, body: string | null, soapAction = ''): Promise<string> {
  if (!url.startsWith('https://api.radioreference.com/')) throw new Error('Address refused');
  const t = tauri();
  if (t) return (await t.invoke('rr_http', { url, body: body ?? '', soapAction, post: body !== null })) as string;
  const a = android();
  if (a?.httpPost && a.httpGet) {
    const id = 'rr' + ++seq;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { waiting.delete(id); rej(new Error('RadioReference did not answer (timed out)')); }, 60000);
      waiting.set(id, (ok, text) => { clearTimeout(timer); if (ok) res(text); else rej(new Error(text || 'No connection')); });
      if (body === null) a.httpGet!(id, url); else a.httpPost!(id, url, body, soapAction);
    });
  }
  // Plain browser (online version / flash drive): works only if RadioReference allows it.
  let r: Response;
  try { r = await fetch(url, body === null ? {} : { method: 'POST', body, headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: soapAction } }); }
  catch { throw new Error('This web browser is not allowed to talk to RadioReference directly. Use the installed Windows or Android app to download, or import a CSV file you saved from RadioReference.com.'); }
  const text = await r.text();
  if (!r.ok && !/Fault/.test(text)) throw new Error(`RadioReference HTTP ${r.status}`);
  return text;
}

// ---------------------------------------------------------------- SOAP
const kidsOf = (e: Element): Element[] => Array.from(e.childNodes).filter((n): n is Element => n.nodeType === 1);
const attrsOf = (e: Element): Attr[] => Array.from({ length: e.attributes.length }, (_, i) => e.attributes.item(i)!);
const elems = (d: Document | Element) => Array.from(d.getElementsByTagName('*'));
export interface Wsdl { endpoint: string; ns: string; parts: Record<string, string[]> }
let wsdlCache: Wsdl | null = null;
export function parseWsdl(xml: string): Wsdl {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const all = (n: string) => elems(doc).filter((e) => e.localName === n);
  const defs = all('definitions')[0];
  const ns = defs?.getAttribute('targetNamespace') || RR_DEFAULT_NS;
  const addr = all('address').map((a) => a.getAttribute('location')).find((x) => !!x) || RR_DEFAULT_ENDPOINT;
  const parts: Record<string, string[]> = {};
  for (const m of all('message')) {
    const name = (m.getAttribute('name') || '').replace(/Request$/, '');
    parts[name] = kidsOf(m).filter((c) => c.localName === 'part').map((c) => c.getAttribute('name') || '');
  }
  return { endpoint: addr.replace(/^http:/, 'https:'), ns, parts };
}
async function wsdl(): Promise<Wsdl> {
  if (wsdlCache) return wsdlCache;
  try { wsdlCache = parseWsdl(await http(RR_WSDL, null)); }
  catch { wsdlCache = { endpoint: RR_DEFAULT_ENDPOINT, ns: RR_DEFAULT_NS, parts: {} }; }
  return wsdlCache;
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
type Arg = [string, string | number];
export function envelope(ns: string, method: string, args: Arg[], login: RrLogin, partNames?: string[]): string {
  const plain = args.map(([n, v], i) => {
    const name = partNames?.filter((p) => p !== 'authInfo')[i] || n;
    return `<${name} xsi:type="xsd:${typeof v === 'number' ? 'int' : 'string'}">${esc(String(v))}</${name}>`;
  }).join('');
  const auth = `<authInfo xsi:type="ns1:authInfo"><appKey xsi:type="xsd:string">${esc(login.appKey)}</appKey><username xsi:type="xsd:string">${esc(login.username)}</username><password xsi:type="xsd:string">${esc(login.password)}</password><version xsi:type="xsd:string">latest</version><style xsi:type="xsd:string">rpc</style></authInfo>`;
  return `<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${esc(ns)}" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><SOAP-ENV:Body><ns1:${method}>${plain}${auth}</ns1:${method}></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
}
export type Val = string | Val[] | { [k: string]: Val };
/** Turns a SOAP (rpc/encoded) element into plain values: arrays for SOAP arrays / repeated "item", objects otherwise. */
export function toVal(e: Element): Val {
  const kids = kidsOf(e);
  if (!kids.length) return e.textContent ?? '';
  const isArr = attrsOf(e).some((a) => a.localName === 'arrayType' || (a.localName === 'type' && /Array|\[\]/.test(a.value)))
    || (kids.length > 0 && kids.every((k) => k.localName === 'item'))
    || (kids.length > 1 && kids.every((k) => k.localName === kids[0].localName) && /s$|List$/.test(e.localName));
  if (isArr) return kids.map(toVal);
  const o: { [k: string]: Val } = {};
  for (const k of kids) o[k.localName] = toVal(k);
  return o;
}
export class RrError extends Error { constructor(msg: string, public kind: 'login' | 'key' | 'net' | 'other' = 'other') { super(msg); } }
export function parseResponse(xml: string): Val {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const all = elems(doc);
  const fault = all.find((e) => e.localName === 'Fault');
  if (fault) {
    const fs = elems(fault).find((e) => e.localName === 'faultstring')?.textContent || 'RadioReference refused the request';
    const kind = /key/i.test(fs) ? 'key' : /(user|password|login|auth|subscri|premium)/i.test(fs) ? 'login' : 'other';
    throw new RrError(fs, kind);
  }
  const body = all.find((e) => e.localName === 'Body');
  const resp = body ? kidsOf(body)[0] : undefined;
  if (!resp) throw new RrError('Unexpected answer from RadioReference');
  const ret = kidsOf(resp)[0];
  return ret ? toVal(ret) : '';
}
export async function call(method: string, args: Arg[], login: RrLogin): Promise<Val> {
  const w = await wsdl();
  const xml = await http(w.endpoint, envelope(w.ns, method, args, login, w.parts[method]), `${w.ns}#${method}`);
  return parseResponse(xml);
}

// ---------------------------------------------------------------- field helpers (tolerant of API versions)
type Obj = { [k: string]: Val };
const isObj = (v: Val | undefined): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
export function get(o: Val | undefined, ...names: string[]): Val | undefined {
  if (!isObj(o)) return undefined;
  for (const n of names) { const k = Object.keys(o).find((x) => x.toLowerCase() === n.toLowerCase()); if (k !== undefined) return o[k]; }
  return undefined;
}
export const str = (o: Val | undefined, ...n: string[]) => { const v = get(o, ...n); return typeof v === 'string' ? v.trim() : ''; };
export const num = (o: Val | undefined, ...n: string[]) => { const v = parseFloat(str(o, ...n)); return Number.isFinite(v) ? v : null; };
export const list = (o: Val | undefined, ...n: string[]): Val[] => { const v = n.length ? get(o, ...n) : o; return Array.isArray(v) ? v : isObj(v) ? (Object.values(v).every((x) => isObj(x)) && Object.keys(v).every((k) => k === 'item') ? Object.values(v) : [v]) : []; };
const tagText = (o: Val | undefined) => list(o, 'tags').map((t) => str(t, 'tagDescr', 'descr') || (typeof t === 'string' ? t : '')).filter(Boolean).join(', ');

export function mapFreq(f: Val): RrFreq {
  return {
    out: num(f, 'out', 'freq', 'frequency'), in: num(f, 'in', 'input'),
    tone: str(f, 'tone', 'pl', 'ctcss'), mode: str(f, 'mode'), alpha: str(f, 'alpha', 'alphaTag'),
    descr: str(f, 'descr', 'description'), callsign: str(f, 'callsign', 'call'), tags: tagText(f) || str(f, 'tag'), enc: num(f, 'enc') ?? 0,
  };
}
export function mapSite(s: Val, countyName: (ctid: number) => string): RrSite {
  return {
    number: str(s, 'siteNumber', 'rfss') || str(s, 'siteId'), name: str(s, 'siteDescr', 'descr'),
    county: countyName(num(s, 'siteCtid', 'ctid') ?? 0), lat: num(s, 'lat'), lon: num(s, 'lon'), rangeMi: num(s, 'range'), nac: str(s, 'nac', 'NAC'),
    freqs: list(s, 'siteFreqs', 'freqs').map((f) => ({ freq: num(f, 'freq', 'out') ?? 0, use: str(f, 'use'), lcn: str(f, 'lcn') })).filter((f) => f.freq > 0),
  };
}
export function mapTalkgroup(t: Val, cats: Map<number, string>): RrTalkgroup {
  return { dec: num(t, 'tgDec', 'dec') ?? 0, alpha: str(t, 'tgAlpha', 'alpha'), descr: str(t, 'tgDescr', 'descr'), mode: str(t, 'tgMode', 'mode'), tag: tagText(t), cat: cats.get(num(t, 'tgCid') ?? -1) ?? '', enc: num(t, 'enc') ?? 0 };
}

// ---------------------------------------------------------------- high level
export const loadLogin = async (): Promise<RrLogin | null> => (await kvGet<RrLogin>(LOGIN_KEY)) ?? null;
export const saveLogin = (l: RrLogin | null) => kvSet(LOGIN_KEY, l ?? undefined);
export const effectiveKey = (l: RrLogin) => l.appKey.trim();

export async function testLogin(login: RrLogin): Promise<string> {
  const u = await call('getUserData', [], login);
  const exp = str(u, 'subExpireDate', 'expireDate', 'expires');
  return exp ? `Signed in as ${str(u, 'username') || login.username}. Premium until ${exp}.` : `Signed in as ${login.username}.`;
}

const STATE_IDS: Record<string, number> = { NC: 37, SC: 45, GA: 13, TN: 47, VA: 51 };
async function findStid(code: string, login: RrLogin): Promise<number> {
  try {
    const c = await call('getCountryInfo', [['coid', 1]], login);
    const s = list(c, 'stateList', 'states').find((x) => str(x, 'stateCode', 'code').toUpperCase() === code);
    const id = num(s, 'stid');
    if (id) return id;
  } catch (e) { if (e instanceof RrError && e.kind !== 'other') throw e; }
  return STATE_IDS[code];
}

export interface DlOptions { trunked: boolean; statewide: boolean; signal?: { cancelled: boolean }; progress?: (msg: string, frac: number) => void }
export async function downloadCounty(state: string, county: string, login0: RrLogin, o: DlOptions): Promise<RrDownload> {
  const login = { ...login0, appKey: effectiveKey(login0) };
  if (!login.appKey) throw new RrError('No app key entered yet', 'key');
  const say = o.progress ?? (() => undefined);
  const stop = () => { if (o.signal?.cancelled) throw new RrError('Download stopped'); };
  const warnings: string[] = [];
  say('Finding the state…', 0.02);
  const stid = await findStid(state, login);
  const st = await call('getStateInfo', [['stid', stid]], login);
  const counties = list(st, 'countyList', 'counties');
  const want = normCounty(county);
  const hit = counties.find((c) => normCounty(str(c, 'countyName', 'name')) === want) ?? counties.find((c) => normCounty(str(c, 'countyName', 'name')).startsWith(want));
  const ctid = num(hit, 'ctid');
  if (!ctid) throw new RrError(`RadioReference has no county named “${county}” in ${state}`);
  const ctName = new Map<number, string>(counties.map((c) => [num(c, 'ctid') ?? 0, str(c, 'countyName', 'name')]));
  say(`Reading ${str(hit, 'countyName') || county}…`, 0.06);
  const ci = await call('getCountyInfo', [['ctid', ctid]], login);

  // Conventional frequencies: the county's categories, plus (optional) statewide agencies.
  const jobs: { group: RrGroup; scid: number; name: string }[] = [];
  const addCats = (cats: Val[], g: RrGroup) => { for (const c of cats) for (const sc of list(c, 'subcats')) { const scid = num(sc, 'scid'); if (scid) jobs.push({ group: g, scid, name: [str(c, 'cName', 'name'), str(sc, 'scName', 'name')].filter(Boolean).join(' · ') }); } };
  const groups: RrGroup[] = [];
  const cg: RrGroup = { name: `${str(hit, 'countyName') || county} County`.replace(/County County$/, 'County'), kind: 'county', subcats: [] };
  groups.push(cg); addCats(list(ci, 'cats'), cg);
  const agencies = [...list(ci, 'agencyList', 'agencies'), ...(o.statewide ? list(st, 'agencyList', 'agencies') : [])];
  const seenA = new Set<number>();
  for (const [i, a] of agencies.entries()) {
    stop(); const aid = num(a, 'aid'); if (!aid || seenA.has(aid)) continue; seenA.add(aid);
    say(`Agency ${str(a, 'aName', 'name')}…`, 0.08 + 0.12 * (i / Math.max(1, agencies.length)));
    try { const ai = await call('getAgencyInfo', [['aid', aid]], login); const g: RrGroup = { name: str(a, 'aName', 'name') || str(ai, 'aName'), kind: 'agency', subcats: [] }; groups.push(g); addCats(list(ai, 'cats'), g); }
    catch (e) { if (e instanceof RrError && e.kind !== 'other') throw e; warnings.push(`Agency ${str(a, 'aName')}: ${(e as Error).message}`); }
  }
  for (const [i, j] of jobs.entries()) {
    stop(); say(`Frequencies: ${j.name}`, 0.2 + 0.45 * (i / Math.max(1, jobs.length)));
    try { const fr = await call('getSubcatFreqs', [['scid', j.scid]], login); j.group.subcats.push({ name: j.name, freqs: list(fr).map(mapFreq).filter((f) => f.out !== null) }); }
    catch (e) { if (e instanceof RrError && e.kind !== 'other') throw e; warnings.push(`${j.name}: ${(e as Error).message}`); }
  }

  // Trunked systems: sites (all for county systems; only this county's for statewide ones) and talkgroups.
  const systems: RrSystem[] = [];
  if (o.trunked) {
    const countyTrs = list(ci, 'trsList', 'systems'), stateTrs = o.statewide ? list(st, 'trsList', 'systems') : [];
    const all = [...countyTrs.map((s) => ({ s, local: true })), ...stateTrs.map((s) => ({ s, local: false }))];
    const seen = new Set<number>();
    for (const [i, { s, local }] of all.entries()) {
      stop(); const sid = num(s, 'sid'); if (!sid || seen.has(sid)) continue; seen.add(sid);
      const name = str(s, 'sName', 'name');
      say(`Trunked system ${name}…`, 0.65 + 0.33 * (i / Math.max(1, all.length)));
      try {
        const d = await call('getTrsDetails', [['sid', sid]], login).catch(() => '' as Val);
        const sites = list(await call('getTrsSites', [['sid', sid]], login)).map((x) => mapSite(x, (c) => ctName.get(c) ?? ''));
        const mine = local ? sites : sites.filter((x) => normCounty(x.county) === want);
        if (!local && !mine.length) continue;
        let tgs: RrTalkgroup[] = [];
        try {
          const cats = new Map<number, string>(list(d, 'talkgroupCats', 'tgCats').map((c) => [num(c, 'tgCid') ?? -1, str(c, 'tgCname', 'name')]));
          tgs = list(await call('getTrsTalkgroups', [['sid', sid], ['tgCid', 0], ['tgTag', 0], ['tgDec', 0]], login)).map((t) => mapTalkgroup(t, cats));
        } catch (e) { if (e instanceof RrError && e.kind !== 'other') throw e; warnings.push(`${name} talkgroups: ${(e as Error).message}`); }
        systems.push({ sid, name: name || str(d, 'sName'), type: str(s, 'sType') || str(d, 'sType', 'sTypeDescr'), city: str(s, 'sCity') || str(d, 'sCity'), sysid: str(d, 'sysid', 'sysId'), sites: mine, talkgroups: tgs });
      } catch (e) { if (e instanceof RrError && e.kind !== 'other') throw e; warnings.push(`${name}: ${(e as Error).message}`); }
    }
  }
  say('Saving on this device…', 0.99);
  const dl: RrDownload = { key: dlKey(state, county), state, county, ctid, fetchedAt: new Date().toISOString(), groups: groups.filter((g) => g.subcats.length), systems, warnings, source: 'api' };
  await kvSet(dl.key, dl);
  return dl;
}

export const saveDownload = (d: RrDownload) => kvSet(d.key, d);
export const loadDownload = (state: string, county: string) => kvGet<RrDownload>(dlKey(state, county)).then((v) => v ?? null).catch(() => null);
export const deleteDownload = (key: string) => kvSet(key, undefined);
export async function listDownloads(): Promise<{ key: string; state: string; county: string; fetchedAt: string; nFreq: number; nTg: number }[]> {
  const ks = await kvKeys(DL_PREFIX).catch(() => [] as string[]);
  const out = [];
  for (const k of ks) { const d = await kvGet<RrDownload>(k); if (d) out.push({ key: k, state: d.state, county: d.county, fetchedAt: d.fetchedAt, nFreq: countFreqs(d), nTg: d.systems.reduce((a, s) => a + s.talkgroups.length, 0) }); }
  return out.sort((a, b) => a.state.localeCompare(b.state) || a.county.localeCompare(b.county));
}
export const countFreqs = (d: RrDownload) => d.groups.reduce((a, g) => a + g.subcats.reduce((b, s) => b + s.freqs.length, 0), 0);

// ---------------------------------------------------------------- CSV saved from RadioReference.com (works without the API)
const col = (h: string[], ...names: RegExp[]) => h.findIndex((x) => names.some((n) => n.test(x)));
export function importRrCsv(text: string, state: string, county: string, prev: RrDownload | null): { dl: RrDownload; added: number; kind: 'freqs' | 'talkgroups' } {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  if (rows.length < 2) throw new Error('The file has no rows');
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const base: RrDownload = prev ?? { key: dlKey(state, county), state, county, ctid: 0, fetchedAt: new Date().toISOString(), groups: [], systems: [], warnings: [], source: 'csv' };
  const dl: RrDownload = structuredClone(base);
  dl.fetchedAt = new Date().toISOString();
  const iDec = col(h, /^dec/, /^tg ?dec/, /^decimal/);
  if (iDec >= 0) {
    const iA = col(h, /alpha/), iD = col(h, /^desc/), iM = col(h, /^mode/), iT = col(h, /^tag/), iC = col(h, /categ/);
    const tgs = rows.slice(1).map((r) => ({ dec: parseInt(r[iDec], 10), alpha: r[iA] ?? '', descr: r[iD] ?? '', mode: r[iM] ?? '', tag: r[iT] ?? '', cat: r[iC] ?? '', enc: /e$/i.test(r[iM] ?? '') ? 2 : 0 })).filter((t) => Number.isFinite(t.dec));
    dl.systems.push({ sid: 0, name: 'Talkgroups imported from file', type: '', city: '', sysid: '', sites: [], talkgroups: tgs });
    return { dl, added: tgs.length, kind: 'talkgroups' };
  }
  const iF = col(h, /^frequency output/, /^freq/, /^output/, /^frequency/);
  if (iF < 0) throw new Error('This does not look like a RadioReference frequency or talkgroup file (no Frequency or Decimal column)');
  const iIn = col(h, /input/), iCs = col(h, /call/), iAg = col(h, /agency|category/), iD = col(h, /^desc/), iA = col(h, /alpha/), iTone = col(h, /tone|pl/), iM = col(h, /^mode/), iT = col(h, /^tag/);
  const bySub = new Map<string, RrFreq[]>();
  for (const r of rows.slice(1)) {
    const out = parseFloat(r[iF]); if (!Number.isFinite(out)) continue;
    const g = (iAg >= 0 ? r[iAg] : '') || 'Imported';
    const f: RrFreq = { out, in: iIn >= 0 && parseFloat(r[iIn]) ? parseFloat(r[iIn]) : null, tone: r[iTone] ?? '', mode: r[iM] ?? '', alpha: r[iA] ?? '', descr: r[iD] ?? '', callsign: r[iCs] ?? '', tags: r[iT] ?? '', enc: /e$/i.test(r[iM] ?? '') ? 2 : 0 };
    bySub.set(g, [...(bySub.get(g) ?? []), f]);
  }
  const group: RrGroup = { name: 'Imported from file', kind: 'county', subcats: [...bySub].map(([name, freqs]) => ({ name, freqs })) };
  dl.groups.push(group);
  return { dl, added: [...bySub.values()].reduce((a, f) => a + f.length, 0), kind: 'freqs' };
}

/** Public-safety channels (fire, law, EMS, interop, mutual aid): what an ERCES / BDA must usually pass. */
export const PUBLIC_SAFETY = /fire|law|police|sheriff|ems|rescue|interop|mutual aid|emergency|dispatch|tactical|public works|corrections|security|hospital|9-?1-?1/i;
export function publicSafetyFreqs(d: RrDownload): (RrFreq & { where: string })[] {
  const out: (RrFreq & { where: string })[] = [];
  for (const g of d.groups) for (const s of g.subcats) for (const f of s.freqs) if (PUBLIC_SAFETY.test(`${f.tags} ${s.name} ${g.name} ${f.descr}`)) out.push({ ...f, where: `${g.name} · ${s.name}` });
  return out;
}
