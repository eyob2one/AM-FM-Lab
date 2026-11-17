import { EXPERIMENT_PRESETS, replayExperimentRecord, runExperimentPreset } from './experiments';
import { fftInPlace, forwardFFT } from './fft';
import { getMultitoneFrequencies } from './signalGenerator';
import { DEFAULT_SIMULATION_CONFIG, runSimulation } from './simulator';
import { SimulationConfig, VerificationCheck } from './types';

/**
 * Independent helper: computes raw time-domain average power directly from samples.
 */
function rawMeanSquarePower(samples: Float64Array): number {
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
  }
  return sumSq / samples.length;
}

/**
 * Independent helper: computes raw unwindowed two-sided DFT total power (1/N^2 * sum |X[k]|^2).
 */
function rawDftTotalPower(samples: Float64Array): number {
  const { re, im } = forwardFFT(samples);
  const n = samples.length;
  let sumMagSq = 0;
  for (let k = 0; k < n; k++) {
    sumMagSq += re[k] * re[k] + im[k] * im[k];
  }
  return sumMagSq / (n * n);
}

/**
 * Independent helper: computes single-bin two-sided cosine power at an exact integer bin k.
 */
function rawBinTonePower(samples: Float64Array, freqHz: number, sampleRateHz: number): number {
  const n = samples.length;
  const df = sampleRateHz / n;
  const k = Math.round(freqHz / df);
  const { re, im } = forwardFFT(samples);
  const pos = (re[k] * re[k] + im[k] * im[k]) / (n * n);
  if (k === 0 || k === n >> 1) return pos;
  const negIdx = n - k;
  const neg = (re[negIdx] * re[negIdx] + im[negIdx] * im[negIdx]) / (n * n);
  return pos + neg;
}

/**
 * Independent helper: ideal brick-wall zero-phase DFT lowpass filter (completely decoupled from filters.ts).
 */
function independentIdealLowpass(
  samples: Float64Array,
  sampleRateHz: number,
  cutoffHz: number
): Float64Array {
  const n = samples.length;
  const df = sampleRateHz / n;
  const { re, im } = forwardFFT(samples);
  const maxBin = Math.floor(cutoffHz / df);
  for (let k = 0; k <= n >> 1; k++) {
    if (k > maxBin) {
      re[k] = 0;
      im[k] = 0;
      if (k > 0 && k < n >> 1) {
        re[n - k] = 0;
        im[n - k] = 0;
      }
    }
  }
  fftInPlace(re, im, true);
  return re;
}

/**
 * Independent helper: measures interior-window SNR and NRMSE directly from waveform samples
 * without calling metrics.ts helpers.
 */
function independentSnrAndNrmse(
  reference: Float64Array,
  recovered: Float64Array,
  trimRatio = 0.05
): { snrDb: number; nrmsePercent: number } {
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

  let cov = 0;
  let varM = 0;
  for (let i = start; i < end; i++) {
    const dm = reference[i] - meanM;
    cov += dm * (recovered[i] - meanY);
    varM += dm * dm;
  }
  const alpha = varM > 1e-18 ? cov / varM : 0;
  if (alpha <= 0) return { snrDb: -20, nrmsePercent: 100 };

  let sigPow = 0;
  let errPow = 0;
  for (let i = start; i < end; i++) {
    const target = alpha * (reference[i] - meanM);
    const err = recovered[i] - meanY - target;
    sigPow += target * target;
    errPow += err * err;
  }
  const snrDb = 10 * Math.log10(errPow > 1e-18 ? sigPow / errPow : 1e8);
  const nrmsePercent = Math.sqrt(errPow / Math.max(sigPow, 1e-18)) * 100;
  return { snrDb, nrmsePercent };
}

/**
 * Independent helper: measures single-tone harmonic THD (%) via Hann-windowed 2x zero-padded DFT
 * without calling metrics.ts helpers.
 */
