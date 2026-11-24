import { describe, expect, it } from 'vitest';
import { describeConversion, factorText } from '../src/core/convert';
import { q } from '../src/core/rational';
import { getUnit } from '../src/core/units';

const d = (a: string, b: string): string => describeConversion(getUnit(a), getUnit(b));

describe('換算式の表示：小さくなるときは割り算', () => {
  it('時間・時間の単位', () => {
    expect(d('min', 'h')).toBe('時間 の値 = 分 の値 / 60');
    expect(d('s', 'min')).toBe('分 の値 = 秒 の値 / 60');
    expect(d('h', 'min')).toBe('分 の値 = 時間 の値 × 60');
    expect(d('min', 's')).toBe('秒 の値 = 分 の値 × 60');
    expect(d('s', 'd')).toBe('日 の値 = 秒 の値 / 86400');
  });
  it('接頭辞', () => {
    expect(d('mL', 'L')).toBe('L の値 = mL の値 / 1000');
    expect(d('g', 'kg')).toBe('kg の値 = g の値 / 1000');
    expect(d('kg', 'g')).toBe('g の値 = kg の値 × 1000');
    expect(d('cm', 'm')).toBe('m の値 = cm の値 / 100');
  });
  it('速さ（3.6）', () => {
    expect(d('m/s', 'km/h')).toBe('km/h の値 = m/s の値 × 3.6');
    expect(d('km/h', 'm/s')).toBe('m/s の値 = km/h の値 / 3.6');
  });
  it('割り算にすると長くなる係数は掛け算のまま', () => {
    expect(d('ft', 'm')).toBe('m の値 = ft の値 × 0.305　［係数は有効数字3桁。正確には × 0.3048］');
    expect(d('in', 'ft')).toBe('ft の値 = inch の値 / 12'); // 同じ系統は正確な比
    expect(d('cm', 'ft')).toContain('/ 30.5'); // 0.305 m = 30.5 cm
  });
  it('尺貫法：10/33 は「/ 3.3」と表せる', () => {
    expect(d('shaku', 'm')).toBe('m の値 = 尺 の値 × 0.303　［係数は有効数字3桁。正確には / 3.3］');
    expect(d('m', 'shaku')).toContain('尺 の値 = m の値');
    expect(d('shaku', 'sun')).toBe('寸 の値 = 尺 の値 × 10');
  });
  it('割り切れない係数は分数と近似値', () => {
    const f = factorText(q('11/43200'));
    expect(f.op).toBe('×');
    expect(f.operand).toBe('11/43200');
    expect(f.note).toMatch(/^≈ 0\.000254/);
  });
  it('大きな分数は近似値だけにする', () => {
    const f = factorText(getUnit('psi').toBase);
    expect(f.note).toBe('近似値');
  });
  it('温度は従来どおり', () => {
    expect(d('degC', 'K')).toContain('273.15');
  });
});
