import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, downloadText, safeName } from '../store';
import { Card, Stat } from '../components/ui';
import { DropZone } from '../components/DropZone';
import { CertList, useSaveCert } from '../components/CertReport';
import { bandLevels, essSweep, impulseResponse, ncRating, OCT, powerSpectrum, reverb, stats, stiFromIr, TAU, thd, totalLevel, weightDb, type Weighting } from '../engine/audio';
import { MicCalPanel } from '../components/MicCalLibrary';
import { applyCal, BUILTIN_CALS, loadUserCals, matchDevice, type MicCal } from '../engine/miccal';
import { gradeAudio, nfpaAudibility, stiAcceptance, type AudioBench } from '../engine/certification';

// Live input: microphone or interface with all browser processing off, raw samples kept in a ring buffer and in recordings.
class Input {
  ctx: AudioContext; stream: MediaStream; node: ScriptProcessorNode; ring = new Float32Array(1 << 16); w = 0; rec: Float32Array[] | null = null; settings: MediaTrackSettings;
  constructor(ctx: AudioContext, stream: MediaStream) {
    this.ctx = ctx; this.stream = stream; this.settings = stream.getAudioTracks()[0]?.getSettings() ?? {};
    const src = ctx.createMediaStreamSource(stream); this.node = ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => { const x = e.inputBuffer.getChannelData(0); for (let i = 0; i < x.length; i++) this.ring[(this.w + i) & 0xffff] = x[i]; this.w = (this.w + x.length) & 0xffff; if (this.rec) this.rec.push(x.slice()); };
    const mute = ctx.createGain(); mute.gain.value = 0; src.connect(this.node); this.node.connect(mute).connect(ctx.destination);
  }
  last(n: number): Float32Array { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = this.ring[(this.w - n + i) & 0xffff]; return o; }
  async record(seconds: number, during?: () => void): Promise<Float32Array> {
    this.rec = []; during?.(); await new Promise((r) => setTimeout(r, seconds * 1000)); const parts = this.rec; this.rec = null;
    const out = new Float32Array(parts.reduce((a, b) => a + b.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
  }
  close() { this.node.disconnect(); this.stream.getTracks().forEach((t) => t.stop()); this.ctx.close(); }
}

const fmtDb = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
type Panel = 'meter' | 'rta' | 'room' | 'noise' | 'thd' | 'nfpa' | 'sti' | 'bench';

export function AudioPage() {
  const { project: p, update } = useStore();
  const saveCert = useSaveCert();
  const [devs, setDevs] = useState<MediaDeviceInfo[]>([]); const [devId, setDevId] = useState(p.audio?.device ?? '');
  const inp = useRef<Input | null>(null); const [on, setOn] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  const [w, setW] = useState<Weighting>('A'), [tw, setTw] = useState<keyof typeof TAU>('F'), [third, setThird] = useState(true);
  const cal = p.audio?.calDb ?? null, mic = (p.audio?.micCal ?? null) as MicCal | null;
  const pickCal = (c: MicCal | null, auto = false) => update((d) => { d.audio = { ...(d.audio ?? {}), micCal: c ? { ...c, auto: auto || undefined } : undefined, micCalOff: c ? undefined : true }; });
  const [lv, setLv] = useState<{ now: number; hist: number[]; bands: { label: string; db: number }[]; spec: Float64Array | null; df: number }>({ now: NaN, hist: [], bands: [], spec: null, df: 1 });
  const [panel, setPanel] = useState<Panel>('meter');
  const [gen, setGen] = useState({ f: 1000, db: -12, kind: 'sine' as 'sine' | 'pink' | 'white' }); const genNode = useRef<{ stop: () => void } | null>(null);
  const [result, setResult] = useState<Record<string, unknown>>({});
  const [loc, setLoc] = useState('');
  const [stiPts, setStiPts] = useState<{ loc: string; sti: number }[]>([]);
  const [nfpa, setNfpa] = useState<{ mode: 'public' | 'private' | 'sleeping'; avg: number | null; max: number | null; sig: number | null }>({ mode: 'public', avg: null, max: null, sig: null });
  const [bench, setBench] = useState<Partial<AudioBench>>({});

  useEffect(() => { navigator.mediaDevices?.enumerateDevices().then((d) => setDevs(d.filter((x) => x.kind === 'audioinput'))).catch(() => {}); }, [on]);
  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: devId ? { exact: devId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      const ctx = new AudioContext({ latencyHint: 'interactive' }); inp.current = new Input(ctx, stream); setOn(true);
      update((d) => { d.audio = { ...(d.audio ?? {}), device: devId }; });
      // pick a calibration automatically from the input name (the user's own file first), unless the user removed it
      if (!mic && !p.audio?.micCalOff) {
        const label = stream.getAudioTracks()[0]?.label ?? '', phone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
        const c = matchDevice(label, [...(await loadUserCals().catch(() => [])), ...BUILTIN_CALS], phone); if (c) pickCal(c, true);
      }
    } catch (e) { setErr(/Permission|denied|NotAllowed/i.test(String(e)) ? 'Microphone access was not allowed. Allow it in the browser address bar and try again.' : String((e as Error).message ?? e)); }
  };
  const stopIn = () => { genNode.current?.stop(); inp.current?.close(); inp.current = null; setOn(false); };
  useEffect(() => () => { genNode.current?.stop(); inp.current?.close(); }, []);

  // live analysis loop
  useEffect(() => {
    if (!on) return; let raf = 0, last = 0, s = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop); const I = inp.current; if (!I || t - last < 50) return; const dt = (t - last) / 1000; last = t;
      const x = I.last(8192), { p: ps, df } = powerSpectrum(x); const d = df(I.ctx.sampleRate);
      applyCal(ps, d, mic);
      const lvl = totalLevel(ps, d, w, cal ?? 0, 20, 20000); if (!Number.isFinite(lvl) || lvl < -150) return; const a = Math.exp(-dt / TAU[tw]); s = s ? a * s + (1 - a) * 10 ** (lvl / 10) : 10 ** (lvl / 10);
      const now = 10 * Math.log10(s + 1e-30);
      setLv((o) => ({ now, hist: [...o.hist, now].slice(-1200), bands: bandLevels(ps, d, third, w, cal ?? 0), spec: ps, df: d }));
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [on, w, tw, third, cal, mic]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useMemo(() => stats(lv.hist), [lv.hist]);
  const unit = cal == null ? 'dBFS' : `dB${w === 'Z' ? '' : `(${w})`} SPL`;

  // generator
  const play = (kind = gen.kind, f = gen.f, db = gen.db, buf?: Float32Array) => {
    genNode.current?.stop(); const I = inp.current; const ctx = I?.ctx ?? new AudioContext(); const g = ctx.createGain(); g.gain.value = 10 ** (db / 20); g.connect(ctx.destination);
    let src: AudioScheduledSourceNode;
    if (buf) { const b = ctx.createBuffer(1, buf.length, ctx.sampleRate); b.copyToChannel(buf, 0); const s = ctx.createBufferSource(); s.buffer = b; src = s; }
    else if (kind === 'sine') { const o = ctx.createOscillator(); o.frequency.value = f; src = o; }
    else { const n = ctx.sampleRate * 4, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) { const wv = Math.random() * 2 - 1; if (kind === 'white') d[i] = wv * 0.5; else { b0 = 0.99886 * b0 + wv * 0.0555179; b1 = 0.99332 * b1 + wv * 0.0750759; b2 = 0.969 * b2 + wv * 0.153852; b3 = 0.8665 * b3 + wv * 0.3104856; b4 = 0.55 * b4 + wv * 0.5329522; b5 = -0.7616 * b5 - wv * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + wv * 0.5362) * 0.11; b6 = wv * 0.115926; } }
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; src = s; }
    src.connect(g); src.start(); genNode.current = { stop: () => { try { src.stop(); } catch { /* */ } g.disconnect(); } };
  };