function independentSingleToneThdPercent(
  signal: Float64Array,
  sampleRateHz: number,
  fundamentalHz: number
): number {
  const n = signal.length;
  const start = Math.floor(n * 0.05);
  const end = Math.ceil(n * 0.95);
  const len = end - start;

  let wSum = 0;
  let wySum = 0;
  const win = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1)));
    win[i] = w;
    wSum += w;
    wySum += w * signal[start + i];
  }
  const dc = wySum / wSum;

  let nFft = 1;
  while (nFft < n * 2) nFft <<= 1;
  const padded = new Float64Array(nFft);
  for (let i = 0; i < len; i++) padded[i] = (signal[start + i] - dc) * win[i];

  const { re, im } = forwardFFT(padded);
  const df = sampleRateHz / nFft;
  const halfSpan = Math.min(200, Math.max(2.5 * df, fundamentalHz * 0.4));

  const bandPow = (fCenter: number): number => {
    const b0 = Math.max(2, Math.floor((fCenter - halfSpan) / df));
    const b1 = Math.min((nFft >> 1) - 1, Math.ceil((fCenter + halfSpan) / df));
    let p = 0;
    for (let k = b0; k <= b1; k++) {
      if (k * df <= Math.max(60, fundamentalHz * 0.45)) continue;
      p += re[k] * re[k] + im[k] * im[k];
    }
    return p;
  };

  const f1Pow = bandPow(fundamentalHz);
  if (f1Pow <= 1e-18) return 0;
  let hPow = 0;
  for (let h = 2; h <= 10; h++) {
    const fh = h * fundamentalHz;
    if (fh > 25000) break;
    hPow += bandPow(fh);
  }
  return Math.sqrt(hPow / f1Pow) * 100;
}

/**
 * Independent helper: measures 99% occupied bandwidth from unwindowed DFT bins around f_c.
 */
function independentOccupiedBandwidthHz(
  samples: Float64Array,
  sampleRateHz: number,
  carrierFreqHz: number,
  halfSpanHz = 90000
): number {
  const n = samples.length;
  const df = sampleRateHz / n;
  const { re, im } = forwardFFT(samples);
  const minBin = Math.max(1, Math.floor((carrierFreqHz - halfSpanHz) / df));
  const maxBin = Math.min((n >> 1) - 1, Math.ceil((carrierFreqHz + halfSpanHz) / df));

  let total = 0;
  const binPow = new Float64Array(maxBin - minBin + 1);
  for (let k = minBin; k <= maxBin; k++) {
    const p = (2 * (re[k] * re[k] + im[k] * im[k])) / (n * n);
    binPow[k - minBin] = p;
    total += p;
  }
  if (total <= 1e-18) return 0;

  let cum = 0;
  let lowBin = minBin;
  let highBin = maxBin;
  let foundLow = false;
  for (let k = minBin; k <= maxBin; k++) {
    cum += binPow[k - minBin];
    if (!foundLow && cum >= 0.005 * total) {
      lowBin = k;
      foundLow = true;
    }
    if (cum >= 0.995 * total) {
      highBin = k;
      break;
    }
  }
  return Math.max(df, (highBin - lowBin) * df);
}

/**
 * Runs the 10-check standardized Engineering & Mathematical Verification Suite.
 * Decoupled from metrics.ts and filters.ts helpers so filtering, THD, SNR, NRMSE,
 * Parseval energy, and bandwidth are verified independently.
 */
