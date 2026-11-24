import { describe, expect, it } from 'vitest';
import {
  accuracyOf,
  aggregateByDay,
  avgSecOf,
  dateKey,
  dimRates,
  lastDays,
  niceTicks,
  weakUnits,
} from '../src/ui/stats';
import { emptySave, migrate, type HistoryEntry } from '../src/ui/storage';

const entry = (at: string, correct: number, total: number, answerMs?: number): HistoryEntry => ({
  at,
  mode: 'time10',
  level: 1,
  correct,
  total,
  timeMs: 30000,
  ...(answerMs === undefined ? {} : { answerMs }),
});

// 日付キーは固定（タイムゾーンに依存しないよう、変換関数を差し替える）
const byPrefix = (iso: string): string => iso.slice(0, 10);

describe('日別の集計', () => {
  it('同じ日の記録をまとめ、日付の昇順に並べる', () => {
    const days = aggregateByDay(
      [
        entry('2026-11-14T01:00:00Z', 8, 10, 40000),
        entry('2026-11-13T01:00:00Z', 5, 10, 50000),
        entry('2026-11-14T09:00:00Z', 10, 10, 30000),
      ],
      byPrefix,
    );
    expect(days.map((d) => d.date)).toEqual(['2026-11-13', '2026-11-14']);
    expect(days[1]).toMatchObject({ plays: 2, answered: 20, correct: 18, answerMs: 70000, timedAnswered: 20 });
    expect(accuracyOf(days[1] ?? null)).toBeCloseTo(90);
    expect(avgSecOf(days[1] ?? null)).toBeCloseTo(3.5);
  });

  it('解答時間のない古い記録は、平均時間の対象から外す', () => {
    const days = aggregateByDay([entry('2026-11-14T01:00:00Z', 5, 10), entry('2026-11-14T02:00:00Z', 10, 10, 20000)], byPrefix);
    expect(days[0]).toMatchObject({ answered: 20, timedAnswered: 10 });
    expect(avgSecOf(days[0] ?? null)).toBeCloseTo(2);
    expect(accuracyOf(days[0] ?? null)).toBeCloseTo(75);
  });

  it('記録のない日は null', () => {
    expect(accuracyOf(null)).toBeNull();
    expect(avgSecOf(null)).toBeNull();
  });
});

describe('直近の日数', () => {
  it('プレイのない日も含めて古い順に並べる（月またぎ）', () => {
    const today = new Date(2026, 10, 2); // 2026-11-02
    const stats = aggregateByDay([entry(new Date(2026, 9, 31, 12).toISOString(), 1, 1)]);
    const pts = lastDays(stats, 4, today);
    expect(pts.map((p) => p.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(pts.map((p) => p.stat !== null)).toEqual([false, true, false, false]);
  });
  it('dateKey は 0 埋めする', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('分野別・単位別', () => {
  const save = migrate({
    dimStats: { length: { c: 9, w: 1 }, time: { c: 3, w: 7 }, area: { c: 0, w: 0 } },
    unitStats: { km: { c: 1, w: 1 }, 'm2': { c: 1, w: 4 }, 'cm2': { c: 5, w: 0 }, mm: { c: 20, w: 0 } },
  });
  it('正答率の低い分野から並べ、解答のない分野は出さない', () => {
    const rows = dimRates(save);
    expect(rows.map((r) => r.key)).toEqual(['time', 'length']);
    expect(rows[0]?.rate).toBeCloseTo(0.3);
  });
  it('苦手な単位：3問未満は除き、低い順', () => {
    const rows = weakUnits(save, 3, 8);
    expect(rows.map((r) => r.key)).toEqual(['m2', 'mm', 'cm2']);
  });
  it('空のデータでも落ちない', () => {
    expect(dimRates(emptySave())).toEqual([]);
    expect(weakUnits(emptySave())).toEqual([]);
  });
});

describe('保存データの移行', () => {
  it('不正な値は捨て、既定値で補う', () => {
    const s = migrate({ lastLevel: 99, best10: { '1': 'x', '2': 12345 }, history: [{ at: 1 }], dimStats: { length: { c: 'a', w: 1 } } });
    expect(s.lastLevel).toBe(10);
    expect(s.best10).toEqual({ '2': 12345 });
    expect(s.history).toEqual([]);
    expect(s.dimStats).toEqual({});
  });
  it('古い形式（dimStats なし）でも読める', () => {
    const s = migrate({ version: 1, lastLevel: 3, best10: {}, best60: {}, history: [], unitStats: { km: { c: 1, w: 0 } } });
    expect(s.dimStats).toEqual({});
    expect(s.unitStats['km']).toEqual({ c: 1, w: 0 });
  });
});

describe('軸の目盛り', () => {
  it('キリのよい値', () => {
    expect(niceTicks(10)).toEqual([0, 5, 10]);
    expect(niceTicks(87)).toEqual([0, 50, 100]);
    expect(niceTicks(3.2)[niceTicks(3.2).length - 1]).toBeGreaterThanOrEqual(3.2);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});
