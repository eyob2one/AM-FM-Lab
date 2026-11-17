import test from 'node:test';
import assert from 'node:assert/strict';
import { computePowerSpectrum, forwardFFT } from './fft';
import {
  EXPERIMENT_PRESETS,
  replayExperimentRecord,
  runExperimentPreset,
  runNoiseSweepExperiment,
} from './experiments';
import { generateMessageSignal, getMultitoneFrequencies } from './signalGenerator';
import {
  DEFAULT_SIMULATION_CONFIG,
  runSimulation,
  validateSpectralConstraints,
} from './simulator';
import { SimulationConfig } from './types';
import { runEngineeringVerificationSuite, runLiveConfigVerification } from './verification';

test('signal generator supports 1 kHz, 3 kHz, 5 kHz, continuous monotonic multitone, and speech-like signals', () => {
  const fs = 512000;
  const n = 8192;

  for (const freq of [1000, 3000, 5000]) {
    const res = generateMessageSignal({ waveform: 'single', frequencyHz: freq, amplitude: 1.0 }, fs, n);
    assert.equal(res.maxFreqHz, freq);
    assert.ok(Math.abs(res.rms - Math.SQRT1_2) < 1e-3, `RMS at ${freq} Hz should be 1/sqrt(2)`);
  }

  // Verify multitone produces 3 strictly distinct continuous monotonic tones across 250..5000 Hz
  const multitoneGrid = [250, 1000, 2000, 2250, 2273, 2300, 3000, 4000, 5000];
  let prevF1 = 0;
  let prevF2 = 0;
  let prevF3 = 0;
  for (const freq of multitoneGrid) {
    const [f1, f2, f3] = getMultitoneFrequencies(freq);
    assert.ok(f1 < f2 && f2 < f3, `Tones at ${freq} Hz must be strictly distinct: ${f1}, ${f2}, ${f3}`);
    assert.equal(f3, freq, `Highest tone f3 at ${freq} Hz must equal slider f_max`);
    assert.ok(f2 - f1 >= 70 && f3 - f2 >= 70, `Tone separation too small at ${freq} Hz: [${f1}, ${f2}, ${f3}]`);
    assert.ok(f3 <= 5000, `Top tone ${f3} Hz exceeds 5000 Hz`);
    assert.ok(
      f1 > prevF1 && f2 > prevF2 && f3 > prevF3,
      `Multitone frequencies must increase monotonically at ${freq} Hz`
    );
    prevF1 = f1;
    prevF2 = f2;
    prevF3 = f3;

    const msg = generateMessageSignal({ waveform: 'multitone', frequencyHz: freq, amplitude: 1.0 }, fs, n);
    assert.equal(msg.maxFreqHz, f3);
    assert.deepEqual(msg.frequenciesHz, [f1, f2, f3]);

    // Independently check FFT spectrum has energy peaks near all 3 distinct frequencies
    const psd = computePowerSpectrum(msg.signal, true);
    const df = fs / n;
    for (const fTone of [f1, f2, f3]) {
      const kCenter = Math.round(fTone / df);
      let bandPow = 0;
      for (let k = Math.max(1, kCenter - 2); k <= kCenter + 2; k++) {
        bandPow += psd[k];
      }
      assert.ok(bandPow > 0.005, `Expected distinct spectral energy at ${fTone} Hz for base ${freq} Hz`);
    }
  }

  for (const waveform of ['single', 'multitone', 'speech'] as const) {
    const res = generateMessageSignal({ waveform, frequencyHz: 1500, amplitude: 0.8 }, fs, n);
    assert.equal(res.signal.length, n);
    let maxAbs = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(res.signal[i]);
      if (a > maxAbs) maxAbs = a;
    }
    assert.ok(Math.abs(maxAbs - 0.8) < 1e-6, `${waveform} peak should equal amplitude 0.8`);
    assert.ok(res.maxFreqHz <= 5000, `${waveform} maxFreqHz=${res.maxFreqHz} should be <= 5000`);
  }
});

