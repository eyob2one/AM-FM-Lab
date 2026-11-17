import { ReactNode, useEffect, useRef, useState } from 'react';
import { MathText } from '../MathSymbol';

export interface SpectrumTrace {
  label: string;
  dataDb: Float64Array;
  color: string;
  dashed?: boolean;
}

export interface BandwidthOverlay {
  label: string;
  centerHz: number;
  bandwidthHz: number;
  color: string;
}

interface SpectrumChartProps {
  title: ReactNode;
  subtitle?: ReactNode;
  freqsHz: Float64Array;
  traces: SpectrumTrace[];
  minFreqHz: number;
  maxFreqHz: number;
  minDb?: number;
  maxDb?: number;
  overlays?: BandwidthOverlay[];
  height?: number;
  isDark?: boolean;
  testId?: string;
}

export function SpectrumChart({
  title,
  subtitle,
  freqsHz,
  traces,
  minFreqHz,
  maxFreqHz,
  minDb = -85,
  maxDb = 5,
  overlays = [],
  height = 240,
  isDark = false,
  testId,
}: SpectrumChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    freqHz: number;
    values: { label: string; db: number; color: string }[];
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || freqsHz.length < 2) return;

    const df = freqsHz[1] - freqsHz[0];
    const startBin = Math.max(0, Math.floor(minFreqHz / df));
    const endBin = Math.min(freqsHz.length - 1, Math.ceil(maxFreqHz / df));

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
      const padT = 14;
      const padB = 26;
      const plotW = Math.max(10, width - padL - padR);
      const plotH = Math.max(10, height - padT - padB);

      ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Grid lines
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

      // Shaded bandwidth overlays
      ctx.save();
      ctx.beginPath();
      ctx.rect(padL, padT, plotW, plotH);
      ctx.clip();

      for (const ov of overlays) {
        const fL = ov.centerHz - ov.bandwidthHz * 0.5;
        const fR = ov.centerHz + ov.bandwidthHz * 0.5;
        const xL = padL + ((fL - minFreqHz) / (maxFreqHz - minFreqHz)) * plotW;
        const xR = padL + ((fR - minFreqHz) / (maxFreqHz - minFreqHz)) * plotW;
        ctx.fillStyle = ov.color;
        ctx.globalAlpha = isDark ? 0.12 : 0.08;
        ctx.fillRect(xL, padT, Math.max(2, xR - xL), plotH);
        ctx.globalAlpha = isDark ? 0.7 : 0.6;
        ctx.strokeStyle = ov.color;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(xL, padT);
        ctx.lineTo(xL, padT + plotH);
        ctx.moveTo(xR, padT);
        ctx.lineTo(xR, padT + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      // Draw spectrum traces (take max per pixel column to never miss narrow peaks)
      for (const trace of traces) {
        ctx.strokeStyle = trace.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash(trace.dashed ? [4, 3] : []);
        ctx.beginPath();

        let started = false;
        const binsPerPx = (endBin - startBin) / plotW;
        if (binsPerPx <= 1.5) {
          for (let b = startBin; b <= endBin; b++) {
            const x = padL + ((freqsHz[b] - minFreqHz) / (maxFreqHz - minFreqHz)) * plotW;
            const db = Math.max(minDb, Math.min(maxDb, trace.dataDb[b]));
            const y = padT + ((maxDb - db) / (maxDb - minDb)) * plotH;
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        } else {
          for (let px = 0; px <= plotW; px++) {
            const b0 = Math.floor(startBin + px * binsPerPx);
            const b1 = Math.min(endBin, Math.ceil(startBin + (px + 1) * binsPerPx));
            let peakDb = minDb;
            for (let b = b0; b <= b1; b++) {
              if (trace.dataDb[b] > peakDb) peakDb = trace.dataDb[b];
            }
            const clamped = Math.max(minDb, Math.min(maxDb, peakDb));
            const x = padL + px;
            const y = padT + ((maxDb - clamped) / (maxDb - minDb)) * plotH;
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      // Axis labels
      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let r = 0; r <= 4; r++) {
        const dbVal = maxDb - ((maxDb - minDb) * r) / 4;
        const y = padT + (plotH * r) / 4;
        ctx.fillText(`${dbVal.toFixed(0)} dB`, padL - 6, y);
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let c = 0; c <= 4; c++) {
        const x = padL + (plotW * c) / 4;
        const fVal = minFreqHz + ((maxFreqHz - minFreqHz) * c) / 4;
        const label = fVal >= 1000 ? `${(fVal / 1000).toFixed(1)} kHz` : `${fVal.toFixed(0)} Hz`;
        ctx.fillText(label, x, padT + plotH + 6);
      }

      ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(padL + 0.5, padT + 0.5, plotW, plotH);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [freqsHz, traces, minFreqHz, maxFreqHz, minDb, maxDb, overlays, height, isDark]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || freqsHz.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const padL = 52;
    const padR = 26;
    const plotW = Math.max(10, rect.width - padL - padR);
    const relX = e.clientX - rect.left - padL;
    if (relX < 0 || relX > plotW) {
      setHoverInfo(null);
      return;
    }
    const targetF = minFreqHz + (relX / plotW) * (maxFreqHz - minFreqHz);
    const df = freqsHz[1] - freqsHz[0];
    const bin = Math.min(freqsHz.length - 1, Math.max(0, Math.round(targetF / df)));
    setHoverInfo({
      freqHz: freqsHz[bin],
      values: traces.map((tr) => ({
        label: tr.label,
        db: tr.dataDb[bin],
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
          {overlays.map((ov) => (
            <span
              key={ov.label}
              className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400"
            >
              <span
                className="inline-block w-2.5 h-2.5 opacity-30"
                style={{ backgroundColor: ov.color }}
              />
              {ov.label}
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
            <span className="text-slate-300">f = {(hoverInfo.freqHz / 1000).toFixed(2)} kHz</span>
            {hoverInfo.values.map((v) => (
              <span key={v.label} className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 inline-block" style={{ backgroundColor: v.color }} />
                <span>{v.db.toFixed(1)} dB</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