export function runEngineeringVerificationSuite(
  activeConfig: SimulationConfig = DEFAULT_SIMULATION_CONFIG
): VerificationCheck[] {
  const checks: VerificationCheck[] = [];

  const refCfg: SimulationConfig = {
    ...activeConfig,
    message: { waveform: 'single', frequencyHz: 1000, amplitude: 1.0 },
    am: { ...activeConfig.am, modulationIndex: 0.8 },
    fm: { frequencyDeviationHz: 15000 },
    channel: { ...activeConfig.channel, snr0Db: 38 },
  };
  const simRef = runSimulation(refCfg, { includeSpectra: false });
  const fs = simRef.sampleRateHz;
  const fc = simRef.spectralGuard.effectiveCarrierFreqHz;

  // 1. Equal Transmitted Power Normalization
  const pAmRaw = rawMeanSquarePower(simRef.am.tx);
  const pFmRaw = rawMeanSquarePower(simRef.fm.tx);
  const powerDiff = Math.abs(pAmRaw - pFmRaw);
  checks.push({
    id: 'power-parity',
    title: 'Equal Transmitted RF Power Normalization',
    category: 'Fair Comparison',
    expected: '|P_AM - P_FM| < 1e-6 W (both = 0.5000 W)',
    measured: `ΔP = ${powerDiff.toExponential(2)} W (AM=${pAmRaw.toFixed(6)} W, FM=${pFmRaw.toFixed(6)} W)`,
    passed: powerDiff < 1e-6 && Math.abs(pAmRaw - 0.5) < 1e-6,
    detail:
      'Independently sums sample squares of AM and FM transmitted carriers to confirm equal channel power.',
  });

  // 2. AM Modulation Index & Analytical Total Power Formula
  let eMax = -Infinity;
  let eMin = Infinity;
  for (let i = 0; i < simRef.am.envelopeIdeal.length; i++) {
    const e = simRef.am.envelopeIdeal[i];
    if (e > eMax) eMax = e;
    if (e < eMin) eMin = e;
  }
  const muFromEnvelope = (eMax - eMin) / (eMax + eMin);
  const acAm = simRef.am.metrics.carrierAmplitude;
  const pAmTheoryAnalytical = 0.5 * acAm * acAm * (1 + 0.5 * 0.8 * 0.8);
  const pAmTheoryErr = Math.abs(pAmRaw - pAmTheoryAnalytical) / pAmTheoryAnalytical;
  checks.push({
    id: 'am-power-mu',
    title: 'AM Modulation Index & Analytical Total Power',
    category: 'AM Theory',
    expected: 'μ_env = 0.8000; P_AM = (A_c²/2)(1 + μ²/2) within 0.01%',
    measured: `μ_env = ${muFromEnvelope.toFixed(4)} | P_meas = ${pAmRaw.toFixed(6)} W vs Theory = ${pAmTheoryAnalytical.toFixed(6)} W`,
    passed: Math.abs(muFromEnvelope - 0.8) < 1e-4 && pAmTheoryErr < 1e-4,
    detail:
      'Independently verifies μ from envelope extrema (E_max−E_min)/(E_max+E_min) and matches time power to closed-form DSB-LC theory.',
  });

  // 3. AM Carrier & Sideband Power Distribution
  const pCarrierMeas = rawBinTonePower(simRef.am.tx, fc, fs);
  const pLsbMeas = rawBinTonePower(simRef.am.tx, fc - 1000, fs);
  const pUsbMeas = rawBinTonePower(simRef.am.tx, fc + 1000, fs);
  const pCarrierTheory = 0.5 * acAm * acAm;
  const pEachSbTheory = (acAm * acAm * 0.8 * 0.8) / 8;
  const sbRelErr =
    (Math.abs(pLsbMeas - pEachSbTheory) + Math.abs(pUsbMeas - pEachSbTheory)) /
    (2 * pEachSbTheory);
  const carrierRelErr = Math.abs(pCarrierMeas - pCarrierTheory) / pCarrierTheory;
  checks.push({
    id: 'am-sideband-power',
    title: 'AM Carrier & Sideband Power Decomposition',
    category: 'AM Spectral Theory',
    expected: `P_c=${pCarrierTheory.toFixed(4)} W, P_LSB=P_USB=${pEachSbTheory.toFixed(4)} W (±0.1%)`,
    measured: `P_c=${pCarrierMeas.toFixed(4)} W, P_LSB=${pLsbMeas.toFixed(4)} W, P_USB=${pUsbMeas.toFixed(4)} W`,
    passed: carrierRelErr < 1e-3 && sbRelErr < 1e-3,
    detail:
      'Measures exact DFT bin energies at f_c and f_c ± f_m and verifies against P_c = A_c²/2 and P_SB = A_c²μ²/8.',
  });

  // 4. Parseval's Theorem
  const dftPower = rawDftTotalPower(simRef.am.tx);
  const parsevalRelErr = Math.abs(dftPower - pAmRaw) / pAmRaw;
  checks.push({
    id: 'parseval-fft',
    title: "Parseval's Theorem Raw DFT Energy Conservation",
    category: 'Spectral Analysis',
    expected: 'Relative error < 0.001%',
    measured: `${(parsevalRelErr * 100).toExponential(2)}% (Time=${pAmRaw.toFixed(6)}, DFT=${dftPower.toFixed(6)})`,
    passed: parsevalRelErr < 1e-5,
    detail:
      'Independently checks raw time-domain mean-square power against unwindowed N-point complex DFT energy (1/N²)∑|X[k]|².',
  });

  // 5. FM Modulation Index & Phase-Integral Deviation (using independent brick-wall DFT LPF)
  const targetFm = 1000;
  const targetDev = 12000;
  const expectedBeta = targetDev / targetFm;
  const fmDevSim = runSimulation(
    {
      ...DEFAULT_SIMULATION_CONFIG,
      message: { waveform: 'single', frequencyHz: targetFm, amplitude: 1.0 },
      fm: { frequencyDeviationHz: targetDev },
      channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 42 },
    },
    { includeSpectra: false }
  );
  let maxPhi = 0;
  for (let i = 0; i < fmDevSim.fm.phaseRad.length; i++) {
    const p = Math.abs(fmDevSim.fm.phaseRad[i]);
    if (p > maxPhi) maxPhi = p;
  }
  const betaRelErr = Math.abs(maxPhi - expectedBeta) / expectedBeta;

  const rawDev = new Float64Array(fmDevSim.sampleCount);
  for (let i = 0; i < fmDevSim.sampleCount; i++) {
    rawDev[i] = fmDevSim.fm.instFreqRxHz[i] - fmDevSim.spectralGuard.effectiveCarrierFreqHz;
  }
  const indepFilteredDev = independentIdealLowpass(rawDev, fmDevSim.sampleRateHz, 3000);
  const start = Math.floor(fmDevSim.sampleCount * 0.1);
  const end = Math.floor(fmDevSim.sampleCount * 0.9);
  let measuredPeakDev = 0;
  for (let i = start; i < end; i++) {
    const dev = Math.abs(indepFilteredDev[i]);
    if (dev > measuredPeakDev) measuredPeakDev = dev;
  }
  const devRelErr = Math.abs(measuredPeakDev - targetDev) / targetDev;
  checks.push({
    id: 'fm-index-deviation',
    title: 'FM Modulation Index (β = Δf/f_m) & Independent Discriminator Check',
    category: 'FM Theory',
    expected: `β = ${expectedBeta.toFixed(2)} (±0.5%); Δf_rx = ${targetDev} Hz (±3%)`,
    measured: `max|φ(t)| = ${maxPhi.toFixed(3)} rad | Δf_rx = ${measuredPeakDev.toFixed(1)} Hz`,
    passed: betaRelErr < 0.005 && devRelErr < 0.03,
    detail:
      'Verifies peak phase excursion equals β = Δf/f_m and filters raw instFreqRxHz via an independent DFT brick-wall LPF (decoupled from filters.ts).',
  });

  // 6. Independent AM (2f_m) & FM Carson's Rule Bandwidth Verification
  const expectedAmBw = 2 * 1000;
  const expectedCarsonBw = 2 * (targetDev + targetFm);
  const amObwIndep = independentOccupiedBandwidthHz(simRef.am.tx, fs, fc);
  const fmObwIndep = independentOccupiedBandwidthHz(
    fmDevSim.fm.tx,
    fs,
    fmDevSim.spectralGuard.effectiveCarrierFreqHz
  );
  const amBwOk = Math.abs(amObwIndep - expectedAmBw) <= 250;
  const fmBwRatio = fmObwIndep / expectedCarsonBw;
  checks.push({
    id: 'bandwidth-carson',
    title: "AM (2f_m) & FM Carson's Rule Occupied Bandwidth",
    category: 'Spectral Bandwidth',
    expected: `AM OBW ≈ ${expectedAmBw} Hz | FM OBW ≈ ${expectedCarsonBw} Hz (0.75–1.15× Carson)`,
    measured: `AM = ${Math.round(amObwIndep)} Hz | FM = ${Math.round(fmObwIndep)} Hz (${fmBwRatio.toFixed(2)}× Carson)`,
    passed: amBwOk && fmBwRatio >= 0.75 && fmBwRatio <= 1.15,
    detail:
      'Integrates 99% power containment directly from raw DFT bins and compares against analytical 2f_m and 2(Δf + f_m).',
  });

  // 7. Independent AM Overmodulation Pre-LPF & Post-LPF Harmonic Verification
  const amLinear = runSimulation(
    {
      ...DEFAULT_SIMULATION_CONFIG,
      am: { ...DEFAULT_SIMULATION_CONFIG.am, modulationIndex: 0.7 },
      channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 40 },
    },
    { includeSpectra: false }
  );
  const amOver1k = runSimulation(
    {
      ...DEFAULT_SIMULATION_CONFIG,
      am: { ...DEFAULT_SIMULATION_CONFIG.am, modulationIndex: 1.45 },
      channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 40 },
    },
    { includeSpectra: false }
  );
  const amOver5k = runSimulation(
    {
      ...DEFAULT_SIMULATION_CONFIG,
      message: { waveform: 'single', frequencyHz: 5000, amplitude: 1.0 },
      am: { ...DEFAULT_SIMULATION_CONFIG.am, modulationIndex: 1.45 },
      channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 40 },
    },
    { includeSpectra: false }
  );
  const indepLinearThd = independentSingleToneThdPercent(amLinear.am.recoveredNoiseless, fs, 1000);
  const indepOver1kThd = independentSingleToneThdPercent(amOver1k.am.recoveredNoiseless, fs, 1000);
  const indepOver5kPreLpfThd = independentSingleToneThdPercent(amOver5k.am.envelopePreLpf, 512000, 5000);
  checks.push({
    id: 'am-overmodulation',
    title: 'Independent AM Overmodulation THD (Pre-LPF & Post-LPF)',
    category: 'AM Demodulation',
    expected: 'μ=0.7 THD < 1%; μ=1.45 (1k) > 15%; μ=1.45 (5k Pre-LPF) > 15%',
    measured: `μ=0.7=${indepLinearThd.toFixed(2)}% | μ=1.45(1k)=${indepOver1kThd.toFixed(2)}% | μ=1.45(5k pre-LPF)=${indepOver5kPreLpfThd.toFixed(2)}%`,
    passed:
      indepLinearThd < 1.0 &&
      indepOver1kThd > 15.0 &&
      indepOver5kPreLpfThd > 15.0 &&
      amOver1k.am.isOvermodulated,
    detail:
      'Independently calculates zero-padded Hann-DFT harmonics (decoupled from metrics.ts) and verifies Pre-LPF distortion persists at 5 kHz.',
  });

  // 8. Independent Clean-Channel Fidelity & Wideband FM SNR Gain
  const cleanSim = runSimulation(
    {
      ...DEFAULT_SIMULATION_CONFIG,
      message: { waveform: 'single', frequencyHz: 1000, amplitude: 1.0 },
      am: { ...DEFAULT_SIMULATION_CONFIG.am, modulationIndex: 0.8 },
      fm: { frequencyDeviationHz: 12000 },
      channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 48 },
    },
    { includeSpectra: false }
  );
  const wbfmSim = runSimulation(
    {
      ...DEFAULT_SIMULATION_CONFIG,
      message: { waveform: 'single', frequencyHz: 1000, amplitude: 1.0 },
      am: { ...DEFAULT_SIMULATION_CONFIG.am, modulationIndex: 0.9 },
      fm: { frequencyDeviationHz: 15000 },
      channel: { snr0Db: 24, noiseSeed: 4219 },
    },
    { includeSpectra: false }
  );
  const amCleanStat = independentSnrAndNrmse(cleanSim.message, cleanSim.am.recovered);
  const fmCleanStat = independentSnrAndNrmse(cleanSim.message, cleanSim.fm.recovered);
  const fmNoiselessStat = independentSnrAndNrmse(cleanSim.message, cleanSim.fm.recoveredNoiseless);
  const amWbStat = independentSnrAndNrmse(wbfmSim.message, wbfmSim.am.recovered);
  const fmWbStat = independentSnrAndNrmse(wbfmSim.message, wbfmSim.fm.recovered);
  const fmAdvantageDb = fmWbStat.snrDb - amWbStat.snrDb;

  checks.push({
    id: 'end-to-end-gain',
    title: 'Independent Recovery Fidelity & Wideband FM Gain',
    category: 'Channel Performance',
    expected: 'Clean NRMSE < 2.0% (FM noiseless < 0.25%); ΔSNR(FM−AM) > 10 dB at γ=24 dB',
    measured: `Clean NRMSE (AM=${amCleanStat.nrmsePercent.toFixed(2)}%, FM=${fmCleanStat.nrmsePercent.toFixed(2)}%, FM clean=${fmNoiselessStat.nrmsePercent.toFixed(2)}%) | ΔSNR = +${fmAdvantageDb.toFixed(1)} dB`,
    passed:
      amCleanStat.nrmsePercent < 2.0 &&
      fmCleanStat.nrmsePercent < 2.0 &&
      fmNoiselessStat.nrmsePercent < 0.25 &&
      fmAdvantageDb > 10.0,
    detail:
      'Independently projects recovered waveforms onto reference m(t) (decoupled from metrics.ts) to confirm zero timing lag and >10 dB FM noise gain.',
  });

  // 9. Multitone Frequency Continuity & Monotonicity Verification
  const grid = [250, 1000, 2000, 2250, 2273, 2300, 3000, 4000, 5000];
  let ordered = true;
  let monotonic = true;
  let prev = [0, 0, 0];
  let maxJump = 0;
  for (const f0 of grid) {
    const tones = getMultitoneFrequencies(f0);
    if (!(tones[0] < tones[1] && tones[1] < tones[2] && tones[2] === f0)) ordered = false;
    if (tones[0] < prev[0] || tones[1] < prev[1] || tones[2] < prev[2]) monotonic = false;
    maxJump = Math.max(maxJump, Math.abs(tones[2] - prev[2]));
    prev = tones;
  }
  const t2250 = getMultitoneFrequencies(2250);
  const t2300 = getMultitoneFrequencies(2300);
  checks.push({
    id: 'multitone-continuity',
    title: 'Multitone Frequency Continuity & Monotonicity (250–5000 Hz)',
    category: 'Message Generator',
    expected: 'Strictly monotonic f₁ < f₂ < f₃ = f₀ with no discontinuity across 2250–2300 Hz',
    measured: `2250 Hz→[${t2250.join(',')}] | 2300 Hz→[${t2300.join(',')}] | Ordered=${ordered}, Monotonic=${monotonic}`,
    passed: ordered && monotonic && t2300[2] - t2250[2] === 50,
    detail:
      'Tests 9 anchor points from 250 Hz to 5000 Hz including 2250/2273/2300 Hz to verify smooth continuous bandwidth expansion without collisions.',
  });

  // 10. Experiment Snapshot Immutability & Deterministic Replay Verification
  const testCfg: SimulationConfig = {
    message: { waveform: 'multitone', frequencyHz: 3000, amplitude: 0.9 },
    am: { modulationIndex: 1.25, envelopeDecayFactor: 1.3 },
    fm: { frequencyDeviationHz: 18000 },
    channel: { snr0Db: 18, noiseSeed: 7331 },
    receiver: {
      carrierFreqHz: 42000,
      amIfBandwidthHz: 9660,
      fmIfBandwidthHz: 46000,
      autoIfBandwidth: true,
      lpfCutoffHz: 4600,
    },
  };
  const rec = runExperimentPreset(EXPERIMENT_PRESETS[1], testCfg);
  // Mutate original object afterward to verify snapshot isolation
  testCfg.message.frequencyHz = 500;
  testCfg.channel.noiseSeed = 9999;
  const replayed = replayExperimentRecord(rec);
  const replayErr = Math.max(
    Math.abs(replayed.am.metrics.outputSnrDb - rec.amOutputSnrDb),
    Math.abs(replayed.fm.metrics.outputSnrDb - rec.fmOutputSnrDb),
    Math.abs(replayed.am.metrics.inputCnrDb - rec.amInputCnrDb),
    Math.abs(replayed.fm.metrics.measuredBandwidthHz - rec.fmMeasuredBwHz)
  );
  checks.push({
    id: 'experiment-reproducibility',
    title: 'Experiment Config Snapshot Immutability & Exact Replay',
    category: 'Reproducibility',
    expected: 'Replay matches stored record exactly (max error < 1e-12) after mutating external config',
    measured: `Max replay error = ${replayErr.toExponential(2)} (seed=${rec.noiseSeed}, f_c_eff=${(rec.effectiveCarrierFreqHz / 1000).toFixed(0)} kHz)`,
    passed: replayErr < 1e-12 && rec.messageFreqHz === 3000 && rec.noiseSeed === 7331,
    detail:
      'Captures a multitone preset record, mutates source config, replays via stored configSnapshot, and verifies bit-exact reproducibility.',
  });

  return checks;
}

