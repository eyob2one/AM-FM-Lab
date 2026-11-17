import { useState } from 'react';
import { NoiseSweepResult } from '../../dsp/types';
import { Sym } from '../MathSymbol';

interface SweepCurveChartProps {
  sweep: NoiseSweepResult;
  isDark?: boolean;
}

export function SweepCurveChart({ sweep, isDark = false }: SweepCurveChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const { points, thresholdGammaDb } = sweep;
  if (points.length === 0) return null;

  const width = 760;
  const height = 315;
  const padL = 56;
  const padR = 24;
  const padT = 20;
  const padB = 42;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const minX = points[0].snr0Db;
  const maxX = points[points.length - 1].snr0Db;

  let minY = -10;
  let maxY = 50;
  for (const p of points) {
    minY = Math.min(
      minY,
      p.amOutputSnrDb - p.amOutputSnrStdDb,
      p.fmOutputSnrDb - p.fmOutputSnrStdDb,
      p.amTheorySnrDb
    );
    maxY = Math.max(
      maxY,
      p.amOutputSnrDb + p.amOutputSnrStdDb,
      p.fmOutputSnrDb + p.fmOutputSnrStdDb,
      p.fmTheorySnrDb,
      p.fmCompositeTheorySnrDb
    );
  }
  minY = Math.floor(minY / 10) * 10;
  maxY = Math.ceil((maxY + 4) / 10) * 10;

  const toX = (x: number) => padL + ((x - minX) / Math.max(1, maxX - minX)) * plotW;
  const toY = (y: number) => padT + ((maxY - y) / Math.max(1, maxY - minY)) * plotH;

  const buildPath = (getter: (p: (typeof points)[number]) => number) =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.snr0Db).toFixed(1)} ${toY(getter(p)).toFixed(1)}`)
      .join(' ');

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  const amColor = isDark ? '#60a5fa' : '#2563eb';
  const amTheoryColor = isDark ? '#93c5fd' : '#60a5fa';
  const fmColor = isDark ? '#fbbf24' : '#d97706';
  const fmTheoryColor = isDark ? '#fcd34d' : '#fbbf24';
  const compositeColor = isDark ? '#cbd5e1' : '#334155';
  const threshColor = isDark ? '#f87171' : '#dc2626';
  const gridHStroke = isDark ? '#1e293b' : '#e2e8f0';
  const gridVStroke = isDark ? '#172033' : '#f1f5f9';
  const frameStroke = isDark ? '#334155' : '#cbd5e1';
  const dotOutline = isDark ? '#0f172a' : '#ffffff';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-4 transition-colors">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Monte Carlo Noise-Sweep Performance &amp; FM Threshold Region
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {sweep.realizationsPerPoint}-seed ensemble mean ± 1σ Output SNR vs{' '}
            <Sym base="γ" italic={false} /> = <Sym base="P" sub="tx" /> / (<Sym base="N" sub="0" /> ·{' '}
            <Sym base="W" />) (seeds {sweep.seedsUsed.join(', ')})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3.5 text-xs">
          <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
            <span className="w-3 h-0.5 bg-blue-600 dark:bg-blue-400 inline-block" /> AM Mean (±1σ)
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-blue-400 inline-block" /> AM Theory
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
            <span className="w-3 h-0.5 bg-amber-600 dark:bg-amber-400 inline-block" /> FM Mean (±1σ)
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-amber-400 inline-block" /> FM Linear Theory
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-3 h-0.5 border-t-2 border-dotted border-slate-700 dark:border-slate-300 inline-block" /> FM Composite Pred
          </span>
        </div>
      </div>

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-[340px] select-none"
          role="img"
          aria-label="AM and FM Monte Carlo Mean Output SNR vs Input Reference SNR Noise Sweep Chart"
        >
          {/* Grid */}
          {[0, 1, 2, 3, 4, 5].map((r) => {
            const yVal = minY + ((maxY - minY) * r) / 5;
            const y = toY(yVal);
            return (
              <g key={`y-${r}`}>
                <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke={gridHStroke} strokeWidth="1" />
                <text
                  x={padL - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                >
                  {yVal.toFixed(0)} dB
                </text>
              </g>
            );
          })}

          {points
            .filter((_, idx) => idx % 2 === 0 || idx === points.length - 1)
            .map((p) => {
              const x = toX(p.snr0Db);
              return (
                <g key={`x-${p.snr0Db}`}>
                  <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke={gridVStroke} strokeWidth="1" />
                  <text
                    x={x}
                    y={padT + plotH + 16}
                    textAnchor="middle"
                    className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                  >
                    {p.snr0Db} dB
                  </text>
                </g>
              );
            })}

          {/* Axis title with real SVG tspan subscripts */}
          <text
            x={padL + plotW / 2}
            y={height - 6}
            textAnchor="middle"
            className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
          >
            Channel Reference SNR γ = <tspan fontStyle="italic">P</tspan>
            <tspan dy="2.5" fontSize="8">tx</tspan>
            <tspan dy="-2.5"> / (</tspan>
            <tspan fontStyle="italic">N</tspan>
            <tspan dy="2.5" fontSize="8">0</tspan>
            <tspan dy="-2.5"> · </tspan>
            <tspan fontStyle="italic">W</tspan>
            <tspan>) [dB]</tspan>
          </text>

          {/* Threshold region shading */}
          {thresholdGammaDb !== null && (
            <g>
              <rect
                x={padL}
                y={padT}
                width={Math.max(0, toX(thresholdGammaDb) - padL)}
                height={plotH}
                fill={threshColor}
                opacity={isDark ? 0.1 : 0.06}
              />
              <line
                x1={toX(thresholdGammaDb)}
                y1={padT}
                x2={toX(thresholdGammaDb)}
                y2={padT + plotH}
                stroke={threshColor}
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text
                x={toX(thresholdGammaDb) + 6}
                y={padT + 14}
                className="fill-rose-700 dark:fill-rose-400 text-[10px] font-mono font-semibold"
              >
                FM Threshold (γ ≤ {thresholdGammaDb} dB)
              </text>
            </g>
          )}

          {/* FM-below-AM Crossover marker (if observed) */}
          {sweep.crossoverObserved &&
            sweep.crossoverGammaDb !== null &&
            sweep.crossoverOutputSnrDb !== null && (
              <g>
                <circle
                  cx={toX(sweep.crossoverGammaDb)}
                  cy={toY(sweep.crossoverOutputSnrDb)}
                  r="5.5"
                  fill="none"
                  stroke={isDark ? '#e2e8f0' : '#0f172a'}
                  strokeWidth="1.8"
                />
                <text
                  x={toX(sweep.crossoverGammaDb) + 8}
                  y={toY(sweep.crossoverOutputSnrDb) + 12}
                  className="fill-slate-800 dark:fill-slate-200 text-[10px] font-mono font-semibold"
                >
                  FM &lt; AM (γ≈{sweep.crossoverGammaDb.toFixed(1)} dB)
                </text>
              </g>
            )}

          {/* Theoretical curves */}
          <path
            d={buildPath((p) => p.amTheorySnrDb)}
            fill="none"
            stroke={amTheoryColor}
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <path
            d={buildPath((p) => p.fmTheorySnrDb)}
            fill="none"
            stroke={fmTheoryColor}
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <path
            d={buildPath((p) => p.fmCompositeTheorySnrDb)}
            fill="none"
            stroke={compositeColor}
            strokeWidth="1.3"
            strokeDasharray="2 3"
          />

          {/* Empirical Monte Carlo mean curves */}
          <path d={buildPath((p) => p.amOutputSnrDb)} fill="none" stroke={amColor} strokeWidth="2.2" />
          <path d={buildPath((p) => p.fmOutputSnrDb)} fill="none" stroke={fmColor} strokeWidth="2.2" />

          {/* Error bars (+/- 1 sigma) + Data nodes + interactive hit targets */}
          {points.map((p, idx) => {
            const x = toX(p.snr0Db);
            const yAm = toY(p.amOutputSnrDb);
            const yAmHi = toY(p.amOutputSnrDb + p.amOutputSnrStdDb);
            const yAmLo = toY(p.amOutputSnrDb - p.amOutputSnrStdDb);
            const yFm = toY(p.fmOutputSnrDb);
            const yFmHi = toY(p.fmOutputSnrDb + p.fmOutputSnrStdDb);
            const yFmLo = toY(p.fmOutputSnrDb - p.fmOutputSnrStdDb);
            const isActive = hoverIdx === idx;
            return (
              <g key={p.snr0Db}>
                {isActive && (
                  <line
                    x1={x}
                    y1={padT}
                    x2={x}
                    y2={padT + plotH}
                    stroke={isDark ? '#64748b' : '#475569'}
                    strokeWidth="1"
                  />
                )}
                {p.amOutputSnrStdDb > 0.05 && (
                  <g stroke={amColor} strokeWidth="1" opacity="0.6">
                    <line x1={x} y1={yAmHi} x2={x} y2={yAmLo} />
                    <line x1={x - 2.5} y1={yAmHi} x2={x + 2.5} y2={yAmHi} />
                    <line x1={x - 2.5} y1={yAmLo} x2={x + 2.5} y2={yAmLo} />
                  </g>
                )}
                {p.fmOutputSnrStdDb > 0.05 && (
                  <g stroke={p.belowFmThreshold ? threshColor : fmColor} strokeWidth="1" opacity="0.65">
                    <line x1={x} y1={yFmHi} x2={x} y2={yFmLo} />
                    <line x1={x - 2.5} y1={yFmHi} x2={x + 2.5} y2={yFmHi} />
                    <line x1={x - 2.5} y1={yFmLo} x2={x + 2.5} y2={yFmLo} />
                  </g>
                )}
                <circle
                  cx={x}
                  cy={yAm}
                  r={isActive ? 4.5 : 3}
                  fill={amColor}
                  stroke={dotOutline}
                  strokeWidth="1"
                />
                <circle
                  cx={x}
                  cy={yFm}
                  r={isActive ? 4.5 : 3}
                  fill={p.belowFmThreshold ? threshColor : fmColor}
                  stroke={dotOutline}
                  strokeWidth="1"
                />
                <rect
                  x={x - plotW / (points.length * 2)}
                  y={padT}
                  width={plotW / points.length}
                  height={plotH}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
              </g>
            );
          })}

          <rect
            x={padL}
            y={padT}
            width={plotW}
            height={plotH}
            fill="none"
            stroke={frameStroke}
            strokeWidth="1"
          />
        </svg>

        {hovered && (
          <div className="mt-2 flex flex-wrap items-center gap-3.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded px-3 py-1.5 text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-slate-100">γ = {hovered.snr0Db} dB</span>
            <span>AM CNR: {hovered.amInputCnrDb.toFixed(1)} dB</span>
            <span className="text-blue-700 dark:text-blue-400">
              AM Out: {hovered.amOutputSnrDb.toFixed(1)}±{hovered.amOutputSnrStdDb.toFixed(2)} dB (Theory{' '}
              {hovered.amTheorySnrDb.toFixed(1)} dB)
            </span>
            <span>FM CNR: {hovered.fmInputCnrDb.toFixed(1)} dB</span>
            <span
              className={
                hovered.belowFmThreshold
                  ? 'text-rose-700 dark:text-rose-400 font-semibold'
                  : 'text-amber-700 dark:text-amber-400'
              }
            >
              FM Out: {hovered.fmOutputSnrDb.toFixed(1)}±{hovered.fmOutputSnrStdDb.toFixed(2)} dB (Comp{' '}
              {hovered.fmCompositeTheorySnrDb.toFixed(1)} / Lin {hovered.fmTheorySnrDb.toFixed(1)} dB)
              {hovered.belowFmThreshold ? ' [BELOW THRESHOLD]' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
