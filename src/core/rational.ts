/**
 * 有理数（BigInt の分子/分母）。浮動小数点を使わずに換算・丸め・判定を行うための基盤。
 * 常に既約分数で、分母は正。
 */
export type Rational = { readonly n: bigint; readonly d: bigint };

const absBig = (x: bigint): bigint => (x < 0n ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  a = absBig(a);
  b = absBig(b);
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

export const pow10 = (k: number): bigint => 10n ** BigInt(k);

export function rat(n: bigint | number, d: bigint | number = 1n): Rational {
  let nn = BigInt(n);
  let dd = BigInt(d);
  if (dd === 0n) throw new RangeError('denominator is zero');
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  const g = gcd(nn, dd);
  return g > 1n ? { n: nn / g, d: dd / g } : { n: nn, d: dd };
}

export const ZERO: Rational = rat(0);
export const ONE: Rational = rat(1);

export const add = (a: Rational, b: Rational): Rational => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rational, b: Rational): Rational => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational): Rational => rat(a.n * b.n, a.d * b.d);
export const div = (a: Rational, b: Rational): Rational => {
  if (b.n === 0n) throw new RangeError('division by zero');
  return rat(a.n * b.d, a.d * b.n);
};
export const neg = (a: Rational): Rational => ({ n: -a.n, d: a.d });
export const abs = (a: Rational): Rational => (a.n < 0n ? neg(a) : a);
export const sign = (a: Rational): -1 | 0 | 1 => (a.n < 0n ? -1 : a.n > 0n ? 1 : 0);
export const isZero = (a: Rational): boolean => a.n === 0n;
export const eq = (a: Rational, b: Rational): boolean => a.n === b.n && a.d === b.d;
export function cmp(a: Rational, b: Rational): -1 | 0 | 1 {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
}
export const pow = (a: Rational, k: number): Rational => {
  if (k >= 0) return rat(a.n ** BigInt(k), a.d ** BigInt(k));
  return rat(a.d ** BigInt(-k), a.n ** BigInt(-k));
};

// ---------------------------------------------------------------------------
// 文字列 → 有理数
// ---------------------------------------------------------------------------

/** 全角・カンマ・空白などを正規化する */
export function normalizeNumberText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[−–—ー]/g, '-')
    .replace(/[,\s_]/g, '');
}

const DECIMAL_RE = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i;

/**
 * 十進表記（`1,000` `１０００` `1e3` `0.5` `-2.5E-3` など）を有理数にする。
 * 解釈できなければ null。
 */
export function parseDecimal(text: string): Rational | null {
  const m = DECIMAL_RE.exec(normalizeNumberText(text));
  if (!m) return null;
  const [, sg, body, exp] = m;
  if (body === undefined) return null;
  const dot = body.indexOf('.');
  const fracLen = dot < 0 ? 0 : body.length - dot - 1;
  const digits = body.replace('.', '');
  let e = (exp === undefined ? 0 : parseInt(exp, 10)) - fracLen;
  if (!Number.isFinite(e) || Math.abs(e) > 400) return null;
  let n = BigInt(digits === '' ? '0' : digits);
  if (sg === '-') n = -n;
  if (e >= 0) return rat(n * pow10(e), 1n);
  return rat(n, pow10(-e));
}

/** `10/33` `4.4482216152605/0.00064516` `1e-9` のような式を厳密に解釈する（定義データ用）。 */
export function q(expr: string): Rational {
  const parts = expr.split('/');
  if (parts.length > 2) throw new Error(`bad rational expr: ${expr}`);
  const a = parseDecimal(parts[0] ?? '');
  const b = parts.length === 2 ? parseDecimal(parts[1] ?? '') : ONE;
  if (!a || !b) throw new Error(`bad rational expr: ${expr}`);
  return div(a, b);
}

// ---------------------------------------------------------------------------
// 十進展開に関する性質
// ---------------------------------------------------------------------------

/** 分母から 2 と 5 の因数を取り除いた残り。1 なら有限小数。 */
export function badPart(r: Rational): bigint {
  let d = r.d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d;
}

export const isTerminating = (r: Rational): boolean => badPart(r) === 1n;

/** 有限小数のとき、小数点以下に必要な桁数 */
export function fractionDigits(r: Rational): number {
  let d = r.d;
  let twos = 0;
  let fives = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    twos++;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives++;
  }
  if (d !== 1n) throw new RangeError('not a terminating decimal');
  return Math.max(twos, fives);
}

/** 有限小数の有効数字の桁数（整数末尾の 0 は有効としない最小の桁数）。0 は 0 を返す。 */
export function significantDigits(r: Rational): number {
  if (r.n === 0n) return 0;
  const f = fractionDigits(r);
  let s = absBig(r.n * pow10(f) / r.d).toString();
  s = s.replace(/0+$/, '');
  return s.length;
}

