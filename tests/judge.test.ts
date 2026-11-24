import { describe, expect, it } from 'vitest';
import { generateQuestion, type Question } from '../src/core/generator';
import { judge } from '../src/core/judge';
import { convertProblem } from '../src/core/convert';
import { Rng } from '../src/core/rng';
import { parseDecimal, q, rat, formatFixed, formatSig, roundToFraction, toDecimalString, toSci, mul, type Rational } from '../src/core/rational';
import { getUnit } from '../src/core/units';

function makeQ(value: string, from: string, to: string, dp?: number): Question {
  const v = parseDecimal(value) as Rational;
  const f = getUnit(from);
  const t = getUnit(to);
  return {
    index: 0,
    level: 10,
    value: v,
    valueText: value,
    from: f,
    to: t,
    answer: convertProblem(v, f, t),
    spec: dp === undefined ? { kind: 'exact' } : { kind: 'dp', dp },
    usesPractical: f.system !== t.system,
  };
}

describe('厳密形式の判定', () => {
  const question = makeQ('2.5', 'kg', 'g'); // 2500
  it('表記の違いを許す', () => {
    for (const s of ['2500', '2,500', '２５００', '2.5e3', '2500.0', ' 2500 ']) {
      expect(judge(question, s, 'strict').status, s).toBe('correct');
    }
  });
  it('不正な入力は invalid', () => {
    expect(judge(question, '', 'strict').status).toBe('invalid');
    expect(judge(question, 'abc', 'strict').status).toBe('invalid');
  });
  it('1 でもずれたら不正解（練習でも）', () => {
    expect(judge(question, '2501', 'strict').status).toBe('wrong');
    expect(judge(question, '2501', 'lenient').status).toBe('wrong');
  });
  it('桁ずれを検出する', () => {
    expect(judge(question, '250', 'strict')).toEqual({ status: 'wrong', hint: { kind: 'digit-shift', exponent: -1 } });
    expect(judge(question, '25000', 'strict')).toEqual({ status: 'wrong', hint: { kind: 'digit-shift', exponent: 1 } });
  });
  it('掛け算と割り算の逆を検出する', () => {
    // 2 km → m = 2000。逆に割ると 0.002
    const km = makeQ('2', 'km', 'm');
    expect(judge(km, '0.002', 'strict')).toEqual({ status: 'wrong', hint: { kind: 'inverse' } });
  });
  it('面積・体積の次元の取り違えを検出する', () => {
    const area = makeQ('3', 'm2', 'cm2'); // 30000。長さの比 100 を使うと 300
    expect(judge(area, '30000', 'strict').status).toBe('correct');
    expect(judge(area, '300', 'strict')).toEqual({ status: 'wrong', hint: { kind: 'dimension', power: 2 } });
    const vol = makeQ('2', 'm3', 'cm3'); // 2,000,000。長さの比 100 を使うと 200
    expect(judge(vol, '200', 'strict')).toEqual({ status: 'wrong', hint: { kind: 'dimension', power: 3 } });
  });
  it('L→mL のような体積（ℓ基準）では、次元の取り違え扱いにしない', () => {
    const v = makeQ('2', 'L', 'mL');
    expect(judge(v, '20', 'strict')).toEqual({ status: 'wrong', hint: { kind: 'digit-shift', exponent: -2 } });
  });
  it('温度：割り切れる問題の判定', () => {
    const t = makeQ('98.6', 'degF', 'degC');
    expect(judge(t, '37', 'strict').status).toBe('correct');
  });
});

describe('小数第2位までの問題（割り切れない換算）の判定', () => {
  // 100 cm → ft：1 ft = 0.305 m = 30.5 cm なので 100 / 30.5 = 3.2786…
  const question = makeQ('100', 'cm', 'ft', 2);
  it('正解（入力も小数第2位に四捨五入して比べる）', () => {
    for (const s of ['3.28', '3.279', '3.2787', '3.28000']) {
      expect(judge(question, s, 'strict').status, s).toBe('correct');
    }
  });
  it('最後の桁が ±1 ずれた場合：競うモードは不正解、練習は正解扱いでずれを返す', () => {
    expect(judge(question, '3.29', 'strict')).toEqual({ status: 'wrong', hint: { kind: 'last-digit', offset: 1 } });
    expect(judge(question, '3.27', 'strict')).toEqual({ status: 'wrong', hint: { kind: 'last-digit', offset: -1 } });
    expect(judge(question, '3.29', 'lenient')).toEqual({ status: 'correct-offset', offset: 1 });
    expect(judge(question, '3.27', 'lenient')).toEqual({ status: 'correct-offset', offset: -1 });
  });
  it('±2 以上のずれは練習でも不正解', () => {
    expect(judge(question, '3.3', 'lenient').status).toBe('wrong');
    expect(judge(question, '3.26', 'lenient').status).toBe('wrong');
  });
  it('ちょうど半分は切り上げ（0.5 gal × 3.79 L = 1.895 → 1.90）', () => {
    const half = makeQ('0.5', 'usgal', 'L', 2);
    expect(toDecimalString(half.answer)).toBe('1.895');
    expect(judge(half, '1.9', 'strict').status).toBe('correct');
    expect(judge(half, '1.90', 'strict').status).toBe('correct');
    expect(judge(half, '1.89', 'strict').status).toBe('wrong');
  });
});

