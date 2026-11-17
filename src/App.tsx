import { Download, Moon, Sun } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ComparisonView } from './components/ComparisonView';
import { ExperimentsView } from './components/ExperimentsView';
import { LearningView } from './components/LearningView';
import { SimulatorView } from './components/SimulatorView';
import { VerificationView } from './components/VerificationView';
import {
  EXPERIMENT_PRESETS,
  runExperimentPreset,
  runNoiseSweepExperiment,
} from './dsp/experiments';
import {
  cloneSimulationConfig,
  DEFAULT_SIMULATION_CONFIG,
  resolveEffectiveBandwidthConfig,
  runSimulation,
} from './dsp/simulator';
import {
  ExperimentPreset,
  ExperimentRecord,
  NoiseSweepResult,
  SimulationConfig,
  VerificationCheck,
} from './dsp/types';
import { runEngineeringVerificationSuite, runLiveConfigVerification } from './dsp/verification';

type LabSection = 'simulator' | 'comparison' | 'experiments' | 'verification' | 'learning';
type ThemeMode = 'light' | 'dark';

const NAV_ITEMS: { id: LabSection; label: string }[] = [
  { id: 'simulator', label: 'Simulator' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'experiments', label: 'Experiments' },
  { id: 'verification', label: 'Verification' },
  { id: 'learning', label: 'Learning' },
];

export default function App() {
  const [activeSection, setActiveSection] = useState<LabSection>('simulator');
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light'
  );
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_SIMULATION_CONFIG);
  const [records, setRecords] = useState<ExperimentRecord[]>([]);
  const [sweepResult, setSweepResult] = useState<NoiseSweepResult | null>(null);
  const [checks, setChecks] = useState<VerificationCheck[]>(() =>
    runEngineeringVerificationSuite(DEFAULT_SIMULATION_CONFIG)
  );
  const [verificationTimestamp, setVerificationTimestamp] = useState<string | null>(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('am-fm-lab-theme', theme);
    } catch {
      // ignore storage quota or privacy-mode errors
    }
  }, [theme, isDark]);

  const simResult = useMemo(() => runSimulation(config, { includeSpectra: true }), [config]);

  const effectiveBw = useMemo(
    () => resolveEffectiveBandwidthConfig(config, simResult.messageMaxFreqHz),
    [config, simResult.messageMaxFreqHz]
  );

  const liveChecks = useMemo(() => runLiveConfigVerification(config), [config]);

  // Lazily populate noise sweep on first visit to Experiments so the chart is immediately rich
  useEffect(() => {
    if (activeSection === 'experiments' && sweepResult === null) {
      setSweepResult(runNoiseSweepExperiment(config, 0, 34, 2, 5));
    }
  }, [activeSection, sweepResult, config]);

  const handleRunPreset = (preset: ExperimentPreset) => {
    const rec = runExperimentPreset(preset, config);
    setRecords((prev) => [rec, ...prev]);
  };

  const handleRunAllPresets = () => {
    const batch = EXPERIMENT_PRESETS.map((p) => runExperimentPreset(p, config));
    setRecords((prev) => [...batch, ...prev]);
  };

  const handleApplyPresetToSimulator = (snr0Db: number) => {
    setConfig((prev) => ({
      ...prev,
      channel: { ...prev.channel, snr0Db },
    }));
    setActiveSection('simulator');
  };

  const handleLoadExperimentConfig = (record: ExperimentRecord) => {
    setConfig(cloneSimulationConfig(record.configSnapshot));
    setActiveSection('simulator');
  };

  const handleRunSweep = () => {
    setSweepResult(runNoiseSweepExperiment(config, 0, 34, 2, 5));
  };

  const handleRunVerification = () => {
    setChecks(runEngineeringVerificationSuite(config));
    setVerificationTimestamp(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
  };

  const handleExportReport = () => {
    const payload = {
      schemaVersion: '4.0',
      exportedAt: new Date().toISOString(),
      currentSimulation: {
        config,
        sampleRateHz: simResult.sampleRateHz,
        sampleCount: simResult.sampleCount,
        durationSec: simResult.durationSec,
        messageFrequenciesHz: simResult.messageFrequenciesHz,
        messageMaxFreqHz: simResult.messageMaxFreqHz,
        messageRms: simResult.messageRms,
        spectralGuard: simResult.spectralGuard,
        metrics: {
          am: simResult.am.metrics,
          fm: simResult.fm.metrics,
          channel: {
            gammaDb: simResult.channel.gammaDb,
            noiseSeed: config.channel.noiseSeed,
            n0WattsPerHz: simResult.channel.n0WattsPerHz,
            noiseSigma: simResult.channel.noiseSigma,
            powerParityError: simResult.channel.powerParityError,
          },
        },
      },
      recordedExperiments: records,
      noiseSweep: sweepResult,
      verificationChecks: checks,
      liveVerificationChecks: liveChecks,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `am-fm-lab-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 transition-colors">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveSection('simulator')}
            className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            AM/FM LAB
          </button>

          {/* Zone 2: 5 concise single-line navigation links */}
          <nav
            aria-label="Primary laboratory sections"
            className="flex items-center gap-4 sm:gap-6 overflow-x-auto"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`text-sm font-medium py-1 border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-blue-600 dark:border-blue-400 text-slate-900 dark:text-slate-100'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Theme toggle + Export action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="theme-toggle"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              className="inline-flex items-center justify-center p-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded transition-colors cursor-pointer shrink-0"
            >
              {isDark ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={handleExportReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Export Report</span>
              <span className="sm:hidden">Export</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5">
        {activeSection === 'simulator' && (
          <SimulatorView
            config={config}
            result={simResult}
            effectiveAmIfHz={effectiveBw.amIfBandwidthHz}
            effectiveFmIfHz={effectiveBw.fmIfBandwidthHz}
            effectiveLpfHz={effectiveBw.lpfCutoffHz}
            isDark={isDark}
            onChangeConfig={setConfig}
            onReset={() => setConfig(DEFAULT_SIMULATION_CONFIG)}
          />
        )}

        {activeSection === 'comparison' && (
          <ComparisonView config={config} result={simResult} isDark={isDark} />
        )}

        {activeSection === 'experiments' && (
          <ExperimentsView
            config={config}
            records={records}
            sweepResult={sweepResult}
            isDark={isDark}
            onRunPreset={handleRunPreset}
            onRunAllPresets={handleRunAllPresets}
            onClearRecords={() => setRecords([])}
            onRunSweep={handleRunSweep}
            onApplyPresetToSimulator={handleApplyPresetToSimulator}
            onLoadExperimentConfig={handleLoadExperimentConfig}
          />
        )}

        {activeSection === 'verification' && (
          <VerificationView
            checks={checks}
            liveChecks={liveChecks}
            lastRunTime={verificationTimestamp}
            onRunVerification={handleRunVerification}
          />
        )}

        {activeSection === 'learning' && (
          <LearningView
            config={config}
            result={simResult}
            records={records}
            sweepResult={sweepResult}
          />
        )}
      </main>
    </div>
  );
}
