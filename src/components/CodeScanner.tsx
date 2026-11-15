import React, { useEffect, useRef, useState } from 'react';

/** Decodes barcodes and QR codes from images. The phone's built-in detector is used where there is one
 *  (Android Chrome / app, macOS); everywhere else the bundled ZXing reader (works offline). */
type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string; format: string }[]> };
let zx: Promise<typeof import('@zxing/library')> | null = null;
const zxing = () => (zx ??= import('@zxing/library'));

async function nativeDetector(): Promise<Detector | null> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o?: object): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!BD) return null;
  try { const f = (await BD.getSupportedFormats?.()) ?? []; return f.length ? new BD({ formats: f }) : null; } catch { return null; }
}

/** Grayscale pixels of a canvas region, for ZXing. */
function luminance(ctx: CanvasRenderingContext2D, w: number, h: number): Uint8ClampedArray {
  const d = ctx.getImageData(0, 0, w, h).data, out = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
  return out;
}
export async function decodeCanvas(cv: HTMLCanvasElement): Promise<{ text: string; format: string } | null> {
  const Z = await zxing(); const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const hints = new Map(); hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader(); reader.setHints(hints);
  const src = new Z.RGBLuminanceSource(luminance(ctx, cv.width, cv.height), cv.width, cv.height);
  for (const s of [src, src.invert()]) {
    try { const r = reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(s))); return { text: r.getText(), format: Z.BarcodeFormat[r.getBarcodeFormat()] ?? '' }; } catch { /* none here */ }
  }
  return null;
}
/** Decode a photo file (when the live camera can't be used). */
export async function decodeImageFile(f: File): Promise<{ text: string; format: string } | null> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const det = await nativeDetector();
    if (det) { const r = await det.detect(img).catch(() => []); if (r[0]) return { text: r[0].rawValue, format: r[0].format }; }
    for (const max of [1400, 900, 2200]) {
      const k = Math.min(1, max / Math.max(img.width, img.height)); const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
      const r = await decodeCanvas(cv); if (r) return r;
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}
export function beep() {
  try { const A = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; const a = new A(); const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = 1760; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.12); setTimeout(() => a.close(), 300); } catch { /* no sound */ }
  try { navigator.vibrate?.(80); } catch { /* no vibration */ }
}

/** Live camera scanner for barcodes (Code 128, Code 39, UPC/EAN, ITF, Data Matrix, PDF417) and QR codes. */
export function CodeScanner({ onCode, onClose }: { onCode: (text: string, format: string) => void; onClose: () => void }) {
  const v = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const [torch, setTorch] = useState<null | boolean>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const done = useRef(onCode); done.current = onCode;
  useEffect(() => {
    let stream: MediaStream | null = null, stop = false, t = 0;
    const cv = document.createElement('canvas');
    (async () => {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } }); }
      catch (e) { setErr(`The camera could not start (${(e as Error).message}). Use “📷 Photo of the tag” or type the code.`); return; }
      if (stop) { stream.getTracks().forEach((x) => x.stop()); return; }
      track.current = stream.getVideoTracks()[0] ?? null;
      try { const caps = track.current?.getCapabilities?.() as { torch?: boolean } | undefined; if (caps?.torch) setTorch(false); } catch { /* no torch */ }
      v.current!.srcObject = stream; await v.current!.play().catch(() => undefined);
      const det = await nativeDetector();
      const tick = async () => {
        if (stop || !v.current) return;
        const vw = v.current.videoWidth, vh = v.current.videoHeight;
        if (vw) {
          try {
            let hit: { text: string; format: string } | null = null;
            if (det) { const r = await det.detect(v.current); if (r[0]?.rawValue) hit = { text: r[0].rawValue, format: r[0].format }; }
            else { // centre band where the user aims, scaled down for speed
              const cw = Math.round(vw * 0.85), ch = Math.round(vh * 0.6), k = Math.min(1, 900 / cw);
              cv.width = Math.round(cw * k); cv.height = Math.round(ch * k);
              cv.getContext('2d', { willReadFrequently: true })!.drawImage(v.current, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, cv.width, cv.height);
              hit = await decodeCanvas(cv);
            }
            if (hit && !stop) { stop = true; beep(); done.current(hit.text, hit.format); return; }
          } catch { /* keep scanning */ }
        }
        t = window.setTimeout(tick, det ? 120 : 200);
      };
      tick();
    })();
    return () => { stop = true; clearTimeout(t); stream?.getTracks().forEach((x) => x.stop()); };
  }, []);
  const flip = async () => { if (!track.current || torch == null) return; try { await track.current.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { /* not supported */ } };
  return (
    <div className="scanner code-scanner">
      {err ? <p className="bad-text">{err}</p> : <div className="scan-frame"><video ref={v} playsInline muted /><div className="scan-aim" aria-hidden /></div>}
      {!err && <p className="small muted">Hold the barcode or QR code inside the box. It reads by itself and beeps.</p>}
      <div className="row wrap">{torch != null && <button onClick={flip}>{torch ? '🔦 Light off' : '🔦 Light on'}</button>}<button onClick={onClose}>Close camera</button></div>
    </div>
  );
}
