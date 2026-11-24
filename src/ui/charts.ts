import { h } from './dom';
import { niceTicks, type RateRow } from './stats';

const NS = 'http://www.w3.org/2000/svg';

function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | undefined> = {},
  ...children: (SVGElement | string)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v));
  for (const c of children) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

export interface ChartPoint {
  /** 横軸のラベル（例：11/15） */
  readonly label: string;
  /** プレイのない日などは null */
  readonly value: number | null;
  /** ツールチップの見出し（例：11/15（日）） */
  readonly title: string;
  /** ツールチップの値の表示（例：85%（解答 20 問）） */
  readonly valueText: string;
}

export interface ChartOptions {
  readonly title: string;
  readonly seriesName: string;
  readonly points: readonly ChartPoint[];
  /** 縦軸の最大値を固定する（正答率なら 100） */
  readonly fixedMax?: number;
  readonly tickFormat?: (v: number) => string;
  readonly endFormat?: (v: number) => string;
  readonly emptyText?: string;
  /** 描画する幅（px）。画面の幅に合わせて渡すと、文字が縮まず読める。 */
  readonly width?: number;
}

interface Dims {
  readonly W: number;
  readonly H: number;
  readonly M: { readonly l: number; readonly r: number; readonly t: number; readonly b: number };
  readonly PLOT_W: number;
  readonly PLOT_H: number;
}

function dimsFor(width: number | undefined): Dims {
  const W = Math.min(720, Math.max(280, Math.round(width ?? 640)));
  const narrow = W < 480;
  const H = narrow ? 200 : 220;
  const M = { l: narrow ? 36 : 46, r: narrow ? 46 : 54, t: 16, b: 28 };
  return { W, H, M, PLOT_W: W - M.l - M.r, PLOT_H: H - M.t - M.b };
}

function xTickIndexes(n: number): number[] {
  if (n <= 8) return Array.from({ length: n }, (_, i) => i);
  const step = Math.ceil((n - 1) / 5);
  const idx: number[] = [];
  for (let i = 0; i < n; i += step) if (n - 1 - i >= step * 0.6 || i === 0) idx.push(i);
  idx.push(n - 1);
  return idx;
}

interface Frame {
  readonly dims: Dims;
  readonly figure: HTMLElement;
  readonly svg: SVGSVGElement;
  readonly tip: HTMLElement;
  readonly yOf: (v: number) => number;
  readonly xOf: (i: number) => number;
  readonly yMax: number;
}

/** 軸・グリッド・ツールチップ枠までを作る（線や棒は呼び出し側で描く）。 */
function frame(opts: ChartOptions, xMode: 'point' | 'slot'): Frame {
  const dims = dimsFor(opts.width);
  const { W, H, M, PLOT_W, PLOT_H } = dims;
  const n = opts.points.length;
  const values = opts.points.map((p) => p.value ?? 0);
  const ticks = opts.fixedMax !== undefined ? [0, opts.fixedMax / 2, opts.fixedMax] : niceTicks(Math.max(...values, 0), 4);
  const yMax = ticks[ticks.length - 1] ?? 1;
  const yOf = (v: number): number => M.t + PLOT_H * (1 - v / yMax);
  const xOf = (i: number): number =>
    xMode === 'slot' ? M.l + (PLOT_W / n) * (i + 0.5) : n === 1 ? M.l + PLOT_W / 2 : M.l + (PLOT_W * i) / (n - 1);

  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': `${opts.title}のグラフ`,
    class: 'chart-svg',
  });
  const fmt = opts.tickFormat ?? ((v: number) => String(v));

  for (const t of ticks) {
    const y = yOf(t);
    svg.append(
      s('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, class: t === 0 ? 'axis' : 'grid' }),
      s('text', { x: M.l - 8, y: y + 4, 'text-anchor': 'end', class: 'tick' }, fmt(t)),
    );
  }
  for (const i of xTickIndexes(n)) {
    svg.append(
      s('text', { x: xOf(i), y: H - 8, 'text-anchor': 'middle', class: 'tick' }, opts.points[i]?.label ?? ''),
    );
  }

  const tip = h('div', { class: 'chart-tip', hidden: true, role: 'status' });
  const figure = h('figure', { class: 'chart' },
    h('figcaption', null, h('b', null, opts.title)),
    h('div', { class: 'chart-wrap' }, svg, tip),
  );
  return { dims, figure, svg, tip, yOf, xOf, yMax };
}

