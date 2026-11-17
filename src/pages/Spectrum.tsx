import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, downloadText, safeName } from '../store';
import { Card, Stat } from '../components/ui';
import { DropZone } from '../components/DropZone';
import { uid } from '../defaults';
import { RECEIVERS, detect, openHackRF, openRtlSdr, openSim, openTinySA, parseSweepFile, pickSerial, pickUsb, webSerialOk, webUsbOk, type Detected, type Driver } from '../engine/sdr';
import { gradeRf, checkMask, ercesItems, overall, type MaskId, type RfBench } from '../engine/certification';
import { gridTest } from '../engine/signal';
import { CertList, useSaveCert } from '../components/CertReport';
import { acpr, channelPower, checkLimit, corrected, danl, findPeaks, intermodHits, nearest, noiseFloor, NO_CORR, occupiedBw, PRESETS, toUnit, traceStep, type Corrections, type LimitPoint, type Sweep, type TraceMode, type Unit } from '../engine/spectrum';

const fmtHz = (hz: number) => (Math.abs(hz) >= 1e9 ? `${(hz / 1e9).toFixed(6)} GHz` : Math.abs(hz) >= 1e6 ? `${(hz / 1e6).toFixed(4)} MHz` : `${(hz / 1e3).toFixed(2)} kHz`);
const UNIT_LABEL: Record<Unit, string> = { dBm: 'dBm', dBuV: 'dBµV', 'dBuV/m': 'dBµV/m', mW: 'mW', uV: 'µV' };
interface Marker { id: string; hz: number; delta?: string }
export interface SavedSweep { id: string; at: string; device: string; start: number; stop: number; dbm: number[]; calibrated: boolean; rbwHz: number; note: string; lat?: number; lon?: number; test?: string }
type TestId = 'self' | 'cal' | 'floor' | 'uplink' | 'osc' | 'donor' | 'downlink' | 'hunt' | 'im' | 'mask' | 'obw';
const TESTS: { id: TestId; title: string; what: string }[] = [
  { id: 'self', title: 'Analyzer self-test', what: 'Measures the built-in test signals and checks that the frequency, level, channel power and intermod readings come out right.' },
  { id: 'cal', title: 'Calibrate with a known signal', what: 'Feed a signal generator (or a known transmitter through a calibrated attenuator) of known level and frequency; the level and frequency errors are saved as corrections.' },
  { id: 'floor', title: 'Noise floor and sensitivity', what: 'Terminate the input (50 Ω load) and compare the measured floor with the expected −174 dBm/Hz + RBW + noise figure.' },
  { id: 'uplink', title: 'BDA uplink noise (ERCES)', what: 'Measures the noise the booster puts out in the uplink band. It must be low enough not to desensitize the donor site (licensee limit; FCC 90.219).' },
  { id: 'osc', title: 'BDA oscillation / out-of-band check', what: 'Looks for a wide hump or strong spurs that show the booster is oscillating (poor isolation) or amplifying outside its band.' },
  { id: 'donor', title: 'Donor signal by channel', what: 'Measures each project channel at the donor antenna, for the BDA gain setting and the Emergency Radio page.' },
  { id: 'downlink', title: 'Downlink level at a test point', what: 'Checks the strongest public-safety channel against the in-building target (−95 dBm, IFC 510 / NFPA 1225).' },
  { id: 'hunt', title: 'Interference hunt', what: 'Max hold with peak tracking and a tone that rises with the level, to walk toward the source.' },
  { id: 'im', title: 'Intermodulation check', what: 'Works out 3rd and 5th order products of the signals found and flags any that land on another signal or a project channel.' },
  { id: 'mask', title: 'Limit line / emission mask', what: 'Pass or fail against a limit line you set (upper or lower), with the worst margin.' },
  { id: 'obw', title: 'Carrier: channel power, occupied bandwidth, ACPR', what: 'Channel power, 99 % occupied bandwidth and adjacent-channel power ratio for the carrier at the marker.' },
];

