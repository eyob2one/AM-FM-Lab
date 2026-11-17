import { CheckCircle2, Play, XCircle } from 'lucide-react';
import { VerificationCheck } from '../dsp/types';
import { MathText } from './MathSymbol';

interface VerificationViewProps {
  checks: VerificationCheck[];
  liveChecks: VerificationCheck[];
  lastRunTime: string | null;
  onRunVerification: () => void;
}

export function VerificationView({
  checks,
  liveChecks,
  lastRunTime,
  onRunVerification,
}: VerificationViewProps) {
  const passCount = checks.filter((c) => c.passed).length;
  const livePassCount = liveChecks.filter((c) => c.passed).length;
  const allPassed =
    checks.length > 0 &&
    passCount === checks.length &&
    (liveChecks.length === 0 || livePassCount === liveChecks.length);

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Engineering &amp; Mathematical Verification Suite
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Executes automated independent assertions (decoupled from receiver filters and metric helpers) plus live checks against your current Simulator settings.
          </p>
        </div>
        <button
          type="button"
          onClick={onRunVerification}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Play className="w-3.5 h-3.5" aria-hidden="true" />
          Run Verification Suite
        </button>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-4 transition-colors">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Suite Status
          </div>
          <div
            className={`mt-1 text-xl font-semibold flex items-center gap-2 ${
              allPassed
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
            data-testid="verification-status"
          >
            {allPassed ? (
              <>
                <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                <span>All Invariants Verified</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5" aria-hidden="true" />
                <span>Check Failed</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-4 transition-colors">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Checks Passing
          </div>
          <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {passCount + livePassCount} / {checks.length + liveChecks.length}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {passCount}/{checks.length} benchmark · {livePassCount}/{liveChecks.length} live config
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-4 transition-colors">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Last Executed
          </div>
          <div className="mt-1 text-base font-mono tabular-nums text-slate-800 dark:text-slate-200">
            {lastRunTime ?? 'On Load'}
          </div>
        </div>
      </div>

      {/* Standardized Benchmark Check Results Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden transition-colors">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Standardized Engineering Benchmark Checks ({passCount} / {checks.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Decoupled numerical invariants covering Parseval balance, carrier-frequency-independent power parity, Pre-LPF AM overmodulation, multitone continuity, and exact experiment replay
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse" data-testid="verification-table">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <th className="py-3 px-4 font-semibold">Verification Check</th>
                <th className="py-3 px-4 font-semibold">Domain</th>
                <th className="py-3 px-4 font-semibold">Acceptance Criterion</th>
                <th className="py-3 px-4 font-semibold">Measured Numerical Result</th>
                <th className="py-3 px-4 font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {checks.map((chk) => (
                <tr key={chk.id} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      <MathText text={chk.title} />
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      <MathText text={chk.detail} />
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {chk.category}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                    <MathText text={chk.expected} />
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    <MathText text={chk.measured} />
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 font-mono font-semibold ${
                        chk.passed
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {chk.passed ? '● PASS' : '✖ FAIL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Simulator Configuration Verification Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden transition-colors">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Active Simulator Live-Config Verification ({livePassCount} / {liveChecks.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Continuously evaluates your current Simulator parameters using independent time-domain and DFT primitives
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse" data-testid="live-verification-table">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <th className="py-3 px-4 font-semibold">Live Check</th>
                <th className="py-3 px-4 font-semibold">Domain</th>
                <th className="py-3 px-4 font-semibold">Acceptance Criterion</th>
                <th className="py-3 px-4 font-semibold">Measured Numerical Result</th>
                <th className="py-3 px-4 font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {liveChecks.map((chk) => (
                <tr key={chk.id} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      <MathText text={chk.title} />
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      <MathText text={chk.detail} />
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {chk.category}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                    <MathText text={chk.expected} />
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    <MathText text={chk.measured} />
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 font-mono font-semibold ${
                        chk.passed
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {chk.passed ? '● PASS' : '✖ FAIL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