/** ツールチップの内容は textContent / createTextNode で入れる（外部由来の文字列を信頼しない）。 */
function showTip(f: Frame, opts: ChartOptions, i: number): void {
  const p = opts.points[i];
  if (!p) return;
  const tip = f.tip;
  while (tip.firstChild) tip.removeChild(tip.firstChild);
  tip.append(
    h('div', { class: 'tip-title' }, p.title),
    h('div', { class: 'tip-row' },
      h('span', { class: 'tip-key', 'aria-hidden': 'true' }),
      h('b', null, p.valueText),
      h('span', { class: 'tip-name' }, ` ${opts.seriesName}`),
    ),
  );
  tip.hidden = false;
  const wrap = tip.parentElement;
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const px = (f.xOf(i) / f.dims.W) * rect.width;
  const half = tip.offsetWidth / 2;
  const left = Math.min(Math.max(px, half + 4), Math.max(half + 4, rect.width - half - 4));
  tip.style.left = `${left}px`;
}

function hideTip(f: Frame): void {
  f.tip.hidden = true;
}

function pointerIndex(ev: PointerEvent, f: Frame, n: number, mode: 'point' | 'slot'): number {
  const { W, M, PLOT_W } = f.dims;
  const rect = f.svg.getBoundingClientRect();
  const px = ((ev.clientX - rect.left) / rect.width) * W;
  const raw = mode === 'slot' ? Math.floor(((px - M.l) / PLOT_W) * n) : Math.round(((px - M.l) / PLOT_W) * (n - 1));
  return Math.min(n - 1, Math.max(0, raw));
}

function emptyChart(opts: ChartOptions): HTMLElement {
  return h('figure', { class: 'chart' },
    h('figcaption', null, h('b', null, opts.title)),
    h('p', { class: 'muted small' }, opts.emptyText ?? 'まだ記録がありません。'),
  );
}

/** 折れ線：2px、マーカーは 8px 以上＋面色のリング、最後の値だけ直接ラベル、十字線＋ツールチップ。 */
export function lineChart(opts: ChartOptions): HTMLElement {
  const n = opts.points.length;
  const valid = opts.points.map((p, i) => ({ p, i })).filter((x) => x.p.value !== null);
  if (n === 0 || valid.length === 0) return emptyChart(opts);

  const f = frame(opts, 'point');
  const { M, PLOT_W, PLOT_H } = f.dims;
  const cross = s('line', { y1: M.t, y2: M.t + PLOT_H, class: 'cross', visibility: 'hidden' });
  f.svg.append(cross);

  const coords = valid.map(({ p, i }) => [f.xOf(i), f.yOf(p.value as number)] as const);
  if (coords.length > 1) {
    f.svg.append(s('path', { d: coords.map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' '), class: 'line' }));
  }
  const showAllMarkers = valid.length <= 31;
  valid.forEach(({ p, i }, k) => {
    const isLast = k === valid.length - 1;
    if (!showAllMarkers && !isLast) return;
    const [x, y] = coords[k] as readonly [number, number];
    const g = s('g', { tabindex: 0, class: 'marker', role: 'img', 'aria-label': `${p.title} ${p.valueText}` },
      s('circle', { cx: x, cy: y, r: 12, class: 'hit' }),
      s('circle', { cx: x, cy: y, r: 6, class: 'ring' }),
      s('circle', { cx: x, cy: y, r: 4, class: 'dot' }),
    );
    g.addEventListener('focus', () => {
      cross.setAttribute('x1', String(f.xOf(i)));
      cross.setAttribute('x2', String(f.xOf(i)));
      cross.setAttribute('visibility', 'visible');
      showTip(f, opts, i);
    });
    g.addEventListener('blur', () => {
      cross.setAttribute('visibility', 'hidden');
      hideTip(f);
    });
    f.svg.append(g);
  });

  // 最後の値だけ直接ラベルを付ける
  const last = valid[valid.length - 1];
  const lastXY = coords[coords.length - 1];
  if (last && lastXY) {
    const text = (opts.endFormat ?? opts.tickFormat ?? String)(last.p.value as number);
    f.svg.append(s('text', { x: lastXY[0] + 10, y: lastXY[1] + 4, class: 'endlabel' }, text));
  }

  const overlay = s('rect', { x: M.l, y: M.t, width: PLOT_W, height: PLOT_H, fill: 'transparent', class: 'overlay' });
  const move = (ev: PointerEvent): void => {
    const i = pointerIndex(ev, f, n, 'point');
    cross.setAttribute('x1', String(f.xOf(i)));
    cross.setAttribute('x2', String(f.xOf(i)));
    cross.setAttribute('visibility', 'visible');
    showTip(f, opts, i);
  };
  overlay.addEventListener('pointermove', move);
  overlay.addEventListener('pointerdown', move);
  overlay.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    hideTip(f);
  });
  f.svg.append(overlay);
  return f.figure;
}

