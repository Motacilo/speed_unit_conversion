import { convertProblem, linearFactor, problemFactor } from './convert';
import { Rng } from './rng';
import {
  abs,
  cmp,
  eq,
  floorLog10,
  fractionDigits,
  isTerminating,
  isZero,
  pow10,
  rat,
  roundToFraction,
  significantDigits,
  toDecimalString,
  type Rational,
} from './rational';
import { DIMS, eligibleUnits, type Dim, type Unit } from './units';

/** 問題生成ロジックを変えたら上げる。デイリーのシードに含め、過去の日の問題が変わらないようにする。 */
export const GENERATOR_VERSION = 2;

/** 小数第 DP 位まで答える問題の桁数 */
export const DP = 2;

/** このレベル以上は「仮数 × 10^指数」の2枠で答えられる */
export const SCI_LEVEL = 9;

/** 答えが大きすぎて小数第 DP 位では意味が薄いとき、有効数字 SIG 桁で答える */
export const SIG = 3;
const SIG_THRESHOLD = rat(100000);

/**
 * 回答の形式。
 * - exact：答えが小数第2位までで割り切れる。そのまま答える。
 * - dp：割り切れないので、小数第 dp 位まで（その下を四捨五入）で答える。
 * - sig：割り切れず答えが大きい（SCI_LEVEL 以上）。有効数字 sig 桁で答える。
 */
export type AnswerSpec =
  | { readonly kind: 'exact' }
  | { readonly kind: 'dp'; readonly dp: number }
  | { readonly kind: 'sig'; readonly sig: number };

export interface Question {
  readonly index: number;
  readonly level: number;
  readonly value: Rational;
  readonly valueText: string;
  readonly from: Unit;
  readonly to: Unit;
  /** 問題で使う係数に従った正解（dp の問題でも、丸める前の値） */
  readonly answer: Rational;
  readonly spec: AnswerSpec;
  /** 系統をまたぐため、有効数字3桁の係数を使う問題か */
  readonly usesPractical: boolean;
}

export interface GenerateOptions {
  /** 出題する分野を絞る（省略時はレベルで出題可能な全分野） */
  readonly dims?: readonly Dim[];
  /** 苦手な単位 id → 重み（>1 で出やすくなる） */
  readonly unitWeights?: Readonly<Record<string, number>>;
}

/** 出題で許す、2単位の倍率差（10 の指数の絶対値）の上限 */
const RATIO_EXP_CAP = [3, 4, 4, 5, 5, 6, 6, 9, 12, 40] as const;
/** 厳密形式の答えの有効数字の上限 */
const MAX_SIG_DIGITS = [3, 4, 5, 5, 6, 6, 6, 7, 7, 7] as const;
/** 答えの大きさ（10 の指数）の範囲 */
function answerExpRange(level: number): readonly [number, number] {
  if (level <= 2) return [-3, 6];
  if (level <= 5) return [-4, 8];
  if (level <= 9) return [-6, 12];
  return [-12, 20];
}

const at = <T>(arr: readonly T[], level: number): T => arr[Math.min(Math.max(level, 1), arr.length) - 1] as T;

/** 値の 10 のべき（出題値が 0.01〜990 程度に収まり、整数が中心になるように選ぶ） */
function pickExponent(rng: Rng, level: number, m: number): number {
  let e: number;
  if (level <= 1) e = rng.next() < 0.3 ? 1 : 0;
  else if (level === 2) e = rng.pick([0, 0, 0, 0, -1, -1, 1]);
  else e = rng.pick([0, 0, 0, 0, 0, -1, -1, -2, 1]);
  return e === 1 && m > 99 ? 0 : e;
}

/** m = step の倍数（step=1 なら任意）から値を作る。値の小数は第2位まで。 */
function pickValue(rng: Rng, level: number, step: bigint): Rational {
  const maxM = level <= 2 ? 99 : 999;
  const st = Number(step);
  const k = Math.max(1, Math.floor(maxM / st));
  const m = rng.int(1, k) * st;
  const e = pickExponent(rng, level, m);
  return e >= 0 ? rat(BigInt(m) * pow10(e)) : rat(BigInt(m), pow10(-e));
}

/** 温度は実在しそうな範囲から選ぶ。℉ は 32 を引いて 9 の倍数にして、℃・K への答えを割り切れるようにする。 */
function pickTemperature(rng: Rng, unit: Unit): Rational {
  switch (unit.id) {
    case 'degC':
      return rng.next() < 0.25 ? rat(rng.int(-40, 99) * 10 + 5, 10) : rat(rng.int(-40, 150));
    case 'K':
      return rat(rng.int(230, 420));
    default:
      return rat(32 + 9 * rng.int(-8, 30));
  }
}