/**
 * Evaluates independent invariants against the user's CURRENT active simulator configuration.
 */
export function runLiveConfigVerification(activeConfig: SimulationConfig): VerificationCheck[] {
  const sim = runSimulation(activeConfig, { includeSpectra: false });
  const fs = sim.sampleRateHz;
  const fc = sim.spectralGuard.effectiveCarrierFreqHz;

  const pAm = rawMeanSquarePower(sim.am.tx);
  const pFm = rawMeanSquarePower(sim.fm.tx);
  const pErr = Math.abs(pAm - pFm);

  const lpfGainDb = sim.fm.metrics.lpfGainAtMaxFreqDb;
  const fmCleanStat = independentSnrAndNrmse(sim.message, sim.fm.recoveredNoiseless);
  const fmNoisyStat = independentSnrAndNrmse(sim.message, sim.fm.recovered);
  const amNoisyStat = independentSnrAndNrmse(sim.message, sim.am.recovered);
  const obwAm = independentOccupiedBandwidthHz(sim.am.tx, fs, fc);
  const obwFm = independentOccupiedBandwidthHz(
    sim.fm.tx,
    fs,
    fc,
    Math.min(fc - 500, Math.max(90000, sim.fm.metrics.ifBandwidthUsedHz * 0.9))
  );

  return [
    {
      id: 'live-power-parity',
      title: 'Live Active Config: Equal Tx Power Parity',
      category: 'Live Config',
      expected: '|P_AM - P_FM| < 1e-6 W (both ≈ 0.5000 W)',
      measured: `AM=${pAm.toFixed(6)} W, FM=${pFm.toFixed(6)} W (Δ=${pErr.toExponential(1)} W)`,
      passed: pErr < 1e-6,
      detail: 'Direct sample-square average of current AM and FM transmitted RF waveforms.',
    },
    {
      id: 'live-lpf-headroom',
      title: 'Live Active Config: Baseband LPF Passband Fidelity at f_max',
      category: 'Live Config',
      expected: 'LPF droop ≥ −0.5 dB at f_max (unless manually narrowed below f_max)',
      measured: `f_max=${Math.round(sim.messageMaxFreqHz)} Hz, W_LPF=${sim.fm.metrics.lpfCutoffUsedHz} Hz, Gain=${lpfGainDb.toFixed(3)} dB`,
      passed: !activeConfig.receiver.autoIfBandwidth || lpfGainDb >= -0.5,
      detail: 'Checks Butterworth magnitude response at the highest active component of m(t).',
    },
    {
      id: 'live-spectral-guard',
      title: 'Live Active Config: Spectral Guard & Nyquist Clearance',
      category: 'Live Config',
      expected: '0 Hz < Lower IF edge & Upper IF edge < Nyquist (256 kHz)',
      measured: `f_c_eff=${(fc / 1000).toFixed(0)} kHz, IF=[${(sim.spectralGuard.lowerSidebandEdgeHz / 1000).toFixed(1)}, ${(sim.spectralGuard.upperSidebandEdgeHz / 1000).toFixed(1)}] kHz`,
      passed:
        sim.spectralGuard.lowerSidebandEdgeHz > 0 &&
        sim.spectralGuard.upperSidebandEdgeHz < sim.spectralGuard.nyquistFreqHz,
      detail: 'Confirms zero baseband foldover and zero Nyquist aliasing for live carrier/deviation settings.',
    },
    {
      id: 'live-independent-snr',
      title: 'Live Active Config: Independent SNR & Clean NRMSE Cross-Check',
      category: 'Live Config',
      expected: 'Independent time-domain SNR matches simulator metrics within 0.05 dB',
      measured: `AM=${amNoisyStat.snrDb.toFixed(2)} vs ${sim.am.metrics.outputSnrDb.toFixed(2)} dB | FM=${fmNoisyStat.snrDb.toFixed(2)} vs ${sim.fm.metrics.outputSnrDb.toFixed(2)} dB (FM clean NRMSE=${fmCleanStat.nrmsePercent.toFixed(3)}%)`,
      passed:
        Math.abs(amNoisyStat.snrDb - sim.am.metrics.outputSnrDb) < 0.05 &&
        Math.abs(fmNoisyStat.snrDb - sim.fm.metrics.outputSnrDb) < 0.05,
      detail: `Independent OBW cross-check: AM=${Math.round(obwAm)} Hz, FM=${Math.round(obwFm)} Hz.`,
    },
  ];
}
