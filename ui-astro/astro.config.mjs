import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';
import astroExpressiveCode from 'astro-expressive-code';

export default defineConfig({
  server: { port: 4321, host: true },
  output: 'static',
  vite: { build: { assetsInlineLimit: 0 } },

  integrations: [
    astroExpressiveCode(), // must be before mdx()
    mdx(),
    starlight({
      title: 'Vision Hub Documentation',
      sidebar: [
        {
          label: 'Overview',
          items: [{ label: 'Introduction', link: '/docs/introduction/' }],
        },
      ],
    }),
  ],
});
