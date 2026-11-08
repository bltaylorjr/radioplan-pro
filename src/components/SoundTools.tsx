// Field sound tools that run on the device: a sound level meter on the microphone and a test-signal
// generator (tone, pink noise, sweep) for checking speakers, zones and wiring.
import React, { useEffect, useRef, useState } from 'react';

const KEYS = 'sound level meter spl db microphone measure noise ambient tone generator test signal pink noise sweep speaker polarity audio';
const OFFSET_KEY = 'radioplan.splOffset';

/** A-weighting in dB at frequency f (IEC 61672). */
export function aWeightDb(f: number): number {
  const f2 = f * f;
  const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return 20 * Math.log10(ra) + 2.0;
}
/** Level (dB re full scale) of a magnitude spectrum in dB, optionally A-weighted. */
export function spectrumLevelDb(binsDb: ArrayLike<number>, sampleRate: number, weighted: boolean): number {
  const n = binsDb.length, hz = sampleRate / 2 / n; let p = 0;
  for (let i = 1; i < n; i++) { const f = i * hz; if (f < 20) continue; const w = weighted ? aWeightDb(f) : 0; p += 10 ** ((binsDb[i] + w) / 10); }
  return p > 0 ? 10 * Math.log10(p) : -120;
}

function Meter() {
  const [on, setOn] = useState(false);
  const [lvl, setLvl] = useState<number | null>(null);
  const [stats, setStats] = useState({ min: Infinity, max: -Infinity, leq: 0, n: 0 });
  const [weight, setWeight] = useState(true);
  const [offset, setOffset] = useState(() => { try { return Number(localStorage.getItem(OFFSET_KEY)) || 110; } catch { return 110; } });
  const [ref, setRef] = useState<number | ''>('');
  const [err, setErr] = useState('');
  const stop = useRef<() => void>();
  const raw = useRef(0);
  useEffect(() => () => stop.current?.(), []);
  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
      an.fftSize = 4096; an.smoothingTimeConstant = 0.6; src.connect(an);
      const bins = new Float32Array(an.frequencyBinCount); let raf = 0, sum = 0, n = 0, mn = Infinity, mx = -Infinity;
      const tick = () => {
        an.getFloatFrequencyData(bins);
        // getFloatFrequencyData is per-bin dB; the sum over bins approximates the signal power (Hann window ≈ -1.76 dB correction ignored; calibration absorbs it).
        const db = spectrumLevelDb(bins, ctx.sampleRate, weightRef.current);
        raw.current = db; const v = db + offsetRef.current;
        sum += 10 ** (v / 10); n++; mn = Math.min(mn, v); mx = Math.max(mx, v);
        if (n % 6 === 0) { setLvl(v); setStats({ min: mn, max: mx, leq: 10 * Math.log10(sum / n), n }); }
        raf = requestAnimationFrame(tick);
      };
      tick(); setOn(true);
      stop.current = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => undefined); setOn(false); };
    } catch (e) { setErr(`The microphone could not be opened (${(e as Error).message}). Allow microphone access for this app and try again.`); }
  };
  const weightRef = useRef(weight); weightRef.current = weight;
  const offsetRef = useRef(offset); offsetRef.current = offset;
  const reset = () => { stop.current?.(); setStats({ min: Infinity, max: -Infinity, leq: 0, n: 0 }); setLvl(null); start(); };
  const calibrate = () => { if (ref === '' || !on) return; const o = Math.round((ref - raw.current) * 10) / 10; setOffset(o); try { localStorage.setItem(OFFSET_KEY, String(o)); } catch { /* ignore */ } };
  const unit = weight ? 'dBA' : 'dB';
  return (
    <div>
      <h4>Sound level meter</h4>
      <div className="row wrap">
        {on ? <button onClick={() => stop.current?.()}>■ Stop</button> : <button className="primary" onClick={start}>🎙 Start measuring</button>}
        {on && <button onClick={reset}>Reset min / max / average</button>}
        <label className="row"><input type="checkbox" checked={weight} onChange={(e) => setWeight(e.target.checked)} /> A-weighted</label>
      </div>
      {err && <p className="warnbox">{err}</p>}
      <div className="stats">
        <div className="stat"><span className="small">Now</span><b style={{ fontSize: '2rem' }}>{lvl == null ? '—' : lvl.toFixed(1)}</b> {unit}</div>
        <div className="stat"><span className="small">Average (Leq)</span><b>{stats.n ? stats.leq.toFixed(1) : '—'}</b> {unit}</div>
        <div className="stat"><span className="small">Min</span><b>{Number.isFinite(stats.min) ? stats.min.toFixed(1) : '—'}</b></div>
        <div className="stat"><span className="small">Max</span><b>{Number.isFinite(stats.max) ? stats.max.toFixed(1) : '—'}</b></div>
      </div>
      <details><summary className="small">Calibrate against a real meter</summary>
        <p className="small">Hold this device next to a calibrated sound level meter (or a 94 dB calibrator), type the meter's reading and press Calibrate. The setting is kept on this device.</p>
        <div className="row"><input type="number" value={ref} placeholder="Meter reads (dB)" onChange={(e) => setRef(e.target.value === '' ? '' : +e.target.value)} style={{ width: 150 }} /><button onClick={calibrate} disabled={!on || ref === ''}>Calibrate</button><span className="small muted">Offset {offset} dB</span></div>
      </details>
      <p className="small muted">Phone and laptop microphones are not certified meters: use this for quick checks (ambient noise, before/after, zone to zone). Acceptance tests for fire alarm and mass notification need a Type 1 or Type 2 meter (NFPA 72 Ch. 14 / 18).</p>
    </div>
  );
}

