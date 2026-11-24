import { ZERO, div, floorLog10, pow10, q, rat, roundToSig, sub, toDecimalString, type Rational } from './rational';

export type Dim =
  | 'length'
  | 'mass'
  | 'volume'
  | 'time'
  | 'area'
  | 'speed'
  | 'temperature'
  | 'pressure'
  | 'energy'
  | 'power';

export const DIMS: readonly Dim[] = [
  'length',
  'mass',
  'volume',
  'time',
  'area',
  'speed',
  'temperature',
  'pressure',
  'energy',
  'power',
];

export const DIM_LABEL: Record<Dim, string> = {
  length: '長さ',
  mass: '質量',
  volume: '体積',
  time: '時間',
  area: '面積',
  speed: '速さ',
  temperature: '温度',
  pressure: '圧力',
  energy: 'エネルギー',
  power: '仕事率',
};

/** 各分野の基準単位の id */
export const BASE_UNIT: Record<Dim, string> = {
  length: 'm',
  mass: 'g',
  volume: 'L',
  time: 's',
  area: 'm2',
  speed: 'm/s',
  temperature: 'K',
  pressure: 'Pa',
  energy: 'J',
  power: 'W',
};

/**
 * 単位の系統。
 * - si：メートル法（SI と、それに準じて厳密に決まっている単位。時間・料理の計量など）
 * - yp：ヤード・ポンド法（米国式）
 * - jp：日本の伝統単位（尺貫法）
 * - sci：科学・工学で慣用される単位（cal・atm・mmHg・光年など）
 * 同じ系統どうしの換算は正確な比で、系統をまたぐ換算では si 以外の単位に「有効数字3桁の係数」を使う。
 */
export type System = 'si' | 'yp' | 'jp' | 'sci';

export const SYSTEM_LABEL: Record<System, string> = {
  si: 'メートル法・SI',
  yp: 'ヤード・ポンド法（米国式）',
  jp: '日本の伝統単位（尺貫法）',
  sci: '科学・工学の慣用単位',
};

/** definition＝定義による厳密な値／convention＝慣用として決まった値／caution＝地域・用途で異なるため前提を明示 */
export type UnitKind = 'definition' | 'convention' | 'caution';

export interface Unit {
  readonly id: string;
  /** 問題文に表示する記号・名称 */
  readonly symbol: string;
  /** 読み・英語名 */
  readonly name: string;
  readonly dim: Dim;
  /** 基準単位 = scale × (この単位の値) + offset（温度以外では offset は 0） */
  readonly toBase: Rational;
  /** 問題で使う係数（有効数字3桁）。si は toBase と同じ。 */
  readonly practical: Rational;
  readonly system: System;
  readonly offset: Rational;
  readonly kind: UnitKind;
  /** 出題が始まるレベル（1〜10） */
  readonly minLevel: number;
  readonly note?: string;
  /** 単位表に表示する「1単位 =」の定義（人が読む表記） */
  readonly definition: string;
}

function u(
  dim: Dim,
  id: string,
  symbol: string,
  name: string,
  scale: string,
  definition: string,
  kind: UnitKind,
  minLevel: number,
  note?: string,
): Unit {
  return {
    id,
    symbol,
    name,
    dim,
    toBase: q(scale),
    practical: q(scale),
    system: 'si',
    offset: ZERO,
    kind,
    minLevel,
    definition,
    ...(note === undefined ? {} : { note }),
  };
}

const D = 'definition' as const;
const C = 'convention' as const;
const A = 'caution' as const;

