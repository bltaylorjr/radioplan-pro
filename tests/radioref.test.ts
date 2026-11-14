import { describe, it, expect, beforeAll } from 'vitest';
import { DOMParser as XDOMParser } from '@xmldom/xmldom';
import { envelope, parseResponse, parseWsdl, list, str, num, mapFreq, normCounty, importRrCsv, publicSafetyFreqs, RrError } from '../src/engine/radioref';

beforeAll(() => { (globalThis as unknown as { DOMParser: unknown }).DOMParser = XDOMParser; });
const login = { username: 'bob', password: 'p<&>', appKey: 'KEY1' };
const wrap = (inner: string) => `<?xml version="1.0"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" xmlns:ns1="http://api.radioreference.com/soap2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><SOAP-ENV:Body><ns1:getSubcatFreqsResponse>${inner}</ns1:getSubcatFreqsResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

describe('RadioReference SOAP', () => {
  it('builds an rpc envelope with escaped sign-in and the WSDL part names', () => {
    const x = envelope('urn:x', 'getCountyInfo', [['ctid', 1932]], login, ['ctid_real', 'authInfo']);
    expect(x).toContain('<ns1:getCountyInfo><ctid_real xsi:type="xsd:int">1932</ctid_real>');
    expect(x).toContain('<password xsi:type="xsd:string">p&lt;&amp;&gt;</password>');
    expect(x).toContain('<appKey xsi:type="xsd:string">KEY1</appKey>');
  });
  it('reads endpoint, namespace and parts from the WSDL', () => {
    const w = parseWsdl(`<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" targetNamespace="http://api.radioreference.com/soap2"><message name="getSubcatFreqsRequest"><part name="scid" type="xsd:int"/><part name="authInfo" type="tns:authInfo"/></message><service><port><soap:address location="http://api.radioreference.com/soap2/index.php"/></port></service></definitions>`);
    expect(w.endpoint).toBe('https://api.radioreference.com/soap2/index.php');
    expect(w.ns).toBe('http://api.radioreference.com/soap2');
    expect(w.parts.getSubcatFreqs).toEqual(['scid', 'authInfo']);
  });
  it('parses arrays of structs into frequencies', () => {
    const v = parseResponse(wrap(`<return SOAP-ENC:arrayType="ns1:Freq[2]" xsi:type="ns1:Freqs"><item><fid>1</fid><out>154.43000</out><in>0.00000</in><tone>CSQ</tone><mode>FMN</mode><alpha>FD Disp</alpha><descr>Fire Dispatch</descr><tags SOAP-ENC:arrayType="ns1:Tag[1]"><item><tagId>3</tagId><tagDescr>Fire Dispatch</tagDescr></item></tags></item><item><out>155.475</out><alpha>NLEEC</alpha><tags SOAP-ENC:arrayType="ns1:Tag[0]"/></item></return>`));
    const fs = list(v).map(mapFreq);
    expect(fs).toHaveLength(2);
    expect(fs[0]).toMatchObject({ out: 154.43, tone: 'CSQ', alpha: 'FD Disp', tags: 'Fire Dispatch' });
    expect(fs[1].tags).toBe('');
    expect(str(list(v)[0], 'DESCR')).toBe('Fire Dispatch');
    expect(num(list(v)[0], 'fid')).toBe(1);
  });
  it('turns faults into sign-in / key errors', () => {
    const f = (msg: string) => `<?xml version="1.0"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><SOAP-ENV:Fault><faultcode>SOAP-ENV:Server</faultcode><faultstring>${msg}</faultstring></SOAP-ENV:Fault></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
    expect(() => parseResponse(f('Invalid application key'))).toThrow(RrError);
    try { parseResponse(f('Invalid username or password')); } catch (e) { expect((e as RrError).kind).toBe('login'); }
    try { parseResponse(f('Invalid application key')); } catch (e) { expect((e as RrError).kind).toBe('key'); }
  });
  it('matches county names across spellings', () => {
    expect(normCounty('Buncombe County')).toBe(normCounty('Buncombe'));
    expect(normCounty('Richmond (City)')).toBe(normCounty('Richmond city'));
    expect(normCounty('Richmond city')).not.toBe(normCounty('Richmond County'));
    expect(normCounty('James City County')).toBe(normCounty('James City'));
  });
  it('imports a RadioReference CSV and finds public-safety channels', () => {
    const csv = 'Frequency Output,Frequency Input,FCC Callsign,Agency/Category,Description,Alpha Tag,PL Tone,Mode,Class Station Code,Tag\n154.43,,KNFX123,Fire,Fire Dispatch,FD Disp,CSQ,FMN,BM,Fire Dispatch\n453.1,458.1,,Public Works,Streets,PW,123.0 PL,FMN,RM,Public Works\n151.25,,,Schools,Buses,BUS,,FMN,,Schools';
    const { dl, added, kind } = importRrCsv(csv, 'NC', 'Buncombe', null);
    expect(kind).toBe('freqs'); expect(added).toBe(3);
    expect(dl.groups[0].subcats.map((s) => s.name)).toEqual(['Fire', 'Public Works', 'Schools']);
    expect(publicSafetyFreqs(dl).map((f) => f.out)).toEqual([154.43, 453.1]);
    const tg = importRrCsv('Decimal,Hex,Alpha Tag,Mode,Description,Tag,Category\n1001,3E9,FD Disp,D,Fire Dispatch,Fire Dispatch,Fire\n1002,3EA,PD Enc,DE,Police,Law Dispatch,Law', 'NC', 'Buncombe', dl);
    expect(tg.kind).toBe('talkgroups'); expect(tg.dl.systems[0].talkgroups[1].enc).toBe(2);
    expect(tg.dl.groups).toHaveLength(1);
  });
});

import { bandsInUse, worstCaseMHz, bdaAdvice, donorSites, freqChoices, bandOf } from '../src/engine/rrdesign';
describe('RadioReference in design', () => {
  const dl = {
    key: 'k', state: 'NC', county: 'Buncombe', ctid: 1, fetchedAt: '', warnings: [], source: 'api' as const,
    groups: [{ name: 'Buncombe County', kind: 'county' as const, subcats: [{ name: 'Fire', freqs: [{ out: 154.43, in: null, tone: '', mode: 'FMN', alpha: 'FD', descr: 'Fire Dispatch', callsign: '', tags: 'Fire Dispatch', enc: 0 }] }, { name: 'Schools', freqs: [{ out: 151.25, in: null, tone: '', mode: 'FMN', alpha: 'BUS', descr: 'Buses', callsign: '', tags: 'Schools', enc: 0 }] }] }],
    systems: [{ sid: 1, name: 'VIPER', type: 'P25', city: '', sysid: '', talkgroups: [], sites: [{ number: '001', name: 'Mount Pisgah', county: 'Buncombe', lat: 35.42, lon: -82.75, rangeMi: 20, nac: '', freqs: [{ freq: 853.5125, use: 'a', lcn: '' }, { freq: 856.2375, use: '', lcn: '' }] }] }],
  };
  it('finds bands, worst case and advice', () => {
    expect(bandOf(155)?.id).toBe('vhf'); expect(bandOf(860)?.id).toBe('800'); expect(bandOf(100)).toBeUndefined();
    const b = bandsInUse(dl);
    expect(b.map((x) => x.band.id)).toEqual(['vhf', '800']);
    expect(b[0].channels).toBe(1); // schools not public safety
    expect(worstCaseMHz(b)).toBeCloseTo(856.2375);
    expect(bdaAdvice(b)[0]).toContain('2 bands');
  });
  it('ranks donor sites with a plausible signal', () => {
    const d = donorSites(dl, { lat: 35.5951, lon: -82.5515 });
    expect(d).toHaveLength(1);
    expect(d[0].km).toBeGreaterThan(20); expect(d[0].km).toBeLessThan(30);
    expect(d[0].estDbm).toBeLessThan(-40); expect(d[0].estDbm).toBeGreaterThan(-110);
  });
  it('lists picker choices', () => { expect(freqChoices(dl)).toHaveLength(4); });
});
