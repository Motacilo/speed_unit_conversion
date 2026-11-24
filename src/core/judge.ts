import { problemFactor } from './convert';
import type { Question } from './generator';
import {
  div,
  eq,
  exactRoot,
  isZero,
  mul,
  ONE,
  parseDecimal,
  powerOf10Exponent,
  pow10,
  rat,
  roundToFraction,
  roundToSig,
  sigStep,
  sub,
  type Rational,
} from './rational';

/** strict＝競うモード（厳密一致）／lenient＝練習（小数第2位までの問題では最後の桁 ±1 を許容） */
export type JudgeMode = 'strict' | 'lenient';

export type Hint =
  | { readonly kind: 'digit-shift'; readonly exponent: number }
  | { readonly kind: 'inverse' }
  | { readonly kind: 'dimension'; readonly power: 2 | 3 }
  | { readonly kind: 'last-digit'; readonly offset: number };

export type JudgeResult =
  | { readonly status: 'invalid' }
  | { readonly status: 'correct' }
  /** 練習で ±1 を許容した正解。offset は最後の桁が何だけずれたか。 */
  | { readonly status: 'correct-offset'; readonly offset: number }
  | { readonly status: 'wrong'; readonly hint?: Hint };

const SQUARE_UNITS = new Set(['mm2', 'cm2', 'm2', 'km2', 'in2', 'ft2', 'yd2', 'mi2']);
const CUBIC_UNITS = new Set(['mm3', 'cm3', 'm3', 'km3', 'in3', 'ft3']);

/** 正解として比較する値。小数第 dp 位までの問題なら丸めた値、割り切れる問題なら正確な値。 */
export function expectedValue(q: Question): Rational {
  if (q.spec.kind === 'dp') return roundToFraction(q.answer, q.spec.dp);
  if (q.spec.kind === 'sig') return roundToSig(q.answer, q.spec.sig);
  return q.answer;
}

function sameAnswer(q: Question, p: Rational, x: Rational): boolean {
  if (q.spec.kind === 'dp') return eq(roundToFraction(p, q.spec.dp), roundToFraction(x, q.spec.dp));
  if (q.spec.kind === 'sig') return eq(roundToSig(p, q.spec.sig), roundToSig(x, q.spec.sig));
  return eq(p, x);
}

function detectHint(q: Question, p: Rational): Hint | undefined {
  if (isZero(p) || isZero(q.answer)) return undefined;
  const k = problemFactor(q.from, q.to);

  // 次元の取り違え（面積は長さの2乗、体積は長さの3乗）
  if (k) {
    const power: 2 | 3 | null =
      SQUARE_UNITS.has(q.from.id) && SQUARE_UNITS.has(q.to.id)
        ? 2
        : CUBIC_UNITS.has(q.from.id) && CUBIC_UNITS.has(q.to.id)
          ? 3
          : null;
    if (power) {
      const root = exactRoot(k, power);
      if (root && !eq(root, k) && sameAnswer(q, p, mul(q.value, root))) return { kind: 'dimension', power };
    }
    // 掛け算と割り算の逆
    if (!eq(k, ONE) && sameAnswer(q, p, div(q.value, k))) return { kind: 'inverse' };
  }

  // 桁ずれ
  const exp = powerOf10Exponent(div(p, q.answer));
  if (exp !== null && exp !== 0) return { kind: 'digit-shift', exponent: exp };
  return undefined;
}

export function judge(q: Question, input: string, mode: JudgeMode): JudgeResult {
  const p = parseDecimal(input);
  if (!p) return { status: 'invalid' };

  if (q.spec.kind === 'exact') {
    if (eq(p, q.answer)) return { status: 'correct' };
    const hint = detectHint(q, p);
    return hint ? { status: 'wrong', hint } : { status: 'wrong' };
  }

  // 小数第 dp 位／有効数字 sig 桁まで：入力も同じ桁に四捨五入して比べる
  const target = expectedValue(q);
  const rounded =
    q.spec.kind === 'sig' ? roundToSig(p, q.spec.sig) : roundToFraction(p, q.spec.dp);
  if (eq(rounded, target)) return { status: 'correct' };
  const step = q.spec.kind === 'sig' ? sigStep(target, q.spec.sig) : rat(1n, pow10(q.spec.dp));
  const ratio = div(sub(rounded, target), step);
  if (ratio.d === 1n && (ratio.n === 1n || ratio.n === -1n)) {
    const offset = Number(ratio.n);
    if (mode === 'lenient') return { status: 'correct-offset', offset };
    return { status: 'wrong', hint: { kind: 'last-digit', offset } };
  }
  const hint = detectHint(q, p);
  return hint ? { status: 'wrong', hint } : { status: 'wrong' };
}