// ---------------------------------------------------------------------------
// 長さ（基準：m）
// ---------------------------------------------------------------------------
const length: Unit[] = [
  u('length', 'nm', 'nm', 'ナノメートル', '1e-9', '10⁻⁹ m', D, 3),
  u('length', 'um', 'μm', 'マイクロメートル', '1e-6', '10⁻⁶ m', D, 2),
  u('length', 'mm', 'mm', 'ミリメートル', '1e-3', '10⁻³ m', D, 1),
  u('length', 'cm', 'cm', 'センチメートル', '1e-2', '10⁻² m', D, 1),
  u('length', 'dm', 'dm', 'デシメートル', '1e-1', '10⁻¹ m', D, 2),
  u('length', 'm', 'm', 'メートル', '1', '1 m', D, 1, '基準単位'),
  u('length', 'km', 'km', 'キロメートル', '1e3', '10³ m', D, 1),
  u('length', 'angstrom', 'Å', 'オングストローム', '1e-10', '10⁻¹⁰ m', D, 8),
  u('length', 'in', 'inch', 'インチ', '0.0254', '0.0254 m', D, 7, '1 in = 2.54 cm'),
  u('length', 'ft', 'ft', 'フィート', '0.3048', '0.3048 m', D, 7, '1 ft = 12 in'),
  u('length', 'yd', 'yd', 'ヤード', '0.9144', '0.9144 m', D, 7, '1 yd = 3 ft'),
  u('length', 'mile', 'mile', 'マイル（国際マイル）', '1609.344', '1609.344 m', D, 7, '1 mile = 1760 yd'),
  u('length', 'nmi', '海里', 'かいり（nautical mile）', '1852', '1852 m', D, 8),
  u('length', 'au', 'au', '天文単位', '149597870700', '149 597 870 700 m', D, 10),
  u('length', 'ly', '光年', 'こうねん（light-year）', '9460730472580800', '9 460 730 472 580 800 m', D, 10),
  u('length', 'sun', '寸', 'すん', '1/33', '1/33 m', C, 9, '1 尺 = 10 寸'),
  u('length', 'shaku', '尺', 'しゃく', '10/33', '10/33 m（約 30.3 cm）', C, 9),
  u('length', 'jo', '丈', 'じょう', '100/33', '100/33 m', C, 9, '1 丈 = 10 尺'),
  u('length', 'ken', '間', 'けん', '20/11', '20/11 m', C, 9, '1 間 = 6 尺'),
  u('length', 'cho', '町', 'ちょう（長さ）', '1200/11', '1200/11 m', C, 9, '1 町 = 60 間'),
  u('length', 'ri', '里', 'り', '43200/11', '43200/11 m（約 3.927 km）', C, 10, '1 里 = 36 町'),
];

// ---------------------------------------------------------------------------
// 質量（基準：g）
// ---------------------------------------------------------------------------
const mass: Unit[] = [
  u('mass', 'ng', 'ng', 'ナノグラム', '1e-9', '10⁻⁹ g', D, 3),
  u('mass', 'ug', 'μg', 'マイクログラム', '1e-6', '10⁻⁶ g', D, 2),
  u('mass', 'mg', 'mg', 'ミリグラム', '1e-3', '10⁻³ g', D, 1),
  u('mass', 'g', 'g', 'グラム', '1', '1 g', D, 1, '基準単位（SI 基本単位は kg だが、接頭辞を揃えるため g を基準とする）'),
  u('mass', 'kg', 'kg', 'キログラム', '1e3', '10³ g', D, 1),
  u('mass', 't', 't', 'トン（メートルトン）', '1e6', '10⁶ g', D, 2, '1 t = 1000 kg'),
  u('mass', 'ct', 'ct', 'カラット', '0.2', '0.2 g', D, 8),
  u('mass', 'gr', 'grain', 'グレーン', '0.06479891', '0.06479891 g', D, 9),
  u('mass', 'oz', 'oz', 'オンス（常用）', '28.349523125', '28.349523125 g', D, 7, '1 lb = 16 oz'),
  u('mass', 'lb', 'lb', 'ポンド（常用）', '453.59237', '453.59237 g', D, 7),
  u('mass', 'shortton', 'short ton', '米トン（ショートトン）', '907184.74', '907 184.74 g', D, 8, '1 short ton = 2000 lb。英トン（long ton）は扱わない'),
  u('mass', 'monme', '匁', 'もんめ', '3.75', '3.75 g', C, 9),
  u('mass', 'kin', '斤', 'きん', '600', '600 g', C, 9, '1 斤 = 160 匁'),
  u('mass', 'kan', '貫', 'かん', '3750', '3750 g', C, 9, '1 貫 = 1000 匁'),
];

