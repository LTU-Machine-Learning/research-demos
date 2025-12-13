import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  server: { port: 4321, host: true },
  output: 'static',
  integrations: [
    starlight({
      title: 'Vision Hub Docs',
      sidebar: [
        {
          label: 'Getting Started',
          items: ['docs/introduction'],
        },
      ],
    }),
  ],
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