describe('問題用の係数（有効数字3桁）で計算する', () => {
  it('100 ft → m は 0.305 を使うので 30.5（正確な 0.3048 による 30.48 は不正解）', () => {
    const f = makeQ('100', 'ft', 'm');
    expect(toDecimalString(f.answer)).toBe('30.5');
    expect(judge(f, '30.5', 'strict').status).toBe('correct');
    expect(judge(f, '30.48', 'strict').status).toBe('wrong');
  });
  it('同じ系統どうし（ft → in）は正確な比 12 を使う', () => {
    const f = makeQ('3', 'ft', 'in');
    expect(toDecimalString(f.answer)).toBe('36');
  });
  it('尺 → m は 0.303 を使う（10 尺 = 3.03 m）', () => {
    const f = makeQ('10', 'shaku', 'm');
    expect(toDecimalString(f.answer)).toBe('3.03');
  });
});

function answerInput(qq: Question): string {
  if (qq.spec.kind === 'exact') return toDecimalString(qq.answer);
  if (qq.spec.kind === 'dp') return formatFixed(roundToFraction(qq.answer, qq.spec.dp), qq.spec.dp);
  return formatSig(qq.answer, qq.spec.sig);
}

describe('有効数字3桁の問題（×10ⁿ の2枠入力）', () => {
  // 1 kWh = 3600 kJ… ではなく、BTU → erg で大きな答え。1055 J ≒ 1.055×10^10 erg
  const big = { ...makeQ('528', 'BTU', 'erg'), spec: { kind: 'sig', sig: 3 } as const };
  it('仮数×10^指数の入力は、値が同じなら形に関係なく正解', () => {
    const exp = toSci(big.answer);
    const m = formatSig(exp.mant, 3);
    for (const t of [`${m}e${exp.exp}`, `${m}E${exp.exp}`, `${Number(m) * 10}e${exp.exp - 1}`]) {
      expect(judge(big, t, 'strict').status, t).toBe('correct');
    }
  });
  it('4桁目以降は丸める（3桁に丸めて一致すれば正解）', () => {
    const exp = toSci(big.answer);
    expect(judge(big, `${formatSig(exp.mant, 4)}e${exp.exp}`, 'strict').status).toBe('correct');
  });
  it('最後の桁が±1：競うモードは不正解、練習は正解扱いでずれを返す', () => {
    const exp = toSci(big.answer);
    const target = Math.round(Number(formatSig(exp.mant, 3)) * 100);
    const up = `${((target + 1) / 100).toFixed(2)}e${exp.exp}`;
    expect(judge(big, up, 'strict')).toEqual({ status: 'wrong', hint: { kind: 'last-digit', offset: 1 } });
    expect(judge(big, up, 'lenient')).toEqual({ status: 'correct-offset', offset: 1 });
  });
  it('指数を忘れると不正解（桁ずれのヒント）', () => {
    const exp = toSci(big.answer);
    const r = judge(big, formatSig(exp.mant, 3), 'strict');
    expect(r.status).toBe('wrong');
  });
});

describe('生成した問題の正解は必ず自分で正解になる', () => {
  it('全レベルで、厳密な正解／丸めた正解が correct', () => {
    const rng = new Rng(77);
    for (let level = 1; level <= 10; level++) {
      for (let i = 0; i < 300; i++) {
        const qq = generateQuestion(rng, level, i);
        const text = answerInput(qq);
        expect(judge(qq, text, 'strict').status, `${qq.valueText} ${qq.from.id}->${qq.to.id} = ${text}`).toBe('correct');
      }
    }
  });
  it('単純な係数の確認（mul は有理数で厳密）', () => {
    expect(mul(q('0.1'), q('0.2')).n).toBe(rat(2, 100).n);
  });
});