// ---------------------------------------------------------------------------
// 体積（基準：L）
// ---------------------------------------------------------------------------
const volume: Unit[] = [
  u('volume', 'uL', 'μL', 'マイクロリットル', '1e-6', '10⁻⁶ L', D, 3),
  u('volume', 'mL', 'mL', 'ミリリットル', '1e-3', '10⁻³ L', D, 1),
  u('volume', 'cL', 'cL', 'センチリットル', '1e-2', '10⁻² L', D, 2),
  u('volume', 'dL', 'dL', 'デシリットル', '1e-1', '10⁻¹ L', D, 2),
  u('volume', 'L', 'L', 'リットル', '1', '1 L', D, 1, '基準単位'),
  u('volume', 'kL', 'kL', 'キロリットル', '1e3', '10³ L', D, 2),
  u('volume', 'mm3', 'mm³', '立方ミリメートル', '1e-6', '10⁻⁶ L', D, 5, '= 1 μL'),
  u('volume', 'cm3', 'cm³', '立方センチメートル（cc）', '1e-3', '10⁻³ L', D, 5, '= 1 mL'),
  u('volume', 'm3', 'm³', '立方メートル', '1e3', '10³ L', D, 5, '= 1 kL'),
  u('volume', 'km3', 'km³', '立方キロメートル', '1e12', '10¹² L', D, 8),
  u('volume', 'in3', 'in³', '立方インチ', '0.016387064', '0.016387064 L', D, 8),
  u('volume', 'ft3', 'ft³', '立方フィート', '28.316846592', '28.316846592 L', D, 8),
  // 料理（日本）
  u('volume', 'koji', '小さじ', 'こさじ', '0.005', '5 mL', C, 5, '日本の計量スプーン'),
  u('volume', 'oji', '大さじ', 'おおさじ', '0.015', '15 mL', C, 5, '1 大さじ = 3 小さじ'),
  u('volume', 'cup_jp', 'カップ（日本）', '計量カップ（日本）', '0.2', '200 mL', C, 5, '米国のカップ（約 236.6 mL）とは異なる'),
  // 米国式
  u('volume', 'usfloz', 'US fl oz', '液量オンス（米）', '0.0295735295625', '0.0295735295625 L', A, 7, '米国式。英国式とは異なる'),
  u('volume', 'uscup', 'US cup', 'カップ（米国慣用）', '0.2365882365', '0.2365882365 L', A, 7, '= 8 US fl oz。日本のカップ（200 mL）とは異なる'),
  u('volume', 'uspint', 'US pint', 'パイント（米）', '0.473176473', '0.473176473 L', A, 7, '= 2 US cup'),
  u('volume', 'usquart', 'US quart', 'クォート（米）', '0.946352946', '0.946352946 L', A, 7, '= 2 US pint'),
  u('volume', 'usgal', 'US gallon', 'ガロン（米）', '3.785411784', '3.785411784 L', A, 7, '= 4 US quart = 231 in³。英国式ガロンとは異なる'),
  // 尺貫法（容積）
  u('volume', 'shaku_v', '勺', 'しゃく（容積）', '2401/133100', '2401/133100 L（約 18.04 mL）', C, 9, '1 合 = 10 勺'),
  u('volume', 'go', '合', 'ごう', '2401/13310', '2401/13310 L（約 180.39 mL）', C, 9, '計量法の換算値。炊飯の「1合 = 180 mL」とは別'),
  u('volume', 'sho', '升', 'しょう', '2401/1331', '2401/1331 L（約 1.8039 L）', C, 9, '1 升 = 10 合'),
  u('volume', 'to', '斗', 'と', '24010/1331', '24010/1331 L', C, 10, '1 斗 = 10 升'),
  u('volume', 'koku', '石', 'こく', '240100/1331', '240100/1331 L（約 180.39 L）', C, 10, '1 石 = 10 斗'),
];

// ---------------------------------------------------------------------------
// 時間（基準：s）
// ---------------------------------------------------------------------------
const time: Unit[] = [
  u('time', 'ns', 'ns', 'ナノ秒', '1e-9', '10⁻⁹ s', D, 3),
  u('time', 'us', 'μs', 'マイクロ秒', '1e-6', '10⁻⁶ s', D, 3),
  u('time', 'ms', 'ms', 'ミリ秒', '1e-3', '10⁻³ s', D, 2),
  u('time', 's', '秒', 'びょう（s）', '1', '1 s', D, 1, '基準単位'),
  u('time', 'min', '分', 'ふん（min）', '60', '60 s', D, 1),
  u('time', 'h', '時間', 'じかん（h）', '3600', '3600 s', D, 1),
  u('time', 'd', '日', 'にち（d）', '86400', '86 400 s', D, 2),
  u('time', 'week', '週', 'しゅう', '604800', '604 800 s', D, 3, '= 7 日'),
  u('time', 'year365', '年（365日）', 'ねん', '31536000', '31 536 000 s', C, 4, '平年（365日）として扱う。うるう年・恒星年は扱わない'),
];