  // measurements
  const need = () => { if (!inp.current) { setErr('Start the input first.'); return null; } setErr(''); return inp.current; };
  const measureLeq = async (sec: number, label: string) => {
    const I = need(); if (!I) return null; setBusy(`${label}: measuring for ${sec} s…`);
    const x = await I.record(sec), sr = I.ctx.sampleRate, blk = Math.round(sr * 0.125), lv2: number[] = [];
    for (let i = 0; i + 4096 <= x.length; i += blk) { const { p: ps, df } = powerSpectrum(x.subarray(i, i + 4096)); const d = df(sr); applyCal(ps, d, mic); lv2.push(totalLevel(ps, d, 'A', cal ?? 0)); }
    const { p: P, df } = powerSpectrum(x.subarray(0, 1 << Math.floor(Math.log2(Math.min(x.length, 1 << 17))))); const d = df(sr); applyCal(P, d, mic);
    setBusy(''); return { st: stats(lv2)!, oct: bandLevels(P, d, false, 'Z', cal ?? 0) };
  };
  const room = async () => {
    const I = need(); if (!I) return; const sr = I.ctx.sampleRate, { sweep, inverse } = essSweep(40, Math.min(20000, sr / 2.2), 4, sr);
    setBusy('Playing the sweep: keep quiet…'); const rec = await I.record(6.5, () => setTimeout(() => play('sine', 0, gen.db, sweep), 500));
    const ir = impulseResponse(rec, inverse, sr, 3), rv = reverb(ir, sr);
    const bg = (result.noise as { oct?: { label: string; db: number }[] } | undefined)?.oct, sigA = (result.noise as { sig?: number } | undefined)?.sig;
    const snr = bg && sigA != null ? OCT.map((f) => { const b = bg.find((q) => q.label === (f >= 1000 ? `${f / 1000}k` : String(f))); return b ? sigA - b.db : 60; }) : [];
    const s = stiFromIr(ir, sr, snr); setResult({ ...result, room: { rv, sti: s } }); setBusy('');
    if (loc) setStiPts([...stiPts, { loc, sti: +s.sti.toFixed(3) }]);
  };
  const doThd = async () => { const I = need(); if (!I) return; play('sine', gen.f, gen.db); await new Promise((r) => setTimeout(r, 600)); const x = I.last(32768), { p: P, df } = powerSpectrum(x); genNode.current?.stop(); const r = thd(P, df(I.ctx.sampleRate), gen.f), mx = 10 * Math.log10(Math.max(...P) * 7 + 1e-30);
    if (r.fundDb < mx - 10) { setErr(`The ${gen.f} Hz test tone was not picked up at the input (something louder is there). Point the microphone at the speaker, or use a loopback cable, and raise the level.`); return; }
    setResult({ ...result, thd: r }); };
  const doNoise = async () => { const r = await measureLeq(10, 'Background noise'); if (r) setResult({ ...result, noise: { ...r, nc: ncRating(r.oct.filter((b) => +b.fm >= 56 && +b.fm <= 9000).slice(0, 8).map((b) => b.db)) } }); };
  const calibrate = async (level: number) => {
    const I = need(); if (!I) return; setBusy(`Calibrating to ${level} dB at 1 kHz…`); const x = await I.record(3), { p: P, df } = powerSpectrum(x.subarray(0, 65536)); const d = df(I.ctx.sampleRate);
    const all = bandLevels(P, d, false, 'Z', 0), b = all.find((q) => q.label === '1k')!; const c = level - b.db;
    if (all.some((q) => q.label !== '1k' && q.db > b.db - 10)) { setBusy(''); setErr('No clean 1 kHz calibrator tone found: fit the calibrator snugly on the microphone, switch it on, and try again.'); return; } update((dd) => { dd.audio = { ...(dd.audio ?? {}), calDb: +c.toFixed(2), calAt: new Date().toISOString(), calLevel: level }; }); setBusy(''); setResult({ ...result, cal: `Calibrated: ${b.db.toFixed(1)} dBFS = ${level} dB SPL (offset ${c.toFixed(2)} dB).` });
  };
  const calCheck = async () => { const r = await measureLeq(10, 'Calibrator check'); if (!r || cal == null) return; const L = p.audio?.calLevel ?? 94; const one = r.oct.find((q) => q.label === '1k')!; setBench({ ...bench, calDeviationDb: one.db - L, calStabilityDb: Math.max(0.01, (r.st.l10 - r.st.l90) / 2.56) }); };
  const loopback = async () => {
    const I = need(); if (!I) return; const sr = I.ctx.sampleRate, { sweep, inverse } = essSweep(20, 20000, 2, sr); setBusy('Loopback: connect the output to the input with a cable…');
    const rec = await I.record(3.5, () => setTimeout(() => play('sine', 0, -6, sweep), 300)); const ir = impulseResponse(rec, inverse, sr, 0.2), { p: P, df } = powerSpectrum(ir.subarray(0, 8192)); const d = df(sr);
    const mags = []; for (let j = 1; j < P.length; j++) { const f = j * d; if (f >= 50 && f <= 16000) mags.push(10 * Math.log10(P[j] + 1e-30)); }
    const mean = mags.reduce((a, b) => a + b, 0) / mags.length; play('sine', 1000, -6); await new Promise((r) => setTimeout(r, 500)); const t = thd(powerSpectrum(I.last(32768)).p, sr / 32768, 1000); genNode.current?.stop(); setBusy('');
    setBench({ ...bench, loopbackFlatnessDb: Math.max(...mags.map((m) => Math.abs(m - mean))), loopbackThdPct: t.thdPct });
  };
  const ab: AudioBench = { calDeviationDb: bench.calDeviationDb ?? null, calStabilityDb: bench.calStabilityDb ?? null, selfNoiseDba: bench.selfNoiseDba ?? null, micCalFile: !!mic && mic.source !== 'builtin', processingOff: !!inp.current && inp.current.settings.echoCancellation !== true && inp.current.settings.noiseSuppression !== true && inp.current.settings.autoGainControl !== true,
    sampleRate: inp.current?.ctx.sampleRate ?? 0, latencyMs: inp.current ? (inp.current.ctx.baseLatency + ((inp.current.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0)) * 1000 : null, loopbackFlatnessDb: bench.loopbackFlatnessDb ?? null, loopbackThdPct: bench.loopbackThdPct ?? null };
  const grade = gradeAudio(ab);
  const equip = () => [{ name: devs.find((d) => d.deviceId === devId)?.label || 'Measurement microphone / interface', serial: mic?.name, calibrated: p.audio?.calAt, grade: grade.grade }];

  // RTA drawing
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const c = cv.current; if (!c || !lv.bands.length) return; const W = c.clientWidth || 800, H = 240; c.width = W; c.height = H; const g = c.getContext('2d')!; g.fillStyle = '#0b1520'; g.fillRect(0, 0, W, H);
    const top = Math.ceil(Math.max(...lv.bands.map((b) => b.db), cal == null ? -20 : 90) / 10) * 10, bottom = top - 80, bw = W / lv.bands.length;
    g.font = '10px system-ui'; for (let i = 0; i <= 8; i++) { const y = (H - 16) * (i / 8); g.strokeStyle = '#25384d'; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.fillStyle = '#9fb3c8'; g.fillText(String(top - i * 10), 2, y + 10); }
    lv.bands.forEach((b, i) => { const h = Math.max(0, ((b.db - bottom) / (top - bottom)) * (H - 16)); g.fillStyle = '#29b6f6'; g.fillRect(i * bw + 2, H - 16 - h, bw - 4, h); if (lv.bands.length < 12 || i % 3 === 0) { g.fillStyle = '#9fb3c8'; g.fillText(b.label, i * bw + 2, H - 4); } });
  }, [lv.bands, cal]);

  const rm = result.room as { rv: { fm: number; edt: number | null; t20: number | null; t30: number | null }[]; sti: { sti: number; rating: string; mti: number[] } } | undefined;
  const nz = result.noise as { st: { leq: number; l90: number; lmax: number; l10: number }; oct: { label: string; db: number }[]; nc: number | null } | undefined;
  const th = result.thd as { thdPct: number; thdnPct: number } | undefined;
  const P = (id: Panel, label: string) => <button className={panel === id ? 'primary' : ''} onClick={() => setPanel(id)}>{label}</button>;
  return (
    <div className="grid au-page">
      <Card title="1. Input and calibration" className="wide" tip="Use a measurement microphone (USB like miniDSP UMIK-1/UMIK-2, Dayton iMM-6/EMM-6 with an interface) and an acoustic calibrator for certified readings. Browser processing (echo cancellation, noise suppression, auto gain) is turned off.">
        <div className="row wrap">
          <select value={devId} onChange={(e) => setDevId(e.target.value)} style={{ width: 'auto' }} data-no-choose aria-label="Input device"><option value="">Default input</option>{devs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}</select>
          {!on ? <button className="primary" onClick={start}>▶ Start input</button> : <button onClick={stopIn}>■ Stop</button>}
          <button disabled={!on || !!busy} onClick={() => calibrate(94)}>Calibrate (94 dB calibrator)</button><button disabled={!on || !!busy} onClick={() => calibrate(114)}>Calibrate (114 dB)</button>
          {mic?.sensDb != null && cal == null && <button onClick={() => update((d) => { d.audio = { ...(d.audio ?? {}), calDb: +(94 - mic.sensDb!).toFixed(2), calAt: undefined, calLevel: undefined }; })} title="Indicative: assumes the interface gain the file was made for">Use the cal file's sensitivity</button>}
        </div>
        <p className="small">{cal == null ? 'Level not calibrated yet (use a sound calibrator above): levels are in dBFS (relative). ' : `Calibration offset ${cal.toFixed(2)} dB${p.audio?.calAt ? `, ${new Date(p.audio.calAt).toLocaleString()} at ${p.audio.calLevel} dB` : ' (from the cal file sensitivity)'}. `}{inp.current && `Sample rate ${inp.current.ctx.sampleRate} Hz.`}</p>
        <MicCalPanel active={mic} onPick={(c) => pickCal(c)} onError={setErr} />
        {busy && <p className="small" role="status"><span className="spin" /> {busy}</p>}{err && <p className="bad-text" role="alert">{err}</p>}{typeof result.cal === 'string' && <p className="ok-text small">{result.cal}</p>}
      </Card>

      <Card title="2. Sound level meter" className="wide" actions={<div className="row wrap"><select value={w} onChange={(e) => setW(e.target.value as Weighting)} style={{ width: 'auto' }} data-no-choose><option value="A">A-weighting</option><option value="C">C-weighting</option><option value="Z">Z (flat)</option></select><select value={tw} onChange={(e) => setTw(e.target.value as 'F')} style={{ width: 'auto' }} data-no-choose><option value="F">Fast</option><option value="S">Slow</option><option value="I">Impulse</option></select><button onClick={() => setLv((o) => ({ ...o, hist: [] }))}>Reset stats</button></div>}>
        <div className="au-big"><b>{fmtDb(lv.now)}</b> <span>{unit} · {tw === 'F' ? 'Fast' : tw === 'S' ? 'Slow' : 'Impulse'}</span></div>
        <div className="stats"><Stat label="Leq" value={fmtDb(st?.leq)} /><Stat label="Lmax" value={fmtDb(st?.lmax)} /><Stat label="Lmin" value={fmtDb(st?.lmin)} /><Stat label="L10" value={fmtDb(st?.l10)} /><Stat label="L50" value={fmtDb(st?.l50)} /><Stat label="L90" value={fmtDb(st?.l90)} /></div>
        <div className="row wrap" style={{ marginTop: 8 }}><span className="small muted">Real-time analyzer</span><button className={third ? 'primary' : ''} onClick={() => setThird(true)}>1/3 octave</button><button className={!third ? 'primary' : ''} onClick={() => setThird(false)}>1/1 octave</button>
          <button disabled={!lv.bands.length} onClick={() => downloadText(`${safeName(p.meta.name)}_rta.csv`, 'Band (Hz),Level (dB)\n' + lv.bands.map((b) => `${b.label},${b.db.toFixed(1)}`).join('\n'), 'text/csv')}>⬇ CSV</button></div>
        <canvas ref={cv} style={{ width: '100%', height: 240, display: 'block', borderRadius: 6 }} aria-label="Real-time analyzer bars" />
      </Card>

      <Card title="3. Signal generator" className="wide">
        <div className="row wrap"><select value={gen.kind} onChange={(e) => setGen({ ...gen, kind: e.target.value as 'sine' })} style={{ width: 'auto' }} data-no-choose><option value="sine">Sine</option><option value="pink">Pink noise</option><option value="white">White noise</option></select>
          {gen.kind === 'sine' && <label className="field"><span>Frequency (Hz)</span><input type="number" value={gen.f} onChange={(e) => setGen({ ...gen, f: +e.target.value || 1000 })} /></label>}
          <label className="field"><span>Level (dBFS)</span><input type="number" max={0} value={gen.db} onChange={(e) => setGen({ ...gen, db: Math.min(0, +e.target.value) })} /></label>
          <button className="primary" onClick={() => play()}>▶ Play</button><button onClick={() => genNode.current?.stop()}>■ Stop</button></div>
        <p className="small muted">Start low and raise the level slowly. Pink noise is the usual source for speaker and room balancing.</p>
      </Card>

      <Card title="4. Measurements, benchmarks and certification" className="wide">
        <div className="sa-tests">{P('room', 'Room: RT60 & STI')}{P('noise', 'Background noise & NC')}{P('thd', 'Distortion (THD+N)')}{P('nfpa', 'NFPA 72 audibility')}{P('sti', 'Intelligibility acceptance')}{P('bench', 'Benchmark the measuring chain')}</div>
        <label className="field" style={{ maxWidth: 340 }}><span>Location of this measurement</span><input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="e.g. Classroom 104, seat row 3" /></label>
        {panel === 'room' && <div><p className="small">Plays a 4-second sine sweep through the speakers and records it, then works out the impulse response, reverberation (ISO 3382: EDT, T20, T30 by octave) and the speech transmission index (IEC 60268-16, indirect method). Measure the background noise first to include it in the STI.</p>
          <button className="primary" disabled={!on || !!busy} onClick={room}>Measure the room</button>
          {rm && <><table className="tbl"><thead><tr><th>Octave (Hz)</th>{rm.rv.map((r) => <th key={r.fm}>{r.fm >= 1000 ? `${r.fm / 1000}k` : r.fm}</th>)}</tr></thead><tbody>
            <tr><td>EDT (s)</td>{rm.rv.map((r) => <td key={r.fm}>{fmtDb(r.edt, 2)}</td>)}</tr><tr><td>T20 (s)</td>{rm.rv.map((r) => <td key={r.fm}>{fmtDb(r.t20, 2)}</td>)}</tr><tr><td>T30 (s)</td>{rm.rv.map((r) => <td key={r.fm}>{fmtDb(r.t30, 2)}</td>)}</tr><tr><td>MTI</td>{rm.sti.mti.map((m, i) => <td key={i}>{m.toFixed(2)}</td>)}</tr></tbody></table>
            <p><b>STI {rm.sti.sti.toFixed(2)}</b> · {rm.sti.rating}{loc ? ` · added to the intelligibility points for “${loc}”` : ''}</p></>}</div>}
        {panel === 'noise' && <div><button className="primary" disabled={!on || !!busy} onClick={doNoise}>Measure 10 s of background noise</button>
          {nz && <><p>Leq <b>{nz.st.leq.toFixed(1)} dBA</b> · L90 {nz.st.l90.toFixed(1)} · Lmax {nz.st.lmax.toFixed(1)} · <b>NC-{nz.nc ?? '70+'}</b></p>
            <label className="field" style={{ maxWidth: 300 }}><span>Speech / paging level for STI (dBA)</span><input type="number" defaultValue={65} onChange={(e) => setResult({ ...result, noise: { ...nz, sig: +e.target.value } })} /></label>
            <button onClick={() => setBench({ ...bench, selfNoiseDba: nz.st.leq })} title="Use this as the chain's self-noise (in a very quiet room or with the mic sealed)">Use as self-noise for the benchmark</button></>}</div>}
        {panel === 'thd' && <div><p className="small">Plays the generator sine and measures total harmonic distortion (harmonics 2–10) and THD+N.</p><button className="primary" disabled={!on} onClick={doThd}>Measure distortion</button>{th && <p>THD <b>{th.thdPct.toFixed(3)} %</b> · THD+N <b>{th.thdnPct.toFixed(3)} %</b> at {gen.f} Hz</p>}</div>}
        {panel === 'nfpa' && <div><div className="row wrap"><select value={nfpa.mode} onChange={(e) => setNfpa({ ...nfpa, mode: e.target.value as 'public' })} style={{ width: 'auto' }} data-no-choose><option value="public">Public mode</option><option value="private">Private mode</option><option value="sleeping">Sleeping area</option></select>
            <button disabled={!on || !!busy} onClick={async () => { const r = await measureLeq(60, 'Ambient (60 s, normal occupancy)'); if (r) setNfpa({ ...nfpa, avg: r.st.leq, max: r.st.lmax }); }}>1. Measure ambient (60 s)</button>
            <button disabled={!on || !!busy} onClick={async () => { const r = await measureLeq(10, 'Alarm signal (sound the system)'); if (r) setNfpa({ ...nfpa, sig: r.st.leq }); }}>2. Measure the alarm signal (10 s)</button></div>
          {nfpa.avg != null && <p className="small">Ambient average {nfpa.avg.toFixed(1)} dBA, max {nfpa.max!.toFixed(1)} dBA{nfpa.sig != null ? `, signal ${nfpa.sig.toFixed(1)} dBA` : ''}.</p>}
          {nfpa.avg != null && nfpa.sig != null && (() => { const items = nfpaAudibility({ mode: nfpa.mode, ambientAvgDba: nfpa.avg, ambientMax60sDba: nfpa.max!, signalDba: nfpa.sig }); return <><ul className="checks">{items.map((i) => <li key={i.item} className={i.pass ? 'ok-text' : 'bad-text'}>{i.pass ? '✓' : '✗'} {i.item}: {i.measured} (need {i.requirement})</li>)}</ul>
            <button onClick={() => saveCert({ kind: 'audio', title: 'Fire alarm audibility test', standard: 'NFPA 72 (2022) 18.4.3–18.4.6, A-weighted', location: loc, equipment: equip(), items, notes: cal == null ? 'Input not calibrated: levels are relative.' : '' })}>💾 Save audibility report</button></>; })()}</div>}
        {panel === 'sti' && <div><p className="small">Each room measurement with a location adds a point. Acceptance per acoustically distinguishable space (NFPA 72 Annex D).</p>
          {stiPts.length ? <table className="tbl"><tbody>{stiPts.map((q, i) => <tr key={i}><td>{q.loc}</td><td>{q.sti.toFixed(2)}</td><td><button className="ghost" onClick={() => setStiPts(stiPts.filter((_, j) => j !== i))}>✕</button></td></tr>)}</tbody></table> : <p className="small muted">No points yet.</p>}
          {stiPts.length > 0 && (() => { const items = stiAcceptance(stiPts.map((q) => q.sti)); return <><ul className="checks">{items.map((i) => <li key={i.item} className={i.pass ? 'ok-text' : 'bad-text'}>{i.pass ? '✓' : '✗'} {i.item}: {i.measured} (need {i.requirement})</li>)}</ul>
            <button onClick={() => saveCert({ kind: 'audio', title: 'Speech intelligibility acceptance (STI)', standard: 'IEC 60268-16 (indirect method) · NFPA 72 Annex D criteria', location: [...new Set(stiPts.map((q) => q.loc))].join('; '), equipment: equip(), items, notes: `${stiPts.length} points. Indirect STI from impulse responses; confirm with STIPA where the AHJ requires it.` })}>💾 Save intelligibility report</button></>; })()}</div>}
        {panel === 'bench' && <div><p className="small">Checks the microphone, interface and settings against IEC 61672-1 sound level meter tolerances. This verifies the chain; legal certification still needs a type-approved meter.</p>
          <div className="row wrap"><button disabled={!on || !!busy || cal == null} onClick={calCheck}>Calibrator check (10 s)</button><button disabled={!on || !!busy} onClick={loopback}>Loopback test (cable from output to input)</button><span className="small muted">Self-noise: measure background noise in a quiet room, then “Use as self-noise”.</span></div>
          <div className={'grade-line ' + (grade.grade === 'Indicative only' ? 'bad-text' : 'ok-text')}><b>{grade.grade}</b></div>
          <table className="tbl"><thead><tr><th>Benchmark</th><th>Requirement</th><th>Measured</th><th>Result</th></tr></thead><tbody>{grade.items.map((it) => <tr key={it.item}><td>{it.item}</td><td className="small">{it.requirement}</td><td>{it.measured}</td><td className={it.pass ? 'ok-text' : it.pass === false ? 'bad-text' : 'muted'}>{it.pass === true ? 'PASS' : it.pass === false ? 'FAIL' : '—'}</td></tr>)}</tbody></table>
          <button onClick={() => saveCert({ kind: 'audio', title: 'Audio measuring chain benchmark', standard: 'IEC 61672-1 tolerances (verification, not type approval)', location: 'Bench', equipment: equip(), items: grade.items, notes: `Grade: ${grade.grade}.` })}>💾 Save benchmark report</button></div>}
        <h4>Saved certification reports</h4><CertList kind="audio" />
      </Card>
      <p className="small muted">Uses the computer's or phone's microphone input. For measurements that count, use a calibrated measurement microphone and check it with an acoustic calibrator before and after each session.</p>
    </div>
  );
}