test('Multitone continuity & occupied bandwidth monotonicity across 2250–2300 Hz boundary and 250–5000 Hz', () => {
  const freqs = [250, 1000, 2000, 2250, 2273, 2300, 3000, 4000, 5000];
  let prevObw = 0;
  let obw2250 = 0;
  let obw2300 = 0;

  for (const f0 of freqs) {
    const sim = runSimulation(
      {
        ...DEFAULT_SIMULATION_CONFIG,
        message: { waveform: 'multitone', frequencyHz: f0, amplitude: 1.0 },
        channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 40 },
      },
      { includeSpectra: false }
    );
    const obw = sim.am.metrics.measuredBandwidthHz;
    assert.ok(obw >= prevObw, `AM OBW must be monotonic: ${obw} < ${prevObw} at f0=${f0}`);
    prevObw = obw;
    if (f0 === 2250) obw2250 = obw;
    if (f0 === 2300) obw2300 = obw;
  }

  assert.ok(
    obw2300 - obw2250 <= 300,
    `No abrupt OBW jump across 2250->2300 Hz (got ${obw2250} -> ${obw2300} Hz)`
  );
});

test('4-5 kHz LPF headroom keeps passband droop <= 0.15 dB and clean multitone 5 kHz FM NRMSE < 0.6%', () => {
  for (const wf of ['single', 'multitone'] as const) {
    for (const freq of [3000, 4000, 5000]) {
      const sim = runSimulation(
        {
          ...DEFAULT_SIMULATION_CONFIG,
          message: { waveform: wf, frequencyHz: freq, amplitude: 1.0 },
          channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 45 },
        },
        { includeSpectra: false }
      );
      assert.ok(
        sim.fm.metrics.lpfGainAtMaxFreqDb > -0.15,
        `${wf} ${freq} Hz auto LPF gain at f_max should be > -0.15 dB (got ${sim.fm.metrics.lpfGainAtMaxFreqDb.toFixed(3)} dB)`
      );
      assert.ok(
        sim.fm.metrics.noiselessNrmsePercent < 0.6,
        `${wf} ${freq} Hz clean FM NRMSE should be < 0.6% (got ${sim.fm.metrics.noiselessNrmsePercent.toFixed(3)}%)`
      );
    }
  }
});

test('FM discriminator half-sample delay fix eliminates frequency-dependent recovery error at 1, 3, and 5 kHz', () => {
  const results = [1000, 3000, 5000].map((freq) =>
    runSimulation(
      {
        ...DEFAULT_SIMULATION_CONFIG,
        message: { waveform: 'single', frequencyHz: freq, amplitude: 1.0 },
        fm: { frequencyDeviationHz: 15000 },
        channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 45 },
      },
      { includeSpectra: false }
    )
  );

  for (const res of results) {
    const f = res.messageMaxFreqHz;
    const nrmseBound = f >= 3000 ? 0.15 : 0.3;
    assert.ok(
      res.fm.metrics.noiselessNrmsePercent < nrmseBound,
      `Clean FM noiseless NRMSE at ${f} Hz should be < ${nrmseBound}% (got ${res.fm.metrics.noiselessNrmsePercent.toFixed(4)}%)`
    );
    assert.ok(
      res.fm.metrics.thdPercent !== null && res.fm.metrics.thdPercent < 0.3,
      `Clean FM harmonic THD at ${f} Hz should be < 0.3% (got ${res.fm.metrics.thdPercent}%)`
    );
    const start = Math.floor(res.sampleCount * 0.1);
    const end = Math.floor(res.sampleCount * 0.9);
    let dotCos = 0;
    let dotSin = 0;
    for (let i = start; i < end; i++) {
      const t = res.timeSec[i];
      const y = res.fm.recoveredNoiseless[i];
      dotCos += y * Math.cos(2 * Math.PI * f * t);
      dotSin += y * Math.sin(2 * Math.PI * f * t);
    }
    const phaseRad = Math.atan2(dotSin, dotCos);
    const phaseErrDeg = (phaseRad * 180) / Math.PI;
    const delaySamples = (phaseRad / (2 * Math.PI * f)) * res.sampleRateHz;
    assert.ok(
      Math.abs(phaseErrDeg) < 0.05 && Math.abs(delaySamples) < 0.05,
      `FM phase/timing offset at ${f} Hz should be < 0.05 deg / 0.05 samples (got ${phaseErrDeg.toFixed(4)} deg, ${delaySamples.toFixed(4)} samples)`
    );
  }
});

