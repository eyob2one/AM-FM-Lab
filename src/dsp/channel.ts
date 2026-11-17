/**
 * Deterministic Seeded AWGN Channel Module.
 * Uses Mulberry32 PRNG + Box-Muller transform for zero-mean Gaussian noise
 * calibrated to exact one-sided noise spectral density N0.
 */

export function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface AwgnChannelOutput {
  noise: Float64Array;
  n0WattsPerHz: number;
  noiseSigma: number;
  measuredNoisePower: number;
}

/**
 * Generates an AWGN realization calibrated to reference baseband SNR gamma = P_tx / (N0 * W_ref).
 * Total discrete noise variance across Nyquist [0, Fs/2] is sigma^2 = N0 * (Fs / 2).
 */
export function generateAwgnNoise(
  sampleCount: number,
  sampleRateHz: number,
  txPower: number,
  refBandwidthHz: number,
  snr0Db: number,
  seed: number
): AwgnChannelOutput {
  const gammaLinear = Math.pow(10, snr0Db / 10);
  const n0WattsPerHz = txPower / (Math.max(refBandwidthHz, 100) * gammaLinear);
  const noiseVariance = n0WattsPerHz * (sampleRateHz * 0.5);
  const noiseSigma = Math.sqrt(Math.max(noiseVariance, 0));

  const rand = createMulberry32(seed);
  const noise = new Float64Array(sampleCount);

  let sumSq = 0;
  for (let i = 0; i < sampleCount; i += 2) {
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    const mag = noiseSigma * Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    const z1 = mag * Math.sin(2 * Math.PI * u2);

    noise[i] = z0;
    sumSq += z0 * z0;
    if (i + 1 < sampleCount) {
      noise[i + 1] = z1;
      sumSq += z1 * z1;
    }
  }

  return {
    noise,
    n0WattsPerHz,
    noiseSigma,
    measuredNoisePower: sumSq / sampleCount,
  };
}

export function addNoiseToSignal(signal: Float64Array, noise: Float64Array): Float64Array {
  const n = signal.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = signal[i] + noise[i];
  }
  return out;
}
