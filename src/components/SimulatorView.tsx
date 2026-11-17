import { AlertTriangle, Info, Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SimulationConfig, SimulationResult } from '../dsp/types';
import { ControlDeck } from './ControlDeck';
import { InfoTooltip } from './InfoTooltip';
import { MathText, Sym } from './MathSymbol';
import { SpectrumChart } from './charts/SpectrumChart';
import { TimeSeriesChart } from './charts/TimeSeriesChart';

interface SimulatorViewProps {
  config: SimulationConfig;
  result: SimulationResult;
  effectiveAmIfHz: number;
  effectiveFmIfHz: number;
  effectiveLpfHz: number;
  isDark?: boolean;
  onChangeConfig: (next: SimulationConfig) => void;
  onReset: () => void;
}

type FocusMode = 'split' | 'am' | 'fm';
type SpectrumDomain = 'rf' | 'baseband';

export function SimulatorView({
  config,
  result,
  effectiveAmIfHz,
  effectiveFmIfHz,
  effectiveLpfHz,
  isDark = false,
  onChangeConfig,
  onReset,
}: SimulatorViewProps) {
  const [focusMode, setFocusMode] = useState<FocusMode>('split');
  const [windowMs, setWindowMs] = useState<number>(4);
  const [spectrumDomain, setSpectrumDomain] = useState<SpectrumDomain>('rf');
  const [showOverlayRecovery, setShowOverlayRecovery] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [sweepOffsetMs, setSweepOffsetMs] = useState<number>(0.8);

  const durationMs = result.durationSec * 1000;
  const maxOffsetMs = Math.max(0.8, durationMs - windowMs);
  const effectiveOffsetMs = windowMs >= durationMs ? 0 : Math.min(sweepOffsetMs, maxOffsetMs);

  // Smooth buffer-panning playback across the genuinely computed 16 ms record
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dtSec = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      setSweepOffsetMs((prev) => {
        const next = prev + dtSec * 1.8; // ~1.8 ms of capture per real second
        return next > maxOffsetMs ? 0.8 : next;
      });
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, maxOffsetMs]);

  const handleTogglePlayback = () => {
    if (!isPlaying) {
      if (windowMs >= durationMs) {
        setWindowMs(4);
      }
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  const handleSelectTimebase = (ms: number) => {
    setWindowMs(ms);
    if (ms >= durationMs) {
      setIsPlaying(false);
    } else {
      setSweepOffsetMs((prev) => Math.min(prev, Math.max(0.8, durationMs - ms)));
    }
  };

  const fc = result.spectralGuard.effectiveCarrierFreqHz;
  const rfSpanHalf = Math.max(40000, result.fm.metrics.theoreticalBandwidthHz * 0.85);
  const rfMinHz = Math.max(0, fc - rfSpanHalf);
  const rfMaxHz = Math.min(result.sampleRateHz * 0.5, fc + rfSpanHalf);

  const fmLinearLin = Math.pow(10, result.fm.metrics.theoreticalOutputSnrDb / 10);
  const fmNoiselessFloorLin = Math.pow(
    100 / Math.max(result.fm.metrics.noiselessNrmsePercent, 1e-4),
    2
  );
  const fmCompositeTheorySnrDb =
    10 *
    Math.log10(
      1 / (1 / Math.max(fmLinearLin, 1e-12) + 1 / Math.max(fmNoiselessFloorLin, 1e-12))
    );
  const belowFmThreshold = fmCompositeTheorySnrDb - result.fm.metrics.outputSnrDb > 3.0;

  const amDistortionText = result.am.metrics.thdApplicable
    ? `Post-LPF THD ${result.am.metrics.thdPercent?.toFixed(2)}% (Pre-LPF ${result.am.metrics.preLpfEnvelopeThdPercent?.toFixed(1)}%)`
    : `Clean NRMSE ${result.am.metrics.noiselessNrmsePercent.toFixed(2)}% (Pre-LPF ${result.am.metrics.preLpfEnvelopeNrmsePercent.toFixed(1)}%)`;

  // Adaptive dark/light canvas trace colors
  const refColor = isDark ? '#e2e8f0' : '#0f172a';
  const amColor = isDark ? '#60a5fa' : '#2563eb';
  const fmColor = isDark ? '#fbbf24' : '#d97706';

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <ControlDeck
        config={config}
        messageMaxFreqHz={result.messageMaxFreqHz}
        lpfGainAtMaxFreqDb={result.fm.metrics.lpfGainAtMaxFreqDb}
        isOvermodulated={result.am.isOvermodulated}
        effectiveAmIfHz={effectiveAmIfHz}
        effectiveFmIfHz={effectiveFmIfHz}
        effectiveLpfHz={effectiveLpfHz}
        spectralGuard={result.spectralGuard}
        onChange={onChangeConfig}
        onReset={onReset}
      />

      <div className="flex-1 min-w-0 space-y-4 w-full">
        {/* Workspace Toolbar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Channel Focus</span>
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded">
              {(
                [
                  { id: 'split', label: 'AM + FM' },
                  { id: 'am', label: 'AM Only' },
                  { id: 'fm', label: 'FM Only' },
                ] as { id: FocusMode; label: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setFocusMode(m.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    focusMode === m.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Timebase</span>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                {[2, 4, 8, 16].map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => handleSelectTimebase(ms)}
                    className={`px-2 py-1 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap ${
                      windowMs === ms
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {ms}ms
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="playback-toggle"
                onClick={handleTogglePlayback}
                aria-pressed={isPlaying}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors cursor-pointer whitespace-nowrap ${
                  isPlaying
                    ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3 h-3" aria-hidden="true" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" aria-hidden="true" />
                    <span>Sweep</span>
                  </>
                )}
              </button>
              <span
                data-testid="playback-offset"
                className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400"
              >
                {effectiveOffsetMs.toFixed(1)} ms
              </span>
              <InfoTooltip
                label="Oscilloscope triggered capture vs continuous animation"
                text="Defaults to Triggered Static capture: continuously scrolling RF carriers (35–100 kHz) at 60 fps causes stroboscopic aliasing and obscures cursor probing. Sweep Playback smoothly pans across the deterministic 16 ms DSP buffer."
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Spectrum</span>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                <button
                  type="button"
                  onClick={() => setSpectrumDomain('rf')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    spectrumDomain === 'rf'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  RF Passband
                </button>
                <button
                  type="button"
                  onClick={() => setSpectrumDomain('baseband')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    spectrumDomain === 'baseband'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  Baseband Audio
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Live Telemetry Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-3 transition-colors">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              AM Output SNR
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className="text-2xl font-mono font-semibold tabular-nums text-blue-700 dark:text-blue-400"
                data-testid="metric-am-snr"
              >
                {result.am.metrics.outputSnrDb.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-slate-400 dark:text-slate-500">dB</span>
            </div>
            <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {amDistortionText} · CNR {result.am.metrics.inputCnrDb.toFixed(1)} dB
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-3 transition-colors">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              FM Output SNR
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className="text-2xl font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-400"
                data-testid="metric-fm-snr"
              >
                {result.fm.metrics.outputSnrDb.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-slate-400 dark:text-slate-500">dB</span>
            </div>
            <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              <Sym base="β" italic={false} /> = {result.fm.metrics.modulationIndex.toFixed(2)} · CNR{' '}
              {result.fm.metrics.inputCnrDb.toFixed(1)} dB
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-3 transition-colors">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Occupied BW (99%)
            </div>
            <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                AM {(result.am.metrics.measuredBandwidthHz / 1000).toFixed(1)}k
              </span>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                FM {(result.fm.metrics.measuredBandwidthHz / 1000).toFixed(1)}k
              </span>
            </div>
            <div className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Carson {(result.fm.metrics.theoreticalBandwidthHz / 1000).toFixed(1)} kHz
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-3 transition-colors">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tx Power Parity
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {result.am.metrics.txPower.toFixed(3)}
              </span>
              <span className="text-xs font-mono text-slate-400 dark:text-slate-500">W</span>
            </div>
            <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Δ<Sym base="P" /> = {result.channel.powerParityError.toExponential(1)} W
            </div>
          </div>
        </div>

        {/* Active Physical Regime & Spectral Constraint Alerts */}
        {(result.am.isOvermodulated || belowFmThreshold || result.spectralGuard.adjusted) && (
          <div className="space-y-2">
            {result.spectralGuard.adjusted && result.spectralGuard.reason && (
              <div
                role="status"
                data-testid="spectral-guard-alert"
                className="flex items-start justify-between gap-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-950 dark:text-blue-200 rounded-md px-3.5 py-2.5 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <Info
                    className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <span className="font-semibold">FM Spectral Foldover Guard Active:</span>{' '}
                    <MathText text={result.spectralGuard.reason} />
                  </div>
                </div>
                {config.receiver.carrierFreqHz !== result.spectralGuard.effectiveCarrierFreqHz && (
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig({
                        ...config,
                        receiver: {
                          ...config.receiver,
                          carrierFreqHz: result.spectralGuard.effectiveCarrierFreqHz,
                        },
                      })
                    }
                    className="px-2.5 py-1 text-xs font-medium bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Sync Slider to {(result.spectralGuard.effectiveCarrierFreqHz / 1000).toFixed(0)} kHz
                  </button>
                )}
              </div>
            )}
            {result.am.isOvermodulated && (
              <div
                role="status"
                data-testid="overmodulation-alert"
                className="flex items-start gap-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 rounded-md px-3.5 py-2.5 text-xs"
              >
                <AlertTriangle
                  className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <span className="font-semibold">
                    AM Overmodulation Detected (<Sym base="μ" italic={false} /> ={' '}
                    {result.am.metrics.modulationIndex.toFixed(2)} &gt; 1.00):
                  </span>{' '}
                  The envelope{' '}
                  <span className="font-mono">
                    1 + <Sym base="μ" italic={false} />·<Sym base="m" suffix="(t)" />
                  </span>{' '}
                  crosses zero, causing carrier phase reversal and rectification folding.{' '}
                  {result.am.metrics.thdApplicable ? (
                    <>
                      <span className="font-mono font-medium">
                        Pre-LPF Envelope THD = {result.am.metrics.preLpfEnvelopeThdPercent?.toFixed(2)}%
                      </span>{' '}
                      vs.{' '}
                      <span className="font-mono font-medium">
                        Post-LPF Output THD = {result.am.metrics.thdPercent?.toFixed(2)}%
                      </span>
                      {2 * config.message.frequencyHz > result.am.metrics.lpfCutoffUsedHz ? (
                        <>
                          {' '}
                          (audio LPF <Sym base="W" /> ={' '}
                          {(result.am.metrics.lpfCutoffUsedHz / 1000).toFixed(2)} kHz attenuates harmonics{' '}
                          2<Sym base="f" sub="m" suffix="+" /> ≥{' '}
                          {((2 * config.message.frequencyHz) / 1000).toFixed(1)} kHz without eliminating
                          underlying envelope inversion).
                        </>
                      ) : (
                        '.'
                      )}
                    </>
                  ) : (
                    <>
                      <span className="font-mono font-medium">
                        Pre-LPF Envelope NRMSE = {result.am.metrics.preLpfEnvelopeNrmsePercent.toFixed(2)}%
                      </span>{' '}
                      vs.{' '}
                      <span className="font-mono font-medium">
                        Post-LPF Clean NRMSE = {result.am.metrics.noiselessNrmsePercent.toFixed(2)}%
                      </span>
                      . Receiver LPF suppresses out-of-band harmonics while envelope folding remains.
                    </>
                  )}
                </div>
              </div>
            )}
            {belowFmThreshold && (
              <div
                role="status"
                data-testid="fm-threshold-alert"
                className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-md px-3.5 py-2.5 text-xs"
              >
                <AlertTriangle
                  className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <span className="font-semibold">
                    FM Threshold Breakdown Active (IF CNR = {result.fm.metrics.inputCnrDb.toFixed(1)} dB):
                  </span>{' '}
                  Noise envelope peaks exceed the FM carrier amplitude, triggering discriminator phase-wrap click noise (
                  {(result.fm.metrics.theoreticalOutputSnrDb - result.fm.metrics.outputSnrDb).toFixed(1)} dB below linear theory).
                </div>
              </div>
            )}
          </div>
        )}

        {/* Baseband Comparison Plot: Message vs Recovered */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-end">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showOverlayRecovery}
                onChange={(e) => setShowOverlayRecovery(e.target.checked)}
                className="h-3.5 w-3.5 accent-slate-900 dark:accent-blue-400 cursor-pointer"
              />
              <span>
                Overlay Recovered Waveforms on Original <Sym base="m" suffix="(t)" />
              </span>
            </label>
          </div>

          <TimeSeriesChart
            title={
              <>
                Baseband Message <Sym base="m" suffix="(t)" /> &amp; Recovered Outputs
              </>
            }
            subtitle="Aligned post-LPF demodulator outputs compared against the original common baseband message"
            sampleRateHz={result.sampleRateHz}
            timeSec={result.timeSec}
            windowMs={windowMs}
            offsetMs={effectiveOffsetMs}
            yUnit="V"
            isDark={isDark}
            testId="chart-baseband-recovery"
            traces={[
              {
                label: 'Original m(t)',
                data: result.message,
                color: refColor,
                dashed: showOverlayRecovery,
                lineWidth: 1.6,
              },
              ...(showOverlayRecovery && focusMode !== 'fm'
                ? [
                    {
                      label: 'AM Recovered',
                      data: result.am.recovered,
                      color: amColor,
                      lineWidth: 1.7,
                    },
                  ]
                : []),
              ...(showOverlayRecovery && focusMode !== 'am'
                ? [
                    {
                      label: 'FM Recovered',
                      data: result.fm.recovered,
                      color: fmColor,
                      lineWidth: 1.7,
                    },
                  ]
                : []),
            ]}
          />
        </div>

        {/* Modulated RF Waveforms */}
        <div
          className={`grid gap-4 ${
            focusMode === 'split' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {focusMode !== 'fm' && (
            <TimeSeriesChart
              title="AM Transmitted Waveform & Envelope"
              subtitle={
                <>
                  <Sym base="s" sub="AM" suffix="(t)" /> at <Sym base="f" sub="c" /> ={' '}
                  {(fc / 1000).toFixed(0)} kHz · <Sym base="μ" italic={false} /> ={' '}
                  {result.am.metrics.modulationIndex.toFixed(2)}
                </>
              }
              sampleRateHz={result.sampleRateHz}
              timeSec={result.timeSec}
              windowMs={Math.min(windowMs, 4)}
              offsetMs={effectiveOffsetMs}
              yUnit="V"
              isDark={isDark}
              testId="chart-am-tx"
              traces={[
                { label: 'AM Carrier s_AM(t)', data: result.am.tx, color: amColor, lineWidth: 1.1 },
                {
                  label: 'Ideal Envelope',
                  data: result.am.envelopeIdeal,
                  color: refColor,
                  dashed: true,
                  lineWidth: 1.4,
                },
              ]}
            />
          )}

          {focusMode !== 'am' && (
            <TimeSeriesChart
              title="FM Transmitted Waveform (Constant Envelope)"
              subtitle={
                <>
                  <Sym base="s" sub="FM" suffix="(t)" /> at <Sym base="f" sub="c" /> ={' '}
                  {(fc / 1000).toFixed(0)} kHz · <Sym base="Δf" italic={false} /> ={' '}
                  {(config.fm.frequencyDeviationHz / 1000).toFixed(1)} kHz (
                  <Sym base="β" italic={false} /> = {result.fm.metrics.modulationIndex.toFixed(2)})
                </>
              }
              sampleRateHz={result.sampleRateHz}
              timeSec={result.timeSec}
              windowMs={Math.min(windowMs, 2)}
              offsetMs={effectiveOffsetMs}
              yMin={-1.3}
              yMax={1.3}
              yUnit="V"
              isDark={isDark}
              testId="chart-fm-tx"
              traces={[
                { label: 'FM Carrier s_FM(t)', data: result.fm.tx, color: fmColor, lineWidth: 1.2 },
              ]}
            />
          )}
        </div>

        {/* FM Instantaneous Frequency Visualization */}
        {focusMode !== 'am' && (
          <TimeSeriesChart
            title={
              <>
                FM Instantaneous Frequency <Sym base="f" sub="i" suffix="(t)" />
              </>
            }
            subtitle={
              <>
                Transmitted <Sym base="f" sub="c" /> + <Sym base="Δf" italic={false} />·
                <Sym base="m" suffix="(t)" /> vs raw discriminator instantaneous frequency estimate (pre-LPF)
              </>
            }
            sampleRateHz={result.sampleRateHz}
            timeSec={result.timeSec}
            windowMs={windowMs}
            offsetMs={effectiveOffsetMs}
            yUnit="Hz"
            height={200}
            isDark={isDark}
            testId="chart-fm-inst-freq"
            traces={[
              {
                label: 'Tx f_i(t)',
                data: result.fm.instFreqTxHz,
                color: refColor,
                dashed: true,
                lineWidth: 1.6,
              },
              {
                label: 'Discriminator f_i(t)',
                data: result.fm.instFreqRxHz,
                color: fmColor,
                lineWidth: 1.3,
              },
            ]}
          />
        )}

        {/* Frequency Spectrum Analyzer */}
        {spectrumDomain === 'rf' ? (
          <SpectrumChart
            title="RF Transmitted Frequency Spectrum (Passband)"
            subtitle={
              <>
                Hann-windowed FFT magnitude around <Sym base="f" sub="c" /> = {(fc / 1000).toFixed(0)} kHz
                with theoretical AM (2<Sym base="W" />) and FM Carson bandwidths
              </>
            }
            freqsHz={result.spectrum.freqsHz}
            minFreqHz={rfMinHz}
            maxFreqHz={rfMaxHz}
            isDark={isDark}
            testId="chart-rf-spectrum"
            traces={[
              ...(focusMode !== 'fm'
                ? [{ label: 'AM Spectrum', dataDb: result.spectrum.amDb, color: amColor }]
                : []),
              ...(focusMode !== 'am'
                ? [{ label: 'FM Spectrum', dataDb: result.spectrum.fmDb, color: fmColor }]
                : []),
            ]}
            overlays={[
              ...(focusMode !== 'fm'
                ? [
                    {
                      label: `AM 2W (${(result.am.metrics.theoreticalBandwidthHz / 1000).toFixed(1)} kHz)`,
                      centerHz: fc,
                      bandwidthHz: result.am.metrics.theoreticalBandwidthHz,
                      color: amColor,
                    },
                  ]
                : []),
              ...(focusMode !== 'am'
                ? [
                    {
                      label: `Carson BW (${(result.fm.metrics.theoreticalBandwidthHz / 1000).toFixed(1)} kHz)`,
                      centerHz: fc,
                      bandwidthHz: result.fm.metrics.theoreticalBandwidthHz,
                      color: fmColor,
                    },
                  ]
                : []),
            ]}
          />
        ) : (
          <SpectrumChart
            title="Baseband Recovered Audio Spectrum"
            subtitle={
              <>
                Harmonic &amp; noise floor inspection from 0 to 10 kHz (overmodulation harmonics appear at{' '}
                2<Sym base="f" sub="m" />, 3<Sym base="f" sub="m" />)
              </>
            }
            freqsHz={result.spectrum.freqsHz}
            minFreqHz={0}
            maxFreqHz={10000}
            isDark={isDark}
            testId="chart-bb-spectrum"
            traces={[
              {
                label: 'Original m(t)',
                dataDb: result.spectrum.messageDb,
                color: refColor,
                dashed: true,
              },
              ...(focusMode !== 'fm'
                ? [{ label: 'AM Recovered', dataDb: result.spectrum.amRecoveredDb, color: amColor }]
                : []),
              ...(focusMode !== 'am'
                ? [{ label: 'FM Recovered', dataDb: result.spectrum.fmRecoveredDb, color: fmColor }]
                : []),
            ]}
          />
        )}
      </div>
    </div>
  );
}