test('AM overmodulation Pre-LPF vs Post-LPF THD matrix across mu={0.7, 1.0, 1.2, 1.45} and f_m={1, 3, 5 kHz}', () => {
  for (const freq of [1000, 3000, 5000]) {
    const res = new Map<number, ReturnType<typeof runSimulation>>();
    for (const mu of [0.7, 1.0, 1.2, 1.45]) {
      res.set(
        mu,
        runSimulation(
          {
            ...DEFAULT_SIMULATION_CONFIG,
            message: { waveform: 'single', frequencyHz: freq, amplitude: 1.0 },
            am: { ...DEFAULT_SIMULATION_CONFIG.am, modulationIndex: mu },
            channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 40 },
          },
          { includeSpectra: false }
        )
      );
    }

    const r07 = res.get(0.7)!;
    const r10 = res.get(1.0)!;
    const r12 = res.get(1.2)!;
    const r145 = res.get(1.45)!;

    assert.equal(r07.am.isOvermodulated, false);
    assert.equal(r10.am.isOvermodulated, false);
    assert.equal(r12.am.isOvermodulated, true);
    assert.equal(r145.am.isOvermodulated, true);

    assert.ok((r07.am.metrics.preLpfEnvelopeThdPercent ?? 99) < 2.0, `Pre-LPF THD at mu=0.7, ${freq}Hz`);
    assert.ok((r10.am.metrics.preLpfEnvelopeThdPercent ?? 99) < 2.0, `Pre-LPF THD at mu=1.0, ${freq}Hz`);
    assert.ok(
      (r12.am.metrics.preLpfEnvelopeThdPercent ?? 0) > 10.0,
      `Pre-LPF THD at mu=1.2, ${freq}Hz should exceed 10% (got ${r12.am.metrics.preLpfEnvelopeThdPercent})`
    );
    assert.ok(
      (r145.am.metrics.preLpfEnvelopeThdPercent ?? 0) > 20.0,
      `Pre-LPF THD at mu=1.45, ${freq}Hz should exceed 20% (got ${r145.am.metrics.preLpfEnvelopeThdPercent})`
    );
    assert.ok(
      (r145.am.metrics.thdPercent ?? 0) > (r07.am.metrics.thdPercent ?? 0) + 1.0,
      `Post-LPF THD at mu=1.45, ${freq}Hz must exceed linear baseline`
    );
  }
});

test('Distortion metrics cleanly separate true FFT harmonic THD from NRMSE and waveform applicability', () => {
  const linear1k = runSimulation(
    {
      ...DEFAULT_SIMULATION_CONFIG,
      message: { waveform: 'single', frequencyHz: 1000, amplitude: 1.0 },
      am: { ...DEFAULT_SIMULATION_CONFIG.am, modulationIndex: 0.75 },
      channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 42 },
    },
    { includeSpectra: false }
  );
  const linear5k = runSimulation(
    {
      ...DEFAULT_SIMULATION_CONFIG,
      message: { waveform: 'single', frequencyHz: 5000, amplitude: 1.0 },
      am: { ...DEFAULT_SIMULATION_CONFIG.am, modulationIndex: 0.75 },
      channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 42 },
    },
    { includeSpectra: false }
  );
  const over1k = runSimulation(
    {
      ...DEFAULT_SIMULATION_CONFIG,
      message: { waveform: 'single', frequencyHz: 1000, amplitude: 1.0 },
      am: { ...DEFAULT_SIMULATION_CONFIG.am, modulationIndex: 1.4 },
      channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 42 },
    },
    { includeSpectra: false }
  );

  assert.equal(linear1k.am.metrics.thdApplicable, true);
  assert.equal(over1k.am.isOvermodulated, true);
  assert.ok((linear1k.am.metrics.thdPercent ?? 99) < 0.8);
  assert.ok((linear5k.am.metrics.thdPercent ?? 99) < 0.8);
  assert.ok(linear5k.am.metrics.noiselessNrmsePercent > (linear5k.am.metrics.thdPercent ?? 0));
  assert.ok((over1k.am.metrics.thdPercent ?? 0) > 15.0);

  for (const wf of ['multitone', 'speech'] as const) {
    const sim = runSimulation(
      {
        ...DEFAULT_SIMULATION_CONFIG,
        message: { waveform: wf, frequencyHz: 2000, amplitude: 1.0 },
      },
      { includeSpectra: false }
    );
    assert.equal(sim.am.metrics.thdApplicable, false);
    assert.equal(sim.am.metrics.thdPercent, null);
    assert.equal(sim.fm.metrics.thdApplicable, false);
    assert.equal(sim.fm.metrics.thdPercent, null);
    assert.ok(Number.isFinite(sim.am.metrics.noiselessNrmsePercent));
    assert.ok(Number.isFinite(sim.fm.metrics.noiselessNrmsePercent));
  }
});

