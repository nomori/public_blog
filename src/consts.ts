export const SITE_TITLE = 'Trail & Chalk';
export const SITE_TAGLINE = '山道とチョークの記録';
export const SITE_DESCRIPTION =
  '登山・ランニング・トレイルランニング・ボルダリング、そして日々の雑記。';
export const AUTHOR = 'Your Name';

/**
 * カラーテーマ設定
 * 'forest' (山道・深緑) | 'ocean' (空・海・青) | 'sunset' (夕暮・テラコッタ) | 'granite' (花崗岩・モノトーン) | 'plum' (山桜・ワイン)
 */
export const SITE_THEME: ThemeKey = 'forest';

export const THEMES = {
  forest: { name: 'Forest', label: '深緑・フォレスト', desc: '山道と深い森の落ち着いたモスグリーン' },
  ocean: { name: 'Ocean', label: '青空・オーシャン', desc: '稜線の空と海を思わせるディープブルー' },
  sunset: { name: 'Sunset', label: '夕焼け・サンセット', desc: '夕暮れの山肌と岩場を彩るテラコッタ' },
  granite: { name: 'Granite', label: '花崗岩・グラニット', desc: '無機質で洗練されたミニマルモノクローム' },
  plum: { name: 'Plum', label: '山桜・プラム', desc: '春の山桜やワインを思わせるダスティプラム' },
} as const;
export type ThemeKey = keyof typeof THEMES;

export const CATEGORIES = {
  hike: { label: '登山', en: 'Hike' },
  run: { label: 'ランニング', en: 'Run' },
  trail: { label: 'トレラン', en: 'Trail' },
  boulder: { label: 'ボルダリング', en: 'Boulder' },
  misc: { label: '雑記', en: 'Misc' },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as [CategoryKey, ...CategoryKey[]];

/** 投稿の種別（カテゴリとは別軸）: 記録 = 数値主体のログ / 記事 = 読み物 */
export const KINDS = {
  log: { label: '記録', en: 'Logs' },
  article: { label: '記事', en: 'Articles' },
} as const;
export type KindKey = keyof typeof KINDS;

export const BOOK_STATUS = {
  reading: { label: '読書中', en: 'Reading' },
  read: { label: '読了', en: 'Finished' },
  want: { label: '積読・読みたい', en: 'Want to read' },
} as const;
export type BookStatus = keyof typeof BOOK_STATUS;

/**
 * 年間目標（トップ・統計ページに進捗バー表示）
 * metric: km | up(獲得標高m) | count(回数) | books(読了冊数)
 * category を付けるとそのカテゴリだけ集計
 */
export const GOALS: Record<number, { label: string; metric: 'km' | 'up' | 'count' | 'books'; target: number; category?: CategoryKey }[]> = {
  2026: [
    { label: '年間距離', metric: 'km', target: 600 },
    { label: '獲得標高', metric: 'up', target: 20000 },
    { label: '山行', metric: 'count', category: 'hike', target: 20 },
    { label: '読了', metric: 'books', target: 24 },
  ],
};
