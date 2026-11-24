import { describeConversion } from '../core/convert';
import { generateQuestion, SCI_LEVEL, type Question } from '../core/generator';
import { judge, type JudgeMode, type JudgeResult } from '../core/judge';
import { PREFIXES } from '../core/prefixes';
import { Rng } from '../core/rng';
import {
  DIMS,
  DIM_LABEL,
  MAX_LEVEL,
  SYSTEM_LABEL,
  UNITS,
  isApproximate,
  practicalText,
  unitsOf,
  type Dim,
  type Unit,
} from '../core/units';
import { columnChart, lineChart, meterList, type ChartPoint } from './charts';
import { clear, h } from './dom';
import { answerText, feedbackMessage, formatMs, groupDigits, LEVEL_DESC, questionNote, sciInputText } from './format';
import {
  accuracyOf,
  aggregateByDay,
  avgSecOf,
  dimRates,
  lastDays,
  weakUnits,
  type DayPoint,
} from './stats';
import {
  exportSave,
  importSave,
  loadSave,
  writeSave,
  type Mode,
  type SaveData,
} from './storage';

const PENALTY_MS = 3000;
const SEC60_MS = 60_000;
const TIME10_COUNT = 10;

const MODE_LABEL: Record<Mode, string> = {
  time10: '10問タイムアタック',
  sec60: '60秒チャレンジ',
  practice: '練習',
};

interface AnswerRecord {
  readonly q: Question;
  readonly input: string;
  readonly result: JudgeResult;
  readonly ms: number;
}