test('FM spectral foldover guard prevents DC/Nyquist aliasing with explicit constraint notice', () => {
  const unsafeConfig = {
    ...DEFAULT_SIMULATION_CONFIG,
    message: { waveform: 'single' as const, frequencyHz: 5000, amplitude: 1.0 },
    fm: { frequencyDeviationHz: 25000 },
    channel: { ...DEFAULT_SIMULATION_CONFIG.channel, snr0Db: 30 },
    receiver: {
      ...DEFAULT_SIMULATION_CONFIG.receiver,
      carrierFreqHz: 35000,
    },
  };

  const guard = validateSpectralConstraints(unsafeConfig, 5000);
  assert.equal(guard.adjusted, true);
  assert.ok(guard.effectiveCarrierFreqHz > unsafeConfig.receiver.carrierFreqHz);
  assert.ok(guard.lowerSidebandEdgeHz > 0);
  assert.ok(guard.upperSidebandEdgeHz < guard.nyquistFreqHz);
  assert.ok(guard.reason && guard.reason.includes('0 Hz'));

  const sim = runSimulation(unsafeConfig, { includeSpectra: false });
  assert.equal(sim.spectralGuard.adjusted, true);
  assert.ok(Math.abs(sim.fm.metrics.carrierAmplitude - 1.0) < 1e-3, 'No DC foldover amplitude drop');
  assert.ok(sim.fm.metrics.outputSnrDb > 30, `FM output SNR should remain high without DC foldover (got ${sim.fm.metrics.outputSnrDb})`);
});

test('Parseval theorem holds independently via raw DFT and computePowerSpectrum', () => {
  const sim = runSimulation(DEFAULT_SIMULATION_CONFIG, { includeSpectra: false });
  let timePower = 0;
  for (let i = 0; i < sim.fm.tx.length; i++) timePower += sim.fm.tx[i] * sim.fm.tx[i];
  timePower /= sim.fm.tx.length;

  const { re, im } = forwardFFT(sim.fm.tx);
  let dftPower = 0;
  for (let k = 0; k < re.length; k++) dftPower += re[k] * re[k] + im[k] * im[k];
  dftPower /= re.length * re.length;

  const psd = computePowerSpectrum(sim.fm.tx, false);
  let psdSum = 0;
  for (let i = 0; i < psd.length; i++) psdSum += psd[i];

  assert.ok(Math.abs(dftPower - timePower) / timePower < 1e-9);
  assert.ok(Math.abs(psdSum - timePower) / timePower < 1e-9);
});

test('Independent Hand Calculation 1: AM DSB-LC (fm=1kHz, mu=0.8, Ptx=0.5W, gamma=24dB)', () => {
  const sim = runSimulation(DEFAULT_SIMULATION_CONFIG, { includeSpectra: false });
  const expectedAc = Math.sqrt(1 / 1.32);
  const expectedTheorySnrDb = 10 * Math.log10((0.32 / 1.32) * Math.pow(10, 2.4));

  assert.ok(Math.abs(sim.am.metrics.carrierAmplitude - expectedAc) < 1e-4);
  assert.ok(Math.abs(sim.am.metrics.txPower - 0.5) < 1e-6);
  assert.equal(sim.am.metrics.theoreticalBandwidthHz, 2000);
  assert.ok(Math.abs(sim.am.metrics.theoreticalOutputSnrDb - expectedTheorySnrDb) < 0.02);
  assert.ok(Math.abs(sim.am.metrics.outputSnrDb - expectedTheorySnrDb) < 1.0);
});