// ---------------------------------------------------------------------------
// 面積（基準：m²）
// ---------------------------------------------------------------------------
const area: Unit[] = [
  u('area', 'mm2', 'mm²', '平方ミリメートル', '1e-6', '10⁻⁶ m²', D, 4, '1 m² = 10⁶ mm²（長さの比の2乗）'),
  u('area', 'cm2', 'cm²', '平方センチメートル', '1e-4', '10⁻⁴ m²', D, 4),
  u('area', 'm2', 'm²', '平方メートル', '1', '1 m²', D, 4, '基準単位'),
  u('area', 'km2', 'km²', '平方キロメートル', '1e6', '10⁶ m²', D, 4),
  u('area', 'a', 'a', 'アール', '100', '100 m²', D, 5),
  u('area', 'ha', 'ha', 'ヘクタール', '1e4', '10⁴ m²', D, 5, '= 100 a'),
  u('area', 'in2', 'in²', '平方インチ', '0.00064516', '0.00064516 m²', D, 8),
  u('area', 'ft2', 'ft²', '平方フィート', '0.09290304', '0.09290304 m²', D, 8),
  u('area', 'yd2', 'yd²', '平方ヤード', '0.83612736', '0.83612736 m²', D, 8),
  u('area', 'acre', 'acre', 'エーカー', '4046.8564224', '4046.8564224 m²', D, 8, '= 4840 yd²'),
  u('area', 'mi2', 'mi²', '平方マイル', '2589988.110336', '2 589 988.110336 m²', D, 8, '= 640 acre'),
  u('area', 'tsubo', '坪', 'つぼ', '400/121', '400/121 m²（約 3.3058 m²）', C, 9, '1 間 × 1 間'),
  u('area', 'se', '畝', 'せ', '12000/121', '12000/121 m²', C, 9, '1 畝 = 30 坪'),
  u('area', 'tan', '反', 'たん', '120000/121', '120000/121 m²', C, 9, '1 反 = 10 畝 = 300 坪'),
  u('area', 'chobu', '町歩', 'ちょうぶ', '1200000/121', '1 200 000/121 m²（約 1 ha）', C, 10, '1 町歩 = 10 反 = 3000 坪'),
];

// ---------------------------------------------------------------------------
// 速さ（基準：m/s）
// ---------------------------------------------------------------------------
const speed: Unit[] = [
  u('speed', 'mm/s', 'mm/s', 'ミリメートル毎秒', '1e-3', '10⁻³ m/s', D, 6),
  u('speed', 'cm/s', 'cm/s', 'センチメートル毎秒', '1e-2', '10⁻² m/s', D, 6),
  u('speed', 'm/s', 'm/s', 'メートル毎秒', '1', '1 m/s', D, 6, '基準単位'),
  u('speed', 'km/s', 'km/s', 'キロメートル毎秒', '1e3', '10³ m/s', D, 7),
  u('speed', 'm/min', 'm/min', '分速', '1/60', '1/60 m/s', D, 6, '日本の徒歩速度などで使う'),
  u('speed', 'km/h', 'km/h', '時速', '5/18', '5/18 m/s（= 1/3.6）', D, 6),
  u('speed', 'mph', 'mph', 'マイル毎時', '0.44704', '0.44704 m/s', D, 7),
  u('speed', 'ft/s', 'ft/s', 'フィート毎秒', '0.3048', '0.3048 m/s', D, 7),
  u('speed', 'kn', 'knot', 'ノット', '463/900', '463/900 m/s（= 1 海里/h）', D, 8),
  u('speed', 'c', 'c（光速）', 'こうそく', '299792458', '299 792 458 m/s', D, 10),
];

