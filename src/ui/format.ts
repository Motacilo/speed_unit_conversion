import { SCI_LEVEL, type Question } from '../core/generator';
import { expectedValue, type Hint, type JudgeResult } from '../core/judge';
import { abs, cmp, formatFixed, rat, toDecimalString, toSci } from '../core/rational';

/** 表示用に整数部へ 3 桁区切りを入れる（入力欄・判定には使わない） */
export function groupDigits(text: string): string {
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(text);
  if (!m) return text;
  const [, sg = '', int = '', frac = ''] = m;
  if (int.length <= 4) return text;
  return `${sg}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac}`;
}

const SUP: Readonly<Record<string, string>> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};

/** 指数を上付き文字にする（例：-3 → ⁻³） */
export function superscript(n: number): string {
  return String(n).replace(/[0-9-]/g, (c) => SUP[c] ?? c);
}

/** 「仮数 × 10^指数」の形式で表示する問題か（Lv9 以上の、大きな答え・小さな答え・有効数字指定） */
export function isSciAnswer(q: Question): boolean {
  return (
    q.level >= SCI_LEVEL &&
    (q.spec.kind === 'sig' || cmp(abs(q.answer), rat(1000000)) >= 0 || cmp(abs(q.answer), rat(1, 1000)) < 0)
  );
}

/** 入力枠の内容を表示用の文字列にする（結果表など） */
export function sciInputText(mant: string, exp: string): string {
  const m = mant.trim();
  const e = exp.trim();
  return e === '' ? m : `${m} × 10${superscript(Number(e.replace(/[−－ー]/g, '-')))}`;
}

/** 正解の表示（丸める問題は丸めた値。大きな答えは 仮数 × 10^指数） */
export function answerText(q: Question): string {
  const expected = expectedValue(q);
  if (isSciAnswer(q)) {
    const { mant, exp } = toSci(expected);
    const mantText = q.spec.kind === 'sig' ? formatFixed(mant, q.spec.sig - 1) : toDecimalString(mant);
    return `${mantText} × 10${superscript(exp)}`;
  }
  const raw =
    q.spec.kind === 'exact'
      ? toDecimalString(q.answer)
      : q.spec.kind === 'dp'
        ? formatFixed(expected, q.spec.dp)
        : toDecimalString(expected);
  return groupDigits(raw);
}

/** 問題に添える注意書き（桁数・係数の扱い・指数の枠） */
export function questionNote(q: Question): string {
  const parts: string[] = [];
  if (q.spec.kind === 'dp') parts.push(`小数第 ${q.spec.dp} 位まで答えてください（その下は四捨五入）`);
  if (q.spec.kind === 'sig') parts.push(`有効数字 ${q.spec.sig} 桁で答えてください（その下は四捨五入）`);
  if (q.usesPractical) parts.push('換算の係数は、単位表の有効数字3桁の値を使います');
  if (q.level >= SCI_LEVEL) parts.push('大きな答えは「仮数 × 10 の指数」の2つの枠に分けて答えられます（指数が空欄なら 10⁰）');
  if (parts.length === 0 && (q.from.kind === 'caution' || q.to.kind === 'caution')) parts.push('米国式の単位です');
  return parts.join('。');
}

export function hintMessage(hint: Hint): string {
  switch (hint.kind) {
    case 'digit-shift':
      return hint.exponent > 0
        ? `桁が ${hint.exponent} つ大きすぎます`
        : `桁が ${-hint.exponent} つ小さすぎます`;
    case 'inverse':
      return '掛け算と割り算が逆です';
    case 'dimension':
      return hint.power === 2
        ? '面積は長さの2乗で換算します（長さの倍率を2乗しましょう）'
        : '体積は長さの3乗で換算します（長さの倍率を3乗しましょう）';
    case 'last-digit':
      return `最後の桁が 1 ずれています（${hint.offset > 0 ? '大きい' : '小さい'}）。丸めの違いかもしれません`;
  }
}

export function feedbackMessage(result: JudgeResult): string {
  if (result.status === 'correct-offset') {
    return `最後の桁が ${result.offset > 0 ? '+1' : '−1'} ずれています（練習モードのため正解扱い）`;
  }
  if (result.status === 'wrong' && result.hint) return hintMessage(result.hint);
  return '';
}

export function formatMs(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}秒`;
  const m = Math.floor(s / 60);
  return `${m}分${(s - m * 60).toFixed(1)}秒`;
}

export const LEVEL_DESC: readonly string[] = [
  'k・c・m の基本（長さ・質量・体積・時間）',
  '時間（日）、μ・d・h を追加',
  '小数、n・M・G を追加',
  '面積',
  '体積の次元、料理（大さじ・小さじ・カップ）',
  '速さ、温度（℃↔K）、圧力（Pa 系）',
  'ヤード・ポンド法、米国式の液量',
  '温度（℉）、圧力・エネルギー・仕事率',
  '尺貫法、×10ⁿ の形で答える問題',
  '極端な接頭辞・大きな単位、総合',
];
