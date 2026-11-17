import { Fragment, ReactNode } from 'react';

interface SymProps {
  base: string;
  sub?: string;
  sup?: string;
  italic?: boolean;
  suffix?: string;
}

/**
 * Renders an italicized mathematical symbol (or upright multi-letter identifier)
 * with properly aligned HTML subscript/superscript instead of ASCII underscores.
 */
export function Sym({ base, sub, sup, italic = true, suffix }: SymProps) {
  const isGreek = /^[α-ωΑ-ΩΔΣΠ]$/.test(base);
  const useItalic = italic && !isGreek && base.length <= 2;

  return (
    <span className="math-expr inline-flex items-baseline whitespace-nowrap">
      <span className={useItalic ? 'math-var' : 'math-upright'}>{base}</span>
      {sub && <sub className="math-sub">{sub}</sub>}
      {sup && <sup className="math-sup">{sup}</sup>}
      {suffix && <span className="math-upright">{suffix}</span>}
    </span>
  );
}

/**
 * Stacked mathematical fraction for equations in Learning & reference sections.
 */
export function Frac({ num, den }: { num: ReactNode; den: ReactNode }) {
  return (
    <span className="inline-flex flex-col items-center align-middle mx-1 text-[0.92em] leading-tight">
      <span className="px-1.5 pb-0.5 border-b border-current">{num}</span>
      <span className="px-1.5 pt-0.5">{den}</span>
    </span>
  );
}

const SYMBOL_TOKEN_REGEX =
  /(SNR_out,AM|SNR_out,FM|SNR_clean_floor|SNR_linear|N₀|N_0|f_c_eff|f_max|f_m|f_c|f_i|f₀|f₁|f₂|f₃|B_AM|B_FM|B_IF|B_car|P_tx|P_LSB|P_USB|P_AM|P_FM|P_SB|P_meas|P_m|P_c|A_c|A_m|F_s|s_AM|s_FM|r_IF,AM|r_IF,FM|m_n|μ_env|σ_n|Δf_rx|W_LPF|E_max|E_min|2f_m\+|2f_m)/g;

const TOKEN_MAP: Record<string, SymProps> = {
  'SNR_out,AM': { base: 'SNR', sub: 'out,AM', italic: false },
  'SNR_out,FM': { base: 'SNR', sub: 'out,FM', italic: false },
  'SNR_clean_floor': { base: 'SNR', sub: 'clean,floor', italic: false },
  'SNR_linear': { base: 'SNR', sub: 'linear', italic: false },
  'N₀': { base: 'N', sub: '0' },
  'N_0': { base: 'N', sub: '0' },
  'f_c_eff': { base: 'f', sub: 'c,eff' },
  'f_max': { base: 'f', sub: 'max' },
  'f_m': { base: 'f', sub: 'm' },
  'f_c': { base: 'f', sub: 'c' },
  'f_i': { base: 'f', sub: 'i' },
  'f₀': { base: 'f', sub: '0' },
  'f₁': { base: 'f', sub: '1' },
  'f₂': { base: 'f', sub: '2' },
  'f₃': { base: 'f', sub: '3' },
  'B_AM': { base: 'B', sub: 'AM' },
  'B_FM': { base: 'B', sub: 'FM' },
  'B_IF': { base: 'B', sub: 'IF' },
  'B_car': { base: 'B', sub: 'car' },
  'P_tx': { base: 'P', sub: 'tx' },
  'P_LSB': { base: 'P', sub: 'LSB' },
  'P_USB': { base: 'P', sub: 'USB' },
  'P_AM': { base: 'P', sub: 'AM' },
  'P_FM': { base: 'P', sub: 'FM' },
  'P_SB': { base: 'P', sub: 'SB' },
  'P_meas': { base: 'P', sub: 'meas' },
  'P_m': { base: 'P', sub: 'm' },
  'P_c': { base: 'P', sub: 'c' },
  'A_c': { base: 'A', sub: 'c' },
  'A_m': { base: 'A', sub: 'm' },
  'F_s': { base: 'F', sub: 's' },
  's_AM': { base: 's', sub: 'AM' },
  's_FM': { base: 's', sub: 'FM' },
  'r_IF,AM': { base: 'r', sub: 'IF,AM' },
  'r_IF,FM': { base: 'r', sub: 'IF,FM' },
  'm_n': { base: 'm', sub: 'n' },
  'μ_env': { base: 'μ', sub: 'env', italic: false },
  'σ_n': { base: 'σ', sub: 'n', italic: false },
  'Δf_rx': { base: 'Δf', sub: 'rx', italic: false },
  'W_LPF': { base: 'W', sub: 'LPF' },
  'E_max': { base: 'E', sub: 'max' },
  'E_min': { base: 'E', sub: 'min' },
};

/**
 * Formats ASCII underscore tokens (f_c, f_max, P_tx, N₀, etc.) inside dynamic
 * strings into crisp real HTML subscripts so verification criteria, spectral guard
 * reasons, and tooltips render with clean mathematical typography.
 */
export function MathText({ text }: { text: string }) {
  const parts = text.split(SYMBOL_TOKEN_REGEX);
  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        if (part === '2f_m+') {
          return (
            <Fragment key={idx}>
              2<Sym base="f" sub="m" suffix="+" />
            </Fragment>
          );
        }
        if (part === '2f_m') {
          return (
            <Fragment key={idx}>
              2<Sym base="f" sub="m" />
            </Fragment>
          );
        }
        const spec = TOKEN_MAP[part];
        if (spec) {
          return <Sym key={idx} {...spec} />;
        }
        return <Fragment key={idx}>{part}</Fragment>;
      })}
    </>
  );
}
