import { HelpCircle } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { MathText } from './MathSymbol';

interface InfoTooltipProps {
  label: string;
  text: ReactNode;
}

export function InfoTooltip({ label, text }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={`Engineering note: ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded p-0.5 transition-colors cursor-pointer"
      >
        <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 bottom-full mb-1.5 w-64 z-30 bg-slate-900 dark:bg-slate-800 text-slate-50 text-xs leading-relaxed p-2.5 rounded border border-slate-700 dark:border-slate-600 shadow-lg pointer-events-none font-normal normal-case tracking-normal"
        >
          {typeof text === 'string' ? <MathText text={text} /> : text}
        </span>
      )}
    </span>
  );
}
