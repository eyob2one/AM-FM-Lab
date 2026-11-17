export type WaveformType = 'single' | 'multitone' | 'speech';

export interface MessageConfig {
  waveform: WaveformType;
  frequencyHz: number; // Primary tone or base frequency (200 - 5000 Hz)
  amplitude: number; // Relative amplitude scaling (0.2 - 1.0)
}

export interface AMConfig {
  modulationIndex: number; // mu (0.1 - 1.6); > 1.0 causes overmodulation
  envelopeDecayFactor: number; // Controls leaky RC decay relative to f_max (0.5 - 3.0)
}

export interface FMConfig {
  frequencyDeviationHz: number; // delta_f (1000 - 25000 Hz)
}

export interface ChannelConfig {
  snr0Db: number; // Reference baseband SNR gamma = P_tx / (N0 * W_ref) in dB (0 - 45 dB)
  noiseSeed: number; // Deterministic PRNG seed for reproducible AWGN
}

export interface ReceiverConfig {
  carrierFreqHz: number; // Shared RF carrier f_c (35000 - 85000 Hz)
  amIfBandwidthHz: number; // AM IF bandpass width
  fmIfBandwidthHz: number; // FM IF bandpass width
  autoIfBandwidth: boolean; // Auto-set AM to 2.2*f_max and FM to Carson's rule
  lpfCutoffHz: number; // Post-detection baseband LPF cutoff W (Hz)
}

export interface SimulationConfig {
  message: MessageConfig;
  am: AMConfig;
  fm: FMConfig;
  channel: ChannelConfig;
  receiver: ReceiverConfig;
}

export interface ModulationMetrics {
  txPower: number; // Transmitted signal average power (normalized)
  carrierAmplitude: number; // Effective carrier amplitude A_c
  inputCnrDb: number; // Measured IF Carrier-to-Noise Ratio inside rx IF bandwidth
  theoreticalInputCnrDb: number; // Analytical P_tx / (N0 * B_IF)
  outputSnrDb: number; // Measured baseband output SNR after demod + LPF
  theoreticalOutputSnrDb: number; // Textbook theoretical output SNR (above threshold)
  processingGainDb: number; // Output SNR - Input CNR (or Output SNR - gamma)
  preLpfEnvelopeThdPercent: number | null; // Pre-LPF envelope detector harmonic distortion (%) for single-tone
  preLpfEnvelopeNrmsePercent: number; // Pre-LPF noiseless envelope NRMSE (%) isolating envelope folding before LPF
  thdPercent: number | null; // True post-LPF FFT Harmonic Distortion (%) for single-tone signals; null for multitone/speech
  thdApplicable: boolean; // True only for single-tone sinusoids where harmonic bins 2f_m.. are defined
  noiselessNrmsePercent: number; // Post-LPF noiseless waveform reconstruction error NRMSE (%)
  nrmsePercent: number; // Total post-LPF waveform Normalized RMSE (%) including channel noise & distortion
  theoreticalBandwidthHz: number; // AM: 2*f_max, FM: Carson 2*(delta_f + f_max)
  measuredBandwidthHz: number; // 99% Occupied Bandwidth from FFT PSD around f_c
  modulationIndex: number; // mu for AM, beta = delta_f / f_max for FM
  ifBandwidthUsedHz: number; // Effective IF bandwidth used in receiver
  lpfCutoffUsedHz: number; // Effective baseband audio LPF cutoff used in receiver
  lpfGainAtMaxFreqDb: number; // Baseband LPF magnitude response at message f_max (dB)
}

export interface SpectralGuardStatus {
  adjusted: boolean;
  requestedCarrierFreqHz: number;
  effectiveCarrierFreqHz: number;
  minSafeCarrierFreqHz: number;
  maxSafeCarrierFreqHz: number;
  requestedFmIfBandwidthHz: number;
  effectiveFmIfBandwidthHz: number;
  lowerSidebandEdgeHz: number;
  upperSidebandEdgeHz: number;
  nyquistFreqHz: number;
  reason: string | null;
}

export interface SpectrumData {
  freqsHz: Float64Array; // Frequency axis (Hz)
  amDb: Float64Array; // AM transmitted magnitude spectrum (dB relative to peak/ref)
  fmDb: Float64Array; // FM transmitted magnitude spectrum (dB)
  amRxDb: Float64Array; // AM received noisy IF spectrum (dB)
  fmRxDb: Float64Array; // FM received noisy IF spectrum (dB)
  messageDb: Float64Array; // Baseband message spectrum (dB)
  amRecoveredDb: Float64Array; // Recovered AM baseband spectrum (dB)
  fmRecoveredDb: Float64Array; // Recovered FM baseband spectrum (dB)
}

export interface SimulationResult {
  sampleRateHz: number;
  sampleCount: number;
  durationSec: number;
  timeSec: Float64Array;
  message: Float64Array; // Normalized/scaled message m(t)
  messageFrequenciesHz: number[]; // Active baseband frequency components (Hz)
  messageMaxFreqHz: number; // Highest active frequency component f_max
  messageRms: number;
  spectralGuard: SpectralGuardStatus;
  am: {
    tx: Float64Array;
    envelopeIdeal: Float64Array;
    envelopePreLpf: Float64Array;
    rxNoisy: Float64Array;
    rxFilteredIf: Float64Array;
    recovered: Float64Array;
    recoveredNoiseless: Float64Array;
    isOvermodulated: boolean;
    metrics: ModulationMetrics;
  };
  fm: {
    tx: Float64Array;
    phaseRad: Float64Array;
    instFreqTxHz: Float64Array;
    instFreqRxHz: Float64Array;
    rxNoisy: Float64Array;
    rxFilteredIf: Float64Array;
    recovered: Float64Array;
    recoveredNoiseless: Float64Array;
    metrics: ModulationMetrics;
  };
  channel: {
    noise: Float64Array;
    n0WattsPerHz: number;
    noiseSigma: number;
    gammaDb: number;
    powerParityError: number;
  };
  spectrum: SpectrumData;
}

