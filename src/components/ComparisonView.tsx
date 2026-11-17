import { SimulationConfig, SimulationResult } from '../dsp/types';
import { Sym } from './MathSymbol';
import { SpectrumChart } from './charts/SpectrumChart';
import { TimeSeriesChart } from './charts/TimeSeriesChart';

interface ComparisonViewProps {
  config: SimulationConfig;
  result: SimulationResult;
  isDark?: boolean;
}

export function ComparisonView({ config, result, isDark = false }: ComparisonViewProps) {
  const fc = result.spectralGuard.effectiveCarrierFreqHz;
  const rfSpanHalf = Math.max(40000, result.fm.metrics.theoreticalBandwidthHz * 0.85);
  const rfMinHz = Math.max(0, fc - rfSpanHalf);
  const rfMaxHz = Math.min(result.sampleRateHz * 0.5, fc + rfSpanHalf);

  const amM = result.am.metrics;
  const fmM = result.fm.metrics;
  const snrDelta = fmM.outputSnrDb - amM.outputSnrDb;

  const refColor = isDark ? '#e2e8f0' : '#0f172a';
  const refSubtleColor = isDark ? '#94a3b8' : '#64748b';
  const amColor = isDark ? '#60a5fa' : '#2563eb';
  const amRxColor = isDark ? '#3b82f6' : '#1d4ed8';
  const fmColor = isDark ? '#fbbf24' : '#d97706';
  const fmRxColor = isDark ? '#f59e0b' : '#b45309';

  return (
    <div className="space-y-6">
      {/* Header summary */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Synchronized AM vs FM Signal-Chain Comparison
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Both systems process the exact same message signal <Sym base="m" suffix="(t)" />, normalized Tx power ({amM.txPower.toFixed(3)} W), carrier ({(fc / 1000).toFixed(0)} kHz), and AWGN realization (<Sym base="γ" italic={false} /> = {config.channel.snr0Db} dB).
          </p>
        </div>
        <div className="text-right font-mono tabular-nums">
          <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Net FM SNR Advantage
          </div>
          <div
            className={`text-2xl font-semibold ${
              snrDelta >= 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-blue-700 dark:text-blue-400'
            }`}
          >
            {snrDelta >= 0 ? `+${snrDelta.toFixed(2)}` : snrDelta.toFixed(2)} dB
          </div>
        </div>
      </div>

      {/* Quantitative Metrics Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden transition-colors">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Measured &amp; Theoretical Telemetry Comparison
          </h3>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            All metrics computed live from {result.sampleCount} samples @ {(result.sampleRateHz / 1000).toFixed(0)} kHz
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <th className="py-2.5 px-4 font-semibold">Parameter / Metric</th>
                <th className="py-2.5 px-4 font-semibold text-blue-700 dark:text-blue-400">
                  AM (DSB-LC Envelope)
                </th>
                <th className="py-2.5 px-4 font-semibold text-amber-700 dark:text-amber-400">
                  FM (Discriminator)
                </th>
                <th className="py-2.5 px-4 font-semibold text-slate-600 dark:text-slate-300">
                  Engineering Interpretation
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums text-slate-800 dark:text-slate-200">
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-100">
                  Transmitted RF Power
                </td>
                <td className="py-2.5 px-4">{amM.txPower.toFixed(5)} W</td>
                <td className="py-2.5 px-4">{fmM.txPower.toFixed(5)} W</td>
                <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-400">
                  Normalized equal Tx power (Δ<Sym base="P" /> = {result.channel.powerParityError.toExponential(1)} W)
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-100">
                  Carrier Amplitude <Sym base="A" sub="c" />
                </td>
                <td className="py-2.5 px-4">{amM.carrierAmplitude.toFixed(4)} V</td>
                <td className="py-2.5 px-4">{fmM.carrierAmplitude.toFixed(4)} V</td>
                <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-400">
                  AM reduces <Sym base="A" sub="c" /> to accommodate sideband power
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-100">
                  Modulation Index
                </td>
                <td className="py-2.5 px-4">
                  <Sym base="μ" italic={false} /> = {amM.modulationIndex.toFixed(2)}
                </td>
                <td className="py-2.5 px-4">
                  <Sym base="β" italic={false} /> = {fmM.modulationIndex.toFixed(2)}
                </td>
                <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-400">
                  {result.am.isOvermodulated ? (
                    <>
                      AM overmodulated (<Sym base="μ" italic={false} /> &gt; 1.0)
                    </>
                  ) : (
                    'AM linear envelope region'
                  )}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-100">
                  Receiver IF &amp; Audio LPF
                </td>
                <td className="py-2.5 px-4">
                  {(amM.ifBandwidthUsedHz / 1000).toFixed(2)} / {(amM.lpfCutoffUsedHz / 1000).toFixed(2)} kHz
                </td>
                <td className="py-2.5 px-4">
                  {(fmM.ifBandwidthUsedHz / 1000).toFixed(2)} / {(fmM.lpfCutoffUsedHz / 1000).toFixed(2)} kHz
                </td>
                <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-400">
                  FM IF is {(fmM.ifBandwidthUsedHz / amM.ifBandwidthUsedHz).toFixed(1)}× wider; LPF gain @{' '}
                  <Sym base="f" sub="max" /> = {fmM.lpfGainAtMaxFreqDb.toFixed(2)} dB
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-100">
                  Input IF CNR (Measured)
                </td>
                <td className="py-2.5 px-4">{amM.inputCnrDb.toFixed(2)} dB</td>
                <td className="py-2.5 px-4">{fmM.inputCnrDb.toFixed(2)} dB</td>
                <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-400">
                  Wider FM IF admits more pre-detection noise
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-100">
                  Output SNR (Measured / Theory)
                </td>
                <td className="py-2.5 px-4 font-semibold text-blue-700 dark:text-blue-400">
                  {amM.outputSnrDb.toFixed(2)} / {amM.theoreticalOutputSnrDb.toFixed(2)} dB
                </td>
                <td className="py-2.5 px-4 font-semibold text-amber-700 dark:text-amber-400">
                  {fmM.outputSnrDb.toFixed(2)} / {fmM.theoreticalOutputSnrDb.toFixed(2)} dB
                </td>
                <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-400">
                  {fmM.theoreticalOutputSnrDb - fmM.outputSnrDb > 3
                    ? 'FM below threshold knee'
                    : 'FM operates above threshold'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-100">
                  Pre-LPF Envelope Distortion (Clean)
                </td>
                <td className="py-2.5 px-4">
                  {amM.thdApplicable && amM.preLpfEnvelopeThdPercent !== null
                    ? `${amM.preLpfEnvelopeThdPercent.toFixed(2)} % THD (${amM.preLpfEnvelopeNrmsePercent.toFixed(2)}% NRMSE)`
                    : `${amM.preLpfEnvelopeNrmsePercent.toFixed(2)} % NRMSE`}
                </td>
                <td className="py-2.5 px-4">N/A (Discriminator)</td>
                <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-400">
                  Measured before audio LPF <Sym base="W" />; reveals envelope inversion even when 2
                  <Sym base="f" sub="m" /> &gt; <Sym base="W" />
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-100">
                  Post-LPF Harmonic Distortion (THD, Single-Tone)
                </td>
                <td className="py-2.5 px-4">
                  {amM.thdApplicable && amM.thdPercent !== null
                    ? `${amM.thdPercent.toFixed(2)} %`
                    : `N/A (${config.message.waveform})`}
                </td>
                <td className="py-2.5 px-4">
                  {fmM.thdApplicable && fmM.thdPercent !== null
                    ? `${fmM.thdPercent.toFixed(2)} %`
                    : `N/A (${config.message.waveform})`}
                </td>
                <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-400">
                  {amM.thdApplicable ? (
                    <>
                      True FFT harmonic ratio (2<Sym base="f" sub="m" />..10<Sym base="f" sub="m" /> vs{' '}
                      <Sym base="f" sub="m" />) after receiver LPF <Sym base="W" />, excluding DC &amp; phase lag
                    </>
                  ) : (
                    'Harmonic THD applies to single-tone sinusoids only; see Noiseless NRMSE below'
                  )}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-100">
                  Post-LPF Noiseless Reconstruction Error (NRMSE)
                </td>
                <td className="py-2.5 px-4">{amM.noiselessNrmsePercent.toFixed(2)} %</td>
                <td className="py-2.5 px-4">{fmM.noiselessNrmsePercent.toFixed(2)} %</td>
                <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-400">
                  Clean-channel waveform error (captures IM distortion, LPF roll-off, &amp; envelope lag)
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-100">
                  Total Waveform Error (Noisy NRMSE)
                </td>
                <td className="py-2.5 px-4">{amM.nrmsePercent.toFixed(2)} %</td>
                <td className="py-2.5 px-4">{fmM.nrmsePercent.toFixed(2)} %</td>
                <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-400">
                  Combined AWGN channel noise + demodulator distortion
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-100">
                  Theoretical vs Measured 99% BW
                </td>
                <td className="py-2.5 px-4">
                  {(amM.theoreticalBandwidthHz / 1000).toFixed(2)} / {(amM.measuredBandwidthHz / 1000).toFixed(2)} kHz
                </td>
                <td className="py-2.5 px-4">
                  {(fmM.theoreticalBandwidthHz / 1000).toFixed(2)} / {(fmM.measuredBandwidthHz / 1000).toFixed(2)} kHz
                </td>
                <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-400">
                  2·<Sym base="f" sub="max" /> (AM) vs Carson 2(<Sym base="Δf" italic={false} /> +{' '}
                  <Sym base="f" sub="max" />) (FM)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Stage 1: Common Message */}
      <TimeSeriesChart
        title={
          <>
            Stage 1 — Common Original Message Signal <Sym base="m" suffix="(t)" />
          </>
        }
        subtitle={
          <>
            Waveform: {config.message.waveform} · <Sym base="f" sub="max" /> ={' '}
            {Math.round(result.messageMaxFreqHz)} Hz · RMS = {result.messageRms.toFixed(3)} V
          </>
        }
        sampleRateHz={result.sampleRateHz}
        timeSec={result.timeSec}
        windowMs={4}
        offsetMs={0.8}
        height={175}
        isDark={isDark}
        traces={[{ label: 'Message m(t)', data: result.message, color: refColor, lineWidth: 1.8 }]}
      />

      {/* Stage 2: Transmitted RF */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TimeSeriesChart
          title={
            <>
              Stage 2A — AM Transmitted Signal <Sym base="s" sub="AM" suffix="(t)" />
            </>
          }
          subtitle={
            <>
              Amplitude-varying envelope (<Sym base="P" sub="tx" /> = {amM.txPower.toFixed(3)} W)
            </>
          }
          sampleRateHz={result.sampleRateHz}
          timeSec={result.timeSec}
          windowMs={2.5}
          offsetMs={0.8}
          height={190}
          isDark={isDark}
          traces={[{ label: 's_AM(t)', data: result.am.tx, color: amColor, lineWidth: 1.1 }]}
        />
        <TimeSeriesChart
          title={
            <>
              Stage 2B — FM Transmitted Signal <Sym base="s" sub="FM" suffix="(t)" />
            </>
          }
          subtitle={
            <>
              Constant-envelope frequency modulation (<Sym base="P" sub="tx" /> = {fmM.txPower.toFixed(3)} W)
            </>
          }
          sampleRateHz={result.sampleRateHz}
          timeSec={result.timeSec}
          windowMs={2.5}
          offsetMs={0.8}
          yMin={-1.3}
          yMax={1.3}
          height={190}
          isDark={isDark}
          traces={[{ label: 's_FM(t)', data: result.fm.tx, color: fmColor, lineWidth: 1.1 }]}
        />
      </div>

      {/* Stage 3: Received Noisy IF Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TimeSeriesChart
          title="Stage 3A — AM Received IF Signal (Filtered + Noise)"
          subtitle={`IF Passband = ${(amM.ifBandwidthUsedHz / 1000).toFixed(1)} kHz · Input CNR = ${amM.inputCnrDb.toFixed(1)} dB`}
          sampleRateHz={result.sampleRateHz}
          timeSec={result.timeSec}
          windowMs={2.5}
          offsetMs={0.8}
          height={190}
          isDark={isDark}
          traces={[{ label: 'r_IF,AM(t)', data: result.am.rxFilteredIf, color: amRxColor, lineWidth: 1.0 }]}
        />
        <TimeSeriesChart
          title="Stage 3B — FM Received IF Signal (Filtered + Noise)"
          subtitle={`IF Passband = ${(fmM.ifBandwidthUsedHz / 1000).toFixed(1)} kHz · Input CNR = ${fmM.inputCnrDb.toFixed(1)} dB`}
          sampleRateHz={result.sampleRateHz}
          timeSec={result.timeSec}
          windowMs={2.5}
          offsetMs={0.8}
          height={190}
          isDark={isDark}
          traces={[{ label: 'r_IF,FM(t)', data: result.fm.rxFilteredIf, color: fmRxColor, lineWidth: 1.0 }]}
        />
      </div>

      {/* Stage 4: Recovered Baseband */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TimeSeriesChart
          title="Stage 4A — AM Recovered Signal vs Original"
          subtitle={`Output SNR = ${amM.outputSnrDb.toFixed(1)} dB · NRMSE = ${amM.nrmsePercent.toFixed(2)}%`}
          sampleRateHz={result.sampleRateHz}
          timeSec={result.timeSec}
          windowMs={4}
          offsetMs={0.8}
          height={195}
          isDark={isDark}
          traces={[
            { label: 'Original m(t)', data: result.message, color: refSubtleColor, dashed: true },
            { label: 'AM Recovered', data: result.am.recovered, color: amColor },
          ]}
        />
        <TimeSeriesChart
          title="Stage 4B — FM Recovered Signal vs Original"
          subtitle={`Output SNR = ${fmM.outputSnrDb.toFixed(1)} dB · NRMSE = ${fmM.nrmsePercent.toFixed(2)}%`}
          sampleRateHz={result.sampleRateHz}
          timeSec={result.timeSec}
          windowMs={4}
          offsetMs={0.8}
          height={195}
          isDark={isDark}
          traces={[
            { label: 'Original m(t)', data: result.message, color: refSubtleColor, dashed: true },
            { label: 'FM Recovered', data: result.fm.recovered, color: fmColor },
          ]}
        />
      </div>

      {/* Stage 5: Side-by-Side Frequency Spectra */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SpectrumChart
          title="Stage 5A — AM Passband Spectrum"
          subtitle={`Measured 99% OBW = ${(amM.measuredBandwidthHz / 1000).toFixed(2)} kHz (Theory ${(amM.theoreticalBandwidthHz / 1000).toFixed(2)} kHz)`}
          freqsHz={result.spectrum.freqsHz}
          minFreqHz={rfMinHz}
          maxFreqHz={rfMaxHz}
          height={210}
          isDark={isDark}
          traces={[
            { label: 'AM Tx', dataDb: result.spectrum.amDb, color: amColor },
            { label: 'AM Rx IF', dataDb: result.spectrum.amRxDb, color: refSubtleColor, dashed: true },
          ]}
          overlays={[
            {
              label: '2W',
              centerHz: fc,
              bandwidthHz: amM.theoreticalBandwidthHz,
              color: amColor,
            },
          ]}
        />
        <SpectrumChart
          title="Stage 5B — FM Passband Spectrum"
          subtitle={`Measured 99% OBW = ${(fmM.measuredBandwidthHz / 1000).toFixed(2)} kHz (Carson ${(fmM.theoreticalBandwidthHz / 1000).toFixed(2)} kHz)`}
          freqsHz={result.spectrum.freqsHz}
          minFreqHz={rfMinHz}
          maxFreqHz={rfMaxHz}
          height={210}
          isDark={isDark}
          traces={[
            { label: 'FM Tx', dataDb: result.spectrum.fmDb, color: fmColor },
            { label: 'FM Rx IF', dataDb: result.spectrum.fmRxDb, color: refSubtleColor, dashed: true },
          ]}
          overlays={[
            {
              label: "Carson's Rule",
              centerHz: fc,
              bandwidthHz: fmM.theoreticalBandwidthHz,
              color: fmColor,
            },
          ]}
        />
      </div>
    </div>
  );
}
