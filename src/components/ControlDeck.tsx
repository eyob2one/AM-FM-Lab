import { RefreshCw } from 'lucide-react';
import { getMultitoneFrequencies } from '../dsp/signalGenerator';
import { SimulationConfig, SpectralGuardStatus, WaveformType } from '../dsp/types';
import { InfoTooltip } from './InfoTooltip';
import { MathText, Sym } from './MathSymbol';

interface ControlDeckProps {
  config: SimulationConfig;
  messageMaxFreqHz: number;
  lpfGainAtMaxFreqDb: number;
  isOvermodulated: boolean;
  effectiveAmIfHz: number;
  effectiveFmIfHz: number;
  effectiveLpfHz: number;
  spectralGuard: SpectralGuardStatus;
  onChange: (next: SimulationConfig) => void;
  onReset: () => void;
}

export function ControlDeck({
  config,
  messageMaxFreqHz,
  lpfGainAtMaxFreqDb,
  isOvermodulated,
  effectiveAmIfHz,
  effectiveFmIfHz,
  effectiveLpfHz,
  spectralGuard,
  onChange,
  onReset,
}: ControlDeckProps) {
  const updateMessage = (patch: Partial<SimulationConfig['message']>) =>
    onChange({ ...config, message: { ...config.message, ...patch } });

  const updateAm = (patch: Partial<SimulationConfig['am']>) =>
    onChange({ ...config, am: { ...config.am, ...patch } });

  const updateFm = (patch: Partial<SimulationConfig['fm']>) =>
    onChange({ ...config, fm: { ...config.fm, ...patch } });

  const updateChannel = (patch: Partial<SimulationConfig['channel']>) =>
    onChange({ ...config, channel: { ...config.channel, ...patch } });

  const updateReceiver = (patch: Partial<SimulationConfig['receiver']>) =>
    onChange({ ...config, receiver: { ...config.receiver, ...patch } });

  const beta = (config.fm.frequencyDeviationHz * config.message.amplitude) / Math.max(messageMaxFreqHz, 1);

  return (
    <aside
      aria-label="Simulation parameter controls"
      className="w-full lg:w-[340px] shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md divide-y divide-slate-200 dark:divide-slate-800 transition-colors"
    >
      {/* Header row */}
      <div className="px-4 py-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Instrument Controls</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Shared <Sym base="m" suffix="(t)" /> &amp; power-normalized RF
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          Reset
        </button>
      </div>

      {/* 1. Message Generator */}
      <section className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            01. Message Generator <span className="normal-case"><Sym base="m" suffix="(t)" /></span>
          </h3>
          <InfoTooltip
            label="Message signal generator"
            text="Generates the common baseband waveform fed identically into both the AM and FM modulators. Multi-tone and speech-like modes test broadband modulation."
          />
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Waveform Profile
          </span>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded">
            {(
              [
                { id: 'single', label: 'Single Tone' },
                { id: 'multitone', label: 'Multi-Tone' },
                { id: 'speech', label: 'Speech-Like' },
              ] as { id: WaveformType; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateMessage({ waveform: opt.id })}
                className={`px-2 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  config.message.waveform === opt.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <label htmlFor="ctrl-fm-freq" className="font-medium text-slate-700 dark:text-slate-300">
              {config.message.waveform === 'multitone' ? (
                <>
                  Max Message Frequency <Sym base="f" sub="max" />
                </>
              ) : (
                <>
                  Message Frequency <Sym base="f" sub="m" />
                </>
              )}
            </label>
            <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-medium">
              {config.message.frequencyHz} Hz
            </span>
          </div>
          <input
            id="ctrl-fm-freq"
            type="range"
            min={250}
            max={5000}
            step={50}
            value={config.message.frequencyHz}
            onChange={(e) => updateMessage({ frequencyHz: Number(e.target.value) })}
            className="lab-slider w-full"
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
            <span>250 Hz</span>
            <span>
              <Sym base="f" sub="max" /> = {Math.round(messageMaxFreqHz)} Hz
            </span>
            <span>5.0 kHz</span>
          </div>
          {config.message.waveform === 'multitone' && (
            <div className="mt-1.5 text-[11px] font-mono text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded px-2 py-1">
              Tones [0.40, 0.70, 1.00]×<Sym base="f" sub="max" />:{' '}
              {getMultitoneFrequencies(config.message.frequencyHz).join(' / ')} Hz
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <label htmlFor="ctrl-msg-amp" className="font-medium text-slate-700 dark:text-slate-300">
              Message Amplitude <Sym base="A" sub="m" />
            </label>
            <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-medium">
              {config.message.amplitude.toFixed(2)} V
            </span>
          </div>
          <input
            id="ctrl-msg-amp"
            type="range"
            min={0.2}
            max={1.0}
            step={0.05}
            value={config.message.amplitude}
            onChange={(e) => updateMessage({ amplitude: Number(e.target.value) })}
            className="lab-slider w-full"
          />
        </div>
      </section>

      {/* 2. AM Parameters */}
      <section className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
            02. AM Modulator (DSB-LC)
          </h3>
          <InfoTooltip
            label="AM modulation index"
            text="s_AM(t) = A_c[1 + μ·m(t)]cos(2πf_c t). When effective μ > 1.0, the envelope crosses zero and undergoes phase reversal, distorting envelope detection."
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <label htmlFor="ctrl-am-mu" className="font-medium text-slate-700 dark:text-slate-300">
              Modulation Index <Sym base="μ" italic={false} />
            </label>
            <span
              className={`font-mono tabular-nums font-semibold ${
                isOvermodulated
                  ? 'text-rose-700 dark:text-rose-400'
                  : 'text-blue-700 dark:text-blue-400'
              }`}
            >
              {config.am.modulationIndex.toFixed(2)}
              {isOvermodulated ? ' (OVERMOD)' : ''}
            </span>
          </div>
          <input
            id="ctrl-am-mu"
            type="range"
            min={0.1}
            max={1.6}
            step={0.05}
            value={config.am.modulationIndex}
            onChange={(e) => updateAm({ modulationIndex: Number(e.target.value) })}
            className="lab-slider w-full"
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
            <span>0.10</span>
            <span className={isOvermodulated ? 'text-rose-600 dark:text-rose-400 font-medium' : ''}>
              Threshold 1.00
            </span>
            <span>1.60</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <label htmlFor="ctrl-am-rc" className="font-medium text-slate-700 dark:text-slate-300">
              Envelope RC Decay Rate
            </label>
            <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {config.am.envelopeDecayFactor.toFixed(2)}×
            </span>
          </div>
          <input
            id="ctrl-am-rc"
            type="range"
            min={0.4}
            max={2.5}
            step={0.1}
            value={config.am.envelopeDecayFactor}
            onChange={(e) => updateAm({ envelopeDecayFactor: Number(e.target.value) })}
            className="lab-slider w-full"
          />
        </div>
      </section>

      {/* 3. FM Parameters */}
      <section className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            03. FM Modulator (Phase Integral)
          </h3>
          <InfoTooltip
            label="FM frequency deviation"
            text="Instantaneous frequency f_i(t) = f_c + Δf·m(t). Modulation index β = Δf / f_max governs both Carson's bandwidth 2(Δf + f_max) and FM noise-immunity gain."
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <label htmlFor="ctrl-fm-dev" className="font-medium text-slate-700 dark:text-slate-300">
              Peak Deviation <Sym base="Δf" italic={false} />
            </label>
            <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400 font-semibold">
              {(config.fm.frequencyDeviationHz / 1000).toFixed(1)} kHz
            </span>
          </div>
          <input
            id="ctrl-fm-dev"
            type="range"
            min={1000}
            max={25000}
            step={500}
            value={config.fm.frequencyDeviationHz}
            onChange={(e) => updateFm({ frequencyDeviationHz: Number(e.target.value) })}
            className="lab-slider w-full"
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
            <span>1.0 kHz</span>
            <span>
              <Sym base="β" italic={false} /> = {beta.toFixed(2)}
            </span>
            <span>25.0 kHz</span>
          </div>
        </div>
      </section>

      {/* 4. AWGN Channel */}
      <section className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            04. AWGN Channel
          </h3>
          <InfoTooltip
            label="AWGN channel SNR"
            text="Sets reference baseband SNR γ = P_tx / (N₀·W) shared identically by AM and FM. Lowering γ pushes the wideband FM IF CNR toward the ~10 dB threshold knee."
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <label htmlFor="ctrl-channel-snr" className="font-medium text-slate-700 dark:text-slate-300">
              Channel Reference SNR (<Sym base="γ" italic={false} />)
            </label>
            <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-semibold">
              {config.channel.snr0Db} dB
            </span>
          </div>
          <input
            id="ctrl-channel-snr"
            type="range"
            min={2}
            max={45}
            step={1}
            value={config.channel.snr0Db}
            onChange={(e) => updateChannel({ snr0Db: Number(e.target.value) })}
            className="lab-slider w-full"
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
            <span>2 dB (Weak)</span>
            <span>20 dB (Nom)</span>
            <span>45 dB (Clean)</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Noise Seed: #{config.channel.noiseSeed}
          </span>
          <button
            type="button"
            onClick={() =>
              updateChannel({ noiseSeed: Math.floor(1000 + Math.random() * 8999) })
            }
            className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 underline underline-offset-2 cursor-pointer"
          >
            New Realization
          </button>
        </div>
      </section>

      {/* 5. Receiver Settings */}
      <section className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            05. Receiver &amp; IF Filters
          </h3>
          <InfoTooltip
            label="Receiver IF and LPF bandwidths"
            text="Configure shared RF carrier f_c and IF bandpass / audio LPF cutoffs. Auto mode tracks 2.1·W for AM and Carson's rule 2(Δf + f_max) for FM."
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <label htmlFor="ctrl-rx-fc" className="font-medium text-slate-700 dark:text-slate-300">
              Carrier Frequency <Sym base="f" sub="c" />
            </label>
            <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {(spectralGuard.effectiveCarrierFreqHz / 1000).toFixed(0)} kHz
              {spectralGuard.adjusted ? ' (guarded)' : ''}
            </span>
          </div>
          <input
            id="ctrl-rx-fc"
            type="range"
            min={35000}
            max={100000}
            step={1000}
            value={config.receiver.carrierFreqHz}
            onChange={(e) => updateReceiver({ carrierFreqHz: Number(e.target.value) })}
            className="lab-slider w-full"
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
            <span>35 kHz</span>
            <span>Min safe: {(spectralGuard.minSafeCarrierFreqHz / 1000).toFixed(0)} kHz</span>
            <span>100 kHz</span>
          </div>
          {spectralGuard.adjusted && spectralGuard.reason && (
            <div className="mt-2 text-[11px] leading-relaxed text-blue-900 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded px-2.5 py-2">
              <MathText text={spectralGuard.reason} />
            </div>
          )}
        </div>

        <label className="flex items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
          <span className="font-medium">Auto-Track Optimal IF &amp; LPF</span>
          <input
            type="checkbox"
            checked={config.receiver.autoIfBandwidth}
            onChange={(e) =>
              updateReceiver({
                autoIfBandwidth: e.target.checked,
                amIfBandwidthHz: effectiveAmIfHz,
                fmIfBandwidthHz: effectiveFmIfHz,
                lpfCutoffHz: effectiveLpfHz,
              })
            }
            className="h-4 w-4 accent-slate-900 dark:accent-blue-400 rounded cursor-pointer"
          />
        </label>

        {config.receiver.autoIfBandwidth ? (
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-2 space-y-1">
            <div className="flex justify-between">
              <span>AM IF Passband:</span>
              <span className="text-slate-800 dark:text-slate-200">
                {(effectiveAmIfHz / 1000).toFixed(2)} kHz
              </span>
            </div>
            <div className="flex justify-between">
              <span>FM IF (Carson+):</span>
              <span className="text-slate-800 dark:text-slate-200">
                {(effectiveFmIfHz / 1000).toFixed(1)} kHz
              </span>
            </div>
            <div className="flex justify-between">
              <span>
                Audio LPF <Sym base="W" />:
              </span>
              <span className="text-slate-800 dark:text-slate-200">
                {(effectiveLpfHz / 1000).toFixed(2)} kHz
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 text-slate-600 dark:text-slate-300">
              <span>
                LPF Gain @ <Sym base="f" sub="max" />:
              </span>
              <span className="text-slate-900 dark:text-slate-100">
                {lpfGainAtMaxFreqDb.toFixed(2)} dB
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 pt-1">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="ctrl-am-if" className="text-slate-700 dark:text-slate-300">
                  AM IF Bandwidth
                </label>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {(config.receiver.amIfBandwidthHz / 1000).toFixed(1)} kHz
                </span>
              </div>
              <input
                id="ctrl-am-if"
                type="range"
                min={2000}
                max={30000}
                step={500}
                value={config.receiver.amIfBandwidthHz}
                onChange={(e) => updateReceiver({ amIfBandwidthHz: Number(e.target.value) })}
                className="lab-slider w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="ctrl-fm-if" className="text-slate-700 dark:text-slate-300">
                  FM IF Bandwidth
                </label>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {(config.receiver.fmIfBandwidthHz / 1000).toFixed(1)} kHz
                </span>
              </div>
              <input
                id="ctrl-fm-if"
                type="range"
                min={4000}
                max={80000}
                step={1000}
                value={config.receiver.fmIfBandwidthHz}
                onChange={(e) => updateReceiver({ fmIfBandwidthHz: Number(e.target.value) })}
                className="lab-slider w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="ctrl-lpf" className="text-slate-700 dark:text-slate-300">
                  Audio LPF Cutoff <Sym base="W" />
                </label>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {(config.receiver.lpfCutoffHz / 1000).toFixed(2)} kHz ({lpfGainAtMaxFreqDb.toFixed(2)} dB @{' '}
                  <Sym base="f" sub="max" />)
                </span>
              </div>
              <input
                id="ctrl-lpf"
                type="range"
                min={1000}
                max={8000}
                step={250}
                value={config.receiver.lpfCutoffHz}
                onChange={(e) => updateReceiver({ lpfCutoffHz: Number(e.target.value) })}
                className="lab-slider w-full"
              />
              {lpfGainAtMaxFreqDb < -0.5 && (
                <div className="mt-1 text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                  Manual <Sym base="W" /> &lt; 1.15·<Sym base="f" sub="max" /> attenuates upper message components (
                  {lpfGainAtMaxFreqDb.toFixed(1)} dB @ {Math.round(messageMaxFreqHz)} Hz).
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </aside>
  );
}
