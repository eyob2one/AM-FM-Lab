import { computePowerSpectrum, forwardFFT } from './fft';
import { bandpassFilter } from './filters';

export interface SignalRecoveryMetrics {
  outputSnrDb: number;
  nrmsePercent: number;
  gainEstimate: number;
}

/**
 * Measures baseband Output SNR and NRMSE by projecting recovered y(t) onto reference m(t)
 * inside the steady-state interior [trim, N - trim] (excluding tiny FFT/filter edge boundaries).
 * y(t) = alpha * m(t) + c + e(t) => SNR = sum((alpha * m)^2) / sum(e^2)
 * Only fits a scalar linear gain alpha and DC offset c so genuine phase error or nonlinear
 * distortion is never masked.
 */
export function measureRecoverySnrAndNrmse(
  reference: Float64Array,
  recovered: Float64Array,
  trimRatio = 0.05
): SignalRecoveryMetrics {
  const n = reference.length;
  const start = Math.floor(n * trimRatio);
  const end = Math.ceil(n * (1 - trimRatio));
  const count = Math.max(1, end - start);

  let meanM = 0;
  let meanY = 0;
  for (let i = start; i < end; i++) {
    meanM += reference[i];
    meanY += recovered[i];
  }
  meanM /= count;
  meanY /= count;

  let covMY = 0;
  let varM = 0;
  for (let i = start; i < end; i++) {
    const dm = reference[i] - meanM;
    const dy = recovered[i] - meanY;
    covMY += dm * dy;
    varM += dm * dm;
  }

  const alpha = varM > 1e-18 ? covMY / varM : 0;

  let sigPower = 0;
  let errPower = 0;
  for (let i = start; i < end; i++) {
    const target = alpha * (reference[i] - meanM);
    const actual = recovered[i] - meanY;
    const err = actual - target;
    sigPower += target * target;
    errPower += err * err;
  }

  // If alpha <= 0 (complete noise collapse), signal energy is zeroed to prevent false anti-phase match
  if (alpha <= 0) {
    return {
      outputSnrDb: -20,
      nrmsePercent: 100,
      gainEstimate: alpha,
    };
  }

  const ratio = errPower > 1e-18 ? sigPower / errPower : 1e8;
  const outputSnrDb = Math.max(-25, Math.min(80, 10 * Math.log10(ratio)));
  const nrmsePercent = Math.min(200, Math.sqrt(errPower / Math.max(sigPower, 1e-18)) * 100);

  return {
    outputSnrDb,
    nrmsePercent,
    gainEstimate: alpha,
  };
}

/**
 * Measures true Total Harmonic Distortion (%) for a single-tone sinusoidal signal via a
 * Hann-windowed, DC-removed, zero-padded FFT of the steady-state noiseless recovered output.
 * Sums harmonic power around h * f_m (h = 2..10, <= 20 kHz) relative to fundamental f_m,
 * accounting for Hann main-lobe spectral leakage and distinguishing genuine nonlinear harmonics
 * from linear phase delay.
 */
export function measureSingleToneHarmonicThdPercent(
  noiselessRecovered: Float64Array,
  sampleRateHz: number,
  fundamentalHz: number,
  trimRatio = 0.05
): number {
  const n = noiselessRecovered.length;
  const start = Math.floor(n * trimRatio);
  const end = Math.ceil(n * (1 - trimRatio));
  const segLen = Math.max(64, end - start);

  // Build Hann window and compute weighted DC mean to eliminate DC spectral leakage
  const win = new Float64Array(segLen);
  let winSum = 0;
  let weightedSum = 0;
  for (let i = 0; i < segLen; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (segLen - 1)));
    win[i] = w;
    winSum += w;
    weightedSum += w * noiselessRecovered[start + i];
  }
  const dcMean = winSum > 0 ? weightedSum / winSum : 0;

  // Zero-pad to next power of 2 >= 2 * n for fine bin clustering across Hann main lobe
  let nFft = 1;
  while (nFft < n * 2) nFft <<= 1;

  const padded = new Float64Array(nFft);
  for (let i = 0; i < segLen; i++) {
    padded[i] = (noiselessRecovered[start + i] - dcMean) * win[i];
  }

  const { re, im } = forwardFFT(padded);
  const df = sampleRateHz / nFft;
  const halfBins = nFft >> 1;

  // Hann main-lobe half-width is 2*Fs/segLen (~140 Hz); cap to avoid overlap with DC or 2*f_m
  const lobeHalfSpanHz = Math.min(200, Math.max(2.5 * df, fundamentalHz * 0.4));

  const sumBandPower = (centerHz: number): number => {
    const lowBin = Math.max(2, Math.floor((centerHz - lobeHalfSpanHz) / df));
    const highBin = Math.min(halfBins - 1, Math.ceil((centerHz + lobeHalfSpanHz) / df));
    let power = 0;
    for (let k = lowBin; k <= highBin; k++) {
      // Strictly exclude DC and any residual ultra-low-frequency drift below half fundamental
      if (k * df <= Math.max(60, fundamentalHz * 0.45)) continue;
      power += re[k] * re[k] + im[k] * im[k];
    }
    return power;
  };

  const fundamentalPower = sumBandPower(fundamentalHz);
  if (fundamentalPower <= 1e-18) return 0;

  const maxHarmonicHz = Math.min(25000, sampleRateHz * 0.45);
  let harmonicPower = 0;
  for (let h = 2; h <= 10; h++) {
    const fh = h * fundamentalHz;
    if (fh > maxHarmonicHz) break;
    harmonicPower += sumBandPower(fh);
  }

  return Math.min(200, Math.sqrt(harmonicPower / fundamentalPower) * 100);
}