test('Independent Hand Calculation 2: Wideband FM (fm=1kHz, df=15kHz, W=4.6kHz, gamma=24dB)', () => {
  const sim = runSimulation(DEFAULT_SIMULATION_CONFIG, { includeSpectra: false });
  const expectedTheorySnrDb =
    10 * Math.log10(3 * Math.pow(15000 / 4600, 2) * 0.5 * Math.pow(10, 2.4));

  assert.ok(Math.abs(sim.fm.metrics.modulationIndex - 15.0) < 1e-4);
  assert.equal(sim.fm.metrics.theoreticalBandwidthHz, 32000);
  assert.ok(Math.abs(sim.fm.metrics.carrierAmplitude - 1.0) < 1e-4);
  assert.ok(Math.abs(sim.fm.metrics.theoreticalOutputSnrDb - expectedTheorySnrDb) < 0.02);
  assert.ok(Math.abs(sim.fm.metrics.outputSnrDb - expectedTheorySnrDb) < 1.5);
});

test('Experiment records retain immutable full config snapshots and replay with < 1e-12 numerical difference', () => {
  const mutableCfg: SimulationConfig = {
    message: { waveform: 'multitone', frequencyHz: 3000, amplitude: 0.85 },
    am: { modulationIndex: 1.3, envelopeDecayFactor: 1.25 },
    fm: { frequencyDeviationHz: 19000 },
    channel: { snr0Db: 20, noiseSeed: 8191 },
    receiver: {
      carrierFreqHz: 28000,
      amIfBandwidthHz: 9660,
      fmIfBandwidthHz: 44000,
      autoIfBandwidth: true,
      lpfCutoffHz: 4600,
    },
  };

  const rec = runExperimentPreset(EXPERIMENT_PRESETS[1], mutableCfg);
  // Mutate source config completely afterward
  mutableCfg.message.waveform = 'speech';
  mutableCfg.message.frequencyHz = 500;
  mutableCfg.am.modulationIndex = 0.2;
  mutableCfg.channel.noiseSeed = 1111;
  mutableCfg.receiver.carrierFreqHz = 80000;

  // Stored provenance remains invariant
  assert.equal(rec.configSnapshot.message.waveform, 'multitone');
  assert.equal(rec.configSnapshot.message.frequencyHz, 3000);
  assert.equal(rec.noiseSeed, 8191);
  assert.deepEqual(rec.messageFrequenciesHz, [1200, 2100, 3000]);
  assert.equal(rec.spectralGuardAdjusted, true);
  assert.ok(rec.sampleRateHz === 512000 && rec.sampleCount === 8192);
  assert.ok(rec.amPreLpfEnvelopeNrmsePercent > 0);

  const replayed = replayExperimentRecord(rec);
  assert.ok(Math.abs(replayed.am.metrics.outputSnrDb - rec.amOutputSnrDb) < 1e-12);
  assert.ok(Math.abs(replayed.fm.metrics.outputSnrDb - rec.fmOutputSnrDb) < 1e-12);
  assert.ok(Math.abs(replayed.am.metrics.inputCnrDb - rec.amInputCnrDb) < 1e-12);
  assert.ok(Math.abs(replayed.fm.metrics.measuredBandwidthHz - rec.fmMeasuredBwHz) < 1e-12);
});

