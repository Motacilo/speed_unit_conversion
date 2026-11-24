import { describe, expect, it } from 'vitest';
import { convertProblem } from '../src/core/convert';
import {
  dailySeedKey,
  generateQuestion,
  generateRound,
  jstDateString,
  GENERATOR_VERSION,
  SCI_LEVEL,
} from '../src/core/generator';
import { Rng, seedFromString } from '../src/core/rng';
import { abs, cmp, eq, fractionDigits, isTerminating, mul, q, rat, significantDigits } from '../src/core/rational';
import { UNITS } from '../src/core/units';

const mulR = (v: import('../src/core/rational').Rational, k: string) => mul(v, q(k));
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('問題生成', () => {
  for (const level of LEVELS) {
    it(`レベル ${level}：不変条件`, () => {
      const qs = generateRound(1000 + level, level, 400);
      expect(qs).toHaveLength(400);
      for (const q of qs) {
        expect(q.from.dim).toBe(q.to.dim);
        expect(q.from.id).not.toBe(q.to.id);
        expect(q.from.minLevel).toBeLessThanOrEqual(level);
        expect(q.to.minLevel).toBeLessThanOrEqual(level);
        expect(eq(q.answer, convertProblem(q.value, q.from, q.to))).toBe(true);
        expect(q.answer.n).not.toBe(0n);
        if (q.spec.kind === 'exact') {
          // 割り切れる問題：答えは小数第2位まで
          expect(isTerminating(q.answer)).toBe(true);
          // Lv9 以上は、小さな答え（0.01 未満）なら ×10ⁿ で答えられるので桁数の制限なし
          if (!(level >= SCI_LEVEL && cmp(abs(q.answer), rat(1, 100)) < 0)) {
            expect(fractionDigits(q.answer)).toBeLessThanOrEqual(2);
          }
          expect(significantDigits(q.answer)).toBeLessThanOrEqual(7);
        } else {
          // 小数第2位まで答える問題は、ヤード・ポンド法・尺貫法・科学慣用の単位を含む組のみ
          if (q.spec.kind === 'sig') {
            // 有効数字3桁で答える問題は、Lv9 以上の大きな答えだけ
            expect(q.spec.sig).toBe(3);
            expect(level).toBeGreaterThanOrEqual(SCI_LEVEL);
            expect(cmp(abs(q.answer), rat(100000))).toBeGreaterThanOrEqual(0);
          } else {
            expect(q.spec.dp).toBe(2);
            if (level >= SCI_LEVEL) expect(cmp(abs(q.answer), rat(100000))).toBeLessThan(0);
          }
          expect(q.from.system !== 'si' || q.to.system !== 'si').toBe(true);
          expect(level).toBeGreaterThanOrEqual(7);
        }
        // 値の表示は有限小数で、小数は第2位まで、有効数字は3桁以内
        expect(isTerminating(q.value)).toBe(true);
        expect(fractionDigits(q.value)).toBeLessThanOrEqual(2);
        expect(significantDigits(q.value)).toBeLessThanOrEqual(3);
      }
    });
  }

  it('同じシードなら同じ問題列、違うシードなら違う', () => {
    const sig = (qs: ReturnType<typeof generateRound>) => qs.map((q) => `${q.valueText}${q.from.id}>${q.to.id}`).join('|');
    expect(sig(generateRound(42, 5, 30))).toBe(sig(generateRound(42, 5, 30)));
    expect(sig(generateRound(42, 5, 30))).not.toBe(sig(generateRound(43, 5, 30)));
  });

  it('デイリー：日付シードで全員に同じ問題', () => {
    const seed = seedFromString(dailySeedKey('2026-11-15'));
    const a = generateRound(seed, 6, 10).map((q) => q.valueText + q.from.id + q.to.id);
    const b = generateRound(seedFromString(dailySeedKey('2026-11-15')), 6, 10).map((q) => q.valueText + q.from.id + q.to.id);
    const c = generateRound(seedFromString(dailySeedKey('2026-11-16')), 6, 10).map((q) => q.valueText + q.from.id + q.to.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(GENERATOR_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('JST の日付は端末のタイムゾーンに依存しない', () => {
    expect(jstDateString(new Date('2026-11-14T15:00:00Z'))).toBe('2026-11-15');
    expect(jstDateString(new Date('2026-11-14T14:59:59Z'))).toBe('2026-11-14');
  });

  it('分野を絞れる', () => {
    const qs = generateRound(7, 8, 100, { dims: ['temperature'] });
    for (const q of qs) expect(q.from.dim).toBe('temperature');
  });

  it('レベル 1 は長さ・質量・体積・時間だけ', () => {
    const qs = generateRound(9, 1, 300);
    const dims = new Set(qs.map((q) => q.from.dim));
    for (const d of dims) expect(['length', 'mass', 'volume', 'time']).toContain(d);
  });

  it('レベル 10 で、ほぼ全ての単位が出題され得る', () => {
    const used = new Set<string>();
    const rng = new Rng(2026);
    for (let i = 0; i < 20000; i++) {
      const q = generateQuestion(rng, 10, i);
      used.add(q.from.id);
      used.add(q.to.id);
    }
    const missing = UNITS.filter((x) => !used.has(x.id)).map((x) => x.id);
    // 倍率差の上限で組が作れない極端な単位（光年など）は除く
    expect(missing.length, `出題されない単位: ${missing.join(', ')}`).toBeLessThanOrEqual(3);
  });

  it('SI どうし（時間・接頭辞など）は必ず割り切れる（小数第3位が出ない）', () => {
    const rng = new Rng(21);
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      const q = generateQuestion(rng, 6, i, { dims: ['time', 'length', 'mass', 'volume', 'speed'] });
      if (q.from.system === 'si' && q.to.system === 'si') {
        n += 1;
        expect(q.spec.kind).toBe('exact');
        expect(fractionDigits(q.answer)).toBeLessThanOrEqual(2);
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it('分↔時間：割り算になる向きでも割り切れる値を出す', () => {
    const rng = new Rng(8);
    let saw = false;
    for (let i = 0; i < 4000 && !saw; i++) {
      const q = generateQuestion(rng, 3, i, { dims: ['time'] });
      if (q.from.id === 'min' && q.to.id === 'h') {
        saw = true;
        expect(q.spec.kind).toBe('exact');
        expect(fractionDigits(q.answer)).toBeLessThanOrEqual(2);
      }
    }
    expect(saw).toBe(true);
  });

  it('ヤード・ポンド法・尺貫法は、割り切れなければ小数第2位まで（dp）で出る', () => {
    const rng = new Rng(11);
    let dp = 0;
    let exact = 0;
    for (let i = 0; i < 4000; i++) {
      const q = generateQuestion(rng, 10, i, { dims: ['length', 'mass', 'volume', 'area'] });
      if (q.from.system === 'si' && q.to.system === 'si') continue;
      if (q.spec.kind === 'dp') dp += 1;
      else exact += 1;
    }
    expect(dp).toBeGreaterThan(300);
    expect(exact).toBeGreaterThan(50);
  });

  it('系統をまたぐ問題は有効数字3桁の係数を使い、同じ系統どうしは正確な比を使う', () => {
    const rng = new Rng(4);
    let cross = 0;
    let same = 0;
    for (let i = 0; i < 4000 && (cross < 20 || same < 20); i++) {
      const q = generateQuestion(rng, 8, i, { dims: ['length'] });
      if (q.from.id === 'ft' && q.to.id === 'cm') {
        cross += 1;
        expect(q.usesPractical).toBe(true);
        expect(eq(q.answer, convertProblem(q.value, q.from, q.to))).toBe(true);
        // 1 ft = 30.5 cm（0.305 m）として計算されている
        expect(eq(q.answer, mulR(q.value, '30.5'))).toBe(true);
      }
      if (q.from.id === 'ft' && q.to.id === 'in') {
        same += 1;
        expect(q.usesPractical).toBe(false);
        expect(eq(q.answer, mulR(q.value, '12'))).toBe(true);
      }
    }
    expect(cross).toBeGreaterThan(0);
    expect(same).toBeGreaterThan(0);
  });

  it('温度の問題は小数第2位までで割り切れる', () => {
    const qs = generateRound(3, 8, 300, { dims: ['temperature'] });
    for (const q of qs) {
      expect(q.spec.kind).toBe('exact');
      expect(fractionDigits(q.answer)).toBeLessThanOrEqual(2);
    }
  });
});
