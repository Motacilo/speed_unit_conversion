import { describe, expect, it } from 'vitest';
import {
  eq,
  floorLog10,
  formatSig,
  isTerminating,
  parseDecimal,
  q,
  rat,
  roundToSig,
  significantDigits,
  toDecimalString,
  exactRoot,
  powerOf10Exponent,
} from '../src/core/rational';

const P = (s: string) => {
  const r = parseDecimal(s);
  if (!r) throw new Error(`parse failed: ${s}`);
  return r;
};

describe('parseDecimal', () => {
  it('表記の違いを同じ値として読む', () => {
    for (const s of ['1000', '1,000', '１０００', '１，０００', '1e3', '1E3', '1000.0', ' 1000 ', '+1000', '1.0e3']) {
      expect(eq(P(s), rat(1000)), s).toBe(true);
    }
  });
  it('小数・負数・指数', () => {
    expect(eq(P('0.5'), rat(1, 2))).toBe(true);
    expect(eq(P('.5'), rat(1, 2))).toBe(true);
    expect(eq(P('-2.5'), rat(-5, 2))).toBe(true);
    expect(eq(P('－２．５'), rat(-5, 2))).toBe(true);
    expect(eq(P('1.5e-3'), rat(3, 2000))).toBe(true);
  });
  it('不正な入力は null', () => {
    for (const s of ['', 'abc', '1.2.3', '--1', '1e', 'e3', '1/2', '１２a']) {
      expect(parseDecimal(s), s).toBeNull();
    }
  });
});

describe('有限小数の性質', () => {
  it('isTerminating', () => {
    expect(isTerminating(q('0.0254'))).toBe(true);
    expect(isTerminating(q('5/18'))).toBe(false);
    expect(isTerminating(q('10/33'))).toBe(false);
    expect(isTerminating(q('3/8'))).toBe(true);
  });
  it('significantDigits', () => {
    expect(significantDigits(q('30000'))).toBe(1);
    expect(significantDigits(q('0.00250'))).toBe(2);
    expect(significantDigits(q('1609.344'))).toBe(7);
  });
  it('toDecimalString', () => {
    expect(toDecimalString(q('1609.344'))).toBe('1609.344');
    expect(toDecimalString(q('0.0254'))).toBe('0.0254');
    expect(toDecimalString(q('-12.5'))).toBe('-12.5');
    expect(toDecimalString(q('1000'))).toBe('1000');
  });
  it('floorLog10 / powerOf10Exponent', () => {
    expect(floorLog10(q('999.999'))).toBe(2);
    expect(floorLog10(q('1000'))).toBe(3);
    expect(floorLog10(q('0.001'))).toBe(-3);
    expect(floorLog10(q('0.00099'))).toBe(-4);
    expect(powerOf10Exponent(q('1000'))).toBe(3);
    expect(powerOf10Exponent(q('1/100'))).toBe(-2);
    expect(powerOf10Exponent(q('2000'))).toBeNull();
    expect(powerOf10Exponent(q('1'))).toBe(0);
  });
});

describe('有効数字の丸め（四捨五入・ちょうど半分は切り上げ）', () => {
  it('3桁', () => {
    expect(formatSig(q('2.345'), 3)).toBe('2.35');
    expect(formatSig(q('2.344'), 3)).toBe('2.34');
    expect(formatSig(q('1133.980925'), 3)).toBe('1130');
    expect(formatSig(q('0.5'), 3)).toBe('0.500');
    expect(formatSig(q('0.0012345'), 3)).toBe('0.00123');
    expect(formatSig(q('-2.345'), 3)).toBe('-2.35');
  });
  it('繰り上がりで桁が増える', () => {
    expect(eq(roundToSig(q('999.6'), 3), rat(1000))).toBe(true);
    expect(formatSig(q('9.996'), 3)).toBe('10.0');
  });
  it('割り切れない値でも誤差なく丸める', () => {
    // 100/3 = 33.333...
    expect(formatSig(q('100/3'), 3)).toBe('33.3');
    expect(formatSig(q('200/3'), 3)).toBe('66.7');
    // ちょうど半分の判定：2.345 は厳密に半分
    expect(formatSig(rat(469, 200), 3)).toBe('2.35');
  });
});

describe('exactRoot', () => {
  it('厳密な平方根・立方根', () => {
    expect(eq(exactRoot(rat(10000), 2)!, rat(100))).toBe(true);
    expect(eq(exactRoot(rat(1000000), 3)!, rat(100))).toBe(true);
    expect(exactRoot(rat(2), 2)).toBeNull();
    expect(eq(exactRoot(rat(1, 10000), 2)!, rat(1, 100))).toBe(true);
  });
});
