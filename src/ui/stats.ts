import { DIM_LABEL, DIMS, UNITS, type Dim } from '../core/units';
import type { HistoryEntry, SaveData } from './storage';

/** Date → 端末のローカル日付 'YYYY-MM-DD' */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface DayStat {
  readonly date: string;
  /** その日のプレイ回数 */
  readonly plays: number;
  /** 解いた問題数 */
  readonly answered: number;
  readonly correct: number;
  /** 解答時間の合計 ms と、その対象の問題数（古い記録は除く） */
  readonly answerMs: number;
  readonly timedAnswered: number;
}

/** 履歴を日付ごとに集計する（日付の昇順）。 */
export function aggregateByDay(
  history: readonly HistoryEntry[],
  keyOf: (iso: string) => string = (iso) => dateKey(new Date(iso)),
): DayStat[] {
  const map = new Map<string, { plays: number; answered: number; correct: number; answerMs: number; timed: number }>();
  for (const e of history) {
    const key = keyOf(e.at);
    const cur = map.get(key) ?? { plays: 0, answered: 0, correct: 0, answerMs: 0, timed: 0 };
    cur.plays += 1;
    cur.answered += e.total;
    cur.correct += e.correct;
    if (e.answerMs !== undefined) {
      cur.answerMs += e.answerMs;
      cur.timed += e.total;
    }
    map.set(key, cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({
      date,
      plays: v.plays,
      answered: v.answered,
      correct: v.correct,
      answerMs: v.answerMs,
      timedAnswered: v.timed,
    }));
}

export interface DayPoint {
  readonly date: string;
  /** プレイのない日は null */
  readonly stat: DayStat | null;
}

/** 今日までの直近 days 日分（プレイのない日も含む）を古い順に返す。 */
export function lastDays(stats: readonly DayStat[], days: number, today: Date): DayPoint[] {
  const byDate = new Map(stats.map((s) => [s.date, s]));
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dateKey(d);
    out.push({ date: key, stat: byDate.get(key) ?? null });
  }
  return out;
}

/** 正答率（%）。解答がなければ null。 */
export const accuracyOf = (s: DayStat | null): number | null =>
  s && s.answered > 0 ? (s.correct / s.answered) * 100 : null;

/** 1問あたりの平均解答時間（秒）。記録がなければ null。 */
export const avgSecOf = (s: DayStat | null): number | null =>
  s && s.timedAnswered > 0 ? s.answerMs / s.timedAnswered / 1000 : null;

export interface RateRow {
  readonly key: string;
  readonly label: string;
  readonly correct: number;
  readonly wrong: number;
  readonly rate: number;
}

const rateRow = (key: string, label: string, v: { c: number; w: number }): RateRow => ({
  key,
  label,
  correct: v.c,
  wrong: v.w,
  rate: v.c / (v.c + v.w),
});

/** 分野別の正答率（解答のある分野のみ）。正答率の低い順。 */
export function dimRates(save: SaveData): RateRow[] {
  const rows: RateRow[] = [];
  for (const d of DIMS as readonly Dim[]) {
    const v = save.dimStats[d];
    if (v && v.c + v.w > 0) rows.push(rateRow(d, DIM_LABEL[d], v));
  }
  return rows.sort((a, b) => a.rate - b.rate || b.correct + b.wrong - (a.correct + a.wrong));
}

/** 苦手な単位（解答 minN 問以上）。正答率の低い順。 */
export function weakUnits(save: SaveData, minN = 3, limit = 8): RateRow[] {
  const rows: RateRow[] = [];
  for (const [id, v] of Object.entries(save.unitStats)) {
    if (v.c + v.w < minN) continue;
    const unit = UNITS.find((u) => u.id === id);
    rows.push(rateRow(id, unit?.symbol ?? id, v));
  }
  return rows
    .sort((a, b) => a.rate - b.rate || b.correct + b.wrong - (a.correct + a.wrong))
    .slice(0, limit);
}

/** 軸の目盛り：0 から max を含むキリのよい値を count 個前後で返す。 */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}