function gcdBig(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

const MIN_EXACT = rat(1, 100);
const MIN_ROUNDED = rat(1, 10);

function buildQuestion(rng: Rng, level: number, index: number, from: Unit, to: Unit): Question | null {
  const k = problemFactor(from, to);
  if (k && !isZero(k)) {
    const exp = floorLog10(abs(k));
    if (Math.abs(exp) > at(RATIO_EXP_CAP, level)) return null;
  }
  const [minExp, maxExp] = answerExpRange(level);
  const maxSig = at(MAX_SIG_DIGITS, level);
  const exact = linearFactor(from, to);
  const usesPractical = k !== null && exact !== null && !eq(k, exact);
  // ヤード・ポンド法・尺貫法・科学慣用の単位を含む組は、割り切れなければ小数第2位までで答えさせる
  const allowRound = from.system !== 'si' || to.system !== 'si';

  // 割り切れる問題にするための、値の刻み（SI どうしの組のみ）
  // 値 = N/100、答え = 値 × a/b が小数第2位までで割り切れる ⇔ N が b の倍数
  let step = 1n;
  if (k && !allowRound) {
    step = k.d / gcdBig(k.d, 100n);
    if (step > 999n) return null;
  }

  // SCI_LEVEL 以上は「仮数 × 10^指数」で答えられるので、小さな答え（1.5 nm → 1.5×10⁻⁹ m など）も許す
  const isExactOk = (answer: Rational): boolean => {
    if (isZero(answer) || !isTerminating(answer) || significantDigits(answer) > maxSig) return false;
    if (level >= SCI_LEVEL && cmp(abs(answer), MIN_EXACT) < 0) return true;
    return fractionDigits(answer) <= DP && cmp(abs(answer), MIN_EXACT) >= 0;
  };
  const inRange = (answer: Rational): boolean => {
    const e = floorLog10(abs(answer));
    return e >= minExp && e <= maxExp;
  };

  for (let t = 0; t < 120; t++) {
    const value = from.dim === 'temperature' ? pickTemperature(rng, from) : pickValue(rng, level, step);
    const answer = convertProblem(value, from, to);
    if (isZero(answer)) continue;
    if (isExactOk(answer)) {
      if (!inRange(answer)) continue;
      return { index, level, value, valueText: toDecimalString(value), from, to, answer, spec: { kind: 'exact' }, usesPractical };
    }
    if (allowRound && cmp(abs(answer), MIN_ROUNDED) >= 0 && inRange(answer) && !isZero(roundToFraction(answer, DP))) {
      const spec: AnswerSpec =
        level >= SCI_LEVEL && cmp(abs(answer), SIG_THRESHOLD) >= 0 ? { kind: 'sig', sig: SIG } : { kind: 'dp', dp: DP };
      return { index, level, value, valueText: toDecimalString(value), from, to, answer, spec, usesPractical };
    }
  }
  return null;
}

/** 1問生成する。必ず1問返す（作れる組が見つかるまで試行する）。 */
export function generateQuestion(rng: Rng, level: number, index = 0, opts: GenerateOptions = {}): Question {
  const dims = (opts.dims ?? DIMS).filter((d) => eligibleUnits(d, level).length >= 2);
  if (dims.length === 0) throw new Error(`no dimension available at level ${level}`);
  const weightOf = (x: Unit): number => {
    const newer = x.minLevel >= level - 1 ? 3 : 1;
    return newer * (opts.unitWeights?.[x.id] ?? 1);
  };

  for (let attempt = 0; attempt < 500; attempt++) {
    const dim = rng.pick(dims);
    const units = eligibleUnits(dim, level);
    const from = rng.pickWeighted(units, weightOf);
    const to = rng.pickWeighted(
      units.filter((x) => x.id !== from.id),
      weightOf,
    );
    const q = buildQuestion(rng, level, index, from, to);
    if (q) return q;
  }
  // 到達しない想定。最低限の問題を返す。
  throw new Error('failed to generate a question');
}

/** 1ラウンド分（count 問）を、シードから決定的に生成する。 */
export function generateRound(seed: number, level: number, count: number, opts: GenerateOptions = {}): Question[] {
  const rng = new Rng(seed);
  const out: Question[] = [];
  for (let i = 0; i < count; i++) out.push(generateQuestion(rng, level, i, opts));
  return out;
}

/** デイリー用のシード文字列（日付は JST）。 */
export function dailySeedKey(dateJst: string): string {
  return `${dateJst}|v${GENERATOR_VERSION}`;
}

/** 現在時刻から JST の日付（YYYY-MM-DD）を返す。端末のタイムゾーンに依存しない。 */
export function jstDateString(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}
