import { demodulateAM, modulateAM } from './am';
import { addNoiseToSignal, generateAwgnNoise } from './channel';
import { computeMagnitudeSpectrumDb } from './fft';
import { bandpassEquivalentNoiseBandwidthHz } from './filters';
import { demodulateFM, modulateFM } from './fm';
import {
  butterworthGainDb,
  measureIfInputCnrDb,
  measureNoiselessNrmsePercent,
  measureOccupiedBandwidthHz,
  measureRecoverySnrAndNrmse,
  measureSingleToneHarmonicThdPercent,
  theoreticalAmBandwidthHz,
  theoreticalFmCarsonBandwidthHz,
} from './metrics';
import { generateMessageSignal } from './signalGenerator';
import { SimulationConfig, SimulationResult, SpectralGuardStatus } from './types';

export const LAB_SAMPLE_RATE_HZ = 512000;
export const LAB_SAMPLE_COUNT = 8192; // T = 16.0 ms, df = 62.5 Hz
export const TARGET_TX_POWER = 0.5; // Normalized 0.5 W into 1 ohm (A_c_FM = 1.0 V)

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  message: {
    waveform: 'single',
    frequencyHz: 1000,
    amplitude: 1.0,
  },
  am: {
    modulationIndex: 0.8,
    envelopeDecayFactor: 1.0,
  },
  fm: {
    frequencyDeviationHz: 15000,
  },
  channel: {
    snr0Db: 24,
    noiseSeed: 4219,
  },
  receiver: {
    carrierFreqHz: 50000,
    amIfBandwidthHz: 9660,
    fmIfBandwidthHz: 36000,
    autoIfBandwidth: true,
    lpfCutoffHz: 4600,
  },
};

export function cloneSimulationConfig(config: SimulationConfig): SimulationConfig {
  return {
    message: { ...config.message },
    am: { ...config.am },
    fm: { ...config.fm },
    channel: { ...config.channel },
    receiver: { ...config.receiver },
  };
}

export function resolveEffectiveBandwidthConfig(
  config: SimulationConfig,
  messageMaxFreqHz: number
): {
  amIfBandwidthHz: number;
  fmIfBandwidthHz: number;
  lpfCutoffHz: number;
} {
  if (config.receiver.autoIfBandwidth) {
    // Keep 4.6 kHz minimum audio LPF for telephony/voice parity below 3.4 kHz, and provide 1.35x
    // Butterworth headroom above 3.4 kHz (up to 6.75 kHz at 5 kHz) so 4-5 kHz tones experience <= 0.12 dB droop.
    const lpfCutoffHz = Math.max(4600, Math.min(8000, Math.round(1.35 * messageMaxFreqHz)));
    const amIfBandwidthHz = Math.max(4000, Math.min(30000, Math.round(2.1 * lpfCutoffHz)));
    // Include 2*f_max + 2 kHz guard band beyond Carson's rule to preserve >99.9% Bessel sidebands
    const fmIfBandwidthHz = Math.max(
      8000,
      Math.min(95000, 2 * (config.fm.frequencyDeviationHz + 2 * messageMaxFreqHz) + 2000)
    );
    return { amIfBandwidthHz, fmIfBandwidthHz, lpfCutoffHz };
  }
  return {
    amIfBandwidthHz: Math.max(2000, config.receiver.amIfBandwidthHz),
    fmIfBandwidthHz: Math.max(4000, config.receiver.fmIfBandwidthHz),
    lpfCutoffHz: Math.max(1000, config.receiver.lpfCutoffHz),
  };
}

/**
 * Validates FM carrier frequency, peak frequency deviation, and IF filter bounds against
 * DC (0 Hz) spectral foldover and Nyquist (Fs/2 = 256 kHz) aliasing constraints.
 * Prevents invalid configurations while reporting the exact constraint reason so settings
 * are never silently altered without explanation.
 */
