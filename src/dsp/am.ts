import { bandpassFilter, lowpassFilter, removeDc } from './filters';

export interface AMModulationOutput {
  tx: Float64Array;
  envelopeIdeal: Float64Array;
  carrierAmplitude: number;
  txPower: number;
  effectiveMu: number;
  isOvermodulated: boolean;
}

/**
 * Standard DSB-LC Amplitude Modulation with signal-power normalization:
 *   s_AM(t) = A_c * [1 + mu * m(t)] * cos(2 * pi * f_c * t)
 * Carrier amplitude A_c is scaled so mean(s_AM^2) === targetTxPower (0.5 W into 1 ohm).
 */
export function modulateAM(
  messageSignal: Float64Array,
  sampleRateHz: number,
  carrierFreqHz: number,
  modulationIndex: number,
  targetTxPower = 0.5
): AMModulationOutput {
  const n = messageSignal.length;
  const rawTx = new Float64Array(n);
  const rawEnv = new Float64Array(n);

  let maxMsg = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const absM = Math.abs(messageSignal[i]);
    if (absM > maxMsg) maxMsg = absM;

    const t = i / sampleRateHz;
    const env = 1 + modulationIndex * messageSignal[i];
    const s = env * Math.cos(2 * Math.PI * carrierFreqHz * t);
    rawEnv[i] = env;
    rawTx[i] = s;
    sumSq += s * s;
  }

  const rawPower = sumSq / n;
  const carrierAmplitude = rawPower > 1e-12 ? Math.sqrt(targetTxPower / rawPower) : 1;

  const tx = new Float64Array(n);
  const envelopeIdeal = new Float64Array(n);
  let normSumSq = 0;
  for (let i = 0; i < n; i++) {
    tx[i] = rawTx[i] * carrierAmplitude;
    envelopeIdeal[i] = rawEnv[i] * carrierAmplitude;
    normSumSq += tx[i] * tx[i];
  }

  const effectiveMu = modulationIndex * maxMsg;

  return {
    tx,
    envelopeIdeal,
    carrierAmplitude,
    txPower: normSumSq / n,
    effectiveMu,
    isOvermodulated: effectiveMu > 1.0 + 1e-6,
  };
}

export interface AMDemodulationOutput {
  rxFilteredIf: Float64Array;
  envelopeRaw: Float64Array;
  envelopePreLpf: Float64Array;
  recovered: Float64Array;
}

/**
 * AM Receiver: IF Bandpass Filter -> Full-wave Precision Envelope Detector (leaky RC) ->
 * Baseband Audio Low-Pass Filter -> DC Removal.
 * When mu > 1.0, |1 + mu * m(t)| folds upward, genuinely producing overmodulation distortion.
 * Also outputs envelopePreLpf (rejecting 2*f_c carrier ripple while preserving baseband
 * overmodulation harmonics up to min(25 kHz, 0.5*f_c)) so pre-LPF envelope distortion can
 * be measured separately from post-LPF receiver output THD.
 */
export function demodulateAM(
  receivedSignal: Float64Array,
  sampleRateHz: number,
  carrierFreqHz: number,
  ifBandwidthHz: number,
  lpfCutoffHz: number,
  messageMaxFreqHz: number,
  envelopeDecayFactor: number
): AMDemodulationOutput {
  const n = receivedSignal.length;
  const rxFilteredIf = bandpassFilter(receivedSignal, sampleRateHz, carrierFreqHz, ifBandwidthHz);

  // Leaky RC peak detector after full-wave precision rectification
  const envelopeRaw = new Float64Array(n);
  const dt = 1 / sampleRateHz;
  const fRc = Math.min(
    carrierFreqHz * 0.35,
    Math.max(8000, messageMaxFreqHz * envelopeDecayFactor * 6.0)
  );
  const tau = 1 / (2 * Math.PI * fRc);
  const decay = Math.exp(-dt / tau);

  let env = Math.abs(rxFilteredIf[0]);
  envelopeRaw[0] = env;
  for (let i = 1; i < n; i++) {
    const rect = Math.abs(rxFilteredIf[i]);
    env = rect >= env * decay ? rect : env * decay;
    envelopeRaw[i] = env;
  }

  const trim = Math.floor(n * 0.04);

  // Wideband pre-LPF baseband envelope (removes 2*f_c ripple while keeping 2f_m..4f_m harmonics up to 25 kHz)
  const preLpfCutoffHz = Math.max(lpfCutoffHz, Math.min(25000, carrierFreqHz * 0.5));
  const preLpfWide = lowpassFilter(envelopeRaw, sampleRateHz, preLpfCutoffHz, 6);
  const envelopePreLpf = removeDc(preLpfWide, trim);

  // Zero-phase baseband LPF + DC block
  const lpfOut = lowpassFilter(envelopeRaw, sampleRateHz, lpfCutoffHz, 6);
  const recovered = removeDc(lpfOut, trim);

  return {
    rxFilteredIf,
    envelopeRaw,
    envelopePreLpf,
    recovered,
  };
}
