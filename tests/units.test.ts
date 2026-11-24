import { describe, expect, it } from 'vitest';
import { convert } from '../src/core/convert';
import { eq, mul, parseDecimal, pow, q, rat, type Rational } from '../src/core/rational';
import { BASE_UNIT, DIMS, UNITS, getUnit, unitsOf } from '../src/core/units';

const P = (s: string): Rational => {
  const r = parseDecimal(s);
  if (!r) throw new Error(s);
  return r;
};
/** 1 [a] = n [b] を厳密に確認する */
function expectRatio(a: string, n: string, b: string): void {
  const got = convert(rat(1), getUnit(a), getUnit(b));
  expect(eq(got, q(n)), `1 ${a} = ${n} ${b}（実際: ${got.n}/${got.d}）`).toBe(true);
}

describe('単位データの整合性', () => {
  it('id が重複しない', () => {
    const ids = UNITS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('各分野に基準単位があり、倍率が 1 で offset が 0', () => {
    for (const d of DIMS) {
      const b = getUnit(BASE_UNIT[d]);
      expect(b.dim).toBe(d);
      expect(eq(b.toBase, rat(1)), d).toBe(true);
      expect(b.offset.n, d).toBe(0n);
    }
  });
  it('倍率は正で、レベルは 1〜10', () => {
    for (const x of UNITS) {
      expect(x.toBase.n > 0n, x.id).toBe(true);
      expect(x.minLevel).toBeGreaterThanOrEqual(1);
      expect(x.minLevel).toBeLessThanOrEqual(10);
    }
  });
  it('レベル 1 から全分野が出題可能になる最小構成（長さ・質量・体積・時間）', () => {
    for (const d of ['length', 'mass', 'volume', 'time'] as const) {
      expect(unitsOf(d).filter((x) => x.minLevel <= 1).length, d).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('往復換算：A → B → A で元に戻る', () => {
  const values = ['1', '2.5', '0.004', '123456.789', '-40', '98.6'].map(P);
  for (const dim of DIMS) {
    it(dim, () => {
      const us = unitsOf(dim);
      for (const a of us) {
        for (const b of us) {
          for (const v of values) {
            expect(eq(convert(convert(v, a, b), b, a), v), `${a.id}->${b.id}`).toBe(true);
          }
        }
      }
    });
  }
});

describe('定義値の照合', () => {
  it('長さ', () => {
    expectRatio('mile', '1609.344', 'm');
    expectRatio('mile', '1760', 'yd');
    expectRatio('yd', '3', 'ft');
    expectRatio('ft', '12', 'in');
    expectRatio('in', '2.54', 'cm');
    expectRatio('nmi', '1852', 'm');
    expectRatio('km', '1000', 'm');
    expectRatio('shaku', '10', 'sun');
    expectRatio('ken', '6', 'shaku');
    expectRatio('jo', '10', 'shaku');
    expectRatio('cho', '60', 'ken');
    expectRatio('ri', '36', 'cho');
  });
  it('質量', () => {
    expectRatio('lb', '16', 'oz');
    expectRatio('shortton', '2000', 'lb');
    expectRatio('t', '1000', 'kg');
    expectRatio('kan', '1000', 'monme');
    expectRatio('kin', '160', 'monme');
    expectRatio('kan', '3750', 'g');
  });
  it('体積', () => {
    expectRatio('usgal', '4', 'usquart');
    expectRatio('usquart', '2', 'uspint');
    expectRatio('uspint', '2', 'uscup');
    expectRatio('uscup', '8', 'usfloz');
    expectRatio('usgal', '231', 'in3');
    expectRatio('usgal', '3.785411784', 'L');
    expectRatio('oji', '3', 'koji');
    expectRatio('oji', '15', 'mL');
    expectRatio('koji', '5', 'mL');
    expectRatio('cup_jp', '200', 'mL');
    expectRatio('m3', '1000', 'L');
    expectRatio('cm3', '1', 'mL');
    expectRatio('go', '10', 'shaku_v');
    expectRatio('sho', '10', 'go');
    expectRatio('to', '10', 'sho');
    expectRatio('koku', '10', 'to');
  });
  it('立方インチ・立方フィートは長さの3乗と一致する', () => {
    expect(eq(getUnit('in3').toBase, mul(pow(q('0.0254'), 3), rat(1000)))).toBe(true);
    expect(eq(getUnit('ft3').toBase, mul(pow(q('0.3048'), 3), rat(1000)))).toBe(true);
  });
  it('面積は長さの2乗と一致する', () => {
    expect(eq(getUnit('in2').toBase, pow(q('0.0254'), 2))).toBe(true);
    expect(eq(getUnit('ft2').toBase, pow(q('0.3048'), 2))).toBe(true);
    expect(eq(getUnit('yd2').toBase, pow(q('0.9144'), 2))).toBe(true);
    expect(eq(getUnit('mi2').toBase, pow(q('1609.344'), 2))).toBe(true);
    expect(eq(getUnit('tsubo').toBase, pow(getUnit('ken').toBase, 2))).toBe(true);
    expectRatio('acre', '4840', 'yd2');
    expectRatio('mi2', '640', 'acre');
    expectRatio('ha', '100', 'a');
    expectRatio('km2', '1000000', 'm2');
    expectRatio('se', '30', 'tsubo');
    expectRatio('tan', '10', 'se');
    expectRatio('tan', '300', 'tsubo');
    expectRatio('chobu', '10', 'tan');
    expectRatio('chobu', '3000', 'tsubo');
  });
  it('時間', () => {
    expectRatio('h', '60', 'min');
    expectRatio('min', '60', 's');
    expectRatio('d', '24', 'h');
    expectRatio('week', '7', 'd');
    expectRatio('year365', '365', 'd');
  });
  it('速さ', () => {
    expectRatio('km/h', '1000/3600', 'm/s');
    expectRatio('mph', '1609.344/3600', 'm/s');
    expectRatio('mph', '0.44704', 'm/s');
    expectRatio('kn', '1852/3600', 'm/s');
    expectRatio('m/min', '1/60', 'm/s');
    expectRatio('c', '299792458', 'm/s');
  });
  it('圧力', () => {
    expectRatio('hPa', '1', 'mbar');
    expectRatio('bar', '100000', 'Pa');
    expectRatio('atm', '760', 'Torr');
    // psi = lbf / in²（lbf = 0.45359237 kg × 9.80665 m/s²）
    const lbf = mul(q('0.45359237'), q('9.80665'));
    expect(eq(getUnit('psi').toBase, mul(lbf, pow(q('0.0254'), -2)))).toBe(true);
    // kgf/cm² = 9.80665 N / 1 cm²
    expect(eq(getUnit('kgf/cm2').toBase, mul(q('9.80665'), pow(q('0.01'), -2)))).toBe(true);
  });
  it('エネルギー・仕事率', () => {
    expectRatio('kcal', '1000', 'cal');
    expectRatio('kWh', '3.6', 'MJ');
    expectRatio('Wh', '3600', 'J');
    expectRatio('kWh', '1000', 'Wh');
    expectRatio('kW', '1000', 'W');
    // PS = 75 kgf·m/s
    expect(eq(getUnit('PS').toBase, mul(rat(75), getUnit('kgfm').toBase))).toBe(true);
    // hp = 550 ft·lbf/s
    const ftlbf = mul(q('0.3048'), mul(q('0.45359237'), q('9.80665')));
    expect(eq(getUnit('hp').toBase, mul(rat(550), ftlbf))).toBe(true);
  });
});

describe('温度', () => {
  const t = (v: string, a: string, b: string) => convert(P(v), getUnit(a), getUnit(b));
  it('代表的な値', () => {
    expect(eq(t('0', 'degC', 'K'), q('273.15'))).toBe(true);
    expect(eq(t('100', 'degC', 'degF'), rat(212))).toBe(true);
    expect(eq(t('0', 'degC', 'degF'), rat(32))).toBe(true);
    expect(eq(t('-40', 'degC', 'degF'), rat(-40))).toBe(true);
    expect(eq(t('98.6', 'degF', 'degC'), rat(37))).toBe(true);
    expect(eq(t('212', 'degF', 'degC'), rat(100))).toBe(true);
    expect(eq(t('273.15', 'K', 'degC'), rat(0))).toBe(true);
    expect(eq(t('32', 'degF', 'K'), q('273.15'))).toBe(true);
    expect(eq(t('373.15', 'K', 'degF'), rat(212))).toBe(true);
  });
});

describe('升の定義：4.9寸 × 4.9寸 × 2.7寸', () => {
  it('厳密に一致する', () => {
    const sun = getUnit('sun').toBase; // m
    const m3 = mul(mul(mul(q('4.9'), sun), mul(q('4.9'), sun)), mul(q('2.7'), sun));
    expect(eq(getUnit('sho').toBase, mul(m3, rat(1000)))).toBe(true);
  });
});

describe('尺貫法の近似値（備考の数値との整合）', () => {
  it('1 合 ≈ 180.39 mL、1 尺 ≈ 30.3 cm、1 坪 ≈ 3.3058 m²', () => {
    const go = convert(rat(1), getUnit('go'), getUnit('mL'));
    expect(Number(go.n) / Number(go.d)).toBeCloseTo(180.39, 2);
    const shaku = convert(rat(1), getUnit('shaku'), getUnit('cm'));
    expect(Number(shaku.n) / Number(shaku.d)).toBeCloseTo(30.303, 3);
    const tsubo = convert(rat(1), getUnit('tsubo'), getUnit('m2'));
    expect(Number(tsubo.n) / Number(tsubo.d)).toBeCloseTo(3.3058, 4);
  });
});
