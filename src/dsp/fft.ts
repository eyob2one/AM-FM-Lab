/**
 * Pure TypeScript Radix-2 Cooley-Tukey FFT, IFFT, Windowing, and Hilbert Transform.
 */

export interface ComplexArray {
  re: Float64Array;
  im: Float64Array;
}

export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * In-place Radix-2 Cooley-Tukey FFT.
 * When inverse is true, computes IFFT with 1/N scaling.
 */
export function fftInPlace(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (!isPowerOfTwo(n) || im.length !== n) {
    throw new Error(`FFT length must be a power of 2 (got ${n})`);
  }

  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  // Butterfly stages
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (sign * 2 * Math.PI) / len;
    const wStepRe = Math.cos(angle);
    const wStepIm = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k++) {
        const evenIdx = i + k;
        const oddIdx = evenIdx + half;
        const tRe = wRe * re[oddIdx] - wIm * im[oddIdx];
        const tIm = wRe * im[oddIdx] + wIm * re[oddIdx];

        re[oddIdx] = re[evenIdx] - tRe;
        im[oddIdx] = im[evenIdx] - tIm;
        re[evenIdx] += tRe;
        im[evenIdx] += tIm;

        const nextWRe = wRe * wStepRe - wIm * wStepIm;
        wIm = wRe * wStepIm + wIm * wStepRe;
        wRe = nextWRe;
      }
    }
  }

  if (inverse) {
    const invN = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= invN;
      im[i] *= invN;
    }
  }
}

export function forwardFFT(signal: Float64Array): ComplexArray {
  const n = signal.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(signal);
  fftInPlace(re, im, false);
  return { re, im };
}

export function inverseFFT(reIn: Float64Array, imIn: Float64Array): ComplexArray {
  const re = new Float64Array(reIn);
  const im = new Float64Array(imIn);
  fftInPlace(re, im, true);
  return { re, im };
}

/**
 * Generates a Hann window and returns its coherent gain and RMS energy factor.
 */
export function hannWindow(n: number): {
  weights: Float64Array;
  coherentGain: number;
  energyGain: number;
} {
  const weights = new Float64Array(n);
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    weights[i] = w;
    sum += w;
    sumSq += w * w;
  }
  return {
    weights,
    coherentGain: sum / n,
    energyGain: sumSq / n,
  };
}

/**
 * Computes single-sided magnitude spectrum in dB (0..N/2) using a Hann window
 * normalized so a unit-amplitude cosine peaks near 0 dB.
 */
export function computeMagnitudeSpectrumDb(
  signal: Float64Array,
  useWindow = true,
  floorDb = -120
): Float64Array {
  const n = signal.length;
  const half = n >> 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);

  let coherentGain = 1;
  if (useWindow) {
    const win = hannWindow(n);
    coherentGain = win.coherentGain;
    for (let i = 0; i < n; i++) {
      re[i] = signal[i] * win.weights[i];
    }
  } else {
    re.set(signal);
  }

  fftInPlace(re, im, false);

  const magDb = new Float64Array(half + 1);
  const scale = 2 / (n * coherentGain);
  for (let k = 0; k <= half; k++) {
    const mag = Math.hypot(re[k], im[k]) * (k === 0 || k === half ? scale * 0.5 : scale);
    const db = 20 * Math.log10(Math.max(mag, 1e-12));
    magDb[k] = Math.max(db, floorDb);
  }
  return magDb;
}

/**
 * Computes single-sided Power Spectral Density (power per bin, summing to total mean square power).
 */
export function computePowerSpectrum(signal: Float64Array, useWindow = false): Float64Array {
  const n = signal.length;
  const half = n >> 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);

  let energyGain = 1;
  if (useWindow) {
    const win = hannWindow(n);
    energyGain = win.energyGain;
    for (let i = 0; i < n; i++) {
      re[i] = signal[i] * win.weights[i];
    }
  } else {
    re.set(signal);
  }

  fftInPlace(re, im, false);

  const psd = new Float64Array(half + 1);
  const norm = 1 / (n * n * energyGain);
  for (let k = 0; k <= half; k++) {
    const p = (re[k] * re[k] + im[k] * im[k]) * norm;
    psd[k] = k === 0 || k === half ? p : 2 * p;
  }
  return psd;
}

/**
 * Computes the discrete analytic signal z[n] = x[n] + j * Hilbert(x[n]) via frequency-domain multiplier.
 */
export function analyticSignal(signal: Float64Array): ComplexArray {
  const n = signal.length;
  const { re, im } = forwardFFT(signal);
  const half = n >> 1;

  // H[0] = 1, H[N/2] = 1; H[1..N/2-1] = 2; H[N/2+1..N-1] = 0
  for (let k = 1; k < half; k++) {
    re[k] *= 2;
    im[k] *= 2;
  }
  for (let k = half + 1; k < n; k++) {
    re[k] = 0;
    im[k] = 0;
  }

  fftInPlace(re, im, true);
  return { re, im };
}
