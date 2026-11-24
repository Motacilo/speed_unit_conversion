import { describe, expect, it } from 'vitest';
import type { Question } from '../src/core/generator';
import { answerText, isSciAnswer, questionNote, sciInputText, superscript } from '../src/ui/format';
import { convertProblem } from '../src/core/convert';
import { parseDecimal, type Rational } from '../src/core/rational';
import { getUnit } from '../src/core/units';

function mk(value: string, from: string, to: string, level: number, sig?: number): Question {
  const v = parseDecimal(value) as Rational;
  const f = getUnit(from);
  const t = getUnit(to);
  return {
    index: 0, level, value: v, valueText: value, from: f, to: t,
    answer: convertProblem(v, f, t),
    spec: sig ? { kind: 'sig', sig } : { kind: 'exact' },
    usesPractical: f.system !== t.system,
  };
}

describe('×10ⁿ の表示', () => {
  it('上付き文字', () => {
    expect(superscript(15)).toBe('¹⁵');
    expect(superscript(-3)).toBe('⁻³');
  });
  it('入力枠の内容を表示用にする', () => {
    expect(sciInputText('9.72', '15')).toBe('9.72 × 10¹⁵');
    expect(sciInputText(' 2.5 ', '-3')).toBe('2.5 × 10⁻³');
    expect(sciInputText('2500', '')).toBe('2500');
  });
  it('Lv9 以上の大きな答えは仮数×10^指数で表示（厳密な問題）', () => {
    const q1 = mk('270', 'kWh', 'erg', 10);
    expect(isSciAnswer(q1)).toBe(true);
    expect(answerText(q1)).toBe('9.72 × 10¹⁵');
  });
  it('有効数字3桁の問題は、末尾の 0 も残す', () => {
    const q2 = mk('528', 'BTU', 'erg', 10, 3);
    expect(answerText(q2)).toMatch(/^\d\.\d{2} × 10[⁰¹²³⁴-⁹]+$/);
    expect(questionNote(q2)).toContain('有効数字 3 桁');
    expect(questionNote(q2)).toContain('2つの枠');
  });
  it('Lv8 以下・小さな答えは通常表示', () => {
    expect(isSciAnswer(mk('270', 'kWh', 'erg', 8))).toBe(false);
    expect(answerText(mk('50', 'L', 'mL', 1))).toBe('50,000');
    expect(questionNote(mk('50', 'L', 'mL', 1))).not.toContain('2つの枠');
  });
});
