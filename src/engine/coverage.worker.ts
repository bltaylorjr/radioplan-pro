// Background helper: works out a band of rows of a coverage map so the screen never freezes.
import { fillRows, type CoverageInputs, type CoverageResult } from './coverage';

type Job = { id: number; inp: CoverageInputs; grid: Omit<CoverageResult, 'rssi'>; r0: number; r1: number };

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, inp, grid, r0, r1 } = e.data;
  try {
    const out = new Float32Array((r1 - r0) * grid.n);
    fillRows(inp, { ...grid, rssi: out }, r0, r1, out);
    (self as unknown as Worker).postMessage({ id, r0, out }, [out.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String((err as Error)?.message ?? err) });
  }
};
