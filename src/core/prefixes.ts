/** SI接頭辞（単位表画面用）。指数は 10 のべき。 */
export interface Prefix {
  readonly symbol: string;
  readonly name: string;
  readonly exponent: number;
}

export const PREFIXES: readonly Prefix[] = [
  { symbol: 'Q', name: 'quetta', exponent: 30 },
  { symbol: 'R', name: 'ronna', exponent: 27 },
  { symbol: 'Y', name: 'yotta', exponent: 24 },
  { symbol: 'Z', name: 'zetta', exponent: 21 },
  { symbol: 'E', name: 'exa', exponent: 18 },
  { symbol: 'P', name: 'peta', exponent: 15 },
  { symbol: 'T', name: 'tera', exponent: 12 },
  { symbol: 'G', name: 'giga', exponent: 9 },
  { symbol: 'M', name: 'mega', exponent: 6 },
  { symbol: 'k', name: 'kilo', exponent: 3 },
  { symbol: 'h', name: 'hecto', exponent: 2 },
  { symbol: 'da', name: 'deca', exponent: 1 },
  { symbol: 'd', name: 'deci', exponent: -1 },
  { symbol: 'c', name: 'centi', exponent: -2 },
  { symbol: 'm', name: 'milli', exponent: -3 },
  { symbol: 'μ', name: 'micro', exponent: -6 },
  { symbol: 'n', name: 'nano', exponent: -9 },
  { symbol: 'p', name: 'pico', exponent: -12 },
  { symbol: 'f', name: 'femto', exponent: -15 },
  { symbol: 'a', name: 'atto', exponent: -18 },
  { symbol: 'z', name: 'zepto', exponent: -21 },
  { symbol: 'y', name: 'yocto', exponent: -24 },
  { symbol: 'r', name: 'ronto', exponent: -27 },
  { symbol: 'q', name: 'quecto', exponent: -30 },
];