/** r > 0 として floor(log10(r)) */
export function floorLog10(r: Rational): number {
  if (r.n <= 0n) throw new RangeError('floorLog10 requires a positive number');
  const k = r.n.toString().length - r.d.toString().length;
  const ge = (e: number): boolean => (e >= 0 ? r.n >= r.d * pow10(e) : r.n * pow10(-e) >= r.d);
  return ge(k) ? k : k - 1;
}

/** r が 10 のべき乗なら指数、違えば null */
export function powerOf10Exponent(r: Rational): number | null {
  if (r.n <= 0n) return null;
  if (r.d === 1n) {
    const s = r.n.toString();
    return /^10*$/.test(s) ? s.length - 1 : null;
  }
  if (r.n === 1n) {
    const s = r.d.toString();
    return /^10*$/.test(s) ? -(s.length - 1) : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 丸め（四捨五入：ちょうど半分は絶対値が大きい方へ）
// ---------------------------------------------------------------------------

/** 整数への四捨五入 */
export function roundHalfUpInt(r: Rational): bigint {
  const a = absBig(r.n);
  const qv = (2n * a + r.d) / (2n * r.d);
  return r.n < 0n ? -qv : qv;
}

/** 小数第 f 位へ四捨五入（f は負でもよい：-1 なら 10 の位） */
export function roundToFraction(r: Rational, f: number): Rational {
  const scale = f >= 0 ? rat(pow10(f)) : rat(1n, pow10(-f));
  return div(rat(roundHalfUpInt(mul(r, scale))), scale);
}

/** 有効数字 sig 桁へ四捨五入 */
export function roundToSig(r: Rational, sig: number): Rational {
  if (isZero(r)) return r;
  const k = floorLog10(abs(r));
  return roundToFraction(r, sig - 1 - k);
}

/** 有効数字 sig 桁としての最小単位（最後の桁の 1） */
export function sigStep(r: Rational, sig: number): Rational {
  const k = floorLog10(abs(r));
  const e = k - sig + 1;
  return e >= 0 ? rat(pow10(e)) : rat(1n, pow10(-e));
}

// ---------------------------------------------------------------------------
// 文字列化
// ---------------------------------------------------------------------------

/** 小数第 f 位へ四捨五入して、ちょうど f 桁の小数として文字列にする（f >= 0） */
export function formatFixed(r: Rational, f: number): string {
  const scaled = roundHalfUpInt(mul(r, rat(pow10(f))));
  const negative = scaled < 0n;
  const digits = absBig(scaled).toString().padStart(f + 1, '0');
  const body = f === 0 ? digits : `${digits.slice(0, -f)}.${digits.slice(-f)}`;
  return negative && scaled !== 0n ? `-${body}` : body;
}

/** 有限小数を、末尾に余計な 0 を付けずに文字列にする */
export function toDecimalString(r: Rational): string {
  return formatFixed(r, fractionDigits(r));
}

/** 有効数字 sig 桁で（末尾の 0 も残して）文字列にする。例：0.5, 3 → "0.500" */
export function formatSig(r: Rational, sig: number): string {
  if (isZero(r)) return '0';
  const t = roundToSig(r, sig);
  const k = floorLog10(abs(t));
  return formatFixed(t, Math.max(0, sig - 1 - k));
}

/** r = mant × 10^exp（1 ≦ |mant| < 10）に分ける。0 は mant=0, exp=0。 */
export function toSci(r: Rational): { readonly mant: Rational; readonly exp: number } {
  if (isZero(r)) return { mant: r, exp: 0 };
  const exp = floorLog10(abs(r));
  const scale = exp >= 0 ? rat(1n, pow10(exp)) : rat(pow10(-exp));
  return { mant: mul(r, scale), exp };
}

/** 近似の小数表示（表示専用。計算には使わない） */
export function toApproxString(r: Rational, sig = 6): string {
  if (isZero(r)) return '0';
  if (isTerminating(r) && significantDigits(r) <= sig) return toDecimalString(r);
  return formatSig(r, sig);
}

// ---------------------------------------------------------------------------
// 厳密な累乗根
// ---------------------------------------------------------------------------

function iroot(x: bigint, k: number): bigint | null {
  if (x < 0n) return null;
  if (x < 2n) return x;
  let lo = 1n;
  let hi = 1n << BigInt(Math.ceil(x.toString(2).length / k) + 1);
  const kk = BigInt(k);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1n;
    const p = mid ** kk;
    if (p === x) return mid;
    if (p < x) lo = mid + 1n;
    else hi = mid - 1n;
  }
  return null;
}

/** r の k 乗根が有理数として厳密に存在すればそれを返す */
export function exactRoot(r: Rational, k: number): Rational | null {
  const a = iroot(r.n, k);
  const b = iroot(r.d, k);
  if (a === null || b === null) return null;
  return rat(a, b);
}
