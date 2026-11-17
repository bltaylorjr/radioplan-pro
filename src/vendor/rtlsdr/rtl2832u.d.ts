declare const RTL2832U: (conn: unknown, ppm: number, gain: number | null) => { open(): Promise<void>; setSampleRate(r: number): Promise<number>; setCenterFrequency(f: number): Promise<number>; resetBuffer(): Promise<void>; readSamples(n: number): Promise<ArrayBuffer>; close(): Promise<void> };
export default RTL2832U;
