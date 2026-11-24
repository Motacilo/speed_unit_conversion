import {
  ONE,
  add,
  div,
  eq,
  isTerminating,
  isZero,
  mul,
  significantDigits,
  sub,
  toApproxString,
  toDecimalString,
  type Rational,
} from './rational';
import type { Unit } from './units';

/** from の値 v を to の値へ換算する（すべて厳密な有理数）。 */
export function convert(v: Rational, from: Unit, to: Unit): Rational {
  if (from.dim !== to.dim) throw new Error(`dimension mismatch: ${from.id} -> ${to.id}`);
  const base = add(mul(v, from.toBase), from.offset);
  return div(sub(base, to.offset), to.toBase);
}

/**
 * 問題で使う換算の係数。
 * 同じ系統どうしは正確な比。系統をまたぐときは、si 以外の単位に有効数字3桁の係数を使う。
 * 温度のように倍率だけで換算できない組は null。
 */
export function problemFactor(from: Unit, to: Unit): Rational | null {
  if (!isLinearPair(from, to)) return null;
  if (from.system === to.system) return div(from.toBase, to.toBase);
  return div(from.practical, to.practical);
}

/** 問題の正解を求める（problemFactor に従う）。 */
export function convertProblem(v: Rational, from: Unit, to: Unit): Rational {
  const k = problemFactor(from, to);
  return k ? mul(v, k) : convert(v, from, to);
}

/** 倍率だけで換算できる（温度のような offset がない）組か */
export const isLinearPair = (from: Unit, to: Unit): boolean => isZero(from.offset) && isZero(to.offset);

/** 線形換算の係数 k（答え = 値 × k）。offset のある組では null。 */
export function linearFactor(from: Unit, to: Unit): Rational | null {
  if (!isLinearPair(from, to)) return null;
  return div(from.toBase, to.toBase);
}

export interface FactorText {
  readonly op: '×' | '/';
  readonly operand: string;
  /** 近似値などの補足 */
  readonly note?: string;
}

/**
 * 係数 k を、人が計算しやすい形で表す。
 * - k < 1 で 1/k が短い有限小数なら「/ (1/k)」（例：分 → 時間は「/ 60」）
 * - k が有限小数なら「× k」
 * - どちらでもなければ、分数（大きすぎれば近似値）
 */
export function factorText(k: Rational): FactorText {
  const inv = div(ONE, k);
  if (k.n < k.d && isTerminating(inv) && significantDigits(inv) <= 8) {
    return { op: '/', operand: toDecimalString(inv) };
  }
  if (isTerminating(k)) return { op: '×', operand: toDecimalString(k) };
  const nd = `${k.n}`.length;
  const dd = `${k.d}`.length;
  if (nd <= 12 && dd <= 12) return { op: '×', operand: `${k.n}/${k.d}`, note: `≈ ${toApproxString(k, 6)}` };
  return { op: '×', operand: toApproxString(k, 10), note: '近似値' };
}

/** 単位表・不正解時に表示する換算式の説明（問題で使う係数に従う） */
export function describeConversion(from: Unit, to: Unit): string {
  const k = problemFactor(from, to);
  if (k) {
    const f = factorText(k);
    let text = `${to.symbol} の値 = ${from.symbol} の値 ${f.op} ${f.operand}${f.note ? `（${f.note}）` : ''}`;
    const exact = linearFactor(from, to);
    if (exact && !eq(exact, k)) {
      const e = factorText(exact);
      text += `　［係数は有効数字3桁。正確には ${e.op} ${e.operand}${e.note ? `（${e.note}）` : ''}］`;
    }
    return text;
  }
  // 温度：基準 K を経由する式
  return `${to.symbol} の値 = (${from.symbol} の値 × ${toApproxString(from.toBase, 10)} + ${toApproxString(from.offset, 10)} − ${toApproxString(to.offset, 10)}) ÷ ${toApproxString(to.toBase, 10)}`;
}
