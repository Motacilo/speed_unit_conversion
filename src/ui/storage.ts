/** localStorage への保存。失敗しても遊べるよう、全て try/catch で包む。 */
export const STORAGE_KEY = 'speed-unit-conversion-v1';

export type Mode = 'time10' | 'sec60' | 'practice';

export interface HistoryEntry {
  readonly at: string; // ISO
  readonly mode: Mode;
  readonly level: number;
  readonly correct: number;
  readonly total: number;
  readonly timeMs: number;
  /** 各問を考えていた時間の合計（ペナルティを含まない）。古い記録にはない。 */
  readonly answerMs?: number;
}

export interface SaveData {
  version: 1;
  lastLevel: number;
  /** レベル別の 10問タイムアタック自己ベスト（ペナルティ込みの ms。全問正解のときだけ更新） */
  best10: Record<string, number>;
  /** レベル別の 60秒チャレンジの最高正解数 */
  best60: Record<string, number>;
  history: HistoryEntry[];
  unitStats: Record<string, { c: number; w: number }>;
  /** 分野別の正解数・不正解数（1問を1回として数える） */
  dimStats: Record<string, { c: number; w: number }>;
}

export const emptySave = (): SaveData => ({
  version: 1,
  lastLevel: 1,
  best10: {},
  best60: {},
  history: [],
  unitStats: {},
  dimStats: {},
});

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySave();
    return migrate(JSON.parse(raw));
  } catch {
    return emptySave();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* 保存できなくても続行する */
  }
}

/** 不正・古い形式のデータを安全な形に直す。将来のスキーマ変更はここで吸収する。 */
export function migrate(input: unknown): SaveData {
  const base = emptySave();
  if (typeof input !== 'object' || input === null) return base;
  const o = input as Partial<SaveData>;
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const rec = (x: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (typeof x === 'object' && x !== null) {
      for (const [k, v] of Object.entries(x)) if (num(v)) out[k] = v;
    }
    return out;
  };
  base.lastLevel = num(o.lastLevel) ? Math.min(10, Math.max(1, Math.round(o.lastLevel))) : 1;
  base.best10 = rec(o.best10);
  base.best60 = rec(o.best60);
  if (Array.isArray(o.history)) {
    base.history = o.history
      .filter(
        (h): h is HistoryEntry =>
          typeof h === 'object' &&
          h !== null &&
          typeof (h as HistoryEntry).at === 'string' &&
          num((h as HistoryEntry).level) &&
          num((h as HistoryEntry).correct) &&
          num((h as HistoryEntry).total) &&
          num((h as HistoryEntry).timeMs),
      )
      .slice(-300);
  }
  const counts = (src: unknown, dst: Record<string, { c: number; w: number }>): void => {
    if (typeof src !== 'object' || src === null) return;
    for (const [k, v] of Object.entries(src as Record<string, { c?: unknown; w?: unknown }>)) {
      if (v && num(v.c) && num(v.w)) dst[k] = { c: v.c, w: v.w };
    }
  };
  counts(o.unitStats, base.unitStats);
  counts(o.dimStats, base.dimStats);
  return base;
}

export const exportSave = (data: SaveData): string => JSON.stringify(data, null, 2);

export function importSave(text: string): SaveData | null {
  try {
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
}
