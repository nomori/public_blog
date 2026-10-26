// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 環境変数で柔軟に切り替え可能（Cloudflare Pages では CF_PAGES が自動付与されるため base は '/' に）
const site = process.env.ASTRO_SITE || 'https://example.com';
const base = process.env.ASTRO_BASE ?? (process.env.CF_PAGES ? '/' : '/blog');

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [sitemap()],
});
