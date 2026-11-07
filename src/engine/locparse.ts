// Parse typed locations: "35.2271, -80.8431", "35.2271 N 80.8431 W", "35°13'37.6\"N 80°50'35.2\"W", "N35 13.627 W80 50.587".
import type { LatLon } from './geo';

const dms = (nums: number[], neg: boolean) => { const v = Math.abs(nums[0]) + (nums[1] ?? 0) / 60 + (nums[2] ?? 0) / 3600; return neg || nums[0] < 0 ? -v : v; };
const numsIn = (t: string) => (t.match(/[+-]?\d+(?:\.\d+)?/g) ?? []).map(parseFloat);
const valid = (lat: number, lon: number) => (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null);

export function parseLatLon(input: string): LatLon | null {
  const s = input.trim().toUpperCase().replace(/[′’]/g, "'").replace(/[″”]/g, '"');
  const dec = s.match(/^([+-]?\d+(?:\.\d+)?)\s*[,\s]\s*([+-]?\d+(?:\.\d+)?)$/);
  if (dec) return valid(parseFloat(dec[1]), parseFloat(dec[2]));
  if (/[^\d\s.,°'"+\-NSEW:]/.test(s)) return null; // contains other letters -> an address
  const hem = [...s.matchAll(/[NSEW]/g)];
  let segs: { nums: number[]; h: string }[] = [];
  if (hem.length === 2) {
    const leading = /^[NSEW]/.test(s);
    const [a, b] = hem;
    const t1 = leading ? s.slice(a.index! + 1, b.index!) : s.slice(0, a.index!);
    const t2 = leading ? s.slice(b.index! + 1) : s.slice(a.index! + 1, b.index!);
    segs = [{ nums: numsIn(t1), h: a[0] }, { nums: numsIn(t2), h: b[0] }];
  } else if (hem.length === 0) {
    const n = numsIn(s);
    if (n.length === 4 || n.length === 6) segs = [{ nums: n.slice(0, n.length / 2), h: '' }, { nums: n.slice(n.length / 2), h: '' }];
  }
  if (segs.length !== 2 || segs.some((g) => !g.nums.length || g.nums.length > 3)) return null;
  const v = segs.map((g) => dms(g.nums, g.h === 'S' || g.h === 'W'));
  if (segs[0].h === 'E' || segs[0].h === 'W') return valid(v[1], v[0]);
  return valid(v[0], v[1]);
}
