import { ReactNode, useEffect, useRef, useState } from 'react';
import { MathText } from '../MathSymbol';

export interface TimeSeriesTrace {
  label: string;
  data: Float64Array;
  color: string;
  dashed?: boolean;
  lineWidth?: number;
}

interface TimeSeriesChartProps {
  title: ReactNode;
  subtitle?: ReactNode;
  sampleRateHz: number;
  timeSec: Float64Array;
  traces: TimeSeriesTrace[];
  windowMs: number; // Visible time span from offsetMs
  offsetMs?: number;
  yMin?: number;
  yMax?: number;
  yUnit?: string;
  height?: number;
  isDark?: boolean;
  testId?: string;
}

export function TimeSeriesChart({
  title,
  subtitle,
  sampleRateHz,
  timeSec,
  traces,
  windowMs,
  offsetMs = 0,
  yMin,
  yMax,
  yUnit = 'V',
  height = 220,
  isDark = false,
  testId,
}: TimeSeriesChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    tMs: number;
    values: { label: string; value: number; color: string }[];
  } | null>(null);

  const startIdx = Math.max(0, Math.floor((offsetMs / 1000) * sampleRateHz));
  const count = Math.max(8, Math.floor((windowMs / 1000) * sampleRateHz));
  const endIdx = Math.min(timeSec.length, startIdx + count);

  // Determine Y bounds across visible window
  let minVal = yMin ?? Infinity;
  let maxVal = yMax ?? -Infinity;
  if (yMin === undefined || yMax === undefined) {
    for (const trace of traces) {
      for (let i = startIdx; i < endIdx; i++) {
        const v = trace.data[i];
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || maxVal - minVal < 1e-6) {
      minVal = -1.2;
      maxVal = 1.2;
    } else {
      const pad = (maxVal - minVal) * 0.14;
      if (yMin === undefined) minVal -= pad;
      if (yMax === undefined) maxVal += pad;
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const width = container.clientWidth;
      if (width <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const padL = 52;
      const padR = 26;
      const padT = 12;
      const padB = 26;
      const plotW = Math.max(10, width - padL - padR);
      const plotH = Math.max(10, height - padT - padB);

      // Adaptive light/dark lab oscilloscope surface
      ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Grid lines (5 horizontal, 8 vertical)
      ctx.strokeStyle = isDark ? '#1e293b' : '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let r = 0; r <= 4; r++) {
        const y = Math.round(padT + (plotH * r) / 4) + 0.5;
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
      }
      for (let c = 0; c <= 8; c++) {
        const x = Math.round(padL + (plotW * c) / 8) + 0.5;
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
      }
      ctx.stroke();

      // Zero axis highlight if within range
      if (minVal < 0 && maxVal > 0) {
        const zeroY = padT + ((maxVal - 0) / (maxVal - minVal)) * plotH;
        ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, zeroY);
        ctx.lineTo(padL + plotW, zeroY);
        ctx.stroke();
      }

      // Axis labels
      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let r = 0; r <= 4; r++) {
        const val = maxVal - ((maxVal - minVal) * r) / 4;
        const y = padT + (plotH * r) / 4;
        const labelStr = Math.abs(val) >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(2);
        ctx.fillText(labelStr, padL - 6, y);
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let c = 0; c <= 4; c++) {
        const x = padL + (plotW * c) / 4;
        const tVal = offsetMs + (windowMs * c) / 4;
        ctx.fillText(`${tVal.toFixed(1)} ms`, x, padT + plotH + 6);
      }

      // Clip plot region
      ctx.save();
      ctx.beginPath();
      ctx.rect(padL, padT, plotW, plotH);
      ctx.clip();

      const visibleCount = endIdx - startIdx;
      const stride = Math.max(1, Math.floor(visibleCount / (plotW * 2)));

      for (const trace of traces) {
        ctx.strokeStyle = trace.color;
        ctx.lineWidth = trace.lineWidth ?? 1.6;
        ctx.setLineDash(trace.dashed ? [4, 3] : []);
        ctx.beginPath();

        let started = false;
        for (let i = startIdx; i < endIdx; i += stride) {
          const x = padL + ((i - startIdx) / Math.max(1, visibleCount - 1)) * plotW;
          const yNorm = (maxVal - trace.data[i]) / (maxVal - minVal);
          const y = padT + yNorm * plotH;
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      // Plot frame border
      ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(padL + 0.5, padT + 0.5, plotW, plotH);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [traces, startIdx, endIdx, minVal, maxVal, windowMs, offsetMs, height, isDark]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const padL = 52;
    const padR = 26;
    const plotW = Math.max(10, rect.width - padL - padR);
    const relX = e.clientX - rect.left - padL;
    if (relX < 0 || relX > plotW) {
      setHoverInfo(null);
      return;
    }
    const frac = relX / plotW;
    const idx = Math.min(
      endIdx - 1,
      Math.max(startIdx, startIdx + Math.round(frac * (endIdx - startIdx - 1)))
    );
    const tMs = timeSec[idx] * 1000;
    setHoverInfo({
      tMs,
      values: traces.map((tr) => ({
        label: tr.label,
        value: tr.data[idx],
        color: tr.color,
      })),
    });
  };

  return (
    <div
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-3.5 transition-colors"
      data-testid={testId}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {traces.map((t) => (
            <span
              key={t.label}
              className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium"
            >
              <span
                className="inline-block w-3 h-0.5"
                style={{
                  backgroundColor: t.dashed ? 'transparent' : t.color,
                  borderTop: t.dashed ? `2px dashed ${t.color}` : 'none',
                }}
              />
              <MathText text={t.label} />
            </span>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative w-full">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverInfo(null)}
          className="block w-full cursor-crosshair"
        />
        {hoverInfo && (
          <div className="pointer-events-none absolute top-3 right-4 bg-slate-900/95 dark:bg-slate-800/95 text-slate-50 border border-slate-700 px-2.5 py-1.5 rounded text-[11px] font-mono tabular-nums flex items-center gap-3">
            <span className="text-slate-300">t = {hoverInfo.tMs.toFixed(3)} ms</span>
            {hoverInfo.values.map((v) => (
              <span key={v.label} className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 inline-block" style={{ backgroundColor: v.color }} />
                <span>
                  {Math.abs(v.value) >= 1000 ? `${(v.value / 1000).toFixed(2)}k` : v.value.toFixed(3)}{' '}
                  {yUnit}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