export interface ExperimentPreset {
  id: 'clean' | 'moderate' | 'weak';
  name: string;
  subtitle: string;
  snr0Db: number;
  description: string;
  expectedBehavior: string;
}

export interface ExperimentRecord {
  id: string;
  presetId: ExperimentPreset['id'];
  presetName: string;
  timestamp: string;
  configSnapshot: SimulationConfig; // Immutable full SimulationConfig used to generate this run
  // Message provenance
  messageWaveform: WaveformType;
  messageFreqHz: number;
  messageAmplitude: number;
  messageFrequenciesHz: number[];
  messageMaxFreqHz: number;
  // Transmitter & carrier provenance
  requestedCarrierFreqHz: number;
  effectiveCarrierFreqHz: number;
  amRequestedMu: number;
  amMu: number;
  fmFrequencyDeviationHz: number;
  fmBeta: number;
  txPower: number;
  // Channel provenance
  snr0Db: number;
  noiseSeed: number;
  n0WattsPerHz: number;
  noiseSigma: number;
  // Receiver provenance
  autoIfBandwidth: boolean;
  amIfBandwidthHz: number;
  fmIfBandwidthHz: number;
  lpfCutoffHz: number;
  spectralGuardAdjusted: boolean;
  spectralGuardReason: string | null;
  // Simulation grid provenance
  sampleRateHz: number;
  sampleCount: number;
  durationSec: number;
  // Measured & theoretical outputs
  amInputCnrDb: number;
  fmInputCnrDb: number;
  amTheoreticalInputCnrDb: number;
  fmTheoreticalInputCnrDb: number;
  amOutputSnrDb: number;
  fmOutputSnrDb: number;
  amTheoreticalOutputSnrDb: number;
  fmTheoreticalOutputSnrDb: number;
  amPreLpfEnvelopeThdPercent: number | null;
  amPreLpfEnvelopeNrmsePercent: number;
  amThdPercent: number | null;
  fmThdPercent: number | null;
  amNoiselessNrmsePercent: number;
  fmNoiselessNrmsePercent: number;
  amNrmsePercent: number;
  fmNrmsePercent: number;
  amMeasuredBwHz: number;
  fmMeasuredBwHz: number;
  amTheoreticalBwHz: number;
  fmTheoreticalBwHz: number;
}

export interface NoiseSweepPoint {
  snr0Db: number;
  amInputCnrDb: number;
  amInputCnrStdDb: number;
  fmInputCnrDb: number;
  fmInputCnrStdDb: number;
  amOutputSnrDb: number;
  amOutputSnrStdDb: number;
  fmOutputSnrDb: number;
  fmOutputSnrStdDb: number;
  amTheorySnrDb: number;
  fmTheorySnrDb: number;
  fmCompositeTheorySnrDb: number; // Combined linear 3*(df/W)^2*Pm*gamma and noiseless floor
  amNrmsePercent: number;
  fmNrmsePercent: number;
  belowFmThreshold: boolean;
}

export interface NoiseSweepResult {
  configSnapshot: SimulationConfig;
  seedsUsed: number[];
  realizationsPerPoint: number;
  sampleRateHz: number;
  sampleCount: number;
  durationSec: number;
  messageWaveform: WaveformType;
  messageFrequenciesHz: number[];
  messageMaxFreqHz: number;
  effectiveCarrierFreqHz: number;
  amIfBandwidthHz: number;
  fmIfBandwidthHz: number;
  lpfCutoffHz: number;
  spectralGuardAdjusted: boolean;
  fmNoiselessFloorSnrDb: number;
  points: NoiseSweepPoint[];
  thresholdGammaDb: number | null; // Empirical gamma where mean FM drops >3 dB below composite theory
  thresholdCnrDb: number | null; // Corresponding mean FM IF CNR at threshold onset
  thresholdAmOutputSnrDb: number | null;
  thresholdAmOutputSnrStdDb: number | null;
  thresholdFmOutputSnrDb: number | null;
  thresholdFmOutputSnrStdDb: number | null;
  thresholdCriterion: string; // Explicit criterion explaining detection logic and parameter dependence
  sharpDropFromGammaDb: number | null; // Upper gamma of steepest FM collapse step
  sharpDropToGammaDb: number | null; // Lower gamma of steepest FM collapse step
  sharpDropDeltaSnrDb: number | null; // Magnitude of steepest mean FM output SNR drop across step
  sharpDropFmCnrDb: number | null;
  sharpDropFmOutputSnrDb: number | null;
  sharpDropAmOutputSnrDb: number | null;
  crossoverGammaDb: number | null; // Exact gamma (interpolated if between grid points) where mean FM drops below AM
  crossoverFmCnrDb: number | null;
  crossoverOutputSnrDb: number | null; // Equal AM/FM output SNR at crossover
  crossoverObserved: boolean;
  fmBeta: number;
  amMu: number;
}

export interface VerificationCheck {
  id: string;
  title: string;
  category: string;
  expected: string;
  measured: string;
  passed: boolean;
  detail: string;
}