// ---------------------------------------------------------------------------
// 温度（基準：K）。基準 = scale × 値 + offset
// ---------------------------------------------------------------------------
const temperature: Unit[] = [
  {
    ...u('temperature', 'degC', '℃', '摂氏（セルシウス度）', '1', 'K = ℃ + 273.15', D, 6),
    offset: q('273.15'),
  },
  u('temperature', 'K', 'K', 'ケルビン', '1', '1 K', D, 6, '基準単位'),
  {
    ...u('temperature', 'degF', '℉', '華氏（ファーレンハイト度）', '5/9', 'K = (℉ − 32) × 5/9 + 273.15', D, 8),
    // K = (℉ − 32) × 5/9 + 273.15 = (5/9)℉ + (273.15 − 160/9)
    offset: sub(q('273.15'), q('160/9')),
  },
];

// ---------------------------------------------------------------------------
// 圧力（基準：Pa）
// ---------------------------------------------------------------------------
const pressure: Unit[] = [
  u('pressure', 'Pa', 'Pa', 'パスカル', '1', '1 Pa', D, 6, '基準単位'),
  u('pressure', 'hPa', 'hPa', 'ヘクトパスカル', '100', '100 Pa', D, 6, '気象で使う。1 hPa = 1 mbar'),
  u('pressure', 'kPa', 'kPa', 'キロパスカル', '1e3', '10³ Pa', D, 6),
  u('pressure', 'MPa', 'MPa', 'メガパスカル', '1e6', '10⁶ Pa', D, 7),
  u('pressure', 'bar', 'bar', 'バール', '1e5', '10⁵ Pa', D, 7),
  u('pressure', 'mbar', 'mbar', 'ミリバール', '100', '100 Pa', D, 7),
  u('pressure', 'atm', 'atm', '標準大気圧', '101325', '101 325 Pa', D, 8),
  u('pressure', 'mmHg', 'mmHg', '水銀柱ミリメートル', '133.322387415', '133.322387415 Pa', D, 8, '慣用定義値'),
  u('pressure', 'Torr', 'Torr', 'トル', '101325/760', '101325/760 Pa（≈ 133.3224 Pa）', D, 9, '割り切れないため、有効数字を指定して出題する'),
  u('pressure', 'psi', 'psi', 'ポンド毎平方インチ', '4.4482216152605/0.00064516', '1 lbf ÷ 1 in²（≈ 6894.757 Pa）', D, 9, '割り切れないため、有効数字を指定して出題する'),
  u('pressure', 'kgf/cm2', 'kgf/cm²', '重量キログラム毎平方センチメートル', '98066.5', '98 066.5 Pa', D, 9, '1 kgf = 9.80665 N'),
];

// ---------------------------------------------------------------------------
// エネルギー（基準：J）
// ---------------------------------------------------------------------------
const energy: Unit[] = [
  u('energy', 'J', 'J', 'ジュール', '1', '1 J', D, 8, '基準単位'),
  u('energy', 'kJ', 'kJ', 'キロジュール', '1e3', '10³ J', D, 8),
  u('energy', 'MJ', 'MJ', 'メガジュール', '1e6', '10⁶ J', D, 8),
  u('energy', 'erg', 'erg', 'エルグ', '1e-7', '10⁻⁷ J', D, 10),
  u('energy', 'cal', 'cal', 'カロリー（熱化学）', '4.184', '4.184 J', D, 8, '栄養表示の kcal は 1000 cal'),
  u('energy', 'kcal', 'kcal', 'キロカロリー', '4184', '4184 J', D, 8),
  u('energy', 'Wh', 'Wh', 'ワット時', '3600', '3600 J', D, 8),
  u('energy', 'kWh', 'kWh', 'キロワット時', '3.6e6', '3.6 × 10⁶ J', D, 8, '= 3.6 MJ'),
  u('energy', 'kgfm', 'kgf·m', '重量キログラムメートル', '9.80665', '9.80665 J', D, 10),
  u('energy', 'BTU', 'BTU', '英熱量（国際蒸気表）', '1055.05585262', '1055.05585262 J', D, 10),
  u('energy', 'eV', 'eV', '電子ボルト', '1.602176634e-19', '1.602176634 × 10⁻¹⁹ J', D, 10),
];

