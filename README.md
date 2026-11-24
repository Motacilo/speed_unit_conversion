# スピード単位換算

単位換算を速く正確に解くシンプルな計算ゲーム（Web / TypeScript）。企画は `docs/企画設計書_v0.2.md`。

## 使い方

```bash
npm install
npm run dev        # 開発サーバー
npm test           # テスト（有理数・単位データ・問題生成・判定）
npm run build      # 型チェック + 本番ビルド（dist/）
```

## 構成

- `src/core/` … ゲームの中核（DOM 非依存）
  - `rational.ts` BigInt の有理数、小数第2位への四捨五入（問題用の係数で計算し、最後に1回だけ丸める）
  - `units.ts` 単位表（企画書 §4）。問題生成と単位表画面が同じデータを使う
  - `convert.ts` 換算（温度は offset つきで同じ式）
  - `generator.ts` シード付きの問題生成（`GENERATOR_VERSION`）
  - `judge.ts` 判定（競うモードは厳密一致、練習は「小数第2位まで」の問題で最後の桁 ±1 を許容し「ずれあり」を明示）
  - `rng.ts` mulberry32 とシード生成
- `src/ui/` … 画面（ホーム・プレイ・結果・単位表）と `localStorage` 保存（キー `speed-unit-conversion-v1`）
- `tests/` … Vitest

## 現在の状態

M0（コア＋テスト）、M1（一人用の画面）、M2 のうち統計グラフまで。ゴースト・PWA・レベル自動進行は未着手。

統計画面：日ごとの正答率・平均解答時間（折れ線）、解いた問題数（棒）、分野別の正答率、苦手な単位。期間は直近 7／30／90 日。グラフは依存ライブラリなしの SVG（`src/ui/charts.ts`）、集計は `src/ui/stats.ts`。