/**
 * Measures noiseless waveform reconstruction error NRMSE (%) relative to the original message m(t).
 * Applicable to all waveforms (single-tone, multi-tone, speech-like) to capture linear phase lag,
 * filter roll-off, envelope tracking ripple, and intermodulation/rectification distortion.
 */
export function measureNoiselessNrmsePercent(
  reference: Float64Array,
  noiselessRecovered: Float64Array
): number {
  const { nrmsePercent } = measureRecoverySnrAndNrmse(reference, noiselessRecovered, 0.05);
  return nrmsePercent;
}

/**
 * Computes exact Butterworth magnitude gain in dB at frequency f given cutoff W and filter order.
 */
export function butterworthGainDb(freqHz: number, cutoffHz: number, order = 6): number {
  const ratio = Math.max(0, freqHz) / Math.max(1, cutoffHz);
  const mag = 1 / Math.sqrt(1 + Math.pow(ratio, 2 * order));
  return 20 * Math.log10(Math.max(mag, 1e-12));
}

/**
 * Measures actual IF Carrier-to-Noise Ratio (Input SNR in receiver IF bandwidth) directly
 * by passing signal and noise separately through the identical receiver IF bandpass filter.
 */
export function measureIfInputCnrDb(
  txSignal: Float64Array,
  noiseSignal: Float64Array,
  sampleRateHz: number,
  carrierFreqHz: number,
  ifBandwidthHz: number
): number {
  const sigIf = bandpassFilter(txSignal, sampleRateHz, carrierFreqHz, ifBandwidthHz);
  const noiseIf = bandpassFilter(noiseSignal, sampleRateHz, carrierFreqHz, ifBandwidthHz);

  const n = sigIf.length;
  const start = Math.floor(n * 0.05);
  const end = Math.ceil(n * 0.95);

  let pSig = 0;
  let pNoise = 0;
  for (let i = start; i < end; i++) {
    pSig += sigIf[i] * sigIf[i];
    pNoise += noiseIf[i] * noiseIf[i];
  }

  const ratio = pNoise > 1e-18 ? pSig / pNoise : 1e8;
  return Math.max(-25, Math.min(80, 10 * Math.log10(ratio)));
}

/**
 * Measures 99% Occupied Bandwidth (OBW) around carrier f_c directly from the FFT Power Spectral Density.
 */
export function measureOccupiedBandwidthHz(
  txSignal: Float64Array,
  sampleRateHz: number,
  carrierFreqHz: number,
  searchHalfSpanHz = 90000
): number {
  const n = txSignal.length;
  const df = sampleRateHz / n;
  const psd = computePowerSpectrum(txSignal, true);

  const minBin = Math.max(1, Math.floor((carrierFreqHz - searchHalfSpanHz) / df));
  const maxBin = Math.min(psd.length - 1, Math.ceil((carrierFreqHz + searchHalfSpanHz) / df));

  let totalPower = 0;
  for (let k = minBin; k <= maxBin; k++) {
    totalPower += psd[k];
  }
  if (totalPower <= 1e-18) return 0;

  // Find symmetric or 0.5% - 99.5% cumulative power edges
  const lowThresh = totalPower * 0.005;
  const highThresh = totalPower * 0.995;
  let cum = 0;
  let lowBin = minBin;
  let highBin = maxBin;
  let foundLow = false;

  for (let k = minBin; k <= maxBin; k++) {
    cum += psd[k];
    if (!foundLow && cum >= lowThresh) {
      lowBin = k;
      foundLow = true;
    }
    if (cum >= highThresh) {
      highBin = k;
      break;
    }
  }

  return Math.max(df, (highBin - lowBin) * df);
}

/**
 * Computes theoretical AM bandwidth: B_AM = 2 * f_max
 */
export function theoreticalAmBandwidthHz(messageMaxFreqHz: number): number {
  return 2 * messageMaxFreqHz;
}

/**
 * Computes theoretical FM Carson's Rule bandwidth: B_FM = 2 * (delta_f + f_max)
 */
export function theoreticalFmCarsonBandwidthHz(
  peakDeviationHz: number,
  messageMaxFreqHz: number
): number {
  return 2 * (peakDeviationHz + messageMaxFreqHz);
}