test('Monte Carlo 5-seed noise sweep removes arbitrary CNR ceiling and tracks threshold & crossover reliably', () => {
  for (const freq of [1000, 3000, 5000]) {
    const cfg = {
      ...DEFAULT_SIMULATION_CONFIG,
      message: { waveform: 'single' as const, frequencyHz: freq, amplitude: 1.0 },
    };
    const [clean, moderate, weak] = EXPERIMENT_PRESETS.map((p) => runExperimentPreset(p, cfg));
    assert.ok(clean.fmOutputSnrDb > clean.amOutputSnrDb + 8);
    assert.ok(moderate.fmOutputSnrDb > moderate.amOutputSnrDb + 5);
    assert.ok(weak.fmOutputSnrDb < clean.fmOutputSnrDb - 20);
    assert.ok(clean.amThdPercent !== null && clean.fmThdPercent !== null);
  }

  const sweepA = runNoiseSweepExperiment(DEFAULT_SIMULATION_CONFIG, 0, 34, 2, 5);
  const sweepB = runNoiseSweepExperiment(DEFAULT_SIMULATION_CONFIG, 0, 34, 2, 5);
  assert.equal(sweepA.realizationsPerPoint, 5);
  assert.equal(sweepA.seedsUsed.length, 5);
  assert.equal(sweepA.thresholdGammaDb, sweepB.thresholdGammaDb);
  assert.equal(sweepA.crossoverGammaDb, sweepB.crossoverGammaDb);
  assert.ok(sweepA.thresholdGammaDb !== null && sweepA.thresholdGammaDb <= 20);
  assert.ok(sweepA.thresholdCnrDb !== null);
  assert.ok(sweepA.sharpDropFromGammaDb !== null && sweepA.sharpDropToGammaDb !== null);
  assert.ok((sweepA.sharpDropDeltaSnrDb ?? 0) > 6.0);
  assert.ok(sweepA.points[sweepA.points.length - 1].fmOutputSnrDb > sweepA.points[sweepA.points.length - 1].amOutputSnrDb + 10);
  assert.ok(sweepA.points[0].belowFmThreshold);
  // Zero false positive threshold triggers at high SNR (gamma >= 24 dB)
  for (const pt of sweepA.points) {
    if (pt.snr0Db >= 24) {
      assert.equal(pt.belowFmThreshold, false, `Unexpected false threshold trigger at gamma=${pt.snr0Db} dB`);
    }
  }

  // Test across different deviations & multitone/speech regimes without high-SNR false triggers
  for (const testCfg of [
    { ...DEFAULT_SIMULATION_CONFIG, fm: { frequencyDeviationHz: 25000 } },
    { ...DEFAULT_SIMULATION_CONFIG, message: { waveform: 'multitone' as const, frequencyHz: 5000, amplitude: 1.0 } },
    { ...DEFAULT_SIMULATION_CONFIG, message: { waveform: 'speech' as const, frequencyHz: 5000, amplitude: 1.0 } },
  ]) {
    const sw = runNoiseSweepExperiment(testCfg, 0, 34, 2, 5);
    assert.ok(sw.thresholdGammaDb !== null);
    assert.ok(
      sw.points.filter((p) => p.snr0Db >= 28 && p.belowFmThreshold).length === 0,
      `No false high-SNR threshold triggers for ${testCfg.message.waveform} df=${testCfg.fm.frequencyDeviationHz}`
    );
  }
});

test('All 10 independent benchmark verification checks and live config checks pass', () => {
  const checks = runEngineeringVerificationSuite(DEFAULT_SIMULATION_CONFIG);
  assert.equal(checks.length, 10);
  for (const c of checks) {
    assert.ok(c.passed, `Verification check failed [${c.id}]: ${c.measured}`);
  }

  for (const cfg of [
    DEFAULT_SIMULATION_CONFIG,
    {
      ...DEFAULT_SIMULATION_CONFIG,
      message: { waveform: 'multitone' as const, frequencyHz: 5000, amplitude: 1.0 },
      fm: { frequencyDeviationHz: 25000 },
      receiver: { ...DEFAULT_SIMULATION_CONFIG.receiver, carrierFreqHz: 35000 },
    },
  ]) {
    const live = runLiveConfigVerification(cfg);
    assert.equal(live.length, 4);
    for (const c of live) {
      assert.ok(c.passed, `Live check failed [${c.id}]: ${c.measured}`);
    }
  }
});