export function validateSpectralConstraints(
  config: SimulationConfig,
  messageMaxFreqHz: number
): SpectralGuardStatus {
  const fs = LAB_SAMPLE_RATE_HZ;
  const nyquistFreqHz = fs * 0.5;
  const df = fs / LAB_SAMPLE_COUNT;
  const bw = resolveEffectiveBandwidthConfig(config, messageMaxFreqHz);

  const requestedCarrierFreqHz = config.receiver.carrierFreqHz;
  const requestedFmIfBandwidthHz = bw.fmIfBandwidthHz;

  const transitionHz = Math.max(df * 3, Math.min(requestedFmIfBandwidthHz * 0.5 * 0.15, 1200));
  const carsonHalfBwHz = config.fm.frequencyDeviationHz + messageMaxFreqHz;
  const requiredLowerMarginHz = Math.max(
    requestedFmIfBandwidthHz * 0.5 + transitionHz + 1500,
    carsonHalfBwHz + 3000
  );

  const minSafeCarrierFreqHz = Math.ceil(requiredLowerMarginHz / 1000) * 1000;
  const maxSafeCarrierFreqHz = Math.floor(
    (nyquistFreqHz - (requestedFmIfBandwidthHz * 0.5 + transitionHz + 2000)) / 1000
  ) * 1000;

  let effectiveCarrierFreqHz = requestedCarrierFreqHz;
  let effectiveFmIfBandwidthHz = requestedFmIfBandwidthHz;
  let adjusted = false;
  let reason: string | null = null;

  if (requestedCarrierFreqHz < minSafeCarrierFreqHz) {
    effectiveCarrierFreqHz = Math.min(maxSafeCarrierFreqHz, minSafeCarrierFreqHz);
    adjusted = true;
    reason = `Carrier f_c constrained from ${(requestedCarrierFreqHz / 1000).toFixed(0)} kHz to ${(effectiveCarrierFreqHz / 1000).toFixed(0)} kHz to prevent lower FM sidebands and the IF passband skirt from folding past 0 Hz DC (requires f_c ≥ ${(minSafeCarrierFreqHz / 1000).toFixed(0)} kHz for Δf = ${(config.fm.frequencyDeviationHz / 1000).toFixed(1)} kHz, f_max = ${Math.round(messageMaxFreqHz)} Hz, B_IF = ${(requestedFmIfBandwidthHz / 1000).toFixed(1)} kHz).`;
  } else if (requestedCarrierFreqHz > maxSafeCarrierFreqHz) {
    effectiveCarrierFreqHz = Math.max(minSafeCarrierFreqHz, maxSafeCarrierFreqHz);
    adjusted = true;
    reason = `Carrier f_c constrained from ${(requestedCarrierFreqHz / 1000).toFixed(0)} kHz to ${(effectiveCarrierFreqHz / 1000).toFixed(0)} kHz to maintain Nyquist guard margin below ${(nyquistFreqHz / 1000).toFixed(0)} kHz.`;
  }

  const maxAllowedIfBw = Math.max(
    4000,
    Math.floor((2 * Math.min(effectiveCarrierFreqHz - transitionHz - 1000, nyquistFreqHz - effectiveCarrierFreqHz - transitionHz - 1000)) / 500) * 500
  );
  if (effectiveFmIfBandwidthHz > maxAllowedIfBw) {
    effectiveFmIfBandwidthHz = maxAllowedIfBw;
    adjusted = true;
    const ifMsg = `FM IF bandwidth clamped to ${(effectiveFmIfBandwidthHz / 1000).toFixed(1)} kHz to fit cleanly between 0 Hz and Nyquist.`;
    reason = reason ? `${reason} ${ifMsg}` : ifMsg;
  }

  return {
    adjusted,
    requestedCarrierFreqHz,
    effectiveCarrierFreqHz,
    minSafeCarrierFreqHz,
    maxSafeCarrierFreqHz,
    requestedFmIfBandwidthHz,
    effectiveFmIfBandwidthHz,
    lowerSidebandEdgeHz: effectiveCarrierFreqHz - effectiveFmIfBandwidthHz * 0.5,
    upperSidebandEdgeHz: effectiveCarrierFreqHz + effectiveFmIfBandwidthHz * 0.5,
    nyquistFreqHz,
    reason,
  };
}

/**
 * Executes the complete numerical AM + FM communication pipeline under identical
 * message signal, normalized transmitted power, and AWGN channel conditions.
 */
