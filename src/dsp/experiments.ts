import { measureRecoverySnrAndNrmse } from './metrics';
import { cloneSimulationConfig, runSimulation } from './simulator';
import {
  ExperimentPreset,
  ExperimentRecord,
  NoiseSweepPoint,
  NoiseSweepResult,
  SimulationConfig,
  SimulationResult,
} from './types';

export const EXPERIMENT_PRESETS: ExperimentPreset[] = [
  {
    id: 'clean',
    name: 'Clean Channel',
    subtitle: 'High SNR (γ = 35 dB)',
    snr0Db: 35,
    description:
      'Near-noiseless propagation to isolate modulation fidelity, baseline harmonic distortion, and occupied RF bandwidth.',
    expectedBehavior:
      'Both AM and FM achieve high output SNR. FM maintains near-zero distortion while wide-band FM occupies significantly more RF spectrum.',
  },
  {
    id: 'moderate',
    name: 'Moderate-Noise Channel',
    subtitle: 'Nominal Operating SNR (γ = 20 dB)',
    snr0Db: 20,
    description:
      'Standard operating link above FM threshold where wideband FM processing gain offsets its wider IF noise bandwidth.',
    expectedBehavior:
      'FM output SNR substantially exceeds AM output SNR due to 3β² processing gain, despite FM admitting higher total IF noise power.',
  },
  {
    id: 'weak',
    name: 'Weak-Signal Channel',
    subtitle: 'Below FM Threshold (γ = 8 dB)',
    snr0Db: 8,
    description:
      'Low-SNR regime pushing the FM IF carrier-to-noise ratio down into the non-linear discriminator threshold breakdown region.',
    expectedBehavior:
      'FM experiences phase-wrap impulse ("click") noise and collapses rapidly below its linear theoretical curve, while AM degrades linearly.',
  },
];

function meanAndStd(values: number[]): { mean: number; std: number } {
  const k = values.length;
  if (k === 0) return { mean: 0, std: 0 };
  let sum = 0;
  for (let i = 0; i < k; i++) sum += values[i];
  const mean = sum / k;
  if (k === 1) return { mean, std: 0 };
  let sumSq = 0;
  for (let i = 0; i < k; i++) {
    const d = values[i] - mean;
    sumSq += d * d;
  }
  return { mean, std: Math.sqrt(sumSq / (k - 1)) };
}

export function deriveMonteCarloSeeds(baseSeed: number, count = 5): number[] {
  const normalizedBase = Math.max(1, Math.floor(Math.abs(baseSeed)) || 4219);
  const seeds: number[] = [];
  for (let i = 0; i < Math.max(1, count); i++) {
    seeds.push(normalizedBase + i * 1009);
  }
  return seeds;
}

