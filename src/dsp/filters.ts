import { forwardFFT, fftInPlace } from './fft';

/**
 * Zero-phase frequency-domain raised-cosine (smooth brick-wall) bandpass filter.
 * Using a smooth cosine transition skirt avoids Gibbs ringing while achieving zero group delay,
 * ensuring exact alignment with the reference message signal for SNR & distortion measurement.
 */
export function bandpassFilter(
  signal: Float64Array,
  sampleRateHz: number,
  centerFreqHz: number,
  bandwidthHz: number
): Float64Array {
  const n = signal.length;
  const { re, im } = forwardFFT(signal);
  const df = sampleRateHz / n;

  const halfBw = Math.max(bandwidthHz * 0.5, df * 2);
  const fLow = Math.max(0, centerFreqHz - halfBw);
  const fHigh = Math.min(sampleRateHz * 0.5, centerFreqHz + halfBw);
  const transitionHz = Math.max(df * 3, Math.min(halfBw * 0.15, 1200));

  for (let k = 0; k <= n >> 1; k++) {
    const f = k * df;
    let gain = 0;
    if (f >= fLow && f <= fHigh) {
      gain = 1;
    } else if (f >= fLow - transitionHz && f < fLow) {
      const t = (f - (fLow - transitionHz)) / transitionHz;
      gain = 0.5 * (1 - Math.cos(Math.PI * t));
    } else if (f > fHigh && f <= fHigh + transitionHz) {
      const t = (fHigh + transitionHz - f) / transitionHz;
      gain = 0.5 * (1 - Math.cos(Math.PI * t));
    }

    re[k] *= gain;
    im[k] *= gain;
    if (k > 0 && k < n >> 1) {
      const mirror = n - k;
      re[mirror] *= gain;
      im[mirror] *= gain;
    }
  }

  fftInPlace(re, im, true);
  return re;
}

export function bandpassEquivalentNoiseBandwidthHz(
  sampleRateHz: number,
  sampleCount: number,
  bandwidthHz: number
): number {
  const df = sampleRateHz / sampleCount;
  const halfBw = Math.max(bandwidthHz * 0.5, df * 2);
  const transitionHz = Math.max(df * 3, Math.min(halfBw * 0.15, 1200));
  // Each raised-cosine skirt integrates 0.5*(1 - cos(pi*t))^2 over [0,1] = 3/8 -> 2 * 3/8 = 0.75 total
  return halfBw * 2 + 0.75 * transitionHz;
}

/**
 * Zero-phase 6th-order (default) Butterworth-like frequency-domain low-pass filter.
 * Magnitude squared response: 1 / (1 + (f / f_c)^(2*order)), zero phase distortion.
 */
export function lowpassFilter(
  signal: Float64Array,
  sampleRateHz: number,
  cutoffHz: number,
  order = 6
): Float64Array {
  const n = signal.length;
  const { re, im } = forwardFFT(signal);
  const df = sampleRateHz / n;
  const fc = Math.max(cutoffHz, df * 2);
  const exp = 2 * order;

  for (let k = 0; k <= n >> 1; k++) {
    const f = k * df;
    const ratio = f / fc;
    const gain = 1 / Math.sqrt(1 + Math.pow(ratio, exp));

    re[k] *= gain;
    im[k] *= gain;
    if (k > 0 && k < n >> 1) {
      const mirror = n - k;
      re[mirror] *= gain;
      im[mirror] *= gain;
    }
  }

  fftInPlace(re, im, true);
  return re;
}

/**
 * Removes the DC mean value from a signal array (in a new Float64Array).
 */
export function removeDc(signal: Float64Array, trimSamples = 0): Float64Array {
  const n = signal.length;
  const start = Math.min(trimSamples, Math.floor(n * 0.25));
  const end = Math.max(start + 1, n - start);
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += signal[i];
  }
  const mean = sum / (end - start);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = signal[i] - mean;
  }
  return out;
}
