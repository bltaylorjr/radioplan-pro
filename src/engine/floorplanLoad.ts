// Browser side of floor plan import: opens the uploaded file (image, SVG, PDF, DXF) as a grey sheet for
// engine/floorplan.ts, with the scale and text the file itself carries (PDF title block, DXF units).
import { analyzePlan, extOfName, findScales, ftPerPxFor, grayFromRgba, rasterDxf, readDxf, fileProblem, type FloorPlanImport, type Gray, type PlanScale, type PlanText, type SourceKind } from './floorplan';

const MAX_PX = 3000;

export interface Loaded { g: Gray; colorful: number; source: SourceKind; scale?: PlanScale; texts?: PlanText[]; dpi?: number | null; pages?: number; note?: string }

function canvasOf(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

async function loadImage(f: File): Promise<Loaded> {
  const url = URL.createObjectURL(f);
  try {
    const img = new Image(); img.decoding = 'async';
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('The image could not be opened (damaged file or unsupported type).')); img.src = url; });
    let w = img.naturalWidth || 1600, h = img.naturalHeight || 1200;
    const isSvg = /svg/i.test(f.type) || extOfName(f.name) === 'svg';
    const k = isSvg ? MAX_PX / Math.max(w, h) : Math.min(1, MAX_PX / Math.max(w, h));
    w = Math.round(w * k); h = Math.round(h * k);
    const c = canvasOf(w, h), x = c.getContext('2d', { willReadFrequently: true })!;
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
    const { g, colorful } = grayFromRgba(w, h, x.getImageData(0, 0, w, h).data);
    return { g, colorful, source: isSvg ? 'svg' : 'image', note: k < 1 ? `Reduced from ${img.naturalWidth} × ${img.naturalHeight} px for tracing.` : undefined };
  } finally { URL.revokeObjectURL(url); }
}

async function loadPdf(f: File, pageNo: number): Promise<Loaded> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Runs the PDF reader in the page itself (works offline, from a flash drive and in the app with no worker file).
  await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
  const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
  const base = page.getViewport({ scale: 1 });
  const k = Math.min(MAX_PX / Math.max(base.width, base.height), 300 / 72);
  const vp = page.getViewport({ scale: k });
  const w = Math.round(vp.width), h = Math.round(vp.height), c = canvasOf(w, h), x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  await page.render({ canvasContext: x, viewport: vp }).promise;
  const { g, colorful } = grayFromRgba(w, h, x.getImageData(0, 0, w, h).data);
  // vector or scan: count drawing operations against embedded pictures
  const ops = await page.getOperatorList(); let paths = 0, images = 0;
  for (const fn of ops.fnArray) { if (fn === pdfjs.OPS.constructPath) paths++; if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject) images++; }
  const tc = await page.getTextContent();
  const texts: PlanText[] = [];
  let all = '';
  for (const it of tc.items as { str?: string; transform?: number[] }[]) {
    if (!it.str?.trim() || !it.transform) continue; all += it.str + ' ';
    const [px, py] = vp.convertToViewportPoint(it.transform[4], it.transform[5]); texts.push({ text: it.str, x: px, y: py });
  }
  const source: SourceKind = paths > 0 && (images === 0 || paths > images * 20) ? 'pdf-vector' : 'pdf-scan';
  const { scales, nts } = findScales(all);
  let scale: PlanScale | undefined;
  if (scales.length) {
    const counts = new Map<string, { s: typeof scales[number]; n: number }>(); for (const s of scales) { const v = counts.get(s.label) ?? { s, n: 0 }; v.n++; counts.set(s.label, v); }
    const pick = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    const others = [...counts.keys()].filter((l) => l !== pick.s.label);
    scale = { ftPerPx: ftPerPxFor(pick.s, 72 * k), from: 'notation', note: `Scale ${pick.s.label} read from the sheet${others.length ? ` (the sheet also shows ${others.join(', ')}; the most used one was picked)` : ''}.` };
  }
  // scanned page: its resolution in DPI on paper
  const dpi = source === 'pdf-scan' ? Math.round(72 * k) : null;
  return { g, colorful, source, scale, texts, dpi, pages: doc.numPages, note: nts && !scale ? 'The sheet says NOT TO SCALE (NTS): enter a known dimension.' : undefined };
}

async function loadDxf(f: File): Promise<Loaded> {
  const d = readDxf(await f.text());
  if (!d.lines.length) throw new Error('No linework found in the DXF. Save it as an ASCII DXF (not binary) with the floor plan in model space.');
  const r = rasterDxf(d);
  return { g: r.g, colorful: 0, source: 'dxf', texts: r.texts, scale: { ftPerPx: r.ftPerPx, from: 'cad-units', note: `Drawing units: ${d.unitsName}${d.unitsFt ? '' : ' (assumed inches, the usual for US architectural CAD)'}.${r.wallLayers ? ' Walls taken from the wall layers (A-WALL…).' : ' No A-WALL layer found, so all linework was used.'}` } };
}

/** Opens and analyses one upload. `page` picks the sheet in a multi-page PDF. */
export async function importPlanFile(f: File, opts: { page?: number; floor: number; level: string; ceilingFt: number; wallHeightFt: number }): Promise<{ plan: FloorPlanImport; pages?: number; note?: string }> {
  const bad = fileProblem(f.name); if (bad) throw new Error(bad);
  const e = extOfName(f.name);
  const L = e === 'pdf' ? await loadPdf(f, opts.page ?? 1) : e === 'dxf' ? await loadDxf(f) : await loadImage(f);
  await new Promise((r) => setTimeout(r, 0));
  const a = analyzePlan({ g: L.g, colorful: L.colorful, source: L.source, scale: L.scale, texts: L.texts, dpi: L.dpi });
  const preview = previewOf(L.g, 1600);
  const plan: FloorPlanImport = {
    id: 'fp' + Date.now().toString(36), name: f.name, fileType: f.type || e, size: f.size, addedAt: new Date().toISOString(), source: L.source,
    floor: opts.floor, level: opts.level, ceilingFt: opts.ceilingFt, wallHeightFt: opts.wallHeightFt, ...a, preview: preview.url, previewK: preview.k,
    textItems: L.texts?.slice(0, 400),
  };
  return { plan, pages: L.pages, note: L.note };
}

/** Small JPEG of the sheet for the underlay (keeps the project file small). */
function previewOf(g: Gray, max: number): { url: string; k: number } {
  const k = Math.max(1, Math.max(g.w, g.h) / max), w = Math.round(g.w / k), h = Math.round(g.h / k), c = canvasOf(w, h), x = c.getContext('2d')!;
  const im = x.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const v = g.d[Math.min(g.h - 1, Math.round(y * k)) * g.w + Math.min(g.w - 1, Math.round(xx * k))], i = (y * w + xx) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0);
  return { url: c.toDataURL('image/jpeg', 0.72), k };
}
