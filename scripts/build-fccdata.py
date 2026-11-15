#!/usr/bin/env python3
"""Build the app's offline FCC and FAA data from the raw public files.

Input: a folder with the files the "FCC and FAA public data" workflow publishes on the fccdata pre-release
(asr-5state.zip, uls-*-5state.zip, faa-apt-csv.zip, faa-cycle.txt).
Row layouts (see src/engine/fccdata.ts):
  asr: [regNo, lat, lon, ownerIx, type, overallAglM, groundM, overallAmslM, status C|G, faaStudy, city, address, lighting, usi]
  lic: [call, nameIx, service, expires, granted, [[MHz, stationClass, erpW, locationNo]], emissions, phone, file, usi]
  loc: [licIx, lat, lon, locationNo, F|M|T.., groundM, structureM, asrNo, name, radiusKm]
Output: src/data/fcc/<state>.ts (towers + licenses per state) and src/data/fcc/airports.ts, each a gzip+base64 JSON string.
Run: python3 -I scripts/build-fccdata.py <raw folder> <repo folder>
"""
import base64, collections, csv, datetime, gzip, io, json, os, sys, zipfile

RAW, REPO = sys.argv[1], sys.argv[2]
OUT = os.path.join(REPO, 'src', 'data', 'fcc')
os.makedirs(OUT, exist_ok=True)
STATES = ['NC', 'SC', 'GA', 'TN', 'VA']
# Airports in neighbouring states can be within the FAA notice distance of a site near the state line.
APT_STATES = set(STATES) | {'AL', 'FL', 'MS', 'AR', 'MO', 'KY', 'WV', 'MD', 'DC', 'OH', 'IN', 'IL', 'DE', 'PA'}

def rows(z, name):
    if name not in z.namelist(): return []
    return [l.rstrip('\r').split('|') for l in z.read(name).decode('latin-1').split('\n') if l.strip()]

def dms(d, m, s, h):
    try: v = float(d) + float(m or 0) / 60 + float(s or 0) / 3600
    except ValueError: return None
    return -v if h in ('S', 'W') else v

def fnum(x):
    try: return float(x)
    except (TypeError, ValueError): return None

def ymd(s):  # MM/DD/YYYY -> YYYYMMDD int
    try: m, d, y = s.split('/'); return int(y + m + d)
    except ValueError: return 0

per = {s: {'lic': [], 'licIx': {}, 'names': [], 'nameIx': {}, 'loc': [], 'cty': collections.defaultdict(set), 'asr': []} for s in STATES}

def name_ix(S, n):
    if n not in S['nameIx']: S['nameIx'][n] = len(S['names']); S['names'].append(n)
    return S['nameIx'][n]

# ---------- ASR (antenna structures) ----------
z = zipfile.ZipFile(os.path.join(RAW, 'asr-5state.zip'))
owners = {r[4]: r[9].strip() for r in rows(z, 'EN.dat') if len(r) > 9 and r[5] == 'O'}
coords = {}
for r in rows(z, 'CO.dat'):
    if len(r) > 14 and r[5] == 'T': coords[r[4]] = (dms(r[6], r[7], r[8], r[9]), dms(r[11], r[12], r[13], r[14]))
nasr = 0
for r in rows(z, 'RA.dat'):
    if len(r) < 38 or r[8] not in ('C', 'G') or r[25] not in per: continue
    c = coords.get(r[4]);
    if not c or c[0] is None or c[1] is None: continue
    S = per[r[25]]
    S['asr'].append([int(r[3]) if r[3].isdigit() else r[3], round(c[0], 5), round(c[1], 5), name_ix(S, owners.get(r[4], '')), r[32].strip(),
                     fnum(r[30]), fnum(r[29]), fnum(r[31]), r[8], r[34].strip(), r[24].strip().title(), r[23].strip(), r[37].strip(), int(r[4]) if r[4].isdigit() else 0])
    nasr += 1
print('ASR structures', nasr)

# ---------- ULS (licenses) ----------
SVC_FILES = ['LMpriv', 'LMcomm', 'micro', 'paging']
nlic = nloc = nfr = 0
for f in SVC_FILES:
    z = zipfile.ZipFile(os.path.join(RAW, f'uls-{f}-5state.zip'))
    hd = {r[1]: r for r in rows(z, 'HD.dat') if len(r) > 9 and r[5] == 'A'}
    lic_name, lic_phone = {}, {}
    for r in rows(z, 'EN.dat'):
        if len(r) > 12 and r[5] == 'L' and r[1] in hd: lic_name[r[1]] = r[7].strip(); lic_phone[r[1]] = r[12].strip()
    freqs = collections.defaultdict(dict)
    for r in rows(z, 'FR.dat'):
        if len(r) < 17 or r[1] not in hd: continue
        mhz = fnum(r[10]);
        if not mhz: continue
        loc = int(r[6]) if r[6].isdigit() else 0
        k = (round(mhz, 5), r[8].strip(), loc)
        erp = fnum(r[16]) or fnum(r[15]) or 0
        if k not in freqs[r[1]] or erp > freqs[r[1]][k]: freqs[r[1]][k] = erp
    emis = collections.defaultdict(set)
    for r in rows(z, 'EM.dat'):
        if len(r) > 9 and r[1] in hd and r[9].strip(): emis[r[1]].add(r[9].strip())
    for r in rows(z, 'LO.dat'):
        if len(r) < 43 or r[1] not in hd or r[14] not in per: continue
        S, usi = per[r[14]], r[1]
        if usi not in S['licIx']:
            h = hd[usi]
            fl = sorted(freqs.get(usi, {}).items())
            S['licIx'][usi] = len(S['lic'])
            S['lic'].append([h[4], name_ix(S, lic_name.get(usi, '')), h[6], ymd(h[8]), ymd(h[7]),
                             [[k[0], k[1], round(v, 1), k[2]] for k, v in fl[:150]], ','.join(sorted(emis.get(usi, ()))[:12]), lic_phone.get(usi, ''), f, int(usi) if usi.isdigit() else 0])
            nlic += 1; nfr += len(fl)
        li = S['licIx'][usi]
        lat, lon = dms(r[19], r[20], r[21], r[22]), dms(r[23], r[24], r[25], r[26])
        kind = r[6].strip()
        if lat is not None and lon is not None:
            asr = r[37].strip()
            S['loc'].append([li, round(lat, 5), round(lon, 5), int(r[8]) if r[8].isdigit() else 0, kind, fnum(r[18]), fnum(r[39]) or fnum(r[38]),
                             int(asr) if asr.isdigit() else None, (r[42].strip() or r[11].strip() or r[12].strip()).title()[:60], fnum(r[15])])
            nloc += 1
        elif kind == 'M' and r[13].strip():
            S['cty'][r[13].strip().title()].add(li)