export function SpectrumPage() {
  const { project: p, update, go } = useStore();
  const [found, setFound] = useState<Detected[]>([]);
  const [drv, setDrv] = useState<Driver | null>(null);
  const [status, setStatus] = useState(''); const [err, setErr] = useState('');
  const [start, setStart] = useState(849e6), [stop, setStop] = useState(870e6), [points, setPoints] = useState(801);
  const [rbw, setRbw] = useState<number | null>(null), [detector, setDetector] = useState<'peak' | 'average' | 'sample'>('peak');
  const [mode, setMode] = useState<TraceMode>('clear'), [avgN, setAvgN] = useState(8);
  const [ref, setRef] = useState(-20), [div, setDiv] = useState(10), [unit, setUnit] = useState<Unit>('dBm');
  const [gain, setGain] = useState<number | null>(null);
  const [sweep, setSweep] = useState<Sweep | null>(null), [trace, setTrace] = useState<Float32Array | null>(null);
  const [fall, setFall] = useState<Float32Array[]>([]);
  const [running, setRunning] = useState(false); const abort = useRef<AbortController | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [chBw, setChBw] = useState(12.5e3), [spacing, setSpacing] = useState(25e3);
  const [limit, setLimit] = useState<LimitPoint[]>([]), [limitKind, setLimitKind] = useState<'upper' | 'lower'>('upper');
  const [test, setTest] = useState<TestId | null>(null);
  const [calRef, setCalRef] = useState({ hz: 100e6, dbm: -30 });
  const [sweepS, setSweepS] = useState<number | null>(null);
  const [tone, setTone] = useState(false); const audio = useRef<{ ctx: AudioContext; osc: OscillatorNode; g: GainNode } | null>(null);
  const corr: Corrections = { ...NO_CORR, ...(p.spectrum?.corr ?? {}) };
  const setCorr = (c: Partial<Corrections>) => update((d) => { d.spectrum = { ...(d.spectrum ?? { saved: [] }), corr: { ...corr, ...c } }; });
  const ppm = p.spectrum?.ppm ?? 0;
  const watch = useMemo(() => [...new Set([p.radio?.fMHz ? p.radio.fMHz * 1e6 : 0, p.indoor?.fMHz ? p.indoor.fMHz * 1e6 : 0, ...(p.spectrum?.watch ?? [])].filter((x) => x > 0))], [p.radio?.fMHz, p.indoor?.fMHz, p.spectrum?.watch]);

  const refresh = useCallback(async () => setFound(await detect()), []);
  useEffect(() => {
    refresh();
    const nav = navigator as unknown as { usb?: EventTarget; serial?: EventTarget };
    nav.usb?.addEventListener('connect', refresh); nav.usb?.addEventListener('disconnect', refresh); nav.serial?.addEventListener('connect', refresh); nav.serial?.addEventListener('disconnect', refresh);
    return () => { nav.usb?.removeEventListener('connect', refresh); nav.usb?.removeEventListener('disconnect', refresh); nav.serial?.removeEventListener('connect', refresh); nav.serial?.removeEventListener('disconnect', refresh); };
  }, [refresh]);
  useEffect(() => () => { abort.current?.abort(); drv?.close(); }, [drv]);

  const connect = async (how: 'tinysa' | 'rtlsdr' | 'hackrf' | 'sim', handle?: unknown) => {
    setErr(''); setStatus('Connecting…');
    try {
      await drv?.close();
      const r = RECEIVERS.find((x) => x.id === (how === 'tinysa' ? 'tinysa-ultra' : how))!;
      const d = how === 'sim' ? openSim() : how === 'tinysa' ? await openTinySA((handle as never) ?? await pickSerial()) : how === 'rtlsdr' ? await openRtlSdr((handle as never) ?? await pickUsb(r.usb!), { gain }) : await openHackRF((handle as never) ?? await pickUsb(r.usb!));
      setDrv(d); setStatus(`Connected: ${d.label}${d.calibrated ? '' : ' (levels relative until calibrated)'}`); setTrace(null); setFall([]);
      if (start < d.range[0] || stop > d.range[1]) { setStart(Math.max(d.range[0], 849e6)); setStop(Math.min(d.range[1], 870e6)); }
      refresh();
    } catch (e) { const m = String((e as Error)?.message ?? e); setErr(/No device selected|cancel/i.test(m) ? 'No receiver was picked.' : /Access denied|Unable to claim|LIBUSB|in use/i.test(m) ? `${m}. On Windows, an RTL-SDR or HackRF needs the WinUSB driver (install it with Zadig) and no other SDR program may be using it.` : m); setStatus(''); }
  };

  const one = useCallback(async (d: Driver): Promise<Sweep | null> => {
    const ac = new AbortController(); abort.current = ac; const t0 = performance.now();
    const s = await d.sweep({ start, stop, points, rbwHz: rbw ?? undefined, gainDb: gain, detector }, ac.signal);
    if (ac.signal.aborted && !s.f.length) return null;
    const k = 1 + ppm / 1e6; const f = s.f.map((x) => x * k) as unknown as Float64Array;
    const dc = Float32Array.from(s.dbm, (v) => corrected(v, corr));
    const sw = { ...s, f: Float64Array.from(f), dbm: dc };
    setSweep(sw); setTrace((t) => traceStep(t, dc, mode, avgN)); setFall((w) => [dc, ...w].slice(0, 120)); setSweepS((performance.now() - t0) / 1000);
    return sw;
  }, [start, stop, points, rbw, gain, detector, mode, avgN, ppm, corr.calOffsetDb, corr.cableLossDb, corr.externalAttenDb, corr.preampGainDb]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (continuous: boolean) => {
    if (!drv) return; setRunning(true); setErr('');
    try { do { const s = await one(drv); if (!s) break; await new Promise((r) => setTimeout(r, 30)); } while (continuous && !abort.current?.signal.aborted); }
    catch (e) { setErr(String((e as Error)?.message ?? e)); } finally { setRunning(false); }
  };
  const stopRun = () => { abort.current?.abort(); };
  useEffect(() => { setTrace(null); }, [mode, start, stop, points]);

  const imp = async (files: File[]) => {
    const f = files[0]; if (!f) return; setErr('');
    try { const r = parseSweepFile(await f.text(), f.name); const s = r.sweeps[0]; setStart(s.f[0]); setStop(s.f[s.f.length - 1]); setPoints(s.f.length);
      const dc = r.sweeps.map((x) => Float32Array.from(x.dbm, (v) => corrected(v, corr)));
      setSweep({ ...s, dbm: dc[0] }); setTrace(dc[0]); setFall(dc.slice(0, 120)); setStatus(r.note); }
    catch (e) { setErr(String((e as Error)?.message ?? e)); }
  };

  // measurements
  const F = sweep?.f, D = trace;
  const m = useMemo(() => {
    if (!F || !D || F.length !== D.length) return null;
    const nf = noiseFloor(D), pk = findPeaks(F, D, 10, Math.max(chBw, (F[F.length - 1] - F[0]) / 200)), top = pk[0];
    const rbwHz = sweep!.rbwHz || (F[1] - F[0]);
    const center = markers[0]?.hz ?? top?.f ?? (F[0] + F[F.length - 1]) / 2;
    const cp = channelPower(F, D, center, chBw, rbwHz);
    const sub = (() => { const a = nearest(F, center - 2.5 * Math.max(chBw, spacing)), b = nearest(F, center + 2.5 * Math.max(chBw, spacing)); return { f: F.slice(a, b + 1), d: D.slice(a, b + 1) }; })();
    const obw = sub.f.length > 3 ? occupiedBw(sub.f, sub.d) : null, ac = acpr(F, D, center, chBw, spacing, rbwHz);
    const im = intermodHits(pk.map((x) => x.f), [...pk.map((x) => x.f), ...watch], Math.max(chBw / 2, F[1] - F[0]));
    const lim = limit.length >= 2 ? checkLimit(F, D, limit, limitKind) : null;
    return { nf, pk, top, cp, obw, ac, im, lim, center, rbwHz };
  }, [F, D, markers, chBw, spacing, watch, limit, limitKind, sweep]);

  // tone for the interference hunt
  useEffect(() => {
    if (!tone || !m?.top) { audio.current?.osc.stop(); audio.current = null; return; }
    if (!audio.current) { const ctx = new AudioContext(), osc = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0.05; osc.connect(g).connect(ctx.destination); osc.start(); audio.current = { ctx, osc, g }; }
    audio.current.osc.frequency.value = Math.max(200, Math.min(2000, 200 + (m.top.dbm + 120) * 20));
  }, [tone, m?.top]);
  useEffect(() => () => { audio.current?.osc.stop(); }, []);

  // drawing
  const cv = useRef<HTMLCanvasElement>(null), wf = useRef<HTMLCanvasElement>(null);
  const lo = ref - div * 10;
  useEffect(() => {
    const c = cv.current; if (!c) return; const W = c.clientWidth || 900, H = 360, dpr = window.devicePixelRatio || 1; c.width = W * dpr; c.height = H * dpr; const g = c.getContext('2d')!; g.scale(dpr, dpr);
    const L = 56, R = 10, T = 10, B = 26, pw = W - L - R, ph = H - T - B;
    const X = (hz: number) => L + ((hz - start) / (stop - start)) * pw, Y = (db: number) => T + ((ref - db) / (ref - lo)) * ph;
    g.fillStyle = '#0b1520'; g.fillRect(0, 0, W, H); g.strokeStyle = '#25384d'; g.lineWidth = 1; g.font = '11px system-ui'; g.fillStyle = '#9fb3c8';
    for (let i = 0; i <= 10; i++) { const y = T + (ph * i) / 10; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); g.fillText(`${ref - div * i}`, 6, y + 4); const x = L + (pw * i) / 10; g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke(); if (i % 2 === 0) g.fillText(fmtHz(start + ((stop - start) * i) / 10).replace(/\.?0+ (M|G|k)/, ' $1'), Math.min(x - 30, W - 90), H - 8); }
    g.fillText('dBm', 6, T + ph + 16);
    for (const w of watch) if (w >= start && w <= stop) { g.strokeStyle = '#ffb300'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(w), T); g.lineTo(X(w), T + ph); g.stroke(); g.setLineDash([]); }
    if (limit.length >= 2) { g.strokeStyle = '#ef5350'; g.lineWidth = 1.5; g.beginPath(); [...limit].sort((a, b) => a.f - b.f).forEach((q, i) => (i ? g.lineTo(X(q.f), Y(q.dbm)) : g.moveTo(X(q.f), Y(q.dbm)))); g.stroke(); }
    if (m) { g.strokeStyle = '#4caf50'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(L, Y(m.nf)); g.lineTo(L + pw, Y(m.nf)); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(76,175,80,.12)'; g.fillRect(X(m.center - chBw / 2), T, Math.max(1, X(m.center + chBw / 2) - X(m.center - chBw / 2)), ph); }
    if (sweep && D) { g.strokeStyle = '#ffeb3b'; g.lineWidth = 1.4; g.beginPath(); for (let k = 0; k < D.length; k++) { const x = X(sweep.f[k]), y = Math.max(T, Math.min(T + ph, Y(D[k]))); if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
    if (sweep && D) markers.forEach((mk, i) => { const k = nearest(sweep.f, mk.hz), x = X(sweep.f[k]), y = Y(D[k]); g.fillStyle = '#29b6f6'; g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x - 6, y - 12); g.lineTo(x + 6, y - 12); g.fill(); g.fillText(`M${i + 1}`, x - 7, y - 15); });
  }, [sweep, D, start, stop, ref, div, lo, markers, watch, limit, m, chBw]);
  useEffect(() => {
    const c = wf.current; if (!c || !fall.length) return; const w = fall[0].length, h = fall.length; c.width = w; c.height = h; const g = c.getContext('2d')!; const im = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = Math.max(0, Math.min(1, (fall[y][x] - lo) / (ref - lo))), i = (y * w + x) * 4; im.data[i] = 255 * Math.min(1, v * 2); im.data[i + 1] = 255 * Math.max(0, v * 2 - 1) * 0.9 + 30 * v; im.data[i + 2] = 255 * (1 - v) * 0.7; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0);
  }, [fall, ref, lo]);

  const clickTrace = (e: React.MouseEvent<HTMLCanvasElement>) => { if (!sweep) return; const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, pw = r.width - 66; const hz = start + ((x - 56) / pw) * (stop - start); if (hz < start || hz > stop) return; setMarkers((ms) => (ms.length >= 4 ? [...ms.slice(1), { id: uid(), hz }] : [...ms, { id: uid(), hz }])); };
  const peakMarker = () => m?.top && setMarkers([{ id: uid(), hz: m.top.f }]);
  const nextPeak = () => { if (!m?.pk.length) return; const cur = markers[markers.length - 1]?.hz; const i = m.pk.findIndex((q) => Math.abs(q.f - (cur ?? -1)) < 1); const n = m.pk[(i + 1) % m.pk.length]; setMarkers((ms) => [...ms.slice(0, -1), { id: uid(), hz: n.f }]); };
  const preset = (id: string) => { const b = PRESETS.find((x) => x.id === id); if (!b) return; setStart(b.start); setStop(b.stop); setChBw(b.chBw); setSpacing(b.spacing); setMarkers([]); };
  const val = (db: number, hz: number) => { const v = toUnit(db, unit, hz, corr); return unit === 'mW' ? v.toExponential(2) : unit === 'uV' ? v.toFixed(2) : v.toFixed(1); };

  const save = (testName?: string) => {
    if (!sweep || !D) return;
    const go2 = (lat?: number, lon?: number) => update((d) => { const s: SavedSweep = { id: uid(), at: new Date().toISOString(), device: sweep.device, start: sweep.f[0], stop: sweep.f[sweep.f.length - 1], dbm: Array.from(D, (v) => Math.round(v * 10) / 10), calibrated: sweep.calibrated || !!corr.calOffsetDb, rbwHz: sweep.rbwHz, note: testName ?? '', lat, lon, test: testName }; d.spectrum = { ...(d.spectrum ?? { saved: [] }), saved: [s, ...(d.spectrum?.saved ?? [])].slice(0, 60) }; });
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((q) => go2(q.coords.latitude, q.coords.longitude), () => go2(), { timeout: 4000 }); else go2();
    setStatus('Sweep saved with the project.');
  };
  const toReadings = () => { if (!m || !sweep) return; const list = (markers.length ? markers.map((x) => x.hz) : m.pk.slice(0, 5).map((x) => x.f)); update((d) => { d.signalReadings = [...(d.signalReadings ?? []), ...list.map((hz) => ({ id: uid(), at: new Date().toISOString(), dbm: Math.round(D![nearest(sweep.f, hz)] * 10) / 10, source: 'serial' as const, session: 'Spectrum analyzer', device: sweep.device, fMHz: +(hz / 1e6).toFixed(5) }))]; }); setStatus(`${list.length} reading${list.length > 1 ? 's' : ''} added to Live Signal Readings.`); };
  const csv = () => { if (!sweep || !D) return; downloadText(`${safeName(p.meta.name)}_spectrum_${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.csv`, 'Frequency (Hz),Level (dBm)\n' + Array.from(D, (v, k) => `${Math.round(sweep.f[k])},${v.toFixed(2)}`).join('\n'), 'text/csv'); };
  const png = () => { const c = cv.current; if (!c) return; const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `${safeName(p.meta.name)}_spectrum.png`; a.click(); };

  // tests
  const runTest = async (id: TestId) => {
    setTest(id); setErr('');
    if (id === 'self') { const d = openSim(); setDrv(d); setStatus('Self-test: built-in test signals.'); setStart(849e6); setStop(853e6); setPoints(4001); setRbw(1e3); setMode('clear'); return; }
    if (id === 'hunt') { setMode('max'); setTone(true); return; }
    if (id === 'uplink') { setStart(798e6); setStop(825e6); setChBw(12.5e3); return; }
    if (id === 'osc') { setStart(740e6); setStop(900e6); setMode('max'); return; }
    if (id === 'donor' || id === 'downlink') { setStart(Math.min(...(watch.length ? watch : [851e6])) - 1e6); setStop(Math.max(...(watch.length ? watch : [869e6])) + 1e6); return; }
    if (id === 'floor') { setMode('average'); setDetector('average'); return; }
  };
  const selfResult = useMemo(() => {
    if (test !== 'self' || !m || !sweep || sweep.device !== 'Built-in test signals') return null;
    const k = nearest(sweep.f, 851.0125e6), lvl = channelPower(sweep.f, D!, 851.0125e6, 12.5e3, sweep.rbwHz) - corr.calOffsetDb - corr.cableLossDb - corr.externalAttenDb + corr.preampGainDb;
    const pkF = m.pk.find((q) => Math.abs(q.f - 851.0125e6) < 5e3)?.f;
    return [
      { name: 'Frequency of the 851.0125 MHz carrier', ok: pkF != null && Math.abs(pkF - 851.0125e6) <= 1.5e3, v: pkF ? fmtHz(pkF) : 'not found' },
      { name: 'Channel power −66 dBm ±1.5 dB', ok: Math.abs(lvl + 66) <= 1.5, v: `${lvl.toFixed(1)} dBm` },
      { name: 'Intermod product at 850.0125 MHz found', ok: m.im.some((x) => Math.abs(x.f - 850.0125e6) < 3e3), v: `${m.im.length} product(s)` },
      { name: 'Noise floor near the expected level', ok: Math.abs(m.nf - (-105 + 10 * Math.log10(sweep.rbwHz / 10e3))) < 4, v: `${m.nf.toFixed(1)} dBm` },
    ].map((x) => ({ ...x, k }));
  }, [test, m, sweep, D, corr.calOffsetDb, corr.cableLossDb, corr.externalAttenDb, corr.preampGainDb]);
  const applyCal = () => { if (!sweep || !D) return; const k = nearest(sweep.f, calRef.hz); let b = k; for (let j = Math.max(0, k - 20); j < Math.min(D.length, k + 20); j++) if (D[j] > D[b]) b = j; const off = calRef.dbm - D[b] + corr.calOffsetDb, errHz = sweep.f[b] - calRef.hz; update((d) => { d.spectrum = { ...(d.spectrum ?? { saved: [] }), corr: { ...corr, calOffsetDb: +off.toFixed(2) }, ppm: Math.abs(errHz) > (sweep.f[1] - sweep.f[0]) ? +(ppm - (errHz / calRef.hz) * 1e6).toFixed(2) : ppm, calAt: new Date().toISOString(), calDevice: sweep.device }; }); setStatus(`Calibrated: level offset ${off.toFixed(2)} dB${Math.abs(errHz) > (sweep.f[1] - sweep.f[0]) ? `, frequency ${(-(errHz / calRef.hz) * 1e6).toFixed(2)} ppm` : ''}.`); };
  const strongestPs = m?.pk.find((q) => q.f >= 758e6 && q.f <= 870e6);

  const det = (id: string) => found.filter((x) => x.receiverId === id || (id === 'tinysa' && x.receiverId === 'tinysa-ultra'));
  return (
    <div className="grid sa-page">
      <Card title="1. Receiver" className="wide" tip="Plug in a compatible USB receiver, then Connect. Already-allowed receivers are listed as soon as they are plugged in.">
        <div className="row wrap">
          <button className="primary" disabled={!webSerialOk()} onClick={() => connect('tinysa', det('tinysa-ultra')[0]?.handle)} title={webSerialOk() ? 'tinySA / tinySA Ultra over USB serial' : 'Needs Chrome or Edge'}>Connect tinySA</button>
          <button className="primary" disabled={!webUsbOk()} onClick={() => connect('rtlsdr', det('rtlsdr')[0]?.handle)}>Connect RTL-SDR</button>
          <button className="primary" disabled={!webUsbOk()} onClick={() => connect('hackrf', det('hackrf')[0]?.handle)}>Connect HackRF One</button>
          <button onClick={() => connect('sim')}>Use test signals</button>
          {drv && <button className="ghost" onClick={async () => { stopRun(); await drv.close(); setDrv(null); setStatus('Disconnected.'); }}>Disconnect</button>}
        </div>
        {!webUsbOk() && !webSerialOk() && <p className="note">This browser cannot reach USB receivers (iPhone, iPad, Safari and Firefox). Use Chrome or Edge on a computer or Android, the Windows app, or import a saved sweep below.</p>}
        {status && <p className="small" role="status">{status}</p>}
        {err && <p className="bad-text" role="alert">{err}</p>}
        <h4>Receivers plugged in now</h4>
        {found.length ? <ul className="results">{found.map((x, i) => <li key={i}><span>🟢 <b>{x.label}</b> <span className="muted small">({x.via === 'serial' ? 'USB serial' : 'WebUSB'})</span></span><button onClick={() => connect(x.receiverId.startsWith('tinysa') ? 'tinysa' : (x.receiverId as 'rtlsdr' | 'hackrf'), x.handle)}>Connect</button></li>)}</ul>
          : <p className="small muted">None yet. Plug one in and press Connect: the browser asks once, then it is found automatically. <button className="ghost" onClick={refresh}>Check again</button></p>}
        <details><summary><b>Compatible USB receivers</b> ({RECEIVERS.filter((r) => r.live).length - 1} live, {RECEIVERS.filter((r) => !r.live).length} by file import)</summary>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Receiver</th><th>Range</th><th>Connection</th><th>Level accuracy</th><th>Status</th></tr></thead>
            <tbody>{RECEIVERS.map((r) => <tr key={r.id}><td><b>{r.name}</b><br /><span className="small muted">{r.kind} · {r.notes}</span></td><td className="nowrap">{fmtHz(r.range[0])} – {fmtHz(r.range[1])}</td><td>{r.link === 'serial' ? 'Live, USB serial' : r.link === 'webusb' ? 'Live, WebUSB' : r.link === 'sim' ? 'Built in' : 'File import'}<br /><span className="small muted">{r.where}</span></td><td className="small">{r.accuracy}</td>
              <td>{det(r.id).length ? <b className="ok-text">● Plugged in</b> : r.link === 'serial' ? (webSerialOk() ? 'Ready' : 'Browser not supported') : r.link === 'webusb' ? (webUsbOk() ? 'Ready' : 'Browser not supported') : r.link === 'sim' ? 'Ready' : 'Import'}</td></tr>)}</tbody></table></div>
        </details>
        <DropZone accept=".csv,.txt,.dat" onFiles={imp} label="Import a saved sweep" hint="rtl_power · hackrf_sweep · tinySA · Spike · FieldFox · Anritsu · Siglent · Rigol CSV" compact />
      </Card>

      <Card title="2. Analyzer" className="wide" actions={<div className="row wrap">
        <button className="primary" disabled={!drv || running} onClick={() => run(true)}>▶ Run</button><button disabled={!drv || running} onClick={() => run(false)}>Single</button><button disabled={!running} onClick={stopRun}>■ Stop</button>
        <button disabled={!sweep} onClick={peakMarker}>Peak</button><button disabled={!m?.pk.length} onClick={nextPeak}>Next peak</button><button disabled={!markers.length} onClick={() => setMarkers([])}>Clear markers</button></div>}>
        <div className="sa-controls form">
          <label className="field"><span>Band preset</span><select defaultValue="" onChange={(e) => preset(e.target.value)} data-no-choose><option value="" disabled>Pick a band…</option>{PRESETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
          <label className="field"><span>Start (MHz)</span><input type="number" step="any" value={+(start / 1e6).toFixed(6)} onChange={(e) => setStart(+e.target.value * 1e6)} /></label>
          <label className="field"><span>Stop (MHz)</span><input type="number" step="any" value={+(stop / 1e6).toFixed(6)} onChange={(e) => setStop(+e.target.value * 1e6)} /></label>
          <label className="field"><span>Center / span (MHz)</span><div className="row"><input type="number" step="any" value={+(((start + stop) / 2) / 1e6).toFixed(6)} onChange={(e) => { const c = +e.target.value * 1e6, s = stop - start; setStart(c - s / 2); setStop(c + s / 2); }} /><input type="number" step="any" value={+((stop - start) / 1e6).toFixed(6)} onChange={(e) => { const c = (start + stop) / 2, s = +e.target.value * 1e6; setStart(c - s / 2); setStop(c + s / 2); }} /></div></label>
          <label className="field"><span>Points</span><select value={points} onChange={(e) => setPoints(+e.target.value)} data-no-choose>{[101, 201, 401, 801, 1601, 4001].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="field"><span>RBW</span><select value={rbw ?? 0} onChange={(e) => setRbw(+e.target.value || null)} data-no-choose><option value={0}>Auto</option>{[1e3, 3e3, 10e3, 30e3, 100e3, 300e3, 1e6].map((n) => <option key={n} value={n}>{fmtHz(n).replace(/\.0+ /, ' ')}</option>)}</select></label>
          <label className="field"><span>Detector</span><select value={detector} onChange={(e) => setDetector(e.target.value as 'peak')} data-no-choose><option value="peak">Positive peak</option><option value="average">Average (RMS)</option><option value="sample">Sample</option></select></label>
          <label className="field"><span>Trace</span><select value={mode} onChange={(e) => setMode(e.target.value as TraceMode)} data-no-choose><option value="clear">Clear / write</option><option value="average">Average</option><option value="max">Max hold</option><option value="min">Min hold</option></select></label>
          {mode === 'average' && <label className="field"><span>Average count</span><input type="number" min={2} max={100} value={avgN} onChange={(e) => setAvgN(+e.target.value || 8)} /></label>}
          <label className="field"><span>Ref level / scale</span><div className="row"><input type="number" value={ref} onChange={(e) => setRef(+e.target.value)} /><select value={div} onChange={(e) => setDiv(+e.target.value)} data-no-choose>{[1, 2, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} dB/div</option>)}</select></div></label>
          <label className="field"><span>Units</span><select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} data-no-choose>{(Object.keys(UNIT_LABEL) as Unit[]).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select></label>
          {drv?.id === 'rtlsdr' && <label className="field"><span>RF gain (dB, empty = auto)</span><input type="number" value={gain ?? ''} onChange={(e) => setGain(e.target.value === '' ? null : +e.target.value)} /></label>}
        </div>
        <canvas ref={cv} className="sa-trace" style={{ width: '100%', height: 360 }} onClick={clickTrace} role="img" aria-label="Spectrum trace" />
        <canvas ref={wf} className="sa-fall" aria-label="Waterfall: newest sweep at the top" />
        <p className="small muted">Click the trace to place markers (up to 4; the first is the reference for deltas). Yellow dashed lines are project frequencies; the green band is the measured channel. {sweep && !sweep.calibrated && !corr.calOffsetDb ? '⚠ Levels are relative: calibrate (Tests → Calibrate) for true dBm.' : ''}</p>
        {markers.length > 0 && sweep && D && <table className="tbl"><thead><tr><th>Marker</th><th>Frequency</th><th>Level</th><th>Δ to M1</th></tr></thead><tbody>{markers.map((mk, i) => { const k = nearest(sweep.f, mk.hz), k0 = nearest(sweep.f, markers[0].hz); return <tr key={mk.id}><td>M{i + 1}</td><td>{fmtHz(sweep.f[k])}</td><td><b>{val(D[k], sweep.f[k])}</b> {UNIT_LABEL[unit]}</td><td>{i ? `${fmtHz(sweep.f[k] - sweep.f[k0])}, ${(D[k] - D[k0]).toFixed(1)} dB` : '—'}</td></tr>; })}</tbody></table>}
        <div className="row wrap" style={{ marginTop: 8 }}><button disabled={!sweep} onClick={() => save()}>💾 Save sweep</button><button disabled={!m} onClick={toReadings}>➜ Add to Live Signal Readings</button><button disabled={!sweep} onClick={csv}>⬇ CSV</button><button disabled={!sweep} onClick={png}>⬇ Picture</button></div>
      </Card>

      {m && sweep && <Card title="3. Measurements" className="wide">
        <div className="stats">
          <Stat label="Strongest signal" value={m.top ? `${val(m.top.dbm, m.top.f)} ${UNIT_LABEL[unit]}` : '—'} tip={m.top ? fmtHz(m.top.f) : ''} />
          <Stat label="at" value={m.top ? fmtHz(m.top.f) : '—'} />
          <Stat label="Noise floor" value={`${m.nf.toFixed(1)} dBm`} tip={`In ${fmtHz(m.rbwHz)} RBW. A good receiver with 7 dB noise figure shows about ${danl(m.rbwHz, 7).toFixed(0)} dBm.`} />
          <Stat label="SNR (strongest)" value={m.top ? `${(m.top.dbm - m.nf).toFixed(1)} dB` : '—'} />
          <Stat label={`Channel power (${fmtHz(chBw).replace(/\.0+ /, ' ')})`} value={Number.isFinite(m.cp) ? `${m.cp.toFixed(1)} dBm` : '—'} tip={`Centered on ${fmtHz(m.center)} (marker 1, else the strongest signal).`} />
          <Stat label="Occupied BW (99 %)" value={m.obw ? fmtHz(m.obw.bw) : '—'} />
          <Stat label="ACPR lower / upper" value={`${m.ac.lower.toFixed(1)} / ${m.ac.upper.toFixed(1)} dBc`} tip={`Adjacent channels ±${fmtHz(spacing)}`} />
          <Stat label="Limit line" value={m.lim ? (m.lim.pass ? `PASS (${m.lim.worstMarginDb.toFixed(1)} dB margin)` : `FAIL (${m.lim.failCount} points)`) : 'not set'} tone={m.lim ? (m.lim.pass ? 'ok' : 'bad') : undefined} />
        </div>
        <div className="form" style={{ marginTop: 8 }}>
          <label className="field"><span>Channel bandwidth (kHz)</span><input type="number" step="any" value={chBw / 1e3} onChange={(e) => setChBw(+e.target.value * 1e3 || 12.5e3)} /></label>
          <label className="field"><span>Adjacent channel spacing (kHz)</span><input type="number" step="any" value={spacing / 1e3} onChange={(e) => setSpacing(+e.target.value * 1e3 || 25e3)} /></label>
        </div>
        <h4>Signals found</h4>
        <table className="tbl"><thead><tr><th>#</th><th>Frequency</th><th>Level</th><th>Above floor</th><th>Project channel</th></tr></thead>
          <tbody>{m.pk.slice(0, 12).map((q, i) => <tr key={i}><td>{i + 1}</td><td>{fmtHz(q.f)}</td><td>{val(q.dbm, q.f)} {UNIT_LABEL[unit]}</td><td>{(q.dbm - m.nf).toFixed(1)} dB</td><td>{watch.some((w) => Math.abs(w - q.f) < chBw) ? '✓' : ''}</td></tr>)}</tbody></table>
        {m.im.length > 0 && <><h4>Intermodulation products on a signal or project channel</h4><ul className="small">{m.im.slice(0, 10).map((x, i) => <li key={i}><b>{x.order}rd/th order</b> at {fmtHz(x.f)} = {x.from}</li>)}</ul></>}
      </Card>}

      <Card title="4. Tests" className="wide" tip="Guided measurements with pass / fail. Each one sets the analyzer for you; save the sweep to keep it with the project.">
        <div className="sa-tests">{TESTS.map((t) => <button key={t.id} className={test === t.id ? 'primary' : ''} onClick={() => runTest(t.id)} title={t.what}>{t.title}</button>)}</div>
        {test && <div className="ask"><h3>{TESTS.find((t) => t.id === test)!.title}</h3><p className="small">{TESTS.find((t) => t.id === test)!.what}</p>
          {test === 'self' && <>{!selfResult ? <p className="small">Press <b>Single</b> to measure the test signals.</p> : <ul className="checks">{selfResult.map((r) => <li key={r.name} className={r.ok ? 'ok-text' : 'bad-text'}>{r.ok ? '✓' : '✗'} {r.name}: {r.v}</li>)}</ul>}{selfResult && <p className={selfResult.every((r) => r.ok) ? 'ok-text' : 'bad-text'}><b>{selfResult.every((r) => r.ok) ? 'Self-test passed: the measurements are working.' : 'Self-test failed: check the corrections (a calibration offset shifts every level).'}</b></p>}</>}
          {test === 'cal' && <div className="row wrap"><label className="field"><span>Reference frequency (MHz)</span><input type="number" step="any" value={calRef.hz / 1e6} onChange={(e) => setCalRef({ ...calRef, hz: +e.target.value * 1e6 })} /></label><label className="field"><span>Reference level at the input (dBm)</span><input type="number" step="any" value={calRef.dbm} onChange={(e) => setCalRef({ ...calRef, dbm: +e.target.value })} /></label><button disabled={!sweep} onClick={() => { setStart(calRef.hz - 1e6); setStop(calRef.hz + 1e6); }}>Center on it</button><button className="primary" disabled={!sweep} onClick={applyCal}>Measure and calibrate</button>{p.spectrum?.calAt && <span className="small muted">Last calibrated {new Date(p.spectrum.calAt).toLocaleString()} with {p.spectrum.calDevice}</span>}</div>}
          {test === 'floor' && m && <p>Measured floor <b>{m.nf.toFixed(1)} dBm</b> in {fmtHz(m.rbwHz)} RBW. Expected for a 7 dB noise figure: <b>{danl(m.rbwHz, 7).toFixed(1)} dBm</b>; implied noise figure about <b>{(m.nf + 174 - 10 * Math.log10(m.rbwHz)).toFixed(1)} dB</b>.</p>}
          {test === 'uplink' && m && <p>Uplink band noise <b>{m.nf.toFixed(1)} dBm</b> per {fmtHz(m.rbwHz)} ({(m.nf - 10 * Math.log10(m.rbwHz)).toFixed(1)} dBm/Hz). The licensee sets the allowed level at the donor site; a floor more than a few dB above the termination floor means the booster's uplink gain is too high.</p>}
          {test === 'osc' && m && (() => { const wide = m.obw && m.top && m.obw.bw > 150e3 && m.top.dbm - m.nf > 25; return <p className={wide ? 'bad-text' : 'ok-text'}><b>{wide ? `Possible oscillation: a ${fmtHz(m.obw!.bw)} wide signal ${(m.top!.dbm - m.nf).toFixed(0)} dB above the floor at ${fmtHz(m.top!.f)}. Turn the BDA gain down and check donor-to-server isolation (≥ gain + 15 dB).` : 'No wideband hump found: no sign of oscillation in this span.'}</b></p>; })()}
          {(test === 'donor' || test === 'downlink') && m && <>{watch.length ? <table className="tbl"><thead><tr><th>Channel</th><th>Level</th><th>{test === 'downlink' ? 'vs −95 dBm' : ''}</th></tr></thead><tbody>{watch.map((w) => { const k = nearest(sweep!.f, w), v = D![k]; return <tr key={w}><td>{fmtHz(w)}</td><td>{v.toFixed(1)} dBm</td><td className={test === 'downlink' ? (v >= -95 ? 'ok-text' : 'bad-text') : ''}>{test === 'downlink' ? (v >= -95 ? 'PASS' : 'FAIL') : ''}</td></tr>; })}</tbody></table> : <p className="small">Add the system's channels under Project channels below.</p>}
            {test === 'donor' && strongestPs && <button onClick={() => update((d) => { d.erces.donorRssiDbm = Math.round(strongestPs.dbm); })}>Use {strongestPs.dbm.toFixed(0)} dBm as the donor signal on Emergency Radio</button>}</>}
          {test === 'hunt' && <p className="row wrap"><label className="check"><input type="checkbox" checked={tone} onChange={(e) => setTone(e.target.checked)} /> Tone (pitch rises with the strongest signal)</label>{m?.top && <b>Strongest: {m.top.dbm.toFixed(1)} dBm at {fmtHz(m.top.f)}</b>} <span className="small muted">Use a directional antenna; turn until the level peaks, then walk that way. Add an attenuator as you get close.</span></p>}
          {test === 'im' && m && <p>{m.im.length ? <b className="bad-text">{m.im.length} product(s) land on a signal or project channel (listed under Measurements).</b> : <b className="ok-text">No 3rd or 5th order products land on a signal or project channel.</b>}</p>}
          {test === 'mask' && <div><p className="small">Add points (frequency in MHz, level in dBm). Between points the limit is a straight line.</p>
            <div className="row wrap"><select value={limitKind} onChange={(e) => setLimitKind(e.target.value as 'upper')} data-no-choose style={{ width: 'auto' }}><option value="upper">Upper limit (signal must stay below)</option><option value="lower">Lower limit (signal must stay above)</option></select>
              <button onClick={() => setLimit([...limit, { f: limit.length ? Math.min(stop, limit[limit.length - 1].f + (stop - start) / 4) : start, dbm: -60 }])}>+ Point</button><button className="ghost" onClick={() => setLimit([{ f: start, dbm: -60 }, { f: stop, dbm: -60 }])}>Flat line</button><button className="ghost" onClick={() => setLimit([])}>Clear</button></div>
            {limit.map((q, i) => <div key={i} className="row"><input type="number" step="any" value={q.f / 1e6} onChange={(e) => setLimit(limit.map((x, j) => (j === i ? { ...x, f: +e.target.value * 1e6 } : x)))} /> MHz <input type="number" step="any" value={q.dbm} onChange={(e) => setLimit(limit.map((x, j) => (j === i ? { ...x, dbm: +e.target.value } : x)))} /> dBm <button className="ghost" onClick={() => setLimit(limit.filter((_, j) => j !== i))}>✕</button></div>)}</div>}
          {test === 'obw' && m && <p>Channel power <b>{m.cp.toFixed(1)} dBm</b>, occupied bandwidth <b>{m.obw ? fmtHz(m.obw.bw) : '—'}</b>, ACPR <b>{m.ac.lower.toFixed(1)} / {m.ac.upper.toFixed(1)} dBc</b> at {fmtHz(m.center)}.</p>}
          <div className="row wrap" style={{ marginTop: 6 }}><button disabled={!sweep} onClick={() => save(TESTS.find((t) => t.id === test)!.title)}>💾 Save this test with the project</button><button className="ghost" onClick={() => { setTest(null); setTone(false); }}>Close test</button></div>
        </div>}
      </Card>

      <Card title="5. Corrections, calibration and project channels" className="wide">
        <div className="form">
          <label className="field"><span>Calibration offset (dB)</span><input type="number" step="0.1" value={corr.calOffsetDb} onChange={(e) => setCorr({ calOffsetDb: +e.target.value || 0 })} /></label>
          <label className="field"><span>Frequency correction (ppm)</span><input type="number" step="0.1" value={ppm} onChange={(e) => update((d) => { d.spectrum = { ...(d.spectrum ?? { saved: [] }), ppm: +e.target.value || 0 }; })} /></label>
          <label className="field"><span>Cable loss (dB)</span><input type="number" step="0.1" value={corr.cableLossDb} onChange={(e) => setCorr({ cableLossDb: +e.target.value || 0 })} /></label>
          <label className="field"><span>External attenuator (dB)</span><input type="number" step="1" value={corr.externalAttenDb} onChange={(e) => setCorr({ externalAttenDb: +e.target.value || 0 })} /></label>
          <label className="field"><span>External preamp gain (dB)</span><input type="number" step="1" value={corr.preampGainDb} onChange={(e) => setCorr({ preampGainDb: +e.target.value || 0 })} /></label>
          <label className="field"><span>Antenna gain (dBi), for field strength</span><input type="number" step="0.1" value={corr.antennaGainDbi} onChange={(e) => setCorr({ antennaGainDbi: +e.target.value || 0 })} /></label>
          <label className="field"><span>Antenna factor (dB/m, optional)</span><input type="number" step="0.1" value={corr.antennaFactor ?? ''} onChange={(e) => setCorr({ antennaFactor: e.target.value === '' ? undefined : +e.target.value })} /></label>
        </div>
        <p className="small muted">Levels shown are at the antenna port: reading + calibration + cable loss + attenuator − preamp. Field strength (dBµV/m) uses the antenna factor, or one worked out from the gain.</p>
        <label className="field"><span>Project channels to mark and test (MHz, separated by commas). {watch.length} in use, including the radio and indoor design frequencies.</span>
          <input defaultValue={(p.spectrum?.watch ?? []).map((x) => x / 1e6).join(', ')} onBlur={(e) => update((d) => { d.spectrum = { ...(d.spectrum ?? { saved: [] }), watch: e.target.value.split(/[,\s]+/).map(parseFloat).filter((x) => x > 0).map((x) => x * 1e6) }; })} placeholder="851.0125, 852.0125, 769.40625" /></label>
        <p className="small"><a href="#radioref" onClick={(e) => { e.preventDefault(); go('radioref'); }}>RadioReference Frequencies</a> and <a href="#fcc" onClick={(e) => { e.preventDefault(); go('fcc'); }}>FCC licenses</a> list the system's channels.</p>
      </Card>

      <BenchAndCert sweep={sweep} trace={D} m={m} sweepS={sweepS} watch={watch} chBw={chBw} />

      {(p.spectrum?.saved?.length ?? 0) > 0 && <Card title="Saved sweeps and tests" className="wide">
        <table className="tbl"><thead><tr><th>When</th><th>Test / note</th><th>Span</th><th>Receiver</th><th>Peak</th><th /></tr></thead>
          <tbody>{p.spectrum!.saved.map((s) => { const mx = Math.max(...s.dbm); return <tr key={s.id}><td>{new Date(s.at).toLocaleString()}</td><td>{s.test || s.note || '—'}</td><td>{fmtHz(s.start)} – {fmtHz(s.stop)}</td><td>{s.device}{s.calibrated ? '' : ' (relative)'}</td><td>{mx.toFixed(1)} dBm</td>
            <td className="nowrap"><button onClick={() => { const f = Float64Array.from(s.dbm, (_, k) => s.start + ((s.stop - s.start) * k) / Math.max(1, s.dbm.length - 1)); setStart(s.start); setStop(s.stop); setPoints(s.dbm.length); setSweep({ f, dbm: Float32Array.from(s.dbm), at: Date.parse(s.at), device: s.device, calibrated: s.calibrated, rbwHz: s.rbwHz }); setTrace(Float32Array.from(s.dbm)); }}>Open</button>
              <button className="ghost" onClick={() => update((d) => { d.spectrum!.saved = d.spectrum!.saved.filter((x) => x.id !== s.id); })}>Delete</button></td></tr>; })}</tbody></table>
      </Card>}
    </div>
  );
}

/** Benchmarks of the receiver and certification-level tests with saved, printable reports. */
function BenchAndCert({ sweep, trace, m, sweepS, watch, chBw }: { sweep: Sweep | null; trace: Float32Array | null; m: { nf: number; pk: { f: number; dbm: number }[]; top?: { f: number; dbm: number }; rbwHz: number; center: number; obw: { bw: number } | null } | null; sweepS: number | null; watch: number[]; chBw: number }) {
  const { project: p, update } = useStore();
  const saveCert = useSaveCert();
  const bench: RfBench & { points: { hz: number; ref: number; meas: number; measHz: number }[]; steps: number[] } = { levelErrorsDb: [], freqErrorPpm: null, danlDbmHz: null, sweepMHzPerS: null, dynamicRangeDb: null, linearityErrDb: null, calibratedDaysAgo: null, points: [], steps: [], ...(p.spectrum?.bench ?? {}) };
  const setBench = (b: Partial<typeof bench>) => update((d) => { d.spectrum = { ...(d.spectrum ?? { saved: [] }), bench: { ...bench, ...b } }; });
  const [ref, setRef] = useState({ hz: 100e6, dbm: -40 });
  const calDays = p.spectrum?.calAt ? (Date.now() - Date.parse(p.spectrum.calAt)) / 864e5 : null;
  const b2: RfBench = { ...bench, calibratedDaysAgo: calDays, sweepMHzPerS: sweep && sweepS ? (sweep.f[sweep.f.length - 1] - sweep.f[0]) / 1e6 / sweepS : bench.sweepMHzPerS };
  const g = gradeRf(b2);
  const equip = () => [{ name: sweep?.device ?? 'Spectrum analyzer', calibrated: p.spectrum?.calAt, grade: g.grade }];
  const measurePoint = () => { if (!sweep || !trace) return; let b = nearest(sweep.f, ref.hz); for (let j = Math.max(0, b - 30); j < Math.min(trace.length, b + 30); j++) if (trace[j] > trace[b]) b = j;
    const pts = [...bench.points, { hz: ref.hz, ref: ref.dbm, meas: trace[b], measHz: sweep.f[b] }]; const ppms = pts.map((q) => ((q.measHz - q.hz) / q.hz) * 1e6);
    setBench({ points: pts, levelErrorsDb: pts.map((q) => +(q.meas - q.ref).toFixed(2)), freqErrorPpm: +(ppms.reduce((a, x) => a + x, 0) / ppms.length).toFixed(2) }); };
  // ERCES acceptance grid
  const [cell, setCell] = useState({ floor: '1', spot: '', critical: false, ch: watch[0] ?? 0 });
  const session = 'ERCES acceptance (spectrum analyzer)';
  const gridRs = (p.signalReadings ?? []).filter((r) => r.session === session);
  const grid = gridTest(gridRs, -95, 95, 99);
  const capture = () => { if (!sweep || !trace || !cell.ch) return; const k = nearest(sweep.f, cell.ch), lvl = Math.round(trace[k] * 10) / 10;
    update((d) => { d.signalReadings = [...(d.signalReadings ?? []), { id: uid(), at: new Date().toISOString(), dbm: lvl, source: 'serial', session, device: sweep.device, fMHz: +(cell.ch / 1e6).toFixed(5), floor: cell.floor, spot: cell.spot || `Grid ${gridRs.filter((r) => r.floor === cell.floor).length + 1}`, critical: cell.critical }]; }); setCell({ ...cell, spot: '' }); };
  // emission mask
  const [mask, setMask] = useState<MaskId>('D'), [pw, setPw] = useState(50);
  const maskRes = sweep && trace && m?.top ? checkMask(sweep.f, trace, m.top.f, m.top.dbm, mask, pw) : null;
  // booster
  const [pass, setPass] = useState({ lo: 806e6, hi: 824e6, spur: -13, noise: -150 });
  const outBand = sweep && trace ? Math.max(-200, ...Array.from(trace).filter((_, k) => sweep.f[k] < pass.lo || sweep.f[k] > pass.hi)) : null;
  const noiseHz = m ? m.nf - 10 * Math.log10(m.rbwHz) : null;
  return (
    <Card title="6. Benchmarks and certification" className="wide" tip="Benchmark the receiver against a signal generator, then run certification-level tests. Each test saves a signed report on the project (also in Reports → Certification test reports).">
      <h4>Receiver benchmark</h4>
      <div className={'grade-line ' + (g.grade === 'Measurement grade' ? 'ok-text' : g.grade === 'Survey grade' ? '' : 'bad-text')}><b>{g.grade}</b> <span className="small muted">Measurement grade: fit for acceptance and certification tests. Survey grade: design surveys. Indicative only: finding signals.</span></div>
      <div className="row wrap"><label className="field"><span>Generator frequency (MHz)</span><input type="number" step="any" value={ref.hz / 1e6} onChange={(e) => setRef({ ...ref, hz: +e.target.value * 1e6 })} /></label><label className="field"><span>Generator level at the input (dBm)</span><input type="number" step="any" value={ref.dbm} onChange={(e) => setRef({ ...ref, dbm: +e.target.value })} /></label>
        <button disabled={!sweep} onClick={measurePoint}>Measure this point</button>
        <button disabled={!m?.top} onClick={() => m?.top && setBench({ steps: [...bench.steps, m.top.dbm], linearityErrDb: bench.steps.length ? Math.max(...[...bench.steps, m.top.dbm].slice(1).map((v, i) => Math.abs([...bench.steps, m.top!.dbm][i] - v - 10))) : null })} title="Add 10 dB of attenuation between each press">Record 10 dB step</button>
        <button disabled={!m} onClick={() => m && setBench({ danlDbmHz: +(m.nf - 10 * Math.log10(m.rbwHz)).toFixed(1) })} title="With the input terminated in 50 Ω">Record noise floor (DANL)</button>
        <button disabled={!m || (m.pk.length ?? 0) < 1} onClick={() => m?.top && setBench({ dynamicRangeDb: +(m.top.dbm - (m.pk[1]?.dbm ?? m.nf)).toFixed(1) })} title="One clean generator tone: strongest signal against the highest spur">Record dynamic range</button>
        <button className="ghost" onClick={() => setBench({ points: [], levelErrorsDb: [], freqErrorPpm: null, steps: [], linearityErrDb: null, danlDbmHz: null, dynamicRangeDb: null })}>Start over</button></div>
      {bench.points.length > 0 && <table className="tbl"><thead><tr><th>Frequency</th><th>Reference</th><th>Measured</th><th>Error</th></tr></thead><tbody>{bench.points.map((q, i) => <tr key={i}><td>{fmtHz(q.hz)}</td><td>{q.ref} dBm</td><td>{q.meas.toFixed(1)} dBm at {fmtHz(q.measHz)}</td><td className={Math.abs(q.meas - q.ref) <= 1.5 ? 'ok-text' : Math.abs(q.meas - q.ref) <= 3 ? '' : 'bad-text'}>{(q.meas - q.ref).toFixed(2)} dB</td></tr>)}</tbody></table>}
      <table className="tbl"><thead><tr><th>Benchmark</th><th>Requirement</th><th>Measured</th><th>Result</th></tr></thead><tbody>{g.items.map((it) => <tr key={it.item}><td>{it.item}</td><td className="small">{it.requirement}</td><td>{it.measured}</td><td className={it.pass ? 'ok-text' : it.pass === false ? 'bad-text' : 'muted'}>{it.pass === true ? 'PASS' : it.pass === false ? 'FAIL' : '—'}</td></tr>)}</tbody></table>
      <button onClick={() => saveCert({ kind: 'rf', title: 'Spectrum analyzer benchmark', standard: 'Receiver verification against a reference generator (level, frequency, DANL, dynamic range, linearity)', location: 'Bench', equipment: equip(), items: g.items, notes: `Grade: ${g.grade}.` })}>💾 Save benchmark report</button>

      <h4>ERCES acceptance grid test (IFC 510.4.1.1 / NFPA 1225)</h4>
      <p className="small">Each grid cell: tune to the channel, wait for a steady reading, then <b>Capture</b>. Minimum −95 dBm; 95 % of general grid cells on each floor and 99 % of critical areas.</p>
      <div className="row wrap"><label className="field"><span>Channel</span><select value={cell.ch} onChange={(e) => setCell({ ...cell, ch: +e.target.value })} data-no-choose>{watch.length ? watch.map((w) => <option key={w} value={w}>{fmtHz(w)}</option>) : <option value={0}>Add project channels in 5.</option>}</select></label>
        <label className="field"><span>Floor</span><input value={cell.floor} onChange={(e) => setCell({ ...cell, floor: e.target.value })} /></label><label className="field"><span>Grid cell / room</span><input value={cell.spot} onChange={(e) => setCell({ ...cell, spot: e.target.value })} placeholder="auto-numbered" /></label>
        <label className="check"><input type="checkbox" checked={cell.critical} onChange={(e) => setCell({ ...cell, critical: e.target.checked })} /> Critical area</label>
        <button className="primary" disabled={!sweep || !cell.ch} onClick={capture}>Capture</button></div>
      <p className="small">{grid.n + grid.critN} cells: general {Number.isFinite(grid.pct) ? `${grid.pct} %` : '—'}, critical {Number.isFinite(grid.critPct) ? `${grid.critPct} %` : '—'} at −95 dBm or better. Readings are in Live Signal Readings (“{session}”).</p>
      <button disabled={!gridRs.length} onClick={() => saveCert({ kind: 'rf', title: 'ERCES acceptance test (in-building coverage)', standard: 'IFC 510.4.1.1 and NFPA 1225: −95 dBm, 95 % general / 99 % critical areas', location: [...new Set(gridRs.map((r) => `Floor ${r.floor}`))].join(', '), equipment: equip(), items: ercesItems(grid, -95, 95, 99), notes: `${gridRs.length} readings. Delivered audio quality (DAQ 3.0) must also be confirmed by talk tests.` })}>💾 Save acceptance report</button>

      <h4>Emission mask (47 CFR 90.210)</h4>
      <div className="row wrap"><label className="field"><span>Mask</span><select value={mask} onChange={(e) => setMask(e.target.value as MaskId)} data-no-choose><option value="D">Mask D (12.5 kHz channels)</option><option value="B">Mask B (25 kHz channels)</option></select></label><label className="field"><span>Transmitter power (W)</span><input type="number" value={pw} onChange={(e) => setPw(+e.target.value || 1)} /></label>
        {maskRes && <span className={maskRes.pass ? 'ok-text' : 'bad-text'}><b>{maskRes.pass ? 'PASS' : 'FAIL'}</b> · worst margin {Number.isFinite(maskRes.worstMarginDb) ? `${maskRes.worstMarginDb.toFixed(1)} dB at ${fmtHz(maskRes.worstAtHz)}` : '—'}</span>}</div>
      <p className="small muted">Center the carrier (span about 60 kHz, RBW 100 Hz–300 Hz, unmodulated carrier for the reference level).</p>
      <button disabled={!maskRes} onClick={() => maskRes && m?.top && saveCert({ kind: 'rf', title: `Emission mask ${mask}`, standard: '47 CFR 90.210', location: '', equipment: equip(), items: [{ item: `Mask ${mask} at ${fmtHz(m.top.f)}, ${pw} W`, requirement: 'all emissions under the mask', measured: Number.isFinite(maskRes.worstMarginDb) ? `worst margin ${maskRes.worstMarginDb.toFixed(1)} dB` : '—', pass: maskRes.pass }], notes: '' })}>💾 Save mask report</button>

      <h4>Signal booster checks (47 CFR 90.219, licensee limits)</h4>
      <div className="row wrap"><label className="field"><span>Passband (MHz)</span><div className="row"><input type="number" step="any" value={pass.lo / 1e6} onChange={(e) => setPass({ ...pass, lo: +e.target.value * 1e6 })} /><input type="number" step="any" value={pass.hi / 1e6} onChange={(e) => setPass({ ...pass, hi: +e.target.value * 1e6 })} /></div></label>
        <label className="field"><span>Spurious limit outside passband (dBm)</span><input type="number" value={pass.spur} onChange={(e) => setPass({ ...pass, spur: +e.target.value })} /></label>
        <label className="field"><span>Uplink noise limit (dBm/Hz)</span><input type="number" value={pass.noise} onChange={(e) => setPass({ ...pass, noise: +e.target.value })} /></label></div>
      {(() => { const items = [
        { item: 'Out-of-band emissions', requirement: `≤ ${pass.spur} dBm outside ${fmtHz(pass.lo)}–${fmtHz(pass.hi)}`, measured: outBand == null || outBand <= -199 ? 'not measured' : `${outBand.toFixed(1)} dBm`, pass: outBand == null || outBand <= -199 ? null : outBand <= pass.spur },
        { item: 'Uplink noise floor', requirement: `≤ ${pass.noise} dBm/Hz at the donor port`, measured: noiseHz == null ? 'not measured' : `${noiseHz.toFixed(1)} dBm/Hz`, pass: noiseHz == null ? null : noiseHz <= pass.noise },
        { item: 'No oscillation (wideband hump)', requirement: 'none', measured: m?.top ? `strongest ${m.top.dbm.toFixed(1)} dBm, ${(m.top.dbm - m.nf).toFixed(0)} dB over floor` : 'not measured', pass: m?.top ? !(m.top.dbm - m.nf > 25 && (m.obw?.bw ?? 0) > 150e3) : null },
      ]; return <><table className="tbl"><tbody>{items.map((it) => <tr key={it.item}><td>{it.item}</td><td className="small">{it.requirement}</td><td>{it.measured}</td><td className={it.pass ? 'ok-text' : it.pass === false ? 'bad-text' : 'muted'}>{it.pass === true ? 'PASS' : it.pass === false ? 'FAIL' : '—'}</td></tr>)}</tbody></table>
        <p className="small muted">The limits shown are defaults; use the system licensee's written limits. Overall: {overall(items) === true ? 'PASS' : overall(items) === false ? 'FAIL' : 'incomplete'}.</p>
        <button disabled={!sweep} onClick={() => saveCert({ kind: 'rf', title: 'Signal booster (BDA) compliance checks', standard: '47 CFR 90.219 and the licensee’s limits', location: '', equipment: equip(), items, notes: `Channel bandwidth ${fmtHz(chBw)}.` })}>💾 Save booster report</button></>; })()}

      <h4>Saved certification reports</h4>
      <CertList kind="rf" />
    </Card>
  );
}
