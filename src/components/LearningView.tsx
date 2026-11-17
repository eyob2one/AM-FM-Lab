import { ExperimentRecord, NoiseSweepResult, SimulationConfig, SimulationResult } from '../dsp/types';
import { Frac, Sym } from './MathSymbol';

interface LearningViewProps {
  config: SimulationConfig;
  result: SimulationResult;
  records: ExperimentRecord[];
  sweepResult: NoiseSweepResult | null;
}

export function LearningView({ config, result, records, sweepResult }: LearningViewProps) {
  const amM = result.am.metrics;
  const fmM = result.fm.metrics;
  const fcKhz = (result.spectralGuard.effectiveCarrierFreqHz / 1000).toFixed(0);
  const fMaxHz = Math.round(result.messageMaxFreqHz);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 transition-colors">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Communication Systems Reference &amp; Live Experimental Synthesis
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Analytical models evaluated with your current live simulator parameters (
          <Sym base="f" sub="c" /> = {fcKhz} kHz, <Sym base="f" sub="max" /> = {fMaxHz} Hz,{' '}
          <Sym base="μ" italic={false} /> = {amM.modulationIndex.toFixed(2)},{' '}
          <Sym base="β" italic={false} /> = {fmM.modulationIndex.toFixed(2)},{' '}
          <Sym base="γ" italic={false} /> = {config.channel.snr0Db} dB).
        </p>
      </div>

      {/* Live Equation Comparison Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 space-y-3 transition-colors">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
            01. Amplitude Modulation (DSB-LC)
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Envelope Equation, Power Efficiency &amp; Overmodulation
          </h3>
          <div className="math-formula-block bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded p-3.5 text-sm text-slate-900 dark:text-slate-100 space-y-2.5 overflow-x-auto">
            <div>
              <Sym base="s" sub="AM" suffix="(t)" /> = <Sym base="A" sub="c" /> [1 +{' '}
              <Sym base="μ" italic={false} /> · <Sym base="m" sub="n" suffix="(t)" />] cos(2π{' '}
              <Sym base="f" sub="c" /> <Sym base="t" />)
            </div>
            <div>
              <Sym base="B" sub="AM" /> = 2 <Sym base="f" sub="max" /> = 2 × {fMaxHz} Hz ={' '}
              <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
                {(amM.theoreticalBandwidthHz / 1000).toFixed(2)} kHz
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Sym base="SNR" sub="out,AM" italic={false} /> =
              <Frac
                num={
                  <>
                    <Sym base="μ" sup="2" italic={false} /> <Sym base="P" sub="m" />
                  </>
                }
                den={
                  <>
                    1 + <Sym base="μ" sup="2" italic={false} /> <Sym base="P" sub="m" />
                  </>
                }
              />
              · <Sym base="γ" italic={false} /> ={' '}
              <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
                {amM.theoreticalOutputSnrDb.toFixed(2)} dB
              </span>{' '}
              <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">(Theory)</span>
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            In standard AM, a significant fraction of transmitted power resides in the unmodulated carrier rather than the information-bearing sidebands. Under equal transmitted power ({amM.txPower.toFixed(3)} W), AM carrier amplitude scales down to{' '}
            <span className="font-medium text-slate-900 dark:text-slate-100">
              <Sym base="A" sub="c" /> = {amM.carrierAmplitude.toFixed(3)} V
            </span>.
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            An envelope detector recovers{' '}
            <span className="text-slate-900 dark:text-slate-100">
              |1 + <Sym base="μ" italic={false} />·<Sym base="m" sub="n" suffix="(t)" />|
            </span>. Whenever{' '}
            <span className="text-slate-900 dark:text-slate-100">
              <Sym base="μ" italic={false} /> &gt; 1.0
            </span>, the envelope reverses sign and folds upward, generating severe harmonic distortion. Currently:{' '}
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              <Sym base="μ" italic={false} /> = {amM.modulationIndex.toFixed(2)} →{' '}
              {amM.thdApplicable && amM.thdPercent !== null
                ? `Harmonic THD = ${amM.thdPercent.toFixed(2)}%`
                : `Noiseless NRMSE = ${amM.noiselessNrmsePercent.toFixed(2)}% (THD N/A for ${config.message.waveform})`}
            </span>.
          </p>
        </article>

        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 space-y-3 transition-colors">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            02. Frequency Modulation (Angle Modulation)
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Phase Integration, Carson&apos;s Rule &amp; Noise Immunity
          </h3>
          <div className="math-formula-block bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded p-3.5 text-sm text-slate-900 dark:text-slate-100 space-y-2.5 overflow-x-auto">
            <div>
              <Sym base="s" sub="FM" suffix="(t)" /> = <Sym base="A" sub="c" /> cos(2π{' '}
              <Sym base="f" sub="c" /> <Sym base="t" /> + 2π <Sym base="Δf" italic={false} />{' '}
              <span className="inline-flex items-baseline">
                <span className="text-base leading-none">∫</span>
                <sub className="math-sub">0</sub>
                <sup className="math-sup">t</sup>
              </span>{' '}
              <Sym base="m" sub="n" suffix="(τ)" /> d<Sym base="τ" italic={false} />)
            </div>
            <div>
              <Sym base="B" sub="FM" /> ≈ 2(<Sym base="Δf" italic={false} /> +{' '}
              <Sym base="f" sub="max" />) ={' '}
              <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400">
                {(fmM.theoreticalBandwidthHz / 1000).toFixed(2)} kHz
              </span>{' '}
              <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">(Carson&apos;s Rule)</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Sym base="SNR" sub="out,FM" italic={false} /> = 3 (
              <Frac num={<Sym base="Δf" italic={false} />} den={<Sym base="W" />} />)
              <sup className="math-sup">2</sup> <Sym base="P" sub="m" /> · <Sym base="γ" italic={false} /> ={' '}
              <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400">
                {fmM.theoreticalOutputSnrDb.toFixed(2)} dB
              </span>{' '}
              <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">(Above Threshold)</span>
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            FM maintains a constant envelope (
            <span className="font-medium text-slate-900 dark:text-slate-100">
              <Sym base="A" sub="c" /> = {fmM.carrierAmplitude.toFixed(3)} V
            </span>
            ), dedicating 100% of transmitted power to the carrier phase. Because demodulator noise PSD grows parabolically as <Sym base="f" sup="2" /> before the baseband LPF, increasing frequency deviation <Sym base="Δf" italic={false} /> suppresses baseband noise quadratically.
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            The trade-off is occupied RF spectrum: FM currently occupies{' '}
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              {(fmM.measuredBandwidthHz / 1000).toFixed(1)} kHz
            </span>{' '}
            versus AM&apos;s{' '}
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              {(amM.measuredBandwidthHz / 1000).toFixed(1)} kHz
            </span>.
          </p>
        </article>
      </div>

      {/* FM Threshold, Oscilloscope Triggering & Empirical Findings */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 space-y-5 transition-colors">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          03. The Bandwidth–SNR Trade-off, FM Threshold &amp; Triggered Capture
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          <div className="space-y-1">
            <div className="font-semibold text-slate-900 dark:text-slate-100">High-SNR Processing Gain</div>
            <p>
              Above the FM threshold (IF CNR &gt; ~10–12 dB), wideband FM exchanges expanded RF bandwidth for substantial output SNR gain. At your current settings, FM measures{' '}
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {fmM.outputSnrDb.toFixed(1)} dB
              </span>{' '}
              vs AM{' '}
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {amM.outputSnrDb.toFixed(1)} dB
              </span>.
            </p>
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-slate-900 dark:text-slate-100">Threshold Breakdown Physics</div>
            <p>
              Because FM requires a wider IF filter ({(fmM.ifBandwidthUsedHz / 1000).toFixed(1)} kHz), total IF noise power is higher (CNR ={' '}
              <span className="font-mono text-slate-900 dark:text-slate-200">
                {fmM.inputCnrDb.toFixed(1)} dB
              </span>
              ). When noise amplitude exceeds the carrier envelope, the complex phasor encircles the origin by ±2π, causing impulsive &ldquo;click&rdquo; spikes.
            </p>
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-slate-900 dark:text-slate-100">Triggered Scope vs Animation</div>
            <p>
              Real RF bench oscilloscopes trigger-lock waveforms rather than scrolling continuously. Un-triggered animation of a {fcKhz} kHz carrier at 60 fps creates stroboscopic aliasing and obscures subtle zero-crossings; use the Simulator&apos;s <span className="font-semibold text-slate-800 dark:text-slate-200">Sweep</span> toggle only to pan across the captured 16 ms record.
            </p>
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-slate-900 dark:text-slate-100">Empirical Sweep Summary</div>
            <p>
              {sweepResult ? (
                <span>
                  Your latest noise sweep detected the FM threshold region at{' '}
                  <span className="font-mono font-semibold text-rose-700 dark:text-rose-400">
                    {sweepResult.thresholdGammaDb !== null
                      ? `γ ≤ ${sweepResult.thresholdGammaDb} dB (IF CNR ≈ ${sweepResult.thresholdCnrDb?.toFixed(1)} dB)`
                      : 'no breakdown within swept range'}
                  </span>
                  {sweepResult.crossoverObserved && sweepResult.crossoverGammaDb !== null
                    ? `, with FM crossing below AM near γ ≈ ${sweepResult.crossoverGammaDb.toFixed(1)} dB`
                    : ''}
                  .
                </span>
              ) : (
                <span>
                  Run the Noise Sweep in the Experiments tab to empirically locate the threshold knee for your current{' '}
                  <Sym base="β" italic={false} />.
                </span>
              )}
            </p>
          </div>
        </div>

        {records.length > 0 && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Latest Recorded Experiment Outcomes ({records.length} runs)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {records.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded p-3 text-xs font-mono tabular-nums"
                >
                  <div className="font-sans font-semibold text-slate-900 dark:text-slate-100">
                    {r.presetName} (<Sym base="γ" italic={false} />={r.snr0Db} dB)
                  </div>
                  <div className="mt-1 text-blue-700 dark:text-blue-400">
                    AM Out SNR: {r.amOutputSnrDb.toFixed(1)} dB
                  </div>
                  <div className="text-amber-700 dark:text-amber-400">
                    FM Out SNR: {r.fmOutputSnrDb.toFixed(1)} dB
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 mt-1">
                    Δ(FM − AM) = {(r.fmOutputSnrDb - r.amOutputSnrDb) >= 0 ? '+' : ''}
                    {(r.fmOutputSnrDb - r.amOutputSnrDb).toFixed(1)} dB
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