print('ULS licenses', nlic, 'locations', nloc, 'frequency rows', nfr)

cycle = open(os.path.join(RAW, 'faa-cycle.txt')).read().strip() if os.path.exists(os.path.join(RAW, 'faa-cycle.txt')) else ''
built = datetime.date.today().isoformat()

def write_ts(path, const, obj, comment):
    raw = json.dumps(obj, separators=(',', ':')).encode()
    gz = gzip.compress(raw, 9, mtime=0)
    with open(path, 'w') as fh:
        fh.write(f'// {comment}\n// Generated by scripts/build-fccdata.py on {built}; do not edit by hand. gzip + base64 of JSON ({len(raw)} bytes unpacked).\n')
        fh.write(f'export const {const} = "{base64.b64encode(gz).decode()}";\n')
    print(path, 'json', len(raw), 'gz', len(gz))

for s in STATES:
    S = per[s]
    write_ts(os.path.join(OUT, f'{s.lower()}.ts'), 'FCC_GZ_B64', {
        'v': 1, 'state': s, 'built': built,
        'names': S['names'], 'asr': S['asr'], 'lic': S['lic'], 'loc': S['loc'],
        'cty': {k: sorted(v) for k, v in sorted(S['cty'].items())},
    }, f'FCC public data for {s}: Antenna Structure Registrations (constructed and granted) and active ULS licenses (land mobile, microwave, paging) with locations in {s}.')

# ---------- FAA airports (NASR 28-day subscription) ----------
az = zipfile.ZipFile(os.path.join(RAW, 'faa-apt-csv.zip'))
def table(n): return list(csv.DictReader(io.StringIO(az.read(n).decode('latin-1'))))
apts = {}
for a in table('APT_BASE.csv'):
    if a['STATE_CODE'] not in APT_STATES or a['ARPT_STATUS'] not in ('O', '') or a['SITE_TYPE_CODE'] not in ('A', 'H', 'C'): continue
    apts[a['SITE_NO']] = {'id': a['ARPT_ID'], 'name': a['ARPT_NAME'].title(), 'city': a['CITY'].title(), 'st': a['STATE_CODE'], 't': a['SITE_TYPE_CODE'],
                          'use': a['FACILITY_USE_CODE'], 'own': a['OWNERSHIP_TYPE_CODE'], 'mil': a['MIL_LNDG_FLAG'] == 'Y' or a['JOINT_USE_FLAG'] == 'Y',
                          'lat': round(float(a['LAT_DECIMAL']), 6), 'lon': round(float(a['LONG_DECIMAL']), 6), 'el': fnum(a['ELEV']), 'rw': [], 'ils': False}
ends = collections.defaultdict(dict)
for e in table('APT_RWY_END.csv'):
    if e['SITE_NO'] in apts:
        if e['ILS_TYPE'].strip(): apts[e['SITE_NO']]['ils'] = True
        if e['LAT_DECIMAL'] and e['LONG_DECIMAL']:
            ends[(e['SITE_NO'], e['RWY_ID'])][e['RWY_END_ID']] = [round(float(e['LAT_DECIMAL']), 6), round(float(e['LONG_DECIMAL']), 6), fnum(e['RWY_END_ELEV'])]
for r in table('APT_RWY.csv'):
    a = apts.get(r['SITE_NO']);
    if not a: continue
    ln = fnum(r['RWY_LEN']) or 0
    pts = list(ends.get((r['SITE_NO'], r['RWY_ID']), {}).values())
    a['rw'].append([r['RWY_ID'], ln, pts[:2]])
out = []
for a in apts.values():
    out.append([a['id'], a['name'], a['city'], a['st'], a['t'], a['use'], a['own'], 1 if a['mil'] else 0, 1 if a['ils'] else 0, a['lat'], a['lon'], a['el'], a['rw']])
write_ts(os.path.join(OUT, 'airports.ts'), 'APT_GZ_B64', {'v': 1, 'cycle': cycle, 'built': built, 'apt': out},
         f'FAA airports, heliports and seaplane bases (NASR 28-day subscription, cycle {cycle}) in and around NC, SC, GA, TN and VA, with runway ends.')
print('airports', len(out))