export function startApp(root: HTMLElement): void {
  let save: SaveData = loadSave();
  let cleanup: (() => void) | null = null;

  const go = (render: () => void): void => {
    cleanup?.();
    cleanup = null;
    clear(root);
    render();
    window.scrollTo(0, 0);
  };

  const persist = (): void => writeSave(save);

  // -------------------------------------------------------------------------
  // ホーム
  // -------------------------------------------------------------------------
  function renderHome(): void {
    let level = save.lastLevel;
    const levelButtons: HTMLButtonElement[] = [];
    const desc = h('p', { class: 'muted' }, LEVEL_DESC[level - 1] ?? '');
    const bests = h('p', { class: 'muted small' });

    const refresh = (): void => {
      levelButtons.forEach((b, i) => b.classList.toggle('active', i + 1 === level));
      desc.textContent = `Lv${level}：${LEVEL_DESC[level - 1] ?? ''}`;
      const b10 = save.best10[String(level)];
      const b60 = save.best60[String(level)];
      bests.textContent =
        `自己ベスト　10問：${b10 === undefined ? '―' : formatMs(b10)}　60秒：${b60 === undefined ? '―' : `${b60}問`}`;
    };

    for (let i = 1; i <= MAX_LEVEL; i++) {
      const b = h('button', {
        class: 'lv',
        type: 'button',
        onclick: () => {
          level = i;
          save.lastLevel = i;
          persist();
          refresh();
        },
      }, String(i));
      levelButtons.push(b);
    }

    const start = (mode: Mode) => () => go(() => renderPlay(mode, level));

    root.append(
      h('main', { class: 'screen' },
        h('h1', null, 'スピード単位換算'),
        h('p', { class: 'lead' }, '単位換算を、速く正確に。数値を入力して Enter。'),
        h('section', null,
          h('h2', null, 'レベル'),
          h('div', { class: 'levels' }, ...levelButtons),
          desc,
          bests,
        ),
        h('section', { class: 'stack' },
          h('button', { class: 'primary', type: 'button', onclick: start('time10') }, '10問タイムアタック'),
          h('button', { class: 'primary', type: 'button', onclick: start('sec60') }, '60秒チャレンジ'),
          h('button', { type: 'button', onclick: start('practice') }, '練習（時間制限なし）'),
          h('button', { type: 'button', onclick: () => go(renderUnits) }, '単位表（単位の概要と換算式）'),
        ),
        h('section', null,
          h('h2', null, '記録'),
          renderStats(),
          save.history.length > 0 && h('button', { type: 'button', onclick: () => go(renderStatsScreen) }, '統計グラフを見る'),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'small', onclick: doExport }, '記録を書き出す'),
            h('label', { class: 'filebtn small' }, '記録を読み込む',
              h('input', { type: 'file', accept: 'application/json', onchange: doImport })),
          ),
        ),
        h('footer', { class: 'muted small' },
          '誤答は +3秒。割り切れない問題は小数第2位まで（その下は四捨五入）で答えます。'),
      ),
    );
    refresh();
  }

  function renderStats(): HTMLElement {
    const total = save.history.length;
    if (total === 0) return h('p', { class: 'muted' }, 'まだ記録がありません。');
    const weak = Object.entries(save.unitStats)
      .filter(([, v]) => v.c + v.w >= 3)
      .map(([id, v]) => ({ id, rate: v.c / (v.c + v.w), n: v.c + v.w }))
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5);
    const symbolOf = (id: string): string => UNITS.find((u) => u.id === id)?.symbol ?? id;
    const recent = save.history.slice(-8).reverse();
    return h('div', null,
      h('p', null, `プレイ回数：${total} 回`),
      weak.length > 0 &&
        h('p', null, '苦手な単位：', weak.map((w) => `${symbolOf(w.id)}（${Math.round(w.rate * 100)}%）`).join('、')),
      h('ul', { class: 'history' },
        ...recent.map((e) =>
          h('li', null,
            `${e.at.slice(5, 16).replace('T', ' ')}　${MODE_LABEL[e.mode]} Lv${e.level}　` +
              `${e.correct}/${e.total}　${formatMs(e.timeMs)}`)),
      ),
    );
  }

  function doExport(): void {
    const blob = new Blob([exportSave(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: 'speed-unit-conversion-save.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function doImport(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      const data = importSave(text);
      if (!data) {
        window.alert('読み込めませんでした（形式が正しくありません）。');
        return;
      }
      save = data;
      persist();
      go(renderHome);
    });
  }

  // -------------------------------------------------------------------------
  // プレイ
  // -------------------------------------------------------------------------
  function renderPlay(mode: Mode, level: number): void {
    const judgeMode: JudgeMode = mode === 'practice' ? 'lenient' : 'strict';
    const rng = new Rng((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    const records: AnswerRecord[] = [];
    let index = 0;
    let current: Question = generateQuestion(rng, level, 0);
    let activeMs = 0;
    let penaltyMs = 0;
    let qStart: number | null = null;
    let streak = 0;
    let bestStreak = 0;
    let finished = false;
    let timer = 0;
    let panelOpen = false;

    const timerEl = h('div', { class: 'timer' });
    const progressEl = h('div', { class: 'progress muted' });
    const streakEl = h('div', { class: 'streak muted' });
    const promptEl = h('div', { class: 'prompt' });
    const noteEl = h('div', { class: 'note muted' });
    const msgEl = h('div', { class: 'msg', role: 'status' });
    const panelEl = h('div', { class: 'panel', hidden: true });
    const form = h('form', { class: 'answer', autocomplete: 'off' });
    const input = h('input', {
      type: 'text',
      inputmode: 'decimal',
      enterkeyhint: 'done',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      'aria-label': '答え',
    });
    // Lv9 以上は「仮数 × 10^指数」の2枠。仮数で Enter → 指数へ、指数で Enter → 決定。Tab でも移動できる。
    const sci = level >= SCI_LEVEL;
    const expInput = h('input', {
      type: 'text',
      class: 'exp',
      inputmode: 'text',
      enterkeyhint: 'done',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder: 'n',
      'aria-label': '10 の指数',
    });
    input.addEventListener('keydown', (ev) => {
      if (sci && ev.key === 'Enter' && !ev.isComposing) {
        ev.preventDefault();
        expInput.focus();
        expInput.select();
      }
    });
    expInput.addEventListener('focus', () => expInput.select());
    const submit = h('button', { type: 'submit', class: 'primary' }, '決定');

    const elapsed = (): number => activeMs + (qStart === null ? 0 : performance.now() - qStart) + penaltyMs;

    const updateTimer = (): void => {
      if (mode === 'sec60') {
        const remain = Math.max(0, SEC60_MS - elapsed());
        timerEl.textContent = `残り ${(remain / 1000).toFixed(1)} 秒`;
        if (remain <= 0 && !panelOpen) finish();
      } else if (mode === 'time10') {
        timerEl.textContent = formatMs(elapsed());
      } else {
        timerEl.textContent = '練習';
      }
      const correct = records.filter((r) => r.result.status === 'correct' || r.result.status === 'correct-offset').length;
      progressEl.textContent =
        mode === 'time10'
          ? `${Math.min(index + 1, TIME10_COUNT)} / ${TIME10_COUNT}`
          : `正解 ${correct} / 解答 ${records.length}`;
      streakEl.textContent = `連続正解 ${streak}`;
    };

    const showQuestion = (): void => {
      const q = current;
      clear(promptEl);
      promptEl.append(
        h('span', { class: 'val' }, groupDigits(q.valueText)),
        h('span', { class: 'unit' }, q.from.symbol),
        h('span', { class: 'eq' }, '='),
      );
      clear(form);
      input.value = '';
      expInput.value = '';
      if (sci) {
        form.append(
          input,
          h('span', { class: 'times' }, '× 10'),
          expInput,
          h('span', { class: 'unit' }, q.to.symbol),
          submit,
        );
      } else {
        form.append(input, h('span', { class: 'unit' }, q.to.symbol), submit);
      }
      noteEl.textContent = questionNote(q);
      msgEl.textContent = '';
      qStart = performance.now();
      input.focus();
    };

    const finish = (): void => {
      if (finished) return;
      finished = true;
      window.clearInterval(timer);
      const time = activeMs + (qStart === null ? 0 : performance.now() - qStart) + penaltyMs;
      const correct = records.filter((r) => r.result.status === 'correct' || r.result.status === 'correct-offset').length;
      saveResult(mode, level, records, correct, Math.min(time, mode === 'sec60' ? SEC60_MS : time));
      go(() => renderResult(mode, level, records, bestStreak, Math.min(time, mode === 'sec60' ? SEC60_MS : time)));
    };

    const next = (): void => {
      panelOpen = false;
      panelEl.hidden = true;
      index += 1;
      if (mode === 'time10' && index >= TIME10_COUNT) {
        finish();
        return;
      }
      current = generateQuestion(rng, level, index);
      showQuestion();
      updateTimer();
    };

    const openPanel = (result: JudgeResult, userInput: string): void => {
      panelOpen = true;
      const q = current;
      const ok = result.status === 'correct-offset';
      clear(panelEl);
      const btn = h('button', { type: 'button', class: 'primary', disabled: true, onclick: next }, '次へ（Enter）');
      panelEl.append(
        h('div', { class: ok ? 'verdict ok' : 'verdict ng' }, ok ? '正解（ずれあり）' : '不正解（+3秒）'),
        h('div', null, `あなたの答え：${groupDigits(userInput.trim())} ${q.to.symbol}`),
        h('div', null, `正解：${answerText(q)} ${q.to.symbol}`),
        feedbackMessage(result) !== '' ? h('div', { class: 'hint' }, feedbackMessage(result)) : '',
        h('div', { class: 'formula muted small' }, describeConversion(q.from, q.to)),
        btn,
      );
      panelEl.hidden = false;
      setTimeout(() => {
        btn.disabled = false;
        btn.focus();
      }, 350);
    };

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (finished || panelOpen || qStart === null) return;
      const mantText = input.value.trim();
      const expText = sci ? expInput.value.trim().replace(/[−－ー]/g, '-') : '';
      if (sci && expText !== '' && !/^[+-]?\d{1,2}$/.test(expText)) {
        msgEl.textContent = '指数は整数で入力してください（例：3、-2）';
        expInput.focus();
        return;
      }
      const text = sci ? sciInputText(input.value, expInput.value) : input.value;
      const result = judge(current, expText === '' ? mantText : `${mantText}e${expText}`, judgeMode);
      if (result.status === 'invalid') {
        msgEl.textContent = '数値を入力してください（例：2500、2.5）';
        input.focus();
        return;
      }
      const ms = performance.now() - qStart;
      activeMs += ms;
      qStart = null;
      records.push({ q: current, input: text, result, ms });
      const good = result.status === 'correct' || result.status === 'correct-offset';
      if (good) {
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
      } else {
        streak = 0;
        penaltyMs += PENALTY_MS;
      }
      updateTimer();
      if (result.status === 'correct') {
        next();
      } else {
        // 不正解・ずれあり：正解と換算式を見せる（この間、時間は止まる）
        openPanel(result, text);
      }
    });

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') go(renderHome);
    };
    document.addEventListener('keydown', onKey);
    timer = window.setInterval(updateTimer, 100);
    cleanup = () => {
      window.clearInterval(timer);
      document.removeEventListener('keydown', onKey);
    };

    root.append(
      h('main', { class: 'screen play' },
        h('div', { class: 'bar' },
          h('button', { type: 'button', class: 'small', onclick: () => go(renderHome) }, '← ホーム'),
          h('span', { class: 'muted small' }, `${MODE_LABEL[mode]}　Lv${level}`),
          mode === 'practice' && h('button', { type: 'button', class: 'small', onclick: finish }, '終了'),
        ),
        h('div', { class: 'stats' }, timerEl, progressEl, streakEl),
        promptEl,
        form,
        noteEl,
        msgEl,
        panelEl,
      ),
    );
    showQuestion();
    updateTimer();
  }

  function saveResult(mode: Mode, level: number, records: AnswerRecord[], correct: number, timeMs: number): void {
    if (records.length === 0) return;
    save.history.push({
      at: new Date().toISOString(),
      mode,
      level,
      correct,
      total: records.length,
      timeMs: Math.round(timeMs),
      answerMs: Math.round(records.reduce((a, r) => a + r.ms, 0)),
    });
    save.history = save.history.slice(-300);
    for (const r of records) {
      const good = r.result.status === 'correct' || r.result.status === 'correct-offset';
      const dimStat = save.dimStats[r.q.from.dim] ?? { c: 0, w: 0 };
      if (good) dimStat.c += 1;
      else dimStat.w += 1;
      save.dimStats[r.q.from.dim] = dimStat;
      for (const id of new Set([r.q.from.id, r.q.to.id])) {
        const s = save.unitStats[id] ?? { c: 0, w: 0 };
        if (good) s.c += 1;
        else s.w += 1;
        save.unitStats[id] = s;
      }
    }
    const key = String(level);
    if (mode === 'time10' && records.length === TIME10_COUNT && correct === TIME10_COUNT) {
      const prev = save.best10[key];
      if (prev === undefined || timeMs < prev) save.best10[key] = Math.round(timeMs);
    }
    if (mode === 'sec60') {
      const prev = save.best60[key];
      if (prev === undefined || correct > prev) save.best60[key] = correct;
    }
    persist();
  }

  // -------------------------------------------------------------------------
  // 結果
  // -------------------------------------------------------------------------
  function renderResult(mode: Mode, level: number, records: AnswerRecord[], bestStreak: number, timeMs: number): void {
    const correct = records.filter((r) => r.result.status === 'correct' || r.result.status === 'correct-offset').length;
    const offsets = records.filter((r) => r.result.status === 'correct-offset').length;
    const total = records.length;
    const avg = total > 0 ? records.reduce((a, r) => a + r.ms, 0) / total : 0;
    const key = String(level);
    const isBest10 = mode === 'time10' && correct === TIME10_COUNT && save.best10[key] === Math.round(timeMs);

    root.append(
      h('main', { class: 'screen' },
        h('h1', null, '結果'),
        h('p', { class: 'muted' }, `${MODE_LABEL[mode]}　Lv${level}`),
        h('div', { class: 'summary' },
          h('div', null, h('b', null, `${correct} / ${total}`), ' 正解'),
          h('div', null, '正答率 ', h('b', null, total === 0 ? '―' : `${Math.round((correct / total) * 100)}%`)),
          mode !== 'practice' && h('div', null, 'タイム ', h('b', null, formatMs(timeMs)), '（誤答 +3秒込み）'),
          h('div', null, '平均 ', h('b', null, total === 0 ? '―' : formatMs(avg)), ' / 問'),
          h('div', null, '最大連続正解 ', h('b', null, bestStreak)),
          offsets > 0 && h('div', { class: 'hint' }, `ずれあり ${offsets} 問（最後の桁が ±1。練習モードのため正解扱い）`),
          isBest10 && h('div', { class: 'ok' }, '自己ベスト更新！'),
        ),
        h('h2', null, '問題の振り返り'),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'result-table' },
            h('thead', null, h('tr', null, ...['', '問題', 'あなたの答え', '正解', 'メモ'].map((t) => h('th', null, t)))),
            h('tbody', null, ...records.map(resultRow)),
          ),
        ),
        h('section', { class: 'stack' },
          h('button', { class: 'primary', type: 'button', onclick: () => go(() => renderPlay(mode, level)) }, 'もう一度'),
          h('button', { type: 'button', onclick: () => go(renderHome) }, 'ホームへ'),
        ),
      ),
    );
  }

  function resultRow(r: AnswerRecord): HTMLElement {
    const st = r.result.status;
    const mark = st === 'correct' ? '✓' : st === 'correct-offset' ? '△' : '✗';
    const memo = feedbackMessage(r.result);
    const formula = st === 'correct' ? '' : describeConversion(r.q.from, r.q.to);
    return h('tr', { class: st === 'correct' ? 'ok' : st === 'correct-offset' ? 'off' : 'ng' },
      h('td', { class: 'mark' }, mark),
      h('td', null, `${groupDigits(r.q.valueText)} ${r.q.from.symbol} → ${r.q.to.symbol}`),
      h('td', null, r.input.trim() === '' ? '―' : groupDigits(r.input.trim())),
      h('td', null, `${answerText(r.q)}${r.q.spec.kind === 'dp' ? `（小数第${r.q.spec.dp}位まで）` : ''}`),
      h('td', { class: 'small' }, memo, memo !== '' && formula !== '' ? h('br') : null, formula !== '' ? h('span', { class: 'muted' }, formula) : null),
    );
  }


  // -------------------------------------------------------------------------
  // 統計
  // -------------------------------------------------------------------------
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

  function dayLabels(date: string): { label: string; title: string } {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? '';
    return { label: `${m}/${d}`, title: `${m}/${d}（${wd}）` };
  }

  function renderStatsScreen(): void {
    let days = 30;
    const body = h('div', null);
    const rangeButtons: HTMLButtonElement[] = [];
    const RANGES = [7, 30, 90] as const;

    const sum = (pts: DayPoint[]): { plays: number; answered: number; correct: number; ms: number; timed: number } =>
      pts.reduce(
        (a, p) => ({
          plays: a.plays + (p.stat?.plays ?? 0),
          answered: a.answered + (p.stat?.answered ?? 0),
          correct: a.correct + (p.stat?.correct ?? 0),
          ms: a.ms + (p.stat?.answerMs ?? 0),
          timed: a.timed + (p.stat?.timedAnswered ?? 0),
        }),
        { plays: 0, answered: 0, correct: 0, ms: 0, timed: 0 },
      );

    const tile = (label: string, value: string): HTMLElement =>
      h('div', { class: 'tile' }, h('div', { class: 'tile-label muted small' }, label), h('div', { class: 'tile-value' }, value));

    const draw = (): void => {
      rangeButtons.forEach((b, i) => b.classList.toggle('active', RANGES[i] === days));
      clear(body);
      const width = Math.max(280, Math.round(body.clientWidth - 26));
      const stats = aggregateByDay(save.history);
      const pts = lastDays(stats, days, new Date());
      const total = sum(pts);

      const accPoints: ChartPoint[] = pts.map((p) => {
        const v = accuracyOf(p.stat);
        return {
          ...dayLabels(p.date),
          value: v,
          valueText: v === null || !p.stat ? 'プレイなし' : `${Math.round(v)}%（解答 ${p.stat.answered} 問）`,
        };
      });
      const timePoints: ChartPoint[] = pts.map((p) => {
        const v = avgSecOf(p.stat);
        return {
          ...dayLabels(p.date),
          value: v,
          valueText: v === null ? (p.stat ? '記録なし' : 'プレイなし') : `${v.toFixed(1)}秒`,
        };
      });
      const countPoints: ChartPoint[] = pts.map((p) => ({
        ...dayLabels(p.date),
        value: p.stat ? p.stat.answered : null,
        valueText: p.stat ? `${p.stat.answered} 問（${p.stat.plays} 回）` : 'プレイなし',
      }));

      const played = pts.filter((p) => p.stat !== null);
      body.append(
        h('div', { class: 'tiles' },
          tile('プレイ回数', `${total.plays} 回`),
          tile('解いた問題', `${total.answered} 問`),
          tile('正答率', total.answered > 0 ? `${Math.round((total.correct / total.answered) * 100)}%` : '―'),
          tile('平均解答時間', total.timed > 0 ? `${(total.ms / total.timed / 1000).toFixed(1)}秒` : '―'),
        ),
        lineChart({
          title: '日ごとの正答率',
          seriesName: '正答率',
          points: accPoints,
          fixedMax: 100,
          width,
          tickFormat: (v) => `${v}`,
          endFormat: (v) => `${Math.round(v)}%`,
        }),
        lineChart({
          title: '日ごとの平均解答時間（1問あたり・秒）',
          seriesName: '平均解答時間',
          points: timePoints,
          width,
          tickFormat: (v) => `${v}`,
          endFormat: (v) => `${v.toFixed(1)}秒`,
        }),
        columnChart({
          title: '日ごとに解いた問題数',
          seriesName: '解いた問題',
          points: countPoints,
          width,
          tickFormat: (v) => `${v}`,
        }),
        h('details', { class: 'tableview' },
          h('summary', null, '数値を表で見る'),
          h('div', { class: 'table-wrap' },
            h('table', null,
              h('thead', null, h('tr', null, ...['日付', 'プレイ', '解答', '正答率', '平均解答時間'].map((t) => h('th', null, t)))),
              h('tbody', null,
                ...(played.length === 0
                  ? [h('tr', null, h('td', { colspan: 5 }, 'この期間の記録はありません。'))]
                  : played
                      .slice()
                      .reverse()
                      .map((p) => {
                        const acc = accuracyOf(p.stat);
                        const sec = avgSecOf(p.stat);
                        return h('tr', null,
                          h('td', null, dayLabels(p.date).title),
                          h('td', null, `${p.stat?.plays ?? 0} 回`),
                          h('td', null, `${p.stat?.answered ?? 0} 問`),
                          h('td', null, acc === null ? '―' : `${Math.round(acc)}%`),
                          h('td', null, sec === null ? '―' : `${sec.toFixed(1)}秒`));
                      })),
              ),
            ),
          ),
        ),
        h('h2', null, '分野別の正答率（全期間・低い順）'),
        meterList(dimRates(save)),
        h('h2', null, '苦手な単位（全期間・3問以上）'),
        weakTable(),
      );
    };

    const weakTable = (): HTMLElement => {
      const rows = weakUnits(save);
      if (rows.length === 0) return h('p', { class: 'muted small' }, '該当する単位がありません（同じ単位を3問以上解くと表示されます）。');
      return h('div', { class: 'table-wrap' },
        h('table', null,
          h('thead', null, h('tr', null, ...['単位', '正答率', '解答'].map((t) => h('th', null, t)))),
          h('tbody', null,
            ...rows.map((r) =>
              h('tr', null,
                h('td', { class: 'sym' }, r.label),
                h('td', null, `${Math.round(r.rate * 100)}%`),
                h('td', null, `${r.correct + r.wrong} 問`)))),
        ),
      );
    };

    for (const d of RANGES) {
      rangeButtons.push(
        h('button', {
          type: 'button',
          class: 'tab',
          onclick: () => {
            days = d;
            draw();
          },
        }, `直近 ${d} 日`),
      );
    }

    root.append(
      h('main', { class: 'screen wide' },
        h('div', { class: 'bar' },
          h('button', { type: 'button', class: 'small', onclick: () => go(renderHome) }, '← ホーム'),
          h('h1', { class: 'inline' }, '統計'),
        ),
        h('div', { class: 'tabs' }, ...rangeButtons),
        save.history.length === 0
          ? h('p', { class: 'muted' }, 'まだ記録がありません。遊ぶとここにグラフが出ます。')
          : body,
        h('p', { class: 'muted small' }, '平均解答時間は考えていた時間のみで、誤答のペナルティ（+3秒）は含みません。'),
      ),
    );
    if (save.history.length > 0) draw();
  }

  // -------------------------------------------------------------------------
  // 単位表
  // -------------------------------------------------------------------------
  function renderUnits(): void {
    let tab: Dim | 'prefix' = 'length';
    let query = '';
    const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
    const bodyEl = h('div', null);
    const kindLabel = { definition: '定義', convention: '慣用', caution: '注意' } as const;

    const draw = (): void => {
      clear(tabsEl);
      for (const d of DIMS) {
        tabsEl.append(
          h('button', {
            type: 'button',
            role: 'tab',
            class: `tab${tab === d ? ' active' : ''}`,
            onclick: () => {
              tab = d;
              draw();
            },
          }, DIM_LABEL[d]),
        );
      }
      tabsEl.append(
        h('button', {
          type: 'button',
          role: 'tab',
          class: `tab${tab === 'prefix' ? ' active' : ''}`,
          onclick: () => {
            tab = 'prefix';
            draw();
          },
        }, 'SI接頭辞'),
      );
      clear(bodyEl);
      if (tab === 'prefix') bodyEl.append(prefixTable());
      else bodyEl.append(unitTable(tab), converterBox(tab));
    };

    const matches = (u: Unit): boolean => {
      const t = query.trim().toLowerCase();
      if (t === '') return true;
      return [u.symbol, u.name, u.id, u.definition, u.note ?? ''].some((s) => s.toLowerCase().includes(t));
    };

    const unitTable = (dim: Dim): HTMLElement => {
      const rows = unitsOf(dim).filter(matches);
      return h('div', { class: 'table-wrap' },
        h('table', { class: 'unit-table' },
          h('thead', null,
            h('tr', null, ...['単位', '読み・名称', '1単位 =（問題で使う係数）', '系統', '区分', '出題Lv', '備考'].map((t) => h('th', null, t)))),
          h('tbody', null,
            ...(rows.length === 0
              ? [h('tr', null, h('td', { colspan: 7 }, '該当する単位がありません。'))]
              : rows.map((u) =>
                  h('tr', null,
                    h('td', { class: 'sym' }, u.symbol),
                    h('td', null, u.name),
                    h('td', null,
                      practicalText(u),
                      isApproximate(u) ? h('div', { class: 'muted small' }, `正確には ${u.definition}`) : null),
                    h('td', { class: 'small' }, SYSTEM_LABEL[u.system]),
                    h('td', null, h('span', { class: `chip ${u.kind}` }, kindLabel[u.kind])),
                    h('td', null, u.minLevel),
                    h('td', { class: 'small' }, u.note ?? ''),
                  ))),
          ),
        ),
      );
    };

    const prefixTable = (): HTMLElement =>
      h('div', { class: 'table-wrap' },
        h('table', { class: 'unit-table' },
          h('thead', null, h('tr', null, ...['記号', '名称', '倍率'].map((t) => h('th', null, t)))),
          h('tbody', null,
            ...PREFIXES.map((p) =>
              h('tr', null, h('td', { class: 'sym' }, p.symbol), h('td', null, p.name), h('td', null, `10^${p.exponent}`))),
          ),
        ),
      );

    const converterBox = (dim: Dim): HTMLElement => {
      const us = unitsOf(dim);
      const fromSel = h('select', { 'aria-label': '換算元' }, ...us.map((u) => h('option', { value: u.id }, u.symbol)));
      const toSel = h('select', { 'aria-label': '換算先' }, ...us.map((u) => h('option', { value: u.id }, u.symbol)));
      if (us.length > 1) toSel.selectedIndex = 1;
      const out = h('p', { class: 'formula' });
      const update = (): void => {
        const f = us.find((u) => u.id === fromSel.value);
        const t = us.find((u) => u.id === toSel.value);
        out.textContent = f && t ? (f.id === t.id ? '同じ単位です。' : describeConversion(f, t)) : '';
      };
      fromSel.addEventListener('change', update);
      toSel.addEventListener('change', update);
      update();
      return h('section', { class: 'converter' },
        h('h2', null, '換算式を確認'),
        h('div', { class: 'row' }, fromSel, h('span', null, '→'), toSel),
        out,
        h('p', { class: 'muted small' }, '係数が1より小さいときは割り算（例：分 → 時間は「/ 60」）で表示します。割り切れない係数は分数（と近似値）で表示します。出題・判定は正確な分数で計算しています。'),
      );
    };

    root.append(
      h('main', { class: 'screen wide' },
        h('div', { class: 'bar' },
          h('button', { type: 'button', class: 'small', onclick: () => go(renderHome) }, '← ホーム'),
          h('h1', { class: 'inline' }, '単位表'),
        ),
        h('input', {
          type: 'search',
          class: 'search',
          placeholder: '単位を検索（記号・名称・定義）',
          'aria-label': '検索',
          oninput: (e: Event) => {
            query = (e.target as HTMLInputElement).value;
            if (tab !== 'prefix') {
              clear(bodyEl);
              bodyEl.append(unitTable(tab), converterBox(tab));
            }
          },
        }),
        tabsEl,
        bodyEl,
        h('p', { class: 'muted small' },
          '区分：定義＝定義による厳密な値／慣用＝慣習として決まった値／注意＝地域・用途で値が異なる単位（前提を明示）。' +
            '出題Lv＝その単位が出題され始めるレベル。'),
        h('p', { class: 'muted small' },
          '換算の係数：メートル法どうし、また同じ系統どうし（例：ft と inch）は正確な比で計算します。' +
            'ヤード・ポンド法・尺貫法・科学の慣用単位とメートル法のあいだ（例：ft と m）では、' +
            '上の表の「有効数字3桁の係数」を使い、小数第2位まで（その下は四捨五入）で答えます。'),
      ),
    );
    draw();
  }

  go(renderHome);
}
