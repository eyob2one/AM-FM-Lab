import { ChevronDown, ChevronUp, Play, RotateCcw, Trash2 } from 'lucide-react';
import { Fragment, useState } from 'react';
import { EXPERIMENT_PRESETS } from '../dsp/experiments';
import { ExperimentPreset, ExperimentRecord, NoiseSweepResult, SimulationConfig } from '../dsp/types';
import { MathText, Sym } from './MathSymbol';
import { SweepCurveChart } from './charts/SweepCurveChart';

interface ExperimentsViewProps {
  config: SimulationConfig;
  records: ExperimentRecord[];
  sweepResult: NoiseSweepResult | null;
  isDark?: boolean;
  onRunPreset: (preset: ExperimentPreset) => void;
  onRunAllPresets: () => void;
  onClearRecords: () => void;
  onRunSweep: () => void;
  onApplyPresetToSimulator: (snr0Db: number) => void;
  onLoadExperimentConfig: (record: ExperimentRecord) => void;
}

export function ExperimentsView({
  config,
  records,
  sweepResult,
  isDark = false,
  onRunPreset,
  onRunAllPresets,
  onClearRecords,
  onRunSweep,
  onApplyPresetToSimulator,
  onLoadExperimentConfig,
}: ExperimentsViewProps) {
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Section 1: Three Predefined Channel Benchmarks */}
      <section className="space-y-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 flex flex-wrap items-center justify-between gap-4 transition-colors">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Controlled Channel Benchmark Experiments
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Execute AM and FM simultaneously under three canonical channel regimes using your current message ({config.message.frequencyHz} Hz, {config.message.waveform}),{' '}
              <Sym base="μ" italic={false} /> = {config.am.modulationIndex.toFixed(2)}, and{' '}
              <Sym base="Δf" italic={false} /> = {(config.fm.frequencyDeviationHz / 1000).toFixed(1)} kHz.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunAllPresets}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            Run All 3 Benchmarks
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {EXPERIMENT_PRESETS.map((preset, idx) => (
            <div
              key={preset.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-4 flex flex-col justify-between gap-4 transition-colors"
            >
              <div className="space-y-2">
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Experiment 0{idx + 1} · <Sym base="γ" italic={false} /> = {preset.snr0Db} dB
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {preset.name}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {preset.description}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2.5 leading-relaxed">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Expected Physics:</span>{' '}
                  {preset.expectedBehavior}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onRunPreset(preset)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-3 h-3" aria-hidden="true" />
                  Run &amp; Record
                </button>
                <button
                  type="button"
                  onClick={() => onApplyPresetToSimulator(preset.snr0Db)}
                  className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  Inspect Scope
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Recorded Experiment Results Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden transition-colors">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Recorded Experiment Log ({records.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Each row stores an immutable configuration snapshot and full receiver/channel provenance for exact replay
              </p>
            </div>
            {records.length > 0 && (
              <button
                type="button"
                onClick={onClearRecords}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-400 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                Clear Log
              </button>
            )}
          </div>

          {records.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No experiment runs recorded yet. Select any preset above or click &ldquo;Run All 3 Benchmarks&rdquo; to populate empirical measurements.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse" data-testid="experiment-log-table">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                    <th className="py-2.5 px-3 font-semibold">Experiment</th>
                    <th className="py-2.5 px-3 font-semibold">
                      <Sym base="γ" italic={false} /> (dB)
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      <Sym base="μ" italic={false} /> / <Sym base="β" italic={false} />
                    </th>
                    <th className="py-2.5 px-3 font-semibold">IF CNR (AM / FM)</th>
                    <th className="py-2.5 px-3 font-semibold text-blue-700 dark:text-blue-400">
                      AM Out SNR
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-amber-700 dark:text-amber-400">
                      FM Out SNR
                    </th>
                    <th className="py-2.5 px-3 font-semibold">THD (AM / FM)</th>
                    <th className="py-2.5 px-3 font-semibold">NRMSE (AM / FM)</th>
                    <th className="py-2.5 px-3 font-semibold">99% OBW (AM / FM)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Config</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  {records.map((rec) => {
                    const isExpanded = expandedRecordId === rec.id;
                    return (
                      <Fragment key={rec.id}>
                        <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-sans font-medium text-slate-900 dark:text-slate-100">
                            <div>{rec.presetName}</div>
                            <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                              {rec.messageWaveform} · {rec.messageFreqHz} Hz · seed {rec.noiseSeed} · {rec.timestamp}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">{rec.snr0Db.toFixed(0)} dB</td>
                          <td className="py-2.5 px-3">
                            {rec.amMu.toFixed(2)} / {rec.fmBeta.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3">
                            {rec.amInputCnrDb.toFixed(1)} / {rec.fmInputCnrDb.toFixed(1)} dB
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-blue-700 dark:text-blue-400">
                            {rec.amOutputSnrDb.toFixed(2)} dB
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-amber-700 dark:text-amber-400">
                            {rec.fmOutputSnrDb.toFixed(2)} dB
                          </td>
                          <td className="py-2.5 px-3">
                            {rec.amThdPercent !== null && rec.fmThdPercent !== null ? (
                              <div>
                                <div>
                                  {rec.amThdPercent.toFixed(2)}% / {rec.fmThdPercent.toFixed(2)}%
                                </div>
                                {rec.amPreLpfEnvelopeThdPercent !== null &&
                                  rec.amPreLpfEnvelopeThdPercent > rec.amThdPercent + 2 && (
                                    <div className="text-[10px] text-rose-700 dark:text-rose-400">
                                      Pre-LPF {rec.amPreLpfEnvelopeThdPercent.toFixed(1)}%
                                    </div>
                                  )}
                              </div>
                            ) : (
                              'N/A'
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {rec.amNrmsePercent.toFixed(1)}% / {rec.fmNrmsePercent.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3">
                            {(rec.amMeasuredBwHz / 1000).toFixed(1)}k / {(rec.fmMeasuredBwHz / 1000).toFixed(1)}k
                          </td>
                          <td className="py-2.5 px-3 text-right font-sans">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                onClick={() => setExpandedRecordId(isExpanded ? null : rec.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors cursor-pointer whitespace-nowrap"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3" aria-hidden="true" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                                )}
                                Inspect
                              </button>
                              <button
                                type="button"
                                onClick={() => onLoadExperimentConfig(rec)}
                                title="Restore this immutable experiment snapshot into the Simulator"
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70 hover:bg-blue-100 dark:hover:bg-blue-900/70 rounded transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                                Load
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${rec.id}-detail`} className="bg-slate-50/90 dark:bg-slate-800/50">
                            <td colSpan={10} className="p-3.5 font-sans text-xs text-slate-700 dark:text-slate-300">
                              <div
                                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
                                data-testid="experiment-snapshot-detail"
                              >
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-2.5 space-y-1">
                                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Message Snapshot
                                  </div>
                                  <div className="font-mono text-[11px] space-y-0.5">
                                    <div>Waveform: {rec.messageWaveform}</div>
                                    <div>Amplitude: {rec.messageAmplitude.toFixed(2)}</div>
                                    <div>
                                      Active Tones:{' '}
                                      {rec.messageFrequenciesHz.map((f) => `${Math.round(f)} Hz`).join(', ')}
                                    </div>
                                    <div>
                                      Slider <Sym base="f" sub="0" /> / <Sym base="f" sub="max" />:{' '}
                                      {rec.messageFreqHz} Hz / {rec.messageMaxFreqHz} Hz
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-2.5 space-y-1">
                                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Transmitter &amp; Channel
                                  </div>
                                  <div className="font-mono text-[11px] space-y-0.5">
                                    <div>
                                      Carrier <Sym base="f" sub="c" />: {(rec.requestedCarrierFreqHz / 1000).toFixed(0)}k →{' '}
                                      {(rec.effectiveCarrierFreqHz / 1000).toFixed(0)} kHz
                                    </div>
                                    <div>
                                      AM <Sym base="μ" italic={false} /> (req/eff): {rec.amRequestedMu.toFixed(2)} /{' '}
                                      {rec.amMu.toFixed(2)}
                                    </div>
                                    <div>
                                      FM <Sym base="Δf" italic={false} /> / <Sym base="β" italic={false} />:{' '}
                                      {(rec.fmFrequencyDeviationHz / 1000).toFixed(1)} kHz / {rec.fmBeta.toFixed(2)}
                                    </div>
                                    <div>
                                      <Sym base="P" sub="tx" />: {rec.txPower.toFixed(4)} W ·{' '}
                                      <Sym base="γ" italic={false} />={rec.snr0Db} dB · seed={rec.noiseSeed}
                                    </div>
                                    <div>
                                      <Sym base="N" sub="0" />={rec.n0WattsPerHz.toExponential(2)} W/Hz ·{' '}
                                      <Sym base="σ" sub="n" italic={false} />={rec.noiseSigma.toFixed(4)}
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-2.5 space-y-1">
                                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Receiver &amp; Simulation Grid
                                  </div>
                                  <div className="font-mono text-[11px] space-y-0.5">
                                    <div>Mode: {rec.autoIfBandwidth ? 'Auto BW' : 'Manual BW'}</div>
                                    <div>
                                      AM / FM IF: {(rec.amIfBandwidthHz / 1000).toFixed(2)}k /{' '}
                                      {(rec.fmIfBandwidthHz / 1000).toFixed(1)} kHz
                                    </div>
                                    <div>
                                      Audio LPF <Sym base="W" />: {(rec.lpfCutoffHz / 1000).toFixed(2)} kHz
                                    </div>
                                    <div>Guard: {rec.spectralGuardAdjusted ? 'Active' : 'Nominal'}</div>
                                    <div>
                                      <Sym base="F" sub="s" />={(rec.sampleRateHz / 1000).toFixed(0)} kHz ·{' '}
                                      <Sym base="N" />={rec.sampleCount} · <Sym base="T" />=
                                      {(rec.durationSec * 1000).toFixed(1)} ms
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-2.5 space-y-1">
                                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Measured vs Theoretical
                                  </div>
                                  <div className="font-mono text-[11px] space-y-0.5">
                                    <div>
                                      AM CNR (M/T): {rec.amInputCnrDb.toFixed(2)} /{' '}
                                      {rec.amTheoreticalInputCnrDb.toFixed(2)} dB
                                    </div>
                                    <div>
                                      FM CNR (M/T): {rec.fmInputCnrDb.toFixed(2)} /{' '}
                                      {rec.fmTheoreticalInputCnrDb.toFixed(2)} dB
                                    </div>
                                    <div>
                                      AM SNR (M/T): {rec.amOutputSnrDb.toFixed(2)} /{' '}
                                      {rec.amTheoreticalOutputSnrDb.toFixed(2)} dB
                                    </div>
                                    <div>
                                      FM SNR (M/T): {rec.fmOutputSnrDb.toFixed(2)} /{' '}
                                      {rec.fmTheoreticalOutputSnrDb.toFixed(2)} dB
                                    </div>
                                    <div>
                                      Clean NRMSE (AM/FM): {rec.amNoiselessNrmsePercent.toFixed(2)}% /{' '}
                                      {rec.fmNoiselessNrmsePercent.toFixed(2)}%
                                    </div>
                                    <div>
                                      AM Pre-LPF Env: {rec.amPreLpfEnvelopeNrmsePercent.toFixed(2)}% (THD{' '}
                                      {rec.amPreLpfEnvelopeThdPercent !== null
                                        ? `${rec.amPreLpfEnvelopeThdPercent.toFixed(2)}%`
                                        : 'N/A'}
                                      )
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Automatic Monte Carlo Noise-Sweep & FM Threshold Discovery */}
      <section className="space-y-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 flex flex-wrap items-center justify-between gap-4 transition-colors">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Monte Carlo Noise-Sweep &amp; FM Threshold Identification
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Sweeps channel reference SNR <Sym base="γ" italic={false} /> from 0 dB to 34 dB across 5 independent AWGN seeds per point to measure mean ± 1σ Input CNR and Output SNR, physically isolating FM threshold onset and independent AM/FM crossover.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunSweep}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            Run Monte Carlo Sweep
          </button>
        </div>

        {sweepResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-3.5 transition-colors">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Detected FM Threshold Region
                </div>
                <div
                  className="mt-1 text-xl font-mono font-semibold tabular-nums text-rose-700 dark:text-rose-400"
                  data-testid="sweep-threshold-gamma"
                >
                  {sweepResult.thresholdGammaDb !== null
                    ? `γ ≤ ${sweepResult.thresholdGammaDb.toFixed(0)} dB`
                    : 'Not Reached'}
                </div>
                <div className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400 space-y-0.5">
                  <div>
                    Mean FM IF CNR:{' '}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {sweepResult.thresholdCnrDb !== null ? `${sweepResult.thresholdCnrDb.toFixed(1)} dB` : '—'}
                    </span>
                  </div>
                  <div>
                    FM Out:{' '}
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {sweepResult.thresholdFmOutputSnrDb !== null
                        ? `${sweepResult.thresholdFmOutputSnrDb.toFixed(1)}±${(sweepResult.thresholdFmOutputSnrStdDb ?? 0).toFixed(1)} dB`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    AM Out:{' '}
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      {sweepResult.thresholdAmOutputSnrDb !== null
                        ? `${sweepResult.thresholdAmOutputSnrDb.toFixed(1)}±${(sweepResult.thresholdAmOutputSnrStdDb ?? 0).toFixed(1)} dB`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-3.5 transition-colors">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Sharpest FM Deterioration
                </div>
                <div
                  className="mt-1 text-xl font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100"
                  data-testid="sweep-sharp-drop"
                >
                  {sweepResult.sharpDropFromGammaDb !== null && sweepResult.sharpDropToGammaDb !== null
                    ? `${sweepResult.sharpDropFromGammaDb} → ${sweepResult.sharpDropToGammaDb} dB`
                    : '—'}
                </div>
                <div className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400 space-y-0.5">
                  <div>
                    Drop:{' '}
                    <span className="font-semibold text-rose-700 dark:text-rose-400">
                      {sweepResult.sharpDropDeltaSnrDb !== null ? `−${sweepResult.sharpDropDeltaSnrDb.toFixed(1)} dB` : '—'}
                    </span>{' '}
                    (CNR {sweepResult.sharpDropFmCnrDb !== null ? `${sweepResult.sharpDropFmCnrDb.toFixed(1)} dB` : '—'})
                  </div>
                  <div>
                    FM Out / AM Out:{' '}
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {sweepResult.sharpDropFmOutputSnrDb !== null ? `${sweepResult.sharpDropFmOutputSnrDb.toFixed(1)}` : '—'}
                    </span>{' '}
                    /{' '}
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      {sweepResult.sharpDropAmOutputSnrDb !== null ? `${sweepResult.sharpDropAmOutputSnrDb.toFixed(1)} dB` : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-3.5 transition-colors">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  FM Below AM Crossover (Independent)
                </div>
                <div
                  className="mt-1 text-xl font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100"
                  data-testid="sweep-crossover"
                >
                  {sweepResult.crossoverObserved && sweepResult.crossoverGammaDb !== null
                    ? `γ ≈ ${sweepResult.crossoverGammaDb.toFixed(1)} dB`
                    : 'Not Observed'}
                </div>
                <div className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400 space-y-0.5">
                  {sweepResult.crossoverObserved && sweepResult.crossoverFmCnrDb !== null ? (
                    <>
                      <div>
                        FM Input CNR:{' '}
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {sweepResult.crossoverFmCnrDb.toFixed(1)} dB
                        </span>
                      </div>
                      <div>
                        Equal AM=FM SNR:{' '}
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {sweepResult.crossoverOutputSnrDb?.toFixed(1)} dB
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="font-sans text-slate-500 dark:text-slate-400">
                      FM remained ≥ AM across [0, 34] dB for current <Sym base="β" italic={false} /> ={' '}
                      {sweepResult.fmBeta.toFixed(1)}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-3.5 transition-colors">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Monte Carlo Ensemble Snapshot
                </div>
                <div className="mt-1 text-xl font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  <Sym base="μ" italic={false} /> = {sweepResult.amMu.toFixed(2)} · <Sym base="β" italic={false} /> ={' '}
                  {sweepResult.fmBeta.toFixed(1)}
                </div>
                <div className="mt-1.5 text-[11px] font-mono text-slate-600 dark:text-slate-400 space-y-0.5">
                  <div>
                    {sweepResult.realizationsPerPoint} seeds × {sweepResult.points.length} γ points ·{' '}
                    {sweepResult.messageWaveform} {sweepResult.messageMaxFreqHz} Hz
                  </div>
                  <div>
                    Clean floor: {sweepResult.fmNoiselessFloorSnrDb.toFixed(1)} dB · LPF {(sweepResult.lpfCutoffHz / 1000).toFixed(2)}k
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate" title={sweepResult.seedsUsed.join(', ')}>
                    Seeds: {sweepResult.seedsUsed.join(', ')}
                  </div>
                </div>
              </div>
            </div>

            {/* Transparent Threshold Criterion Explanation */}
            <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-md px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Threshold Detection Criterion:
              </span>{' '}
              <MathText text={sweepResult.thresholdCriterion} />
            </div>

            <SweepCurveChart sweep={sweepResult} isDark={isDark} />
          </div>
        )}
      </section>
    </div>
  );
}