// ---------------------------------------------------------------------------
// 仕事率（基準：W）
// ---------------------------------------------------------------------------
const power: Unit[] = [
  u('power', 'mW', 'mW', 'ミリワット', '1e-3', '10⁻³ W', D, 8),
  u('power', 'W', 'W', 'ワット', '1', '1 W', D, 8, '基準単位'),
  u('power', 'kW', 'kW', 'キロワット', '1e3', '10³ W', D, 8),
  u('power', 'MW', 'MW', 'メガワット', '1e6', '10⁶ W', D, 8),
  u('power', 'GW', 'GW', 'ギガワット', '1e9', '10⁹ W', D, 9),
  u('power', 'PS', 'PS（馬力）', 'ぱーえす（仏馬力）', '735.49875', '735.49875 W', D, 9, '日本の法定馬力。= 75 kgf·m/s'),
  u('power', 'hp', 'hp（英馬力）', 'えいばりき（機械馬力）', '745.69987158227022', '745.69987158227022 W', D, 9, '= 550 ft·lbf/s'),
];

const SYSTEM_BY_ID: Readonly<Record<string, System>> = Object.fromEntries([
  ...[
    'in', 'ft', 'yd', 'mile', 'nmi', 'gr', 'oz', 'lb', 'shortton', 'in3', 'ft3', 'usfloz', 'uscup', 'uspint',
    'usquart', 'usgal', 'in2', 'ft2', 'yd2', 'acre', 'mi2', 'mph', 'ft/s', 'kn', 'psi', 'hp',
  ].map((id) => [id, 'yp'] as const),
  ...[
    'sun', 'shaku', 'jo', 'ken', 'cho', 'ri', 'monme', 'kin', 'kan', 'shaku_v', 'go', 'sho', 'to', 'koku',
    'tsubo', 'se', 'tan', 'chobu',
  ].map((id) => [id, 'jp'] as const),
  ...[
    'au', 'ly', 'c', 'atm', 'mmHg', 'Torr', 'kgf/cm2', 'cal', 'kcal', 'kgfm', 'BTU', 'eV', 'PS',
  ].map((id) => [id, 'sci'] as const),
]);

/** si 以外の単位は、基準単位に対する係数を有効数字3桁に丸めた値を「問題用の係数」とする。 */
const withSystem = (x: Unit): Unit => {
  const system = SYSTEM_BY_ID[x.id] ?? 'si';
  return { ...x, system, practical: system === 'si' ? x.toBase : roundToSig(x.toBase, 3) };
};

export const UNITS: readonly Unit[] = [
  ...length,
  ...mass,
  ...volume,
  ...time,
  ...area,
  ...speed,
  ...temperature,
  ...pressure,
  ...energy,
  ...power,
].map(withSystem);

const BY_ID = new Map<string, Unit>(UNITS.map((x) => [x.id, x]));

export function getUnit(id: string): Unit {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`unknown unit: ${id}`);
  return found;
}

export const unitsOf = (dim: Dim): Unit[] => UNITS.filter((x) => x.dim === dim);

/** レベル level で出題対象になる単位 */
export const eligibleUnits = (dim: Dim, level: number): Unit[] =>
  UNITS.filter((x) => x.dim === dim && x.minLevel <= level);

export const MAX_LEVEL = 10;

/** 問題用の係数が、正確な値と異なる（丸めている）単位か */
export const isApproximate = (u: Unit): boolean => u.practical.n !== u.toBase.n || u.practical.d !== u.toBase.d;


/** 係数を読みやすく表す（大きすぎる・小さすぎる値は 仮数 × 10^n）。 */
export function formatCoefficient(r: Rational): string {
  const e = floorLog10(r);
  if (e >= -4 && e <= 9) return toDecimalString(r);
  const scale = e >= 0 ? rat(pow10(e)) : rat(1n, pow10(-e));
  return `${toDecimalString(div(r, scale))} × 10^${e}`;
}

/** 問題で使う係数を「1単位 = ○○ 基準単位」の形で表す（温度は定義の式）。 */
export function practicalText(u: Unit): string {
  if (u.dim === 'temperature') return u.definition;
  return `${formatCoefficient(u.practical)} ${getUnit(BASE_UNIT[u.dim]).symbol}`;
}
