// Conductor data and DC/AC circuit helpers.
// Ampacity: NEC Table 310.16 (2020/2023), copper, 75 °C column. Resistance: NEC Ch. 9 Table 8, uncoated copper, ohm/kft @75 °C.
export const AWG_SIZES = ['14', '12', '10', '8', '6', '4', '3', '2', '1', '1/0', '2/0', '3/0', '4/0'] as const;
export type Awg = (typeof AWG_SIZES)[number];
export const AMPACITY_75C_CU: Record<Awg, number> = { '14': 20, '12': 25, '10': 35, '8': 50, '6': 65, '4': 85, '3': 100, '2': 115, '1': 130, '1/0': 150, '2/0': 175, '3/0': 200, '4/0': 230 };
export const AMPACITY_90C_CU: Record<Awg, number> = { '14': 25, '12': 30, '10': 40, '8': 55, '6': 75, '4': 95, '3': 115, '2': 130, '1': 145, '1/0': 170, '2/0': 195, '3/0': 225, '4/0': 260 };
/** NEC 240.4(D) small-conductor OCPD limits. */
export const SMALL_CONDUCTOR_OCPD: Partial<Record<Awg, number>> = { '14': 15, '12': 20, '10': 30 };
export const RESISTANCE_OHM_PER_KFT: Record<Awg, number> = { '14': 3.07, '12': 1.93, '10': 1.21, '8': 0.764, '6': 0.491, '4': 0.308, '3': 0.245, '2': 0.194, '1': 0.154, '1/0': 0.122, '2/0': 0.0967, '3/0': 0.0766, '4/0': 0.0608 };
export const STANDARD_OCPD = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250];

export const awgIndex = (a: string) => AWG_SIZES.indexOf(a as Awg);
/** True when conductor `a` is at least as large as `min`. */
export const awgAtLeast = (a: string, min: string) => awgIndex(a) >= awgIndex(min);

export function minAwgForAmps(amps: number, table = AMPACITY_75C_CU): Awg | null {
  for (const s of AWG_SIZES) if (table[s] >= amps) return s;
  return null;
}
export const nextStandardOcpd = (amps: number) => STANDARD_OCPD.find((x) => x >= amps) ?? Math.ceil(amps / 50) * 50;

/** Two-wire voltage drop (V) over one-way length in feet. */
export const voltageDropV = (amps: number, oneWayFt: number, awg: Awg) => (2 * oneWayFt * amps * RESISTANCE_OHM_PER_KFT[awg]) / 1000;
export const voltageDropPct = (amps: number, oneWayFt: number, awg: Awg, volts: number) => (voltageDropV(amps, oneWayFt, awg) / volts) * 100;

/** Smallest conductor that satisfies both ampacity and a voltage-drop target. */
export function sizeConductor(amps: number, oneWayFt: number, volts: number, maxVdPct = 3, table = AMPACITY_75C_CU) {
  const byAmp = minAwgForAmps(amps, table);
  if (!byAmp) return null;
  for (let i = awgIndex(byAmp); i < AWG_SIZES.length; i++) {
    const s = AWG_SIZES[i];
    if (voltageDropPct(amps, oneWayFt, s, volts) <= maxVdPct) return { awg: s, vdPct: voltageDropPct(amps, oneWayFt, s, volts), limitedBy: i === awgIndex(byAmp) ? 'ampacity' : 'voltage drop' };
  }
  const s = AWG_SIZES[AWG_SIZES.length - 1];
  return { awg: s, vdPct: voltageDropPct(amps, oneWayFt, s, volts), limitedBy: 'exceeds table' };
}

/** Low-voltage (fire alarm / control) conductor resistance including 18 and 16 AWG (NEC Ch. 9 Table 8, solid uncoated Cu). */
export const LV_RESISTANCE_OHM_PER_KFT: Record<string, number> = { '18': 7.77, '16': 4.89, ...RESISTANCE_OHM_PER_KFT };