export function runExperimentPreset(
  preset: ExperimentPreset,
  baseConfig: SimulationConfig
): ExperimentRecord {
  const cloned = cloneSimulationConfig(baseConfig);
  cloned.channel.snr0Db = preset.snr0Db;

  const result = runSimulation(cloned, { includeSpectra: false });

  return {
    id: `${preset.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    presetId: preset.id,
    presetName: preset.name,
    timestamp: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    configSnapshot: cloneSimulationConfig(cloned),
    messageWaveform: cloned.message.waveform,
    messageFreqHz: cloned.message.frequencyHz,
    messageAmplitude: cloned.message.amplitude,
    messageFrequenciesHz: [...result.messageFrequenciesHz],
    messageMaxFreqHz: result.messageMaxFreqHz,
    requestedCarrierFreqHz: result.spectralGuard.requestedCarrierFreqHz,
    effectiveCarrierFreqHz: result.spectralGuard.effectiveCarrierFreqHz,
    amRequestedMu: cloned.am.modulationIndex,
    amMu: result.am.metrics.modulationIndex,
    fmFrequencyDeviationHz: cloned.fm.frequencyDeviationHz,
    fmBeta: result.fm.metrics.modulationIndex,
    txPower: result.am.metrics.txPower,
    snr0Db: preset.snr0Db,
    noiseSeed: cloned.channel.noiseSeed,
    n0WattsPerHz: result.channel.n0WattsPerHz,
    noiseSigma: result.channel.noiseSigma,
    autoIfBandwidth: cloned.receiver.autoIfBandwidth,
    amIfBandwidthHz: result.am.metrics.ifBandwidthUsedHz,
    fmIfBandwidthHz: result.fm.metrics.ifBandwidthUsedHz,
    lpfCutoffHz: result.fm.metrics.lpfCutoffUsedHz,
    spectralGuardAdjusted: result.spectralGuard.adjusted,
    spectralGuardReason: result.spectralGuard.reason,
    sampleRateHz: result.sampleRateHz,
    sampleCount: result.sampleCount,
    durationSec: result.durationSec,
    amInputCnrDb: result.am.metrics.inputCnrDb,
    fmInputCnrDb: result.fm.metrics.inputCnrDb,
    amTheoreticalInputCnrDb: result.am.metrics.theoreticalInputCnrDb,
    fmTheoreticalInputCnrDb: result.fm.metrics.theoreticalInputCnrDb,
    amOutputSnrDb: result.am.metrics.outputSnrDb,
    fmOutputSnrDb: result.fm.metrics.outputSnrDb,
    amTheoreticalOutputSnrDb: result.am.metrics.theoreticalOutputSnrDb,
    fmTheoreticalOutputSnrDb: result.fm.metrics.theoreticalOutputSnrDb,
    amPreLpfEnvelopeThdPercent: result.am.metrics.preLpfEnvelopeThdPercent,
    amPreLpfEnvelopeNrmsePercent: result.am.metrics.preLpfEnvelopeNrmsePercent,
    amThdPercent: result.am.metrics.thdPercent,
    fmThdPercent: result.fm.metrics.thdPercent,
    amNoiselessNrmsePercent: result.am.metrics.noiselessNrmsePercent,
    fmNoiselessNrmsePercent: result.fm.metrics.noiselessNrmsePercent,
    amNrmsePercent: result.am.metrics.nrmsePercent,
    fmNrmsePercent: result.fm.metrics.nrmsePercent,
    amMeasuredBwHz: result.am.metrics.measuredBandwidthHz,
    fmMeasuredBwHz: result.fm.metrics.measuredBandwidthHz,
    amTheoreticalBwHz: result.am.metrics.theoreticalBandwidthHz,
    fmTheoreticalBwHz: result.fm.metrics.theoreticalBandwidthHz,
  };
}

/**
 * Deterministically replays a previously captured ExperimentRecord from its immutable configSnapshot.
 */
export function replayExperimentRecord(record: ExperimentRecord): SimulationResult {
  return runSimulation(cloneSimulationConfig(record.configSnapshot), { includeSpectra: false });
}

/**
 * Runs a multi-seed Monte Carlo channel noise sweep across gamma in [minSnrDb, maxSnrDb].
 * Averages >= 5 independent AWGN seeds per gamma point to measure mean +/- std of AM and FM
 * output SNR without hardcoded IF-CNR ceilings.
 *
 * Threshold detection criterion:
 *   SNR_pred,FM(gamma) = 10*log10( (SNR_linear,FM(gamma)^(-1) + SNR_noiseless_floor,FM^(-1))^(-1) )
 *   Threshold onset occurs where Monte Carlo mean FM Output SNR falls > 3.0 dB below SNR_pred,FM(gamma),
 *   isolating genuine nonlinear phase-wrap click breakdown from deterministic LPF/IF skirt ceilings.
 */
export function runNoiseSweepExperiment(
  baseConfig: SimulationConfig,
  minSnrDb = 0,
  maxSnrDb = 34,
  stepDb = 2,
  realizationsPerPoint = 5
): NoiseSweepResult {
  const configSnapshot = cloneSimulationConfig(baseConfig);
  const seedsUsed = deriveMonteCarloSeeds(configSnapshot.channel.noiseSeed, Math.max(5, realizationsPerPoint));
  const kSeeds = seedsUsed.length;

  // Baseline run establishes deterministic config metadata and exact noiseless FM reconstruction ceiling
  const baseRes = runSimulation(configSnapshot, { includeSpectra: false });
  const fmNoiselessFloorSnrDb = measureRecoverySnrAndNrmse(
    baseRes.message,
    baseRes.fm.recoveredNoiseless
  ).outputSnrDb;
  const fmNoiselessFloorLin = Math.pow(10, fmNoiselessFloorSnrDb / 10);

  const points: NoiseSweepPoint[] = [];

  for (let snrDb = minSnrDb; snrDb <= maxSnrDb + 1e-6; snrDb += stepDb) {
    const amCnrVals: number[] = [];
    const fmCnrVals: number[] = [];
    const amOutVals: number[] = [];
    const fmOutVals: number[] = [];
    const amNrmseVals: number[] = [];
    const fmNrmseVals: number[] = [];
    let amTheorySnrDb = 0;
    let fmTheorySnrDb = 0;

    for (let sIdx = 0; sIdx < kSeeds; sIdx++) {
      const cfg = cloneSimulationConfig(configSnapshot);
      cfg.channel.snr0Db = snrDb;
      cfg.channel.noiseSeed = seedsUsed[sIdx];

      const res = runSimulation(cfg, { includeSpectra: false });
      amCnrVals.push(res.am.metrics.inputCnrDb);
      fmCnrVals.push(res.fm.metrics.inputCnrDb);
      amOutVals.push(res.am.metrics.outputSnrDb);
      fmOutVals.push(res.fm.metrics.outputSnrDb);
      amNrmseVals.push(res.am.metrics.nrmsePercent);
      fmNrmseVals.push(res.fm.metrics.nrmsePercent);
      if (sIdx === 0) {
        amTheorySnrDb = res.am.metrics.theoreticalOutputSnrDb;
        fmTheorySnrDb = res.fm.metrics.theoreticalOutputSnrDb;
      }
    }

    const amCnrStat = meanAndStd(amCnrVals);
    const fmCnrStat = meanAndStd(fmCnrVals);
    const amOutStat = meanAndStd(amOutVals);
    const fmOutStat = meanAndStd(fmOutVals);
    const amNrmseStat = meanAndStd(amNrmseVals);
    const fmNrmseStat = meanAndStd(fmNrmseVals);

    const fmLinearLin = Math.pow(10, fmTheorySnrDb / 10);
    const fmCompositeLin = 1 / (1 / Math.max(fmLinearLin, 1e-12) + 1 / Math.max(fmNoiselessFloorLin, 1e-12));
    const fmCompositeTheorySnrDb = 10 * Math.log10(Math.max(fmCompositeLin, 1e-12));

    // Genuine nonlinear FM click threshold onset: mean FM output drops > 3.0 dB below composite prediction
    const belowFmThreshold = fmCompositeTheorySnrDb - fmOutStat.mean > 3.0;

    points.push({
      snr0Db: snrDb,
      amInputCnrDb: amCnrStat.mean,
      amInputCnrStdDb: amCnrStat.std,
      fmInputCnrDb: fmCnrStat.mean,
      fmInputCnrStdDb: fmCnrStat.std,
      amOutputSnrDb: amOutStat.mean,
      amOutputSnrStdDb: amOutStat.std,
      fmOutputSnrDb: fmOutStat.mean,
      fmOutputSnrStdDb: fmOutStat.std,
      amTheorySnrDb,
      fmTheorySnrDb,
      fmCompositeTheorySnrDb,
      amNrmsePercent: amNrmseStat.mean,
      fmNrmsePercent: fmNrmseStat.mean,
      belowFmThreshold,
    });
  }

  // 1. Locate threshold onset scanning from high SNR down to low SNR
  let thresholdGammaDb: number | null = null;
  let thresholdCnrDb: number | null = null;
  let thresholdAmOutputSnrDb: number | null = null;
  let thresholdAmOutputSnrStdDb: number | null = null;
  let thresholdFmOutputSnrDb: number | null = null;
  let thresholdFmOutputSnrStdDb: number | null = null;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].belowFmThreshold) {
      thresholdGammaDb = points[i].snr0Db;
      thresholdCnrDb = points[i].fmInputCnrDb;
      thresholdAmOutputSnrDb = points[i].amOutputSnrDb;
      thresholdAmOutputSnrStdDb = points[i].amOutputSnrStdDb;
      thresholdFmOutputSnrDb = points[i].fmOutputSnrDb;
      thresholdFmOutputSnrStdDb = points[i].fmOutputSnrStdDb;
      break;
    }
  }

  // 2. Locate exact point of sharpest FM deterioration (largest single-step negative SNR change)
  let sharpDropFromGammaDb: number | null = null;
  let sharpDropToGammaDb: number | null = null;
  let sharpDropDeltaSnrDb: number | null = null;
  let sharpDropFmCnrDb: number | null = null;
  let sharpDropFmOutputSnrDb: number | null = null;
  let sharpDropAmOutputSnrDb: number | null = null;

  for (let i = points.length - 2; i >= 0; i--) {
    const hi = points[i + 1];
    const lo = points[i];
    const dropDb = hi.fmOutputSnrDb - lo.fmOutputSnrDb;
    if (sharpDropDeltaSnrDb === null || dropDb > sharpDropDeltaSnrDb) {
      sharpDropDeltaSnrDb = dropDb;
      sharpDropFromGammaDb = hi.snr0Db;
      sharpDropToGammaDb = lo.snr0Db;
      sharpDropFmCnrDb = lo.fmInputCnrDb;
      sharpDropFmOutputSnrDb = lo.fmOutputSnrDb;
      sharpDropAmOutputSnrDb = lo.amOutputSnrDb;
    }
  }

  // 3. Locate exact crossover where mean FM Output SNR drops below AM Output SNR (scanning high -> low)
  let crossoverGammaDb: number | null = null;
  let crossoverFmCnrDb: number | null = null;
  let crossoverOutputSnrDb: number | null = null;
  let crossoverObserved = false;

  for (let i = points.length - 2; i >= 0; i--) {
    const hi = points[i + 1];
    const lo = points[i];
    const diffHi = hi.fmOutputSnrDb - hi.amOutputSnrDb;
    const diffLo = lo.fmOutputSnrDb - lo.amOutputSnrDb;

    if (diffHi >= 0 && diffLo < 0) {
      const frac = diffHi / Math.max(diffHi - diffLo, 1e-9);
      crossoverGammaDb = hi.snr0Db - frac * (hi.snr0Db - lo.snr0Db);
      crossoverFmCnrDb = hi.fmInputCnrDb - frac * (hi.fmInputCnrDb - lo.fmInputCnrDb);
      crossoverOutputSnrDb = hi.amOutputSnrDb - frac * (hi.amOutputSnrDb - lo.amOutputSnrDb);
      crossoverObserved = true;
      break;
    }
  }

  if (
    !crossoverObserved &&
    points.length > 0 &&
    points[points.length - 1].fmOutputSnrDb < points[points.length - 1].amOutputSnrDb
  ) {
    crossoverObserved = true;
    crossoverGammaDb = points[points.length - 1].snr0Db;
    crossoverFmCnrDb = points[points.length - 1].fmInputCnrDb;
    crossoverOutputSnrDb = points[points.length - 1].fmOutputSnrDb;
  }

  const thresholdCriterion = `${kSeeds}-seed Monte Carlo mean FM Output SNR drops > 3.0 dB below composite prediction [1/(SNR_linear⁻¹ + SNR_clean_floor⁻¹), clean floor ${fmNoiselessFloorSnrDb.toFixed(1)} dB]. Eliminates arbitrary IF-CNR cutoffs; onset shifts naturally with β = ${baseRes.fm.metrics.modulationIndex.toFixed(2)}, B_IF = ${(baseRes.fm.metrics.ifBandwidthUsedHz / 1000).toFixed(1)} kHz, and ${configSnapshot.message.waveform} waveform.`;

  return {
    configSnapshot,
    seedsUsed,
    realizationsPerPoint: kSeeds,
    sampleRateHz: baseRes.sampleRateHz,
    sampleCount: baseRes.sampleCount,
    durationSec: baseRes.durationSec,
    messageWaveform: configSnapshot.message.waveform,
    messageFrequenciesHz: [...baseRes.messageFrequenciesHz],
    messageMaxFreqHz: baseRes.messageMaxFreqHz,
    effectiveCarrierFreqHz: baseRes.spectralGuard.effectiveCarrierFreqHz,
    amIfBandwidthHz: baseRes.am.metrics.ifBandwidthUsedHz,
    fmIfBandwidthHz: baseRes.fm.metrics.ifBandwidthUsedHz,
    lpfCutoffHz: baseRes.fm.metrics.lpfCutoffUsedHz,
    spectralGuardAdjusted: baseRes.spectralGuard.adjusted,
    fmNoiselessFloorSnrDb,
    points,
    thresholdGammaDb,
    thresholdCnrDb,
    thresholdAmOutputSnrDb,
    thresholdAmOutputSnrStdDb,
    thresholdFmOutputSnrDb,
    thresholdFmOutputSnrStdDb,
    thresholdCriterion,
    sharpDropFromGammaDb,
    sharpDropToGammaDb,
    sharpDropDeltaSnrDb,
    sharpDropFmCnrDb,
    sharpDropFmOutputSnrDb,
    sharpDropAmOutputSnrDb,
    crossoverGammaDb,
    crossoverFmCnrDb,
    crossoverOutputSnrDb,
    crossoverObserved,
    fmBeta: baseRes.fm.metrics.modulationIndex,
    amMu: baseRes.am.metrics.modulationIndex,
  };
}
