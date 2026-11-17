import { analyticSignal } from './fft';
import { bandpassFilter, lowpassFilter, removeDc } from './filters';

export interface FMModulationOutput {
  tx: Float64Array;
  phaseRad: Float64Array;
  instFreqTxHz: Float64Array;
  carrierAmplitude: number;
  txPower: number;
  effectiveBeta: number;
  effectivePeakDevHz: number;
}

/**
 * Frequency Modulation via cumulative trapezoidal phase integration:
 *   phi(t) = 2 * pi * delta_f * integral_0^t m(tau) dtau
 *   s_FM(t) = A_c * cos(2 * pi * f_c * t + phi(t))
 * Normalized so mean(s_FM^2) === targetTxPower (0.5 W into 1 ohm).
 */
export function modulateFM(
  messageSignal: Float64Array,
  sampleRateHz: number,
  carrierFreqHz: number,
  frequencyDeviationHz: number,
  messageMaxFreqHz: number,
  targetTxPower = 0.5
): FMModulationOutput {
  const n = messageSignal.length;
  const dt = 1 / sampleRateHz;

  const phaseRad = new Float64Array(n);
  const instFreqTxHz = new Float64Array(n);
  const rawTx = new Float64Array(n);

  let maxMsg = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(messageSignal[i]);
    if (a > maxMsg) maxMsg = a;
  }

  phaseRad[0] = 0;
  instFreqTxHz[0] = carrierFreqHz + frequencyDeviationHz * messageSignal[0];
  rawTx[0] = Math.cos(0);

  let sumSq = rawTx[0] * rawTx[0];
  for (let i = 1; i < n; i++) {
    const t = i * dt;
    // Trapezoidal phase integration
    const dPhi = Math.PI * frequencyDeviationHz * (messageSignal[i] + messageSignal[i - 1]) * dt;
    phaseRad[i] = phaseRad[i - 1] + dPhi;
    instFreqTxHz[i] = carrierFreqHz + frequencyDeviationHz * messageSignal[i];
    const s = Math.cos(2 * Math.PI * carrierFreqHz * t + phaseRad[i]);
    rawTx[i] = s;
    sumSq += s * s;
  }

  const rawPower = sumSq / n;
  const carrierAmplitude = rawPower > 1e-12 ? Math.sqrt(targetTxPower / rawPower) : 1;

  const tx = new Float64Array(n);
  let normSumSq = 0;
  for (let i = 0; i < n; i++) {
    tx[i] = rawTx[i] * carrierAmplitude;
    normSumSq += tx[i] * tx[i];
  }

  const effectivePeakDevHz = frequencyDeviationHz * maxMsg;
  const effectiveBeta = effectivePeakDevHz / Math.max(messageMaxFreqHz, 1);

  return {
    tx,
    phaseRad,
    instFreqTxHz,
    carrierAmplitude,
    txPower: normSumSq / n,
    effectiveBeta,
    effectivePeakDevHz,
  };
}

export interface FMDemodulationOutput {
  rxFilteredIf: Float64Array;
  instFreqRxHz: Float64Array;
  recovered: Float64Array;
}

/**
 * FM Receiver: IF Bandpass Filter -> Analytic Signal & Complex Baseband Downconversion ->
 * Conjugate-Product Phase-Derivative Frequency Discriminator -> Baseband Audio LPF -> DC Removal.
 * Naturally exhibits FM threshold "click" impulse breakdown when noise envelope exceeds carrier.
 */
export function demodulateFM(
  receivedSignal: Float64Array,
  sampleRateHz: number,
  carrierFreqHz: number,
  ifBandwidthHz: number,
  lpfCutoffHz: number,
  frequencyDeviationHz: number
): FMDemodulationOutput {
  const n = receivedSignal.length;
  const rxFilteredIf = bandpassFilter(receivedSignal, sampleRateHz, carrierFreqHz, ifBandwidthHz);

  // Obtain complex analytic signal z[n] = x[n] + j * Hilbert(x[n])
  const { re: zRe, im: zIm } = analyticSignal(rxFilteredIf);

  // Shift down to complex baseband b[n] = z[n] * exp(-j * 2 * pi * f_c * t)
  const bRe = new Float64Array(n);
  const bIm = new Float64Array(n);
  const omegaC = (2 * Math.PI * carrierFreqHz) / sampleRateHz;

  for (let i = 0; i < n; i++) {
    const angle = omegaC * i;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // (zRe + j zIm) * (c - j s)
    bRe[i] = zRe[i] * c + zIm[i] * s;
    bIm[i] = zIm[i] * c - zRe[i] * s;
  }

  // Discriminator: backward phase difference dfMid[i] estimates instantaneous frequency at midpoint t_{i - 0.5}.
  // Averaging adjacent midpoint estimates centers instFreqDevHz[i] cleanly on sample timestamp t_i,
  // eliminating the 0.5*T_s timing delay while preserving single-step phase-wrap threshold physics.
  const dfMid = new Float64Array(n);
  const scaleHz = sampleRateHz / (2 * Math.PI);
  for (let i = 1; i < n; i++) {
    const cross = bIm[i] * bRe[i - 1] - bRe[i] * bIm[i - 1];
    const dot = bRe[i] * bRe[i - 1] + bIm[i] * bIm[i - 1];
    dfMid[i] = scaleHz * Math.atan2(cross, dot);
  }

  const instFreqDevHz = new Float64Array(n);
  const instFreqRxHz = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const df = 0.5 * (dfMid[i] + dfMid[i + 1]);
    instFreqDevHz[i] = df;
    instFreqRxHz[i] = carrierFreqHz + df;
  }
  instFreqDevHz[0] = n >= 3 ? 1.5 * dfMid[1] - 0.5 * dfMid[2] : dfMid[1];
  instFreqRxHz[0] = carrierFreqHz + instFreqDevHz[0];
  instFreqDevHz[n - 1] = n >= 3 ? 1.5 * dfMid[n - 1] - 0.5 * dfMid[n - 2] : dfMid[n - 1];
  instFreqRxHz[n - 1] = carrierFreqHz + instFreqDevHz[n - 1];

  // Normalize by frequency deviation and apply baseband LPF
  const invDev = frequencyDeviationHz > 1 ? 1 / frequencyDeviationHz : 1;
  const rawBaseband = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    rawBaseband[i] = instFreqDevHz[i] * invDev;
  }

  const lpfOut = lowpassFilter(rawBaseband, sampleRateHz, lpfCutoffHz, 6);
  const trim = Math.floor(n * 0.04);
  const recovered = removeDc(lpfOut, trim);

  return {
    rxFilteredIf,
    instFreqRxHz,
    recovered,
  };
}
