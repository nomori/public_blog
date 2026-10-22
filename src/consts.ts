export const SITE_TITLE = 'Trail & Chalk';
export const SITE_TAGLINE = '山道とチョークの記録';
export const SITE_DESCRIPTION =
  '登山・ランニング・トレイルランニング・ボルダリング、そして日々の雑記。';
export const AUTHOR = 'Your Name';

export const CATEGORIES = {
  hike: { label: '登山', en: 'Hike' },
  run: { label: 'ランニング', en: 'Run' },
  trail: { label: 'トレラン', en: 'Trail' },
  boulder: { label: 'ボルダリング', en: 'Boulder' },
  misc: { label: '雑記', en: 'Misc' },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as [CategoryKey, ...CategoryKey[]];