export function runSimulation(
  config: SimulationConfig,
  options: { includeSpectra?: boolean } = {}
): SimulationResult {
  const includeSpectra = options.includeSpectra ?? true;
  const fs = LAB_SAMPLE_RATE_HZ;
  const n = LAB_SAMPLE_COUNT;

  // 1. Common baseband message signal m(t)
  const msg = generateMessageSignal(config.message, fs, n);
  const rawBw = resolveEffectiveBandwidthConfig(config, msg.maxFreqHz);
  const spectralGuard = validateSpectralConstraints(config, msg.maxFreqHz);

  const fc = spectralGuard.effectiveCarrierFreqHz;
  const bw = {
    amIfBandwidthHz: rawBw.amIfBandwidthHz,
    fmIfBandwidthHz: spectralGuard.effectiveFmIfBandwidthHz,
    lpfCutoffHz: rawBw.lpfCutoffHz,
  };

  // 2. AM & FM Modulation with exact equal-power normalization
  const amMod = modulateAM(msg.signal, fs, fc, config.am.modulationIndex, TARGET_TX_POWER);
  const fmMod = modulateFM(
    msg.signal,
    fs,
    fc,
    config.fm.frequencyDeviationHz,
    msg.maxFreqHz,
    TARGET_TX_POWER
  );

  // 3. Shared AWGN channel calibrated to reference baseband bandwidth W = lpfCutoffHz
  const awgn = generateAwgnNoise(
    n,
    fs,
    TARGET_TX_POWER,
    bw.lpfCutoffHz,
    config.channel.snr0Db,
    config.channel.noiseSeed
  );

  const amRxNoisy = addNoiseToSignal(amMod.tx, awgn.noise);
  const fmRxNoisy = addNoiseToSignal(fmMod.tx, awgn.noise);

  // 4. Noisy receiver demodulation
  const amDemod = demodulateAM(
    amRxNoisy,
    fs,
    fc,
    bw.amIfBandwidthHz,
    bw.lpfCutoffHz,
    msg.maxFreqHz,
    config.am.envelopeDecayFactor
  );
  const fmDemod = demodulateFM(
    fmRxNoisy,
    fs,
    fc,
    bw.fmIfBandwidthHz,
    bw.lpfCutoffHz,
    config.fm.frequencyDeviationHz
  );

  // 5. Noiseless demodulation pass for clean harmonic/nonlinear distortion isolation
  const amDemodClean = demodulateAM(
    amMod.tx,
    fs,
    fc,
    bw.amIfBandwidthHz,
    bw.lpfCutoffHz,
    msg.maxFreqHz,
    config.am.envelopeDecayFactor
  );
  const fmDemodClean = demodulateFM(
    fmMod.tx,
    fs,
    fc,
    bw.fmIfBandwidthHz,
    bw.lpfCutoffHz,
    config.fm.frequencyDeviationHz
  );

  // 6. Scale recovered waveforms & evaluate pre-LPF envelope distortion, post-LPF THD, and NRMSE
  const amRecMetrics = measureRecoverySnrAndNrmse(msg.signal, amDemod.recovered);
  const fmRecMetrics = measureRecoverySnrAndNrmse(msg.signal, fmDemod.recovered);

  const thdApplicable = config.message.waveform === 'single';
  const amPreLpfEnvelopeThdPercent = thdApplicable
    ? measureSingleToneHarmonicThdPercent(amDemodClean.envelopePreLpf, fs, config.message.frequencyHz)
    : null;
  const amPreLpfEnvelopeNrmsePercent = measureNoiselessNrmsePercent(
    msg.signal,
    amDemodClean.envelopePreLpf
  );

  const amThdPercent = thdApplicable
    ? measureSingleToneHarmonicThdPercent(amDemodClean.recovered, fs, config.message.frequencyHz)
    : null;
  const fmThdPercent = thdApplicable
    ? measureSingleToneHarmonicThdPercent(fmDemodClean.recovered, fs, config.message.frequencyHz)
    : null;

  const amNoiselessNrmsePercent = measureNoiselessNrmsePercent(msg.signal, amDemodClean.recovered);
  const fmNoiselessNrmsePercent = measureNoiselessNrmsePercent(msg.signal, fmDemodClean.recovered);

  const amInputCnrDb = measureIfInputCnrDb(amMod.tx, awgn.noise, fs, fc, bw.amIfBandwidthHz);
  const fmInputCnrDb = measureIfInputCnrDb(fmMod.tx, awgn.noise, fs, fc, bw.fmIfBandwidthHz);

  const obwHalfSpan = Math.min(fc - 500, Math.max(90000, bw.fmIfBandwidthHz * 0.9));
  const amMeasuredBwHz = measureOccupiedBandwidthHz(amMod.tx, fs, fc, obwHalfSpan);
  const fmMeasuredBwHz = measureOccupiedBandwidthHz(fmMod.tx, fs, fc, obwHalfSpan);

  const amTheoryBwHz = theoreticalAmBandwidthHz(msg.maxFreqHz);
  const fmTheoryBwHz = theoreticalFmCarsonBandwidthHz(fmMod.effectivePeakDevHz, msg.maxFreqHz);

  // Theoretical output SNR formulas given reference gamma = P_tx / (N0 * W_lpf)
  const gammaLin = Math.pow(10, config.channel.snr0Db / 10);
  const msgPower = msg.rms * msg.rms; // P_m = mean(m(t)^2)
  const muSqPm = config.am.modulationIndex * config.am.modulationIndex * msgPower;
  const amTheorySnrLin = (muSqPm / (1 + muSqPm)) * gammaLin;
  const amTheorySnrDb = 10 * Math.log10(Math.max(amTheorySnrLin, 1e-12));

  const devRatio = config.fm.frequencyDeviationHz / bw.lpfCutoffHz;
  const fmTheorySnrLin = 3 * devRatio * devRatio * msgPower * gammaLin;
  const fmTheorySnrDb = 10 * Math.log10(Math.max(fmTheorySnrLin, 1e-12));

  const amEnbwHz = bandpassEquivalentNoiseBandwidthHz(fs, n, bw.amIfBandwidthHz);
  const fmEnbwHz = bandpassEquivalentNoiseBandwidthHz(fs, n, bw.fmIfBandwidthHz);
  const amTheoryCnrDb = 10 * Math.log10(TARGET_TX_POWER / (awgn.n0WattsPerHz * amEnbwHz));
  const fmTheoryCnrDb = 10 * Math.log10(TARGET_TX_POWER / (awgn.n0WattsPerHz * fmEnbwHz));

  const lpfGainAtMaxFreqDb = butterworthGainDb(msg.maxFreqHz, bw.lpfCutoffHz, 6);

  // Normalize recovered signals by clean-pass linear gain so visual overlay aligns 1:1 with m(t)
  const amCleanGain = measureRecoverySnrAndNrmse(msg.signal, amDemodClean.recovered).gainEstimate;
  const fmCleanGain = measureRecoverySnrAndNrmse(msg.signal, fmDemodClean.recovered).gainEstimate;
  const amPreLpfCleanGain = measureRecoverySnrAndNrmse(
    msg.signal,
    amDemodClean.envelopePreLpf
  ).gainEstimate;

  const amRecoveredAligned = scaleSignal(amDemod.recovered, amCleanGain > 1e-6 ? 1 / amCleanGain : 1);
  const fmRecoveredAligned = scaleSignal(fmDemod.recovered, fmCleanGain > 1e-6 ? 1 / fmCleanGain : 1);
  const amEnvelopePreLpfAligned = scaleSignal(
    amDemodClean.envelopePreLpf,
    amPreLpfCleanGain > 1e-6 ? 1 / amPreLpfCleanGain : 1
  );

  // 7. Frequency Spectra (0 .. Fs/2)
  let spectrum;
  if (includeSpectra) {
    const half = (n >> 1) + 1;
    const df = fs / n;
    const freqsHz = new Float64Array(half);
    for (let k = 0; k < half; k++) freqsHz[k] = k * df;

    spectrum = {
      freqsHz,
      amDb: computeMagnitudeSpectrumDb(amMod.tx, true),
      fmDb: computeMagnitudeSpectrumDb(fmMod.tx, true),
      amRxDb: computeMagnitudeSpectrumDb(amDemod.rxFilteredIf, true),
      fmRxDb: computeMagnitudeSpectrumDb(amDemod.rxFilteredIf, true),
      messageDb: computeMagnitudeSpectrumDb(msg.signal, true),
      amRecoveredDb: computeMagnitudeSpectrumDb(amRecoveredAligned, true),
      fmRecoveredDb: computeMagnitudeSpectrumDb(fmRecoveredAligned, true),
    };
  } else {
    const empty = new Float64Array(0);
    spectrum = {
      freqsHz: empty,
      amDb: empty,
      fmDb: empty,
      amRxDb: empty,
      fmRxDb: empty,
      messageDb: empty,
      amRecoveredDb: empty,
      fmRecoveredDb: empty,
    };
  }

  return {
    sampleRateHz: fs,
    sampleCount: n,
    durationSec: n / fs,
    timeSec: msg.timeSec,
    message: msg.signal,
    messageFrequenciesHz: msg.frequenciesHz,
    messageMaxFreqHz: msg.maxFreqHz,
    messageRms: msg.rms,
    spectralGuard,
    am: {
      tx: amMod.tx,
      envelopeIdeal: amMod.envelopeIdeal,
      envelopePreLpf: amEnvelopePreLpfAligned,
      rxNoisy: amRxNoisy,
      rxFilteredIf: amDemod.rxFilteredIf,
      recovered: amRecoveredAligned,
      recoveredNoiseless: scaleSignal(
        amDemodClean.recovered,
        amCleanGain > 1e-6 ? 1 / amCleanGain : 1
      ),
      isOvermodulated: amMod.isOvermodulated,
      metrics: {
        txPower: amMod.txPower,
        carrierAmplitude: amMod.carrierAmplitude,
        inputCnrDb: amInputCnrDb,
        theoreticalInputCnrDb: amTheoryCnrDb,
        outputSnrDb: amRecMetrics.outputSnrDb,
        theoreticalOutputSnrDb: amTheorySnrDb,
        processingGainDb: amRecMetrics.outputSnrDb - amInputCnrDb,
        preLpfEnvelopeThdPercent: amPreLpfEnvelopeThdPercent,
        preLpfEnvelopeNrmsePercent: amPreLpfEnvelopeNrmsePercent,
        thdPercent: amThdPercent,
        thdApplicable,
        noiselessNrmsePercent: amNoiselessNrmsePercent,
        nrmsePercent: amRecMetrics.nrmsePercent,
        theoreticalBandwidthHz: amTheoryBwHz,
        measuredBandwidthHz: amMeasuredBwHz,
        modulationIndex: amMod.effectiveMu,
        ifBandwidthUsedHz: bw.amIfBandwidthHz,
        lpfCutoffUsedHz: bw.lpfCutoffHz,
        lpfGainAtMaxFreqDb,
      },
    },
    fm: {
      tx: fmMod.tx,
      phaseRad: fmMod.phaseRad,
      instFreqTxHz: fmMod.instFreqTxHz,
      instFreqRxHz: fmDemod.instFreqRxHz,
      rxNoisy: fmRxNoisy,
      rxFilteredIf: fmDemod.rxFilteredIf,
      recovered: fmRecoveredAligned,
      recoveredNoiseless: scaleSignal(
        fmDemodClean.recovered,
        fmCleanGain > 1e-6 ? 1 / fmCleanGain : 1
      ),
      metrics: {
        txPower: fmMod.txPower,
        carrierAmplitude: fmMod.carrierAmplitude,
        inputCnrDb: fmInputCnrDb,
        theoreticalInputCnrDb: fmTheoryCnrDb,
        outputSnrDb: fmRecMetrics.outputSnrDb,
        theoreticalOutputSnrDb: fmTheorySnrDb,
        processingGainDb: fmRecMetrics.outputSnrDb - fmInputCnrDb,
        preLpfEnvelopeThdPercent: null,
        preLpfEnvelopeNrmsePercent: fmNoiselessNrmsePercent,
        thdPercent: fmThdPercent,
        thdApplicable,
        noiselessNrmsePercent: fmNoiselessNrmsePercent,
        nrmsePercent: fmRecMetrics.nrmsePercent,
        theoreticalBandwidthHz: fmTheoryBwHz,
        measuredBandwidthHz: fmMeasuredBwHz,
        modulationIndex: fmMod.effectiveBeta,
        ifBandwidthUsedHz: bw.fmIfBandwidthHz,
        lpfCutoffUsedHz: bw.lpfCutoffHz,
        lpfGainAtMaxFreqDb,
      },
    },
    channel: {
      noise: awgn.noise,
      n0WattsPerHz: awgn.n0WattsPerHz,
      noiseSigma: awgn.noiseSigma,
      gammaDb: config.channel.snr0Db,
      powerParityError: Math.abs(amMod.txPower - fmMod.txPower),
    },
    spectrum,
  };
}

function scaleSignal(arr: Float64Array, factor: number): Float64Array {
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    out[i] = arr[i] * factor;
  }
  return out;
}
