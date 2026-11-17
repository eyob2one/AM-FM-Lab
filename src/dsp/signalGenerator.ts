import { MessageConfig } from './types';

export interface GeneratedMessage {
  timeSec: Float64Array;
  signal: Float64Array; // Scaled by config.amplitude
  normalized: Float64Array; // Unit-peak normalized m_n(t) in [-1, 1]
  frequenciesHz: number[]; // Active discrete component frequencies (Hz)
  maxFreqHz: number;
  rms: number;
  normalizedRmsSq: number; // Mean square of m_n(t)
}

/**
 * Continuous, strictly monotonic three-tone mapping across the full 100–5000 Hz range.
 * Treats the selected frequency f0 as the upper/maximum active tone (f_max = f0) and scales
 * the lower two components proportionally as [0.40 * f0, 0.70 * f0, f0].
 * At f0 = 250 Hz -> [100, 175, 250] Hz (75 Hz spacing > 62.5 Hz DFT bin resolution).
 * At f0 = 5000 Hz -> [2000, 3500, 5000] Hz. Zero discontinuities or collisions anywhere.
 */
export function getMultitoneFrequencies(frequencyHz: number): [number, number, number] {
  const f0 = Math.max(100, Math.min(5000, frequencyHz));
  const f1 = Math.round(f0 * 0.4);
  const f2 = Math.round(f0 * 0.7);
  const f3 = Math.round(f0);
  return [f1, f2, f3];
}

/**
 * Generates the common baseband message signal m(t) shared identically by AM and FM.
 * Supports single-frequency sinusoidal, multi-tone, and speech-like harmonic formant signals.
 */
export function generateMessageSignal(
  config: MessageConfig,
  sampleRateHz: number,
  sampleCount: number
): GeneratedMessage {
  const timeSec = new Float64Array(sampleCount);
  const raw = new Float64Array(sampleCount);

  const f0 = Math.max(100, Math.min(5000, config.frequencyHz));
  let maxFreqHz = f0;
  let frequenciesHz: number[] = [Math.round(f0)];

  if (config.waveform === 'single') {
    maxFreqHz = f0;
    frequenciesHz = [Math.round(f0)];
    for (let n = 0; n < sampleCount; n++) {
      const t = n / sampleRateHz;
      timeSec[n] = t;
      raw[n] = Math.cos(2 * Math.PI * f0 * t);
    }
  } else if (config.waveform === 'multitone') {
    const [f1, f2, f3] = getMultitoneFrequencies(f0);
    maxFreqHz = f3;
    frequenciesHz = [f1, f2, f3];

    for (let n = 0; n < sampleCount; n++) {
      const t = n / sampleRateHz;
      timeSec[n] = t;
      raw[n] =
        0.55 * Math.cos(2 * Math.PI * f1 * t) +
        0.3 * Math.cos(2 * Math.PI * f2 * t + 0.52) +
        0.18 * Math.cos(2 * Math.PI * f3 * t - 0.85);
    }
  } else {
    // Speech-like synthetic signal: syllabic amplitude envelope + voiced harmonic formant bank
    // Fundamental pitch scaled reasonably around 140-400 Hz, formant harmonics bounded <= 5000 Hz
    const pitchHz = Math.max(140, Math.min(400, f0 * 0.18));
    const formantCenter = Math.max(600, Math.min(4200, f0));
    const syllabicHz = 95; // Fast enough to show distinct syllabic modulation within 16 ms window
    const numHarmonics = Math.min(12, Math.max(4, Math.floor(Math.min(5000, f0 * 1.25) / pitchHz)));

    const activeHarmonics: number[] = [];
    for (let h = 1; h <= numHarmonics; h++) {
      const fh = h * pitchHz;
      if (fh > 5000) break;
      activeHarmonics.push(Math.round(fh));
    }
    const highestHarmonic = activeHarmonics.length > 0 ? activeHarmonics[activeHarmonics.length - 1] : pitchHz;
    frequenciesHz = activeHarmonics;

    for (let n = 0; n < sampleCount; n++) {
      const t = n / sampleRateHz;
      timeSec[n] = t;

      // Smooth syllabic envelope in [0.25, 1.0]
      const env = 0.625 + 0.375 * Math.sin(2 * Math.PI * syllabicHz * t + 0.3);
      let sum = 0;
      for (let h = 1; h <= activeHarmonics.length; h++) {
        const fh = h * pitchHz;
        const detune = (fh - formantCenter) / Math.max(350, formantCenter * 0.4);
        const formantWeight = Math.exp(-0.5 * detune * detune) + 0.25 / h;
        sum += formantWeight * Math.sin(2 * Math.PI * fh * t + h * 0.45);
      }
      raw[n] = env * sum;
    }
    maxFreqHz = Math.max(f0, highestHarmonic);
  }

  // Remove any residual DC and normalize peak to 1.0 so modulation index mu has exact meaning
  let mean = 0;
  for (let n = 0; n < sampleCount; n++) mean += raw[n];
  mean /= sampleCount;

  let maxAbs = 0;
  for (let n = 0; n < sampleCount; n++) {
    raw[n] -= mean;
    const a = Math.abs(raw[n]);
    if (a > maxAbs) maxAbs = a;
  }

  const invPeak = maxAbs > 1e-12 ? 1 / maxAbs : 1;
  const amp = Math.max(0.1, Math.min(1.0, config.amplitude));

  const normalized = new Float64Array(sampleCount);
  const signal = new Float64Array(sampleCount);
  let sumSqSignal = 0;
  let sumSqNorm = 0;

  for (let n = 0; n < sampleCount; n++) {
    const mn = raw[n] * invPeak;
    normalized[n] = mn;
    const s = mn * amp;
    signal[n] = s;
    sumSqNorm += mn * mn;
    sumSqSignal += s * s;
  }

  return {
    timeSec,
    signal,
    normalized,
    frequenciesHz,
    maxFreqHz,
    rms: Math.sqrt(sumSqSignal / sampleCount),
    normalizedRmsSq: sumSqNorm / sampleCount,
  };
}