/** 縦棒：太さ 24px 以内、上端 4px 丸め・下端は直角、各棒がホバー対象（スロット幅いっぱい）。 */
export function columnChart(opts: ChartOptions): HTMLElement {
  const n = opts.points.length;
  if (n === 0 || opts.points.every((p) => !p.value)) return emptyChart(opts);
  const f = frame(opts, 'slot');
  const { M, PLOT_W, PLOT_H } = f.dims;
  const slot = PLOT_W / n;
  const barW = Math.min(24, slot * 0.6);
  const base = f.yOf(0);
  const maxVal = Math.max(...opts.points.map((p) => p.value ?? 0));
  let labeled = false;

  opts.points.forEach((p, i) => {
    const cx = f.xOf(i);
    const g = s('g', { tabindex: 0, class: 'bar', role: 'img', 'aria-label': `${p.title} ${p.valueText}` });
    g.append(s('rect', { x: cx - slot / 2, y: M.t, width: slot, height: PLOT_H, class: 'hit' }));
    const v = p.value ?? 0;
    if (v > 0) {
      const top = f.yOf(v);
      const hgt = base - top;
      const r = Math.min(4, hgt, barW / 2);
      const x0 = cx - barW / 2;
      const d =
        `M${x0.toFixed(1)},${base.toFixed(1)} V${(top + r).toFixed(1)} ` +
        `Q${x0.toFixed(1)},${top.toFixed(1)} ${(x0 + r).toFixed(1)},${top.toFixed(1)} ` +
        `H${(x0 + barW - r).toFixed(1)} Q${(x0 + barW).toFixed(1)},${top.toFixed(1)} ${(x0 + barW).toFixed(1)},${(top + r).toFixed(1)} ` +
        `V${base.toFixed(1)} Z`;
      g.append(s('path', { d, class: 'fill' }));
      if (v === maxVal && !labeled) {
        labeled = true;
        g.append(s('text', { x: cx, y: top - 6, 'text-anchor': 'middle', class: 'endlabel' }, String(v)));
      }
    }
    const show = (): void => showTip(f, opts, i);
    g.addEventListener('pointerenter', show);
    g.addEventListener('pointerdown', show);
    g.addEventListener('focus', show);
    g.addEventListener('pointerleave', () => hideTip(f));
    g.addEventListener('blur', () => hideTip(f));
    f.svg.append(g);
  });
  return f.figure;
}

/** メーターのリスト：名前・バー・数値を行ごとに揃える（単一色、下地は同じ色の薄い段）。 */
export function meterList(rows: readonly RateRow[], emptyText = 'まだ記録がありません。'): HTMLElement {
  if (rows.length === 0) return h('p', { class: 'muted small' }, emptyText);
  return h('ul', { class: 'meters' },
    ...rows.map((r) => {
      const pct = Math.round(r.rate * 100);
      const n = r.correct + r.wrong;
      return h('li', { class: 'meter', tabindex: 0, title: `${r.label}：${r.correct} / ${n} 問正解（${pct}%）` },
        h('span', { class: 'meter-name' }, r.label),
        h('span', { class: 'meter-track', role: 'img', 'aria-label': `${r.label} 正答率 ${pct}%` },
          h('span', { class: 'meter-fill', style: `width:${Math.max(r.rate * 100, r.rate > 0 ? 2 : 0)}%` })),
        h('span', { class: 'meter-fig' }, h('b', null, `${pct}%`), ` （${n}問）`),
      );
    }),
  );
}