type Sig = 'tone' | 'pink' | 'sweep';
function Generator() {
  const [sig, setSig] = useState<Sig>('tone');
  const [hz, setHz] = useState(1000);
  const [vol, setVol] = useState(0.2);
  const [on, setOn] = useState(false);
  const node = useRef<{ ctx: AudioContext; gain: GainNode; stop: () => void }>();
  useEffect(() => () => node.current?.stop(), []);
  useEffect(() => { if (node.current) node.current.gain.gain.value = vol; }, [vol]);
  const play = () => {
    node.current?.stop();
    const ctx = new AudioContext(), gain = ctx.createGain(); gain.gain.value = vol; gain.connect(ctx.destination);
    let src: AudioScheduledSourceNode;
    if (sig === 'pink') {
      // Paul Kellet's pink-noise filter on white noise, 4 s looped buffer.
      const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; src = s;
    } else {
      const o = ctx.createOscillator(); o.type = 'sine';
      if (sig === 'sweep') { const t = ctx.currentTime; o.frequency.setValueAtTime(20, t); for (let k = 0; k < 100; k++) { o.frequency.setValueAtTime(20, t + k * 10); o.frequency.exponentialRampToValueAtTime(20000, t + k * 10 + 10); } }
      else o.frequency.value = hz;
      src = o;
    }
    src.connect(gain); src.start();
    node.current = { ctx, gain, stop: () => { try { src.stop(); } catch { /* ignore */ } ctx.close().catch(() => undefined); node.current = undefined; setOn(false); } };
    setOn(true);
  };
  return (
    <div>
      <h4>Test signal generator</h4>
      <div className="row wrap">
        <select value={sig} onChange={(e) => setSig(e.target.value as Sig)} aria-label="Signal">
          <option value="tone">Sine tone</option><option value="pink">Pink noise</option><option value="sweep">Sweep 20 Hz – 20 kHz (10 s, repeats)</option>
        </select>
        {sig === 'tone' && <select value={hz} onChange={(e) => setHz(+e.target.value)} aria-label="Frequency">{[60, 100, 250, 400, 500, 1000, 2000, 4000, 8000].map((f) => <option key={f} value={f}>{f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`}</option>)}</select>}
        <label className="row small">Level <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(+e.target.value)} /></label>
        {on ? <button onClick={() => node.current?.stop()}>■ Stop</button> : <button className="primary" onClick={play}>▶ Play</button>}
      </div>
      <p className="small">Plug this device into a mixer, paging input or amplifier (or play it near a microphone) to trace zones, find a dead or buzzing speaker, and set levels. Pink noise is used for level and EQ checks with the meter above; 1 kHz is the usual line-level reference tone.</p>
      <p className="small muted">Start with the level low. Sweeps and high tones at full power can damage horns and tweeters, and hearing.</p>
    </div>
  );
}

export function SoundTools({ q }: { q: string }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.every((w) => `sound tools ${KEYS} paging`.includes(w))) return null;
  return (
    <div className="card" data-tour="sound-tools">
      <h3>🔊 Sound tools (this device)</h3>
      <div className="grid2"><Meter /><Generator /></div>
    </div>
  );
}
